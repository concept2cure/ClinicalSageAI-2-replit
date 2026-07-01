/**
 * Organization Types — canonical domain vocabulary that unifies the platform's
 * FOUR parallel "client / organization type" vocabularies.
 *
 * Before this file, the same concept of "what kind of organization is this" was
 * named four different ways and code translated between them with inline string
 * literals scattered across services:
 *
 *   1. submission-constants `ClientType`
 *      — 'pharma' | 'biotech' | 'mdx' | 'ivd'
 *      Used by the Submission Center UI for dropdowns, badges, and status pills.
 *      Note the abbreviation 'mdx' for MedTech device.
 *
 *   2. client-segments `ClientSegmentId`
 *      — 'device' | 'ivd' | 'biotech' | 'pharma'
 *      The regulatory-engine's four-segment model, where a segment is a preset
 *      over orthogonal regulatory axes (evidence model, CMC model, risk model).
 *      Note that MedTech is called 'device' here, not 'mdx' or 'medtech'.
 *
 *   3. intelligence-questions `FlowDefinition.clientTypes`
 *      — Array<'pharma' | 'biotech' | 'medtech'>
 *      The question-flow engine's client scope. Uses 'medtech' (not 'mdx' or
 *      'device') and omits IVD entirely (IVD is folded into medtech for flow
 *      selection purposes).
 *
 *   4. project-setup flow hardcoded options
 *      — 'pharma' | 'biotech' | 'medtech' | 'cro' | 'cdmo' | 'academic' | 'government'
 *      The widest vocabulary, including service organizations (CRO, CDMO) and
 *      non-commercial institutions that don't map to a regulatory segment at all
 *      but do need to use the platform.
 *
 * This module makes `OrganizationType` the canonical superset and provides
 * explicit, single-source bridge functions to each of the other three
 * vocabularies. Adopt its converters instead of hand-writing another mapping
 * table.
 *
 * The design mirrors `shared/regulatory/region-identity.ts`, which reconciles
 * the platform's four region vocabularies the same way.
 *
 * @module shared/constants/domain/organization-types
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

// ─── Canonical organization type (the superset) ─────────────────────────────

/**
 * Every organization type the platform recognizes.
 *
 * The first four (`pharma`, `biotech`, `medtech`, `ivd`) are product-owning
 * organizations that map directly to a regulatory client segment.
 *
 * The remaining five (`cro`, `cdmo`, `academic`, `government`, `other`) are
 * service or institutional organizations that USE the platform to work on
 * regulated products but do not themselves define a regulatory program —
 * their segment is determined by the product they are working on, not by
 * their own identity.
 */
export type OrganizationType =
  | 'pharma'
  | 'biotech'
  | 'medtech'
  | 'ivd'
  | 'cro'
  | 'cdmo'
  | 'academic'
  | 'government'
  | 'other';

/**
 * The four regulatory client segments (maps 1:1 to `ClientSegmentId` in
 * `shared/regulatory/client-segments.ts`).
 *
 * These represent the fundamental regulatory program archetypes: each one
 * bundles a specific evidence model, CMC model, risk model, and lifecycle
 * model. The word 'device' (not 'medtech') is used here because the
 * regulatory engine needs to distinguish devices from IVDs — they follow
 * different evidence models (equivalence vs. performance) and different
 * EU regulations (MDR vs. IVDR).
 */
export type ClientSegmentType = 'pharma' | 'biotech' | 'device' | 'ivd';

// ─── Domain entries ─────────────────────────────────────────────────────────

