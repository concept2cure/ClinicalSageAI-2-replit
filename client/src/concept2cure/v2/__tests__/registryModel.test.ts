/**
 * ui-v2 nav/AnA model ↔ reconciled surface registry parity.
 *
 * The kit's nav model (rail entries, segment modules, action scopes, aliases)
 * refers to surfaces by id; the ids MUST resolve in the reconciled shared
 * registry or rail clicks and deep links dead-end. These tests pin that
 * invariant, plus the icon vocabulary the rail/⌘K render from.
 */
import { describe, expect, it } from 'vitest';
import { getSurface } from '@shared/constants/ui-surface-registry';
import {
  ANA_MODES,
  CLIENT_CATEGORIES,
  DEEP_LINK_ALIASES,
  ESIGN_MEANINGS,
  NAV_GROUP_OF,
  NAV_HIDDEN,
  RAIL_CORE,
  RAIL_EXPLORE,
  RAIL_QUICK,
  RAIL_SPECIALIST,
  SEGMENTS,
  SEGMENT_MODULES,
  SURFACE_ACTIONS,
  getAnaContext,
  getSegment,
  surfacesByTier,
  getSegmentModules,
} from '../registryModel';

describe('ui-v2 registry model ↔ shared registry parity', () => {
  it('every rail entry resolves to a registered surface', () => {
    const railIds = [
      ...RAIL_CORE.map((s) => s.id),
      ...RAIL_SPECIALIST.map((s) => s.id),
      ...RAIL_EXPLORE.map((s) => s.id),
      ...RAIL_QUICK.map((s) => s.target),
    ];
    for (const id of railIds) {
      expect(getSurface(id), `rail id ${id}`).toBeDefined();
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

  it('AnA modes display engine labels, never vendor/model names', () => {
    const banned = /claude|anthropic|sonnet|opus|haiku|gpt|gemini/i;
    for (const m of ANA_MODES) {
      expect(m.model).not.toMatch(banned);
      expect(m.label).not.toMatch(banned);
      expect(m.desc).not.toMatch(banned);
    }
    expect(ANA_MODES.map((m) => m.model)).toEqual(['Balanced', 'Maximum', 'Instant']);
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

  it('client categories carry icons for the rail', () => {
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

  it('the rail offers the merged lane once, not the two company labels', () => {
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
