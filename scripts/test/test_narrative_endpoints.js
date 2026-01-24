/**
 * Test Script for CER Narrative Endpoints
 *
 * This script tests the narrative generation endpoints directly,
 * validating the JSON structure and basic functionality.
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'data', 'test_output');

// Base URL for API - use the direct FastAPI port to bypass Express
const API_BASE_URL = 'http://localhost:3500';

// Create output directory if it doesn't exist
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error(`Error creating output directory: ${error.message}`);
  }
}

// Test FDA FAERS ingestion endpoint (faster than narrative)
async function testFaersIngestion(identifier, limit = 1) {
  try {
    console.log(`\nTesting FAERS ingestion for: ${identifier}`);
    const url = `${API_BASE_URL}/api/ingest/drug/${encodeURIComponent(identifier)}?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const recordCount = data.raw_data?.results?.length || 0;

    console.log(`Retrieved ${recordCount} record(s) for ${identifier}`);
    console.log(`Total available records: ${data.raw_data?.meta?.results?.total || 0}`);

    return data;
  } catch (error) {
    console.error(`Error testing ingestion for ${identifier}: ${error.message}`);
    return null;
  }
}

// Test FDA FAERS normalization endpoint (medium speed)
async function testFaersNormalization(identifier, limit = 1) {
  try {
    console.log(`\nTesting FAERS normalization for: ${identifier}`);
    const url = `${API_BASE_URL}/api/norm/drug/${encodeURIComponent(identifier)}?limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const recordCount = data.records?.length || 0;

    console.log(`Normalized ${recordCount} record(s) for ${identifier}`);

    return data;
  } catch (error) {
    console.error(`Error testing normalization for ${identifier}: ${error.message}`);
    return null;
  }
}

// Test FDA FAERS narrative endpoint
async function testNarrativeGeneration(identifier, periods = 1) {
  try {
    console.log(`\nTesting narrative generation for: ${identifier} (periods: ${periods})`);
    const url = `${API_BASE_URL}/api/narrative/faers/${encodeURIComponent(identifier)}?periods=${periods}`;

    // Set a longer timeout for narrative generation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      console.log(`Generated narrative with ${data.analysis?.total_count || 0} records`);
      console.log(`Narrative length: ${data.narrative?.length || 0} characters`);

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timed out after 30 seconds');
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error testing narrative for ${identifier}: ${error.message}`);
    return null;
  }
}

// Save test results to file
async function saveTestResult(data, filename) {
  if (!data) return;

  try {
    const filePath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Result saved to ${filePath}`);
  } catch (error) {
    console.error(`Error saving result: ${error.message}`);
  }
}

// Run all tests for a given identifier
async function runTests(identifier) {
  console.log(`\n==== Running tests for ${identifier} ====`);

  // Test ingestion (fastest)
  const ingestionData = await testFaersIngestion(identifier);
  if (ingestionData) {
    await saveTestResult(ingestionData, `ingestion_${identifier.replace(/[^a-z0-9]/gi, '_')}.json`);
  }

  // Test normalization (medium)
  const normData = await testFaersNormalization(identifier);
  if (normData) {
    await saveTestResult(normData, `norm_${identifier.replace(/[^a-z0-9]/gi, '_')}.json`);
  }

  // Test narrative generation (slowest)
  const narrativeData = await testNarrativeGeneration(identifier, 1);
  if (narrativeData) {
    await saveTestResult(narrativeData, `narrative_${identifier.replace(/[^a-z0-9]/gi, '_')}.json`);
  }
}

// Main function
async function main() {
  console.log('Starting CER Narrative API Tests');

  // Ensure output directory exists
  await ensureOutputDir();

  // Test with common drug identifiers
  const testCases = [
    '00093-7146', // metformin
    'metformin', // generic name
    '00002-3227', // fluoxetine
    'acetaminophen', // common OTC drug
  ];

  for (const identifier of testCases) {
    await runTests(identifier);
  }

  console.log('\nAll tests completed');
}

// Run the main function
main().catch(error => {
  console.error(`Error in main execution: ${error.message}`);
});