export const ORGANIZATION_TYPES: DomainEntry<OrganizationType>[] = [
  {
    value: 'pharma',
    label: 'Pharmaceutical Company',
    description: 'Develops and markets small-molecule drugs. Regulatory programs governed by NDA/ANDA pathways, ICH Q1-Q12 (chemistry CMC), and nonclinical pharmacovigilance.',
    regulatoryRefs: ['21 CFR 314', 'ICH Q1-Q12'],
  },
  {
    value: 'biotech',
    label: 'Biotechnology Company',
    description: 'Develops biologics, biosimilars, ATMPs, or vaccines produced in living systems. Regulatory programs governed by BLA pathways, ICH Q5 (biologic CMC), and ICH S6.',
    regulatoryRefs: ['42 USC 262 (PHS Act 351)', 'ICH Q5', 'ICH S6'],
  },
  {
    value: 'medtech',
    label: 'Medical Device Company',
    description: 'Develops medical devices and combination products. Regulatory programs governed by 510(k)/PMA/De Novo pathways, design controls (ISO 13485), and ISO 14971 risk management.',
    regulatoryRefs: ['21 CFR 807', '21 CFR 814', 'ISO 13485', 'ISO 14971', 'EU MDR 2017/745'],
  },
  {
    value: 'ivd',
    label: 'IVD / Diagnostics Company',
    description: 'Develops in vitro diagnostic devices and reagents. Regulatory programs governed by 510(k)/PMA/De Novo for IVD, analytical/clinical performance validation (CLSI EP suite), and IVDR.',
    regulatoryRefs: ['21 CFR 809', 'CLSI EP Suite', 'ISO 14971', 'EU IVDR 2017/746'],
  },
  {
    value: 'cro',
    label: 'Contract Research Organization (CRO)',
    description: 'Provides outsourced clinical and preclinical research services. Does not own a regulatory program — the segment is determined by the sponsor\'s product.',
  },
  {
    value: 'cdmo',
    label: 'Contract Development and Manufacturing Organization (CDMO)',
    description: 'Provides outsourced development and manufacturing services. Does not own a regulatory program — the segment is determined by the sponsor\'s product.',
  },
  {
    value: 'academic',
    label: 'Academic / Research Institution',
    description: 'University or research institution conducting investigator-sponsored research. May sponsor INDs/IDEs but the regulatory program is product-driven, not institution-driven.',
    regulatoryRefs: ['21 CFR 312 (IND)', '21 CFR 812 (IDE)'],
  },
  {
    value: 'government',
    label: 'Government Agency',
    description: 'Government-sponsored research or regulatory body (e.g., NIH, BARDA, DoD). May sponsor clinical programs; regulatory segment determined by the specific product.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Organization type not covered by the standard categories.',
  },
];

export const CLIENT_SEGMENT_TYPES: DomainEntry<ClientSegmentType>[] = [
  {
    value: 'pharma',
    label: 'Pharmaceutical',
    description: 'Small-molecule drug programs. FDA CDER. Evidence: clinical efficacy. CMC: chemistry (ICH Q1-Q12). Risk: nonclinical + pharmacovigilance.',
    regulatoryRefs: ['21 CFR 314'],
  },
  {
    value: 'biotech',
    label: 'Biotechnology',
    description: 'Biologic, biosimilar, ATMP, and vaccine programs. FDA CBER. Evidence: clinical efficacy. CMC: biologic (ICH Q5). Risk: nonclinical + pharmacovigilance.',
    regulatoryRefs: ['42 USC 262 (PHS Act 351)', 'ICH Q5'],
  },
  {
    value: 'device',
    label: 'Medical Device',
    description: 'Medical device and combination product programs. FDA CDRH. Evidence: substantial equivalence or clinical. CMC: design controls (ISO 13485). Risk: ISO 14971.',
    regulatoryRefs: ['21 CFR 807', '21 CFR 814', 'ISO 13485', 'ISO 14971'],
  },
  {
    value: 'ivd',
    label: 'IVD / Diagnostics',
    description: 'In vitro diagnostic device programs. FDA CDRH (OHT7). Evidence: analytical + clinical performance. CMC: assay validation. Risk: ISO 14971.',
    regulatoryRefs: ['21 CFR 809', 'CLSI EP Suite', 'ISO 14971'],
  },
];

// ─── Bridge functions ───────────────────────────────────────────────────────

/**
 * Map a canonical OrganizationType to the regulatory ClientSegmentType.
 *
 * Product-owning organizations (`pharma`, `biotech`, `medtech`, `ivd`) map
 * directly. Service organizations (`cro`, `cdmo`, `academic`, `government`,
 * `other`) return `null` because their regulatory segment is determined by
 * the product they are working on, not by their own identity.
 */
export function orgToClientSegment(org: OrganizationType): ClientSegmentType | null {
  switch (org) {
    case 'pharma':  return 'pharma';
    case 'biotech': return 'biotech';
    case 'medtech': return 'device';
    case 'ivd':     return 'ivd';
    case 'cro':
    case 'cdmo':
    case 'academic':
    case 'government':
    case 'other':
      return null;
  }
}

/**
 * Map a canonical OrganizationType to the submission-constants `ClientType`
 * string value.
 *
 * The submission-constants vocabulary uses 'mdx' for MedTech devices (not
 * 'device' or 'medtech'), and omits service organizations entirely.
 *
 * @see shared/types/submission-constants.ts — `ClientType`
 */
export function orgToSubmissionClientType(org: OrganizationType): string | null {
  switch (org) {
    case 'pharma':  return 'pharma';
    case 'biotech': return 'biotech';
    case 'medtech': return 'mdx';
    case 'ivd':     return 'ivd';
    case 'cro':
    case 'cdmo':
    case 'academic':
    case 'government':
    case 'other':
      return null;
  }
}

