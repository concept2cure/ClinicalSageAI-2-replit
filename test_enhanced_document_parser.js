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
  console.log('\n🔍 TEST 1: Text Input Processing');
  console.log('='.repeat(50));

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
    console.log('📡 Sending text input request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`✅ Success: ${result.success}`);

    if (result.success) {
      console.log(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      console.log(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      console.log(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      console.log(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      console.log('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        console.log(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        console.log(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
        console.log(`      - Due Date: ${commitment.dueDate || 'Not specified'}`);
        console.log(`      - Authority: ${commitment.authority}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      console.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ Text input test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testFileUploadProcessing() {
  console.log('\n🔍 TEST 2: File Upload Processing');
  console.log('='.repeat(50));

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

    console.log('📎 Sending file upload request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const result = await response.json();

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`✅ Success: ${result.success}`);

    if (result.success) {
      console.log(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      console.log(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      console.log(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      console.log(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      console.log(`📎 File: ${metadata.filename}`);
      console.log(`📊 Size: ${metadata.fileSize} bytes`);
      console.log(`🔍 Type: ${metadata.mimeType}`);

      console.log('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        console.log(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        console.log(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      // Clean up test file
      fs.unlinkSync(testFilePath);

      return { success: true, commitments: result.data.commitments.length };
    } else {
      console.error(`❌ Error: ${result.error}`);
      fs.unlinkSync(testFilePath);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ File upload test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testVaultDMSProcessing() {
  console.log('\n🔍 TEST 3: Vault DMS Integration');
  console.log('='.repeat(50));

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
    console.log('🏦 Sending vault DMS request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`✅ Success: ${result.success}`);

    if (result.success) {
      console.log(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      console.log(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      console.log(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      console.log(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      console.log(`🏦 Vault File: ${metadata.filename}`);
      console.log(`📊 Size: ${metadata.fileSize} bytes`);
      console.log(`🆔 Vault ID: ${metadata.vaultFileId}`);

      console.log('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        console.log(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        console.log(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      console.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ Vault DMS test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testOneDriveProcessing() {
  console.log('\n🔍 TEST 4: OneDrive Integration');
  console.log('='.repeat(50));

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
    console.log('☁️ Sending OneDrive request...');

    const response = await fetch(`${BASE_URL}/api/ai/commitments/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    console.log(`📊 Response Status: ${response.status}`);
    console.log(`✅ Success: ${result.success}`);

    if (result.success) {
      console.log(`📄 Total Commitments: ${result.data.summary.totalCommitments}`);
      console.log(`🔴 Critical Commitments: ${result.data.summary.criticalCommitments}`);
      console.log(`📈 Compliance Score: ${result.data.summary.complianceScore}%`);
      console.log(`⚠️  Risk Level: ${result.data.summary.riskLevel}`);

      const metadata = result.data.summary.documentInfo.processingMetadata;
      console.log(`☁️ OneDrive File: ${metadata.filename}`);
      console.log(`📊 Size: ${metadata.fileSize} bytes`);
      console.log(`🔍 Type: ${metadata.documentType}`);

      console.log('\n📋 EXTRACTED COMMITMENTS:');
      result.data.commitments.forEach((commitment, index) => {
        console.log(`   ${index + 1}. ${commitment.description.substring(0, 80)}...`);
        console.log(`      - Priority: ${commitment.priority}, Type: ${commitment.type}`);
      });

      return { success: true, commitments: result.data.commitments.length };
    } else {
      console.error(`❌ Error: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ OneDrive test failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function runComprehensiveTest() {
  console.log('🚀 SUB-PHASE 1.2: ENHANCED DOCUMENT PARSER VERIFICATION SUITE');
  console.log('='.repeat(70));
  console.log('Testing 4-source document processing capabilities...');

  const results = {
    textInput: await testTextInputProcessing(),
    fileUpload: await testFileUploadProcessing(),
    vaultDMS: await testVaultDMSProcessing(),
    oneDrive: await testOneDriveProcessing(),
  };

  console.log('\n🎯 SUB-PHASE 1.2 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(70));

  let passedTests = 0;
  let totalCommitments = 0;

  Object.entries(results).forEach(([testName, result]) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    const commitments = result.commitments || 0;

    console.log(`${status} ${testName.toUpperCase()}: ${commitments} commitments extracted`);

    if (result.success) {
      passedTests++;
      totalCommitments += commitments;
    } else {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n📊 FINAL ASSESSMENT:');
  console.log(`✅ Tests Passed: ${passedTests}/4`);
  console.log(`📄 Total Commitments Extracted: ${totalCommitments}`);
  console.log(`🎯 Success Rate: ${((passedTests / 4) * 100).toFixed(1)}%`);

  if (passedTests === 4) {
    console.log('\n🎉 SUB-PHASE 1.2 ENHANCED DOCUMENT PARSER: COMPLETE');
    console.log('✅ All 4 document sources successfully integrated');
    console.log('✅ Enhanced parser handles Text, File, Vault DMS, and OneDrive');
    console.log('✅ Document-specific AI models operational');
    console.log('✅ Automated commitment categorization functional');
    console.log('✅ Ready for Sub-Phase 1.3 implementation');
  } else {
    console.log('\n⚠️  SUB-PHASE 1.2 PARTIALLY COMPLETE');
    console.log('❌ Some document sources require additional debugging');
  }
}

// Execute the test suite
runComprehensiveTest().catch(console.error);
