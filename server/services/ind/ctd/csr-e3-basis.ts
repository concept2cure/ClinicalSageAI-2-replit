/**
 * The basis helpers that are specific to the ICH E3 overlay.
 *
 * The regulator documents the overlay cites (FDA_E3, E3_QA_R1, FDA_PDF_SPECS,
 * FDA_STUDY_DATA_TRC, FDA_SDTCG, CFR_314_50_F, FDA_STF_IG, FDA_OCMQ) are
 * shared with the submission chain and the FDA technical rules, so they are
 * declared once, in ./regulatory-basis.ts (moved there 2026-10-05, step
 * g-basis-constants-one-home). This file keeps only what is E3's own.
 */

import type { E3Basis } from './types.js';
import { practice, recall } from './regulatory-basis.js';

/** The usual CDISC source for a display — practice, not a requirement. */
export const CDISC_CONVENTION: E3Basis = practice('CDISC SDTM / ADaM practice (the SAP and define.xml decide)');

/**
 * E3's own sentences for the headings whose wording is well known, as recalled
 * (CSR slice 4, 2026-10-29). The 1995 text could not be read that day (egress
 * to fda.gov/media/71271 and ich.org refused), so each stays `recall` and the
 * brief shows it as recalled wording. When the text is read, a span that
 * matches becomes `regulator-text` with its `checked` date; one that does not
 * is corrected here.
 */
export const E3_RECALLED_WORDING: Readonly<Record<string, string>> = Object.freeze({
  '2': 'A brief synopsis (usually limited to 3 pages) that summarises the study should be provided.',
  '7': 'The introduction should contain a brief statement (maximum: 1 page) placing the study in the context of the development of the test treatment',
  '10.1': 'There should be a clear accounting of all patients who entered the study, using figures or tables in the text of the report.',
  '11.4.1': 'Treatment groups should be compared for all critical measures of efficacy (primary and secondary end-points; pharmacodynamic end-points), as well as benefit/risk assessment(s) in each patient where these are utilised.',
  '12.2.2': 'All adverse events occurring after initiation of study treatments (including events likely to be related to the underlying disease or likely to represent concomitant illness, unless there is agreement with the regulatory authority to consider specified events as disease related) should be displayed in summary tables.',
  '12.2.4': 'All adverse events for each patient, including the same event on several occasions, should be listed, giving both preferred term and the original term used by the investigator.',
  '12.3.2': 'There should be brief narratives describing each death, each other serious adverse event, and those of the other significant adverse events that are judged to be of special interest because of clinical importance.',
  '13': 'The efficacy and safety results of the study and the relationship of risks and benefit should be briefly summarised and discussed, referring to the tables, figures, and sections above as needed.',
});

/** The basis every section carries: its own E3 number, with E3's recalled wording where known. */
export function e3SectionBasis(number: string): E3Basis {
  const quote = E3_RECALLED_WORDING[number];
  return quote ? { ...recall(`ICH E3 §${number}`), quote } : recall(`ICH E3 §${number}`);
}
