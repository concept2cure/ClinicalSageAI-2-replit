/**
 * Data Integration Module for Concept2Cure
 *
 * This module integrates data from multiple regulatory sources:
 * - FDA MAUDE (device adverse events)
 * - FDA FAERS (drug adverse events)
 * - EU EUDAMED (European device database)
 *
 * The integrated data is used to generate Clinical Evaluation Reports (CERs).
 */

import { searchDeviceReports, analyzeMaudeData } from './fda_maude_client.js';
import { searchAdverseEvents, analyzeFaersData } from './fda_faers_client.js';
import { searchEudamedReports, analyzeEudamedData } from './eudamed_client.js';

/**
 * Convert a JavaScript Date to YYYY-MM-DD format
 *
 * @param {Date} date
 * @returns {string} Formatted date string
 */
function formatDateYYYYMMDD(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Gather integrated data from all regulatory sources
 *
 * @param {Object} params Query parameters
 * @param {string} params.productId Product identifier (NDC or device code)
 * @param {string} params.productName Product name
 * @param {string} params.manufacturer Manufacturer name
 * @param {boolean} params.isDevice Whether the product is a device
 * @param {boolean} params.isDrug Whether the product is a drug
 * @param {number} params.dateRangeDays Number of days to look back for data
 * @returns {Promise<Object>} Integrated data from all sources
 */
export async function gatherIntegratedData({
  productId,
  productName,
  manufacturer,
  isDevice = true,
  isDrug = false,
  dateRangeDays = 730, // Default to 2 years
} = {}) {
  console.log(`Gathering integrated data for ${productName} (${productId})...`);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - dateRangeDays);

  // Format dates for API calls
  const dateFrom = formatDateYYYYMMDD(startDate);
  const dateTo = formatDateYYYYMMDD(endDate);

  // Array to track which sources were used
  const sourcesUsed = [];
  const promises = [];
  let maudeData = null;
  let faersData = null;
  let eudamedData = null;

  // Query FDA MAUDE if product is a device
  if (isDevice) {
    console.log(`Querying FDA MAUDE for device ${productId}...`);
    promises.push(
      searchDeviceReports({
        productCode: productId,
        deviceName: productName,
        manufacturer: manufacturer,
        dateFrom: dateFrom,
        dateTo: dateTo,
      })
        .then(data => {
          maudeData = data;
          if (data && data.length > 0) {
            sourcesUsed.push('FDA MAUDE');
          }
          return data;
        })
        .catch(error => {
          console.error('Error fetching FDA MAUDE data:', error.message);
          return null;
        })
    );
  }

  // Query FDA FAERS if product is a drug
  if (isDrug) {
    console.log(`Querying FDA FAERS for drug ${productId}...`);
    promises.push(
      searchAdverseEvents({
        productNdc: productId,
        productName: productName,
        manufacturer: manufacturer,
        dateFrom: dateFrom,
        dateTo: dateTo,
      })
        .then(data => {
          faersData = data;
          if (
            data &&
            data.results &&
            data.results.adverse_events &&
            data.results.adverse_events.length > 0
          ) {
            sourcesUsed.push('FDA FAERS');
          }
          return data;
        })
        .catch(error => {
          console.error('Error fetching FDA FAERS data:', error.message);
          return null;
        })
    );
  }

  // Query EU EUDAMED for European data (device only)
  if (isDevice) {
    console.log(`Querying EU EUDAMED for device ${productId}...`);
    promises.push(
      searchEudamedReports({
        deviceId: productId,
        deviceName: productName,
        manufacturer: manufacturer,
        dateFrom: dateFrom,
        dateTo: dateTo,
      })
        .then(data => {
          eudamedData = data;
          if (data && data.incidents && data.incidents.length > 0) {
            sourcesUsed.push('EU EUDAMED');
          }
          return data;
        })
        .catch(error => {
          console.error('Error fetching EUDAMED data:', error.message);
          return null;
        })
    );
  }

  // Wait for all queries to complete
  await Promise.all(promises);

  // Process the collected data
  const integratedData = processIntegratedData(maudeData, faersData, eudamedData, {
    productId,
    productName,
    manufacturer,
    dateFrom,
    dateTo,
  });

  return {
    sources: sourcesUsed,
    dateRange: {
      from: dateFrom,
      to: dateTo,
    },
    integratedData,
  };
}

/**
 * Process and integrate data from all sources
 *
 * @param {Object} maudeData FDA MAUDE data
 * @param {Object} faersData FDA FAERS data
 * @param {Object} eudamedData EU EUDAMED data
 * @param {Object} metadata Product and query metadata
 * @returns {Object} Integrated data and analysis
 */
