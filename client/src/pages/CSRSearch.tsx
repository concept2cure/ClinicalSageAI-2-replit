// client/src/pages/CSRSearch.tsx
import React, { useState, useEffect } from 'react';
import { searchCsrs } from '../api/csr'; // Import your API function
import { Link, useLocation } from 'wouter'; // Using wouter for navigation

// Define the expected structure of a single CSR result item
interface CsrResult {
  id: string;
  title: string;
  summary?: string;
  therapeuticArea?: string;
  phase?: string;
  // Add other relevant fields you expect from your search results
  // Ensure these match what your Python backend returns for each CSR in the search results
}

const CSRSearch: React.FC = () => {
  const [location] = useLocation();
  // Use URLSearchParams to correctly parse query parameters from the URL
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const initialQuery = queryParams.get('query_text') || ''; // Match the API parameter name

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CsrResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to handle the actual search API call
  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setError(null); // Clear any previous errors
      return;
    }
    setLoading(true);
    setError(null); // Clear previous errors
    try {
      const data = await searchCsrs(searchQuery);
      setResults(data); // `searchCsrs` now returns the array directly
    } catch (err: any) {
      // Use `any` for error type if not strictly defined
      if (err.message === 'API_QUOTA_EXCEEDED') {
        setError(
          'Search temporarily unavailable: OpenAI quota exceeded. Please try again later or contact support.'
        );
      } else {
        setError('Failed to perform search. Please try again.');
        console.error('Search error:', err);
      }
      setResults([]); // Clear results on error
    } finally {
      setLoading(false);
    }
  };

  // Effect to trigger search when the component mounts or initialQuery changes
  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]); // Dependency array ensures it runs when initialQuery changes

  // Handler for form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
    // Optionally update URL for shareable search links (requires react-router-dom's useNavigate hook)
    // const navigate = useNavigate();
    // navigate(`/csr/search?query_text=${encodeURIComponent(query)}`);
  };

  return (
    <div className="container mx-auto p-4 font-inter">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Search Clinical Study Reports</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex space-x-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter keywords, therapeutic area, drug name..."
          className="flex-grow p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          type="submit"
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Display Error Message */}
      {error && (
        <div className="text-red-500 mb-4 p-3 bg-red-100 border border-red-400 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Search Results ({results.length})</h2>
        {loading && <p className="text-center text-gray-500">Loading search results...</p>}
        {!loading && results.length > 0 ? (
          <ul className="space-y-4">
            {results.map(csr => (
              <li key={csr.id} className="border-b pb-2 last:border-b-0">
                <Link
                  to={`/csr/${csr.id}`}
                  className="text-blue-600 hover:underline text-lg font-medium"
                >
                  {csr.title || 'Untitled CSR'}
                </Link>
                <p className="text-gray-600 text-sm mt-1">
                  {csr.therapeuticArea && `Therapeutic Area: ${csr.therapeuticArea}`}
                  {csr.phase && ` | Phase: ${csr.phase}`}
                </p>
                <p className="text-gray-700 text-base mt-2">
                  {csr.summary || 'No summary available.'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          !loading &&
          !error && <p className="text-gray-500">No results found. Try a different query.</p>
        )}
      </div>
    </div>
  );
};

export default CSRSearch;
