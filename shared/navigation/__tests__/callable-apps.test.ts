/**
 * The `@app` vocabulary is derived from the navigation contract, so a mention
 * can only name a screen AnA can reach; parsing is by label, longest first,
 * and an unknown label is ordinary text.
 */
import { describe, expect, it } from 'vitest';

import { findNavigationTarget } from '../index';
import { CALLABLE_APPS, findCallableApp, parseAppMentions, searchCallableApps, stripAppMentions } from '../callable-apps';

describe('CALLABLE_APPS', () => {
  it('every app is a navigation target AnA can resolve', () => {
    expect(CALLABLE_APPS.length).toBeGreaterThan(20);
    for (const a of CALLABLE_APPS) {
      expect(findNavigationTarget(a.id), a.id).toBeDefined();
      expect(a.label.length).toBeGreaterThan(2);
    }
  });

  it('includes the module workstreams and the tool-like globals, not the shell destinations', () => {
    const ids = CALLABLE_APPS.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['cmc', 'labeling', 'biostatistics', 'biostat-workbench', 'deep-research', 'communication-center', 'tasking']));
    expect(ids).not.toContain('projects');
    expect(ids).not.toContain('project-home');
    expect(ids).not.toContain('apps');
  });

  it('labels are unique, so a mention is never ambiguous', () => {
    const labels = CALLABLE_APPS.map((a) => a.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('searchCallableApps', () => {
  it('ranks a prefix match first and caps the list', () => {
    const r = searchCallableApps('bio');
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(8);
    expect(r[0].label.toLowerCase().startsWith('bio')).toBe(true);
  });

  it('an empty query lists the vocabulary', () => {
    expect(searchCallableApps('').length).toBe(8);
  });
});

describe('parseAppMentions', () => {
  it('finds a mention by its full label, including spaces', () => {
    const app = findCallableApp('Biostatistics workbench')!;
    const m = parseAppMentions(`Ask @${app.label} to size the study`);
    expect(m).toHaveLength(1);
    expect(m[0].app.id).toBe(app.id);
    expect(m[0].index).toBe(4);
  });

  it('prefers the longer label when one label prefixes another', () => {
    const long = CALLABLE_APPS.find((a) => CALLABLE_APPS.some((b) => b !== a && a.label.toLowerCase().startsWith(b.label.toLowerCase())));
    if (!long) return; // no such pair in the current vocabulary — nothing to disambiguate
    const m = parseAppMentions(`@${long.label} please`);
    expect(m[0].app.id).toBe(long.id);
  });

  it('ignores unknown labels and e-mail addresses', () => {
    expect(parseAppMentions('mail me at ana@concept2cure.pro about @Nonexistent App')).toEqual([]);
  });

  it('is case-insensitive and reports each app once', () => {
    const m = parseAppMentions('@cmc / quality (module 3) and again @CMC / Quality (Module 3)');
    expect(m.map((x) => x.app.id)).toEqual(['cmc']);
  });

  it('stripAppMentions removes only the @ of recognised mentions', () => {
    expect(stripAppMentions('Use @Labeling for this, not @Unknown')).toBe('Use Labeling for this, not @Unknown');
  });
});
