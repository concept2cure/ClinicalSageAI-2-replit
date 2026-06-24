/**
 * Submission Type Bridge — Canonical resolution layer for submission types.
 *
 * Every service in the platform that works with submission types should import
 * from this module rather than defining its own `SubmissionType` enum. The
 * bridge resolves ANY known submission-type string — legacy uppercase ('IND'),
 * legacy lowercase ('ind'), prefixed registry IDs ('US_IND'), aliases
 * ('FDA_510K', '510(k)'), and more — to a canonical `RegulatoryApplicationType`
 * registry entry.
 *
 * Design:
 *   - PURE + DETERMINISTIC — no DB, no network, no LLM.
 *   - Case-insensitive resolution via a normalized alias map.
 *   - Backward compatible — existing string literals keep working.
 *   - Forward compatible — new registry entries are available immediately.
 *
 * @module shared/regulatory/submission-type-bridge
 */

import {
  LEGACY_TO_REGISTRY_ID,
  type LegacySubmissionType,
  type RegulatoryApplicationType,
  type Region,
  type Agency,
  type ApplicationFamily,
  type Segment,
  type FilingCategory,
  type DossierStandard,
} from './document-taxonomy.js';
import {
  GLOBAL_REGISTRY,
  getApplicationType,
  getBySegment,
  getByCategory,
} from './global-document-registry.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type { LegacySubmissionType, RegulatoryApplicationType, Region, Agency, Segment, FilingCategory };
export { LEGACY_TO_REGISTRY_ID, GLOBAL_REGISTRY, getApplicationType, getBySegment, getByCategory };

// ─── Comprehensive Alias Map ─────────────────────────────────────────────────
// Normalized to UPPERCASE keys for case-insensitive lookup.
// This is the SINGLE source of truth for all submission type string resolution.

const ALIAS_MAP: Record<string, string> = buildAliasMap();

function buildAliasMap(): Record<string, string> {
  const map: Record<string, string> = {};

  // 1) Legacy types from document-taxonomy
  for (const [legacy, regId] of Object.entries(LEGACY_TO_REGISTRY_ID)) {
    map[legacy.toUpperCase()] = regId;
  }

  // 2) Every registry ID maps to itself
  for (const entry of GLOBAL_REGISTRY) {
    map[entry.id.toUpperCase()] = entry.id;
  }

  // 3) Every applicationType maps to its registry ID (e.g. 'IND' → 'US_IND')
  //    Only set if not already taken (first active entry wins).
  for (const entry of GLOBAL_REGISTRY) {
    if (entry.active) {
      const key = entry.applicationType.toUpperCase();
      if (!map[key]) map[key] = entry.id;
    }
  }

  // 4) Synonym resolution
  for (const entry of GLOBAL_REGISTRY) {
    if (entry.active) {
      for (const syn of entry.synonyms) {
        const key = syn.toUpperCase().replace(/[^A-Z0-9_]/g, '');
        if (key && !map[key]) map[key] = entry.id;
      }
    }
  }

  // 5) Manually curated aliases for common variations
  const curated: Record<string, string> = {
    'FDA_510K': 'US_510K',
    '510K': 'US_510K',
    '510(K)': 'US_510K',
    'PRE_IND': 'US_PRE_IND',
    'PRE-IND': 'US_PRE_IND',
    'SNDA': 'US_NDA_SUPP',
    'NDA_SUPPLEMENT': 'US_NDA_SUPP',
    'SBLA': 'US_BLA_SUPP',
    'BLA_SUPPLEMENT': 'US_BLA_SUPP',
    '505B2': 'US_505B2',
    '505(B)(2)': 'US_505B2',
    'DMF': 'US_DMF',
    'REMS': 'US_REMS',
    'BTD': 'US_BTD',
    'FTD': 'US_FTD',
    'DENOVO': 'US_DE_NOVO',
    'DE_NOVO': 'US_DE_NOVO',
    'NDS': 'CA_NDS',
    'SNDS': 'CA_SNDS',
    'ANDS': 'CA_ANDS',
    'JNDA': 'JP_MKT_APPROVAL',
    'JP_MAA': 'JP_MKT_APPROVAL',
    'MDR_TD': 'EU_MDR_TECHDOC',
    'IVDR_TD': 'EU_IVDR_TECHDOC',
    'CTD': 'ICH_CTD_M1',
    'ECTD': 'ICH_CTD_M1',
    'IDE': 'US_IDE',
    'HDE': 'US_HDE',
    'CER': 'EU_CER',
    'CTA': 'EU_CTA',
    'UK_CTA': 'UK_CTA',
    'CN_CTA': 'CN_CTA',
    'AU_CTN': 'AU_CTN',
    'AU_CTA': 'AU_CTA',
    'CH_CTA': 'CH_CTA',
    'CH_MA': 'CH_MA',
    'BR_DDCM': 'BR_DDCM',
    'IN_CT04': 'IN_CT04',
    'KR_IND': 'KR_IND',
    'SG_NDA': 'SG_NDA',
    'PMA-S': 'US_PMA_SUPP',
    'PSUR': 'ICH_PSUR',
    'PBRER': 'ICH_PBRER',
    'DSUR': 'ICH_DSUR',
    'ICSR': 'ICH_ICSR',
    'IND-AMEND': 'US_IND_AMENDMENT',
    'CTD-CTA': 'EU_CTA',
    'EUDAMED': 'EU_MDR_TECHDOC',
  };
  for (const [alias, regId] of Object.entries(curated)) {
    const key = alias.toUpperCase();
    if (!map[key]) map[key] = regId;
  }

  return map;
}

