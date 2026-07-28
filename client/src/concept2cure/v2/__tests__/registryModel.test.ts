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
  RAIL_PRIMARY,
  SEGMENTS,
  SEGMENT_MODULES,
  SURFACE_ACTIONS,
  getAnaContext,
  surfacesByTier,
} from '../registryModel';

describe('ui-v2 registry model ↔ shared registry parity', () => {
  it('every rail entry resolves to a registered surface', () => {
    for (const { id } of RAIL_PRIMARY) {
      expect(getSurface(id), `rail id ${id}`).toBeDefined();
    }
  });

  // ── ana-ui-design-constitution §4 ──────────────────────────────────────────
  it('ships exactly five top-level destinations', () => {
    expect(RAIL_PRIMARY).toHaveLength(5);
  });

  it('those five are Chats, Projects, Communication Center, Apps, Settings', () => {
    expect(RAIL_PRIMARY.map((s) => s.label)).toEqual([
      'Chats', 'Projects', 'Communication Center', 'Apps', 'Settings',
    ]);
  });

  it('chat is the FIRST destination — Law 1, "chat is the primary operating surface"', () => {
    // It was previously third-tier, inside Explore, while the analytics
    // dashboard was first-tier in Workspace. That inversion is the defect.
    expect(RAIL_PRIMARY[0].id).toBe('conversation-thread');
  });

  it.each([
    'vault', 'submission-center', 'artifacts-center',
    'document-authoring', 'insights', 'crl-library',
  ])('%s is not a shell sibling — §4 forbids it at top level', (forbidden) => {
    expect(RAIL_PRIMARY.map((s) => s.id)).not.toContain(forbidden);
  });

  it.each([
    'vault', 'submission-center', 'artifacts-center',
    'document-authoring', 'insights', 'crl-library',
    'rbm', 'tasks', 'ana-command', 'ana-memory',
  ])('%s is DEMOTED, not deleted — still reachable via ⌘K/deep-link', (demoted) => {
    // The constitution says these "may exist inside projects, drawers, tabs, or
    // apps — never as shell siblings". Removing a destination without keeping it
    // reachable would be a regression, not compliance.
    expect(NAV_HIDDEN.has(demoted), `${demoted} lost its reachability`).toBe(true);
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
});
