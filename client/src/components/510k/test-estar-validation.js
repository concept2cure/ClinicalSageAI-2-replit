/**
 * Test script for eSTAR validation endpoint
 *
 * This file provides a simple testing mechanism for the eSTAR validation endpoint.
 * Run this in the browser console to test the connection to the server-side endpoints.
 */

import FDA510kService from '../../services/FDA510kService';

/**
 * Test the validation endpoint with a test project ID
 */
async function testESTARValidation() {
  console.log('Testing eSTAR validation endpoint...');

  // Use a test project ID
  const projectId = 'test-project-1';

  try {
    // Call validation endpoint
    const result = await FDA510kService.validateESTARPackage(projectId, false);

    // Log the result
    console.log('Validation result:', result);

    if (result.success) {
      console.log('✓ Validation endpoint is working correctly');
      return true;
    } else {
      console.warn(
        '⚠ Validation endpoint returned successful response but validation failed:',
        result.errorMessage
      );
      return false;
    }
  } catch (error) {
    console.error('✗ Error testing validation endpoint:', error);
    return false;
  }
}

// Export functions for use in browser console
window.testESTAR = {
  testValidation: testESTARValidation,
};

export { testESTARValidation };
