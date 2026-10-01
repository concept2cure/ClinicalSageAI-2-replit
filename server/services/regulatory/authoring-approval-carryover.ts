/**
 * A sealed Authoring approval carries to its Vault copy (FD5 (c), decided by
 * the founder 2026-10-01: "we want to carry the Authoring approval over
 * automatically"). Rows D5 and D7.
 *
 * Under FD5's default (a), a document approved in Authoring and filed to the
 * Vault arrived there unreviewed: someone approved it a second time before it
 * could be transmitted (VR-14). Option (c) carries the Authoring approval to
 * the Vault version, but only when that approval is bound to the exported
 * bytes' SHA-256. No Authoring signature covers a file. Each covers a digest of
 * the document's sections (sectionsDigest), and the export cannot be
 * re-rendered byte for byte later: the PDF and DOCX carry render-time stamps,
 * and the file prints its own signature page. So the binding is made where it
 * can be true: at the filing, over the rendering in hand.
 *
 *   signature ──covers──▶ sections digest D  (recorded when it was signed)
 *   rendering ──of──────▶ sections digest D  (computed over the rows rendered)
 *   rendering ──is──────▶ bytes with SHA-256 A = the Vault version's hash
 *
 * When all three hold, the Vault version's lifecycle record is approved through
 * the one gate (authoring → in_review → approved, the same orchestrator, store,
 * trail and supersession as a Vault approval), and its review and approval
 * sign-offs NAME the Authoring signatures (`authoring-sig:<id>`). They are not
 * copied: 21 CFR 11.70 requires that a signature cannot be "excised, copied,
 * or otherwise transferred". No electronic_signatures row is minted, and nobody
 * signs anything here. The sign-offs carry basis AUTHORING_RENDITION and are
 * bound to A, so the transmit gate (vaultVersionNotTransmittable) reads them as
 * it reads any approval. One chained audit row, `vault.version.approval_carried`,
 * records D, A and both signatures.
 *
 * The Vault's own policy applies to what is carried (FD4 (a)). An approval
 * carries only when:
 *
 *   - the document is APPROVED in Authoring. FROZEN without an approval carries
 *     nothing;
 *   - an APPROVER signature covers D;
 *   - a REVIEWER signature covers D, signed no later than that approval, by a
 *     different person;
 *   - neither signer is the document's author, and all three resolve to
 *     members of this organization.
 *
 * Otherwise nothing is carried. The version files as before and is approved in
 * the Vault, and the reason is returned so the editor can say why. Authoring
 * approval itself asks for none of this (any signer may approve, with no
 * review), which is why it is checked here rather than assumed.
 *
 * The filer is not a party to the approval. They chose a format and a folder,
 * and the system rendered the bytes, so the Vault's "the uploader does not
 * approve" rule, which exists because an uploader chooses the bytes, is not
 * the test here. The record's author for separation of duties is the
 * document's author, and the creation row names the filer as the actor.
 *
 * Runs after the filing has committed, on its own transaction. A failure rolls
 * the carry-over back whole and leaves the version filed and unapproved: fail
 * closed, never a partial approval.
 *
 * @module server/services/regulatory/authoring-approval-carryover
 */
import type { ApprovalSignature } from '../../../shared/regulatory/document-lifecycle';
import { advanceDocument, projectCanonicalDocument } from './documentLifecycleOrchestrator';
import {
  createCanonicalDocument,
  loadProjectionInput,
  persistState,
  recordReviewSignature,
  type CanonicalStoreDb,
} from './canonicalDocumentStore';
import { buildLifecycleBindings } from './lifecycleBindings';
import { supersedeOnVaultApproval } from './vault-lifecycle-record';
import { BINDING_BASIS, drizzleSignatureClient } from '../part11/signature-persistence';
import { writeChainedAuditRow } from '../auditService';
import {
  findVaultLifecycleRecord,
  lockVaultLifecycleStart,
  readVaultLifecycleSource,
  type LifecycleQueryable,
} from '../vault/vault-lifecycle';

