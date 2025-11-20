/**
 * CER Integration Module
 *
 * This module integrates the data ingestion services with the CER generation
 * functionality, providing a unified interface for fetching regulatory data.
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Fetch regulatory data for a product from all available sources
 *
 * @param {Object} params Query parameters
 * @param {string} params.productId Product identifier (NDC or device code)
 * @param {string} params.productName Product name (used for caching)
 * @param {boolean} params.isDevice Whether this is a medical device (for source selection)
 * @param {boolean} params.isDrug Whether this is a drug product (for source selection)
 * @returns {Promise<Object>} Combined regulatory data from all sources
 */
export async function fetchRegulatoryData({
  productId,
  productName,
  isDevice = true,
  isDrug = false,
} = {}) {
  try {
    console.log(`Fetching regulatory data for ${productName} (${productId})...`);

    // Generate a cache key
    const cacheKey = `${productId}_${isDevice ? 'device' : ''}${isDrug ? 'drug' : ''}`.replace(
      /\s+/g,
      '_'
    );
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}_cer_data.json`);

    // Check if we have cached data that's less than 24 hours old
    try {
      if (fs.existsSync(cacheFile)) {
        const stats = fs.statSync(cacheFile);
        const cacheAge = Date.now() - stats.mtimeMs;

        // If cache is less than 24 hours old, use it
        if (cacheAge < 24 * 60 * 60 * 1000) {
          console.log(`Using cached regulatory data for ${productName} (${productId})`);
          const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          return cachedData;
        }
      }
    } catch (error) {
      console.error(`Error reading cache file: ${error.message}`);
      // Continue with live data fetch on cache error
    }

    // Array to collect all data sources
    const dataSources = [];

    // Start with empty dataset
    const regulatoryData = {
      product: {
        id: productId,
        name: productName,
      },
      sources: [],
      data: {
        device: null,
        drug: null,
        eu: null,
      },
    };

    // Fetch data from FDA device database if this is a device
    if (isDevice) {
      try {
        const deviceResponse = await fetch(
          `http://localhost:3500/api/ingest/device/${encodeURIComponent(productId)}`
        );

        if (deviceResponse.ok) {
          const deviceData = await deviceResponse.json();
          regulatoryData.data.device = deviceData;
          regulatoryData.sources.push('FDA_Device');
          dataSources.push('FDA MAUDE (device complaints)');
        }
      } catch (error) {
        console.error(`Error fetching FDA device data: ${error.message}`);
      }

      // Also fetch EU data for devices
      try {
        const euResponse = await fetch(
          `http://localhost:3500/api/ingest/eu/${encodeURIComponent(productId)}`
        );

        if (euResponse.ok) {
          const euData = await euResponse.json();
          regulatoryData.data.eu = euData;
          regulatoryData.sources.push('EU_Eudamed');
          dataSources.push('EU EUDAMED (European database)');
        }
      } catch (error) {
        console.error(`Error fetching EU EUDAMED data: ${error.message}`);
      }
    }

    // Fetch data from FDA FAERS if this is a drug
    if (isDrug) {
      try {
        const faersResponse = await fetch(
          `http://localhost:3500/api/ingest/drug/${encodeURIComponent(productId)}?limit=200`
        );

        if (faersResponse.ok) {
          const faersData = await faersResponse.json();
          regulatoryData.data.drug = faersData;
          regulatoryData.sources.push('FDA_FAERS');
          dataSources.push('FDA FAERS (adverse event reporting)');
        }
      } catch (error) {
        console.error(`Error fetching FDA FAERS data: ${error.message}`);
      }
    }

    // Add metadata
    regulatoryData.meta = {
      timestamp: new Date().toISOString(),
      dataSources: dataSources.join(', '),
    };

    // Cache the data
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(regulatoryData, null, 2));
    } catch (error) {
      console.error(`Error caching regulatory data: ${error.message}`);
    }

    return regulatoryData;
  } catch (error) {
    console.error(`Error in fetchRegulatoryData: ${error.message}`);
    throw error;
  }
}

