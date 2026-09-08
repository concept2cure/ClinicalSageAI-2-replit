/**
 * Assemble an EU MDR/IVDR technical file FROM the canonical core (device assemble).
 *
 * ONE packaging spine (`packageTechnicalFile`) with two leaf sources:
 *
 *   - `assembleTechnicalFileFromCore` — the sequence source. Reads the
 *     sequence's tenant-scoped `submission_leaves`, exactly as the eCTD
 *     `assemble-from-core` does, and returns a bundle on disk plus a `cleanup`
 *     handle (the caller reads the bytes, then cleans up).
 *   - `assembleTechnicalFileFromProgram` — the GOVERNED source. Reads the
 *     program's authored `c2c_documents` (doc_type mdr / ivdr — the rows the
 *     MDx editor and the eu-mdr / eu-ivdr rule packs write) and projects its
 *     authored `c2c_document_sections` into CoreLeaf entries. Returns the ZIP
 *     BYTES and always removes its staging directory (the
 *     `assembleSubmissionEctd` pattern — no cleanup handle escapes).
 *
 * Both materialize every leaf through the ONE leaf materializer
 * (`materializeLeafSources`, deterministic `renderLeafPdf` → stable md5),
 * project the leaves onto the Annex II/III structure (`assembleTechDoc` →
 * manifest), and place the resolved files into a real ZIP
 * (`materializeTechnicalFile`) — the folder tree + `manifest.json` + checksums.
 *
 * HONEST SCOPE: produces the technical-file PACKAGE (tree + manifest + checksums)
 * with valid PDF leaves, not a EUDAMED registration payload and not a PDF/A
 * archival dossier. Maps + reports gaps; never invents a missing section — an
 * empty governed section is not a leaf. SUBMIT/TRANSMIT stays behind the
 * governed transmit path — this never transmits.
 *
 * Tenant-scoped + audited. Running it needs a database + filesystem.
 *
 * @module server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { eq, and, isNull } from 'drizzle-orm';
import { db, pool } from '../../../db';
import { submissionLeaves } from '../../../../shared/schema';
import {
  materializeLeafSources,
  leafSourceKey,
  type UnresolvedLeaf,
} from '../../ectd/leaf-source-resolver';
import type { LeafFileResolver, CoreLeaf } from '../../ectd/core-to-packager';
import { assembleTechDoc, type EuRegulation } from './tech-doc-assembler';
import { buildTechnicalFileManifest, type TechnicalFileManifest } from '../technical-file-manifest';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
  type TechnicalFileBundle,
  type TechnicalFilePlan,
} from './technical-file-packager';
import {
  loadGovernedDeviceSections,
  governedSectionIsAuthored,
  type GovernedDeviceSectionRow,
} from '../estar/estar-content-leaves';
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
  /** Materialized leaves whose source is still a draft/review artifact. */
  unfinalized: number;
  unfinalizedSections: Array<{ sectionCode: string; status: string }>;
  ready: boolean;
}

/**
 * Thrown by `assembleTechnicalFileFromProgram` when the program holds no
 * authored section of the requested regulation in the caller's organization.
 * `code` maps to 422 NO_AUTHORED_CONTENT at the route — an honest refusal, not
 * an empty package.
 */
export class NoAuthoredTechnicalFileContentError extends Error {
  readonly code = 'NO_AUTHORED_CONTENT';
  constructor(regulation: EuRegulation, programId: string) {
    super(
      `No authored ${regulation.toUpperCase()} technical-documentation section exists for program ${programId} ` +
        'in this organization — there is nothing to package. Author and save at least one Annex II/III section first.',
    );
    this.name = 'NoAuthoredTechnicalFileContentError';
  }
}

interface PackageTechnicalFileParams {
  leaves: CoreLeaf[];
  resolveFile: LeafFileResolver;
  regulation: EuRegulation;
  outputDir: string;
  applicationId: string;
  productName?: string;
  manufacturer?: string;
  organizationId: number;
  userId: number;
  /** Audit anchor for DEVICE_TECHNICAL_FILE_ASSEMBLED. */
  resourceType: 'ectd_sequence' | 'regulatory_program';
  resourceId: number | string;
  /** Materializer counts, echoed into the audit row. */
  materialized: number;
  unresolvedLeaves: UnresolvedLeaf[];
  extraAudit?: Record<string, unknown>;
}

/**
 * The ONE packaging core: project the leaves onto the Annex II/III structure,
 * build the file plan against the resolver, materialize the ZIP, warn about
 * unresolved leaves, and write the audit row. Both leaf sources call this.
 */
