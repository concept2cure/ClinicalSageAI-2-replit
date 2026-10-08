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
import {
  REGIONAL_MODULE1,
  requiredModule1,
  type ApplicationKind,
  type ModeledJurisdiction,
} from '../../../shared/regulatory/regional-module1';
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';

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

/**
 * The Module 1 section codes a submission of this application type must carry,
 * flattened from a region profile.
 *
 * ONE implementation, because there were two and they disagreed. A section that
 * declares `requiredFor` is required only for those application types — a
 * debarment certification for a marketing application, the general
 * investigational plan for an IND — and when the application type is unknown
 * every required section is kept, which is the conservative direction.
 *
 * `assess-dispatch-readiness.requiredModule1Codes` (the gate that blocks freeze
 * and transmit) had this walk; `ectd4-validator` had a hand-written literal set
 * instead, whose comments described the EU/legacy CTD layout while its codes
 * were read as FDA ones. That set demanded 1.5 of an IND as a "Table of
 * Contents" when FDA 1.5 is Application Status, 1.6 as the general
 * investigational plan when 1.6 is Meetings and the plan lives at 1.20, 1.9 as
 * an environmental assessment when 1.9 is Pediatric Administrative Information
 * and the analysis lives at 1.12.14, and 1.7 as the Investigator's Brochure
 * when the FDA profile has no 1.7 at all and the brochure lives at 1.14.4.1.
 * Both callers now read the profile, so neither can drift from it alone.
 */
export function requiredModule1CodesForRegion(
  region: string,
  applicationType?: string | null,
): string[] {
  const profile = getSubmissionRegionProfile(region);
  if (!profile) return [];
  const app = applicationType ? String(applicationType).toLowerCase() : null;
  const out: string[] = [];
  const walk = (sections: typeof profile.module1Sections): void => {
    for (const s of sections) {
      const applies = !s.requiredFor || !app || s.requiredFor.includes(app);
      if (s.required && applies) out.push(s.number);
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(profile.module1Sections);
  return out;
}

/**
 * The Module 1 headings the REGULATION requires in an application of this kind
 * in this region — the regional Module 1 record's own answer
 * (`requiredModule1`: always required for the kind; a heading excluded for the
 * kind takes its subtree with it) — or null when the record does not model the
 * pair (a region outside US/EU/JP, an application kind its tree does not
 * cover, or no application type at all). Null is "not established", never
 * "nothing required": the caller keeps the profile list as information.
 *
 * For the modelled pairs this is the same set `requiredModule1CodesForRegion`
 * walks out of the profile (the profile is a projection of the record); what
 * it adds is the determination that the record makes the claim for this kind.
 * QA 2026-10-08 (j7): the dispatch gate reported a one-leaf original IND
 * "structural gate satisfied" with Form 1571, the Investigator's Brochure and
 * the general investigational plan missing, because no caller could tell a
 * requirement the record makes from a list it merely carries.
 */
export function regulationRequiredModule1(
  region: string,
  applicationType?: string | null,
): { codes: string[]; jurisdiction: ModeledJurisdiction; kind: ApplicationKind } | null {
  const canonical = canonicalRegionOf(region);
  if (canonical !== 'US' && canonical !== 'EU' && canonical !== 'JP') return null;
  const kind = applicationType ? (String(applicationType).toLowerCase() as ApplicationKind) : null;
  if (!kind || !REGIONAL_MODULE1[canonical].kinds.includes(kind)) return null;
  // The leaf-most claims: a required heading whose required sub-heading is in
  // the set is satisfied only through it, so it is not a second finding
  // (1.14 and 1.14.4 for an IND are the IB and the investigational labeling).
  const required = requiredModule1(canonical, kind).required;
  const codes = required.filter((code) => !required.some((other) => other.startsWith(`${code}.`)));
  return { codes, jurisdiction: canonical, kind };
}

/** All submission region profiles (fda, eu, jp, cn, kr), in canonical order. */
export function getAllSubmissionRegionProfiles(): SubmissionRegionProfile[] {
  return (['fda', 'eu', 'jp', 'cn', 'kr'] as ProfiledRegion[])
    .map((r) => getSubmissionRegionProfile(r))
    .filter((p): p is SubmissionRegionProfile => p !== null);
}

export default { getSubmissionRegionProfile, getAllSubmissionRegionProfiles };
