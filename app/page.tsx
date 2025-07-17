"use client"
import { Todo } from '@prisma/client';
import { useState, useEffect } from 'react';

// Extend Todo type to include dependencies
type TodoWithDependencies = Todo & {
  dependencies: Todo[];
};

interface CriticalPathResult {
  criticalPath: number[];
  pathLength: number;
  nodeLevels: Record<number, number>;
}

function calculateCriticalPath(todos: TodoWithDependencies[]): CriticalPathResult {
  if (todos.length === 0) {
    return { criticalPath: [], pathLength: 0, nodeLevels: {} };
  }

  // Build adjacency lists
  const dependents = new Map<number, number[]>();
  const inDegree = new Map<number, number>();
  
  // Initialize
  todos.forEach(todo => {
    dependents.set(todo.id, []);
    inDegree.set(todo.id, 0);
  });
  
  // Build dependency graph
  todos.forEach(todo => {
    todo.dependencies.forEach(dep => {
      if (dependents.has(dep.id)) {
        dependents.get(dep.id)!.push(todo.id);
        inDegree.set(todo.id, (inDegree.get(todo.id) || 0) + 1);
      }
    });
  });
  
  // Topological sort with level calculation
  const queue: number[] = [];
  const levels = new Map<number, number>();
  const parent = new Map<number, number | null>();
  
  // Start with tasks that have no dependencies
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) {
      queue.push(taskId);
      levels.set(taskId, 0);
      parent.set(taskId, null);
    }
  });
  
  // Process each task
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) || 0;
    
    (dependents.get(current) || []).forEach(dependent => {
      const newLevel = currentLevel + 1;
      const existingLevel = levels.get(dependent) || -1;
      
      if (newLevel > existingLevel) {
        levels.set(dependent, newLevel);
        parent.set(dependent, current);
      }
      
      inDegree.set(dependent, inDegree.get(dependent)! - 1);
      if (inDegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    });
  }
  
  // Find longest path
  let maxLevel = 0;
  let endTask: number | null = null;
  
  levels.forEach((level, taskId) => {
    if (level > maxLevel) {
      maxLevel = level;
      endTask = taskId;
    }
  });
  
  // Reconstruct critical path
  const criticalPath: number[] = [];
  let current = endTask;
  while (current !== null) {
    criticalPath.unshift(current);
    current = parent.get(current) || null;
  }
  
  return {
    criticalPath,
    pathLength: maxLevel + 1,
    nodeLevels: Object.fromEntries(levels)
  };
}

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [selectedDependencies, setSelectedDependencies] = useState<number[]>([]);
  const [todos, setTodos] = useState<TodoWithDependencies[]>([]);
  const [imageLoadingStates, setImageLoadingStates] = useState<{[key: number]: boolean}>({});
  const [editingDependencies, setEditingDependencies] = useState<number | null>(null);
  const [editDependencies, setEditDependencies] = useState<number[]>([]);
  const [error, setError] = useState('');

  // Calculate critical path whenever todos change
  const criticalPath = calculateCriticalPath(todos);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/todos');
      const data = await res.json();
      setTodos(data); // Keep existing API format
      
      const newLoadingStates = data.reduce((acc: {[key: number]: boolean}, todo: Todo) => {
        if (!(todo.id in imageLoadingStates)) {
          acc[todo.id] = true;
        }
        return acc;
      }, {});
      setImageLoadingStates(prev => ({...prev, ...newLoadingStates}));
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    
    setError(''); // Clear previous errors
    
    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: newTodo,
          dueDate: newDueDate || null,
          dependencyIds: selectedDependencies
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to add todo');
        return;
      }

      setNewTodo('');
      setNewDueDate('');
      setSelectedDependencies([]);
      fetchTodos();
    } catch (error) {
      setError('Failed to add todo');
      console.error('Failed to add todo:', error);
    }
  };

  const handleDeleteTodo = async (id: any) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      });
      fetchTodos();
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const handleDependencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions, option => parseInt(option.value));
    setSelectedDependencies(values);
  };

  const handleEditDependencies = (todoId: number, currentDependencies: Todo[]) => {
    setEditingDependencies(todoId);
    setEditDependencies(currentDependencies.map(dep => dep.id));
    setError(''); // Clear errors when starting edit
  };

  const handleSaveDependencies = async (todoId: number) => {
    try {
      const response = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencyIds: editDependencies }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update dependencies');
        return;
      }

      setEditingDependencies(null);
      setEditDependencies([]);
      setError('');
      fetchTodos();
    } catch (error) {
      setError('Failed to update dependencies');
    }
  };

  const handleCancelEdit = () => {
    setEditingDependencies(null);
    setEditDependencies([]);
    setError(''); // Clear errors when canceling
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500">
      <div className="container mx-auto p-4">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>
        
        {/* Critical Path Info - Updates instantly! */}
        {criticalPath.criticalPath.length > 0 && (
          <div className="mb-6 bg-red-100 border-l-4 border-red-500 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              🔥 Critical Path (Length: {criticalPath.pathLength} tasks)
            </h3>
            <p className="text-red-700 text-sm mb-2">
              Longest dependency chain - delays here affect the entire project:
            </p>
            <div className="flex flex-wrap gap-2">
              {criticalPath.criticalPath.map((taskId, index) => {
                const task = todos.find(t => t.id === taskId);
                return task ? (
                  <div key={taskId} className="flex items-center">
                    <span className="px-3 py-1 bg-red-200 text-red-800 rounded-full text-sm font-medium">
                      {task.title}
                    </span>
                    {index < criticalPath.criticalPath.length - 1 && (
                      <span className="mx-2 text-red-600 font-bold">→</span>
                    )}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Add New Todo & Dependencies */}
          <div className="space-y-6">
            <div className="bg-white bg-opacity-90 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Add New Todo</h2>
              
              {/* Remove error message from here */}
              <div className="space-y-4">
                <input
                  type="text"
                  className="w-full p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
                  placeholder="What needs to be done?"
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                />
                
                <input 
                  type="date" 
                  className="w-full p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  title="Due date (optional)"
                />
                
                <button
                  onClick={handleAddTodo}
                  className="w-full bg-orange-500 text-white p-3 rounded hover:bg-orange-600 transition duration-300 font-semibold"
                >
                  Add Todo
                </button>
              </div>
            </div>

            {/* Dependencies Selection */}
            {todos.length > 0 && (
              <div className="bg-white bg-opacity-90 p-6 rounded-lg shadow-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Dependencies</h3>
                <p className="text-sm text-gray-600 mb-3">Select tasks that must be completed first:</p>
                
                <select 
                  multiple
                  className="w-full p-3 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 h-40 border"
                  value={selectedDependencies.map(String)}
                  onChange={handleDependencyChange}
                  title="Hold Ctrl/Cmd to select multiple dependencies"
                >
                  {todos.map(todo => (
                    <option 
                      key={todo.id} 
                      value={todo.id}
                      className="p-2 hover:bg-orange-100"
                    >
                      {todo.title}
                    </option>
                  ))}
                </select>
                
                {selectedDependencies.length > 0 && (
                  <div className="mt-3 p-3 bg-orange-50 rounded">
                    <p className="text-sm font-medium text-orange-800">Selected dependencies:</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedDependencies.map(depId => {
                        const dep = todos.find(t => t.id === depId);
                        return dep ? (
                          <span 
                            key={depId}
                            className="px-2 py-1 bg-orange-200 text-orange-800 rounded-full text-xs"
                          >
                            {dep.title}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Todo List with Critical Path Highlighting */}
          <div>
            <div className="bg-white bg-opacity-90 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Todo List ({todos.length} tasks)
              </h2>
              
              {todos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No todos yet. Add one to get started!</p>
              ) : (
                <ul className="space-y-4">
                  {todos.map((todo: TodoWithDependencies) => {
                    const isOnCriticalPath = criticalPath.criticalPath.includes(todo.id);
                    const pathLevel = criticalPath.nodeLevels[todo.id] || 0;
                    
                    return (
                      <li
                        key={todo.id}
                        className={`flex items-start p-4 rounded-lg border transition-all duration-200 ${
                          isOnCriticalPath 
                            ? 'bg-red-50 border-red-300 shadow-lg transform scale-[1.02]' 
                            : 'bg-gray-50 border-gray-200 hover:shadow-md'
                        }`}
                      >
                        {/* Image */}
                        <div className="w-12 h-12 mr-4 flex-shrink-0">
                          <img
                            src={`/images/${todo.id}.jpg`}
                            alt={todo.title}
                            className="w-full h-full object-cover rounded-lg"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-200 rounded-lg"><div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div></div>';
                              }
                            }}
                          />
                        </div>
                        
                        {/* Todo content */}
                        <div className="flex-grow">
                          <div className="flex items-center gap-2">
                            <div className={`font-semibold ${isOnCriticalPath ? 'text-red-800' : 'text-gray-800'}`}>
                              {todo.title}
                            </div>
                            {isOnCriticalPath && (
                              <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full font-bold animate-pulse">
                                CRITICAL
                              </span>
                            )}
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Level {pathLevel}
                            </span>
                          </div>
                          
                          {/* Due date */}
                          {todo.dueDate && (
                            <div className={`text-sm mt-1 ${
                              new Date(todo.dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
                                ? 'text-red-600 font-semibold' 
                                : 'text-gray-600'
                            }`}>
                              Due: {new Date(todo.dueDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                            </div>
                          )}
                          
                          {/* Dependencies with edit functionality */}
                          <div className="mt-2">
                            {editingDependencies === todo.id ? (
                              // Edit mode
                              <div className="space-y-2">
                                <div className="text-sm font-medium text-gray-700">Edit Dependencies:</div>
                                <select 
                                  multiple
                                  className="w-full p-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-orange-400"
                                  value={editDependencies.map(String)}
                                  onChange={(e) => {
                                    const values = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                                    setEditDependencies(values);
                                  }}
                                >
                                  {todos
                                    .filter(t => t.id !== todo.id) // Can't depend on itself
                                    .map(t => (
                                      <option key={t.id} value={t.id}>
                                        {t.title}
                                      </option>
                                    ))}
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveDependencies(todo.id)}
                                    className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // View mode
                              <div className="flex items-center gap-2">
                                <div className="text-sm">
                                  {todo.dependencies && todo.dependencies.length > 0 ? (
                                    <div className="text-blue-600">
                                      <span className="font-medium">🔗 Depends on:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {todo.dependencies.map(dep => (
                                          <span 
                                            key={dep.id}
                                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                          >
                                            {dep.title}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">No dependencies</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleEditDependencies(todo.id, todo.dependencies)}
                                  className="text-blue-500 hover:text-blue-700 text-sm underline"
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteTodo(todo.id)}
                          className="text-red-500 hover:text-red-700 transition duration-300 ml-4 p-1"
                          title="Delete todo"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
