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
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { submissionLeaves } from '../../../../shared/schema';
import {
  materializeLeafSources,
  leafSourceKey,
  type UnresolvedLeaf,
} from '../../ectd/leaf-source-resolver';
import type { LeafFileResolver, CoreLeaf } from '../../ectd/core-to-packager';
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
  /**
   * Remove the temp staging/output directory backing the bundle. Call once the
   * bundle bytes are no longer needed. Idempotent + best-effort; without this
   * every assemble leaks a full staged package under os.tmpdir().
   */
  cleanup: () => Promise<void>;
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
  /** Number of leaves materialized to disk (all locally-renderable tables). */
  materialized: number;
  /**
   * Leaves whose source document could NOT be materialized into the package —
   * external/binary tables (e.g. vault_documents, ctd_onboarding_documents),
   * cross-tenant/missing rows, or an unknown document_table. Surfaced so an
   * incomplete technical file is VISIBLE, never silently dropped.
   */
  unresolvedLeaves: UnresolvedLeaf[];
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

  // 2. Materialize every leaf's source document to a deterministic PDF, keyed by
  //    table:id. Every locally-renderable table (coauthor_documents,
  //    unified_documents) is rendered via the same `renderLeafPdf` path;
  //    external/binary tables are collected as `unresolvedLeaves` rather than
  //    being silently dropped.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `techfile-assemble-${sequenceId}-`));
  const stageDir = path.join(outputDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });

  // Harden against a throw AFTER mkdtemp but BEFORE we return the `cleanup`
  // handle: on any internal failure the caller never receives cleanup(), so the
  // staged temp dir would leak. Guard it here so a failed assemble removes its
  // own scratch dir; the happy-path cleanup remains the caller's to invoke.
  let assembleReturned = false;
  try {

  const { byKey, unresolved: unresolvedLeaves, materialized } = await materializeLeafSources({
    leaves: leaves.map((l) => ({ documentTable: l.documentTable, documentId: l.documentId })),
    organizationId,
    stageDir,
  });

  const resolveFile: LeafFileResolver = (leaf) => {
    if (!leaf.documentTable || !leaf.documentId) return null;
    return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId)) ?? null;
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

  if (unresolvedLeaves.length > 0) {
    logger.warn('Technical-file assemble could not materialize some leaf sources (not dropped silently)', {
      sequenceId,
      organizationId,
      regulation,
      unresolved: unresolvedLeaves,
    });
  }

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
      unresolved: unresolvedLeaves.length,
      outputDir,
    },
  });
  logger.info('Assembled technical file from core', {
    sequenceId,
    organizationId,
    regulation,
    materialized,
    skipped: plan.skipped.length,
    unresolved: unresolvedLeaves.length,
  });

  const cleanup = async () => {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn('Failed to remove technical-file assemble temp dir', {
        sequenceId,
        organizationId,
        outputDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

    assembleReturned = true;
    return { bundle, cleanup, skipped: plan.skipped, materialized, unresolvedLeaves, ready: manifest.ready };
  } finally {
    if (!assembleReturned) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export default { assembleTechnicalFileFromCore };
