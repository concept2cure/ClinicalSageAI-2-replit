/**
 * Existing eCTD filename and STF coverage rules, shared by authoring and packaging.
 * Extracted from the server eCTD validators/generator so placement uses the same
 * policy before a filing copy or leaf is written. Pure; no server dependencies.
 */
import { normalizeCtdCode } from './section-code';

/** eCTD leaf file name: lowercase, [a-z0-9.-], at most 64 characters including
 *  the extension (ICH eCTD v3.2.2 Appendix; EMA-CESP-005). */
export const FILENAME_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/**
 * The STF file name for a study: "stf-" + study-id + ".xml", case-folded because
 * eCTD file names are lower case. Throws when the result breaks the eCTD
 * file-name rule (FILENAME_PATTERN) — a study id with a space, '&', '_' or '/',
 * or one too long — rather than inventing a different name for the study.
 * Basis: ICH STF v2.6.1, fda.gov/media/159383; regulator text read through
 * search, 2026-10-05 (the PDF was not opened). Existing source record:
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-stf-name-tags-and-shape-facts.md.
 */
export function stfFileName(studyId: string): string {
  const name = `stf-${studyId.toLowerCase()}.xml`;
  if (!FILENAME_PATTERN.test(name)) {
    throw new Error(
      `Study id "${studyId}" cannot form its Study Tagging File name: "${name}" breaks the eCTD file-name rule ` +
        `(lower case a-z, 0-9, '.', '-'; at most 64 characters). The STF is named "stf-" + study-id + ".xml" ` +
        `(ICH STF v2.6.1); give the study an id that fits rather than have the platform rename it.`,
    );
  }
  return name;
}

/** Module 4/5 sections whose files need no STF (FDA TRC 1789).
 * Basis: regulator text read through search, 2026-10-05, fda.gov/media/160970,
 * 165675 and 135247 (the PDFs were not opened). Source record:
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-stf-1789-fail-closed-facts.md.
 */
export const STF_NOT_REQUIRED_SECTIONS: readonly string[] = ['4.3', '5.2', '5.3.6', '5.4'];

/** Whether a file placed at this CTD section must be referenced by an STF (FDA TRC 1789). */
export function requiresStfReference(section: string): boolean {
  const code = normalizeCtdCode(section) ?? '';
  return /^[45](\.|$)/.test(code) && !STF_NOT_REQUIRED_SECTIONS.some((s) => code === s || code.startsWith(`${s}.`));
}
