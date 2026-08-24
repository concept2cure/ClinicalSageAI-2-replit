/**
 * AnA self-drive tools (navigation + screen actions + demonstrations) —
 * registration + behavior.
 * Pure (registry-backed), no DB/network, so the full paths run offline.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('navigation tools — registration', () => {
  it.each([
    'list_app_screens',
    'navigate_to',
    'list_screen_actions',
    'act_on_screen',
    'list_demo_scripts',
    'start_product_demo',
  ])('%s is defined and has a handler', (name) => {
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

describe('list_screen_actions', () => {
  it('returns the action catalog and filters by surface', async () => {
    const all = JSON.parse(await getToolHandler('list_screen_actions')!({}));
    expect(all.status).toBe('ok');
    expect(all.count).toBeGreaterThan(0);
    expect(all.actions.some((a: { id: string }) => a.id === 'projects.open-program')).toBe(true);

    const vault = JSON.parse(await getToolHandler('list_screen_actions')!({ surface: 'vault' }));
    expect(vault.actions.every((a: { surface: string }) => a.surface === 'vault')).toBe(true);
    expect(vault.count).toBeGreaterThan(0);
  });
});

describe('act_on_screen', () => {
  it('requires an action id', async () => {
    const out = JSON.parse(await getToolHandler('act_on_screen')!({}));
    expect(out.status).toBe('needs_parameters');
  });

  it('produces a directive for a valid action, applied vs offered by drive context', async () => {
    const offered = JSON.parse(
      await getToolHandler('act_on_screen')!({ action: 'vault.search', params: { query: 'stability' } }),
    );
    expect(offered.status).toBe('action_ready');
    expect(offered.directive).toMatchObject({
      actionType: 'surface_action',
      actionId: 'vault.search',
      surfaceId: 'vault',
      params: { query: 'stability' },
    });
    expect(offered.instruction).toContain('OFFERED');

    const applied = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'vault.search', params: { query: 'stability' } },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(applied.status).toBe('action_ready');
    expect(applied.instruction).toContain('performed');
  });

  it('refuses unknown actions with the valid list, and missing params honestly', async () => {
    const unknown = JSON.parse(await getToolHandler('act_on_screen')!({ action: 'vault.teleport' }));
    expect(unknown.status).toBe('unknown_action');
    expect(Array.isArray(unknown.validActions)).toBe(true);

    const missing = JSON.parse(await getToolHandler('act_on_screen')!({ action: 'vault.search' }));
    expect(missing.status).toBe('needs_parameters');
  });
});

describe('demo tools', () => {
  it('list_demo_scripts returns both kinds and filters by kind', async () => {
    const all = JSON.parse(await getToolHandler('list_demo_scripts')!({}));
    expect(all.status).toBe('ok');
    const kinds = new Set(all.scripts.map((s: { kind: string }) => s.kind));
    expect(kinds.has('training')).toBe(true);
    expect(kinds.has('sales')).toBe(true);

    const sales = JSON.parse(await getToolHandler('list_demo_scripts')!({ kind: 'sales' }));
    expect(sales.scripts.every((s: { kind: string }) => s.kind === 'sales')).toBe(true);
  });

  it('start_product_demo returns the validated script with run instructions per drive context', async () => {
    const noDrive = JSON.parse(await getToolHandler('start_product_demo')!({ demo: 'sales-flagship' }));
    expect(noDrive.status).toBe('demo_ready');
    expect(noDrive.script.id).toBe('sales-flagship');
    expect(noDrive.script.steps.length).toBeGreaterThan(3);
    expect(noDrive.instruction).toContain('NOT on');

    const driving = JSON.parse(
      await getToolHandler('start_product_demo')!(
        { demo: 'training-orientation' },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(driving.status).toBe('demo_ready');
    expect(driving.instruction).toContain('stop by stop');
  });

  it('start_product_demo refuses unknown ids with the catalog', async () => {
    const out = JSON.parse(await getToolHandler('start_product_demo')!({ demo: 'vaporware' }));
    expect(out.status).toBe('unknown_demo');
    expect(Array.isArray(out.scripts)).toBe(true);
  });
});
