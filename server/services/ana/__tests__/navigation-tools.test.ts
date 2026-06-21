/**
 * AnA self-navigation tools — registration + behavior.
 * Pure (registry-backed), no DB/network, so the full paths run offline.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('navigation tools — registration', () => {
  it.each(['list_app_screens', 'navigate_to'])('%s is defined and has a handler', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('list_app_screens', () => {
  it('returns the screen catalog and filters by scope', async () => {
    const all = JSON.parse(await getToolHandler('list_app_screens')!({}));
    expect(all.status).toBe('ok');
    expect(all.count).toBeGreaterThan(10);
    expect(all.screens.some((s: { id: string }) => s.id === 'cmc')).toBe(true);

    const global = JSON.parse(await getToolHandler('list_app_screens')!({ scope: 'global' }));
    expect(global.screens.every((s: { scope: string }) => s.scope === 'global')).toBe(true);
  });
});

describe('navigate_to', () => {
  it('requires a target', async () => {
    const out = JSON.parse(await getToolHandler('navigate_to')!({}));
    expect(out.status).toBe('needs_parameters');
  });

  it('produces a directive for a valid target', async () => {
    const out = JSON.parse(await getToolHandler('navigate_to')!({ target: 'cmc' }));
    expect(out.status).toBe('navigation_ready');
    expect(out.directive).toMatchObject({ actionType: 'navigate', path: 'cmc', scope: 'project' });
  });

  it('validates enum params', async () => {
    const ok = JSON.parse(await getToolHandler('navigate_to')!({ target: 'intelligence', params: { intelligenceTab: 'protocol' } }));
    expect(ok.status).toBe('navigation_ready');
    expect(ok.directive.params).toEqual({ intelligenceTab: 'protocol' });

    const bad = JSON.parse(await getToolHandler('navigate_to')!({ target: 'intelligence', params: { intelligenceTab: 'nope' } }));
    expect(bad.status).toBe('needs_parameters');
  });

  it('refuses an unknown target with the valid list', async () => {
    const out = JSON.parse(await getToolHandler('navigate_to')!({ target: 'ghost-screen' }));
    expect(out.status).toBe('unknown_target');
    expect(Array.isArray(out.validTargets)).toBe(true);
  });
});
