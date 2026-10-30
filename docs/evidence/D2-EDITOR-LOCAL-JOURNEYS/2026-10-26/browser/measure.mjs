import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { accessibility } from '../../../D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/visual-checks.mjs';
export async function settle(dialog) {
  await dialog.evaluate(async node => {
    await Promise.all([...node.getAnimations(), ...node.parentElement.getAnimations()].map(animation => animation.finished.catch(() => undefined)));
  });
}
export async function capture(page, out, name, withAxe = false) {
  const measurements = await page.evaluate(() => {
    const bounds = node => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    };
    const dialog = document.querySelector('[data-testid="source-assembly-dialog"]');
    return { viewport: { width: window.innerWidth, height: window.innerHeight }, pageWidth: document.documentElement.scrollWidth,
      dialog: bounds(dialog), footer: bounds(dialog?.querySelector('.de-f')), editorCount: document.querySelectorAll('.tiptap').length,
      focusInDialog: !!document.activeElement?.closest('[role="dialog"]'),
      controls: [...(dialog?.querySelectorAll('button,input,select') ?? [])].map(node => ({ label: node.textContent?.trim(), disabled: node.disabled, bounds: bounds(node) })) };
  });
  assert.ok(measurements.pageWidth <= measurements.viewport.width + 1, 'The page must fit horizontally');
  if (measurements.dialog) {
    assert.ok(measurements.dialog.x >= -1 && measurements.dialog.right <= measurements.viewport.width + 1, 'The actual chooser must fit the viewport');
    assert.ok(measurements.dialog.scrollWidth <= measurements.dialog.clientWidth + 1, 'The actual chooser must not overflow horizontally');
    assert.ok(measurements.footer.y >= -1 && measurements.footer.bottom <= measurements.viewport.height + 1, 'The chooser footer must remain visible');
  }
  const axe = withAxe ? await accessibility(page) : null;
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ ...measurements, axe }, null, 2) + '\n');
  await page.screenshot({ path: path.join(out, name + '.png') });
  if (axe) assert.deepEqual(axe.violations, [], 'Actual chooser must have no detected WCAG A/AA violations in this bounded check');
  return { name, ...measurements, axe };
}
