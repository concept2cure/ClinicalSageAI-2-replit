/**
 * Quality Management API Tests
 *
 * This module provides tests for the quality management API endpoints.
 */
import axios from 'axios';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('quality-api-test');

// Test configuration
const BASE_URL = 'http://localhost:5000';
const API_PATH = '/api/quality';

// Mock authentication token (this would be generated from a real auth system)
const TEST_AUTH_TOKEN = 'test-auth-token';

// Test organization ID
const TEST_ORG_ID = 1;

/**
 * Run a test case and log the result
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<boolean> {
  try {
    logger.info(`Running test: ${name}`);
    await testFn();
    logger.info(`✅ Test passed: ${name}`);
    return true;
  } catch (error) {
    logger.error(`❌ Test failed: ${name}`, { error });
    return false;
  }
}

/**
 * Make an API request with authentication
 */
async function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: any
) {
  try {
    const url = `${BASE_URL}${API_PATH}${path}`;
    const headers = {
      Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    };

    const response = await axios({
      method,
      url,
      headers,
      data,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`
      );
    }
    throw error;
  }
}

/**
 * Test creating and fetching a QMP
 */
async function testQmpCrud() {
  // Create a test QMP
  const qmpData = {
    name: 'Test QMP',
    version: '1.0',
    description: 'QMP for API testing',
    status: 'draft',
    allowWaivers: true,
  };

  const createdQmp = await apiRequest('POST', '/plans', qmpData);
  logger.debug('Created QMP:', { qmpId: createdQmp.id });

  // Get the QMP
  const fetchedQmp = await apiRequest('GET', `/plans/${createdQmp.id}`);
  if (fetchedQmp.name !== qmpData.name) {
    throw new Error('QMP name does not match');
  }

  // Update the QMP
  const updateData = {
    status: 'active',
    description: 'Updated description',
  };

  const updatedQmp = await apiRequest('PATCH', `/plans/${createdQmp.id}`, updateData);
  if (updatedQmp.status !== 'active' || updatedQmp.description !== 'Updated description') {
    throw new Error('QMP update did not apply correctly');
  }

  // Get all QMPs
  const qmps = await apiRequest('GET', '/plans');
  if (!Array.isArray(qmps)) {
    throw new Error('Expected an array of QMPs');
  }

  // Clean up - delete the QMP
  await apiRequest('DELETE', `/plans/${createdQmp.id}`);

  logger.debug('QMP CRUD test completed successfully');
}

/**
 * Test creating and fetching CTQ factors
 */
async function testCtqFactors() {
  // Create a test CTQ factor
  const factorData = {
    name: 'Test CTQ Factor',
    description: 'Factor for API testing',
    category: 'clinical',
    appliesTo: 'all',
    sectionCode: 'benefit-risk',
    riskLevel: 'high',
    validationRule: 'required term 1,required term 2',
    active: true,
    required: true,
  };

  const createdFactor = await apiRequest(
    'POST',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors`,
    factorData
  );
  logger.debug('Created CTQ factor:', { factorId: createdFactor.id });

  // Get the factor
  const fetchedFactor = await apiRequest(
    'GET',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor.id}`
  );
  if (fetchedFactor.name !== factorData.name) {
    throw new Error('CTQ factor name does not match');
  }

  // Update the factor
  const updateData = {
    riskLevel: 'medium',
    description: 'Updated factor description',
  };

  const updatedFactor = await apiRequest(
    'PATCH',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor.id}`,
    updateData
  );

  if (
    updatedFactor.riskLevel !== 'medium' ||
    updatedFactor.description !== 'Updated factor description'
  ) {
    throw new Error('CTQ factor update did not apply correctly');
  }

  // Get all factors
  const factors = await apiRequest('GET', `/ctq-factors/${TEST_ORG_ID}/ctq-factors`);
  if (!Array.isArray(factors)) {
    throw new Error('Expected an array of CTQ factors');
  }

  // Clean up - delete the factor
  await apiRequest('DELETE', `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor.id}`);

  logger.debug('CTQ factor test completed successfully');
}

/**
 * Test section validation
 */
async function testSectionValidation() {
  // Create a test QMP
  const qmpData = {
    name: 'Validation Test QMP',
    version: '1.0',
    status: 'active',
    allowWaivers: true,
  };

  const createdQmp = await apiRequest('POST', '/plans', qmpData);
  logger.debug('Created QMP for validation test:', { qmpId: createdQmp.id });

  // Create a test CTQ factor
  const factorData = {
    name: 'Validation Test Factor',
    category: 'clinical',
    appliesTo: 'all',
    sectionCode: 'benefit-risk',
    riskLevel: 'high',
    validationRule: 'benefit,risk,analysis',
    active: true,
    required: true,
  };

  const createdFactor = await apiRequest(
    'POST',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors`,
    factorData
  );
  logger.debug('Created CTQ factor for validation test:', { factorId: createdFactor.id });

  // Create a section gating rule
  const gatingRuleData = {
    qmpId: createdQmp.id,
    sectionCode: 'benefit-risk',
    ctqFactors: [createdFactor.id],
    requiredLevel: 'hard',
    active: true,
  };

  const createdRule = await apiRequest('POST', '/section-gating', gatingRuleData);
  logger.debug('Created section gating rule:', { ruleId: createdRule.qmpSectionGating.id });

  // Test validation that should pass
  const validContent = 'This section includes a comprehensive benefit and risk analysis.';
  const validationData = {
    qmpId: createdQmp.id,
    sectionCode: 'benefit-risk',
    content: validContent,
  };

  const validationResult = await apiRequest('POST', '/validation/validate-section', validationData);
  if (!validationResult.valid) {
    throw new Error('Validation should have passed but failed');
  }

  // Test validation that should fail
  const invalidContent = 'This section is incomplete.';
  const invalidValidationData = {
    qmpId: createdQmp.id,
    sectionCode: 'benefit-risk',
    content: invalidContent,
  };

  const invalidValidationResult = await apiRequest(
    'POST',
    '/validation/validate-section',
    invalidValidationData
  );
  if (invalidValidationResult.valid) {
    throw new Error('Validation should have failed but passed');
  }

  // Test batch validation
  const batchValidationData = {
    qmpId: createdQmp.id,
    sections: [{ sectionCode: 'benefit-risk', content: validContent }],
  };

  const batchValidationResult = await apiRequest('POST', '/batch-validate', batchValidationData);
  if (!batchValidationResult.valid) {
    throw new Error('Batch validation should have passed but failed');
  }

  // Clean up
  await apiRequest('DELETE', `/section-gating/${createdRule.qmpSectionGating.id}`);
  await apiRequest('DELETE', `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor.id}`);
  await apiRequest('DELETE', `/plans/${createdQmp.id}`);

  logger.debug('Section validation test completed successfully');
}

/**
 * Test quality dashboard data
 */
async function testDashboard() {
  // Create a test QMP
  const qmpData = {
    name: 'Dashboard Test QMP',
    version: '1.0',
    status: 'active',
  };

  const createdQmp = await apiRequest('POST', '/plans', qmpData);
  logger.debug('Created QMP for dashboard test:', { qmpId: createdQmp.id });

  // Create some test CTQ factors
  const factorData1 = {
    name: 'Dashboard Test Factor 1',
    category: 'clinical',
    sectionCode: 'benefit-risk',
    riskLevel: 'high',
    active: true,
  };

  const factorData2 = {
    name: 'Dashboard Test Factor 2',
    category: 'regulatory',
    sectionCode: 'clinical-background',
    riskLevel: 'medium',
    active: true,
  };

  const createdFactor1 = await apiRequest(
    'POST',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors`,
    factorData1
  );
  const createdFactor2 = await apiRequest(
    'POST',
    `/ctq-factors/${TEST_ORG_ID}/ctq-factors`,
    factorData2
  );

  // Create section gating rules
  const gatingRuleData1 = {
    qmpId: createdQmp.id,
    sectionCode: 'benefit-risk',
    ctqFactors: [createdFactor1.id],
    requiredLevel: 'hard',
    active: true,
  };

  const gatingRuleData2 = {
    qmpId: createdQmp.id,
    sectionCode: 'clinical-background',
    ctqFactors: [createdFactor2.id],
    requiredLevel: 'soft',
    active: true,
  };

  const createdRule1 = await apiRequest('POST', '/section-gating', gatingRuleData1);
  const createdRule2 = await apiRequest('POST', '/section-gating', gatingRuleData2);

  // Get dashboard data
  const dashboardData = await apiRequest('GET', `/dashboard/${createdQmp.id}`);

  // Check dashboard data structure
  if (!dashboardData.qmp || !dashboardData.sections || !dashboardData.factors) {
    throw new Error('Dashboard data missing expected sections');
  }

  if (dashboardData.sections.totalSections !== 2) {
    throw new Error(`Expected 2 total sections, got ${dashboardData.sections.totalSections}`);
  }

  if (dashboardData.factors.totalFactors !== 2) {
    throw new Error(`Expected 2 total factors, got ${dashboardData.factors.totalFactors}`);
  }

  // Clean up
  await apiRequest('DELETE', `/section-gating/${createdRule1.qmpSectionGating.id}`);
  await apiRequest('DELETE', `/section-gating/${createdRule2.qmpSectionGating.id}`);
  await apiRequest('DELETE', `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor1.id}`);
  await apiRequest('DELETE', `/ctq-factors/${TEST_ORG_ID}/ctq-factors/${createdFactor2.id}`);
  await apiRequest('DELETE', `/plans/${createdQmp.id}`);

  logger.debug('Dashboard test completed successfully');
}

/**
 * Run all tests
 */
async function runTests() {
  logger.info('Starting Quality Management API tests');

  let testCount = 0;
  let passCount = 0;

  // Define test cases
  const tests = [
    { name: 'QMP CRUD', fn: testQmpCrud },
    { name: 'CTQ Factors', fn: testCtqFactors },
    { name: 'Section Validation', fn: testSectionValidation },
    { name: 'Dashboard Data', fn: testDashboard },
  ];

  // Run all tests
  for (const test of tests) {
    testCount++;
    if (await runTest(test.name, test.fn)) {
      passCount++;
    }
  }

  // Log test summary
  logger.info(`Test summary: ${passCount}/${testCount} tests passed`);

  if (passCount === testCount) {
    logger.info('✅ All tests passed!');
  } else {
    logger.error(`❌ ${testCount - passCount} tests failed`);
  }
}

// Don't run tests unless explicitly invoked
if (require.main === module) {
  runTests().catch(err => {
    logger.error('Error running tests:', { error: err });
    process.exit(1);
  });
}

export default runTests;
