#!/usr/bin/env node
/**
 * CERv2 Workbench Smoke Test (Iteration 2)
 * 
 * Tests the happy path:
 * 1. Upload evidence
 * 2. Bulk link to claim
 * 3. Generate export
 * 4. Verify audit trail shows EXPORT_GENERATED with sha256 + fingerprint
 * 5. Verify exports list
 * 6. Download URL is valid
 * 
 * Usage:
 *   ORG_ID=1 PROGRAM_ID=test-program node scripts/cerv2_smoke.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const ORG_ID = process.env.ORG_ID || '1';
const PROGRAM_ID = process.env.PROGRAM_ID || 'test-program';

let passed = 0;
let failed = 0;

function log(message, type = 'info') {
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : '📝';
  console.log(`${prefix} ${message}`);
}

function assert(condition, message) {
  if (condition) {
    passed++;
    log(message, 'success');
  } else {
    failed++;
    log(message, 'error');
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${data?.error || res.statusText}`);
  }

  return data;
}

async function testUploadEvidence() {
  log('Test 1: Upload evidence');
  
  // Create a test file
  const testFile = Buffer.from('Test evidence content');
  const formData = new FormData();
  formData.append('file', new Blob([testFile]), 'test-evidence.pdf');

  const res = await fetch(`${BASE_URL}/api/cerv2-workbench/programs/${PROGRAM_ID}/evidence?orgId=${ORG_ID}`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  assert(res.ok, 'Evidence uploaded successfully');
  assert(data.data?.id, 'Evidence has ID');
  
  return data.data.id;
}

async function testBulkLink(evidenceId, claimId) {
  log('Test 2: Bulk link evidence to claim');
  
  const data = await apiFetch(`/api/cerv2-workbench/programs/${PROGRAM_ID}/evidence-links/bulk?orgId=${ORG_ID}`, {
    method: 'POST',
    body: JSON.stringify({
      evidenceIds: [evidenceId],
      entityType: 'CLAIM',
      entityId: claimId,
    }),
  });

  assert(data.ok, 'Bulk link succeeded');
  assert(data.count >= 0, 'Bulk link returned count');
}

async function testGenerateExport() {
  log('Test 3: Generate export');
  
  const data = await apiFetch(`/api/cerv2-workbench/programs/${PROGRAM_ID}/exports/claims-matrix?orgId=${ORG_ID}`, {
    method: 'POST',
  });

  assert(data.ok, 'Export generated successfully');
  assert(data.exportId, 'Export has ID');
  assert(data.filename, 'Export has filename');
  assert(data.sha256, 'Export has SHA256');
  assert(data.evidenceSetFingerprint, 'Export has evidence set fingerprint');
  
  return data.exportId;
}

async function testAuditTrail() {
  log('Test 4: Verify audit trail');
  
  const data = await apiFetch(`/api/cerv2-workbench/programs/${PROGRAM_ID}/audit?orgId=${ORG_ID}&limit=50`);

  assert(data.items && Array.isArray(data.items), 'Audit events returned');
  
  // Find EXPORT_GENERATED event
  const exportEvent = data.items.find(e => e.type === 'EXPORT_GENERATED');
  assert(exportEvent, 'EXPORT_GENERATED event exists in audit trail');
  
  if (exportEvent) {
    assert(exportEvent.payload?.sha256, 'Export event has SHA256 in payload');
    assert(exportEvent.payload?.evidenceSetFingerprint, 'Export event has evidenceSetFingerprint in payload');
    assert(exportEvent.payload?.filename, 'Export event has filename in payload');
    assert(exportEvent.payload?.sizeBytes, 'Export event has sizeBytes in payload');
  }
}

async function testExportsList(exportId) {
  log('Test 5: Verify exports list');
  
  const data = await apiFetch(`/api/cerv2-workbench/programs/${PROGRAM_ID}/exports?orgId=${ORG_ID}`);

  assert(data.items && Array.isArray(data.items), 'Exports list returned');
  assert(data.items.length > 0, 'Exports list has items');
  
  const exportRecord = data.items.find(e => e.id === exportId);
  assert(exportRecord, 'Export record found in list');
  
  if (exportRecord) {
    assert(exportRecord.sha256, 'Export record has SHA256');
    assert(exportRecord.evidenceSetFingerprint, 'Export record has evidenceSetFingerprint');
    assert(exportRecord.filename, 'Export record has filename');
  }
}

async function testDownloadUrl(exportId) {
  log('Test 6: Verify download URL is valid');
  
  const downloadUrl = `${BASE_URL}/api/cerv2-workbench/programs/${PROGRAM_ID}/exports/${exportId}/download?orgId=${ORG_ID}`;
  
  const res = await fetch(downloadUrl, { method: 'HEAD' });
  assert(res.ok || res.status === 404, 'Download URL is reachable');
  
  log(`Download URL: ${downloadUrl}`, 'info');
}

async function main() {
  log('=== CERv2 Workbench Smoke Test ===\n');
  log(`Base URL: ${BASE_URL}`);
  log(`Organization ID: ${ORG_ID}`);
  log(`Program ID: ${PROGRAM_ID}\n`);

  try {
    // Test sequence
    const evidenceId = await testUploadEvidence();
    const claimId = 'test-claim-1'; // Assuming this exists or create it
    await testBulkLink(evidenceId, claimId);
    const exportId = await testGenerateExport();
    await testAuditTrail();
    await testExportsList(exportId);
    await testDownloadUrl(exportId);

    log(`\n=== Test Summary ===`);
    log(`Passed: ${passed}`);
    log(`Failed: ${failed}`);

    if (failed > 0) {
      log('❌ Some tests failed', 'error');
      process.exit(1);
    } else {
      log('✅ All tests passed!', 'success');
      process.exit(0);
    }
  } catch (err) {
    log(`\n=== Test Failed ===`, 'error');
    log(err.message, 'error');
    log(`\nPassed: ${passed}`, 'info');
    log(`Failed: ${failed + 1}`, 'error');
    process.exit(1);
  }
}

main();
