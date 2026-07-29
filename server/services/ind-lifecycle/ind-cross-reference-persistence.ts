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
 * @module server/services/ind-lifecycle/ind-cross-reference-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import {
  indCrossReferences,
  type IndCrossReference,
} from '../../../shared/schema/ind-cross-references';
import auditService from '../auditService';
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

/** Record a new external dependency for a submission (audited, org-scoped). */
export async function createCrossReference(
  input: CreateCrossReferenceInput,
  ctx: CrossRefCtx,
): Promise<IndCrossReference> {
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

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_CREATED',
    resourceType: 'ind_cross_reference',
    resourceId: row.id,
    details: { submissionId: input.submissionId, file: `${input.referencedFileType} ${input.referencedFileNumber}` },
  });
  logger.info('Recorded IND cross-reference', { submissionId: input.submissionId, organizationId: ctx.organizationId });
  return row as IndCrossReference;
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

/** Patch a cross-reference (e.g. mark the LOA on file). Audited, org-scoped. */
export async function updateCrossReference(
  id: string,
  patch: UpdateCrossReferenceInput,
  ctx: CrossRefCtx,
): Promise<IndCrossReference> {
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

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_UPDATED',
    resourceType: 'ind_cross_reference',
    resourceId: row.id,
    details: { loaOnFile: row.loaOnFile },
  });
  return row as IndCrossReference;
}

/** Delete a cross-reference (audited, org-scoped). */
export async function deleteCrossReference(id: string, ctx: CrossRefCtx): Promise<void> {
  const [row] = await db
    .delete(indCrossReferences)
    .where(and(eq(indCrossReferences.id, id), eq(indCrossReferences.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new CrossReferenceError('NOT_FOUND', 'Cross-reference not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_CROSS_REFERENCE_DELETED',
    resourceType: 'ind_cross_reference',
    resourceId: id,
    details: {},
  });
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
