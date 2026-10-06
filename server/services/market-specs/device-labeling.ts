/**
 * Device labeling requirements — the label elements, IFU content, and symbols
 * required for a device, by region (FDA 21 CFR 801, 809.10 and 812.5 / EU MDR
 * Annex I §23) and standard (ISO 15223-1), selected deterministically from
 * device facts.
 *
 * WHY THIS EXISTS: labeling is a frequent device deficiency and is highly
 * region-specific, yet only the drug SmPC structure was modelled. Given device
 * facts (sterile, single-use, implantable, reusable, Rx-only, IVD, RUO/IUO,
 * investigational…), this returns the applicable FDA + EU label elements, the
 * FDA IVD label and package-insert items, the IFU sections, the ISO 15223-1
 * symbols, and the reviewer's labeling questions.
 *
 * FDA IVD AND INVESTIGATIONAL ELEMENTS (21 CFR 809.10, 812.5): this module is
 * the ONE requirement list. The ivd-knowledge prose
 * (ivd-knowledge/regulatory/labeling-rules.ts, fda-ivd.ts) keeps the narrative
 * and points here. Each of these elements carries `basisDetail`, a
 * RegulatoryBasis saying whether its wording was matched against the eCFR text
 * or is recall (facts: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/
 * 2026-10-05-record/g-fda-ivd-investigational-labeling-facts.md).
 *
 * `checkAuthoredLabeling` reports, per required FDA element, whether a fixed
 * heading or statement is present in the program's authored labeling sections:
 * found / not_found / not_checkable. It is a presence check, never a compliance
 * verdict.
 *
 * HONESTY: the expected label/IFU element set, not approved label text and not
 * a compliance verdict.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-labeling
 */

import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';

