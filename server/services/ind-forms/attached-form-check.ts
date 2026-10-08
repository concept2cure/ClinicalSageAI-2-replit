/**
 * The forms engine's check of a sponsor-attached Module 1 form — the one
 * verdict on whether an attachment completes its form.
 *
 * ── The defect (QA 2026-10-08, second walk, j7) ──────────────────────────────
 * The IND checklist counted any attached form as complete. Attaching the
 * product's OWN unedited 1571 and 1572 PDFs marked both COMPLETE although Build
 * & check reported required fields missing on each ("1 REQUIRED MISSING
 * phase_of_study"; "3 REQUIRED MISSING investigator_name, facility_name,
 * irb_name"), and PLR-606's readiness went from 0% to 8%. Nothing compared the
 * file with the build verdict or with the blank the product had generated.
 *
 * ── The check (Rule 2: verdicts from engines) ────────────────────────────────
 * Two deterministic sources, both from the forms engine already used for Build
 * & check and the PDF:
 *   1. The build over the program's record and what the person stated with the
 *      attachment — the same metadata Build & check uses. Its `missingRequired`
 *      are fields the filing needs and nobody recorded.
 *   2. When the attached bytes ARE the platform's own render of that build
 *      (renders are byte-deterministic), the required boxes that render leaves
 *      blank (`requiredFieldsLeftBlank`) are blank on the attached file too:
 *      the 1571's IND-type and phase boxes, which the platform deliberately
 *      leaves for the sponsor to tick and sign, among them.
 * The union is recorded with the attachment. An empty list is the only verdict
 * the IND checklist counts as complete.
 *
 * What it cannot see, and does not claim: boxes completed by hand in Acrobat
 * that the program record does not hold. The platform cannot read a signed
 * form's content, so a field the record lacks is missing until it is recorded
 * or stated, whatever the file shows.
 *
 * A render that cannot be produced leaves the attachment UNCHECKED (null), not
 * complete: without it, source 2 cannot be asked.
 *
 * @module server/services/ind-forms/attached-form-check
 */

import crypto from 'node:crypto';
import { generateIndForm } from './ind-form-fill-service';
import type { IndProjectMetadata } from './ind-form-data-builders';

export interface AttachedFormCheck {
  /** The required fields missing, sorted; null when no check could be made. */
  requiredFieldsMissing: string[] | null;
  /** True when the attached bytes are the platform's own render of this build. */
  unedited: boolean;
}

export async function checkAttachedForm(
  formId: string,
  meta: IndProjectMetadata,
  attachedSha256: string,
): Promise<AttachedFormCheck> {
  let render;
  try {
    render = await generateIndForm(formId, meta);
  } catch {
    return { requiredFieldsMissing: null, unedited: false };
  }
  const renderSha256 = crypto.createHash('sha256').update(render.pdfBytes).digest('hex');
  const unedited = renderSha256 === attachedSha256.toLowerCase();
  const missing = new Set<string>(render.missingRequired);
  if (unedited) for (const id of render.requiredFieldsLeftBlank) missing.add(id);
  return { requiredFieldsMissing: [...missing].sort(), unedited };
}
