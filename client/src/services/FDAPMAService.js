/**
 * FDA PMA (Pre-Market Approval) Service
 * 
 * This service provides functions for interacting with FDA PMA APIs for Class III
 * high-risk medical devices requiring the most stringent FDA approval process
 */

import api from '../utils/api';

class FDAPMAService {
  constructor() {
    this.cache = {
      pmaDevices: null,
      pmaByNumber: {},
      supplements: {},
    };
  }

  /**
   * Search for PMA approved devices in the FDA database
   * 
   * @param {Object} searchCriteria Search parameters including deviceName, genericName, productCode, manufacturer
   * @returns {Promise<Array>} Array of matching PMA devices
   */
  async searchPMADevices(searchCriteria) {
    console.log('Searching for PMA devices with criteria:', searchCriteria);

    // Check cache first
    const cacheKey = JSON.stringify(searchCriteria);
    if (this.cache.pmaDevices && this.cache.pmaDevicesKey === cacheKey) {
      console.log('Using cached PMA device results');
      return this.cache.pmaDevices;
    }

    try {
      const response = await api.post('/fda510k/pma/search', searchCriteria);

      if (response.data) {
        // Store valid results in cache
        this.cache.pmaDevices = response.data;
        this.cache.pmaDevicesKey = cacheKey;
        return response.data;
      }

      // Return empty array if no results
      return [];
    } catch (error) {
      console.error('Error searching for PMA devices:', error);
      // Return empty array on error - no fake data
      return [];
    }
  }

  /**
   * Get PMA device by PMA number
   * 
   * @param {string} pmaNumber The PMA number to search for (e.g., P150030)
   * @returns {Promise<Object>} The PMA device data if found
   */
  async getPMAByNumber(pmaNumber) {
    // Check cache first
    if (this.cache.pmaByNumber[pmaNumber]) {
      console.log(`Using cached data for PMA number ${pmaNumber}`);
      return this.cache.pmaByNumber[pmaNumber];
    }

    try {
      const response = await api.get(`/fda510k/pma/number/${pmaNumber}`);
      
      if (response.data) {
        // Store in cache
        this.cache.pmaByNumber[pmaNumber] = response.data;
        return response.data;
      }
      
      // Return null if no data found
      return null;
    } catch (error) {
      console.error(`Error fetching PMA device for number ${pmaNumber}:`, error);
      // Return null on error - no fake data
      return null;
    }
  }

  /**
   * Get PMA supplements for a given original PMA
   * 
   * @param {string} originalPMANumber The original PMA number
   * @returns {Promise<Object>} Object containing supplements array and metadata
   */
  async getPMASupplements(originalPMANumber) {
    // Check cache first
    if (this.cache.supplements[originalPMANumber]) {
      console.log(`Using cached supplements for PMA ${originalPMANumber}`);
      return this.cache.supplements[originalPMANumber];
    }

    try {
      const response = await api.post('/fda510k/pma/supplements', { 
        originalPMANumber 
      });
      
      if (response.data) {
        // Store in cache
        this.cache.supplements[originalPMANumber] = response.data;
        return response.data;
      }
      
      return {
        original_pma: originalPMANumber,
        total_supplements: 0,
        supplements: [],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error fetching supplements for PMA ${originalPMANumber}:`, error);
      
      return {
        original_pma: originalPMANumber,
        total_supplements: 0,
        supplements: [],
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache = {
      pmaDevices: null,
      pmaByNumber: {},
      supplements: {},
    };
    console.log('PMA service cache cleared');
  }

  /**
   * Compare a device with PMA approved devices for similarity analysis
   * 
   * @param {Object} deviceProfile The device to compare
   * @param {Array} pmaDevices Array of PMA devices to compare against
   * @returns {Object} Comparison results with recommendations
   */
  analyzePMAComparison(deviceProfile, pmaDevices) {
    const comparisons = pmaDevices.map(pma => {
      let similarityScore = 0;
      const factors = [];

      // Compare product codes
      if (deviceProfile.productCode === pma.product_code) {
        similarityScore += 0.3;
        factors.push('Same product code');
      }

      // Compare device type/generic name
      if (deviceProfile.deviceType && pma.generic_name) {
        const typeSimilarity = this.calculateStringSimilarity(
          deviceProfile.deviceType.toLowerCase(),
          pma.generic_name.toLowerCase()
        );
        similarityScore += typeSimilarity * 0.2;
        if (typeSimilarity > 0.5) {
          factors.push('Similar device type');
        }
      }

      // Compare intended use (would need more sophisticated NLP in production)
      if (deviceProfile.intendedUse && pma.generic_name) {
        const useSimilarity = this.calculateStringSimilarity(
          deviceProfile.intendedUse.toLowerCase(),
          pma.generic_name.toLowerCase()
        );
        similarityScore += useSimilarity * 0.2;
        if (useSimilarity > 0.5) {
          factors.push('Similar intended use');
        }
      }

      // Same advisory committee suggests similar device category
      if (deviceProfile.advisoryCommittee === pma.advisory_committee) {
        similarityScore += 0.1;
        factors.push('Same advisory committee');
      }

      return {
        pma_device: pma,
        similarity_score: Math.min(similarityScore, 1.0),
        matching_factors: factors,
        recommendation: similarityScore > 0.6 
          ? 'High similarity - Review this PMA for guidance'
          : similarityScore > 0.3
          ? 'Moderate similarity - May provide useful insights'
          : 'Low similarity - Different device category',
      };
    });

    // Sort by similarity score
    comparisons.sort((a, b) => b.similarity_score - a.similarity_score);

    return {
      device_profile: deviceProfile.deviceName || deviceProfile.deviceType,
      comparisons: comparisons.slice(0, 5), // Top 5 most similar
      recommendation: comparisons[0]?.similarity_score > 0.6
        ? 'PMA pathway likely required based on similar approved devices'
        : 'Further analysis needed to determine regulatory pathway',
      analysis_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Simple string similarity calculation (Dice coefficient)
   * 
   * @param {string} str1 First string
   * @param {string} str2 Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const bigrams1 = this.getBigrams(str1);
    const bigrams2 = this.getBigrams(str2);
    
    const intersection = bigrams1.filter(bg => bigrams2.includes(bg)).length;
    return (2 * intersection) / (bigrams1.length + bigrams2.length);
  }

  /**
   * Get bigrams from a string for similarity calculation
   * 
   * @param {string} str Input string
   * @returns {Array} Array of bigrams
   */
  getBigrams(str) {
    const bigrams = [];
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
  }
}

// Export singleton instance
const fdaPMAService = new FDAPMAService();
export default fdaPMAService;
export { FDAPMAService };