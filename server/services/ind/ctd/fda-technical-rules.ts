/**
 * FDA's published technical rules for what a reviewer receives — PDF, eCTD
 * and study data — each with what happens when it is missed and whether this
 * platform checks it today.
 *
 * ── Why this exists, and what it does not claim ──────────────────────────────
 * Sponsors now ask whether a dossier will "pass Elsa", FDA's internal
 * generative-AI assistant. FDA has published no acceptance criteria for Elsa;
 * what it has said is that reviewers use it to summarise adverse events, compare
 * labels and summarise literature, and verify what it produces. The defensible
 * preparation is therefore the one FDA has published: a dossier that meets its
 * PDF, eCTD and study-data specifications is one a reviewer — or a reviewer's
 * tool — can open, search, navigate and trace. This registry says exactly
 * that, and says which rules the platform enforces, which it checks only in
 * part, and which it does not check at all, so neither AnA nor a client mistakes
 * an unchecked rule for a passed one.
 *
 * Each `platform` entry was read from the code on 2026-10-04 (the D2 survey in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/README.md); a change
 * to an enforcement point changes the entry with it.
 *
 * PLR_FORMAT_RULES holds the 21 CFR 201.57 format rules for a US Prescribing
 * Information (area 'labeling'). They are the source assess_plr_structure
 * states its formatting from and plan_labeling_authoring takes its Highlights
 * statements from (b1-plr-rules-elsa-facts.md in the 2026-10-04-depth evidence).
 */

import type { E3Basis } from './types.js';
import {
  CFR_314_101,
  CFR_314_50_F,
  cfr201_57,
  FDA_ECTD_TCG,
  FDA_ISS_ISE_PLACEMENT,
  FDA_PDF_SPECS,
  FDA_SDTCG,
  FDA_STUDY_DATA_TRC,
  M4E_R2,
} from './regulatory-basis.js';

/** The date the Elsa facts below were read. */
const CHECKED = '2026-10-04';

export type RuleArea = 'pdf' | 'ectd' | 'study-data' | 'content' | 'labeling';

/** enforced: a package that breaks it is refused. partial: some paths check it. not-checked: nothing does. */
export type PlatformCheck = 'enforced' | 'partial' | 'not-checked';

export interface TechnicalRule {
  id: string;
  area: RuleArea;
  /** What FDA's published specification says. */
  rule: string;
  /** What missing it costs. */
  consequence: string;
  basis: E3Basis;
  platform: { check: PlatformCheck; note: string };
  /** Text the rule requires word for word, where it does: its fixed part, without the (insert …) slots. */
  verbatim?: string;
}