/** The prefix a carried sign-off's signatureRef has: the authoring_signatures row it names. */
export const AUTHORING_SIGNATURE_REF = 'authoring-sig:';

/** One authoring_signatures row, as the carry-over reads it. */
export interface AuthoringSignatureRow {
  id: string;
  signer_email: string | null;
  signer_name: string | null;
  meaning: string | null;
  content_hash: string | null;
  signed_at: Date | string | null;
}

export type CarriedSignOffs =
  | { carry: true; review: AuthoringSignatureRow; approval: AuthoringSignatureRow }
  | { carry: false; reason: string };

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();
const time = (s: AuthoringSignatureRow) => (s.signed_at ? new Date(s.signed_at).getTime() : NaN);
const latest = (rows: AuthoringSignatureRow[]) =>
  rows.reduce<AuthoringSignatureRow | null>((best, s) => (!best || time(s) > time(best) ? s : best), null);

/**
 * Which Authoring sign-offs carry, decided over rows already read. Pure.
 *
 * @param status the document's status at filing
 * @param renderedDigest sectionsDigest of the sections that were rendered
 */
export function chooseCarriedSignOffs(
  status: string | null | undefined,
  renderedDigest: string,
  signatures: AuthoringSignatureRow[],
): CarriedSignOffs {
  if (String(status ?? '').toUpperCase() !== 'APPROVED') {
    return { carry: false, reason: `It is not approved in Authoring (status: ${status ?? 'unknown'}).` };
  }
  const covering = (meaning: string) =>
    signatures.filter((s) => String(s.meaning ?? '').toUpperCase() === meaning && !!renderedDigest && s.content_hash === renderedDigest && !Number.isNaN(time(s)));
  const approval = latest(covering('APPROVER'));
  if (!approval) {
    return { carry: false, reason: 'No Authoring approval signature covers the content that was filed.' };
  }
  const reviews = covering('REVIEWER').filter((s) => time(s) <= time(approval));
  if (reviews.length === 0) {
    return { carry: false, reason: 'No review signature covers this content in Authoring, and an approval carries only after a review.' };
  }
  const review = latest(reviews.filter((s) => norm(s.signer_email) !== norm(approval.signer_email)));
  if (!review) {
    return { carry: false, reason: 'The approver also signed the review, and a different person reviews before approval.' };
  }
  return { carry: true, review, approval };
}

/** The signatures on an Authoring document, tenant-scoped. */
export async function readAuthoringSignatures(
  q: LifecycleQueryable,
  docId: string,
  tenantId: number,
): Promise<AuthoringSignatureRow[]> {
  const { rows } = await q.query(
    `SELECT id::text AS id, signer_email, signer_name, meaning, content_hash, signed_at
       FROM authoring_signatures WHERE doc_id = $1 AND tenant_id = $2`,
    [docId, tenantId],
  );
  return rows as AuthoringSignatureRow[];
}

/**
 * A member of this organization by the identity an Authoring row stores: a
 * user id, or the email the signing route recorded. Null when it is neither.
 */
export async function resolveMemberId(
  q: LifecycleQueryable,
  organizationId: number,
  identity: string | null | undefined,
): Promise<number | null> {
  const raw = String(identity ?? '').trim();
  if (!raw) return null;
  const byId = /^\d+$/.test(raw);
  const { rows } = await q.query(
    `SELECT u.id FROM users u
       JOIN organization_users ou ON ou.user_id = u.id AND ou.organization_id = $2
      WHERE ${byId ? 'u.id = $1::int' : 'lower(u.email) = lower($1)'}
      LIMIT 1`,
    [raw, organizationId],
  );
  return rows[0]?.id == null ? null : Number(rows[0].id);
}

export interface CarryInput {
  organizationId: number;
  /** The person who filed the rendition (the actor on the record's creation). */
  filerId: number;
  vaultDocumentId: string;
  /** SHA-256 of the bytes the Vault holds: the rendering. */
  artifactSha256: string;
  authoringDocumentId: string;
  /** authoring_documents.created_by. */
  authoringAuthor: string | null;
  status: string | null;
  /** sectionsDigest of the rows rendered. */
  renderedDigest: string;
  signatures: AuthoringSignatureRow[];
}

