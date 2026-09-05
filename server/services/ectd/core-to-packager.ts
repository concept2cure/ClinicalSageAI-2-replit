/**
 * Submission core → publisher adapter (backbone unification)
 *
 * Bridges the canonical Phase-1 core (`submission_leaves` + `ectd_sequences` +
 * `submissions`) into the live, real publisher `packageEctdSubmission`
 * (`submission-gateways/regional-packager.ts`).
 *
 * WHY THIS EXISTS (audit finding): there were two submission backbones — the new
 * Drizzle core and an older raw-SQL `reg_*` model whose packager
 * (the former `reg/{indexXml,packager}.ts`, since deleted) was orphaned (no HTTP caller,
 * no migrations for `reg_sequences`/`reg_sequence_files`). Meanwhile the new core's
 * `submission_leaves` was written by ingestion but never READ, and the live
 * packager was fed leaves by hand. This adapter makes the canonical core the
 * source of truth that drives the real publisher, so the `reg_*` packager path
 * can be retired.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network. The one storage-specific
 * concern — resolving a leaf's polymorphic `documentTable`/`documentId` to an
 * on-disk file — is INJECTED as `resolveFile`, keeping this unit-testable. The
 * DB-backed orchestrator (`package-from-core.ts`) supplies a real resolver.
 *
 * @module server/services/ectd/core-to-packager
 */

import type { EctdLeaf, PackagerInput } from '../submission-gateways/regional-packager';
import type { Region } from '../submission-gateways/types';

/** Core leaf shape (decoupled from the Drizzle row type so this stays pure). */
export interface CoreLeaf {
  sectionCode: string;
  title: string;
  lifecycleOp: string; // new | replace | append | delete
  checksum?: string | null;
  documentTable?: string | null;
  documentId?: number | null;
  granularity?: string | null;
  /** submission_leaves.document_type (e.g. 'ind_safety_report', 'ind_annual_report'). */
  documentType?: string | null;
}

/** The on-disk file a leaf's document resolves to. */
/**
 * Where a materialized leaf's bytes came from, BY IDENTITY (the document alias
 * map, Document Identity Contract slice C2) rather than by title. `canonicalId`
 * null means the store row was never aliased — a fact, not an absence of
 * lineage — and `available: false` means the database has not applied the
 * alias migration, which is reported rather than read as "no source".
 */
export type LeafLineage =
  | {
      available: true;
      store: string;
      nativeId: string;
      canonicalId: string | null;
      /** The authoring document this leaf is a representation of, when aliased. */
      source: { store: string; nativeId: string } | null;
    }
  | { available: false; reason: 'relation_absent' };

export interface ResolvedFile {
  fileName: string;
  sourcePath: string;
  /** MD5 — the eCTD index requirement (goes into the regulatory backbone). */
  md5?: string;
  /** SHA-256 — modern integrity hash retained for package governance OUTSIDE the
   *  eCTD backbone (the index/md5.txt still use md5 for agency compatibility). */
  sha256?: string;
  /** Identity lineage, recorded in the governance manifest — never in the backbone. */
  lineage?: LeafLineage;
}

/** Resolve a core leaf's polymorphic document reference to an on-disk file. */
export type LeafFileResolver = (leaf: CoreLeaf) => ResolvedFile | null;

const OPERATIONS = new Set<EctdLeaf['operation']>(['new', 'append', 'replace', 'delete']);

/**
 * A leaf's eCTD lifecycle operation, refused rather than defaulted.
 *
 * This coerced anything it did not recognise to 'new'. `lifecycle_op` is free
 * text on the write path (submission-service writes `input.lifecycleOp ?? 'new'`
 * with no enum check), so 'Replace', 'REPLACE', 'withdraw' or a typo silently
 * became a brand-new leaf: the sequence re-filed the document as if it had
 * never been submitted, the prior version stayed current at the agency, and no
 * modified-file linked the two. Casing is normalised, because 'Replace' plainly
 * means replace; an operation nobody can read is refused, because filing a leaf
 * under the wrong operation is worse than not filing the sequence.
 */
