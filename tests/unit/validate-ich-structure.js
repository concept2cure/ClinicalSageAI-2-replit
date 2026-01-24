import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { validateZip } from '../server/utils/validateZip.js';

/**
 * Creates a valid sample ZIP containing the required ICH eCTD structure
 */
async function createValidSampleZip() {
  try {
    const zip = new JSZip();

    // Create the required directories and files
    const m1 = zip.folder('M1');
    const m2 = zip.folder('M2');
    const m3 = zip.folder('M3');
    const m4 = zip.folder('M4');
    const m5 = zip.folder('M5');

    // Add required files to Module 1
    m1.file('cover-letter.pdf', 'Test cover letter content');
    m1.file('application-form.pdf', 'Test application form content');

    // Add required files to Module 2
    m2.file('ctd-toc.pdf', 'Test CTD TOC content');

    // Generate the ZIP file
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    // Convert to base64 for validation
    const base64Content = content.toString('base64');

    // Save for testing purposes
    fs.writeFileSync(path.join(__dirname, 'valid-ectd-sample.zip'), content);

    return base64Content;
  } catch (err) {
    console.error('Error creating valid sample ZIP:', err);
    throw err;
  }
}

/**
 * Creates an invalid sample ZIP missing required files
 */
async function createInvalidSampleZip() {
  try {
    const zip = new JSZip();

    // Create incomplete directory structure
    const m1 = zip.folder('M1');
    const m2 = zip.folder('M2');

    // Add only one required file, missing the other required files
    m1.file('cover-letter.pdf', 'Test cover letter content');

    // Generate the ZIP file
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    // Convert to base64 for validation
    const base64Content = content.toString('base64');

    // Save for testing purposes
    fs.writeFileSync(path.join(__dirname, 'invalid-ectd-sample.zip'), content);

    return base64Content;
  } catch (err) {
    console.error('Error creating invalid sample ZIP:', err);
    throw err;
  }
}

/**
 * Test the validation utility directly
 */
async function testValidationUtility() {
  console.log('Testing the validateZip utility function...');

  // Test with valid ZIP
  const validZipBase64 = await createValidSampleZip();
  const validResult = await validateZip(validZipBase64);
  console.log('Valid ZIP validation result:', validResult);

  // Test with invalid ZIP
  const invalidZipBase64 = await createInvalidSampleZip();
  const invalidResult = await validateZip(invalidZipBase64);
  console.log('Invalid ZIP validation result:', invalidResult);

  return { validResult, invalidResult };
}

/**
 * Main test function
 */
async function runTests() {
  console.log('Starting ICH eCTD Structure Validation Tests...');

  try {
    // Test the validation utility
    const { validResult, invalidResult } = await testValidationUtility();

    console.log('\nSummary:');
    console.log('1. Valid ZIP Structure Test:', validResult.valid ? 'PASSED ✓' : 'FAILED ✗');
    console.log('2. Invalid ZIP Structure Test:', !invalidResult.valid ? 'PASSED ✓' : 'FAILED ✗');

    console.log('\nICH eCTD Validation Tests Completed.');
  } catch (err) {
    console.error('Error running tests:', err);
  }
}

// Run the tests when executed directly
runTests();

export { createValidSampleZip, createInvalidSampleZip, testValidationUtility, runTests };
