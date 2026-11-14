/** Development-only rehearsal using the existing synthetic handover.
 * node <this-file> <base> <handover-seed-manifest> <output-directory>
 * Archives its admitted synthetic fixture, opens it without Restore, then restores it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [base, manifestPath, output] = process.argv.slice(2);
assert.ok(base && manifestPath && output, 'base, seed manifest and output directory are required');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const target = manifest.records.internalHandover;
assert.match(target.title, /^\[Demo · Portfolio\].*completed INTERNAL demonstration handover/);
const out = path.resolve(output); await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
page.setDefaultTimeout(90000);
const errors = [], lifecycleRequests = [];
const receipt = { steps: [], errors, projectId: target.projectId, providerCalls: 0 };
let archivedHere = false, observing = false;
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (observing && /\/api\/c2c\/projects\/[^/]+\/(?:unarchive|archive)$/.test(r.url())) lifecycleRequests.push(r.method());
});
const api = (method, route, body) => page.evaluate(async ({ method, route, body }) => {
  const r = await fetch(route, { method, headers: { Authorization: `Bearer ${localStorage.getItem('trialsage_access_token')}`,
    'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}, { method, route, body });
const projectPath = `/api/c2c/projects/${target.projectId}`;
try {
  await page.goto(`${base}/concept2cure/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Demo person').selectOption('ana.author@concept2cure.pro');
  await page.getByRole('button', { name: 'Demo access', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  const before = await api('GET', projectPath);
  assert.equal(before.status, 200); assert.equal(before.body.name, target.title); assert.equal(before.body.status, 'active');
  const archived = await api('POST', `${projectPath}/archive`, { reason: 'Synthetic demo verification: open retained project records without restoring this project.' });
  assert.equal(archived.status, 200); assert.equal(archived.body.ok, true); archivedHere = true;
  observing = true;
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Quillmont Immunology (fictional demo)' });
  await page.getByRole('button', { name: 'Archived projects', exact: true }).click();
  await page.getByRole('button', { name: `Open ${target.title}`, exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'archived-project-actions.png'), fullPage: true });
  await page.getByRole('button', { name: `Open ${target.title}`, exact: true }).click();
  await page.waitForURL('**/project-home?**');
  const selected = await page.evaluate(() => ({ id: window.C2C_PROJECT?.id, status: window.C2C_PROJECT?.status }));
  assert.deepEqual(selected, { id: target.projectId, status: 'archived' });
  await page.getByRole('button', { name: 'Vault', exact: true }).first().click();
  await page.getByRole('button', { name: /^Completed internal handover · SYNTHETIC/ }).click();
  const exporter = page.getByRole('button', { name: /^Export Completed internal handover · SYNTHETIC:/ });
  await exporter.waitFor();
  const pending = page.waitForEvent('download'); await exporter.click();
  const download = await pending; assert.equal(await download.failure(), null);
  await download.saveAs(path.join(out, 'archived-handover-folder.zip'));
  assert.equal((await api('GET', projectPath)).body.status, 'archived');
  assert.deepEqual(lifecycleRequests, []);
  receipt.steps.push('Archived list opens actual project with archived status', 'Retained Vault folder exports while project remains archived', 'Opening sent no archive/restore request');
  await page.screenshot({ path: path.join(out, 'archived-vault-documents.png'), fullPage: true });
  observing = false;
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await page.getByRole('button', { name: 'Archived projects', exact: true }).click();
  await page.getByRole('button', { name: `Restore ${target.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore project', exact: true });
  await dialog.getByPlaceholder('Captured verbatim in the audit log. Be specific.').fill('Restore the synthetic demonstration after verifying retained project and document access.');
  await dialog.getByPlaceholder('restore', { exact: true }).fill('restore');
  await dialog.getByRole('button', { name: 'Confirm and log', exact: true }).click();
  await page.getByText(/was restored\. It is active again/).waitFor();
  assert.equal((await api('GET', projectPath)).body.status, 'active'); archivedHere = false;
  receipt.steps.push('Existing governed Restore returned demo fixture to active');
  assert.deepEqual(errors, []); receipt.outcome = 'passed';
} catch (e) {
  receipt.outcome = 'failed'; receipt.error = e.message; process.exitCode = 1;
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  if (archivedHere) {
    const result = await api('POST', `${projectPath}/unarchive`, { reason: 'Restore this synthetic test fixture after the archived read rehearsal; preserve all records.' });
    receipt.cleanupRestoreStatus = result.status;
  }
  await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.info(JSON.stringify(receipt)); await browser.close();
}
