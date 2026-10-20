import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createState, intercept, DOC, vaultRow } from './mock-api.mjs';

const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const out = fileURLToPath(new URL('./initial-entry-red/', import.meta.url));
mkdirSync(out, { recursive: true });
const path = 'client/src/concept2cure/v2/editor/ProjectFileActions.tsx';
const hash = () => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const before = hash(); const state = createState('deterministic');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [], pageErrors = [];
page.on('console', event => { if (event.type() === 'error') consoleErrors.push(event.text()); });
page.on('pageerror', error => pageErrors.push(error.message));
let failure;
try {
  await page.route('**/api/**', route => intercept(route, state));
  await page.goto('http://127.0.0.1:5192/docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/project-files-source-assembly/browser/', { waitUntil: 'networkidle' });
  await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
  await page.getByRole('button', { name: 'Project files', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Project files', exact: true });
  await panel.getByRole('button').filter({ hasText: vaultRow.title }).click();
  await page.getByTestId('pf-selected').waitFor();
  await page.screenshot({ path: out + 'selected-vault-before-build-entry.png', fullPage: false });
  assert.equal(await page.getByTestId('pf-selected').getByRole('button', { name: 'Build in editor', exact: true }).count(), 1,
    'The actual Project files selected Vault upload must offer Build in editor');
} catch (error) { failure = String(error.stack ?? error); }
const receipt = { status: failure ? 'RED' : 'unexpected-pass', failure, sourcePath: path,
  sourceSha256: before, sourceFrozenDuringCapture: before === hash(),
  qualification: 'Actual DocumentWorkbench and ProjectFilesPanel Vault lane with synthetic HTTP. Missing selected-upload Build in editor assertion only; no provider/backend/full-shell qualification.',
  docId: DOC, requests: state.requests, mutations: state.mutations,
  unexpected: state.unexpected, consoleErrors, pageErrors };
writeFileSync(out + 'receipt.json', JSON.stringify(receipt, null, 2) + '\n');
await browser.close();
console.info(JSON.stringify({ status: receipt.status, failure: failure?.split('\n')[0], frozen: receipt.sourceFrozenDuringCapture }));
if (failure) process.exitCode = 1;
