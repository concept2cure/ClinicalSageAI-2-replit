/**
 * Dosage Forms — canonical domain vocabulary.
 *
 * 22 dosage forms aligned to FDA CDER nomenclature. Used in CMC sections,
 * protocol specifications, and product characterization.
 *
 * @module shared/constants/domain/dosage-forms
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import type { DomainEntry } from './index.js';

export type DosageForm =
  | 'tablet_ir'
  | 'tablet_mr'
  | 'capsule'
  | 'solution_oral'
  | 'suspension_oral'
  | 'solution_injection'
  | 'suspension_injection'
  | 'emulsion_injection'
  | 'powder_reconstitution'
  | 'lyophilized'
  | 'prefilled_syringe'
  | 'autoinjector'
  | 'cream'
  | 'ointment'
  | 'gel'
  | 'lotion'
  | 'transdermal_patch'
  | 'metered_dose_inhaler'
  | 'dry_powder_inhaler'
  | 'nebulizer_solution'
  | 'implant'
  | 'other';

export const DOSAGE_FORMS: DomainEntry<DosageForm>[] = [
  {
    value: 'tablet_ir',
    label: 'Tablet (Immediate Release)',
    description: 'Solid oral dosage form designed for rapid drug release and absorption.',
  },
  {
    value: 'tablet_mr',
    label: 'Tablet (Modified Release / Extended Release)',
    description: 'Solid oral dosage form with controlled drug release over an extended period.',
  },
  {
    value: 'capsule',
    label: 'Capsule',
    description: 'Solid oral dosage form enclosed in a hard or soft gelatin shell.',
  },
  {
    value: 'solution_oral',
    label: 'Oral Solution',
    description: 'Liquid oral dosage form with drug dissolved in a suitable solvent.',
  },
  {
    value: 'suspension_oral',
    label: 'Oral Suspension',
    description: 'Liquid oral dosage form with drug particles dispersed in a vehicle.',
  },
  {
    value: 'solution_injection',
    label: 'Solution for Injection',
    description: 'Sterile liquid preparation of drug dissolved in a suitable vehicle for parenteral use.',
  },
  {
    value: 'suspension_injection',
    label: 'Suspension for Injection',
    description: 'Sterile liquid preparation with drug particles dispersed in a vehicle for parenteral use.',
  },
  {
    value: 'emulsion_injection',
    label: 'Emulsion for Injection',
    description: 'Sterile emulsion system for parenteral administration.',
  },
  {
    value: 'powder_reconstitution',
    label: 'Powder for Reconstitution',
    description: 'Sterile powder requiring reconstitution with diluent prior to administration.',
  },
  {
    value: 'lyophilized',
    label: 'Lyophilized Powder',
    description: 'Freeze-dried sterile powder for improved stability, requiring reconstitution.',
  },
  {
    value: 'prefilled_syringe',
    label: 'Prefilled Syringe',
    description: 'Ready-to-use syringe pre-loaded with a measured dose of drug product.',
  },
  {
    value: 'autoinjector',
    label: 'Autoinjector',
    description: 'Spring-loaded device for self-administered subcutaneous or intramuscular injection.',
  },
  {
    value: 'cream',
    label: 'Cream',
    description: 'Semi-solid emulsion dosage form for topical application.',
  },
  {
    value: 'ointment',
    label: 'Ointment',
    description: 'Semi-solid preparation with a hydrocarbon base for topical application.',
  },
  {
    value: 'gel',
    label: 'Gel',
    description: 'Semi-solid system in which a liquid phase is constrained within a polymeric matrix.',
  },
  {
    value: 'lotion',
    label: 'Lotion',
    description: 'Liquid or semi-liquid preparation for topical application to the skin.',
  },
  {
    value: 'transdermal_patch',
    label: 'Transdermal Patch',
    description: 'Adhesive patch delivering drug through the skin for systemic effect.',
  },
  {
    value: 'metered_dose_inhaler',
    label: 'Metered-Dose Inhaler (MDI)',
    description: 'Pressurized device delivering a precise dose of aerosolized drug to the lungs.',
  },
  {
    value: 'dry_powder_inhaler',
    label: 'Dry Powder Inhaler (DPI)',
    description: 'Breath-activated device delivering micronized dry powder to the lungs.',
  },
  {
    value: 'nebulizer_solution',
    label: 'Nebulizer Solution',
    description: 'Sterile solution aerosolized by a nebulizer device for inhalation.',
  },
  {
    value: 'implant',
    label: 'Implant',
    description: 'Solid dosage form surgically or procedurally placed in the body for sustained drug release.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Dosage form not covered by the predefined categories.',
  },
];

/** Convert DOSAGE_FORMS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return DOSAGE_FORMS.map((e) => ({ value: e.value, label: e.label, description: e.description }));
}
