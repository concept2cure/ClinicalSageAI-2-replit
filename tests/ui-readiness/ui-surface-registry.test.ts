/**
 * Parity + validity tests for the global UI surface registry.
 *
 * These guarantee the registry stays grounded: ids are unique, taxonomy values
 * are valid, every referenced design kit and typed contract actually exists on
 * disk, and the cross-cutting concerns are well-formed. This is what makes the
 * "organize all features" map trustworthy for design to install against.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UI_SURFACES,
  CROSS_CUTTING_CONCERNS,
  NAV_TIERS,
  READINESS_TIERS,
  getSurface,
  surfacesByNavTier,
  surfacesByReadiness,
  readinessSummary,
  contractReadySurfaces,
  type UiSurface,
} from '@shared/constants/ui-surface-registry';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Resolve a "@shared/..." contract reference to a repo-relative .ts path. */
function contractToPath(contract: string): string {
  const rel = contract.replace(/^@shared\//, 'shared/');
  return path.join(repoRoot, `${rel}.ts`);
}

describe('ui-surface-registry — structural validity', () => {
  it('has a non-trivial number of surfaces', () => {
    expect(UI_SURFACES.length).toBeGreaterThanOrEqual(20);
  });

  it('every surface id is unique', () => {
    const ids = UI_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every surface has a non-empty label and layoutMode', () => {
    for (const s of UI_SURFACES) {
      expect(s.id, `id for ${s.label}`).toMatch(/^[a-z0-9-]+$/);
      expect(s.label.length, `label for ${s.id}`).toBeGreaterThan(0);
      expect(s.layoutMode.length, `layoutMode for ${s.id}`).toBeGreaterThan(0);
    }
  });

  it('every navTier and readiness value is from the allowed set', () => {
    for (const s of UI_SURFACES) {
      expect(NAV_TIERS, `navTier for ${s.id}`).toContain(s.navTier);
      expect(READINESS_TIERS, `readiness for ${s.id}`).toContain(s.readiness);
    }
  });

  it('every surface binds to at least one REST prefix shaped /api/...', () => {
    for (const s of UI_SURFACES) {
      expect(s.apiPrefixes.length, `apiPrefixes for ${s.id}`).toBeGreaterThan(0);
      for (const p of s.apiPrefixes) {
        expect(p, `prefix ${p} on ${s.id}`).toMatch(/^\/api(\/|$)|^SUBMISSION/);
      }
    }
  });

  it('every surface declares at least one compliance rail', () => {
    for (const s of UI_SURFACES) {
      expect(s.compliance.length, `compliance for ${s.id}`).toBeGreaterThan(0);
    }
  });
});

describe('ui-surface-registry — references resolve on disk', () => {
  it('every referenced ui_kit directory exists', () => {
    const kits = UI_SURFACES.map((s) => s.uiKit).filter((k): k is string => Boolean(k));
    for (const kit of [...new Set(kits)]) {
      const dir = path.join(repoRoot, 'ui_kits', kit);
      expect(existsSync(dir), `ui_kits/${kit} should exist`).toBe(true);
    }
  });

  it('every @shared typed contract referenced by a surface exists', () => {
    const contracts = UI_SURFACES.map((s) => s.sharedContract).filter(
      (c): c is string => Boolean(c)
    );
    for (const contract of [...new Set(contracts)]) {
      const file = contractToPath(contract);
      expect(existsSync(file), `${contract} -> ${file} should exist`).toBe(true);
    }
  });

  it('every @shared contract referenced by a cross-cutting concern exists', () => {
    const contracts = CROSS_CUTTING_CONCERNS.map((c) => c.sharedContract).filter(
      (c): c is string => Boolean(c)
    );
    for (const contract of [...new Set(contracts)]) {
      const file = contractToPath(contract);
      expect(existsSync(file), `${contract} -> ${file} should exist`).toBe(true);
    }
  });
});

describe('ui-surface-registry — selectors', () => {
  it('getSurface resolves a known id and rejects an unknown one', () => {
    expect(getSurface('global-ri')?.label).toBe('Global regulatory intelligence');
    expect(getSurface('does-not-exist')).toBeUndefined();
  });

  it('surfacesByNavTier partitions the registry exactly', () => {
    const total = NAV_TIERS.reduce((n, tier) => n + surfacesByNavTier(tier).length, 0);
    expect(total).toBe(UI_SURFACES.length);
  });

  it('readinessSummary counts sum to the full registry', () => {
    const summary = readinessSummary();
    const total = READINESS_TIERS.reduce((n, tier) => n + summary[tier], 0);
    expect(total).toBe(UI_SURFACES.length);
  });

  it('contractReadySurfaces returns only surfaces with a contract or catalog', () => {
    const ready = contractReadySurfaces();
    expect(ready.length).toBeGreaterThan(0);
    for (const s of ready) {
      const hasContract = s.sharedContract !== null || s.discoveryCatalog !== null;
      expect(hasContract, `${s.id} should expose a contract or catalog`).toBe(true);
    }
  });

  it('the two precedent surfaces are reported contract-ready', () => {
    const byReadiness = surfacesByReadiness('contract-ready').map((s: UiSurface) => s.id);
    expect(byReadiness).toContain('global-ri');
    expect(byReadiness).toContain('submission-center');
  });
});
