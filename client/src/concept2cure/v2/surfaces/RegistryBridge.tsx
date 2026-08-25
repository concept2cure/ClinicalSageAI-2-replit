/**
 * RegistryBridge — the client adapter over the ONE filing catalog.
 *
 * This module used to hold a second, hand-maintained copy of the Global
 * Document Registry as ~160 tuples, which drifted from the canonical
 * `shared/regulatory/global-document-registry.ts` — including on corrected
 * regulatory metadata (BP-W1-3 fixes that landed in one copy and not the
 * other). BP-W1-2 retires the copy: everything here is DERIVED from
 * `shared/regulatory/filing-catalog.ts`, and the exported API (and the window
 * bridge legacy callers read) is unchanged in shape.
 *
 * Counts are computed from the catalog — never written down. If a number in a
 * pill disagrees with the number in a search placeholder again, it is a bug in
 * exactly one place now.
 *
 * Not a rendered surface — a data + lookup module, so it has no
 * SurfaceViewProps component and registers nothing in SURFACE_VIEWS.
 */

import {
  FILING_CATALOG,
  LEGACY_FILING_ID_ALIASES,
  filingCountBySegment,
  resolveFilingCatalogEntry,
  SEGMENT_METADATA,
  FILING_CATEGORY_METADATA,
  type FilingCatalogEntry,
} from '@shared/regulatory/filing-catalog';

/* -- Types (unchanged public shapes) -- */

export interface RegistrySegmentDef {
  label: string;
  icon: string;
  count: number;
}

export interface RegistryCategoryDef {
  label: string;
  segment: string;
}

export interface RegistryEntry {
  id: string;
  displayName: string;
  agency: string;
  region: string;
  segment: string;
  category: string;
  dossierStandard: string;
  ctdModule: string;
  submissionFormat: string;
  description: string;
  pathwayKey: string | null;
}

export interface RegistryOption {
  value: string;
  label: string;
  segment: string;
  category: string;
  agency: string;
  region: string;
}

/* -- Segments -- counts DERIVED from the catalog -- */

const SEGMENT_ICON: Record<string, string> = {
  pharma_biotech: 'beaker',
  medical_devices: 'stethoscope',
  diagnostics_ivd: 'microscope',
  cross_cutting: 'globe',
};

const segmentCounts = filingCountBySegment();

export const REG_SEGMENTS: Record<string, RegistrySegmentDef> = Object.fromEntries(
  SEGMENT_METADATA.map((s) => [
    s.id,
    { label: s.title, icon: SEGMENT_ICON[s.id] ?? s.iconHint, count: segmentCounts[s.id] ?? 0 },
  ]),
);

/* -- Categories -- the taxonomy's own axis, one source -- */

export const REG_CATEGORIES: Record<string, RegistryCategoryDef> = Object.fromEntries(
  FILING_CATEGORY_METADATA.map((c) => [c.id, { label: c.title, segment: c.segment }]),
);

/* -- Regions & agencies -- derived -- */

export const REG_REGIONS: string[] = [...new Set(FILING_CATALOG.map((e) => e.region))];
export const REG_AGENCIES: string[] = [...new Set(FILING_CATALOG.map((e) => e.agency))];

/* -- The flat registry -- one entry per catalog row -- */

function toRegistryEntry(e: FilingCatalogEntry): RegistryEntry {
  return {
    id: e.id,
    displayName: e.displayName,
    agency: e.agency,
    region: e.region,
    segment: e.segment,
    category: e.category,
    dossierStandard: e.dossierStandard,
    ctdModule: e.ctdModule,
    submissionFormat: e.submissionFormat,
    description: e.description,
    pathwayKey: e.pathwayKey,
  };
}

export const GLOBAL_REGISTRY: RegistryEntry[] = FILING_CATALOG.map(toRegistryEntry);

const REGISTRY_INDEX: Record<string, RegistryEntry> = {};
GLOBAL_REGISTRY.forEach((e) => {
  REGISTRY_INDEX[e.id] = e;
});

/* -- Alias map -- any string a client could throw at us resolves to a canonical
   id. Two layers: short human aliases (IND, 510(k), sNDA, …) and the retired
   mirror's whole id space (LEGACY_FILING_ID_ALIASES), so persisted selections
   from before the unification keep resolving. -- */