function processIntegratedData(maudeData, faersData, eudamedData, metadata) {
  const { productId, productName, manufacturer, dateFrom, dateTo } = metadata;

  // Analyze data from each source
  const maudeAnalysis = maudeData ? analyzeMaudeData(maudeData) : null;
  const faersAnalysis = faersData ? analyzeFaersData(faersData) : null;
  const eudamedAnalysis = eudamedData ? analyzeEudamedData(eudamedData) : null;

  // Get total event counts from each source
  const maudeEvents = maudeAnalysis ? maudeAnalysis.total_reports : 0;
  const faersEvents = faersAnalysis ? faersAnalysis.total_reports : 0;
  const eudamedEvents = eudamedAnalysis ? eudamedAnalysis.total_incidents : 0;

  // Get serious event counts from each source
  const maudeSerious = maudeAnalysis ? maudeAnalysis.serious_events : 0;
  const faersSerious = faersAnalysis ? faersAnalysis.serious_reports : 0;
  const eudamedSerious = eudamedAnalysis ? eudamedAnalysis.serious_incidents : 0;

  // Combine event counts
  const totalEvents = maudeEvents + faersEvents + eudamedEvents;
  const seriousEvents = maudeSerious + faersSerious + eudamedSerious;

  // Identify top events across sources (simplified)
  const topEvents = [];

  // Add top MAUDE events
  if (maudeData && Array.isArray(maudeData)) {
    const eventTypes = {};
    maudeData.forEach(report => {
      const type = report.event_type || 'Unknown';
      eventTypes[type] = (eventTypes[type] || 0) + 1;
    });

    Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => {
        topEvents.push({
          term: type,
          count: count,
          source: 'FDA MAUDE',
        });
      });
  }

  // Add top FAERS events
  if (faersData && faersData.results && faersData.results.adverse_events) {
    faersData.results.adverse_events
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .forEach(event => {
        topEvents.push({
          term: event.term,
          count: event.count,
          source: 'FDA FAERS',
        });
      });
  }

  // Add top EUDAMED events
  if (eudamedData && eudamedData.incidents) {
    const incidentTypes = {};
    eudamedData.incidents.forEach(incident => {
      const type = incident.type || 'Unknown';
      incidentTypes[type] = (incidentTypes[type] || 0) + 1;
    });

    Object.entries(incidentTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => {
        topEvents.push({
          term: type,
          count: count,
          source: 'EU EUDAMED',
        });
      });
  }

  // Sort top events by count
  topEvents.sort((a, b) => b.count - a.count);

  // Combine trend data (dates truncated to month for simplicity)
  const trends = {
    bySource: {
      maude: maudeAnalysis && maudeAnalysis.monthly_trends ? maudeAnalysis.monthly_trends : {},
      faers: {}, // FAERS trend data would be extracted here
      eudamed: {}, // EUDAMED trend data would be extracted here
    },
    combined: {}, // Combined trend data would be calculated here
  };

  // Create integrated result
  return {
    product: {
      id: productId,
      name: productName,
      manufacturer: manufacturer,
    },
    timeframe: {
      from: dateFrom,
      to: dateTo,
    },
    summary: {
      totalEvents,
      seriousEvents,
      nonSeriousEvents: totalEvents - seriousEvents,
      bySource: {
        maude: {
          total: maudeEvents,
          serious: maudeSerious,
        },
        faers: {
          total: faersEvents,
          serious: faersSerious,
        },
        eudamed: {
          total: eudamedEvents,
          serious: eudamedSerious,
        },
      },
      topEvents,
    },
    trends,
    sourceData: {
      maude: maudeData,
      faers: faersData,
      eudamed: eudamedData,
    },
    analysis: {
      maude: maudeAnalysis,
      faers: faersAnalysis,
      eudamed: eudamedAnalysis,
    },
  };
}

/**
 * Calculate risk level based on event counts and trends
 *
 * @param {Object} integratedData Integrated data from all sources
 * @returns {string} Risk level assessment
 */
export function calculateRiskLevel(integratedData) {
  const { summary } = integratedData;
  const { totalEvents, seriousEvents } = summary;

  if (totalEvents === 0) {
    return 'Insufficient Data';
  }

  // Calculate serious event percentage
  const seriousPercentage = (seriousEvents / totalEvents) * 100;

  // Determine risk level based on percentage and absolute counts
  if (seriousEvents > 100 || seriousPercentage > 20) {
    return 'High';
  } else if (seriousEvents > 10 || seriousPercentage > 5) {
    return 'Medium';
  } else {
    return 'Low';
  }
}

/**
 * Generate safety recommendations based on integrated data
 *
 * @param {Object} integratedData Integrated data from all sources
 * @returns {Array<string>} List of safety recommendations
 */
export function generateSafetyRecommendations(integratedData) {
  const { summary } = integratedData;
  const { totalEvents, seriousEvents, topEvents } = summary;

  const recommendations = [];

  // Basic recommendations based on event counts
  if (totalEvents === 0) {
    recommendations.push(
      'Implement standard post-market surveillance to monitor for adverse events.'
    );
    return recommendations;
  }

  // Add recommendation based on serious event percentage
  const seriousPercentage = (seriousEvents / totalEvents) * 100;

  if (seriousPercentage > 15) {
    recommendations.push(
      'Urgently review product safety profile and consider risk mitigation measures.'
    );
    recommendations.push(
      'Consider additional clinical investigations to better characterize identified risks.'
    );
  } else if (seriousPercentage > 5) {
    recommendations.push('Monitor serious adverse events closely and review trend data quarterly.');
    recommendations.push('Evaluate current risk controls for adequacy and update if needed.');
  } else {
    recommendations.push(
      'Continue routine post-market surveillance and periodic safety reporting.'
    );
  }

  // Add recommendations based on top events
  if (topEvents && topEvents.length > 0) {
    const topEvent = topEvents[0];
    recommendations.push(
      `Investigate root causes of the most common event type: "${topEvent.term}".`
    );
  }

  return recommendations;
}

export default {
  gatherIntegratedData,
  calculateRiskLevel,
  generateSafetyRecommendations,
};
