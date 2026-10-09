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

  // A project screen shows one program: with one open (projectRef), the
  // directive is produced as before. With none open, see
  // self-drive-regressions.test.ts (needs_project / program resolution).
  const PROGRAM_OPEN = { organizationId: 1, userId: null, projectId: null, projectRef: 'prog-open' };

  it('produces a directive for a valid target', async () => {
    const out = JSON.parse(await getToolHandler('navigate_to')!({ target: 'cmc' }, PROGRAM_OPEN));
    expect(out.status).toBe('navigation_ready');
    expect(out.directive).toMatchObject({ actionType: 'navigate', path: 'cmc', scope: 'project' });
  });

  it('validates enum params', async () => {
    const ok = JSON.parse(await getToolHandler('navigate_to')!({ target: 'intelligence', params: { intelligenceTab: 'clinical' } }, PROGRAM_OPEN));
    expect(ok.status).toBe('navigation_ready');
    expect(ok.directive.params).toEqual({ intelligenceTab: 'clinical' });

    const bad = JSON.parse(await getToolHandler('navigate_to')!({ target: 'intelligence', params: { intelligenceTab: 'nope' } }, PROGRAM_OPEN));
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

  // The Vault shows one program: these calls come with one open.
  const PROGRAM_OPEN = { organizationId: null, userId: null, projectId: null, projectRef: 'p-open' };

  it('produces a directive for a valid action, applied vs offered by drive context', async () => {
    const offered = JSON.parse(
      await getToolHandler('act_on_screen')!({ action: 'vault.search', params: { query: 'stability' } }, PROGRAM_OPEN),
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
        { ...PROGRAM_OPEN, liveDrive: true },
      ),
    );
    expect(applied.status).toBe('action_ready');
    expect(applied.instruction).toContain('performed');
    // A refusal that lists what the screen shows is a retry with a real name,
    // not a dead end — and never a license to invent one.
    expect(applied.instruction).toContain('retry once with one of those exact names');
    expect(applied.instruction).not.toContain('navigate_to {"target":"project-home"');
  });

  it('an operation on a one-program screen with none open asks which program instead of acting', async () => {
    // "search the vault" with nothing open drew "Open a project to see its
    // vault", the search went nowhere, and AnA said she had searched.
    const none = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'vault.search', params: { query: 'stability' } },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(none.status).toBe('needs_project');
    expect(none).not.toHaveProperty('directive');

    // The chat route sends the open program as projectId only — that counts.
    const chatRoute = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'vault.search', params: { query: 'stability' } },
        { organizationId: null, userId: null, projectId: 42 },
      ),
    );
    expect(chatRoute.status).toBe('action_ready');

    // A program AnA opened earlier this turn is the one the screen will show.
    const openedThisTurn = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'vault.search', params: { query: 'stability' } },
        {
          organizationId: null,
          userId: null,
          projectId: null,
          liveDrive: true,
          turnState: { program: { id: 'p1', name: 'BX-204', code: 'BX-204' } },
        },
      ),
    );
    expect(openedThisTurn.status).toBe('action_ready');

    // A screen that is not about one program needs none.
    const global = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'projects.filter', params: { status: 'active' } },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(global.status).toBe('action_ready');
  });

  it('opening a program by act names the direct route for one the Projects list does not show', async () => {
    const open = JSON.parse(
      await getToolHandler('act_on_screen')!(
        { action: 'projects.open-program', params: { program: 'BX-204' } },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(open.status).toBe('action_ready');
    expect(open.instruction).toContain('navigate_to {"target":"project-home","program":');
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
    // The result says it did NOT drive, which is what turns it into the
    // "Start demonstration" chip (services/ana-ri/navigation-actions), and the
    // instruction tells the model the chip is there instead of narrating stops
    // it never made.
    expect(noDrive.driven).toBe(false);
    expect(noDrive.instruction).toContain('Start demonstration: Sales demonstration');
    expect(noDrive.instruction).toContain('do not narrate the stops as if you had made them');

    const driving = JSON.parse(
      await getToolHandler('start_product_demo')!(
        { demo: 'training-orientation' },
        { organizationId: null, userId: null, projectId: null, liveDrive: true },
      ),
    );
    expect(driving.status).toBe('demo_ready');
    expect(driving.driven).toBe(true);
    expect(driving.instruction).toContain('one stop per step');
    expect(driving.instruction).toContain('all the way through');
    // "Open one of their real documents" names nothing AnA can see: the
    // screen's refusal lists the titles, and she retries that stop with one.
    expect(driving.instruction).toContain('retry that stop once with one of those exact names');
  });

  it('start_product_demo refuses unknown ids with the catalog', async () => {
    const out = JSON.parse(await getToolHandler('start_product_demo')!({ demo: 'vaporware' }));
    expect(out.status).toBe('unknown_demo');
    expect(Array.isArray(out.scripts)).toBe(true);
  });
});
