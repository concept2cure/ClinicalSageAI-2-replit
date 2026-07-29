/**
 * Labeling-authoring client model (roadmap E9) — the US (USPI/PLR) vs EU
 * (SmPC/QRD) mode definitions and the deterministic currency-gate verdict shape
 * the labeling UI renders.
 *
 * Kept in lockstep with server/services/ana/labeling-authoring.ts (the
 * authoritative section guard). The verdict here is whatever
 * `review_label_currency` returned — the UI never derives or guesses currency;
 * it surfaces the server's deterministic finding set.
 */

export type LabelingMode = 'us' | 'eu';

export interface LabelingModeSpec {
  mode: LabelingMode;
  /** Short toggle label (e.g. "US"). */
  short: string;
  /** Full label (e.g. "US Prescribing Information (USPI / PLR)"). */
  label: string;
  /** Structural convention surfaced in the UI. */
  structure: 'PLR' | 'QRD';
  /** Regulatory basis citation. */
  basis: string;
  /** Mandatory section headers, in document order — the section guard. */
  requiredSections: { number: string; header: string }[];
}

const US_REQUIRED = [
  { number: '1', header: '1 INDICATIONS AND USAGE' },
  { number: '2', header: '2 DOSAGE AND ADMINISTRATION' },
  { number: '3', header: '3 DOSAGE FORMS AND STRENGTHS' },
  { number: '4', header: '4 CONTRAINDICATIONS' },
  { number: '5', header: '5 WARNINGS AND PRECAUTIONS' },
  { number: '6', header: '6 ADVERSE REACTIONS' },
  { number: '7', header: '7 DRUG INTERACTIONS' },
  { number: '8', header: '8 USE IN SPECIFIC POPULATIONS' },
  { number: '10', header: '10 OVERDOSAGE' },
  { number: '11', header: '11 DESCRIPTION' },
  { number: '12', header: '12 CLINICAL PHARMACOLOGY' },
  { number: '13', header: '13 NONCLINICAL TOXICOLOGY' },
  { number: '14', header: '14 CLINICAL STUDIES' },
  { number: '16', header: '16 HOW SUPPLIED/STORAGE AND HANDLING' },
  { number: '17', header: '17 PATIENT COUNSELING INFORMATION' },
];

const EU_REQUIRED = [
  { number: '1', header: '1. NAME OF THE MEDICINAL PRODUCT' },
  { number: '2', header: '2. QUALITATIVE AND QUANTITATIVE COMPOSITION' },
  { number: '3', header: '3. PHARMACEUTICAL FORM' },
  { number: '4.1', header: '4.1 Therapeutic indications' },
  { number: '4.2', header: '4.2 Posology and method of administration' },
  { number: '4.3', header: '4.3 Contraindications' },
  { number: '4.4', header: '4.4 Special warnings and precautions for use' },
  { number: '4.5', header: '4.5 Interaction with other medicinal products and other forms of interaction' },
  { number: '4.6', header: '4.6 Fertility, pregnancy and lactation' },
  { number: '4.7', header: '4.7 Effects on ability to drive and use machines' },
  { number: '4.8', header: '4.8 Undesirable effects' },
  { number: '4.9', header: '4.9 Overdose' },
  { number: '5.1', header: '5.1 Pharmacodynamic properties' },
  { number: '5.2', header: '5.2 Pharmacokinetic properties' },
  { number: '5.3', header: '5.3 Preclinical safety data' },
  { number: '6.1', header: '6.1 List of excipients' },
  { number: '6.4', header: '6.4 Special precautions for storage' },
  { number: '7', header: '7. MARKETING AUTHORISATION HOLDER' },
];

export const LABELING_MODES: Record<LabelingMode, LabelingModeSpec> = {
  us: {
    mode: 'us',
    short: 'US',
    label: 'US Prescribing Information (USPI / PLR)',
    structure: 'PLR',
    basis: 'FDA PLR; 21 CFR 201.56 & 201.57',
    requiredSections: US_REQUIRED,
  },
  eu: {
    mode: 'eu',
    short: 'EU',
    label: 'EU Summary of Product Characteristics (SmPC / QRD)',
    structure: 'QRD',
    basis: 'EMA QRD template; Directive 2001/83/EC Art. 11',
    requiredSections: EU_REQUIRED,
  },
};

/** Mandatory section headers for a mode — the section guard / required_strings. */
export function requiredSectionHeaders(mode: LabelingMode): string[] {
  return LABELING_MODES[mode].requiredSections.map((s) => s.header);
}

/** The `required_strings` derivation for verify_docx_against_source. */
export function deriveRequiredStrings(mode: LabelingMode): string[] {
  return requiredSectionHeaders(mode);
}

export interface SectionChecklistItem {
  number: string;
  header: string;
  present: boolean;
}

/**
 * Section-guard checklist for a draft. Deterministic, case-insensitive,
 * whitespace-tolerant. Mirrors checkSectionGuard on the server.
 */
export function checkSectionGuard(
  mode: LabelingMode,
  draftText: string,
): { items: SectionChecklistItem[]; missing: string[]; complete: boolean } {
  const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const haystack = norm(draftText);
  const items = LABELING_MODES[mode].requiredSections.map((s) => ({
    number: s.number,
    header: s.header,
    present: haystack.includes(norm(s.header)),
  }));
  const missing = items.filter((i) => !i.present).map((i) => i.header);
  return { items, missing, complete: missing.length === 0 };
}

/* ─────────────────────────────────────────────────────────────────────────
   Currency gate — DETERMINISTIC. This is exactly what `review_label_currency`
   (server evaluateLabelCurrency) returned; the UI never re-derives it.
   ───────────────────────────────────────────────────────────────────────── */

export type LabelRiskLevel = 'high' | 'medium' | 'low';

export interface LabelCurrencyFinding {
  severity: 'critical' | 'major' | 'minor';
  message: string;
  basis: string;
}

export interface LabelCurrencyVerdict {
  /** The deterministic risk level from the server gate. */
  riskLevel: LabelRiskLevel;
  /** Cited findings; empty ⇒ all approved markets carry a current label. */
  findings: LabelCurrencyFinding[];
}

/** True only when the deterministic gate found no stale/missing label. */
export function isLabelCurrent(v: LabelCurrencyVerdict): boolean {
  return v.findings.length === 0;
}
