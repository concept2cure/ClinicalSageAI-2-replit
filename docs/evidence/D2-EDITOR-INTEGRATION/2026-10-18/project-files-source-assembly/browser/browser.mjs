import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createState, intercept, DOC, PROGRAM, EXISTING, SECOND, THIRD, TEMPLATE, READ_ONLY_REASON,
  SOURCE_SELECTORS, vaultRow, excludedRows, VAULT, manifest, existing } from './mock-api.mjs';

const BUNDLE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const diagnostic = process.argv.includes('--diagnostic');
const OUT = resolve(BUNDLE, diagnostic ? 'diagnostic' : 'final');
mkdirSync(OUT, { recursive: true });
const urlPath = '/' + relative(ROOT, BUNDLE).split(sep).join('/') + '/';
const hash = path => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const sources = ['design-system/colors_and_type.css',
  ...['DocumentWorkbench.tsx', 'ProjectFilesPanel.tsx', 'ProjectFileActions.tsx', 'VaultSourceBuildAction.tsx',
    'SourceAssemblyDialog.tsx', 'useSourceAssemblyTarget.ts', 'projectVaultSearch.ts', 'projectSourceCatalog.ts',
    'SourceCatalogLine.tsx', 'assemblySourceSelection.ts', 'assemblySourceIntent.ts', 'AssemblySourcesNotice.tsx',
    'AuthoringAssemblyBuild.tsx', 'useAuthoringAssemblyBuild.ts', 'assemblyBuildState.ts', 'assemblyBuildTransport.ts',
    'assemblyDraftQueue.ts', 'authoringDraftTransport.ts', 'useAuthoringDraftReview.ts', 'RichSectionEditor.tsx',
    'savedTemplateContext.ts', 'SavedAssemblySourcesNotice.tsx', 'savedAssemblySourcesController.ts',
    'savedAssemblySourcesState.ts', 'savedAssemblySourcesTransport.ts'].map(name => `client/src/concept2cure/v2/editor/${name}`),
  'client/src/concept2cure/v2/surfaces/Vault.tsx', 'client/src/concept2cure/v2/fixtures/vault-data.ts',
  'client/src/concept2cure/v2/editorTarget.ts', 'shared/authoring/assembly-sources.ts',
  'shared/authoring/saved-assembly-sources.ts', 'shared/data-room-processing-status.ts',
  'client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx', 'client/src/concept2cure/v2/shellProject.ts',
  'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts', 'shared/authoring/assembly.ts',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'authoring-v2', 'misc-surfaces-v2', 'surface-text-ramp']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`)];
const productionPins = () => Object.fromEntries(sources.map(path => [path, hash(path)]));
const before = productionPins();
const readFixturePins = () => Object.fromEntries(['probe.tsx', 'server.mjs', 'browser.mjs', 'mock-api.mjs', 'baseline-entry.mjs', 'index.html']
  .map(name => [name, hash(relative(ROOT, resolve(BUNDLE, name)))]));
const fixturePins = readFixturePins();
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
  const sourceNotice = await page.getByTestId('assembly-selected-sources').textContent();
  for (const entry of manifest.entries) {
    assert.ok(sourceNotice.includes(entry.title));
    assert.ok(sourceNotice.includes(`Vault document ${entry.source.documentId}`));
    assert.ok(sourceNotice.includes(entry.contentHash));
    assert.ok(sourceNotice.includes(entry.extractedTextSha256));
    assert.ok(sourceNotice.includes(`Selected UTF-16 excerpt [${entry.span.start}, ${entry.span.end})`));
  }
  assert.ok(sourceNotice.includes(manifest.limitations[0]));
}
async function openBuild(page) {
  const disclosure = page.getByRole('region', { name: 'Document assembly', exact: true }).locator('details').first();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Document assembly"] details')?.open === true);
  assert.equal(await disclosure.getAttribute('open'), '', 'A valid source handoff opens the existing build disclosure');
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption(TEMPLATE);
  await page.getByRole('combobox', { name: 'Build target', exact: true }).getByRole('option', { name: '3.2.P.8.3 Stability data', exact: true }).waitFor({ state: 'attached' });
  await page.getByLabel('Reason for build', { exact: true }).fill('Append missing stability sections for local review.');
}
const authoringMutations = state => state.mutations.filter(row => row.path.startsWith('/api/authoring/'));
async function settleDialog(dialog) {
  await dialog.evaluate(async node => {
    const animations = [...node.getAnimations(), ...node.parentElement.getAnimations()];
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
}
async function openProjectFiles(page, state) {
  await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
  assert.equal(authoringMutations(state).length, 0);
  await page.getByRole('button', { name: 'Project files', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Project files', exact: true });
  await panel.getByRole('tree', { name: 'Project vault', exact: true }).waitFor();
  return panel;
}
async function measurePanel(page, key, stage, capture = true) {
  const result = await page.getByRole('complementary', { name: 'Project files', exact: true }).evaluate(panel => {
    const bounds = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right,
      bottom: r.bottom, width: r.width, height: r.height, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }; };
    return { kind: 'project-files-rail', viewport: { width: window.innerWidth, height: window.innerHeight }, panel: bounds(panel),
      pageWidth: document.documentElement.scrollWidth, scrollOwner: { className: panel.className, overflowY: window.getComputedStyle(panel).overflowY,
        scrollTop: panel.scrollTop, clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight },
      footer: bounds(panel.querySelector('[data-testid="pf-selected"]')),
      controls: [...panel.querySelectorAll('[data-testid="pf-selected"] button')].map(node => ({ text: node.textContent,
        disabled: node.disabled, bounds: bounds(node) })), text: panel.querySelector('[data-testid="pf-selected"]').textContent };
  });
  assert.ok(result.pageWidth <= result.viewport.width + 1);
  for (const bounds of [result.panel, result.footer]) {
    assert.ok(bounds.x >= -1 && bounds.right <= result.viewport.width + 1);
    assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1);
  }
  const action = result.controls.find(row => row.text.trim() === 'Build in editor');
  assert.ok(action);
  assert.ok(action.bounds.x >= -1 && action.bounds.right <= result.viewport.width + 1);
  writeFileSync(resolve(OUT, `${key}-${stage}.json`), JSON.stringify(result, null, 2) + '\n');
  if (capture) await page.screenshot({ path: resolve(OUT, `${key}-${stage}.png`), fullPage: false });
  return result;
}
async function reachPanelAction(page, key) {
  const panel = page.getByRole('complementary', { name: 'Project files', exact: true });
  const button = page.getByTestId('pf-selected').getByRole('button', { name: 'Build in editor', exact: true });
  const samples = [];
  await panel.hover({ position: { x: 100, y: 500 } });
  for (let count = 0; count < 8; count++) {
    const bounds = await button.boundingBox();
    if (bounds && bounds.y >= 0 && bounds.y + bounds.height <= (await page.viewportSize()).height) break;
    await page.mouse.wheel(0, 160); await page.waitForTimeout(100);
    samples.push(await panel.evaluate(node => ({ scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight })));
  }
  const rect = await button.boundingBox();
  assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= (await page.viewportSize()).height,
    'Build in editor must be visible or reachable by wheel in the existing right rail');
  const result = { kind: 'rail-action-reachability', requiredWheelSteps: samples.length, samples, action: rect,
    qualification: 'No programmatic scroll to footer/action; naturally visible or reached by real mouse wheel over existing rail.' };
  writeFileSync(resolve(OUT, `${key}-rail-action-reachability.json`), JSON.stringify(result, null, 2) + '\n');
  return result;
}
async function projectFilesEntry(page, state, key, stages) {
  const panel = await openProjectFiles(page, state);
  await panel.getByRole('button').filter({ hasText: vaultRow.title }).click();
  const footer = page.getByTestId('pf-selected');
  assert.equal(await footer.getByRole('button', { name: 'Work on document', exact: true }).isDisabled(), true);
  assert.equal(await footer.getByRole('button', { name: 'Build in editor', exact: true }).isEnabled(), true,
    'Retained readable data is eligible despite original bytes being unavailable');
  stages.push(await reachPanelAction(page, key));
  stages.push(await measurePanel(page, key, 'selected-vault-source'));
  assert.equal(authoringMutations(state).length, 0, 'Opening the actual rail and selecting a row stays read-only');
  const readsBefore = state.requests.filter(row => row.path === '/api/authoring/docs').length;
  await footer.getByRole('button', { name: 'Build in editor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Build from selected sources', exact: true });
  await dialog.getByRole('combobox', { name: 'Working document', exact: true }).selectOption(DOC);
  await settleDialog(dialog);
  assert.ok((await dialog.textContent()).includes(VAULT));
  assert.ok((await dialog.textContent()).includes(vaultRow.hash));
  assert.ok(!(await dialog.textContent()).includes(`up-${VAULT}`), 'Tree row identity must not replace exact Vault UUID');
  assert.equal(authoringMutations(state).length, 0, 'Chooser GETs do not preview, build or draft');
  const bounds = await dialog.evaluate(node => {
    const r = node.getBoundingClientRect(); const button = [...node.querySelectorAll('button')].find(item => item.textContent === 'Open in editor');
    return { kind: 'source-chooser', viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, x: r.x, right: r.right,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, openAction: button.getBoundingClientRect().toJSON(), text: node.textContent };
  });
  assert.ok(bounds.x >= -1 && bounds.right <= bounds.viewportWidth + 1 && bounds.scrollWidth <= bounds.clientWidth + 1);
  assert.ok(bounds.openAction.y >= 0 && bounds.openAction.bottom <= bounds.viewportHeight, 'Existing chooser action must be reachable');
  writeFileSync(resolve(OUT, `${key}-source-target-dialog.json`), JSON.stringify(bounds, null, 2) + '\n');
  await page.screenshot({ path: resolve(OUT, `${key}-source-target-dialog.png`), fullPage: false }); stages.push(bounds);
  await dialog.getByRole('button', { name: 'Open in editor', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByTestId('assembly-selected-sources').waitFor();
  const reads = state.requests.filter(row => row.path === '/api/authoring/docs').slice(readsBefore);
  assert.equal(reads.length, 2, 'Shared chooser reads and rechecks exact project working documents');
  for (const read of reads) assert.equal(read.query, `?status=all&programId=${PROGRAM}`);
  assert.equal(authoringMutations(state).length, 0, 'Accepted local handoff does not start work automatically');
  assert.equal((await page.evaluate(() => window.assemblyNavigation)).length, 0, 'Existing editor handles local target without external navigation');
  await page.getByRole('button', { name: 'Close project files', exact: true }).click();
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
    await page.goto(`http://127.0.0.1:5192${urlPath}?theme=${theme}`, { waitUntil: 'networkidle' });
    await projectFilesEntry(page, state, key, stages);
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
    for (const request of authoringMutations(state).filter(row => row.path.includes('/assembly/')))
      assert.deepEqual(request.body.sources, SOURCE_SELECTORS, 'Every source-first preview and commit keeps exact selectors');
    for (const request of authoringMutations(state).filter(row => row.path.endsWith('/ai/draft')))
      assert.deepEqual(request.body.sources, manifest, 'Every candidate request keeps the exact verified manifest');
    assert.equal((await page.evaluate(() => window.assemblyNavigation)).length, 0);
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
async function runReadOnly(config) {
  const [name, width, height, theme] = config; const key = `${name}-read-only`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme,
    isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage(); const state = createState('read-only');
  const consoleErrors = [], pageErrors = [], stages = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => intercept(route, state));
  let status = 'pass', error;
  try {
    await page.goto(`http://127.0.0.1:5192${urlPath}?theme=${theme}`, { waitUntil: 'networkidle' });
    await projectFilesEntry(page, state, key, stages);
    const region = page.getByRole('region', { name: 'Document assembly', exact: true });
    await region.getByText(READ_ONLY_REASON, { exact: true }).waitFor();
    assert.equal(await region.getByRole('combobox', { name: 'Template', exact: true }).isDisabled(), true);
    assert.equal(await region.getByRole('button', { name: 'Preview build', exact: true }).isDisabled(), true);
    assert.equal(await region.getByRole('button', { name: 'Build document', exact: true }).isDisabled(), true);
    assert.equal(await region.getByLabel('Draft empty eligible sections with AnA', { exact: true }).isDisabled(), true);
    stages.push(await measure(page, key, 'read-only-build-disabled', true));
    assert.equal(state.mutations.filter(row => row.path.startsWith('/api/authoring/')).length, 0);
    assert.deepEqual(state.sections, [existing]);
    assert.equal(await page.evaluate(() => window.assemblyBridge?.editable), false);
    assert.equal(state.unexpected.length, 0); assert.equal(consoleErrors.length, 0); assert.equal(pageErrors.length, 0);
  } catch (failure) {
    status = 'fail'; error = String(failure.stack ?? failure);
    await page.screenshot({ path: resolve(OUT, `${key}-failure.png`), fullPage: false }).catch(() => undefined);
  }
  const report = { key, width, height, theme, mode: 'read-only', status, error, stages, requests: state.requests,
    mutations: state.mutations, commits: state.commits, previews: state.previews, generations: state.generations,
    accepts: state.accepts, savedSections: state.sections, accepted: state.accepted, drafts: state.drafts,
    consoleErrors, pageErrors, unexpected: state.unexpected,
    navigation: await page.evaluate(() => window.assemblyNavigation).catch(() => []) };
  writeFileSync(resolve(OUT, `${key}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${key}: ${status}${error ? ` ${error.split('\n')[0]}` : ''}`);
  await context.close(); return report;
}
async function runEligibility(config) {
  const [name, width, height, theme] = config; const key = `${name}-current-eligibility`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const state = createState('eligibility');
  const consoleErrors = [], pageErrors = [], stages = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => intercept(route, state));
  let status = 'pass', error;
  try {
    await page.goto(`http://127.0.0.1:5192${urlPath}?theme=${theme}`, { waitUntil: 'networkidle' });
    const panel = await openProjectFiles(page, state);
    for (const row of excludedRows) {
      await panel.getByRole('button').filter({ hasText: row.title }).click();
      const footer = page.getByTestId('pf-selected');
      assert.equal(await footer.getByRole('button', { name: 'Build in editor', exact: true }).isDisabled(), true);
      await footer.getByText('Build in editor: This source is excluded from active data use.', { exact: true }).waitFor();
      stages.push(await measurePanel(page, key, `excluded-${row.docId.slice(-3)}`, true));
    }
    assert.equal(authoringMutations(state).length, 0); assert.equal(await page.getByTestId('source-assembly-dialog').count(), 0);
    assert.deepEqual(state.sections, [existing]);
    assert.equal(state.unexpected.length, 0); assert.equal(consoleErrors.length, 0); assert.equal(pageErrors.length, 0);
  } catch (failure) {
    status = 'fail'; error = String(failure.stack ?? failure);
    await page.screenshot({ path: resolve(OUT, `${key}-failure.png`), fullPage: false }).catch(() => undefined);
  }
  const report = { key, width, height, theme, mode: 'eligibility', status, error, stages,
    requests: state.requests, mutations: state.mutations, commits: state.commits, previews: state.previews,
    generations: state.generations, accepts: state.accepts, savedSections: state.sections, consoleErrors, pageErrors,
    unexpected: state.unexpected, navigation: await page.evaluate(() => window.assemblyNavigation).catch(() => []) };
  writeFileSync(resolve(OUT, `${key}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${key}: ${status}${error ? ` ${error.split('\n')[0]}` : ''}`);
  await context.close(); return report;
}
try {
  const cases = [];
  for (const [index, viewport] of viewports.entries()) cases.push(await runCase(viewport, index === 0 || index === 3 ? 'deterministic' : 'ana'));
  if (!diagnostic) cases.push(await runReadOnly(viewports[2]));
  if (!diagnostic) cases.push(await runEligibility(viewports[3]));
  const after = productionPins(); const afterFixture = readFixturePins();
  const frozen = JSON.stringify(before) === JSON.stringify(after);
  const fixtureFrozen = JSON.stringify(fixturePins) === JSON.stringify(afterFixture);
  const summary = { testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    completedAt: new Date().toISOString(), productionSourceSha256: before, fixtureSourceSha256: fixturePins,
    productionSourceSha256After: after, fixtureSourceSha256After: afterFixture,
    productionFrozenDuringCapture: frozen, fixtureFrozenDuringCapture: fixtureFrozen, browserVersion: browser.version(), caseCount: cases.length,
    passed: cases.filter(row => row.status === 'pass').length, stages: cases.reduce((sum, row) => sum + row.stages.length, 0),
    status: frozen && fixtureFrozen && cases.every(row => row.status === 'pass') ? 'pass' : 'fail',
    cases: cases.map(({ key, status, error }) => ({ key, status, error })),
    qualification: 'Actual DocumentWorkbench -> ProjectFilesPanel selected Vault footer -> shared chooser -> existing local editor target receiver/build/retained review, with canonical product styles. Synthetic auth and HTTP only; no full shell, full Vault surface, live provider or backend verification. Four primary desktop/touch light/dark cases use both modes across sizes; not a full eight-case cross matrix. No deployment/human-testing/accessibility-compliance claim.' };
  writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify({ status: summary.status, passed: summary.passed, caseCount: summary.caseCount, frozen, fixtureFrozen }));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
