import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const out = resolve(here, 'result');
mkdirSync(out, { recursive: true });
const sourcePaths = [
  'package.json', 'package-lock.json',
  'client/src/concept2cure/v2/surfaces/EctdCompile.tsx',
  'client/src/concept2cure/v2/surfaces/EctdCompileDtdEvidence.tsx',
  'client/src/concept2cure/v2/surfaces/submissionScopedRead.ts',
  'client/src/concept2cure/v2/shellProject.ts',
  'client/src/lib/queryClient.ts', 'client/src/services/portal/authService.tsx',
  'server/routes/ectd-compile.ts', 'server/services/ectd/assemble-from-core.ts',
  'server/services/ectd/backbone-validation.ts', 'server/services/ectd/xml-validator.ts',
  'server/services/ectd/checksum-manifest.ts', 'server/services/ectd/dtd-bundler.ts',
  'server/services/ectd/stf-generator.ts', 'server/services/ectd/regional-backbone-readiness.ts',
  'server/services/submission-gateways/regional-packager.ts',
  'server/services/submission-gateways/types.ts', 'server/services/submission-gateways/pre-transmit-check.ts',
  'shared/regulatory/ectd-dtd-validation.ts',
  'design-system/colors_and_type.css',
  ...['app-v2.css', 'journey-v2.css', 'coverage-v2.css', 'misc-surfaces-v2.css', 'submission-v2.css', 'surface-text-ramp.css', 'project-home-v2.css'].map(name => `client/src/concept2cure/v2/styles/${name}`),
  ...['synthetic-valid', 'invalid-stf', 'missing-assets', 'tampered-support'].flatMap(name => ['json', 'zip'].map(ext =>
    `docs/evidence/MR-10/2026-10-21-dtd-validation/package-examples/${name}.${ext}`)),
  ...['probe.tsx', 'server.mjs', 'check.mjs', 'index.html'].map(file => `docs/evidence/MR-10/2026-10-21-dtd-validation/browser/${file}`),
];
const pins = () => Object.fromEntries(sourcePaths.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
const before = pins();
// Read the actual normal-packager output from the real-engine qualification.
// API interception hosts those bytes in the actual component; no live records.
const examples = {};
for (const name of ['synthetic-valid', 'invalid-stf', 'missing-assets', 'tampered-support']) {
  const evidence = JSON.parse(readFileSync(resolve(here, `../package-examples/${name}.json`), 'utf8'));
  const bytes = readFileSync(resolve(here, `../package-examples/${name}.zip`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), evidence.packageSha256);
  assert.equal(evidence.syntheticSchemas, true);
  const zip = await JSZip.loadAsync(bytes);
  const regionalPath = evidence.regionalBackbone.file;
  examples[name] = { evidence, files: Object.values(zip.files).filter(file => !file.dir).map(file => file.name).sort(),
    indexXml: await zip.file('index.xml').async('string'), regional: { path: regionalPath, xml: await zip.file(regionalPath).async('string') } };
}
const exampleFor = mode => examples[({ 'invalid-stf': 'invalid-stf', 'missing-dtd': 'missing-assets', tampered: 'tampered-support' })[mode] ?? 'synthetic-valid'];
const paths = examples['synthetic-valid'].evidence.dtdStatus.validation.expectedFiles;
function statusFor(mode) {
  if (mode === 'legacy') return undefined;
  const status = structuredClone(exampleFor(mode).evidence.dtdStatus);
  if (mode === 'missing-tool') status.validation.files.forEach(file => Object.assign(file.dtd, { ran: false, valid: false, errors: ['xmllint not available'] }));
  if (mode === 'empty-proof') Object.assign(status.validation, { files: [], expectedFiles: [], passed: true });
  if (!['pass', 'empty-proof'].includes(mode)) status.validation.passed = false;
  return status;
}
function compileFor(mode) {
  const example = exampleFor(mode);
  return { id: 'synthetic-compile', projectId: 42, status: 'completed', modules: [], xmlBackbone: example.indexXml,
    validationResults: [], contentValidationPassed: true, submissionReady: false, submissionBlockers: ['Synthetic qualification package: agency acceptance is unexecuted.'],
    errors: [], warnings: [], leafFilesRendered: 1, submissionId: 55, sequenceNumber: '0000', region: 'fda', recorded: true,
    package: { sha256: example.evidence.packageSha256, files: example.files, regionalBackbone: example.regional, indexMd5: createHash('md5').update(example.indexXml).digest('hex'), pdfa: null, dtdStatus: statusFor(mode),
      regionalStatus: example.evidence.regionalBackbone } };
}
const stages = [], errors = [], requests = [];
let mode = 'pass', pending = null, compileCount = 0;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  requests.push({ method: request.method(), path });
  if (path === '/api/v1/auth/session') return send(route, { authenticated: true, user: { id: '9', organizationId: '1', email: 'dtd-compile@example.test', firstName: 'Synthetic', lastName: 'Reviewer', roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false } });
  if (path.endsWith('/status')) return send(route, { projectId: Number(path.split('/')[3]), overallReadiness: 100, contentComplete: true, submissionReady: false, totalSections: 1, totalRequired: 1, totalCompleted: 1, lastUpdated: null, modules: [{ moduleCode: 'm5', moduleName: 'Synthetic clinical studies', totalSections: 1, requiredSections: 1, completedRequired: 1, completionPct: 100, ready: true }] });
  if (path.endsWith('/history')) return send(route, { compilations: [
    { id: 7, compilation_name: 'Synthetic recorded package', compilation_type: 'initial', status: 'completed', version: '3.2.2', compiled_at: '2026-10-21T00:00:00Z', created_at: '2026-10-21T00:00:00Z', sequence_number: '0000', has_manifest: true, packageDtdValidation: mode === 'legacy' ? null : { packageSha256: exampleFor(mode).evidence.packageSha256, dtdStatus: statusFor(mode) } },
    { id: 8, compilation_name: 'Synthetic historical package without proof', compilation_type: 'initial', status: 'completed', version: '3.2.2', compiled_at: null, created_at: null, sequence_number: '0000', has_manifest: true, packageDtdValidation: null },
  ] });
  if (path.endsWith('/compile') && request.method() === 'POST') {
    compileCount++;
    if (mode === 'stale') { pending = route; return; }
    return send(route, compileFor(mode));
  }
  return send(route, {});
});
async function start(nextMode) {
  mode = nextMode;
  await page.goto('http://127.0.0.1:5199/docs/evidence/MR-10/2026-10-21-dtd-validation/browser/', { waitUntil: 'networkidle' });
  await page.getByText('Synthetic clinical studies', { exact: true }).waitFor();
}
async function snapshot(name, proof) {
  const text = await proof.innerText();
  await proof.screenshot({ path: resolve(out, `${name}.png`) });
  stages.push({ name, text });
}
try {
  for (const variant of ['pass', 'invalid-stf', 'missing-dtd', 'missing-tool', 'tampered', 'legacy', 'empty-proof']) {
    await start(variant);
    await page.getByRole('button', { name: 'Compile eCTD', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Package DTD validation', exact: true });
    await panel.waitFor();
    const text = await panel.innerText();
    if (variant === 'pass') {
      assert.match(text, /passed/i);
      for (const file of paths) assert.ok(text.includes(file), `Missing per-file proof: ${file}`);
    } else {
      assert.match(text, /unverified|invalid|failed|not verified|not passed/i);
      assert.doesNotMatch(text, /DTD validation passed/i);
    }
    if (variant === 'invalid-stf') assert.match(text, /Ran · invalid/i);
    if (variant === 'missing-tool') assert.match(text, /xmllint not available/i);
    if (variant === 'missing-dtd') assert.match(text, /missing/i);
    if (variant === 'tampered') assert.match(text, /mismatch|integrity|checksum/i);
    await snapshot(`compile-${variant}`, panel);
    const legacy = page.getByRole('region', { name: 'DTD validation for Synthetic historical package without proof', exact: true });
    await legacy.waitFor();
    assert.match(await legacy.innerText(), /unverified|not verified|no.*proof|not.*recorded/i);
  }
  await start('stale');
  await page.getByRole('button', { name: 'Compile eCTD', exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Compiling'));
  assert.ok(pending, 'Pending compile was issued.');
  await page.getByRole('button', { name: 'Revisit synthetic program A', exact: true }).click();
  await send(pending, compileFor('pass'));
  pending = null;
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole('region', { name: 'Package DTD validation', exact: true }).count(), 0, 'Obsolete compile proof must not appear after A→B→A.');
  await page.screenshot({ path: resolve(out, 'stale-compile-suppressed.png'), fullPage: true });
  stages.push({ name: 'stale-compile-suppressed', context: 'A→B→A', staleResultVisible: false });
  assert.equal(compileCount, 8);
  assert.deepEqual(errors, []);
  assert.deepEqual(pins(), before, 'Qualification inputs changed during Chromium execution.');
  const result = { status: 'pass', executedAt: new Date().toISOString(), anchor: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    fixtureOnly: true, humanWitnessed: false, agencyAcceptance: false, stages, compileCount, requests, pageErrors: errors, sourcePinsUnchanged: true, sourceSha256: before };
  writeFileSync(resolve(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`Chromium passed: ${stages.length} stages, ${compileCount} compile requests, ${sourcePaths.length} unchanged source pins.\n`);
} finally { await browser.close(); }
