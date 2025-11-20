/**
 * CER Data Integration Test Script
 *
 * This script tests the CER integration by querying the data ingestion endpoints
 * and generating a sample CER report.
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base URL for the FDA ingestion API
const API_BASE_URL = 'http://localhost:5000/api/ingest';

// Output directory for test results
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'test_output');

// Create output directory if it doesn't exist
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error(`Error creating output directory: ${error.message}`);
  }
}

// Test common drug names
const COMMON_DRUGS = [
  { name: 'insulin', type: 'drug' },
  { name: 'acetaminophen', type: 'drug' },
  { name: 'lisinopril', type: 'drug' },
  { name: 'metformin', type: 'drug' },
  { name: 'atorvastatin', type: 'drug' },
];

// Test common device types
const COMMON_DEVICES = [
  { name: 'pacemaker', type: 'device' },
  { name: 'infusion pump', type: 'device' },
  { name: 'glucose monitor', type: 'device' },
  { name: 'ventilator', type: 'device' },
  { name: 'catheter', type: 'device' },
];

/**
 * Fetch data from the FDA ingestion API
 */
async function fetchData(type, identifier) {
  try {
    const url = `${API_BASE_URL}/${type}/${encodeURIComponent(identifier)}`;
    console.log(`Fetching data from ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${type} data for ${identifier}: ${error.message}`);
    return null;
  }
}

/**
 * Run the test for a given product
 */
async function testProduct(product) {
  console.log(`\n====== Testing ${product.name} (${product.type}) ======`);

  // Fetch data from the appropriate endpoint
  const data = await fetchData(product.type, product.name);

  if (!data) {
    console.log(`No data found for ${product.name}`);
    return;
  }

  // Log data summary
  if (product.type === 'drug') {
    const resultCount = data.count || 0;
    console.log(`Found ${resultCount} FAERS records for ${product.name}`);
  } else if (product.type === 'device') {
    const resultCount = data.count || 0;
    console.log(`Found ${resultCount} MAUDE complaints for ${product.name}`);
  }

  // Save the data to a JSON file
  try {
    const filename = `${product.type}_${product.name.replace(/\s+/g, '_')}.json`;
    const filePath = path.join(OUTPUT_DIR, filename);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving data: ${error.message}`);
  }
}

/**
 * Main function to run all tests
 */
async function main() {
  console.log('Starting CER Data Integration Tests');

  // Ensure output directory exists
  await ensureOutputDir();

  // Test common drugs
  console.log('\n=== Testing Drug Products ===');
  for (const drug of COMMON_DRUGS) {
    await testProduct(drug);
  }

  // Test common devices
  console.log('\n=== Testing Device Products ===');
  for (const device of COMMON_DEVICES) {
    await testProduct(device);
  }

  console.log('\nAll tests completed');
}

// Run the main function
main().catch(error => {
  console.error(`Error in main execution: ${error.message}`);
});
