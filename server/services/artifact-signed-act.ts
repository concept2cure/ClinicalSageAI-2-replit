/**
 * The signed acts on a concept2cure artifact: approve (review → approved) and
 * lock (approved → locked), committed as one electronic signature.
 *
 * 2026-09-28 (D5). The status route (PUT /projects/:projectId/artifacts/
 * :artifactId/status, server/routes/c2c/artifacts.ts) wrote these signatures
 * from the session alone: `authentication_method` 'session_jwt', a meaning of
 * any text, a printed name of `userName || email || 'unknown'`. It committed
 * the status first and the signature after it on its own, and skipped the
 * signature when the version had no stored row, so an approval could stand
 * unsigned.
 *
 * The route now checks the act's meaning and re-authenticates the signer
 * before calling this. This writes, on the caller's transaction and in lock
 * order (the artifact row, then the audit chain):
 * - the status change, only from the state the signer was shown;
 * - the version signed, when the artifact had no stored row for it;
 * - the ledger pair (recordGovernedAction);
 * - the signature row, naming the account's printed name and the factors
 *   actually verified;
 * - for a lock, the submission snapshot.
 * A failure anywhere rolls all of it back.
 *
 * The signature stays in `concept2cure_signatures`, the table the readiness
 * engine, the Artifacts Center and the DOCX signature block read for an
 * artifact. The signature and the lock's snapshot bind one hash: the stored
 * version's.
 *
 * @module server/services/artifact-signed-act
 */
import * as crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { db } from '../db';
import {
  concept2cureArtifactVersions,
  concept2cureArtifacts,
  concept2cureSignatures,
  concept2cureSubmissionSnapshots,
} from '../../shared/schema';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { recordGovernedAction } from '../routes/c2c/actions';
import { resolveSignerIdentity, type SignerIdentity } from './part11/resolve-signer-identity';
import { ARTIFACT_ACT_MEANING, artifactStatusUpdate, reviewQuorumVerdict } from './artifact-approval-act';

export type ArtifactTx = Parameters<Parameters<(typeof db)['transaction']>[0]>[0];
type ArtifactRow = typeof concept2cureArtifacts.$inferSelect;
type VersionRow = typeof concept2cureArtifactVersions.$inferSelect;
type SignatureRow = typeof concept2cureSignatures.$inferSelect;
type SnapshotRow = typeof concept2cureSubmissionSnapshots.$inferSelect;

export interface SignedArtifactActInput {
  artifact: ArtifactRow;
  /**
   * The stored row for the artifact's current version, or `null` when there is
   * none (chat, upload and form imports create none). The act then records it
   * from the artifact's content on the same transaction, so every signature
   * binds a stored version.
   */
  version: VersionRow | null;
  status: 'approved' | 'locked';
  previousStatus: string;
  /**
   * The caller's expected status-only changes. Validated against the canonical
   * act; the commit derives its own write instead of accepting arbitrary fields.
   */
  updateData: Partial<ArtifactRow>;
  organizationId: number;
  userId: number;
  userRole: string;
  attestationText: string;
  reason: string | null;
  /** True only when the re-authentication verified a second factor. */
  secondFactorVerified: boolean;
  ipAddress: string | null;
  /** The door the act was taken through, on its ledger row. The status route's when omitted. */
  surface?: string;
  /**
   * When the signer was re-authenticated, when that was before this commit
   * (AnA's sign-off is verified by the governed-action route); the commit time
   * otherwise, as the status route re-authenticates immediately before it.
   */
  authenticatedAt?: Date;
}

export interface SignedArtifactAct {
  row: ArtifactRow;
  /** The version signed: the stored row, or the one this act recorded. */
  version: VersionRow;
  signature: SignatureRow;
  snapshot: SnapshotRow | null;
  signer: SignerIdentity;
}

/**
 * The artifact moved between the route's read and this write: its status, its
 * version or its approved version is no longer the one the signer was shown.
 * Nothing was written.
 */
export class ArtifactActConflictError extends Error {
  readonly code = 'ARTIFACT_CHANGED' as const;
  constructor(message = 'The document changed while it was being signed. Reload it and sign again. Nothing was signed.') {
    super(message);
    this.name = 'ArtifactActConflictError';
  }
}

/**
 * Commit the act on `tx`. The caller has already refused a wrong meaning and
 * re-authenticated the signer. Throws ArtifactActConflictError when the
 * artifact is no longer in the state the caller read.
 */
