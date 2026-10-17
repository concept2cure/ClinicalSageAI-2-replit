/**
 * Every shared regulatory basis constant, declared once.
 *
 * The CSR overlay, the database-lock-to-submission chain, the FDA technical
 * rules and the lifecycle registry cite the same regulator documents. Each
 * document is declared here and nowhere else, so a correction to its URL, its
 * title or its basis reaches every citation at once. Until 2026-10-05
 * ICH M4E(R2) and FDA's ISS/ISE placement page were each declared twice
 * (submission-chain.ts and fda-technical-rules.ts), under different names and
 * wordings, and the constants below were spread over csr-e3-basis.ts,
 * submission-chain.ts and fda-technical-rules.ts
 * (docs/design/ANA_REGULATORY_RECORD.md §2 items 12 and 15, step R1b).
 *
 * Each regulator document below was matched against search results quoting the
 * regulator-hosted copy on the date its note gives; the session could not fetch
 * the documents themselves (fda.gov, ich.org and ecfr.gov are refused by the
 * environment's egress policy). The research record, with the passage each one
 * confirms, is docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/
 * research.md; the 2026-10-05 corrections are in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-basis-constants-one-home-facts.md. A search extract is `recall`
 * (shared/regulatory/regulatory-basis.ts), so each is `recall` with a note
 * saying so, as jp-programs.ts does. Until 2026-10-15 they were
 * `regulator-text`, and the CSR brief told the reader they had been checked
 * against the regulator's text. A basis becomes `regulator-text` when its
 * document is read.
 *
 * Append-only shared file (ANA_REGULATORY_RECORD.md R0): a lane adds the
 * constant it first cites here; it does not declare a local copy.
 *
 * @module server/services/ind/ctd/regulatory-basis
 */

import type { RegulatoryBasis } from './types.js';

/** The note on a document whose wording was seen only in search extracts of its regulator-hosted copy. */
const searchExtract = (date: string): string =>
  `Search extract of the regulator-hosted copy on ${date}; the document itself was not read (egress blocked). Verbatim re-read owed.`;
const SEARCHED = '2026-10-04';

/** Known to the author, not checked against the regulator's text. */
export const recall = (ref: string): RegulatoryBasis => ({ ref, confidence: 'recall' });

/** How this platform recommends doing it; not a regulatory requirement. */
export const practice = (ref: string): RegulatoryBasis => ({ ref, confidence: 'platform-convention' });

// ── ICH E3 and its Q&A ───────────────────────────────────────────────────────

/**
 * ICH E3 as FDA publishes it: "Guideline for Industry: Structure and Content of
 * Clinical Study Reports" (July 1996), fda.gov/media/71271.
 *
 * Until 2026-10-05 this pointed at fda.gov/media/84857, which is FDA's copy of
 * the E3 Questions and Answers (R1), January 2013, not E3 itself.
 */
export const FDA_E3: RegulatoryBasis = {
  ref: 'ICH E3, as published by FDA (July 1996)',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/71271/download',
  note: searchExtract('2026-10-05'),
};

/** ICH E3 Questions and Answers (R1), June 2012, as published by EMA (the copy whose search extract was seen). */
export const E3_QA_R1: RegulatoryBasis = {
  ref: 'ICH E3 Q&A (R1), June 2012',
  confidence: 'recall',
  url: 'https://www.ema.europa.eu/en/documents/scientific-guideline/international-conference-harmonisation-technical-requirements-registration-pharmaceuticals-human-use-ich-guideline-e3-questions-and-answers-r1_en.pdf',
  note: searchExtract(SEARCHED),
};

// ── FDA technical specifications for what a reviewer receives ───────────────

/** FDA, Portable Document Format (PDF) Specifications. */
export const FDA_PDF_SPECS: RegulatoryBasis = {
  ref: 'FDA, Portable Document Format (PDF) Specifications',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/76797/download',
  note: searchExtract(SEARCHED),
};

