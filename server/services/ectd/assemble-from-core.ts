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
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema';
import { packageSequenceFromCore, type PackageFromCoreResult } from './package-from-core';
import { materializeLeafSources, leafSourceKey, type UnresolvedLeaf } from './leaf-source-resolver';
import { validateLeafPaths } from './leaf-path-safety';
import { toPackagerRegion, type LeafFileResolver } from './core-to-packager';
import {
  computeEctdCompleteness,
  assertEctdSubmissionComplete,
  type CompletenessReport,
  type IncompleteLeaf,
} from './completeness';
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
   * Number of MATERIALIZED leaves whose source document is still a draft/review
   * artifact (not approved/finalized). These render into the package but a
   * submission-grade package must have zero of them — carried through to the
   * completeness verdict so `requireComplete` fails on an un-finalized dossier.
   */
  unfinalized: number;
  /** The unfinalized leaves' section + source status, for the completeness report. */
  unfinalizedSections: Array<{ sectionCode: string; status: string }>;
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
/**
 * The live leaves of a sequence, tenant-scoped and excluding soft-deleted rows.
 *
 * Extracted from assembleSequence purely to keep it under the
 * max-lines-per-function ceiling. The predicate is unchanged — the organization
 * filter and the deletedAt exclusion are what keep an assembly inside its tenant
 * and out of withdrawn leaves, so neither may be dropped here.
 */
async function readSequenceLeaves(sequenceId: number, organizationId: number) {
  return db
    .select()
    .from(submissionLeaves)
    .where(
      and(
        eq(submissionLeaves.sequenceId, sequenceId),
        eq(submissionLeaves.organizationId, organizationId),
        isNull(submissionLeaves.deletedAt)
      )
    );
}

/**
 * Refuse assembly unless every leaf resolves to a real, non-symlink PDF inside
 * the staging root, with no output-name collisions.
 *
 * This guards the injectable `resolveFile` seam: a caller-supplied path outside
 * the root, a symlink, or a non-PDF is refused BEFORE anything is packaged, and
 * the refusal is audited as ECTD_ASSEMBLE_BLOCKED so a blocked assembly leaves a
 * record rather than just an exception. Extracted from assembleSequence to keep
 * it under the max-lines-per-function ceiling; the check, the audit row and the
 * thrown message are unchanged.
 */
async function assertLeafPathsSafe(
  files: Array<{ fileName: string; sourcePath: string }>,
  allowedRoot: string,
  ctx: { organizationId: number; userId: number; sequenceId: number },
): Promise<void> {
  const pathSafety = await validateLeafPaths(files, { allowedRoot });
  if (pathSafety.ok) return;
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ECTD_ASSEMBLE_BLOCKED',
    resourceType: 'ectd_sequence',
    resourceId: ctx.sequenceId,
    details: { reason: 'leaf_path_safety', violations: pathSafety.violations },
  });
  throw new Error(
    `eCTD assembly blocked: ${pathSafety.violations.length} leaf path-safety violation(s): ` +
      pathSafety.violations.map((v) => `${v.fileName}:${v.code}`).join(', '),
  );
}

