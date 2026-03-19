/**
 * FDA MAUDE Client
 *
 * This module provides access to the FDA MAUDE (Manufacturer and User Facility Device Experience)
 * database, which contains reports of adverse events involving medical devices.
 */

import https from 'https';
import querystring from 'querystring';
import { createCache } from './cache_manager.js';

// Create cache manager for MAUDE data
const cacheManager = createCache('fda_maude');

// API endpoints
const FDA_MAUDE_API_BASE = 'https://api.fda.gov/device/event.json';

/**
 * Make an HTTP request to the FDA MAUDE API
 *
 * @param {string} endpoint API endpoint
 * @param {Object} params Query parameters
 * @returns {Promise<Object>} Promise resolving to API response
 */
function makeRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    // Add query parameters
    const queryString = querystring.stringify(params);
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Concept2Cure CER Generator/1.0',
      },
    };

    const req = https.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          try {
            const errorData = JSON.parse(data);
            reject(new Error(errorData.error?.message || `HTTP Error: ${res.statusCode}`));
          } catch (error) {
            reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage || ''}`));
          }
        }
      });
    });

    req.on('error', error => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Search for device reports in the FDA MAUDE database
 *
 * @param {Object} params Search parameters
 * @param {string} params.productCode FDA product code
 * @param {string} params.deviceName Device name
 * @param {string} params.manufacturer Manufacturer name
 * @param {string} params.dateFrom Start date in YYYY-MM-DD format
 * @param {string} params.dateTo End date in YYYY-MM-DD format
 * @param {number} params.limit Maximum number of results
 * @returns {Promise<Array>} Promise resolving to array of device reports
 */
export async function searchDeviceReports({
  productCode = '',
  deviceName = '',
  manufacturer = '',
  dateFrom = '',
  dateTo = '',
  limit = 100,
} = {}) {
  try {
    console.log(`Searching FDA MAUDE for reports on device: ${productCode || deviceName}`);

    // Generate a cache key based on search parameters
    const cacheKey =
      `maude_search_${productCode}_${deviceName}_${manufacturer}_${dateFrom}_${dateTo}_${limit}`.replace(
        /\s+/g,
        '_'
      );

    // Check if we have cached results
    const cachedData = await cacheManager.getCachedData(cacheKey);
    if (cachedData && cachedData.data) {
      console.log(`Retrieved FDA MAUDE data from cache for ${productCode || deviceName}`);
      return cachedData.data;
    }

    // Build search query for FDA MAUDE API
    let searchQuery = '';

    if (productCode) {
      searchQuery += `device.product_code:"${productCode}"`;
    }

    if (deviceName) {
      if (searchQuery) searchQuery += ' AND ';
      // Use partial match to increase chance of finding relevant results
      searchQuery += `device.generic_name:${deviceName}`;
    }

    if (manufacturer) {
      if (searchQuery) searchQuery += ' AND ';
      searchQuery += `device.manufacturer_d_name:${manufacturer}`;
    }

    if (dateFrom || dateTo) {
      if (searchQuery) searchQuery += ' AND ';

      if (dateFrom && dateTo) {
        searchQuery += `date_received:[${dateFrom} TO ${dateTo}]`;
      } else if (dateFrom) {
        searchQuery += `date_received:[${dateFrom} TO 3000-01-01]`;
      } else if (dateTo) {
        searchQuery += `date_received:[1900-01-01 TO ${dateTo}]`;
      }
    }

    // Ensure we have a valid search query, or use a catch-all query
    if (!searchQuery) {
      if (productCode || deviceName || manufacturer) {
        // Use a wildcard search if we have some terms but couldn't build a proper query
        searchQuery = '_exists_:device';
      } else {
        // No search criteria provided, return empty result to avoid excessive API usage
        console.log('No search criteria provided for FDA MAUDE search');
        return [];
      }
    }

    const params = {
      search: searchQuery,
      limit: limit,
      sort: 'date_received:desc',
    };

    // Make the API request
    console.log(`FDA MAUDE API query: ${searchQuery}`);
    const response = await makeRequest(FDA_MAUDE_API_BASE, params);

    // Process and transform the results
    const results = transformMaudeResults(response, { productCode, deviceName, manufacturer });

    // Cache the results
    await cacheManager.saveToCacheWithExpiry(cacheKey, results, 24 * 60 * 60);

    return results;
  } catch (error) {
    console.error('Error searching FDA MAUDE:', error.message);

    // Return an empty array with error information
    return [];
  }
}

/**
 * Transform FDA MAUDE API response into a simpler format
 *
 * @param {Object} apiResponse Raw API response from FDA MAUDE
 * @param {Object} searchParams Original search parameters
 * @returns {Array} Transformed array of device reports
 */
function transformMaudeResults(apiResponse, searchParams) {
  if (!apiResponse || !apiResponse.results) {
    return [];
  }

  try {
    return apiResponse.results.map(result => {
      // Extract device information
      const deviceInfo = result.device && result.device.length > 0 ? result.device[0] : {};

      // Extract patient information
      const patientInfo = result.patient || {};

      // Determine event type from MDR text if available
      let eventType = 'Unknown';
      if (result.mdr_text && result.mdr_text.length > 0) {
        const mdrText = result.mdr_text.find(
          t => t.text_type_code === 'Description of Event or Problem'
        );
        if (mdrText && mdrText.text) {
          // Extract a short event description from the first part of the MDR text
          const text = mdrText.text.toLowerCase();
          if (text.includes('malfunction')) {
            eventType = 'Malfunction';
          } else if (text.includes('death')) {
            eventType = 'Death';
          } else if (text.includes('injury') || text.includes('serious')) {
            eventType = 'Injury';
          } else if (text.includes('failure')) {
            eventType = 'Device Failure';
          }
        }
      }

      return {
        report_number: result.report_number || '',
        date_received: result.date_received || '',
        date_of_event: result.date_of_event || '',
        event_type: eventType,
        device_name:
          deviceInfo.generic_name || deviceInfo.brand_name || searchParams.deviceName || 'Unknown',
        manufacturer: deviceInfo.manufacturer_d_name || searchParams.manufacturer || 'Unknown',
        product_code: deviceInfo.product_code || searchParams.productCode || '',
        device_class: deviceInfo.device_class || '',
        patient_outcome: patientInfo.sequence_number_outcome
          ? patientInfo.sequence_number_outcome.map(o => o.patient_outcome_text).join(', ')
          : '',
        is_serious: patientInfo.sequence_number_outcome
          ? patientInfo.sequence_number_outcome.some(o =>
              ['Death', 'Life Threatening', 'Hospitalization', 'Disability'].includes(
                o.patient_outcome_text
              )
            )
          : false,
      };
    });
  } catch (error) {
    console.error('Error transforming FDA MAUDE results:', error);
    return [];
  }
}

/**
 * Analyze MAUDE data to identify key patterns and statistics
 *
 * @param {Array} maudeData Array of MAUDE reports
 * @returns {Object} Analysis results
 */
export function analyzeMaudeData(maudeData) {
  if (!maudeData || !Array.isArray(maudeData) || maudeData.length === 0) {
    return {
      total_reports: 0,
      serious_events: 0,
      event_types: {},
      date_range: { earliest: null, latest: null },
      summary: 'No FDA MAUDE data found for this device.',
    };
  }

  try {
    // Count total reports
    const totalReports = maudeData.length;

    // Count serious events
    const seriousEvents = maudeData.filter(report => report.is_serious).length;

    // Count event types
    const eventTypes = {};
    maudeData.forEach(report => {
      const type = report.event_type || 'Unknown';
      eventTypes[type] = (eventTypes[type] || 0) + 1;
    });

    // Determine date range
    const dates = maudeData
      .map(report => report.date_received)
      .filter(date => date)
      .map(date => new Date(date));

    const earliestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
    const latestDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

    // Calculate monthly trends
    const monthlyTrends = {};
    maudeData.forEach(report => {
      if (report.date_received) {
        const date = new Date(report.date_received);
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyTrends[yearMonth] = (monthlyTrends[yearMonth] || 0) + 1;
      }
    });

    // Format dates for output
    const formatDate = date => {
      return date ? date.toISOString().split('T')[0] : null;
    };

    // Get top event types
    const sortedEventTypes = Object.entries(eventTypes)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count }));

    return {
      total_reports: totalReports,
      serious_events: seriousEvents,
      event_types: eventTypes,
      top_event_types: sortedEventTypes.slice(0, 3),
      date_range: {
        earliest: formatDate(earliestDate),
        latest: formatDate(latestDate),
      },
      monthly_trends: monthlyTrends,
      summary: `Analysis of ${totalReports} FDA MAUDE reports from ${formatDate(earliestDate) || 'unknown'} to ${formatDate(latestDate) || 'unknown'} found ${seriousEvents} serious events.`,
    };
  } catch (error) {
    console.error('Error analyzing MAUDE data:', error);
    return {
      error: error.message,
      total_reports: maudeData.length,
    };
  }
}

export default {
  searchDeviceReports,
  analyzeMaudeData,
};
