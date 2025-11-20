/**
 * Direct test of Hugging Face Embeddings API
 */
import axios from 'axios';

const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_API_KEY = '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';
const MODEL_ID = 'BAAI/bge-large-en-v1.5';

async function testEmbeddings() {
  console.log('Testing Hugging Face Embeddings API...');
  console.log(`API URL: ${HF_API_URL}`);
  console.log(
    `API Key: ${HF_API_KEY ? 'Configured (first 4 chars: ' + HF_API_KEY.substring(0, 4) + ')' : 'Not configured'}`
  );
  console.log(`Model ID: ${MODEL_ID}`);

  try {
    const response = await axios.post(
      `${HF_API_URL}/${encodeURIComponent(MODEL_ID)}`,
      { inputs: 'This is a test of the embeddings API for clinical trials.' },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('API Call Successful!');
    console.log('Response type:', typeof response.data);

    if (Array.isArray(response.data)) {
      console.log('Response is an array of length:', response.data.length);
      console.log('First 5 values:', response.data.slice(0, 5));
    } else {
      console.log('Response data:', response.data);
    }

    return response.data;
  } catch (error) {
    console.error('Error calling Hugging Face API:');
    console.error(`Status: ${error.response?.status || 'Unknown'}`);
    console.error(`Message: ${error.message}`);

    if (error.response && error.response.data) {
      console.error('Response data:', error.response.data);
    }

    throw error;
  }
}

// Execute the test
testEmbeddings()
  .then(() => console.log('Test completed successfully'))
  .catch(() => console.log('Test failed'));
