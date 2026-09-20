/**
 * @fileoverview Signed-package export resolver — the orchestrator → export seam
 * @module server/services/ectd/signed-package-export
 *
 * ## The gap this closes
 *
 * `runOrchestrator()` composes, assembles, validates and e-signs a real eCTD
 * package. Separately, `POST /api/ectd/export/:submissionId` assembles its OWN
 * package from the submissions spine via `assemble-from-core.ts`. Nothing bound
 * the two. A user could orchestrate + sign package A and then export package B
 * under the same submission id — the signature did not bind what actually
 * shipped.
 *
 * Under 21 CFR Part 11 §11.70 (signature/record linking) a signature must be
 * linked to its record such that it cannot be excised, copied, or transferred
 * to falsify another record. An export path that re-derives its own bytes
 * breaks exactly that link.
 *
 * ## What this service does
 *
 * Resolves "the package that run R signed" and refuses to hand it back unless
 * every integrity control still holds. It is READ-ONLY and ADDITIVE: it does
 * not modify the orchestrator, does not add a step, and does not touch the
 * existing spine-based export path. It reads the `package.sign` step's
 * persisted `signedSnapshot` and re-verifies it end to end.
 *
 * ## The verification chain (fail closed at every link)
 *
 *   1. run exists AND belongs to the calling tenant      → else `run-not-found`
 *   2. `package.sign` step present and `complete`        → else `not-signed` / `awaiting-signature`
 *   3. step outputRef parses and carries a snapshot      → else `snapshot-missing`
 *   4. HMAC seal over (digest, org) verifies             → else `seal-failed`
 *   5. digest RECOMPUTED from the snapshot == stored     → else `digest-drift`
 *   6. an active (non-superseded) signature row exists   → else `signature-revoked`
 *
 * Link 5 is the one that matters most: it recomputes the bound payload digest
 * from the stored leaf manifest + validator outcome + identity tuple using the
 * SAME exported function the signing path used. If anybody edited the steps
 * JSONB to swap in a different leaf manifest, the recomputed digest diverges
 * and the export is refused. Link 4 covers the case where the tamperer also
 * rewrote the stored digest to match their manifest — they cannot forge the
 * server-keyed HMAC. Together they make the snapshot tamper-evident.
 *
 * ## What this service deliberately does NOT do
 *
 * It does not produce ZIP bytes. The snapshot stores the leaf MANIFEST (with
 * per-leaf md5) and the backbone XML, not the leaf byte payloads — see the
 * "WHAT IT DOES NOT STORE" note on `SignedPackageSnapshot`. Byte materialization
 * for transmit is a separate concern (blob storage) tracked with the transmit
 * work. A caller that wants bytes must re-render deterministic leaves and check
 * each one against `descriptor.leaves[i].checksum` before shipping; for useAI
 * runs the rendered PDFs must be persisted first. `verifyLeafBytes()` below is
 * the checker for that step.
 */

import {
  getRun,
  computeBoundPayloadDigestFromComponents,
  findActiveReleaseSignature,
  type SignedPackageSnapshot,
  type StepRecord,
} from '../submission-package-orchestrator.js';
import { isVerificationUnavailable } from '../../lib/verification-outcome.js';
import { verifySignPayloadSeal, type SealVerdict } from './sign-payload-seal.js';
import type { ECTDLeaf } from './ectd4-validator.js';
import crypto from 'crypto';

// ── Refusal taxonomy ────────────────────────────────────────────────────────

/**
 * Why an export was refused. Each maps to a distinct operator action, so they
 * are NOT collapsed — except `run-not-found`, which intentionally merges
 * "no such run" with "wrong tenant" so a caller cannot probe for the existence
 * of another org's runs (same collapse `getRun` already performs).
 */
export type SignedExportRefusal =
  /** No such run, or the run belongs to a different organization. */
  | 'run-not-found'
  /** The run never reached the signing gate, or the gate was skipped. */
  | 'not-signed'
  /** Signing was reached but no signature has been applied yet. */
  | 'awaiting-signature'
  /** Run predates snapshot persistence (2026-07). Re-sign to export. */
  | 'snapshot-missing'
  /** Stored HMAC seal does not verify — the snapshot or digest was altered. */
  | 'seal-failed'
  /** Digest recomputed from the snapshot ≠ the stored digest — content drift. */
  | 'digest-drift'
  /** The signature was superseded or rolled back; no active row remains. */
  | 'signature-revoked'
  /**
   * The signature lookup could not run (WO-16B finding 14). NOT a statement
   * about the signature: it may well still stand. Distinct from
   * 'signature-revoked' because the operator action differs — retry or fix the
   * store, not re-sign.
   */
  | 'signature-unverifiable';

export interface SignedExportRefusalResult {
  ok: false;
  refusal: SignedExportRefusal;
  /** Operator-facing detail. Safe to log; safe to surface to an authenticated tenant user. */
  detail: string;
}

/**
 * A verified, export-ready description of the package a run signed. Every field
 * here is drawn from the frozen snapshot — never re-derived from live inputs —
 * so it describes the record the signature actually binds.
 */