export interface LabelElement {
  id: string;
  label: string;
  applicability: 'always' | 'conditional';
  condition?: string;
  basis: string;
  /** Provenance of `basis` (809.10 / 812.5 elements). Recall is never presented as regulator text. */
  basisDetail?: RegulatoryBasis;
  /** Wording the label must bear, exactly (a required statement). */
  statement?: string;
  /**
   * How `checkAuthoredLabeling` looks for the element: a line of the authored
   * labeling that starts with one of `headings`, or one of `phrases` (or
   * `statement`/`statementVariants`) anywhere. None of them: not_checkable.
   */
  match?: { headings?: readonly string[]; phrases?: readonly string[]; statementVariants?: readonly string[] };
  /** A prohibition (812.5(b)) — what labeling must not say; never decided by phrase matching. */
  prohibition?: true;
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
  /** An in vitro diagnostic product (21 CFR 809.3). Turns on the 809.10 label and package-insert items. */
  isIvd?: boolean;
  /** An IVD in the laboratory research phase, labeled RUO under 809.10(c)(2)(i). */
  isRuo?: boolean;
  /** An IVD shipped for product testing before full commercial marketing, labeled IUO under 809.10(c)(2)(ii). */
  isIuo?: boolean;
  /**
   * The IVD study meets every condition of 21 CFR 812.2(c)(3) (noninvasive, no
   * significant-risk invasive sampling, no energy introduced, not used as a
   * diagnostic procedure without confirmation) and complies with 809.10(c).
   * Only `true` removes the 812.5 elements; unknown keeps them.
   */
  ivdStudyExemptUnder8122c3?: boolean;
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

// ── FDA IVD (21 CFR 809.10) and investigational-device (21 CFR 812.5) elements ──
//
// regulator-text: wording matched on 2026-10-05 against search results quoting
// the eCFR page at the URL (ecfr.gov cannot be fetched from the authoring
// environment; a verbatim re-read is owed and the note says so). An element
// whose wording could not be matched is not encoded rather than encoded as
// recall. Every row is listed in g-fda-ivd-investigational-labeling-facts.md.
// 809.10(a) applies "except where such information is not applicable"; the
// reagent-only elements say so in their label.

const ECFR_809_10 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-809/subpart-B/section-809.10';
const ECFR_812_5 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-812/subpart-A/section-812.5';
const ECFR_812_2 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-812/subpart-A/section-812.2';
const CHECKED = '2026-10-05';

function regulatorText(ref: string, url: string): RegulatoryBasis {
  return { ref, confidence: 'regulator-text', url, checked: CHECKED, note: 'eCFR wording via search results; verbatim re-read owed' };
}

/** "For In Vitro Diagnostic Use" — 809.10(a). */
export const IVD_USE_STATEMENT = 'For In Vitro Diagnostic Use';
/** 809.10(c)(2)(i). */
export const RUO_STATEMENT = 'For Research Use Only. Not for use in diagnostic procedures.';
/** 809.10(c)(2)(ii). */
export const IUO_STATEMENT = 'For Investigational Use Only. The performance characteristics of this product have not been established.';
/** 812.5(a). The label bears "Federal" or "United States". */
export const INVESTIGATIONAL_CAUTION_STATEMENT = 'CAUTION—Investigational device. Limited by Federal (or United States) law to investigational use.';

type Ivd = Omit<LabelElement, 'basis' | 'applicability' | 'condition'> & { basisDetail: RegulatoryBasis };
const ivd = (condition: string) => (e: Ivd): LabelElement => ({ ...e, applicability: 'conditional', condition, basis: e.basisDetail.ref });
const IVD_CONDITION = 'in vitro diagnostic product, not shipped under the 809.10(c)(2) RUO/IUO exemption';

/** 21 CFR 809.10(a) — the IVD label. Paragraph numbers inside (a) are not encoded: they were not read. */
const FDA_IVD_LABEL_ELEMENTS: LabelElement[] = ([
  { id: 'ivd_names', label: 'Proprietary name and established (common or usual) name', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10) },
  { id: 'ivd_intended_use', label: 'Intended use or uses of the product', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['intended use', 'intended uses'] } },
  { id: 'ivd_use_statement', label: `“${IVD_USE_STATEMENT}” and any other limiting statement appropriate to the intended use`, statement: IVD_USE_STATEMENT, basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { statementVariants: [IVD_USE_STATEMENT] } },
  { id: 'ivd_reactive_ingredients', label: 'Reagent: established name and quantity, proportion or concentration of each reactive ingredient (biological material: source and measure of activity)', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['reactive ingredient', 'reactive ingredients'] } },
  { id: 'ivd_warnings', label: 'Statement of warnings or precautions for users (16 CFR part 1500 and any other warning appropriate to the hazard)', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['warning', 'warnings', 'precaution', 'precautions'] } },
  { id: 'ivd_storage', label: 'Reagent: storage instructions adequate to protect stability (temperature, light, humidity; also for the reconstituted or mixed product)', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['storage', 'store at', 'stored at'] } },
  { id: 'ivd_expiry', label: 'Reagent: expiration date based on the stated storage instructions (a means of assuring identity, strength, quality and purity at the time of use)', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['expiration', 'expiry', 'use by'] } },
  { id: 'ivd_net_quantity', label: 'Reagent: net quantity of contents (weight, volume, numerical count or a combination)', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['net quantity', 'net contents'] } },
  { id: 'ivd_name_place', label: 'Name and place of business of manufacturer, packer or distributor', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['manufactured by', 'distributed by', 'manufacturer'] } },
  { id: 'ivd_lot', label: 'Lot or control number, identified as such, from which the complete manufacturing history can be determined', basisDetail: regulatorText('21 CFR 809.10(a)', ECFR_809_10), match: { phrases: ['lot', 'control number'] } },
] as Ivd[]).map(ivd(IVD_CONDITION));

