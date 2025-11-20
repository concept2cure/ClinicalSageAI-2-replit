import React, { useState, useEffect } from 'react';
import { isFeatureEnabled } from '../../flags/featureFlags';
import FDA510kService from '../../services/FDA510kService';

/**
 * LiteratureCard component for finding relevant scientific literature for 510(k) submissions
 *
 * This component searches for scientific articles relevant to the device profile
 * and allows users to select and save them for inclusion in the 510(k) submission.
 */
const LiteratureCard = ({ deviceProfile, onArticleSelect, organizationId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [searchParams, setSearchParams] = useState({
    limit: 10,
    includeFullText: true,
    yearRange: 10,
    relevanceThreshold: 0.6,
  });

  // Check if the feature is enabled
  const isEnabled = isFeatureEnabled('fda510k.literatureSearch', organizationId);

  // Load literature based on the device profile
  useEffect(() => {
    if (!deviceProfile || !isEnabled) return;

    const searchLiterature = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Extract search parameters from device profile
        const searchData = {
          deviceName: deviceProfile.deviceName,
          manufacturer: deviceProfile.manufacturer,
          medicalSpecialty: deviceProfile.medicalSpecialty,
          intendedUse: deviceProfile.intendedUse,
          keywords: deviceProfile.keywords || [],
          limit: searchParams.limit,
          yearRange: searchParams.yearRange,
          relevanceThreshold: searchParams.relevanceThreshold,
          includeFullText: searchParams.includeFullText,
        };

        // Call the literature service
        const response = await FDA510kService.searchLiterature(searchData, organizationId);

        if (response.success) {
          setResults(response.articles || []);
        } else {
          setError(response.error || 'Failed to find relevant literature');
        }
      } catch (err) {
        console.error('Literature search error:', err);
        setError('An error occurred while searching for literature');
      } finally {
        setIsLoading(false);
      }
    };

    searchLiterature();
  }, [deviceProfile, searchParams, isEnabled, organizationId]);

  // Handle article selection
  const handleArticleSelect = article => {
    // Check if already selected
    const isAlreadySelected = selectedArticles.some(a => a.pmid === article.pmid);

    if (isAlreadySelected) {
      // Remove from selection
      const updatedSelection = selectedArticles.filter(a => a.pmid !== article.pmid);
      setSelectedArticles(updatedSelection);

      // Notify parent
      if (onArticleSelect) {
        onArticleSelect(updatedSelection);
      }
    } else {
      // Add to selection
      const updatedSelection = [...selectedArticles, article];
      setSelectedArticles(updatedSelection);

      // Notify parent
      if (onArticleSelect) {
        onArticleSelect(updatedSelection);
      }
    }
  };

  // Handle search parameter changes
  const handleSearchParamChange = (param, value) => {
    setSearchParams(prev => ({
      ...prev,
      [param]: value,
    }));
  };

  // Format article date
  const formatDate = dateString => {
    if (!dateString) return 'No date';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // If the feature is disabled, render nothing
  if (!isEnabled) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Literature Search</h2>

      {/* Search Parameters */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Search Parameters</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center">
            <label className="mr-2 text-sm">Results limit:</label>
            <select
              value={searchParams.limit}
              onChange={e => handleSearchParamChange('limit', parseInt(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center">
            <label className="mr-2 text-sm">Publication years:</label>
            <select
              value={searchParams.yearRange}
              onChange={e => handleSearchParamChange('yearRange', parseInt(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value={5}>Last 5 years</option>
              <option value={10}>Last 10 years</option>
              <option value={15}>Last 15 years</option>
              <option value={0}>All years</option>
            </select>
          </div>

          <div className="flex items-center">
            <label className="mr-2 text-sm">Relevance threshold:</label>
            <select
              value={searchParams.relevanceThreshold}
              onChange={e =>
                handleSearchParamChange('relevanceThreshold', parseFloat(e.target.value))
              }
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value={0.4}>Low (0.4)</option>
              <option value={0.6}>Medium (0.6)</option>
              <option value={0.8}>High (0.8)</option>
              <option value={0.9}>Very high (0.9)</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="includeFullText"
              checked={searchParams.includeFullText}
              onChange={e => handleSearchParamChange('includeFullText', e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="includeFullText" className="text-sm">
              Include full text search
            </label>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="ml-2 text-gray-600">Searching for relevant literature...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-medium">Search Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && (
        <>
          <h3 className="text-lg font-medium mb-3">Relevant Scientific Literature</h3>

          {results.length === 0 ? (
            <p className="text-gray-500 italic py-4">
              No relevant articles found. Try adjusting your device profile details or search
              parameters.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((article, index) => {
                const isSelected = selectedArticles.some(a => a.pmid === article.pmid);

                return (
                  <div
                    key={article.pmid || index}
                    className={`p-4 border rounded-md transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex justify-between">
                      <div className="flex-1 pr-4">
                        <h4 className="font-medium">{article.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {article.authors?.join(', ') || 'Unknown authors'} &middot;{' '}
                          {article.journal || 'Unknown journal'} &middot;{' '}
                          {formatDate(article.publicationDate)}
                        </p>

                        {article.relevanceScore && (
                          <div className="mt-1">
                            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                              Relevance: {Math.round(article.relevanceScore * 100)}%
                            </span>
                            {article.citationCount && (
                              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full ml-2">
                                Citations: {article.citationCount}
                              </span>
                            )}
                          </div>
                        )}

                        {article.abstract && (
                          <div className="mt-2">
                            <details className="text-sm text-gray-700">
                              <summary className="cursor-pointer font-medium">Abstract</summary>
                              <p className="mt-2">{article.abstract}</p>
                            </details>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={() => handleArticleSelect(article)}
                          className={`px-3 py-1 rounded border ${
                            isSelected
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>

                        {article.doi && (
                          <a
                            href={`https://doi.org/${article.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 text-center text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          >
                            View DOI
                          </a>
                        )}

                        {article.pmid && (
                          <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 text-center text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          >
                            PubMed
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Articles Summary */}
          {selectedArticles.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium mb-3">
                Selected Articles ({selectedArticles.length})
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                {selectedArticles.map(article => (
                  <li key={article.pmid} className="text-sm">
                    {article.title} ({article.journal}, {formatDate(article.publicationDate)})
                    <button
                      onClick={() => handleArticleSelect(article)}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LiteratureCard;
