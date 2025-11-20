import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const HF_API_KEY = process.env.HF_API_KEY;
// Try a smaller model with better availability on free tier
const HF_MODEL_URL = 'https://api-inference.huggingface.co/models/google/flan-t5-small';

/**
 * Query the Hugging Face Inference API directly
 */
async function queryHuggingFace(prompt, max_new_tokens = 250, temperature = 0.5) {
  const headers = {
    Authorization: `Bearer ${HF_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    inputs: prompt,
    parameters: {
      max_new_tokens,
      temperature,
    },
  };

  try {
    console.log('Sending request to Hugging Face API...');
    console.log('API URL:', HF_MODEL_URL);
    console.log('API Key provided:', !!HF_API_KEY);

    const response = await axios.post(HF_MODEL_URL, payload, { headers });
    return response.data[0]?.generated_text || '[No response]';
  } catch (error) {
    console.error('Hugging Face API error:', error.message);
    if (error.response) {
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
    }
    return `[Error: ${error.message}]`;
  }
}

// Test the Hugging Face API
async function testHuggingFaceAPI() {
  const testPrompt = `
  You are an AI assistant specialized in clinical trials. 
  
  Please give a brief overview of what a Clinical Study Report (CSR) is and why it's important.
  `;

  console.log('Testing Hugging Face API with a sample prompt...');
  const result = await queryHuggingFace(testPrompt);
  console.log('\nResponse from Hugging Face:');
  console.log('---------------------------');
  console.log(result);
}

// Run the test
testHuggingFaceAPI();