/** 21 CFR 809.10(b) — the package insert, in the regulation's order. */
const FDA_IVD_INSERT_ITEMS: LabelElement[] = ([
  { id: 'pi_b1_names', label: 'Proprietary name and established name', basisDetail: regulatorText('21 CFR 809.10(b)(1)', ECFR_809_10) },
  { id: 'pi_b2_intended_use', label: 'Intended use(s) and type of procedure (qualitative or quantitative)', basisDetail: regulatorText('21 CFR 809.10(b)(2)', ECFR_809_10), match: { headings: ['intended use', 'intended uses'] } },
  { id: 'pi_b3_summary', label: 'Summary and explanation of the test', basisDetail: regulatorText('21 CFR 809.10(b)(3)', ECFR_809_10), match: { headings: ['summary and explanation', 'summary'] } },
  { id: 'pi_b4_principles', label: 'Chemical, physical, physiological or biological principles of the procedure', basisDetail: regulatorText('21 CFR 809.10(b)(4)', ECFR_809_10), match: { headings: ['principle', 'principles'] } },
  { id: 'pi_b5_reagents', label: 'Reagents (reactive ingredients, warnings, preparation, storage, instability indications)', basisDetail: regulatorText('21 CFR 809.10(b)(5)', ECFR_809_10), match: { headings: ['reagent', 'reagents'] } },
  { id: 'pi_b6_instruments', label: 'Instruments (use, installation, principles of operation, calibration, limitations, maintenance)', basisDetail: regulatorText('21 CFR 809.10(b)(6)', ECFR_809_10), match: { headings: ['instrument', 'instruments'] } },
  { id: 'pi_b7_specimen', label: 'Specimen collection and preparation for analysis', basisDetail: regulatorText('21 CFR 809.10(b)(7)', ECFR_809_10), match: { headings: ['specimen', 'specimens', 'sample collection'] } },
  { id: 'pi_b8_procedure', label: 'Procedure: step-by-step outline from reception of the specimen to obtaining results', basisDetail: regulatorText('21 CFR 809.10(b)(8)', ECFR_809_10), match: { headings: ['procedure', 'test procedure', 'assay procedure'] } },
  { id: 'pi_b8vi_quality_control', label: 'Quality control: kinds of procedures and materials, positive/negative controls, satisfactory limits of performance', basisDetail: regulatorText('21 CFR 809.10(b)(8)(vi)', ECFR_809_10), match: { headings: ['quality control'] } },
  { id: 'pi_b9_results', label: 'Results: how results are calculated and interpreted', basisDetail: regulatorText('21 CFR 809.10(b)(9)', ECFR_809_10), match: { headings: ['results', 'interpretation of results', 'calculation of results'] } },
  { id: 'pi_b10_limitations', label: 'Limitation of the procedure (extrinsic factors, interfering substances, need for further testing)', basisDetail: regulatorText('21 CFR 809.10(b)(10)', ECFR_809_10), match: { headings: ['limitation', 'limitations'] } },
  { id: 'pi_b11_expected_values', label: 'Expected values: ranges, how established, populations studied', basisDetail: regulatorText('21 CFR 809.10(b)(11)', ECFR_809_10), match: { headings: ['expected value', 'expected values', 'reference interval', 'reference intervals', 'reference range', 'reference ranges'] } },
  { id: 'pi_b12_performance', label: 'Specific performance characteristics: accuracy, precision, specificity and sensitivity, as appropriate', basisDetail: regulatorText('21 CFR 809.10(b)(12)', ECFR_809_10), match: { headings: ['specific performance characteristics', 'performance characteristics'] } },
  { id: 'pi_b13_bibliography', label: 'Bibliography: pertinent references keyed to the text', basisDetail: regulatorText('21 CFR 809.10(b)(13)', ECFR_809_10), match: { headings: ['bibliography', 'references'] } },
  { id: 'pi_b14_name_place', label: 'Name and place of business of manufacturer, packer or distributor', basisDetail: regulatorText('21 CFR 809.10(b)(14)', ECFR_809_10), match: { phrases: ['manufactured by', 'distributed by', 'manufacturer'] } },
  { id: 'pi_b15_revision_date', label: 'Date of issuance of the last revision of the labeling, identified as such', basisDetail: regulatorText('21 CFR 809.10(b)(15)', ECFR_809_10), match: { phrases: ['revised', 'revision', 'date of issuance'] } },
] as Ivd[]).map(ivd(IVD_CONDITION));

/** 21 CFR 809.10(c)(2) — the statements that exempt an RUO/IUO shipment from (a) and (b). */
const FDA_RUO_STATEMENT: LabelElement = ivd('IVD in the laboratory research phase (RUO)')({
  id: 'ivd_ruo_statement', label: `“${RUO_STATEMENT}” — prominently, on all labeling`, statement: RUO_STATEMENT,
  basisDetail: regulatorText('21 CFR 809.10(c)(2)(i)', ECFR_809_10), match: { statementVariants: [RUO_STATEMENT] },
});
const FDA_IUO_STATEMENT: LabelElement = ivd('IVD shipped for product testing or clinical investigation before full commercial marketing (IUO)')({
  id: 'ivd_iuo_statement', label: `“${IUO_STATEMENT}” — prominently, on all labeling`, statement: IUO_STATEMENT,
  basisDetail: regulatorText('21 CFR 809.10(c)(2)(ii)', ECFR_809_10), match: { statementVariants: [IUO_STATEMENT] },
});

