import { useState } from 'react';

/**
 * Custom hook for fetching FAERS (FDA Adverse Event Reporting System) data
 *
 * This hook provides functionality to interact with the FAERS API endpoints
 */
export function useFetchFAERS() {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Fetch FAERS data from the API
   *
   * @param {Object} params - Request parameters
   * @param {string} params.productName - Product name to search for
   * @param {string} params.cerId - CER ID for association
   * @param {boolean} params.includeComparators - Whether to include comparative analysis
   * @param {number} params.comparatorLimit - Maximum number of comparators to include
   * @returns {Promise} - Promise resolving to the API response
   */
  const fetchFAERS = async params => {
    try {
      setIsLoading(true);
      setError(null);

      // Extract parameters with defaults
      const { productName, cerId, includeComparators = true, comparatorLimit = 3 } = params;

      if (!productName) {
        throw new Error('Product name is required');
      }

      if (!cerId) {
        throw new Error('CER ID is required');
      }

      // Make the API request
      const response = await fetch('/api/cer/fetch-faers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productName,
          cerId,
          includeComparators,
          comparatorLimit,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch FAERS data');
      }

      const result = await response.json();
      console.log('FAERS data fetched:', result);
      setData(result);
      return result;
    } catch (err) {
      console.error('Error fetching FAERS data:', err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Get the comparative analysis from the FAERS data
   * If present, returns the comparators array
   */
  const getComparativeAnalysis = () => {
    if (!data || !data.comparators) return [];
    return data.comparators;
  };

  /**
   * Analyze if the current product has a better or worse profile
   * compared to similar drugs in its class
   */
  const getRelativeSafetyProfile = () => {
    if (!data || !data.comparators || data.comparators.length === 0) {
      return { conclusion: null, comparedCount: 0 };
    }

    const currentRiskScore = data.riskScore;
    let betterCount = 0;
    let worseCount = 0;
    let similarCount = 0;

    data.comparators.forEach(comp => {
      const ratio = comp.riskScore / currentRiskScore;

      if (ratio < 0.8) {
        betterCount++;
      } else if (ratio > 1.2) {
        worseCount++;
      } else {
        similarCount++;
      }
    });

    // Generate a conclusion statement
    let conclusion = '';

    if (betterCount > worseCount && betterCount > similarCount) {
      conclusion = `Has a more favorable safety profile than most similar drugs (${betterCount} of ${data.comparators.length}).`;
    } else if (worseCount > betterCount && worseCount > similarCount) {
      conclusion = `Has a less favorable safety profile than most similar drugs (${worseCount} of ${data.comparators.length}).`;
    } else if (similarCount > betterCount && similarCount > worseCount) {
      conclusion = `Has a safety profile consistent with most similar drugs (${similarCount} of ${data.comparators.length}).`;
    } else {
      conclusion = `Has a variable safety profile compared to other drugs in its class.`;
    }

    return {
      conclusion,
      comparedCount: data.comparators.length,
      betterCount,
      worseCount,
      similarCount,
    };
  };

  // Return the hook interface
  return {
    fetchFAERS,
    isLoading,
    data,
    error,
    getComparativeAnalysis,
    getRelativeSafetyProfile,
  };
}
