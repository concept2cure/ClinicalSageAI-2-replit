/**
 * IND cross-reference persistence service.
 *
 * Durable, tenant-scoped, audited CRUD for the external files an IND depends on
 * (eCTD Module 1.4), and the live register computed from them. Every read/write
 * is scoped to the caller's organizationId (never request input); mutations are
 * audited — mirroring server/services/ind-lifecycle/ind-dispatch-snapshot-service.ts.
 *
 * This turns the cross-reference register from a pure-compute-over-request-body
 * calculator into a live per-submission RA management entity: the team records
 * each dependency once, marks the LOA on file as it arrives, and the register
 * (LOA-coverage QC) is recomputed from the stored rows.
 *
 * ── WO-16C #133 (19 September 2026): the audit outcome is reported ───────────
 *
 * Each of the three mutations here wrote its §11.10(e) row with
 * `await auditService.logAction({…})` at statement position, discarding the
 * `AuditWriteResult` that call resolves. `logAction` never rejects when
 * persistence fails — by deliberate policy, an audit-trail outage must not break
 * the action it records — so awaiting it and throwing away what it resolved to
 * reports exactly as much as not awaiting it: the created row, the patched row
 * and the completed delete were reported to the caller identically whether or
 * not the record of the change existed. Nor is the server log a substitute:
 * `logAction` writes its `[AUDIT] <action>` info line BEFORE it attempts either
 * store, so that line appears whether or not a row lands; it adds an error line
 * when a store throws, and when no store is configured at all it attempts
 * nothing and logs nothing further — the reason for the miss exists only in the
 * value that was being discarded. Each mutation now records through
 * `recordAuditRow` and carries the result out to its caller in `auditTrail`.
 *
 * Unchanged, deliberately: no mutation here is refused or reverted because its
 * audit row was lost. The insert/update/delete is committed before the audit
 * write is attempted, and un-doing a real change to an IND's Module 1.4
 * dependency register over a lost log row would be the worse answer. The change
 * stands, and the caller is told.
 *
 * @module server/services/ind-lifecycle/ind-cross-reference-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import {
  indCrossReferences,
  type IndCrossReference,
} from '../../../shared/schema/ind-cross-references';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import {
  buildCrossReferenceRegister,
  type CrossReferenceEntry,
  type CrossReferenceRegister,
} from './ind-cross-reference-service';
import type { ReferencedFileType } from './ind-loa-service';

const logger = createScopedLogger('ind-cross-reference-persistence');

export type CrossRefCtx = { organizationId: number; userId: number };

export interface CreateCrossReferenceInput {
  submissionId: number;
  referencedFileType: ReferencedFileType;
  referencedFileNumber: string;
  subjectName: string;
  authorizedSections?: string[];
  loaOnFile?: boolean;
  loaLeafSection?: string | null;
}

/** Fields a caller may patch (identity/tenant are never patchable). */
export interface UpdateCrossReferenceInput {
  subjectName?: string;
  authorizedSections?: string[];
  loaOnFile?: boolean;
  loaLeafSection?: string | null;
}

export class CrossReferenceError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'CrossReferenceError';
  }
}

/**
 * A created cross-reference, with what happened to the 21 CFR Part 11 §11.10(e)
 * record of its creation carried on it.
 *
 * WO-16C #133. The inserted row is returned intact with `auditTrail` added, so
 * callers that read `id` / `referencedFileNumber` / `loaOnFile` off it are
 * unaffected and the outcome travels with it. `auditTrail` is the key this
 * repository already uses for a service's own row (see
 * `CreatedQSubmission.auditTrail` in server/services/q-sub/q-sub.service.ts).
 */
export type CreatedCrossReference = IndCrossReference & { auditTrail: AuditRowOutcome };

/** Record a new external dependency for a submission (audited, org-scoped). */
export async function createCrossReference(
  input: CreateCrossReferenceInput,
  ctx: CrossRefCtx,
): Promise<CreatedCrossReference> {
  const [row] = await db
    .insert(indCrossReferences)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      referencedFileType: input.referencedFileType,
      referencedFileNumber: input.referencedFileNumber,
      subjectName: input.subjectName,
      authorizedSections: input.authorizedSections ?? [],
      loaOnFile: input.loaOnFile ?? false,
      loaLeafSection: input.loaLeafSection ?? null,
      createdBy: ctx.userId,
    })
    .returning();

  // Part 11 §11.10(e). WO-16C #133: `recordAuditRow` neither throws nor rejects
  // — an audit-trail outage must not break the action it records — and the
  // insert above is already committed when it runs, so the dependency stands
  // either way and is returned either way, with what happened to its record in
  // `auditTrail`. This row is a log beside a committed change and not the change
  // itself (the `ind_cross_references` row is what persists the dependency), so
  // a failed audit write is never answered here as a failed action. The store's
  // own reason for a failure stays in the log line `recordAuditRow` wrote
  // against this action and resource id; `message` on the failure arm is the
  // only text fit to show a user.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_CREATED',
    resourceType: 'ind_cross_reference',
    resourceId: row.id,
    details: { submissionId: input.submissionId, file: `${input.referencedFileType} ${input.referencedFileNumber}` },
  });
  logger.info('Recorded IND cross-reference', { submissionId: input.submissionId, organizationId: ctx.organizationId });
  return { ...(row as IndCrossReference), auditTrail };
}