export const FDA_TECHNICAL_RULES: readonly TechnicalRule[] = Object.freeze<TechnicalRule[]>([
  {
    id: 'pdf-version', area: 'pdf',
    rule: 'PDF versions 1.4 to 1.7, PDF/A-1 and PDF/A-2 are acceptable.',
    consequence: 'A leaf in another version (for example PDF 2.0) does not meet FDA’s PDF specification.',
    basis: FDA_PDF_SPECS,
    platform: { check: 'not-checked', note: 'The version is read (ectd/pdfa-detect.ts) but no verdict uses it; only encryption decides acceptableForEctd.' },
  },
  {
    id: 'pdf-no-security', area: 'pdf',
    rule: 'Do not activate security settings or password protection.',
    consequence: 'A secured PDF cannot be opened, indexed or annotated by the reviewer.',
    basis: FDA_PDF_SPECS,
    platform: { check: 'enforced', note: 'Encrypted leaves are refused at packaging (submission-gateways/regional-packager.ts) and at transmit (bundle-leaf-security.ts); FDA forms as issued are excepted.' },
  },
  {
    id: 'pdf-fonts', area: 'pdf',
    rule: 'Fully embed all non-standard fonts, with every character rather than a subset.',
    consequence: 'Text in a non-embedded font can render wrongly on the reviewer’s system and be extracted wrongly by search and summarisation tools.',
    basis: FDA_PDF_SPECS,
    platform: { check: 'partial', note: 'The platform’s own leaf renderers use the standard Helvetica font. An uploaded leaf’s fonts are not checked; font embedding is assessed only on project exports (documentExportService.ts).' },
  },
  {
    id: 'pdf-navigation', area: 'pdf',
    rule: 'A document of 5 or more pages carries a hyperlinked table of contents and bookmarks, the bookmark hierarchy identical to the table of contents, up to four levels deep.',
    consequence: 'Without them a reviewer cannot move through a long document, and the structure a summarising tool relies on is lost.',
    basis: FDA_PDF_SPECS,
    platform: { check: 'partial', note: 'The structured leaf renderer adds bookmarks (ectd/leaf-pdf-renderer.ts); leaves built by the Submission Ops assemble route have none, and nothing checks an uploaded leaf.' },
  },
  {
    id: 'pdf-text', area: 'pdf',
    rule: 'PDFs are text searchable. Avoid image-based PDFs; a document that must be scanned is made text searchable, and OCR output is checked for complete and accurate conversion.',
    consequence: 'Does not meet FDA’s PDF specification. An image-only page cannot be searched, copied or quoted without conversion, and any OCR FDA applies is outside the sponsor’s control.',
    basis: FDA_PDF_SPECS,
    platform: { check: 'not-checked', note: 'The package gate checks the PDF header and encryption only; no check refuses an image-only leaf.' },
  },
  {
    id: 'ectd-relative-links', area: 'ectd',
    rule: 'Hyperlinks between documents are relative, so the submission is self-contained; documents link to the referenced studies in Module 5.',
    consequence: 'Absolute or broken links stop working once the sequence is loaded on FDA’s servers.',
    basis: FDA_ECTD_TCG,
    platform: { check: 'not-checked', note: 'No code reads the links inside a PDF; ectd cross-reference resolution checks declared references only.' },
  },
  {
    id: 'ectd-file-names', area: 'ectd',
    rule: 'File and folder names in lower case, using only letters, numbers, hyphens and underscores; the full path within the 150-character limit the guide states.',
    consequence: 'Validation findings on receipt; a path too long cannot be loaded.',
    basis: FDA_ECTD_TCG,
    platform: { check: 'partial', note: 'Leaf file names are checked for lower case and 64 characters (ectd-structural-validator.ts). The US market spec allows a 230-character path (market-specs/market-submission-specs.ts) — wider than the guide’s 150; to be reconciled against the guide’s text.' },
  },
  {
    id: 'ectd-granularity', area: 'ectd',
    rule: 'Documents are split into files as the ICH M4 granularity annex describes.',
    consequence: 'Content filed at the wrong granularity is hard to find and to replace in a later sequence.',
    basis: FDA_ECTD_TCG,
    platform: { check: 'not-checked', note: 'No granularity check runs on a sequence.' },
  },
  {
    id: 'data-ts', area: 'study-data',
    rule: 'Every study in Module 4 or 5 with study data carries a Trial Summary (TS) dataset, with the study start date.',
    consequence: 'Technical rejection (validation criterion 1734).',
    basis: FDA_STUDY_DATA_TRC,
    platform: { check: 'not-checked', note: 'Datasets cannot be packaged: every eCTD leaf must be a PDF (ectd leaf-source resolver), and the Vault refuses .xpt and .xml.' },
  },
  {
    id: 'data-dm-adsl-define', area: 'study-data',
    rule: 'Clinical study data carry DM (SDTM), ADSL (ADaM) and define.xml.',
    consequence: 'Technical rejection (validation criterion 1736).',
    basis: FDA_STUDY_DATA_TRC,
    platform: { check: 'not-checked', note: 'As data-ts: no dataset reaches a package.' },
  },
  {
    id: 'data-format', area: 'study-data',
    rule: 'Datasets in SAS XPORT version 5, one dataset per file named as the dataset; a dataset over 5 GB is split, and both are submitted.',
    consequence: 'The data cannot be loaded into FDA’s review tools.',
    basis: FDA_SDTCG,
    platform: { check: 'not-checked', note: 'No XPT reader or writer exists on the platform.' },
  },
  {
    id: 'data-reviewer-guides', area: 'study-data',
    rule: 'A clinical study data reviewer’s guide with the tabulation data, and an analysis data reviewer’s guide with the analysis data; define.xml describes every dataset completely.',
    consequence: 'A reviewer cannot trace the results back to the collected data; the review may be compromised.',
    basis: FDA_SDTCG,
    platform: { check: 'not-checked', note: 'The define.xml generator writes item and codelist definitions only, from a specification the caller supplies.' },
  },
  {
    id: 'content-iss-ise', area: 'content',
    rule: 'The ISS and ISE — integrated analyses, not summaries — are filed in 5.3.5.3; a narrative portion suitable for 2.7.3 / 2.7.4 is placed there once and referenced.',
    consequence: 'Missing integrated summaries are a refuse-to-file ground; misplaced ones are hard for the review division to find.',
    basis: FDA_ISS_ISE_PLACEMENT,
    platform: { check: 'not-checked', note: 'The chain (plan_submission_from_database_lock) reports whether a document titled as the ISS or ISE is filed at 5.3.5.3; nothing on the package gate does.' },
  },
  {
    id: 'content-crfs', area: 'content',
    rule: 'An NDA includes the case report form of every patient who died or did not complete a study because of an adverse event, including patients on reference drug or placebo, unless FDA waives it.',
    consequence: 'An incomplete application under 21 CFR 314.50(f)(2).',
    basis: CFR_314_50_F,
    platform: { check: 'not-checked', note: 'Nothing checks for these CRFs.' },
  },
  {
    id: 'content-m2-length', area: 'content',
    rule: 'The Clinical Overview (2.5) is generally about 30 pages; the Clinical Summary (2.7) usually 50 to 400 pages, excluding attached tables.',
    consequence: 'An overview that repeats the summaries, or a summary that tries to be the integrated analysis, is not what the reviewer expects to read.',
    basis: M4E_R2,
    platform: { check: 'not-checked', note: 'No page-length check runs on Module 2.' },
  },
  {
    id: 'content-rtf', area: 'content',
    rule: 'An application incomplete on its face against section 505(b) and 21 CFR 314.50 can be refused for filing; FDA decides within 60 days.',
    consequence: 'Refuse-to-file: the application is not reviewed.',
    basis: CFR_314_101,
    platform: { check: 'partial', note: 'The dispatch gate includes a model-based shadow review that sees each leaf’s section, title and operation; the deterministic completeness checklist (validate-completeness-engine.ts) is not on the gate.' },
  },
]);

