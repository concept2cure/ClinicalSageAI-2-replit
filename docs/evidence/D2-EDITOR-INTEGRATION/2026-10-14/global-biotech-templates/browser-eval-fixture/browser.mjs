import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApiState, interceptApi } from './mock-api.mjs';
import { accessibility, measure } from './visual-checks.mjs';

const BUNDLE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const OUT = resolve(BUNDLE, '..');
const URL_PATH = '/' + relative(ROOT, BUNDLE).split(sep).join('/') + '/';
const raw = readFileSync(new URL('./api-contract.json', import.meta.url), 'utf8');
const snapshot = JSON.parse(raw);
const sourcePaths = [
  'design-system/colors_and_type.css',
  'client/src/concept2cure/v2/styles/app-v2.css',
  'client/src/concept2cure/v2/styles/journey-v2.css',
  'client/src/concept2cure/v2/styles/coverage-v2.css',
  'client/src/concept2cure/v2/styles/authoring-v2.css',
  'client/src/concept2cure/v2/styles/misc-surfaces-v2.css',
  'client/src/concept2cure/v2/styles/surface-text-ramp.css',
  'client/src/concept2cure/v2/editor/DocumentCanvas.tsx',
  'client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx',
  'client/src/concept2cure/v2/C2CForm.tsx',
  'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
  'client/src/concept2cure/v2/editor/TemplateGuidance.tsx',
  'client/src/concept2cure/v2/editor/AssignReviewDialog.tsx',
  'client/src/concept2cure/v2/editor/ReviewTasksPanel.tsx',
  'client/src/concept2cure/v2/editor/SendForReviewDialog.tsx',
  'client/src/concept2cure/v2/editor/reviewTaskState.ts',
  'client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx',
  'client/src/concept2cure/v2/surfaces/authoringPeerReview.ts',
  'client/src/concept2cure/v2/surfaces/usePeerReviewDecision.ts',
  'client/src/concept2cure/v2/styles/review-decision.css',
  'client/src/concept2cure/v2/editor/provenance.ts',
  'client/src/concept2cure/v2/editor/savedTemplateContext.ts',
  'client/src/concept2cure/v2/editor/authoringOversight.ts',
  'shared/authoring/recorded-template-source.ts',
  'server/services/ana/saved-document-critique.ts',
  'server/services/ana/saved-template-review.ts',
  'server/services/ana/writingQualityTools.ts',
  'server/services/authoring/authoring-template-guidance.ts',
  'server/services/authoring/ind-authoring-templates.ts',
  'server/services/authoring/builtin-authoring-templates.ts',
  'server/services/market-specs/document-template-library.ts',
  'shared/regulatory/global-document-registry.ts',
];
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const productionPins = () => Object.fromEntries(sourcePaths.map(path => [path, sha256(resolve(ROOT, path))]));
const originalPins = productionPins();
const fixturePins = Object.fromEntries(readdirSync(BUNDLE).filter(file => /\.(?:tsx?|mjs|json|html)$/.test(file))
  .map(file => [file, sha256(resolve(BUNDLE, file))]));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
function assert(ok, reason) { if (!ok) throw new Error(reason); }
const editor = page => page.locator('.ProseMirror');

async function startPage(width, theme, selected) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 },
    hasTouch: width === 390, isMobile: width === 390, colorScheme: theme });
  const page = await context.newPage();
  const state = createApiState(snapshot, selected);
  page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push(message.text()); });
  page.on('pageerror', error => state.pageErrors.push(error.message));
  await page.route('**/api/**', route => interceptApi(route, state));
  await page.addInitScript(actor => {
    localStorage.setItem('trialsage_access_token', 'synthetic-browser-token');
    localStorage.setItem('trialsage_user', JSON.stringify(actor));
  }, snapshot.actor);
  await page.goto(`http://127.0.0.1:5178${URL_PATH}?theme=${theme}&case=${selected.key}`);
  await page.getByRole('button', { name: 'New document', exact: true }).waitFor();
  return { context, page, state };
}

async function readyEditor(page, expected) {
  await editor(page).waitFor();
  await page.waitForFunction(() => window.templateBridge?.sectionId);
  await page.waitForFunction(text => document.querySelector('.ProseMirror')?.textContent === text, expected);
  await page.locator('[data-testid="template-guidance"]').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="template-guidance"] [role="status"]'));
}