// ─── Resolution Functions ────────────────────────────────────────────────────

/**
 * Resolve ANY submission-type string to a canonical registry ID.
 * Case-insensitive. Returns null if unrecognized.
 */
export function resolveToRegistryId(input: string): string | null {
  if (!input) return null;
  const key = input.toUpperCase().trim();
  return ALIAS_MAP[key] ?? null;
}

/**
 * Resolve ANY submission-type string to the full registry entry.
 * Case-insensitive. Returns null if unrecognized.
 */
export function resolveToRegistryEntry(input: string): RegulatoryApplicationType | null {
  const id = resolveToRegistryId(input);
  if (!id) return null;
  return getApplicationType(id) ?? null;
}

/**
 * Get a human-readable label for any submission type string.
 * Falls back to the input string if unresolved.
 */
export function getSubmissionTypeLabel(input: string): string {
  const entry = resolveToRegistryEntry(input);
  return entry?.displayName ?? input;
}

/**
 * Check if a string resolves to a known submission type.
 */
export function isKnownSubmissionType(input: string): boolean {
  return resolveToRegistryId(input) !== null;
}

// ─── Context Extraction ──────────────────────────────────────────────────────

export interface SubmissionTypeContext {
  registryId: string;
  displayName: string;
  region: Region;
  agency: Agency;
  segment?: Segment;
  category?: FilingCategory;
  description?: string;
  dossierStandard: DossierStandard;
  applicationFamily: ApplicationFamily;
  submissionFormat?: string;
  ctdModule?: string;
}

/**
 * Extract structured context for a submission type — useful for prompt
 * generation, instruction building, and UI display.
 */
export function getSubmissionTypeContext(input: string): SubmissionTypeContext | null {
  const entry = resolveToRegistryEntry(input);
  if (!entry) return null;
  return {
    registryId: entry.id,
    displayName: entry.displayName,
    region: entry.region,
    agency: entry.agency,
    segment: entry.segment,
    category: entry.category,
    description: entry.description,
    dossierStandard: entry.dossierStandard,
    applicationFamily: entry.applicationFamily,
    submissionFormat: entry.submissionFormat,
    ctdModule: entry.ctdModule,
  };
}

// ─── Catalog Functions ───────────────────────────────────────────────────────

/**
 * All active registry entries.
 */
export function getAllActiveSubmissionTypes(): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.active);
}

/**
 * All known alias strings and the registry IDs they resolve to.
 */
export function getAllAliases(): { alias: string; registryId: string }[] {
  return Object.entries(ALIAS_MAP).map(([alias, registryId]) => ({ alias, registryId }));
}

/**
 * Generate submission type options for a UI dropdown.
 * Groups by segment when segment data is available.
 */
export function getSubmissionTypeOptions(): { value: string; label: string; segment?: Segment; category?: FilingCategory }[] {
  return getAllActiveSubmissionTypes().map(e => ({
    value: e.id,
    label: e.displayName,
    segment: e.segment,
    category: e.category,
  }));
}

// ─── Service-Oriented Types ──────────────────────────────────────────────────
// These narrow unions exist for backward compatibility with services that only
// handle a subset of submission types. Each is a strict subset of registry IDs.
// Services should migrate toward accepting any registry ID and falling back to
// a generic handler for unknown types.

/** Upper-case legacy types used by compliance, artifact, and proof services. */
export type LegacyUpperType = '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA';

/** Lower-case legacy types used by market-specs and ana-ri services. */
export type LegacyLowerType = '510k' | 'ind' | 'nda' | 'bla' | 'pma' | 'maa' | 'de_novo' | 'cta' | 'jnda' | 'mdr_td' | 'ivdr_td' | 'anda' | 'cer' | 'ectd' | 'general';

/** FDA device types (lower-case) used by the fda-integration module. */
export type FdaDeviceType = '510k' | 'pma' | 'denovo' | 'ide';

/** Pyramid engine types (upper-case). */
export type PyramidType = '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'JNDA' | 'DE_NOVO';

/** Pattern registry types (mixed case). */
export type PatternSubmissionType = 'NDA' | 'BLA' | '510k' | 'PMA' | 'ANDA' | 'IND' | 'MAA' | 'CTD' | 'any';

/** Reasoning engine application types (lower-case). */
export type ReasoningApplicationType = 'ind' | 'nda' | 'bla' | 'maa' | 'cta' | 'anda' | '510k' | 'pma';

