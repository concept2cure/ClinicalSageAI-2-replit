/**
 * The ICH M4 headings of Modules 2–5 that `CTD_AUTHORING_GUIDANCE` does not
 * carry — the structural half of the one ICH M2–M5 record
 * (docs/design/ANA_REGULATORY_RECORD.md "One ICH M2–M5 record", R5).
 *
 * `CTD_AUTHORING_GUIDANCE` holds authoring content for the codes a sponsor
 * writes. The headings around them — module roots, tables of contents, the
 * 2.6/2.7/4.2.x/5.3.x containers and their numbered subdivisions — were held
 * nowhere until 2026-10-05, so nothing in the platform could tell a real CTD
 * heading from an invented one. `ectd-fallback-templates.ts` ships
 * "MODULE 4.3.1 - SINGLE DOSE TOXICITY"; ICH M4S has 4.3 Literature References,
 * undivided, and single-dose toxicity is 4.2.3.1. `isIchHeading('4.3.1')` is
 * false.
 *
 * Two halves, never two copies: a code is in this list or it is a key of
 * `CTD_AUTHORING_GUIDANCE`, never both (pinned by
 * tests/regulatory/ich-m4-headings.test.ts). `isIchHeading` and
 * `ichHeadingTitle` read both halves.
 *
 * Scope.
 *   - Module 1 is regional and is not an ICH M4 heading; `isIchHeading` is
 *     false for every 1.x code.
 *   - Module 3: this file holds the eCTD backbone skeleton and two structural
 *     pharmaceutical-development parents (3.2.P.2.1 and 3.2.P.2.2). Module 3
 *     content and its deeper headings (3.2.A.1–3, 2.3.S.x…) belong to the CMC lane, which
 *     appends them here through the same `IchM4Heading` type. There is never a
 *     second Module 3 tree. Append-only shared file (ANA_REGULATORY_RECORD.md R0).
 *   - The tabulated nonclinical summaries (2.6.3, 2.6.5, 2.6.7) are numbered in
 *     ICH M4S by table (e.g. "2.6.7.1 Toxicology: Overview"), not by heading.
 *     Those table numbers are not modelled; `isIchHeading` is false for them.
 *
 * Basis. Each row carries its own. `M4E_R2` (regulator-text) is used only for
 * the rows whose number and wording were matched against search extracts of the
 * FDA-hosted ICH M4E(R2) on 2026-10-05. Every other row is `recall`, including
 * every ICH M4 organisation and M4S row: their wording was matched against
 * search extracts of FDA-hosted copies (fda.gov/media/71628, the FDA M4
 * organisation guidance), but `regulatory-basis.ts` declares no M4S or M4
 * constant yet, and a file in `ind/ctd` does not declare its own. The facts are
 * in docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-ich-m4-headings-facts.md.
 *
 * `ectdElement` (the ICH eCTD v3.2.2 DTD element name) is added once the DTD is
 * vendored (finding 37); `ICH_BACKBONE` is held to this record by
 * tests/regulatory/ich-backbone-parity.test.ts until it can be derived from it.
 *
 * @module server/services/ind/ctd/ich-m4-headings
 */

import type { RegulatoryBasis } from './types.js';
import { CTD_AUTHORING_GUIDANCE } from './authoring-guidance.js';
import { M4E_R2, recall } from './regulatory-basis.js';
import { normalizeCtdCode } from '../../../../shared/regulatory/section-code';

/** One structural ICH M4 heading of Modules 2–5. */
export interface IchM4Heading {
  /** Canonical CTD code ("2.7.4.2.1.1", "3.2.S"). */
  code: string;
  /** The heading as ICH M4 words it (parenthetical qualifiers shortened). */
  title: string;
  /** The enclosing heading's code; null for a module root. */
  parent: string | null;
  module: 2 | 3 | 4 | 5;
  basis: RegulatoryBasis;
}

const SEARCH_EXTRACT_NOTE =
  'wording matched against a search extract of the FDA-hosted copy on 2026-10-05; regulator-text once its constant is declared in regulatory-basis.ts';

const M4_ORG = (): RegulatoryBasis => ({
  ...recall('ICH M4(R4), Organisation of the CTD'),
  note: SEARCH_EXTRACT_NOTE,
});
const M4S = (section: string): RegulatoryBasis => ({
  ...recall(`ICH M4S(R2) ${section}`),
  note: SEARCH_EXTRACT_NOTE,
});
const M4E = (section: string): RegulatoryBasis => recall(`ICH M4E(R2) ${section}`);
const M4Q = (section: string): RegulatoryBasis => ({
  ...recall(`ICH M4Q(R1) ${section}`),
  note: 'Module 3 structure only; detailed Module 3 content is in the canonical authoring overlay',
});

