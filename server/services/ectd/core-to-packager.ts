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
}

/** The on-disk file a leaf's document resolves to. */
export interface ResolvedFile {
  fileName: string;
  sourcePath: string;
  md5?: string;
}

/** Resolve a core leaf's polymorphic document reference to an on-disk file. */
export type LeafFileResolver = (leaf: CoreLeaf) => ResolvedFile | null;

const OPERATIONS = new Set<EctdLeaf['operation']>(['new', 'append', 'replace', 'delete']);

function toOperation(op: string): EctdLeaf['operation'] {
  return OPERATIONS.has(op as EctdLeaf['operation']) ? (op as EctdLeaf['operation']) : 'new';
}

const REGION_MAP: Record<string, Region> = {
  fda: 'fda',
  us: 'fda',
  eu: 'ema',
  ema: 'ema',
  jp: 'pmda',
  pmda: 'pmda',
};

/** Map a canonical-core region (`fda|eu|jp`) to a publisher Region (`fda|ema|pmda`). */
export function toPackagerRegion(coreRegion: string): Region {
  const r = REGION_MAP[coreRegion.toLowerCase()];
  if (!r) throw new Error(`Unsupported region "${coreRegion}" (expected fda | eu | jp).`);
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
    md5: resolved.md5 ?? leaf.checksum ?? undefined,
  };
}

export interface CoreSequence {
  sequenceNumber: string; // '0000'
  region: string; // fda | eu | jp
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
    const resolved = args.resolveFile(leaf);
    if (!resolved) {
      skipped.push({ sectionCode: leaf.sectionCode, reason: 'no resolvable source file for the leaf document' });
      continue;
    }
    leaves.push(mapCoreLeafToEctdLeaf(leaf, resolved));
  }

  const input: PackagerInput = {
    region: toPackagerRegion(args.sequence.region),
    applicationId: args.applicationId,
    sequence: args.sequence.sequenceNumber,
    submissionType: args.submission.applicationType,
    sponsorId: args.sponsorId,
    sponsorName: args.sponsorName,
    productName: args.submission.productName ?? '',
    leaves,
    outputDir: args.outputDir,
    emitUnzipped: args.emitUnzipped,
  };

  return { input, skipped };
}

export default { toPackagerRegion, mapCoreLeafToEctdLeaf, buildPackagerInputFromCore };
