/**
 * Assemble an EU MDR/IVDR technical file FROM the canonical core (device assemble).
 *
 * The device counterpart of `assemble-from-core` (eCTD): it reads the sequence's
 * tenant-scoped `submission_leaves`, materializes each `coauthor_documents` leaf to
 * a genuine PDF (deterministic `renderLeafPdf` → stable md5), projects the leaves
 * onto the MDR/IVDR Annex II/III structure (`assembleTechDoc` → manifest), then
 * places the resolved files into a real ZIP (`materializeTechnicalFile`) — the
 * technical-file folder tree + `manifest.json` table-of-contents + checksum index.
 *
 * HONEST SCOPE: produces the technical-file PACKAGE (tree + manifest + checksums)
 * with valid PDF leaves, not a EUDAMED registration payload and not a PDF/A
 * archival dossier. Maps + reports gaps; never invents a missing section. SUBMIT/
 * TRANSMIT stays behind the governed transmit path — this never transmits.
 *
 * Tenant-scoped + audited. Running it needs a database + filesystem.
 *
 * @module server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { submissionLeaves, coauthorDocuments } from '../../../../shared/schema';
import { renderLeafPdf } from '../../ectd/leaf-pdf-renderer';
import type { LeafFileResolver, ResolvedFile, CoreLeaf } from '../../ectd/core-to-packager';
import { assembleTechDoc, type EuRegulation } from './tech-doc-assembler';
import { buildTechnicalFileManifest } from '../technical-file-manifest';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
  type TechnicalFileBundle,
} from './technical-file-packager';
import auditService from '../../auditService';
import { createScopedLogger } from '../../../utils/logger';

const logger = createScopedLogger('assemble-technical-file');

function safeName(s: string): string {
  return (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'leaf';
}

export interface AssembleTechnicalFileParams {
  sequenceId: number;
  organizationId: number;
  userId: number;
  regulation: EuRegulation;
  applicationId: string;
  productName?: string;
  manufacturer?: string;
}

export interface AssembleTechnicalFileResult {
  bundle: TechnicalFileBundle;
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
  /** Number of coauthor leaves materialized to disk. */
  materialized: number;
  ready: boolean;
}

/**
 * Assemble the sequence's canonical leaves into an MDR/IVDR technical-file ZIP.
 * Tenant-scoped: leaves + their coauthor documents must belong to organizationId.
 */
export async function assembleTechnicalFileFromCore(
  params: AssembleTechnicalFileParams
): Promise<AssembleTechnicalFileResult> {
  const { sequenceId, organizationId, userId, regulation } = params;

  // 1. Tenant-scoped leaves for this sequence.
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

  // 2. Materialize each coauthor document to a deterministic PDF, keyed by id.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `techfile-assemble-${sequenceId}-`));
  const stageDir = path.join(outputDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });
  const byDocId = new Map<number, ResolvedFile>();
  let materialized = 0;

  const docIds = [
    ...new Set(
      leaves.filter((l) => l.documentTable === 'coauthor_documents' && l.documentId).map((l) => l.documentId as number)
    ),
  ];
  for (const docId of docIds) {
    const [doc] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) continue; // cross-tenant / missing → reported as a gap by the packager
    const pdfBytes = await renderLeafPdf(doc.content ?? doc.title ?? '', {
      title: doc.title ?? undefined,
      sectionCode: doc.moduleNumber ?? undefined,
    });
    const fileName = `${safeName(doc.moduleNumber || doc.title)}-${docId}.pdf`;
    const sourcePath = path.join(stageDir, fileName);
    await fs.writeFile(sourcePath, pdfBytes);
    byDocId.set(docId, { fileName, sourcePath, md5: createHash('md5').update(pdfBytes).digest('hex') });
    materialized++;
  }

  const resolveFile: LeafFileResolver = (leaf) => {
    if (leaf.documentTable !== 'coauthor_documents' || !leaf.documentId) return null;
    return byDocId.get(leaf.documentId) ?? null;
  };

  // 3. Project onto the MDR/IVDR structure → manifest.
  const techDocResult = assembleTechDoc({
    regulation,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
  });
  const manifest = buildTechnicalFileManifest(techDocResult, {
    productName: params.productName,
    manufacturer: params.manufacturer,
  });

  // 4. Build the file plan from the canonical leaves + resolver, then materialize.
  const coreLeaves: CoreLeaf[] = leaves.map((l) => ({
    sectionCode: l.sectionCode,
    title: l.title,
    lifecycleOp: l.lifecycleOp,
    checksum: l.checksum,
    documentTable: l.documentTable,
    documentId: l.documentId,
    granularity: l.granularity,
  }));
  const plan = buildTechnicalFilePlan({ manifest, leaves: coreLeaves, resolveFile });
  const bundle = await materializeTechnicalFile(plan, { outputDir, applicationId: params.applicationId });

  await auditService.logAction({
    organizationId,
    userId,
    action: 'DEVICE_TECHNICAL_FILE_ASSEMBLED',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: {
      regulation,
      ready: manifest.ready,
      materialized,
      fileCount: bundle.fileCount,
      skipped: plan.skipped.length,
      outputDir,
    },
  });
  logger.info('Assembled technical file from core', {
    sequenceId,
    organizationId,
    regulation,
    materialized,
    skipped: plan.skipped.length,
  });

  return { bundle, skipped: plan.skipped, materialized, ready: manifest.ready };
}

export default { assembleTechnicalFileFromCore };
