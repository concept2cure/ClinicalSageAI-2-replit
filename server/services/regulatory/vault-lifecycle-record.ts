/**
 * A Vault version's lifecycle record: started once, approved under FD4's strict
 * default, and superseding the version it replaces (VR-13, row D5).
 *
 * The HTTP route (server/routes/document-lifecycle.ts) calls three things here:
 * startVaultLifecycleRecord, vaultApprovalRefusal (asked before any
 * credential), and supersedeOnVaultApproval (on the approval's transaction).
 *
 * Approving a Vault version supersedes the version it replaces.
 * When version 2.0 of a document is approved, the earlier versions that were
 * the document's approved, usable ones (approved, placed, packaged or
 * submitted) move to superseded, in the same transaction as the approval.
 * Each move is an ordinary lifecycle transition: the same gate
 * (approved → superseded is legal and ungated), the same bound audit row on the
 * org-wide chain, and one sealed event on that record's own trail. So the
 * earlier version stays approved and usable until the moment its successor is
 * approved, and any failure leaves both as they were.
 *
 * QMS revises an effective document in place. A Vault version is never
 * changed: its successor is a new version with its own record.
 *
 * @module server/services/regulatory/vault-lifecycle-record
 */
import {
  advanceDocument,
  projectCanonicalDocument,
  type LifecycleBindings,
  type ProjectionInput,
} from './documentLifecycleOrchestrator';
import {
  createCanonicalDocument,
  loadProjectionInput,
  persistState,
  type CanonicalStoreDb,
  type CanonicalStoreHandle,
} from './canonicalDocumentStore';
import { vaultSourceId } from './lifecycle-signature';
import { drizzleSignatureClient } from '../part11/signature-persistence';
import { writeChainedAuditRow } from '../auditService';
import {
  findVaultLifecycleRecord,
  lockVaultLifecycleStart,
  priorSteadyRecords,
  readVaultLifecycleSource,
  type LifecycleQueryable,
  type VaultLifecycleSource,
} from '../vault/vault-lifecycle';

/** What the route answers with. */
export interface LifecycleOutcome {
  status: number;
  body: unknown;
}

const notCurrent = (version: string | null, consequence: string): LifecycleOutcome => ({
  status: 409,
  body: {
    ok: false,
    error: 'VERSION_NOT_CURRENT',
    message:
      `${version ? `Version ${version}` : 'This version'} is no longer the current version, so it cannot be reviewed ` +
      `or approved. Use the current version. ${consequence}`,
  },
});

/**
 * Start the lifecycle of a Vault version, or return the one already started.
 * The record takes its title, type and content hash from this organization's
 * row, never from the request, and names the version as its source. One record
 * per version: starts are serialized on the version, and the second finds the
 * first (200, `created: false`). Only the current version of a document starts
 * a lifecycle.
 */
export async function startVaultLifecycleRecord(
  db: CanonicalStoreDb,
  p: { organizationId: number; createdBy: number; vaultId: string },
): Promise<LifecycleOutcome> {
  const notFound: LifecycleOutcome = {
    status: 422,
    body: {
      ok: false,
      error: 'VAULT_SOURCE_NOT_FOUND',
      message: 'This version is not in the Vault. Reload the Vault to see its current versions. Nothing was created.',
    },
  };
  if (p.vaultId === 'invalid') return notFound;
  return db.transaction(async (tx): Promise<LifecycleOutcome> => {
    const q = drizzleSignatureClient(tx);
    await lockVaultLifecycleStart(q, p.organizationId, p.vaultId);
    const existing = await findVaultLifecycleRecord(q, p.organizationId, p.vaultId);
    if (existing) return { status: 200, body: { ok: true, canonicalId: existing, created: false } };
    const source = await readVaultLifecycleSource(q, p.organizationId, p.vaultId);
    if (!source) return notFound;
    if (!source.current) return notCurrent(source.version, 'Nothing was created.');
    const canonicalId = await createCanonicalDocument(tx as CanonicalStoreDb, {
      organizationId: p.organizationId,
      createdBy: p.createdBy,
      title: source.title,
      documentType: source.documentType,
      projectId: source.programId,
      hasContent: true,
      contentHash: source.contentHash,
      sources: { vault_documents: { nativeId: source.id, role: 'artifact' } },
    });
    // Who started it is recorded: the record's creator is an author of it for
    // separation of duties, so the start is as attributable as a sign-off.
    await writeChainedAuditRow(q, {
      organizationId: p.organizationId,
      userId: p.createdBy,
      action: 'regulated_document.created',
      resourceType: 'canonical_document',
      resourceId: canonicalId,
      details: { vaultDocumentId: source.id, version: source.version, contentHash: source.contentHash, stage: 'authoring' },
    });
    return { status: 201, body: { ok: true, canonicalId, created: true } };
  });
}

