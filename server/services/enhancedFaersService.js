/**
 * Enhanced FAERS Service
 *
 * This service extends the basic FAERS functionality to include more sophisticated
 * comparator drug matching using pharmacological classification systems including:
 * - ATC (Anatomical Therapeutic Chemical) codes
 * - MoA (Mechanism of Action)
 * - Pharmacological class information
 */

import axios from 'axios';
import { Pool } from 'pg';
import { getDrugClassByName } from './drugClassService.js';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

/**
 * FAERS Client with enhanced pharmacological classification
 */
class EnhancedFAERSClient {
  constructor() {
    this.BASE_EVENT_URL = 'https://api.fda.gov/drug/event.json';
    this.BASE_LABEL_URL = 'https://api.fda.gov/drug/label.json';
  }

  /**
   * Resolve product to UNII (Unique Ingredient Identifier)
   * @param {string} brandName - Product brand name
   * @returns {Promise<string|null>} - UNII code or null if not found
   */
  async resolveToUnii(brandName) {
    try {
      const params = {
        search: `openfda.brand_name:"${brandName}"`,
        limit: 1,
      };

      const response = await axios.get(this.BASE_LABEL_URL, { params });

      if (response.status === 200 && response.data.results?.length > 0) {
        const openfdaData = response.data.results[0].openfda || {};
        return openfdaData.unii?.[0] || null;
      }
      return null;
    } catch (error) {
      console.error('Error resolving UNII:', error.message);
      return null;
    }
  }

  /**
   * Resolve product to its active substance name
   * @param {string} brandName - Product brand name
   * @returns {Promise<string|null>} - Substance name or null if not found
   */
  async resolveSubstanceName(brandName) {
    try {
      const params = {
        search: `openfda.brand_name:"${brandName}"`,
        limit: 1,
      };

      const response = await axios.get(this.BASE_LABEL_URL, { params });

      if (response.status === 200 && response.data.results?.length > 0) {
        const openfdaData = response.data.results[0].openfda || {};
        return openfdaData.substance_name?.[0] || null;
      }
      return null;
    } catch (error) {
      console.error('Error resolving substance name:', error.message);
      return null;
    }
  }

