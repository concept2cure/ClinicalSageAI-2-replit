const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const OUTPUT_ZIP_PATH = './ectd_submission_test.zip';
const EXTRACT_PATH = './ectd_submission_extract';

// List of file IDs to test batch compilation
const TEST_FILE_IDS = ['file-m1-1', 'file-m1-2', 'file-m2-1'];

async function testBatchCompilation() {
  console.log(`Testing batch compilation with ${TEST_FILE_IDS.length} files...`);
  console.log(`File IDs: ${TEST_FILE_IDS.join(', ')}`);

  try {
    // Delete existing files
    if (fs.existsSync(OUTPUT_ZIP_PATH)) {
      fs.unlinkSync(OUTPUT_ZIP_PATH);
      console.log(`Deleted existing test file: ${OUTPUT_ZIP_PATH}`);
    }

    if (fs.existsSync(EXTRACT_PATH)) {
      fs.rmSync(EXTRACT_PATH, { recursive: true, force: true });
      console.log(`Deleted existing extract directory: ${EXTRACT_PATH}`);
    }

    // Make API request to compile endpoint
    console.log('Requesting batch compilation from API...');
    const response = await fetch('http://localhost:5000/api/vault/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: TEST_FILE_IDS }),
    });

    console.log(`API Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to compile batch: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    // Save the ZIP file
    const buffer = await response.buffer();
    fs.writeFileSync(OUTPUT_ZIP_PATH, buffer);
    console.log(`Successfully saved ZIP file to: ${OUTPUT_ZIP_PATH}`);
    console.log(`ZIP file size: ${buffer.length} bytes`);

    // Create extract directory
    fs.mkdirSync(EXTRACT_PATH, { recursive: true });

    // Extract and analyze the ZIP contents
    console.log('\nExtracting and analyzing ZIP contents...');
    const zip = new AdmZip(OUTPUT_ZIP_PATH);
    zip.extractAllTo(EXTRACT_PATH, true);

    // Get list of files in the ZIP
    const zipEntries = zip.getEntries();
    console.log(`\nZIP contains ${zipEntries.length} entries:`);

    zipEntries.forEach(entry => {
      console.log(` - ${entry.entryName} (${entry.header.size} bytes)`);
    });

    // Check for expected files
    const expectedFileNames = [
      'Cover Letter.docx',
      'Application Form.pdf',
      'CTD Table of Contents.docx',
      'submission_manifest.txt',
      // Check for eCTD structure folders
      'm1/.keep',
      'm2/.keep',
      'm3/.keep',
      'm4/.keep',
      'm5/.keep',
    ];

    console.log('\nVerifying expected files:');
    let allFilesFound = true;
    for (const fileName of expectedFileNames) {
      const found = zipEntries.some(entry => entry.entryName === fileName);
      console.log(` - ${fileName}: ${found ? '✅ Found' : '❌ Missing'}`);
      if (!found) allFilesFound = false;
    }

    // Check contents of manifest file
    const manifestEntry = zipEntries.find(entry => entry.entryName === 'submission_manifest.txt');
    if (manifestEntry) {
      const manifestContent = manifestEntry.getData().toString('utf8');
      console.log('\nSubmission Manifest Content:');
      console.log('-----------------------------------');
      console.log(manifestContent);
      console.log('-----------------------------------');
    }

    return {
      success: response.ok && allFilesFound,
      fileCount: zipEntries.length,
      expectedFileCount: expectedFileNames.length,
      allFilesFound,
    };
  } catch (error) {
    console.error('Error during batch compilation test:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Install adm-zip if not available
if (!fs.existsSync(path.join(process.cwd(), 'node_modules', 'adm-zip'))) {
  console.log('Installing adm-zip for ZIP file analysis...');
  require('child_process').execSync('npm install adm-zip');
}

// Run the test
testBatchCompilation().then(result => {
  console.log('\n===== AUDIT RESULTS =====');
  if (result.success) {
    console.log('✅ PASSED: Batch compilation test successful');
    console.log(`Files in ZIP: ${result.fileCount}`);
    console.log(`Expected files found: ${result.allFilesFound ? 'All' : 'Some missing'}`);
    console.log(`ZIP file saved to: ${OUTPUT_ZIP_PATH}`);
    console.log(`Extracted contents in: ${EXTRACT_PATH}`);
  } else {
    console.log('❌ FAILED: Batch compilation test unsuccessful');
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
});
