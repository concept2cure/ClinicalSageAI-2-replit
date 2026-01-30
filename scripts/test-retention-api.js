#!/usr/bin/env node

/**
 * Test script for Retention Policy API
 *
 * This script tests the retention API endpoints by making HTTP requests
 * to verify that the API is working correctly.
 *
 * Usage:
 *   node scripts/test-retention-api.js
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const API_TOKEN = process.env.API_TOKEN || 'TS_1'; // Admin user token

// Test policies to create and update
const testPolicy = {
  policyName: 'Test Retention Policy',
  documentType: 'protocol',
  retentionPeriod: 7,
  periodUnit: 'years',
  archiveBeforeDelete: true,
  notifyBeforeDeletion: true,
  notificationPeriod: 30,
  notificationUnit: 'days',
  active: true,
};

const updatedPolicy = {
  ...testPolicy,
  policyName: 'Updated Test Policy',
  retentionPeriod: 10,
  notificationPeriod: 60,
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper function to make API requests
async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  logger.info(`${colors.blue}Request: ${method} ${url}${colors.reset}`);
  if (body) {
    logger.info(`${colors.blue}Body: ${JSON.stringify(body, null, 2)}${colors.reset}`);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    let responseData;
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    logger.info(
      `${colors.green}Response: ${response.status} ${response.statusText}${colors.reset}`
    );
    logger.info(`${colors.green}Data: ${JSON.stringify(responseData, null, 2)}${colors.reset}`);

    return {
      status: response.status,
      data: responseData,
      success: response.ok,
    };
  } catch (error) {
    logger.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    return {
      status: 0,
      data: null,
      success: false,
      error: error.message,
    };
  }
}

// Test functions
async function testGetPolicies() {
  logger.info(`\n${colors.cyan}Testing GET /api/retention/policies${colors.reset}`);
  return await apiRequest('/api/retention/policies');
}

async function testCreatePolicy() {
  logger.info(`\n${colors.cyan}Testing POST /api/retention/policies${colors.reset}`);
  return await apiRequest('/api/retention/policies', 'POST', testPolicy);
}

async function testGetPolicy(id) {
  logger.info(`\n${colors.cyan}Testing GET /api/retention/policies/${id}${colors.reset}`);
  return await apiRequest(`/api/retention/policies/${id}`);
}

async function testUpdatePolicy(id) {
  logger.info(`\n${colors.cyan}Testing PUT /api/retention/policies/${id}${colors.reset}`);
  return await apiRequest(`/api/retention/policies/${id}`, 'PUT', updatedPolicy);
}

async function testDeletePolicy(id) {
  logger.info(`\n${colors.cyan}Testing DELETE /api/retention/policies/${id}${colors.reset}`);
  return await apiRequest(`/api/retention/policies/${id}`, 'DELETE');
}

async function testRunJob() {
  logger.info(`\n${colors.cyan}Testing POST /api/retention/run-job${colors.reset}`);
  return await apiRequest('/api/retention/run-job', 'POST');
}

async function testGetDocumentTypes() {
  logger.info(`\n${colors.cyan}Testing GET /api/retention/document-types${colors.reset}`);
  return await apiRequest('/api/retention/document-types');
}

// Main function to run all tests
async function runTests() {
  logger.info(`${colors.magenta}Starting Retention API Tests${colors.reset}`);
  logger.info(`${colors.magenta}================================${colors.reset}`);

  try {
    // Test getting all policies
    const getPoliciesResult = await testGetPolicies();

    // Test creating a policy
    const createPolicyResult = await testCreatePolicy();
    if (!createPolicyResult.success) {
      throw new Error('Failed to create policy, aborting further tests');
    }

    const policyId = createPolicyResult.data.data.id;

    // Test getting a specific policy
    const getPolicyResult = await testGetPolicy(policyId);

    // Test updating a policy
    const updatePolicyResult = await testUpdatePolicy(policyId);

    // Test getting document types
    const getDocumentTypesResult = await testGetDocumentTypes();

    // Test running the retention job
    const runJobResult = await testRunJob();

    // Cleanup - delete the test policy
    const deletePolicyResult = await testDeletePolicy(policyId);

    logger.info(`\n${colors.magenta}Test Results Summary${colors.reset}`);
    logger.info(`${colors.magenta}====================${colors.reset}`);

    const results = [
      { name: 'Get Policies', result: getPoliciesResult },
      { name: 'Create Policy', result: createPolicyResult },
      { name: 'Get Policy', result: getPolicyResult },
      { name: 'Update Policy', result: updatePolicyResult },
      { name: 'Get Document Types', result: getDocumentTypesResult },
      { name: 'Run Retention Job', result: runJobResult },
      { name: 'Delete Policy', result: deletePolicyResult },
    ];

    for (const test of results) {
      const statusColor = test.result.success ? colors.green : colors.red;
      const status = test.result.success ? 'PASSED' : 'FAILED';
      logger.info(
        `${test.name}: ${statusColor}${status}${colors.reset} (Status: ${test.result.status})`
      );
    }

    const allPassed = results.every(test => test.result.success);

    logger.info(
      `\n${allPassed ? colors.green : colors.red}${allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}${colors.reset}`
    );
  } catch (error) {
    logger.error(`\n${colors.red}Error during test execution: ${error.message}${colors.reset}`);
  }
}

// Run the tests
runTests();
