// VectorSearch.jsx - Vector search component with citations
import React, { useState } from 'react';
import { Search, FileText, FilePlus, AlertTriangle } from 'lucide-react'
import { authService } from '@/services/authService';

export default function VectorSearch() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const handleSearch = async e => {
    e.preventDefault();

    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const token = authService.getToken();
      if (!token) {
        throw new Error('Authentication required.');
      }

      const response = await fetch('/api/search/vector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: query,
          k: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search error: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };


  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Semantic Document Search</h1>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search documents using natural language..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full p-3 pr-10 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:bg-slate-800 dark:border-slate-700"
            />
            <Search className="absolute right-3 top-3 text-gray-400" size={20} />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {error && (
          <div className="mt-2 text-red-500 flex items-center gap-1">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </form>

      {!isSearching && results.length === 0 && query && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <FileText size={48} className="mb-4 opacity-50" />
          <p className="text-center mb-2">No results found for your query.</p>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Search Results</h2>

          <div className="space-y-6">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-white shadow rounded-lg overflow-hidden dark:bg-slate-800"
              >
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    <span className="font-medium">{result.document_title || 'Document'}</span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Relevance: {Math.round(result.relevance * 100)}%
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-3">
                    <p className="text-gray-700 dark:text-gray-300">{result.content}</p>
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3">
                    {result.source_page && <span>Page {result.source_page}</span>}
                    {result.source_section && <span>• {result.source_section}</span>}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-700 px-4 py-2 text-sm">
                  <button className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <FilePlus size={16} />
                    Cite in document
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
