import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApiState, interceptApi } from './mock-api.mjs';
import { measure, accessibility } from './visual-checks.mjs';

export function assert(value, reason) { if (!value) throw new Error(reason); }

export async function startPage(browser, config, records, label, { kind, mode }) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height },
    hasTouch: config.width < 800, isMobile: config.width < 800, colorScheme: config.theme });
  const page = await context.newPage();
  const state = createApiState(records, kind, mode);
  page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push(message.text()); });
  page.on('pageerror', error => state.pageErrors.push(error.message));
  await page.route('**/api/**', route => interceptApi(route, state));
  await page.addInitScript(actor => {
    localStorage.setItem('trialsage_access_token', 'synthetic-browser-token');
    localStorage.setItem('trialsage_user', JSON.stringify(actor));
  }, records.actor);
  await page.goto(`http://127.0.0.1:5179${config.urlPath}?theme=${config.theme}&mode=${mode}`);
  await page.getByRole('button', { name: 'New document', exact: true }).waitFor();
  return { context, page, state, label, kind, stages: [] };
}

export async function fillCreation(page, kind, records) {
  await page.getByRole('button', { name: `New ${kind}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `New ${kind}`, exact: true });
  if (kind === 'document') await dialog.getByRole('textbox', { name: 'Document title', exact: true }).fill(records.createdDocument.title);
  else {
    await dialog.getByRole('textbox', { name: 'Section code', exact: true }).fill(records.createdSection.code);
    await dialog.getByRole('textbox', { name: 'Section title', exact: true }).fill(records.createdSection.title);
  }
  return dialog;
}

export async function capture(fixture, out, name, { nativeEditor = false } = {}) {
  const { page } = fixture;
  if (nativeEditor) await page.locator('.ProseMirror').scrollIntoViewIfNeeded();
  const metrics = await measure(page);
  const axe = await accessibility(page);
  const noticeBounds = await page.locator('.scaf-note').evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    return { text: element.textContent, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  }));
  const record = { name, metrics, axe, notices: noticeBounds };
  writeFileSync(resolve(out, 'captures', `${fixture.label}-${fixture.kind}-${name}.json`), JSON.stringify(record, null, 2) + '\n');
  await page.screenshot({ path: resolve(out, 'captures', `${fixture.label}-${fixture.kind}-${name}.png`), fullPage: true });
  assert(metrics.page.scrollWidth <= metrics.viewport.width, 'Horizontal page overflow');
  for (const bounds of noticeBounds) {
    assert(bounds.x >= 0 && bounds.x + bounds.width <= metrics.viewport.width + 1, 'Recovery notice lies outside the viewport');
    assert(bounds.y >= 0 && bounds.y + bounds.height <= metrics.viewport.height + 1, 'Recovery notice is not vertically visible');
    assert(bounds.scrollWidth <= bounds.clientWidth + 1, 'Recovery notice clips horizontally');
  }
  if (nativeEditor) {
    assert(metrics.editorCount === 1, 'Expected exactly one native editing surface');
    assert(metrics.visibleEditableViewport?.width >= 250 && metrics.visibleEditableViewport?.height >= 100,
      'Native editor viewport is smaller than 250x100');
  }
  assert(axe.violations.length === 0, 'Automated accessibility violation');
  fixture.stages.push(record);
  return record;
}

export async function finishCase(fixture, run) {
  const { context, page, state } = fixture;
  const result = { kind: fixture.kind, label: fixture.label, status: 'pending', stages: fixture.stages };
  try {
    await run();
    assert(state.unexpected.length === 0, 'Unconfigured synthetic API request');
    assert(state.consoleErrors.length === 0 && state.pageErrors.length === 0, 'Console error or page exception');
    result.status = 'pass';
  } catch (error) {
    result.status = 'fail';
    result.error = error.stack;
    result.body = await page.locator('body').innerText();
  } finally {
    result.requests = state.requests;
    result.mutations = state.mutations;
    result.unexpected = state.unexpected;
    result.consoleErrors = state.consoleErrors;
    result.pageErrors = state.pageErrors;
    result.callbacks = await page.evaluate(() => ({ checks: window.creationChecks, receipts: window.creationReceipts,
      navigation: window.creationNavigation, bridge: window.creationBridge, toasts: window.creationToasts }));
    await context.close();
  }
  return result;
}

export const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
