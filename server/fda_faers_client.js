/**
 * FDA FAERS Client
 *
 * This module provides access to the FDA Adverse Event Reporting System (FAERS) database,
 * which contains information on adverse event and medication error reports submitted to FDA
 * for drugs and therapeutic biological products.
 */

import https from 'https';
import querystring from 'querystring';
import { createCache } from './cache_manager.js';

// Create cache manager for FAERS data
const cacheManager = createCache('fda_faers');

// API endpoints
const FDA_FAERS_API_BASE = 'https://api.fda.gov/drug/event.json';

/**
 * Make an HTTP request to the FDA FAERS API
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
 * Search for adverse events in the FDA FAERS database
 *
 * @param {Object} params Search parameters
 * @param {string} params.productNdc NDC code of the product
 * @param {string} params.productName Product name
 * @param {string} params.manufacturer Manufacturer name
 * @param {string} params.dateFrom Start date in YYYY-MM-DD format
 * @param {string} params.dateTo End date in YYYY-MM-DD format
 * @param {number} params.limit Maximum number of results
 * @returns {Promise<Object>} Promise resolving to FAERS data
 */
export async function searchAdverseEvents({
  productNdc = '',
  productName = '',
  manufacturer = '',
  dateFrom = '',
  dateTo = '',
  limit = 100,
} = {}) {
  try {
    console.log(`Searching FDA FAERS for adverse events on product: ${productNdc || productName}`);

    // Generate a cache key based on search parameters
    const cacheKey =
      `faers_search_${productNdc}_${productName}_${manufacturer}_${dateFrom}_${dateTo}_${limit}`.replace(
        /\s+/g,
        '_'
      );

    // Check if we have cached results
    const cachedData = await cacheManager.getCachedData(cacheKey);
    if (cachedData && cachedData.data) {
      console.log(`Retrieved FDA FAERS data from cache for ${productNdc || productName}`);
      return cachedData.data;
    }

    // Build search query for FDA FAERS API
    let searchQuery = '';

    if (productNdc) {
      searchQuery += `patient.drug.openfda.product_ndc:"${productNdc}"`;
    }

    if (productName) {
      if (searchQuery) searchQuery += ' AND ';
      // Use partial match for product name to increase chances of finding matches
      searchQuery += `patient.drug.medicinalproduct:${productName}`;
    }

    if (manufacturer) {
      if (searchQuery) searchQuery += ' AND ';
      searchQuery += `patient.drug.openfda.manufacturer_name:${manufacturer}`;
    }

    // Add date range if provided
    if (dateFrom || dateTo) {
      if (searchQuery) searchQuery += ' AND ';

      if (dateFrom && dateTo) {
        searchQuery += `receiptdate:[${dateFrom} TO ${dateTo}]`;
      } else if (dateFrom) {
        searchQuery += `receiptdate:[${dateFrom} TO 3000-01-01]`;
      } else if (dateTo) {
        searchQuery += `receiptdate:[1900-01-01 TO ${dateTo}]`;
      }
    }

    // Ensure we have a valid search query, or use a catch-all query
    if (!searchQuery) {
      if (productNdc || productName || manufacturer) {
        // Use a wildcard search if we have some terms but couldn't build a proper query
        searchQuery = '_exists_:patient.drug';
      } else {
        // No search criteria provided, return empty result to avoid excessive API usage
        console.log('No search criteria provided for FDA FAERS search');
        return { meta: { total: 0 }, results: { adverse_events: [] } };
      }
    }

    const params = {
      search: searchQuery,
      limit: limit,
    };

    // Make the API request
    console.log(`FDA FAERS API query: ${searchQuery}`);
    const response = await makeRequest(FDA_FAERS_API_BASE, params);

    // Process and transform the results
    const result = await transformFaersResults(response, { productNdc, productName, manufacturer });

    // Cache the results
    await cacheManager.saveToCacheWithExpiry(cacheKey, result, 24 * 60 * 60);

    return result;
  } catch (error) {
    console.error('Error searching FDA FAERS:', error.message);

    // Return an empty result object with error information
    return {
      error: error.message,
      meta: { total: 0 },
      results: { adverse_events: [] },
    };
  }
}

/**
 * Transform FDA FAERS API response into a more useful structure
 *
 * @param {Object} apiResponse Raw API response from FDA FAERS
 * @param {Object} searchParams Original search parameters
 * @returns {Object} Transformed FAERS data
 */
