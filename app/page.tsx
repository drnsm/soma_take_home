"use client"
import { Todo } from '@prisma/client';
import { useState, useEffect, useMemo } from 'react';
import { DependencyGraph } from './components/DependencyGraph';
import { DependencySelector } from './components/DependencySelector';

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
  for (let current = endTask; current !== null; current = parent.get(current) as any) {
    criticalPath.unshift(current);
  }
  
  return {
    criticalPath,
    pathLength: maxLevel + 1,
    nodeLevels: Object.fromEntries(levels)
  };
}

interface EarliestStartDates {
  [key: number]: Date | null;
}

function calculateEarliestStartDates(todos: TodoWithDependencies[]): EarliestStartDates {
  const startDates: EarliestStartDates = {};

  todos.forEach(todo => {
    // Find the due dates of all dependencies that have one.
    const dependencyDueDates = todo.dependencies
      .map(dep => dep.dueDate ? new Date(dep.dueDate) : null)
      .filter((date): date is Date => date !== null);

    if (dependencyDueDates.length === 0) {
      // No dependencies with due dates, so it can start anytime.
      startDates[todo.id] = null;
    } else {
      // Find the latest due date among all dependencies.
      const latestDependencyDueDate = new Date(Math.max(...dependencyDueDates.map(date => date.getTime())));
      
      // The earliest start date is the day after the latest dependency is due.
      const earliestStartDate = new Date(latestDependencyDueDate);
      earliestStartDate.setDate(earliestStartDate.getDate() + 1);
      
      startDates[todo.id] = earliestStartDate;
    }
  });

  return startDates;
}


