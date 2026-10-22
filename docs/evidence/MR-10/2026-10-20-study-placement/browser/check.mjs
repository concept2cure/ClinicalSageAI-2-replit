import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const out = resolve(here, 'result');
mkdirSync(out, { recursive: true });
const sourcePaths = [
  'package.json', 'package-lock.json',
  'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx',
  'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx',
  'client/src/concept2cure/v2/surfaces/submissionScopedRead.ts',
  'client/src/concept2cure/v2/surfaces/filingTarget.tsx',
  'client/src/concept2cure/v2/surfaces/StudyTaggingInputFields.tsx',
  'client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx',
  'client/src/concept2cure/v2/surfaces/VaultPlaceOccupancy.tsx',
  'client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx',
  'client/src/concept2cure/v2/surfaces/placeIntoFilingCopy.ts',
  'client/src/concept2cure/v2/dataConnect.tsx', 'client/src/lib/queryClient.ts',
  'client/src/services/portal/authService.tsx', 'client/src/concept2cure/v2/RecordHistory.tsx',
  'shared/regulatory/ectd-leaf-rules.ts', 'shared/regulatory/section-code.ts', 'shared/regulatory/region-identity.ts',
  'server/routes/submissions.ts', 'server/services/submission-service/submission-service.ts',
  'server/services/part11/signature-persistence.ts', 'server/services/ectd/core-to-packager.ts',
  'server/services/ectd/stf-generator.ts', 'server/services/ectd/ectd4-validator.ts',
  'server/services/ectd/ectd-regional-rules.ts', 'server/services/submission-gateways/regional-packager.ts',
  'shared/schema/submissions.ts', 'shared/types/database.d.ts',
  'client/src/concept2cure/v2/styles/submission-v2.css',
  ...['probe.tsx', 'server.mjs', 'check.mjs', 'index.html'].map(file => `docs/evidence/MR-10/2026-10-20-study-placement/browser/${file}`),
];
const pins = () => Object.fromEntries(sourcePaths.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
const before = pins();
const stages = [], cases = [], errors = [];
const REASON = 'Synthetic sponsor review of this study placement';
const DOC = 'a1000000-0000-4000-8000-0000000000a1';
let current;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
function readFixture(route, path, state) {
  state.reads.push(path);
  if (path === '/api/submissions') return send(route, [{ id: 9, title: 'Synthetic study filing', applicationType: 'ind', primaryRegion: 'fda', status: 'active' }]);
  if (path === '/api/submissions/9/sequences') return send(route, [
    { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda' },
    { id: 22, sequenceNumber: '0001', type: 'amendment', status: 'assembling', region: 'fda' },
    { id: 23, sequenceNumber: '0002', type: 'amendment', status: 'frozen', region: 'fda' },
  ]);
  if (path.endsWith('/history')) return send(route, { entries: [], chain: { ok: true, rowsChecked: 0, legacyRows: 0 }, truncated: false });
  if (/\/sequences\/(21|22)\/leaves$/.test(path)) return send(route, state.leaves.filter(leaf => leaf.sequenceId === Number(path.split('/')[4])));
  if (path === '/api/authoring/docs/D1/sections') return send(route, { success: true, sections: [
    { code: '5.3.5.1', title: 'Synthetic study report', content: 'Saved synthetic sponsor reviewed study report.' },
  ] });
  if (path === '/api/coauthor/documents') return send(route, { documents: [
    { id: 8, title: 'Synthetic Builder study report', moduleNumber: '5.3.5.1', status: 'approved' },
    { id: 9, title: 'Other synthetic study report', moduleNumber: '5.3.5.1', status: 'approved' },
  ], total: 2, returned: 2, offset: 0 });
  return send(route, []);
}
await page.route('**/api/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname, state = current;
  if (path === '/api/v1/auth/session') return send(route, { authenticated: true, user: { id: '9', organizationId: '1',
    email: 'study-placement@example.test', firstName: 'Synthetic', lastName: 'Author', roles: ['author'], permissions: [],
    mfaEnabled: false, mfaMethods: [], mustChangePassword: false } });
  if (req.method() === 'GET') return readFixture(route, path, state);
  const body = req.postDataJSON();
  if (req.method() === 'POST' && path === '/api/coauthor/documents') {
    state.posts.push({ path, body });
    if (state.mode === 'snapshot204') return route.fulfill({ status: 204 });
    return send(route, { success: true, written: true, document: { id: 52, status: 'approved', metadata: { source: 'authoring-document', docId: 'D1' } } }, 201);
  }
  assert.equal(req.method(), 'PUT');
  assert.match(path, /^\/api\/submissions\/sequences\/21\/leaves$/);
  assert.equal(body.sectionCode, '5.3.5.1');
  assert.equal(body.studyId, 'STUDY-101');
  assert.equal(body.stfFileTag, 'human-reviewed-tag');
  assert.equal(body.reason, REASON);
  assert.equal(body.documentTable, state.lane === 'vault' ? 'vault_documents' : 'coauthor_documents');
  if (state.lane === 'vault') assert.equal(body.documentUuid, DOC);
  else assert.equal(body.documentId, state.lane === 'authoring' ? 52 : 8);
  state.puts.push({ path, body });
  const leaf = { ...body, id: 62, sequenceId: 21, documentId: body.documentId ?? null, documentUuid: body.documentUuid ?? null,
    granularity: null, documentType: 'clinical_study_report', parentLeafId: null, checksum: null,
    documentContentSha256: 'a'.repeat(64), documentPinnedAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T11:00:00.000Z',
    auditTrail: { persisted: true, chained: true }, sourceDocument: { status: 'resolved', keyKind: state.lane === 'vault' ? 'uuid' : 'integer',
      pinnedSha256: 'a'.repeat(64), storedSha256: 'a'.repeat(64), pin: 'match', reason: null, notTransmittable: null, noContent: false } };
  state.leaves.push(leaf);
  if (state.mode === 'put204') return route.fulfill({ status: 204 });
  return send(route, { ...leaf, ...(state.mode === 'mismatch' ? { studyId: 'OTHER-STUDY' } : {}) });
});

const place = lane => lane === 'builder'
  ? page.getByRole('button', { name: 'Place leaf in the sequence', exact: true })
  : page.getByRole('dialog').getByRole('button', { name: lane === 'vault' ? 'Place into filing' : /Place leaf in the sequence/ });
async function start(lane, mode = 'confirm') {
  current = { lane, mode, puts: [], posts: [], reads: [], leaves: [] };
  cases.push(current);
  await page.goto(`http://127.0.0.1:5199/docs/evidence/MR-10/2026-10-20-study-placement/browser/?lane=${lane}`, { waitUntil: 'networkidle' });
  if (lane === 'builder') {
    await page.getByRole('button', { name: /Place a Co-Author document as a leaf/ }).click();
    await page.getByLabel('Source document', { exact: true }).selectOption('8');
  } else {
    if (lane === 'authoring') await page.getByRole('button', { name: /Place into filing/ }).click();
    await page.getByLabel('Target submission', { exact: true }).selectOption('9');
    await page.getByLabel('Sequence', { exact: true }).selectOption('21');
  }
  await page.getByLabel(/^Reason for this placement/).fill(REASON);
}
async function fill() {
  await page.getByLabel('Study id', { exact: true }).fill(' STUDY-101 ');
  await page.getByLabel('STF file-tag', { exact: true }).fill(' human-reviewed-tag ');
}
async function record(stage) {
  assert.deepEqual(errors, []);
  stages.push({ stage, lane: current.lane, mode: current.mode, puts: current.puts.length, posts: current.posts.length,
    savedSectionReads: current.reads.filter(path => path.endsWith('/sections')).length });
  await page.screenshot({ path: resolve(out, `${stage}.png`), fullPage: true });
}
let status = 'pass', failure;
try {
  for (const lane of ['vault', 'authoring', 'builder']) {
    await start(lane);
    assert.equal(await place(lane).isDisabled(), true);
    await page.getByLabel('Study id', { exact: true }).fill('STUDY-101');
    assert.equal(await place(lane).isDisabled(), true);
    assert.equal(current.puts.length, 0); assert.equal(current.posts.length, 0);
    assert.equal(current.reads.filter(path => path.endsWith('/sections')).length, 0);
    await record(`${lane}-01-required-pair-gates`);
    await fill();
    if (lane === 'builder') await page.getByLabel('Source document', { exact: true }).selectOption('9');
    else await page.getByLabel('Sequence', { exact: true }).selectOption('22');
    assert.equal(await page.getByLabel('Study id', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('STF file-tag', { exact: true }).inputValue(), '');
    if (lane === 'builder') await page.getByLabel('Source document', { exact: true }).selectOption('8');
    else await page.getByLabel('Sequence', { exact: true }).selectOption('21');
    await fill();
    await page.getByLabel(/^Section code/).fill('5.3.5.2');
    assert.equal(await page.getByLabel('Study id', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('STF file-tag', { exact: true }).inputValue(), '');
    await page.getByLabel(/^Section code/).fill('5.3.5.1');
    await record(`${lane}-02-context-reset`);
    await fill();
    await place(lane).click();
    if (lane === 'builder') await page.getByText(/Leaf 5.3.5.1 placed.*server-confirmed/).waitFor();
    else {
      await page.getByRole('button', { name: 'Open in Submission Center', exact: true }).click();
      await page.getByTestId('lane').filter({ hasText: 'builder' }).waitFor();
    }
    await page.getByText('STUDY-101', { exact: true }).waitFor();
    await page.getByText('human-reviewed-tag', { exact: true }).waitFor();
    assert.equal(current.puts.length, 1);
    assert.equal(current.posts.length, lane === 'authoring' ? 1 : 0);
    await record(`${lane}-03-confirmed-builder-table`);
    await page.getByRole('button', { name: 'Freeze fixture sequence', exact: true }).click();
    await page.getByText(/its leaves are immutable/).waitFor();
    assert.equal(await page.getByRole('button', { name: /Place a Co-Author document as a leaf/ }).count(), 0);
    assert.equal(current.puts.length, 1);
    await record(`${lane}-04-frozen-read-only`);
  }
  for (const lane of ['vault', 'authoring', 'builder']) for (const mode of ['mismatch', 'put204']) {
    await start(lane, mode); await fill(); await place(lane).click();
    await page.getByText(/cannot confirm whether/i).waitFor();
    assert.equal(await place(lane).isDisabled(), true);
    assert.equal(await page.getByLabel('Study id', { exact: true }).inputValue(), ' STUDY-101 ');
    assert.equal(current.puts.length, 1);
    assert.equal(current.posts.length, lane === 'authoring' ? 1 : 0);
    assert.equal(await page.getByRole('button', { name: 'Open in Submission Center', exact: true }).count(), 0);
    if (lane === 'builder') {
      await page.getByRole('button', { name: 'Check sequence leaves', exact: true }).click();
      await page.getByRole('button', { name: /Place a Co-Author document as a leaf/ }).waitFor();
      assert.equal(current.puts.length, 1);
    } else await page.getByRole('button', { name: 'Check filing status', exact: true }).waitFor();
    await record(`${lane}-05-${mode}-held-no-replay`);
  }
  await start('authoring', 'snapshot204'); await fill(); await place('authoring').click();
  await page.getByText(/filing snapshot could not/i).waitFor();
  assert.equal(await place('authoring').isDisabled(), true);
  assert.equal(current.posts.length, 1); assert.equal(current.puts.length, 0);
  await page.getByRole('button', { name: 'Check filing status', exact: true }).waitFor();
  await record('authoring-06-snapshot204-held-no-copy-replay');
  assert.deepEqual(pins(), before);
} catch (error) {
  status = 'fail'; failure = error.stack;
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status, failure,
    anchor: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    nodeVersion: process.version, chromiumVersion: browser.version(),
    viteVersion: JSON.parse(readFileSync(resolve(root, 'node_modules/vite/package.json'), 'utf8')).version,
    sources: before, sourcePinsUnchanged: JSON.stringify(pins()) === JSON.stringify(before), stages, cases, pageErrors: errors,
    fixtureOnly: true, humanWitnessed: false, agencyAcceptanceTested: false }, null, 2) + '\n');
  await browser.close();
}
if (status !== 'pass') { process.stderr.write(`${failure}\n`); process.exit(1); }
process.stdout.write(`PASS: ${stages.length} stages across three actual surfaces; exact placement receipts, guarded unknown outcomes; ${sourcePaths.length} unchanged source pins.\n`);
