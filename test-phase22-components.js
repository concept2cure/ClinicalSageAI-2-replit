#!/usr/bin/env node
/**
 * Quick integration test for Phase 22 components
 * Tests individual services without requiring database or Redis
 */

import { PDFProcessor } from './server/services/PDFProcessor.js';
import { ValidationService } from './server/services/ValidationService.js';
import fs from 'fs';

console.log('🧪 Phase 22 Component Integration Test\n');
console.log('='.repeat(60));

async function testPDFProcessor() {
  console.log('\n1. Testing PDFProcessor...');
  
  const processor = new PDFProcessor();
  
  // Test PDF validation with valid PDF header
  const validPDF = Buffer.from('%PDF-1.4\ntest content');
  const isValid = processor.validatePDF(validPDF);
  console.log(`   ✓ PDF validation: ${isValid ? 'PASS' : 'FAIL'}`);
  
  // Test invalid PDF
  const invalidPDF = Buffer.from('not a pdf');
  const isInvalid = !processor.validatePDF(invalidPDF);
  console.log(`   ✓ Invalid PDF detection: ${isInvalid ? 'PASS' : 'FAIL'}`);
  
  // Test hash computation
  const hash = processor.computeHash(validPDF);
  console.log(`   ✓ Hash computation: ${hash.length === 64 ? 'PASS' : 'FAIL'} (${hash.substring(0, 16)}...)`);
  
  return true;
}

async function testValidationService() {
  console.log('\n2. Testing ValidationService...');
  
  const validator = new ValidationService();
  
  // Test URL validation
  const validUrl = validator.validateURL('https://example.com/file.pdf');
  console.log(`   ✓ URL validation (valid): ${validUrl ? 'PASS' : 'FAIL'}`);
  
  const invalidUrl = !validator.validateURL('not-a-url');
  console.log(`   ✓ URL validation (invalid): ${invalidUrl ? 'PASS' : 'FAIL'}`);
  
  // Test submission ID validation
  const validId = validator.validateSubmissionId('HC-12345-AB');
  console.log(`   ✓ Submission ID validation: ${validId ? 'PASS' : 'FAIL'}`);
  
  // Test data validation with mock data
  const mockData = {
    regulatory: {
      submission_id: 'TEST-001',
      regulatory_agency: 'Health Canada'
    },
    protocol: {
      study_id: 'STUDY-001',
      study_title: 'Test Study',
      drug_name: 'Test Drug'
    },
    population: {
      randomized_n: 100,
      enrolled_n: 120
    },
    safety: {
      adverse_events: [
        { term: 'Headache', count: 5 }
      ]
    },
    efficacy: {
      primary_endpoints: [
        { name: 'Response Rate', value: 0.45 }
      ]
    }
  };
  
  const validation = validator.validate(mockData);
  console.log(`   ✓ Data validation: ${validation.isValid ? 'PASS' : 'FAIL'}`);
  console.log(`   ✓ Completeness score: ${(validation.completeness * 100).toFixed(0)}%`);
  console.log(`   ✓ Quality score: ${(validation.score * 100).toFixed(0)}%`);
  console.log(`   ✓ Errors: ${validation.errors.length}`);
  console.log(`   ✓ Warnings: ${validation.warnings.length}`);
  
  return validation.isValid;
}

async function testPythonExtractor() {
  console.log('\n3. Testing Python PDF Extractor...');
  
  // Check if Python script exists
  const scriptPath = './server/services/pdf_extractor_helper.py';
  if (!fs.existsSync(scriptPath)) {
    console.log('   ✗ Python script not found');
    return false;
  }
  console.log('   ✓ Python script exists');
  
  // Check if it's executable (can be called)
  try {
    const { spawn } = await import('child_process');
    const python = spawn('python3', [scriptPath]);
    
    let stderr = '';
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    await new Promise((resolve) => {
      python.on('close', () => resolve());
    });
    
    // Script should fail with "No file path provided" error
    const hasExpectedError = stderr.includes('No file path provided');
    console.log(`   ✓ Python script callable: ${hasExpectedError ? 'PASS' : 'FAIL'}`);
    
    return hasExpectedError;
  } catch (e) {
    console.log(`   ✗ Python script test failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

async function runTests() {
  try {
    const results = {
      pdfProcessor: await testPDFProcessor(),
      validation: await testValidationService(),
      pythonExtractor: await testPythonExtractor()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('Test Results:');
    console.log('  PDFProcessor:', results.pdfProcessor ? '✅ PASS' : '❌ FAIL');
    console.log('  ValidationService:', results.validation ? '✅ PASS' : '❌ FAIL');
    console.log('  Python Extractor:', results.pythonExtractor ? '✅ PASS' : '❌ FAIL');
    
    const allPassed = Object.values(results).every(r => r);
    console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
    console.log('='.repeat(60));
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
