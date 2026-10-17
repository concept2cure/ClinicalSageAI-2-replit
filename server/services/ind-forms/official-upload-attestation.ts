/**
 * The uploader's attestation that a sponsor-attached Module 1 form IS the
 * completed, signed form — read from POST /api/ind-forms/:formId/official-upload,
 * recorded with the retained file, and reported back.
 *
 * ── The defect (report_ind_ivd_irb #15, 2026-10-15) ──────────────────────────
 * The forms engine's check (attached-form-check.ts) reads the program record,
 * not the file: it cannot see boxes completed in Acrobat or a signature. That
 * check alone made an attachment `complete`, so an edited, unsigned PDF counted
 * as the signed 1571 / 1572 / 3674 on the IND checklist and raised readiness.
 * A form now counts only when the check is clean AND the uploader stated the
 * file is the completed, signed form.
 *
 * A statement, not a Part 11 signature: the platform neither signs the form nor
 * verifies the signature on it. It records who made the statement (the
 * session's user, never a request field) and when (the server's time).
 *
 * @module server/services/ind-forms/official-upload-attestation
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { renderedLeafFiles } from '../../../shared/schema/submissions';

/** A refusal the route sends as it is; nothing has been stored when it is sent. */
export interface AttestationRefusal {
  error: { code: 'VALIDATION' | 'ATTESTATION_CONTRADICTED'; message: string };
}

/** The 400 body for an attestation that is neither stated nor unstated. */
export const INVALID_ATTESTATION: AttestationRefusal = {
  error: {
    code: 'VALIDATION',
    message: "attestCompletedSigned is 'true' to attest that this file is the completed, signed form, or absent. Nothing was filed.",
  },
};

/** Multipart fields arrive as text: 'true' states it; absent, blank or 'false'
 *  does not; anything else is refused (null) rather than read as either. */
export function statedAttestation(v: unknown): boolean | null {
  if (v === undefined || v === '' || v === 'false' || v === false) return false;
  if (v === 'true' || v === true) return true;
  return null;
}

/** The 409 body when the bytes contradict the statement: the platform's own
 *  render, unchanged, carries no signature. Null when nothing contradicts it. */
export function contradictedAttestation(attested: boolean, uneditedPlatformRender: boolean, formId: string): AttestationRefusal | null {
  if (!attested || !uneditedPlatformRender) return null;
  return {
    error: {
      code: 'ATTESTATION_CONTRADICTED',
      message: `This file is the platform’s own render of Form FDA ${formId.replace(/^FDA_/, '')}, unchanged, and the platform never signs a form — so it cannot be the completed, signed form. Nothing was filed. Complete and sign it in Adobe Acrobat, then attach the signed file.`,
    },
  };
}

/** Record the statement on the retained file it is about: by the session's
 *  user, at the server's time, scoped to the uploader's organisation. */
export async function recordCompletedSignedAttestation(
  fileId: number,
  ctx: { userId: number; organizationId: number },
): Promise<Date> {
  const [recorded] = await db
    .update(renderedLeafFiles)
    .set({ completedSignedAttestedBy: ctx.userId, completedSignedAttestedAt: new Date() })
    .where(and(eq(renderedLeafFiles.id, fileId), eq(renderedLeafFiles.organizationId, ctx.organizationId)))
    .returning({ at: renderedLeafFiles.completedSignedAttestedAt });
  if (!recorded?.at) throw new Error('ind-forms official upload: the attestation was not recorded');
  return recorded.at;
}

/** The attestation, and the completion verdict, as the upload reports them.
 *  Complete needs both: the check found nothing missing AND the file was attested. */
export function attestationOutcome(requiredFieldsMissing: string[] | null, attestedAt: Date | null, userId: number) {
  return {
    attested: attestedAt !== null,
    attestedAt: attestedAt ? attestedAt.toISOString() : null,
    attestedBy: attestedAt ? userId : null,
    complete: requiredFieldsMissing !== null && requiredFieldsMissing.length === 0 && attestedAt !== null,
  };
}
