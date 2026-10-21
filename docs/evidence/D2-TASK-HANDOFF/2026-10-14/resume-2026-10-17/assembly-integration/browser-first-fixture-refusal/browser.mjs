import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createState, intercept, DOC, EXISTING, TEMPLATE, existing } from '/workspace/concept2cure/docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser/mock-api.mjs';

const ROOT = '/workspace/concept2cure';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'result');
const BUNDLE = 'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser';
const sources = [
  'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  'client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx',
  'client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts',
  'client/src/concept2cure/v2/editor/assemblyBuildState.ts',
  'client/src/concept2cure/v2/editor/assemblyBuildTransport.ts',
  'client/src/concept2cure/v2/editor/assemblyDraftQueue.ts',
  'client/src/concept2cure/v2/editor/authoringDraftTransport.ts',
  'client/src/concept2cure/v2/editor/useAuthoringDraftReview.ts',
  'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
  'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx',
  'client/src/concept2cure/v2/navParams.ts',
  'client/src/concept2cure/v2/TaskTray.tsx',
  'client/src/concept2cure/v2/taskTarget.ts',
  'client/src/concept2cure/v2/shellProject.ts',
  'client/src/services/portal/authService.tsx',
  'client/src/lib/queryClient.ts',
  'client/src/utils/authToken.ts',
  'shared/authoring/assembly.ts',
  'design-system/colors_and_type.css',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'authoring-v2', 'misc-surfaces-v2', 'surface-text-ramp', 'project-home-v2']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`),
  ...['probe.tsx', 'server.mjs', 'browser.mjs', 'mock-api.mjs', 'index.html'].map(name => `${BUNDLE}/${name}`),
];
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const pins = () => Object.fromEntries(sources.map(path => [path, sha(resolve(ROOT, path))]));
const before = pins();
const scratchPins = Object.fromEntries(['server.mjs', 'browser.mjs'].map(name => [name, sha(resolve(dirname(fileURLToPath(import.meta.url)), name))]));
const state = createState('deterministic');
let releaseCommit, releaseHostRead;
const commitGate = new Promise(done => { releaseCommit = done; });
const hostReadGate = new Promise(done => { releaseHostRead = done; });
let commitRequests = 0, recoveryReads = 0, checking = false;
const stages = [], consoleErrors = [], pageErrors = [];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', error => pageErrors.push(error.message));
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === 'POST' && path === `/api/authoring/docs/${DOC}/assembly/commit`) {
    commitRequests++;
    await commitGate;
    return intercept({ request: () => route.request(), fulfill: () => route.fulfill({ status: 408,
      contentType: 'application/json', body: JSON.stringify({ success: false,
        error: { code: 'ASSEMBLY_UNCONFIRMED', message: 'Synthetic 408: the structure outcome is unconfirmed. Check the saved document.' } }) }) }, state);
  }
  if (checking && route.request().method() === 'GET' && path === `/api/authoring/docs/${DOC}/sections`) {
    recoveryReads++;
    if (recoveryReads === 2) await hostReadGate;
  }
  return intercept(route, state);
});
const pauseUntil = async predicate => {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the fixture request boundary');
    await new Promise(done => setTimeout(done, 25));
  }
};
async function record(stage, requireSameEditor = true) {
  const snapshot = await page.evaluate(() => ({ navigation: window.assemblyNavigation,
    refusal: window.assemblyLeaveRefusal(), editor: document.querySelector('.tiptap')?.textContent,
    sameEditor: window.assemblyOriginalEditor === document.querySelector('.tiptap'),
    editorCount: document.querySelectorAll('.tiptap').length,
    bridge: window.assemblyBridge,
    savedDocumentText: document.querySelector('.ed-full')?.textContent,
    assemblyText: document.querySelector('section[aria-label="Document assembly"]')?.textContent }));
  if (requireSameEditor) {
    assert.equal(snapshot.editorCount, 1);
    assert.equal(snapshot.sameEditor, true);
  }
  stages.push({ stage, ...snapshot, commitRequests, recoveryReads });
  await page.screenshot({ path: resolve(OUT, `${stage}.png`), fullPage: false });
  return snapshot;
}
let status = 'pass', failure;
try {
  await page.goto(`http://127.0.0.1:5193/${BUNDLE}/?theme=light`, { waitUntil: 'networkidle' });
  await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
  await page.evaluate(() => { window.assemblyOriginalEditor = document.querySelector('.tiptap'); });
  await page.getByText('Build document or section', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption(TEMPLATE);
  await page.getByRole('combobox', { name: 'Build target', exact: true }).getByRole('option', { name: '3.2.P.8.3 Stability data', exact: true }).waitFor({ state: 'attached' });
  await page.getByLabel('Reason for build', { exact: true }).fill('Append missing sections for deliberate human review.');
  await page.getByRole('button', { name: 'Preview build', exact: true }).click();
  await page.getByTestId('assembly-plan').waitFor();
  await page.getByRole('button', { name: 'Build document', exact: true }).click();
  await pauseUntil(() => commitRequests === 1);
  await page.getByTestId('workbench-back').click();
  const pending = await record('pending-back-held');
  assert.deepEqual(pending.navigation, []);
  assert.match(pending.refusal, /still being built/i);
  assert.equal(pending.editor, 'Existing saved stability evidence.');
  releaseCommit();
  await page.getByRole('button', { name: 'Check saved document', exact: true }).waitFor();
  await page.getByTestId('workbench-back').click();
  const unknown = await record('408-unknown-back-held');
  assert.deepEqual(unknown.navigation, []);
  assert.match(unknown.refusal, /unconfirmed/i);
  assert.equal(unknown.editor, 'Existing saved stability evidence.');
  assert.equal(commitRequests, 1);
  assert.equal(state.commits, 1);
  assert.deepEqual(state.sections.find(row => row.id === EXISTING), existing);
  state.sections.find(row => row.id === EXISTING).content = '<p>Saved text returned by verified recovery.</p>';
  checking = true;
  await page.getByRole('button', { name: 'Check saved document', exact: true }).click();
  await pauseUntil(() => recoveryReads === 2);
  await page.getByTestId('workbench-back').click();
  const applying = await record('verified-host-read-pending');
  assert.deepEqual(applying.navigation, []);
  assert.match(applying.refusal, /still being checked/i);
  assert.equal(applying.editor, 'Existing saved stability evidence.');
  releaseHostRead();
  await page.getByText(/This read cannot identify the interrupted request/).waitFor();
  const recovered = await record('verified-host-read-applied');
  assert.equal(recovered.refusal, null);
  assert.deepEqual(recovered.navigation, []);
  assert.equal(recovered.bridge.docId, DOC);
  assert.equal(recovered.editor, 'Existing saved stability evidence.');
  await page.getByTitle('Read the whole document', { exact: true }).click();
  await page.locator('.ed-full').getByText('Saved text returned by verified recovery.', { exact: true }).waitFor();
  await page.getByTestId('workbench-back').click();
  await page.waitForFunction(() => window.assemblyNavigation.length === 1);
  const left = await record('back-released-after-recovery', false);
  assert.deepEqual(left.navigation.map(item => item.route), ['host-back']);
  assert.match(left.savedDocumentText, /Saved text returned by verified recovery\./);
  assert.equal(commitRequests, 1);
  assert.equal(state.commits, 1);
  assert.equal(state.generations, 0);
  assert.equal(state.accepts, 0);
  assert.equal(state.unexpected.length, 0);
  assert.equal(pageErrors.length, 0);
  assert.equal(consoleErrors.filter(text => !/408/.test(text)).length, 0);
} catch (error) {
  status = 'fail'; failure = String(error.stack ?? error);
  await page.screenshot({ path: resolve(OUT, 'failure.png'), fullPage: false }).catch(() => undefined);
} finally {
  releaseCommit(); releaseHostRead();
  const after = pins();
  const frozen = JSON.stringify(before) === JSON.stringify(after);
  if (!frozen) status = 'fail';
  const report = { status, failure, completedAt: new Date().toISOString(),
    testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    browserVersion: browser.version(), sourcePinsBefore: before, sourcePinsAfter: after,
    sourceFrozenDuringCapture: frozen, scratchPins, stages, commitRequests, recoveryReads,
    state, consoleErrors, pageErrors,
    qualification: 'Actual Workbench, native Back control and shared surfaceLeaveRefusal registry; synthetic auth/HTTP only. Scratch Vite transform shows the existing Back control and counts its callback. Recovery preserves the active rich-editor buffer; an explicit whole-document view verifies refreshed saved sections before Back is released. TaskTray and full shell are not mounted. HTTP 408 is injected after mock persistence. No backend, native scheduling, provider, deployment or human-review claim.' };
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify({ status, frozen, stages: stages.length, commitRequests, recoveryReads, failure }));
  await context.close(); await browser.close();
  if (status !== 'pass') process.exitCode = 1;
}
