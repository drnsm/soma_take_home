"use client"
import { Todo } from '@prisma/client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState(''); // Added due date state
  const [todos, setTodos] = useState([]);
  const [imageLoadingStates, setImageLoadingStates] = useState<{[key: number]: boolean}>({});

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/todos');
      const data = await res.json();
      setTodos(data);
      // Set loading state for new todos
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
    try {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: newTodo,
          dueDate: newDueDate || null // Include due date in request
        }),
      });
      setNewTodo('');
      setNewDueDate(''); // Reset due date after adding
      fetchTodos();
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const handleDeleteTodo = async (id:any) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
      });
      fetchTodos();
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>
        <div className="flex mb-6">
          <input
            type="text"
            className="flex-grow p-3 rounded-l-none focus:outline-none text-gray-700"
            placeholder="Add a new todo"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
          />
          <input 
            type="date" 
            className="p-3 focus:outline-none text-gray-700"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            title="Due date (optional)"
          />
          <button
            onClick={handleAddTodo}
            className="bg-white text-indigo-600 p-3 rounded-r-full hover:bg-gray-100 transition duration-300"
          >
            Add
          </button>
        </div>
        <ul>
          {todos.map((todo:Todo) => (
            <li
              key={todo.id}
              className="flex items-center bg-white bg-opacity-90 p-4 mb-4 rounded-lg shadow-lg"
            >
              {/* Image */}
              <div className="w-16 h-16 mr-4 flex-shrink-0">
                <img
                  src={`/images/${todo.id}.jpg`}
                  alt={todo.title}
                  className="w-full h-full object-cover rounded-lg"
                  onError={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-200 rounded-lg"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div></div>';
                    }
                  }}
                />
              </div>
              
              {/* Todo content */}
              <div className="flex-grow">
                <div className="text-gray-800">{todo.title}</div>
                {/* Display due date if it exists */}
                {todo.dueDate && (
                  <div className={`text-sm mt-1 ${
                    new Date(todo.dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
                      ? 'text-red-600 font-semibold' 
                      : 'text-gray-600'
                  }`}>
                    Due: {new Date(todo.dueDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                  </div>
                )}
              </div>
              
              {/* Delete button */}
              <button
                onClick={() => handleDeleteTodo(todo.id)}
                className="text-red-500 hover:text-red-700 transition duration-300 ml-4"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
