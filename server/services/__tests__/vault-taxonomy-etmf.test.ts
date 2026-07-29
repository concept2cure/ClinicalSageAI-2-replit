/**
 * Cross-client vault taxonomy + eTMF alignment tests.
 *
 * Covers:
 *   - the shared TMF zone MIRROR staying in lockstep with BOTH server-side
 *     zone catalogs (etmf-logic.ts and tmf-completeness.ts) — the drift
 *     guard that lets client code consume zones without importing server
 *     services (same posture as the enum-alignment schema-drift tests)
 *   - vault-taxonomy view integrity: every view has folders, doc kinds,
 *     and filing frameworks; ids unique; legacy filter ids preserved
 *   - the service-org rule: product owners map to their segment, CROs and
 *     other service orgs get the cross-sponsor TMF view
 *   - the eTMF seed skeleton: pure derivation from the reference model,
 *     essential-drives-completeness invariant
 */
import { describe, it, expect } from 'vitest';

import {
  TMF_ZONE_REFS,
  tmfZoneById,
  tmfZoneByNumber,
} from '../../../shared/constants/domain/tmf-reference-model';
import {
  VAULT_VIEWS,
  VAULT_DOC_KINDS,
  VAULT_FILING_TYPES,
  VAULT_FOLDER_PRESETS,
  docKindsForView,
  filingTypesForView,
  foldersForView,
  vaultViewForOrganization,
  type VaultViewId,
} from '../../../shared/constants/domain/vault-taxonomy';
import { TMF_ZONES, zoneName } from '../etmf/etmf-logic';
import { TMF_REFERENCE_MODEL, seedArtifacts } from '../etmf/tmf-completeness';

// ─────────────────────────────────────────────────────────────────────────────
// Drift guard: shared zone mirror ⇄ server catalogs
// ─────────────────────────────────────────────────────────────────────────────

