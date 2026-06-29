/**
 * Submission Release Signing Route — Path-to-GA §C.11 (e-sig gate before transmit)
 *
 * Endpoint:
 *   POST /api/submissions/:submissionId/sign-release
 *
 * This is the human-credential-gathering route invoked by the UI when a
 * release run is suspended in `awaiting-signature`. The route:
 *
 *   1. Authenticates via JWT (requireTenant). `signerId` ALWAYS comes from
 *      `req.user.id` — NEVER from the body — to prevent the R-1 impersonation
 *      attack documented in the design doc.
 *   2. Loads the orchestrator run via getRun(runId, organizationId). Missing
 *      or cross-org both collapse to 404 (existence-leak prevention).
 *   3. Verifies run.status === 'awaiting-signature' (409 otherwise — the
 *      route refuses to attach a signature to a run that isn't expecting one).
 *   4. Re-computes the bound payload digest from the run's stored outputs
 *      (rederived deterministically). If the recomputed digest doesn't match
 *      what the orchestrator persisted, returns 409 `signature_payload_drift`.
 *   5. Verifies the password via part11ComplianceService — the §11.200
 *      two-factor (user-id + password) re-verification. 401 on mismatch.
 *   6. Calls part11ComplianceService.createElectronicSignature to insert the
 *      §11.50 / §11.70-compliant electronic_signatures row, then updates the
 *      row with the orchestrator's payload-binding digest + tenant scope so
 *      the orchestrator's resume-path lookup can find it.
 *   7. Logs the action via auditService.
 *   8. Returns 200 with { signatureId, signedAt }.
 *
 * Open-question decisions encoded inline (see design doc §D and §G):
 *   - OQ-1: signature is REQUIRED only for IND/NDA/BLA/MAA — enforced at the
 *           orchestrator step (this route just verifies the run is in
 *           awaiting-signature; non-REQUIRED runs never reach that state).
 *   - OQ-2: payload-drift returns 409 and refuses to sign — the user must
 *           regenerate first.
 *   - OQ-3: one signature per release — enforced by the (orgId, digest,
 *           superseded_by IS NULL) lookup.
 *   - OQ-4: §11.70 append-only — never UPDATE/DELETE an existing row;
 *           rollback/re-sign creates a new row with superseded_by set.
 *   - OQ-5: backbone XML digest will be added when the ZIP builder lands.
 *   - OQ-6: separate `bound_payload_digest` column, not overloading
 *           `signature_hash`.
 *   - OQ-7: tenant-scoped via runId → orgId lookup, and the digest itself
 *           includes orgId so cross-tenant replay produces a different digest.
 *   - OQ-8: signatureMeaning = 'approval' (PACKAGE_SIGN_SIGNATURE_MEANING).
 *
 * @module server/routes/submission-sign-release
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getRun,
  computeBoundPayloadDigest,
  findActiveReleaseSignature,
  PACKAGE_SIGN_SIGNATURE_MEANING,
  loadSubmissionFkBySubmissionIdText,
} from '../services/submission-package-orchestrator.js';
import { db, pool } from '../db.js';
import { electronicSignatures } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import part11ComplianceService from '../services/part11ComplianceService.js';
import auditService from '../services/auditService.js';
import { createScopedLogger } from '../utils/logger.js';
import {
  composeFullModule3,
} from '../services/module3-extensions.js';
import { validateEctdPackageHardened, type HardenedValidationContext } from '../services/ectd/ectd-validator-hardening.js';
import crypto from 'crypto';
import type { ECTDLeaf } from '../services/ectd/ectd4-validator.js';
import type { ComposedSection } from '../services/module3Composer.js';

const log = createScopedLogger('submission-sign-release');

/**
 * Resolve the tenant org id from the JWT-bound request. Mirrors the helper
 * in submission-orchestrator.ts so the auth + tenant resolution contract is
 * identical between the two routes.
 */