const GUARD_ONLY = 'Only plan_labeling_authoring’s section guard checks it, on a draft passed to it.';

/**
 * 21 CFR 201.57 format rules for a US Prescribing Information. Kept out of
 * FDA_TECHNICAL_RULES: list_fda_technical_rules prints that set in brief, and
 * these would carry it past RESULT_BUDGET. Reached by area 'labeling'.
 */
export const PLR_FORMAT_RULES: readonly TechnicalRule[] = Object.freeze<TechnicalRule[]>([
  {
    id: 'plr-hl-limitation-statement', area: 'labeling',
    rule: 'Highlights carry the verbatim statement "These highlights do not include all the information needed to use (name of drug product) safely and effectively. See full prescribing information for (name of drug product)."',
    consequence: 'Does not meet 201.57(a)(1); the reader is not told that Highlights are incomplete.',
    basis: cfr201_57('(a)(1)'),
    platform: { check: 'partial', note: GUARD_ONLY },
    verbatim: 'These highlights do not include all the information needed to use',
  },
  {
    id: 'plr-hl-initial-approval', area: 'labeling',
    rule: 'The verbatim statement "Initial U.S. Approval" with the four-digit year of FDA’s first approval of the new molecular entity, new biological product or new combination of active ingredients, on the line immediately beneath the established or proper name.',
    consequence: 'Does not meet 201.57(a)(3).',
    basis: cfr201_57('(a)(3)'),
    platform: { check: 'partial', note: GUARD_ONLY },
    verbatim: 'Initial U.S. Approval',
  },
  {
    id: 'plr-hl-boxed-warning', area: 'labeling',
    rule: 'A boxed warning in Highlights is a concise summary of not more than 20 lines, boxed and bolded, under an upper-case heading containing "WARNING". The verbatim statement "See full prescribing information for complete boxed warning." immediately follows the heading.',
    consequence: 'Does not meet 201.57(a)(4).',
    basis: cfr201_57('(a)(4)'),
    platform: { check: 'not-checked', note: 'The boxed warning is conditional, so the section guard does not require its statement; nothing counts its lines.' },
    verbatim: 'See full prescribing information for complete boxed warning.',
  },
  {
    id: 'plr-hl-rmc-one-year', area: 'labeling',
    rule: 'Recent Major Changes lists each substantively changed section among Boxed Warning, Indications and Usage, Dosage and Administration, Contraindications, or Warnings and Precautions, with its number and the month/year of the change. A changed section stays listed for at least 1 year after the labeling change and is removed at the first printing after that year.',
    consequence: 'Does not meet 201.57(a)(5): a current change not flagged, or a stale one still flagged.',
    basis: cfr201_57('(a)(5)'),
    platform: { check: 'not-checked', note: 'Nothing dates or ages Recent Major Changes entries.' },
  },
  {
    id: 'plr-hl-ae-reporting', area: 'labeling',
    rule: 'Highlights carry the verbatim statement "To report SUSPECTED ADVERSE REACTIONS, contact (manufacturer) at (phone) or FDA at (current FDA phone number and web address for voluntary reporting)"; for a vaccine, VAERS in place of FDA.',
    consequence: 'Does not meet 201.57(a)(11); the reader is not told where to report.',
    basis: cfr201_57('(a)(11)'),
    platform: { check: 'partial', note: GUARD_ONLY },
    verbatim: 'To report SUSPECTED ADVERSE REACTIONS',
  },
  {
    id: 'plr-contents', area: 'labeling',
    rule: '"Full Prescribing Information: Contents" lists each section and subsection heading with its number. Where a required section or subsection is omitted, the Contents heading is followed by an asterisk and Contents ends "* Sections or subsections omitted from the full prescribing information are not listed."',
    consequence: 'Does not meet 201.57(b), which requires Contents whatever the length.',
    basis: cfr201_57('(b)'),
    platform: { check: 'partial', note: GUARD_ONLY },
    verbatim: 'Full Prescribing Information: Contents',
  },
  {
    id: 'plr-type-size', area: 'labeling',
    rule: 'All labeling text, headings and subheadings are at least 8-point type; labeling on or within the package from which the drug is dispensed is at least 6-point.',
    consequence: 'Does not meet 201.57(d)(6).',
    basis: cfr201_57('(d)(6)'),
    platform: { check: 'not-checked', note: 'No check reads type size in a label.' },
  },
  {
    id: 'plr-hl-length', area: 'labeling',
    rule: 'Highlights, excluding the boxed warning, fit on one-half of an 8½ by 11 inch page printed in 2 columns, single-spaced, in 8-point type with ½-inch margins on all sides and between columns.',
    consequence: 'Does not meet 201.57(d)(8), unless FDA waives the limit; its PLR guidance says a waiver may be requested.',
    basis: cfr201_57('(d)(8)'),
    platform: { check: 'not-checked', note: 'No check measures the length of Highlights.' },
  },
]);