describe('TMF zone mirror drift guard', () => {
  it('mirrors etmf-logic.TMF_ZONES exactly (numbers and names)', () => {
    expect(TMF_ZONE_REFS.map(z => ({ zone: z.zone, name: z.name }))).toEqual(
      TMF_ZONES.map(z => ({ zone: z.zone, name: z.name })),
    );
  });

  it('covers the same 11 zones as tmf-completeness.TMF_REFERENCE_MODEL', () => {
    expect(new Set(TMF_ZONE_REFS.map(z => z.zone))).toEqual(
      new Set(TMF_REFERENCE_MODEL.map(z => z.number)),
    );
  });

  it('resolves zones by id and number consistently', () => {
    for (const z of TMF_ZONE_REFS) {
      expect(tmfZoneById(z.id)).toEqual(z);
      expect(tmfZoneByNumber(z.zone)).toEqual(z);
      expect(z.name).toBe(zoneName(z.zone));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vault taxonomy integrity
// ─────────────────────────────────────────────────────────────────────────────

const ALL_VIEWS = VAULT_VIEWS.map(v => v.value) as VaultViewId[];

describe('vault taxonomy views', () => {
  it('defines the four product segments plus the service view', () => {
    expect([...ALL_VIEWS].sort()).toEqual(['biotech', 'device', 'ivd', 'pharma', 'service']);
  });

  it('every view has folders, doc kinds, and filing frameworks', () => {
    for (const view of ALL_VIEWS) {
      expect(foldersForView(view).length, `folders for ${view}`).toBeGreaterThan(0);
      expect(docKindsForView(view).length, `doc kinds for ${view}`).toBeGreaterThan(0);
      expect(filingTypesForView(view).length, `frameworks for ${view}`).toBeGreaterThan(0);
    }
  });

  it('ids are unique within each catalog', () => {
    const kinds = VAULT_DOC_KINDS.map(k => k.value);
    const filings = VAULT_FILING_TYPES.map(f => f.value);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(filings).size).toBe(filings.length);
    for (const view of ALL_VIEWS) {
      const folders = foldersForView(view).map(f => f.id);
      expect(new Set(folders).size, `folder ids for ${view}`).toBe(folders.length);
    }
  });

  it('preserves the shipped device-view filter ids (client compatibility)', () => {
    const deviceKinds = new Set<string>(docKindsForView('device').map(k => k.value));
    for (const legacy of ['report', 'cert', 'label', 'code', 'supplier', 'resp']) {
      expect(deviceKinds.has(legacy), `legacy kind ${legacy}`).toBe(true);
    }
  });

  it('pharma/biotech views are CTD-structured; service view is TMF-zone-structured', () => {
    const pharmaFolders = foldersForView('pharma').map(f => f.id);
    expect(pharmaFolders).toEqual(expect.arrayContaining(['module-1', 'module-3', 'module-5', 'sequences']));
    expect(foldersForView('biotech')).toEqual(foldersForView('pharma'));

    const serviceFolders = foldersForView('service').map(f => f.id);
    for (const z of TMF_ZONE_REFS) {
      expect(serviceFolders, `service folders include ${z.id}`).toContain(z.id);
    }
  });

  it('filing frameworks land in the right segment views', () => {
    const pharma = new Set(filingTypesForView('pharma').map(f => f.value));
    const biotech = new Set(filingTypesForView('biotech').map(f => f.value));
    const device = new Set(filingTypesForView('device').map(f => f.value));
    expect(pharma.has('nda')).toBe(true);
    expect(pharma.has('bla')).toBe(false);   // BLA is the biotech pathway
    expect(biotech.has('bla')).toBe(true);
    expect(biotech.has('ind')).toBe(true);
    expect(device.has('k510')).toBe(true);
    expect(device.has('nda')).toBe(false);
  });
});

describe('vaultViewForOrganization (service-org rule)', () => {
  it('maps product owners to their segment', () => {
    expect(vaultViewForOrganization('pharma')).toBe('pharma');
    expect(vaultViewForOrganization('biotech')).toBe('biotech');
    expect(vaultViewForOrganization('medtech')).toBe('device');
    expect(vaultViewForOrganization('ivd')).toBe('ivd');
  });

  it('maps service organizations to the cross-sponsor TMF view', () => {
    for (const org of ['cro', 'cdmo', 'academic', 'government', 'other'] as const) {
      expect(vaultViewForOrganization(org)).toBe('service');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// eTMF seed skeleton
// ─────────────────────────────────────────────────────────────────────────────

describe('seedArtifacts (eTMF expected-document skeleton)', () => {
  it("'all' scope seeds every reference-model artifact across all 11 zones", () => {
    const seeds = seedArtifacts('all');
    const catalogSize = TMF_REFERENCE_MODEL.reduce((n, z) => n + z.artifacts.length, 0);
    expect(seeds).toHaveLength(catalogSize);
    expect(new Set(seeds.map(s => s.zone))).toEqual(new Set(TMF_REFERENCE_MODEL.map(z => z.number)));
  });

  it("'essential' scope seeds only essential documents, all completeness-required", () => {
    const seeds = seedArtifacts('essential');
    const essentialCount = TMF_REFERENCE_MODEL.reduce(
      (n, z) => n + z.artifacts.filter(a => a.essential).length, 0,
    );
    expect(seeds).toHaveLength(essentialCount);
    expect(seeds.every(s => s.completenessRequired)).toBe(true);
  });

  it('completeness_required mirrors essential — optional artifacts never dilute readiness', () => {
    const byCode = new Map(seedArtifacts('all').map(s => [s.code, s]));
    for (const zone of TMF_REFERENCE_MODEL) {
      for (const a of zone.artifacts) {
        expect(byCode.get(a.code)?.completenessRequired, a.code).toBe(a.essential);
      }
    }
  });

  it('seed codes are unique (idempotency key sanity)', () => {
    const codes = seedArtifacts('all').map(s => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
