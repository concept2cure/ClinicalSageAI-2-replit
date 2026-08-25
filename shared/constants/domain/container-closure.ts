/**
 * Container Closure Systems — canonical domain vocabulary.
 *
 * 16 container-closure-system entries covering vials, syringes,
 * autoinjectors, IV bags, blister packs, bottles, inhalers, and
 * topical packaging. Used by the intelligence question engine,
 * CMC planning, and stability program design.
 *
 * @module shared/constants/domain/container-closure
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import { toQuestionOptions as sharedToQuestionOptions, type DomainEntry } from './types.js';

export type ContainerClosure =
  | 'glass_vial'
  | 'glass_ampule'
  | 'prefilled_syringe_glass'
  | 'prefilled_syringe_cop'
  | 'autoinjector'
  | 'pen_injector'
  | 'iv_bag'
  | 'blister_pack'
  | 'hdpe_bottle'
  | 'mdi_canister'
  | 'dpi_device'
  | 'tube_aluminum'
  | 'tube_laminate'
  | 'pouch'
  | 'cartridge'
  | 'other';

export const CONTAINER_CLOSURES: DomainEntry<ContainerClosure>[] = [
  {
    value: 'glass_vial',
    label: 'Glass Vial (Type I Borosilicate)',
    description: 'Type I borosilicate glass vial for parenteral and lyophilized products.',
    regulatoryRefs: ['USP <660>'],
  },
  {
    value: 'glass_ampule',
    label: 'Glass Ampule',
    description: 'Sealed glass ampule for single-dose parenteral products.',
  },
  {
    value: 'prefilled_syringe_glass',
    label: 'Prefilled Syringe (Glass Barrel)',
    description: 'Glass barrel prefilled syringe with staked or luer-lock needle.',
    regulatoryRefs: ['ISO 11040'],
  },
  {
    value: 'prefilled_syringe_cop',
    label: 'Prefilled Syringe (COP/COC Polymer)',
    description: 'Cyclic olefin polymer or copolymer barrel prefilled syringe.',
  },
  {
    value: 'autoinjector',
    label: 'Autoinjector Device',
    description: 'Spring-loaded or electronic autoinjector for subcutaneous self-injection.',
    regulatoryRefs: ['ISO 11608'],
  },
  {
    value: 'pen_injector',
    label: 'Pen Injector',
    description: 'Reusable or disposable pen injector for multi-dose subcutaneous delivery.',
    regulatoryRefs: ['ISO 11608'],
  },
  {
    value: 'iv_bag',
    label: 'IV Bag (PVC / Non-PVC)',
    description: 'Intravenous infusion bag in PVC or non-PVC (polyolefin) material.',
    regulatoryRefs: ['USP <661.1>'],
  },
  {
    value: 'blister_pack',
    label: 'Blister Pack (PVC/PVDC/Alu)',
    description: 'Thermoformed or cold-formed blister packaging for solid oral dosage forms.',
  },
  {
    value: 'hdpe_bottle',
    label: 'HDPE Bottle',
    description: 'High-density polyethylene bottle for solid oral dosage forms.',
    regulatoryRefs: ['USP <661.1>'],
  },
  {
    value: 'mdi_canister',
    label: 'MDI Canister (Aluminum)',
    description: 'Pressurized aluminum canister for metered-dose inhaler products.',
  },
  {
    value: 'dpi_device',
    label: 'DPI Device / Capsule',
    description: 'Dry powder inhaler device with capsule or reservoir system.',
  },
  {
    value: 'tube_aluminum',
    label: 'Aluminum Tube',
    description: 'Collapsible aluminum tube for topical creams and ointments.',
  },
  {
    value: 'tube_laminate',
    label: 'Laminate Tube',
    description: 'Multi-layer laminate tube for topical semi-solid products.',
  },
  {
    value: 'pouch',
    label: 'Foil Pouch / Sachet',
    description: 'Aluminum foil pouch or sachet for moisture-sensitive products.',
  },
  {
    value: 'cartridge',
    label: 'Glass Cartridge',
    description: 'Type I glass cartridge for pen injector delivery systems.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Container closure system not covered by the predefined categories.',
  },
];

/** Convert CONTAINER_CLOSURES to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return sharedToQuestionOptions(CONTAINER_CLOSURES);
}
