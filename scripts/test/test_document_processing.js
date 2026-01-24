/**
 * Test Script for Enhanced Unified Document Processing System
 * Tests regulatory document detection, OCR, and structure extraction
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testDocumentProcessing() {
  console.log('🧪 Testing Enhanced Unified Document Processing System...\n');

  const testFiles = [
    'SOP_Clinical_Monitoring_V2.txt',
    'Protocol_Phase3_Oncology_Study.txt',
    'Product_Label_XyzDrug.xml',
    'CSR_Clinical_Study_Report.txt',
    'IND_Application_Summary.txt',
  ];

  const baseURL = 'http://localhost:5000';
  const testResults = [];

  for (const filename of testFiles) {
    const filePath = path.join('data/raw_documents', filename);

    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filename}`);
      continue;
    }

    try {
      console.log(`\n📄 Testing: ${filename}`);

      // Create form data
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('module', 'test');
      form.append('context', 'regulatory-testing');
      form.append('purpose', 'system-validation');

      // Send to unified document ingestion endpoint
      const response = await axios.post(`${baseURL}/api/unified/document-ingestion`, form, {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 30000,
      });

      const result = response.data;

      console.log(`✅ Processed successfully`);
      console.log(`   📋 Document Type: ${result.documentType?.primaryType || 'Unknown'}`);
      console.log(`   🔍 Confidence: ${(result.documentType?.confidence * 100 || 0).toFixed(1)}%`);
      console.log(`   📊 Structure Quality: ${result.structure?.structureQuality || 'N/A'}`);
      console.log(`   📄 Sections Found: ${result.structure?.totalSections || 0}`);
      console.log(`   🧠 AI Analysis: ${result.aiAnalysis ? 'Complete' : 'Pending'}`);
      console.log(`   💾 Document ID: ${result.documentId || 'N/A'}`);

      // Log detected regulatory patterns
      if (result.documentType?.allDetected?.length > 0) {
        console.log(`   🎯 Detected Types:`);
        result.documentType.allDetected.forEach(detection => {
          console.log(
            `      - ${detection.type} (${(detection.confidence * 100).toFixed(1)}% via ${detection.source})`
          );
        });
      }

      // Log extracted sections
      if (result.structure?.sections?.length > 0) {
        console.log(`   📑 Extracted Sections:`);
        result.structure.sections.slice(0, 3).forEach(section => {
          console.log(`      - ${section.type}: "${section.heading}" (Line ${section.lineNumber})`);
        });
        if (result.structure.sections.length > 3) {
          console.log(`      ... and ${result.structure.sections.length - 3} more sections`);
        }
      }

      testResults.push({
        filename,
        success: true,
        documentType: result.documentType?.primaryType,
        confidence: result.documentType?.confidence,
        sectionsFound: result.structure?.totalSections,
        processingTime: result.processingTime,
      });
    } catch (error) {
      console.log(`❌ Failed to process: ${error.message}`);
      testResults.push({
        filename,
        success: false,
        error: error.message,
      });
    }
  }

  // Generate test summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');

  const successful = testResults.filter(r => r.success).length;
  const total = testResults.length;

  console.log(`✅ Successful: ${successful}/${total}`);
  console.log(`❌ Failed: ${total - successful}/${total}`);

  if (successful > 0) {
    console.log('\n🎯 REGULATORY DETECTION RESULTS:');
    testResults
      .filter(r => r.success && r.documentType)
      .forEach(r => {
        console.log(`   ${r.filename}: ${r.documentType} (${(r.confidence * 100).toFixed(1)}%)`);
      });
  }

  if (successful > 0) {
    console.log('\n📑 STRUCTURE EXTRACTION RESULTS:');
    testResults
      .filter(r => r.success && r.sectionsFound > 0)
      .forEach(r => {
        console.log(`   ${r.filename}: ${r.sectionsFound} sections detected`);
      });
  }

  // Test OCR capability
  console.log('\n🔍 Testing OCR Capability...');
  try {
    const { stdout } = await execAsync('tesseract --version');
    console.log('✅ Tesseract OCR available');
    console.log(`   Version: ${stdout.split('\n')[0]}`);
  } catch (error) {
    console.log('❌ Tesseract OCR not available:', error.message);
  }

  console.log('\n🏁 Testing complete!');

  return testResults;
}

// Run the test
testDocumentProcessing()
  .then(results => {
    console.log('\n📄 Full results saved for inspection');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