type Row = readonly [code: string, title: string, basis: RegulatoryBasis];

const ROWS: readonly Row[] = [
  // ── Module 2 ────────────────────────────────────────────────────────────────
  ['2', 'Common Technical Document Summaries', M4_ORG()],
  ['2.1', 'Common Technical Document Table of Contents (Modules 2–5)', M4_ORG()],
  ['2.5.7', 'Literature References', M4E_R2],
  ['2.6', 'Nonclinical Written and Tabulated Summaries', M4_ORG()],
  ['2.6.4.1', 'Brief Summary', M4S('2.6.4.1')],
  ['2.6.4.2', 'Methods of Analysis', M4S('2.6.4.2')],
  ['2.6.4.3', 'Absorption', M4S('2.6.4.3')],
  ['2.6.4.4', 'Distribution', M4S('2.6.4.4')],
  ['2.6.4.5', 'Metabolism (Interspecies Comparison)', M4S('2.6.4.5')],
  ['2.6.4.6', 'Excretion', M4S('2.6.4.6')],
  ['2.6.4.7', 'Pharmacokinetic Drug Interactions', M4S('2.6.4.7')],
  ['2.6.4.8', 'Other Pharmacokinetic Studies', M4S('2.6.4.8')],
  ['2.6.4.9', 'Discussion and Conclusions', M4S('2.6.4.9')],
  ['2.6.4.10', 'Tables and Figures', M4S('2.6.4.10')],
  ['2.6.6.1', 'Brief Summary', M4S('2.6.6.1')],
  ['2.6.6.2', 'Single-Dose Toxicity', M4S('2.6.6.2')],
  ['2.6.6.3', 'Repeat-Dose Toxicity', M4S('2.6.6.3')],
  ['2.6.6.4', 'Genotoxicity', M4S('2.6.6.4')],
  ['2.6.6.5', 'Carcinogenicity', M4S('2.6.6.5')],
  ['2.6.6.6', 'Reproductive and Developmental Toxicity', M4S('2.6.6.6')],
  ['2.6.6.7', 'Local Tolerance', M4S('2.6.6.7')],
  ['2.6.6.8', 'Other Toxicity Studies', M4S('2.6.6.8')],
  ['2.6.6.9', 'Discussion and Conclusions', M4S('2.6.6.9')],
  ['2.6.6.10', 'Tables and Figures', M4S('2.6.6.10')],
  ['2.7', 'Clinical Summary', M4_ORG()],
  ['2.7.1.1', 'Background and Overview', M4E('2.7.1.1')],
  ['2.7.1.2', 'Summary of Results of Individual Studies', M4E('2.7.1.2')],
  ['2.7.1.3', 'Comparison and Analyses of Results Across Studies', M4E('2.7.1.3')],
  ['2.7.1.4', 'Appendix', M4E('2.7.1.4')],
  ['2.7.2.1', 'Background and Overview', M4E('2.7.2.1')],
  ['2.7.2.2', 'Summary of Results of Individual Studies', M4E('2.7.2.2')],
  ['2.7.2.3', 'Comparison and Analyses of Results Across Studies', M4E('2.7.2.3')],
  ['2.7.2.4', 'Special Studies', M4E_R2],
  ['2.7.2.5', 'Appendix', M4E('2.7.2.5')],
  ['2.7.3.1', 'Background and Overview of Clinical Efficacy', M4E('2.7.3.1')],
  ['2.7.3.2', 'Summary of Results of Individual Studies', M4E('2.7.3.2')],
  ['2.7.3.3', 'Comparison and Analyses of Results Across Studies', M4E('2.7.3.3')],
  ['2.7.3.3.1', 'Study Populations', M4E('2.7.3.3.1')],
  ['2.7.3.3.2', 'Comparison of Efficacy Results of All Studies', M4E('2.7.3.3.2')],
  ['2.7.3.3.3', 'Comparison of Results in Sub-populations', M4E('2.7.3.3.3')],
  ['2.7.3.4', 'Analysis of Clinical Information Relevant to Dosing Recommendations', M4E_R2],
  ['2.7.3.5', 'Persistence of Efficacy and/or Tolerance Effects', M4E_R2],
  ['2.7.3.6', 'Appendix', M4E('2.7.3.6')],
  ['2.7.4.1', 'Exposure to the Drug', M4E_R2],
  ['2.7.4.1.1', 'Overall Safety Evaluation Plan and Narratives of Safety Studies', M4E('2.7.4.1.1')],
  ['2.7.4.1.2', 'Overall Extent of Exposure', M4E('2.7.4.1.2')],
  ['2.7.4.1.3', 'Demographic and Other Characteristics of Study Population', M4E('2.7.4.1.3')],
  ['2.7.4.2', 'Adverse Events', M4E('2.7.4.2')],
  ['2.7.4.2.1', 'Analysis of Adverse Events', M4E('2.7.4.2.1')],
  ['2.7.4.2.1.1', 'Common Adverse Events', M4E('2.7.4.2.1.1')],
  ['2.7.4.2.1.2', 'Deaths', M4E('2.7.4.2.1.2')],
  ['2.7.4.2.1.3', 'Other Serious Adverse Events', M4E('2.7.4.2.1.3')],
  ['2.7.4.2.1.4', 'Other Significant Adverse Events', M4E('2.7.4.2.1.4')],
  ['2.7.4.2.1.5', 'Analysis of Adverse Events by Organ System or Syndrome', M4E('2.7.4.2.1.5')],
  ['2.7.4.2.2', 'Narratives', M4E('2.7.4.2.2')],
  ['2.7.4.3', 'Clinical Laboratory Evaluations', M4E_R2],
  ['2.7.4.4', 'Vital Signs, Physical Findings, and Other Observations Related to Safety', M4E('2.7.4.4')],
  ['2.7.4.5', 'Safety in Special Groups and Situations', M4E_R2],
  ['2.7.4.5.1', 'Intrinsic Factors', M4E('2.7.4.5.1')],
  ['2.7.4.5.2', 'Extrinsic Factors', M4E('2.7.4.5.2')],
  ['2.7.4.5.3', 'Drug Interactions', M4E('2.7.4.5.3')],
  ['2.7.4.5.4', 'Use in Pregnancy and Lactation', M4E('2.7.4.5.4')],
  ['2.7.4.5.5', 'Overdose', M4E('2.7.4.5.5')],
  ['2.7.4.5.6', 'Drug Abuse', M4E('2.7.4.5.6')],
  ['2.7.4.5.7', 'Withdrawal and Rebound', M4E('2.7.4.5.7')],
  ['2.7.4.5.8', 'Effects on Ability to Drive or Operate Machinery or Impairment of Mental Ability', M4E('2.7.4.5.8')],
  ['2.7.4.6', 'Post-marketing Data', M4E_R2],
  ['2.7.4.7', 'Appendix', M4E('2.7.4.7')],

  // ── Module 3: skeleton only (the CMC lane appends the rest) ─────────────────
  ['3', 'Quality', M4_ORG()],
  ['3.1', 'Table of Contents of Module 3', M4_ORG()],
  ['3.2', 'Body of Data', M4_ORG()],
  ['3.2.S', 'Drug Substance', M4Q('3.2.S')],
  ['3.2.P', 'Drug Product', M4Q('3.2.P')],
  // Parents of the exact P.2 leaves added 2026-10-09; content remains in the overlay.
  ['3.2.P.2.1', 'Components of the Drug Product', M4Q('3.2.P.2.1')],
  ['3.2.P.2.2', 'Drug Product', M4Q('3.2.P.2.2')],
  ['3.3', 'Literature References', M4_ORG()],

  // ── Module 4 ────────────────────────────────────────────────────────────────
  ['4', 'Nonclinical Study Reports', M4_ORG()],
  ['4.1', 'Table of Contents of Module 4', M4_ORG()],
  ['4.2', 'Study Reports', M4_ORG()],
  ['4.2.1', 'Pharmacology', M4S('4.2.1')],
  ['4.2.2', 'Pharmacokinetics', M4S('4.2.2')],
  ['4.2.3', 'Toxicology', M4S('4.2.3')],
  ['4.2.3.3.1', 'In Vitro', M4S('4.2.3.3.1')],
  ['4.2.3.3.2', 'In Vivo', M4S('4.2.3.3.2')],
  ['4.2.3.4.1', 'Long-term Studies', M4S('4.2.3.4.1')],
  ['4.2.3.4.2', 'Short- or Medium-term Studies', M4S('4.2.3.4.2')],
  ['4.2.3.4.3', 'Other Studies', M4S('4.2.3.4.3')],
  ['4.2.3.5.1', 'Fertility and Early Embryonic Development', M4S('4.2.3.5.1')],
  ['4.2.3.5.2', 'Embryo-fetal Development', M4S('4.2.3.5.2')],
  ['4.2.3.5.3', 'Prenatal and Postnatal Development, Including Maternal Function', M4S('4.2.3.5.3')],
  ['4.2.3.5.4', 'Studies in Which the Offspring (Juvenile Animals) Are Dosed and/or Further Evaluated', M4S('4.2.3.5.4')],
  ['4.2.3.7.1', 'Antigenicity', M4S('4.2.3.7.1')],
  ['4.2.3.7.2', 'Immunotoxicity', M4S('4.2.3.7.2')],
  ['4.2.3.7.3', 'Mechanistic Studies', M4S('4.2.3.7.3')],
  ['4.2.3.7.4', 'Dependence', M4S('4.2.3.7.4')],
  ['4.2.3.7.5', 'Metabolites', M4S('4.2.3.7.5')],
  ['4.2.3.7.6', 'Impurities', M4S('4.2.3.7.6')],
  ['4.2.3.7.7', 'Other', M4S('4.2.3.7.7')],

  // ── Module 5 ────────────────────────────────────────────────────────────────
  ['5', 'Clinical Study Reports', M4_ORG()],
  ['5.3', 'Clinical Study Reports', M4E('5.3')],
  ['5.3.1.1', 'Bioavailability (BA) Study Reports', M4E_R2],
  ['5.3.1.2', 'Comparative BA and Bioequivalence (BE) Study Reports', M4E_R2],
  ['5.3.1.3', 'In Vitro–In Vivo Correlation Study Reports', M4E_R2],
  ['5.3.1.4', 'Reports of Bioanalytical and Analytical Methods for Human Studies', M4E('5.3.1.4')],
  ['5.3.2.1', 'Plasma Protein Binding Study Reports', M4E_R2],
  ['5.3.2.2', 'Reports of Hepatic Metabolism and Drug Interaction Studies', M4E_R2],
  ['5.3.2.3', 'Reports of Studies Using Other Human Biomaterials', M4E('5.3.2.3')],
  ['5.3.3.1', 'Healthy Subject PK and Initial Tolerability Study Reports', M4E_R2],
  ['5.3.3.2', 'Patient PK and Initial Tolerability Study Reports', M4E('5.3.3.2')],
  ['5.3.3.3', 'Intrinsic Factor PK Study Reports', M4E_R2],
  ['5.3.3.4', 'Extrinsic Factor PK Study Reports', M4E('5.3.3.4')],
  ['5.3.3.5', 'Population PK Study Reports', M4E_R2],
  ['5.3.4.1', 'Healthy Subject PD and PK/PD Study Reports', M4E('5.3.4.1')],
  ['5.3.4.2', 'Patient PD and PK/PD Study Reports', M4E_R2],
  ['5.3.5', 'Reports of Efficacy and Safety Studies', M4E('5.3.5')],
];

