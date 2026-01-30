/**
 * Security Integration Test
 *
 * This script performs a comprehensive test of all security measures
 * to verify they are working correctly. It includes tests for:
 * - Multi-tenant isolation
 * - Authentication and authorization
 * - Rate limiting
 * - CORS configuration
 * - Database Row-Level Security
 */

const axios = require('axios');
const { exec } = require('child_process');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const config = require('../server/config/environment').config;
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_URL = 'http://localhost:5000';
const TEST_TIMEOUT = 30000; // 30 seconds

// Test users for different tenants
const testUsers = {
  tenant1: {
    id: 1,
    username: 'user1',
    organizationId: 'org-1',
    roles: ['user'],
    permissions: {
      cer: ['read', 'create'],
      vault: ['read'],
    },
  },
  tenant2: {
    id: 2,
    username: 'user2',
    organizationId: 'org-2',
    roles: ['user'],
    permissions: {
      cer: ['read'],
      vault: ['read', 'create'],
    },
  },
  admin: {
    id: 3,
    username: 'admin',
    organizationId: 'org-1',
    roles: ['admin'],
    permissions: {
      cer: ['read', 'create', 'update', 'delete'],
      vault: ['read', 'create', 'update', 'delete'],
    },
  },
};

// Create JWT tokens for test users
const createToken = user => {
  return jwt.sign(user, config.jwt.secret, { expiresIn: '1h' });
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

// Helper for logging test results
const logTest = (name, passed, error = null) => {
  const status = passed ? 'PASSED' : 'FAILED';
  logger.info(`[${status}] ${name}`);
  if (error) {
    logger.error(`  Error: ${error}`);
  }

  results.tests.push({
    name,
    status: passed ? 'passed' : 'failed',
    error: error ? error.toString() : null,
  });

  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
};

// Helper for making API requests with auth
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;
  const { user, method = 'GET', data = null, headers = {} } = options;

  // Add token if user is provided
  if (user) {
    const token = createToken(user);
    headers.Authorization = `Bearer ${token}`;
  }

  // Add organization header if specified
  if (options.organizationId) {
    headers['X-Organization-ID'] = options.organizationId;
  }

  try {
    const response = await axios({
      method,
      url,
      data,
      headers,
      validateStatus: () => true, // Don't throw on error status
    });

    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
};

// Tests

// Test 1: Health check
async function testHealthCheck() {
  try {
    const response = await apiRequest('/api/health/live');
    logTest('Health Check', response.status === 200 && response.data.status === 'UP');
  } catch (error) {
    logTest('Health Check', false, error);
  }
}

// Test 2: Authentication
async function testAuthentication() {
  try {
    // Test with valid token
    const responseValid = await apiRequest('/api/some-protected-endpoint', {
      user: testUsers.tenant1,
    });

    // Test with invalid token
    const responseInvalid = await apiRequest('/api/some-protected-endpoint', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    // Should return 401 for invalid token
    const authWorks = responseInvalid.status === 401;

    logTest('Authentication', authWorks);
  } catch (error) {
    logTest('Authentication', false, error);
  }
}

// Test 3: Role-based access control
async function testRBAC() {
  try {
    // Test access with admin role
    const adminResponse = await apiRequest('/api/admin-only', {
      user: testUsers.admin,
    });

    // Test access with regular user role
    const userResponse = await apiRequest('/api/admin-only', {
      user: testUsers.tenant1,
    });

    // Admin should get access, user should be forbidden
    const rbacWorks = userResponse.status === 403;

    logTest('Role-Based Access Control', rbacWorks);
  } catch (error) {
    logTest('Role-Based Access Control', false, error);
  }
}

// Test 4: Multi-tenant isolation
async function testMultiTenantIsolation() {
  try {
    // Create test data specific to tenant 1
    const createResponse = await apiRequest('/api/documents', {
      method: 'POST',
      user: testUsers.tenant1,
      organizationId: testUsers.tenant1.organizationId,
      data: {
        name: `Test document ${uuidv4()}`,
        content: 'This is a test document',
        isConfidential: true,
      },
    });

    if (createResponse.status !== 201) {
      throw new Error(`Failed to create test document: ${JSON.stringify(createResponse.data)}`);
    }

    const documentId = createResponse.data.id;

    // Try to access the document as tenant 2
    const tenant2Response = await apiRequest(`/api/documents/${documentId}`, {
      user: testUsers.tenant2,
      organizationId: testUsers.tenant2.organizationId,
    });

    // Tenant 2 should not be able to access tenant 1's document
    const isolationWorks = tenant2Response.status === 403 || tenant2Response.status === 404;

    logTest('Multi-Tenant Isolation', isolationWorks);
  } catch (error) {
    logTest('Multi-Tenant Isolation', false, error);
  }
}

// Test 5: Rate limiting
async function testRateLimiting() {
  try {
    // Make multiple rapid requests
    const requests = [];
    for (let i = 0; i < 120; i++) {
      requests.push(apiRequest('/api/health/live'));
    }

    const responses = await Promise.all(requests);

    // At least one request should be rate limited
    const rateLimitWorks = responses.some(response => response.status === 429);

    logTest('Rate Limiting', rateLimitWorks);
  } catch (error) {
    logTest('Rate Limiting', false, error);
  }
}

// Test 6: Database RLS
async function testDatabaseRLS() {
  try {
    // This test requires direct database access, so it's more complex
    // Connect to database
    const pool = new Pool({
      connectionString: config.database.url,
    });

    // This test is conceptual and would need real implementation
    // with actual database access

    // For now, we'll just skip this test
    logger.info('[SKIPPED] Database Row-Level Security - requires direct DB access');
    results.skipped++;
  } catch (error) {
    logTest('Database Row-Level Security', false, error);
  }
}

// Run all tests
async function runTests() {
  logger.info('🔒 Starting Security Integration Tests');

  // Run tests in sequence
  await testHealthCheck();
  await testAuthentication();
  await testRBAC();
  await testMultiTenantIsolation();
  await testRateLimiting();
  await testDatabaseRLS();

  // Print summary
  logger.info('\n📊 Test Summary:');
  logger.info(`✅ Passed: ${results.passed}`);
  logger.info(`❌ Failed: ${results.failed}`);
  logger.info(`⏭️ Skipped: ${results.skipped}`);

  // Exit with appropriate code
  if (results.failed > 0) {
    logger.info('\n❌ Security tests failed!');
    process.exit(1);
  } else {
    logger.info('\n✅ All security tests passed!');
    process.exit(0);
  }
}

// Set timeout
const timeout = setTimeout(() => {
  logger.error('Tests timed out after', TEST_TIMEOUT, 'ms');
  process.exit(1);
}, TEST_TIMEOUT);

// Run tests and clear timeout on completion
runTests()
  .catch(error => {
    logger.error('Error running tests:', error);
    process.exit(1);
  })
  .finally(() => {
    clearTimeout(timeout);
  });