export interface SignedExportDescriptor {
  runId: string;
  submissionId: string;
  organizationId: number;
  applicationNumber: string;
  sequenceNumber: string;
  region: string;
  submissionType: string;
  /** The signed leaf manifest. Per-leaf `checksum` is the content fingerprint. */
  leaves: ECTDLeaf[];
  /** The signed ICH backbone (index.xml). Empty string for fallback regions. */
  backboneXml: string;
  totalSizeBytes: number;
  /** The bound payload digest the signature was taken over. */
  payloadDigest: string;
  /** electronic_signatures.id of the active signature. */
  signatureId: number;
  /** Seal posture: 'ok' when a seal verified, 'unsealed' in an unsealed (dev) posture. */
  sealVerdict: Extract<SealVerdict, 'ok' | 'unsealed'>;
  /** Validator outcome frozen at signing time. */
  gatewayReady: boolean;
  hardenedScore: number;
}

export interface SignedExportSuccessResult {
  ok: true;
  descriptor: SignedExportDescriptor;
}

export type SignedExportResult = SignedExportSuccessResult | SignedExportRefusalResult;

// ── Internal: the persisted sign-step payload shape ─────────────────────────
//
// Mirrors `PackageSignStepPayload` in the orchestrator, which is module-private
// there. We only read the fields the verification chain needs. Kept structural
// (not imported) on purpose: this service must tolerate the orchestrator adding
// fields without a compile break, and it must never WRITE this shape.

interface ParsedSignPayload {
  payloadDigest: string;
  payloadSeal?: string;
  signatureId?: number;
  awaitingSince?: string;
  signedSnapshot?: SignedPackageSnapshot;
}

function parseSignPayload(raw: string | undefined): ParsedSignPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ParsedSignPayload).payloadDigest === 'string' &&
      (parsed as ParsedSignPayload).payloadDigest.length > 0
    ) {
      return parsed as ParsedSignPayload;
    }
  } catch {
    /* non-JSON outputRef (e.g. a 'skipped:not-required' marker) */
  }
  return null;
}

