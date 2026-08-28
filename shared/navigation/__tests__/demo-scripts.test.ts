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
