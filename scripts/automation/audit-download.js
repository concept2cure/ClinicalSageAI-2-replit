import fetch from 'node-fetch';
import fs from 'fs';

const TEST_FILE_ID = 'file-m1-2'; // Application Form.pdf
const OUTPUT_PATH = './download-test.pdf';

async function testDownload() {
  logger.info(`Testing download for file ID: ${TEST_FILE_ID}`);

  try {
    const response = await fetch(`http://localhost:5000/api/vault/files/${TEST_FILE_ID}/download`);

    logger.info(`Status: ${response.status} ${response.statusText}`);
    logger.info(`Content-Type: ${response.headers.get('content-type')}`);
    logger.info(`Content-Disposition: ${response.headers.get('content-disposition')}`);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    fs.writeFileSync(OUTPUT_PATH, buffer);

    logger.info(`Successfully saved file to: ${OUTPUT_PATH}`);
    logger.info(`File size: ${buffer.length} bytes`);

    return {
      success: true,
      fileId: TEST_FILE_ID,
      status: response.status,
      contentType: response.headers.get('content-type'),
      fileSize: buffer.length,
    };
  } catch (error) {
    logger.error('Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the test
testDownload().then(result => {
  logger.info('\n--- AUDIT RESULTS ---');
  if (result.success) {
    logger.info('✅ PASSED: File download successful');
    logger.info(`File: ${TEST_FILE_ID}`);
    logger.info(`HTTP Status: ${result.status}`);
    logger.info(`Content Type: ${result.contentType}`);
    logger.info(`File Size: ${result.fileSize} bytes`);
    logger.info(`Saved to: ${OUTPUT_PATH}`);
  } else {
    logger.info('❌ FAILED: File download unsuccessful');
    logger.info(`Error: ${result.error}`);
  }
});
