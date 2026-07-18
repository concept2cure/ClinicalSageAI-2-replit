/**
 * EU SmPC (Summary of Product Characteristics) — QRD template section catalog.
 *
 * The authoritative section structure of an EU SmPC per the EMA/HMA QRD
 * (Quality Review of Documents) human product-information template (v10.x):
 * sections 1–10 with the section-4/5/6 sub-sections. Pure, deterministic, DB-free
 * so it can be unit-tested and drives both the read route's skeleton and the
 * completeness rollup. This is the EU companion to the USPI (21 CFR 201.57)
 * structure the c2c_labeling_pi store already carries.
 *
 * @module server/services/labeling/smpc-qrd-catalog
 * @compliance EMA/HMA QRD human product-information template; Dir 2001/83/EC Art. 11.
 */

export interface SmpcSection {
  /** QRD section number, e.g. '4', '4.1'. */
  number: string;
  title: string;
  /** 0 = top-level section, 1 = sub-section (e.g. 4.1). */
  depth: number;
  /** Sections a first authorisation must have authored content in to be complete. */
  required: boolean;
}

/** The QRD SmPC section tree (sections 1–10 + 4.x / 5.x / 6.x sub-sections). */
export const SMPC_QRD_SECTIONS: SmpcSection[] = [
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
  { number: '6.6', title: 'Special precautions for disposal and other handling', depth: 1, required: true },
  { number: '7', title: 'Marketing authorisation holder', depth: 0, required: true },
  { number: '8', title: 'Marketing authorisation number(s)', depth: 0, required: false },
  { number: '9', title: 'Date of first authorisation / renewal of the authorisation', depth: 0, required: false },
  { number: '10', title: 'Date of revision of the text', depth: 0, required: false },
];

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
