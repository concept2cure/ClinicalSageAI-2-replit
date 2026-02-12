#!/usr/bin/env node
/**
 * CERV2 Staging Verification Script
 *
 * Comprehensive production-readiness verification for all CERV2 features.
 * Runs against a live staging server and produces a JSON report.
 *
 * Usage:
 *   node scripts/cerv2_staging_verify.mjs --base-url http://localhost:5000
 *   node scripts/cerv2_staging_verify.mjs --base-url http://localhost:5000 --output report.json --ci
 *
 * Gates:
 *   1. Health & connectivity
 *   2. API route availability
 *   3. CERV2 Editor AI feature endpoints
 *   4. Static asset integrity
 *   5. Phase 9 feature surface validation
 */

import { writeFile } from 'fs/promises';
import path from 'path';

/* ── CLI Args ────────────────────────────────────────────────────────────── */
const parseArg = flag => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const BASE_URL = parseArg('--base-url') || process.env.CERV2_BASE_URL || 'http://localhost:5000';
const OUTPUT = parseArg('--output') || null;
const CI_MODE = process.argv.includes('--ci');

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const log = (...args) => console.log(...args);
const fail = (...args) => console.error('  ✖', ...args);
const pass = (...args) => console.log('  ✔', ...args);
const warn = (...args) => console.warn('  ⚠', ...args);

async function httpGet(urlPath, opts = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...opts.headers },
    });
    const body = opts.json !== false ? await res.json().catch(() => null) : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function httpPost(urlPath, data = {}, opts = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...opts.headers },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

/* ── Test Result Collector ───────────────────────────────────────────────── */
const results = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  gates: [],
  summary: { total: 0, passed: 0, failed: 0, warned: 0 },
};

