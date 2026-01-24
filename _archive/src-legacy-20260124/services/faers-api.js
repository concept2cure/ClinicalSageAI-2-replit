/**
 * FAERS API Client Service
 *
 * This service handles communication with the FDA Adverse Event Reporting System (FAERS)
 * to fetch and process adverse event data for medical devices and pharmaceuticals.
 */

import { apiRequest } from '@/lib/queryClient';

/**
 * Search for adverse events by product NDC code or name
 *
 * @param {Object} params Search parameters
 * @param {string} params.product_ndc NDC (National Drug Code) of the product
 * @param {string} params.product_name Name of the product to search
 * @param {string} params.manufacturer Manufacturer name
 * @param {string} params.start_date Start date in YYYY-MM-DD format
 * @param {string} params.end_date End date in YYYY-MM-DD format
 * @param {number} params.limit Maximum number of results to return
 * @returns {Promise<Object>} FAERS search results
 */
export async function searchFaersEvents(params) {
  try {
    // First attempt to use our backend proxy to FAERS
    const response = await apiRequest('GET', '/api/faers/search', params);
    return await response.json();
  } catch (error) {
    console.error('Error searching FAERS events through backend:', error);

    // If backend fails, try direct Health Canada API if key is available
    // The backend should have handled this, but this is a fallback
    if (process.env.HEALTH_CANADA_API_KEY) {
      try {
        const directResponse = await fetchFromHealthCanadaAPI(params);
        return directResponse;
      } catch (directError) {
        console.error('Error with direct Health Canada API call:', directError);
        throw new Error('Failed to fetch adverse event data');
      }
    } else {
      throw new Error('Failed to fetch adverse event data and no direct API access is configured');
    }
  }
}

/**
 * Get detailed information about a specific adverse event
 *
 * @param {string} eventId The FAERS event ID
 * @returns {Promise<Object>} Detailed event data
 */
export async function getEventDetails(eventId) {
  try {
    const response = await apiRequest('GET', `/api/faers/events/${eventId}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching event details:', error);
    throw error;
  }
}

/**
 * Generate an adverse event summary report for a product
 *
 * @param {Object} params Report parameters
 * @param {string} params.product_ndc NDC of the product
 * @param {string} params.product_name Name of the product
 * @param {string} params.start_date Start date range for events
 * @param {string} params.end_date End date range for events
 * @returns {Promise<Object>} Summary report data
 */
export async function generateEventSummaryReport(params) {
  try {
    const response = await apiRequest('POST', '/api/faers/reports/summary', params);
    return await response.json();
  } catch (error) {
    console.error('Error generating summary report:', error);
    throw error;
  }
}

/**
 * Get aggregated statistics about adverse events for a product
 *
 * @param {Object} params Query parameters
 * @param {string} params.product_ndc NDC of the product
 * @param {string} params.product_name Name of the product
 * @param {string} params.start_date Start date range
 * @param {string} params.end_date End date range
 * @returns {Promise<Object>} Statistical data about adverse events
 */
export async function getEventStatistics(params) {
  try {
    const response = await apiRequest('GET', '/api/faers/stats', params);
    return await response.json();
  } catch (error) {
    console.error('Error fetching event statistics:', error);
    throw error;
  }
}

/**
 * Direct API call to Health Canada's API (fallback)
 * This function requires HEALTH_CANADA_API_KEY to be set in environment
 *
 * @param {Object} params Search parameters
 * @returns {Promise<Object>} Event data from Health Canada
 */
async function fetchFromHealthCanadaAPI(params) {
  if (!process.env.HEALTH_CANADA_API_KEY) {
    throw new Error('Health Canada API key is not set');
  }

  // Implementation for direct API access
  // This would typically be handled by the backend
  throw new Error('Direct Health Canada API access is not implemented');
}
