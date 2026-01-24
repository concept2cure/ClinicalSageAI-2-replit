// VectorSearch.jsx - Vector search component with citations
import React, { useState } from 'react';
import { Search, FileText, FilePlus, AlertTriangle, ArrowRight } from 'lucide-react';

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
      const response = await fetch('/api/search/vector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  // Mock results for development and testing
  const mockResults = [
    {
      content:
        'The study demonstrated a statistically significant improvement in overall survival (HR 0.72, 95% CI 0.58-0.88, p=0.001) for patients treated with the combination therapy versus standard of care. The median overall survival was 18.2 months in the experimental arm compared to 12.6 months in the control arm.',
      relevance: 0.95,
      document_id: 1,
      document_title: 'Clinical Study Report XYZ-123',
      source_page: 42,
      source_section: 'Efficacy Results',
    },
    {
      content:
        'Adverse events of Grade 3 or higher were observed in 32.5% of patients in the experimental arm versus 28.3% in the control arm. The most common treatment-related adverse events in the experimental arm were neutropenia (18.2%), fatigue (12.7%), and nausea (10.3%).',
      relevance: 0.87,
      document_id: 1,
      document_title: 'Clinical Study Report XYZ-123',
      source_page: 67,
      source_section: 'Safety Results',
    },
    {
      content:
        'Similar phase II trials of combination regimens have reported median overall survival ranging from 12.3 to 16.8 months, placing our observed result of 18.2 months at the higher end of the efficacy spectrum for this patient population.',
      relevance: 0.82,
      document_id: 2,
      document_title: 'Comparative Efficacy Analysis',
      source_page: 15,
      source_section: 'Discussion',
    },
  ];

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

      {/* Development note: Replace with actual results when API is ready */}
      {!isSearching && results.length === 0 && query && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          {/* This section would be replaced by real results when the API is working */}
          <FileText size={48} className="mb-4 opacity-50" />
          <p className="text-center mb-2">Development placeholder: Using mock results.</p>
          <button
            onClick={() => setResults(mockResults)}
            className="flex items-center text-emerald-600 hover:text-emerald-700 gap-1"
          >
            Show mock results <ArrowRight size={16} />
          </button>
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
