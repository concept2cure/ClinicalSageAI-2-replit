/**
 * Expression Systems — canonical domain vocabulary.
 *
 * 12 biologic/gene-therapy expression and manufacturing systems with ICH
 * quality guideline references. Used in CMC characterization, IND/BLA
 * Module 3 authoring, and protocol design for biologic products.
 *
 * @module shared/constants/domain/expression-systems
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import { toQuestionOptions as sharedToQuestionOptions, type DomainEntry } from './types.js';

export type ExpressionSystem =
  | 'cho'
  | 'hek293'
  | 'e_coli'
  | 'yeast_pichia'
  | 'yeast_saccharomyces'
  | 'insect_baculovirus'
  | 'plant_based'
  | 'aav_production'
  | 'lentiviral_production'
  | 'cell_expansion'
  | 'mrna_ivt'
  | 'other';

export const EXPRESSION_SYSTEMS: DomainEntry<ExpressionSystem>[] = [
  {
    value: 'cho',
    label: 'CHO (Chinese Hamster Ovary)',
    description: 'Most widely used mammalian cell line for recombinant protein and monoclonal antibody production.',
    regulatoryRefs: ['ICH Q5A(R2)', 'ICH Q5D'],
  },
  {
    value: 'hek293',
    label: 'HEK293',
    description: 'Human embryonic kidney cell line used for viral vector production and recombinant proteins.',
    regulatoryRefs: ['ICH Q5A(R2)'],
  },
  {
    value: 'e_coli',
    label: 'E. coli',
    description: 'Prokaryotic expression system for non-glycosylated recombinant proteins and peptides.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'yeast_pichia',
    label: 'Yeast (Pichia pastoris)',
    description: 'Methylotrophic yeast capable of high-density fermentation and some post-translational modifications.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'yeast_saccharomyces',
    label: 'Yeast (S. cerevisiae)',
    description: 'Well-characterized yeast system used for recombinant vaccines and therapeutic proteins.',
    regulatoryRefs: ['ICH Q6B'],
  },
  {
    value: 'insect_baculovirus',
    label: 'Insect Cell / Baculovirus',
    description: 'Baculovirus expression vector system in insect cells for complex protein production.',
    regulatoryRefs: ['ICH Q5A(R2)'],
  },
  {
    value: 'plant_based',
    label: 'Plant-Based Expression',
    description: 'Transgenic or transient plant expression for recombinant protein production.',
  },
  {
    value: 'aav_production',
    label: 'AAV Vector Production',
    description: 'Adeno-associated virus vector manufacturing for gene therapy applications.',
  },
  {
    value: 'lentiviral_production',
    label: 'Lentiviral Vector Production',
    description: 'Lentiviral vector manufacturing for gene therapy and ex vivo cell modification (e.g., CAR-T).',
  },
  {
    value: 'cell_expansion',
    label: 'Autologous/Allogeneic Cell Expansion',
    description: 'Ex vivo expansion of patient-derived or donor-derived cells for cell therapy products.',
  },
  {
    value: 'mrna_ivt',
    label: 'mRNA In Vitro Transcription',
    description: 'Enzymatic in vitro transcription of mRNA for mRNA therapeutics and vaccines.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Expression or manufacturing system not covered by the predefined categories.',
  },
];

/** Convert EXPRESSION_SYSTEMS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return sharedToQuestionOptions(EXPRESSION_SYSTEMS);
}
