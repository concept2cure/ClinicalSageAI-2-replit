import { describe, it, expect } from 'vitest';
import {
  NAVIGATION_TARGETS,
  resolveNavigation,
  parseNavigationSignals,
  findNavigationTarget,
  navigationTargetIds,
} from '../index.js';

describe('navigation registry — shape', () => {
  it('has unique target ids', () => {
    const ids = NAVIGATION_TARGETS.map((t) => t.id);
    const dupes = ids.filter((n, i) => ids.indexOf(n) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('every target is well-formed (id, label, description, scope, group)', () => {
    const bad = NAVIGATION_TARGETS.filter(
      (t) => !t.id || !t.label || !t.description || (t.scope !== 'global' && t.scope !== 'project') || !t.group,
    );
    expect(bad.map((t) => t.id)).toEqual([]);
  });

  it('enum params declare a non-empty enum list', () => {
    for (const t of NAVIGATION_TARGETS) {
      for (const p of t.params ?? []) {
        if (p.enum) expect(p.enum.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('resolveNavigation', () => {
  it('resolves a global target to a directive', () => {
    const res = resolveNavigation('projects');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.directive.actionType).toBe('navigate');
      expect(res.directive.path).toBe('projects');
      expect(res.directive.scope).toBe('global');
    }
  });

  it('rejects an unknown target and lists valid ones', () => {
    const res = resolveNavigation('does-not-exist');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('unknown_target');
      expect(res.validTargets).toEqual(navigationTargetIds());
    }
  });

  it('accepts a valid enum param and rejects an invalid one', () => {
    const ok = resolveNavigation('intelligence', { intelligenceTab: 'protocol' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.directive.params).toEqual({ intelligenceTab: 'protocol' });

    const bad = resolveNavigation('intelligence', { intelligenceTab: 'nope' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('invalid_param');
  });

  it('omits optional params when not supplied', () => {
    const res = resolveNavigation('intelligence');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.directive.params).toBeUndefined();
  });

  it('findNavigationTarget round-trips', () => {
    expect(findNavigationTarget('cmc')?.label).toMatch(/CMC/);
    expect(findNavigationTarget('nope')).toBeUndefined();
  });
});

describe('parseNavigationSignals', () => {
  it('extracts and resolves a valid ana-navigate block', () => {
    const text = 'Taking you there.\n```ana-navigate\n{ "target": "cmc" }\n```\nDone.';
    const { directives, errors } = parseNavigationSignals(text);
    expect(errors).toEqual([]);
    expect(directives).toHaveLength(1);
    expect(directives[0].path).toBe('cmc');
  });

  it('records an error for an unknown target without emitting a directive', () => {
    const text = '```ana-navigate\n{ "target": "ghost" }\n```';
    const { directives, errors } = parseNavigationSignals(text);
    expect(directives).toEqual([]);
    expect(errors.length).toBe(1);
  });

  it('records an error for malformed JSON', () => {
    const text = '```ana-navigate\n{ not json }\n```';
    const { directives, errors } = parseNavigationSignals(text);
    expect(directives).toEqual([]);
    expect(errors[0]).toMatch(/Malformed/);
  });

  it('returns empty for text with no blocks', () => {
    expect(parseNavigationSignals('just prose')).toEqual({ directives: [], errors: [] });
  });
});