async function createFromExistingPicker(page, state, selected, label) {
  assert(state.mutations.length === 0, 'A mutation happened before an explicit create');
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Document title/ }).fill(selected.document.title);
  await dialog.getByLabel('Start from', { exact: true }).selectOption(selected.source.id);
  assert(await dialog.getByLabel('Start from', { exact: true }).inputValue() === selected.source.id,
    'The exact canonical UUID was not selected');
  const moduleValue = await dialog.getByLabel('CTD module', { exact: true }).inputValue();
  assert(moduleValue === (selected.document.module ?? 'No CTD placement (preparation)'), 'The picker inferred CTD placement');
  const pickerReference = await assertPickerReference(dialog);
  assert(state.mutations.length === 0, 'Choosing a template performed an automatic write');
  const pickerStage = await capture(page, label, selected.key, 'picker', { expectedEditors: 0 });
  pickerStage.pickerReference = pickerReference;
  const stages = [pickerStage];
  state.allowCreate = true;
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await readyEditor(page, '');
  assert(state.created && state.mutations.length === 1, 'The explicit create did not use the exact synthetic POST');
  assert(selected.sections.every(section => section.content === ''), 'Created fixture authored bodies are not empty');
  stages.push(await capture(page, label, selected.key, 'created-empty', { requireEditingViewport: true }));
  // A separate, explicit evaluation phase supplies synthetic saved text through
  // GET after remounting the actual canvas. It is not a product save operation.
  state.savedExample = true;
  await page.evaluate(() => window.loadSyntheticSavedExample());
  await readyEditor(page, selected.plainBody);
  return stages;
}

async function assertPickerReference(dialog) {
  const summary = dialog.locator('.de-desc');
  const text = await summary.innerText();
  for (const phrase of ['Creates an empty working copy.', 'Confirm product and jurisdiction',
    'retain original forms, data and signed records', 'full applicability limits',
    'missing-outline notices', 'Template guidance and source requirements']) {
    assert(text.includes(phrase), 'The concise picker summary omitted a working-copy limitation or full-guidance pointer');
  }
  const body = await dialog.locator('.de-body').boundingBox();
  const controls = {
    module: await dialog.getByLabel('CTD module', { exact: true }).boundingBox(),
    startFrom: await dialog.getByLabel('Start from', { exact: true }).boundingBox(),
    summary: await summary.boundingBox(),
  };
  for (const bounds of Object.values(controls)) {
    assert(bounds && body && bounds.y >= body.y && bounds.y + bounds.height <= body.y + body.height,
      'A picker control or summary is below the visible drawer body before any scrolling');
  }
  const scrollTop = await dialog.locator('.de-body').evaluate(element => element.scrollTop);
  assert(scrollTop === 0, 'The concise picker required drawer scrolling');
  return { text, controls, body, scrollTop };
}

async function capture(page, label, key, stage, { requireEditingViewport = false, expectedEditors = 1 }) {
  if (requireEditingViewport) {
    await editor(page).scrollIntoViewIfNeeded();
    await editor(page).locator('p').first().scrollIntoViewIfNeeded();
  }
  const metrics = await measure(page);
  const passage = requireEditingViewport ? await editor(page).locator('p').first().evaluate(p => {
    const r = p.getBoundingClientRect();
    return { text: p.textContent, x: r.x, y: r.y, width: r.width, height: r.height };
  }) : null;
  const axe = await accessibility(page);
  const name = `browser-${label}-${key}-${stage}`;
  writeFileSync(resolve(OUT, name + '-metrics.json'), JSON.stringify({ metrics, passage, axe }, null, 2) + '\n');
  await page.screenshot({ path: resolve(OUT, name + '.png'), fullPage: true });
  assert(await editor(page).count() === expectedEditors, 'Unexpected native editor count');
  assert(metrics.page.scrollWidth <= metrics.viewport.width, 'Horizontal page overflow');
  if (requireEditingViewport) {
    const visible = metrics.visibleEditableViewport;
    assert(visible?.width >= 250 && visible?.height >= 100, 'Native editing viewport is below 250x100');
    assert(passage.x >= visible.x - 1 && passage.y >= visible.y - 1
      && passage.x + passage.width <= visible.x + visible.width + 1
      && passage.y + passage.height <= visible.y + visible.height + 1, 'Synthetic preparation paragraph is clipped');
  }
  return { stage, metrics, passage, axe };
}

