/**
 * IVD study-program designer — biomarker- and knowledge-aware.
 *
 * Given an assay's measurand type, intended use, specimen, and (optionally) a
 * biomarker, this recommends the analytical + clinical study program (the CLSI
 * EP protocols and clinical-evidence studies) needed to support it, each step
 * grounded in a knowledge-base entry. This wires the biomarker validity corpus
 * and the analytical/clinical performance corpus into actionable study planning.
 *
 * Deterministic; reads only static in-code corpora.
 */

import { lookupBiomarkerValidity, type BiomarkerMatch } from './cdx-pairing';
import { getEntry } from '../ivd-knowledge/knowledge.service';
import type { Citation } from '../ivd-knowledge/types';

export type AssayType = 'quantitative' | 'qualitative' | 'ihc' | 'ngs' | 'molecular';
export type IvdIntendedUse = 'cdx' | 'screening' | 'diagnosis' | 'monitoring' | 'aid_to_diagnosis';
export type SpecimenType = 'tissue' | 'plasma_ctdna' | 'blood' | 'other';

export interface StudyDesignInput {
  assayType: AssayType;
  intendedUse: IvdIntendedUse;
  specimen?: SpecimenType;
  biomarker?: string;
  /** Set true to also surface the EU IVDR performance-evaluation framing. */
  euIvdr?: boolean;
}

export interface StudyRecommendation {
  study: string;
  standard: string;
  rationale: string;
  /** Knowledge-base entry id backing this study. */
  knowledgeRef: string;
}

export interface StudyDesignResult {
  assayType: AssayType;
  intendedUse: IvdIntendedUse;
  specimen: SpecimenType;
  biomarker: BiomarkerMatch;
  analyticalStudies: StudyRecommendation[];
  clinicalStudies: StudyRecommendation[];
  /** Cross-cutting notes (specimen, traceability, CDx contemporaneity, etc.). */
  notes: string[];
  /** Distinct knowledge ids referenced, resolved to citations. */
  citations: { id: string; title: string; citations: Citation[] }[];
}

