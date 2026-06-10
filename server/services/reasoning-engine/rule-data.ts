/**
 * Reasoning Engine — versioned CTD rule data (WO-5)
 *
 * Deterministic, citable rule data the rules-resolver reasons over. Encoded as
 * typed constants (the work order's `ctd_section_profiles` / `regional_forms`
 * as versioned data); a DB seed can materialise these later without changing the
 * resolver. Modules 2–5 follow ICH M4 (CTD) and are common across regions;
 * Module 1 is regional.
 *
 * Accurate as of 2026-06. PROFILE_VERSION bumps on any change.
 */

import type { ApplicationType, Region, RequiredSection, ReviewClock } from './types.js';

export const PROFILE_VERSION = '2026-06-01';

/** ICH M4 common modules (2–5). Required for every full marketing application. */
const ICH_COMMON: RequiredSection[] = [
  { sectionCode: '2.3', title: 'Quality Overall Summary (QOS)', module: 2, required: true, regional: false, granularityRule: 'one-per-application' },
  { sectionCode: '2.4', title: 'Nonclinical Overview', module: 2, required: true, regional: false, granularityRule: 'one-per-application' },
  { sectionCode: '2.5', title: 'Clinical Overview', module: 2, required: true, regional: false, granularityRule: 'one-per-application' },
  { sectionCode: '2.6', title: 'Nonclinical Written and Tabulated Summaries', module: 2, required: true, regional: false, granularityRule: 'one-per-study-type' },
  { sectionCode: '2.7', title: 'Clinical Summary', module: 2, required: true, regional: false, granularityRule: 'one-per-subsection' },
  { sectionCode: '3', title: 'Module 3 — Quality', module: 3, required: true, regional: false, granularityRule: 'one-per-substance-and-product' },
  { sectionCode: '4', title: 'Module 4 — Nonclinical Study Reports', module: 4, required: true, regional: false, granularityRule: 'one-per-study' },
  { sectionCode: '5', title: 'Module 5 — Clinical Study Reports', module: 5, required: true, regional: false, granularityRule: 'one-per-study' },
];

/** For an investigational application (IND/CTA) Module 4/5 are partial. */
const ICH_COMMON_INVESTIGATIONAL: RequiredSection[] = ICH_COMMON.map(s =>
  s.sectionCode === '2.5' || s.sectionCode === '2.7'
    ? { ...s, required: false } // clinical summaries not yet expected at IND
    : s
);

/** Region-specific Module 1 (administrative + product information + forms). */
const M1_FDA: RequiredSection[] = [
  { sectionCode: '1.1', title: 'Forms (FDA 1571 for IND / FDA 356h for NDA/BLA)', module: 1, required: true, regional: true, granularityRule: 'region-form' },
  { sectionCode: '1.2', title: 'Cover Letter', module: 1, required: true, regional: true, granularityRule: 'one-per-sequence' },
  { sectionCode: '1.3', title: 'Administrative Information (1.3.1 contact/sponsor; 1.3.4 financial certification)', module: 1, required: true, regional: true, granularityRule: 'region-section' },
  { sectionCode: '1.14', title: 'Labeling', module: 1, required: false, regional: true, granularityRule: 'region-section' },
];

const M1_EU: RequiredSection[] = [
  { sectionCode: '1.0', title: 'Cover Letter', module: 1, required: true, regional: true, granularityRule: 'one-per-sequence' },
  { sectionCode: '1.2', title: 'EU Application Form', module: 1, required: true, regional: true, granularityRule: 'region-form' },
  { sectionCode: '1.3', title: 'Product Information (SmPC, labelling, package leaflet)', module: 1, required: true, regional: true, granularityRule: 'region-section' },
  { sectionCode: '1.8.2', title: 'Risk Management Plan (RMP)', module: 1, required: true, regional: true, granularityRule: 'region-section' },
];

const M1_JP: RequiredSection[] = [
  { sectionCode: '1.1', title: 'Approval Application Form (Japan)', module: 1, required: true, regional: true, granularityRule: 'region-form' },
  { sectionCode: '1.2', title: 'Certificates', module: 1, required: true, regional: true, granularityRule: 'region-section' },
  { sectionCode: '1.5', title: 'Package Insert (draft)', module: 1, required: true, regional: true, granularityRule: 'region-section' },
];

function module1(region: Region): RequiredSection[] {
  return region === 'fda' ? M1_FDA : region === 'eu' ? M1_EU : M1_JP;
}

const INVESTIGATIONAL: ApplicationType[] = ['ind', 'cta'];

/** Required-section profile for a region + application type. */
export function requiredSections(region: Region, applicationType: ApplicationType): RequiredSection[] {
  const investigational = INVESTIGATIONAL.includes(applicationType);
  const common = investigational ? ICH_COMMON_INVESTIGATIONAL : ICH_COMMON;
  return [...module1(region), ...common];
}

/**
 * CTD dependency map: a section's prerequisite sections (the QOS/overviews
 * summarise the data modules, so they depend on them).
 */
const DEPENDENCIES: Record<string, string[]> = {
  '2.3': ['3'],
  '2.4': ['4'],
  '2.5': ['4', '5'],
  '2.6': ['4'],
  '2.7': ['5'],
};

export function ctdDependencies(sectionCode: string): string[] {
  return DEPENDENCIES[sectionCode] ?? [];
}

/** Review-clock models per region + application type. */
export function reviewClock(region: Region, applicationType: ApplicationType): ReviewClock {
  if (region === 'fda') {
    if (applicationType === 'ind' || applicationType === 'cta') {
      return { region, applicationType, model: 'IND safety review', nominalDays: 30, clockStops: false, basis: '21 CFR 312.40 (30-day safe-to-proceed)' };
    }
    if (applicationType === '510k') {
      return { region, applicationType, model: '510(k)', nominalDays: 90, clockStops: true, basis: 'FDA 510(k) MDUFA review goal' };
    }
    if (applicationType === 'pma') {
      return { region, applicationType, model: 'PMA', nominalDays: 180, clockStops: true, basis: 'FDA PMA MDUFA review goal' };
    }
    // NDA / BLA / ANDA → PDUFA
    return { region, applicationType, model: 'PDUFA', nominalDays: 300, clockStops: false, basis: 'PDUFA review goal (10 months standard / 6 months priority from filing)' };
  }
  if (region === 'eu') {
    if (applicationType === 'cta') {
      return { region, applicationType, model: 'EU CTR (CTIS)', nominalDays: 60, clockStops: true, basis: 'Regulation (EU) 536/2014 assessment timeline' };
    }
    // MAA centralised
    return { region, applicationType, model: 'EU centralised', nominalDays: 210, clockStops: true, basis: 'Regulation (EC) 726/2004 — 210 active days with clock-stops' };
  }
  // jp
  return { region, applicationType, model: 'PMDA', nominalDays: 365, clockStops: true, basis: 'PMDA standard review (≈12 months; priority shorter)' };
}

export function granularityRule(region: Region, applicationType: ApplicationType, sectionCode: string): string {
  const match = requiredSections(region, applicationType).find(s => s.sectionCode === sectionCode);
  return match?.granularityRule ?? 'unknown';
}
