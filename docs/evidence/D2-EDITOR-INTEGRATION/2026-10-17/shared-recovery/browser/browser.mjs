import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createState, intercept, protocol, PROGRAM, DOC } from './mock-api.mjs';

const BUNDLE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const label = process.argv.includes('--diagnostic') ? 'diagnostic' : 'final';
const OUT = resolve(BUNDLE, label);
mkdirSync(OUT, { recursive: true });
const urlPath = '/' + relative(ROOT, BUNDLE).split(sep).join('/') + '/';
const hash = path => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const sources = ['design-system/colors_and_type.css', 'client/src/concept2cure/v2/surfaces/ReportEngine.tsx',
  'client/src/concept2cure/v2/authoringHandoff.ts', 'client/src/concept2cure/v2/authoringHandoffRecovery.ts',
  'client/src/concept2cure/v2/AuthoringHandoffNotice.tsx', 'client/src/concept2cure/v2/AuthoringRecoveryNotice.tsx',
  'client/src/concept2cure/v2/editor/authoringCreationRecovery.ts', 'client/src/concept2cure/v2/editorTarget.ts',
  'client/src/concept2cure/v2/shellProject.ts', 'client/src/concept2cure/v2/AnswerLead.tsx',
  'client/src/services/portal/authService.tsx', 'client/src/lib/queryClient.ts',
  ...['app-v2', 'journey-v2', 'coverage-v2', 'misc-surfaces-v2', 'surface-text-ramp', 'project-home-v2']
    .map(name => `client/src/concept2cure/v2/styles/${name}.css`)];
const productionPins = () => Object.fromEntries(sources.map(path => [path, hash(path)]));
const before = productionPins();
const fixturePins = Object.fromEntries(['probe.tsx', 'server.mjs', 'browser.mjs', 'mock-api.mjs', 'index.html']
  .map(name => [name, hash(relative(ROOT, resolve(BUNDLE, name)))]));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const viewportRows = process.argv.includes('--diagnostic') ? [['touch-light', 390, 844, 'light']]
  : [['desktop-light', 1440, 1000, 'light'], ['desktop-dark', 1440, 1000, 'dark'],
    ['touch-light', 390, 844, 'light'], ['touch-dark', 390, 844, 'dark']];
const authoringWrites = state => state.mutations.filter(row => row.path.startsWith('/api/authoring/'));
const navigation = page => page.evaluate(() => window.recoveryNavigation);
const targetIdentity = item => ({ route: item.route, target: item.target ? {
  docType: item.target.docType, docId: item.target.docId, programId: item.target.programId,
  sectionCode: item.target.sectionCode,
} : null });

async function layout(page, name, capture = false) {
  const notice = page.locator('.scaf-note');
  await notice.scrollIntoViewIfNeeded();
  const result = await page.evaluate(() => {
    const node = document.querySelector('.scaf-note');
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return { viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      notice: rect(node), noticeScrollWidth: node.scrollWidth, noticeClientWidth: node.clientWidth,
      noticeText: node.textContent, noticeRole: node.getAttribute('role'),
      controls: [...node.querySelectorAll('button')].map(button => ({ text: button.textContent,
        disabled: button.disabled, rect: rect(button) })), sourceRetained: !!document.querySelector('.bs-doc-render')?.textContent?.trim() };
  });
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  if (capture) await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false });
  assert.ok(result.sourceRetained, 'Actual result prose must stay on screen');
  assert.ok(result.notice.x >= -1 && result.notice.right <= result.viewport.width + 1, 'Recovery notice must fit viewport');
  assert.ok(result.noticeScrollWidth <= result.noticeClientWidth + 1, 'Recovery notice must not overflow internally');
  for (const control of result.controls) assert.ok(control.rect.x >= -1 && control.rect.right <= result.viewport.width + 1,
    `Recovery control ${control.text} must be horizontally reachable`);
  assert.ok(result.documentWidth <= result.viewport.width + 1 && result.bodyWidth <= result.viewport.width + 1,
    'Result surface must not create page horizontal overflow');
  return result;
}

