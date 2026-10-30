/** Actual settings component/helpers/confirmation/CSS; synthetic auth, tenant and API. */
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
const programId = '9a7f0b10-0000-4000-8000-0000000000aa';
const bundle = await build({
  stdin: { resolveDir: repo, loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ProjectSettings} from './client/src/concept2cure/v2/surfaces/ProjectSettings';
    import {publishShellProject} from './client/src/concept2cure/v2/shellProject';
    window.fixture={user:{id:'7',organizationId:'9',role:'member'},revision:1,listeners:[],workspace:{id:'71',name:'Sponsor A',organizationId:'9'}};
    window.token=()=>sessionStorage.setItem('trialsage_access_token','fixture.'+btoa(JSON.stringify({userId:Number(window.fixture.user.id),organizationId:9}))+'.unsigned');
    window.token(); publishShellProject({id:'${programId}',title:'Sponsor A project'});
    const root=createRoot(document.getElementById('root'));
    window.render=()=>root.render(<main className="pj"><div className="pj-top"><div className="pj-top-l"><h1 className="pj-title">Sponsor A project</h1><p>Regulatory delivery</p></div><ProjectSettings programId="${programId}" onSaved={()=>window.savedCallbacks=(window.savedCallbacks||0)+1}/></div></main>);
    window.render();
    window.switchActor=()=>{window.fixture.user={id:'8',organizationId:'9',role:'member'};window.fixture.revision++;window.token();window.render();};
    window.refreshBearer=()=>{window.token();window.fixture.listeners.forEach(fn=>fn());};
  ` }, bundle: true, write: false, outfile: '/tmp/pm06-browser/bundle.js', format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'synthetic-auth-and-tenant', setup(b) {
    b.onResolve({ filter: /^@\/services\/portal\/authService$/ }, args => ({ path: args.path, namespace: 'fixture-auth' }));
    b.onResolve({ filter: /^@\/contexts\/TenantContext$/ }, args => ({ path: args.path, namespace: 'fixture-tenant' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-auth' }, () => ({ loader: 'js', contents: `
      export const useAuthUser=()=>window.fixture.user;
      export const authService={getUser:()=>window.fixture.user,captureSessionReadGuard:()=>{const revision=window.fixture.revision;return{sameRevision:()=>revision===window.fixture.revision};},on:(_event,fn)=>{window.fixture.listeners.push(fn);return()=>{window.fixture.listeners=window.fixture.listeners.filter(x=>x!==fn);};}};
    ` }));
    b.onLoad({ filter: /.*/, namespace: 'fixture-tenant' }, () => ({ loader: 'js', contents: 'export const useTenant=()=>({currentOrganization:{id:"9"},currentClientWorkspace:window.fixture.workspace});' }));
  } }],
});
const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = ['design-system/colors_and_type.css', 'client/src/concept2cure/v2/styles/app-v2.css'].map(path => readFileSync(repo + path, 'utf8')).join('\n') + '\n' + bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0;min-height:100%}.pj{padding:20px}</style><body class="c2c-v2"><div id="root"></div><script src="/bundle.js"></script>`;
const initial = () => ({ programId, projectId: 11, organizationId: 9, actorUserId: 7, clientWorkspaceId: 71,
  canChange: true, revision: `v1:${'a'.repeat(64)}`, description: 'Original description', priority: 'medium', targetSubmissionDate: '2027-01-01' });
const states = new Map(); const writes = [];
function respondRead(res, mode, current) {
  if (mode === 'read-error') { res.statusCode = 503; res.end(JSON.stringify({ error: 'PROJECT_SETTINGS_UNAVAILABLE', message: 'Settings are unavailable.' })); return; }
  const data = { ...current, ...(mode === 'read-only' ? { canChange: false } : {}), ...(mode === 'foreign' ? { organizationId: 10 } : {}) };
  res.end(JSON.stringify({ success: true, data }));
}
async function respondWrite(req, res, mode, current) {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); writes.push({ mode, body, actorBound: !!req.headers.authorization });
  assert.equal(body.revision, current.revision); assert.ok(body.reason.length >= 8);
  assert.ok(Object.keys(body.patch).every(key => ['description', 'priority', 'targetSubmissionDate'].includes(key)));
  if (mode === 'stale') { res.statusCode = 409; res.end(JSON.stringify({ error: 'PROJECT_SETTINGS_STALE', message: 'Project settings changed. Reload saved settings.' })); return; }
  if (mode === 'pending' || mode === 'retired') await new Promise(done => setTimeout(done, 900));
  const next = { ...current, ...body.patch, revision: `v1:${((writes.length % 14) + 1).toString(16).repeat(64)}` };
  if ('description' in body.patch) next.description = body.patch.description?.trim() || null;
  states.set(mode, next);
  if (mode === 'unknown') { res.statusCode = 503; res.end(JSON.stringify({ error: 'PROJECT_SETTINGS_OUTCOME_UNKNOWN', message: 'The save outcome could not be confirmed.' })); return; }
  const data = mode === 'bad-receipt' ? { ...next, clientWorkspaceId: 72 } : next;
  res.end(JSON.stringify({ success: true, data, meta: { auditTrail: { persisted: true, chained: true }, changedFields: Object.keys(body.patch) } }));
}
const server = createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(javascript); return; }
  if (!req.url.startsWith('/api/')) {
    const mode = new URL(req.url, 'http://fixture').searchParams.get('mode') || 'normal'; states.set(mode, initial());
    res.setHeader('Content-Type', 'text/html'); res.end(html); return;
  }
  res.setHeader('Content-Type', 'application/json');
  const mode = new URL(req.headers.referer || 'http://fixture/').searchParams.get('mode') || 'normal';
  assert.ok(req.headers.authorization); assert.equal(req.headers['x-organization-id'], '9'); assert.equal(req.headers['x-client-id'], '71');
  const current = states.get(mode);
  if (req.method === 'GET') respondRead(res, mode, current);
  else await respondWrite(req, res, mode, current);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, lastPage; const results = [];
