/**
 * Standards & guidance registry — the versioned source of truth for the
 * normative documents a program is built against.
 *
 * Modules across the platform cite standards as bare strings: client-segments
 * carries `standards: ['ISO 14971', 'ICH Q5A–Q5E', …]`, the claim spine and app
 * registry name ISO 14971 / IEC 62366-1 / CLSI EP in prose. None of these had an
 * id, a version, an issuing body, or a domain — so nothing could answer "which
 * version of ISO 14971", "which standards govern risk", or "is this reference
 * real". They were decorative labels.
 *
 * This registry makes each one a first-class, versioned entity (id, body,
 * designation, title, current version, domain). The curated per-segment lists in
 * client-segments are now DERIVED from this registry via stable ids, so the
 * displayed designations stay identical while gaining grounding underneath.
 *
 * Leaf module: it imports only the ClientSegmentId *type* (no runtime cycle).
 * `standardsForSegment` lives in client-segments, which owns the curated mapping.
 *
 * Pure, no DB.
 *
 * @module shared/regulatory/standards-registry
 */

import type { ClientSegmentId } from './client-segments.js';

/** The body that issues / maintains a standard. */
export type StandardBody = 'ISO' | 'IEC' | 'CLSI' | 'ICH' | 'FDA' | 'CMS' | 'EU';

/** The regulatory domain a standard governs (the axis it informs). */
export type StandardDomain =
  | 'quality_system'
  | 'risk'
  | 'software'
  | 'human_factors'
  | 'cybersecurity'
  | 'analytical_performance'
  | 'cmc_biologic'
  | 'cmc_chemistry'
  | 'nonclinical'
  | 'clinical'
  | 'regulation';

/** Stable ids for every standard the platform references. */
export type StandardId =
  | 'iso_13485'
  | 'iso_14971'
  | 'iec_62304'
  | 'iec_62366_1'
  | 'fdc_524b'
  | 'cfr_820_qmsr'
  | 'clsi_ep_suite'
  | 'cfr_493_clia'
  | 'ich_q5'
  | 'ich_e_efficacy'
  | 'ich_s6'
  | 'phs_351'
  | 'ich_q_chemistry'
  | 'ich_m3_s'
  | 'cfr_314'
  | 'eu_mdr'
  | 'eu_ivdr';

export interface StandardEntry {
  id: StandardId;
  body: StandardBody;
  /** The short designation as cited in dossiers (kept stable — consumers display it). */
  designation: string;
  /** Full title. */
  title: string;
  /** Current edition / revision in force (for "which version" grounding). */
  currentVersion: string;
  domain: StandardDomain;
  /** Segments this standard governs (informational; the curated per-segment list lives in client-segments). */
  segments: ClientSegmentId[];
}