export type CarryOutcome =
  | { carried: true; canonicalId: string; reviewedBy: string | null; approvedBy: string | null; superseded: string[] }
  | { carried: false; reason: string };

class NotCarried extends Error {}

/** The sign-off the Vault record holds: a reference to an Authoring signature, bound to the rendition. */
function carriedSignOff(
  sig: AuthoringSignatureRow,
  meaning: 'reviewed' | 'approved',
  signerId: number,
  input: CarryInput,
): ApprovalSignature {
  return {
    actor: String(signerId),
    role: `authoring:${String(sig.meaning ?? '').toUpperCase()}`,
    signatureRef: `${AUTHORING_SIGNATURE_REF}${sig.id}`,
    signedAt: new Date(sig.signed_at as string | Date).toISOString(),
    meaning,
    boundContentHash: input.artifactSha256,
    bindingBasis: BINDING_BASIS.AUTHORING_RENDITION,
    carriedFrom: {
      system: 'authoring',
      documentId: input.authoringDocumentId,
      signatureId: sig.id,
      signedContentHash: String(sig.content_hash),
    },
  };
}

/**
 * The author, reviewer and approver as members of this organization, three
 * different people (FD4 (a)), or NotCarried saying which rule failed.
 */
async function independentSigners(
  q: LifecycleQueryable,
  input: CarryInput,
  chosen: { review: AuthoringSignatureRow; approval: AuthoringSignatureRow },
): Promise<{ authorId: number; reviewerId: number; approverId: number }> {
  const org = input.organizationId;
  const [authorId, reviewerId, approverId] = await Promise.all([
    resolveMemberId(q, org, input.authoringAuthor),
    resolveMemberId(q, org, chosen.review.signer_email),
    resolveMemberId(q, org, chosen.approval.signer_email),
  ]);
  if (authorId === null) throw new NotCarried('The document’s author is not a member of this organization on record, so separation of duties cannot be checked.');
  if (reviewerId === null || approverId === null) throw new NotCarried('A signer of the Authoring review or approval is not a member of this organization on record.');
  if (reviewerId === authorId || approverId === authorId) throw new NotCarried('The document’s author signed its review or approval, and the Vault requires someone other than the author.');
  if (reviewerId === approverId) throw new NotCarried('The approver also signed the review, and a different person reviews before approval.');
  return { authorId, reviewerId, approverId };
}

/**
 * The filed version, under the lifecycle start lock: current, holding the
 * rendered bytes, and with no record of its own yet. Otherwise NotCarried.
 */
async function uncarriedVaultVersion(q: LifecycleQueryable, input: CarryInput) {
  const org = input.organizationId;
  await lockVaultLifecycleStart(q, org, input.vaultDocumentId);
  if (await findVaultLifecycleRecord(q, org, input.vaultDocumentId)) {
    throw new NotCarried('This Vault version already has its own review record.');
  }
  const source = await readVaultLifecycleSource(q, org, input.vaultDocumentId);
  if (!source) throw new NotCarried('The filed version could not be read back from the Vault.');
  if (!source.current) throw new NotCarried('The filed version is no longer the current one.');
  if (source.contentHash !== input.artifactSha256) {
    throw new NotCarried('The Vault holds different bytes from the rendering the approval was bound to.');
  }
  return source;
}

/**
 * Carry the Authoring approval of a filed rendition to its Vault version, or
 * say why it does not carry. Throws only on a failure to read or write; the
 * caller reports that the approval did not carry.
 */
