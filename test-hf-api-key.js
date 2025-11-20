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
  console.log('Testing Hugging Face API key...');

  // Basic validation check
  if (!HF_API_KEY) {
    console.error('❌ HF_API_KEY environment variable is not set');
    return false;
  }

  if (!HF_API_KEY.startsWith('hf_')) {
    console.error('❌ HF_API_KEY is incorrectly formatted. It should start with "hf_"');
    console.error(`   Current format: ${HF_API_KEY.substring(0, 4)}...`);
    return false;
  }

  console.log('✅ HF_API_KEY basic format check passed (starts with "hf_")');

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
      console.log('✅ Successfully connected to Hugging Face API');
      console.log('✅ API key is valid and working');

      // Check what was returned
      console.log('\nAPI Response:');
      console.log(JSON.stringify(response.data, null, 2));

      return true;
    } else {
      console.error(`❌ API call returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error testing Hugging Face API:');

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${JSON.stringify(error.response.data)}`);

      if (error.response.status === 401) {
        console.error('   The API key appears to be invalid or unauthorized');
      }
    } else if (error.request) {
      console.error('   No response received from Hugging Face API');
    } else {
      console.error(`   Error message: ${error.message}`);
    }

    return false;
  }
}

// Run the test
testHuggingFaceApiKey().then(success => {
  if (success) {
    console.log('\n🎉 All tests passed! Hugging Face API key is correctly configured.');
  } else {
    console.error('\n❌ Test failed. Please check the error messages above.');
  }
});
