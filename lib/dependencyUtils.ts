import { prisma } from '@/lib/prisma';

async function hasPath(fromId: number, toId: number, visited = new Set<number>()): Promise<boolean> {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  
  visited.add(fromId);
  
  const todo = await prisma.todo.findUnique({
    where: { id: fromId },
    include: { dependencies: true }
  });
  
  if (!todo) return false;
  
  for (const dep of todo.dependencies) {
    if (await hasPath(dep.id, toId, visited)) {
      return true;
    }
  }
  
  return false;
}

export async function hasCircularDependency(todoId: number, dependencyIds: number[]): Promise<boolean> {
  for (const depId of dependencyIds) {
    if (await hasPath(depId, todoId)) {
      return true;
    }
  }
  return false;
} 