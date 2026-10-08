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
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import { submissions, ectdSequences, submissionLeaves } from '../../../shared/schema';
import { usableIdentifier } from './regulatory-identifiers';
import { readRecordedPackageIdentity, packageIdentityRefusal, dryRunPackageIdentity } from './package-identity';
import { queryableFromDrizzle } from '../../db/drizzle-queryable';
import { packageSequenceFromCore, type PackageFromCoreResult, type PriorState } from './package-from-core';
import { materializeLeafSources, leafSourceKey, type UnresolvedLeaf } from './leaf-source-resolver';
import { validateLeafPaths } from './leaf-path-safety';
import { toPackagerRegion, type LeafFileResolver } from './core-to-packager';
import {
  computeEctdCompleteness,
  assertEctdSubmissionComplete,
  type CompletenessReport,
  type IncompleteLeaf,
} from './completeness';
import { submissionBundleRoot } from '../submission-gateways/bundle-namespace';
import {
  combineAuditRowOutcomes,
  recordAuditRow,
  type AuditRowOutcome,
} from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('assemble-from-core');

interface AssembleSequenceBase {
  sequenceId: number;
  organizationId: number;
  userId: number;
  emitUnzipped?: boolean;
  /** What lifecycle acts bind against; 'filed' unless a caller asks for a
   *  rehearsal (package-from-core PriorState). Transmit never does. */
  priorState?: PriorState;
}

/**
 * Either the identity the package names — read from the record by the caller
 * (package-identity.ts) — or a dry run, which names none of its own and gets the
 * one dry-run placeholder (dryRunPackageIdentity). A dry run produces no
 * package: its result says `dryRun: true`, and it is never stored or sent
 * (P-27 follow-up, 2026-10-08).
 */
export type AssembleSequenceParams = AssembleSequenceBase &
  (
    | { dryRun?: false; applicationId: string; sponsorId: string; sponsorName: string }
    | { dryRun: true; applicationId?: never; sponsorId?: never; sponsorName?: never }
  );

export interface AssembleSequenceResult extends PackageFromCoreResult {
  /** True for a dry run: placeholder identity, not a package — never stored or sent. */
  dryRun: boolean;
  /**
   * Remove the temp staging/output directory backing `bundle.path`. Call once
   * the bundle bytes are no longer needed (e.g. after transmit, or after an
   * assemble-only run has reported its metadata). Idempotent + best-effort;
   * without this every assemble leaks a full staged package under the bundle root's staging/.
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
 * What, besides an unresolved source, stops an assembled sequence from being
 * transmitted — one sentence per cause, in the words transmit refuses with.
 * Empty means nothing here stops it. 2026-09-22 (W5/D7).
 *
 *  • `skipped`: a placed leaf the packaging step could not express and left out
 *    of the ZIP. A leaf left out is a leaf missing from the filing.
 *  • `unfinalized`: a leaf whose source is still a draft or in review. It is IN
 *    the ZIP — the agency would receive a document no one approved.
 *
 * transmitSequence refuses on any of these; the assemble route reports them,
 * so "assembled" is never read as "ready to send"; and the governed freeze and
 * dispatch refuse on them too (2026-09-23), because once a sequence is frozen
 * its leaves are immutable and a transmit-time refusal has no remedy. Unresolved
 * leaves are included when the result carries them.
 */
export function assembledTransmitBlockers(
  r: Pick<AssembleSequenceResult, 'skipped' | 'unfinalized' | 'unfinalizedSections'> &
    Partial<Pick<AssembleSequenceResult, 'unresolvedLeaves'>>,
): string[] {
  const out: string[] = [];
  const unresolved = r.unresolvedLeaves ?? [];
  if (unresolved.length > 0) {
    out.push(
      `${unresolved.length} leaf source(s) could not be materialized into the package (` +
        unresolved.map((u) => `${u.documentTable}:${u.documentId ?? u.documentUuid ?? '?'}`).join(', ') +
        ')',
    );
  }
  if (r.skipped.length > 0) {
    out.push(
      `${r.skipped.length} placed leaf/leaves could not be packaged (` +
        r.skipped.map((l) => `${l.sectionCode}: ${l.reason}`).join('; ') +
        ')',
    );
  }
  if (r.unfinalized > 0) {
    out.push(
      `${r.unfinalized} leaf document(s) are not approved (` +
        (r.unfinalizedSections.length > 0
          ? r.unfinalizedSections.map((d) => `${d.sectionCode}: ${d.status}`).join('; ')
          : 'not itemised') +
        ')',
    );
  }
  return out;
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
/**
 * A refused assembly. The refusal is audited as ECTD_ASSEMBLE_BLOCKED, and that
 * row IS the record that the assembly was refused, so the error carries what
 * happened to it: a caller that reports the refusal can also report that it
 * went unrecorded. The message is the same sentence the plain Error carried.
 */
export class EctdAssemblyBlockedError extends Error {
  constructor(
    message: string,
    public readonly auditTrail: AuditRowOutcome,
  ) {
    super(message);
    this.name = 'EctdAssemblyBlockedError';
  }
}

async function assertLeafPathsSafe(
  files: Array<{ fileName: string; sourcePath: string }>,
  allowedRoot: string,
  ctx: { organizationId: number; userId: number; sequenceId: number },
): Promise<void> {
  const pathSafety = await validateLeafPaths(files, { allowedRoot });
  if (pathSafety.ok) return;
  // WO-16C: was `await auditService.logAction(…)` with its outcome discarded.
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ECTD_ASSEMBLE_BLOCKED',
    resourceType: 'ectd_sequence',
    resourceId: ctx.sequenceId,
    details: { reason: 'leaf_path_safety', violations: pathSafety.violations },
  });
  throw new EctdAssemblyBlockedError(
    `eCTD assembly blocked: ${pathSafety.violations.length} leaf path-safety violation(s): ` +
      pathSafety.violations.map((v) => `${v.fileName}:${v.code}`).join(', '),
    auditTrail,
  );
}

