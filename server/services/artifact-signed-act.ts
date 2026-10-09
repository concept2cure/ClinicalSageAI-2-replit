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
import { ARTIFACT_ACT_MEANING } from './artifact-approval-act';

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
  /** The status route's column changes for this transition. */
  updateData: Partial<ArtifactRow>;
  organizationId: number;
  userId: number;
  userRole: string;
  attestationText: string;
  reason: string | null;
  /** True only when the re-authentication verified a second factor. */
  secondFactorVerified: boolean;
  ipAddress: string | null;
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
  constructor() {
    super('The document changed while it was being signed. Reload it and sign again. Nothing was signed.');
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
  if (input.status === 'locked' && input.artifact.approvedVersionId == null) {
    // The route refuses this first (a lock must cover the approval). A lock
    // that names no approved version is never written.
    throw new Error('A lock must name the approved version it covers.');
  }
  const row = await updateFromStateAsRead(tx, input);
  const version = input.version ?? (await recordSignedVersion(tx, input));

  // §11.50: the printed name is the account's, resolved on this transaction.
  // It fails closed (SignerNotAttributableError) when the signer cannot be named.
  const q = queryableFromDrizzle(tx);
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
    surface: 'artifact-status',
  });

  const signature = await insertActSignature(tx, input, version, {
    signatureId,
    signedAt,
    signer,
    meaning,
    ledger: gov,
  });
  const snapshot =
    input.status === 'locked' ? await insertLockSnapshot(tx, input, version, signer, signature.signatureId) : null;
  return { row, version, signature, snapshot, signer };
}

/**
 * The status change, only from the state the signer was shown — status,
 * version and approved version. A concurrent edit, a second approval, or an
 * approval revoked and given again in between leaves nothing to sign.
 */
async function updateFromStateAsRead(tx: ArtifactTx, input: SignedArtifactActInput): Promise<ArtifactRow> {
  const { artifact } = input;
  const [row] = await tx
    .update(concept2cureArtifacts)
    .set(input.updateData)
    .where(
      and(
        eq(concept2cureArtifacts.id, artifact.id),
        eq(concept2cureArtifacts.status, input.previousStatus),
        eq(concept2cureArtifacts.version, artifact.version),
        artifact.approvedVersionId == null
          ? isNull(concept2cureArtifacts.approvedVersionId)
          : eq(concept2cureArtifacts.approvedVersionId, artifact.approvedVersionId),
      ),
    )
    .returning();
  if (!row) throw new ArtifactActConflictError();
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
  if (!version) throw new ArtifactActConflictError();
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
      authenticationTimestamp: act.signedAt,
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
  return snapshot;
}
