/**
 * EU SmPC (Summary of Product Characteristics) — QRD template section catalog.
 *
 * The authoritative section structure of an EU SmPC per the EMA/HMA QRD
 * (Quality Review of Documents) human product-information template (v10.4,
 * 02/2024; see SMPC_QRD_BASIS): sections 1–10 with the section-4/5/6
 * sub-sections, and 11–12 for radiopharmaceuticals only. Pure, deterministic, DB-free
 * so it can be unit-tested and drives both the read route's skeleton and the
 * completeness rollup. This is the EU companion to the USPI (21 CFR 201.57)
 * structure the c2c_labeling_pi store already carries.
 *
 * @module server/services/labeling/smpc-qrd-catalog
 * @compliance EMA/HMA QRD human product-information template; Dir 2001/83/EC Art. 11.
 */

import type { E3Basis } from '../ind/ctd/types';

/**
 * Basis for the SmPC headings below. The EMA-hosted QRD v10.4 template
 * (02/2024) was found by search on 2026-10-05, but its PDF could not be read
 * (ema.europa.eu is refused by this environment's egress proxy), so the
 * heading wording is recall until the template text is read.
 */
export const SMPC_QRD_BASIS: E3Basis = {
  ref: 'EMA QRD human product-information template v10.4 (02/2024), Annex I SmPC',
  confidence: 'recall',
  url: 'https://www.ema.europa.eu/en/documents/template-form/qrd-product-information-template-version-104-highlighted_en.pdf',
};

export interface SmpcSection {
  /** QRD section number, e.g. '4', '4.1'. */
  number: string;
  /** QRD heading in sentence case; `qrdHeader` gives the form an SmPC prints. */
  title: string;
  /** 0 = top-level section, 1 = sub-section (e.g. 4.1). */
  depth: number;
  /**
   * Sections a first authorisation must have authored content in to be complete.
   * This is content readiness, not heading presence: every heading 1-10 is in
   * the section guard (`qrdGuardHeader`) whether or not this is set.
   */
  required: boolean;
  /**
   * The heading the section guard looks for when the QRD heading carries
   * optional bracketed text. 6.6 reads 'Special precautions for disposal
   * <and other handling>' in the template; a draft that leaves the bracket out
   * is correct, so the guard looks for the part that is always there.
   */
  guardHeader?: string;
  /** Sections 11 and 12 exist only in the SmPC of a radiopharmaceutical. */
  radiopharmaceuticalOnly?: true;
}

/**
 * The QRD SmPC section tree: sections 1-10 with the 4.x / 5.x / 6.x
 * sub-sections, then 11 and 12, which only a radiopharmaceutical carries.
 * The section guard (`labeling-authoring.ts`), the placement advisor
 * (`labeling-structure.ts`), `structure_smpc`
 * (`labeling-intelligence-knowledge.ts`) and the document template
 * (`document-template-library.ts`) read it and add their own per-number
 * overlays. One copy still holds its own literals:
 * `server/services/global-ri/labeling-requirements.ts` LABELING_REQUIREMENTS.EMA,
 * which also lacks 5.1-5.3 and 6.1-6.6. Until it reads this catalog, this is
 * not the only list of SmPC headings.
 */
const SMPC_QRD_TREE: SmpcSection[] = [
  { number: '1', title: 'Name of the medicinal product', depth: 0, required: true },
  { number: '2', title: 'Qualitative and quantitative composition', depth: 0, required: true },
  { number: '3', title: 'Pharmaceutical form', depth: 0, required: true },
  { number: '4', title: 'Clinical particulars', depth: 0, required: true },
  { number: '4.1', title: 'Therapeutic indications', depth: 1, required: true },
  { number: '4.2', title: 'Posology and method of administration', depth: 1, required: true },
  { number: '4.3', title: 'Contraindications', depth: 1, required: true },
  { number: '4.4', title: 'Special warnings and precautions for use', depth: 1, required: true },
  { number: '4.5', title: 'Interaction with other medicinal products and other forms of interaction', depth: 1, required: true },
  { number: '4.6', title: 'Fertility, pregnancy and lactation', depth: 1, required: true },
  { number: '4.7', title: 'Effects on ability to drive and use machines', depth: 1, required: true },
  { number: '4.8', title: 'Undesirable effects', depth: 1, required: true },
  { number: '4.9', title: 'Overdose', depth: 1, required: true },
  { number: '5', title: 'Pharmacological properties', depth: 0, required: true },
  { number: '5.1', title: 'Pharmacodynamic properties', depth: 1, required: true },
  { number: '5.2', title: 'Pharmacokinetic properties', depth: 1, required: true },
  { number: '5.3', title: 'Preclinical safety data', depth: 1, required: true },
  { number: '6', title: 'Pharmaceutical particulars', depth: 0, required: true },
  { number: '6.1', title: 'List of excipients', depth: 1, required: true },
  { number: '6.2', title: 'Incompatibilities', depth: 1, required: true },
  { number: '6.3', title: 'Shelf life', depth: 1, required: true },
  { number: '6.4', title: 'Special precautions for storage', depth: 1, required: true },
  { number: '6.5', title: 'Nature and contents of container', depth: 1, required: true },
  { number: '6.6', title: 'Special precautions for disposal and other handling', depth: 1, required: true, guardHeader: '6.6 Special precautions for disposal' },
  { number: '7', title: 'Marketing authorisation holder', depth: 0, required: true },
  { number: '8', title: 'Marketing authorisation number(s)', depth: 0, required: false },
  { number: '9', title: 'Date of first authorisation/renewal of the authorisation', depth: 0, required: false },
  { number: '10', title: 'Date of revision of the text', depth: 0, required: false },
  { number: '11', title: 'Dosimetry', depth: 0, required: true, radiopharmaceuticalOnly: true },
  { number: '12', title: 'Instructions for preparation of radiopharmaceuticals', depth: 0, required: true, radiopharmaceuticalOnly: true },
];

