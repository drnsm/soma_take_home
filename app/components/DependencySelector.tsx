import { Todo } from '@prisma/client';

interface DependencySelectorProps {
  todos: Todo[];
  selectedDependencies: number[];
  onChange: (selected: number[]) => void;
  excludeId?: number;
  title: string;
  description: string;
}

export function DependencySelector({
  todos,
  selectedDependencies,
  onChange,
  excludeId,
  title,
  description,
}: DependencySelectorProps) {
  const availableTodos = todos.filter(todo => todo.id !== excludeId);

  const handleCheckboxChange = (todoId: number, checked: boolean) => {
    if (checked) {
      onChange([...selectedDependencies, todoId]);
    } else {
      onChange(selectedDependencies.filter(id => id !== todoId));
    }
  };

  return (
    <div className="bg-white bg-opacity-90 p-6 rounded-lg shadow-lg">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <p className="text-sm text-gray-600 mb-3">{description}</p>
      
      <div className="max-h-[400px] overflow-y-auto border rounded-lg bg-gray-50 p-3">
        {availableTodos.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No tasks available to be dependencies</p>
        ) : (
          <div className="space-y-2">
            {availableTodos.map(todo => (
              <label 
                key={todo.id} 
                className="flex items-center space-x-3 p-2 rounded hover:bg-white cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedDependencies.includes(todo.id)}
                  onChange={(e) => handleCheckboxChange(todo.id, e.target.checked)}
                  className="w-4 h-4 text-orange-500 bg-gray-100 border-gray-300 rounded focus:ring-orange-400 focus:ring-2"
                />
                <span className="text-sm text-gray-700 flex-1">
                  {todo.title}
                  {todo.dueDate && (
                    <span className="ml-2 text-gray-500 text-xs">
                      (Due: {new Date(todo.dueDate).toLocaleDateString('en-US', { timeZone: 'UTC' })})
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 