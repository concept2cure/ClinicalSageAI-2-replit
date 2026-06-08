/**
 * Assemble an eCTD package from the canonical core (assemble step).
 *
 * The missing link in assemble→submit→transmit: it provides the storage
 * `resolveFile` that `package-from-core` needs. It reads the sequence's
 * tenant-scoped `submission_leaves`, materializes each `coauthor_documents`
 * leaf's content to a temp file, then drives `packageSequenceFromCore` (which
 * runs the real `packageEctdSubmission` — backbone, MD5, regional m1, md5.txt).
 *
 * IMPORTANT (honest scope): content is materialized AS-IS (HTML/text written to
 * disk). It is NOT yet eCTD-PDF-spec normalized — PDF/A rendering needs an
 * external binary (flagged elsewhere). This produces a structurally-correct,
 * dev/preview-grade package; it is the assemble wiring, not the final
 * bytes-on-disk publisher. SUBMIT/TRANSMIT remains behind the existing governed
 * `transmit_submission` tool + Part 11 e-signature — this never transmits.
 *
 * Tenant-scoped + audited. Running it needs a database + filesystem.
 *
 * @module server/services/ectd/assemble-from-core
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { submissionLeaves, coauthorDocuments } from '../../../shared/schema';
import { packageSequenceFromCore, type PackageFromCoreResult } from './package-from-core';
import type { LeafFileResolver, ResolvedFile } from './core-to-packager';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('assemble-from-core');

function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeName(s: string): string {
  return (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'leaf';
}

export interface AssembleSequenceParams {
  sequenceId: number;
  organizationId: number;
  userId: number;
  applicationId: string;
  sponsorId: string;
  sponsorName: string;
  emitUnzipped?: boolean;
}

export interface AssembleSequenceResult extends PackageFromCoreResult {
  /** Number of coauthor leaves materialized to disk. */
  materialized: number;
}

/**
 * Assemble the sequence's canonical leaves into an eCTD package. Tenant-scoped:
 * leaves + their coauthor documents must belong to organizationId.
 */
export async function assembleSequence(params: AssembleSequenceParams): Promise<AssembleSequenceResult> {
  const { sequenceId, organizationId, userId } = params;

  // 1. Tenant-scoped leaves for this sequence that point at the canonical doc table.
  const leaves = await db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    );

  // 2. Materialize each coauthor document's content to a temp file, keyed by id.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `ectd-assemble-${sequenceId}-`));
  const stageDir = path.join(outputDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });
  const byDocId = new Map<number, ResolvedFile>();
  let materialized = 0;

  const docIds = [...new Set(leaves.filter((l) => l.documentTable === 'coauthor_documents' && l.documentId).map((l) => l.documentId as number))];
  for (const docId of docIds) {
    const [doc] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) continue; // cross-tenant / missing → skipped (the packager reports the gap)
    const body = stripHtml(doc.content) || doc.title || '';
    // Materialized as-is — NOT PDF/A normalized (see module header).
    const fileName = `${safeName(doc.moduleNumber || doc.title)}-${docId}.txt`;
    const sourcePath = path.join(stageDir, fileName);
    await fs.writeFile(sourcePath, body, 'utf8');
    const md5 = createHash('md5').update(body).digest('hex');
    byDocId.set(docId, { fileName, sourcePath, md5 });
    materialized++;
  }

  // 3. Sync resolver over the materialized map (package-from-core needs sync).
  const resolveFile: LeafFileResolver = (leaf) => {
    if (leaf.documentTable !== 'coauthor_documents' || !leaf.documentId) return null;
    return byDocId.get(leaf.documentId) ?? null;
  };

  // 4. Drive the real publisher off the canonical core.
  const result = await packageSequenceFromCore({
    sequenceId,
    organizationId,
    userId,
    outputDir,
    applicationId: params.applicationId,
    sponsorId: params.sponsorId,
    sponsorName: params.sponsorName,
    resolveFile,
    emitUnzipped: params.emitUnzipped,
  });

  await auditService.logAction({
    organizationId,
    userId,
    action: 'ECTD_ASSEMBLED',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: { materialized, skipped: result.skipped.length, outputDir },
  });
  logger.info('Assembled sequence from core', { sequenceId, organizationId, materialized, skipped: result.skipped.length });

  return { ...result, materialized };
}

export default { assembleSequence };
