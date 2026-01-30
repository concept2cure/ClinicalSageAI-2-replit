/**
 * Direct test of Hugging Face Embeddings API
 */
import axios from 'axios';

const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_API_KEY = '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';
const MODEL_ID = 'BAAI/bge-large-en-v1.5';

async function testEmbeddings() {
  logger.info('Testing Hugging Face Embeddings API...');
  logger.info(`API URL: ${HF_API_URL}`);
  logger.info(
    `API Key: ${HF_API_KEY ? 'Configured (first 4 chars: ' + HF_API_KEY.substring(0, 4) + ')' : 'Not configured'}`
  );
  logger.info(`Model ID: ${MODEL_ID}`);

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

    logger.info('API Call Successful!');
    logger.info('Response type:', typeof response.data);

    if (Array.isArray(response.data)) {
      logger.info('Response is an array of length:', response.data.length);
      logger.info('First 5 values:', response.data.slice(0, 5));
    } else {
      logger.info('Response data:', response.data);
    }

    return response.data;
  } catch (error) {
    logger.error('Error calling Hugging Face API:');
    logger.error(`Status: ${error.response?.status || 'Unknown'}`);
    logger.error(`Message: ${error.message}`);

    if (error.response && error.response.data) {
      logger.error('Response data:', error.response.data);
    }

    throw error;
  }
}

// Execute the test
testEmbeddings()
  .then(() => logger.info('Test completed successfully'))
  .catch(() => logger.info('Test failed'));
