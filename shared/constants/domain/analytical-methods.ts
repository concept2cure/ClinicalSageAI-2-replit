/**
 * Analytical Methods — canonical domain vocabulary.
 *
 * 24 analytical-method entries covering chromatography, spectroscopy,
 * biological assays, compendial testing, and impurity analysis.
 * Used by the intelligence question engine, CMC planning, and
 * analytical development workflows.
 *
 * @module shared/constants/domain/analytical-methods
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type AnalyticalMethod =
  | 'hplc'
  | 'uplc'
  | 'gc'
  | 'ms'
  | 'sec'
  | 'ief'
  | 'ce_sds'
  | 'elisa'
  | 'cell_based_potency'
  | 'spr'
  | 'pcr'
  | 'ngs'
  | 'dissolution'
  | 'disintegration'
  | 'karl_fischer'
  | 'xrpd'
  | 'dsc'
  | 'particle_size'
  | 'endotoxin_lal'
  | 'sterility'
  | 'bioburden'
  | 'residual_solvents'
  | 'elemental_impurities'
  | 'other';

export const ANALYTICAL_METHODS: DomainEntry<AnalyticalMethod>[] = [
  {
    value: 'hplc',
    label: 'HPLC (High-Performance Liquid Chromatography)',
    description: 'Reversed-phase, normal-phase, and ion-exchange HPLC for assay and purity.',
    regulatoryRefs: ['ICH Q2(R2)'],
  },
  {
    value: 'uplc',
    label: 'UPLC / UHPLC',
    description: 'Ultra-high-performance liquid chromatography for high-resolution separations.',
    regulatoryRefs: ['ICH Q2(R2)'],
  },
  {
    value: 'gc',
    label: 'Gas Chromatography (GC)',
    description: 'Gas chromatography for volatile compounds and residual solvents.',
    regulatoryRefs: ['ICH Q2(R2)'],
  },
  {
    value: 'ms',
    label: 'Mass Spectrometry (LC-MS, GC-MS)',
    description: 'Mass spectrometric detection coupled with LC or GC for identification and quantitation.',
    regulatoryRefs: ['ICH Q2(R2)'],
  },
  {
    value: 'sec',
    label: 'Size Exclusion Chromatography (SEC)',
    description: 'Size-based separation for aggregate and fragment analysis of biologics.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'ief',
    label: 'Isoelectric Focusing (IEF / cIEF)',
    description: 'Charge variant analysis by isoelectric focusing or capillary IEF.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'ce_sds',
    label: 'CE-SDS (Capillary Electrophoresis)',
    description: 'Reduced and non-reduced CE-SDS for purity and fragment analysis.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'elisa',
    label: 'ELISA (Enzyme-Linked Immunosorbent Assay)',
    description: 'Immunoassay for potency, binding, and residual host cell protein quantitation.',
  },
  {
    value: 'cell_based_potency',
    label: 'Cell-Based Potency Assay',
    description: 'In vitro cell-based assays for biological activity and potency determination.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'spr',
    label: 'Surface Plasmon Resonance (SPR)',
    description: 'Real-time binding kinetics and affinity measurement (ka, kd, KD).',
  },
  {
    value: 'pcr',
    label: 'PCR / qPCR / RT-qPCR',
    description: 'Polymerase chain reaction for residual DNA quantitation and identity testing.',
  },
  {
    value: 'ngs',
    label: 'Next-Generation Sequencing (NGS)',
    description: 'High-throughput sequencing for gene therapy vector characterization.',
  },
  {
    value: 'dissolution',
    label: 'Dissolution Testing',
    description: 'In vitro dissolution rate testing for solid oral dosage forms.',
    regulatoryRefs: ['USP <711>'],
  },
  {
    value: 'disintegration',
    label: 'Disintegration Testing',
    description: 'Disintegration time testing for tablets and capsules.',
    regulatoryRefs: ['USP <701>'],
  },
  {
    value: 'karl_fischer',
    label: 'Karl Fischer (Water Content)',
    description: 'Coulometric or volumetric Karl Fischer titration for moisture determination.',
    regulatoryRefs: ['ICH Q6A'],
  },
  {
    value: 'xrpd',
    label: 'X-Ray Powder Diffraction (XRPD)',
    description: 'Crystalline form identification and polymorphism screening.',
  },
  {
    value: 'dsc',
    label: 'Differential Scanning Calorimetry (DSC)',
    description: 'Thermal analysis for melting point, glass transition, and polymorphic form.',
  },
  {
    value: 'particle_size',
    label: 'Particle Size Analysis (Laser Diffraction)',
    description: 'Particle size distribution by laser diffraction or dynamic light scattering.',
    regulatoryRefs: ['ICH Q6A'],
  },
  {
    value: 'endotoxin_lal',
    label: 'Endotoxin (LAL / rFC)',
    description: 'Bacterial endotoxin testing by LAL or recombinant Factor C assay.',
    regulatoryRefs: ['USP <85>'],
  },
  {
    value: 'sterility',
    label: 'Sterility Testing',
    description: 'Membrane filtration or direct inoculation sterility testing.',
    regulatoryRefs: ['USP <71>'],
  },
  {
    value: 'bioburden',
    label: 'Bioburden Testing',
    description: 'Microbial enumeration and absence-of-specified-organisms testing.',
    regulatoryRefs: ['USP <61>', 'USP <62>'],
  },
  {
    value: 'residual_solvents',
    label: 'Residual Solvents',
    description: 'GC-based residual solvent analysis per class 1/2/3 solvent limits.',
    regulatoryRefs: ['ICH Q3C(R8)'],
  },
  {
    value: 'elemental_impurities',
    label: 'Elemental Impurities (ICP-MS)',
    description: 'ICP-MS or ICP-OES analysis for elemental impurities per permitted daily exposures.',
    regulatoryRefs: ['ICH Q3D(R2)'],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Analytical method not covered by the predefined categories.',
  },
];

/** Convert ANALYTICAL_METHODS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return ANALYTICAL_METHODS.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
