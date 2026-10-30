// Actual shipped components in Chromium, explicit synthetic GET interception only.
import { launchChromium } from '../../../../../scripts/visual-qa/playwright.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, program, hazard, control, engineering } from './browser-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..');
const out = resolve(here, process.env.MDX_BROWSER_OUT || 'browser-result'); mkdirSync(out, { recursive: true });
const area = 'client/src/concept2cure', evidence = 'docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-30/ui';
const paths = [
  `${area}/v2/surfaces/ProjectMdxWorkflow.tsx`, `${area}/v2/surfaces/RiskRegister.tsx`, `${area}/v2/surfaces/riskRecordRead.ts`,
  `${area}/v2/projectScopedRead.tsx`, `${area}/v2/dataConnect.tsx`, `${area}/v2/shellProject.ts`, `${area}/v2/navParams.ts`,
  `${area}/v2/editor/authoringCurrentRead.ts`, `${area}/v2/SignedContentState.tsx`, `${area}/v2/surfaceContext.ts`, `${area}/v2/surfaceActions.ts`,
  `${area}/mdx/MdxSurfaceHost.tsx`, `${area}/mdx/surfaces/EngineeringSurface.tsx`, `${area}/mdx/surfaces/engineeringPanelTarget.ts`,
  `${area}/mdx/surfaces/engineeringPanelsContext.ts`, `${area}/mdx/surfaces/hostContextReport.ts`,
  `${area}/mdx/hooks/useMdxPrograms.ts`, `${area}/mdx/hooks/useEngineering.ts`, `${area}/mdx/hooks/useFetchJson.ts`,
  'shared/navigation/index.ts', 'shared/regulatory/work-packages.ts', 'client/src/services/portal/authService.tsx',
  'client/src/lib/queryClient.ts', 'client/src/utils/authToken.ts', 'client/src/index.css', 'design-system/colors_and_type.css',
  ...['app-v2.css', 'surfaces-v2.css', 'misc-surfaces-v2.css', 'coverage-v2.css', 'surface-text-ramp.css', 'project-home-v2.css', 'mdx-project-workflow.css'].map(file => `${area}/v2/styles/${file}`),
  ...['app.css', 'pathway-tabs.css', 'files-tree.css', 'surface-text-ramp.css'].map(file => `${area}/mdx/${file}`),
  ...['browser-check.mjs', 'browser-probe.tsx', 'browser-fixtures.mjs', 'browser-index.html', 'browser-server.mjs'].map(file => `${evidence}/${file}`),
  'docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs', 'scripts/visual-qa/playwright.mjs',
];
const pins = () => paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), checks = [], requests = [], errors = [], unexpected = [];
const browser = await launchChromium(), page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
let mode = '';
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  requests.push({ method, path, query: url.search });
  if (method !== 'GET') { unexpected.push({ method, path }); return send(route, { error: 'Synthetic fixture refuses writes' }, 405); }
  if (path === '/api/regulatory-programs') return send(route, { data: [program] });
  if (path === `/api/mdx/engineering/${project.id}`) return mode === 'project-refused'
    ? send(route, { error: 'Project not found' }, 404) : send(route, engineering);
  if (['/api/mdx/risk-items', '/api/design-controls'].includes(path)) {
    if (url.searchParams.get('program_id') !== project.id) { unexpected.push({ method, path, query: url.search }); return send(route, { error: 'Project selector required' }, 422); }
    if (path === '/api/mdx/risk-items' && mode === 'list-refused') return send(route, { error: 'Project not found' }, 404);
    return send(route, { data: path === '/api/mdx/risk-items' ? [hazard] : [], meta: { scope: 'program', programId: project.id } });
  }
  if (path === '/api/mdx/risk-items/1' && url.searchParams.get('program_id') === project.id) {
    if (mode === 'detail-error') return send(route, { error: 'SERVICE_UNAVAILABLE', message: 'Synthetic control read unavailable' }, 503);
    return send(route, { data: { ...hazard, controls: mode === 'no-controls' ? [] : [control] } });
  }
  unexpected.push({ method, path, query: url.search });
  return send(route, { error: 'Unqualified synthetic read' }, 501);
});
const observed = async () => JSON.parse(await page.getByLabel('Observed synthetic context').innerText());
async function start(nextMode = '') {
  mode = nextMode;
  await page.goto(`http://127.0.0.1:5201/${evidence}/browser-index.html?mode=${nextMode}`, { waitUntil: 'networkidle' });
  await page.getByTestId('pj-mdx-workflow').waitFor();
}
async function open(workstream, refused = false) {
  const item = page.locator(`[data-work-package="${workstream}"]`);
  await item.locator('summary').focus(); await page.keyboard.press('Enter');
  const button = item.getByRole('button', { name: 'Build the risk file and design-control trace', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  await page.getByTestId(refused ? 'eng-project-refused' : 'eng-risk-register').waitFor();
}
async function capture(name) {
  await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 45, fullPage: false, animations: 'disabled' });
}
function pass(check, detail = {}) { checks.push({ check, passed: true, ...detail }); process.stdout.write(`PASS ${checks.length}: ${check}\n`); }
try {
  await start(); await open('risk-management');
  const riskHeading = page.getByRole('heading', { name: 'Risk management · ISO 14971', exact: true });
  assert.equal(await riskHeading.evaluate(node => node === document.activeElement), true);
  await page.getByText(control.description, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.C2C_PROJECT.id), project.id);
  assert.equal((await observed()).screen, 'device-engineering');
  assert.equal(await page.getByText(/Risk controls for this hazard are not read/).count(), 0);
  await riskHeading.scrollIntoViewIfNeeded(); await capture('desktop-project-risk-controls');
  await page.locator('.risk-drawer').scrollIntoViewIfNeeded(); await capture('desktop-selected-hazard-controls');
  pass('Keyboard workstream action focuses the existing project risk file; persisted control and selected project survive the handoff');

  const context = (await observed()).context;
  assert.equal(context?.surfaceId, 'device-engineering');
  assert.equal(context?.facts?.program?.id, project.id);
  assert.equal(context?.facts?.riskRegister?.totalHazards, 1);
  assert.doesNotMatch(context?.summary ?? '', /all hazards.*acceptable/i);
  pass('AnA retains the MDX host’s composed project and risk context without inferred acceptance');

  await page.getByRole('button', { name: 'Return to project workflow', exact: true }).click();
  await open('design-controls');
  assert.equal(await page.getByRole('heading', { name: 'Design controls · DHF', exact: true }).evaluate(node => node === document.activeElement), true);
  pass('Design-control work targets the existing trace in the same engineering feature');

  await start('no-controls'); await open('risk-management');
  await page.getByText('No controls yet — add the first risk control.', { exact: true }).waitFor();
  pass('A successfully read empty control chain is stated as recorded empty');

  await start('detail-error'); await open('risk-management');
  await page.getByText(/Couldn't load the risk controls/).waitFor();
  assert.equal(await page.getByText('No controls yet — add the first risk control.', { exact: true }).count(), 0);
  await capture('desktop-unavailable-controls');
  pass('An unavailable detail read keeps the hazard visible and does not assert an empty control chain');

  await start('list-refused'); await open('risk-management');
  const riskPanel = page.getByTestId('eng-risk-register');
  await riskPanel.getByText("This project isn't one this organization can see", { exact: true }).waitFor();
  assert.equal(await riskPanel.getByText(hazard.hazard, { exact: true }).count(), 0);
  assert.equal(await riskPanel.getByText(control.description, { exact: true }).count(), 0);
  pass('A refused risk-register read shows the refusal and no register risk or control record');

  await start('project-refused'); await open('risk-management', true);
  assert.equal(await page.getByTestId('eng-risk-register').count(), 0);
  assert.equal(await page.getByText(hazard.hazard, { exact: true }).count(), 0);
  pass('A refused engineering project read mounts no risk register or aggregate record');

  await page.setViewportSize({ width: 390, height: 844 });
  await start(); await open('risk-management'); await page.getByText(control.description, { exact: true }).waitFor();
  await riskHeading.scrollIntoViewIfNeeded();
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, `Mobile overflow: ${JSON.stringify(dimensions)}`);
  const columns = await page.locator('.risk-split').evaluate(node => window.getComputedStyle(node).gridTemplateColumns);
  assert.equal(columns.split(' ').length, 1, `Mobile risk matrix and hazard drawer must stack: ${columns}`);
  await capture('mobile-project-risk-controls');
  await page.locator('.risk-drawer').scrollIntoViewIfNeeded(); await capture('mobile-selected-hazard-controls');
  pass('The risk matrix and hazard drawer stack in a readable 390px project view', { ...dimensions, columns });

  assert.equal(errors.length, 0, JSON.stringify(errors)); assert.equal(unexpected.length, 0, JSON.stringify(unexpected));
  assert.deepEqual(pins(), before, 'Selected production or fixture inputs changed during browser qualification');
  const result = { passed: true, syntheticInterceptedRecords: true, actualComponents: ['ProjectMdxWorkflow', 'MdxSurfaceHost', 'EngineeringSurface', 'RiskRegister'],
    authenticatedClientAcceptance: false, deployedApplicationTested: false, productionWriteExecuted: false, liveSignatureExecuted: false,
    sourcePins: before, checks, requests, browserErrors: errors, unexpectedRequests: unexpected };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  await capture('failure');
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ passed: false, error: String(error), checks, requests, browserErrors: errors, unexpectedRequests: unexpected, sourcePins: before }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