function toOperation(op: string): EctdLeaf['operation'] {
  const normalized = String(op ?? '').trim().toLowerCase();
  if (OPERATIONS.has(normalized as EctdLeaf['operation'])) {
    return normalized as EctdLeaf['operation'];
  }
  throw new Error(
    `Unrecognised eCTD lifecycle operation "${op}". It must be one of ` +
      `${[...OPERATIONS].join(', ')}. Defaulting it to "new" would re-file the ` +
      `document as a new leaf and leave the version it supersedes current at the agency.`,
  );
}

// All 12 regions the packager can build a backbone for (mirrors
// regional-packager backboneByRegion), keyed by both agency name and ISO code.
// Health Canada ('ca') and the eight widened regions were previously ABSENT, so
// toPackagerRegion('ca') threw and the entire spine path could not build a
// Health Canada (or UK/CH/AU/CN/BR/IN/KR/SG) submission — only the separate
// orchestrator path could. NOTE: orchestrator-real-package.ts carries a parallel
// toPackagerRegion; the two should be unified in the packager-convergence work.
const REGION_MAP: Record<string, Region> = {
  fda: 'fda', us: 'fda',
  ema: 'ema', eu: 'ema',
  pmda: 'pmda', jp: 'pmda',
  ca: 'ca',
  uk: 'uk', ch: 'ch', au: 'au', cn: 'cn', br: 'br', in: 'in', kr: 'kr', sg: 'sg',
};

/** Map a canonical-core region (agency name or ISO code) to a publisher Region. */
export function toPackagerRegion(coreRegion: string): Region {
  const r = REGION_MAP[coreRegion.toLowerCase()];
  if (!r) {
    throw new Error(
      `Unsupported region "${coreRegion}" (expected one of: ${[...new Set(Object.values(REGION_MAP))].join(', ')}).`,
    );
  }
  return r;
}

/** Map a single core leaf + its resolved file to a publisher leaf. */
export function mapCoreLeafToEctdLeaf(leaf: CoreLeaf, resolved: ResolvedFile): EctdLeaf {
  return {
    ctdSection: leaf.sectionCode,
    operation: toOperation(leaf.lifecycleOp),
    sourcePath: resolved.sourcePath,
    fileName: resolved.fileName,
    title: leaf.title,
    // ONLY the resolver's byte-derived md5 may become the manifest checksum.
    // leaf.checksum is a DB column that ordinary callers set verbatim (e.g. PUT
    // /sequences/:id/leaves) with no tie to the file's bytes; using it as a
    // fallback would let an unverified, caller-settable string become the
    // index-md5.txt hash for a leaf that resolved to a real file — a manifest
    // that does not match the shipped bytes. When resolved.md5 is absent, leave
    // md5 undefined; the packager computes it from the actual bytes downstream.
    md5: resolved.md5 ?? undefined,
  };
}

export interface CoreSequence {
  sequenceNumber: string; // '0000'
  region: string; // fda | eu | jp
  /** ectd_sequences.type: original | amendment | response | variation | annual | withdrawal */
  type?: string | null;
}

/**
 * The FDA us-regional submission-type / sub-type for a sequence.
 *
 * ── The defect this closes ───────────────────────────────────────────────────
 * The packager received `submissionType: submission.applicationType` — the
 * string 'ind' — and resolved it through the v3.2.2 submission-type vocabulary,
 * where the only entry containing "IND" is `fdast9 · IND Safety Reports`. Every
 * IND sequence — the original, a protocol amendment, an annual report — left
 * the packager coded as an IND safety report in us-regional.xml.
 *
 * The submission type is a property of the SEQUENCE, not the application:
 *   original / amendment / response  → fdast1 Original Application
 *                                       (sub-type original / amendment)
 *   annual                            → fdast5 Annual Report
 *   a sequence carrying an IND safety-report leaf → fdast9 IND Safety Reports
 * (FDA eCTD Module 1 Specification v2.3, submission-type and sub-type codes;
 * see controlled-vocab/cv-v3-data.ts). Pinned by __tests__/core-to-packager-fda-admin.test.ts.
 */
