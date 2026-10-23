/** Actual wizard/request guards/product CSS. Synthetic auth, filing picker and
 * API; this is component browser qualification, not deployed authentication. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { launchChromium } from '../../../../scripts/visual-qa/playwright.mjs';
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2]) + '/' : fileURLToPath(new URL('./', import.meta.url));
mkdirSync(out, { recursive: true });
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { build } = require('esbuild');
const bundle = await build({
  stdin: { resolveDir: repo, loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {NewProjectWizard} from './client/src/concept2cure/v2/surfaces/Projects';
    window.fixture={actor:7,org:9,tenantOrg:9,workspace:{id:'72',name:'Consultancy own',organizationId:'9'}};
    window.token=()=>sessionStorage.setItem('trialsage_access_token','fixture.'+btoa(JSON.stringify({userId:window.fixture.actor,organizationId:window.fixture.org}))+'.unsigned');
    window.token(); const root=createRoot(document.getElementById('root'));
    window.render=()=>root.render(<NewProjectWizard onClose={()=>window.fixtureClosed=true} onNav={id=>{window.navigated=id;window.navWorkspace=window.fixture.workspace.id;}}/>);
    window.render();
  ` }, bundle: true, write: false, outfile: '/tmp/pm05-browser/bundle.js', format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'synthetic-auth-and-filing', setup(b) {
    b.onResolve({ filter: /^@\/services\/portal\/authService$/ }, args => ({ path: args.path, namespace: 'fixture-auth' }));
    b.onResolve({ filter: /^@\/contexts\/TenantContext$/ }, args => ({ path: args.path, namespace: 'fixture-tenant' }));
    b.onResolve({ filter: /^\.\/AnaVerbs$/ }, args => args.importer.endsWith('/surfaces/Projects.tsx') ? { path: args.path, namespace: 'fixture-filing' } : undefined);
    b.onResolve({ filter: /^\.\/RegistryBridge$/ }, args => args.importer.endsWith('/surfaces/Projects.tsx') ? { path: args.path, namespace: 'fixture-registry' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture-auth' }, () => ({ loader: 'js', contents: 'export const useAuthUser=()=>({id:String(window.fixture.actor),organizationId:String(window.fixture.org)});' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-tenant' }, () => ({ loader: 'js', contents: 'export const useTenant=()=>({currentOrganization:{id:window.fixture.tenantOrg},currentClientWorkspace:window.fixture.workspace,setCurrentClientWorkspace:workspace=>{window.fixture.workspace=workspace;window.handoffs=(window.handoffs||0)+1;}});' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-filing' }, () => ({ loader: 'tsx', resolveDir: repo, contents: 'import React from "react"; export const RegistryPicker=({onChange})=><button className="btn" onClick={()=>onChange("510k")}>Select Traditional 510(k)</button>;' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-registry' }, () => ({ loader: 'js', contents: 'export const getSubmissionTypeContext=()=>({id:"us_510k",displayName:"Traditional 510(k)",pathwayKey:"510k",agency:"FDA",region:"US"});' }));
  } }],
});
const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = ['design-system/colors_and_type.css', 'client/src/concept2cure/v2/styles/app-v2.css'].map(path => readFileSync(repo + path, 'utf8')).join('\n') + '\n' + bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0;min-height:100%}</style><body class="c2c-v2"><div id="root"></div><script src="/bundle.js"></script>`;
const writes = [];
const programId = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(javascript); return; }
  if (!req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  res.setHeader('Content-Type', 'application/json');
  const mode = new URL(req.headers.referer || 'http://fixture/').searchParams.get('mode');
  if (req.url === '/api/clients?purpose=project-intake') {
    assert.ok(req.headers.authorization); assert.equal(req.headers['x-organization-id'], '9');
    if (mode === 'error') { res.statusCode = 503; res.end(JSON.stringify({ success: false, message: 'Unavailable' })); return; }
    const clients = mode === 'empty' ? [] : [{ id: '71', name: 'Sponsor A', organizationId: '9', status: 'active' }, { id: '72', name: 'Consultancy own', organizationId: '9', status: 'active' }];
    if (mode === 'foreign') clients[0].organizationId = '10';
    res.end(JSON.stringify({ success: true, clients, meta: { purpose: 'project-intake', organizationId: 9, actorUserId: 7 } })); return;
  }
  if (req.url === '/api/c2c/projects' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); assert.equal(body.clientWorkspaceId, 71); assert.equal(req.headers['x-client-id'], '71'); assert.equal(req.headers['x-organization-id'], '9');
    writes.push({ clientWorkspaceId: body.clientWorkspaceId, name: body.name, mode, actorBound: !!req.headers.authorization });
    if (mode === 'pending') await new Promise(done => setTimeout(done, 750));
    if (mode === 'unknown') { res.statusCode = 503; res.end(JSON.stringify({ error: 'PROJECT_CREATE_OUTCOME_UNKNOWN', message: 'Project creation outcome could not be confirmed.' })); return; }
    res.statusCode = 201;
    res.end(JSON.stringify({ data: { id: programId, title: body.name }, meta: { created: true, projectAnchorId: 31, organizationId: 9, actorUserId: 7, clientWorkspaceId: mode === 'bad-receipt' ? 72 : 71, clientWorkspaceName: 'Sponsor A' } })); return;
  }
  if (req.url.startsWith('/api/submissions/market-support')) {
    res.end(JSON.stringify({ data: { applicationType: '510k', asOf: '2026-10-23', markets: [{ applicationType: '510k', market: 'FDA', region: 'fda', agency: 'fda', summary: 'Preparation available', line: 'Synthetic filing offer for browser qualification', buildable: false, offered: true }] } })); return;
  }
  res.end(JSON.stringify({ data: [], success: true }));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, lastPage;
const results = [];
async function configure(page) {
  await page.getByRole('button', { name: 'Select Traditional 510(k)', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('combobox', { name: 'Client workspace', exact: true }).waitFor();
}
async function review(page) {
  await configure(page);
  const choice = page.getByRole('combobox', { name: 'Client workspace', exact: true });
  await choice.selectOption('71');
  await page.getByRole('textbox', { name: /project name/i }).fill('Sponsor A validation');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('.npw-review').getByText('Sponsor A', { exact: true }).waitFor();
}
try {
  browser = await launchChromium({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium' });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }); lastPage = page; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin + '/?mode=pending'); await configure(page);
    assert.equal(await page.getByRole('combobox', { name: 'Client workspace' }).inputValue(), '');
    await page.getByRole('textbox', { name: /project name/i }).fill('Sponsor A validation');
    assert.ok(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled());
    await page.getByRole('combobox', { name: 'Client workspace' }).selectOption('71');
    await page.screenshot({ path: out + `intake-configure-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.locator('.npw-review').getByText('Sponsor A', { exact: true }).waitFor();
    await page.screenshot({ path: out + `intake-review-${width}.png`, fullPage: true });
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(layout.scroll <= layout.viewport, JSON.stringify(layout));
    await page.getByRole('button', { name: /create project/i }).click();
    await page.getByRole('button', { name: 'Creating project…', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled());
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.fixtureClosed), undefined);
    await page.waitForFunction(() => window.navigated === 'project-home');
    assert.equal(await page.evaluate(() => window.navWorkspace), '71');
    assert.equal(await page.evaluate(() => window.handoffs), 1);
    for (const mode of ['empty', 'error', 'foreign']) {
      await page.goto(origin + '/?mode=' + mode); await configure(page);
      await page.getByText(mode === 'empty' ? /No active client workspace is available/ : /Client workspaces could not be verified/).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled());
    }
    for (const mode of ['unknown', 'bad-receipt']) {
      await page.goto(origin + '/?mode=' + mode); await review(page);
      await page.getByRole('button', { name: /create project/i }).click();
      await page.getByRole('button', { name: /check projects/i }).waitFor();
      assert.ok(await page.getByRole('button', { name: /create project/i }).isDisabled());
      assert.equal(await page.evaluate(() => window.navigated), undefined);
      assert.equal(await page.evaluate(() => window.fixture.workspace.id), '72');
      assert.equal(await page.evaluate(() => window.handoffs), undefined);
      await page.screenshot({ path: out + `intake-${mode}-${width}.png`, fullPage: true });
    }
    await page.goto(origin); await review(page);
    const priorWrites = writes.length;
    await page.evaluate(() => { window.fixture.actor = 8; window.token(); window.render(); });
    await page.getByRole('button', { name: 'Select Traditional 510(k)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /create project/i }).count(), 0);
    assert.equal(writes.length, priorWrites);
    assert.deepEqual(errors, []);
    results.push({ width, explicitMultiClientChoice: true, matchingBodyAndHeader: true, namedReview: true,
      emptyAndFailedDirectoryBlocked: true, foreignDirectoryBlocked: true, unknownAndBadReceiptBlockReplay: true,
      pendingCancelAndEscapeBlocked: true, savedWorkspaceSelectedBeforeNavigation: true, unverifiedSaveKeepsPriorWorkspace: true,
      actorSwitchRetiresSponsorForm: true, horizontalOverflow: false, pageErrors: errors });
    await page.close();
  }
  assert.equal(writes.length, 6);
  writeFileSync(out + 'browser-result.json', JSON.stringify({ fixture: 'Actual wizard/request guards/product CSS; synthetic auth, filing picker and API', results, writes }, null, 2) + '\n');
} catch (error) {
  if (lastPage && !lastPage.isClosed()) { writeFileSync(out + 'browser-diagnostic.html', await lastPage.content()); await lastPage.screenshot({ path: out + 'browser-diagnostic.png', fullPage: true }); }
  throw error;
} finally {
  if (browser) await browser.close(); await new Promise(done => server.close(done));
}
