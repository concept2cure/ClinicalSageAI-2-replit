// Real Chromium, actual shipped components, intercepted synthetic GET responses only.
import { launchChromium } from '../../../../../scripts/visual-qa/playwright.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios, catalog, licence } from './browser-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const out = resolve(here, 'browser-result');
mkdirSync(out, { recursive: true });
const area = 'client/src/concept2cure/v2';
const evidence = 'docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/ui';
const paths = [
  `${area}/surfaces/ProjectHome.tsx`, `${area}/surfaces/ProjectMdxWorkflow.tsx`, `${area}/surfaces/WorkflowCatalog.tsx`,
  `${area}/surfaces/MdxCatalogSolution.tsx`, `${area}/surfaces/AdminSurfaces.tsx`,
  `${area}/surfaces/programSequence.ts`, `${area}/dataConnect.tsx`, `${area}/navEntitlements.tsx`,
  `${area}/registryModel.ts`, `${area}/catalogWorkflows.ts`, `${area}/surfaceContext.ts`, `${area}/surfaceAvailable.ts`,
  'shared/regulatory/work-packages.ts', 'shared/constants/mdx-project-features.ts', 'shared/constants/launch-scope.ts',
  'client/src/components/ui/button.tsx', 'client/src/index.css', 'postcss.config.js', 'tailwind.config.ts',
  'design-system/colors_and_type.css',
  ...['app-v2.css', 'surfaces-v2.css', 'misc-surfaces-v2.css', 'coverage-v2.css', 'surface-text-ramp.css', 'project-home-v2.css', 'mdx-project-workflow.css', 'workflows-v2.css'].map(name => `${area}/styles/${name}`),
  ...['browser-probe.tsx', 'browser-fixtures.mjs', 'browser-check.mjs', 'browser-index.html', 'browser-server.mjs'].map(name => `${evidence}/${name}`),
  'docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs',
  'scripts/visual-qa/playwright.mjs', 'client/src/concept2cure/mdx/MdxSurfaceHost.tsx',
  'client/src/utils/authToken.ts', 'client/src/lib/queryClient.ts',
];
const pins = () => paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), checks = [], requests = [], errors = [], unexpected = [];
let scenario = scenarios['510k'];
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
function syntheticReads() {
  const projectPath = `/api/c2c/projects/${scenario.project.id}`;
  const reply = (body, status = 200) => ({ body, status });
  return new Map([
    ['/api/module-subscriptions/catalog', reply({ modules: catalog, launchScope: { enforced: true } })],
    ['/api/module-subscriptions/license', reply(licence)],
    [projectPath, reply(scenario.project)],
    [`${projectPath}/activity`, reply({ activity: [] })],
    [`${projectPath}/dossier`, reply({ projectId: scenario.project.id, measuredAt: '2026-10-23T00:00:00Z', home: { state: 'no_sections', pct: null }, markets: [], rows: [] })],
    [`${projectPath}/team`, reply({ error: 'Synthetic fixture has no verified team' }, 503)],
    ['/api/submissions', reply(scenario.filings.map((applicationType, i) => ({ id: 900 + i, applicationType, programId: scenario.project.id, region: 'EU', agency: 'EU', status: 'draft', name: `Synthetic ${applicationType}` })))],
    ['/api/authoring/docs', reply({ documents: [] })],
    ['/api/review/board', reply({ queue: [], total: 0 })],
    ['/api/chat/threads', reply({ threads: [] })],
    ['/api/ana-ri/runs', reply({ runs: [] })],
    [`/api/concept2cure/projects/${scenario.project.id}/unified-work`, reply({ items: [], summary: { total: 0, blocking: 0, done: 0, partial: false } })],
    [`${projectPath}/records`, reply({ projectId: scenario.project.id, records: Object.fromEntries(['submissions', 'sources', 'authoringDocuments', 'vaultDocuments', 'studyDesigns', 'filingDocuments'].map(key => [key, { available: true, rows: [] }])) })],
    [`/api/ana-skills/projects/${scenario.project.id}`, reply({ settings: [], skills: [], alwaysMax: 3, canChange: false })],
    [`/api/c2c/project-vault/${scenario.project.id}`, reply({ success: true, data: { tree: [], documentCount: 0, uploadsWindow: { shown: 0, total: 0, truncated: false } } })],
    [`${projectPath}/conversation-files`, reply({ projectId: scenario.project.id, files: [], window: { shown: 0, truncated: false } })],
    [`${projectPath}/sources`, reply({ sources: [], total: 0, currentTotal: 0, usageScope: 'accessible-citations', window: { shown: 0, truncated: false } })],
    [`${projectPath}/source-changes`, reply({ changes: [], count: 0 })],
  ]);
}
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  requests.push({ method, path, query: url.search });
  if (method !== 'GET') { unexpected.push({ method, path }); return send(route, { error: 'Synthetic harness refuses writes' }, 405); }
  const response = syntheticReads().get(path);
  if (response) return send(route, response.body, response.status);
  if (/^\/api\/submissions\/\d+\/sequences$/.test(path)) return send(route, []);
  unexpected.push({ method, path });
  return send(route, { error: 'Unqualified synthetic read; add an explicit fixture before claiming coverage' }, 501);
});
const workflow = () => page.getByTestId('pj-mdx-workflow');
const work = id => workflow().locator(`[data-work-package="${id}"]`);
const observed = async () => JSON.parse(await page.getByLabel('Observed callbacks').innerText());
async function start(filing = '510k', view = 'workflow', extra = '') {
  scenario = scenarios[filing];
  await page.goto(`http://127.0.0.1:5201/${evidence}/browser-index.html?filing=${filing}&view=${view}${extra}`, { waitUntil: 'networkidle' });
  if (view !== 'catalog') await workflow().waitFor();
}
async function open(id) {
  const detail = work(id);
  if (await detail.getAttribute('open') === null) await detail.locator('summary').click();
  return detail;
}
async function capture(name, anchor) {
  // Cancel a stage callback's smooth scroll before recording the selected stage.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  if (anchor) await page.locator(anchor).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 45, fullPage: false, animations: 'disabled' });
}
function pass(check, detail = {}) {
  checks.push({ check, passed: true, ...detail });
  process.stdout.write(`PASS ${checks.length}: ${check}\n`);
}
async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, `${label}: ${JSON.stringify(dimensions)}`);
  return dimensions;
}
function contrast(a, b) {
  const luminance = color => {
    const rgb = color.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
    assert.ok(rgb && (!rgb[4] || Number(rgb[4]) === 1), `Expected opaque RGB: ${color}`);
    const c = rgb.slice(1, 4).map(n => Number(n) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const levels = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (levels[1] + .05) / (levels[0] + .05);
}
try {
  await start();
  await workflow().getByRole('heading', { name: '510(k) · Device project workflow', exact: true }).waitFor();
  assert.match(await workflow().innerText(), /Regulatory Affairs owns the filing/);
  assert.match(await workflow().innerText(), /Submission snapshot/);
  assert.equal(await work('performance-evaluation').count(), 0);
  assert.equal(await work('software-cybersecurity').count(), 0, 'No declared software flag must not invent software work');
  assert.equal(await workflow().locator('[data-status="done"], [data-status="approved"], [role="progressbar"]').count(), 0);
  await capture('desktop-510k-overview');
  pass('510(k) shows engineering/quality filing ownership, snapshot cadence and declared applicability without invented completion');

  const design = work('design-controls'), summary = design.locator('summary');
  await summary.focus(); await page.keyboard.press('Enter');
  assert.notEqual(await design.getAttribute('open'), null);
  const focus = await summary.evaluate(node => { const s = window.getComputedStyle(node); return { style: s.outlineStyle, width: s.outlineWidth }; });
  assert.notEqual(focus.style, 'none'); assert.notEqual(focus.width, '0px');
  await page.keyboard.press('Tab');
  const actionFocus = await design.getByRole('button', { name: 'Open engineering evidence', exact: true }).evaluate(node => {
    const style = window.getComputedStyle(node);
    return { focused: node === document.activeElement, outline: style.outlineStyle, width: style.outlineWidth };
  });
  assert.equal(actionFocus.focused, true); assert.notEqual(actionFocus.outline, 'none'); assert.notEqual(actionFocus.width, '0px');
  assert.match(await design.innerText(), /R&D \/ Systems Engineering/);
  await design.getByRole('button', { name: 'Open engineering evidence', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-engineering');
  await design.getByRole('button', { name: 'Prepare this work with AnA', exact: true }).click();
  const ask = (await observed()).ask;
  assert.match(ask, /open project Synthetic device Alpha/); assert.match(ask, /design controls/); assert.match(ask, /R&D \/ Systems Engineering/);
  assert.match(ask, /recorded evidence/); assert.match(ask, /Deliverables:/);
  await page.keyboard.press('Tab');
  await summary.focus(); await page.keyboard.press('Enter'); assert.equal(await design.getAttribute('open'), null);
  pass('Native workstream disclosure and action retain visible keyboard focus; existing engineering route and AnA callback carry the actual synthetic project name, discipline and deliverables', { focus, actionFocus, navigation: 'device-engineering', ask });

  await (await open('bench-performance-testing')).getByRole('button', { name: 'Open project evidence', exact: true }).click();
  assert.equal((await observed()).stage, 'evidence');
  await (await open('medical-writing')).getByRole('button', { name: 'Open project documents', exact: true }).click();
  assert.equal((await observed()).stage, 'author');
  await (await open('submission-assembly')).getByRole('button', { name: 'Open eSTAR assembly', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-510k');
  pass('Specialist bench work uses project Evidence, writing uses Author, and eSTAR assembly reaches the existing 510(k) surface');

  await start('cer');
  assert.match(await workflow().innerText(), /qualified evaluator/); assert.match(await workflow().innerText(), /Living evaluation/);
  const clinical = await open('clinical-evidence');
  assert.match(await clinical.innerText(), /Clinical Affairs/); assert.match(await clinical.innerText(), /Literature Specialists/);
  await clinical.getByRole('button', { name: 'Open clinical evaluation', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-cer');
  assert.equal(await work('performance-evaluation').count(), 0);
  await capture('desktop-cer-clinical-evidence', '[data-work-package="clinical-evidence"]');
  pass('MDR CER has clinical ownership, qualified evaluation and literature contributors with its living-update cadence and existing CER destination');

  await start('ivdr');
  assert.match(await workflow().innerText(), /EU IVDR PER/); assert.match(await workflow().innerText(), /PMPF/);
  assert.equal(await work('clinical-evidence').count(), 0);
  const per = await open('performance-evaluation');
  assert.match(await per.innerText(), /Clinical Affairs/); assert.match(await per.innerText(), /Laboratory Medicine/);
  await per.getByRole('button', { name: 'Open IVDR evidence', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-diagnostics');
  await capture('desktop-ivdr-performance-evaluation', '[data-work-package="performance-evaluation"]');
  pass('IVDR PER uses analytical/clinical performance and PMPF with the diagnostic evidence route, distinct from MDR CER');

  await start('multi');
  await workflow().getByRole('heading', { name: '510(k) · Diagnostic project workflow', exact: true }).waitFor();
  assert.equal(await work('analytical-performance').count(), 1); assert.equal(await work('risk-management').count(), 1);
  const analytical = await open('analytical-performance');
  const feeds = await analytical.locator('dl').innerText();
  assert.match(feeds, /510k:/); assert.match(feeds, /ivdr:/);
  await (await open('clinical-evidence')).getByRole('button', { name: 'Open clinical evaluation', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-cer');
  await (await open('performance-evaluation')).getByRole('button', { name: 'Open IVDR evidence', exact: true }).click();
  assert.equal((await observed()).navigation, 'device-diagnostics');
  await capture('desktop-shared-multifiling-evidence', '[data-work-package="analytical-performance"]');
  pass('Recorded secondary MDR/IVDR filings share each evidence workstream once while retaining primary 510(k) and distinct evaluation destinations', { feeds });

  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-multifiling-expanded', '[data-work-package="analytical-performance"]');
  pass('Expanded multi-filing workstreams and their action buttons fit a 390px viewport', await noOverflow('Mobile workflow'));
  await page.locator('.c2c-v2').evaluate(node => { node.classList.add('dark'); node.setAttribute('data-theme', 'dark'); });
  const colors = await workflow().evaluate(node => {
    const panel = window.getComputedStyle(node), paragraph = window.getComputedStyle(node.querySelector('p'));
    const owner = window.getComputedStyle(node.querySelector('.pj-mdx-owner')), button = window.getComputedStyle(node.querySelector('details[open] button'));
    return { background: panel.backgroundColor, text: paragraph.color, owner: owner.color, button: button.color, buttonBackground: button.backgroundColor, buttonHeight: button.height, buttonPadding: button.paddingLeft };
  });
  const textContrast = contrast(colors.text, colors.background), ownerContrast = contrast(colors.owner, colors.background);
  assert.ok(textContrast >= 4.5 && ownerContrast >= 4.5, `Dark contrast: ${JSON.stringify({ colors, textContrast, ownerContrast })}`);
  assert.ok(parseFloat(colors.buttonHeight) >= 32 && parseFloat(colors.buttonPadding) >= 10, 'Visible workflow actions must retain the canonical v2 button height and horizontal padding');
  await capture('mobile-dark-multifiling-expanded', '[data-work-package="analytical-performance"]');
  pass('Dark workflow body and discipline-owner text meet 4.5:1 contrast; canonical v2 workflow action sizing is present', { colors, textContrast, ownerContrast });

  await start('de-novo');
  await workflow().getByRole('heading', { name: 'De Novo · Device project workflow', exact: true }).waitFor();
  await (await open('submission-assembly')).getByRole('button', { name: 'Open project documents', exact: true }).click();
  assert.equal((await observed()).stage, 'author');
  assert.equal((await observed()).navigation, '', 'De Novo must not be misrouted to the hard-coded 510(k) workbench');
  pass('De Novo submission assembly reaches existing project Author documents without relabeling the filing as 510(k)');

  await page.setViewportSize({ width: 1440, height: 1050 });
  await start('510k', 'workflow', '&locked=true&markets=unavailable');
  await workflow().getByRole('status').getByText('Additional project filings could not be read. The plan reflects the primary filing only.', { exact: true }).waitFor();
  await (await open('design-controls')).getByRole('button', { name: 'Open project evidence', exact: true }).click();
  assert.equal((await observed()).stage, 'evidence'); assert.equal((await observed()).navigation, '');
  pass('Unreadable additional filings are explicit and unavailable feature actions retain the project Evidence fallback');

  await start('510k', 'catalog');
  const solution = page.getByTestId('mdx-catalog-solution'); await solution.waitFor();
  assert.equal(await solution.count(), 1);
  await page.getByRole('region', { name: 'Projects workflow', exact: true }).getByTestId('mdx-catalog-solution').waitFor();
  assert.equal(await solution.getByRole('button', { name: 'Open', exact: true }).count(), 0);
  const projectAction = solution.getByRole('button', { name: 'Open projects', exact: true });
  const projectAppearance = await projectAction.evaluate(node => {
    const style = window.getComputedStyle(node);
    return { height: parseFloat(style.height), padding: parseFloat(style.paddingLeft), border: parseFloat(style.borderTopWidth), color: style.color, background: style.backgroundColor };
  });
  assert.ok(projectAppearance.height >= 32 && projectAppearance.padding >= 12 && (projectAppearance.border > 0 || !['rgba(0, 0, 0, 0)', 'transparent'].includes(projectAppearance.background)),
    `Catalog project action needs the existing shell button affordance: ${JSON.stringify(projectAppearance)}`);
  assert.ok(contrast(projectAppearance.color, projectAppearance.background) >= 4.5, 'Primary project action text must remain readable');
  await projectAction.focus();
  await page.keyboard.press('Enter');
  assert.equal((await observed()).navigation, 'projects');
  await solution.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await solution.locator('[data-feature-id]').count(), 6);
  assert.match(await solution.locator('[data-feature-id="device-software"]').innerText(), /turned off for this workspace/i);
  await capture('desktop-catalog-project-mdx-solution');
  pass('One MDX solution sits inside Projects; individually governed features expose one visibly styled, keyboard-operated Open projects action', { projectAppearance });

  await page.getByRole('searchbox', { name: 'Find a workflow or feature', exact: true }).fill('IVDR completeness');
  assert.equal(await solution.locator('[data-feature-id]').count(), 1);
  await solution.locator('[data-feature-id="ivd-completeness"]').waitFor();
  assert.equal(await solution.getByRole('button', { name: 'Open', exact: true }).count(), 0);
  await page.getByRole('searchbox', { name: 'Find a workflow or feature', exact: true }).fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-catalog-project-mdx-solution');
  pass('Search retains nested MDX feature discovery without individual app launches, and Projects/MDX catalog fits 390px', await noOverflow('Mobile catalog'));

  await page.setViewportSize({ width: 1440, height: 1050 });
  await start('510k', 'home');
  await (await open('bench-performance-testing')).getByRole('button', { name: 'Open project evidence', exact: true }).click();
  await page.locator('.pj-lc-stage[aria-current="step"]').filter({ hasText: 'Evidence' }).waitFor();
  assert.equal(await page.evaluate(() => window.C2C_PROJECT.id), scenario.project.id);
  await (await open('medical-writing')).getByRole('button', { name: 'Open project documents', exact: true }).click();
  await page.locator('.pj-lc-stage[aria-current="step"]').filter({ hasText: 'Author' }).waitFor();
  assert.doesNotMatch(await page.locator('.pj-stageband-blurb').innerText(), /eCTD/);
  await page.getByTestId('pj-docs-empty').waitFor();
  assert.equal(await page.getByTestId('pj-docs-error').count(), 0);
  assert.equal((await observed()).navigation, '');
  await capture('desktop-actual-project-home-author', '.pj-lc');
  pass('Actual ProjectHome loads its verified synthetic device UUID and workstream actions switch the existing Evidence/Author lifecycle in place without changing project or leaving for another app');

  await page.setViewportSize({ width: 390, height: 844 });
  await capture('mobile-actual-project-home-author', '.pj-lc');
  pass('Actual containing ProjectHome and its device workflow fit 390px', await noOverflow('Mobile ProjectHome'));
  assert.equal(unexpected.length, 0, `Unexpected API requests: ${JSON.stringify(unexpected)}`);
  assert.equal(errors.length, 0, `Browser page errors: ${errors.join(', ')}`);
  assert.deepEqual(pins(), before, 'Selected component/CSS/fixture source changed during qualification');
  const result = { passed: true, syntheticInterceptedRecords: true, actualComponents: ['ProjectMdxWorkflow', 'ProjectHome', 'Apps / WorkflowCatalog'],
    humanWitnessed: false, authenticatedClientAcceptance: false, deployedApplicationTested: false,
    productionWriteExecuted: false, liveSignatureExecuted: false, liveTransmissionExecuted: false,
    sourcePins: before, checks, requests, unexpectedRequests: unexpected, browserErrors: errors };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  await capture('failure');
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ passed: false, error: String(error), checks, requests, unexpectedRequests: unexpected, browserErrors: errors, sourcePins: before }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