/** 21 CFR 812.5 — an investigational device. For an IVD, not when the study is exempt under 812.2(c)(3). */
const INVESTIGATIONAL_CONDITION = 'investigational device (for an IVD: unless the study is exempt under 21 CFR 812.2(c)(3))';
const FDA_INVESTIGATIONAL_ELEMENTS: LabelElement[] = ([
  {
    id: 'inv_caution_statement', label: `“${INVESTIGATIONAL_CAUTION_STATEMENT}” on the device or its immediate package`, statement: INVESTIGATIONAL_CAUTION_STATEMENT,
    basisDetail: regulatorText('21 CFR 812.5(a)', ECFR_812_5),
    match: { statementVariants: ['CAUTION—Investigational device. Limited by Federal law to investigational use.', 'CAUTION—Investigational device. Limited by United States law to investigational use.', INVESTIGATIONAL_CAUTION_STATEMENT] },
  },
  { id: 'inv_name_place', label: 'Name and place of business of manufacturer, packer or distributor', basisDetail: regulatorText('21 CFR 812.5(a)', ECFR_812_5), match: { phrases: ['manufactured by', 'distributed by', 'manufacturer'] } },
  { id: 'inv_quantity', label: 'Quantity of contents, if appropriate', basisDetail: regulatorText('21 CFR 812.5(a)', ECFR_812_5), match: { phrases: ['quantity', 'contents'] } },
  { id: 'inv_hazards', label: 'All relevant contraindications, hazards, adverse effects, interfering substances or devices, warnings and precautions', basisDetail: regulatorText('21 CFR 812.5(a)', ECFR_812_5), match: { phrases: ['contraindication', 'contraindications'] } },
  { id: 'inv_no_safety_claims', label: 'Must not be false or misleading, and must not represent the device as safe or effective for the purposes under investigation', prohibition: true, basisDetail: regulatorText('21 CFR 812.5(b)', ECFR_812_5) },
] as Ivd[]).map(ivd(INVESTIGATIONAL_CONDITION));

/** Where the 812.2(c)(3) exemption is stated; carried in the result notes. */
const IVD_EXEMPTION_BASIS: RegulatoryBasis = regulatorText('21 CFR 812.2(c)(3)', ECFR_812_2);

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
  /** 21 CFR 801 elements, plus 812.5 for an investigational device. */
  fdaLabel: LabelElement[];
  /** IVD only: 809.10(a) label elements, and the 809.10(c)(2) RUO/IUO statements. */
  fdaIvdLabel: LabelElement[];
  /** IVD only: 809.10(b) package-insert items. Empty under the 809.10(c)(2) exemption. */
  fdaIvdInsert: LabelElement[];
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
  const fda = fdaInVitroAndInvestigational(facts);
  return {
    fdaLabel: [...filterApplicable(FDA_LABEL_ELEMENTS, met, byId), ...fda.investigational],
    fdaIvdLabel: fda.ivdLabel,
    fdaIvdInsert: fda.ivdInsert,
    mdrLabel: filterApplicable(MDR_LABEL_ELEMENTS, met, byId),
    ifuSections: filterApplicable(IFU_SECTIONS, met, byId),
    symbols: ISO_15223_SYMBOLS.filter((s) => s.applicability === 'always' || met[s.id] === true),
    reviewerQuestions: LABELING_REVIEWER_QUESTIONS,
    notes: [
      ...(facts.implantable ? ['Implantable devices also require an implant card + patient information (MDR Article 18).'] : []),
      ...fda.notes,
    ],
  };
}

interface FdaIvdSelection {
  isIvd: boolean;
  investigational: boolean;
  ruo: boolean;
  iuo: boolean;
  /** Shipped under 809.10(c): the 809.10(a) and (b) elements are not listed. */
  exemptFromAB: boolean;
  /** The IVD study is affirmed exempt from part 812 under 812.2(c)(3). */
  ivdStudyExempt: boolean;
}

