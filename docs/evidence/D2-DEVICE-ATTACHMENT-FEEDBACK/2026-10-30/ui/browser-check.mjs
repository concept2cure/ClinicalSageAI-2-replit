// Actual shipped drawer in Chromium; explicit synthetic API replies only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../../../../scripts/visual-qa/playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../../../..');
const out = resolve(here, process.env.DEVICE_ATTACHMENT_BROWSER_OUT || 'browser-result');
mkdirSync(out, { recursive: true });
const evidence = 'docs/evidence/D2-DEVICE-ATTACHMENT-FEEDBACK/2026-10-30/ui';
const base = process.env.DEVICE_ATTACHMENT_BROWSER_BASE || 'http://127.0.0.1:5201';
const area = 'client/src/concept2cure';
const paths = [
  `${area}/mdx/surfaces/pathway/PathwayPanes.tsx`, `${area}/mdx/surfaces/pathway/DossierAttachments.tsx`,
  `${area}/mdx/store/dossierStore.ts`, `${area}/mdx/hooks/useSectionVersions.ts`, `${area}/mdx/hooks/useFetchJson.ts`,
  `${area}/v2/useVaultUpload.ts`, `${area}/v2/vaultIngestTransport.ts`, `${area}/v2/vaultIngestReceipt.ts`,
  `${area}/v2/editor/authoringCurrentRead.ts`, `${area}/v2/shellProject.ts`,
  'client/src/services/portal/authService.tsx', 'client/src/utils/authToken.ts', 'client/src/lib/queryClient.ts',
  'shared/constants/domain/vault-document-code.ts', 'shared/constants/document-intake-formats.ts',
  'design-system/colors_and_type.css', 'client/src/index.css',
  ...['app-v2.css', 'surfaces-v2.css', 'misc-surfaces-v2.css', 'coverage-v2.css', 'surface-text-ramp.css'].map(name => `${area}/v2/styles/${name}`),
  ...['app.css', 'pathway-tabs.css', 'files-tree.css', 'surface-text-ramp.css'].map(name => `${area}/mdx/${name}`),
  ...['browser-check.mjs', 'browser-probe.tsx', 'browser-index.html', 'browser-server.mjs'].map(name => `${evidence}/${name}`),
  'docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs', 'scripts/visual-qa/playwright.mjs',
];
const pins = () => paths.map(path => {
  const file = resolve(root, path), exists = existsSync(file);
  return { path, exists, sha256: exists ? createHash('sha256').update(readFileSync(file)).digest('hex') : null };
});
const before = pins(), checks = [], requests = [], errors = [], unexpected = [];
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const NAME = 'synthetic-performance.pdf';
const LONG_NAME = `${'synthetic-performance-evidence-'.repeat(5)}report.pdf`;
let scenario = '', release = () => {}, hold = Promise.resolve(), seen = [], browser, page, failure = null;
const field = (body, name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? null;
const validReceipt = (fileName, title, status, serial) => ({
  success: true,
  document: { id: `33333333-3333-4333-8333-${String(serial).padStart(12, '0')}`, programId: PROGRAM,
    documentCode: fileName, documentTitle: title, version: '1.0', extraction: 'extracted' },
  filing: { folderId: null, folderLabel: '', placementStatus: 'unfiled', needsReview: true },
  ...(status === 200 ? { reupload: { unchanged: true, changes: [], differs: [] } } : {}),
});
const send = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const observed = () => page.evaluate(() => Reflect.get(window, 'deviceAttachmentObservation')());
const file = (name = NAME) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('synthetic selected browser bytes') });
const statuses = () => page.getByRole('status');
const knownRefusal = { status: 409, body: { error: {
  code: 'VERSION_CONTENT_CONFLICT', message: 'Different bytes are already recorded at this name.',
} } };
const created = { status: 201, valid: true };
function responsePlan(index) {
  switch (scenario) {
    case 'known': return knownRefusal;
    case 'unknown': return { status: 201, body: { success: true } };
    case 'explicit-unknown': return { status: 503, body: { error: {
      code: 'OUTCOME_UNKNOWN', message: 'Review the current Vault before trying again.',
    } } };
    case 'held': return { status: 200, valid: true };
    case 'pending': return { ...created, hold: true };
    case 'mixed': return index === 1 ? knownRefusal : created;
    case 'next-selection': return index === 0 ? knownRefusal : { ...created, hold: true };
    default: return created;
  }
}