function refuse(refusal: SignedExportRefusal, detail: string): SignedExportRefusalResult {
  return { ok: false, refusal, detail };
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the signed package for an orchestrator run, verifying the full
 * integrity chain. Returns a discriminated result — callers MUST branch on
 * `ok` and must not fall back to re-assembling a package when this refuses.
 * A refusal means "there is no signed record to export", never "export
 * something else instead".
 */
export async function resolveSignedPackageForExport(params: {
  runId: string;
  organizationId: number;
  /** Test seam for the seal key lookup. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}): Promise<SignedExportResult> {
  const { runId, organizationId } = params;
  const env = params.env ?? process.env;

  // 1 — run exists and is ours (getRun collapses not-found and cross-tenant).
  const run = await getRun(runId, organizationId);
  if (!run) {
    return refuse('run-not-found', `No orchestrator run ${runId} visible to this organization.`);
  }

  // 2 — the signing gate completed.
  const signStep: StepRecord | undefined = run.steps?.find(s => s.key === 'package.sign');
  if (!signStep) {
    return refuse('not-signed', `Run ${runId} has no package.sign step; it predates the e-signature gate.`);
  }
  if (signStep.status === 'awaiting-signature') {
    return refuse(
      'awaiting-signature',
      `Run ${runId} is awaiting an e-signature. Sign the release before exporting.`,
    );
  }
  if (signStep.status !== 'complete') {
    return refuse(
      'not-signed',
      `Run ${runId} package.sign is '${signStep.status}', not 'complete'. ` +
        `A skipped gate means this submission type does not require a release signature — ` +
        `use the standard export path for it.`,
    );
  }

  // 3 — the step carries a parseable payload with a frozen snapshot.
  const payload = parseSignPayload(signStep.outputRef);
  if (!payload) {
    return refuse('not-signed', `Run ${runId} package.sign carries no signature payload.`);
  }
  const snapshot = payload.signedSnapshot;
  if (!snapshot) {
    return refuse(
      'snapshot-missing',
      `Run ${runId} was signed before snapshot persistence landed (2026-07). ` +
        `Re-run and re-sign to produce an exportable signed record.`,
    );
  }

  // 4 — the server-keyed seal still verifies. 'failed' covers both a mismatched
  //     HMAC and a seal that exists but cannot be verified (key gone) — both
  //     mean the tamper-evidence control is unsatisfiable, so we refuse.
  const sealVerdict = verifySignPayloadSeal(payload.payloadDigest, organizationId, payload.payloadSeal, env);
  if (sealVerdict === 'failed') {
    return refuse(
      'seal-failed',
      `Run ${runId} signature seal did not verify. The stored payload digest or its seal was altered, ` +
        `or the signing key is no longer available. Refusing to export.`,
    );
  }

  // 5 — THE integrity check. Recompute the bound digest from the frozen
  //     snapshot through the same function the signing path used. Any edit to
  //     the stored leaf manifest, validator outcome, or identity tuple moves
  //     this digest away from the sealed one.
  const recomputed = computeBoundPayloadDigestFromComponents({
    leaves: snapshot.leaves,
    validatorOutcome: snapshot.validatorOutcome,
    submissionId: snapshot.submissionId,
    applicationNumber: snapshot.applicationNumber,
    region: snapshot.region,
    submissionType: snapshot.submissionType,
    organizationId: snapshot.organizationId,
    // '' is falsy — matches how buildSignedSnapshot stores fallback-region
    // packages that have no backbone, so the digest omits it on both sides.
    backboneXml: snapshot.backboneXml || undefined,
  });
  if (recomputed !== payload.payloadDigest) {
    return refuse(
      'digest-drift',
      `Run ${runId} signed-package digest mismatch: the stored snapshot hashes to ${recomputed.slice(0, 16)}… ` +
        `but the signature was taken over ${payload.payloadDigest.slice(0, 16)}…. ` +
        `The package content changed after signing. Refusing to export.`,
    );
  }

  // 6 — an active, non-superseded signature still stands for this digest.
  //     Checked LAST because it is the only DB round-trip beyond getRun; the
  //     cheap in-memory checks above short-circuit the common refusals first.
  let active: { id: number } | null;
  try {
    active = await findActiveReleaseSignature({
      organizationId,
      boundPayloadDigest: payload.payloadDigest,
    });
  } catch (err) {
    if (!isVerificationUnavailable(err)) throw err;
    return refuse(
      'signature-unverifiable',
      `Run ${runId}: the release-signature lookup could not run; the failure is in the server log. ` +
        `Nothing is known about the signature's standing — it has NOT been found revoked. Refusing to export until the check can run.`,
    );
  }
  if (!active) {
    return refuse(
      'signature-revoked',
      `Run ${runId} has no active release signature for its payload digest — ` +
        `it was superseded or rolled back. Re-sign before exporting.`,
    );
  }

  return {
    ok: true,
    descriptor: {
      runId: run.runId,
      submissionId: snapshot.submissionId,
      organizationId: snapshot.organizationId,
      applicationNumber: snapshot.applicationNumber,
      sequenceNumber: snapshot.sequenceNumber,
      region: snapshot.region,
      submissionType: snapshot.submissionType,
      leaves: snapshot.leaves,
      backboneXml: snapshot.backboneXml,
      totalSizeBytes: snapshot.totalSizeBytes,
      payloadDigest: payload.payloadDigest,
      signatureId: active.id,
      sealVerdict,
      gatewayReady: snapshot.validatorOutcome.gatewayReady,
      hardenedScore: snapshot.validatorOutcome.hardenedScore,
    },
  };
}

// ── Byte verification (for the eventual transmit/ZIP hop) ───────────────────

export interface LeafByteMismatch {
  filePath: string;
  expectedChecksum: string;
  actualChecksum: string;
}

export interface LeafByteVerification {
  ok: boolean;
  /** Leaves in the manifest for which no buffer was supplied. */
  missing: string[];
  /** Leaves whose supplied bytes do not hash to the signed checksum. */
  mismatched: LeafByteMismatch[];
}

/**
 * Verify re-rendered leaf bytes against the signed manifest.
 *
 * The snapshot stores checksums, not bytes. Whoever materializes a ZIP for
 * transmit MUST run every rendered buffer through here first: a leaf whose
 * bytes do not hash to the signed md5 is not the leaf that was signed, and
 * shipping it would break the §11.70 record link just as surely as exporting a
 * wholly different package.
 *
 * Fails closed on missing buffers — an absent leaf is not a passing leaf.
 */
export function verifyLeafBytes(
  signedLeaves: ECTDLeaf[],
  renderedBuffers: Record<string, Buffer>,
): LeafByteVerification {
  const missing: string[] = [];
  const mismatched: LeafByteMismatch[] = [];

  for (const leaf of signedLeaves) {
    const buf = renderedBuffers[leaf.filePath];
    if (!buf) {
      missing.push(leaf.filePath);
      continue;
    }
    const actual = crypto.createHash('md5').update(buf).digest('hex');
    if (actual.toLowerCase() !== String(leaf.checksum).toLowerCase()) {
      mismatched.push({
        filePath: leaf.filePath,
        expectedChecksum: leaf.checksum,
        actualChecksum: actual,
      });
    }
  }

  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

/** HTTP status for each refusal, so route handlers stay consistent. */
export function refusalHttpStatus(refusal: SignedExportRefusal): number {
  switch (refusal) {
    case 'run-not-found':
      return 404;
    case 'not-signed':
    case 'awaiting-signature':
    case 'snapshot-missing':
    case 'signature-revoked':
      // Precondition not met: the caller must sign (or re-sign) first.
      return 409;
    case 'seal-failed':
    case 'digest-drift':
      // Integrity failure. Not a client mistake — surface it distinctly so it
      // can be alerted on separately from ordinary workflow-state refusals.
      return 422;
    case 'signature-unverifiable':
      // The check did not run. Same status innovation-routes gives an
      // ownership check that could not run: not a precondition (409), not an
      // integrity finding (422), not a crash (500).
      return 503;
  }
}

export default {
  resolveSignedPackageForExport,
  verifyLeafBytes,
  refusalHttpStatus,
};
