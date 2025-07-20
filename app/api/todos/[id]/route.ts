import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasCircularDependency } from '@/lib/dependencyUtils';

interface Params {
  params: {
    id: string;
  };
}

// Add PATCH endpoint for updating dependencies
export async function PATCH(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    const { dependencyIds } = await request.json();
    
    // Validate dependencies exist and check for circular dependencies
    if (dependencyIds && dependencyIds.length > 0) {
      // Check if todo exists
      const existingTodo = await prisma.todo.findUnique({ where: { id } });
      if (!existingTodo) {
        return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
      }

      // Check for circular dependencies
      const hasCircular = await hasCircularDependency(id, dependencyIds);
      if (hasCircular) {
        return NextResponse.json(
          { error: 'Cannot add dependencies: would create circular dependency' }, 
          { status: 400 }
        );
      }
      
      // Validate dependency due dates
      if (existingTodo.dueDate) {
        const dependencies = await prisma.todo.findMany({
          where: { id: { in: dependencyIds } },
        });

        for (const dep of dependencies) {
          if (dep.dueDate && dep.dueDate > existingTodo.dueDate) {
            return NextResponse.json(
              { error: `Dependency "${dep.title}" has a due date after the current todo.` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Update dependencies
    const updatedTodo = await prisma.todo.update({
      where: { id },
      data: {
        dependencies: {
          set: [], // Clear existing dependencies
          connect: dependencyIds ? dependencyIds.map((depId: number) => ({ id: depId })) : []
        }
      },
      include: {
        dependencies: true
      }
    });

    return NextResponse.json(updatedTodo);
  } catch (error) {
    return NextResponse.json({ error: 'Error updating dependencies' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    await prisma.todo.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Todo deleted' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting todo' }, { status: 500 });
  }
}
