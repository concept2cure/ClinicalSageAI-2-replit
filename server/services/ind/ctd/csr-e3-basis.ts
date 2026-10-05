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

/** The basis every section carries: its own E3 number. */
export function e3SectionBasis(number: string): E3Basis {
  return recall(`ICH E3 §${number}`);
}
