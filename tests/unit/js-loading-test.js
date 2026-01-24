/**
 * JavaScript Loading Smoke Test
 *
 * This script provides a command-line test to verify that JavaScript files are being served correctly
 * by the server and not returning HTML content. This helps prevent the "Unexpected token '<'" errors
 * that occur when JS files are incorrectly served with HTML content.
 *
 * To run this test:
 * node test/js-loading-test.js
 *
 * NOTE: The server must be running before executing this test
 */

import fetch from 'node-fetch';
import chalk from 'chalk';

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const JS_URLS_TO_TEST = [
  '/js/vault-ai-assistant.js',
  // Add other critical JS files here that have caused issues in the past
];

/**
 * Tests if a JavaScript file is being served with the correct content type
 * and does not contain HTML
 */
async function testJsFile(url) {
  try {
    const fullUrl = `${SERVER_URL}${url}`;
    console.log(chalk.blue(`Testing: ${fullUrl}`));

    const response = await fetch(fullUrl);
    const contentType = response.headers.get('content-type');
    const body = await response.text();

    // Check content type
    if (!contentType || !contentType.includes('javascript')) {
      console.error(chalk.red(`✗ ERROR: Incorrect content type for ${url}: ${contentType}`));
      return false;
    }

    // Check for HTML tags in content
    if (body.includes('<!DOCTYPE html>') || body.includes('<html')) {
      console.error(chalk.red(`✗ ERROR: ${url} contains HTML content!`));
      return false;
    }

    if (body.trim().length === 0) {
      console.warn(chalk.yellow(`⚠ WARNING: ${url} is empty!`));
      return false;
    }

    console.log(chalk.green(`✓ OK: ${url} is properly served as JavaScript`));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ ERROR accessing ${url}: ${error.message}`));
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log(chalk.blue.bold('Running JavaScript Loading Smoke Tests...'));
  console.log(chalk.blue(`Testing server at ${SERVER_URL}`));

  let allPassed = true;

  // Test each JavaScript URL
  for (const jsUrl of JS_URLS_TO_TEST) {
    const passed = await testJsFile(jsUrl);
    allPassed = allPassed && passed;
  }

  // Final result
  console.log('');
  if (allPassed) {
    console.log(chalk.green.bold('✓ All JavaScript files are being served correctly!'));
  } else {
    console.log(chalk.red.bold('✗ Some JavaScript files have issues. See detailed errors above.'));
    console.log(chalk.yellow('This could lead to "Unexpected token \'<\'" errors in the browser!'));
    process.exit(1);
  }
}

// Run the tests
runTests();