export async function carryAuthoringApproval(db: CanonicalStoreDb, input: CarryInput): Promise<CarryOutcome> {
  const chosen = chooseCarriedSignOffs(input.status, input.renderedDigest, input.signatures);
  if (!chosen.carry) return { carried: false, reason: chosen.reason };
  try {
    return await db.transaction(async (tx): Promise<CarryOutcome> => {
      const q = drizzleSignatureClient(tx);
      const org = input.organizationId;
      const { authorId, reviewerId, approverId } = await independentSigners(q, input, chosen);
      const source = await uncarriedVaultVersion(q, input);

      const canonicalId = await createCanonicalDocument(tx as CanonicalStoreDb, {
        organizationId: org,
        createdBy: authorId,
        title: source.title,
        documentType: source.documentType,
        projectId: source.programId,
        hasContent: true,
        contentHash: source.contentHash,
        sources: { vault_documents: { nativeId: source.id, role: 'artifact' } },
      });
      await writeChainedAuditRow(q, {
        organizationId: org,
        userId: input.filerId,
        action: 'regulated_document.created',
        resourceType: 'canonical_document',
        resourceId: canonicalId,
        details: {
          vaultDocumentId: source.id, version: source.version, contentHash: source.contentHash, stage: 'authoring',
          authoredBy: authorId, carriedFrom: { system: 'authoring', documentId: input.authoringDocumentId },
        },
      });

      const review = carriedSignOff(chosen.review, 'reviewed', reviewerId, input);
      const approval = carriedSignOff(chosen.approval, 'approved', approverId, input);
      const at = new Date().toISOString();
      const actor = String(input.filerId);
      const bindings = buildLifecycleBindings({
        organizationId: org,
        actor,
        client: q,
        applySignature: async (_doc, meaning) => {
          if (meaning !== 'approved') throw new Error(`A carried approval signs as approved, not ${meaning}.`);
          return approval;
        },
      });
      const step = async (to: 'in_review' | 'approved', reason: string) => {
        const current = await loadProjectionInput(tx, canonicalId, org, { forUpdate: true });
        if (!current) throw new Error(`Canonical document ${canonicalId} disappeared while its approval was carried`);
        const projected = projectCanonicalDocument(current);
        const result = await advanceDocument(projected.state, to, { actor, at, reason, contentHash: current.contentHash }, bindings, projected.document);
        if (!result.ok) throw new Error(`The carried ${to} transition was refused: ${(result.blockedBy ?? []).join(', ')}`);
        await persistState(tx, canonicalId, org, result.state, result.auditEvent!);
        return current;
      };

      const carriedNote = `Carried from Authoring document ${input.authoringDocumentId}: this file (SHA-256 ${input.artifactSha256}) renders the content its signatures cover (sections digest ${input.renderedDigest}).`;
      await step('in_review', carriedNote);
      if (!(await recordReviewSignature(tx, canonicalId, org, review))) {
        throw new Error(`Canonical document ${canonicalId} disappeared while its review was carried`);
      }
      const reviewed = await step('approved', `Approval carried. ${carriedNote}`);
      const superseded = await supersedeOnVaultApproval(tx, q, reviewed, bindings, { actor, at });

      await writeChainedAuditRow(q, {
        organizationId: org,
        userId: input.filerId,
        action: 'vault.version.approval_carried',
        resourceType: 'vault_document',
        resourceId: source.id,
        details: {
          canonicalId,
          authoringDocumentId: input.authoringDocumentId,
          artifactSha256: input.artifactSha256,
          renderedSectionsDigest: input.renderedDigest,
          review: { signatureId: chosen.review.id, signer: reviewerId, signedAt: review.signedAt },
          approval: { signatureId: chosen.approval.id, signer: approverId, signedAt: approval.signedAt },
          authoredBy: authorId,
          bindingBasis: BINDING_BASIS.AUTHORING_RENDITION,
          superseded,
        },
      });
      return {
        carried: true,
        canonicalId,
        reviewedBy: chosen.review.signer_name ?? null,
        approvedBy: chosen.approval.signer_name ?? null,
        superseded,
      };
    });
  } catch (err) {
    if (err instanceof NotCarried) return { carried: false, reason: err.message };
    throw err;
  }
}
