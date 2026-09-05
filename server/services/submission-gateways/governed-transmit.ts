/**
 * Governed transmit — the ONE implementation of "ship an assembled package to a
 * real agency gateway".
 *
 * Transmission is the single irreversible action in the platform: nothing here
 * can un-send bytes to an agency. Historically the whole ceremony that makes it
 * safe lived inline in the HTTP handler
 * (POST /api/mdx/gateways/:region/:gateway/transmit), which meant any *other*
 * caller that wanted to transmit had to either re-implement the ceremony or —
 * as the AnA 510(k) chat command actually did — call a second, non-transmitting
 * "ESG service" that could never reach the wire at all.
 *
 * So the ceremony now lives here, once, and every caller passes through it:
 *
 *   1. the descriptor naming the bytes must be the SERVER-GENERATED one the
 *      tenant-scoped assemble route persisted on
 *      `c2c_submission_packages.metadata.bundle` (C2C-SUB-003);
 *   2. path syntax, namespace confinement and durable-key confinement;
 *   3. internal eCTD structural validation evidence must be PRESENT (missing is
 *      UNKNOWN, and UNKNOWN blocks) and error-free;
 *   4. the per-package active-transmittal lock;
 *   5. the gateway registry's own human-authorization guard + pre-transmit
 *      package-fitness checks (see ./index.ts, ./pre-transmit-check.ts);
 *   6. the Part 11 governed-action ledger entry for the `sign`.
 *
 * What this module deliberately does NOT do is decide that a human authorized
 * the transmit. The caller proves that and hands the proof in
 * (`reauthVerifiedAt`), because the proof is surface-specific: the HTTP route
 * verifies a password/TOTP re-auth inline, while the AnA governed-action route
 * verifies the signer's credentials before dispatching the command. Both end up
 * at the same `TransmitAuthorization` the gateway layer requires.
 *
 * Errors are typed rather than HTTP-shaped so a non-HTTP caller (the AnA
 * command handler) can map them onto its own refusal vocabulary without
 * pretending to be a web request.
 *
 * @module server/services/submission-gateways/governed-transmit
 */

import { promises as fsp } from 'fs';
import { dirname } from 'path';

import { pool } from '../../db';
import { getGateway } from './index';
import type { GatewayName, GatewayTransmitResult, Region, SubmissionBundle } from './types';
import { findActiveTransmittal } from './fda-esg';
import { getBundle } from '../submission-bundle-storage';
import {
  assessPackageContent,
  isCurrentContentFingerprint,
  CONTENT_DRIFT_MESSAGE,
  CONTENT_UNPROVEN_MESSAGE,
  type ContentAssessment,
} from '../ectd/package-content-fingerprint';
import {
  bundleTrustEnforced,
  hasUnsafePathSyntax,
  isBundleStorageKey,
  isPathWithinBundleRoot,
} from './bundle-namespace';

/* ─── Refusal vocabulary ─────────────────────────────────────────── */

/**
 * Why a governed transmit was refused BEFORE any bytes left the platform.
 *
 * Every one of these is an honest "no", not a failure: the caller asked for a
 * transmission the platform is not willing to make, and no transmittal row,
 * acknowledgement or agency identifier is produced.
 */
export type GovernedTransmitRefusalCode =
  | 'CLIENT_DESCRIPTOR_REFUSED'
  | 'BUNDLE_NOT_ASSEMBLED'
  | 'BUNDLE_PATH_UNSAFE'
  | 'BUNDLE_VALIDATION_UNKNOWN'
  | 'BUNDLE_OUTSIDE_NAMESPACE'
  | 'BUNDLE_STORAGE_KEY_OUTSIDE_NAMESPACE'
  | 'BUNDLE_VALIDATION_ERRORS'
  | 'BUNDLE_CONTENT_DRIFT'
  | 'BUNDLE_CONTENT_UNPROVEN'
  | 'ACTIVE_TRANSMITTAL';