const ANALYTICAL_BY_TYPE: Record<AssayType, StudyRecommendation[]> = {
  quantitative: [
    { study: 'Precision / reproducibility', standard: 'CLSI EP05', rationale: 'Random error within-run and within-lab (and multi-site reproducibility).', knowledgeRef: 'sci.ivd.precision' },
    { study: 'Detection capability (LoB/LoD/LoQ)', standard: 'CLSI EP17', rationale: 'Low-end performance for the measuring range.', knowledgeRef: 'sci.ivd.detection-capability' },
    { study: 'Linearity / measuring range', standard: 'CLSI EP06', rationale: 'Reportable range and dilution recovery.', knowledgeRef: 'sci.ivd.linearity' },
    { study: 'Interference / analytical specificity', standard: 'CLSI EP07', rationale: 'Endogenous/exogenous interferents and cross-reactivity.', knowledgeRef: 'sci.ivd.interference' },
    { study: 'Method comparison / bias', standard: 'CLSI EP09', rationale: 'Bias vs reference/predicate across the range.', knowledgeRef: 'sci.ivd.method-comparison' },
    { study: 'Stability', standard: 'CLSI EP25 / ISO 23640', rationale: 'Shelf-life, in-use, transport, and specimen stability.', knowledgeRef: 'sci.ivd.stability' },
    { study: 'Metrological traceability', standard: 'ISO 17511', rationale: 'Calibrator value assignment + commutability.', knowledgeRef: 'sci.ivd.traceability' },
    { study: 'Reference intervals', standard: 'CLSI EP28', rationale: 'Expected values in the intended population.', knowledgeRef: 'sci.ivd.reference-intervals' },
  ],
  qualitative: [
    { study: 'Qualitative performance / precision near cut-off', standard: 'CLSI EP12', rationale: 'C5–C95 interval and agreement near the cut-off.', knowledgeRef: 'sci.ivd.precision' },
    { study: 'Detection capability (LoD)', standard: 'CLSI EP17', rationale: 'Lowest reliably detected concentration.', knowledgeRef: 'sci.ivd.detection-capability' },
    { study: 'Interference / cross-reactivity', standard: 'CLSI EP07', rationale: 'Specificity against interferents and related analytes.', knowledgeRef: 'sci.ivd.interference' },
    { study: 'Cut-off determination', standard: 'ROC / Youden', rationale: 'Clinical decision point selection + independent validation.', knowledgeRef: 'sci.ivd.roc-cutoff' },
    { study: 'Stability', standard: 'CLSI EP25 / ISO 23640', rationale: 'Reagent and specimen stability claims.', knowledgeRef: 'sci.ivd.stability' },
  ],
  ihc: [
    { study: 'Analytical validation (controls, concordance, scoring reproducibility)', standard: 'CAP/ASCO-CAP', rationale: 'Antibody/clone validation, inter-/intra-observer scoring reproducibility, fixation/pre-analytics.', knowledgeRef: 'sci.ivd.scientific-validity' },
    { study: 'Pre-analytical control (fixation/specimen)', standard: 'CLSI GP / pre-analytical', rationale: 'IHC is acutely sensitive to fixation and specimen handling.', knowledgeRef: 'sci.ivd.preanalytical' },
    { study: 'Cut-off / scoring threshold validation', standard: 'ROC / guideline thresholds', rationale: 'Scoring algorithm (e.g., TPS/CPS, ER ≥1%) and decision threshold.', knowledgeRef: 'sci.ivd.roc-cutoff' },
  ],
  ngs: [
    { study: 'Panel validation by variant class (SNV/indel/CNV/fusion)', standard: 'AMP/CAP', rationale: 'Stratified accuracy + LoD at defined VAF per variant type.', knowledgeRef: 'sci.ngs.panel-validation' },
    { study: 'Bioinformatics pipeline validation + version control', standard: 'AMP/CAP/ACMG', rationale: 'The pipeline is part of the device and must be validated/change-managed.', knowledgeRef: 'sci.ngs.bioinformatics' },
    { study: 'Reference materials / ground truth', standard: 'NIST GIAB / contrived', rationale: 'Truth sets for accuracy + ongoing QC.', knowledgeRef: 'sci.ngs.reference-materials' },
    { study: 'Variant classification framework', standard: 'ACMG/AMP or AMP/ASCO/CAP', rationale: 'Consistent germline vs somatic interpretation + VUS handling.', knowledgeRef: 'sci.ngs.variant-classification' },
  ],
  molecular: [
    { study: 'Detection capability (LoD) + analytical specificity', standard: 'CLSI EP17 / EP07', rationale: 'Per-target LoD and cross-reactivity for amplification assays.', knowledgeRef: 'sci.ivd.detection-capability' },
    { study: 'Precision / reproducibility', standard: 'CLSI EP05', rationale: 'Within-lab and multi-site reproducibility.', knowledgeRef: 'sci.ivd.precision' },
    { study: 'Molecular pre-analytics (nucleic-acid integrity)', standard: 'ISO 20184/20186', rationale: 'Specimen/extraction integrity drives reproducibility.', knowledgeRef: 'sci.ivd.molecular-preanalytics' },
    { study: 'Stability', standard: 'CLSI EP25 / ISO 23640', rationale: 'Reagent and specimen stability.', knowledgeRef: 'sci.ivd.stability' },
  ],
};

