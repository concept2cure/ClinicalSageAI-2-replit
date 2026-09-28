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
import { coreLeafFromSubmissionLeaf, type LeafFileResolver, type CoreLeaf } from '../../ectd/core-to-packager';
import { assembleTechDoc, type EuRegulation } from './tech-doc-assembler';
import { buildTechnicalFileManifest } from '../technical-file-manifest';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
  techDocInputLeaves,
  type ReconciledTechnicalFileManifest,
  type TechnicalFileBundle,
  type TechnicalFilePlan,
  type TechnicalFileUnmappedLeaf,
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
  /**
   * Leaves no slot of this regulation claims. They also appear in `skipped` as
   * 'unmapped'. 2026-09-23 (W5/D7, round-2 skeptic, second pass): each is
   * marked `inTechnicalDocumentation`. An Annex II/III key no slot claims is
   * technical documentation the ZIP does not hold and makes `ready` false; the
   * eu-mdr / eu-ivdr outlines' IV.* conformity / registration sections are
   * reported and do not count (they are outside the Annex II/III technical
   * documentation — see tech-doc-assembler.ts). 2026-09-23 (W5/D7, residual
   * repair): the IVDR outline's II.6.3 / II.6.4 / II.6.5 now have slots; the
   * example this note gave (II.6.3 unclaimed) no longer occurs.
   */
  unmappedLeaves: TechnicalFileUnmappedLeaf[];
  /**
   * 2026-09-23 (W5/D7, final pass): placed sources a slot matched by title
   * alone (ReconciledTechnicalFileManifest.matchedByTitleOnly — the same list
   * as in manifest.json and the audit row). Reported; does not change `ready`.
   */
  matchedByTitleOnly: ReconciledTechnicalFileManifest['matchedByTitleOnly'];
  /**
   * The plan's reconciled readiness (buildTechnicalFilePlan — the one rule):
   * every required Annex II/III slot has a source placed in the ZIP, no
   * required slot lost a source, no leaf source went unresolved, and no
   * Annex II/III leaf went unmapped. The same value is in the ZIP's
   * manifest.json and the audit row.
   */
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
): Promise<{ manifest: ReconciledTechnicalFileManifest; plan: TechnicalFilePlan; bundle: TechnicalFileBundle; ready: boolean }> {
  const { leaves, regulation, organizationId, userId, unresolvedLeaves, materialized } = params;

  // 2026-09-23 (W5/D7, residual repair): the leaves are projected through the
  // ONE CoreLeaf → tech-doc input (techDocInputLeaves) that buildTechnicalFilePlan
  // also uses, so the plan places, per entry, exactly the leaves this projection
  // matched — by leaf, not by re-finding a section-code string.
  const techDocResult = assembleTechDoc({ regulation, leaves: techDocInputLeaves(leaves) });
  const manifest = buildTechnicalFileManifest(techDocResult, {
    productName: params.productName,
    manufacturer: params.manufacturer,
  });

  // 2026-09-23 (W5/D7, round-2 review): `ready` was manifest.ready — slot
  // presence, decided from the leaves BEFORE the plan resolved them. A leaf
  // placed in a required slot whose source did not resolve was left out of the
  // ZIP while the response still said ready: true.
  // 2026-09-23 (W5/D7, round-2 skeptic): the first fix, `manifest.ready &&
  // plan.skipped.length === 0`, counted leaves no Annex slot claims (skipped
  // as 'unmapped' — the eu-mdr outline's mandatory IV.* sections) and so
  // refused every complete MDR program; and the ZIP's manifest.json still said
  // ready: true with the CER 'present'. Readiness is now the plan's reconciled
  // manifest (the one rule, in buildTechnicalFilePlan): required-slot sources,
  // unresolved leaves and unmapped Annex II/III leaves count; unmapped IV.*
  // leaves are reported only (second pass, same date: an unmapped IVDR II.6.3
  // leaf had been reported only, and two same-code leaves in one slot placed
  // the first twice). The ZIP, the result and the audit row carry one value.
  // (Residual repair, same date: a slot's leaves are carried by identity, so a
  // same-code leaf another slot matched can no longer fill this one.)
  const plan = buildTechnicalFilePlan({ manifest, leaves, resolveFile: params.resolveFile, unresolvedLeaves });
  const bundle = await materializeTechnicalFile(plan, { outputDir: params.outputDir, applicationId: params.applicationId });
  const ready = plan.manifest.ready;

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
      ready,
      materialized,
      fileCount: bundle.fileCount,
      // The sha256 is what binds this audit row to the delivered artifact;
      // the staging directory is transient and is not recorded.
      sha256: bundle.sha256,
      sizeBytes: bundle.sizeBytes,
      skipped: plan.skipped.length,
      unresolved: unresolvedLeaves.length,
      unmappedLeaves: plan.unmappedLeaves.map((u) => u.source),
      // 2026-09-23 (W5/D7, round-2 skeptic, second pass): the unmapped leaves
      // that are Annex II/III technical documentation and made ready false.
      unmappedTechnicalDocumentation: plan.unmappedLeaves.filter((u) => u.inTechnicalDocumentation).map((u) => u.source),
      // 2026-09-23 (W5/D7, final pass): placements that rest on a title alone.
      matchedByTitleOnly: plan.manifest.matchedByTitleOnly,
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

  return { manifest: plan.manifest, plan, bundle, ready };
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
    // 2026-09-23 (W5/D7, round-2 review): the rows are read through the ONE
    // submission_leaves → CoreLeaf projection package-from-core uses. This
    // copy built CoreLeaf by hand without documentUuid: a vault leaf was staged
    // by its uuid below, then resolved to nothing and was left out of the ZIP.
    // Staging and resolving now read the same projected leaf.
    const coreLeaves: CoreLeaf[] = leaves.map(coreLeafFromSubmissionLeaf);

    const { byKey, unresolved: unresolvedLeaves, materialized, unfinalized, unfinalizedSections } =
      await materializeLeafSources({
        leaves: coreLeaves.map((l) => ({
          documentTable: l.documentTable ?? null,
          documentId: l.documentId ?? null,
          documentUuid: l.documentUuid ?? null,
        })),
        organizationId,
        stageDir,
      });

    const resolveFile: LeafFileResolver = (leaf) => {
      // Either key space identifies a source: integer-keyed stores carry
      // documentId, uuid-keyed ones (vault.documents) carry documentUuid.
      // Requiring the integer here would silently drop every vault leaf.
      if (!leaf.documentTable || (!leaf.documentId && !leaf.documentUuid)) return null;
      return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId, leaf.documentUuid)) ?? null;
    };

    // 3-4. Project → plan → materialize → audit (shared spine).
    const { plan, bundle, ready } = await packageTechnicalFile({
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
      unmappedLeaves: plan.unmappedLeaves,
      matchedByTitleOnly: plan.manifest.matchedByTitleOnly,
      ready,
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
  /** The manifest.json written into the ZIP (reconciled with the plan). */
  manifest: ReconciledTechnicalFileManifest;
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
  unresolvedLeaves: UnresolvedLeaf[];
  unfinalized: number;
  unfinalizedSections: Array<{ sectionCode: string; status: string }>;
  /** See AssembleTechnicalFileResult.unmappedLeaves. */
  unmappedLeaves: TechnicalFileUnmappedLeaf[];
  /** See AssembleTechnicalFileResult.matchedByTitleOnly. */
  matchedByTitleOnly: ReconciledTechnicalFileManifest['matchedByTitleOnly'];
  /** See AssembleTechnicalFileResult.ready — the same value as manifest.ready. */
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
      // Either key space identifies a source: integer-keyed stores carry
      // documentId, uuid-keyed ones (vault.documents) carry documentUuid.
      // Requiring the integer here would silently drop every vault leaf.
      if (!leaf.documentTable || (!leaf.documentId && !leaf.documentUuid)) return null;
      return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId, leaf.documentUuid)) ?? null;
    };

    // 3-4. Project → plan → materialize → audit (shared spine).
    const { manifest, plan, bundle, ready } = await packageTechnicalFile({
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
      unmappedLeaves: plan.unmappedLeaves,
      matchedByTitleOnly: plan.manifest.matchedByTitleOnly,
      ready,
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
