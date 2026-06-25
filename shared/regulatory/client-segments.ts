/**
 * Client segments + axes of variance — the generative core.
 *
 * The four client types (medical device, IVD, biotechnology, pharmaceutical) are
 * NOT primitives. They are common BUNDLES of a small set of orthogonal axes that
 * actually generate a regulatory program. Modelling the axes (not the four
 * segments) is what lets companion diagnostics, biosimilars, generics, and
 * combination products fall out instead of being special-cased forever.
 *
 * A regulatory program is, at bottom, a defensible argument to a reviewer. What
 * differs between segments is what counts as valid evidence (the evidence model)
 * and what governs the product (the CMC + risk models). Region/dossier-format is
 * a downstream projection concern (already solved by region-identity + the
 * document registry).
 *
 * Pure, no DB. The four segments here are presets over the axes.
 *
 * @module shared/regulatory/client-segments
 */

import type { ProductClass, ApplicationFamily } from './document-taxonomy.js';

// ─── Axes of variance (orthogonal; a program is a point in this space) ───────

/** What counts as proof the product works / is safe. The deepest axis; cross-cuts segments. */
export type EvidenceModel =
  | 'equivalence'        // 510(k): substantial equivalence to a predicate
  | 'performance'        // IVD: analytical + clinical performance metrics
  | 'clinical_efficacy'  // NDA/BLA/PMA: benefit-risk via controlled trials
  | 'sameness';          // generic/biosimilar: equivalence to a reference product

/** What governs manufacturing / product definition. */
export type CmcModel =
  | 'chemistry'          // small molecule — ICH Q1–Q12
  | 'biologic'           // living system — ICH Q5 (cell banks, potency, comparability)
  | 'design_controls'    // device — ISO 13485 / DHF / V&V
  | 'assay';             // IVD reagent/assay — analytical validation

/** What governs safety/risk. */
export type RiskModel =
  | 'iso14971'           // device / IVD — prospective risk management
  | 'nonclinical_pv';    // drug / biologic — nonclinical tox (ICH M3/S) + pharmacovigilance

/** How the product is maintained post-approval. */
export type LifecycleModel =
  | 'supplements_variations'      // drug/biologic — sNDA/sBLA, variations
  | 'modifications_lettertofile'  // device — modifications, letter-to-file, new 510(k)
  | 'performance_monitoring';     // IVD — ongoing performance / lot monitoring

// ─── The four client segments (presets over the axes) ────────────────────────

export type ClientSegmentId = 'device' | 'ivd' | 'biotech' | 'pharma';

export interface ClientSegment {
  id: ClientSegmentId;
  label: string;
  /** Product classes that map to this segment. */
  productClasses: ProductClass[];
  /** Lead FDA review center. */
  center: string;
  /** EU regulatory route. */
  euRoute: string;
  /** Default evidence model (a specific pathway can refine it — see resolveEvidenceModel). */
  defaultEvidenceModel: EvidenceModel;
  cmcModel: CmcModel;
  riskModel: RiskModel;
  lifecycleModel: LifecycleModel;
  /** Default dossier standard for the segment. */
  dossierStandard: 'eCTD' | 'eSTAR';
  /** The standards corpus in force for the segment. */
  standards: string[];
}

