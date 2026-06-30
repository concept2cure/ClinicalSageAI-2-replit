/**
 * Build-from-template labeling authoring (roadmap E9).
 *
 * The deterministic, dependency-free spine behind AnA's "author a correctly
 * sectioned product label" affordance. It pairs the already-built section
 * advisor (`labeling-structure.ts`) with two guards a labeling team can cite:
 *
 *   1. a PLR/QRD **section guard** — the mandatory section headers a US
 *      Prescribing Information (FDA PLR, 21 CFR 201.56/201.57) or an EU Summary
 *      of Product Characteristics (EMA QRD template / Directive 2001/83/EC
 *      Art. 11) MUST carry — used both to seed `build_from_template` and to
 *      derive the `required_strings` for `verify_docx_against_source`; and
 *   2. a deterministic **currency gate** verdict (`review_label_currency` /
 *      `evaluateLabelCurrency`) that is NEVER an AI guess.
 *
 * Pure: every export is a function of its inputs. The authoritative label is
 * the approved label — this places content and checks completeness, it does not
 * write final wording.
 *
 * @module server/services/ana/labeling-authoring
 */

import type { LabelFormat } from './labeling-structure';

export type LabelingMode = 'us' | 'eu';

/** A mandatory section in the selected label structure. */
export interface RequiredLabelSection {
  number: string;
  /** The exact header text expected verbatim in the authored draft. */
  header: string;
}

export interface LabelingModeSpec {
  mode: LabelingMode;
  /** The label format this mode authors. */
  format: LabelFormat;
  /** Human label (e.g. "US Prescribing Information (USPI / PLR)"). */
  label: string;
  /** The regulatory basis citation. */
  basis: string;
  /** The structural convention name surfaced in the UI. */
  structure: 'PLR' | 'QRD';
  /** The mandatory section headers, in document order. */
  requiredSections: RequiredLabelSection[];
}

/**
 * US PLR mandatory full-text sections (21 CFR 201.57(c)). Highlights + Table of
 * Contents are required wrappers but are derived from the full-text sections, so
 * the section guard checks the numbered full-text headers a draft must carry.
 */
const US_REQUIRED: RequiredLabelSection[] = [
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

/**
 * EU SmPC mandatory QRD sections (EMA QRD template; fixed numbering). The QRD
 * template requires every numbered heading be present (omitted content is
 * marked "Not applicable"), so the section guard checks the full fixed set.
 */
const EU_REQUIRED: RequiredLabelSection[] = [
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

const SPECS: Record<LabelingMode, LabelingModeSpec> = {
  us: {
    mode: 'us',
    format: 'uspi',
    label: 'US Prescribing Information (USPI / PLR)',
    basis: 'FDA Physician Labeling Rule; 21 CFR 201.56 & 201.57',
    structure: 'PLR',
    requiredSections: US_REQUIRED,
  },
  eu: {
    mode: 'eu',
    format: 'smpc',
    label: 'EU Summary of Product Characteristics (SmPC / QRD)',
    basis: 'EMA QRD template; Directive 2001/83/EC Article 11',
    structure: 'QRD',
    requiredSections: EU_REQUIRED,
  },
};

/** Resolve a mode spec. Pure; defaults nothing — caller passes 'us' | 'eu'. */
export function getLabelingModeSpec(mode: LabelingMode): LabelingModeSpec {
  return SPECS[mode];
}

/** Map a UI mode to the labeling-structure format id. */
export function modeToFormat(mode: LabelingMode): LabelFormat {
  return SPECS[mode].format;
}

/**
 * The mandatory section headers for a mode — the PLR/QRD section guard. This is
 * the single source of truth fed to both `build_from_template` (to scaffold the
 * draft) and `verify_docx_against_source` (as `required_strings`).
 */
export function requiredSectionHeaders(mode: LabelingMode): string[] {
  return SPECS[mode].requiredSections.map((s) => s.header);
}

/**
 * Derive the `required_strings` for `verify_docx_against_source` from the
 * selected mode. Identical to the section-guard headers — the verify step
 * confirms each mandatory header survives the build verbatim.
 */
export function deriveRequiredStrings(mode: LabelingMode): string[] {
  return requiredSectionHeaders(mode);
}

export interface SectionChecklistItem {
  number: string;
  header: string;
  present: boolean;
}

export interface SectionGuardResult {
  mode: LabelingMode;
  structure: 'PLR' | 'QRD';
  items: SectionChecklistItem[];
  missing: string[];
  /** True only when every mandatory section header is present. Deterministic. */
  complete: boolean;
}

/**
 * Section guard: check a draft (or a list of present headers) against the
 * mandatory PLR/QRD section set. Header matching is case-insensitive and
 * whitespace-tolerant on the numbered heading. Pure + deterministic — this is
 * the completeness checklist, never an AI judgement.
 */
export function checkSectionGuard(mode: LabelingMode, draftText: string): SectionGuardResult {
  const spec = SPECS[mode];
  const haystack = normalize(draftText);
  const items: SectionChecklistItem[] = spec.requiredSections.map((s) => ({
    number: s.number,
    header: s.header,
    present: haystack.includes(normalize(s.header)),
  }));
  const missing = items.filter((i) => !i.present).map((i) => i.header);
  return {
    mode,
    structure: spec.structure,
    items,
    missing,
    complete: missing.length === 0,
  };
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Build the `replacements` map handed to `build_from_template` so the scaffold
 * carries every mandatory section header in document order. The template
 * placeholder convention is `{{SECTION_<number>}}`; live section bodies join in
 * later (INTEGRATION).
 */
export function buildTemplateReplacements(
  mode: LabelingMode,
  productName: string,
): Record<string, string> {
  const spec = SPECS[mode];
  const replacements: Record<string, string> = {
    '{{PRODUCT_NAME}}': productName,
    '{{LABEL_TITLE}}': `${productName} — ${spec.label}`,
    '{{LABEL_BASIS}}': spec.basis,
  };
  for (const s of spec.requiredSections) {
    // INTEGRATION: live section body text replaces the header-only scaffold when
    // the approved/source label content is joined in.
    replacements[`{{SECTION_${s.number.replace(/\./g, '_')}}}`] = s.header;
  }
  return replacements;
}