export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [selectedDependencies, setSelectedDependencies] = useState<number[]>([]);
  const [todos, setTodos] = useState<TodoWithDependencies[]>([]);
  const [imageLoadingStates, setImageLoadingStates] = useState<{[key: number]: boolean}>({});
  const [editingTodo, setEditingTodo] = useState<TodoWithDependencies | null>(null);
  const [editDependencies, setEditDependencies] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const [focusedTask, setFocusedTask] = useState<number | undefined>(undefined);

  // Calculate critical path whenever todos change
  const criticalPath = calculateCriticalPath(todos);
  const earliestStartDates = calculateEarliestStartDates(todos);

  // Sort todos by earliest start date
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const startDateA = earliestStartDates[a.id];
      const startDateB = earliestStartDates[b.id];

      // If a task has no start date, it's considered ready to start immediately.
      if (!startDateA && startDateB) return -1;
      if (startDateA && !startDateB) return 1;

      // If both have start dates, sort by the earliest one.
      if (startDateA && startDateB) {
        const timeA = startDateA.getTime();
        const timeB = startDateB.getTime();
        if (timeA !== timeB) return timeA - timeB;
      }
      
      // Fallback to due date if start dates are the same or not present.
      const dueDateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dueDateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      
      return dueDateA - dueDateB;
    });
  }, [todos, earliestStartDates]);

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

  const handleEditDependencies = (todo: TodoWithDependencies) => {
    setEditingTodo(todo);
    setEditDependencies(todo.dependencies.map(dep => dep.id));
    setError(''); // Clear errors when starting edit
  };

  const handleSaveDependencies = async () => {
    if (!editingTodo) return;

    try {
      const response = await fetch(`/api/todos/${editingTodo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencyIds: editDependencies }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update dependencies');
        return;
      }

      setEditingTodo(null);
      setEditDependencies([]);
      setError('');
      fetchTodos();
    } catch (error) {
      setError('Failed to update dependencies');
    }
  };

  const handleCancelEdit = () => {
    setEditingTodo(null);
    setEditDependencies([]);
    setError(''); // Clear errors when canceling
  };

  // Remove this function since it's no longer needed
  // const handleTaskClick = (taskId: number) => {
  //   setFocusedTask(taskId);
  //   setShowGraph(true);
  // };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500">
      <div className="container mx-auto p-4">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>
        
        {/* Error message */}
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] px-4">
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-lg">
              {error}
            </div>
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
              <DependencySelector
                todos={todos}
                selectedDependencies={selectedDependencies}
                onChange={setSelectedDependencies}
                title="Dependencies"
                description="Select tasks that must be completed first:"
              />
            )}
          </div>

          {/* Right Column - Todo List with Critical Path Highlighting */}
          <div className="space-y-6">
            {/* Critical Path Info - Updates instantly! */}
            {criticalPath.criticalPath.length > 0 && (
              <div className="bg-purple-50 border-l-4 border-purple-500 p-3 rounded-lg">
                <h3 className="font-semibold text-purple-800 mb-2">
                  📊 Critical Path Analysis ({criticalPath.pathLength} tasks)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {criticalPath.criticalPath.map((taskId, index) => {
                    const task = todos.find(t => t.id === taskId);
                    return task ? (
                      <div key={taskId} className="flex items-center">
                        <span className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm font-medium">
                          {task.title}
                        </span>
                        {index < criticalPath.criticalPath.length - 1 && (
                          <span className="mx-2 text-purple-600 font-bold">→</span>
                        )}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
            
            <div className="bg-white bg-opacity-90 p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  Todo List ({todos.length} tasks)
                </h2>
                <button
                  onClick={() => {
                    setFocusedTask(undefined);
                    setShowGraph(true);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  📊 View Dependency Graph
                </button>
              </div>

              
              {todos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No todos yet. Add one to get started!</p>
              ) : (
                <ul className="space-y-4 max-h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                  {sortedTodos.map((todo: TodoWithDependencies) => {
                    const isOnCriticalPath = criticalPath.criticalPath.includes(todo.id);
                    const pathLevel = criticalPath.nodeLevels[todo.id] || 0;
                    
                    const earliestStartDate = earliestStartDates[todo.id];
                    const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;

                    // Dates are stored as YYYY-MM-DD, which new Date() interprets as UTC.
                    // We compare against the start of today in UTC for overdue checks.
                    const today = new Date();
                    today.setUTCHours(0, 0, 0, 0);

                    const isOverdue = dueDate && dueDate < today;

                    const areDatesSameDay = dueDate && earliestStartDate &&
                      dueDate.toISOString().slice(0, 10) === earliestStartDate.toISOString().slice(0, 10);
                    
                    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'UTC' });

                    return (
                      <li
                        key={todo.id}
                        className={`flex items-start p-4 rounded-lg border transition-all duration-200 ${
                          isOnCriticalPath 
                            ? 'bg-purple-50 border-purple-300 shadow-lg transform scale-[1.02]' 
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
                          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                            <div className={`font-semibold ${isOnCriticalPath ? 'text-purple-800' : 'text-gray-800'}`}>
                              {todo.title}
                            </div>
                            {isOnCriticalPath && (
                              <span className="px-2 py-1 bg-purple-500 text-white text-xs rounded-full font-bold">
                                CRITICAL PATH
                              </span>
                            )}
                            
                            {/* Date Info: Combined Due Date and Earliest Start */}
                            {(() => {
                              if (areDatesSameDay && dueDate) {
                                return (
                                  <div className={`text-sm ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                    Due: {formatDate(dueDate)}
                                  </div>
                                );
                              }

                              return (
                                <>
                                  {dueDate && (
                                    <div className={`text-sm ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                      Due: {formatDate(dueDate)}
                                    </div>
                                  )}
                                  {earliestStartDate && (
                                    <div className="text-sm font-semibold text-gray-700">
                                      Earliest Start: {formatDate(earliestStartDate)}
                                      {dueDate && earliestStartDate > dueDate && ' (after due date!)'}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          
                          {/* Dependencies with edit functionality */}
                          <div className="mt-2">
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
                                onClick={() => handleEditDependencies(todo)}
                                className="text-blue-500 hover:text-blue-700 text-sm underline"
                              >
                                Edit
                              </button>
                            </div>
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


      {/* Edit Dependencies Modal */}
      {editingTodo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-md">
            <DependencySelector
              todos={todos}
              selectedDependencies={editDependencies}
              onChange={setEditDependencies}
              excludeId={editingTodo.id}
              title={`Edit Dependencies for "${editingTodo.title}"`}
              description="Select tasks that must be completed before this task."
            />
            <div className="bg-white bg-opacity-90 p-4 rounded-b-lg shadow-lg flex justify-end gap-3">
               <button
                onClick={handleSaveDependencies}
                className="px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded hover:bg-green-600"
              >
                Save Changes
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Add the graph modal */}
      {showGraph && (
        <DependencyGraph
          todos={todos}
          criticalPath={criticalPath.criticalPath}
          focusedTaskId={focusedTask}
          onClose={() => setShowGraph(false)}
        />
      )}
    </div>
  );
}