/** List a submission's cross-references (org-scoped, stable order). */
export async function listCrossReferences(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<IndCrossReference[]> {
  return (await db
    .select()
    .from(indCrossReferences)
    .where(and(eq(indCrossReferences.organizationId, ctx.organizationId), eq(indCrossReferences.submissionId, submissionId)))
    .orderBy(asc(indCrossReferences.createdAt))) as IndCrossReference[];
}

/**
 * A patched cross-reference, with what happened to the §11.10(e) record of the
 * patch carried on it.
 *
 * WO-16C #133. Same shape and same reasoning as `CreatedCrossReference`: the
 * updated row is returned intact, `auditTrail` is added. One of this function's
 * two callers — the file-LOA route, which flips `loaOnFile` after the m1.4.1 leaf
 * has been stored and the amendment sequence persisted — already forwards the row
 * inside its response envelope, so the outcome reaches the client with it.
 */
export type UpdatedCrossReference = IndCrossReference & { auditTrail: AuditRowOutcome };

/** Patch a cross-reference (e.g. mark the LOA on file). Audited, org-scoped. */
export async function updateCrossReference(
  id: string,
  patch: UpdateCrossReferenceInput,
  ctx: CrossRefCtx,
): Promise<UpdatedCrossReference> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.subjectName !== undefined) set.subjectName = patch.subjectName;
  if (patch.authorizedSections !== undefined) set.authorizedSections = patch.authorizedSections;
  if (patch.loaOnFile !== undefined) set.loaOnFile = patch.loaOnFile;
  if (patch.loaLeafSection !== undefined) set.loaLeafSection = patch.loaLeafSection;

  const [row] = await db
    .update(indCrossReferences)
    .set(set)
    .where(and(eq(indCrossReferences.id, id), eq(indCrossReferences.organizationId, ctx.organizationId)))
    .returning();

  if (!row) throw new CrossReferenceError('NOT_FOUND', 'Cross-reference not found.');

  // Part 11 §11.10(e), on the same terms as `createCrossReference`: the UPDATE
  // above is committed (and NOT_FOUND has already been thrown if it matched
  // nothing) before this runs, so the patch is never reverted over a lost audit
  // row — flipping `loaOnFile` back would make the LOA-coverage QC disagree with
  // the leaf that was actually filed. What changes is that the caller is told.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_UPDATED',
    resourceType: 'ind_cross_reference',
    resourceId: row.id,
    details: { loaOnFile: row.loaOnFile },
  });
  return { ...(row as IndCrossReference), auditTrail };
}

/**
 * What a delete did: the id that was removed, and what happened to the
 * §11.10(e) record of the removal.
 *
 * WO-16C #133. This function returned `void`, so a caller could not tell a
 * recorded deletion from an unrecorded one. It carries further here than for the
 * other two mutations: once the row is deleted, the audit row is the only place
 * that the dependency existed and was removed is recorded at all — the
 * cross-reference register is recomputed from the surviving rows, so a silently
 * unrecorded delete leaves an IND's Module 1.4 dependency list shorter with
 * nothing anywhere saying why.
 */
export type DeletedCrossReference = { id: string; auditTrail: AuditRowOutcome };

/** Delete a cross-reference (audited, org-scoped). */
export async function deleteCrossReference(id: string, ctx: CrossRefCtx): Promise<DeletedCrossReference> {
  const [row] = await db
    .delete(indCrossReferences)
    .where(and(eq(indCrossReferences.id, id), eq(indCrossReferences.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new CrossReferenceError('NOT_FOUND', 'Cross-reference not found.');
  // Part 11 §11.10(e). The DELETE above is committed, so the deletion stands and
  // is not undone by re-inserting the row when this write fails — that would be
  // a worse lie than a lost log row. It is still a log beside a committed
  // action, so it is not answered as a failed action; the caller is handed the
  // outcome and decides what to say.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_DELETED',
    resourceType: 'ind_cross_reference',
    resourceId: id,
    details: {},
  });
  return { id, auditTrail };
}

/** Map a stored row to the register's CrossReferenceEntry shape. */
function toEntry(row: IndCrossReference): CrossReferenceEntry {
  return {
    referencedFileType: row.referencedFileType as ReferencedFileType,
    referencedFileNumber: row.referencedFileNumber,
    subjectName: row.subjectName,
    authorizedSections: (row.authorizedSections as string[]) ?? [],
    loaOnFile: row.loaOnFile,
    loaLeafSection: row.loaLeafSection ?? undefined,
  };
}

/**
 * Compute the live cross-reference register (LOA-coverage QC) for a submission
 * from its stored dependencies. Org-scoped.
 */
export async function getCrossReferenceRegister(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<CrossReferenceRegister> {
  const rows = await listCrossReferences(submissionId, ctx);
  return buildCrossReferenceRegister(rows.map(toEntry));
}
