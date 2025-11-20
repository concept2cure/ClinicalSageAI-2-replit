/**
 * PredicateFinderService.js
 *
 * This service provides methods for discovering, retrieving, and analyzing
 * predicate devices for 510(k) submissions, interfacing with FDA's public APIs
 * and OpenAI for enhanced analysis and matching.
 */
const axios = require('axios');
const { OpenAI } = require('openai');

// Base URL for FDA API
const FDA_API_BASE_URL = 'https://api.fda.gov/device/510k';
const MAX_RESULTS = 50;

let openai;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('OpenAI client initialized for PredicateFinderService');
  } else {
    console.warn(
      'OpenAI API key not available. AI features of PredicateFinderService will be limited.'
    );
  }
} catch (err) {
  console.error('Failed to initialize OpenAI client:', err);
}

class PredicateFinderService {
  /**
   * Search for potential predicate devices using FDA's 510(k) database
   *
   * @param {Object} params - Search parameters
   * @param {string} params.productCode - FDA product code
   * @param {string} params.deviceName - Device name or keywords
   * @param {string} params.applicant - Manufacturer/applicant name
   * @param {string} params.dateFrom - Start date in YYYY-MM-DD format
   * @param {string} params.dateTo - End date in YYYY-MM-DD format
   * @param {number} params.limit - Maximum number of results (default: 10)
   * @returns {Promise<Object>} Search results
   */
  async searchPredicateDevices(params = {}) {
    try {
      const {
        productCode,
        deviceName,
        applicant,
        dateFrom = '2000-01-01',
        dateTo = new Date().toISOString().split('T')[0],
        limit = 10,
      } = params;

      // Build search query
      let query = '';

      if (productCode) {
        query += `product_code:"${productCode}"`;
      }

      if (deviceName) {
        if (query) query += '+AND+';
        // Remove special characters that might break the FDA API query
        const sanitizedName = deviceName.replace(/[^\w\s]/gi, ' ');
        query += `device_name:"${sanitizedName}"`;
      }

      if (applicant) {
        if (query) query += '+AND+';
        const sanitizedApplicant = applicant.replace(/[^\w\s]/gi, ' ');
        query += `applicant:"${sanitizedApplicant}"`;
      }

      // Add date range filter
      if (query) query += '+AND+';
      query += `decision_date:[${dateFrom}+TO+${dateTo}]`;

      // Use search API with structured query
      const url = `${FDA_API_BASE_URL}.json?search=${query}&limit=${limit}`;

      const response = await axios.get(url);

      // If no results found, try a less restrictive search
      if (!response.data.results || response.data.results.length === 0) {
        // Try with just the product code if available
        if (productCode) {
          return this.searchPredicateDevices({
            productCode,
            limit,
          });
        }

        // Or try with just part of the device name
        if (deviceName && deviceName.length > 5) {
          const generalKeyword = deviceName.split(' ')[0];
          return this.searchPredicateDevices({
            deviceName: generalKeyword,
            limit,
          });
        }
      }

      return this.formatFdaResults(response.data);
    } catch (error) {
      console.error('Error searching for predicate devices:', error);
      if (error.response && error.response.status === 404) {
        // No results found
        return {
          total: 0,
          results: [],
        };
      }
      throw error;
    }
  }

  /**
   * Format FDA API results into a consistent structure
   *
   * @param {Object} data - FDA API response data
   * @returns {Object} Formatted results
   */
  formatFdaResults(data) {
    if (!data.results || !Array.isArray(data.results)) {
      return {
        total: 0,
        results: [],
      };
    }

    return {
      total: data.meta ? data.meta.results.total : data.results.length,
      results: data.results.map(result => ({
        id: result.k_number,
        deviceName: result.device_name || 'Unknown Device',
        manufacturer: result.applicant || 'Unknown Manufacturer',
        kNumber: result.k_number,
        clearanceDate: result.decision_date,
        productCode: result.product_code,
        deviceClass: this.getDeviceClassFromReview(result),
        decisionSummaryUrl: this.buildDecisionSummaryUrl(result.k_number),
        predicateDevices: result.device_name_predicates || [],
        statement: result.statement || null,
        reviewAdviseCommittee: result.review_advise_committee === 'Y',
        dateReceived: result.date_received || null,
      })),
    };
  }