/**
 * Map a canonical OrganizationType to the intelligence-questions
 * `FlowDefinition.clientTypes` string value.
 *
 * The flow engine vocabulary uses 'medtech' for both devices AND IVDs (they
 * share the same question flows), and omits service organizations since
 * flows are product-scoped, not organization-scoped.
 *
 * @see shared/types/intelligence-questions.ts — `FlowDefinition.clientTypes`
 */
export function orgToFlowClientType(org: OrganizationType): string | null {
  switch (org) {
    case 'pharma':  return 'pharma';
    case 'biotech': return 'biotech';
    case 'medtech': return 'medtech';
    case 'ivd':     return 'medtech'; // IVD is folded into medtech for flow selection
    case 'cro':
    case 'cdmo':
    case 'academic':
    case 'government':
    case 'other':
      return null;
  }
}

// ─── Reverse lookups ────────────────────────────────────────────────────────

/** Reverse lookup: ClientSegmentType → canonical OrganizationType. */
export function clientSegmentToOrg(segment: ClientSegmentType): OrganizationType {
  switch (segment) {
    case 'pharma':  return 'pharma';
    case 'biotech': return 'biotech';
    case 'device':  return 'medtech';
    case 'ivd':     return 'ivd';
  }
}

/** Reverse lookup: submission-constants ClientType string → canonical OrganizationType. */
export function submissionClientTypeToOrg(clientType: string): OrganizationType | undefined {
  switch (clientType) {
    case 'pharma':  return 'pharma';
    case 'biotech': return 'biotech';
    case 'mdx':     return 'medtech';
    case 'ivd':     return 'ivd';
    default:        return undefined;
  }
}

/** Reverse lookup: flow clientType string → canonical OrganizationType(s). */
export function flowClientTypeToOrgs(flowType: string): OrganizationType[] {
  switch (flowType) {
    case 'pharma':  return ['pharma'];
    case 'biotech': return ['biotech'];
    case 'medtech': return ['medtech', 'ivd']; // 'medtech' in flows covers both device and IVD
    default:        return [];
  }
}

// ─── Predicates ─────────────────────────────────────────────────────────────

/** True when the organization type owns a regulatory program (maps to a client segment). */
export function isProductOwner(org: OrganizationType): boolean {
  return orgToClientSegment(org) !== null;
}

/** True when the organization type is a service organization (CRO, CDMO, etc.). */
export function isServiceOrg(org: OrganizationType): boolean {
  return orgToClientSegment(org) === null;
}

/** True when a string is a valid OrganizationType. */
export function isOrganizationType(value: string): value is OrganizationType {
  return ORGANIZATION_TYPES.some((e) => e.value === value);
}

/** True when a string is a valid ClientSegmentType. */
export function isClientSegmentType(value: string): value is ClientSegmentType {
  return CLIENT_SEGMENT_TYPES.some((e) => e.value === value);
}

// ─── Lists ──────────────────────────────────────────────────────────────────

/** All organization type values, in registry order. */
export function listOrganizationTypes(): OrganizationType[] {
  return ORGANIZATION_TYPES.map((e) => e.value);
}

/** All client segment type values, in registry order. */
export function listClientSegmentTypes(): ClientSegmentType[] {
  return CLIENT_SEGMENT_TYPES.map((e) => e.value);
}

/** Only the product-owning organization types (excludes CRO, CDMO, academic, government, other). */
export function listProductOwnerTypes(): OrganizationType[] {
  return ORGANIZATION_TYPES.filter((e) => isProductOwner(e.value)).map((e) => e.value);
}

// ─── Question-option converters ─────────────────────────────────────────────

/** Convert ORGANIZATION_TYPES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return ORGANIZATION_TYPES.map((e) => ({
    value: e.value,
    label: e.label,
    description: e.description,
  }));
}

/** Convert CLIENT_SEGMENT_TYPES to QuestionOption[] for use in intelligence question flows. */
export function segmentToQuestionOptions(): QuestionOption[] {
  return CLIENT_SEGMENT_TYPES.map((e) => ({
    value: e.value,
    label: e.label,
    description: e.description,
  }));
}

export default {
  ORGANIZATION_TYPES,
  CLIENT_SEGMENT_TYPES,
  orgToClientSegment,
  orgToSubmissionClientType,
  orgToFlowClientType,
  clientSegmentToOrg,
  submissionClientTypeToOrg,
  flowClientTypeToOrgs,
  isProductOwner,
  isServiceOrg,
  isOrganizationType,
  isClientSegmentType,
  listOrganizationTypes,
  listClientSegmentTypes,
  listProductOwnerTypes,
  toQuestionOptions,
  segmentToQuestionOptions,
};
