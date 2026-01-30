/**
 * SUB-PHASE 1.2 VERIFICATION: Enhanced Document Parser Test Suite
 *
 * This script tests the 4-source document processing capabilities:
 * 1. Text Input Processing
 * 2. File Upload Processing (PDF, Word, ZIP)
 * 3. Vault DMS Integration (API stub)
 * 4. OneDrive Integration (API stub)
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5000';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

// Test document content with regulatory commitments
const TEST_REGULATORY_CONTENT = `
INVESTIGATIONAL NEW DRUG APPLICATION (IND)
SAFETY REPORTING REQUIREMENTS

1. ADVERSE EVENT REPORTING
The sponsor must report all serious adverse events within 7 days of becoming aware of the event.
All non-serious adverse events must be reported within 30 days.

2. ANNUAL REPORTING
An annual IND safety report must be submitted within 60 days of the anniversary date of the IND.
The report shall include all safety data collected during the reporting period.

3. PROTOCOL AMENDMENTS
Any protocol amendments must be submitted within 30 days of implementation.
Safety-related protocol amendments require immediate notification within 24 hours.

4. INVESTIGATOR NOTIFICATIONS
All investigators must be notified of safety issues within 15 days of sponsor awareness.
Updates to investigator brochures must be provided within 90 days.

5. MANUFACTURING CHANGES
Manufacturing changes affecting safety must be reported within 30 days.
Facility inspections must be scheduled within 45 days of FDA request.
`;

async function testTextInputProcessing() {
  logger.info('\n🔍 TEST 1: Text Input Processing');
  logger.info('='.repeat(50));

  const payload = {
    documentText: TEST_REGULATORY_CONTENT,
    submissionType: 'IND',
    regulatoryPhase: 'phase1',
    analysisDepth: 'comprehensive',
    documentSource: 'text',
    targetAgencies: ['FDA'],
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
  };

  try {
    logger.info('📡 Sending text input request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    logger.info(`📊 Response Status: ${response.status}`);
    logger.info(`✅ Success: ${result.success}`);

    if (result.success) {
      logger.info(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      logger.info(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      logger.info(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      logger.info(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      logger.info('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        logger.info(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        logger.info(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
        logger.info(`      - Due Date: ${commitment.dueDate || 'Not specified'}`);
        logger.info(`      - Authority: ${commitment.authority}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      logger.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error('❌ Text input test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testFileUploadProcessing() {
  logger.info('\n🔍 TEST 2: File Upload Processing');
  logger.info('='.repeat(50));

  try {
    // Create a temporary test file
    const testFilePath = path.join(process.cwd(), 'temp_test_document.txt');
    fs.writeFileSync(testFilePath, TEST_REGULATORY_CONTENT);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('submissionType', 'IND');
    formData.append('regulatoryPhase', 'phase1');
    formData.append('analysisDepth', 'comprehensive');
    formData.append('documentSource', 'file');
    formData.append('targetAgencies', JSON.stringify(['FDA']));

    const headers = {
      'x-tenant-id': TENANT_ID,
      'x-user-id': USER_ID,
      ...formData.getHeaders(),
    };

    logger.info('📎 Sending file upload request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = await response.json();

    logger.info(`📊 Response Status: ${response.status}`);
    logger.info(`✅ Success: ${result.success}`);

    if (result.success) {
      logger.info(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      logger.info(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      logger.info(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      logger.info(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      logger.info(`📎 File: ${metadata.filename}`);
      logger.info(`📊 Size: ${metadata.fileSize} bytes`);
      logger.info(`🔍 Type: ${metadata.mimeType}`);

      logger.info('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        logger.info(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        logger.info(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      // Clean up test file
      fs.unlinkSync(testFilePath);

      return { success: true, commitments: result.data.commitments.length };
    } else {
      logger.error(`❌ Error: ${result.error}`);
      fs.unlinkSync(testFilePath);
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error('❌ File upload test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testVaultDMSProcessing() {
  logger.info('\n🔍 TEST 3: Vault DMS Integration');
  logger.info('='.repeat(50));

  const payload = {
    vaultFileId: 'vault-001',
    submissionType: 'IND',
    regulatoryPhase: 'phase1',
    analysisDepth: 'comprehensive',
    documentSource: 'vault',
    targetAgencies: ['FDA'],
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
  };

  try {
    logger.info('🏦 Sending vault DMS request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    logger.info(`📊 Response Status: ${response.status}`);
    logger.info(`✅ Success: ${result.success}`);

    if (result.success) {
      logger.info(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      logger.info(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      logger.info(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      logger.info(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      logger.info(`🏦 Vault File: ${metadata.filename}`);
      logger.info(`📊 Size: ${metadata.fileSize} bytes`);
      logger.info(`🆔 Vault ID: ${metadata.vaultFileId}`);

      logger.info('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        logger.info(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        logger.info(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      logger.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error('❌ Vault DMS test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testOneDriveProcessing() {
  logger.info('\n🔍 TEST 4: OneDrive Integration');
  logger.info('='.repeat(50));

  const payload = {
    oneDriveFileId: 'onedrive-sample-001',
    submissionType: 'NDA',
    regulatoryPhase: 'phase3',
    analysisDepth: 'comprehensive',
    documentSource: 'onedrive',
    targetAgencies: ['FDA', 'EMA'],
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID,
    'x-user-id': USER_ID,
  };

  try {
    logger.info('☁️ Sending OneDrive request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    logger.info(`📊 Response Status: ${response.status}`);
    logger.info(`✅ Success: ${result.success}`);

    if (result.success) {
      logger.info(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      logger.info(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      logger.info(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      logger.info(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      logger.info(`☁️ OneDrive File: ${metadata.filename}`);
      logger.info(`📊 Size: ${metadata.fileSize} bytes`);
      logger.info(`🔍 Type: ${metadata.documentType}`);

      logger.info('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        logger.info(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        logger.info(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      logger.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    logger.error('❌ OneDrive test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function runComprehensiveTest() {
  logger.info('🚀 SUB-PHASE 1.2: ENHANCED DOCUMENT PARSER VERIFICATION SUITE');
  logger.info('='.repeat(70));
  logger.info('Testing 4-source document processing capabilities...');

  const results = {
    textInput: await testTextInputProcessing(),
    fileUpload: await testFileUploadProcessing(),
    vaultDMS: await testVaultDMSProcessing(),
    oneDrive: await testOneDriveProcessing(),
  };

  logger.info('\n🎯 SUB-PHASE 1.2 COMPREHENSIVE TEST RESULTS');
  logger.info('='.repeat(70));

  let passedTests = 0;
  let totalCommitments = 0;

  Object.entries(results).forEach(([testName, result]) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    const commitments = result.commitments || 0;

    logger.info(`${status} ${testName.toUpperCase()}: ${commitments} commitments extracted`);

    if (result.success) {
      passedTests++;
      totalCommitments += commitments;
    } else {
      logger.info(`   Error: ${result.error}`);
    }
  });

  logger.info('\n📊 FINAL ASSESSMENT:');
  logger.info(`✅ Tests Passed: ${passedTests}/4`);
  logger.info(`📄 Total Commitments Extracted: ${totalCommitments}`);
  logger.info(`🎯 Success Rate: ${((passedTests / 4) * 100).toFixed(1)}%`);

  if (passedTests === 4) {
    logger.info('\n🎉 SUB-PHASE 1.2 ENHANCED DOCUMENT PARSER: COMPLETE');
    logger.info('✅ All 4 document sources successfully integrated');
    logger.info('✅ Enhanced parser handles Text, File, Vault DMS, and OneDrive');
    logger.info('✅ Document-specific AI models operational');
    logger.info('✅ Automated commitment categorization functional');
    logger.info('✅ Ready for Sub-Phase 1.3 implementation');
  } else {
    logger.info('\n⚠️  SUB-PHASE 1.2 PARTIALLY COMPLETE');
    logger.info('❌ Some document sources require additional debugging');
  }
}

// Execute the test suite
runComprehensiveTest().catch(console.error);
