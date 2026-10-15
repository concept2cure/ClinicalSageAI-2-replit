/**
 * AnA approving or locking an artifact: the status route's electronic
 * signature, taken through the governed-action sign-off.
 *
 * 2026-10-01 (D5; docs/work-orders/README.md hand-on item 10). The
 * `update_artifact_status` command set an artifact approved or locked from a
 * reason for change alone: no re-authentication, no signature, no version
 * recorded, no lock snapshot, and the artifact then read as approved or locked.
 * It was the one approve/lock door a person could reach. The status route
 * (PUT /projects/:projectId/artifacts/:artifactId/status) signs both acts but
 * has no client caller, and GovernedActionSignoff is the ceremony the product
 * puts in front of a person.
 *
 * Now these two targets are the e-signature tier (part11-governance.ts
 * requiredSignatureMeaning): the governed-action route asks for the act's own
 * meaning and re-verifies the signer before this runs. This applies the status
 * route's own rules, from the one place both read them
 * (server/services/artifact-approval-act.ts), and commits through the act the
 * status route commits through (server/services/artifact-signed-act.ts): the
 * status, the version signed, the ledger pair, the signature and, for a lock,
 * the snapshot, on one transaction.
 *
 * @module server/services/ana-ri/ana-signed-artifact-act
 */
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../db';
import { concept2cureArtifactVersions, concept2cureProvenanceEvents } from '../../../shared/schema';
import { GOVERNED_SIGNATURE_ATTESTATION } from '../../../shared/constants/signature-attestation';
import { loadProjectArtifact } from '../../routes/c2c/artifact-project-scope';
import {
  ARTIFACT_ACT_MEANING,
  artifactStatusUpdate,
  refuseArtifactTransition,
  refuseSignedArtifactAct,
} from '../artifact-approval-act';
import { ArtifactActConflictError, commitSignedArtifactAct, type SignedArtifactAct } from '../artifact-signed-act';
import { SignerNotAttributableError } from '../part11/resolve-signer-identity';
import { buildSignatureRequiredResult, validateSignoff } from './part11-governance';
import type { CommandContext, CommandResult } from './command-executor';

const ACTION = 'update_artifact_status';

export interface SignedStatusParams {
  projectId: number;
  artifactId: number | string;
  status: 'approved' | 'locked';
}

function refused(message: string, data?: Record<string, unknown>): CommandResult {
  return { success: false, action: ACTION, message, error: message, ...(data && { data }) };
}

/** The signer's membership role in this organisation, as the status route reads it from the session. */
async function membershipRole(ctx: CommandContext): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
    [ctx.userId, ctx.organizationId],
  );
  const role = rows[0]?.role;
  return typeof role === 'string' && role.trim() ? role.trim().toLowerCase() : null;
}

/**
 * Approve (review → approved) or lock (approved → locked) as an electronic
 * signature. Refuses, writing nothing, unless the dispatch carries a verified
 * signature with the act's meaning, the signer's role may make the change, and
 * the status route's checks pass.
 */
