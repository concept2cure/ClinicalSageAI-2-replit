/**
 * ui-v2 nav/AnA model ↔ reconciled surface registry parity.
 *
 * The kit's nav model (rail entries, segment modules, action scopes, aliases)
 * refers to surfaces by id; the ids MUST resolve in the reconciled shared
 * registry or rail clicks and deep links dead-end. These tests pin that
 * invariant, plus the icon vocabulary the rail/⌘K render from.
 */
import { describe, expect, it } from 'vitest';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { isLaunchSurface } from '@shared/constants/launch-scope';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { resolveSurfaceIdForTarget } from '../navParams';
import {
  ANA_MODES,
  CLIENT_CATEGORIES,
  DEEP_LINK_ALIASES,
  ESIGN_MEANINGS,
  NAV_GROUP_OF,
  NAV_HIDDEN,
  RAIL_CORE,
  SEGMENTS,
  SEGMENT_MODULES,
  SURFACE_ACTIONS,
  getAnaContext,
  getSegment,
  surfacesByTier,
  getSegmentModules,
} from '../registryModel';

describe('ui-v2 registry model ↔ shared registry parity', () => {
  it('a rail entry that applies a screen action names a registered, ungoverned action on its own screen', () => {
    // My work asks the task board for the person's own tasks as it opens it
    // (Shell.tsx Rail). An action that no longer resolves, or that lands on
    // another screen, would open the board unfiltered under a label that
    // says otherwise.
    const applying = RAIL_CORE.filter((s) => 'applies' in s && s.applies);
    expect(applying.map((s) => s.id)).toEqual(['tasks']);
    for (const s of applying) {
      const a = (s as { applies: { actionId: string; params: Record<string, string> } }).applies;
      const res = resolveSurfaceAction(a.actionId, a.params);
      expect(res.ok, `${s.id}: ${a.actionId}`).toBe(true);
      if (!res.ok) continue;
      expect(res.directive.params).toEqual(a.params);
      expect(resolveSurfaceIdForTarget(res.directive.surfaceId)).toBe(resolveSurfaceIdForTarget(s.id));
    }
  });

  it('every rail entry opens Home or a registered surface', () => {
    // Home is the shell's landing screen, synthesised by V2App with no
    // registry row; "New conversation" opens it.
    for (const s of RAIL_CORE) {
      const to = s.target ?? s.id;
      if (to === 'home') continue;
      expect(getSurface(to), `rail entry ${s.id} → ${to}`).toBeDefined();
    }
  });

  it('every NAV_GROUP_OF / NAV_HIDDEN id resolves to a registered surface', () => {
    for (const id of Object.keys(NAV_GROUP_OF)) {
      expect(getSurface(id), `NAV_GROUP_OF id ${id}`).toBeDefined();
    }
    for (const id of NAV_HIDDEN) {
      // review-approve is a historical kit id kept in the hidden set; every
      // other hidden id must be a real surface.
      if (id === 'review-approve') continue;
      expect(getSurface(id), `NAV_HIDDEN id ${id}`).toBeDefined();
    }
  });

  it('every segment-module item resolves to a registered surface', () => {
    for (const [segment, groups] of Object.entries(SEGMENT_MODULES)) {
      for (const group of groups) {
        for (const id of group.items) {
          expect(getSurface(id), `SEGMENT_MODULES ${segment} → ${id}`).toBeDefined();
        }
      }
    }
  });

  it('every surface-scoped action key resolves (except the _default catch-all)', () => {
    for (const id of Object.keys(SURFACE_ACTIONS)) {
      if (id === '_default') continue;
      expect(getSurface(id), `SURFACE_ACTIONS id ${id}`).toBeDefined();
    }
  });

  it('deep-link aliases point at registered surfaces', () => {
    for (const [alias, target] of Object.entries(DEEP_LINK_ALIASES)) {
      expect(getSurface(target), `alias ${alias} → ${target}`).toBeDefined();
    }
  });

  it('every segment defaultSurface resolves', () => {
    for (const s of SEGMENTS) {
      expect(getSurface(s.defaultSurface), `${s.id}.defaultSurface`).toBeDefined();
    }
  });

  it('client-type tier listings partition sensibly', () => {
    const admin = surfacesByTier('admin');
    expect(admin.length).toBeGreaterThan(0);
    for (const s of admin) expect(s.navTier).toBe('admin');
    // 'both' surfaces appear in mdx AND biopharma
    const mdx = new Set(surfacesByTier('mdx').map((s) => s.id));
    const bio = new Set(surfacesByTier('biopharma').map((s) => s.id));
    for (const [id, g] of Object.entries(NAV_GROUP_OF)) {
      if (g === 'both' && !NAV_HIDDEN.has(id)) {
        expect(mdx.has(id), `${id} in mdx`).toBe(true);
        expect(bio.has(id), `${id} in biopharma`).toBe(true);
      }
    }
  });

  // ── CMC: on the rail from 2026-08-23, off it from 2026-10-08 ─────────────

  it('CMC / Module 3 is not a place in this release, and not a hidden surface either', () => {
    // 2026-08-23 promoted CMC from NAV_HIDDEN to a "Science & intelligence"
    // rail entry. 2026-10-08 (docs/SURFACE_DECISIONS_2026-10-08.md) put it
    // outside the launch scope, returning as a feature of Project home, and the
    // rail now lists only the places (ONE_ANA_ONE_CANVAS.md §5). It stays a
    // registered surface out of NAV_HIDDEN, so a deep link renders the honest
    // "not in this release" panel rather than nothing.
    expect(RAIL_CORE.map((s) => s.id)).not.toContain('cmc');
    expect(isLaunchSurface('cmc')).toBe(false);
    expect(NAV_HIDDEN.has('cmc')).toBe(false);
    expect(getSurface('cmc')).toBeDefined();
  });

  it('Quality is a place, not a hidden surface', () => {
    // A launch app with no rail entry: it sat in NAV_HIDDEN.
    expect(RAIL_CORE.map((s) => s.id)).toContain('quality');
    expect(NAV_HIDDEN.has('quality')).toBe(false);
  });

  it('AnA modes display engine labels, never vendor/model names', () => {
    const banned = /claude|anthropic|sonnet|opus|haiku|gpt|gemini/i;
    for (const m of ANA_MODES) {
      expect(m.effortLabel).not.toMatch(banned);
      expect(m.label).not.toMatch(banned);
      expect(m.desc).not.toMatch(banned);
    }
  });

  // Row 74, ADR-0015 §9: the pill names the effort a mode buys, not a model or
  // a speed it cannot guarantee. "Maximum" and "Instant" overclaimed (high-risk
  // work is served by the flagship whatever the mode), and the field was called
  // `model`, so the rail printed it as the model that answered.
  it('each mode names its effort, in the words of the effort the server runs', () => {
    const WORD = { fast: 'Light', balanced: 'Balanced', thorough: 'Thorough' } as const;
    for (const m of ANA_MODES) {
      expect(m.effortLabel).toBe(WORD[m.effort]);
      expect(m).not.toHaveProperty('model');
    }
  });

  it('getAnaContext derives a context for unknown surfaces without throwing', () => {
    const ctx = getAnaContext('does-not-exist', 'biotech');
    expect(ctx.module).toBe('does-not-exist');
    expect(ctx.actions.length).toBeGreaterThan(0);
    expect(ctx.suggestions.length).toBeGreaterThan(0);
  });

  it('getAnaContext uses surface-tuned context where the kit ships one', () => {
    const ctx = getAnaContext('cmc', 'biotech');
    expect(ctx.focus).toBe('Module 3 · CMC');
  });

  it('the e-sign meaning enum is the INSTALL §5 ten-value list', () => {
    expect(ESIGN_MEANINGS).toHaveLength(10);
    expect(ESIGN_MEANINGS).toContain('AUTHOR');
    expect(ESIGN_MEANINGS).toContain('TECHNICAL_APPROVAL');
  });

  it('client categories carry icons for the account menu', () => {
    for (const c of CLIENT_CATEGORIES) {
      expect(c.icon, `icon for ${c.id}`).toBeTruthy();
    }
  });

  // ── BP-W2-1: the lane merge, and the redirect it promised ────────────────

  it('the retired lane ids are gone from SEGMENTS — one lane, not three', () => {
    const ids = SEGMENTS.map((s) => s.id);
    expect(ids).toContain('biopharma');
    expect(ids).not.toContain('biotech');
    expect(ids).not.toContain('pharma');
  });

  it("getSegment('biotech') and getSegment('pharma') resolve to the merged lane", () => {
    // Stored prefs and deep links carry the retired ids; without the alias
    // they would silently fall back to SEGMENTS[0] (medtech) — a biotech user
    // waking up in the device lane.
    expect(getSegment('biotech')?.id).toBe('biopharma');
    expect(getSegment('pharma')?.id).toBe('biopharma');
  });

  it('one module list serves both retired ids — the duplicate is deleted, not hidden', () => {
    expect((SEGMENT_MODULES as Record<string, unknown>)['pharma']).toBeUndefined();
    expect((SEGMENT_MODULES as Record<string, unknown>)['biotech']).toBeUndefined();
    expect(getSegmentModules('pharma')).toBe(getSegmentModules('biotech'));
    expect(getSegmentModules('pharma')).toBe(SEGMENT_MODULES.biopharma);
  });

  it('the client type list offers the merged lane once, not the two company labels', () => {
    const ids = CLIENT_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('biopharma');
    expect(ids).not.toContain('biotech');
    expect(ids).not.toContain('pharma');
  });

  it('every rail client-category id resolves to a real segment', () => {
    // Regression guard: the rail writes `segment` from CLIENT_CATEGORIES, and
    // the TopBar reads it back through getSegment(). If a category id is not a
    // segment, the TopBar silently falls back to SEGMENTS[0] (medtech) — which
    // is exactly what happened to "diagnostics" and "health". Keep the two axes
    // in sync.
    expect(CLIENT_CATEGORIES.length).toBeGreaterThan(0);
    for (const c of CLIENT_CATEGORIES) {
      const seg = getSegment(c.id);
      expect(seg, `category ${c.id} must be a segment`).toBeDefined();
      expect(getSurface(seg!.defaultSurface), `${c.id}.defaultSurface`).toBeDefined();
    }
  });
});