  /**
   * Get the ATC codes for a product
   * @param {string} brandName - Product brand name
   * @returns {Promise<string[]>} - Array of ATC codes
   */
  async getAtcCodes(brandName) {
    try {
      const params = {
        search: `openfda.brand_name:"${brandName}"`,
        limit: 1,
      };

      const response = await axios.get(this.BASE_LABEL_URL, { params });

      if (response.status === 200 && response.data.results?.length > 0) {
        const openfdaData = response.data.results[0].openfda || {};
        return openfdaData.pharm_class_atc || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching ATC codes:', error.message);
      return [];
    }
  }

  /**
   * Get the mechanism of action for a product
   * @param {string} brandName - Product brand name
   * @returns {Promise<string[]>} - Array of mechanism of action descriptions
   */
  async getMechanismOfAction(brandName) {
    try {
      const params = {
        search: `openfda.brand_name:"${brandName}"`,
        limit: 1,
      };

      const response = await axios.get(this.BASE_LABEL_URL, { params });

      if (response.status === 200 && response.data.results?.length > 0) {
        const openfdaData = response.data.results[0].openfda || {};
        return openfdaData.pharm_class_moa || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching mechanism of action:', error.message);
      return [];
    }
  }

  /**
   * Get the established pharmacological class for a product
   * @param {string} brandName - Product brand name
   * @returns {Promise<string[]>} - Array of pharmacological classes
   */
  async getPharmClass(brandName) {
    try {
      const params = {
        search: `openfda.brand_name:"${brandName}"`,
        limit: 1,
      };

      const response = await axios.get(this.BASE_LABEL_URL, { params });

      if (response.status === 200 && response.data.results?.length > 0) {
        const openfdaData = response.data.results[0].openfda || {};
        return openfdaData.pharm_class_epc || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching pharmacological class:', error.message);
      return [];
    }
  }

  /**
   * Find pharmacologically similar products using ATC codes and MoA
   * @param {string} brandName - Product brand name
   * @returns {Promise<string[]>} - Array of similar product names
   */
  async findPharmacologicallySimilarProducts(brandName) {
    try {
      // Get classification data for the product
      const atcCodes = await this.getAtcCodes(brandName);
      const moaList = await this.getMechanismOfAction(brandName);
      const pharmClassList = await this.getPharmClass(brandName);
      const substanceName = await this.resolveSubstanceName(brandName);

      // Store unique product names
      const similarProducts = new Set();

      // Find products with matching ATC codes (most specific pharmacological match)
      if (atcCodes.length > 0) {
        for (const atcCode of atcCodes) {
          // Remove the specific product ATC level and search for the therapeutic subgroup
          // ATC codes are hierarchical: Anatomical group (1st level) → Therapeutic group (2nd level) →
          // Pharmacological group (3rd level) → Chemical group (4th level) → Chemical substance (5th level)
          const atcPrefix = atcCode.substring(0, 4); // First 4 characters represent therapeutic/pharmacological group

          const params = {
            search: `openfda.pharm_class_atc:"${atcPrefix}*"`, // Wildcard to match any product in the same group
            limit: 20,
          };

          const response = await axios.get(this.BASE_LABEL_URL, { params });

          if (response.status === 200 && response.data.results) {
            for (const result of response.data.results) {
              const openfdaData = result.openfda || {};

              // Add brand names if available, otherwise add generic names
              if (openfdaData.brand_name) {
                openfdaData.brand_name.forEach(name => {
                  if (name.toLowerCase() !== brandName.toLowerCase()) {
                    similarProducts.add(name);
                  }
                });
              } else if (openfdaData.generic_name) {
                openfdaData.generic_name.forEach(name => {
                  if (name.toLowerCase() !== brandName.toLowerCase()) {
                    similarProducts.add(name);
                  }
                });
              }
            }
          }
        }
      }

      // If not enough products found by ATC, add products with same mechanism of action
      if (similarProducts.size < 5 && moaList.length > 0) {
        for (const moa of moaList) {
          const params = {
            search: `openfda.pharm_class_moa:"${moa}"`,
            limit: 15,
          };

          const response = await axios.get(this.BASE_LABEL_URL, { params });

          if (response.status === 200 && response.data.results) {
            for (const result of response.data.results) {
              const openfdaData = result.openfda || {};

              if (openfdaData.brand_name) {
                openfdaData.brand_name.forEach(name => {
                  if (name.toLowerCase() !== brandName.toLowerCase()) {
                    similarProducts.add(name);
                  }
                });
              }
            }
          }
        }
      }

      // If still not enough products, add products with same pharmacological class
      if (similarProducts.size < 5 && pharmClassList.length > 0) {
        for (const pharmClass of pharmClassList) {
          const params = {
            search: `openfda.pharm_class_epc:"${pharmClass}"`,
            limit: 15,
          };

          const response = await axios.get(this.BASE_LABEL_URL, { params });

          if (response.status === 200 && response.data.results) {
            for (const result of response.data.results) {
              const openfdaData = result.openfda || {};

              if (openfdaData.brand_name) {
                openfdaData.brand_name.forEach(name => {
                  if (name.toLowerCase() !== brandName.toLowerCase()) {
                    similarProducts.add(name);
                  }
                });
              }
            }
          }
        }
      }

      // As a fallback, if we still don't have enough products or no classifications were found,
      // use substance name class
      if (similarProducts.size < 3 && substanceName) {
        const drugClass = await getDrugClassByName(substanceName);

        if (drugClass && drugClass.similars) {
          drugClass.similars.forEach(substance => {
            // Look up brand names for this substance
            // (Simplified approach - in real implementation would need to query API)
            similarProducts.add(substance);
          });
        }
      }

      return Array.from(similarProducts).slice(0, 10); // Return up to 10 similar products
    } catch (error) {
      console.error('Error finding similar products:', error.message);
      return [];
    }
  }

  /**
   * Fetch FAERS data for a product by UNII
   * @param {string} unii - UNII code for the product
   * @param {number} limit - Maximum number of reports to fetch
   * @returns {Promise<Array>} - Array of parsed FAERS reports
   */
  async fetchFaersDataByUnii(unii, limit = 100) {
    try {
      const params = {
        search: `patient.drug.openfda.unii:"${unii}"`,
        limit: limit,
      };

      const response = await axios.get(this.BASE_EVENT_URL, { params });

      if (response.status !== 200) {
        throw new Error(`FAERS fetch failed: ${response.statusText}`);
      }

      const results = response.data.results || [];
      const parsedResults = [];

      for (const entry of results) {
        const patient = entry.patient || {};
        const reactions = patient.reaction || [];
        const drugs = patient.drug || [];

        const demographics = {
          age: patient.patientonsetage,
          sex: patient.patientsex,
        };

        for (const reaction of reactions) {
          parsedResults.push({
            substance: drugs[0]?.medicinalproduct || 'Unknown',
            unii: unii,
            reaction: reaction.reactionmeddrapt,
            is_serious: entry.serious === 1,
            outcome: entry.seriousnessdeath ? 'Death' : 'Non-Death',
            report_date: entry.receivedate,
            age: demographics.age,
            sex: demographics.sex,
          });
        }
      }

      return parsedResults;
    } catch (error) {
      console.error('Error fetching FAERS data:', error.message);
      throw error;
    }
  }

  /**
   * Compute risk score based on FAERS reports
   * @param {Array} reports - Array of FAERS reports
   * @returns {number} - Calculated risk score
   */
  computeRiskScore(reports) {
    if (!reports || reports.length === 0) {
      return 0.0;
    }

    const weights = {
      Death: 3.0,
      Hospitalization: 2.0,
      Disability: 1.5,
    };

    const score = reports
      .filter(r => r.is_serious)
      .reduce((total, report) => total + (weights[report.outcome] || 1.0), 0);

    return parseFloat((score / reports.length).toFixed(2));
  }

  /**
   * Get full FAERS analysis for a product including similar product comparisons
   * @param {string} productName - Product brand name
   * @returns {Promise<Object>} - Comprehensive FAERS analysis
   */
  async getEnhancedFaersAnalysis(productName) {
    try {
      // Get product identifiers
      const unii = await this.resolveToUnii(productName);
      const substance = await this.resolveSubstanceName(productName);

      if (!unii) {
        throw new Error('UNII not found for product');
      }

      // Get FAERS reports
      const reports = await this.fetchFaersDataByUnii(unii);
      const score = this.computeRiskScore(reports);

      // Get pharmacological classifications
      const atcCodes = await this.getAtcCodes(productName);
      const moa = await this.getMechanismOfAction(productName);
      const pharmClass = await this.getPharmClass(productName);

      // Find similar products for comparison
      const similarProductNames = await this.findPharmacologicallySimilarProducts(productName);

      // Get data for each similar product
      const comparators = [];
      for (const compName of similarProductNames) {
        const compUnii = await this.resolveToUnii(compName);
        if (!compUnii) continue;

        try {
          const compReports = await this.fetchFaersDataByUnii(compUnii, 50);
          const compScore = this.computeRiskScore(compReports);

          comparators.push({
            comparator: compName,
            riskScore: compScore,
            reportCount: compReports.length,
          });
        } catch (error) {
          console.error(`Error processing comparator ${compName}:`, error.message);
          continue;
        }
      }

      return {
        productName,
        substance,
        classification: {
          atcCodes,
          mechanismOfAction: moa,
          pharmacologicalClass: pharmClass,
        },
        riskScore: score,
        reportCount: reports.length,
        comparators,
        reportsData: reports.slice(0, 50), // Include first 50 reports in response
      };
    } catch (error) {
      console.error('Error in enhanced FAERS analysis:', error.message);
      throw error;
    }
  }
}

/**
 * Store FAERS data in database
 * @param {number} cerId - CER document ID
 * @param {Array} reports - Array of FAERS reports
 */
async function storeFaersReportsInDatabase(cerId, reports) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const report of reports) {
      await client.query(
        `INSERT INTO faers_reports 
        (cer_id, substance_name, unii, reaction, is_serious, outcome, report_date, age, sex) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          cerId,
          report.substance,
          report.unii,
          report.reaction,
          report.is_serious,
          report.outcome,
          report.report_date,
          report.age,
          report.sex,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error storing FAERS reports:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fetch and analyze FAERS data for a product
 * @param {string} productName - Product brand name
 * @param {number} cerId - CER document ID (optional)
 * @returns {Promise<Object>} - FAERS analysis including pharmacological comparisons
 */
async function fetchFaersAnalysis(productName, cerId = null) {
  const client = new EnhancedFAERSClient();

  try {
    const analysis = await client.getEnhancedFaersAnalysis(productName);

    // Store in database if CER ID is provided
    if (cerId && analysis.reportsData.length > 0) {
      await storeFaersReportsInDatabase(cerId, analysis.reportsData);
    }

    return analysis;
  } catch (error) {
    console.error('Error in fetchFaersAnalysis:', error.message);
    throw error;
  }
}

// ESM export
export { EnhancedFAERSClient, fetchFaersAnalysis };
