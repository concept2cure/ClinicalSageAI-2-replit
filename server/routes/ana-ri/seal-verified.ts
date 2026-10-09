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

import { reverifySigner } from '../../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../../services/part11/reverify-signer-deps.js';
import {
  sealVerifiedVersion,
  SealBlockedError,
  type SealVerifiedVersionInput,
} from '../../services/ana/verifiedSealService.js';
import { sendError, sendSuccess, extractRequestContext } from './shared.js';
import { checkSigningAuthority } from '../../services/part11/signing-authority-gate.js';
import { clientIpOf } from '../../utils/client-ip';

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
          scope: body.verification.scope,
          artifactVerified: body.verification.artifactVerified,
          sourceVerified: body.verification.sourceVerified,
          sourceDiffPerformed: body.verification.sourceDiffPerformed,
        }
      : { ok: false };
  const ipAddress = clientIpOf(req) ?? undefined;

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
    // Keep explicit malformed selectors: the central gate must refuse them,
    // rather than interpreting a dropped selector as a new-document request.
    artifactPk: body.artifactPk,
    artifactExternalId: body.artifactExternalId,
    existingVersionId: body.existingVersionId,
    existingVersionNumber: body.existingVersionNumber,
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

  // §11.10(g): identity is not authority. Sealing a verified version applies a
  // manifested electronic signature — permitted only for a signer whose org role
  // carries signing authority: the platform's one policy (checkSigningAuthority,
  // the membership row, never a client flag). Asked BEFORE the password since
  // 2026-10-08 (P-27); asked after it, a role that may not sign could test one.
  const authority = await checkSigningAuthority(userId, numericOrgId);
  if (authority) {
    return sendError(res, authority.status, authority.message, { code: authority.code }, authority.code);
  }

  // §11.200: re-verify the signer server-side (never a client flag). Sealing is
  // a manifested electronic signature, so credentials are always required.
  const password = typeof body.password === 'string' ? body.password : '';
  const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken : undefined;
  const credentials = await reverifySigner(userId, { password, mfaToken }, signerReverificationDeps());
  if (!credentials.ok) {
    return sendError(res, credentials.status, credentials.error, { code: credentials.code }, 'SIGNATURE_REJECTED');
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
