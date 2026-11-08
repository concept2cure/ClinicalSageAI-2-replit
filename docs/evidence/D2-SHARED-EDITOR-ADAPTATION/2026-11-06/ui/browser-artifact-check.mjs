/** Actual SourceImportDialog and canvas; preview/save responses are simulated. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createState, intercept } from './browser-fixtures.mjs';
import { artifactAdapter, CURRENT_HEAD_WARNING, SAVED_DOC, SAVED_TEXT, DRIFT_MESSAGE } from './browser-artifact-fixtures.mjs';

export async function runArtifacts(browser, out, evidence) {
  const results = [];
  for (const mode of ['success', 'drift']) {
    const name = `artifact-intake-${mode}`, context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(), state = createState('cer', mode), errors = [];
    page.setDefaultTimeout(18000); page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => intercept(route, state, artifactAdapter));
    let failure = null, observed;
    try {
      await page.goto(`http://127.0.0.1:5224/${evidence}/browser-index.html?kind=cer&artifact=${mode}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Inspect saved artifact in existing import dialog', exact: true }).click();
      const preview = page.getByTestId('workflow-import-preview');
      await preview.getByText(CURRENT_HEAD_WARNING, { exact: true }).waitFor();
      await page.screenshot({ path: resolve(out, `${name}-preview.jpg`), type: 'jpeg', quality: 45, fullPage: false });
      await page.getByLabel('Reason for creating a working copy', { exact: true }).fill('Review retained artifact as an independent working draft.');
      await page.getByRole('button', { name: 'Create working copy', exact: true }).click();
      if (mode === 'success') {
        await page.getByTestId('source-import-result').waitFor();
        await page.getByRole('button', { name: 'Open working copy', exact: true }).click();
        await page.locator('.tiptap').filter({ hasText: SAVED_TEXT }).waitFor();
        assert.equal(await page.locator('.tiptap').count(), 1, 'Imported copy uses the same one rich editor');
        assert.equal(await page.evaluate(() => window.adaptationBridge?.docId), SAVED_DOC);
        assert.equal(await page.locator('.ed-tree-m').innerText(), 'Saved draft sections · unbound');
        const notice = page.getByTestId('import-source-notice');
        await notice.locator('summary').click();
        await notice.getByText(CURRENT_HEAD_WARNING, { exact: true }).waitFor();
        assert.equal(await page.getByTestId('source-import-dialog').count(), 0);
      } else {
        const alert = page.getByRole('alert').filter({ hasText: DRIFT_MESSAGE });
        await alert.waitFor();
        assert.equal(await alert.innerText(), DRIFT_MESSAGE);
        assert.equal(await page.getByRole('button', { name: 'Open working copy', exact: true }).count(), 0);
        assert.equal(await page.locator('.tiptap').count(), 0, 'Refused source drift opens no editor');
      }
      assert.deepEqual(state.simulatedWrites.map(row => row.phase), ['preview', 'create']);
      assert.deepEqual(state.authoringWrites, [], 'No other regulated authoring write is permitted');
      assert.deepEqual(state.unexpected, [], 'No unlisted read');
      assert.deepEqual(errors, [], 'No runtime errors');
      observed = await page.evaluate(() => ({ editorCount: document.querySelectorAll('.tiptap').length,
        editorText: document.querySelector('.tiptap')?.textContent ?? null,
        subtitle: document.querySelector('.ed-tree-m')?.textContent ?? null,
        notice: document.querySelector('[data-testid="import-source-notice"]')?.textContent ?? null,
        dialog: document.querySelector('[data-testid="source-import-dialog"]')?.textContent ?? null }));
      await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 45, fullPage: false });
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failure = error.message;
      observed = await page.evaluate(() => ({ body: document.body.innerText.slice(0, 7000) })).catch(() => null);
      await page.screenshot({ path: resolve(out, `${name}-failure.jpg`), type: 'jpeg', quality: 45, fullPage: false }).catch(() => {});
      process.stdout.write(`FAIL ${name}: ${failure}\n`);
    } finally { await context.close(); }
    results.push({ name, passed: failure === null, failure, observed, errors, requests: state.requests,
      unexpected: state.unexpected, authoringWrites: state.authoringWrites, ancillaryWrites: state.ancillaryWrites,
      simulatedWrites: state.simulatedWrites, productionWriteExecuted: false, backendPersistenceTested: false });
  }
  return results;
}
