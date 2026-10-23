import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..'), out = resolve(here, 'result');
mkdirSync(out, { recursive: true });
const paths = [
  'client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx', 'client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx',
  'client/src/concept2cure/v2/surfaces/indFormsPanelRecords.ts',
  'client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx', 'client/src/concept2cure/v2/surfaces/submissionScopedRead.ts',
  'client/src/concept2cure/v2/shellProject.ts', 'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts',
  'shared/constants/governed-reason.ts', 'package.json', 'package-lock.json', 'design-system/colors_and_type.css',
  ...['app-v2.css', 'journey-v2.css', 'coverage-v2.css', 'misc-surfaces-v2.css', 'submission-v2.css', 'surface-text-ramp.css'].map(name => `client/src/concept2cure/v2/styles/${name}`),
  ...['probe.tsx', 'check.mjs', 'index.html', 'server.mjs'].map(name => `docs/evidence/MR-10/2026-10-21-applicant-identity/browser/${name}`),
];
const pins = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const before = pins();
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', S = '33333333-3333-4333-8333-333333333333';
const clone = value => globalThis.structuredClone(value);
const auditTrail = { persisted: true, chained: true };
const clear = { cleared: true, blockers: [] };
function dispatchReadiness() {
  return { sequenceId: 7, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0,
    unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
    gate: { cleared: false, blockers: ['The current recorded identity needs a release signature.'] }, freezeGate: clear, dispatchGateOnSigning: clear,
    releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
    readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
    dispatchAuthorization: { reauthorizing: true, eligible: mode !== 'renewal-blocked', refusal: mode === 'renewal-blocked' ? 'A transmission has already been attempted.' : null }, signer: { state: 'independent' } };
}
let serial = 0, mode = 'normal', pending = null, programs, sponsors;
const version = () => `2026-10-21T01:00:${String(++serial).padStart(2, '0')}.123456Z`;
const blankProgram = id => ({ id, code: id === A ? 'SYNTHETIC-A' : 'SYNTHETIC-B', name: 'Synthetic qualification program', programType: 'IND', primaryAgency: 'FDA',
  sponsorName: 'Synthetic tenant organization', productName: 'Synthetic product', indication: null, applicationNumber: null, sponsorAddress: null,
  indType: null, applicantSponsorId: null, boundSponsor: null, factsVersion: version(), formMetadata: {} });
