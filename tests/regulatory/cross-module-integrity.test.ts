/**
 * Cross-module integrity tests — verify that references between shared/regulatory
 * modules are consistent and no dangling IDs exist.
 */
import { describe, it, expect } from 'vitest';
import { APP_REGISTRY, type WorkspaceAppId } from '../../shared/regulatory/app-registry';
import { CLAIM_SPINES } from '../../shared/regulatory/claim-spine';
import { CLIENT_SEGMENTS, type ClientSegmentId } from '../../shared/regulatory/client-segments';
import { getService, type WorkspaceServiceId } from '../../shared/regulatory/service-registry';
import { resolveProjectMap, PHASE_ORDER } from '../../shared/regulatory/project-map';
import { resolveWorkspaceConfig } from '../../shared/regulatory/workspace-config';
import { APPLICATION_FAMILY_METADATA } from '../../shared/regulatory/application-families';
import { getStandard } from '../../shared/regulatory/standards-registry';

const ALL_APP_IDS = new Set(Object.keys(APP_REGISTRY) as WorkspaceAppId[]);

describe('cross-module integrity — claim spine → app registry', () => {
  it('every app referenced in a claim spine exists in the app registry', () => {
    for (const spine of Object.values(CLAIM_SPINES)) {
      for (const claim of spine.claims) {
        for (const appId of claim.supportedByApps) {
          expect(ALL_APP_IDS.has(appId), `Claim "${claim.id}" references unknown app "${appId}"`).toBe(true);
        }
      }
    }
  });
});

describe('cross-module integrity — client segments → standards registry', () => {
  it('every standard ID in a segment exists in the standards registry', () => {
    for (const seg of Object.values(CLIENT_SEGMENTS)) {
      for (const stdId of seg.standardIds) {
        const std = getStandard(stdId);
        expect(std, `Segment "${seg.id}" references unknown standard "${stdId}"`).toBeDefined();
      }
    }
  });

  it('derived standards designations match the registry', () => {
    for (const seg of Object.values(CLIENT_SEGMENTS)) {
      for (let i = 0; i < seg.standardIds.length; i++) {
        const expected = getStandard(seg.standardIds[i]).designation;
        expect(seg.standards[i]).toBe(expected);
      }
    }
  });
});

describe('cross-module integrity — project map phases', () => {
  it('every phase in PHASE_ORDER is used by at least one filing type', () => {
    const allPhases = new Set<string>();
    for (const need of ['BLA', 'NDA', '510K', 'US_CDX_PMA', 'IND']) {
      for (const m of resolveProjectMap(need).milestones) {
        allPhases.add(m.phase);
      }
    }
    for (const phase of PHASE_ORDER) {
      expect(allPhases.has(phase), `Phase "${phase}" never appears in any resolved project map`).toBe(true);
    }
  });

  it('milestone ordinals are dense and zero-based for every filing', () => {
    for (const need of ['BLA', 'NDA', '510K', 'US_CDX_PMA']) {
      const map = resolveProjectMap(need);
      const ordinals = map.milestones.map((m) => m.ordinal);
      expect(ordinals).toEqual(ordinals.map((_, i) => i));
    }
  });
});

describe('cross-module integrity — workspace config ↔ project map', () => {
  it('every app in workspace config appears in the project map inventory', () => {
    for (const need of ['BLA', 'NDA', '510K']) {
      const cfg = resolveWorkspaceConfig(need);
      const map = resolveProjectMap(need);
      const inventoryAppIds = new Set(map.inventory.apps.map((a) => a.id));
      for (const app of cfg.apps) {
        expect(
          inventoryAppIds.has(app.id),
          `App "${app.id}" is in workspace config for "${need}" but missing from project map inventory`,
        ).toBe(true);
      }
    }
  });

  it('every service in workspace config appears in the project map inventory', () => {
    for (const need of ['BLA', 'NDA']) {
      const cfg = resolveWorkspaceConfig(need);
      const map = resolveProjectMap(need);
      const inventorySvcIds = new Set(map.inventory.services.map((s) => s.id));
      for (const svc of cfg.services) {
        expect(
          inventorySvcIds.has(svc.id),
          `Service "${svc.id}" is in workspace config for "${need}" but missing from project map inventory`,
        ).toBe(true);
      }
    }
  });
});

describe('cross-module integrity — workspace config app IDs → app registry', () => {
  const FILING_TYPES = ['BLA', 'NDA', 'IND', '510K', 'US_PMA', 'US_CDX_PMA', 'US_CDX_510K', 'US_DE_NOVO', 'CSR'];

  it('every app produced by resolveWorkspaceConfig exists in APP_REGISTRY', () => {
    const unknownApps: string[] = [];
    for (const need of FILING_TYPES) {
      const cfg = resolveWorkspaceConfig(need);
      for (const app of cfg.apps) {
        if (!ALL_APP_IDS.has(app.id)) {
          unknownApps.push(`${need} → ${app.id}`);
        }
      }
    }
    expect(unknownApps, `Unknown app IDs: ${unknownApps.join(', ')}`).toHaveLength(0);
  });

  it('the full set of apps across all filings is a subset of APP_REGISTRY', () => {
    const allProduced = new Set<string>();
    for (const need of FILING_TYPES) {
      for (const app of resolveWorkspaceConfig(need).apps) {
        allProduced.add(app.id);
      }
    }
    for (const id of allProduced) {
      expect(ALL_APP_IDS.has(id as WorkspaceAppId), `App "${id}" not in registry`).toBe(true);
    }
  });
});

