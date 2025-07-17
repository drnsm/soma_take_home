import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(todos);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, dueDate } = await request.json(); // Extract dueDate
    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Create todo with due date
    const todo = await prisma.todo.create({
      data: {
        title,
        dueDate: dueDate ? new Date(dueDate + 'T12:00:00.000Z') : null, // Convert string to Date at noon UTC to avoid timezone issues
      },
    });

    // Fetch and save image from Pexels
    try {
      await fetchAndSaveImage(title, todo.id);
    } catch (imageError) {
      console.error('Failed to fetch/save image:', imageError);
      // Continue without failing the todo creation
    }

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}

async function fetchAndSaveImage(query: string, todoId: number) {
  const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
  
  if (!PEXELS_API_KEY) {
    throw new Error('PEXELS_API_KEY not found in environment variables');
  }

  // Search Pexels API
  const searchResponse = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
    {
      headers: {
        'Authorization': PEXELS_API_KEY,
      },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`Pexels API error: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  
  if (!searchData.photos || searchData.photos.length === 0) {
    throw new Error('No images found for query');
  }

  // Get the first image's medium size URL
  const imageUrl = searchData.photos[0].src.medium;
  
  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }

  // Convert to buffer
  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to public/images/{todoId}.jpg
  const imagePath = join(process.cwd(), 'public', 'images', `${todoId}.jpg`);
  await writeFile(imagePath, buffer);
  
  console.log(`Image saved for todo ${todoId}: ${imagePath}`);
}