/** FDA, Technical Rejection Criteria for Study Data (eCTD validation 1734, 1736). */
export const FDA_STUDY_DATA_TRC: RegulatoryBasis = {
  ref: 'FDA, Technical Rejection Criteria for Study Data (1734, 1736)',
  confidence: 'recall',
  url: 'https://www.fda.gov/files/drugs/published/Technical-Rejection-Criteria-for-Study-Data.pdf',
  note: searchExtract(SEARCHED),
};

/** FDA, Study Data Technical Conformance Guide. */
export const FDA_SDTCG: RegulatoryBasis = {
  ref: 'FDA, Study Data Technical Conformance Guide',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/88173/download',
  note: searchExtract(SEARCHED),
};

/** FDA, eCTD Technical Conformance Guide. */
export const FDA_ECTD_TCG: RegulatoryBasis = {
  ref: 'FDA, eCTD Technical Conformance Guide',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/93818/download',
  note: searchExtract(SEARCHED),
};

// ── Integrated summaries and Module 2/5 ──────────────────────────────────────

/** ICH M4E(R2), the CTD efficacy guideline, as FDA publishes it. */
export const M4E_R2: RegulatoryBasis = {
  ref: 'ICH M4E(R2), as published by FDA',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/93569/download',
  note: searchExtract(SEARCHED),
};

/** FDA's page on where the ISS and ISE are filed in an eCTD. */
export const FDA_ISS_ISE_PLACEMENT: RegulatoryBasis = {
  ref: 'FDA, Placement of Integrated Summaries of Safety and Effectiveness (ISS/ISE) in the eCTD',
  confidence: 'recall',
  url: 'https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format',
  note: searchExtract(SEARCHED),
};

/** FDA, Integrated Summary of Effectiveness, guidance for industry (2015). */
export const FDA_ISE_GUIDANCE: RegulatoryBasis = {
  ref: 'FDA, Integrated Summary of Effectiveness (2015)',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/72335/download',
  note: searchExtract(SEARCHED),
};

// ── FDA reviewer tools ───────────────────────────────────────────────────────

/**
 * FDA OND, Standard Safety Tables and Figures (ST&F): Integrated Guide. A
 * reviewer tool, not a sponsor requirement; facts in
 * 2026-10-04-depth/b3-safety-presentation-facts.md.
 */
export const FDA_STF_IG: RegulatoryBasis = {
  ref: 'FDA OND, Standard Safety Tables and Figures: Integrated Guide (reviewer tool; MAPP at fda.gov/media/187067)',
  confidence: 'recall',
  url: 'https://www.fda.gov/media/187065/download',
  note: searchExtract('2026-10-05'),
};

/** FDA OND Custom Medical Queries (formerly FMQs); voluntary for sponsors. */
export const FDA_OCMQ: RegulatoryBasis = {
  ref: 'FDA OND Custom Medical Queries (OCMQs, formerly FMQs), MAPP 6025.8',
  confidence: 'recall',
  url: 'https://www.fda.gov/drugs/development-resources/office-new-drugs-custom-medical-queries-ocmqs',
  note: searchExtract('2026-10-05'),
};

// ── 21 CFR ───────────────────────────────────────────────────────────────────

/** 21 CFR 314.50(f): case report tabulations and case report forms in an NDA. */
export const CFR_314_50_F: RegulatoryBasis = {
  ref: '21 CFR 314.50(f)(1)-(2)',
  confidence: 'recall',
  url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-B',
  note: searchExtract(SEARCHED),
};

/** 21 CFR 314.101(d)(3): refusal to file an application that is incomplete on its face. */
export const CFR_314_101: RegulatoryBasis = {
  ref: '21 CFR 314.101(d)(3)',
  confidence: 'recall',
  url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-D/section-314.101',
  note: searchExtract(SEARCHED),
};

/** 21 CFR 201.57 at one paragraph, e.g. cfr201_57('(d)(6)'). */
export const cfr201_57 = (para: string): RegulatoryBasis => ({
  ref: `21 CFR 201.57${para}`,
  confidence: 'recall',
  url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-201/subpart-B/section-201.57',
  note: searchExtract(SEARCHED),
});
