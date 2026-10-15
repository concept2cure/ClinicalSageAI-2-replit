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
  'client/src/concept2cure/v2/editor/DocumentCanvas.tsx',
  'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
  'client/src/concept2cure/v2/editor/TemplateGuidance.tsx',
  'client/src/concept2cure/v2/editor/provenance.ts',
  'client/src/concept2cure/v2/editor/savedTemplateContext.ts',
  'client/src/concept2cure/v2/editor/authoringOversight.ts',
  'shared/authoring/recorded-template-source.ts',
  'server/services/ana/saved-document-critique.ts',
  'server/services/ana/saved-template-review.ts',
  'server/services/ana/writingQualityTools.ts',
  'server/services/authoring/authoring-template-guidance.ts',
  'server/services/authoring/ind-authoring-templates.ts',
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
  await page.goto(`http://127.0.0.1:5177${URL_PATH}?theme=${theme}&case=${selected.key}`);
  await editor(page).waitFor();
  await page.waitForFunction(() => window.templateBridge?.sectionId);
  await page.waitForFunction(expected => document.querySelector('.ProseMirror')?.textContent === expected, selected.plainBody);
  await page.locator('[data-testid="template-guidance"]').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="template-guidance"] [role="status"]'));
  return { context, page, state };
}

async function capture(page, label, key, stage, requireEditingViewport) {
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
  assert(await editor(page).count() === 1, 'More than one native editor');
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
  assert(JSON.stringify(context?.templateSource) === JSON.stringify(selected.source), 'Recorded template source or limits changed');
  assert(ask.prefill.includes('critique_document') && ask.prefill.includes('expected_snapshot')
    && ask.prefill.includes('get_document_template') && ask.prefill.includes('read_authoring_section'), 'Saved review or remedy reading instruction is missing');
  assert(ask.prefill.includes('aiDraftable') && ask.prefill.includes('original official form, dataset, certificate or signed record')
    && ask.prefill.includes('do not save, accept, approve or file'), 'Original-record or governed-write limits are missing');
  assert(!ask.prefill.includes(selected.document.title) && !ask.prefill.includes(selected.sections[0].content),
    'Stored title or body leaked into fixed instructions');
  assert(!JSON.stringify(ask.origin).includes(selected.sections[0].content), 'Unsaved or copied authored HTML entered screen context');
}

async function runCase(width, theme, label, selected) {
  const { context, page, state } = await startPage(width, theme, selected);
  const result = { key: selected.key, entryId: selected.source.entryId, module: selected.document.module, status: 'pending' };
  try {
    assert(await editor(page).getAttribute('contenteditable') === 'true', 'Preparation editor is not available for source-supported work');
    const sourceHeader = await page.locator('[data-testid="doc-provenance"]').innerText();
    const expectedKind = selected.source.kind === 'preparation' ? 'preparation worksheet' : 'working scaffold';
    assert(sourceHeader.includes('Created from an IND template') && sourceHeader.includes(expectedKind), 'Existing source header lost recorded template kind');
    assert(!sourceHeader.includes('verified') && !sourceHeader.includes('approved'), 'Template header claims verification or approval');
    const title = await page.locator('.ed-mast').innerText();
    assert(title.includes(selected.document.title), 'Renamed document title was not preserved');
    const crumbs = await page.locator('.ed-crumbs').innerText();
    const moduleLabel = selected.document.module ?? 'Unbound draft';
    assert(crumbs.includes(moduleLabel), 'Recorded module or unbound placement is missing from the existing header');
    const stages = [await capture(page, label, selected.key, 'editor', true)];
    const disclosure = page.locator('[data-testid="template-guidance"]');
    await disclosure.locator('summary').click();
    assert(await disclosure.getAttribute('open') !== null, 'Existing guidance disclosure did not open');
    const guidanceText = await disclosure.innerText();
    for (const limitation of selected.source.limitations) assert(guidanceText.includes(limitation), 'Stored source limitation was omitted from disclosure');
    const recordedText = selected.guidance.template_guidance[0].guidance_text;
    assert((await disclosure.locator('p').allTextContents()).includes(recordedText), 'Exact saved section guidance was omitted');
    assert(!guidanceText.includes('could not be read'), 'Guidance read failed');
    await disclosure.locator('summary').scrollIntoViewIfNeeded();
    stages.push(await capture(page, label, selected.key, 'guidance', false));
    await disclosure.locator('summary').click();
    const asks = [];
    for (const action of ['Review section', 'Review document', 'Reconcile project evidence', 'Prepare targeted fixes']) {
      asks.push(await assertAsk(page, selected, action));
    }
    assert(await editor(page).innerText() === selected.plainBody, 'Oversight prefill modified native authored text');
    assert(await editor(page).locator('ins,del').count() === 0, 'Oversight prefill applied an unrequested fix');
    assert(state.mutations.length === 0, 'Oversight prefill performed an automatic mutation or stream');
    assert(state.unexpected.length === 0, 'Unconfigured API path');
    assert(state.consoleErrors.length === 0 && state.pageErrors.length === 0, 'Browser console error or exception');
    stages.push(await capture(page, label, selected.key, 'prefill', true));
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
      'The source-bound GLP deliverable has a null recorded module; its phase does not establish CTD placement.',
      'The local host records the actual onAsk prefill boundary. Canonical conversation routing and saved-review paging are independently verified in UI and server suites.',
      'Axe incomplete rules remain in individual stage metrics and require manual review.'] };
  writeFileSync(resolve(OUT, diagnostic ? 'browser-diagnostic-summary.json' : 'browser-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify(summary, null, 2));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
