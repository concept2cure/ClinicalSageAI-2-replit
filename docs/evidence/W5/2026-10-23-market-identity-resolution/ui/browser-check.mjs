// Actual Chromium over the existing component, following the prior W5 identity fixture pattern.
import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..'), out = resolve(here, 'browser-result');
mkdirSync(out, { recursive: true });
const paths = [
  'client/src/concept2cure/v2/surfaces/MarketApplicationNumber.tsx',
  'client/src/concept2cure/v2/dataConnect.tsx', 'client/src/concept2cure/v2/C2CForm.tsx',
  'client/src/lib/queryClient.ts', 'client/src/concept2cure/v2/useDialog.ts',
  'design-system/colors_and_type.css',
  ...['app-v2.css', 'journey-v2.css', 'surface-text-ramp.css'].map(name => `client/src/concept2cure/v2/styles/${name}`),
  ...['browser-probe.tsx', 'browser-check.mjs', 'browser-index.html', 'browser-server.mjs'].map(name => `docs/evidence/W5/2026-10-23-market-identity-resolution/ui/${name}`),
];
const pins = () => paths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }));
const before = pins(), checks = [], requests = [], errors = [];
let mode = 'unresolved', stored = null;
const unknownMarket = 'This submission has no recognized market. Correct its region before recording an application number.';
const unknownHome = "The project's primary agency is not recognized. Correct it before recording a market number or packaging.";
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const send = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
  requests.push({ method, path });
  const match = /^\/api\/submissions\/(\d+)\/application-number$/.exec(path);
  if (!match) return send(route, []);
  if (method === 'POST') {
    assert.equal(mode, 'record', 'An unresolved or control-only case attempted a number mutation.');
    const body = request.postDataJSON();
    assert.deepEqual(body, { applicationNumber: 'EMEA-H-C-005124', reason: 'EMA assigned this synthetic procedure number' });
    stored = body.applicationNumber;
    return send(route, { changed: true });
  }
  const submissionId = Number(match[1]);
  const base = { submissionId, home: false, market: 'EU', homeAgency: 'FDA', applicationNumber: stored, lastRecorded: null };
  if (mode === 'unresolved' || submissionId === 3) return send(route, { ...base, market: null, unresolvedReason: unknownMarket });
  if (mode === 'contradictory') return send(route, { ...base, home: true, applicationNumber: '214321', unresolvedReason: unknownHome });
  if (mode === 'malformed') return send(route, { ...base, unresolvedReason: {} });
  if (mode === 'home') return send(route, { ...base, home: true, market: null, applicationNumber: '214321', unresolvedReason: null });
  return send(route, { ...base, ...(mode === 'legacy' ? {} : { unresolvedReason: null }) });
});
const market = () => page.getByRole('region', { name: 'Synthetic market number', exact: true });
async function start(nextMode) {
  mode = nextMode; stored = null;
  await page.goto('http://127.0.0.1:5199/docs/evidence/W5/2026-10-23-market-identity-resolution/ui/browser-index.html', { waitUntil: 'networkidle' });
}
async function capture(name) { await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true }); }
try {
  await start('unresolved');
  await market().getByRole('alert').getByText(unknownMarket, { exact: true }).waitFor();
  assert.equal(await market().getByRole('button').count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await capture('unknown-market-refused');
  checks.push({ check: 'Unknown market displays server refusal without recording control', passed: true });

  await start('contradictory');
  await market().getByRole('alert').getByText(unknownHome, { exact: true }).waitFor();
  assert.doesNotMatch(await market().innerText(), /214321/);
  assert.equal(await market().getByRole('button').count(), 0);
  await capture('unknown-home-no-borrowed-number');
  checks.push({ check: 'Unresolved reason overrides contradictory home flag and project number', passed: true });

  await start('malformed');
  await market().getByRole('alert').getByText("This market's application number could not be read.", { exact: true }).waitFor();
  assert.equal(await market().getByRole('button').count(), 0);
  checks.push({ check: 'Malformed diagnosis fails the read without a recording control', passed: true });

  await start('home');
  assert.equal((await market().innerText()).trim(), '');
  checks.push({ check: 'Recognized home market preserves existing hidden row', passed: true });

  await start('legacy');
  await market().getByRole('button', { name: 'Record the number', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /Recorded with your name, the time and your reason/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push({ check: 'Older recognized response without diagnosis retains governed form', passed: true });

  await start('record');
  await market().getByRole('button', { name: 'Record the number', exact: true }).click();
  await page.getByLabel(/^Application number/).fill('EMEA-H-C-005124');
  await page.getByLabel(/^Reason/).fill('EMA assigned this synthetic procedure number');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByLabel('Observed change callback').getByText('Synthetic number change observed', { exact: true }).waitFor();
  await market().getByText('EMEA-H-C-005124', { exact: true }).waitFor();
  await capture('recognized-market-recorded');
  checks.push({ check: 'Recognized non-home market preserves reason-bearing record and reread', passed: true });

  await start('reread');
  await market().getByRole('button', { name: 'Record the number', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  // The shared dialog correctly traps focus; invoke the harness control by
  // DOM to simulate an external parent read change, not a user's dialog act.
  await page.getByRole('button', { name: 'Read unresolved synthetic market', exact: true }).evaluate(button => button.click());
  await market().getByRole('alert').getByText(unknownMarket, { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await market().getByRole('button').count(), 0);
  await page.getByRole('button', { name: 'Read resolved synthetic market', exact: true }).click();
  await market().getByRole('button', { name: 'Record the number', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'A corrected read must not reopen the stale form.');
  checks.push({ check: 'Unresolved parent reread removes open form; corrected read does not reopen it', passed: true });

  assert.equal(errors.length, 0, `Browser errors: ${errors.join(', ')}`);
  assert.equal(requests.filter(request => request.method === 'POST').length, 1, 'Only the explicitly synthetic recognized recording can POST.');
  assert.deepEqual(pins(), before, 'Browser source inputs changed during execution.');
  const result = { passed: true, syntheticInterceptedRecords: true, humanWitnessed: false, productionWriteExecuted: false,
    liveSignatureExecuted: false, liveTransmissionExecuted: false, sourcePins: before, checks, requests, browserErrors: errors };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally { await browser.close(); }
