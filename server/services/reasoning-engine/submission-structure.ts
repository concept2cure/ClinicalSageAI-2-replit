/**
 * Reasoning Engine — submission structure helper (WO-5 integration)
 *
 * Maps a planner's free-text region / application-type inputs to the deterministic
 * CTD structure (required sections + review clock per region) via the reasoning
 * engine. This is the grounding the LLM planner narrates ON TOP of — the
 * structure is resolved deterministically here, never invented by the model.
 *
 * Pure and fail-safe: unknown regions / application types are reported as
 * `supported: false` with a note (never fabricated).
 */

import { resolve } from './resolve.js';
import type { ApplicationType, Region, RequiredSection, ReviewClock } from './types.js';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge.js';

const REGION_ALIASES: Record<string, Region> = {
  fda: 'fda', us: 'fda', usa: 'fda', 'united states': 'fda',
  eu: 'eu', ema: 'eu', europe: 'eu', 'european union': 'eu',
  jp: 'jp', japan: 'jp', pmda: 'jp', mhlw: 'jp',
  // International regions → nearest CTD-compatible reasoning-engine region
  ca: 'fda', canada: 'fda', 'health canada': 'fda',
  uk: 'eu', mhra: 'eu', 'united kingdom': 'eu',
  cn: 'fda', china: 'fda', nmpa: 'fda',
  au: 'fda', australia: 'fda', tga: 'fda',
  ch: 'eu', switzerland: 'eu', swissmedic: 'eu',
  br: 'fda', brazil: 'fda', anvisa: 'fda',
  in: 'fda', india: 'fda', cdsco: 'fda',
  kr: 'fda', korea: 'fda', mfds: 'fda',
  sg: 'fda', singapore: 'fda', hsa: 'fda',
  ich: 'fda',
};

const APPTYPE_ALIASES: Record<string, ApplicationType> = {
  ind: 'ind', nda: 'nda', bla: 'bla', maa: 'maa', cta: 'cta', anda: 'anda',
  '510k': '510k', '510(k)': '510k', denovo: '510k', pma: 'pma',
  // Extended aliases
  '505b2': 'nda', 'snda': 'nda', 'nda_supplement': 'nda',
  'sbla': 'bla', 'bla_supplement': 'bla',
  'pre_ind': 'ind', 'pre-ind': 'ind',
  'ide': 'pma', 'hde': 'pma',
  'de_novo': '510k',
  'nds': 'nda', 'snds': 'nda', 'ands': 'anda',
  'jnda': 'nda',
  'dmf': 'nda', 'rems': 'nda',
  'eua': 'nda',
  'cer': 'pma', 'mdr_td': 'pma', 'ivdr_td': 'pma',
  'ectd': 'nda', 'ctd': 'nda',
};

// Maps registry region codes to the nearest reasoning-engine Region
const REGISTRY_REGION_TO_ENGINE: Record<string, Region> = {
  US: 'fda', EU: 'eu', JP: 'jp',
  CA: 'fda', UK: 'eu', CN: 'fda', AU: 'fda',
  CH: 'eu', BR: 'fda', IN: 'fda', KR: 'fda', SG: 'fda', ICH: 'fda',
};

// Maps registry applicationFamily to the nearest reasoning-engine ApplicationType
const FAMILY_TO_APPTYPE: Record<string, ApplicationType> = {
  clinical_trial: 'ind',
  marketing_authorization: 'nda',
  supplement: 'nda',
  variation: 'nda',
  renewal: 'nda',
  master_file: 'nda',
  pediatric: 'ind',
  orphan: 'ind',
  safety_report: 'nda',
  pre_submission: 'ind',
  device_clearance: '510k',
  device_approval: 'pma',
  designation: 'ind',
  quality_cmc: 'nda',
  quality_system: 'nda',
  post_market: 'nda',
  software_documentation: '510k',
  companion_diagnostic: 'pma',
  clinical_document: 'nda',
  dossier_module: 'nda',
};

export function normalizeRegion(raw: string): Region | null {
  const direct = REGION_ALIASES[raw.trim().toLowerCase()];
  if (direct) return direct;
  // Try resolving as a registry ID (e.g. 'US_IND' → region 'US' → 'fda')
  const entry = resolveToRegistryEntry(raw);
  if (entry) return REGISTRY_REGION_TO_ENGINE[entry.region] ?? null;
  return null;
}

export function normalizeApplicationType(raw: string): ApplicationType | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  const direct = APPTYPE_ALIASES[key];
  if (direct) return direct;
  // Try resolving as a registry ID (e.g. 'CA_NDS' → applicationFamily 'marketing_authorization' → 'nda')
  const entry = resolveToRegistryEntry(raw);
  if (entry) {
    // First try the applicationType directly
    const appKey = entry.applicationType.toLowerCase().replace(/\s+/g, '');
    if (APPTYPE_ALIASES[appKey]) return APPTYPE_ALIASES[appKey];
    // Fall back to applicationFamily mapping
    return FAMILY_TO_APPTYPE[entry.applicationFamily] ?? null;
  }
  return null;
}

/**
 * Resolve any submission type string (registry ID, legacy type, alias) to
 * the reasoning engine's (region, applicationType) pair. Uses the canonical
 * bridge for resolution, then maps to the nearest supported engine params.
 */
export function resolveToReasoningParams(submissionType: string): { region: Region; applicationType: ApplicationType } | null {
  const entry = resolveToRegistryEntry(submissionType);
  if (!entry) return null;
  const region = REGISTRY_REGION_TO_ENGINE[entry.region];
  if (!region) return null;
  const appKey = entry.applicationType.toLowerCase().replace(/\s+/g, '');
  const applicationType = APPTYPE_ALIASES[appKey] ?? FAMILY_TO_APPTYPE[entry.applicationFamily];
  if (!applicationType) return null;
  return { region, applicationType };
}

export interface RegionStructure {
  region: string;
  supported: boolean;
  requiredSections?: RequiredSection[];
  reviewClock?: ReviewClock;
  note?: string;
}

export interface SubmissionStructure {
  applicationType: string;
  resolver: 'reasoning-engine';
  profileVersion: string;
  regions: RegionStructure[];
}

/**
 * Build the deterministic per-region structure for a planned submission. Skips
 * (does not fabricate) regions/application types the rule data does not cover.
 */
export function buildSubmissionStructure(regions: string[], applicationType: string): SubmissionStructure {
  const appType = normalizeApplicationType(applicationType);
  const out: RegionStructure[] = [];
  let profileVersion = '';

  for (const raw of regions) {
    const region = normalizeRegion(raw);
    if (!region || !appType) {
      out.push({
        region: raw,
        supported: false,
        note: !region
          ? `Region "${raw}" is not in the reasoning-engine rule data.`
          : `Application type "${applicationType}" is not in the reasoning-engine rule data.`,
      });
      continue;
    }
    const sections = resolve<RequiredSection[]>({ task: 'required-sections', region, applicationType: appType });
    const clock = resolve<ReviewClock>({ task: 'review-clock', region, applicationType: appType });
    profileVersion = sections.profileVersion;
    out.push({
      region,
      supported: true,
      requiredSections: sections.data,
      reviewClock: clock.data,
    });
  }

  return {
    applicationType,
    resolver: 'reasoning-engine',
    profileVersion,
    regions: out,
  };
}
