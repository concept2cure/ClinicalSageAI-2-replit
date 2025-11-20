/**
 * Test script for Hugging Face API connection
 *
 * This script tests connectivity to the Hugging Face API
 * and helps diagnose authentication issues
 */

import axios from 'axios';
import fs from 'fs';

// Hugging Face API configuration
const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_API_KEY = process.env.HF_API_KEY;

// Test model
const TEST_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

/**
 * Main function to test API connectivity
 */
async function testHuggingFaceAPI() {
  console.log('\n=== Hugging Face API Connection Test ===\n');

  // 1. Check for API key
  console.log('Checking API key...');
  if (!HF_API_KEY) {
    console.error('❌ Error: HF_API_KEY environment variable is not set');
    console.log('Please ensure that the HF_API_KEY environment variable is set correctly.');
    return;
  }

  if (HF_API_KEY.length < 20) {
    console.warn('⚠️ Warning: HF_API_KEY appears to be too short (less than 20 characters)');
    console.log('A typical Hugging Face API key is a long string. Please verify your key.');
  }

  console.log(`✓ API key found (length: ${HF_API_KEY.length} characters)`);

  // Mask the key for display
  const maskedKey =
    HF_API_KEY.substring(0, 4) + '...' + HF_API_KEY.substring(HF_API_KEY.length - 4);
  console.log(`Key prefix/suffix: ${maskedKey}`);

  // 2. Test models endpoint
  console.log('\nTesting models endpoint...');
  try {
    console.log(`Sending request to ${HF_API_URL}/${TEST_MODEL}`);

    const response = await axios.post(
      `${HF_API_URL}/${encodeURIComponent(TEST_MODEL)}`,
      {
        inputs: 'Hello, can you hear me?',
        parameters: {
          max_new_tokens: 20,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✓ Successfully connected to Hugging Face API`);
    console.log('Status code:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error connecting to Hugging Face API');

    if (error.response) {
      console.error('Status code:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('Response data:', error.response.data);

      if (error.response.status === 401) {
        console.error('\n⚠️ Authentication failed (401 Unauthorized)');
        console.error('This usually means your API key is invalid or expired.');
        console.error(
          'Please check your API key and ensure it is active on your Hugging Face account.'
        );
      }

      if (error.response.status === 403) {
        console.error('\n⚠️ Authorization failed (403 Forbidden)');
        console.error(
          'This usually means your API key does not have permission to access this model.'
        );
        console.error('Please ensure you have access to the model and have the correct API key.');
      }
    } else {
      console.error('Error message:', error.message);
    }
  }

  console.log('\n=== Test Completed ===\n');
}

// Run the test
testHuggingFaceAPI();
