import React, { useState, useEffect } from 'react';
import { isFeatureEnabled } from '../../flags/featureFlags';
import FDA510kService from '../../services/FDA510kService';

/**
 * PredicateFinderCard component for finding predicate devices for 510(k) submissions
 *
 * This component allows users to search for and select potential predicate devices
 * based on the current device profile.
 */
const PredicateFinderCard = ({ deviceProfile, onPredicateSelect, organizationId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [selectedPredicates, setSelectedPredicates] = useState([]);
  const [searchParams, setSearchParams] = useState({
    limit: 10,
    includeAbstractKeywords: true,
    matchExactProductCode: false,
  });

  // Check if the feature is enabled
  const isEnabled = isFeatureEnabled('fda510k.predicateFinder', organizationId);

  // Load predicates based on the device profile
  useEffect(() => {
    if (!deviceProfile || !isEnabled) return;

    const searchForPredicates = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Extract search parameters from device profile
        const searchData = {
          deviceName: deviceProfile.deviceName,
          manufacturer: deviceProfile.manufacturer,
          productCode: deviceProfile.productCode,
          intendedUse: deviceProfile.intendedUse,
          keywords: deviceProfile.keywords || [],
          limit: searchParams.limit,
        };

        // Call the predicate finder service
        const response = await FDA510kService.findPredicateDevices(searchData, organizationId);

        if (response.success) {
          setResults(response.predicates || []);
        } else {
          setError(response.error || 'Failed to find predicate devices');
        }
      } catch (err) {
        console.error('Predicate search error:', err);
        setError('An error occurred while searching for predicate devices');
      } finally {
        setIsLoading(false);
      }
    };

    searchForPredicates();
  }, [deviceProfile, searchParams.limit, isEnabled, organizationId]);

  // Handle predicate selection
  const handlePredicateSelect = predicate => {
    // Check if already selected
    const isAlreadySelected = selectedPredicates.some(p => p.id === predicate.id);

    if (isAlreadySelected) {
      // Remove from selection
      const updatedSelection = selectedPredicates.filter(p => p.id !== predicate.id);
      setSelectedPredicates(updatedSelection);

      // Notify parent
      if (onPredicateSelect) {
        onPredicateSelect(updatedSelection);
      }
    } else {
      // Add to selection
      const updatedSelection = [...selectedPredicates, predicate];
      setSelectedPredicates(updatedSelection);

      // Notify parent
      if (onPredicateSelect) {
        onPredicateSelect(updatedSelection);
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

  // If the feature is disabled, render nothing
  if (!isEnabled) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Predicate Device Finder</h2>

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
            <input
              type="checkbox"
              id="includeAbstractKeywords"
              checked={searchParams.includeAbstractKeywords}
              onChange={e => handleSearchParamChange('includeAbstractKeywords', e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="includeAbstractKeywords" className="text-sm">
              Include abstract keywords
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="matchExactProductCode"
              checked={searchParams.matchExactProductCode}
              onChange={e => handleSearchParamChange('matchExactProductCode', e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="matchExactProductCode" className="text-sm">
              Exact product code match
            </label>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="ml-2 text-gray-600">Searching for predicate devices...</span>
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
          <h3 className="text-lg font-medium mb-3">Potential Predicate Devices</h3>

          {results.length === 0 ? (
            <p className="text-gray-500 italic py-4">
              No predicate devices found. Try adjusting your device profile details or search
              parameters.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((predicate, index) => {
                const isSelected = selectedPredicates.some(p => p.id === predicate.id);

                return (
                  <div
                    key={predicate.id || index}
                    className={`p-4 border rounded-md transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex justify-between">
                      <div>
                        <h4 className="font-medium">{predicate.deviceName}</h4>
                        <p className="text-sm text-gray-600">
                          {predicate.manufacturer} &middot; K{predicate.kNumber}
                        </p>
                        <p className="text-sm text-gray-600">
                          Product Code: {predicate.productCode} &middot; Cleared:{' '}
                          {predicate.clearanceDate}
                        </p>
                        {predicate.matchScore && (
                          <div className="mt-1">
                            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                              Match Score: {Math.round(predicate.matchScore * 100)}%
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <button
                          onClick={() => handlePredicateSelect(predicate)}
                          className={`px-3 py-1 rounded border ${
                            isSelected
                              ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                    </div>

                    {predicate.intendedUse && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Intended Use:</span> {predicate.intendedUse}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Predicates Summary */}
          {selectedPredicates.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium mb-3">
                Selected Predicate Devices ({selectedPredicates.length})
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                {selectedPredicates.map(predicate => (
                  <li key={predicate.id} className="text-sm">
                    {predicate.deviceName} ({predicate.manufacturer}, K{predicate.kNumber})
                    <button
                      onClick={() => handlePredicateSelect(predicate)}
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

export default PredicateFinderCard;
