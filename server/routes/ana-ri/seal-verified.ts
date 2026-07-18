/**
 * POST /api/ana-ri/seal-verified-version — E1: Part 11 verified-and-sealed
 * export. Extracted into its own module so the handler stays under the
 * per-function complexity/length budget and `utility.ts` doesn't grow.
 *
 * The Document Studio "verify against your source" verdict becomes auditable
 * evidence: when a document verified CLEAN, the user manifests a §11.50
 * signature (printedName + meaning AUTHOR|REVIEWER|APPROVER + reason) and we
 * persist an immutable SealedRecord + provenance + audit in ONE transaction. We
 * re-verify the signer server-side (§11.200) and enforce the meaning enum
 * server-side; sealing is blocked for sample/draft content and for anything not
 * verified clean. Gated behind ENABLE_ANA_DOCUMENT_STUDIO (off by default).
 *
 * @module server/routes/ana-ri/seal-verified
 */

import type { Request, Response } from 'express';

import {
  verifySignerCredentials,
  defaultSignoffDeps,
} from '../../services/ana-ri/governed-action-signoff.js';
import {
  sealVerifiedVersion,
  SealBlockedError,
  type SealVerifiedVersionInput,
} from '../../services/ana/verifiedSealService.js';
import { sendError, sendSuccess, extractRequestContext } from './shared.js';
import { isSigningAuthorized } from '../../services/part11/signing-authority.js';
import { resolveSignerOrgRole } from '../../services/part11/resolve-signer-role.js';

/** Is E1 enabled? Mirrors the client ENABLE_ANA_DOCUMENT_STUDIO flag (off by
 * default) via an explicit env opt-in, so the route is inert until the studio
 * ships. */
function studioEnabled(): boolean {
  return process.env.ENABLE_ANA_DOCUMENT_STUDIO === 'true';
}

/** Build the typed seal input from a (validated-context) request. Pure-ish:
 * only reads the body. The service does the §11.50 / sample / verified gates. */
function buildSealInput(
  req: Request,
  numericOrgId: number,
  userId: number,
  secondFactorVerified: boolean,
): SealVerifiedVersionInput {
  const body = req.body ?? {};
  const manifestation = body.manifestation && typeof body.manifestation === 'object' ? body.manifestation : {};
  const verification =
    body.verification && typeof body.verification === 'object'
      ? {
          ok: body.verification.ok === true,
          message: typeof body.verification.message === 'string' ? body.verification.message : undefined,
        }
      : { ok: false };
  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined;

  return {
    organizationId: numericOrgId,
    projectId: Number(body.projectId) || 0,
    userId,
    signerName:
      typeof body.signerName === 'string' && body.signerName.trim()
        ? body.signerName
        : typeof manifestation.printedName === 'string'
          ? manifestation.printedName
          : '',
    signerEmail: typeof body.signerEmail === 'string' ? body.signerEmail : null,
    signerRole: typeof body.signerRole === 'string' ? body.signerRole : null,
    title: typeof body.title === 'string' ? body.title : '',
    content: typeof body.content === 'string' ? body.content : '',
    ctdSection: typeof body.ctdSection === 'string' ? body.ctdSection : null,
    manifestation,
    verification,
    isSample: body.isSample === true,
    isDraft: body.isDraft === true,
    atoms: Array.isArray(body.atoms) ? body.atoms : undefined,
    // Build-1 integration points — consumed when present.
    artifactPk: typeof body.artifactPk === 'number' ? body.artifactPk : undefined,
    artifactExternalId: typeof body.artifactExternalId === 'string' ? body.artifactExternalId : undefined,
    existingVersionId: typeof body.existingVersionId === 'number' ? body.existingVersionId : undefined,
    existingVersionNumber: typeof body.existingVersionNumber === 'number' ? body.existingVersionNumber : undefined,
    ipAddress,
    signatureVerified: true,
    secondFactorVerified,
  };
}

/** The request handler. */
export async function handleSealVerifiedVersion(req: Request, res: Response): Promise<Response> {
  if (!studioEnabled()) {
    return sendError(res, 404, 'Not found', null, 'FEATURE_DISABLED');
  }

  const { numericOrgId, userId } = extractRequestContext(req);
  if (!numericOrgId || !userId) {
    return sendError(res, 401, 'Authentication and organization context required', null, 'AUTH_REQUIRED');
  }

  const body = req.body ?? {};
  if (typeof body.title !== 'string' || !body.title || typeof body.content !== 'string' || !body.content) {
    return sendError(res, 400, 'A title and content are required to seal a version', null, 'MISSING_CONTENT');
  }

  // §11.200: re-verify the signer server-side (never a client flag). Sealing is
  // a manifested electronic signature, so credentials are always required.
  const password = typeof body.password === 'string' ? body.password : '';
  const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken : undefined;
  const credentials = await verifySignerCredentials(defaultSignoffDeps, { userId, password, mfaToken });
  if (!credentials.verified) {
    return sendError(res, 401, credentials.error || 'Signature verification failed', { code: credentials.code }, 'SIGNATURE_REJECTED');
  }

  // §11.10(g): identity is not authority. Sealing a verified version applies a
  // manifested electronic signature — permitted only for a signer whose org role
  // carries signing authority. Role resolved from the membership record (never a
  // client flag), gated by the same policy as /api/esignature/sign.
  const signerRole = await resolveSignerOrgRole(userId, numericOrgId);
  if (!isSigningAuthorized(signerRole)) {
    return sendError(
      res,
      403,
      'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)).',
      { code: 'ESIGNATURE_NO_AUTHORITY' },
      'ESIGNATURE_NO_AUTHORITY',
    );
  }

  try {
    const result = await sealVerifiedVersion(
      buildSealInput(req, numericOrgId, userId, credentials.secondFactorVerified),
    );
    return sendSuccess(res, result);
  } catch (error: any) {
    if (error instanceof SealBlockedError) {
      return sendError(res, error.status, error.message, { code: error.code }, error.code);
    }
    return sendError(res, 500, error?.message || 'Failed to seal verified version', null, 'SEAL_FAILED');
  }
}
