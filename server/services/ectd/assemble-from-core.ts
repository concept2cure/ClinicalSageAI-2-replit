/**
 * Assemble an eCTD package from the canonical core (assemble step).
 *
 * The missing link in assemble→submit→transmit: it provides the storage
 * `resolveFile` that `package-from-core` needs. It reads the sequence's
 * tenant-scoped `submission_leaves`, materializes each `coauthor_documents`
 * leaf's content to a temp file, then drives `packageSequenceFromCore` (which
 * runs the real `packageEctdSubmission` — backbone, MD5, regional m1, md5.txt).
 *
 * Each coauthor leaf is rendered to a genuine, valid PDF via `renderLeafPdf`
 * (pure pdf-lib, deterministic → byte-identical output → stable md5, the eCTD
 * checksum contract). That is a faithful TEXT rendering, not high-fidelity
 * PDF/A: styled-HTML/DOCX fidelity and PDF/A-1b conformance are the
 * LibreOffice/Chromium path (`pdf-converter.ts`), out of scope here. So this
 * produces a structurally-correct package with valid PDF leaves a validator
 * will load — the assemble wiring, not the final archival publisher.
 * SUBMIT/TRANSMIT remains behind the existing governed `transmit_submission`
 * tool + Part 11 e-signature — this never transmits.
 *
 * Tenant-scoped + audited. Running it needs a database + filesystem.
 *
 * @module server/services/ectd/assemble-from-core
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { submissionLeaves } from '../../../shared/schema';
import { packageSequenceFromCore, type PackageFromCoreResult } from './package-from-core';
import { materializeLeafSources, leafSourceKey, type UnresolvedLeaf } from './leaf-source-resolver';
import type { LeafFileResolver } from './core-to-packager';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('assemble-from-core');

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
  /**
   * Remove the temp staging/output directory backing `bundle.path`. Call once
   * the bundle bytes are no longer needed (e.g. after transmit, or after an
   * assemble-only run has reported its metadata). Idempotent + best-effort;
   * without this every assemble leaks a full staged package under os.tmpdir().
   */
  cleanup: () => Promise<void>;
  /** Number of leaves materialized to disk (all locally-renderable tables). */
  materialized: number;
  /**
   * Leaves whose source document could NOT be materialized into the package —
   * external/binary tables (e.g. vault_documents, ctd_onboarding_documents),
   * cross-tenant/missing rows, or an unknown document_table. Surfaced so an
   * incomplete package is VISIBLE, never silently dropped.
   */
  unresolvedLeaves: UnresolvedLeaf[];
  /**
   * Path to the SHA-256 governance manifest (per-leaf md5+sha256 + package
   * sha256), written OUTSIDE the eCTD backbone. The regulatory index.xml/md5.txt
   * remain md5-only for agency compatibility; this file is the modern-hash
   * integrity record for package governance/audit.
   */
  governanceManifestPath: string;
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

  // 2. Materialize every leaf's source document to a deterministic PDF, keyed by
  //    table:id. Every locally-renderable table (coauthor_documents,
  //    unified_documents) is rendered via the same `renderLeafPdf` path (so the
  //    md5/checksum contract is unchanged); external/binary tables are collected
  //    as `unresolvedLeaves` rather than being silently dropped.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `ectd-assemble-${sequenceId}-`));
  const stageDir = path.join(outputDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });

  // Guard against a throw AFTER mkdtemp but BEFORE the `cleanup` handle is
  // returned — otherwise a failed assemble leaks its staged temp dir because the
  // caller never gets cleanup(). Happy-path cleanup stays the caller's to invoke.
  let assembleReturned = false;
  try {

  const { byKey, unresolved: unresolvedLeaves, materialized } = await materializeLeafSources({
    leaves: leaves.map((l) => ({ documentTable: l.documentTable, documentId: l.documentId })),
    organizationId,
    stageDir,
  });

  // 3. Sync resolver over the materialized map (package-from-core needs sync).
  const resolveFile: LeafFileResolver = (leaf) => {
    if (!leaf.documentTable || !leaf.documentId) return null;
    return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId)) ?? null;
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

  if (unresolvedLeaves.length > 0) {
    logger.warn('Assemble dropped no leaf silently, but some sources could not be materialized', {
      sequenceId,
      organizationId,
      unresolved: unresolvedLeaves,
    });
  }

  // Governance integrity manifest: per-leaf SHA-256 (alongside the eCTD-required
  // md5) plus the package-level SHA-256, written OUTSIDE the regulatory backbone.
  // index.xml / md5.txt keep md5 for agency compatibility; this file carries the
  // modern hash for package governance and audit.
  const governanceManifestPath = path.join(outputDir, 'package-governance.sha256.json');
  await fs.writeFile(
    governanceManifestPath,
    JSON.stringify(
      {
        sequenceId,
        organizationId,
        hashPolicy: 'md5 = eCTD index (agency requirement); sha256 = package governance (this file)',
        packageSha256: result.bundle.sha256,
        leaves: [...byKey.values()].map((f) => ({ fileName: f.fileName, md5: f.md5, sha256: f.sha256 })),
      },
      null,
      2,
    ),
  );

  await auditService.logAction({
    organizationId,
    userId,
    action: 'ECTD_ASSEMBLED',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: { materialized, skipped: result.skipped.length, unresolved: unresolvedLeaves.length, outputDir, packageSha256: result.bundle.sha256 },
  });
  logger.info('Assembled sequence from core', {
    sequenceId,
    organizationId,
    materialized,
    skipped: result.skipped.length,
    unresolved: unresolvedLeaves.length,
  });

  const cleanup = async () => {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn('Failed to remove assemble temp dir', {
        sequenceId,
        organizationId,
        outputDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  assembleReturned = true;
  return { ...result, cleanup, materialized, unresolvedLeaves, governanceManifestPath };
  } finally {
    if (!assembleReturned) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export default { assembleSequence };
