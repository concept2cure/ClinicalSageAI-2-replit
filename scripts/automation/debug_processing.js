/**
 * Debug Script - Check Processing Response Details
 */

import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';

async function debugProcessing() {
  const form = new FormData();
  form.append('file', fs.createReadStream('data/raw_documents/SOP_Clinical_Monitoring_V2.txt'));
  form.append('module', 'test');
  form.append('context', 'debug');

  try {
    const response = await axios.post(
      'http://localhost:5000/api/unified/document-ingestion',
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
      }
    );

    logger.info('🔍 FULL RESPONSE:');
    logger.info(JSON.stringify(response.data, null, 2));
  } catch (error) {
    logger.error('❌ Error:', error.response?.data || error.message);
  }
}

debugProcessing();
