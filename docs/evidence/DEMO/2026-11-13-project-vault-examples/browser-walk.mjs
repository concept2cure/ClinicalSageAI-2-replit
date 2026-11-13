/** Rehearse the seeded examples through the existing sign-in, Projects and Vault.
 * Run from the repository: node <this-file> <base-url> <output-directory>.
 * Credentials/tokens stay in the browser; only synthetic UI and file receipts leave it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';

const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://127.0.0.1:5000';
const out = path.resolve(process.argv[3] ?? '/tmp/c2c-portfolio-browser');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const errors = [];
const receipt = { base, steps: [], pageErrors: errors, providerCalls: 0, actualHostedCodespace: false };
page.on('pageerror', (e) => errors.push(e.message));
const note = (step, detail = {}) => receipt.steps.push({ step, ...detail });
try {
  await page.goto(`${base}/concept2cure/login`, { waitUntil: 'networkidle' });
  const picker = page.getByLabel('Demo person');
  assert.equal(await picker.locator('option').count(), 10);
  await picker.selectOption('ana.author@concept2cure.pro');
  await page.getByRole('button', { name: 'Demo access', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  note('Demo person picker → Ana Author sign-in');
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Quillmont Immunology (fictional demo)' });
  const handover = page.locator('.pj-cards').getByRole('button', { name: /^\[Demo · Portfolio\] Quillmont.*completed INTERNAL demonstration handover/ });
  await handover.waitFor();
  await page.screenshot({ path: path.join(out, 'portfolio-projects-desktop.png'), fullPage: true });
  await handover.click();
  await page.waitForURL('**/project-home?**');
  await page.getByRole('button', { name: 'Vault', exact: true }).first().click();
  await page.waitForURL('**/vault?**');
  const parent = page.getByRole('button', { name: /^\[Demo · Portfolio\] Synthetic study records/ });
  await parent.waitFor();
  // Folders open by default. Select the populated child without collapsing its parent.
  const folder = page.getByRole('button', { name: /^Completed internal handover · SYNTHETIC/ });
  if (!(await folder.isVisible())) await parent.click();
  await folder.click();
  const exporter = page.getByRole('button', { name: /^Export Completed internal handover · SYNTHETIC:/ });
  await exporter.waitFor();
  await page.screenshot({ path: path.join(out, 'handover-vault-desktop.png'), fullPage: true });
  note('Projects → fictional sponsor → completed internal handover → named Vault child folder', { url: page.url() });
  const pendingDownload = page.waitForEvent('download');
  await exporter.click();
  const download = await pendingDownload;
  assert.equal(await download.failure(), null);
  const zipPath = path.join(out, 'internal-handover-folder.zip');
  await download.saveAs(zipPath);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  for (const extension of ['.pdf', '.docx']) assert.equal(entries.filter((e) => e.entryName.endsWith(extension)).length, 1);
  assert.ok(entries.some((e) => e.entryName.endsWith('SHA256SUMS')));
  assert.ok(entries.some((e) => e.entryName.endsWith('manifest.json')));
  note('Existing Export action downloaded the folder ZIP', { files: entries.map((e) => ({ name: e.entryName,
    bytes: e.getData().length, sha256: createHash('sha256').update(e.getData()).digest('hex') })) });
  await page.locator('.vd-rows').getByRole('button', { name: /reference report · SYNTHETIC PDF/ }).click();
  await page.getByRole('button', { name: /^View \[Demo · Portfolio\].*SYNTHETIC PDF/ }).click();
  await page.locator('iframe[title$="— PDF viewer"]').waitFor();
  await page.waitForTimeout(1500); // Let Chromium's PDF plugin paint before the evidence screenshot.
  await page.screenshot({ path: path.join(out, 'handover-pdf-reader.png'), fullPage: true, animations: 'disabled' });
  note('Opened the stored PDF in the existing Vault reader');
  await page.getByRole('button', { name: 'Close viewer', exact: true }).click();
  await page.locator('.vd-rows').getByRole('button', { name: /reference report · SYNTHETIC Word/ }).click();
  await page.getByRole('button', { name: /^View a PDF rendition of \[Demo · Portfolio\]/ }).click();
  await page.locator('iframe[title$="— PDF viewer"]').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'handover-word-rendition-reader.png'), fullPage: true, animations: 'disabled' });
  note('Opened the Word file as a PDF rendition in the existing Vault reader');
  await page.getByRole('button', { name: 'Close viewer', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close the record', exact: true }).click();
  const collapse = page.getByRole('button', { name: 'Collapse', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await page.screenshot({ path: path.join(out, 'handover-vault-mobile.png'), fullPage: true });
  note('Existing Vault at 390px viewport', { width: 390 });
  assert.deepEqual(errors, []);
  receipt.outcome = 'passed';
} catch (error) {
  receipt.outcome = 'failed';
  receipt.error = error.message;
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(out, 'browser-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.info(JSON.stringify({ outcome: receipt.outcome, steps: receipt.steps.map((s) => s.step), error: receipt.error, pageErrors: errors }));
  await browser.close();
}