async function packageTechnicalFile(
  params: PackageTechnicalFileParams,
): Promise<{ manifest: TechnicalFileManifest; plan: TechnicalFilePlan; bundle: TechnicalFileBundle }> {
  const { leaves, regulation, organizationId, userId, unresolvedLeaves, materialized } = params;

  const techDocResult = assembleTechDoc({
    regulation,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
  });
  const manifest = buildTechnicalFileManifest(techDocResult, {
    productName: params.productName,
    manufacturer: params.manufacturer,
  });

  const plan = buildTechnicalFilePlan({ manifest, leaves, resolveFile: params.resolveFile });
  const bundle = await materializeTechnicalFile(plan, { outputDir: params.outputDir, applicationId: params.applicationId });

  if (unresolvedLeaves.length > 0) {
    logger.warn('Technical-file assemble could not materialize some leaf sources (not dropped silently)', {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      organizationId,
      regulation,
      unresolved: unresolvedLeaves,
    });
  }

  await auditService.logAction({
    organizationId,
    userId,
    action: 'DEVICE_TECHNICAL_FILE_ASSEMBLED',
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: {
      regulation,
      ready: manifest.ready,
      materialized,
      fileCount: bundle.fileCount,
      // The sha256 is what binds this audit row to the delivered artifact;
      // the staging directory is transient and is not recorded.
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
      skipped: plan.skipped.length,
      unresolved: unresolvedLeaves.length,
      ...params.extraAudit,
    },
  });
  logger.info('Assembled technical file from core', {
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    organizationId,
    regulation,
    materialized,
    skipped: plan.skipped.length,
    unresolved: unresolvedLeaves.length,
  });

  return { manifest, plan, bundle };
}

/**
 * Assemble the sequence's canonical leaves into an MDR/IVDR technical-file ZIP.
 * Tenant-scoped: leaves + their source documents must belong to organizationId.
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
  //    unified_documents, c2c_document_sections) is rendered via the same
  //    `renderLeafPdf` path; external/binary tables are collected as
  //    `unresolvedLeaves` rather than being silently dropped.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `techfile-assemble-${sequenceId}-`));
  const stageDir = path.join(outputDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });

  // Harden against a throw AFTER mkdtemp but BEFORE we return the `cleanup`
  // handle: on any internal failure the caller never receives cleanup(), so the
  // staged temp dir would leak. Guard it here so a failed assemble removes its
  // own scratch dir; the happy-path cleanup remains the caller's to invoke.
  let assembleReturned = false;
  try {
    const { byKey, unresolved: unresolvedLeaves, materialized, unfinalized, unfinalizedSections } =
      await materializeLeafSources({
        leaves: leaves.map((l) => ({ documentTable: l.documentTable, documentId: l.documentId })),
        organizationId,
        stageDir,
      });

    const resolveFile: LeafFileResolver = (leaf) => {
      if (!leaf.documentTable || !leaf.documentId) return null;
      return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId)) ?? null;
    };

    const coreLeaves: CoreLeaf[] = leaves.map((l) => ({
      sectionCode: l.sectionCode,
      title: l.title,
      lifecycleOp: l.lifecycleOp,
      checksum: l.checksum,
      documentTable: l.documentTable,
      documentId: l.documentId,
      granularity: l.granularity,
      documentType: l.documentType,
    }));

    // 3-4. Project → plan → materialize → audit (shared spine).
    const { manifest, plan, bundle } = await packageTechnicalFile({
      leaves: coreLeaves,
      resolveFile,
      regulation,
      outputDir,
      applicationId: params.applicationId,
      productName: params.productName,
      manufacturer: params.manufacturer,
      organizationId,
      userId,
      resourceType: 'ectd_sequence',
      resourceId: sequenceId,
      materialized,
      unresolvedLeaves,
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
    return {
      bundle,
      cleanup,
      skipped: plan.skipped,
      materialized,
      unresolvedLeaves,
      unfinalized,
      unfinalizedSections,
      ready: manifest.ready,
    };
  } finally {
    if (!assembleReturned) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export interface AssembleTechnicalFileFromProgramParams {
  /** regulatory_programs.id (uuid) — the program whose governed document to package. */
  programId: string;
  organizationId: number;
  userId: number;
  regulation: EuRegulation;
  /** Identifier used in the ZIP file name; defaults to a program-derived token. */
  applicationId?: string;
  productName?: string;
  manufacturer?: string;
}