export async function commitSignedArtifactAct(
  tx: ArtifactTx,
  input: SignedArtifactActInput,
): Promise<SignedArtifactAct> {
  // Recheck the target on THIS transaction. A preflight read is not a lock,
  // and a caller's cached VersionRow must never become the signed record.
  const updateData = validatedStatusChanges(input);
  const artifact = await lockCurrentSignedTarget(tx, input);
  const storedVersion = await lockCurrentSignedVersion(tx, input, artifact);
  const q = queryableFromDrizzle(tx);
  if (input.status === 'approved') {
    const quorum = await reviewQuorumVerdict(q, artifact.id, input.organizationId, artifact.version);
    if (!quorum.met) throw new ArtifactActConflictError(`${quorum.message} Nothing was signed.`);
  }
  // This recheck catches decisions that changed since preflight. It does NOT
  // serialize all review/source writers or qualify the science in a document.
  const bound = { ...input, artifact, updateData };
  const row = await updateFromStateAsRead(tx, bound);
  const version = storedVersion ?? (await recordSignedVersion(tx, bound));

  // §11.50: the printed name is the account's, resolved on this transaction.
  // It fails closed (SignerNotAttributableError) when the signer cannot be named.
  const signer = await resolveSignerIdentity(
    q,
    input.userId,
    input.organizationId,
    input.status === 'approved' ? 'artifact approval' : 'artifact lock',
  );
  const meaning = ARTIFACT_ACT_MEANING[input.status];
  const signedAt = new Date();
  const signatureId = `sig_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const gov = await recordGovernedAction(q, {
    orgId: input.organizationId,
    userId: input.userId,
    command: input.status === 'approved' ? 'approve' : 'lock',
    target: `artifact:${input.artifact.artifactId}`,
    reason: input.reason || input.attestationText,
    payload: {
      previousStatus: input.previousStatus,
      newStatus: input.status,
      version: input.artifact.version,
      contentHash: version.contentHash,
      meaning,
      signatureId,
    },
    domain: 'authoring',
    surface: input.surface ?? 'artifact-status',
  });

  const signature = await insertActSignature(tx, bound, version, {
    signatureId,
    signedAt,
    signer,
    meaning,
    ledger: gov,
  });
  const snapshot =
    input.status === 'locked' ? await insertLockSnapshot(tx, bound, version, signer, signature.signatureId) : null;
  return { row, version, signature, snapshot, signer };
}

/** Positive PostgreSQL integer keys; never coerce a foreign/malformed selector. */
function validSignedId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

/** Only the canonical approval/lock columns can be changed by this act. */
function validatedStatusChanges(input: SignedArtifactActInput): Partial<ArtifactRow> {
  const artifact = input.artifact;
  if (
    !artifact || ![artifact.id, artifact.projectId, artifact.version, input.organizationId, input.userId].every(validSignedId) ||
    artifact.organizationId !== input.organizationId ||
    typeof artifact.artifactId !== 'string' || !artifact.artifactId.trim() ||
    typeof artifact.content !== 'string' ||
    artifact.status !== input.previousStatus ||
    !((input.previousStatus === 'review' && input.status === 'approved') ||
      (input.previousStatus === 'approved' && input.status === 'locked')) ||
    (input.status === 'locked' && artifact.approvedVersionId !== artifact.version)
  ) throw new ArtifactActConflictError();

  const expected = artifactStatusUpdate(artifact, input.previousStatus, input.status, input.userId);
  const supplied = input.updateData;
  if (!supplied || Object.keys(supplied).length !== Object.keys(expected).length ||
    Object.entries(supplied).some(([key, value]) => !Object.prototype.hasOwnProperty.call(expected, key) ||
      (expected[key] instanceof Date
        ? !(value instanceof Date) || !Number.isFinite(value.getTime())
        : value !== expected[key]))) {
    throw new ArtifactActConflictError();
  }
  return expected as Partial<ArtifactRow>;
}

/** Relevant snapshot fields, including the metadata a lock would publish. */
function sameSignedTarget(actual: ArtifactRow, expected: ArtifactRow, compareTime = true): boolean {
  const fields = [
    'id', 'artifactId', 'organizationId', 'projectId', 'version', 'status',
    'approvedVersionId', 'publishedVersionId', 'content', 'contentHash',
    'title', 'ctdSection', 'templateId', 'createdById',
  ] as const;
  const time = (value: Date | null): number | null => value === null ? null : value instanceof Date ? value.getTime() : NaN;
  return fields.every(key => actual[key] === expected[key]) &&
    (!compareTime || time(actual.updatedAt) === time(expected.updatedAt));
}

/** Lock head first. Version locks and the audit-chain lock always follow it. */
async function lockCurrentSignedTarget(tx: ArtifactTx, input: SignedArtifactActInput): Promise<ArtifactRow> {
  const { artifact } = input;
  const rows = await tx.select().from(concept2cureArtifacts).where(and(
    eq(concept2cureArtifacts.id, artifact.id),
    eq(concept2cureArtifacts.artifactId, artifact.artifactId),
    eq(concept2cureArtifacts.organizationId, input.organizationId),
    eq(concept2cureArtifacts.projectId, artifact.projectId),
  )).for('update').limit(2);
  if (rows.length !== 1 || !sameSignedTarget(rows[0], artifact)) throw new ArtifactActConflictError();
  const current = rows[0];
  const hash = crypto.createHash('sha256').update(current.content).digest('hex');
  // Some importers have not populated the optional head hash. Bind exact text
  // anyway, and require a populated head hash to be correct, not just equal.
  if (current.contentHash !== null && current.contentHash !== hash) throw new ArtifactActConflictError();
  return current;
}

/** Re-read the stored version under a shared lock; never trust cached bytes. */
async function lockCurrentSignedVersion(
  tx: ArtifactTx,
  input: SignedArtifactActInput,
  artifact: ArtifactRow,
): Promise<VersionRow | null> {
  const rows = await tx.select().from(concept2cureArtifactVersions).where(and(
    eq(concept2cureArtifactVersions.artifactId, artifact.id),
    eq(concept2cureArtifactVersions.organizationId, input.organizationId),
    eq(concept2cureArtifactVersions.version, artifact.version),
  )).for('share').limit(2);
  if (input.version === null) {
    // A version that appeared after preflight requires a fresh signing attempt,
    // not silent rebinding. The unique insert below handles a later contender.
    if (rows.length !== 0) throw new ArtifactActConflictError();
    return null;
  }
  const cached = input.version;
  const current = rows[0];
  if (!cached || rows.length !== 1 || !validSignedId(cached.id) ||
    current.id !== cached.id || current.artifactId !== cached.artifactId ||
    current.organizationId !== cached.organizationId || current.version !== cached.version ||
    current.content !== cached.content || current.contentHash !== cached.contentHash ||
    current.content !== artifact.content ||
    current.contentHash !== crypto.createHash('sha256').update(artifact.content).digest('hex')) {
    throw new ArtifactActConflictError();
  }
  return current;
}

/**
 * Compare-and-set repeats tenant, project, external identity and exact text
 * conditions even though the head was locked above. Any refusal rolls back
 * the caller's transaction, including a version inserted by this act.
 */
async function updateFromStateAsRead(tx: ArtifactTx, input: SignedArtifactActInput): Promise<ArtifactRow> {
  const { artifact } = input;
  const [row] = await tx
    .update(concept2cureArtifacts)
    .set(input.updateData)
    .where(
      and(
        eq(concept2cureArtifacts.id, artifact.id),
        eq(concept2cureArtifacts.organizationId, input.organizationId),
        eq(concept2cureArtifacts.projectId, artifact.projectId),
        eq(concept2cureArtifacts.artifactId, artifact.artifactId),
        eq(concept2cureArtifacts.content, artifact.content),
        artifact.contentHash === null
          ? isNull(concept2cureArtifacts.contentHash)
          : eq(concept2cureArtifacts.contentHash, artifact.contentHash),
        eq(concept2cureArtifacts.status, input.previousStatus),
        eq(concept2cureArtifacts.version, artifact.version),
        artifact.approvedVersionId == null
          ? isNull(concept2cureArtifacts.approvedVersionId)
          : eq(concept2cureArtifacts.approvedVersionId, artifact.approvedVersionId),
      ),
    )
    .returning();
  if (!row || !sameSignedTarget(row, { ...artifact, ...input.updateData } as ArtifactRow, false)) {
    throw new ArtifactActConflictError();
  }
  return row;
}

/**
 * The artifact's current version, recorded from its content. The same hash
 * the route's own saves write (sha256 of the stored content). A row recorded
 * concurrently for the same version is a changed document.
 */
async function recordSignedVersion(tx: ArtifactTx, input: SignedArtifactActInput): Promise<VersionRow> {
  const { artifact } = input;
  const [version] = await tx
    .insert(concept2cureArtifactVersions)
    .values({
      artifactId: artifact.id,
      organizationId: input.organizationId,
      version: artifact.version,
      content: artifact.content,
      contentHash: crypto.createHash('sha256').update(artifact.content).digest('hex'),
      changeDescription: 'Recorded when this version was signed: it had no stored version row.',
      createdById: artifact.createdById ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!version || !validSignedId(version.id) || version.artifactId !== artifact.id ||
    version.organizationId !== input.organizationId || version.version !== artifact.version ||
    version.content !== artifact.content ||
    version.contentHash !== crypto.createHash('sha256').update(artifact.content).digest('hex')) {
    throw new ArtifactActConflictError();
  }
  return version;
}

async function insertActSignature(
  tx: ArtifactTx,
  input: SignedArtifactActInput,
  version: VersionRow,
  act: {
    signatureId: string;
    signedAt: Date;
    signer: SignerIdentity;
    meaning: string;
    ledger: { actionId: string; auditId: string; sha256Chain: string };
  },
): Promise<SignatureRow> {
  const signaturePurpose = input.status === 'approved' ? 'approval_attestation' : 'publish_attestation';
  const signatureHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        signatureId: act.signatureId,
        artifactId: input.artifact.artifactId,
        version: input.artifact.version,
        contentHash: version.contentHash,
        signerId: input.userId,
        signerName: act.signer.name,
        signaturePurpose,
        signatureMeaning: act.meaning,
        signedAt: act.signedAt.toISOString(),
      }),
    )
    .digest('hex');

  const [signature] = await tx
    .insert(concept2cureSignatures)
    .values({
      organizationId: input.organizationId,
      signatureId: act.signatureId,
      artifactId: input.artifact.id,
      artifactVersionId: version.id,
      signatureType: input.status === 'approved' ? 'approval' : 'publish',
      signaturePurpose,
      signatureMeaning: act.meaning,
      signerId: input.userId,
      signerName: act.signer.name,
      signerEmail: act.signer.email,
      signerRole: input.userRole,
      authenticationMethod: input.secondFactorVerified ? 'password+totp' : 'password',
      authenticationTimestamp: input.authenticatedAt ?? act.signedAt,
      secondFactorVerified: input.secondFactorVerified,
      signatureHash,
      signatureManifest: {
        part: '21 CFR Part 11 §11.50',
        meaning: act.meaning,
        printedName: act.signer.name,
        attestationText: input.attestationText,
        reason: input.reason,
        previousStatus: input.previousStatus,
        newStatus: input.status,
        contentHash: version.contentHash,
        actionId: act.ledger.actionId,
        auditId: act.ledger.auditId,
        auditSha256Chain: act.ledger.sha256Chain,
      },
      ipAddress: input.ipAddress,
      deviceInfo: null,
      status: 'active',
      signedAt: act.signedAt,
    })
    .returning();
  if (!signature) throw new Error('The signature record could not be confirmed.');
  return signature;
}

async function insertLockSnapshot(
  tx: ArtifactTx,
  input: SignedArtifactActInput,
  version: VersionRow,
  signer: SignerIdentity,
  signatureId: string,
): Promise<SnapshotRow> {
  const { artifact } = input;
  const [snapshot] = await tx
    .insert(concept2cureSubmissionSnapshots)
    .values({
      snapshotId: `snap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      artifactId: artifact.id,
      organizationId: input.organizationId,
      versionId: artifact.version,
      // The approved version the lock covers, as the route checked it and the
      // UPDATE required it — never a fallback.
      approvedVersionId: artifact.approvedVersionId,
      publishedVersionId: artifact.version,
      // The hash the signature binds.
      contentHash: version.contentHash,
      title: artifact.title,
      ctdSection: artifact.ctdSection,
      templateId: artifact.templateId,
      actionType: 'publish',
      actorId: input.userId,
      actorName: signer.name,
      actorEmail: signer.email,
      actorRole: input.userRole,
      attestationText: input.attestationText,
      signatureMeaning: ARTIFACT_ACT_MEANING[input.status],
      metadata: {
        previousStatus: input.previousStatus,
        newStatus: input.status,
        reason: input.reason,
        signatureId,
      },
    })
    .returning();
  if (!snapshot) throw new Error('The release snapshot record could not be confirmed.');
  return snapshot;
}