  /**
   * Get device class from review decision code
   *
   * @param {Object} result - FDA API result object
   * @returns {string} Device class (I, II, or III)
   */
  getDeviceClassFromReview(result) {
    // This is a simplified mapping. In reality, would need a more comprehensive approach
    // or additional API calls to get accurate classification
    if (!result.product_code) return 'Unknown';

    // Product codes can sometimes indicate class in FDA data
    if (
      result.advisory_committee_description &&
      result.advisory_committee_description.includes('Class III')
    ) {
      return 'III';
    } else if (
      result.advisory_committee_description &&
      result.advisory_committee_description.includes('Class II')
    ) {
      return 'II';
    } else if (
      result.advisory_committee_description &&
      result.advisory_committee_description.includes('Class I')
    ) {
      return 'I';
    }

    // Default to class II which is most common for 510(k)
    return 'II';
  }

  /**
   * Build FDA decision summary URL
   *
   * @param {string} kNumber - 510(k) K-number
   * @returns {string} URL to decision summary
   */
  buildDecisionSummaryUrl(kNumber) {
    if (!kNumber) return null;

    // Remove "K" prefix if present
    const number = kNumber.replace(/^K/i, '');

    // Format: https://www.accessdata.fda.gov/cdrh_docs/pdf/K123456.pdf
    // Note: Older K numbers use different paths

    // Check if it's a recent K number (usually 6 digits)
    if (number.length === 6) {
      // For more recent K numbers
      return `https://www.accessdata.fda.gov/cdrh_docs/pdf${number.substring(0, 2)}/${kNumber}.pdf`;
    } else {
      // For older K numbers
      return `https://www.accessdata.fda.gov/cdrh_docs/pdf/${kNumber}.pdf`;
    }
  }