function addResult(gate, name, status, detail = '') {
  const entry = { name, status, detail };
  let g = results.gates.find(x => x.gate === gate);
  if (!g) {
    g = { gate, checks: [] };
    results.gates.push(g);
  }
  g.checks.push(entry);
  results.summary.total++;
  if (status === 'pass') results.summary.passed++;
  else if (status === 'fail') results.summary.failed++;
  else results.summary.warned++;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 1: Health & Connectivity
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate1_health() {
  log('\n┌─ Gate 1: Health & Connectivity ─────────────────────────────┐');

  // 1a. Primary health endpoint
  const health = await httpGet('/api/health');
  if (health.ok) {
    pass('Primary health endpoint (/api/health)');
    addResult('G1_Health', '/api/health', 'pass');
  } else {
    fail(`/api/health → ${health.status || health.error}`);
    addResult('G1_Health', '/api/health', 'fail', `${health.status}`);
  }

  // 1b. Fallback health
  const healthz = await httpGet('/healthz');
  if (healthz.ok) {
    pass('Fallback health endpoint (/healthz)');
    addResult('G1_Health', '/healthz', 'pass');
  } else {
    warn('/healthz not available (non-blocking)');
    addResult('G1_Health', '/healthz', 'warn', `${healthz.status}`);
  }

  // 1c. Root page loads (may not serve HTML in dev mode with Vite proxy)
  const root = await httpGet('/', { json: false });
  if (root.ok && typeof root.body === 'string' && root.body.includes('<!')) {
    pass('Root page serves HTML');
    addResult('G1_Health', 'Root HTML', 'pass');
  } else if (root.ok) {
    warn('Root page responds but not HTML (dev mode — Vite proxy expected)');
    addResult('G1_Health', 'Root HTML', 'warn', 'non-HTML response (dev mode)');
  } else {
    warn('Root page not serving HTML (expected in dev mode)');
    addResult('G1_Health', 'Root HTML', 'warn', `${root.status}`);
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 2: Core API Routes
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate2_apiRoutes() {
  log('\n┌─ Gate 2: Core API Routes ──────────────────────────────────┐');

  const routes = [
    { path: '/api/cerv2/ai/health', name: 'CERV2 AI health' },
    { path: '/api/cerv2/export/health', name: 'CERV2 Export health' },
    { path: '/api/cerv2-sections', name: 'CERV2 Sections (auth-gated)' },
    { path: '/api/cerv2/documents', name: 'CERV2 Documents (auth-gated)' },
  ];

  for (const r of routes) {
    const res = await httpGet(r.path);
    if (res.ok) {
      pass(`${r.name} (${r.path})`);
      addResult('G2_API', r.name, 'pass');
    } else if (res.status === 401 || res.status === 403) {
      // Auth-gated is acceptable for staging
      warn(`${r.name} requires auth (${res.status}) — expected for secured endpoints`);
      addResult('G2_API', r.name, 'warn', `${res.status} auth-gated`);
    } else if (res.status === 404) {
      fail(`${r.name} → 404 (route not registered)`);
      addResult('G2_API', r.name, 'fail', '404');
    } else {
      warn(`${r.name} → ${res.status || res.error}`);
      addResult('G2_API', r.name, 'warn', `${res.status}`);
    }
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 3: CERV2 AI Feature Endpoints
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate3_cerv2AI() {
  log('\n┌─ Gate 3: CERV2 AI Feature Endpoints ──────────────────────┐');

  // 3a. AI suggestion endpoint (POST /api/cerv2/ai/suggest)
  const suggest = await httpPost('/api/cerv2/ai/suggest', {
    docType: 'cerv2_510k',
    sectionId: 'device_description',
    variant: 'main',
    context: { existingContent: '', deviceName: 'Test Device' },
  });
  if (suggest.ok || suggest.status === 401 || suggest.status === 400) {
    pass(`AI suggestion endpoint (${suggest.status})`);
    addResult('G3_AI', 'AI Suggest', 'pass', `HTTP ${suggest.status}`);
  } else if (suggest.status === 404) {
    fail(`AI suggest → 404 (route not mounted)`);
    addResult('G3_AI', 'AI Suggest', 'fail', '404');
  } else {
    warn(`AI suggest → ${suggest.status || suggest.error} (may need API key)`);
    addResult('G3_AI', 'AI Suggest', 'warn', `${suggest.status}`);
  }

  // 3b. Export mock endpoint (GET /api/cerv2/export/mock/:docType)
  const exportMock = await httpGet('/api/cerv2/export/mock/cerv2_510k');
  if (exportMock.ok) {
    pass(`Export mock endpoint (${exportMock.status})`);
    addResult('G3_AI', 'Export Mock', 'pass', `HTTP ${exportMock.status}`);
  } else if (exportMock.status === 401) {
    pass(`Export mock auth-gated (${exportMock.status})`);
    addResult('G3_AI', 'Export Mock', 'pass', 'auth-gated');
  } else {
    warn(`Export mock → ${exportMock.status || exportMock.error}`);
    addResult('G3_AI', 'Export Mock', 'warn', `${exportMock.status}`);
  }

  // 3c. AI health sub-endpoint
  const aiHealth = await httpGet('/api/cerv2/ai/health');
  if (aiHealth.ok) {
    pass(`AI health sub-endpoint (${aiHealth.status})`);
    addResult('G3_AI', 'AI Health', 'pass');
  } else {
    warn(`AI health → ${aiHealth.status || aiHealth.error}`);
    addResult('G3_AI', 'AI Health', 'warn', `${aiHealth.status}`);
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 4: Static Asset Integrity
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate4_staticAssets() {
  log('\n┌─ Gate 4: Static Asset Integrity ──────────────────────────┐');

  // Check that the SPA shell loads with expected markers
  const html = await httpGet('/', { json: false });
  if (!html.ok || (typeof html.body === 'string' && !html.body.includes('<!'))) {
    warn('Static assets not served by Express (expected in dev mode — uses Vite proxy)');
    addResult('G4_Assets', 'Static serving', 'warn', 'dev mode');
    log('└─────────────────────────────────────────────────────────────┘');
    return;
  }

  const body = html.body;

  // Check for React root
  if (body.includes('id="root"') || body.includes('id="app"')) {
    pass('React mount point found');
    addResult('G4_Assets', 'React root', 'pass');
  } else {
    warn('No React root element found in HTML');
    addResult('G4_Assets', 'React root', 'warn');
  }

  // Check for JS bundle reference
  const jsMatch = body.match(/src="([^"]*\.js[^"]*)"/);
  if (jsMatch) {
    pass(`JS bundle referenced: ${jsMatch[1].substring(0, 60)}`);
    addResult('G4_Assets', 'JS Bundle ref', 'pass');

    // Verify the bundle is loadable
    const jsRes = await httpGet(jsMatch[1], { json: false });
    if (jsRes.ok) {
      pass('JS bundle loads successfully');
      addResult('G4_Assets', 'JS Bundle load', 'pass');
    } else {
      fail(`JS bundle failed to load: ${jsRes.status}`);
      addResult('G4_Assets', 'JS Bundle load', 'fail');
    }
  } else {
    warn('No JS bundle reference found in HTML (may use module imports)');
    addResult('G4_Assets', 'JS Bundle ref', 'warn');
  }

  // Check for CSS
  const cssMatch = body.match(/href="([^"]*\.css[^"]*)"/);
  if (cssMatch) {
    pass(`CSS bundle referenced: ${cssMatch[1].substring(0, 60)}`);
    addResult('G4_Assets', 'CSS Bundle', 'pass');
  } else {
    warn('No CSS bundle reference found');
    addResult('G4_Assets', 'CSS Bundle', 'warn');
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 5: Phase 9 Feature Surface Validation
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate5_phase9Features() {
  log('\n┌─ Gate 5: Phase 9 Feature Surface Validation ──────────────┐');

  // 5a. CERV2 sections endpoint (auth-gated)
  const sectionsRes = await httpGet('/api/cerv2-sections');
  if (sectionsRes.ok || sectionsRes.status === 401 || sectionsRes.status === 403) {
    pass(`Sections endpoint (${sectionsRes.status})`);
    addResult('G5_Phase9', 'Sections API', 'pass', `HTTP ${sectionsRes.status}`);
  } else if (sectionsRes.status === 404) {
    fail('Sections API → 404');
    addResult('G5_Phase9', 'Sections API', 'fail', '404');
  } else {
    warn(`Sections API → ${sectionsRes.status || sectionsRes.error}`);
    addResult('G5_Phase9', 'Sections API', 'warn');
  }

  // 5b. CERV2 documents endpoint (auth-gated)
  const docsRes = await httpGet('/api/cerv2/documents');
  if (docsRes.ok || docsRes.status === 401 || docsRes.status === 403) {
    pass(`Documents endpoint (${docsRes.status})`);
    addResult('G5_Phase9', 'Documents API', 'pass', `HTTP ${docsRes.status}`);
  } else if (docsRes.status === 404) {
    fail('Documents API → 404');
    addResult('G5_Phase9', 'Documents API', 'fail', '404');
  } else {
    warn(`Documents API → ${docsRes.status || docsRes.error}`);
    addResult('G5_Phase9', 'Documents API', 'warn');
  }

  // 5c. Export endpoints
  const exportRes = await httpPost('/api/cerv2/export/pdf', {
    docType: 'cerv2_510k',
    sectionData: { device_description: 'Test content for staging verification.' },
  });
  if (exportRes.ok || exportRes.status === 401 || exportRes.status === 403) {
    pass(`Export PDF endpoint (${exportRes.status})`);
    addResult('G5_Phase9', 'Export PDF', 'pass');
  } else {
    warn(`Export PDF → ${exportRes.status || exportRes.error}`);
    addResult('G5_Phase9', 'Export PDF', 'warn');
  }

  // 5d. Export mock (public, no auth)
  const mockRes = await httpGet('/api/cerv2/export/mock/cerv2_510k/json');
  if (mockRes.ok) {
    pass(`Export mock JSON (${mockRes.status})`);
    addResult('G5_Phase9', 'Export Mock JSON', 'pass');
    // Verify it has section structure
    if (mockRes.body && typeof mockRes.body === 'object') {
      pass('  Export mock returns structured data');
      addResult('G5_Phase9', 'Export Mock structure', 'pass');
    }
  } else {
    warn(`Export mock JSON → ${mockRes.status || mockRes.error}`);
    addResult('G5_Phase9', 'Export Mock JSON', 'warn');
  }

  // 5e. Export health
  const exportHealthRes = await httpGet('/api/cerv2/export/health');
  if (exportHealthRes.ok) {
    pass(`Export health (${exportHealthRes.status})`);
    addResult('G5_Phase9', 'Export Health', 'pass');
  } else {
    warn(`Export health → ${exportHealthRes.status || exportHealthRes.error}`);
    addResult('G5_Phase9', 'Export Health', 'warn');
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 6: Client-side Module Integrity (offline)
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate6_clientModules() {
  log('\n┌─ Gate 6: Client Module Integrity (Static Analysis) ───────┐');

  const { readFileSync, existsSync } = await import('fs');

  const phase9Modules = [
    { file: 'client/src/pages/CERV2EditorAI.jsx', exports: ['default'] },
    { file: 'client/src/services/CERV2AutoSaveService.js', exports: ['default'] },
    {
      file: 'client/src/utils/cerv2-section-targets.js',
      exports: ['computeSectionStatus', 'getSectionTarget', 'SECTION_STATUS'],
    },
    { file: 'client/src/utils/CERV2ComplianceEngine.js', exports: ['validateSection'] },
    { file: 'client/src/utils/cerv2-validation-utils.js', exports: ['mergeValidation'] },
    { file: 'client/src/components/CERV2DeviceContextPanel.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2AttachmentManager.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2VersionHistory.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2PredicateSearch.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2CitationManager.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2ReviewWorkflow.jsx', exports: ['default'] },
    { file: 'client/src/components/CERV2ExportControls.jsx', exports: ['default'] },
  ];

  for (const mod of phase9Modules) {
    if (!existsSync(mod.file)) {
      fail(`Missing: ${mod.file}`);
      addResult('G6_Modules', mod.file, 'fail', 'File not found');
      continue;
    }

    const src = readFileSync(mod.file, 'utf8');

    // Check named exports exist
    for (const exp of mod.exports) {
      if (exp === 'default') {
        if (src.includes('export default')) {
          pass(`${path.basename(mod.file)}: default export present`);
          addResult('G6_Modules', `${path.basename(mod.file)} default`, 'pass');
        } else {
          fail(`${path.basename(mod.file)}: missing default export`);
          addResult('G6_Modules', `${path.basename(mod.file)} default`, 'fail');
        }
      } else {
        const pattern = new RegExp(
          `export\\s+(function|const|let|var|class)\\s+${exp}\\b|export\\s*\\{[^}]*\\b${exp}\\b`
        );
        if (pattern.test(src)) {
          pass(`${path.basename(mod.file)}: exports ${exp}`);
          addResult('G6_Modules', `${path.basename(mod.file)} → ${exp}`, 'pass');
        } else {
          fail(`${path.basename(mod.file)}: missing export '${exp}'`);
          addResult('G6_Modules', `${path.basename(mod.file)} → ${exp}`, 'fail');
        }
      }
    }
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Gate 7: Cross-Module API Contract Verification
   ═══════════════════════════════════════════════════════════════════════════ */
async function gate7_apiContracts() {
  log('\n┌─ Gate 7: Cross-Module API Contract Checks ────────────────┐');

  const { readFileSync } = await import('fs');

  // 7a. AutoSaveService has init() pattern
  const autoSave = readFileSync('client/src/services/CERV2AutoSaveService.js', 'utf8');
  if (/\binit\s*\(/.test(autoSave)) {
    pass('AutoSaveService has init() method');
    addResult('G7_Contracts', 'AutoSave init()', 'pass');
  } else {
    fail('AutoSaveService missing init() method');
    addResult('G7_Contracts', 'AutoSave init()', 'fail');
  }

  // 7b. computeSectionStatus accepts (docType, sectionId, content)
  const targets = readFileSync('client/src/utils/cerv2-section-targets.js', 'utf8');
  if (/computeSectionStatus\s*\(\s*docType/.test(targets)) {
    pass('computeSectionStatus signature: (docType, sectionId, content)');
    addResult('G7_Contracts', 'computeSectionStatus sig', 'pass');
  } else {
    fail('computeSectionStatus has wrong signature');
    addResult('G7_Contracts', 'computeSectionStatus sig', 'fail');
  }

  // 7c. CERV2EditorAI uses .label (not .title) for outline access
  const editor = readFileSync('client/src/pages/CERV2EditorAI.jsx', 'utf8');
  const titleRefs = (editor.match(/section\.title/g) || []).length;
  const labelRefs = (editor.match(/section\.label/g) || []).length;
  if (titleRefs === 0) {
    pass(`Editor uses .label (${labelRefs} refs), no .title references`);
    addResult('G7_Contracts', 'Outline .label usage', 'pass');
  } else {
    fail(`Editor has ${titleRefs} stale .title references`);
    addResult('G7_Contracts', 'Outline .label usage', 'fail');
  }

  // 7d. DeviceContextPanel rendered outside top bar
  if (/showDeviceContext.*&&.*\n\s*<CERV2DeviceContextPanel/.test(editor)) {
    pass('DeviceContextPanel conditionally rendered outside top bar');
    addResult('G7_Contracts', 'DeviceContext layout', 'pass');
  } else {
    warn('DeviceContextPanel layout pattern not confirmed');
    addResult('G7_Contracts', 'DeviceContext layout', 'warn');
  }

  // 7e. Stale closure fix — deviceContext in dependency arrays
  const fetchCb = editor.match(/fetchAiSuggestion\s*=\s*useCallback[\s\S]*?\n\s*\]\s*\)/);
  if (fetchCb && fetchCb[0].includes('deviceContext')) {
    pass('fetchAiSuggestion includes deviceContext in deps');
    addResult('G7_Contracts', 'fetchAiSuggestion deps', 'pass');
  } else {
    fail('fetchAiSuggestion missing deviceContext in dependency array');
    addResult('G7_Contracts', 'fetchAiSuggestion deps', 'fail');
  }

  const validateCb = editor.match(/validateSection\s*=\s*useCallback[\s\S]*?\n\s*\]\s*\)/);
  if (validateCb && validateCb[0].includes('deviceContext')) {
    pass('validateSection includes deviceContext in deps');
    addResult('G7_Contracts', 'validateSection deps', 'pass');
  } else {
    fail('validateSection missing deviceContext in dependency array');
    addResult('G7_Contracts', 'validateSection deps', 'fail');
  }

  log('└─────────────────────────────────────────────────────────────┘');
}

/* ═══════════════════════════════════════════════════════════════════════════
   Orchestrator
   ═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  log('╔══════════════════════════════════════════════════════════════╗');
  log('║      CERV2 Staging Production Verification Suite            ║');
  log(`║      Target: ${BASE_URL.padEnd(44)}║`);
  log(`║      Time:   ${new Date().toISOString().padEnd(44)}║`);
  log('╚══════════════════════════════════════════════════════════════╝');

  // Offline gates (don't need server)
  await gate6_clientModules();
  await gate7_apiContracts();

  // Online gates (need server) — wrapped in try/catch so offline-only mode works
  try {
    await gate1_health();
    await gate2_apiRoutes();
    await gate3_cerv2AI();
    await gate4_staticAssets();
    await gate5_phase9Features();
  } catch (err) {
    warn(`Server-dependent gates skipped: ${err.message}`);
    addResult('G1_Health', 'Server connectivity', 'warn', err.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  log('\n╔══════════════════════════════════════════════════════════════╗');
  log('║                    VERIFICATION SUMMARY                     ║');
  log('╠══════════════════════════════════════════════════════════════╣');
  log(`║  Total checks:  ${String(results.summary.total).padEnd(42)}║`);
  log(`║  Passed:        ${String(results.summary.passed).padEnd(42)}║`);
  log(`║  Failed:        ${String(results.summary.failed).padEnd(42)}║`);
  log(`║  Warnings:      ${String(results.summary.warned).padEnd(42)}║`);
  const verdict = results.summary.failed === 0 ? 'PASS ✔' : 'FAIL ✖';
  log(`║  Verdict:       ${verdict.padEnd(42)}║`);
  log('╚══════════════════════════════════════════════════════════════╝');

  // Output report
  if (OUTPUT) {
    await writeFile(OUTPUT, JSON.stringify(results, null, 2));
    log(`\nReport written to ${OUTPUT}`);
  }

  // CI exit code
  if (CI_MODE && results.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