/**
 * FD4's strict default, asked before any credential: the person who signed this
 * round's review does not also approve it, and a Vault version is approved only
 * while it is the document's current version. (The author and the uploader are
 * refused by the route's separation-of-duties precheck.)
 */
export async function vaultApprovalRefusal(
  q: LifecycleQueryable,
  input: ProjectionInput,
  userId: number | null,
): Promise<LifecycleOutcome | null> {
  if (userId !== null && input.reviewSignature?.actor === String(userId)) {
    return {
      status: 403,
      body: {
        ok: false,
        error: 'SELF_APPROVAL',
        message: 'You signed the review of this version, so a different person approves it. Nothing was signed.',
      },
    };
  }
  const vaultId = vaultSourceId(input.sources);
  if (vaultId === null || vaultId === 'invalid') return null;
  const source = await readVaultLifecycleSource(q, input.organizationId, vaultId);
  return source && !source.current ? notCurrent(source.version, 'Nothing was signed.') : null;
}

/** The earlier versions an approval of a Vault version supersedes, on its transaction. */
export async function supersedeOnVaultApproval(
  tx: CanonicalStoreHandle,
  q: LifecycleQueryable,
  input: ProjectionInput,
  bindings: LifecycleBindings,
  ctx: { actor: string; at: string },
): Promise<string[]> {
  const vaultId = vaultSourceId(input.sources);
  if (vaultId === null || vaultId === 'invalid') return [];
  const source = await readVaultLifecycleSource(q, input.organizationId, vaultId);
  if (!source) return [];
  return supersedePriorVaultVersions(tx, q, {
    organizationId: input.organizationId,
    source,
    approvedCanonicalId: input.canonicalId,
    title: input.title,
    actor: ctx.actor,
    at: ctx.at,
    bindings,
  });
}

export class SupersessionRefused extends Error {
  readonly code = 'SUPERSESSION_REFUSED';
  constructor(message: string) {
    super(message);
    this.name = 'SupersessionRefused';
  }
}

/**
 * Supersede the steady-state records of the versions before `source`, on `tx`.
 * Returns the records moved. Throws (rolling back the approval with them) when
 * one cannot be moved: an approval that leaves two approved versions of one
 * document is not recorded.
 */
export async function supersedePriorVaultVersions(
  tx: CanonicalStoreHandle,
  q: LifecycleQueryable,
  args: {
    organizationId: number;
    source: Pick<VaultLifecycleSource, 'id' | 'version'>;
    approvedCanonicalId: string;
    title: string;
    actor: string;
    at: string;
    bindings: LifecycleBindings;
  },
): Promise<string[]> {
  const prior = await priorSteadyRecords(q, args.source, args.organizationId);
  const moved: string[] = [];
  for (const canonicalId of prior) {
    const input = await loadProjectionInput(tx, canonicalId, args.organizationId, { forUpdate: true });
    if (!input) throw new SupersessionRefused(`The lifecycle record ${canonicalId} of an earlier version could not be read.`);
    const projected = projectCanonicalDocument(input);
    const reason =
      `Superseded: version ${args.source.version ?? '(unnumbered)'} of "${args.title}" was approved ` +
      `(lifecycle record ${args.approvedCanonicalId}).`;
    const result = await advanceDocument(
      projected.state,
      'superseded',
      { actor: args.actor, at: args.at, reason, contentHash: input.contentHash },
      args.bindings,
      projected.document,
    );
    if (!result.ok) {
      throw new SupersessionRefused(
        `The earlier version's record ${canonicalId} could not move to superseded: ${(result.blockedBy ?? []).join(', ')}.`,
      );
    }
    await persistState(tx, canonicalId, args.organizationId, result.state, result.auditEvent!);
    moved.push(canonicalId);
  }
  return moved;
}