async function runCase(config, mode) {
  const [name, width, height, theme] = config;
  const key = `${name}-${mode}`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme,
    isMobile: width < 500, hasTouch: width < 500 });
  const page = await context.newPage();
  const state = createState(mode);
  const consoleErrors = [], pageErrors = [], stages = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => intercept(route, state));
  let status = 'pass', error;
  try {
    await page.goto(`http://127.0.0.1:5187${urlPath}?theme=${theme}`, { waitUntil: 'networkidle' });
    await page.getByLabel('Protocol synopsis').fill(protocol);
    await page.getByRole('button', { name: 'Analyze protocol', exact: true }).click();
    await page.getByRole('button', { name: 'Open in document editor', exact: true }).waitFor();
    // Real callers share admission even if an enabled lead action is clicked
    // again before rerender. Both actions use the actual component handlers.
    await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.scaf-note')?.textContent?.includes('Saving working document'));
    assert.equal(state.documentWrites, 1);
    await page.getByRole('button', { name: 'Saving to the editor…', exact: true }).first().click();
    assert.equal(state.documentWrites, 1, 'Pending repeat must not send another document');
    assert.deepEqual(await navigation(page), []);
    state.release();
    const checkLabel = mode === 'unknown' ? 'Check working documents' : 'Check document sections';
    await page.getByRole('button', { name: checkLabel, exact: true }).waitFor();
    const expectedInitialWrites = mode === 'unknown' ? 1 : 2;
    assert.equal(authoringWrites(state).length, expectedInitialWrites);
    assert.equal(state.sectionWrites, mode === 'unknown' ? 0 : 1);
    await page.getByRole('button', { name: 'Open in document editor', exact: true }).click();
    assert.equal(authoringWrites(state).length, expectedInitialWrites, 'Unknown repeat must stay blocked');
    await page.getByRole('button', { name: checkLabel, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.scaf-note')?.textContent?.includes('save remains unresolved'));
    assert.equal(authoringWrites(state).length, expectedInitialWrites, 'Failed Check must read only');
    assert.deepEqual(await navigation(page), []);
    await page.waitForFunction(() => !document.querySelector('.de-toast'), undefined, { timeout: 10000 });
    stages.push(await layout(page, `${key}-persistent-unresolved`, mode === 'unknown'));
    state.validRead = true;
    await page.getByRole('button', { name: checkLabel, exact: true }).click();
    if (mode === 'unknown') {
      await page.getByRole('button', { name: 'Open working documents', exact: true }).waitFor();
      assert.ok((await page.locator('.scaf-note').textContent()).includes('cannot identify the interrupted request'));
      stages.push(await layout(page, `${key}-checked-inventory`, false));
      assert.equal(state.documentWrites, 1); assert.equal(state.sectionWrites, 0);
      assert.deepEqual(await navigation(page), []);
      await page.getByRole('button', { name: 'Open working documents', exact: true }).click();
      assert.deepEqual(await navigation(page), [{ route: 'document-authoring', target: null }]);
    } else {
      await page.getByRole('button', { name: 'Continue saving text', exact: true }).waitFor();
      stages.push(await layout(page, `${key}-checked-empty-document`, true));
      assert.equal(state.documentWrites, 1); assert.equal(state.sectionWrites, 1);
      assert.deepEqual(await navigation(page), []);
      await page.getByRole('button', { name: 'Open document to review', exact: true }).click();
      assert.deepEqual((await navigation(page)).map(targetIdentity), [{ route: 'document-authoring',
        target: { docType: null, docId: DOC, programId: PROGRAM, sectionCode: null } }]);
      // The fixture records the real exact-target handoff without mounting the
      // shell router. The source stays mounted to verify separate continuation.
      await page.getByRole('button', { name: 'Statistical Insights', exact: true }).click();
      await page.getByRole('button', { name: 'Continue saving text', exact: true }).click();
      await page.getByRole('button', { name: 'Open saved document', exact: true }).waitFor();
      assert.equal(state.documentWrites, 1, 'Continuation cannot create another document');
      assert.equal(state.sectionWrites, 2, 'Only explicit continuation adds its original section');
      const sectionBodies = authoringWrites(state).filter(row => row.path === '/api/authoring/sections').map(row => row.body);
      assert.deepEqual(sectionBodies[1], sectionBodies[0], 'Continue must retain original payload after result selection changes');
      assert.equal((await navigation(page)).length, 1, 'Continue never navigates automatically');
      stages.push(await layout(page, `${key}-continued-original-text`, true));
      await page.getByRole('button', { name: 'Open saved document', exact: true }).click();
      assert.deepEqual(targetIdentity((await navigation(page))[1]), { route: 'document-authoring',
        target: { docType: null, docId: DOC, programId: PROGRAM, sectionCode: 'recommendations' } });
    }
    assert.equal(state.unexpected.length, 0);
    assert.equal(consoleErrors.length, 0); assert.equal(pageErrors.length, 0);
  } catch (failure) { status = 'fail'; error = String(failure.stack ?? failure); }
  const report = { key, width, height, theme, mode, status, error, stages, requests: state.requests,
    mutations: state.mutations, documentWrites: state.documentWrites, sectionWrites: state.sectionWrites,
    scopedInventoryReads: state.reads, navigation: await navigation(page).catch(() => []),
    consoleErrors, pageErrors, unexpected: state.unexpected };
  writeFileSync(resolve(OUT, `${key}-results.json`), JSON.stringify(report, null, 2) + '\n');
  console.info(`${key}: ${status}${error ? ` ${error.split('\n')[0]}` : ''}`);
  await context.close();
  return report;
}

try {
  const cases = [];
  for (const row of viewportRows) cases.push(...await Promise.all(['unknown', 'partial'].map(mode => runCase(row, mode))));
  const after = productionPins();
  const frozen = JSON.stringify(before) === JSON.stringify(after);
  const summary = { testedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    completedAt: new Date().toISOString(), productionSourceSha256: before, fixtureSourceSha256: fixturePins,
    productionFrozenDuringCapture: frozen, browserVersion: browser.version(), caseCount: cases.length,
    passed: cases.filter(row => row.status === 'pass').length,
    stages: cases.reduce((sum, row) => sum + row.stages.length, 0),
    status: frozen && cases.every(row => row.status === 'pass') ? 'pass' : 'fail',
    cases: cases.map(({ key, status, error }) => ({ key, status, error })),
    qualification: 'Actual ReportEngine, handoff hook and notices, canonical product tokens/CSS, synthetic HTTP only. Exact editorTarget/onNav boundary is recorded; shell router, Workbench, backend authorization, providers and database are not mounted. No accessibility-compliance claim.' };
  writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.info(JSON.stringify({ status: summary.status, passed: summary.passed, caseCount: summary.caseCount, frozen }));
  if (summary.status !== 'pass') process.exitCode = 1;
} finally { await browser.close(); }
