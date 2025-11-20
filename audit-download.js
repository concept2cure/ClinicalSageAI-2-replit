import fetch from 'node-fetch';
import fs from 'fs';

const TEST_FILE_ID = 'file-m1-2'; // Application Form.pdf
const OUTPUT_PATH = './download-test.pdf';

async function testDownload() {
  console.log(`Testing download for file ID: ${TEST_FILE_ID}`);

  try {
    const response = await fetch(`http://localhost:5000/api/vault/files/${TEST_FILE_ID}/download`);

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log(`Content-Disposition: ${response.headers.get('content-disposition')}`);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    fs.writeFileSync(OUTPUT_PATH, buffer);

    console.log(`Successfully saved file to: ${OUTPUT_PATH}`);
    console.log(`File size: ${buffer.length} bytes`);

    return {
      success: true,
      fileId: TEST_FILE_ID,
      status: response.status,
      contentType: response.headers.get('content-type'),
      fileSize: buffer.length,
    };
  } catch (error) {
    console.error('Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Run the test
testDownload().then(result => {
  console.log('\n--- AUDIT RESULTS ---');
  if (result.success) {
    console.log('✅ PASSED: File download successful');
    console.log(`File: ${TEST_FILE_ID}`);
    console.log(`HTTP Status: ${result.status}`);
    console.log(`Content Type: ${result.contentType}`);
    console.log(`File Size: ${result.fileSize} bytes`);
    console.log(`Saved to: ${OUTPUT_PATH}`);
  } else {
    console.log('❌ FAILED: File download unsuccessful');
    console.log(`Error: ${result.error}`);
  }
});