  /**
   * Get detailed information for a specific 510(k) by K-number
   *
   * @param {string} kNumber - 510(k) K-number
   * @returns {Promise<Object>} Detailed device information
   */
  async getPredicateDeviceDetails(kNumber) {
    try {
      // Ensure K-number starts with K and is uppercase
      const formattedKNumber = kNumber.startsWith('K')
        ? kNumber.toUpperCase()
        : `K${kNumber.toUpperCase()}`;

      const url = `${FDA_API_BASE_URL}.json?search=k_number:"${formattedKNumber}"`;
      const response = await axios.get(url);

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error(`No results found for K-number: ${formattedKNumber}`);
      }

      // Format the first result
      const formattedResult = this.formatFdaResults(response.data);

      if (formattedResult.results.length === 0) {
        throw new Error(`Error formatting results for K-number: ${formattedKNumber}`);
      }

      return formattedResult.results[0];
    } catch (error) {
      console.error(`Error getting predicate device details for ${kNumber}:`, error);
      throw error;
    }
  }

  /**
   * Use OpenAI to analyze and enrich predicate device data
   *
   * @param {Object} deviceProfile - Current device profile
   * @param {Object} predicateDevice - Predicate device data
   * @returns {Promise<Object>} Enriched predicate device data with similarity analysis
   */
  async analyzePredicateDevice(deviceProfile, predicateDevice) {
    if (!openai) {
      console.warn('OpenAI not initialized. Cannot perform predicate device analysis.');
      return {
        ...predicateDevice,
        matchScore: 0.5, // Default match score
        matchRationale: 'AI analysis not available. Please check OpenAI API key configuration.',
      };
    }

    try {
      const prompt = `
        Analyze the similarity between the subject device and potential predicate device for a 510(k) submission.
        
        SUBJECT DEVICE:
        - Name: ${deviceProfile.deviceName}
        - Intended Use: ${deviceProfile.intendedUse || 'Not specified'}
        - Description: ${deviceProfile.description || 'Not specified'}
        - Technology Type: ${deviceProfile.technologyType || 'Not specified'}
        - Device Class: ${deviceProfile.deviceClass || 'Not specified'}
        
        POTENTIAL PREDICATE DEVICE:
        - Name: ${predicateDevice.deviceName}
        - K-Number: ${predicateDevice.kNumber}
        - Product Code: ${predicateDevice.productCode || 'Not specified'}
        - Manufacturer: ${predicateDevice.manufacturer}
        
        INSTRUCTIONS:
        Analyze these devices for substantial equivalence considering:
        1. Intended use
        2. Technological characteristics
        3. Safety and effectiveness
        
        Format your response as structured JSON with the following format:
        {
          "matchScore": number between 0.0-1.0,
          "matchRationale": 1-2 sentence explanation,
          "intendedUseMatch": number between 0.0-1.0,
          "technologicalMatch": number between 0.0-1.0,
          "safetyMatch": number between 0.0-1.0,
          "recommendation": 1 sentence on whether this would be a good predicate device
        }
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an FDA regulatory expert specializing in 510(k) substantial equivalence determinations.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      const analysis = JSON.parse(content);

      // Merge the analysis with the predicate device
      return {
        ...predicateDevice,
        matchScore: analysis.matchScore || 0.5,
        matchRationale: analysis.matchRationale || 'No analysis available',
        intendedUseMatch: analysis.intendedUseMatch || 0.5,
        technologicalMatch: analysis.technologicalMatch || 0.5,
        safetyMatch: analysis.safetyMatch || 0.5,
        recommendation: analysis.recommendation || null,
      };
    } catch (error) {
      console.error('Error analyzing predicate device with OpenAI:', error);

      // Return the original device with default values
      return {
        ...predicateDevice,
        matchScore: 0.5,
        matchRationale: 'AI analysis failed. See server logs for details.',
      };
    }
  }

  /**
   * Find and analyze predicate devices based on device profile with custom relevance criteria
   *
   * @param {Object} deviceProfile - Device profile to find predicates for
   * @param {Object} relevanceCriteria - Custom relevance criteria weights
   * @returns {Promise<Object>} Array of predicate devices with analysis
   */
  async findPredicatesWithCustomRelevance(deviceProfile, relevanceCriteria = null) {
    try {
      // Use default weights if no custom criteria provided
      const weights = relevanceCriteria || {
        intendedUseWeight: 40,
        deviceClassWeight: 20,
        technologyTypeWeight: 25,
        manufacturerWeight: 15,
      };

      // Search the FDA database for potential predicates using various criteria
      const searchResults = await this.searchPredicateDevices({
        productCode: deviceProfile.productCode,
        deviceName: deviceProfile.deviceName,
        limit: MAX_RESULTS,
      });

      // If no OpenAI available, return basic results
      if (!openai) {
        console.warn(
          'OpenAI not initialized. Returning basic predicate results without AI analysis.'
        );
        return {
          predicateDevices: searchResults.results.map(device => ({
            ...device,
            matchScore: 0.5, // Default score
            matchRationale: 'AI analysis not available. Please check OpenAI API key configuration.',
          })),
          relevanceCriteria: weights,
        };
      }

      // Use OpenAI to analyze and score the predicate devices
      const prompt = `
        I need to find suitable predicate devices for a 510(k) submission. 
        
        SUBJECT DEVICE:
        - Name: ${deviceProfile.deviceName}
        - Intended Use: ${deviceProfile.intendedUse || 'Not specified'}
        - Description: ${deviceProfile.description || 'Not specified'}
        - Technology Type: ${deviceProfile.technologyType || 'Not specified'}
        - Device Class: ${deviceProfile.deviceClass || 'Not specified'}
        - Product Code: ${deviceProfile.productCode || 'Not specified'}
        
        RELEVANCE CRITERIA WEIGHTS:
        - Intended Use Similarity: ${weights.intendedUseWeight}%
        - Device Classification Match: ${weights.deviceClassWeight}%
        - Technology Type Compatibility: ${weights.technologyTypeWeight}%
        - Manufacturer Track Record: ${weights.manufacturerWeight}%
        
        POTENTIAL PREDICATE DEVICES:
        ${JSON.stringify(searchResults.results.slice(0, 10))}
        
        INSTRUCTIONS:
        1. Analyze these devices for substantial equivalence considering the weighted criteria.
        2. Return a JSON array of scored devices with the following properties:
           - All original device properties
           - matchScore (number 0.0-1.0)
           - matchRationale (string explanation)
        3. Sort from highest to lowest matchScore.
        4. Only return the JSON array, no additional explanations.
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an FDA regulatory expert specializing in 510(k) substantial equivalence determinations.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      let analyzedDevices;

      try {
        // The response should be a JSON object with a devices array
        const parsedResponse = JSON.parse(content);

        // Check if we have a direct array or a property containing the array
        if (Array.isArray(parsedResponse)) {
          analyzedDevices = parsedResponse;
        } else if (parsedResponse.devices && Array.isArray(parsedResponse.devices)) {
          analyzedDevices = parsedResponse.devices;
        } else if (
          parsedResponse.predicateDevices &&
          Array.isArray(parsedResponse.predicateDevices)
        ) {
          analyzedDevices = parsedResponse.predicateDevices;
        } else {
          // Find any array property in the response
          const arrayProp = Object.entries(parsedResponse).find(([_, value]) =>
            Array.isArray(value)
          );
          analyzedDevices = arrayProp ? arrayProp[1] : [];
        }
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        console.log('Raw response:', content);

        // Use basic results on parsing error
        analyzedDevices = searchResults.results.map(device => ({
          ...device,
          matchScore: 0.5,
          matchRationale: 'AI analysis parsing error. See server logs for details.',
        }));
      }

      return {
        predicateDevices: analyzedDevices,
        relevanceCriteria: weights,
      };
    } catch (error) {
      console.error('Error finding predicate devices with custom relevance:', error);
      throw error;
    }
  }
}

module.exports = new PredicateFinderService();