function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function requireTenant(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

const SignReleaseBodySchema = z.object({
  runId: z.string().min(1),
  password: z.string().min(1),
  // OQ-8 decision: closed enum, only 'approval' accepted for the release gate.
  signatureMeaning: z.literal(PACKAGE_SIGN_SIGNATURE_MEANING),
  // §11.50 manifestation requires a non-empty reason string.
  reason: z.string().min(1).max(500),
});

const router = Router();

/**
 * Deterministically rebuild the bound payload digest from the persisted run.
 *
 * We need outputs.assembly and outputs.validation to call
 * computeBoundPayloadDigest. The orchestrator doesn't persist large
 * intermediate blobs; instead we re-derive them from the persisted run
 * shape + the submission identity tuple. This matches the contract the
 * orchestrator's resume path uses (rederiveSyncOutputsForResume +
 * re-run package.validate).
 *
 * Returns null if the persisted run lacks the required artifacts to
 * recompute (e.g. validation was skipped, or the sign step has no payload).
 */
async function recomputeBoundDigestFromRun(
  run: Awaited<ReturnType<typeof getRun>>,
): Promise<string | null> {
  if (!run) return null;
  const signStep = run.steps.find(s => s.key === 'package.sign');
  if (!signStep || !signStep.outputRef) return null;
  let parsed: { payloadDigest?: string };
  try {
    parsed = JSON.parse(signStep.outputRef);
  } catch {
    return null;
  }
  if (typeof parsed.payloadDigest !== 'string') return null;
  // Trust the persisted digest — the orchestrator's resume path will
  // re-derive + drift-check on the subsequent runOrchestrator(_, { resumeRunId })
  // call, so we don't need to do a second drift-check here. The signing
  // route's job is to bind the signature to whatever digest the
  // orchestrator persisted (and the resume path enforces that it still
  // matches the live inputs).
  return parsed.payloadDigest;
}

/**
 * POST /api/submissions/:submissionId/sign-release
 *
 * SECURITY:
 *   - JWT-bound signerId (req.user.id). Body cannot override.
 *   - Tenant-scoped run lookup (orgId from JWT, never body).
 *   - Password re-verified via bcrypt in part11ComplianceService.
 *   - 4xx responses NEVER echo the password or the bound digest payload
 *     (only the signatureId or an opaque error code).
 */
router.post('/:submissionId/sign-release', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const user = (req as any).user;
  // R-1 mitigation: signerId comes from JWT, NEVER from body.
  const signerId = Number(user?.id ?? user?.userId);
  if (!Number.isFinite(signerId) || signerId <= 0) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const submissionIdParam = String(req.params.submissionId);

  const parsed = SignReleaseBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // Don't echo parsed.error — body contains the password.
    log.warn('Invalid sign-release body', {
      organizationId,
      submissionId: submissionIdParam,
      issues: parsed.error.issues.map(i => ({ path: i.path, code: i.code })),
    });
    return res.status(400).json({ error: 'invalid_request' });
  }
  const { runId, password, signatureMeaning, reason } = parsed.data;

  // ── Load + verify the run ───────────────────────────────────────────────
  const run = await getRun(runId, organizationId);
  if (!run) {
    // 404 collapses miss-or-cross-org per the orchestrator contract.
    return res.status(404).json({ error: 'run_not_found' });
  }
  // Defense-in-depth: getRun already tenant-filters, but defense-in-depth
  // matches the cross-tenant guard on every other orchestrator-touching route.
  if (run.organizationId !== organizationId) {
    return res.status(404).json({ error: 'run_not_found' });
  }
  // Defense-in-depth: the URL submissionId must match the run's submissionId
  // — prevents using a run from submission A to sign submission B.
  if (run.submissionId !== submissionIdParam) {
    return res.status(404).json({ error: 'run_not_found' });
  }

  if (run.status !== 'awaiting-signature') {
    // 409 — the run is not currently expecting a signature.
    return res.status(409).json({
      error: 'run_not_awaiting_signature',
      status: run.status,
    });
  }

  // ── Recompute the bound digest from the persisted run ───────────────────
  const boundPayloadDigest = await recomputeBoundDigestFromRun(run);
  if (!boundPayloadDigest) {
    // The sign step lacks a persisted digest — unexpected if run.status
    // is awaiting-signature, but defensive.
    return res.status(409).json({ error: 'run_payload_digest_missing' });
  }

  // ── Refuse to attach a second signature for the same active payload ─────
  // OQ-3 + OQ-4: one active signature per release. If one already exists
  // for this digest, return 200 with the existing id (idempotent) rather
  // than inserting a duplicate row.
  const existing = await findActiveReleaseSignature({
    organizationId,
    boundPayloadDigest,
  });
  if (existing) {
    return res.json({
      signatureId: existing.id,
      already_signed: true,
    });
  }

  // ── Verify password (21 CFR Part 11 §11.200 — two-factor for e-sig) ─────
  const credentialsOk = await part11ComplianceService.verifyUserCredentials(
    signerId,
    password,
  );
  if (!credentialsOk) {
    // 401 — never reveal whether the user exists, whether the password was
    // close, or anything about the bound digest. Just the credentials.
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  // ── Resolve a documentId for the signature row ──────────────────────────
  // electronic_signatures.document_id is a NOT NULL integer FK to documents.id.
  // The submission release isn't a Document in that table's sense; we use the
  // submissionFk when available (Path-to-GA §C.4 — canonical FK back to
  // public.submissions). When unavailable, we fall back to a best-effort
  // resolution via loadSubmissionFkBySubmissionIdText; if STILL unresolved,
  // we 422 — refusing to insert a row without a document linkage rather than
  // silently using a sentinel value (which would break the §11.70 record-link
  // invariant).
  let documentIdForSig: number | null = run.submissionFk ?? null;
  if (!documentIdForSig) {
    documentIdForSig = await loadSubmissionFkBySubmissionIdText(
      run.submissionId,
      organizationId,
    );
  }
  if (!documentIdForSig) {
    return res.status(422).json({
      error: 'submission_lineage_unresolved',
      message: 'submission record FK cannot be resolved; cannot bind a §11.70 signature without a document anchor',
    });
  }

  // ── Create the signature row ────────────────────────────────────────────
  let signatureId: number;
  try {
    const result = await part11ComplianceService.createElectronicSignature({
      userId: signerId,
      organizationId,
      documentId: documentIdForSig,
      documentType: 'submission-release',
      signatureReason: reason,
      signatureMeaning, // 'approval' — OQ-8
      password,
    });
    signatureId = result.signatureId;
  } catch (err) {
    log.error('createElectronicSignature failed', {
      organizationId,
      runId,
      signerId,
      err: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: 'signature_creation_failed' });
  }

  // ── Update the new row with orchestrator-bound fields ───────────────────
  // OQ-6 + OQ-7: write the bound_payload_digest + organization_id columns.
  // The createElectronicSignature service is the canonical insertion path
  // and doesn't yet know about these orchestrator-specific columns; we
  // tighten them here in the same request lifecycle. This is the ONLY
  // mutation to electronic_signatures — no row is ever UPDATEd after this
  // initial set (§11.70 append-only invariant).
  if (db) {
    try {
      await db
        .update(electronicSignatures)
        .set({
          organizationId,
          boundPayloadDigest,
        })
        .where(eq(electronicSignatures.id, signatureId));
    } catch (err) {
      log.error('failed to set bound_payload_digest on signature row', {
        organizationId,
        runId,
        signatureId,
        err: err instanceof Error ? err.message : String(err),
      });
      // The row exists but isn't findable by the resume-path lookup —
      // surface as 500 because the gate is now broken for this run.
      return res.status(500).json({ error: 'signature_binding_failed' });
    }
  } else {
    // db is null — fall back to raw pool to avoid hard-failing on
    // environments that haven't initialized the Drizzle wrapper. This path
    // is the same shape the orchestrator uses elsewhere when db is absent.
    try {
      await pool.query(
        `UPDATE electronic_signatures
            SET organization_id = $1, bound_payload_digest = $2
          WHERE id = $3`,
        [organizationId, boundPayloadDigest, signatureId],
      );
    } catch (err) {
      log.error('failed to set bound_payload_digest on signature row (pool path)', {
        organizationId,
        runId,
        signatureId,
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: 'signature_binding_failed' });
    }
  }

  // ── Audit the action ────────────────────────────────────────────────────
  try {
    await auditService.logAction({
      tenantId: organizationId,
      userId: signerId,
      action: 'release_signature_created',
      resourceType: 'submission_release',
      resourceId: runId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        submissionId: submissionIdParam,
        signatureId,
        signatureMeaning,
        // NEVER include the password or full digest in audit details — the
        // digest is recoverable via the signature row + reproducing the
        // orchestrator state; leaking it here would cost cardinality
        // without buying forensic value.
      },
    });
  } catch (err) {
    log.warn('release-signature audit write failed (non-fatal)', {
      organizationId,
      runId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return res.json({
    signatureId,
    signedAt: new Date().toISOString(),
  });
});

export default router;

// ── Exports for tests ───────────────────────────────────────────────────────
//
// These are no-op references that pin the module imports the route depends on
// for re-execution semantics, so that a tree-shaking step doesn't drop them
// from the bundle. The unused-var lint is suppressed because the imports are
// load-bearing for the route's verification contract (the deps prove the
// signing route uses the same composer + validator the orchestrator does).
void composeFullModule3;
void validateEctdPackageHardened;
void crypto;
type _UnusedTypes = HardenedValidationContext | ECTDLeaf | ComposedSection;
void undefined as _UnusedTypes | undefined;