async function assertAsk(page, selected, label) {
  const previous = await page.evaluate(() => window.templateAsks.length);
  const review = page.getByText('Review with AnA', { exact: true });
  if (await page.locator('.authoring-oversight-options').getAttribute('open') === null) await review.click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForFunction(count => window.templateAsks.length === count + 1, previous);
  const ask = await page.evaluate(() => window.templateAsks.at(-1));
  assertAskScope(ask, selected);
  return { action: label, ...ask };
}

function assertAskScope(ask, selected) {
  const context = ask.origin?.moduleContext;
  assert(ask.sendOnArrival === false, 'Conversation prefill was marked for automatic send');
  assert(context?.documentId === selected.document.id && context?.sectionId === selected.sections[0].id,
    'Saved document or section scope was lost');
  assert(context?.templateId === selected.source.id && context?.templateSourceState === 'recorded',
    'Recorded template identity was lost');
  assert(JSON.stringify(context?.templateSource) === JSON.stringify(selected.source), 'Recorded template source, filing context or limits changed');
  assert(JSON.stringify(context?.templateSource?.filingContext) === JSON.stringify(selected.source.filingContext), 'Exact recorded filing context changed');
  assertPrompt(ask, selected);
}

function assertPrompt(ask, selected) {
  assert(ask.prefill.includes('critique_document') && ask.prefill.includes('expected_snapshot')
    && ask.prefill.includes('get_document_template') && ask.prefill.includes('read_authoring_section'), 'Saved review or remedy reading instruction is missing');
  assert(ask.prefill.includes('aiDraftable') && ask.prefill.includes('original official form, dataset, certificate or signed record')
    && ask.prefill.includes('do not save, accept, approve or file'), 'Original-record or governed-write limits are missing');
  assert(!ask.prefill.includes(selected.document.title) && !ask.prefill.includes(selected.plainBody),
    'Stored title or body leaked into fixed instructions');
  assert(!JSON.stringify(ask.origin).includes(selected.plainBody), 'Unsaved or copied authored HTML entered screen context');
}

async function runCase(width, theme, label, selected) {
  const { context, page, state } = await startPage(width, theme, selected);
  const result = { key: selected.key, entryId: selected.source.entryId, module: selected.document.module,
    filingContext: selected.source.filingContext, syntheticCreateOnly: true, status: 'pending' };
  try {
    const stages = await createFromExistingPicker(page, state, selected, label);
    assert(await editor(page).getAttribute('contenteditable') === 'true', 'Preparation editor is not available for source-supported work');
    const sourceHeader = await page.locator('[data-testid="doc-provenance"]').innerText();
    const expectedKind = selected.source.kind === 'preparation' ? 'preparation worksheet' : 'working scaffold';
    assert(sourceHeader.includes('Created from a regulatory template') && sourceHeader.includes(expectedKind), 'Existing source header lost recorded template kind');
    assert(!sourceHeader.includes('verified') && !sourceHeader.includes('approved'), 'Template header claims verification or approval');
    const title = await page.locator('.ed-mast').innerText();
    assert(title.includes(selected.document.title), 'Renamed document title was not preserved');
    const crumbs = await page.locator('.ed-crumbs').innerText();
    const moduleLabel = selected.document.module ?? 'Unbound draft';
    assert(crumbs.includes(moduleLabel), 'Recorded module or unbound placement is missing from the existing header');
    stages.push(await capture(page, label, selected.key, 'editor', { requireEditingViewport: true }));
    const disclosure = page.locator('[data-testid="template-guidance"]');
    await disclosure.locator('summary').click();
    assert(await disclosure.getAttribute('open') !== null, 'Existing guidance disclosure did not open');
    const guidanceText = await disclosure.innerText();
    for (const limitation of selected.source.limitations) assert(guidanceText.includes(limitation), 'Stored source limitation was omitted from disclosure');
    const recordedText = selected.guidance[0].response.template_guidance[0].guidance_text;
    assert((await disclosure.locator('p').allTextContents()).includes(recordedText), 'Exact saved section guidance was omitted');
    assert(!guidanceText.includes('could not be read'), 'Guidance read failed');
    await disclosure.locator('summary').scrollIntoViewIfNeeded();
    stages.push(await capture(page, label, selected.key, 'guidance', {}));
    await disclosure.locator('summary').click();
    const asks = [];
    for (const action of ['Review section', 'Review document', 'Reconcile project evidence', 'Prepare targeted fixes']) {
      asks.push(await assertAsk(page, selected, action));
    }
    assert(await editor(page).innerText() === selected.plainBody, 'Oversight prefill modified native authored text');
    assert(await editor(page).locator('ins,del').count() === 0, 'Oversight prefill applied an unrequested fix');
    assert(state.mutations.length === 1 && state.mutations[0].method === 'POST'
      && state.mutations[0].path === '/api/authoring/docs', 'Unexpected automatic mutation or stream beyond explicit synthetic create');
    assert(state.unexpected.length === 0, 'Unconfigured API path');
    assert(state.consoleErrors.length === 0 && state.pageErrors.length === 0, 'Browser console error or exception');
    stages.push(await capture(page, label, selected.key, 'prefill', { requireEditingViewport: true }));
    result.sourceHeader = sourceHeader;
    result.guidanceText = guidanceText;
    result.asks = asks;
    result.stages = stages;
    result.violations = stages.flatMap(stage => stage.axe.violations.map(violation => ({ stage: stage.stage, ...violation })));
    result.status = result.violations.length ? 'accessibility-fail' : 'pass';
  } catch (error) {
    result.status = 'fail';
    result.error = error.stack;
    result.body = await page.locator('body').innerText();
    result.metrics = await measure(page);
    await page.screenshot({ path: resolve(OUT, `browser-${label}-${selected.key}-failure.png`), fullPage: true });
  } finally {
    result.requestQualification = { requests: state.requests, mutations: state.mutations, unexpected: state.unexpected,
      consoleErrors: state.consoleErrors, pageErrors: state.pageErrors };
    await context.close();
  }
  return result;
}

