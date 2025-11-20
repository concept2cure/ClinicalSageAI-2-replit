import React from 'react';

/**
 * Displays a list of context snippets with a "Use" button.
 * Props:
 *  - snippets: Array<{ id: string, text: string }>
 *  - onSnippetClick: (id: string) => void
 *  - isLoading: boolean - Optional loading state
 *  - error: string - Optional error message
 */
export default function ContextPreview({ snippets, onSnippetClick, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="py-4 text-center">
        <div
          className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-indigo-600 rounded-full"
          role="status"
          aria-label="Loading context snippets"
        ></div>
        <p className="mt-2 text-sm text-gray-500">Fetching relevant context...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-600"
      >
        ⚠ {error}
      </div>
    );
  }

  if (!snippets?.length) {
    return <p className="text-sm text-gray-500">No context snippets available.</p>;
  }

  return (
    <div className="space-y-3" aria-label="Context snippets">
      {snippets.map(({ id, text }, idx) => (
        <div key={id || idx} className="p-3 border rounded-lg group hover:bg-gray-50 relative">
          <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">{text}</pre>
          <button
            onClick={() => onSnippetClick && onSnippetClick(id || idx)}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white px-2 py-1 text-xs rounded 
                      focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label={`Use context snippet ${idx + 1}`}
          >
            Use here
          </button>
        </div>
      ))}
    </div>
  );
}
