/** Actual shared canvas/workbench; explicit synthetic records, no live writes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { launchChromium } from '../../../../../scripts/visual-qa/playwright.mjs';
import { createState, intercept, chosenDoc, filing } from './browser-fixtures.mjs';
import { runArtifacts } from './browser-artifact-check.mjs';
import { evidenceJson } from './evidence-json.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..');
const diagnostic = process.argv.includes('--diagnostic');
const artifactOnly = process.argv.includes('--artifact-only');
const out = resolve(here, process.env.SHARED_EDITOR_BROWSER_OUT || (diagnostic ? 'diagnostic' : 'browser-result'));
mkdirSync(out, { recursive: true });
const area = 'client/src/concept2cure/v2', evidence = 'docs/evidence/D2-SHARED-EDITOR-ADAPTATION/2026-11-06/ui';
const sources = [
  `${area}/editor/DocumentWorkbench.tsx`, `${area}/editor/DocumentCanvas.tsx`, `${area}/editor/RichSectionEditor.tsx`,
  `${area}/editor/ProjectFilesPanel.tsx`,
  `${area}/useFilingOutline.ts`, `${area}/editor/filingSectionTarget.ts`, `${area}/editorTarget.ts`,
  `${area}/editor/workbenchLeaveTarget.ts`, `${area}/editor/writingAgencyPresentation.ts`, `${area}/editor/FilingMarkets.tsx`,
  `${area}/editor/authoringCurrentRead.ts`, `${area}/editor/documentRecordRead.ts`, `${area}/editor/programSummary.ts`,
  `${area}/editor/TemplateGuidance.tsx`, `${area}/editor/ReviewTasksPanel.tsx`, `${area}/dataConnect.tsx`, `${area}/shellProject.ts`,
  `${area}/editor/SourceImportDialog.tsx`, `${area}/editor/useSourceIntake.ts`, `${area}/authoringHandoff.ts`,
  `${area}/editor/ImportSourceNotice.tsx`, 'shared/authoring/source-import.ts', 'shared/authoring/writing-regions.ts',
  'shared/regulatory/global-document-registry.ts', 'shared/regulatory/filing-catalog.ts',
  'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts', 'client/src/utils/authToken.ts',
  'design-system/colors_and_type.css',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'authoring-v2', 'misc-surfaces-v2', 'surface-text-ramp'].map(name => `${area}/styles/${name}.css`),
  ...['browser-check.mjs', 'browser-probe.tsx', 'browser-fixtures.mjs', 'browser-artifact-check.mjs', 'browser-artifact-fixtures.mjs', 'browser-index.html', 'browser-server.mjs', 'evidence-json.mjs'].map(name => `${evidence}/${name}`),
  'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/mock-api.mjs',
  'scripts/visual-qa/playwright.mjs',
];
const pins = () => sources.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), browser = await launchChromium(), results = [];

async function assertAuthority(page, kind) {
  const expected = ['cer', 'ivdr'].includes(kind) ? 'EU / Notified Body' : filing[kind].agency;
  assert.equal(await page.locator('.ed-tree-m').innerText(), `${filing[kind].doc_type.toUpperCase()} · ${expected} · 1 sections`,
    'Selected filing displays its canonical authority without changing the stored agency key');
}
async function run(name, kind, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  const page = await context.newPage(), state = createState(kind), errors = [];
  page.setDefaultTimeout(18000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => intercept(route, state));
  let failure = null, observed;
  try {
    const query = new URLSearchParams({ kind, ...(options.canvas ? { host: 'canvas' } : {}), ...(options.handoff ? { handoff: 'true' } : {}), ...(options.whole ? { whole: 'true' } : {}) });
    await page.goto(`http://127.0.0.1:5224/${evidence}/browser-index.html?${query}`, { waitUntil: 'networkidle' });
    if (options.handoff) await page.getByRole('button', { name: `Open existing ${kind.toUpperCase()} in shared editor`, exact: true }).click();
    await page.locator('.tiptap').filter({ hasText: `Saved ${kind.toUpperCase()} source-supported working text.` }).waitFor();
    if (kind === 'missing') {
      await page.locator('.ed-tree [role="alert"]').waitFor();
      assert.ok(!(await page.locator('.ed-tree').innerText()).includes(filing.k510.title), 'Unavailable exact binding must not borrow primary requirements');
    } else {
      await page.waitForFunction(title => document.querySelector('.ed-tree-t')?.textContent === title, filing[kind].title);
      await assertAuthority(page, kind);
      assert.ok((await page.locator('.ed-tree').innerText()).includes(filing[kind].label));
      await page.getByTestId('template-guidance').locator('summary').click();
      await page.getByTestId('template-guidance').getByText(`${kind.toUpperCase()} saved-section evidence guidance`, { exact: true }).waitFor();
    }
    if (options.mobile) {
      await page.locator('.tiptap').scrollIntoViewIfNeeded();
      const reachable = await page.locator('.tiptap').evaluate(node => {
        const r = node.getBoundingClientRect(), top = Math.max(0, r.top), bottom = Math.min(window.innerHeight, r.bottom);
        if (bottom <= top || r.left < 0 || r.right > window.innerWidth) return false;
        return node.contains(document.elementFromPoint(r.left + r.width / 2, (top + bottom) / 2));
      });
      assert.ok(reachable, 'Phone editor body is reachable through normal scrolling');
    }
    assert.equal(await page.locator('.tiptap').count(), 1, 'One canonical rich editor is mounted');
    if (options.switchTo) {
      await page.locator('.ed').evaluate(node => { node.dataset.observedCanonicalInstance = 'same-instance'; });
      await page.evaluate(next => window.adaptationChoose(next), options.switchTo);
      await page.locator('.tiptap').filter({ hasText: `Saved ${options.switchTo.toUpperCase()} source-supported working text.` }).waitFor();
      await page.waitForFunction(title => document.querySelector('.ed-tree-t')?.textContent === title, filing[options.switchTo].title);
      await assertAuthority(page, options.switchTo);
      assert.equal(await page.locator('.ed').getAttribute('data-observed-canonical-instance'), 'same-instance', 'Same mounted workbench adapts without a second editor');
      assert.equal(await page.locator('.tiptap').count(), 1);
    }
    assert.deepEqual(errors, [], 'No browser runtime errors');
    assert.deepEqual(state.unexpected, [], 'No unlisted synthetic reads');
    assert.deepEqual(state.authoringWrites, [], 'Opening or adapting a document performs no regulated write');
    assert.deepEqual(state.simulatedWrites, [], 'Original read-only scenarios permit no simulated intake writes');
    if (options.handoff) assert.equal(await page.evaluate(() => window.adaptationBridge?.docId), chosenDoc(kind).id);
    observed = await page.evaluate(() => ({ title: document.querySelector('.ed-tree-t')?.textContent,
      filingSubtitle: document.querySelector('.ed-tree-m')?.textContent,
      editorText: document.querySelector('.tiptap')?.textContent, editorCount: document.querySelectorAll('.tiptap').length,
      editorBounds: (() => { const r = document.querySelector('.tiptap')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; })(),
      notice: document.querySelector('.ed-tree [role="alert"]')?.textContent ?? null,
      viewport: { width: window.innerWidth, height: window.innerHeight }, documentWidth: document.documentElement.scrollWidth,
      bridge: window.adaptationBridge ?? null }));
    if (options.capture) await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 45, fullPage: false });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failure = error.message;
    observed = await page.evaluate(() => ({ title: document.querySelector('.ed-tree-t')?.textContent,
      editorText: document.querySelector('.tiptap')?.textContent, body: document.body.innerText.slice(0, 6000) })).catch(() => null);
    await page.screenshot({ path: resolve(out, `${name}-failure.jpg`), type: 'jpeg', quality: 45, fullPage: false }).catch(() => {});
    process.stdout.write(`FAIL ${name}: ${failure}\n`);
  } finally { await context.close(); }
  results.push({ name, kind, options, passed: failure === null, failure, observed, errors,
    requests: state.requests, unexpected: state.unexpected, authoringWrites: state.authoringWrites, ancillaryWrites: state.ancillaryWrites });
}
try {
  if (!artifactOnly) {
    await run('bound-secondary-cer', 'cer', { capture: true, ...(!diagnostic ? { switchTo: 'ivdr' } : {}) });
    if (!diagnostic) {
      await run('bound-ivdr-performance', 'ivdr');
      await run('bound-medicinal-ind', 'ind');
      await run('bound-added-market', 'market');
      await run('unavailable-binding-refuses-primary', 'missing');
      await run('cer-ninth-document-handoff', 'cer', { handoff: true });
      await run('ivdr-tenth-document-handoff', 'ivdr', { handoff: true });
      await run('whole-cer-filing-handoff', 'cer', { handoff: true, whole: true });
      await run('conversation-canvas-same-cer-editor', 'cer', { canvas: true, capture: true });
      await run('phone-canvas-ivdr-editor', 'ivdr', { canvas: true, mobile: true, capture: true });
    }
  }
  if (!diagnostic || artifactOnly) results.push(...await runArtifacts(browser, out, evidence));
} finally { await browser.close(); }
const after = pins(), stable = JSON.stringify(after) === JSON.stringify(before);
const result = { passed: stable && results.every(row => row.passed), sourceInputsStable: stable, syntheticInterceptedRecords: true,
  actualComponents: ['DocumentWorkbench', 'DocumentCanvas', 'RichSectionEditor', 'TemplateGuidance', 'useFilingOutline', 'SourceImportDialog'],
  authenticatedClientAcceptance: false, deployedApplicationTested: false, productionWriteExecuted: false,
  liveSignatureExecuted: false, sourcePins: before, checks: results };
writeFileSync(resolve(out, 'result.json'), evidenceJson(result));
assert.deepEqual(after, before, 'Selected source inputs changed during browser qualification');
if (!result.passed) process.exitCode = 1;