export const CLIENT_SEGMENTS: Record<ClientSegmentId, ClientSegment> = {
  device: {
    id: 'device',
    label: 'Medical Device',
    productClasses: ['medical_device', 'combination_product'],
    center: 'FDA CDRH',
    euRoute: 'EU MDR 2017/745',
    defaultEvidenceModel: 'equivalence',
    cmcModel: 'design_controls',
    riskModel: 'iso14971',
    lifecycleModel: 'modifications_lettertofile',
    dossierStandard: 'eSTAR',
    standards: ['ISO 13485', 'ISO 14971', 'IEC 62304', 'IEC 62366-1', 'FD&C §524B', '21 CFR 820 / QMSR'],
  },
  ivd: {
    id: 'ivd',
    label: 'IVD / Diagnostics',
    productClasses: ['ivd'],
    center: 'FDA CDRH (OHT7) + CLIA/CMS',
    euRoute: 'EU IVDR 2017/746',
    defaultEvidenceModel: 'performance',
    cmcModel: 'assay',
    riskModel: 'iso14971',
    lifecycleModel: 'performance_monitoring',
    dossierStandard: 'eSTAR',
    standards: ['ISO 13485', 'CLSI EP05/EP06/EP07/EP17', 'ISO 14971', '42 CFR 493 (CLIA)'],
  },
  biotech: {
    id: 'biotech',
    label: 'Biotechnology',
    productClasses: ['biologic', 'biosimilar', 'atmp', 'vaccine'],
    center: 'FDA CBER',
    euRoute: 'EU centralized MAA',
    defaultEvidenceModel: 'clinical_efficacy',
    cmcModel: 'biologic',
    riskModel: 'nonclinical_pv',
    lifecycleModel: 'supplements_variations',
    dossierStandard: 'eCTD',
    standards: ['ICH Q5A–Q5E', 'ICH E (efficacy)', 'ICH S6', 'PHS Act §351'],
  },
  pharma: {
    id: 'pharma',
    label: 'Pharmaceutical',
    productClasses: ['small_molecule', 'generic', 'otc'],
    center: 'FDA CDER',
    euRoute: 'EU MAA (centralized / DCP / national)',
    defaultEvidenceModel: 'clinical_efficacy',
    cmcModel: 'chemistry',
    riskModel: 'nonclinical_pv',
    lifecycleModel: 'supplements_variations',
    dossierStandard: 'eCTD',
    standards: ['ICH Q1–Q12', 'ICH E (efficacy)', 'ICH M3(R2) / S-series', '21 CFR 314'],
  },
};

/** The segment a product class belongs to, or undefined for cross-cutting classes ('any'). */
export function segmentForProductClass(pc: ProductClass): ClientSegmentId | undefined {
  for (const seg of Object.values(CLIENT_SEGMENTS)) {
    if (seg.productClasses.includes(pc)) return seg.id;
  }
  return undefined;
}

/** The segment for a set of product classes (first concrete match wins). */
export function segmentForProductClasses(classes: ProductClass[]): ClientSegmentId | undefined {
  for (const pc of classes) {
    const seg = segmentForProductClass(pc);
    if (seg) return seg;
  }
  return undefined;
}

export function getSegment(id: ClientSegmentId): ClientSegment {
  return CLIENT_SEGMENTS[id];
}

/**
 * Resolve the evidence model for a concrete program. The segment provides a
 * default, but the specific pathway / product class refines it — which is the
 * whole point of axes over segments:
 *   - generic / biosimilar  → 'sameness' (regardless of segment)
 *   - device PMA (device_approval) → 'clinical_efficacy' (a device using drug-style evidence)
 *   - otherwise the segment default.
 */
export function resolveEvidenceModel(
  segment: ClientSegmentId,
  family: ApplicationFamily | null | undefined,
  productClasses: ProductClass[],
): EvidenceModel {
  // Sameness only when the filing is EXCLUSIVELY a generic/biosimilar pathway
  // (ANDA ['generic'], 351(k) ['biosimilar']). Innovator entries like BLA or IND
  // that merely *cover* biosimilar among many product classes are not sameness.
  const samenessOnly =
    productClasses.length > 0 &&
    productClasses.every((p) => p === 'generic' || p === 'biosimilar');
  if (samenessOnly) return 'sameness';

  if (segment === 'device' && family === 'device_approval') {
    return 'clinical_efficacy'; // PMA rests on valid scientific (clinical) evidence
  }
  return CLIENT_SEGMENTS[segment].defaultEvidenceModel;
}

export default { CLIENT_SEGMENTS, getSegment, segmentForProductClass, segmentForProductClasses, resolveEvidenceModel };
