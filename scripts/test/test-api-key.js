/**
 * Direct test of Hugging Face API key
 */

import axios from 'axios';

// Use the API key directly
const API_KEY = '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';
const MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

async function testDirectly() {
  try {
    logger.info('Testing with direct API key...');

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${MODEL}`,
      {
        inputs: 'Hello, tell me about clinical trials',
        parameters: {
          max_new_tokens: 50,
          return_full_text: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Success! Response:');
    logger.info(JSON.stringify(response.data, null, 2));
  } catch (error) {
    logger.error('Error:', error.message);
    if (error.response) {
      logger.error('Status:', error.response.status);
      logger.error('Data:', error.response.data);
    }
  }
}

testDirectly();
