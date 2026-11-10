/**
 * Cross-client vault taxonomy + eTMF alignment tests.
 *
 * Covers:
 *   - ONE TMF reference model. shared/constants/domain/tmf-reference-model.ts
 *     is the catalog; tmf-completeness.ts, etmf-logic.ts, the vault's TMF
 *     folders and the eTMF screen read it. Until 2026-10-30 it existed five
 *     times (design ETMF_CONVERGENCE_2026-10-30, slice E1), this guard
 *     compared zone NUMBERS only, and zone 4 was spelled two ways. The guard
 *     now compares numbers and names, requires the server catalog to be the
 *     shared object itself, and scans the source for a re-added copy.
 *   - vault-taxonomy view integrity: every view has folders, doc kinds,
 *     and filing frameworks; ids unique; legacy filter ids preserved
 *   - the service-org rule: product owners map to their segment, CROs and
 *     other service orgs get the cross-sponsor TMF view
 *   - the eTMF seed skeleton: pure derivation from the reference model,
 *     essential-drives-completeness invariant
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import * as SHARED_CATALOG from '../../../shared/constants/domain/tmf-reference-model';
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
import { TMF_REFERENCE_MODEL, getTmfReferenceModel, seedArtifacts } from '../etmf/tmf-completeness';

// ─────────────────────────────────────────────────────────────────────────────
// Drift guard: one TMF reference model
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CATALOG_FILE = 'shared/constants/domain/tmf-reference-model.ts';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(rel);
  }
  return out;
}

/** The source with its comments removed: a name quoted in prose is not a catalog. */
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** How many of `literals` appear in `src` as a quoted string literal. */
function quotedCount(src: string, literals: string[]): number {
  return literals.filter(s => src.includes(`'${s}'`) || src.includes(`"${s}"`) || src.includes(`\`${s}\``)).length;
}

describe('one TMF reference model (drift guard)', () => {
  it('the server completeness catalog IS the shared catalog object, not a copy of it', () => {
    expect(SHARED_CATALOG.TMF_REFERENCE_MODEL, `${CATALOG_FILE} exports no TMF_REFERENCE_MODEL`).toBeDefined();
    expect(TMF_REFERENCE_MODEL).toBe(SHARED_CATALOG.TMF_REFERENCE_MODEL);
    expect(getTmfReferenceModel()).toBe(SHARED_CATALOG.TMF_REFERENCE_MODEL);
  });

  it('zone numbers AND names are the same in every consumer', () => {
    const catalog = TMF_REFERENCE_MODEL.map(z => ({ zone: z.number, name: z.name }));
    expect(catalog.map(z => z.zone)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(TMF_ZONE_REFS.map(z => ({ zone: z.zone, name: z.name })), 'TMF_ZONE_REFS').toEqual(catalog);
    expect(TMF_ZONES.map(z => ({ zone: z.zone, name: z.name })), 'etmf-logic TMF_ZONES').toEqual(catalog);
    for (const z of catalog) expect(zoneName(z.zone), `etmf-logic zoneName(${z.zone})`).toBe(z.name);
    const serviceFolders = foldersForView('service');
    for (const z of TMF_ZONE_REFS) {
      expect(serviceFolders.find(f => f.id === z.id)?.label, `vault service folder ${z.id}`).toBe(z.name);
    }
  });

  it('resolves zones by id and number consistently', () => {
    for (const z of TMF_ZONE_REFS) {
      expect(tmfZoneById(z.id)).toEqual(z);
      expect(tmfZoneByNumber(z.zone)).toEqual(z);
      expect(z.name).toBe(zoneName(z.zone));
    }
  });

  it('the server catalogs import the shared one', () => {
    const fromShared = /from '\.\.\/\.\.\/\.\.\/shared\/constants\/domain\/tmf-reference-model(?:\.js)?'/;
    const files = ['server/services/etmf/tmf-completeness.ts', 'server/services/etmf/etmf-logic.ts'];
    expect(files.filter(f => !fromShared.test(read(f))), `files that do not import ${CATALOG_FILE}`).toEqual([]);
  });

  /* A copy is any non-test source file, other than the catalog, whose code
     (comments aside) spells out three or more zone names, five or more artifact
     names or six or more artifact codes as string literals. Measured on
     2026-10-30 before the convergence: the three copies carried 10–11 zone
     names, and two of them 41/41 artifacts; the most any other file carried
     was 1 zone name, 3 names and 3 codes. */
  it('no second catalog exists in server, shared or client source', () => {
    const zones = TMF_REFERENCE_MODEL.map(z => z.name);
    const artifacts = TMF_REFERENCE_MODEL.flatMap(z => z.artifacts);
    const names = artifacts.map(a => a.name);
    const codes = artifacts.map(a => a.code);
    const copies: string[] = [];
    for (const f of ['server', 'shared', 'client/src'].flatMap(d => sourceFiles(d))) {
      if (f === CATALOG_FILE) continue;
      const src = withoutComments(read(f));
      const z = quotedCount(src, zones);
      const n = quotedCount(src, names);
      const c = quotedCount(src, codes);
      if (z >= 3 || n >= 5 || c >= 6) copies.push(`${f}: ${z} zone names, ${n} artifact names, ${c} artifact codes`);
    }
    expect(copies).toEqual([]);
    // It reads every source file under server, shared and client/src: about 3 s
    // alone, past vitest's 5 s default when other suites run beside it.
  }, 60_000);

  it('the eTMF screen takes artifact names from the catalog, not from fixtures', () => {
    const screen = read('client/src/concept2cure/v2/surfaces/Etmf.tsx');
    expect(screen.match(/^import\b[^;]*from '(?:\.\.\/)+fixtures\/[^']+';/gm) ?? [], 'fixture imports in Etmf.tsx').toEqual([]);
    expect(/^import \{[^}]*\btmfArtifactName\b[^}]*\} from '@shared\/constants\/domain\/tmf-reference-model';/m.test(screen),
      'Etmf.tsx imports tmfArtifactName from the shared catalog').toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'client/src/concept2cure/v2/fixtures/etmf.ts')), 'fixtures/etmf.ts exists').toBe(false);
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
