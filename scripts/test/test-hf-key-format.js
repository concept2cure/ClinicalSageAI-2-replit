/**
 * Test script to check if the HF_API_KEY has the correct format
 */

// Load environment variables
import 'dotenv/config';

const hfApiKey = process.env.HF_API_KEY;

logger.info('HF_API_KEY exists:', !!hfApiKey);

// Check if it starts with "hf_" (correct format)
if (hfApiKey) {
  const isCorrectFormat = hfApiKey.startsWith('hf_');
  logger.info('Starts with "hf_":', isCorrectFormat);

  // If incorrect format, check if it starts with "https"
  if (!isCorrectFormat) {
    const startsWithHttps = hfApiKey.startsWith('https');
    logger.info('Starts with "https":', startsWithHttps);

    // Provide format information (without revealing the key)
    logger.info('First 5 characters:', hfApiKey.substring(0, 5));
    logger.info('Key length:', hfApiKey.length);
  }
}