/** Deficiency taxonomy types (lower-case) — the subset that the deficiency/intelligence services handle. */
export type DeficiencySubmissionType = 'ind' | 'nda' | 'bla' | '510k' | 'pma' | 'de_novo' | 'cer' | 'ectd' | 'general';

// ─── Intelligence Resolution ─────────────────────────────────────────────────
// Maps any registry entry to the nearest deficiency-taxonomy-compatible type
// so that regulatory intelligence (deficiency patterns, reviewer triggers,
// risk signals) activates for ALL 158+ filing types, not just the 9 legacy ones.

const FAMILY_TO_DEFICIENCY: Record<string, DeficiencySubmissionType> = {
  clinical_trial: 'ind',
  marketing_authorization: 'nda',
  supplement: 'nda',
  variation: 'nda',
  renewal: 'nda',
  master_file: 'ectd',
  pediatric: 'ind',
  orphan: 'ind',
  safety_report: 'general',
  pre_submission: 'general',
  device_clearance: '510k',
  device_approval: 'pma',
  designation: 'general',
  quality_cmc: 'ectd',
  quality_system: 'general',
  post_market: 'general',
  software_documentation: '510k',
  companion_diagnostic: 'pma',
  clinical_document: 'ectd',
  dossier_module: 'ectd',
};

const SEGMENT_TO_DEFICIENCY: Record<string, DeficiencySubmissionType> = {
  pharma_biotech: 'nda',
  medical_devices: '510k',
  diagnostics_ivd: 'pma',
  cross_cutting: 'ectd',
};

const REGISTRY_ID_TO_DEFICIENCY: Record<string, DeficiencySubmissionType> = {
  US_IND: 'ind',
  US_NDA: 'nda',
  US_BLA: 'bla',
  US_510K: '510k',
  US_PMA: 'pma',
  US_DE_NOVO: 'de_novo',
  US_EUA: 'general',
  EU_MAA: 'nda',
  EU_CTA: 'ind',
  EU_CER: 'cer',
  EU_MDR_TECHDOC: 'cer',
  EU_IVDR_TECHDOC: 'cer',
  UK_CTA: 'ind',
  UK_MA: 'nda',
  CA_NDS: 'nda',
  CA_CTA: 'ind',
  JP_CTN: 'ind',
  JP_MKT_APPROVAL: 'nda',
  CN_CTA: 'ind',
  CN_NDA: 'nda',
  CN_MAA: 'nda',
  AU_CTN: 'ind',
  AU_CTA: 'ind',
  AU_REG: 'nda',
  CH_CTA: 'ind',
  CH_MA: 'nda',
  BR_DDCM: 'ind',
  BR_REG: 'nda',
  IN_CT04: 'ind',
  IN_NDA: 'nda',
  KR_IND: 'ind',
  KR_NDA: 'nda',
  SG_NDA: 'nda',
  SG_CTA: 'ind',
};

/**
 * Resolve ANY submission type string to a deficiency-taxonomy-compatible type.
 * This ensures the intelligence services (deficiency patterns, reviewer
 * triggers, risk scoring) activate for ALL filing types, including
 * international ones like EU_MAA, CA_NDS, JP_MKT_APPROVAL, etc.
 *
 * Resolution cascade:
 *   1. Direct deficiency type (e.g. 'ind', '510k') → pass through
 *   2. Registry ID explicit mapping (e.g. 'EU_MAA' → 'nda')
 *   3. Resolve via bridge → use application family mapping
 *   4. Resolve via bridge → use segment mapping
 *   5. Fallback → 'general'
 */
export function resolveToDeficiencyType(input: string): DeficiencySubmissionType {
  if (!input) return 'general';

  const lower = input.toLowerCase().trim();

  // 1. Already a deficiency type?
  const DEFICIENCY_TYPES: DeficiencySubmissionType[] = ['ind', 'nda', 'bla', '510k', 'pma', 'de_novo', 'cer', 'ectd', 'general'];
  if (DEFICIENCY_TYPES.includes(lower as DeficiencySubmissionType)) {
    return lower as DeficiencySubmissionType;
  }

  // 2. Resolve to registry ID first
  const registryId = resolveToRegistryId(input);
  if (registryId) {
    // Check explicit mapping
    if (REGISTRY_ID_TO_DEFICIENCY[registryId]) {
      return REGISTRY_ID_TO_DEFICIENCY[registryId];
    }

    // 3. Resolve via application family
    const entry = getApplicationType(registryId);
    if (entry) {
      const familyMatch = FAMILY_TO_DEFICIENCY[entry.applicationFamily];
      if (familyMatch) return familyMatch;

      // 4. Resolve via segment
      if (entry.segment) {
        const segMatch = SEGMENT_TO_DEFICIENCY[entry.segment];
        if (segMatch) return segMatch;
      }
    }
  }

  // 5. Fallback
  return 'general';
}