function selectFdaIvd(facts: LabelingFacts): FdaIvdSelection {
  const isIvd = facts.isIvd === true;
  const investigational = facts.forClinicalInvestigation === true;
  const ruo = isIvd && facts.isRuo === true;
  const iuo = isIvd && (facts.isIuo === true || investigational);
  return { isIvd, investigational, ruo, iuo, exemptFromAB: ruo || iuo, ivdStudyExempt: isIvd && investigational && facts.ivdStudyExemptUnder8122c3 === true };
}

function fdaIvdNotes(facts: LabelingFacts, sel: FdaIvdSelection): string[] {
  const notes: string[] = [];
  if (!sel.isIvd && (facts.isRuo === true || facts.isIuo === true)) {
    notes.push('RUO/IUO statements apply to in vitro diagnostic products (21 CFR 809.10(c)); isIvd was not set, so none was added.');
  }
  if (sel.exemptFromAB) {
    notes.push('21 CFR 809.10(c): an RUO or IUO shipment that bears the prescribed 809.10(c)(2) statement, or a shipment for an investigation that complies with part 812 (809.10(c)(1)), is exempt from the 809.10(a) label and 809.10(b) package-insert requirements, so they are not listed. They apply once the product is marketed as an IVD.');
  }
  if (sel.isIvd && sel.investigational) {
    notes.push(sel.ivdStudyExempt
      ? `The IVD study is stated exempt under ${IVD_EXEMPTION_BASIS.ref} (noninvasive, no significant-risk invasive sampling, no energy introduced, not used as a diagnostic procedure without confirmation, and complies with 809.10(c)): the 809.10(c)(2)(ii) statement applies and the 812.5 elements do not.`
      : `The 812.5 elements are listed because the IVD study is not stated exempt under ${IVD_EXEMPTION_BASIS.ref}. If every exemption condition is met, set ivdStudyExemptUnder8122c3.`);
  }
  return notes;
}

/**
 * The FDA IVD (809.10) and investigational (812.5) selection.
 *  - An IVD gets 809.10(a) and (b) unless it ships under the 809.10(c)
 *    exemption, which requires the RUO or IUO statement instead.
 *  - An investigational IVD is IUO. It also gets 812.5 unless the study is
 *    affirmed exempt under 812.2(c)(3); unknown is not exempt.
 *  - A non-IVD investigational device gets 812.5.
 */
function fdaInVitroAndInvestigational(facts: LabelingFacts): { ivdLabel: LabelElement[]; ivdInsert: LabelElement[]; investigational: LabelElement[]; notes: string[] } {
  const sel = selectFdaIvd(facts);
  const ivdLabel = sel.isIvd
    ? [...(sel.exemptFromAB ? [] : FDA_IVD_LABEL_ELEMENTS), ...(sel.ruo ? [FDA_RUO_STATEMENT] : []), ...(sel.iuo ? [FDA_IUO_STATEMENT] : [])]
    : [];
  return {
    ivdLabel,
    ivdInsert: sel.isIvd && !sel.exemptFromAB ? FDA_IVD_INSERT_ITEMS : [],
    investigational: sel.investigational && !sel.ivdStudyExempt ? FDA_INVESTIGATIONAL_ELEMENTS : [],
    notes: fdaIvdNotes(facts, sel),
  };
}

// ── Authored labeling check ──────────────────────────────────────────────────

/**
 * One authored labeling section of the program (k510 D2; De Novo E1 / E2).
 * The caller reads the governed row: `text` through sectionPlainText and
 * `authored` through governedSectionIsAuthored
 * (pathway-engines/estar/estar-content-leaves.ts) — the one authored-ness rule.
 */
export interface LabelingSectionInput {
  key: string;
  label?: string;
  text: string;
  authored: boolean;
}

export type LabelingCheckStatus = 'found' | 'not_found' | 'not_checkable';

export interface LabelingCheckRow {
  set: 'fdaLabel' | 'fdaIvdLabel' | 'fdaIvdInsert';
  id: string;
  label: string;
  basis: string;
  basisDetail?: RegulatoryBasis;
  status: LabelingCheckStatus;
  /** The heading, phrase or statement that was found, and the section it was found in. */
  matched?: string;
  sectionKey?: string;
  reason?: string;
}

export interface AuthoredLabelingCheck {
  rows: LabelingCheckRow[];
  counts: Record<LabelingCheckStatus, number>;
  /** Keys of the authored sections that were read. */
  checkedSectionKeys: string[];
  note: string;
}

