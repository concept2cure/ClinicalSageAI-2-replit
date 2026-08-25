/**
 * Manufacturing Processes — canonical domain vocabulary.
 *
 * 20 manufacturing-process entries covering API synthesis, biologics
 * production, formulation, fill-finish, sterilization, and packaging.
 * Used by the intelligence question engine, project metadata, and CMC
 * planning flows.
 *
 * @module shared/constants/domain/manufacturing-processes
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import { toQuestionOptions as sharedToQuestionOptions, type DomainEntry } from './types.js';

export type ManufacturingProcess =
  | 'chemical_synthesis'
  | 'fermentation'
  | 'cell_culture'
  | 'purification_chromatography'
  | 'purification_filtration'
  | 'formulation_blending'
  | 'granulation_wet'
  | 'granulation_dry'
  | 'tableting'
  | 'encapsulation'
  | 'fill_finish'
  | 'lyophilization'
  | 'sterilization_terminal'
  | 'sterilization_filtration'
  | 'viral_clearance'
  | 'conjugation'
  | 'packaging_primary'
  | 'packaging_secondary'
  | 'process_validation'
  | 'other';

export const MANUFACTURING_PROCESSES: DomainEntry<ManufacturingProcess>[] = [
  {
    value: 'chemical_synthesis',
    label: 'Chemical Synthesis (API)',
    description: 'Small-molecule active pharmaceutical ingredient synthesis.',
    regulatoryRefs: ['ICH Q7', 'ICH Q11'],
  },
  {
    value: 'fermentation',
    label: 'Fermentation (Microbial/Mammalian)',
    description: 'Microbial or mammalian cell fermentation for biologics production.',
    regulatoryRefs: ['ICH Q5A', 'ICH Q5D'],
  },
  {
    value: 'cell_culture',
    label: 'Cell Culture (Mammalian)',
    description: 'Mammalian cell culture for monoclonal antibodies and recombinant proteins.',
    regulatoryRefs: ['ICH Q5A', 'ICH Q5B'],
  },
  {
    value: 'purification_chromatography',
    label: 'Chromatography Purification',
    description: 'Protein A, ion exchange, HIC, and other chromatographic purification steps.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'purification_filtration',
    label: 'Filtration / TFF / UF/DF',
    description: 'Tangential flow filtration, ultrafiltration, and diafiltration steps.',
    regulatoryRefs: ['ICH Q5A'],
  },
  {
    value: 'formulation_blending',
    label: 'Formulation / Blending',
    description: 'Drug product formulation development and blending operations.',
    regulatoryRefs: ['ICH Q8(R2)'],
  },
  {
    value: 'granulation_wet',
    label: 'Wet Granulation',
    description: 'Wet granulation for solid oral dosage forms.',
  },
  {
    value: 'granulation_dry',
    label: 'Dry Granulation / Roller Compaction',
    description: 'Dry granulation and roller compaction for solid oral dosage forms.',
  },
  {
    value: 'tableting',
    label: 'Tablet Compression / Coating',
    description: 'Tablet compression, film coating, and sugar coating operations.',
    regulatoryRefs: ['ICH Q8'],
  },
  {
    value: 'encapsulation',
    label: 'Capsule Filling',
    description: 'Hard or soft gelatin capsule filling for solid oral dosage forms.',
  },
  {
    value: 'fill_finish',
    label: 'Aseptic Fill-Finish',
    description: 'Aseptic filling of vials, syringes, or cartridges under sterile conditions.',
    regulatoryRefs: ['FDA Aseptic Processing Guidance 2004'],
  },
  {
    value: 'lyophilization',
    label: 'Lyophilization / Freeze-Drying',
    description: 'Freeze-drying process for biologics and heat-sensitive formulations.',
    regulatoryRefs: ['ICH Q8'],
  },
  {
    value: 'sterilization_terminal',
    label: 'Terminal Sterilization',
    description: 'Terminal sterilization by irradiation, steam, or ethylene oxide.',
    regulatoryRefs: ['ISO 11137', 'ISO 11135'],
  },
  {
    value: 'sterilization_filtration',
    label: 'Sterile Filtration',
    description: 'Sterilizing-grade filtration (0.2 µm) for heat-sensitive products.',
    regulatoryRefs: ['PDA TR 26'],
  },
  {
    value: 'viral_clearance',
    label: 'Viral Clearance / Inactivation',
    description: 'Viral clearance and inactivation steps for biologics safety.',
    regulatoryRefs: ['ICH Q5A'],
  },
  {
    value: 'conjugation',
    label: 'Bioconjugation (ADC, PEGylation)',
    description: 'Antibody-drug conjugate linker-payload attachment and PEGylation.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'packaging_primary',
    label: 'Primary Packaging',
    description: 'Primary container closure system packaging operations.',
    regulatoryRefs: ['ICH Q1A(R2)'],
  },
  {
    value: 'packaging_secondary',
    label: 'Secondary Packaging / Labeling',
    description: 'Secondary packaging, labeling, serialization, and aggregation.',
  },
  {
    value: 'process_validation',
    label: 'Process Validation',
    description: 'Process performance qualification and continued process verification.',
    regulatoryRefs: ['FDA Process Validation Guidance 2011'],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Manufacturing process not covered by the predefined categories.',
  },
];

/** Convert MANUFACTURING_PROCESSES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return sharedToQuestionOptions(MANUFACTURING_PROCESSES);
}