export async function assembleSequence(params: AssembleSequenceParams): Promise<AssembleSequenceResult> {
  const { sequenceId, organizationId, userId } = params;

  // 1. Tenant-scoped leaves for this sequence. See readSequenceLeaves.
  const leaves = await readSequenceLeaves(sequenceId, organizationId);

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

  const {
    byKey,
    unresolved: unresolvedLeaves,
    materialized,
    unfinalized,
    unfinalizedSections,
  } = await materializeLeafSources({
    leaves: leaves.map((l) => ({ documentTable: l.documentTable, documentId: l.documentId })),
    organizationId,
    stageDir,
  });

  // 2b. Path-safety gate (fail-closed): every staged leaf file must be a real,
  //     non-symlink PDF contained within the staging root, with no output-name
  //     collisions. This guards the injectable resolveFile seam — a caller-
  //     supplied path outside the root, a symlink, or a non-PDF is refused before
  //     anything is packaged.
  await assertLeafPathsSafe(
    [...byKey.values()].map((f) => ({ fileName: f.fileName, sourcePath: f.sourcePath })),
    stageDir,
    { organizationId, userId, sequenceId },
  );

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
  return { ...result, cleanup, materialized, unresolvedLeaves, unfinalized, unfinalizedSections, governanceManifestPath };
  } finally {
    if (!assembleReturned) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission-level convenience: submissions.id → sequence → assembled package
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembleSubmissionParams {
  /** Canonical submissions.id (the submission spine slice-4 intake creates). */
  submissionId: number;
  organizationId: number;
  userId: number;
  /**
   * Explicit sequence to assemble ('0000'…). When omitted, the submission's
   * LATEST sequence is assembled. Fail-closed: an explicit number that does not
   * exist is an error, never a silent fallback to another sequence.
   */
  sequenceNumber?: string;
  /**
   * Recorded agency application number for the backbone envelope. When absent
   * the package is built with a value that SAYS it is unassigned — see the
   * applicant fields below and regulatory-identifiers.ts.
   */
  applicationNumber?: string;
  /**
   * Recorded applicant identity (DUNS / EMA org id / PMDA applicant id, and the
   * applicant's legal name). These are not internal handles: the packager
   * writes them into the regional Module 1 backbone as <id> / <company-id> and
   * <name> / <company-name>, and the application number also becomes part of
   * the package filename.
   *
   * They were previously synthesized as `ORG-<orgId>` and `Organization <orgId>`
   * with no caller-supplied path at all, so a sequence assembled without
   * explicit identifiers shipped `<name>Organization 7</name>` to the agency —
   * a string that reads as a real applicant rather than as a gap. Absent
   * values now follow the repo's stated rule (regulatory-identifiers.ts: "never
   * fabricate … build with values that SAY they are unassigned") and the wording
   * already used on the transmit path in submission-ops.
   */
  applicantId?: string;
  applicantName?: string;
  /**
   * Requested region (accepts core codes fda|eu|jp and agency names FDA|EMA|
   * PMDA). The sequence's RECORDED region is always authoritative for what gets
   * packaged; a caller-requested region that contradicts it is REFUSED rather
   * than silently honored or silently ignored. Omit to package as recorded.
   */
  region?: string;
  /**
   * Submission-grade gate. When true, throws EctdCompletenessError instead of
   * returning a package with unmaterialized (source-unresolvable) leaves or no
   * leaves at all — a substantively-empty dossier can never be produced for an
   * actual filing.
   */
  requireComplete?: boolean;
}

export interface AssembleSubmissionResult {
  /** The assembled eCTD ZIP bytes (staging already cleaned up). */
  buffer: Buffer;
  filename: string;
  sequenceId: number;
  sequenceNumber: string;
  /** The sequence's recorded core region (fda | eu | jp …). */
  region: string;
  sha256: string;
  materialized: number;
  unresolvedLeaves: UnresolvedLeaf[];
  skipped: Array<{ sectionCode: string; reason: string }>;
  /** DTD self-containment status from the packager. */
  dtdStatus?: { required: string[]; present: string[]; missing: string[]; selfContained: boolean };
  stats: {
    totalModules: number;
    totalGranules: number;
    totalFiles: number;
    generatedAt: string;
    completeness: CompletenessReport;
  };
}

/**
 * Assemble a submission's eCTD package from the canonical core, addressed by
 * submissions.id rather than sequence id. This is the ONE package-build entry
 * point for callers that hold a submission handle (the eCTD export route, the
 * audit-services export, the PDEV compile bridge) — it resolves the sequence,
 * drives `assembleSequence` (the canonical assembler), reads the ZIP bytes,
 * computes the submission-completeness report over what actually materialized,
 * and always cleans up the staging directory before returning.
 *
 * Fail-closed: unknown submission / sequence throws; `requireComplete` refuses
 * a package with unmaterialized leaves or no leaves via EctdCompletenessError.
 */
export async function assembleSubmissionEctd(
  params: AssembleSubmissionParams,
): Promise<AssembleSubmissionResult> {
  const { submissionId, organizationId, userId } = params;

  const [submission] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.organizationId, organizationId),
        isNull(submissions.deletedAt),
      ),
    )
    .limit(1);
  if (!submission) {
    throw new Error('Submission not found for this organization.');
  }

  const sequenceRows = await db
    .select()
    .from(ectdSequences)
    .where(
      and(
        eq(ectdSequences.submissionId, submissionId),
        eq(ectdSequences.organizationId, organizationId),
        isNull(ectdSequences.deletedAt),
      ),
    )
    .orderBy(desc(ectdSequences.sequenceNumber), desc(ectdSequences.id));

  const sequence = params.sequenceNumber != null
    ? sequenceRows.find((s) => s.sequenceNumber === params.sequenceNumber)
    : sequenceRows[0];
  if (!sequence) {
    throw new Error(
      params.sequenceNumber != null
        ? `eCTD sequence ${params.sequenceNumber} not found for this submission.`
        : 'No eCTD sequence exists for this submission — it was not found. Create a sequence and place documents into it before exporting.',
    );
  }

  // Region honesty: the sequence's recorded region is what gets packaged. A
  // caller-requested region that contradicts the record is refused outright —
  // silently honoring it would mislabel a regulatory package, silently ignoring
  // it would mislead the caller.
  if (params.region) {
    const requested = toPackagerRegion(params.region);
    const recorded = toPackagerRegion(sequence.region);
    if (requested !== recorded) {
      throw new Error(
        `Requested region "${params.region}" does not match the sequence's recorded region "${sequence.region}". ` +
          'The recorded region is authoritative; omit the region to package as recorded.',
      );
    }
  }

  const assembled = await assembleSequence({
    sequenceId: sequence.id,
    organizationId,
    userId,
    // Never fabricate an agency identifier. An unassigned value says so, in the
    // same wording the transmit path already uses (submission-ops), so a
    // reviewer reading the backbone sees a gap instead of a plausible applicant.
    applicationId: params.applicationNumber ?? `UNASSIGNED-SEQ-${sequence.id}`,
    sponsorId: params.applicantId ?? `UNASSIGNED-ORG-${organizationId}`,
    sponsorName: params.applicantName ?? `UNASSIGNED (organization ${organizationId})`,
  });

  try {
    // Completeness over what ACTUALLY materialized. `skipped` is the packager's
    // view of every leaf without a staged file (a superset of the resolver's
    // `unresolvedLeaves`), so it is the honest "unfinished leaf" count.
    const incompleteSections: IncompleteLeaf[] = [
      ...assembled.skipped.map((s) => ({
        granuleId: s.sectionCode,
        granuleName: s.sectionCode,
        status: s.reason,
      })),
      // Materialized-but-unfinalized leaves are ALSO incomplete: a draft/review
      // document rendered to PDF is not a submission-ready leaf.
      ...assembled.unfinalizedSections.map((s) => ({
        granuleId: s.sectionCode,
        granuleName: s.sectionCode,
        status: `source not finalized (${s.status})`,
      })),
    ];
    const completeness = computeEctdCompleteness(
      assembled.materialized + assembled.skipped.length,
      assembled.skipped.length,
      incompleteSections,
      // Real count of materialized leaves whose source is still a draft — NOT a
      // hardcoded 0. A package of all-draft documents is not submission-complete,
      // and requireComplete must fail on it.
      assembled.unfinalized,
    );
    if (params.requireComplete) assertEctdSubmissionComplete(completeness);

    const buffer = await fs.readFile(assembled.bundle.path);

    // Honest counts from the actual archive.
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
    const moduleDirs = new Set(
      entries.map((f) => f.split('/')[0]).filter((top) => /^m[1-5]$/.test(top)),
    );

    return {
      buffer,
      filename: path.basename(assembled.bundle.path),
      sequenceId: sequence.id,
      sequenceNumber: sequence.sequenceNumber,
      region: sequence.region,
      sha256: assembled.bundle.sha256,
      materialized: assembled.materialized,
      unresolvedLeaves: assembled.unresolvedLeaves,
      skipped: assembled.skipped,
      dtdStatus: assembled.bundle.dtdStatus,
      stats: {
        totalModules: moduleDirs.size,
        totalGranules: assembled.materialized,
        totalFiles: entries.length,
        generatedAt: new Date().toISOString(),
        completeness,
      },
    };
  } finally {
    await assembled.cleanup();
  }
}

export default { assembleSequence, assembleSubmissionEctd };
