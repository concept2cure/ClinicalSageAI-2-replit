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
  'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx',
  'client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx',
  'client/src/concept2cure/v2/surfaces/submissionScopedRead.ts',
  'client/src/concept2cure/v2/surfaces/filingTarget.tsx',
  'client/src/lib/queryClient.ts', 'client/src/services/portal/authService.tsx',
  'client/src/concept2cure/v2/RecordHistory.tsx',
  'server/routes/submissions.ts', 'server/services/submission-service/submission-service.ts',
  'server/services/part11/signature-persistence.ts', 'server/services/ectd/core-to-packager.ts',
  'server/services/ectd/stf-generator.ts', 'server/services/submission-gateways/regional-packager.ts',
  'shared/schema/submissions.ts',
  'shared/types/database.d.ts',
  'client/src/concept2cure/v2/styles/submission-v2.css',
  ...['probe.tsx', 'server.mjs', 'check.mjs', 'index.html'].map(file => `docs/evidence/MR-10/2026-10-20-builder-study-tagging/browser/${file}`),
];
const pins = () => Object.fromEntries(sourcePaths.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
const before = pins();
const base = { sectionCode: '5.3.5.1', lifecycleOp: 'new', granularity: null, documentTable: 'vault_documents', documentId: null,
  documentUuid: 'a1000000-0000-4000-8000-0000000000a1', documentType: 'clinical_study_report',
  documentContentSha256: 'a'.repeat(64), documentPinnedAt: '2026-10-19T10:00:00.000Z', studyId: null, stfFileTag: null,
  updatedAt: '2026-10-20T10:00:00.000Z', sourceDocument: { status: 'resolved', keyKind: 'uuid', pinnedSha256: 'a'.repeat(64),
    storedSha256: 'a'.repeat(64), pin: 'match', reason: null, notTransmittable: null, noContent: false } };
const leaves = new Map([21, 22].map(sequenceId => [sequenceId, { ...base, id: sequenceId + 41, sequenceId,
  title: sequenceId === 21 ? 'Synthetic study report' : 'Other sequence report' }]));
const writes = [], reads = [], errors = [], stages = [];
let mode = 'confirm', releaseLate;
const lateGate = new Promise(done => { releaseLate = done; });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
await page.route('**/api/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  if (path === '/api/v1/auth/session') return send(route, { authenticated: true, user: { id: '9', organizationId: '1',
    email: 'study-qualification@example.test', firstName: 'Synthetic', lastName: 'Author', roles: ['author'], permissions: [],
    mfaEnabled: false, mfaMethods: [], mustChangePassword: false } });
  const match = path.match(/^\/api\/submissions\/sequences\/(21|22)\/(leaves|history)$/);
  if (!match) return send(route, []);
  const sequenceId = Number(match[1]);
  if (req.method() === 'GET') {
    reads.push({ sequenceId, kind: match[2] });
    if (match[2] === 'history') return send(route, { entries: [], chain: { ok: true, rowsChecked: 0, legacyRows: 0 }, truncated: false });
    return send(route, [leaves.get(sequenceId)]);
  }
  assert.equal(req.method(), 'PUT');
  const body = req.postDataJSON(), previous = leaves.get(sequenceId);
  writes.push({ sequenceId, mode, body });
  assert.equal(body.leafId, previous.id);
  assert.equal(body.sectionCode, previous.sectionCode);
  assert.equal(body.title, previous.title);
  assert.deepEqual(body.studyTaggingEdit, { expectedStudyId: previous.studyId, expectedStfFileTag: previous.stfFileTag,
    expectedUpdatedAt: previous.updatedAt });
  assert.deepEqual(Object.keys(body).sort(), ['leafId', 'sectionCode', 'title', 'studyId', 'stfFileTag', 'reason', 'studyTaggingEdit'].sort());
  assert.ok(body.reason.length >= 8);
  const unchanged = body.studyId === previous.studyId && body.stfFileTag === previous.stfFileTag;
  const next = unchanged ? previous : { ...previous, studyId: body.studyId, stfFileTag: body.stfFileTag,
    updatedAt: `2026-10-20T11:00:0${writes.length}.000Z` };
  leaves.set(sequenceId, next);
  if (mode === 'late') await lateGate;
  if (mode === 'unknown') return send(route, { error: { code: 'OUTCOME_UNKNOWN', message: 'Synthetic committed write with lost receipt.' } }, 503);
  return send(route, { ...next, ...(unchanged ? { unchanged: true, auditTrail: null } : {
    auditTrail: { persisted: true, chained: true }, ...(writes.length === 1 ? { sequenceStatusChanged: { from: 'validated', to: 'assembling', auditTrail: { persisted: true, chained: true } } } : {}) }) });
});
async function record(stage) {
  assert.deepEqual(errors, []);
  stages.push({ stage, writes: writes.length, leafReads: reads.filter(read => read.kind === 'leaves').length,
    historyReads: reads.filter(read => read.kind === 'history').length });
  await page.screenshot({ path: resolve(out, `${stage}.png`), fullPage: true });
}
async function edit(id, tag) {
  await page.getByRole('button', { name: /Edit study tagging for leaf/ }).click();
  await page.getByLabel('Study id', { exact: true }).fill(id);
  await page.getByLabel('STF file-tag', { exact: true }).fill(tag);
  await page.getByLabel(/Reason for this study tagging edit/).fill('Synthetic sponsor review of the explicit study metadata');
}
let status = 'pass', failure;
try {
  await page.goto('http://127.0.0.1:5198/docs/evidence/MR-10/2026-10-20-builder-study-tagging/browser/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Edit study tagging for leaf/ }).waitFor();
  await edit('STUDY-101', 'study-report');
  await record('01-governed-edit');
  await page.getByRole('button', { name: 'Save study tagging', exact: true }).click();
  await page.getByTestId('host-notice').filter({ hasText: /Study tagging saved.*validate it again/ }).waitFor();
  await page.getByText('STUDY-101', { exact: true }).waitFor();
  assert.equal(writes.length, 1);
  await record('02-confirmed-save');
  mode = 'unknown';
  await edit('STUDY-202', 'human-reviewed-tag');
  await page.getByRole('button', { name: 'Save study tagging', exact: true }).click();
  await page.getByText(/cannot confirm whether the study tagging was recorded/i).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save study tagging', exact: true }).isDisabled(), true);
  await record('03-unknown-held');
  await page.getByRole('button', { name: 'Reread current leaf', exact: true }).click();
  await page.getByText(/Current study tagging was reread/).waitFor();
  assert.equal(await page.getByLabel('Study id', { exact: true }).inputValue(), 'STUDY-202');
  assert.equal(await page.getByLabel('STF file-tag', { exact: true }).inputValue(), 'human-reviewed-tag');
  assert.equal(writes.length, 2);
  await record('04-explicit-reread-no-replay');
  mode = 'confirm';
  await page.getByRole('button', { name: 'Save study tagging', exact: true }).click();
  await page.getByText(/Study tagging is unchanged/).waitFor();
  assert.equal(writes.length, 3);
  await record('05-confirmed-noop');
  if (await page.getByRole('button', { name: 'Close study tagging', exact: true }).count()) await page.getByRole('button', { name: 'Close study tagging', exact: true }).click();
  mode = 'late';
  await edit('STUDY-303', 'late-tag');
  await page.getByRole('button', { name: 'Save study tagging', exact: true }).click();
  await page.getByRole('button', { name: 'Saving study tagging…', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Switch fixture sequence' }).click();
  await page.getByText('Other sequence report', { exact: true }).waitFor();
  releaseLate();
  await page.getByRole('button', { name: /Edit study tagging for leaf.*Other sequence report/ }).waitFor();
  assert.equal(await page.getByText('STUDY-303', { exact: true }).count(), 0);
  assert.equal(await page.getByTestId('host-notice').textContent(), '');
  await record('06-late-receipt-fenced');
  await page.getByRole('button', { name: 'Freeze fixture sequence' }).click();
  await page.getByText(/its leaves are immutable/).waitFor();
  assert.equal(await page.getByRole('button', { name: /Edit study tagging/ }).count(), 0);
  assert.equal(writes.length, 4);
  await record('07-frozen-read-only');
  assert.deepEqual(pins(), before);
} catch (error) {
  status = 'fail'; failure = error.stack;
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  releaseLate();
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ status, failure, anchor: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sources: before, sourcePinsUnchanged: JSON.stringify(pins()) === JSON.stringify(before), stages, writes, reads, pageErrors: errors,
    fixtureOnly: true, humanWitnessed: false }, null, 2) + '\n');
  await browser.close();
}
if (status !== 'pass') { process.stderr.write(`${failure}\n`); process.exit(1); }
process.stdout.write(`PASS: ${stages.length} stages; ${writes.length} deliberate writes; explicit reconciliation without replay; ${sourcePaths.length} unchanged source pins.\n`);
