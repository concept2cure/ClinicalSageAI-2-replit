/**
 * The checked sources the ICH E3 overlay cites, so every section names the
 * same copy and a reader can follow one URL to it.
 *
 * Each `regulator-text` basis was matched against search results quoting a
 * regulator-hosted copy on 2026-10-04; the session could not fetch the
 * documents themselves (fda.gov, ich.org and ecfr.gov were refused by the
 * environment's egress policy). The research record, with the passage each
 * one confirms, is docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/
 * research.md.
 */

import type { E3Basis } from './types.js';

const CHECKED = '2026-10-04';

/** ICH E3 as FDA publishes it (guidance for industry, July 1996). */
export const FDA_E3: E3Basis = {
  ref: 'ICH E3, as published by FDA',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/84857/download',
  checked: CHECKED,
};

/** ICH E3 Questions and Answers (R1), June 2012, as published by EMA. */
export const E3_QA_R1: E3Basis = {
  ref: 'ICH E3 Q&A (R1), June 2012',
  confidence: 'regulator-text',
  url: 'https://www.ema.europa.eu/en/documents/scientific-guideline/international-conference-harmonisation-technical-requirements-registration-pharmaceuticals-human-use-ich-guideline-e3-questions-and-answers-r1_en.pdf',
  checked: CHECKED,
};

/** FDA, Portable Document Format (PDF) Specifications. */
export const FDA_PDF_SPECS: E3Basis = {
  ref: 'FDA, Portable Document Format (PDF) Specifications',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/76797/download',
  checked: CHECKED,
};

/** FDA, Technical Rejection Criteria for Study Data (eCTD validation 1734, 1736). */
export const FDA_STUDY_DATA_TRC: E3Basis = {
  ref: 'FDA, Technical Rejection Criteria for Study Data (1734, 1736)',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/files/drugs/published/Technical-Rejection-Criteria-for-Study-Data.pdf',
  checked: CHECKED,
};

/** FDA, Study Data Technical Conformance Guide. */
export const FDA_SDTCG: E3Basis = {
  ref: 'FDA, Study Data Technical Conformance Guide',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/88173/download',
  checked: CHECKED,
};

/** 21 CFR 314.50(f): case report tabulations and case report forms in an NDA. */
export const CFR_314_50_F: E3Basis = {
  ref: '21 CFR 314.50(f)(1)-(2)',
  confidence: 'regulator-text',
  url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-B',
  checked: CHECKED,
};

/**
 * FDA OND, Standard Safety Tables and Figures (ST&F): Integrated Guide. A
 * reviewer tool, not a sponsor requirement; facts in
 * 2026-10-04-depth/b3-safety-presentation-facts.md.
 */
export const FDA_STF_IG: E3Basis = {
  ref: 'FDA OND, Standard Safety Tables and Figures: Integrated Guide (reviewer tool; MAPP at fda.gov/media/187067)',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/187065/download',
  checked: '2026-10-05',
};

/** FDA OND Custom Medical Queries (formerly FMQs); voluntary for sponsors. */
export const FDA_OCMQ: E3Basis = {
  ref: 'FDA OND Custom Medical Queries (OCMQs, formerly FMQs), MAPP 6025.8',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/drugs/development-resources/office-new-drugs-custom-medical-queries-ocmqs',
  checked: '2026-10-05',
};

/** The usual CDISC source for a display — practice, not a requirement. */
export const CDISC_CONVENTION: E3Basis = {
  ref: 'CDISC SDTM / ADaM practice (the SAP and define.xml decide)',
  confidence: 'platform-convention',
};

/** The basis every section carries: its own E3 number. */
export function e3SectionBasis(number: string): E3Basis {
  return { ref: `ICH E3 §${number}`, confidence: 'recall' };
}