function clinicalStudies(input: StudyDesignInput): StudyRecommendation[] {
  const base: StudyRecommendation[] = [
    {
      study: 'Clinical performance (sensitivity/specificity/PPV/NPV vs reference)',
      standard: 'FDA stats guidance / CLSI EP12',
      rationale: 'Establish diagnostic accuracy in the intended-use population at the cut-off.',
      knowledgeRef: 'sci.ivd.clinical-performance-metrics',
    },
    {
      study: 'Clinical study design + bias control',
      standard: input.euIvdr ? 'ISO 20916 / IVDR Annex XIII' : 'STARD 2015',
      rationale: 'Enroll the intended-use population; control spectrum/verification/review bias.',
      knowledgeRef: 'sci.ivd.clinical-study-design',
    },
    {
      study: 'Scientific validity report (analyte–condition association)',
      standard: input.euIvdr ? 'IVDR Annex XIII Part A' : 'Evidence dossier',
      rationale: 'Document the biological/clinical basis for the claim.',
      knowledgeRef: 'sci.ivd.scientific-validity',
    },
  ];
  if (input.intendedUse === 'cdx') {
    base.push({
      study: 'CDx clinical bridging in the pivotal-trial population',
      standard: 'FDA CDx co-development',
      rationale: 'Demonstrate the market device identifies the trial-defined population (bridge if a clinical-trial assay differed).',
      knowledgeRef: 'fda.ivd.cdx',
    });
  }
  return base;
}

/** Recommend the analytical + clinical study program for an IVD. */
export function designIvdStudyProgram(input: StudyDesignInput): StudyDesignResult {
  const specimen = input.specimen ?? 'other';
  const biomarker = input.biomarker
    ? lookupBiomarkerValidity(input.biomarker)
    : { recognized: false };

  const analyticalStudies = [...(ANALYTICAL_BY_TYPE[input.assayType] ?? [])];

  // Specimen-specific augmentation.
  if (specimen === 'plasma_ctdna') {
    analyticalStudies.push({
      study: 'ctDNA ultra-low LoD + clonal-hematopoiesis controls',
      standard: 'IASLC/ASCO liquid-biopsy',
      rationale: 'Very low VAF detection, pre-analytics, CHIP false-positive mitigation; plasma-negative reflexes to tissue.',
      knowledgeRef: 'sci.ngs.ctdna',
    });
  }
  if (specimen === 'tissue' && input.assayType !== 'ihc') {
    analyticalStudies.push({
      study: 'Specimen / pre-analytical validation (FFPE)',
      standard: 'ISO 20184 / CLSI',
      rationale: 'FFPE artefacts and fixation affect results.',
      knowledgeRef: 'sci.ivd.molecular-preanalytics',
    });
  }

  const clinical = clinicalStudies(input);

  const notes: string[] = [];
  if (input.intendedUse === 'cdx') {
    notes.push('A companion diagnostic is EU IVDR Class C (Annex VIII Rule 3) and expects FDA contemporaneous drug+Dx review (EU: notified-body medicines-authority/EMA consultation).');
  }
  if (biomarker.recognized) {
    notes.push(`Biomarker "${biomarker.title}" has documented scientific validity — cite it in the scientific-validity report.`);
  } else if (input.biomarker) {
    notes.push(`Biomarker "${input.biomarker}" is not in the validity corpus — assemble primary scientific-validity evidence first.`);
  }
  if (input.euIvdr) {
    notes.push('Document all three IVDR performance-evaluation pillars (scientific validity, analytical performance, clinical performance) in the PEP/PER and maintain via PMPF.');
  }

  // Resolve distinct knowledge refs to citations.
  const refIds = new Set<string>([
    ...analyticalStudies.map(s => s.knowledgeRef),
    ...clinical.map(s => s.knowledgeRef),
  ]);
  if (biomarker.entryId) refIds.add(biomarker.entryId);
  if (input.euIvdr) refIds.add('eu.ivdr.performance-evaluation');

  const citations = [...refIds]
    .map(id => {
      const e = getEntry(id);
      return e ? { id: e.id, title: e.title, citations: e.citations } : null;
    })
    .filter((x): x is { id: string; title: string; citations: Citation[] } => x !== null);

  return {
    assayType: input.assayType,
    intendedUse: input.intendedUse,
    specimen,
    biomarker,
    analyticalStudies,
    clinicalStudies: clinical,
    notes,
    citations,
  };
}