async function transformFaersResults(apiResponse, searchParams) {
  if (!apiResponse || !apiResponse.results) {
    return {
      meta: { total: 0 },
      results: { adverse_events: [] },
    };
  }

  try {
    // Extract basic metadata
    const meta = {
      total: apiResponse.meta?.results?.total || 0,
      disclaimer: apiResponse.meta?.disclaimer || '',
      query: searchParams,
    };

    // Collect all adverse events from reports
    const adverseEventCounts = {};
    const reportDates = [];
    const seriousReportCount = {
      total: 0,
      death: 0,
      lifeThreatening: 0,
      hospitalization: 0,
      disability: 0,
      congenitalAnomaly: 0,
      other: 0,
    };

    // Process each report
    apiResponse.results.forEach(report => {
      // Track report date
      if (report.receiptdate) {
        reportDates.push(report.receiptdate);
      }

      // Check seriousness
      const seriousnessObj = report.serious || {};
      const isSeriousReport =
        seriousnessObj.seriousnessdeath === 1 ||
        seriousnessObj.seriousnesslifethreatening === 1 ||
        seriousnessObj.seriousnesshospitalization === 1 ||
        seriousnessObj.seriousnessdisabling === 1 ||
        seriousnessObj.seriousnesscongenitalanomali === 1 ||
        seriousnessObj.seriousnessother === 1;

      if (isSeriousReport) {
        seriousReportCount.total++;

        if (seriousnessObj.seriousnessdeath === 1) seriousReportCount.death++;
        if (seriousnessObj.seriousnesslifethreatening === 1) seriousReportCount.lifeThreatening++;
        if (seriousnessObj.seriousnesshospitalization === 1) seriousReportCount.hospitalization++;
        if (seriousnessObj.seriousnessdisabling === 1) seriousReportCount.disability++;
        if (seriousnessObj.seriousnesscongenitalanomali === 1)
          seriousReportCount.congenitalAnomaly++;
        if (seriousnessObj.seriousnessother === 1) seriousReportCount.other++;
      }

      // Extract all adverse events from patient reactions
      if (report.patient && report.patient.reaction) {
        report.patient.reaction.forEach(reaction => {
          if (reaction.reactionmeddrapt) {
            const term = reaction.reactionmeddrapt;
            adverseEventCounts[term] = (adverseEventCounts[term] || 0) + 1;
          }
        });
      }
    });

    // Sort adverse events by frequency
    const sortedAdverseEvents = Object.entries(adverseEventCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([term, count]) => ({ term, count }));

    // Calculate date range
    const earliestDate = reportDates.length > 0 ? reportDates.sort()[0] : null;

    const latestDate = reportDates.length > 0 ? reportDates.sort().slice(-1)[0] : null;

    // Build final result
    return {
      meta,
      results: {
        total_reports: apiResponse.results.length,
        serious_reports: seriousReportCount.total,
        serious_breakdown: seriousReportCount,
        adverse_events: sortedAdverseEvents,
        date_range: {
          earliest: earliestDate,
          latest: latestDate,
        },
      },
    };
  } catch (error) {
    console.error('Error transforming FDA FAERS results:', error);
    return {
      meta: { total: 0, error: error.message },
      results: { adverse_events: [] },
    };
  }
}

/**
 * Analyze FAERS data to identify key patterns and statistics
 *
 * @param {Object} faersData FAERS data object from searchAdverseEvents
 * @returns {Object} Analysis results
 */
export function analyzeFaersData(faersData) {
  if (!faersData || !faersData.results) {
    return {
      total_reports: 0,
      serious_reports: 0,
      adverse_events_count: 0,
      summary: 'No FDA FAERS data found for this product.',
    };
  }

  try {
    const { results } = faersData;

    // Get top adverse events
    const topAdverseEvents = results.adverse_events.slice(0, 5).map(event => event.term);

    // Calculate percentage of serious reports
    const seriousPercentage =
      results.total_reports > 0
        ? ((results.serious_reports / results.total_reports) * 100).toFixed(1)
        : 0;

    return {
      total_reports: results.total_reports,
      serious_reports: results.serious_reports,
      serious_percentage: parseFloat(seriousPercentage),
      adverse_events_count: results.adverse_events.length,
      top_adverse_events: topAdverseEvents,
      date_range: results.date_range,
      serious_breakdown: results.serious_breakdown,
      summary: `Analysis of ${results.total_reports} FDA FAERS reports found ${results.serious_reports} serious reports (${seriousPercentage}%) and ${results.adverse_events.length} unique adverse events.`,
    };
  } catch (error) {
    console.error('Error analyzing FAERS data:', error);
    return {
      error: error.message,
      total_reports: faersData?.results?.total_reports || 0,
    };
  }
}

export default {
  searchAdverseEvents,
  analyzeFaersData,
};
