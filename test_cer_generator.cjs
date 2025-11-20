/**
 * Test Script for the Clinical Evaluation Report Generator
 *
 * This script tests the complete CER generation workflow from data collection
 * through report generation.
 *
 * Note: This is a CommonJS version (.cjs) for easier testing without dealing with ES module issues.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Create test directories if they don't exist
const EXPORT_DIR = path.join(process.cwd(), 'data', 'exports');
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');

[EXPORT_DIR, CACHE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Test CER generation using run_cer_generator.py
 */
function testCerGenerator() {
  console.log('\nTesting CER generation...');

  // Set up test parameters
  const testParams = {
    productId: 'TEST-DEVICE-001',
    productName: 'Test Medical Device',
    manufacturer: 'Test Manufacturer Inc.',
  };

  // Build command to run the Python script
  const scriptPath = path.join(process.cwd(), 'server', 'run_cer_generator.py');

  // Set up test parameters
  const args = [
    `--id "${testParams.productId}"`,
    `--name "${testParams.productName}"`,
    `--manufacturer "${testParams.manufacturer}"`,
    `--description "Test device for CER generation"`,
    `--purpose "For testing purposes only"`,
    `--class "Class II"`,
    `--days 365`,
    `--format pdf`,
  ];

  // Construct and execute the command
  const command = `python3 "${scriptPath}" ${args.join(' ')}`;
  console.log(`Executing command: ${command}`);

  try {
    const output = execSync(command, { encoding: 'utf8' });
    console.log('CER Generator Output:');
    console.log(output);

    // Extract the output file path
    const outputFilePath = output.match(/Output file: (.+)/)?.[1]?.trim();

    if (outputFilePath && fs.existsSync(outputFilePath)) {
      const stats = fs.statSync(outputFilePath);
      console.log(`Generated CER file: ${outputFilePath} (${(stats.size / 1024).toFixed(2)} KB)`);
      console.log('CER generation test passed!');
    } else {
      console.error('CER generation test failed: Output file not found');
    }
  } catch (error) {
    console.error('Error executing CER generator:');
    console.error(error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
  }
}

// Run the test
console.log('Starting CER generator test...');
testCerGenerator();
console.log('\nCER generator test completed');