function parentCode(code: string): string | null {
  const i = code.lastIndexOf('.');
  return i < 0 ? null : code.slice(0, i);
}

/** The structural ICH M4 headings of Modules 2–5 not carried by `CTD_AUTHORING_GUIDANCE`, in CTD order. */
export const ICH_M4_HEADINGS: readonly IchM4Heading[] = Object.freeze(
  ROWS.map(([code, title, basis]) =>
    Object.freeze({
      code,
      title,
      parent: parentCode(code),
      module: Number(code[0]) as IchM4Heading['module'],
      basis,
    }),
  ),
);

const BY_CODE: ReadonlyMap<string, IchM4Heading> = new Map(ICH_M4_HEADINGS.map((h) => [h.code, h]));

/** The canonical M2–M5 code, or null when `code` is not code-shaped or is outside Modules 2–5. */
function m2to5(code: string | null | undefined): string | null {
  const c = normalizeCtdCode(code);
  return c !== null && /^[2-5]/.test(c) ? c : null;
}

/** The structural row for `code`, or null (a guidance-record code or a non-heading). */
export function getIchM4Heading(code: string | null | undefined): IchM4Heading | null {
  const c = m2to5(code);
  return c === null ? null : (BY_CODE.get(c) ?? null);
}

/**
 * Is `code` a heading ICH M4 defines in Modules 2–5? Reads both halves of the
 * record: these structural rows and the `CTD_AUTHORING_GUIDANCE` keys. Accepts
 * 'm'-prefixed and lower-case Module 3 spellings. False for Module 1 (regional),
 * for anything not code-shaped and for an invented code such as '4.3.1'.
 */
export function isIchHeading(code: string | null | undefined): boolean {
  return ichHeadingTitle(code) !== null;
}

/** The heading's title from whichever half of the record holds it, or null when it is not an ICH M4 heading. */
export function ichHeadingTitle(code: string | null | undefined): string | null {
  const c = m2to5(code);
  if (c === null) return null;
  const row = BY_CODE.get(c);
  if (row) return row.title;
  return Object.prototype.hasOwnProperty.call(CTD_AUTHORING_GUIDANCE, c) ? CTD_AUTHORING_GUIDANCE[c].title : null;
}
