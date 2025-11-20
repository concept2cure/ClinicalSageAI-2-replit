/**
 * Test Script for the Clinical Evaluation Report Generator
 * 
 * This script tests the complete CER generation workflow from data collection
 * through report generation.
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the main test function
async function main() {
  try {
    // Import data integration dynamically
    const dataIntegrationModule = await import('./server/data_integration.js');
    const dataIntegration = dataIntegrationModule;

// Create test directories if they don't exist
const EXPORT_DIR = path.join(process.cwd(), 'data', 'exports');
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');

[EXPORT_DIR, CACHE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Run a test of the CER generator
 */
async function runTest() {
  console.log('Starting CER generator test...');
  
  try {
    // Test parameters
    const testParams = {
      productId: 'TEST-DEVICE-001',
      productName: 'Test Medical Device',
      manufacturer: 'Test Manufacturer Inc.',
      isDevice: true,
      isDrug: false,
      dateRangeDays: 365
    };
    
    // Step 1: Test data integration
    console.log('\n1. Testing data integration...');
    const integratedData = await dataIntegration.gatherIntegratedData(testParams);
    
    console.log(`Data integration gathered ${integratedData.sources.length} data sources:`);
    console.log(`- Sources: ${integratedData.sources.join(', ')}`);
    
    if (integratedData.integratedData.summary) {
      const summary = integratedData.integratedData.summary;
      console.log(`- Total events: ${summary.totalEvents}`);
      console.log(`- Serious events: ${summary.seriousEvents}`);
      console.log(`- Top events: ${summary.topEvents.length}`);
    }
    
    // Save the integrated data to a temporary file for inspection
    const tempDataFile = path.join(CACHE_DIR, 'cer_test_data.json');
    fs.writeFileSync(tempDataFile, JSON.stringify(integratedData, null, 2));
    console.log(`Integrated data saved to ${tempDataFile}`);
    
    // Step 2: Test CER generation using run_cer_generator.py
    console.log('\n2. Testing CER generation...');
    
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
      `--days ${testParams.dateRangeDays}`,
      `--format pdf`
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
    
    console.log('\nCER generator test completed');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest().catch(console.error);