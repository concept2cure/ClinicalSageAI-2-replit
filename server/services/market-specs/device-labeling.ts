/**
 * Device labeling requirements — the label elements, IFU content, and symbols
 * required for a device, by region (FDA 21 CFR 801 / EU MDR Annex I §23) and
 * standard (ISO 15223-1), selected deterministically from device facts.
 *
 * WHY THIS EXISTS: labeling is a frequent device deficiency and is highly
 * region-specific, yet only the drug SmPC structure was modelled. Given device
 * facts (sterile, single-use, implantable, reusable, Rx-only…), this returns the
 * applicable FDA + EU label elements, the IFU sections, the ISO 15223-1 symbols,
 * and the reviewer's labeling questions.
 *
 * HONESTY: reflects 21 CFR 801, EU MDR Annex I §23, and ISO 15223-1. The expected
 * label/IFU element set, not approved label text and not a compliance verdict.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-labeling
 */

export interface LabelElement {
  id: string;
  label: string;
  applicability: 'always' | 'conditional';
  condition?: string;
  basis: string;
}

export interface LabelingFacts {
  sterile?: boolean;
  singleUse?: boolean;
  reusable?: boolean;
  implantable?: boolean;
  prescriptionOnly?: boolean;
  forClinicalInvestigation?: boolean;
  hasExpiry?: boolean;
  containsMedicinalSubstance?: boolean;
}

/** EU MDR Annex I §23.2 label elements. */
const MDR_LABEL_ELEMENTS: LabelElement[] = [
  { id: 'device_name', label: 'Device name / trade name', applicability: 'always', basis: 'MDR Annex I §23.2(a)' },
  { id: 'md_indicator', label: '“Medical device” indicator (MD) / symbol', applicability: 'always', basis: 'MDR Annex I §23.2(g)' },
  { id: 'manufacturer', label: 'Manufacturer name + registered place of business', applicability: 'always', basis: 'MDR Annex I §23.2(o)' },
  { id: 'authorised_rep', label: 'Authorised representative (for non-EU manufacturers)', applicability: 'always', basis: 'MDR Annex I §23.2(p)' },
  { id: 'udi', label: 'UDI carrier', applicability: 'always', basis: 'MDR Article 27 / Annex VI' },
  { id: 'lot_serial', label: 'Batch/lot code or serial number', applicability: 'always', basis: 'MDR Annex I §23.2(f)' },
  { id: 'sterile_state', label: 'Sterile state + sterilisation method', applicability: 'conditional', condition: 'supplied sterile', basis: 'MDR Annex I §23.2(j)' },
  { id: 'single_use', label: '“Single use” indication', applicability: 'conditional', condition: 'single-use device', basis: 'MDR Annex I §23.2(k)' },
  { id: 'expiry', label: 'Use-by / expiry date', applicability: 'conditional', condition: 'limited shelf life', basis: 'MDR Annex I §23.2(h)' },
  { id: 'storage', label: 'Special storage/handling conditions', applicability: 'conditional', condition: 'special conditions apply', basis: 'MDR Annex I §23.2(l)' },
  { id: 'clinical_investigation', label: '“Exclusively for clinical investigation”', applicability: 'conditional', condition: 'investigational device', basis: 'MDR Annex I §23.2(m)' },
];

/** FDA 21 CFR 801 label elements. */
const FDA_LABEL_ELEMENTS: LabelElement[] = [
  { id: 'manufacturer', label: 'Name and place of business of manufacturer/packer/distributor', applicability: 'always', basis: '21 CFR 801.1' },
  { id: 'intended_use', label: 'Intended use / adequate directions for use', applicability: 'always', basis: '21 CFR 801.5 / 801.109' },
  { id: 'rx_only', label: '“Rx only” (prescription device statement)', applicability: 'conditional', condition: 'prescription device', basis: '21 CFR 801.109' },
  { id: 'udi', label: 'UDI carrier', applicability: 'always', basis: '21 CFR 801.20' },
  { id: 'lot_serial', label: 'Lot/batch or serial number', applicability: 'conditional', condition: 'traceability required', basis: '21 CFR 801' },
  { id: 'sterile_state', label: 'Sterility statement', applicability: 'conditional', condition: 'supplied sterile', basis: '21 CFR 801' },
  { id: 'expiry', label: 'Expiration date', applicability: 'conditional', condition: 'limited shelf life', basis: '21 CFR 801' },
  { id: 'warnings', label: 'Adequate warnings / contraindications', applicability: 'always', basis: '21 CFR 801.15 / 801.109' },
];

