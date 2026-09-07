/**
 * `@app` on the server: a recognised mention produces a prompt block, tool
 * hints and the self-drive pins; an unknown label produces nothing at all.
 */
import { describe, expect, it } from 'vitest';

import { CALLABLE_APPS, findCallableApp } from '../../../../shared/navigation/callable-apps';
import { buildInvokedAppsBlock, invokedAppHints, invokedAppPins, invokedApps, INVOKED_APP_PINS } from '../invoked-apps-block';

const cmc = findCallableApp('CMC / Quality (Module 3)')!;
const labeling = findCallableApp('Labeling')!;

describe('invoked apps', () => {
  it('a mention yields the app, its hints and the self-drive pins', () => {
    const msg = `@${cmc.label} draft the specification justification`;
    expect(invokedApps(msg).map((a) => a.id)).toEqual(['cmc']);
    expect(invokedAppHints(msg)).toEqual(expect.arrayContaining(['cmc', cmc.label]));
    expect(invokedAppPins(msg)).toEqual([...INVOKED_APP_PINS]);
  });

  it('the block names the app by the contract\'s label and id and says what to do with it', () => {
    const block = buildInvokedAppsBlock(`@${labeling.label} — check the carton`);
    expect(block).toContain('=== INVOKED APPS');
    expect(block).toContain(`${labeling.label} (id: ${labeling.id})`);
    expect(block).toContain('navigate_to');
    // The person's own words are not echoed into the block.
    expect(block).not.toContain('check the carton');
  });

  it('an unknown label or a plain message produces nothing', () => {
    for (const msg of ['@Nonexistent do it', 'no mention here', 42, null, undefined]) {
      expect(invokedApps(msg)).toEqual([]);
      expect(invokedAppHints(msg)).toEqual([]);
      expect(invokedAppPins(msg)).toEqual([]);
      expect(buildInvokedAppsBlock(msg)).toBe('');
    }
  });

  it('caps the number of invoked apps', () => {
    const many = ['cmc', 'labeling', 'risk', 'tasking', 'quality', 'safety', 'market-access', 'registrations']
      .map((id) => findCallableApp(labelOf(id))!)
      .map((a) => `@${a.label}`)
      .join(' ');
    expect(invokedApps(many).length).toBeLessThanOrEqual(6);
  });
});

function labelOf(id: string): string {
  // Look the label up through the vocabulary so the test does not hard-code copy.
  return CALLABLE_APPS.find((a) => a.id === id)!.label;
}
