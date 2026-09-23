/**
 * Demonstration-script contract tests.
 *
 * The property that matters: a demo can NEVER reference a screen or an action
 * the registries do not resolve — the totality gate walks every step of every
 * registered script through the same resolvers the tools use at runtime. The
 * validator itself is exercised on deliberately broken scripts first, so the
 * gate is shown failing on what it exists to catch.
 */
import { describe, expect, it } from 'vitest';

import {
  DEMO_SCRIPTS,
  findDemoScript,
  listDemoScripts,
  validateDemoScript,
  validateDemoScripts,
  type DemoScript,
} from '../demo-scripts';

describe('the validator catches broken scripts (shown failing first)', () => {
  const base: Omit<DemoScript, 'steps'> = {
    id: 'x',
    kind: 'training',
    title: 'X',
    audience: 'test',
    minutes: 1,
    description: 'test',
  };

  it('a step naming an unknown screen fails', () => {
    const errors = validateDemoScript({
      ...base,
      steps: [{ say: 'go', navigate: { target: 'holodeck' } }],
    });
    expect(errors.some((e) => e.includes('holodeck'))).toBe(true);
  });

  it('a step naming an unknown action fails', () => {
    const errors = validateDemoScript({
      ...base,
      steps: [{ say: 'do', act: { actionId: 'vault.teleport' } }],
    });
    expect(errors.some((e) => e.includes('vault.teleport'))).toBe(true);
  });

  it('a step with illegal pinned params fails', () => {
    const errors = validateDemoScript({
      ...base,
      steps: [
        { say: 'go', navigate: { target: 'intelligence', params: { intelligenceTab: 'astrology' } } },
      ],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('a silent step and a double-move step fail', () => {
    const errors = validateDemoScript({
      ...base,
      steps: [
        { say: '   ', navigate: { target: 'projects' } },
        {
          say: 'two moves',
          navigate: { target: 'projects' },
          act: { actionId: 'projects.set-view', params: { view: 'list' } },
        },
      ],
    });
    expect(errors.some((e) => e.includes('talking point'))).toBe(true);
    expect(errors.some((e) => e.includes('two moves'))).toBe(true);
  });

  it('an empty script fails', () => {
    expect(validateDemoScript({ ...base, steps: [] }).length).toBeGreaterThan(0);
  });
});

describe('the registered scripts (the totality gate)', () => {
  it('every registered script validates clean', () => {
    expect(validateDemoScripts()).toEqual([]);
  });

  it('ships one training walkthrough and one sales demonstration', () => {
    const kinds = new Set(DEMO_SCRIPTS.map((s) => s.kind));
    expect(kinds.has('training')).toBe(true);
    expect(kinds.has('sales')).toBe(true);
  });

  it('script ids are unique and findable', () => {
    const seen = new Set<string>();
    for (const s of DEMO_SCRIPTS) {
      expect(seen.has(s.id), `duplicate demo id ${s.id}`).toBe(false);
      seen.add(s.id);
      expect(findDemoScript(s.id)).toBe(s);
    }
  });

  it('the picker listing carries honest metadata and no steps payload', () => {
    for (const entry of listDemoScripts()) {
      const script = findDemoScript(entry.id)!;
      expect(entry.steps).toBe(script.steps.length);
      expect(entry.minutes).toBeGreaterThan(0);
      expect((entry as Record<string, unknown>).say).toBeUndefined();
    }
  });

  it('every script fits the demo drive budgets (a plan the budget cuts off is a defect here, not at runtime)', async () => {
    const { DRIVE_BUDGETS } = await import('../drive-policy');
    for (const s of DEMO_SCRIPTS) {
      const navs = s.steps.filter((st) => st.navigate).length;
      const acts = s.steps.filter((st) => st.act).length;
      expect(navs, `${s.id} navigations`).toBeLessThanOrEqual(DRIVE_BUDGETS.demo.navigations);
      expect(acts, `${s.id} actions`).toBeLessThanOrEqual(DRIVE_BUDGETS.demo.actions);
    }
  });
});

/* ── The launch catalog (docs/LAUNCH_DEFINITION_OF_DONE.md, D2) ──────────────
   Under LAUNCH_SCOPE_ENFORCE=on every surface outside shared/constants/
   launch-scope.ts renders "Not in this release". A demonstration stop that
   navigates there is a demonstration that visibly fails in front of the
   person it was written to impress, so the three Live Drive scripts are held
   to the catalog here, through the same resolution the shell applies: the
   registry target's path, then DEEP_LINK_ALIASES, then the surface id. */
import { DEEP_LINK_ALIASES } from '../../../client/src/concept2cure/v2/registryModel';
import { LAUNCH_APPS, LAUNCH_SURFACE_IDS } from '../../constants/launch-scope';
import { findNavigationTarget } from '../index';
import { findSurfaceAction } from '../surface-actions';

/** The surface id the shell mounts for a registry target, or null. */
function surfaceFor(targetId: string): string | null {
  const t = findNavigationTarget(targetId);
  if (!t) return null;
  const path = t.path ?? t.id;
  return DEEP_LINK_ALIASES[path] ?? path;
}

describe('the Live Drive scripts stay inside the launch catalog', () => {
  const LIVE_DRIVE_SCRIPTS = ['training-orientation', 'training-submission-day', 'sales-flagship'] as const;

  it('the three scripts exist', () => {
    for (const id of LIVE_DRIVE_SCRIPTS) expect(findDemoScript(id), id).toBeDefined();
  });

  it('every navigate stop lands on a launch surface (never "Not in this release")', () => {
    const outside: string[] = [];
    for (const id of LIVE_DRIVE_SCRIPTS) {
      const script = findDemoScript(id)!;
      script.steps.forEach((step, i) => {
        if (!step.navigate) return;
        const surface = surfaceFor(step.navigate.target);
        if (!surface || !LAUNCH_SURFACE_IDS.has(surface)) {
          outside.push(`${id} stop ${i + 1}: navigate '${step.navigate.target}' → ${surface ?? 'unresolved'}`);
        }
      });
    }
    expect(outside, outside.join('\n')).toEqual([]);
  });

  it('every act operates a registered action whose screen is a launch surface', () => {
    const outside: string[] = [];
    for (const id of LIVE_DRIVE_SCRIPTS) {
      const script = findDemoScript(id)!;
      script.steps.forEach((step, i) => {
        if (!step.act) return;
        const action = findSurfaceAction(step.act.actionId);
        const surface = action ? surfaceFor(action.surfaceId) : null;
        if (!action || !surface || !LAUNCH_SURFACE_IDS.has(surface)) {
          outside.push(`${id} stop ${i + 1}: act '${step.act.actionId}' → ${surface ?? 'unresolved'}`);
        }
      });
    }
    expect(outside, outside.join('\n')).toEqual([]);
  });

  it('the orientation walks all six launch apps and ends at the audit trail', () => {
    const script = findDemoScript('training-orientation')!;
    const surfaces = script.steps.map((s) => (s.navigate ? surfaceFor(s.navigate.target) : null));
    for (const app of LAUNCH_APPS) {
      expect(
        surfaces.some((s) => s !== null && app.surfaces.includes(s)),
        `training-orientation never reaches the ${app.label} app`,
      ).toBe(true);
    }
    expect(surfaces.includes('audit-trail')).toBe(true);
  });

  it('submission day runs Vault → Authoring → Submission Center → Readiness → Part 11', () => {
    const script = findDemoScript('training-submission-day')!;
    const surfaces = script.steps
      .map((s) => (s.navigate ? surfaceFor(s.navigate.target) : null))
      .filter((s): s is string => s !== null);
    const appOf = (surface: string) =>
      surface === 'part11-console' || surface === 'audit-trail'
        ? 'part11'
        : LAUNCH_APPS.find((a) => a.surfaces.includes(surface))?.id ?? surface;
    const order = surfaces.map(appOf).filter((v, i, arr) => arr.indexOf(v) === i);
    const idx = (app: string) => order.indexOf(app);
    expect(idx('vault')).toBeGreaterThanOrEqual(0);
    expect(idx('authoring')).toBeGreaterThan(idx('vault'));
    expect(idx('submission-center')).toBeGreaterThan(idx('authoring'));
    expect(idx('submission-readiness')).toBeGreaterThan(idx('submission-center'));
    expect(idx('part11')).toBeGreaterThan(idx('submission-readiness'));
  });
});