/** What FDA has said about Elsa, and what follows for a sponsor — dated, sourced. */
export const ELSA_NOTE = {
  checked: CHECKED,
  facts: [
    { text: 'FDA launched Elsa, an agency-wide generative-AI tool, on 2 June 2025; its models do not train on data submitted by industry.', url: 'https://www.fda.gov/news-events/press-announcements/fda-launches-agency-wide-ai-tool-optimize-performance-american-people' },
    { text: 'FDA reviewers have used it to summarise adverse events, compare labels and summarise literature, and reviewed and verified what it produced.', url: 'https://fda.gov/media/189421/download' },
    { text: 'In December 2025 FDA deployed agentic AI to all staff, for work that includes pre-market review and review validation.', url: 'https://www.fda.gov/news-events/press-announcements/fda-expands-artificial-intelligence-capabilities-agentic-ai-deployment' },
    { text: 'FDA said in June 2025 it was already using Elsa to accelerate clinical protocol reviews, shorten scientific evaluations and identify high-priority inspection targets.', url: 'https://www.fda.gov/news-events/press-announcements/fda-launches-agency-wide-ai-tool-optimize-performance-american-people' },
    { text: 'Elsa 4.0 (May 2026) adds custom agents, document generation, quantitative analysis, OCR of scanned documents and images, and search of large document repositories. FDA consolidated 40+ application and submission data sources into HALO and began integrating it with Elsa, so staff can query that data without uploading documents.', url: 'https://www.fda.gov/news-events/press-announcements/fda-expands-ai-capabilities-and-completes-data-platform-consolidation' },
  ],
  guidance:
    'FDA has published no acceptance criteria for Elsa, and nothing here can certify that a dossier will "pass" it. What a sponsor controls is conformance to the specifications above and the internal consistency of the dossier — the same number in the CSR, the ISS/ISE, 2.7 and 2.5 — which an AI-assisted read surfaces as readily as a reviewer does, and more so as FDA connects Elsa to its submission data. That last point is this platform’s view, not an FDA statement.',
} as const;

/** One area's rules. With no area, the brief set: FDA_TECHNICAL_RULES only, never PLR_FORMAT_RULES. */
export function rulesByArea(area?: string | null): TechnicalRule[] {
  const a = String(area ?? '').trim().toLowerCase();
  return a ? [...FDA_TECHNICAL_RULES, ...PLR_FORMAT_RULES].filter((r) => r.area === a) : [...FDA_TECHNICAL_RULES];
}
