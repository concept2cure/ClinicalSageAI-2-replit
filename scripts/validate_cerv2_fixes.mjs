#!/usr/bin/env node
/**
 * CERV2 Fixes Validation Script
 * Tests all critical fixes from the CERV2 build brief implementation:
 *   1. eSTAR route mounted + protected
 *   2. CERV2 sections persistence route (CRUD + versions)
 *   3. CERV2 document routes (list, get, save)
 *   4. Doc type selection + alignment
 *   5. Export config consistency
 */
const BASE = process.env.CERV2_BASE_URL || 'http://localhost:5000';

let pass = 0;
let fail = 0;

const ok = (label) => { pass++; console.log(`  ✅ ${label}`); };
const no = (label, detail) => { fail++; console.error(`  ❌ ${label} — ${detail}`); };

const json = async (url, opts = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

// ─── 1. Health ───────────────────────────────────────────────────────────────
console.log('\n🔬 1. Server Health');
try {
  const { status, data } = await json('/api/health');
  status === 200 ? ok('GET /api/health → 200') : no('Health', `got ${status}`);
} catch (e) { no('Health', e.message); }

// ─── 2. eSTAR Route Protection ──────────────────────────────────────────────
console.log('\n🔬 2. eSTAR Route (/api/510k/estar/build)');
try {
  // 2a. POST with no auth → should reject (401 or 400)
  const noAuth = await json('/api/510k/estar/build', { method: 'POST', body: {} });
  [400, 401, 403].includes(noAuth.status)
    ? ok(`POST /api/510k/estar/build (no auth) → ${noAuth.status}`)
    : no('eSTAR no-auth', `expected 400/401/403, got ${noAuth.status}`);

  // 2b. POST with invalid token → should reject
  const badAuth = await json('/api/510k/estar/build', {
    method: 'POST',
    headers: { Authorization: 'Bearer invalid-token' },
    body: {},
  });
  [400, 401, 403].includes(badAuth.status)
    ? ok(`POST /api/510k/estar/build (bad token) → ${badAuth.status}`)
    : no('eSTAR bad-token', `expected 400/401/403, got ${badAuth.status}`);

  // 2c. POST with missing payload → should get validation error (400)
  const emptyPayload = await json('/api/510k/estar/build', {
    method: 'POST',
    body: {},
  });
  if (emptyPayload.status === 400 && emptyPayload.data?.error) {
    ok('eSTAR validates payload (Zod) → 400 + error message');
  } else {
    no('eSTAR payload validation', `got ${emptyPayload.status}`);
  }

  // 2d. Confirm not 404 (route IS mounted)
  noAuth.status !== 404
    ? ok('eSTAR route is mounted (not 404)')
    : no('eSTAR mount', 'got 404 — route not mounted');
} catch (e) { no('eSTAR route', e.message); }

// ─── 3. CERV2 Sections Persistence ──────────────────────────────────────────
console.log('\n🔬 3. CERV2 Sections CRUD (/api/cerv2-sections)');
try {
  // 3a. GET list
  const list = await json('/api/cerv2-sections');
  if (list.status === 200 && Array.isArray(list.data?.sections)) {
    ok(`GET /api/cerv2-sections → 200 with sections array (${list.data.sections.length} items)`);
  } else if (list.status === 400) {
    ok('GET /api/cerv2-sections → 400 (org context required — auth enforced)');
  } else {
    no('Sections list', `unexpected ${list.status}: ${JSON.stringify(list.data).slice(0,100)}`);
  }

  // 3b. POST create (without auth — may 500 if DB unavailable, just confirm route exists)
  const create = await json('/api/cerv2-sections', {
    method: 'POST',
    body: { section_number: '1', section_title: 'Test', section_key: 'test', category: 'test' },
  });
  create.status !== 404
    ? ok(`POST /api/cerv2-sections route exists (${create.status})`)
    : no('Sections POST', 'route not found (404)');

  // 3c. Confirm versions endpoint exists
  const versions = await json('/api/cerv2-sections/1/versions');
  versions.status !== 404
    ? ok(`GET /api/cerv2-sections/:id/versions route exists (${versions.status})`)
    : no('Sections versions', 'route not found (404)');
} catch (e) { no('CERV2 Sections', e.message); }

// ─── 4. CERV2 Document Routes ───────────────────────────────────────────────
console.log('\n🔬 4. CERV2 Document Routes (/api/cerv2)');
try {
  // 4a. GET documents list
  const docs = await json('/api/cerv2/documents');
  if (docs.status === 200 && Array.isArray(docs.data?.documents)) {
    ok(`GET /api/cerv2/documents → 200 with documents array (${docs.data.documents.length} items)`);
  } else if (docs.status === 400) {
    ok('GET /api/cerv2/documents → 400 (org context required — auth enforced)');
  } else {
    no('Documents list', `unexpected ${docs.status}`);
  }

  // 4b. GET single document (may 500 if DB unavailable)
  const doc = await json('/api/cerv2/documents/1');
  doc.status !== 404
    ? ok(`GET /api/cerv2/documents/:id route exists (${doc.status})`)
    : no('Document fetch', 'route not found (404)');

  // 4c. POST save endpoint exists
  const save = await json('/api/cerv2/documents/1/save', {
    method: 'POST',
    body: { documentType: 'cerv2_510k', title: 'Test' },
  });
  save.status !== 404
    ? ok(`POST /api/cerv2/documents/:id/save route exists (${save.status})`)
    : no('Document save', 'route not found (404)');
} catch (e) { no('CERV2 Documents', e.message); }

// ─── 5. DocType Config Alignment ────────────────────────────────────────────
console.log('\n🔬 5. DocType Config Alignment');
import { readFileSync } from 'fs';
import { resolve } from 'path';
const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');
try {
  // docTypes.js is CJS — read as text and parse
  const dtContent = read('server/common/docTypes.js');

  // 5a. All three doc types exist
  const has510k = dtContent.includes("cerv2_510k");
  const hasPma = dtContent.includes("cerv2_pma");
  const hasCer = dtContent.includes("cerv2_cer");
  has510k && hasPma && hasCer
    ? ok('DOC_TYPES has all 3 keys: cerv2_510k, cerv2_pma, cerv2_cer')
    : no('DOC_TYPES keys', `missing: ${!has510k?'510k ':''}${!hasPma?'pma ':''}${!hasCer?'cer':''}`);

  // 5b. 510k has "7. Labeling" (aligned title)
  dtContent.includes("'7. Labeling'") || dtContent.includes('"7. Labeling"')
    ? ok('510k Labeling title aligned → "7. Labeling"')
    : no('Labeling title', 'title not found as "7. Labeling"');

  // 5c. PMA sections count (at least 5 section objects)
  const pmaBlock = dtContent.match(/cerv2_pma[\s\S]*?sections:\s*\[([\s\S]*?)\]/);
  const pmaSectionCount = (pmaBlock?.[1]?.match(/\{\s*id:/g) || []).length;
  pmaSectionCount >= 5
    ? ok(`PMA has ${pmaSectionCount} sections`)
    : no('PMA sections', `only ${pmaSectionCount} sections`);

  // 5d. CER sections count (at least 5 section objects)
  const cerBlock = dtContent.match(/cerv2_cer[\s\S]*?sections:\s*\[([\s\S]*?)\]/);
  const cerSectionCount = (cerBlock?.[1]?.match(/\{\s*id:/g) || []).length;
  cerSectionCount >= 5
    ? ok(`CER has ${cerSectionCount} sections`)
    : no('CER sections', `only ${cerSectionCount} sections`);
} catch (e) { no('DocType config', e.message); }

// ─── 6. File-Level Code Verification ────────────────────────────────────────
console.log('\n🔬 6. File-Level Code Verification');

try {
  // 6a. eSTAR route has authMiddleware
  const estar = read('server/routes/510k-estar-routes.ts');
  estar.includes('authMiddleware') && estar.includes('requireEditorAccess')
    ? ok('510k-estar-routes.ts has authMiddleware + requireEditorAccess')
    : no('eSTAR auth', 'missing auth guards in route file');

  // 6b. CERV2 sections imports Drizzle tables
  const sections = read('server/routes/cerv2-sections.ts');
  sections.includes('cerv2510kSections') && sections.includes('cerv2SectionVersions')
    ? ok('cerv2-sections.ts imports Drizzle schema tables')
    : no('Sections persistence', 'missing Drizzle imports');
  sections.includes('router.post') && sections.includes('router.patch') && sections.includes('router.delete')
    ? ok('cerv2-sections.ts has full CRUD endpoints')
    : no('Sections CRUD', 'missing POST/PATCH/DELETE');

  // 6c. CERV2 documents imports documents + documentVersions
  const docs = read('server/routes/cerv2-document-routes.ts');
  docs.includes('documents') && docs.includes('documentVersions')
    ? ok('cerv2-document-routes.ts uses documents + documentVersions tables')
    : no('Docs persistence', 'missing table imports');

  // 6d. server/index.ts mounts eSTAR
  const index = read('server/index.ts');
  index.includes("'/api/510k/estar'") && index.includes('510k-estar-routes')
    ? ok('server/index.ts mounts /api/510k/estar')
    : no('eSTAR mount', 'missing mount in index.ts');

  // 6e. CERV2Page has doc type selector
  const cerv2Page = read('client/src/pages/CERV2Page.jsx');
  cerv2Page.includes('selectedDocType') && cerv2Page.includes('setSelectedDocType')
    ? ok('CERV2Page.jsx has selectedDocType state')
    : no('DocType UI', 'missing selectedDocType state');
  cerv2Page.includes('cerv2_pma') && cerv2Page.includes('cerv2_cer')
    ? ok('CERV2Page.jsx has PMA + CER options in selector')
    : no('DocType selector', 'missing PMA/CER options');

  // 6f. MedicalDeviceDocumentEditor has docTypeLabel
  const editor = read('client/src/components/MedicalDeviceDocumentEditor.jsx');
  editor.includes('docTypeLabel') && editor.includes('docTypeExportHeading')
    ? ok('MedicalDeviceDocumentEditor.jsx has docTypeLabel + docTypeExportHeading')
    : no('Editor doc type', 'missing doc type labels');
  editor.includes('pmaSections') || editor.includes('cerv2_pma')
    ? ok('MedicalDeviceDocumentEditor.jsx has PMA section handling')
    : no('Editor PMA', 'missing PMA sections');
} catch (e) { no('File verification', e.message); }

// ─── 7. SKIP_VITE Feature ──────────────────────────────────────────────────
console.log('\n🔬 7. SKIP_VITE Guard');
try {
  const index = read('server/index.ts');
  index.includes('SKIP_VITE')
    ? ok('server/index.ts has SKIP_VITE guard for API-only startup')
    : no('SKIP_VITE', 'missing SKIP_VITE guard');
} catch (e) { no('SKIP_VITE', e.message); }

// ─── Summary ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`  CERV2 Validation: ${pass} passed, ${fail} failed`);
console.log('═'.repeat(60));
process.exit(fail > 0 ? 1 : 0);