export async function signArtifactStatusByAna(ctx: CommandContext, params: SignedStatusParams): Promise<CommandResult> {
  const { status } = params;
  const meaning = ARTIFACT_ACT_MEANING[status];
  const act = status === 'approved' ? 'Approving' : 'Locking';

  // A verified signature for THIS dispatch, whatever the tenant's Part 11
  // setting: the executor's gate consults that setting; this act does not.
  const signoff = validateSignoff(ctx.signoff, { requireSignature: true });
  if (!signoff.ok) {
    return buildSignatureRequiredResult(ACTION, signoff, params as unknown as Record<string, unknown>) as unknown as CommandResult;
  }
  if (ctx.signoff?.signaturePurpose !== meaning) {
    return refused(`${act} this document is signed with the meaning '${meaning}'. Nothing was signed.`, {
      code: 'SIGNATURE_MEANING_MISMATCH',
    });
  }

  const userRole = await membershipRole(ctx);
  if (!userRole) {
    return refused('You are not a member of this organisation, so you cannot sign here. Nothing was signed.');
  }
  const artifact = await loadProjectArtifact(db, ctx.organizationId, Number(params.projectId), String(params.artifactId));
  if (!artifact) return refused(`Artifact ${params.artifactId} not found in this project. Nothing was signed.`);
  const previousStatus = artifact.status || 'draft';

  const transition = refuseArtifactTransition(previousStatus, status, userRole);
  if (transition) return refused(`${transition.message}. Nothing was signed.`);
  const before = await refuseSignedArtifactAct({
    q: pool,
    organizationId: ctx.organizationId,
    projectId: Number(params.projectId),
    artifact,
    previousStatus,
    status,
  });
  if (before) return refused(`${before.message} Nothing was signed.`, { code: before.code, ...before.details });

  const signed = await commitAct(ctx, { artifact, previousStatus, status, userRole });
  if (signed instanceof ArtifactActConflictError) return refused(signed.message, { code: signed.code });
  if (signed instanceof SignerNotAttributableError) {
    return refused(
      'Your account has no name or membership this signature can print, so it cannot sign here. Nothing was signed.',
      { code: signed.code },
    );
  }
  return {
    success: true,
    action: ACTION,
    data: {
      artifactId: params.artifactId,
      previousStatus,
      status,
      title: artifact.title,
      versionSigned: signed.version.version,
      signatureId: signed.signature.signatureId,
      signatureMeaning: meaning,
      snapshotId: signed.snapshot?.snapshotId ?? null,
    },
    message:
      `"${artifact.title}" ${status === 'approved' ? 'approved' : 'locked'} at version ${signed.version.version}: ` +
      `signed by ${signed.signer.name} with the meaning '${meaning}'.`,
  };
}

async function commitAct(
  ctx: CommandContext,
  input: {
    artifact: NonNullable<Awaited<ReturnType<typeof loadProjectArtifact>>>;
    previousStatus: string;
    status: 'approved' | 'locked';
    userRole: string;
  },
): Promise<SignedArtifactAct | ArtifactActConflictError | SignerNotAttributableError> {
  const { artifact, previousStatus, status, userRole } = input;
  const [storedVersion] = await db
    .select()
    .from(concept2cureArtifactVersions)
    .where(
      and(
        eq(concept2cureArtifactVersions.artifactId, artifact.id),
        eq(concept2cureArtifactVersions.version, artifact.version),
      ),
    )
    .limit(1);
  const reason = ctx.signoff?.reasonForChange?.trim() || null;
  return db
    .transaction(async tx => {
      const signed = await commitSignedArtifactAct(tx, {
        artifact,
        version: storedVersion ?? null,
        status,
        previousStatus,
        updateData: artifactStatusUpdate(artifact, previousStatus, status, ctx.userId),
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userRole,
        attestationText: GOVERNED_SIGNATURE_ATTESTATION,
        reason,
        secondFactorVerified: ctx.signoff?.secondFactorVerified === true,
        // The command context carries no client address; recorded as unknown, not invented.
        ipAddress: null,
        surface: 'ana-governed-action',
        authenticatedAt: ctx.signoff?.verifiedAt instanceof Date ? ctx.signoff.verifiedAt : undefined,
      });
      await tx.insert(concept2cureProvenanceEvents).values({
        organizationId: ctx.organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'approval',
        eventAction: `status_${status}`,
        sourceDescription: `Status changed from ${previousStatus} to ${status} (${ARTIFACT_ACT_MEANING[status]}), signed through AnA`,
        actorId: ctx.userId,
        actorName: signed.signer.name,
        actorEmail: signed.signer.email,
        backendRoute: '/api/ana-ri/governed-action',
        backendService: 'ana',
        ipAddress: null,
        details: {
          previousStatus,
          newStatus: status,
          reason,
          attestation: {
            meaning: ARTIFACT_ACT_MEANING[status],
            attestationText: GOVERNED_SIGNATURE_ATTESTATION,
            signerName: signed.signer.name,
            signerRole: userRole,
          },
          signatureId: signed.signature.signatureId,
          snapshotId: signed.snapshot?.snapshotId ?? null,
        },
      });
      return signed;
    })
    .catch((err: unknown) => {
      // A stale read and an unnamed signer are answered as such; anything else
      // propagates. Nothing was written in any of them.
      if (err instanceof ArtifactActConflictError || err instanceof SignerNotAttributableError) return err;
      throw err;
    });
}
