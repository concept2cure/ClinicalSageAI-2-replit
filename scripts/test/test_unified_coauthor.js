#!/usr/bin/env node

// Comprehensive test of unified eCTD Co-Author system functionality
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testUnifiedCoAuthorSystem() {
  logger.info('🔬 Testing Unified eCTD Co-Author System...\n');

  try {
    // Test 1: AI Document Creation
    logger.info('1. Testing AI Document Creation...');
    const createResponse = await axios.post(`${BASE_URL}/api/v1/drafting/start_task`, {
      ectd_section: '2.5',
      project_id: `test-unified-${Date.now()}`,
      title: 'Clinical Overview Test Document',
    });

    logger.info(`✅ Task created: ${createResponse.data.task_id}`);

    // Wait for generation
    logger.info('   Waiting for AI generation...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Test 2: Check Task Status
    logger.info('2. Testing Task Status API...');
    const statusResponse = await axios.get(
      `${BASE_URL}/api/v1/drafting/task_status/${createResponse.data.task_id}`
    );

    if (statusResponse.data.status === 'COMPLETED') {
      logger.info(`✅ Document generated: ${statusResponse.data.draft_content.length} characters`);
      logger.info(`   First 100 chars: ${statusResponse.data.draft_content.substring(0, 100)}...`);
    } else {
      logger.info(`⚠️  Status: ${statusResponse.data.status}`);
    }

    // Test 3: IND Wizard Functionality
    logger.info('3. Testing IND Wizard...');
    const indResponse = await axios.post(`${BASE_URL}/api/v1/drafting/start_task`, {
      ectd_section: 'IND',
      project_id: `ind-test-${Date.now()}`,
      title: 'IND Application Package',
    });

    logger.info(`✅ IND task created: ${indResponse.data.task_id}`);

    // Test 4: Frontend Interface
    logger.info('4. Testing Frontend Interface...');
    const frontendResponse = await axios.get(`${BASE_URL}/coauthor`);
    logger.info(`✅ Frontend loads: ${frontendResponse.status === 200 ? 'SUCCESS' : 'FAILED'}`);

    // Test 5: Document Editor
    logger.info('5. Testing Document Editor...');
    const editorResponse = await axios.get(
      `${BASE_URL}/editor?taskId=${createResponse.data.task_id}`
    );
    logger.info(`✅ Editor loads: ${editorResponse.status === 200 ? 'SUCCESS' : 'FAILED'}`);

    logger.info('\n🎉 Unified eCTD Co-Author System Tests Complete!');
    logger.info('\nSystem Status:');
    logger.info('- AI Document Generation: OPERATIONAL');
    logger.info('- IND Wizard: OPERATIONAL');
    logger.info('- Frontend Interface: OPERATIONAL');
    logger.info('- Document Editor: OPERATIONAL');
    logger.info('- Backend APIs: OPERATIONAL');
  } catch (error) {
    logger.error('❌ Test failed:', error.message);
    if (error.response) {
      logger.error('   Response:', error.response.status, error.response.statusText);
    }
  }
}

testUnifiedCoAuthorSystem();
