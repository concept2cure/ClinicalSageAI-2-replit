/**
 * Test script to check if the HF_API_KEY has the correct format
 */

// Load environment variables
import 'dotenv/config';

const hfApiKey = process.env.HF_API_KEY;

console.log('HF_API_KEY exists:', !!hfApiKey);

// Check if it starts with "hf_" (correct format)
if (hfApiKey) {
  const isCorrectFormat = hfApiKey.startsWith('hf_');
  console.log('Starts with "hf_":', isCorrectFormat);

  // If incorrect format, check if it starts with "https"
  if (!isCorrectFormat) {
    const startsWithHttps = hfApiKey.startsWith('https');
    console.log('Starts with "https":', startsWithHttps);

    // Provide format information (without revealing the key)
    console.log('First 5 characters:', hfApiKey.substring(0, 5));
    console.log('Key length:', hfApiKey.length);
  }
}