export const STANDARDS_REGISTRY: Record<StandardId, StandardEntry> = {
  iso_13485: {
    id: 'iso_13485', body: 'ISO', designation: 'ISO 13485',
    title: 'Medical devices — Quality management systems — Requirements for regulatory purposes',
    currentVersion: '2016', domain: 'quality_system', segments: ['device', 'ivd'],
  },
  iso_14971: {
    id: 'iso_14971', body: 'ISO', designation: 'ISO 14971',
    title: 'Medical devices — Application of risk management to medical devices',
    currentVersion: '2019', domain: 'risk', segments: ['device', 'ivd'],
  },
  iec_62304: {
    id: 'iec_62304', body: 'IEC', designation: 'IEC 62304',
    title: 'Medical device software — Software life cycle processes',
    currentVersion: '2006 + AMD1:2015', domain: 'software', segments: ['device', 'ivd'],
  },
  iec_62366_1: {
    id: 'iec_62366_1', body: 'IEC', designation: 'IEC 62366-1',
    title: 'Medical devices — Application of usability engineering to medical devices',
    currentVersion: '2015 + AMD1:2020', domain: 'human_factors', segments: ['device', 'ivd'],
  },
  fdc_524b: {
    id: 'fdc_524b', body: 'FDA', designation: 'FD&C §524B',
    title: 'Ensuring Cybersecurity of Medical Devices (FD&C Act §524B)',
    currentVersion: '2023 (Consolidated Appropriations Act)', domain: 'cybersecurity', segments: ['device', 'ivd'],
  },
  cfr_820_qmsr: {
    id: 'cfr_820_qmsr', body: 'FDA', designation: '21 CFR 820 / QMSR',
    title: 'Quality System Regulation / Quality Management System Regulation (harmonized with ISO 13485)',
    currentVersion: 'QMSR final rule 2024 (effective 2026-02-02)', domain: 'quality_system', segments: ['device', 'ivd'],
  },
  clsi_ep_suite: {
    id: 'clsi_ep_suite', body: 'CLSI', designation: 'CLSI EP05/EP06/EP07/EP17',
    title: 'Analytical performance evaluation — precision (EP05), linearity (EP06), interference (EP07), detection capability (EP17)',
    currentVersion: 'EP05-A3 / EP06-Ed2 / EP07-A3 / EP17-A2', domain: 'analytical_performance', segments: ['ivd'],
  },
  cfr_493_clia: {
    id: 'cfr_493_clia', body: 'CMS', designation: '42 CFR 493 (CLIA)',
    title: 'Clinical Laboratory Improvement Amendments — laboratory requirements',
    currentVersion: 'current (2024 CLIA modernization)', domain: 'quality_system', segments: ['ivd'],
  },
  ich_q5: {
    id: 'ich_q5', body: 'ICH', designation: 'ICH Q5A–Q5E',
    title: 'Quality of biotechnological products (viral safety, cell substrates, stability, comparability)',
    currentVersion: 'Q5A(R2) 2023', domain: 'cmc_biologic', segments: ['biotech'],
  },
  ich_e_efficacy: {
    id: 'ich_e_efficacy', body: 'ICH', designation: 'ICH E (efficacy)',
    title: 'Efficacy guidelines (E3 CSR, E6 GCP, E8 study design, E9 statistical principles)',
    currentVersion: 'E6(R3) 2023; E8(R1) 2021; E9(R1) 2019; E3', domain: 'clinical', segments: ['biotech', 'pharma'],
  },
  ich_s6: {
    id: 'ich_s6', body: 'ICH', designation: 'ICH S6',
    title: 'Preclinical safety evaluation of biotechnology-derived pharmaceuticals',
    currentVersion: 'S6(R1) 2011', domain: 'nonclinical', segments: ['biotech'],
  },
  phs_351: {
    id: 'phs_351', body: 'FDA', designation: 'PHS Act §351',
    title: 'Public Health Service Act §351 — biologics licensure (42 U.S.C. §262)',
    currentVersion: 'current', domain: 'regulation', segments: ['biotech'],
  },
  ich_q_chemistry: {
    id: 'ich_q_chemistry', body: 'ICH', designation: 'ICH Q1–Q12',
    title: 'Quality guidelines (Q1 stability, Q2 validation, Q3 impurities, Q6 specifications, Q8–Q11, Q12 lifecycle)',
    currentVersion: 'Q12 2019; Q1A(R2); Q2(R2) 2023', domain: 'cmc_chemistry', segments: ['pharma'],
  },
  ich_m3_s: {
    id: 'ich_m3_s', body: 'ICH', designation: 'ICH M3(R2) / S-series',
    title: 'Nonclinical safety studies for clinical trials (M3(R2)) and the S-series safety guidelines',
    currentVersion: 'M3(R2) 2009; S1–S11', domain: 'nonclinical', segments: ['pharma'],
  },
  cfr_314: {
    id: 'cfr_314', body: 'FDA', designation: '21 CFR 314',
    title: 'Applications for FDA approval to market a new drug (NDA / ANDA)',
    currentVersion: 'current', domain: 'regulation', segments: ['pharma'],
  },
  eu_mdr: {
    id: 'eu_mdr', body: 'EU', designation: 'EU MDR 2017/745',
    title: 'Regulation (EU) 2017/745 on medical devices',
    currentVersion: '2017/745 (date of application 2021-05-26)', domain: 'regulation', segments: ['device'],
  },
  eu_ivdr: {
    id: 'eu_ivdr', body: 'EU', designation: 'EU IVDR 2017/746',
    title: 'Regulation (EU) 2017/746 on in vitro diagnostic medical devices',
    currentVersion: '2017/746 (date of application 2022-05-26)', domain: 'regulation', segments: ['ivd'],
  },
};

/** The registry entry for a standard id. */
export function getStandard(id: StandardId): StandardEntry {
  return STANDARDS_REGISTRY[id];
}

/** The cited designation for a standard id (what consumers display). */
export function standardDesignation(id: StandardId): string {
  return STANDARDS_REGISTRY[id].designation;
}

/** Type guard: is this string a known standard id. */
export function isStandardId(x: string): x is StandardId {
  return Object.prototype.hasOwnProperty.call(STANDARDS_REGISTRY, x);
}

/** Every standard governing a given domain. */
export function standardsByDomain(domain: StandardDomain): StandardEntry[] {
  return Object.values(STANDARDS_REGISTRY).filter((s) => s.domain === domain);
}

/** Every standard issued by a given body. */
export function standardsByBody(body: StandardBody): StandardEntry[] {
  return Object.values(STANDARDS_REGISTRY).filter((s) => s.body === body);
}

export default { STANDARDS_REGISTRY, getStandard, standardDesignation, isStandardId, standardsByDomain, standardsByBody };