/** EU MDR Annex I §23.4 instructions-for-use content. */
const IFU_SECTIONS: LabelElement[] = [
  { id: 'manufacturer_details', label: 'Manufacturer details + authorised representative', applicability: 'always', basis: 'MDR Annex I §23.4(a)' },
  { id: 'intended_purpose', label: 'Intended purpose, intended users and patient population', applicability: 'always', basis: 'MDR Annex I §23.4(c)' },
  { id: 'performance', label: 'Device performance / clinical benefits', applicability: 'always', basis: 'MDR Annex I §23.4(d)' },
  { id: 'residual_risks', label: 'Residual risks, contraindications, warnings, precautions', applicability: 'always', basis: 'MDR Annex I §23.4(e/g)' },
  { id: 'instructions', label: 'Instructions for use, installation, calibration', applicability: 'always', basis: 'MDR Annex I §23.4(h/i)' },
  { id: 'sterile_handling', label: 'Sterilisation method + action if the sterile barrier is damaged', applicability: 'conditional', condition: 'supplied sterile', basis: 'MDR Annex I §23.4(k)' },
  { id: 'reprocessing', label: 'Reprocessing instructions + limits on the number of reuses', applicability: 'conditional', condition: 'reusable device', basis: 'MDR Annex I §23.4(n)' },
  { id: 'medicinal_substance', label: 'Information on the incorporated medicinal substance', applicability: 'conditional', condition: 'incorporates a medicinal substance', basis: 'MDR Annex I §23.4' },
  { id: 'disposal', label: 'Disposal / handling at end of life', applicability: 'always', basis: 'MDR Annex I §23.4(p)' },
  { id: 'revision', label: 'Date of issue / latest revision of the IFU', applicability: 'always', basis: 'MDR Annex I §23.4(r)' },
];

/** ISO 15223-1 symbols commonly required on device labels. */
export const ISO_15223_SYMBOLS = [
  { id: 'manufacturer', label: 'Manufacturer', applicability: 'always' as const },
  { id: 'date_of_manufacture', label: 'Date of manufacture', applicability: 'always' as const },
  { id: 'consult_ifu', label: 'Consult instructions for use', applicability: 'always' as const },
  { id: 'caution', label: 'Caution', applicability: 'always' as const },
  { id: 'udi', label: 'Unique Device Identifier (UDI)', applicability: 'always' as const },
  { id: 'use_by', label: 'Use-by date', applicability: 'conditional' as const, condition: 'limited shelf life' },
  { id: 'batch_code', label: 'Batch code', applicability: 'conditional' as const, condition: 'lot-controlled' },
  { id: 'serial_number', label: 'Serial number', applicability: 'conditional' as const, condition: 'serialised' },
  { id: 'sterile', label: 'Sterile (with method: STERILE R / EO / …)', applicability: 'conditional' as const, condition: 'supplied sterile' },
  { id: 'do_not_reuse', label: 'Do not reuse', applicability: 'conditional' as const, condition: 'single-use device' },
];

export const LABELING_REVIEWER_QUESTIONS = [
  'Is the labelling consistent with the cleared/approved Indications for Use (no off-label drift)?',
  'For a sterile device, does the label state the sterilisation method and the action if the sterile barrier is breached?',
  'For a reusable device, are validated reprocessing instructions and reuse limits provided?',
  'Are the required ISO 15223-1 symbols used correctly, with a symbols glossary in the IFU?',
  'Is the UDI carrier present on the label (and Base UDI-DI in the documentation)?',
];

function filterApplicable(elements: LabelElement[], met: Record<string, boolean>, conditionKey: (e: LabelElement) => string | undefined): LabelElement[] {
  return elements.filter((e) => {
    if (e.applicability === 'always') return true;
    const key = conditionKey(e);
    return key ? met[key] === true : false;
  });
}

export interface DeviceLabelingRequirements {
  fdaLabel: LabelElement[];
  mdrLabel: LabelElement[];
  ifuSections: LabelElement[];
  symbols: typeof ISO_15223_SYMBOLS;
  reviewerQuestions: string[];
  notes: string[];
}

/** Resolve labeling requirements from device facts. Deterministic. */
export function deviceLabelingRequirements(facts: LabelingFacts): DeviceLabelingRequirements {
  // Map element ids to whether their condition is met.
  const met: Record<string, boolean> = {
    sterile_state: !!facts.sterile,
    sterile_handling: !!facts.sterile,
    sterile: !!facts.sterile,
    single_use: !!facts.singleUse,
    do_not_reuse: !!facts.singleUse,
    reprocessing: !!facts.reusable,
    expiry: !!facts.hasExpiry,
    use_by: !!facts.hasExpiry,
    rx_only: !!facts.prescriptionOnly,
    clinical_investigation: !!facts.forClinicalInvestigation,
    medicinal_substance: !!facts.containsMedicinalSubstance,
    // Always-on-ish conditionals we keep on unless we have a reason to drop.
    lot_serial: true,
    batch_code: true,
    serial_number: !!facts.implantable, // serialisation typically for implants
    storage: true,
  };

  const byId = (e: LabelElement) => e.id;
  return {
    fdaLabel: filterApplicable(FDA_LABEL_ELEMENTS, met, byId),
    mdrLabel: filterApplicable(MDR_LABEL_ELEMENTS, met, byId),
    ifuSections: filterApplicable(IFU_SECTIONS, met, byId),
    symbols: ISO_15223_SYMBOLS.filter((s) => s.applicability === 'always' || met[s.id] === true),
    reviewerQuestions: LABELING_REVIEWER_QUESTIONS,
    notes: facts.implantable ? ['Implantable devices also require an implant card + patient information (MDR Article 18).'] : [],
  };
}

export default { deviceLabelingRequirements, ISO_15223_SYMBOLS };