export function fdaSubmissionTypeFor(
  sequence: CoreSequence,
  leaves: ReadonlyArray<Pick<CoreLeaf, 'documentType'>>,
): { submissionType: string; submissionSubType: string } {
  const type = String(sequence.type ?? 'original').toLowerCase();
  const carriesSafetyReport = leaves.some((l) => /safety[_-]?report|icsr/i.test(String(l.documentType ?? '')));
  if (carriesSafetyReport) return { submissionType: 'ind_safety_report', submissionSubType: 'original' };
  if (type === 'annual') return { submissionType: 'annual', submissionSubType: 'original' };
  if (type === 'amendment' || type === 'response' || type === 'variation') {
    return { submissionType: 'original', submissionSubType: 'amendment' };
  }
  return { submissionType: 'original', submissionSubType: 'original' };
}

export interface CoreSubmission {
  applicationType: string;
  productName?: string | null;
}

export interface BuildPackagerInputArgs {
  sequence: CoreSequence;
  submission: CoreSubmission;
  leaves: CoreLeaf[];
  /** Resolves each leaf's document to an on-disk file; return null to skip a leaf. */
  resolveFile: LeafFileResolver;
  applicationId: string;
  sponsorId: string;
  sponsorName: string;
  outputDir: string;
  emitUnzipped?: boolean;
}

export interface BuildPackagerInputResult {
  input: PackagerInput;
  /** Leaves with no resolvable source file, excluded from the package. */
  skipped: Array<{ sectionCode: string; reason: string }>;
}

/**
 * Assemble a `PackagerInput` from canonical-core rows. Pure: leaf content is
 * resolved via the injected `resolveFile`. Leaves that do not resolve to a file
 * are skipped and reported (the caller decides whether that is acceptable).
 */
export function buildPackagerInputFromCore(args: BuildPackagerInputArgs): BuildPackagerInputResult {
  const leaves: EctdLeaf[] = [];
  const skipped: Array<{ sectionCode: string; reason: string }> = [];

  for (const leaf of args.leaves) {
    const operation = toOperation(leaf.lifecycleOp);
    if (operation === 'delete') {
      // A withdrawal legitimately has no source document (dispatch-readiness
      // exempts delete leaves from UNRESOLVED_DOCUMENT for the same reason).
      // This loop used to require a resolved file for every leaf, so an
      // author-declared delete was dropped here as "no resolvable source
      // file" and never reached the backbone. It is carried as a backbone-only
      // leaf; the lifecycle step binds it to the prior leaf it withdraws and
      // supplies the prior checksum and modified-file pointer.
      const resolved = args.resolveFile(leaf);
      leaves.push({
        ctdSection: leaf.sectionCode,
        operation,
        sourcePath: resolved?.sourcePath ?? '',
        fileName: resolved?.fileName ?? '',
        title: leaf.title,
      });
      continue;
    }
    const resolved = args.resolveFile(leaf);
    if (!resolved) {
      skipped.push({ sectionCode: leaf.sectionCode, reason: 'no resolvable source file for the leaf document' });
      continue;
    }
    leaves.push(mapCoreLeafToEctdLeaf(leaf, resolved));
  }

  const region = toPackagerRegion(args.sequence.region);
  const fdaType = fdaSubmissionTypeFor(args.sequence, args.leaves);
  const input: PackagerInput = {
    region,
    applicationId: args.applicationId,
    sequence: args.sequence.sequenceNumber,
    submissionType: args.submission.applicationType,
    sponsorId: args.sponsorId,
    sponsorName: args.sponsorName,
    productName: args.submission.productName ?? '',
    leaves,
    outputDir: args.outputDir,
    emitUnzipped: args.emitUnzipped,
    // The us-regional admin block: application type from the submission
    // ('ind' → fdaat4), submission type and sub-type from the SEQUENCE. Without
    // this the packager resolved 'ind' as a submission type and coded every IND
    // sequence fdast9 (IND Safety Reports).
    ...(region === 'fda'
      ? {
          fda: {
            applicationType: args.submission.applicationType,
            submissionType: fdaType.submissionType,
            submissionSubType: fdaType.submissionSubType,
          },
        }
      : {}),
  };

  return { input, skipped };
}

export default { toPackagerRegion, mapCoreLeafToEctdLeaf, buildPackagerInputFromCore, fdaSubmissionTypeFor };
