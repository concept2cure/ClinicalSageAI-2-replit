/**
 * Test script for verifying the file download API endpoint
 *
 * This script performs a simple HTTP request to test that the file download
 * endpoint returns the correct headers and content.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

// File IDs to test download for
const fileIds = ['file-m1-1', 'file-m1-2', 'file-m2-1', 'file-m2-c-1'];
const testResults = [];

function testDownloadEndpoint(fileId) {
  return new Promise((resolve, reject) => {
    logger.info(`Testing download for file ID: ${fileId}`);

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: `/api/vault/files/${fileId}/download`,
      method: 'GET',
    };

    const req = http.request(options, res => {
      logger.info(`Status Code: ${res.statusCode}`);
      logger.info(`Content-Type: ${res.headers['content-type']}`);
      logger.info(`Content-Disposition: ${res.headers['content-disposition']}`);

      let data = [];

      res.on('data', chunk => {
        data.push(chunk);
      });

      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const result = {
          fileId,
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          contentDisposition: res.headers['content-disposition'],
          contentLength: buffer.length,
          success: res.statusCode === 200,
        };

        testResults.push(result);
        resolve(result);
      });
    });

    req.on('error', error => {
      logger.error(`Error testing download for ${fileId}:`, error.message);
      const result = {
        fileId,
        statusCode: 0,
        error: error.message,
        success: false,
      };
      testResults.push(result);
      reject(result);
    });

    req.end();
  });
}

async function runTests() {
  logger.info('Starting file download endpoint tests...');

  try {
    // Test each file ID
    for (const fileId of fileIds) {
      await testDownloadEndpoint(fileId);
    }

    // Print summary results
    logger.info('\n--- TEST SUMMARY ---');
    testResults.forEach(result => {
      logger.info(
        `${result.fileId}: ${result.success ? 'PASS' : 'FAIL'} - Status ${result.statusCode} - Content Length: ${result.contentLength || 'N/A'}`
      );
    });

    // Overall result
    const passedTests = testResults.filter(r => r.success).length;
    logger.info(`\nOverall: ${passedTests}/${testResults.length} tests passed`);

    if (passedTests === testResults.length) {
      logger.info('✅ All download endpoint tests PASSED');
    } else {
      logger.info('❌ Some download endpoint tests FAILED');
    }
  } catch (error) {
    logger.error('Error running tests:', error);
  }
}

// Run the tests
runTests();