const SHORT_ALIASES: Record<string, string> = {
  IND: 'us_ind', ind: 'us_ind', US_IND: 'us_ind',
  NDA: 'us_nda', nda: 'us_nda', US_NDA: 'us_nda',
  BLA: 'us_bla', bla: 'us_bla', US_BLA: 'us_bla',
  MAA: 'eu_maa', maa: 'eu_maa', EU_MAA: 'eu_maa',
  ANDA: 'us_anda', anda: 'us_anda',
  '505(b)(2)': 'us_505b2', '505b2': 'us_505b2',
  '510(k)': 'us_510k', '510k': 'us_510k', FDA_510K: 'us_510k',
  PMA: 'us_pma', pma: 'us_pma', FDA_PMA: 'us_pma',
  'De Novo': 'us_de_novo', denovo: 'us_de_novo', DE_NOVO: 'us_de_novo',
  CER: 'eu_cer', cer: 'eu_cer',
  IDE: 'us_ide', ide: 'us_ide',
  CSR: 'ich_csr', csr: 'ich_csr',
  DMF: 'us_dmf', dmf: 'us_dmf',
  SNDA: 'us_nda_supp', SBLA: 'us_bla_supp',
  BTD: 'us_btd', PRIME: 'eu_prime', RMAT: 'us_rmat',
  DSUR: 'ich_dsur', PSUR: 'eu_psur', PBRER: 'eu_psur',
  REMS: 'us_rems', RMP: 'eu_rmp',
  JP_MKT_APPROVAL: 'jp_mkt_approval', 'J-NDA': 'jp_mkt_approval',
  NDS: 'ca_nds',
};

const REGISTRY_ALIASES: Record<string, string> = {
  ...LEGACY_FILING_ID_ALIASES,
  ...SHORT_ALIASES,
};

/* -- Helper functions (public API unchanged) -- */

/** Ready-made for a grouped picker. */
export function getSubmissionTypeOptions(): RegistryOption[] {
  return GLOBAL_REGISTRY.map((e) => ({
    value: e.id, label: e.displayName, segment: e.segment, category: e.category,
    agency: e.agency, region: e.region,
  }));
}

/** Everything a header/detail panel needs. */
export function getSubmissionTypeContext(id: string): RegistryEntry | null {
  const resolved = REGISTRY_INDEX[id] || REGISTRY_INDEX[REGISTRY_ALIASES[id]];
  if (resolved) return { ...resolved };
  const viaCatalog = resolveFilingCatalogEntry(id);
  return viaCatalog ? toRegistryEntry(viaCatalog) : null;
}

/** All entries for a segment. */
export function getBySegment(segment: string): RegistryEntry[] {
  return GLOBAL_REGISTRY.filter((e) => e.segment === segment);
}

/** All entries for a category. */
export function getByCategory(category: string): RegistryEntry[] {
  return GLOBAL_REGISTRY.filter((e) => e.category === category);
}

/** Resolve any alias/string to a canonical id (pure, deterministic, no DB). */
export function resolveSubmissionType(input?: string | null): string | null {
  if (!input) return null;
  if (REGISTRY_INDEX[input]) return input;
  if (REGISTRY_ALIASES[input]) return REGISTRY_ALIASES[input];
  const viaCatalog = resolveFilingCatalogEntry(input);
  if (viaCatalog) return viaCatalog.id;
  const lower = input.toLowerCase().replace(/[_\s-]+/g, '');
  const found = GLOBAL_REGISTRY.find(
    (e) => e.id.replace(/_/g, '') === lower || e.displayName.toLowerCase().replace(/[_\s-]+/g, '').includes(lower),
  );
  return found ? found.id : null;
}

/* -- Window bridge -- AnaVerbs.tsx's RegistryPicker and EditorAnaCopilot.tsx's
   pathway lookup already read these off window; this keeps that contract
   alive until/unless those callers switch to importing this module directly. -- */
(window as any).GLOBAL_REGISTRY = GLOBAL_REGISTRY;
(window as any).REG_SEGMENTS = REG_SEGMENTS;
(window as any).REG_CATEGORIES = REG_CATEGORIES;
(window as any).REG_REGIONS = REG_REGIONS;
(window as any).REG_AGENCIES = REG_AGENCIES;
(window as any).getSubmissionTypeOptions = getSubmissionTypeOptions;
(window as any).getSubmissionTypeContext = getSubmissionTypeContext;
(window as any).getBySegment = getBySegment;
(window as any).getByCategory = getByCategory;
(window as any).resolveSubmissionType = resolveSubmissionType;
