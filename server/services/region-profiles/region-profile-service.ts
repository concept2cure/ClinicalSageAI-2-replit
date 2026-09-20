/**
 * Region profile aggregator (spec §8.3 — GET /api/region-profiles)
 *
 * The UI's Planner, Builder, Validation, and Cross-Region workspaces all need
 * region metadata (Module 1 structure, regional forms, pathways, rule-pack size).
 * That metadata already exists but is split across three sources:
 *   - regional-ctd-templates.ts   (Module 1 sections + forms per agency)
 *   - ectd-regional-rules.ts       (the regional validation rule pack)
 *   - shared/regulatory/region-profiles.ts (region↔agency registry)
 *
 * This composes them into ONE typed `SubmissionRegionProfile` per submission
 * region (fda|eu|jp|cn|kr), so the UI fetches a single shape instead of stitching.
 *
 * PURE + DETERMINISTIC: a projection over static data — no DB, no network.
 *
 * @module server/services/region-profiles/region-profile-service
 */

import {
  getRegionalTemplate,
  type CTDSection,
  type FormTemplate,
} from '../regional-ctd-templates';
import { REGIONAL_RULES } from '../ectd/ectd-regional-rules';

/**
 * The regions this module carries a PROFILE for — five of the platform's
 * thirteen. Named for that, not for "a submission region":
 * module3-regional-readiness.ts owns the wider set (every canonical region plus
 * GLOBAL), and one exported noun meaning both is how a reader greps the name
 * and lands in the module that does not answer their question
 * (`ci:duplicate-exported-types`).
 */
export type ProfiledRegion = 'fda' | 'eu' | 'jp' | 'cn' | 'kr';

/**
 * UI-facing projection of a single regional validation rule. The full
 * RegionalRule carries an internal `region` token that the profile already
 * conveys, so it is dropped here; everything else the UI needs to render the
 * rule list is exposed.
 */
export interface RegionalRuleSummary {
  id: string;
  severity: string;
  citation: string;
  description: string;
}

export interface SubmissionRegionProfile {
  region: ProfiledRegion;
  agency: string; // FDA | EMA | PMDA | NMPA | MFDS
  language: string;
  currency: string;
  /** Pathways available for this region (drives the PathwayBadge / selector). */
  pathways: string[];
  module1Sections: CTDSection[];
  forms: FormTemplate[];
  specificRequirements: string[];
  /** The codified validation rules for this region's rule pack. */
  validationRules: RegionalRuleSummary[];
  /** Count of codified validation rules (== validationRules.length). */
  validationRuleCount: number;
}

// region → the agency template key + the rule-pack region tokens to match.
const REGION_MAP: Record<ProfiledRegion, { agency: string; ruleTokens: string[]; pathways: string[] }> = {
  fda: { agency: 'FDA', ruleTokens: ['US', 'FDA'], pathways: ['ectd_v322', 'ectd_v40', 'estar'] },
  eu: { agency: 'EMA', ruleTokens: ['EU', 'EMA'], pathways: ['ectd_v322', 'mdr', 'ivdr', 'ctis'] },
  jp: { agency: 'PMDA', ruleTokens: ['JP', 'PMDA'], pathways: ['ectd_v322'] },
  cn: { agency: 'NMPA', ruleTokens: ['CN', 'NMPA'], pathways: ['ectd_v322'] },
  kr: { agency: 'MFDS', ruleTokens: ['KR', 'MFDS'], pathways: ['ectd_v322'] },
};

function rulesFor(tokens: string[]): RegionalRuleSummary[] {
  const set = new Set(tokens.map((t) => t.toUpperCase()));
  return REGIONAL_RULES.filter((r) => set.has(String(r.region).toUpperCase())).map((r) => ({
    id: r.id,
    severity: r.severity,
    citation: r.citation,
    description: r.description,
  }));
}

/** Build the unified profile for one submission region, or null if unknown. */
export function getSubmissionRegionProfile(region: string): SubmissionRegionProfile | null {
  const map = REGION_MAP[region.toLowerCase() as ProfiledRegion];
  if (!map) return null;
  const template = getRegionalTemplate(map.agency);
  if (!template) return null;
  const validationRules = rulesFor(map.ruleTokens);
  return {
    region: region.toLowerCase() as ProfiledRegion,
    agency: template.agency,
    language: template.language,
    currency: template.currency,
    pathways: map.pathways,
    module1Sections: template.module1Sections,
    forms: template.forms,
    specificRequirements: template.specificRequirements,
    validationRules,
    validationRuleCount: validationRules.length,
  };
}

/** All submission region profiles (fda, eu, jp, cn, kr), in canonical order. */
export function getAllSubmissionRegionProfiles(): SubmissionRegionProfile[] {
  return (['fda', 'eu', 'jp', 'cn', 'kr'] as ProfiledRegion[])
    .map((r) => getSubmissionRegionProfile(r))
    .filter((p): p is SubmissionRegionProfile => p !== null);
}

export default { getSubmissionRegionProfile, getAllSubmissionRegionProfiles };