/* Moved from anaRailContextHonesty.test.tsx when the right rail was deleted
   (ONE_ANA_ONE_CANVAS.md, slice 9). The rail's "Working in" block was the one
   reader of getAnaContext; the block is gone, and these keep the model honest
   for the next reader (the design's "Working in <project>" chip). */
describe('getAnaContext says only what is true about where the person is', () => {
  const AUTHORING = ['protocol-dev', 'document-authoring', 'regulatory-workspace', 'labeling-pi', 'doc-journey', 'ectd-coauthor', 'ectd-compile', 'review'];
  /** Premises no empty organisation has: a section, a blocker, an approved
   *  version, a label, a predicate number, a sponsor count. */
  const INVENTED = [
    /Current section/i,
    /2\.5 Clinical Overview/,
    /Substantial Equivalence/,
    /Annex II/,
    /Explain blocker/,
    /Compare to approved version/,
    /Draft USPI label/,
    /K203117/,
    /ORR contradiction/,
  ];
  /** Engineering vocabulary that has no place in copy a person reads. */
  const INTERNAL = [
    /\bC2C-\d/,
    /\/api\//,
    /\/file route/,
    /@shared/,
    /\bunifiedTasks\b/,
    /\b[a-z]+_[a-z_]+\b/, // snake_case identifiers: table / tool names
    /\.tsx?\b/,
  ];

  it('no authoring surface reports a section or sends a prompt that presumes one', () => {
    for (const id of AUTHORING) {
      for (const segment of ['biopharma', 'medtech', 'diagnostics', 'cro', 'health']) {
        const ac = getAnaContext(id, segment);
        expect(ac.section, `${id}/${segment} section`).toBeNull();
        const prompts = ac.actions.map((a) => `${a.label} ${a.prompt ?? ''}`).join(' | ');
        for (const re of INVENTED) expect(prompts, `${id}/${segment}`).not.toMatch(re);
        expect(ac.actions.length, `${id}/${segment} actions`).toBeGreaterThan(0);
      }
    }
  });

  it('the focus on an authoring surface does not change with the client type', () => {
    const bio = getAnaContext('protocol-dev', 'biopharma');
    const mdx = getAnaContext('protocol-dev', 'medtech');
    expect(bio.focus).toBe('Protocol development');
    expect(mdx.focus).toBe(bio.focus);
  });

  it('no registered surface puts an internal identifier in module, here or focus', () => {
    for (const s of UI_SURFACES) {
      const ac = getAnaContext(s.id, 'biopharma');
      for (const field of [ac.module, ac.here, ac.focus] as const) {
        for (const re of INTERNAL) expect(field, `${s.id}: ${field}`).not.toMatch(re);
      }
      expect(ac.here.endsWith('.'), `${s.id} here ends with a period`).toBe(false);
    }
  });

  it('Home is named Home, not by its raw id', () => {
    const ac = getAnaContext('home', 'biopharma');
    expect(ac.module).toBe('Home');
    expect(ac.focus).toBe('Home');
  });
});

/* Moved from anaRailContextHonesty.test.tsx with the rest. "Quick access" is
   gone (ONE_ANA_ONE_CANVAS.md §5); the rule it pinned holds for the whole list. */
describe('no nav entry promises a feature that does not exist', () => {
  it('there is no "Starred Items" entry (nothing in the product can be starred)', () => {
    expect(RAIL_CORE.map((q) => q.label)).not.toContain('Starred Items');
    expect(RAIL_CORE.map((q) => q.id)).not.toContain('starred');
  });

  it('Projects, the destination that entry opened, is on the rail', () => {
    expect(RAIL_CORE.map((r) => r.id)).toContain('projects');
  });
});