export async function assembleSequence(params: AssembleSequenceParams): Promise<AssembleSequenceResult> {
  const { sequenceId, organizationId, userId } = params;
  const dryRun = params.dryRun === true;
  const identity = params.dryRun === true
    ? dryRunPackageIdentity(sequenceId, organizationId)
    : { applicationId: params.applicationId, sponsorId: params.sponsorId, sponsorName: params.sponsorName };

  // 1. Tenant-scoped leaves for this sequence. See readSequenceLeaves.
  const leaves = await readSequenceLeaves(sequenceId, organizationId);

  // 2. Materialize every leaf's source document to a deterministic PDF, keyed by
  //    table:id. Every locally-renderable table (coauthor_documents,
  //    unified_documents) is rendered via the same `renderLeafPdf` path (so the
  //    md5/checksum contract is unchanged); external/binary tables are collected
  //    as `unresolvedLeaves` rather than being silently dropped.
  /* Staged INSIDE the submission-bundle root (2026-09-23, W5/D7). It was
     os.tmpdir(), and outside a declared development/test environment every
     gateway refuses a bundle outside that root (bundle-namespace.ts): each
     canonical sequence transmit — FDA's test environment included — was refused
     "outside the permitted submission-bundle storage namespace". */
  const stagingRoot = path.join(submissionBundleRoot(), 'staging');
  await fs.mkdir(stagingRoot, { recursive: true });
  const outputDir = await fs.mkdtemp(path.join(stagingRoot, `ectd-assemble-${sequenceId}-`));
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
    // The lifecycle op is carried so a document this sequence only WITHDRAWS is
    // not counted as unfinalized: a delete ships none of its content, so the
    // approval gate does not apply to it (2026-09-23, W5/D7, round-2 skeptic).
    // 2026-09-23 (W5/D7, residual repair): nor is its source read at all — an
    // unreadable one used to land in unresolvedLeaves and refuse at transmit a
    // withdrawal that dispatch-readiness read clear. package-from-core binds
    // the withdrawal by the document's key against the filed manifest, and
    // reports in `skipped` one it cannot bind.
    leaves: leaves.map((l) => ({
      documentTable: l.documentTable,
      documentId: l.documentId,
      documentUuid: l.documentUuid ?? null,
      lifecycleOp: l.lifecycleOp,
    })),
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
    // Either key space identifies a source: integer-keyed stores carry
    // documentId, uuid-keyed ones (vault.documents) carry documentUuid.
    // Requiring the integer here would silently drop every vault leaf.
    if (!leaf.documentTable || (!leaf.documentId && !leaf.documentUuid)) return null;
    return byKey.get(leafSourceKey(leaf.documentTable, leaf.documentId, leaf.documentUuid)) ?? null;
  };

  // 4. Drive the real publisher off the canonical core.
  const result = await packageSequenceFromCore({
    sequenceId,
    organizationId,
    userId,
    outputDir,
    applicationId: identity.applicationId,
    sponsorId: identity.sponsorId,
    sponsorName: identity.sponsorName,
    resolveFile,
    emitUnzipped: params.emitUnzipped,
    priorState: params.priorState,
  });

  if (unresolvedLeaves.length > 0) {
    logger.warn('Assemble dropped no leaf silently, but some sources could not be materialized', {
      sequenceId,
      organizationId,
      unresolved: unresolvedLeaves,
    });
  }

  // Governance integrity manifest, written OUTSIDE the regulatory backbone.
  // index.xml / md5.txt keep md5 for agency compatibility; this file is the
  // integrity record for governance and audit.
  //
  // The per-leaf hashes here used to come from `byKey` — the STAGED bytes, as
  // the resolver hashed them. The packager then normalizes each leaf to PDF/A
  // before writing it and re-hashes the converted bytes for the backbone, so
  // wherever Ghostscript is installed every per-leaf hash in this file
  // described a file the package does not contain, and the record could not
  // verify the package it claims to cover. The packager's own leafManifest
  // carries the SHIPPED href and md5; that is what is recorded.
  //
  // Per-leaf sha256 is deliberately absent rather than wrong: the packager does
  // not expose the converted bytes, so the only sha256 that can honestly be
  // stated is the package-level one below, which is taken over the archive as
  // written.
  const governanceManifestPath = path.join(outputDir, 'package-governance.sha256.json');
  await fs.writeFile(
    governanceManifestPath,
    JSON.stringify(
      {
        sequenceId,
        organizationId,
        // A dry run's manifest says so too: it describes no package.
        dryRun,
        hashPolicy:
          'md5 = eCTD index (agency requirement), recorded here over the SHIPPED leaf bytes; ' +
          'sha256 = package governance, package-level only (leaves are normalized to PDF/A after staging)',
        packageSha256: result.bundle.sha256,
        leaves: (result.bundle.leafManifest ?? []).map((l) => ({
          fileName: l.fileName,
          href: l.href,
          md5: l.md5,
        })),
        // Where each staged source came from, by identity (the document alias
        // map) — the lineage a filed snapshot used to carry only as prose.
        // `canonicalId: null` is a row that was never aliased; `available:
        // false` is a database without the alias migration. Stated, not
        // smoothed over. Keyed by the resolver's `${table}:${id}` and the
        // staged file name, because the packager may rename on the way out.
        sources: [...byKey.entries()].map(([key, f]) => ({
          key,
          stagedFileName: f.fileName,
          lineage: f.lineage ?? null,
        })),
      },
      null,
      2,
    ),
  );

  /* WO-16C: was `await auditService.logAction(…)` with its outcome discarded.
     The result's `auditTrail` is persisted only when this row AND the
     packager's ECTD_PACKAGED_FROM_CORE row were: a lost row anywhere in the
     assembly is reported. */
  const assembledAudit = await recordAuditRow({
    organizationId,
    userId,
    action: 'ECTD_ASSEMBLED',
    resourceType: 'ectd_sequence',
    resourceId: sequenceId,
    details: { materialized, skipped: result.skipped.length, unresolved: unresolvedLeaves.length, outputDir, packageSha256: result.bundle.sha256, dryRun },
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
  return {
    ...result,
    dryRun,
    auditTrail: combineAuditRowOutcomes(result.auditTrail, assembledAudit),
    cleanup,
    materialized,
    unresolvedLeaves,
    unfinalized,
    unfinalizedSections,
    governanceManifestPath,
  };
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
   * An application number the caller states. It must be usable and equal the
   * number the submission's project records; the package carries the RECORDED
   * number, and with none recorded it is not built (package-identity.ts).
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
  /** What a follow-up sequence's acts bind against; 'filed' unless asked for
   *  a rehearsal, whose package is named so (see package-from-core). */
  priorState?: PriorState;
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
  /** The prior state the acts were bound against, and — for a rehearsal — the
   *  earlier sequences bound against that were never filed. */
  priorState: PriorState;
  unfiledPriorSequences: string[];
  /** The submission's program (submissions.program_id), or null for a
   *  submission not anchored to one. The export route records a governed
   *  export against the project that anchors this program (W5/D7). */
  programId: string | null;
  /** The assembly's §11.10(e) outcome (both rows), from assembleSequence. */
  auditTrail: AuditRowOutcome;
  /** DTD self-containment status from the packager. */
  // `missingStylesheets` travels with `missing`: selfContained is false when
  // EITHER is non-empty, so a consumer that reads only `missing` cannot say
  // which files are absent (see SubmissionBundle['dtdStatus']).
  dtdStatus?: {
    required: string[];
    present: string[];
    missing: string[];
    missingStylesheets?: string[];
    selfContained: boolean;
  };
  stats: {
    totalModules: number;
    totalGranules: number;
    totalFiles: number;
    generatedAt: string;
    completeness: CompletenessReport;
  };
}

/**
 * The application and the applicant a submission's package names, from the
 * record only (package-identity.ts): the project's recorded agency number and
 * the organisation's recorded name. With either missing the package is refused
 * by name (PackageIdentityMissingError) — never built with a placeholder, and
 * never with the program code as the number. A caller-supplied number must be
 * usable and must equal the recorded one.
 *
 * 2026-09-29 (W5/D7, WO-9 Click 6): the number came only from the caller, which
 * the compile surface never sends. 2026-10-08 (QA j6): with no number recorded
 * it fell back to the program code (PLR-606 shipped as the FDA application
 * number), then to UNASSIGNED-SEQ-<id>, and the applicant was
 * "UNASSIGNED (organization N)".
 */
async function exportIdentity(
  submission: { programId: string | null },
  organizationId: number,
  supplied: string | undefined,
): Promise<{ applicationId: string; applicantName: string }> {
  const usable = supplied === undefined ? undefined : usableIdentifier('applicationNumber', supplied);
  if (usable === null) {
    throw new Error(
      `"${supplied}" is not a usable application number: it must start with a letter or digit and hold only ` +
        'letters, digits, ".", "_" or "-" (up to 64).',
    );
  }
  const identity = await readRecordedPackageIdentity(queryableFromDrizzle(db), organizationId, submission.programId);
  const refusal = packageIdentityRefusal(identity, 'Nothing was built.');
  if (refusal) throw refusal;
  const recorded = identity.applicationNumber as string;
  if (usable !== undefined && usable !== recorded) {
    throw new Error(
      `Application number "${usable}" does not match the program's recorded application number "${recorded}". ` +
        'The record is authoritative; omit the number to package as recorded.',
    );
  }
  return { applicationId: recorded, applicantName: identity.applicantName as string };
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

  // The application and the applicant come from the record, or nothing is built.
  const { applicationId, applicantName } = await exportIdentity(submission, organizationId, params.applicationNumber);

  const assembled = await assembleSequence({
    sequenceId: sequence.id,
    organizationId,
    userId,
    applicationId,
    // The applicant's <id> (D-U-N-S) has no recorded home on this path yet; an
    // absent one still says it is unassigned (package-identity.ts header).
    sponsorId: params.applicantId ?? `UNASSIGNED-ORG-${organizationId}`,
    sponsorName: applicantName,
    priorState: params.priorState,
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

    // A rehearsal's download says so in its name: it is for an agency
    // validator, bound against sequences that were never filed.
    const baseName = path.basename(assembled.bundle.path);
    return {
      buffer,
      filename: assembled.priorState === 'rehearsal' ? baseName.replace(/(\.zip)?$/i, '-rehearsal$1') : baseName,
      sequenceId: sequence.id,
      sequenceNumber: sequence.sequenceNumber,
      region: sequence.region,
      sha256: assembled.bundle.sha256,
      materialized: assembled.materialized,
      unresolvedLeaves: assembled.unresolvedLeaves,
      skipped: assembled.skipped,
      priorState: assembled.priorState,
      unfiledPriorSequences: assembled.unfiledPriorSequences,
      programId: submission.programId ?? null,
      // The assembly's §11.10(e) outcome; the export route answers it as headers.
      auditTrail: assembled.auditTrail,
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
