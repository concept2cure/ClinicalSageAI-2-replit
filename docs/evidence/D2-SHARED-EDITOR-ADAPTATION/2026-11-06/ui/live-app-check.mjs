/** Disposable LOCAL application/DB walk. No API interception or AI generation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../../../../scripts/visual-qa/playwright.mjs';
import { evidenceJson } from './evidence-json.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..');
const base = process.env.SHARED_EDITOR_LIVE_URL || 'http://127.0.0.1:5100';
const runId = process.env.SHARED_EDITOR_LIVE_RUN_ID || new Date().toISOString();
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'This write qualification is local only');
const seeds = JSON.parse(readFileSync(process.env.SHARED_EDITOR_LIVE_SEED || '/workspace/scratch/shared-editor-live-documents.json', 'utf8'));
assert.equal(seeds.length, 2);
const out = resolve(here, 'live-result'); mkdirSync(out, { recursive: true });
const area = 'client/src/concept2cure/v2';
const sources = [`${area}/surfaces/Vault.tsx`, `${area}/fixtures/vault-data.ts`, `${area}/editorTarget.ts`,
  `${area}/editor/DocumentWorkbench.tsx`, `${area}/editor/DocumentCanvas.tsx`, `${area}/editor/RichSectionEditor.tsx`,
  `${area}/editor/ProjectFilesPanel.tsx`,
  `${area}/editor/filingSectionTarget.ts`, `${area}/editor/workbenchLeaveTarget.ts`, `${area}/useFilingOutline.ts`,
  `${area}/editor/useScopedDocuments.ts`,
  `${area}/editor/writingAgencyPresentation.ts`, `${area}/editor/authoringCurrentRead.ts`, `${area}/shellProject.ts`,
  `${area}/surfaces/DocumentAuthoring.tsx`, `${area}/surfaces/Projects.tsx`, `${area}/V2App.tsx`,
  'server/routes/c2c/project-vault.ts', 'server/routes/authoring.router.ts', 'server/routes/auth.ts',
  'server/services/authoring/authoring-program-access.ts',
  'server/db/poolInstrumentation.ts', 'server/db/sessionScope.ts', 'server/db/tenantStore.ts',
  'server/db/withTenantConnection.ts', 'server/middleware/establishRequestTenantScope.ts',
  'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts',
  'docs/evidence/D2-SHARED-EDITOR-ADAPTATION/2026-11-06/ui/live-app-check.mjs',
  'docs/evidence/D2-SHARED-EDITOR-ADAPTATION/2026-11-06/ui/evidence-json.mjs'];
const pins = () => sources.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), browser = await launchChromium(), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), requests = [], responses = [], errors = [], checks = [];
page.setDefaultTimeout(30000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith('/api/')) return;
  const row = { method: request.method(), path: url.pathname };
  if (row.method === 'PATCH' && /^\/api\/authoring\/sections\/[^/]+$/.test(row.path)) {
    const body = request.postDataJSON();
    row.changeReason = body.changeReason;
    row.expectedUpdatedAt = body.expectedUpdatedAt ?? null;
    row.contentSha256 = createHash('sha256').update(body.content).digest('hex');
  }
  requests.push(row);
});
page.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/api/')) responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
});
async function read(path) {
  return page.evaluate(async endpoint => {
    const { apiRequest } = await import('/src/lib/queryClient.ts');
    const response = await apiRequest('GET', endpoint);
    return { status: response.status, body: await response.json() };
  }, path);
}
async function capture(name) {
  await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 35, fullPage: false });
}
async function vaultOpen(seed) {
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('button', { name: 'Vault', exact: true }).click();
  await page.getByLabel('Search this vault', { exact: true }).waitFor();
  const response = await read(`/api/c2c/project-vault/${seed.programId}`);
  assert.equal(response.status, 200);
  const payload = response.body.data ?? response.body;
  let selected = null;
  function visit(nodes, filingId = null, parent = null) {
    for (const node of nodes) {
      const bound = node.filingDocumentId ?? filingId;
      if (Array.isArray(node.children)) visit(node.children, bound, node);
      else if (bound === seed.filingId && node.filingSectionKey === seed.sectionCode) selected = { leaf: node, parent, filingId: bound };
    }
  }
  visit(payload.tree);
  assert.ok(selected?.parent, 'Exact saved filing and section exist in the actual Vault read model');
  const parentLabel = selected.parent.label;
  await page.locator('.vd-folder').filter({ has: page.locator('.vd-flabel').filter({ hasText: parentLabel }) }).last().click();
  const row = page.locator('.vd-row').filter({ hasText: selected.leaf.title });
  assert.equal(await row.count(), 1, 'One exact section leaf is selectable in its recorded folder');
  await row.click();
  await capture(`${seed.filing}-vault-section`);
  const opened = page.waitForResponse(response => response.request().method() === 'GET'
    && new URL(response.url()).pathname === `/api/authoring/docs/${seed.documentId}/sections`);
  await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
  assert.equal((await opened).status(), 200);
  await page.locator('.tiptap').waitFor();
  assert.equal(await page.locator('.tiptap').count(), 1, 'Vault opens the canonical editor once');
  return { filingId: selected.filingId, sectionKey: selected.leaf.filingSectionKey, leafTitle: selected.leaf.title, parentLabel };
}
let failure = null, authentication = null;
try {
  await page.goto(`${base}/concept2cure/login`, { waitUntil: 'networkidle' });
  authentication = await page.evaluate(async () => {
    const response = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'shared.editor.tester@example.invalid' }) });
    const body = await response.json();
    if (!response.ok || !body.success || typeof body.accessToken !== 'string') throw new Error('Disposable local dev login failed');
    const { authService } = await import('/src/services/portal/authService.tsx');
    const adopted = await authService.adoptSession(body.accessToken, false);
    return { adopted: Boolean(adopted), actorId: adopted?.id ?? null, organizationId: adopted?.organizationId ?? null };
  });
  assert.equal(authentication.adopted, true);
  assert.equal(String(authentication.organizationId), '2');
  for (const seed of seeds) {
    const projectTitle = seed.filing === '510k' ? 'Shared editor device verification' : 'Shared editor medicinal verification';
    await page.goto(`${base}/concept2cure/projects`, { waitUntil: 'networkidle' });
    await page.getByLabel('Search projects by title or code', { exact: true }).fill(projectTitle);
    await page.locator('.pj-card').filter({ hasText: projectTitle }).click();
    await page.waitForFunction(programId => window.C2C_PROJECT?.id === programId, seed.programId);
    const leaf = await vaultOpen(seed);
    const header = await read(`/api/authoring/docs/${seed.documentId}?programId=${seed.programId}`);
    assert.equal(header.status, 200);
    assert.equal(header.body.document.id, seed.documentId);
    assert.equal(header.body.document.client_program_id, seed.programId);
    assert.equal(header.body.document.c2c_document_id, seed.filingId);
    const marker = `Local ${seed.filing.toUpperCase()} shared editor verification ${runId}.`;
    const reason = `Verify ${seed.filing.toUpperCase()} local shared editor save and reopen (${runId}).`;
    const editor = page.locator('.tiptap');
    await editor.click(); await editor.press('Control+End'); await editor.press('Enter'); await editor.pressSequentially(marker);
    await page.getByLabel('Reason for change', { exact: true }).fill(reason);
    const saved = page.waitForResponse(response => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `/api/authoring/sections/${seed.sectionId}`);
    await page.getByTestId('save-section').click();
    assert.equal((await saved).status(), 200);
    await page.waitForFunction(() => !document.querySelector('[data-testid="ed-saved"]')?.hasAttribute('data-dirty'));
    await capture(`${seed.filing}-saved-editor`);
    const record = await read(`/api/authoring/docs/${seed.documentId}/sections?programId=${seed.programId}`);
    assert.equal(record.status, 200);
    const section = record.body.sections.find(row => row.id === seed.sectionId);
    assert.equal(section.doc_id, seed.documentId);
    assert.equal(section.code, seed.sectionCode);
    assert.ok(section.content.includes(marker));
    const audit = await read(`/api/authoring/docs/${seed.documentId}/audit`);
    assert.equal(audit.status, 200);
    const event = audit.body.events.find(row => row.section_id === seed.sectionId && row.change_reason === reason);
    assert.ok(event, 'The actual document audit read retains the stated save reason');
    await page.reload({ waitUntil: 'networkidle' });
    const reopened = await vaultOpen(seed);
    await page.locator('.tiptap').filter({ hasText: marker }).waitFor();
    await capture(`${seed.filing}-reopened-editor`);
    checks.push({ filing: seed.filing, passed: true, programId: seed.programId, filingId: seed.filingId,
      documentId: seed.documentId, sectionId: seed.sectionId, sectionCode: seed.sectionCode, selectedLeaf: leaf,
      reopenedLeaf: reopened, marker, reason, savedContentSha256: createHash('sha256').update(section.content).digest('hex'),
      auditEvent: { id: event.id, section_id: event.section_id, event_type: event.event_type,
        change_reason: event.change_reason, content_hash_after: event.content_hash_after, integrity: event.integrity } });
    process.stdout.write(`PASS local ${seed.filing} Vault → shared editor → save → reload → reopen\n`);
  }
  const allowed = new Set(seeds.map(seed => `/api/authoring/sections/${seed.sectionId}`));
  const regulated = requests.filter(row => !['GET', 'HEAD', 'OPTIONS'].includes(row.method)
    && /^\/api\/(authoring\/|c2c\/project-vault\/|vault\/|submissions)/.test(row.path));
  assert.equal(regulated.length, 2, 'Only the two explicit disposable section saves write regulated content');
  assert.ok(regulated.every(row => row.method === 'PATCH' && allowed.has(row.path)));
  assert.equal(requests.filter(row => /\/api\/ana-ri\/stream|\/api\/[^?]*\/ai\//.test(row.path)).length, 0, 'No AI provider call intended or invoked');
  assert.deepEqual(errors, [], 'No browser runtime error');
} catch (error) {
  failure = error.message;
  await capture('failure').catch(() => {});
  process.stdout.write(`FAIL local application walk: ${failure}\n`);
} finally { await context.close(); await browser.close(); }
const after = pins(), stable = JSON.stringify(after) === JSON.stringify(before);
const result = { passed: failure === null && stable && checks.length === 2, failure, runId, sourceInputsStable: stable,
  authenticatedLocalApplicationTested: Boolean(authentication?.adopted), deployedApplicationTested: false, apiInterceptionUsed: false,
  disposableLocalWriteExecuted: responses.some(row => row.method === 'PATCH' && row.path.startsWith('/api/authoring/sections/') && row.status >= 200 && row.status < 300),
  productionWriteExecuted: false, iamOrMfaQualified: false,
  aiProviderQualified: false, liveSignatureExecuted: false, authentication, sourcePins: before, checks, requests, responses, errors };
writeFileSync(resolve(out, 'result.json'), evidenceJson(result));
assert.deepEqual(after, before, 'Selected local application sources changed during qualification');
if (!result.passed) process.exitCode = 1;