async function open(page, mode) {
  await page.goto(`${origin}/?mode=${mode}`); await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  if (!['read-error', 'foreign'].includes(mode)) await page.getByRole('textbox', { name: 'Project description', exact: true }).waitFor();
}
async function review(page) {
  await page.getByRole('textbox', { name: 'Project description', exact: true }).fill('Reviewed project description');
  await page.getByRole('combobox', { name: 'Project priority', exact: true }).selectOption('high');
  await page.getByLabel('Target submission date', { exact: true }).fill('2028-02-29');
  await page.getByRole('button', { name: 'Review settings change', exact: true }).click();
  await page.getByPlaceholder('Captured verbatim in the audit log. Be specific.', { exact: true }).fill('Agreed revised delivery baseline');
  await page.getByPlaceholder('yes', { exact: true }).fill('yes');
}
try {
  browser = await launchChromium({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium' });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1050 } }); lastPage = page; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await open(page, 'pending'); await review(page);
    await page.screenshot({ path: out + `settings-review-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Confirm and log', exact: true }).click();
    await page.getByRole('button', { name: 'Logging audit…', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Close settings', exact: true }).isDisabled());
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByText('Project settings saved with your reason in the chained audit trail.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.savedCallbacks), 1);
    assert.equal(await page.getByLabel('Target submission date', { exact: true }).inputValue(), '2028-02-29');
    assert.ok(await page.getByRole('button', { name: 'Review settings change', exact: true }).isDisabled());
    await page.screenshot({ path: out + `settings-saved-${width}.png`, fullPage: true });
    const layout = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.viewport, JSON.stringify(layout));
    await open(page, 'read-only'); assert.ok(await page.getByRole('textbox', { name: 'Project description', exact: true }).isDisabled());
    assert.equal(await page.getByRole('button', { name: 'Review settings change', exact: true }).count(), 0);
    for (const mode of ['read-error', 'foreign']) { await open(page, mode); await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('textbox', { name: 'Project description', exact: true }).count(), 0); }
    for (const mode of ['unknown', 'bad-receipt', 'stale']) {
      await open(page, mode); await review(page); await page.getByRole('button', { name: 'Confirm and log', exact: true }).click();
      await page.getByRole('alert').waitFor(); const count = writes.length;
      assert.ok(await page.getByRole('button', { name: 'Review settings change', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Close settings', exact: true }).click();
      await page.getByRole('button', { name: 'Project settings', exact: true }).click();
      assert.ok(await page.getByRole('button', { name: 'Review settings change', exact: true }).isDisabled()); assert.equal(writes.length, count);
      assert.equal(await page.evaluate(() => window.savedCallbacks), undefined);
      await page.screenshot({ path: out + `settings-${mode}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Reload saved settings', exact: true }).click();
      await page.getByText('Current saved settings loaded. This read does not confirm an earlier uncertain save or audit.', { exact: true }).waitFor();
      assert.equal(writes.length, count); assert.equal(await page.evaluate(() => window.savedCallbacks), undefined);
    }
    await open(page, 'retired'); await review(page); await page.getByRole('button', { name: 'Confirm and log', exact: true }).click();
    await page.getByRole('button', { name: 'Logging audit…', exact: true }).waitFor(); await page.evaluate(() => window.switchActor());
    await page.waitForTimeout(1000); assert.equal(await page.getByRole('textbox', { name: 'Project description', exact: true }).count(), 0); assert.equal(await page.evaluate(() => window.savedCallbacks), undefined);
    assert.deepEqual(errors, []);
    results.push({ width, recordedScopeAndReason: true, savedValues: true, pendingCloseAndEscapeBlocked: true,
      unknownStaleAndForeignReceiptRequireExplicitReload: true, collapseDoesNotReplay: true,
      readOnlyAndUnavailableHonest: true, lateActorReplyRetired: true, horizontalOverflow: false, pageErrors: errors });
    await page.close();
  }
  writeFileSync(out + 'browser-result.json', JSON.stringify({ fixture: 'Actual settings component, shell guards, request helpers, confirmation and product CSS; synthetic auth/tenant/API', results, writes }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ results, writes: writes.length }, null, 2) + '\n');
} catch (error) {
  if (lastPage && !lastPage.isClosed()) { writeFileSync(out + 'browser-error.html', await lastPage.content()); await lastPage.screenshot({ path: out + 'browser-error.png', fullPage: true }); }
  throw error;
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