/**
 * The SmPC sections for a product, in document order. Sections 11 and 12 are
 * included only for a radiopharmaceutical.
 */
export function smpcQrdSections(opts: { radiopharmaceutical?: boolean } = {}): SmpcSection[] {
  return SMPC_QRD_TREE.filter((s) => opts.radiopharmaceutical || !s.radiopharmaceuticalOnly);
}

/** The QRD SmPC section tree of a medicinal product that is not a radiopharmaceutical (sections 1-10). */
export const SMPC_QRD_SECTIONS: SmpcSection[] = smpcQrdSections();

/**
 * The heading as the QRD template prints it: a top-level section as
 * 'N. UPPER CASE TITLE', a sub-section as 'N.N Sentence case title'.
 */
export function qrdHeader(s: SmpcSection): string {
  return s.depth === 0 ? `${s.number}. ${s.title.toUpperCase()}` : `${s.number} ${s.title}`;
}

/** The heading the section guard requires verbatim in a draft (optional QRD text left out). */
export function qrdGuardHeader(s: SmpcSection): string {
  return s.guardHeader ?? qrdHeader(s);
}

const REQUIRED_NUMBERS = new Set(SMPC_QRD_SECTIONS.filter((s) => s.required).map((s) => s.number));

/** Authoring status of a single SmPC section. */
export type SmpcSectionStatus = 'missing' | 'draft' | 'review' | 'final';

/** A section is submission-ready when its authored content is final. */
export function isSmpcSectionReady(status: SmpcSectionStatus): boolean {
  return status === 'final';
}

export interface SmpcSectionRow extends SmpcSection {
  status: SmpcSectionStatus;
}

export interface SmpcReadiness {
  sections: SmpcSectionRow[];
  /** Required sections that are final. */
  finalRequired: number;
  /** Total required sections. */
  totalRequired: number;
  /** 0–100 over required sections. */
  completenessPct: number;
  /** True when every required section is final. */
  ready: boolean;
  /** Required section numbers not yet final. */
  outstanding: string[];
}

/**
 * Merge the persisted per-section statuses onto the QRD catalog and compute the
 * submission-readiness rollup (over REQUIRED sections). Pure. Unknown/absent
 * statuses default to 'missing'.
 */
export function buildSmpcReadiness(statusByNumber: Record<string, SmpcSectionStatus>): SmpcReadiness {
  const sections: SmpcSectionRow[] = SMPC_QRD_SECTIONS.map((s) => ({
    ...s,
    status: statusByNumber[s.number] ?? 'missing',
  }));
  const required = sections.filter((s) => s.required);
  const finalRequired = required.filter((s) => isSmpcSectionReady(s.status)).length;
  const outstanding = required.filter((s) => !isSmpcSectionReady(s.status)).map((s) => s.number);
  const totalRequired = required.length;
  return {
    sections,
    finalRequired,
    totalRequired,
    completenessPct: totalRequired > 0 ? Math.round((finalRequired / totalRequired) * 100) : 0,
    ready: totalRequired > 0 && finalRequired === totalRequired,
    outstanding,
  };
}

/** Whether a section number is part of the QRD catalog (for write validation). */
export function isKnownSmpcSection(n: string): boolean {
  return SMPC_QRD_SECTIONS.some((s) => s.number === n);
}

/** Whether a status string is a valid SmPC section status. */
export function isValidSmpcStatus(s: string): s is SmpcSectionStatus {
  return s === 'missing' || s === 'draft' || s === 'review' || s === 'final';
}

export { REQUIRED_NUMBERS };
