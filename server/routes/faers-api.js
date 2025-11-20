/**
 * FAERS API Router
 *
 * This router provides direct access to FDA FAERS data through a dedicated API.
 * No mock data is used - all data comes directly from the FDA API.
 */

import express from 'express';
import axios from 'axios';

const router = express.Router();

// FDA API base URL
const FDA_API_BASE_URL = 'https://api.fda.gov/drug/event.json';

// Set up axios instance with timeouts and retry logic
const fdaAxios = axios.create({
  timeout: 10000, // 10 second timeout
  headers: {
    Accept: 'application/json',
  },
});

// Helper function to simplify error handling
const safeApiFetch = async fetchFn => {
  try {
    return await fetchFn();
  } catch (error) {
    console.error('FDA API Error:', error.message);

    // Handle specific error types
    if (error.code === 'ECONNABORTED') {
      throw new Error('FDA API request timed out. Please try again later.');
    }

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const status = error.response.status;
      const data = error.response.data || {};

      if (status === 404) {
        throw new Error('No data found in FDA database for this query.');
      } else if (status === 429) {
        throw new Error('FDA API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`FDA API error: ${data.error || error.message}`);
      }
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error('No response received from FDA API. Please check your network connection.');
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Error preparing FDA API request: ${error.message}`);
    }
  }
};

/**
 * POST /api/faers/search - Search for products in the FDA FAERS database
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 20 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'A search query is required',
        success: false,
      });
    }

    console.log(`FAERS search for: ${query}`);

    // Create FDA API search query with proper escaping
    const encodedQuery = encodeURIComponent(query);
    const searchQuery = `patient.drug.openfda.brand_name:"${encodedQuery}" OR patient.drug.openfda.generic_name:"${encodedQuery}" OR patient.drug.openfda.substance_name:"${encodedQuery}"`;

    // Make request to FDA API safely
    const response = await safeApiFetch(async () => {
      return await fdaAxios.get(FDA_API_BASE_URL, {
        params: {
          search: searchQuery,
          limit: limit,
        },
      });
    });

    // Process and transform the data
    const results = response.data.results || [];
    const totalCount = response.data.meta?.results?.total || 0;

    // Extract and organize events data
    const processedResults = results.map(result => {
      // Get patient data
      const patient = result.patient || {};

      // Get reaction data
      const reactions = patient.reaction || [];
      const reactionsList = reactions.map(r => r.reactionmeddrapt).filter(Boolean);

      // Get drug info
      const drugs = patient.drug || [];

      return {
        id: result.safetyreportid || '',
        receiveDate: result.receivedate,
        serious: !!result.serious,
        reporterCountry: result.primarysourcecountry,
        patient: {
          gender:
            patient.patientsex === '1' ? 'Male' : patient.patientsex === '2' ? 'Female' : 'Unknown',
          age: patient.patientonsetage ? parseInt(patient.patientonsetage) : null,
          ageUnit: patient.patientonsetageunit || null,
          weight: patient.patientweight ? parseFloat(patient.patientweight) : null,
        },
        reactions: reactionsList,
        drugs: drugs
          .map(d => ({
            name: d.medicinalproduct || '',
            indication: d.drugindication || '',
            route: d.drugadministrationroute || '',
          }))
          .slice(0, 5), // Limit to 5 drugs for brevity
      };
    });

    res.json({
      success: true,
      total: totalCount,
      results: processedResults,
      source: 'FDA FAERS API',
    });
  } catch (error) {
    console.error('Error searching FAERS data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search FAERS data',
      message: error.message,
      source: 'FDA FAERS API',
    });
  }
});

/**
 * GET /api/faers/product/:name - Get FAERS data for a specific product
 */
router.get('/product/:name', async (req, res) => {
  try {
    const productName = req.params.name;

    if (!productName) {
      return res.status(400).json({
        error: 'Product name is required',
      });
    }

    console.log(`Getting FAERS data for product: ${productName}`);

    // Create FDA API search query for this product
    const searchQuery = `patient.drug.openfda.brand_name:"${productName}" OR patient.drug.openfda.generic_name:"${productName}" OR patient.drug.openfda.substance_name:"${productName}"`;

    // Make request to FDA API
    const response = await axios.get(FDA_API_BASE_URL, {
      params: {
        search: searchQuery,
        limit: 100,
      },
      timeout: 30000, // 30 second timeout
    });

    // Extract basic metrics
    const results = response.data.results || [];
    const totalCount = response.data.meta?.results?.total || 0;

    // Process results to get meaningful metrics
    let seriousCount = 0;
    const reactionCounts = {};
    const ageGroups = { '<18': 0, '18-45': 0, '46-65': 0, '>65': 0, unknown: 0 };
    const genderCounts = { Male: 0, Female: 0, Unknown: 0 };
    const yearCounts = {};

    results.forEach(result => {
      // Count serious reports
      if (result.serious) {
        seriousCount++;
      }

      // Count reactions
      const reactions = result.patient?.reaction || [];
      reactions.forEach(reaction => {
        if (reaction.reactionmeddrapt) {
          reactionCounts[reaction.reactionmeddrapt] =
            (reactionCounts[reaction.reactionmeddrapt] || 0) + 1;
        }
      });

      // Count age groups
      const age = parseInt(result.patient?.patientonsetage);
      if (!isNaN(age)) {
        if (age < 18) ageGroups['<18']++;
        else if (age <= 45) ageGroups['18-45']++;
        else if (age <= 65) ageGroups['46-65']++;
        else ageGroups['>65']++;
      } else {
        ageGroups['unknown']++;
      }

      // Count genders
      const gender = result.patient?.patientsex;
      if (gender === '1') genderCounts['Male']++;
      else if (gender === '2') genderCounts['Female']++;
      else genderCounts['Unknown']++;

      // Count years
      const receiveDate = result.receivedate;
      if (receiveDate) {
        const year = receiveDate.split('-')[0];
        if (year) {
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
      }
    });

    // Sort reactions by frequency
    const topReactions = Object.entries(reactionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        count,
        percentage: ((count / results.length) * 100).toFixed(1) + '%',
      }));

    // Prepare response
    res.json({
      success: true,
      productName,
      totalReports: totalCount,
      dataRetrieved: results.length,
      summary: {
        seriousCount,
        seriousPercentage:
          totalCount > 0 ? ((seriousCount / results.length) * 100).toFixed(1) + '%' : '0%',
        topReactions,
        demographics: {
          ageGroups,
          genderCounts,
        },
        reportsByYear: yearCounts,
      },
      source: 'FDA FAERS API',
    });
  } catch (error) {
    console.error('Error getting product FAERS data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product FAERS data',
      message: error.message,
      source: 'FDA FAERS API',
    });
  }
});

/**
 * GET /api/faers/compare - Compare multiple products by their FAERS data
 */
router.get('/compare', async (req, res) => {
  try {
    const { products } = req.query;

    if (!products) {
      return res.status(400).json({
        error: 'Product names are required',
      });
    }

    // Parse product names from comma-separated string
    const productNames = products.split(',').map(p => p.trim());

    if (productNames.length < 1 || productNames.length > 5) {
      return res.status(400).json({
        error: 'Please provide between 1 and 5 product names to compare',
      });
    }

    console.log(`Comparing FAERS data for products: ${productNames.join(', ')}`);

    // Get data for each product in parallel
    const productDataPromises = productNames.map(async productName => {
      try {
        // Create FDA API search query for this product
        const searchQuery = `patient.drug.openfda.brand_name:"${productName}" OR patient.drug.openfda.generic_name:"${productName}" OR patient.drug.openfda.substance_name:"${productName}"`;

        // Make request to FDA API
        const response = await axios.get(FDA_API_BASE_URL, {
          params: {
            search: searchQuery,
            limit: 50, // Use smaller limit for comparison
          },
          timeout: 30000, // 30 second timeout
        });

        // Extract basic metrics
        const results = response.data.results || [];
        const totalCount = response.data.meta?.results?.total || 0;
        const seriousCount = results.filter(r => r.serious).length;

        return {
          name: productName,
          totalReports: totalCount,
          seriousCount,
          seriousPercentage:
            results.length > 0 ? ((seriousCount / results.length) * 100).toFixed(1) : 0,
          dataAvailable: totalCount > 0,
        };
      } catch (error) {
        console.error(`Error getting data for ${productName}:`, error);
        return {
          name: productName,
          error: error.message,
          dataAvailable: false,
        };
      }
    });

    // Wait for all products to be processed
    const productData = await Promise.all(productDataPromises);

    // Return the comparison data
    res.json({
      success: true,
      comparison: productData,
      source: 'FDA FAERS API',
    });
  } catch (error) {
    console.error('Error comparing FAERS data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare FAERS data',
      message: error.message,
      source: 'FDA FAERS API',
    });
  }
});

export default router;
