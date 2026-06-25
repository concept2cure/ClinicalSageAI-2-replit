/**
 * Claim spine — the evidence → claim → dossier-section linkage.
 *
 * A regulatory submission is an argument: "this product is safe and effective for
 * this intended use." That root claim decomposes into sub-claims, each supported
 * by evidence (the apps generate it) and each projected into specific dossier
 * sections. The dossier is a summarization of this graph; the work is building it.
 *
 * This module is the missing primitive: it names the sub-claims for each evidence
 * model and, per claim, which apps produce the supporting evidence and where it
 * lands. The per-segment "journey" is the dependency order over these claims —
 * derived, not hand-enumerated.
 *
 * The two gaps this linkage originally surfaced — IVD analytical performance and
 * biosimilar/generic analytical similarity — now have dedicated apps
 * (`analytical_performance`, `analytical_similarity`) in the app registry.
 *
 * Pure, no DB.
 *
 * @module shared/regulatory/claim-spine
 */

import type { WorkspaceAppId } from './app-registry.js';
import type { EvidenceModel } from './client-segments.js';

export interface ClaimNode {
  /** Stable claim id. */
  id: string;
  /** Human label. */
  label: string;
  /** Apps that generate the evidence supporting this claim. */
  supportedByApps: WorkspaceAppId[];
  /** Dossier section hints where this claim's evidence projects (CTD or eSTAR). */
  projectsTo: string[];
}

export interface ClaimSpine {
  evidenceModel: EvidenceModel;
  /** The root claim every program argues. */
  rootClaim: string;
  /** Sub-claims in build/dependency order (quality + evidence first, summaries last). */
  claims: ClaimNode[];
}

const INTENDED_USE = 'Safe and effective for the intended use / indication';

export const CLAIM_SPINES: Record<EvidenceModel, ClaimSpine> = {
  clinical_efficacy: {
    evidenceModel: 'clinical_efficacy',
    rootClaim: INTENDED_USE,
    claims: [
      { id: 'quality', label: 'Quality (CMC) is controlled', supportedByApps: ['cmc'], projectsTo: ['M2.3', 'M3'] },
      { id: 'nonclinical_safety', label: 'Nonclinical safety is established', supportedByApps: ['nonclinical', 'iacuc'], projectsTo: ['M2.4', 'M2.6', 'M4'] },
      { id: 'efficacy', label: 'Clinical efficacy is demonstrated', supportedByApps: ['study_protocol_design', 'biostatistics', 'clinical_csr', 'irb', 'etmf'], projectsTo: ['M2.5', 'M2.7', 'M5.3.5'] },
      { id: 'clinical_safety', label: 'Clinical safety / benefit-risk holds', supportedByApps: ['clinical_csr', 'pharmacovigilance'], projectsTo: ['M2.7.4', 'M5.3.5'] },
      { id: 'labeling', label: 'Labeling reflects the evidence', supportedByApps: ['labeling'], projectsTo: ['M1 labeling'] },
    ],
  },
  equivalence: {
    evidenceModel: 'equivalence',
    rootClaim: INTENDED_USE,
    claims: [
      { id: 'device_description', label: 'Device is described and characterized', supportedByApps: ['cmc'], projectsTo: ['Device description'] },
      { id: 'substantial_equivalence', label: 'Substantially equivalent to a predicate', supportedByApps: ['substantial_equiv'], projectsTo: ['SE comparison'] },
      { id: 'performance_bench', label: 'Bench / software / HF / cyber performance is adequate', supportedByApps: ['risk', 'human_factors', 'cybersecurity'], projectsTo: ['Performance testing', 'Software', 'Human factors', 'Cybersecurity'] },
      { id: 'safety_biocompat', label: 'Biocompatibility / safety is acceptable', supportedByApps: ['risk'], projectsTo: ['Biocompatibility'] },
      { id: 'labeling', label: 'Labeling / IFU reflects the device', supportedByApps: ['labeling'], projectsTo: ['Labeling'] },
    ],
  },
  performance: {
    evidenceModel: 'performance',
    rootClaim: INTENDED_USE,
    claims: [
      { id: 'analytical_performance', label: 'Analytical performance is validated (precision, LoD/LoQ, linearity, interference)', supportedByApps: ['analytical_performance', 'biostatistics'], projectsTo: ['Analytical performance'] },
      { id: 'clinical_performance', label: 'Clinical performance is demonstrated (sensitivity / specificity, PPA / NPA)', supportedByApps: ['clinical_csr', 'biostatistics'], projectsTo: ['Clinical performance'] },
      { id: 'risk', label: 'Risk is managed (ISO 14971)', supportedByApps: ['risk'], projectsTo: ['Risk management file'] },
      { id: 'labeling', label: 'Labeling / intended use is consistent', supportedByApps: ['labeling'], projectsTo: ['Labeling'] },
    ],
  },
  sameness: {
    evidenceModel: 'sameness',
    rootClaim: 'Equivalent to the reference product for the intended use',
    claims: [
      { id: 'quality_similarity', label: 'Analytical similarity / bioequivalence to the reference', supportedByApps: ['analytical_similarity', 'cmc', 'biostatistics'], projectsTo: ['M3.2', 'Comparability / BE'] },
      { id: 'residual_clinical', label: 'Residual uncertainty addressed (confirmatory PK/PD or clinical)', supportedByApps: ['clinical_csr', 'biostatistics'], projectsTo: ['M5.3'] },
      { id: 'labeling', label: 'Labeling carried from / compared to reference', supportedByApps: ['labeling'], projectsTo: ['M1 labeling'] },
    ],
  },
};

export function getClaimSpine(model: EvidenceModel): ClaimSpine {
  return CLAIM_SPINES[model];
}

export default { CLAIM_SPINES, getClaimSpine };
