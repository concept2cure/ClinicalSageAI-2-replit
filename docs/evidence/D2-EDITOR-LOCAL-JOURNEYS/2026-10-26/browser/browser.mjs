/** Actual chooser browser boundary checks; every API response is synthetic. */
import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { bearer, document, DOC, PROGRAM } from './fixtures.mjs';

const bundle = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(bundle, '../../../../..');
const out = path.join(bundle, process.argv.includes('--red') ? 'red' : 'final');
assert.ok(!fs.existsSync(out), 'Preserve prior evidence; choose a fresh output directory');
fs.mkdirSync(out);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = ['client/src/concept2cure/v2/editor/useSourceAssemblyTarget.ts',
  'client/src/concept2cure/v2/editor/SourceAssemblyDialog.tsx', 'client/src/concept2cure/v2/editorTarget.ts',
  'client/src/services/portal/authService.tsx', 'client/src/utils/authToken.ts',
  'design-system/colors_and_type.css', 'client/src/concept2cure/v2/styles/journey-v2.css',
  'client/src/concept2cure/v2/styles/authoring-v2.css'];
const pins = () => Object.fromEntries(inputs.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
const before = pins();
for (const file of inputs.slice(0, 3)) fs.writeFileSync(path.join(out, path.basename(file) + '.gz'), gzipSync(fs.readFileSync(path.join(root, file)), { mtime: 0 }));
const executable = ['browser.mjs', 'probe.tsx', 'fixtures.mjs', 'server.mjs', 'index.html'];
const fixturePins = Object.fromEntries(executable.map(file => [file, hash(fs.readFileSync(path.join(bundle, file)))]));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const cases = [];
try {
  for (const mode of ['close-project', 'close-session', 'close-ceremony']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [], requests = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), headers = request.headers();
      requests.push({ method: request.method(), path: url.pathname, programId: url.searchParams.get('programId'),
        initialBearer: headers.authorization === `Bearer ${bearer()}`, organization: headers['x-organization-id'] });
      if (request.method() === 'GET' && url.pathname === '/api/authoring/docs' && url.searchParams.get('programId') === PROGRAM)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, documents: [document] }) });
      unexpected.push({ method: request.method(), path: url.pathname });
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unexpected synthetic endpoint' }) });
    });
    let result;
    try {
      await page.goto(`http://127.0.0.1:5216/docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/?mode=${mode}`);
      await page.getByRole('combobox', { name: 'Working document' }).selectOption(DOC);
      await page.getByRole('button', { name: 'Open in editor', exact: true }).click();
      await page.getByText('Chooser closed.', { exact: true }).waitFor();
      const delivered = await page.evaluate(() => ({ navigation: window.chooserNavigation, target: window.chooserPeek() }));
      await page.screenshot({ path: path.join(out, `${mode}.png`) });
      assert.deepEqual(errors, [], 'Browser fixture must load actual components without errors');
      assert.deepEqual(unexpected, [], 'Every request must satisfy the explicit synthetic fixture');
      assert.equal(requests.length, 2, 'Only initial inventory and explicit revalidation are requested');
      assert.equal(delivered.navigation.length, 0, 'A changed owner or new ceremony inside Close must prevent navigation');
      assert.equal(delivered.target, null, 'A changed owner or new ceremony inside Close must not publish a target');
      result = { mode, status: 'pass', delivered };
    } catch (error) { result = { mode, status: 'fail', error: error.message,
      delivered: await page.evaluate(() => ({ navigation: window.chooserNavigation ?? null, target: window.chooserPeek?.() ?? null })).catch(() => null) }; }
    cases.push({ ...result, requests, unexpected, errors });
    await context.close();
  }
} finally { await browser.close(); }
const after = pins();
const summary = { utc: new Date().toISOString(), argv: process.argv.slice(1), node: process.version,
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  cases, sourcesBefore: before, sourcesAfter: after, fixturePins,
  sourceDrift: inputs.filter(file => before[file] !== after[file]),
  scope: 'Actual SourceAssemblyDialog/auth/session/ceremony/channel with synthetic HTTP; no database/provider/human qualification' };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(JSON.stringify({ cases: cases.map(({ mode, status, error }) => ({ mode, status, error })), sourceDrift: summary.sourceDrift }) + '\n');
if (cases.some(row => row.status !== 'pass') || summary.sourceDrift.length) process.exitCode = 1;