/** A refusal the caller should surface verbatim to the operator. */
export class GovernedTransmitRefusal extends Error {
  readonly name = 'GovernedTransmitRefusal';
  constructor(
    readonly code: GovernedTransmitRefusalCode,
    message: string,
    /** HTTP status the pre-existing route used for this refusal. */
    readonly httpStatus: 409 | 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * An internal failure (DB read, durable-storage fetch) rather than a refusal.
 * Carries the log label the HTTP route used so its 500 telemetry is unchanged.
 */
export class GovernedTransmitInternalError extends Error {
  readonly name = 'GovernedTransmitInternalError';
  constructor(readonly stage: string, readonly cause: unknown) {
    super(`governed transmit failed at stage '${stage}'`);
  }
}

/* ─── Bundle descriptors ─────────────────────────────────────────── */

/** Transmit formats a bundle descriptor may declare. */
export const BUNDLE_FORMAT_SET = ['ectd', 'estar', 'eudamed_register', 'pmda_ectd'] as const;
export type BundleFormat = typeof BUNDLE_FORMAT_SET[number];

const SHA256_RE = /^[0-9a-f]{64}$/i;

export interface ResolvedBundle {
  path: string;
  sha256: string;
  sizeBytes: number;
  format: BundleFormat;
  displayName?: string;
  storage?: { provider: 'local' } | { provider: 's3'; bucket: string; key: string };
  validation?: { errorCount: number; warningCount?: number; infoCount?: number; findings?: unknown[] };
  // Evidence the canonical packager recorded about the bundle at assemble time.
  // Forwarded to the gateway so evaluatePreTransmit can enforce the operator's
  // ECTD_REQUIRE_PDFA / _DTD / _REGIONAL_BACKBONE opt-ins against it — without
  // these the gate could only warn "cannot prove" and never block.
  submissionGrade?: SubmissionBundle['submissionGrade'];
  dtdStatus?: SubmissionBundle['dtdStatus'];
  regionalBackbone?: SubmissionBundle['regionalBackbone'];
  // The region the bundle was BUILT for, as recorded by the assemble route —
  // region identity must hold for bundles that carry no backbone evidence
  // (device formats) too.
  builtRegion?: Region;
  // Fingerprint of the content (sections, mappings, declared placements,
  // artifact content) the zip was built from, as the assemble route recorded
  // it. Recomputed from the database at transmit; a difference refuses. Only
  // a value from the CURRENT scheme is carried — anything else is unproven.
  contentFingerprint?: string;
}

/* Shape guards for the stored evidence blocks (see ResolvedBundle). Each
   requires exactly the fields the pre-transmit gate reads, so an object that
   would make the gate misread or throw is never forwarded. */
function isSubmissionGrade(v: unknown): v is NonNullable<SubmissionBundle['submissionGrade']> {
  const g = v as Record<string, unknown> | null;
  return (
    !!g && typeof g === 'object' &&
    Array.isArray(g.notConverted) && Number.isInteger(g.pdfLeaves) && Number.isInteger(g.pdfaConverted)
  );
}
function isDtdStatus(v: unknown): v is NonNullable<SubmissionBundle['dtdStatus']> {
  const d = v as Record<string, unknown> | null;
  return !!d && typeof d === 'object' && typeof d.selfContained === 'boolean' && Array.isArray(d.missing);
}
const GATEWAY_REGIONS: ReadonlySet<string> = new Set(['fda', 'ema', 'pmda', 'ca', 'uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg']);
function isRegionalBackbone(v: unknown): v is NonNullable<SubmissionBundle['regionalBackbone']> {
  const r = v as Record<string, unknown> | null;
  return (
    !!r && typeof r === 'object' &&
    typeof r.regionConformant === 'boolean' &&
    typeof r.region === 'string' && GATEWAY_REGIONS.has(r.region) &&
    typeof r.file === 'string' &&
    (r.placeholderOf === undefined || (typeof r.placeholderOf === 'string' && GATEWAY_REGIONS.has(r.placeholderOf))) &&
    (r.conformanceGap === undefined || typeof r.conformanceGap === 'string')
  );
}
/** The region the assemble route built the bundle for (descriptor.region,
 *  'FDA' | 'EMA' | 'PMDA' | 'CA'), as a gateway region; undefined when absent. */
function builtRegionOf(v: unknown): Region | undefined {
  if (typeof v !== 'string') return undefined;
  const r = v.toLowerCase();
  return r === 'fda' || r === 'ema' || r === 'pmda' || r === 'ca' ? (r as Region) : undefined;
}

/**
 * Rematerialize a bundle's local file from durable storage if it is missing.
 *
 * Bundles are local-first, but ephemeral containers can recycle between assemble
 * and transmit. If the local file at bundle.path is gone AND the descriptor
 * records a durable S3 copy, download it back to bundle.path before the gateway
 * reads it. No-op when the local file is present, when there is no storage
 * descriptor, or when provider is 'local'. A genuinely-missing local file with
 * no durable copy is left for the gateway's integrity gate to refuse.
 */
async function ensureBundleLocal(bundle: {
  path: string;
  storage?: { provider: 'local' } | { provider: 's3'; bucket: string; key: string };
}): Promise<void> {
  try {
    await fsp.access(bundle.path);
    return; // local file present — nothing to do
  } catch {
    // local file missing — fall through to durable rematerialization
  }
  if (bundle.storage?.provider !== 's3') return; // no durable copy to restore
  const buf = await getBundle(bundle.storage.key);
  await fsp.mkdir(dirname(bundle.path), { recursive: true });
  await fsp.writeFile(bundle.path, buf);
}

/**
 * Load the server-generated descriptor the assemble route persisted for a
 * tenant-owned package. Shape-checks the stored JSONB rather than trusting it:
 * sha256 must be a real 64-hex digest, sizeBytes a non-negative integer, and
 * format one of the known transmit formats. A malformed descriptor is treated
 * as "no bundle", never coerced.
 */
async function loadStoredBundle(
  packageId: number,
  organizationId: number,
): Promise<ResolvedBundle | null> {
  const { rows } = await pool.query<{ metadata: any }>(
    `SELECT metadata FROM c2c_submission_packages
      WHERE id = $1 AND org_id = $2`,
    [packageId, organizationId],
  );
  const stored = rows[0]?.metadata?.bundle;
  if (
    !stored ||
    typeof stored.path !== 'string' ||
    typeof stored.sha256 !== 'string' ||
    !SHA256_RE.test(stored.sha256) ||
    typeof stored.sizeBytes !== 'number' ||
    !Number.isInteger(stored.sizeBytes) ||
    stored.sizeBytes < 0 ||
    !BUNDLE_FORMAT_SET.includes(stored.format)
  ) {
    return null;
  }
  return {
    path: stored.path,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    format: stored.format as BundleFormat,
    displayName: typeof stored.displayName === 'string' ? stored.displayName : undefined,
    // Carried so ensureBundleLocal can rematerialize the local file after a
    // container recycle. NOT passed to the gateway — the gateway contract stays
    // path/sha256/sizeBytes/format.
    storage: stored.storage && typeof stored.storage === 'object' ? stored.storage : undefined,
    // Internal eCTD structural validation findings, so the transmit hard-gate
    // can block on error-severity findings.
    validation: stored.validation && typeof stored.validation === 'object' ? stored.validation : undefined,
    // Evidence blocks are shape-checked like sha256/sizeBytes: a malformed block
    // is DROPPED (the gate then warns "cannot prove"), never forwarded — `{}` as
    // a PDF/A grade was read by the gate as full compliance.
    submissionGrade: isSubmissionGrade(stored.submissionGrade) ? stored.submissionGrade : undefined,
    dtdStatus: isDtdStatus(stored.dtdStatus) ? stored.dtdStatus : undefined,
    regionalBackbone: isRegionalBackbone(stored.regionalBackbone) ? stored.regionalBackbone : undefined,
    builtRegion: builtRegionOf(stored.region),
    contentFingerprint: isCurrentContentFingerprint(stored.contentFingerprint) ? stored.contentFingerprint : undefined,
  };
}

/* ─── Governed transmit ──────────────────────────────────────────── */

export type RecordGovernedAction = (
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> },
  p: {
    orgId: number;
    userId: number;
    command: string;
    target: string;
    reason: string;
    payload?: Record<string, unknown>;
    domain?: string;
    surface?: string;
  },
) => Promise<unknown>;

export interface GovernedTransmitInput {
  region: Region;
  gateway: GatewayName;
  organizationId: number;
  userId: number;
  programId?: string | null;
  packageId?: number | null;
  environment: 'staging' | 'production';
  submissionType?: string;
  metadata?: Record<string, unknown>;
  /** Operator's stated reason. Recorded on the governed `sign` ledger entry. */
  reason: string;
  /**
   * When the human's re-authentication was VERIFIED for this transmit, by the
   * caller that verified it. Never synthesised here — a made-up timestamp is a
   * fabricated governance record, and the gateway guard exists to make the
   * human gate nameable rather than assumed.
   */
  reauthVerifiedAt: Date;
  /**
   * DEV/TEST-ONLY explicit descriptor. Refused whenever `bundleTrustEnforced()`
   * is true (i.e. anywhere but a declared local development/test environment).
   */
  clientBundle?: ResolvedBundle | null;
  /** Injected to avoid a services → routes circular import. */
  recordGovernedAction: RecordGovernedAction;
  /** Optional structured logger for the non-fatal ledger-write failure. */
  log?: { error: (msg: string, meta?: Record<string, unknown>) => void };
  /** Surface recorded on the governed-action row. */
  surface?: string;
}

export interface GovernedTransmitOutcome {
  result: GatewayTransmitResult;
  bundle: { sha256: string; sizeBytes: number; format: BundleFormat };
  /** True when the post-transmit governed-action ledger write failed. */
  ledgerWriteFailed: boolean;
}

/**
 * Run the full governed transmit ceremony and hand the bytes to the regional
 * gateway.
 *
 * Throws {@link GovernedTransmitRefusal} for an honest pre-transmit "no",
 * {@link GovernedTransmitInternalError} for an infrastructure failure, and the
 * gateway's own `CredentialError` / `ValidationError` / `TransportError` /
 * `GatewayError` (from ./types) unchanged — in particular `CredentialError`,
 * which names exactly which FDA_ESG_* variables are missing and is the correct
 * outcome for an organization that has not been provisioned for the agency
 * gateway yet. None of these produce an acknowledgement or an agency identifier.
 */
export async function executeGovernedTransmit(
  input: GovernedTransmitInput,
): Promise<GovernedTransmitOutcome> {
  const {
    region, gateway, organizationId, userId, environment,
    reason, reauthVerifiedAt, recordGovernedAction,
  } = input;

  // ─── C2C-SUB-003: the bundle descriptor is a trust boundary ──────────
  //
  // A descriptor names the bytes that get shipped to a real regulator. When it
  // comes from the caller, the caller picks BOTH the server-side path and the
  // digest it will be checked against, so every downstream control (package
  // ownership, structural validation, hash/size verification) is satisfied by
  // construction while reading an arbitrary server-readable file.
  //
  // Outside a declared local development/test environment the ONLY admissible
  // source is the server-generated descriptor the tenant-scoped assemble route
  // persisted on c2c_submission_packages.metadata.bundle. Fail closed: an unset,
  // blank or unknown NODE_ENV refuses the caller-supplied descriptor.
  if (input.clientBundle && bundleTrustEnforced()) {
    throw new GovernedTransmitRefusal(
      'CLIENT_DESCRIPTOR_REFUSED',
      'Client-supplied bundle descriptors are not accepted in this environment; ' +
        'transmit a tenant-owned packageId (POST /api/submission-ops/packages/:packageId/assemble first).',
      422,
    );
  }

  // Resolve the bundle. In dev/test an explicit descriptor still wins
  // (back-compat for local flows); the guard above makes that branch
  // unreachable everywhere else.
  let bundle: ResolvedBundle | null = input.clientBundle ?? null;
  if (!bundle && input.packageId != null) {
    try {
      bundle = await loadStoredBundle(input.packageId, organizationId);
    } catch (err) {
      throw new GovernedTransmitInternalError('transmit-load-bundle', err);
    }
  }

  if (!bundle) {
    throw new GovernedTransmitRefusal(
      'BUNDLE_NOT_ASSEMBLED',
      'No assembled bundle; call POST /api/submission-ops/packages/:packageId/assemble first.',
      422,
    );
  }

  // Path-syntax guard — unconditional, every environment. A `..` component or
  // an embedded NUL is never a legitimate assembled-bundle location, whatever
  // produced the descriptor.
  if (hasUnsafePathSyntax(bundle.path)) {
    throw new GovernedTransmitRefusal(
      'BUNDLE_PATH_UNSAFE',
      'Bundle path is not a well-formed bundle location; re-assemble the package before transmitting.',
      422,
    );
  }

  // ─── C2C-SUB-003: trusted-descriptor gate ────────────────────────────
  // Runs BEFORE ensureBundleLocal — which writes to bundle.path — so neither
  // the read nor the write can escape the namespace.
  if (bundleTrustEnforced()) {
    // (a) Structural-validation evidence. MISSING evidence is UNKNOWN, and
    //     UNKNOWN is blocking — it is NOT "zero errors". Only the assemble
    //     route writes this block, so requiring it also proves the descriptor
    //     is server-generated rather than reconstructed.
    if (!bundle.validation || typeof bundle.validation.errorCount !== 'number') {
      throw new GovernedTransmitRefusal(
        'BUNDLE_VALIDATION_UNKNOWN',
        'Bundle carries no internal structural-validation evidence, so its structural state is UNKNOWN; ' +
          're-assemble the package before transmitting.',
        422,
      );
    }
    // (b) Namespace confinement. Defence in depth even for a stored descriptor:
    //     if metadata.bundle were ever tampered with, the path still cannot
    //     leave the directory the assemble route writes to.
    //     NOTE: lexical confinement — a symlink planted inside the root is not
    //     detected. realpath() hardening is a separate, filesystem-level change.
    if (!isPathWithinBundleRoot(bundle.path)) {
      throw new GovernedTransmitRefusal(
        'BUNDLE_OUTSIDE_NAMESPACE',
        'Bundle path is outside the permitted submission-bundle storage namespace; ' +
          're-assemble the package before transmitting.',
        422,
      );
    }
    // (c) Durable-copy key confinement — ensureBundleLocal fetches this key and
    //     writes the bytes to disk, so it must stay inside the bundle prefix.
    if (bundle.storage?.provider === 's3' && !isBundleStorageKey(bundle.storage.key)) {
      throw new GovernedTransmitRefusal(
        'BUNDLE_STORAGE_KEY_OUTSIDE_NAMESPACE',
        'Bundle durable-storage key is outside the permitted submission-bundle namespace.',
        422,
      );
    }
  }

  // Internal eCTD structural-validation hard-gate. If the stored descriptor
  // recorded error-severity findings at assemble-time, refuse the transmit and
  // return the findings so the caller can re-assemble after fixing. Warnings do
  // NOT block. The `?? 0` fallback is reachable ONLY in a declared local
  // development/test environment — gate (a) above guarantees the field is
  // present everywhere else. Note: this is INTERNAL structural validation only,
  // not an agency validator.
  const errorCount = bundle.validation?.errorCount ?? 0;
  if (errorCount > 0) {
    throw new GovernedTransmitRefusal(
      'BUNDLE_VALIDATION_ERRORS',
      `Bundle failed eCTD structural validation (${errorCount} error${errorCount === 1 ? '' : 's'}); re-assemble after fixing.`,
      422,
      { findings: bundle.validation?.findings ?? [] },
    );
  }

  // Content integrity: the zip must still reflect the package. The descriptor
  // carries the fingerprint of the sections, mappings, declared placements and
  // artifact content it was built from; it is recomputed from the database
  // here and any difference refuses. The mapping routes clear a stale bundle
  // when a mapping changes, but an artifact edited after assembly changes
  // nothing on the package row — only this comparison catches it. A stored
  // descriptor without a fingerprint (assembled before it existed) is UNKNOWN,
  // and UNKNOWN blocks wherever descriptor trust is enforced, exactly like
  // missing structural-validation evidence.
  // The assessment is the one the preflight route reports, so the two never
  // disagree about a bundle.
  if (input.packageId != null && !input.clientBundle) {
    let assessment: ContentAssessment;
    try {
      assessment = await assessPackageContent(pool, input.packageId, organizationId, bundle.contentFingerprint);
    } catch (err) {
      throw new GovernedTransmitInternalError('transmit-content-fingerprint', err);
    }
    if (assessment.state === 'drift') {
      throw new GovernedTransmitRefusal('BUNDLE_CONTENT_DRIFT', CONTENT_DRIFT_MESSAGE, 422, {
        assembledFingerprint: assessment.assembled,
        currentFingerprint: assessment.current,
      });
    }
    if (assessment.state === 'unproven' && bundleTrustEnforced()) {
      throw new GovernedTransmitRefusal('BUNDLE_CONTENT_UNPROVEN', CONTENT_UNPROVEN_MESSAGE, 422);
    }
  }

  // Rematerialize the local bundle file from durable storage if a container
  // recycle lost it since assembly. No-op for local-only descriptors.
  try {
    await ensureBundleLocal(bundle);
  } catch (err) {
    throw new GovernedTransmitInternalError('transmit-rematerialize-bundle', err);
  }

  // Per-package transmit lock. Refuse a second transmit against the same
  // (org, package_id, bundle_sha256) while a prior attempt is still active
  // (pending|in_transit|received). Terminal states (rejected, rolled_back,
  // completed) are excluded by findActiveTransmittal so a rolled-back package
  // CAN be intentionally re-transmitted. The DB-level partial unique index
  // (sub_trans_active_lock_idx) is the backstop for races between this check
  // and the gateway's INSERT. Cross-tenant double-transmit is allowed by design
  // (CMO scenario).
  let active: { id: number; status: string } | null;
  try {
    active = await findActiveTransmittal({
      organizationId,
      packageId: input.packageId ?? null,
      bundleSha256: bundle.sha256,
    });
  } catch (err) {
    throw new GovernedTransmitInternalError('transmit-active-lock-check', err);
  }
  if (active) {
    throw new GovernedTransmitRefusal(
      'ACTIVE_TRANSMITTAL',
      `An active transmittal already exists for this package (id=${active.id}, status=${active.status}). ` +
        `Roll it back via POST /api/mdx/gateways/transmittals/${active.id}/rollback before re-transmitting.`,
      409,
      { transmittalId: active.id, status: active.status },
    );
  }

  const gw = getGateway(region, gateway);
  const result = await gw.transmit({
    organizationId,
    userId,
    programId: input.programId ?? null,
    packageId: input.packageId ?? null,
    bundle: {
      path: bundle.path,
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
      format: bundle.format,
      displayName: bundle.displayName,
      // Packager evidence for the pre-transmit gate (see ResolvedBundle).
      submissionGrade: bundle.submissionGrade,
      dtdStatus: bundle.dtdStatus,
      regionalBackbone: bundle.regionalBackbone,
      builtRegion: bundle.builtRegion,
    },
    environment,
    submissionType: input.submissionType,
    metadata: { ...(input.metadata ?? {}), environment },
    // The caller verified a human for THIS transmit and hands the proof in; the
    // gateway layer refuses any transmit that cannot name a human gate — see
    // TransmitAuthorization in ./types.ts.
    authorization: {
      kind: 'governed-http',
      actorUserId: userId,
      reason,
      reauthVerifiedAt,
    },
  });

  // Record the governed sign AFTER the external transmit succeeds. The external
  // transmit is irreversible, so if the ledger write fails we report it and
  // still return the transmit result (the gateway already accepted the
  // package). The transmittal row written by gw.transmit() remains the
  // authoritative external record in that edge case.
  let ledgerWriteFailed = false;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recordGovernedAction(client, {
        orgId: organizationId,
        userId,
        command: 'sign',
        target: `submission:${input.packageId ?? input.programId ?? `transmittal-${result.transmittalId}`}`,
        reason,
        payload: {
          meaning: 'submission',
          region,
          gateway,
          bundleSha256: bundle.sha256,
          // GatewayTransmitResult carries `transmissionId`. This read a
          // `transactionId` that no gateway sets — through a cast to unknown that
          // hid the type error — so every Part 11 sign row recorded null and the
          // ledger could not be joined to the agency receipt or basket id.
          transmissionId: result.transmissionId ?? null,
        },
        domain: 'mdx',
        surface: input.surface ?? 'submission-gateway',
      });
      await client.query('COMMIT');
    } catch (ledgerErr) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw ledgerErr;
    } finally {
      client.release();
    }
  } catch (ledgerErr: unknown) {
    ledgerWriteFailed = true;
    input.log?.error('transmit-ledger-write-failed-after-successful-transmit', {
      message: ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr),
      region,
      gateway,
    });
  }

  return {
    result,
    bundle: { sha256: bundle.sha256, sizeBytes: bundle.sizeBytes, format: bundle.format },
    ledgerWriteFailed,
  };
}