export interface AssembleTechnicalFileFromProgramResult {
  /** The ZIP bytes — the staging directory is already gone when this returns. */
  buffer: Buffer;
  filename: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  /** Number of authored sections rendered to PDF leaves. */
  materialized: number;
  /** Authored sections projected into leaves (empty sections are not leaves). */
  leafCount: number;
  manifest: TechnicalFileManifest;
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
  unresolvedLeaves: UnresolvedLeaf[];
  unfinalized: number;
  unfinalizedSections: Array<{ sectionCode: string; status: string }>;
  ready: boolean;
}

/** Lowercase token from a section label, for the leaf's documentType hint. */
function labelDocType(label: string): string | undefined {
  const t = (label || '').trim().toLowerCase().replace(/[\s\-/·—]+/g, '_').replace(/^_+|_+$/g, '');
  return t.length > 0 ? t : undefined;
}

/**
 * Pure: project a program's governed section rows onto CoreLeaf entries. Only
 * AUTHORED rows become leaves (the same rule readiness applies) — an empty
 * section is a gap the manifest reports, never a blank leaf.
 */
export function governedSectionsToCoreLeaves(rows: ReadonlyArray<GovernedDeviceSectionRow>): CoreLeaf[] {
  const leaves: CoreLeaf[] = [];
  for (const row of rows) {
    if (!governedSectionIsAuthored(row)) continue;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    leaves.push({
      sectionCode: row.section_key,
      title: row.label,
      documentType: labelDocType(row.label) ?? null,
      lifecycleOp: 'new',
      documentTable: 'c2c_document_sections',
      documentId: id,
      checksum: null,
      granularity: null,
    });
  }
  return leaves;
}

/**
 * Assemble the program's GOVERNED mdr/ivdr document into a technical-file ZIP
 * and return the bytes. Tenant-scoped: the document must belong to
 * organizationId (c2c_documents.org_id) and every section is re-checked through
 * the org-scoped resolver. Throws NoAuthoredTechnicalFileContentError when the
 * program has no authored section of `regulation` — never an empty package.
 * The staging directory is ALWAYS removed before returning.
 */
export async function assembleTechnicalFileFromProgram(
  params: AssembleTechnicalFileFromProgramParams,
): Promise<AssembleTechnicalFileFromProgramResult> {
  const { programId, organizationId, userId, regulation } = params;

  // 1. The program's governed document of THIS regulation only (docTypes filter):
  //    a CER or 510(k) document of the same program must never be packaged as
  //    the MDR/IVDR technical file.
  const rows = await loadGovernedDeviceSections(organizationId, programId, pool, [regulation]);
  const coreLeaves = governedSectionsToCoreLeaves(rows);
  if (coreLeaves.length === 0) {
    throw new NoAuthoredTechnicalFileContentError(regulation, programId);
  }

  const applicationId = params.applicationId ?? `PROG-${programId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'techfile-program-'));
  const stageDir = path.join(outputDir, 'stage');
  try {
    await fs.mkdir(stageDir, { recursive: true });

    // 2. Materialize through the ONE leaf materializer (org-scoped JOIN on the
    //    parent document; empty sections come back unresolved, never blank).
    const { byKey, unresolved: unresolvedLeaves, materialized, unfinalized, unfinalizedSections } =
      await materializeLeafSources({
        leaves: coreLeaves.map((l) => ({ documentTable: l.documentTable ?? null, documentId: l.documentId ?? null })),
        organizationId,
        stageDir,
      });
    const resolveFile: LeafFileResolver = (leaf) => {
      if (!leaf.documentTable || !leaf.documentId) return null;
      return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId)) ?? null;
    };

    // 3-4. Project → plan → materialize → audit (shared spine).
    const { manifest, plan, bundle } = await packageTechnicalFile({
      leaves: coreLeaves,
      resolveFile,
      regulation,
      outputDir,
      applicationId,
      productName: params.productName,
      manufacturer: params.manufacturer,
      organizationId,
      userId,
      resourceType: 'regulatory_program',
      resourceId: programId,
      materialized,
      unresolvedLeaves,
      extraAudit: { source: 'c2c_document_sections', leafCount: coreLeaves.length, unfinalized },
    });

    // 5. Read the bytes BEFORE the finally block removes the staging directory.
    const buffer = await fs.readFile(bundle.path);

    return {
      buffer,
      filename: path.basename(bundle.path),
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
      fileCount: bundle.fileCount,
      materialized,
      leafCount: coreLeaves.length,
      manifest,
      skipped: plan.skipped,
      unresolvedLeaves,
      unfinalized,
      unfinalizedSections,
      ready: manifest.ready,
    };
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch((err) => {
      logger.warn('Failed to remove technical-file program staging dir', {
        programId,
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export default { assembleTechnicalFileFromCore, assembleTechnicalFileFromProgram };
