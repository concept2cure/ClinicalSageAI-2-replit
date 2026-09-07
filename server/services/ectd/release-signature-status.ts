/**
 * @fileoverview Resolve the release-signature state for a submission at dispatch time
 * @module server/services/ectd/release-signature-status
 *
 * The dispatch path (`assess-dispatch-readiness`) is keyed on the submissions
 * SPINE — `ectd_sequences` → `submission_leaves`. The e-signature lives on the
 * ORCHESTRATOR spine — `submission_orchestrator_runs.steps[package.sign]`. The
 * two join only through `submissions.id`:
 *
 *     ectd_sequences.submission_id ──┐
 *                                    ├──▶ submissions.id
 *     submission_orchestrator_runs.submission_id_fk ──┘
 *
 * This module walks that join and returns a verdict the pure dispatch gate can
 * judge. It reuses `resolveSignedPackageForExport` for the actual integrity
 * verification so there is ONE implementation of "does this signature still
 * bind its package" rather than a second, drifting copy.
 *
 * ## Why a submission can have several runs
 *
 * Re-running the orchestrator produces a new run. Only runs whose signature
 * still verifies count; the newest verifying run wins. A submission with three
 * runs where the newest failed integrity and an older one verifies is NOT
 * dispatchable on the strength of the older signature — the newest signed
 * package is the one that represents current intent, so an integrity failure
 * there is reported as `invalid`, not papered over by an older success.
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import {
  resolveSignedPackageForExport,
  type SignedExportRefusal,
} from './signed-package-export.js';
import type { ReleaseSignatureVerdict } from './dispatch-gate.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('release-signature-status');

/**
 * Submission types that require a release signature before transmit.
 *
 * Mirrors `SIGNATURE_REQUIRED_SUBMISSION_TYPES` in the orchestrator
 * (module-private there). Kept as an independent closed allowlist rather than
 * an import so a change to the orchestrator's build-time gate cannot silently
 * widen or narrow the TRANSMIT-time gate — the two are separate controls and a
 * divergence between them should surface as a test failure, not propagate
 * automatically. `releaseSignatureRequirementsAgree()` below is that test seam.
 *
 * REQUIRED: IND, NDA, BLA, MAA — every FDA-bound and EMA-bound submission that
 * crosses the §11.70 boundary via ESG / CESP.
 */
const TRANSMIT_SIGNATURE_REQUIRED_TYPES = new Set<string>(['IND', 'NDA', 'BLA', 'MAA']);

/** Whether this submission/application type requires a release signature to dispatch. */
export function isReleaseSignatureRequired(submissionType: string | null | undefined): boolean {
  if (!submissionType) return false;
  return TRANSMIT_SIGNATURE_REQUIRED_TYPES.has(submissionType.trim().toUpperCase());
}

/** Exposed so a contract test can assert this list against the orchestrator's. */
export function transmitSignatureRequiredTypes(): string[] {
  return [...TRANSMIT_SIGNATURE_REQUIRED_TYPES].sort();
}

export interface ReleaseSignatureStatus {
  verdict: ReleaseSignatureVerdict;
  /** Operator-facing detail — surfaced in the gate blocker message. */
  detail?: string;
  /** The orchestrator run the verdict came from, when one was found. */
  runId?: string;
  /** electronic_signatures.id, when a verifying signature was found. */
  signatureId?: number;
}

/** Map a signed-export refusal onto a dispatch verdict. */
function refusalToVerdict(refusal: SignedExportRefusal): ReleaseSignatureVerdict {
  switch (refusal) {
    // Integrity failures — a signature record exists and does not match.
    case 'seal-failed':
    case 'digest-drift':
      return 'invalid';
    case 'awaiting-signature':
      return 'awaiting';
    case 'signature-revoked':
      return 'revoked';
    // No usable signature record on this run.
    case 'not-signed':
    case 'snapshot-missing':
      return 'unsigned';
    // The run vanished between the query and the read — we cannot say.
    case 'run-not-found':
      return 'undetermined';
  }
}

/**
 * Resolve the release-signature state for a submission.
 *
 * Returns `undetermined` (never `unsigned`) on any lookup failure — a DB error
 * is not evidence that no signature exists, and the gate treats the two
 * differently on purpose.
 */
export async function resolveReleaseSignatureStatus(params: {
  submissionId: number;
  organizationId: number;
}): Promise<ReleaseSignatureStatus> {
  const { submissionId, organizationId } = params;

  if (!Number.isFinite(submissionId) || submissionId <= 0) {
    return { verdict: 'undetermined', detail: 'invalid submission id' };
  }
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return { verdict: 'undetermined', detail: 'invalid organization context' };
  }

  let runIds: string[];
  try {
    // Newest first: the most recent signed run represents current intent.
    const rows = await db.execute(sql`
      SELECT run_id
        FROM submission_orchestrator_runs
       WHERE submission_id_fk = ${submissionId}
         AND organization_id = ${organizationId}
       ORDER BY started_at DESC
       LIMIT 25
    `);
    const list = (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? (rows as unknown as Array<Record<string, unknown>>);
    runIds = (Array.isArray(list) ? list : [])
      .map(r => (r?.run_id == null ? '' : String(r.run_id)))
      .filter(Boolean);
  } catch (err) {
    // Fail closed and SAY SO. Reporting 'unsigned' here would let a DB outage
    // read as "this submission simply has no signature", which the gate would
    // then treat as a normal, fixable state instead of an unknown one.
    log.warn('release-signature lookup failed; reporting undetermined', {
      err: err instanceof Error ? err.message : String(err),
      submissionId,
      organizationId,
    });
    return {
      verdict: 'undetermined',
      detail: 'the orchestrator run lookup failed',
    };
  }

  if (runIds.length === 0) {
    return {
      verdict: 'unsigned',
      detail: 'no orchestrator run is linked to this submission',
    };
  }

  // Walk newest-first. The first run that yields a definitive answer wins.
  // An integrity failure on the newest run is returned immediately rather than
  // falling through to an older, still-valid signature.
  let firstNonUnsigned: ReleaseSignatureStatus | null = null;

  for (const runId of runIds) {
    const result = await resolveSignedPackageForExport({ runId, organizationId });

    if (result.ok) {
      return {
        verdict: 'signed',
        runId,
        signatureId: result.descriptor.signatureId,
        detail: `verified against run ${runId}`,
      };
    }

    const verdict = refusalToVerdict(result.refusal);

    // Integrity failure short-circuits — never look for an older signature to
    // excuse a tampered newer one.
    if (verdict === 'invalid') {
      return { verdict, runId, detail: result.detail };
    }

    // Remember the most recent non-trivial state (awaiting / revoked /
    // undetermined) so we report THAT rather than a bare 'unsigned' when no
    // run ever produced a verifying signature.
    if (!firstNonUnsigned && verdict !== 'unsigned') {
      firstNonUnsigned = { verdict, runId, detail: result.detail };
    }
  }

  return (
    firstNonUnsigned ?? {
      verdict: 'unsigned',
      detail: `no run among ${runIds.length} carries a completed release signature`,
    }
  );
}

export default {
  resolveReleaseSignatureStatus,
  isReleaseSignatureRequired,
  transmitSignatureRequiredTypes,
};
