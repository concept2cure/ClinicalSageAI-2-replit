/** Isolated actual-component/layout check with synthetic data; not a deployed
 * session or end-to-end authentication proof. Needs an existing Playwright and
 * Chromium installation; adds no dependency. Run from any working directory.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { launchChromium } from '../../../../scripts/visual-qa/playwright.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const out = fileURLToPath(new URL('./', import.meta.url));
const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { build } = require('esbuild');
const fixture = {
  program_id: '11111111-1111-4111-8111-111111111111', project_id: 11,
  team: [
    { entry_id: 'user:5', user_id: 5, role: 'lead', name: 'Alex Chen', email: 'alex@example.test',
      identity: 'active_member', label: 'Alex Chen · alex@example.test', responsibilities: ['project_lead'],
      sharing_role: 'edit', sources: ['program_lead', 'project_member'] },
    { entry_id: 'user:6', user_id: 6, role: null, name: 'Alex Chen', email: 'other@example.test',
      identity: 'active_member', label: 'Alex Chen · other@example.test', responsibilities: ['project_owner'],
      sharing_role: 'owner', sources: ['project_owner'] },
    { entry_id: 'user:7', user_id: 7, role: null, name: null, email: null,
      identity: 'unconfirmed_account', label: 'Account #7 — Current membership not confirmed', responsibilities: [],
      sharing_role: null, sources: ['project_member'] },
    { entry_id: 'recorded-name:0', user_id: null, role: null, name: 'Client contact', email: null,
      identity: 'recorded_name', label: 'Client contact', responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
  ],
};
const bundle = await build({
  stdin: { resolveDir: repo, loader: 'tsx', contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {ProjectTeamResponsibilities} from './client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities';
    const data=${JSON.stringify(fixture)};
    const mode=new URLSearchParams(location.search).get('mode');
    const state=mode==='error'?{data:null,loading:false,empty:false,error:'Unavailable'}:
      {data:mode==='empty'?{...data,team:[]}:data,loading:false,empty:false};
    window.retryCount=0;
    createRoot(document.getElementById('root')).render(<ProjectTeamResponsibilities
      programId={data.program_id} state={state} onRetry={()=>{window.retryCount++}}/>);
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
});
const css = ['design-system/colors_and_type.css', 'client/src/concept2cure/v2/styles/app-v2.css',
  'client/src/concept2cure/v2/styles/project-home-v2.css'].map(path => readFileSync(repo + path, 'utf8')).join('\n');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${css}html,body{margin:0;min-height:100%}main{max-width:960px;margin:auto;padding:24px}</style>
  <body class="c2c-v2"><main><p>Synthetic PM-03 component check</p><section class="pj-sec">
  <div class="pj-sec-h"><h2>Team &amp; activity</h2></div><div id="root"></div></section></main><script src="/bundle.js"></script>`;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].text : html);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await launchChromium({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium' });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    await page.getByRole('list', { name: 'Recorded project team' }).waitFor();
    assert.equal(await page.locator('.pj-team-person').count(), 4);
    assert.equal(await page.getByText('Client contact', { exact: true }).count(), 1);
    const layout = await page.evaluate(() => ({
      viewport: innerWidth, scroll: document.documentElement.scrollWidth,
      border: getComputedStyle(document.querySelector('.pj-team-person')).borderTopWidth,
    }));
    assert.ok(layout.scroll <= layout.viewport, JSON.stringify(layout));
    assert.equal(layout.border, '1px');
    await page.screenshot({ path: out + `team-${width}.png`, fullPage: true });
    await page.goto(origin + '/?mode=error');
    await page.getByText("Couldn't load the project team", { exact: true }).waitFor();
    await page.getByRole('button', { name: /retry|try again/i }).click();
    assert.equal(await page.evaluate(() => window.retryCount), 1);
    await page.goto(origin + '/?mode=empty');
    await page.getByText('No recorded team members', { exact: true }).waitFor();
    assert.equal(await page.locator('.pj-team-person').count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, rows: 4, horizontalOverflow: false, border: layout.border, retry: 'passed', empty: 'passed', pageErrors: errors });
    await page.close();
  }
  writeFileSync(out + 'browser-result.json', JSON.stringify({ scope: 'isolated actual component, synthetic data', results }, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