async function matrix(label, width, theme, cases) {
  const results = [];
  for (const selected of cases) results.push(await runCase(width, theme, label, selected));
  const report = { label, width, theme, cases: results, status: results.every(result => result.status === 'pass') ? 'pass' : 'fail' };
  writeFileSync(resolve(OUT, `browser-${label}.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${label}: ${report.status}; ${results.map(result => result.key + '=' + result.status).join(', ')}`);
  return report;
}

try {
  const diagnostic = process.argv.includes('--diagnostic');
  const contexts = diagnostic ? [['diagnostic-desktop-light', 1440, 'light'], ['diagnostic-touch-light', 390, 'light']]
    : [['desktop-light', 1440, 'light'], ['desktop-dark', 1440, 'dark'], ['touch-light', 390, 'light'], ['touch-dark', 390, 'dark']];
  const cases = diagnostic ? snapshot.cases.slice(0, 1) : snapshot.cases;
  const reports = await Promise.all(contexts.map(([label, width, theme]) => matrix(label, width, theme, cases)));
  const finalPins = productionPins();
  const frozen = JSON.stringify(originalPins) === JSON.stringify(finalPins);
  const summary = { testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    completedAt: new Date().toISOString(), syntheticApisOnly: true, productionFrozenDuringCapture: frozen,
    sourceSha256: originalPins, fixtureSha256: fixturePins, apiContractSha256: sha256(resolve(BUNDLE, 'api-contract.json')),
    contexts: reports.map(report => ({ label: report.label, status: report.status,
      cases: report.cases.map(result => ({ key: result.key, status: result.status, violations: result.violations?.length, error: result.error })) })),
    status: reports.every(report => report.status === 'pass') && frozen ? 'pass' : 'fail',
    limitations: ['Synthetic browser fixtures qualify local UI and prefill callback wiring only, not live model behavior, backend authorization, RLS, database persistence, deployment or regulatory readiness.',
      'Whole filing ordinal headings and the limited PIL preparation source retain null CTD modules. Only the explicit QOS CTD section establishes M2.',
      'The actual creation component submits one explicitly clicked intercepted POST, whose response and initial GET contain only empty authored bodies. A separately labelled synthetic saved-reading fixture phase remounts Canvas to verify visible paragraph and handoff wiring; no editor save or database persistence is claimed.',
      'The local host records the actual onAsk prefill boundary. Canonical conversation routing and saved-review paging are independently verified in UI and server suites.',
      'Axe incomplete rules remain in individual stage metrics and require manual review.'] };
  writeFileSync(resolve(OUT, diagnostic ? 'browser-diagnostic-summary.json' : 'browser-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify(summary, null, 2));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
