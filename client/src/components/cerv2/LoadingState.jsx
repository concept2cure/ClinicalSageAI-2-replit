/**
 * LoadingState Component
 * 
 * Skeleton loader for table rows
 */

export function LoadingState({ rows = 5, columns = 5 }) {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-4 bg-gray-200 rounded"
              style={{ width: j === 0 ? '200px' : '120px' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * LoadingSpinner Component
 * 
 * Simple spinner for inline loading
 */
export function LoadingSpinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeClasses[size]} border-2 border-blue-600 border-t-transparent rounded-full animate-spin`}
      />
    </div>
  );
}
