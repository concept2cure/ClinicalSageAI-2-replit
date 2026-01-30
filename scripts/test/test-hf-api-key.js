/**
 * Hugging Face API Key Validation Test
 *
 * This script tests if the HF_API_KEY environment variable is correctly formatted
 * and working by making a simple API call to Hugging Face.
 */

import axios from 'axios';

const HF_API_KEY = process.env.HF_API_KEY;
const TEST_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'; // Simple embedding model for testing

async function testHuggingFaceApiKey() {
  logger.info('Testing Hugging Face API key...');

  // Basic validation check
  if (!HF_API_KEY) {
    logger.error('❌ HF_API_KEY environment variable is not set');
    return false;
  }

  if (!HF_API_KEY.startsWith('hf_')) {
    logger.error('❌ HF_API_KEY is incorrectly formatted. It should start with "hf_"');
    logger.error(`   Current format: ${HF_API_KEY.substring(0, 4)}...`);
    return false;
  }

  logger.info('✅ HF_API_KEY basic format check passed (starts with "hf_")');

  // Test API call
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${TEST_MODEL}`,
      { inputs: 'Hello, world!' },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 200) {
      logger.info('✅ Successfully connected to Hugging Face API');
      logger.info('✅ API key is valid and working');

      // Check what was returned
      logger.info('\nAPI Response:');
      logger.info(JSON.stringify(response.data, null, 2));

      return true;
    } else {
      logger.error(`❌ API call returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('❌ Error testing Hugging Face API:');

    if (error.response) {
      logger.error(`   Status: ${error.response.status}`);
      logger.error(`   Message: ${JSON.stringify(error.response.data)}`);

      if (error.response.status === 401) {
        logger.error('   The API key appears to be invalid or unauthorized');
      }
    } else if (error.request) {
      logger.error('   No response received from Hugging Face API');
    } else {
      logger.error(`   Error message: ${error.message}`);
    }

    return false;
  }
}

// Run the test
testHuggingFaceApiKey().then(success => {
  if (success) {
    logger.info('\n🎉 All tests passed! Hugging Face API key is correctly configured.');
  } else {
    logger.error('\n❌ Test failed. Please check the error messages above.');
  }
});