const CHECK_NOTE = 'found means the heading, phrase or statement is present in the authored labeling. It is not a judgement that the content meets the regulation, and not_found means only that the fixed wording was not seen.';

/** Lower-case, one kind of dash and quote, whitespace (line breaks too) collapsed to single spaces. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Literal phrase matching with the existing ASCII letter/digit boundaries. */
function hasPhrase(text: string, phrase: string): boolean {
  let start = text.indexOf(phrase);
  while (start !== -1) {
    const end = start + phrase.length;
    if ((start === 0 || !/[a-z0-9]/.test(text[start - 1])) &&
        (end === text.length || !/[a-z0-9]/.test(text[end]))) return true;
    start = text.indexOf(phrase, start + 1);
  }
  return false;
}

/** A heading line: leading markdown, numbering and punctuation stripped. */
function headingLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => normalize(l).replace(/^[#>*\s]*/, '').replace(/^(\(?[0-9ivx]+[.)]|[0-9]+(\.[0-9]+)*\.?)\s*/, '').trim()).filter((l) => l.length > 0 && l.length <= 80);
}

function findIn(element: LabelElement, section: LabelingSectionInput): string | undefined {
  const m = element.match!;
  const body = normalize(section.text);
  for (const s of m.statementVariants ?? []) {
    if (body.includes(normalize(s))) return s;
  }
  for (const p of m.phrases ?? []) {
    if (hasPhrase(body, normalize(p))) return p;
  }
  const lines = m.headings ? headingLines(section.text) : [];
  for (const h of m.headings ?? []) {
    const heading = normalize(h);
    if (lines.some(l => l.startsWith(heading) && (l.length === heading.length || !/[a-z0-9]/.test(l[heading.length])))) return h;
  }
  return undefined;
}

/**
 * Check a program's authored labeling against the FDA elements its facts
 * require. Pure and deterministic. Every row is found, not_found or
 * not_checkable:
 *  - not_checkable when no labeling section is authored, when the element has
 *    no fixed wording to look for (product-specific names), or when it is a
 *    prohibition;
 *  - otherwise found if any authored section carries the heading, phrase or
 *    statement, else not_found.
 * Never a compliance verdict.
 */
export function checkAuthoredLabeling(facts: LabelingFacts, sections: ReadonlyArray<LabelingSectionInput>): AuthoredLabelingCheck {
  const req = deviceLabelingRequirements(facts);
  const authored = sections.filter((s) => s.authored && s.text.trim().length > 0);
  const sets: Array<[LabelingCheckRow['set'], LabelElement[]]> = [['fdaLabel', req.fdaLabel], ['fdaIvdLabel', req.fdaIvdLabel], ['fdaIvdInsert', req.fdaIvdInsert]];
  const rows: LabelingCheckRow[] = [];
  for (const [set, elements] of sets) {
    for (const e of elements) {
      const base = { set, id: e.id, label: e.label, basis: e.basis, ...(e.basisDetail ? { basisDetail: e.basisDetail } : {}) };
      if (authored.length === 0) {
        rows.push({ ...base, status: 'not_checkable', reason: 'No authored labeling section (k510 D2; De Novo E1, E2) to read.' });
      } else if (e.prohibition) {
        rows.push({ ...base, status: 'not_checkable', reason: 'A prohibition on what labeling says is not decided by phrase matching; a reviewer reads it.' });
      } else if (!e.match) {
        rows.push({ ...base, status: 'not_checkable', reason: 'No fixed wording is encoded for this element (it is product-specific).' });
      } else {
        const hit = authored.map((s) => ({ s, m: findIn(e, s) })).find((x) => x.m !== undefined);
        rows.push(hit ? { ...base, status: 'found', matched: hit.m, sectionKey: hit.s.key } : { ...base, status: 'not_found' });
      }
    }
  }
  const counts: Record<LabelingCheckStatus, number> = { found: 0, not_found: 0, not_checkable: 0 };
  for (const r of rows) counts[r.status] += 1;
  return { rows, counts, checkedSectionKeys: authored.map((s) => s.key), note: CHECK_NOTE };
}

export default { deviceLabelingRequirements, checkAuthoredLabeling, ISO_15223_SYMBOLS };
