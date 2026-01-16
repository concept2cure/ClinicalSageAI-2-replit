#!/usr/bin/env node
/**
 * Test script for Phase 22 CSR Ingestion Pipeline
 * 
 * Tests the full pipeline end-to-end with a sample Health Canada CSR
 */

import { Pool } from 'pg';
import { CSRHarvesterService } from './server/services/CSRHarvesterService.js';

// Database connection - using environment variable
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5
});

// Initialize the harvester service
const harvester = new CSRHarvesterService(db);

// Test configuration
const TEST_SUBMISSION_ID = 'HC-TEST-001';
const TEST_PDF_URL = 'https://clinical-information.canada.ca/ci-rc/download?fid=E56AC96DB56E47E3861B4E2AA6B9FB49';

async function testPipeline() {
  console.log('🧪 Phase 22 CSR Ingestion Pipeline - End-to-End Test\n');
  console.log('=' .repeat(60));
  
  try {
    // Check database connection
    console.log('✓ Connecting to database...');
    await db.query('SELECT 1');
    console.log('✓ Database connection successful\n');

    // Check if migration has been run
    console.log('✓ Checking database schema...');
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('csr_ingestion_log', 'csr_deep_vault')
    `);
    
    const tables = tableCheck.rows.map(r => r.table_name);
    console.log(`  Found tables: ${tables.join(', ')}`);
    
    if (!tables.includes('csr_ingestion_log')) {
      console.error('❌ Error: csr_ingestion_log table not found. Please run the migration:');
      console.error('   psql $DATABASE_URL -f server/db/migrations/22_ingestion_log.sql');
      process.exit(1);
    }
    
    if (!tables.includes('csr_deep_vault')) {
      console.error('❌ Error: csr_deep_vault table not found. Please run earlier migrations.');
      process.exit(1);
    }
    
    console.log('✓ Database schema is ready\n');

    // Test the harvest pipeline
    console.log(`📥 Testing CSR harvest for submission: ${TEST_SUBMISSION_ID}`);
    console.log(`   PDF URL: ${TEST_PDF_URL.substring(0, 60)}...`);
    console.log('   This may take 1-2 minutes...\n');

    const startTime = Date.now();
    const csrId = await harvester.harvestCSR(TEST_SUBMISSION_ID, TEST_PDF_URL);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Harvest completed in ${duration}s`);
    console.log(`   CSR ID: ${csrId}\n`);

    // Check ingestion status
    console.log('📊 Checking ingestion status...');
    const status = await harvester.getIngestionStatus(TEST_SUBMISSION_ID);
    
    if (status.length > 0) {
      const latest = status[0];
      console.log('   Status:', latest.status);
      console.log('   Confidence:', latest.extraction_confidence_score);
      console.log('   Completeness:', latest.completeness_score);
      console.log('   File Size:', latest.file_size_bytes, 'bytes');
      console.log('   Download Time:', latest.download_duration_ms, 'ms');
      console.log('   Extraction Time:', latest.extraction_duration_ms, 'ms');
      console.log('   Total Time:', latest.total_duration_ms, 'ms');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Pipeline test completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the test
testPipeline();
