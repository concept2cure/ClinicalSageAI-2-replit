/**
 * Excipient Classes — canonical domain vocabulary.
 *
 * 18 excipient-class entries covering fillers, binders, disintegrants,
 * lubricants, surfactants, buffers, stabilizers, preservatives, and
 * other functional excipient categories. Used by the intelligence
 * question engine, formulation design, and CMC planning workflows.
 *
 * @module shared/constants/domain/excipient-classes
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type ExcipientClass =
  | 'filler_diluent'
  | 'binder'
  | 'disintegrant'
  | 'lubricant'
  | 'glidant'
  | 'coating_agent'
  | 'surfactant'
  | 'buffer'
  | 'tonicity_agent'
  | 'stabilizer'
  | 'preservative'
  | 'antioxidant'
  | 'chelating_agent'
  | 'solubilizer'
  | 'colorant'
  | 'sweetener'
  | 'flavoring'
  | 'other';

export const EXCIPIENT_CLASSES: DomainEntry<ExcipientClass>[] = [
  {
    value: 'filler_diluent',
    label: 'Filler / Diluent',
    description: 'Bulking agents such as lactose, microcrystalline cellulose (MCC), and mannitol.',
  },
  {
    value: 'binder',
    label: 'Binder',
    description: 'Granulation and compression binders such as PVP, HPMC, and starch.',
  },
  {
    value: 'disintegrant',
    label: 'Disintegrant',
    description: 'Tablet disintegrants such as croscarmellose sodium and crospovidone.',
  },
  {
    value: 'lubricant',
    label: 'Lubricant',
    description: 'Compression lubricants such as magnesium stearate and sodium stearyl fumarate.',
  },
  {
    value: 'glidant',
    label: 'Glidant',
    description: 'Flow aids such as colloidal silicon dioxide (Aerosil).',
  },
  {
    value: 'coating_agent',
    label: 'Film Coating Agent',
    description: 'Film coating systems such as Opadry and HPMC-based coatings.',
  },
  {
    value: 'surfactant',
    label: 'Surfactant',
    description: 'Surface-active agents such as polysorbate 80 and poloxamer 188.',
    regulatoryRefs: ['ICH Q5E'],
  },
  {
    value: 'buffer',
    label: 'Buffer System',
    description: 'pH buffering systems such as histidine, phosphate, and citrate buffers.',
  },
  {
    value: 'tonicity_agent',
    label: 'Tonicity Agent',
    description: 'Osmolality adjusters such as sodium chloride, sucrose, and trehalose.',
  },
  {
    value: 'stabilizer',
    label: 'Stabilizer / Lyoprotectant',
    description: 'Protein stabilizers and lyoprotectants such as sucrose and trehalose.',
    regulatoryRefs: ['ICH Q5C'],
  },
  {
    value: 'preservative',
    label: 'Preservative',
    description: 'Antimicrobial preservatives such as benzyl alcohol and m-cresol.',
  },
  {
    value: 'antioxidant',
    label: 'Antioxidant',
    description: 'Oxidation inhibitors such as methionine and ascorbic acid.',
  },
  {
    value: 'chelating_agent',
    label: 'Chelating Agent',
    description: 'Metal ion chelators such as EDTA (edetate disodium).',
  },
  {
    value: 'solubilizer',
    label: 'Solubilizer / Cosolvent',
    description: 'Solubility enhancers such as PEG, cyclodextrin, and cosolvents.',
  },
  {
    value: 'colorant',
    label: 'Colorant',
    description: 'Coloring agents such as FD&C dyes and iron oxide pigments.',
  },
  {
    value: 'sweetener',
    label: 'Sweetener',
    description: 'Artificial and natural sweeteners such as sucralose and saccharin.',
  },
  {
    value: 'flavoring',
    label: 'Flavoring Agent',
    description: 'Flavoring agents for pediatric and oral liquid formulations.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Excipient class not covered by the predefined categories.',
  },
];

/** Convert EXCIPIENT_CLASSES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return EXCIPIENT_CLASSES.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