const seed = () => { programs = { [A]: blankProgram(A), [B]: blankProgram(B) }; sponsors = []; pending = null; };
const writes = [], requests = [], stages = [], errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function sponsorRequest(route, request, method, path) {
  if (path === '/api/ind-master-data/sponsors' && method === 'GET') {
    if (mode === 'registry-error') return send(route, { error: { message: 'Synthetic read outage' } }, 503);
    return send(route, sponsors);
  }
  if (path.startsWith('/api/ind-master-data/sponsors') && ['POST', 'PATCH'].includes(method)) {
    const body = request.postDataJSON(); writes.push({ method, path, body });
    if (mode === 'registry-204') return route.fulfill({ status: 204 });
    const old = method === 'PATCH' ? sponsors.find(row => path.endsWith(row.id)) : null;
    const row = { ...old, ...body, id: old?.id ?? S, revision: version() };
    delete row.reason; delete row.expectedRevision;
    sponsors = [row, ...sponsors.filter(item => item.id !== row.id)];
    for (const program of Object.values(programs)) if (program.applicantSponsorId === row.id) Object.assign(program, { sponsorName: row.name, boundSponsor: row });
    return send(route, { ...row, auditTrail: mode === 'audit-missing' ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : auditTrail }, method === 'POST' ? 201 : 200);
  }
}
async function programRequest(route, request) {
  {
    const body = request.postDataJSON(); writes.push({ method: 'PUT', path: '/api/ind-forms/program-facts', body });
    const program = programs[body.projectIdent];
    const receipt = { ...program, ...body, programId: program.id, factsVersion: version(), boundSponsor: sponsors.find(row => row.id === body.applicantSponsorId) ?? null, auditTrail };
    receipt.sponsorName = receipt.boundSponsor?.name ?? 'Synthetic tenant organization';
    if (mode === 'stale') { pending = { route, receipt }; return; }
    if (mode === 'program-204') return route.fulfill({ status: 204 });
    if (mode === 'mismatch') return send(route, { ...receipt, programId: B });
    Object.assign(program, receipt);
    return send(route, receipt);
  }
}
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  requests.push({ method, path });
  if (path === '/api/v1/auth/session') return send(route, { authenticated: true, user: { id: '9', organizationId: '1', email: 'applicant@example.test', firstName: 'Synthetic', lastName: 'Reviewer', roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false } });
  if (path === '/api/ind-forms/' && method === 'GET') {
    const program = programs[url.searchParams.get('projectIdent') ?? A];
    return send(route, { forms: ['FDA_1571'], program, placements: [], renderPlans: [], formDefinitions: [{ formId: 'FDA_1571', fields: [{ id: 'ind_type', options: ['Commercial IND', 'Research IND'] }] }] });
  }
  if (path.startsWith('/api/ind-master-data/sponsors')) return sponsorRequest(route, request, method, path);
  if (path === '/api/ind-forms/program-facts' && method === 'PUT') return programRequest(route, request);
  if (path.endsWith('/dispatch-readiness')) return send(route, { success: true, data: dispatchReadiness() });
  if (path.endsWith('/build')) { const body = request.postDataJSON(); writes.push({ method, path, body }); return send(route, { formId: 'FDA_1571', fields: {}, missingRequired: ['sponsor.name'] }); }
  return send(route, []);
});
const identity = () => page.getByRole('region', { name: 'Recorded applicant identity' });
async function start(nextMode = 'normal') {
  mode = nextMode; seed();
  await page.goto('http://127.0.0.1:5198/docs/evidence/MR-10/2026-10-21-applicant-identity/browser/', { waitUntil: 'networkidle' });
  await identity().getByRole('button', { name: 'Record a sponsor', exact: true }).waitFor();
}
async function snapshot(name, region = identity()) { const text = await region.innerText(); await region.screenshot({ path: resolve(out, `${name}.png`) }); stages.push({ name, text }); }
async function editProgram(number = '123456') {
  await page.getByLabel('Agency application number', { exact: true }).fill(number);
  await page.getByLabel('Reason for program facts change', { exact: true }).fill('Record confirmed applicant facts for qualification');
}
async function createSponsor() {
  await page.getByRole('button', { name: 'Record a sponsor', exact: true }).click();
  for (const [label, value] of [['Sponsor legal name', 'Synthetic recorded applicant'], ['DUNS number', '123456789'], ['Regulatory contact name', 'Synthetic regulatory contact'], ['Regulatory contact telephone', '+1 555 0100'], ['Regulatory contact email', 'ra@example.test'], ['Authorized representative name', 'Synthetic authorized representative'], ['Authorized representative title', 'Regulatory representative'], ['Reason for sponsor record change', 'Record verified synthetic qualification facts']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Save sponsor record', exact: true }).click();
}
try {
  await start();
  await page.getByLabel('Agency application number', { exact: true }).fill('123456');
  assert.equal(await page.getByRole('button', { name: 'Save to program', exact: true }).isDisabled(), true);
  await snapshot('01-required-reason');
  await createSponsor();
  await page.getByText(/it is not bound to this program/).waitFor();
  assert.equal(writes.filter(row => row.path.endsWith('program-facts')).length, 0);
  await snapshot('02-registry-saved-unbound');
  await page.getByRole('button', { name: 'Close sponsor editor', exact: true }).click();
  await page.getByLabel('Applicant sponsor record', { exact: true }).selectOption(S);
  await editProgram();
  await page.getByRole('button', { name: 'Save to program', exact: true }).click();
  await identity().getByText('Program facts saved.', { exact: true }).waitFor();
  assert.equal(programs[A].applicantSponsorId, S);
  assert.ok(writes.find(row => row.path.endsWith('program-facts')).body.expectedFactsVersion);
  await snapshot('03-program-explicitly-bound');
  await page.getByRole('button', { name: 'Edit selected sponsor', exact: true }).click();
  await page.getByText(/Every program bound to this sponsor/).waitFor();
  await page.getByLabel('Regulatory contact email', { exact: true }).fill('updated@example.test');
  await page.getByLabel('Reason for sponsor record change', { exact: true }).fill('Update the shared regulatory contact');
  mode = 'audit-missing';
  await page.getByRole('button', { name: 'Save sponsor record', exact: true }).click();
  await page.getByText(/sponsor record was saved, but its audit entry could not be confirmed/).waitFor();
  assert.ok(writes.find(row => row.method === 'PATCH').body.expectedRevision);
  await snapshot('04-shared-edit-audit-outcome');
  for (const variant of ['program-204', 'mismatch']) {
    await start(variant); const count = writes.length;
    await editProgram(); await page.getByRole('button', { name: 'Save to program', exact: true }).click();
    await page.getByText(/could not confirm whether the program facts were saved/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save to program', exact: true }).isDisabled(), true);
    assert.equal(writes.length, count + 1);
    await snapshot(`05-${variant}-held`);
    await page.getByRole('button', { name: 'Reload recorded program facts', exact: true }).click();
    await page.getByText(/Recorded program facts reloaded/).waitFor();
    assert.equal(writes.length, count + 1);
  }
  await start('registry-204'); const count = writes.length;
  await createSponsor();
  await page.getByText(/could not confirm whether the sponsor record was saved/).waitFor();
  await page.getByRole('button', { name: 'Close sponsor editor', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Record a sponsor', exact: true }).isDisabled(), true);
  assert.equal(writes.length, count + 1);
  await snapshot('06-uncertain-create-no-replay');
  await start('registry-error');
  await page.getByText(/Sponsor records could not be read/).waitFor();
  assert.equal(await page.getByText('No sponsor records have been recorded.', { exact: true }).count(), 0);
  await snapshot('07-registry-error-is-not-empty');
  await start('stale');
  await editProgram(); await page.getByRole('button', { name: 'Save to program', exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Saving…'));
  assert.ok(pending);
  await page.getByRole('button', { name: 'Revisit synthetic program A', exact: true }).click();
  await page.getByLabel('Agency application number', { exact: true }).waitFor();
  await send(pending.route, clone(pending.receipt)); pending = null;
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByLabel('Agency application number', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Qualification notification').innerText(), '');
  await snapshot('08-old-visit-receipt-fenced');
  await start('renewal');
  await page.getByRole('button', { name: 'Show synthetic dispatch renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Re-sign release for current recorded facts (Part 11 e-signature)', exact: true }).click();
  await page.getByText('Existing governed dispatch callback requested', { exact: true }).waitFor();
  await snapshot('09-unsent-dispatch-renewal-reachable', page.getByRole('region', { name: 'Synthetic dispatch qualification' }));
  await start('renewal-blocked');
  await page.getByRole('button', { name: 'Show synthetic dispatch renewal', exact: true }).click();
  await page.getByText('A transmission has already been attempted.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Re-sign release/ }).count(), 0);
  await snapshot('10-attempted-dispatch-renewal-refused', page.getByRole('region', { name: 'Synthetic dispatch qualification' }));
  assert.deepEqual(errors, []);
  assert.deepEqual(pins(), before, 'Browser inputs changed during qualification.');
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({ syntheticRecords: true, humanWitnessed: false, sourcePins: before, stages, writes, requests, pageErrors: errors, passed: true }, null, 2) + '\n');
  process.stdout.write(`Passed ${stages.length} browser stages; ${writes.length} deliberate writes; no page errors.\n`);
} finally { await browser.close(); }
