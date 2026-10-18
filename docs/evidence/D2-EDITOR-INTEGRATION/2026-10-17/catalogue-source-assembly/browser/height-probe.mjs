import { chromium } from '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createState, intercept, DOC, TEMPLATE, sourceRows } from './mock-api.mjs';

const final = process.argv.includes('--final');
const out = fileURLToPath(new URL(final ? './mobile-height-final/' : './mobile-height-diagnostic/', import.meta.url));
const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const paths = ['client/src/concept2cure/v2/editor/DocumentWorkbench.tsx', 'client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx',
  'client/src/concept2cure/v2/styles/authoring-v2.css'];
const pins = () => Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
const beforePins = pins();
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const state = createState('ana');
  await page.route('**/api/**', route => intercept(route, state));
  await page.goto('http://127.0.0.1:5190/docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  for (const source of sourceRows) await page.getByLabel(`Use ${source.title} as context`, { exact: true }).check();
  await page.getByTestId('data-room-build-selected').getByRole('button', { name: 'Build in editor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Build from selected sources', exact: true });
  await dialog.getByRole('combobox', { name: 'Working document', exact: true }).selectOption(DOC);
  await dialog.getByRole('button', { name: 'Open in editor', exact: true }).click();
  await page.locator('.tiptap').filter({ hasText: 'Existing saved stability evidence.' }).waitFor();
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption(TEMPLATE);
  await page.getByRole('combobox', { name: 'Build target', exact: true }).getByRole('option', { name: '3.2.P.8.3 Stability data', exact: true }).waitFor({ state: 'attached' });
  await page.getByLabel('Reason for build', { exact: true }).fill('Append missing stability sections for local review.');
  await page.getByLabel('Draft empty eligible sections with AnA', { exact: true }).check();
  await page.getByRole('button', { name: 'Preview build', exact: true }).click();
  await page.getByRole('button', { name: 'Build document', exact: true }).click();
  await page.getByRole('button', { name: 'Review 3.2.P.8.2', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Document assembly"]')?.textContent?.includes('retained for individual review'));
  const measure = () => page.evaluate(() => {
    const node = document.querySelector('section[aria-label="Document assembly"]');
    const ancestors = [];
    for (let item = node; item; item = item.parentElement) {
      const style = window.getComputedStyle(item);
      ancestors.push({ tag: item.tagName, cls: item.className, overflowY: style.overflowY, scrollTop: item.scrollTop,
        scrollHeight: item.scrollHeight, clientHeight: item.clientHeight, rect: item.getBoundingClientRect().toJSON() });
    }
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
    return { ancestors, controls: [...node.querySelectorAll('button')].map(item => ({ text: item.textContent, rect: item.getBoundingClientRect().toJSON() })),
      reviewHeading: rect('[data-testid="ai-draft-panel"] h2'), nativeEditor: rect('.tiptap'), scrollArea: rect('.ed-doc-scroll') };
  });
  const before = await measure();
  await page.screenshot({ path: out + 'before-wheel.png' });
  const wheels = [];
  await page.mouse.move(200, 700);
  for (let count = 0; count < (final ? 8 : 1); count++) {
    await page.mouse.wheel(0, final ? 200 : 1000);
    await page.waitForTimeout(150);
    wheels.push(await measure());
    const last = wheels.at(-1).controls.at(-1).rect;
    if (final && last.y >= 0 && last.bottom <= 844) break;
  }
  const after = wheels.at(-1);
  await page.screenshot({ path: out + 'after-wheel.png' });
  let reviewOpened = null, reviewAfterCollapse = null, reviewHeadingReached = null, editorReached = null;
  const editorWheels = [];
  if (final) {
    // Last Review was made visible by wheel input before this click.
    await page.getByRole('button', { name: 'Review 3.2.P.8.3', exact: true }).click();
    await page.getByTestId('ai-draft-body').waitFor();
    reviewOpened = await measure();
    await page.screenshot({ path: out + 'review-heading-after-explicit-open.png' });
    await page.getByText('Build document or section', { exact: true }).click();
    reviewAfterCollapse = await measure();
    await page.mouse.move(200, 700);
    for (let count = 0; count < 12; count++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(100);
      editorWheels.push(await measure());
      const row = editorWheels.at(-1);
      if (!reviewHeadingReached && row.reviewHeading.y >= row.scrollArea.y && row.reviewHeading.bottom <= row.scrollArea.bottom) {
        reviewHeadingReached = row;
        await page.screenshot({ path: out + 'review-heading-after-wheel.png' });
      }
      const visible = Math.min(row.nativeEditor.bottom, row.scrollArea.bottom) - Math.max(row.nativeEditor.y, row.scrollArea.y);
      if (visible >= 44) { editorReached = row; break; }
    }
    await page.screenshot({ path: out + 'native-editor-after-wheel.png' });
  }
  const frozen = JSON.stringify(beforePins) === JSON.stringify(pins());
  const last = after.controls.at(-1).rect;
  const userReachable = last.y >= 0 && last.bottom <= 844;
  const report = { qualification: 'Actual Workbench in canonical dcv-workbench wrapper, synthetic API. Manual-wheel diagnostic only; no full shell/conversation mounted.',
    layoutSourceSha256: beforePins, sourceFrozenDuringCapture: frozen, userReachable, before, after, wheels,
    reviewOpened, reviewAfterCollapse, disclosureCollapsedForReview: final,
    reviewHeadingReached, editorReached, editorWheels };
  writeFileSync(out + 'measurement.json', JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify({ frozen, userReachable, wheelSteps: wheels.length }));
  if (final) {
    assert.ok(frozen, 'Layout source must remain frozen during final manual-wheel measurement');
    assert.ok(userReachable, 'Manual wheel must bring the last Review control into the viewport');
    assert.ok(after.ancestors.some(row => row.cls === 'ed-doc-scroll' && row.scrollTop > 0), 'The existing editor scroll area must own the scrolling');
    assert.ok(reviewHeadingReached, 'Manual wheel must reach the existing retained review heading after explicit Review');
    assert.ok(editorReached, 'Manual wheel must reach the canonical rich editor after opening retained review');
  }
} finally { await browser.close(); }
