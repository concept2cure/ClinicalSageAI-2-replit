import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createState, intercept, EXISTING, SECOND, THIRD, TEMPLATE, existing } from './mock-api.mjs';

const BUNDLE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const diagnostic = process.argv.includes('--diagnostic');
const OUT = resolve(BUNDLE, diagnostic ? 'diagnostic' : 'final');
mkdirSync(OUT, { recursive: true });
const urlPath = '/' + relative(ROOT, BUNDLE).split(sep).join('/') + '/';
const hash = path => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const sources = ['design-system/colors_and_type.css', 'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  'client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx',
  'client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts',
  'client/src/concept2cure/v2/editor/assemblyBuildState.ts',
  'client/src/concept2cure/v2/editor/assemblyBuildTransport.ts',
  'client/src/concept2cure/v2/editor/assemblyDraftQueue.ts',
  'client/src/concept2cure/v2/editor/authoringDraftTransport.ts',
  'client/src/concept2cure/v2/editor/useAuthoringDraftReview.ts',
  'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx',
  'client/src/concept2cure/v2/editor/RichSectionEditor.tsx',
  'client/src/concept2cure/v2/editor/savedTemplateContext.ts',
  'client/src/concept2cure/v2/shellProject.ts', 'client/src/services/portal/authService.tsx',
  'client/src/lib/queryClient.ts', 'shared/authoring/assembly.ts',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'authoring-v2', 'misc-surfaces-v2', 'surface-text-ramp', 'project-home-v2']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`)];
const productionPins = () => Object.fromEntries(sources.map(path => [path, hash(path)]));
const before = productionPins();
const fixturePins = Object.fromEntries(['probe.tsx', 'server.mjs', 'browser.mjs', 'mock-api.mjs', 'index.html']
  .map(name => [name, hash(relative(ROOT, resolve(BUNDLE, name)))]));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const viewports = diagnostic ? [['touch-light', 390, 844, 'light']]
  : [['desktop-light', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'],
    ['touch-light', 390, 844, 'light'], ['touch-dark', 390, 844, 'dark']];

async function measure(page, name, stage, capture = false) {
  const section = page.getByRole('region', { name: 'Document assembly', exact: true });
  const panel = page.getByTestId('ai-draft-panel');
  const target = stage === 'first-review-edited' ? panel : section;
  await target.scrollIntoViewIfNeeded();
  const result = await page.evaluate(() => {
    const assembly = document.querySelector('section[aria-label="Document assembly"]');
    const ai = document.querySelector('[data-testid="ai-draft-panel"]');
    const bounds = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
        scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    };
    return { viewport: { width: window.innerWidth, height: window.innerHeight }, documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth, assembly: bounds(assembly), ai: bounds(ai),
      assemblyText: assembly?.textContent, editorCount: document.querySelectorAll('.tiptap').length,
      noticeOutsideToolbar: !!assembly && !assembly.closest('.ed-doc-actions'),
      controls: [...(assembly?.querySelectorAll('button,select,input') ?? [])].map(node => ({
        label: node.textContent || node.getAttribute('placeholder') || node.type, rect: bounds(node), disabled: node.disabled })),
      aiBody: document.querySelector('[data-testid="ai-draft-body"]')?.value,
      editorBody: document.querySelector('.tiptap')?.textContent,
      navigation: window.assemblyNavigation, bridge: window.assemblyBridge };
  });
  writeFileSync(resolve(OUT, `${name}-${stage}.json`), JSON.stringify(result, null, 2) + '\n');
  if (capture) await page.screenshot({ path: resolve(OUT, `${name}-${stage}.png`), fullPage: false });
  assert.equal(result.editorCount, 1, 'One canonical rich editor must remain mounted');
  assert.ok(result.noticeOutsideToolbar, 'Build workflow must sit outside toolbar scroller');
  assert.ok(result.documentWidth <= result.viewport.width + 1 && result.bodyWidth <= result.viewport.width + 1,
    'Build workflow must not create page horizontal overflow');
  for (const [label, rect] of [['assembly', result.assembly], ['AI review', result.ai]]) {
    if (!rect) continue;
    assert.ok(rect.x >= -1 && rect.right <= result.viewport.width + 1, `${label} must fit viewport`);
    assert.ok(rect.scrollWidth <= rect.clientWidth + 1, `${label} must not overflow internally`);
  }
  for (const control of result.controls) {
    const rect = control.rect;
    assert.ok(rect.x >= -1 && rect.right <= result.viewport.width + 1, `Control ${control.label} must fit horizontally`);
  }
  return result;
}
async function preview(page, code = '') {
  await page.getByRole('combobox', { name: 'Build target', exact: true }).selectOption(code);
  await page.getByRole('button', { name: 'Preview build', exact: true }).click();
  await page.getByTestId('assembly-plan').waitFor();
}
async function openBuild(page) {
  await page.getByText('Build document or section', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption(TEMPLATE);
  await page.getByRole('combobox', { name: 'Build target', exact: true }).getByRole('option', { name: '3.2.P.8.3 Stability data', exact: true }).waitFor({ state: 'attached' });
  await page.getByLabel('Reason for build', { exact: true }).fill('Append missing stability sections for local review.');
}
async function runCase(config, mode) {
  const [name, width, height, theme] = config; const key = `${name}-${mode}`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme,
    isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage(); const state = createState(mode);
  const consoleErrors = [], pageErrors = [], stages = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => intercept(route, state));
  let status = 'pass', error;
  try {
    await page.goto(`http://127.0.0.1:5188${urlPath}?theme=${theme}`, { waitUntil: 'networkidle' });
    await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
    await openBuild(page);
    assert.equal(state.commits, 0); assert.equal(state.generations, 0); assert.equal(state.accepts, 0);
    if (mode === 'deterministic') {
      await preview(page, '3.2.P.8.2');
      stages.push(await measure(page, key, 'single-section-preview', true));
      assert.match(await page.getByTestId('assembly-plan').textContent(), /1 selected section/);
      await page.getByRole('button', { name: 'Build section', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('section[aria-label="Document assembly"]')?.textContent?.includes('Structure built'));
      assert.equal(state.commits, 1); assert.equal(state.sections.length, 2);
      assert.deepEqual(state.sections.find(row => row.id === EXISTING), existing);
      assert.equal(state.sections.find(row => row.id === SECOND).content, '');
      await preview(page);
      stages.push(await measure(page, key, 'whole-document-preview', width === 390));
      await page.getByRole('button', { name: 'Build document', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('section[aria-label="Document assembly"]')?.textContent?.includes('Structure built'));
      assert.equal(state.commits, 2); assert.equal(state.sections.length, 3);
      assert.deepEqual(state.sections.find(row => row.id === EXISTING), existing);
      assert.deepEqual(state.sections.map(row => row.order_index), [7, 8, 9]);
      assert.equal(state.generations, 0); assert.equal(state.accepts, 0);
      stages.push(await measure(page, key, 'deterministic-built', true));
    } else {
      await page.getByLabel('Draft empty eligible sections with AnA', { exact: true }).check();
      await page.getByLabel('Draft requirements (optional)', { exact: true }).fill('Prepare synthetic evidence gaps for a human review.');
      await preview(page);
      await page.getByRole('button', { name: 'Build document', exact: true }).click();
      await page.getByRole('button', { name: 'Review 3.2.P.8.2', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Build document', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('section[aria-label="Document assembly"]')?.textContent?.includes('retained for individual review'));
      assert.equal(state.commits, 1); assert.equal(state.generations, 2); assert.equal(state.accepts, 0);
      assert.equal(state.maximumActiveGenerations, 1, 'Candidates must generate sequentially');
      assert.deepEqual(state.generationEvents.map(row => `${row.kind}:${row.sectionId}`),
        [`start:${SECOND}`, `finish:${SECOND}`, `start:${THIRD}`, `finish:${THIRD}`]);
      assert.deepEqual(state.sections.find(row => row.id === EXISTING), existing);
      stages.push(await measure(page, key, mode === 'refusal' ? 'provider-refusal-retained-queue' : 'two-candidates-ready', true));
      await page.getByRole('button', { name: 'Review 3.2.P.8.2', exact: true }).click();
      // The existing disclosure can be closed while the same retained panel is read.
      await page.getByText('Build document or section', { exact: true }).click();
      await page.getByTestId('ai-draft-body').waitFor();
      const edited = 'Edited first retained candidate for explicit human acceptance.';
      const reason = 'Human reviewer confirmed this synthetic local example.';
      await page.getByTestId('ai-draft-body').fill(edited);
      await page.getByLabel('Reason for change (optional — recorded on the audit trail)', { exact: true }).fill(reason);
      stages.push(await measure(page, key, 'first-review-edited', true));
      if (mode !== 'refusal') {
        await page.getByText('Build document or section', { exact: true }).click();
        await page.getByRole('button', { name: 'Review 3.2.P.8.3', exact: true }).click();
        await page.getByText('Build document or section', { exact: true }).click();
        await page.getByRole('heading', { name: 'Draft 3.2.P.8.3 from Data Room sources', exact: true }).waitFor();
        assert.equal(await page.getByTestId('ai-draft-body').inputValue(), `Synthetic retained candidate for ${THIRD}.`);
        await page.getByText('Build document or section', { exact: true }).click();
        await page.getByRole('button', { name: 'Review 3.2.P.8.2', exact: true }).click();
        await page.getByText('Build document or section', { exact: true }).click();
        await page.getByRole('heading', { name: 'Draft 3.2.P.8.2 from Data Room sources', exact: true }).waitFor();
        assert.equal(await page.getByTestId('ai-draft-body').inputValue(), edited, 'Edited body survives review switching');
        assert.equal(await page.getByLabel('Reason for change (optional — recorded on the audit trail)', { exact: true }).inputValue(), reason,
          'Reason survives review switching');
      }
      assert.equal(state.accepts, 0, 'Review and edits must never auto-accept');
      await page.getByTestId('ai-draft-accept').click();
      await page.getByTestId('ai-draft-panel').waitFor({ state: 'hidden' });
      assert.equal(state.accepts, 1);
      assert.deepEqual(state.accepted[0], { sectionId: SECOND, draftId: `draft-${SECOND}`, content: edited, changeReason: reason });
      assert.equal(state.sections.find(row => row.id === THIRD).content, '', 'Other section remains unaccepted');
      assert.deepEqual(state.sections.find(row => row.id === EXISTING), existing);
      await page.getByText('Build document or section', { exact: true }).click();
      stages.push(await measure(page, key, 'one-section-explicitly-accepted', true));
    }
    assert.equal(state.unexpected.length, 0); assert.equal(consoleErrors.length, 0); assert.equal(pageErrors.length, 0);
    assert.deepEqual(await page.evaluate(() => window.assemblyNavigation), []);
  } catch (failure) {
    status = 'fail'; error = String(failure.stack ?? failure);
    await page.screenshot({ path: resolve(OUT, `${key}-failure.png`), fullPage: false }).catch(() => undefined);
  }
  const report = { key, width, height, theme, mode, status, error, stages, requests: state.requests,
    mutations: state.mutations, commits: state.commits, previews: state.previews, generations: state.generations,
    accepts: state.accepts, maximumActiveGenerations: state.maximumActiveGenerations, generationEvents: state.generationEvents,
    savedSections: state.sections, accepted: state.accepted, drafts: state.drafts,
    consoleErrors, pageErrors, unexpected: state.unexpected,
    navigation: await page.evaluate(() => window.assemblyNavigation).catch(() => []) };
  writeFileSync(resolve(OUT, `${key}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${key}: ${status}${error ? ` ${error.split('\n')[0]}` : ''}`);
  await context.close(); return report;
}
try {
  const cases = [];
  for (const viewport of viewports) for (const mode of ['deterministic', 'ana']) cases.push(await runCase(viewport, mode));
  const frozen = JSON.stringify(before) === JSON.stringify(productionPins());
  const summary = { testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    completedAt: new Date().toISOString(), productionSourceSha256: before, fixtureSourceSha256: fixturePins,
    productionFrozenDuringCapture: frozen, browserVersion: browser.version(), caseCount: cases.length,
    passed: cases.filter(row => row.status === 'pass').length, stages: cases.reduce((sum, row) => sum + row.stages.length, 0),
    status: frozen && cases.every(row => row.status === 'pass') ? 'pass' : 'fail',
    cases: cases.map(({ key, status, error }) => ({ key, status, error })),
    qualification: 'Actual DocumentWorkbench, canonical build controller, AuthoringAiDraft, rich editor and product styles; synthetic HTTP/auth only. The fixture mounts embedded Workbench without the conversation thread or full shell. No backend transaction/authorization, live provider, filing, deployment, human-review or accessibility-compliance claim.' };
  writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify({ status: summary.status, passed: summary.passed, caseCount: summary.caseCount, frozen }));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