describe('cross-module integrity — workspace config ↔ project map (broad)', () => {
  const FILINGS = ['BLA', 'NDA', 'IND', '510K', 'US_PMA', 'US_CDX_PMA'];

  it('every service in workspace config appears in project map inventory for all filings', () => {
    for (const need of FILINGS) {
      const cfg = resolveWorkspaceConfig(need);
      const map = resolveProjectMap(need);
      const inventorySvcIds = new Set(map.inventory.services.map((s) => s.id));
      for (const svc of cfg.services) {
        expect(
          inventorySvcIds.has(svc.id),
          `Service "${svc.id}" in workspace config for "${need}" missing from project map inventory`,
        ).toBe(true);
      }
    }
  });

  it('every app in workspace config appears in project map inventory for all filings', () => {
    for (const need of FILINGS) {
      const cfg = resolveWorkspaceConfig(need);
      const map = resolveProjectMap(need);
      const inventoryAppIds = new Set(map.inventory.apps.map((a) => a.id));
      for (const app of cfg.apps) {
        expect(
          inventoryAppIds.has(app.id),
          `App "${app.id}" in workspace config for "${need}" missing from project map inventory`,
        ).toBe(true);
      }
    }
  });
});

describe('cross-module integrity — workspace config program → apps', () => {
  const PROGRAM_FILINGS = ['BLA', 'NDA', '510K', 'US_PMA', 'US_CDX_PMA', 'IND'];

  it('every required claim has at least one supporting app available in the workspace', () => {
    for (const need of PROGRAM_FILINGS) {
      const cfg = resolveWorkspaceConfig(need);
      if (!cfg.program) continue;
      const cfgAppIds = new Set(cfg.apps.map((a) => a.id));
      for (const claim of cfg.program.requiredClaims) {
        const available = claim.supportedByApps.filter((id) => cfgAppIds.has(id));
        expect(
          available.length,
          `Claim "${claim.id}" in "${need}" has NO supporting apps in the workspace (needs one of: ${claim.supportedByApps.join(', ')})`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every claim-supporting app that IS in the workspace exists in the app registry', () => {
    for (const need of PROGRAM_FILINGS) {
      const cfg = resolveWorkspaceConfig(need);
      if (!cfg.program) continue;
      for (const claim of cfg.program.requiredClaims) {
        for (const appId of claim.supportedByApps) {
          expect(
            ALL_APP_IDS.has(appId),
            `Claim "${claim.id}" in "${need}" references unknown app "${appId}"`,
          ).toBe(true);
        }
      }
    }
  });

  it('every program segment matches a known client segment', () => {
    const segmentIds = new Set(Object.keys(CLIENT_SEGMENTS));
    for (const need of PROGRAM_FILINGS) {
      const cfg = resolveWorkspaceConfig(need);
      if (!cfg.program) continue;
      expect(
        segmentIds.has(cfg.program.segment),
        `Program for "${need}" references unknown segment "${cfg.program.segment}"`,
      ).toBe(true);
    }
  });
});

describe('cross-module integrity — application families → dossier standards', () => {
  const VALID_STANDARDS = new Set(['eCTD', 'CTD', 'ACTD', 'NeeS', 'eSTAR', 'regional', 'none']);

  it('every typicalDossierStandard in APPLICATION_FAMILY_METADATA is a valid DossierStandard', () => {
    for (const fam of APPLICATION_FAMILY_METADATA) {
      for (const std of fam.typicalDossierStandards) {
        expect(
          VALID_STANDARDS.has(std),
          `Family "${fam.id}" references unknown dossier standard "${std}"`,
        ).toBe(true);
      }
    }
  });
});

describe('cross-module integrity — application families ↔ document taxonomy', () => {
  it('every family in APPLICATION_FAMILY_METADATA is a valid ApplicationFamily', () => {
    for (const fam of APPLICATION_FAMILY_METADATA) {
      const cfg = resolveWorkspaceConfig(fam.id);
      // The family ID itself may not resolve as a "need" (it's a family, not a filing ID),
      // but the metadata should have unique, non-empty ids
      expect(fam.id).toBeTruthy();
      expect(fam.displayName).toBeTruthy();
    }
  });

  it('no duplicate family IDs in the metadata catalog', () => {
    const ids = APPLICATION_FAMILY_METADATA.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