/**
 * Extract structured safety information from the regulatory data
 *
 * @param {Object} regulatoryData Data from fetchRegulatoryData
 * @returns {Object} Structured safety information
 */
export function extractSafetyInformation(regulatoryData) {
  try {
    // Initialize safety data structure
    const safetyData = {
      adviseEvents: [],
      deviceMalfunctions: [],
      issueCategories: {},
      totalIncidents: 0,
      seriousIncidents: 0,
      recommendedActions: [],
    };

    // Process FDA device data if available
    if (regulatoryData.data.device) {
      const deviceComplaints = regulatoryData.data.device.complaints || [];

      // Count incidents
      safetyData.totalIncidents += deviceComplaints.length;

      // Process each complaint
      deviceComplaints.forEach(complaint => {
        // Extract narrative text
        const narrative = complaint.narrative || '';

        // Categorize by type (simple version)
        if (/malfunction|failure|break/i.test(narrative)) {
          safetyData.deviceMalfunctions.push({
            id: complaint.complaint_id,
            date: complaint.complaint_date,
            description: narrative.substring(0, 200),
          });
        }

        if (/injury|harm|death|serious/i.test(narrative)) {
          safetyData.seriousIncidents++;
          safetyData.adviseEvents.push({
            id: complaint.complaint_id,
            date: complaint.complaint_date,
            description: narrative.substring(0, 200),
          });
        }

        // Basic categorization by keyword presence in narrative
        const categories = {
          'Power Issues': /power|battery|electrical/i,
          'Display Problems': /display|screen|monitor/i,
          'Physical Damage': /broken|crack|damage/i,
          'Software Issues': /software|program|error|bug/i,
          'Usability Problems': /usability|difficult|confuse/i,
          'Performance Issues': /performance|slow|speed/i,
        };

        for (const [category, regex] of Object.entries(categories)) {
          if (regex.test(narrative)) {
            safetyData.issueCategories[category] = (safetyData.issueCategories[category] || 0) + 1;
          }
        }
      });
    }

    // Process FDA FAERS data if available
    if (regulatoryData.data.drug && regulatoryData.data.drug.raw_data) {
      const faersData = regulatoryData.data.drug.raw_data;

      // Extract events from FAERS
      if (faersData.results && Array.isArray(faersData.results)) {
        safetyData.totalIncidents += faersData.results.length;

        // Count serious events
        faersData.results.forEach(result => {
          if (result.serious && result.serious !== '0') {
            safetyData.seriousIncidents++;
          }

          // Extract patient reactions
          if (result.patient && result.patient.reaction) {
            result.patient.reaction.forEach(reaction => {
              if (reaction.reactionmeddrapt) {
                safetyData.adviseEvents.push({
                  id: result.safetyreportid || 'unknown',
                  date: result.receiptdate || 'unknown',
                  description: reaction.reactionmeddrapt,
                });
              }
            });
          }
        });
      }
    }

    // Generate recommended actions based on findings
    if (safetyData.seriousIncidents > 10 || safetyData.totalIncidents > 50) {
      safetyData.recommendedActions.push('Conduct a comprehensive safety review of the product.');
    }

    if (safetyData.deviceMalfunctions.length > 5) {
      safetyData.recommendedActions.push(
        'Investigate reported device malfunctions for common root causes.'
      );
    }

    if (safetyData.adviseEvents.length > 0) {
      safetyData.recommendedActions.push(
        'Update product labeling to include newly identified adverse events.'
      );
    }

    // Add basic recommendation if no specific ones were added
    if (safetyData.recommendedActions.length === 0) {
      safetyData.recommendedActions.push('Continue routine post-market surveillance.');
    }

    return safetyData;
  } catch (error) {
    console.error(`Error extracting safety information: ${error.message}`);
    return {
      adviseEvents: [],
      deviceMalfunctions: [],
      issueCategories: {},
      totalIncidents: 0,
      seriousIncidents: 0,
      recommendedActions: ['Continue routine post-market surveillance.'],
    };
  }
}

export default {
  fetchRegulatoryData,
  extractSafetyInformation,
};
