/**
 * EUDAMED Client
 *
 * This module provides access to the European Database on Medical Devices (EUDAMED)
 * which contains vigilance data and device information from the European market.
 *
 * Note: As of April 2025, EUDAMED is partially operational with limited public access.
 * The vigilance module is operational, but access to data is restricted.
 */

import https from 'https';
import querystring from 'querystring';
import { createCache } from './cache_manager.js';

// Create cache manager for EUDAMED data
const cacheManager = createCache('eudamed');

/**
 * Make an HTTP request
 *
 * @param {string} url URL to request
 * @param {Object} queryParams Query parameters
 * @returns {Promise<Object>} Promise resolving to response JSON
 */
function makeRequest(url, queryParams = {}) {
  return new Promise((resolve, reject) => {
    // Add query parameters
    const queryString = querystring.stringify(queryParams);
    const requestUrl = queryString ? `${url}?${queryString}` : url;

    const urlObj = new URL(requestUrl);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Concept2Cure CER Generator/1.0',
      },
    };

    const req = https.request(options, res => {
      let responseBody = '';

      res.on('data', chunk => {
        responseBody += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(responseBody);
            resolve(jsonData);
          } catch (e) {
            reject(new Error(`Failed to parse response body: ${e.message}`));
          }
        } else {
          try {
            const errorData = JSON.parse(responseBody);
            reject(
              new Error(errorData.error ? errorData.error.message : `HTTP Error: ${res.statusCode}`)
            );
          } catch {
            reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage || ''}`));
          }
        }
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Search for vigilance reports in EUDAMED
 *
 * @param {Object} params Search parameters
 * @param {string} params.deviceId Device unique identifier (UDI)
 * @param {string} params.deviceName Device name
 * @param {string} params.manufacturer Manufacturer name
 * @param {string} params.dateFrom Start date in YYYY-MM-DD format
 * @param {string} params.dateTo End date in YYYY-MM-DD format
 * @param {number} params.limit Maximum number of results to return
 * @returns {Promise<Object>} Promise resolving to search results
 */
export async function searchEudamedReports({
  deviceId = '',
  deviceName = '',
  manufacturer = '',
  dateFrom = '',
  dateTo = '',
  limit = 100,
} = {}) {
  try {
    // Generate a cache key based on search parameters
    const cacheKey =
      `eudamed_search_${deviceId}_${deviceName}_${manufacturer}_${dateFrom}_${dateTo}`.replace(
        /\s+/g,
        '_'
      );

    // Check if we have cached results
    const cachedData = await cacheManager.getCachedData(cacheKey);
    if (cachedData && cachedData.data) {
      console.log(`Retrieved EUDAMED data from cache for ${deviceId || deviceName}`);
      return cachedData.data;
    }

    console.log(
      `Note: EU EUDAMED is currently partially operational, with limited access to vigilance data`
    );

    // EUDAMED has no public vigilance API. Rather than fabricate incidents
    // that could silently land in a regulated CER as if they were real EU
    // data, default to an explicit "not available" response. Illustrative
    // demo data is only generated when EUDAMED_ALLOW_SIMULATED=true, and it
    // is tagged simulated end-to-end so the UI and downstream consumers can
    // label it as non-live.
    const allowSimulated = process.env.EUDAMED_ALLOW_SIMULATED === 'true';
    if (!allowSimulated) {
      const unavailable = {
        meta: {
          dataSource: 'unavailable',
          isLiveData: false,
          simulated: false,
          disclaimer:
            'Live EUDAMED vigilance data is not publicly accessible. No incidents are returned. ' +
            'Set EUDAMED_ALLOW_SIMULATED=true to preview the workflow with illustrative (non-live) data.',
          source: 'European Database on Medical Devices (EUDAMED)',
          date_accessed: new Date().toISOString().split('T')[0],
          total_records: 0,
        },
        search_criteria: { device_id: deviceId, device_name: deviceName, manufacturer },
        incidents: [],
      };
      await cacheManager.saveToCacheWithExpiry(cacheKey, unavailable, 60 * 60); // 1 hour
      return unavailable;
    }

    console.log(`Generating illustrative (non-live) EUDAMED data for ${deviceId || deviceName}...`);

    // Illustrative-only path: deterministic generation gated behind the
    // EUDAMED_ALLOW_SIMULATED flag. Every record is tagged simulated.

    // Calculate date range
    const startDate = dateFrom
      ? new Date(dateFrom)
      : new Date(new Date().setFullYear(new Date().getFullYear() - 2));
    const endDate = dateTo ? new Date(dateTo) : new Date();

    // Convert to YYYY-MM-DD format
    const formatDate = date => {
      return date.toISOString().split('T')[0];
    };

    // Generate deterministic but randomized set of reports based on input
    const seed = Buffer.from(deviceId || deviceName || manufacturer || 'default').reduce(
      (a, b) => a + b,
      0
    );
    const pseudoRandom = max => {
      const x = Math.sin(seed * max) * 10000;
      return Math.floor((x - Math.floor(x)) * max);
    };

    // Generate incidents
    const incidents = [];
    const incidentTypes = [
      'Device malfunction',
      'Serious deterioration in health',
      'Death',
      'User error',
      'Manufacturing defect',
      'Software failure',
      'Battery failure',
      'Packaging issue',
    ];

    // Generate a variable number of incidents
    const incidentCount = Math.min(pseudoRandom(50) + 5, limit);

    for (let i = 0; i < incidentCount; i++) {
      // Generate a random date within the range
      const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const incidentDate = new Date(startDate);
      incidentDate.setDate(startDate.getDate() + pseudoRandom(days));

      // Determine severity and type
      const isSeriousIncident = pseudoRandom(100) < 30;
      const typeIndex = pseudoRandom(incidentTypes.length);

      incidents.push({
        reference_number: `EMDN${seed % 10000}${i.toString().padStart(4, '0')}`,
        date: formatDate(incidentDate),
        device_name: deviceName || `Medical Device ${deviceId || ''}`,
        manufacturer: manufacturer || 'Unknown Manufacturer',
        device_id: deviceId || 'Unknown',
        type: incidentTypes[typeIndex],
        is_serious: isSeriousIncident,
        description: `Reported ${incidentTypes[typeIndex].toLowerCase()} incident involving the device.`,
        corrective_action:
          pseudoRandom(100) < 60
            ? 'Field Safety Corrective Action initiated'
            : 'Investigation ongoing',
        member_state: ['Germany', 'France', 'Italy', 'Spain', 'Netherlands'][pseudoRandom(5)],
        simulated: true,
      });
    }

    // Sort by date
    incidents.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    // Create response structure
    const response = {
      meta: {
        dataSource: 'illustrative',
        isLiveData: false,
        simulated: true,
        disclaimer:
          'Illustrative (non-live) EUDAMED data, generated for workflow preview only. ' +
          'Not real European vigilance records.',
        source: 'European Database on Medical Devices (EUDAMED)',
        date_accessed: new Date().toISOString().split('T')[0],
        total_records: incidents.length,
      },
      search_criteria: {
        device_id: deviceId,
        device_name: deviceName,
        manufacturer: manufacturer,
        date_from: formatDate(startDate),
        date_to: formatDate(endDate),
      },
      incidents: incidents,
    };

    // Cache the response
    await cacheManager.saveToCacheWithExpiry(cacheKey, response, 24 * 60 * 60); // 24 hours

    console.log(`Retrieved ${incidents.length} EUDAMED incidents`);
    return response;
  } catch (error) {
    console.error('Error fetching EUDAMED data:', error.message);

    // Return a structured error response
    return {
      error: error.message,
      meta: {
        disclaimer: 'EUDAMED data retrieval error occurred.',
        date_accessed: new Date().toISOString().split('T')[0],
        total_records: 0,
      },
      search_criteria: {
        device_id: deviceId,
        device_name: deviceName,
        manufacturer: manufacturer,
      },
      incidents: [],
    };
  }
}

/**
 * Analyze EUDAMED data for trends and insights
 *
 * @param {Object} eudamedData EUDAMED data object
 * @returns {Object} Analysis results
 */
export function analyzeEudamedData(eudamedData) {
  try {
    if (!eudamedData || !eudamedData.incidents || eudamedData.incidents.length === 0) {
      return {
        total_incidents: 0,
        summary: 'No EUDAMED incidents found.',
      };
    }

    const incidents = eudamedData.incidents;

    // Count serious incidents
    const seriousIncidents = incidents.filter(incident => incident.is_serious).length;

    // Count incidents by type
    const incidentTypes = {};
    incidents.forEach(incident => {
      const type = incident.type || 'Unknown';
      incidentTypes[type] = (incidentTypes[type] || 0) + 1;
    });

    // Sort types by frequency
    const sortedTypes = Object.entries(incidentTypes).sort((a, b) => b[1] - a[1]);

    // Count incidents by member state
    const memberStates = {};
    incidents.forEach(incident => {
      const state = incident.member_state || 'Unknown';
      memberStates[state] = (memberStates[state] || 0) + 1;
    });

    // Generate time trends (by month)
    const monthlyTrends = {};
    incidents.forEach(incident => {
      if (incident.date) {
        const dateParts = incident.date.split('-');
        if (dateParts.length === 3) {
          const yearMonth = `${dateParts[0]}-${dateParts[1]}`;
          monthlyTrends[yearMonth] = (monthlyTrends[yearMonth] || 0) + 1;
        }
      }
    });

    // Get top 3 incident types
    const topIncidentTypes = sortedTypes.slice(0, 3).map(([type, count]) => ({
      type,
      count,
    }));

    // Get FSCAs (Field Safety Corrective Actions)
    const fscaCount = incidents.filter(
      incident =>
        incident.corrective_action &&
        incident.corrective_action.includes('Field Safety Corrective Action')
    ).length;

    // Create summary
    return {
      total_incidents: incidents.length,
      serious_incidents: seriousIncidents,
      incident_type_distribution: incidentTypes,
      member_state_distribution: memberStates,
      top_incident_types: topIncidentTypes,
      fsca_count: fscaCount,
      monthly_trends: monthlyTrends,
      summary: `Analysis of ${incidents.length} EUDAMED incidents found ${seriousIncidents} serious incidents with ${fscaCount} Field Safety Corrective Actions.`,
    };
  } catch (error) {
    console.error('Error analyzing EUDAMED data:', error.message);
    return {
      total_incidents: eudamedData?.incidents?.length || 0,
      error: error.message,
    };
  }
}

export default {
  searchEudamedReports,
  analyzeEudamedData,
};
