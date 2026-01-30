/**
 * Test Script for Regulatory AI Queries
 *
 * This script tests the Regulatory AI endpoint with various regulatory queries
 * to verify that the system can respond appropriately.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// List of test queries covering multiple regulatory domains and jurisdictions
const testQueries = [
  // FDA-related queries
  { query: 'What is a 510(k) submission?', context: 'FDA' },
  { query: 'Explain the difference between a PMA and a 510(k)', context: 'FDA' },
  { query: 'What are Special 510(k) requirements?', context: 'FDA' },

  // EMA-related queries
  { query: 'What is needed for a CE Mark application?', context: 'EMA' },
  { query: 'Explain the EU MDR classification system', context: 'EMA' },
  { query: 'What is a technical file for medical devices?', context: 'EMA' },

  // PMDA-related queries
  { query: "How does Japan's PMDA approval process work?", context: 'PMDA' },
  { query: "What are PMDA's requirements for foreign clinical data?", context: 'PMDA' },

  // Health Canada queries
  { query: 'What is a Medical Device License in Canada?', context: 'Health Canada' },
  { query: "Explain Health Canada's risk classification system", context: 'Health Canada' },

  // ICH Guidelines
  { query: 'Summarize ICH E6 GCP requirements', context: 'ICH' },
  { query: 'What are the key points of ICH E8?', context: 'ICH' },
  { query: 'How does ICH E9 guide statistical analysis?', context: 'ICH' },
  { query: 'What does ICH E3 say about clinical study reports?', context: 'ICH' },

  // Clinical Evaluation Reports
  { query: 'What should be included in a Clinical Evaluation Report?', context: 'CER' },
  { query: 'How do I structure a literature review for a CER?', context: 'CER' },
  {
    query: "What's the difference between EU MDR and MEDDEV 2.7/1 Rev 4 for CERs?",
    context: 'CER',
  },

  // Cross-jurisdictional
  { query: 'Compare FDA, EU MDR, and PMDA device classifications', context: 'global' },
  { query: 'How do post-market surveillance requirements differ globally?', context: 'global' },
];

/**
 * Test the Regulatory AI endpoint
 */
async function testRegulatoryAI() {
  logger.info('Starting Regulatory AI Test...\n');

  const results = {
    successful: 0,
    failed: 0,
    responses: [],
  };

  const baseUrl = 'http://localhost:5000'; // Adjust as needed

  for (const [index, testCase] of testQueries.entries()) {
    try {
      logger.info(
        `Testing query ${index + 1}/${testQueries.length}: "${testCase.query}" (${testCase.context})`
      );

      const response = await axios.post(`${baseUrl}/api/regulatory-ai/query`, {
        query: testCase.query,
        context: testCase.context,
      });

      if (response.data && response.data.response) {
        logger.info('✅ Success');
        logger.info(`Response: ${response.data.response.substring(0, 100)}...\n`);

        results.successful++;
        results.responses.push({
          query: testCase.query,
          context: testCase.context,
          response: response.data.response,
          success: true,
        });
      } else {
        logger.info('❌ Failed: Received empty response');
        results.failed++;
        results.responses.push({
          query: testCase.query,
          context: testCase.context,
          error: 'Empty response',
          success: false,
        });
      }
    } catch (error) {
      logger.info(`❌ Failed: ${error.message}`);
      results.failed++;
      results.responses.push({
        query: testCase.query,
        context: testCase.context,
        error: error.message,
        success: false,
      });
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Save results
  const resultsPath = path.join(__dirname, '../data/regulatory_ai_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  logger.info('\nTest Summary:');
  logger.info(`Total Queries: ${testQueries.length}`);
  logger.info(`Successful: ${results.successful}`);
  logger.info(`Failed: ${results.failed}`);
  logger.info(`Success Rate: ${((results.successful / testQueries.length) * 100).toFixed(2)}%`);
  logger.info(`Results saved to: ${resultsPath}`);
}

// Execute if run directly
if (require.main === module) {
  testRegulatoryAI();
}

module.exports = {
  testRegulatoryAI,
  testQueries,
};