async function start(name, width, theme) {
  scenario = name; seen = [];
  hold = new Promise(resolveHold => { release = resolveHold; });
  await page.setViewportSize({ width, height: width < 500 ? 844 : 1050 });
  await page.goto(`${base}/${evidence}/browser-index.html?theme=${theme}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('tab', { name: /^Attachments/ }).click();
  await page.getByRole('button', { name: 'Choose files', exact: true }).waitFor();
}
async function choose(files) {
  const chooser = page.waitForEvent('filechooser');
  const request = page.waitForRequest(value => value.method() === 'POST' && new URL(value.url()).pathname === '/api/vault/ingest');
  await page.getByRole('button', { name: 'Choose files', exact: true }).focus();
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(files);
  await request;
}
async function capture(name) {
  const fit = await page.getByRole('dialog').evaluate(drawer => {
    const note = drawer.querySelector('[role="alert"], [role="status"]');
    return { drawer: { width: drawer.clientWidth, scroll: drawer.scrollWidth },
      note: note ? { width: note.clientWidth, scroll: note.scrollWidth } : null,
      page: { width: window.innerWidth, scroll: document.documentElement.scrollWidth } };
  });
  assert(fit.drawer.scroll <= fit.drawer.width + 2, 'Drawer has horizontal overflow');
  assert(fit.page.scroll <= fit.page.width + 2, 'Page has horizontal overflow');
  if (fit.note) assert(fit.note.scroll <= fit.note.width + 2, 'Outcome text does not wrap');
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
  return fit;
}
async function check(name, assertion) {
  const details = await assertion();
  checks.push({ name, passed: true, ...details });
}
async function noLocalActivity() {
  await page.getByRole('tab', { name: /^Activity/ }).click();
  await page.getByTestId('dd-act-empty').waitFor();
  assert.equal(await page.locator('.dd-act-row').count(), 0);
  await page.getByRole('tab', { name: /^Attachments/ }).click();
}

try {
  browser = await launchChromium();
  page = await browser.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    if (method === 'GET' && path === `/api/c2c/documents/${DOCUMENT}/sections/91/versions`) {
      requests.push({ scenario, method, path }); return send(route, { data: [] });
    }
    if (method !== 'POST' || path !== '/api/vault/ingest') {
      unexpected.push({ scenario, method, path }); return send(route, { error: 'Unqualified synthetic request' }, 501);
    }
    const body = request.postDataBuffer()?.toString('utf8') ?? '';
    const fileName = body.match(/name="file"; filename="([^"]+)"/)?.[1];
    const programId = field(body, 'programId'), title = field(body, 'documentTitle');
    assert(fileName, 'The actual multipart request must name its selected file');
    assert.equal(programId, PROGRAM); assert.equal(field(body, 'documentCode'), fileName);
    assert.equal(request.headers().authorization, 'Bearer synthetic-device-attachment-browser');
    assert.match(request.headers()['content-type'] ?? '', /^multipart\/form-data; boundary=/);
    const row = { scenario, method, path, fileName, programId, multipart: true, authorizationMatched: true };
    requests.push(row); seen.push(row);
    const plan = responsePlan(seen.length - 1);
    if (plan.hold) await hold;
    return send(route, plan.valid ? validReceipt(fileName, title, plan.status, requests.length) : plan.body, plan.status);
  });

  await check('desktop light: keyboard chooser and known refusal', async () => {
    await start('known', 1440, 'light'); await choose([file()]);
    const alert = page.getByRole('alert'); await alert.filter({ hasText: /Not filed:/ }).waitFor();
    assert.match(await alert.innerText(), /Nothing partial was recorded/); assert.deepEqual(await observed(), []);
    assert.equal(seen.length, 1); await noLocalActivity();
    return { screenshot: 'desktop-light-refused.png', fit: await capture('desktop-light-refused') };
  });
  await check('desktop dark: malformed reply stays unknown and long names wrap', async () => {
    await start('unknown', 1440, 'dark'); await choose([file(LONG_NAME)]);
    const alert = page.getByRole('alert'); await alert.filter({ hasText: /not known whether/ }).waitFor();
    const text = await alert.innerText(); assert.match(text, /Reload the Vault and check before trying again/);
    assert.doesNotMatch(text, /Nothing partial was recorded|Not filed:/); assert.deepEqual(await observed(), []);
    assert.equal(seen.length, 1);
    return { screenshot: 'desktop-dark-unknown.png', fit: await capture('desktop-dark-unknown') };
  });
  await check('mobile light: actual saved receipt is visible', async () => {
    await start('created', 390, 'light'); await choose([file()]);
    await statuses().filter({ hasText: /Unfiled/ }).waitFor();
    assert.equal((await observed()).length, 1); assert.equal(seen.length, 1);
    return { screenshot: 'mobile-light-recorded.png', fit: await capture('mobile-light-recorded') };
  });
  await check('mobile dark: unchanged reupload keeps its actual meaning', async () => {
    await start('held', 390, 'dark'); await choose([file()]);
    await statuses().filter({ hasText: /Already in the Vault/ }).waitFor();
    assert.match(await statuses().innerText(), /nothing changed/i); assert.equal((await observed()).length, 1);
    assert.equal(seen.length, 1);
    return { screenshot: 'mobile-dark-unchanged.png', fit: await capture('mobile-dark-unchanged') };
  });
  await check('pending: disabled chooser and suppressed overlapping input/drop survive tab switches', async () => {
    await start('pending', 1440, 'light'); await choose([file()]);
    await statuses().filter({ hasText: /Uploading files to the Vault/ }).waitFor();
    assert(await page.getByRole('button', { name: 'Choose files', exact: true }).isDisabled());
    assert(await page.locator('input[type="file"]').isDisabled());
    await page.evaluate(() => {
      const files = new window.DataTransfer(); files.items.add(new File(['extra selection'], 'overlapping.pdf', { type: 'application/pdf' }));
      const input = document.querySelector('input[type="file"]'); input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.dd-att-drop').dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: files }));
    });
    for (const tab of ['Document', 'Activity']) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
      await page.getByRole('tab', { name: /^Attachments/ }).click();
      await statuses().filter({ hasText: /Uploading files to the Vault/ }).waitFor();
    }
    const fit = await capture('desktop-light-pending'); release();
    await statuses().filter({ hasText: /Unfiled/ }).waitFor();
    assert.equal(seen.length, 1); assert.equal((await observed()).length, 1);
    assert(await page.getByRole('button', { name: 'Choose files', exact: true }).isEnabled());
    return { screenshot: 'desktop-light-pending.png', fit };
  });
  await check('mobile dark: partial batch shows confirmed count and exact refused file', async () => {
    await start('mixed', 390, 'dark'); await choose([file('confirmed.pdf'), file('refused.pdf')]);
    const alert = page.getByRole('alert'); await alert.filter({ hasText: /Filed 1/ }).waitFor();
    assert.match(await alert.innerText(), /Not filed: refused\.pdf/);
    assert.deepEqual((await observed()).map(value => value.name), ['confirmed.pdf']); assert.equal(seen.length, 2);
    await noLocalActivity();
    return { screenshot: 'mobile-dark-mixed.png', fit: await capture('mobile-dark-mixed') };
  });
  await check('mobile light: explicit uncertain commit uses the existing check-before-retry guidance', async () => {
    await start('explicit-unknown', 390, 'light');
    await page.locator('.dd-att-drop').evaluate(target => {
      const files = new window.DataTransfer(); files.items.add(new File(['dropped synthetic bytes'], 'dropped-performance.pdf', { type: 'application/pdf' }));
      target.dispatchEvent(new window.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: files }));
    });
    const alert = page.getByRole('alert'); await alert.filter({ hasText: /Reload the Vault and check/ }).waitFor();
    assert.doesNotMatch(await alert.innerText(), /Nothing partial was recorded|Not filed:/);
    assert.deepEqual(await observed(), []); assert.equal(seen.length, 1);
    return { screenshot: 'mobile-light-explicit-unknown.png', fit: await capture('mobile-light-explicit-unknown') };
  });
  await check('new deliberate selection clears the prior alert while pending', async () => {
    await start('next-selection', 1440, 'dark'); await choose([file('first-refused.pdf')]);
    await page.getByRole('alert').filter({ hasText: /first-refused\.pdf/ }).waitFor();
    await choose([file('later-confirmed.pdf')]);
    await statuses().filter({ hasText: /Uploading files to the Vault/ }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0); release();
    await statuses().filter({ hasText: /Unfiled/ }).waitFor();
    assert.deepEqual((await observed()).map(value => value.name), ['later-confirmed.pdf']); assert.equal(seen.length, 2);
    return { screenshot: 'desktop-dark-new-selection.png', fit: await capture('desktop-dark-new-selection') };
  });
  assert.equal(unexpected.length, 0); assert.equal(errors.length, 0);
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  release();
  const after = pins(), unchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!unchanged && !failure) failure = { message: 'Selected source inputs changed during the browser run.' };
  writeFileSync(resolve(out, 'result.json'), JSON.stringify({
    kind: 'actual-component Chromium with explicit synthetic network replies',
    expectedChecks: 8, checks, passed: !failure && checks.length === 8, failure,
    selectedInputsUnchanged: unchanged, before, after, requests, unexpected, browserErrors: errors,
    limits: 'No hosted login, real upload storage, native server admission, durable dossier linkage, live signature, deployment or agency acceptance is qualified.',
  }, null, 2) + '\n');
  if (browser) await browser.close();
}
process.stdout.write(JSON.stringify({ checks: checks.length, expectedChecks: 8, failure: failure?.message ?? null, output: out }) + '\n');
if (failure) process.exitCode = 1;
