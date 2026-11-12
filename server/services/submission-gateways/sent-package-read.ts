/**
 * The exact bytes a transmittal sent, read back for someone who may read its
 * project (2026-10-29, W5/D7).
 *
 * The guarded transmit keeps the package before the wire and names the copy on
 * the transmittal row (`metadata.sentPackage`, sent-package-archive.ts). This
 * reads it back. Every refusal says why and that nothing was downloaded. A
 * copy that is missing, or does not hash to what the row records as sent, is
 * an error, never an empty or substitute file. Apart from the archive module
 * so the gateway registry does not import project access.
 */
import { requireCurrentProgramAccess, type ProgramAccessExecutor } from '../c2c/current-program-access';
import { getStorageProviderFor, RecordedProviderUnavailable } from '../storage';
import { computeSha256, StorageIntegrityError } from '../storage/storage-provider';
import { getMaxGovernedExportBytes } from '../export/governedExportConsequence';
import type { SentPackageRecord } from './sent-package-archive';
import * as path from 'path';
import { createHash } from 'crypto';
import { readFiledSequenceArchive, type FiledSequence, type FiledSequenceLeaf } from '../legacy-importer/filed-sequence-reader';
import { bindToFiledState } from '../legacy-importer/filed-sequence-pointers';
import { baseLeafId, leafIdSlug } from './ectd-packager/leaf-id';
import { leafPackagePath } from './regional-packager';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { buildLeafManifest, type SequenceLeafManifestEntry } from '../ectd/sequence-manifest';
import type { PriorLeaf } from '../ectd/lifecycle-operator';
import type { Region } from './types';

/** Why a kept package was not handed back. Nothing was downloaded. */
export class SentPackageReadRefusal extends Error {
  constructor(readonly status: 404 | 409 | 413 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'SentPackageReadRefusal';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record a transmittal row carries, shape-checked; anything else is "not kept". */
export function sentPackageRecordOf(v: unknown): SentPackageRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.storageVersionId !== 'string' || !UUID_RE.test(r.storageVersionId)) return null;
  if (typeof r.provider !== 'string' || r.provider.trim() === '') return null;
  if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256)) return null;
  if (typeof r.sizeBytes !== 'number' || !Number.isSafeInteger(r.sizeBytes) || r.sizeBytes < 0) return null;
  if (typeof r.filename !== 'string' || !/^[a-z]+-[a-z0-9_]+-[0-9a-f]{64}\.zip$/.test(r.filename)) return null;
  return { storageVersionId: r.storageVersionId, provider: r.provider, sha256: r.sha256, sizeBytes: r.sizeBytes, filename: r.filename };
}

const NOTHING = 'Nothing was downloaded.';

export async function readSentPackage(
  q: ProgramAccessExecutor,
  input: { organizationId: number; userId: number; transmittalId: number },
): Promise<{ record: SentPackageRecord; bytes: Buffer; programId: string }> {
  const { rows } = await q.query(
    `SELECT program_id::text AS program_id, bundle_sha256, metadata->'sentPackage' AS sent
       FROM submission_transmittals WHERE id = $1 AND organization_id = $2`,
    [input.transmittalId, input.organizationId],
  );
  const row = rows[0] as { program_id?: unknown; bundle_sha256?: unknown; sent?: unknown } | undefined;
  if (!row) throw new SentPackageReadRefusal(404, 'TRANSMITTAL_NOT_FOUND', 'Transmittal not found.');
  if (typeof row.program_id !== 'string' || row.program_id === '') {
    throw new SentPackageReadRefusal(409, 'SENT_PACKAGE_UNSCOPED',
      `This transmittal names no project, so whether you may read the package it sent cannot be checked. ${NOTHING}`);
  }
  // The package is the whole dossier: it is read under its project's access.
  await requireCurrentProgramAccess(q, { organizationId: input.organizationId, userId: input.userId, programId: row.program_id });
  const record = sentPackageRecordOf(row.sent);
  if (!record) {
    throw new SentPackageReadRefusal(404, 'SENT_PACKAGE_NOT_KEPT',
      'This transmittal was sent before the platform kept the bytes it sends, so they cannot be produced here. The agency holds what it received.');
  }
  if (record.sha256 !== row.bundle_sha256) {
    throw new SentPackageReadRefusal(409, 'SENT_PACKAGE_MISMATCH',
      `The copy named on this transmittal is not the package it records as sent. ${NOTHING}`);
  }
  if (record.sizeBytes > getMaxGovernedExportBytes()) {
    throw new SentPackageReadRefusal(413, 'SENT_PACKAGE_TOO_LARGE',
      `This package is kept, unchanged, but it is larger than the platform's download limit. ${NOTHING} Raise GOVERNED_EXPORT_MAX_BYTES to download it here.`);
  }
  let stored: Awaited<ReturnType<ReturnType<typeof getStorageProviderFor>['get']>>;
  try {
    stored = await getStorageProviderFor(record.provider).get(record.storageVersionId, input.organizationId);
  } catch (err) {
    if (err instanceof RecordedProviderUnavailable) {
      throw new SentPackageReadRefusal(503, 'SENT_PACKAGE_STORE_UNAVAILABLE', `The store that holds this package cannot be opened here. ${NOTHING}`);
    }
    if (err instanceof StorageIntegrityError) {
      throw new SentPackageReadRefusal(409, 'SENT_PACKAGE_INTEGRITY', `The kept copy does not match its recorded identity. ${NOTHING}`);
    }
    throw err;
  }
  if (!stored) {
    throw new SentPackageReadRefusal(409, 'SENT_PACKAGE_MISSING', `The kept copy of this package is not in storage. ${NOTHING}`);
  }
  if (stored.bytes.length !== record.sizeBytes || computeSha256(stored.bytes) !== record.sha256) {
    throw new SentPackageReadRefusal(409, 'SENT_PACKAGE_INTEGRITY', `The kept copy does not match its recorded identity. ${NOTHING}`);
  }
  return { record, bytes: stored.bytes, programId: row.program_id };
}

// ── P-99 C2: what a sent sequence carried, read back from the package it sent (design §3.1.2, re-cut 2026-11-09) ──

export const SENT_RECORD_METHOD = 'sent-package-read' as const;
export const SENT_RECORD_METHOD_VERSION = 1;
/** What the packager was handed before PDF/A conversion, and the proof kept for a signed original: neither is in a package. */
export const SENT_RECORD_NOT_RECOVERABLE = ['sourceMd5', 'originalPdfProof'] as const;

/** Why a sequence's record could not be read back from its package; nothing is recorded. */
export class SentRecordNotDerivable extends Error {
  readonly code = 'SENT_RECORD_NOT_DERIVABLE';
  constructor(readonly sequenceNumber: string, readonly reasons: string[]) {
    super(`What sequence ${sequenceNumber} carried could not be read back from the package it sent: ${reasons.join('; ')}.`);
    this.name = 'SentRecordNotDerivable';
  }
}

export interface SentLeafDerivation {
  leaves: SequenceLeafManifestEntry[];
  manifestSha256: string;
  leafCount: number;
  notRecoverable: readonly string[];
}

/**
 * The record a sent sequence's package holds, as the guard would have stamped it (`buildLeafManifest`). Pure over the
 * bytes, the sequence's number and agency, and the filed state before it: the same inputs always give the same record
 * and the same `manifestSha256`.
 *   1. The reader must find exactly this one sequence, of this agency, with nothing refused.
 *   2. Each leaf's precise section is read back from its backbone ID, and only where the ID, the folder the packager
 *      files that section in, and the heading the reader read all agree (the reader alone gives the heading's section).
 *   3. What points outside the package is bound against the filed state (bindToFiledState).
 *   4. The stored shape is built by buildLeafManifest, in backbone and ID order: the package does not keep the order
 *      the packager was handed the leaves in.
 */
export async function deriveSentLeafManifest(
  bytes: Buffer,
  facts: { sequenceNumber: string; region: Region },
  priorLeaves: PriorLeaf[],
): Promise<SentLeafDerivation> {
  const n = facts.sequenceNumber;
  const refuse = (reasons: string[]): never => { throw new SentRecordNotDerivable(n, reasons); };
  let archive: Awaited<ReturnType<typeof readFiledSequenceArchive>>;
  try {
    archive = await readFiledSequenceArchive(bytes);
  } catch (err) {
    return refuse([err instanceof Error ? err.message : String(err)]);
  }
  const s = theSequence(archive, facts) ?? refuse(sequenceReasons(archive, facts));
  const reasons = s.refusals.map((r) => r.message);
  for (const l of s.leaves) {
    if (l.operation === 'delete') continue;
    const section = recoveredSection(l, facts.region);
    if (section) l.ctdSection = section;
    else reasons.push(`${l.fileName}: its section could not be read back from the package (its backbone ID ${l.leafId} and its folder ${path.posix.dirname(l.href)} do not agree)`);
  }
  reasons.push(...bindToFiledState(s, priorLeaves));
  if (reasons.length) refuse(reasons);
  const leaves = buildLeafManifest([...s.leaves].sort((a, b) => `${a.backbone}#${a.leafId}`.localeCompare(`${b.backbone}#${b.leafId}`)));
  return {
    leaves, leafCount: leaves.length, notRecoverable: SENT_RECORD_NOT_RECOVERABLE,
    manifestSha256: createHash('sha256').update(JSON.stringify(leaves)).digest('hex'),
  };
}

/** The archive's one sequence, when it is exactly this sequence of this agency and nothing in the archive was refused. */
function theSequence(archive: Awaited<ReturnType<typeof readFiledSequenceArchive>>, facts: { sequenceNumber: string; region: Region }): FiledSequence | null {
  if (archive.refusals.length || archive.sequences.length !== 1) return null;
  const s = archive.sequences[0];
  return s.sequence === facts.sequenceNumber && s.region === facts.region ? s : null;
}

function sequenceReasons(archive: Awaited<ReturnType<typeof readFiledSequenceArchive>>, facts: { sequenceNumber: string; region: Region }): string[] {
  if (archive.refusals.length) return archive.refusals.map((r) => r.message);
  if (archive.sequences.length !== 1) return [`the package holds ${archive.sequences.length} sequences, not one`];
  const s = archive.sequences[0];
  return [s.sequence !== facts.sequenceNumber
    ? `the package holds sequence ${s.sequence ?? 'with no number'}, not sequence ${facts.sequenceNumber}`
    : `the package's regional backbone is ${s.region ?? 'no agency\'s'}, not ${facts.region.toUpperCase()}'s`];
}

/** A leaf's section as its row spelled it, read back from its backbone ID; null unless exactly one reading agrees. */
function recoveredSection(l: FiledSequenceLeaf, region: Region): string | null {
  if (!l.leafId.startsWith('leaf-') || !l.fileName) return null;
  const body = l.leafId.slice('leaf-'.length);
  const tail = `-${leafIdSlug(l.fileName)}`;
  const bases = [body, /^(.*)-\d+$/.exec(body)?.[1]].filter((b): b is string => typeof b === 'string' && b.endsWith(tail));
  const readings = [...new Set(bases.map((b) => b.slice(0, -tail.length).replace(/-/g, '.')))].filter((c) => readingAgrees(c, l, region));
  return readings.length === 1 ? readings[0] : null;
}

/** All three encodings agree: the ID the packager would give, its folder for that section, and the heading read. */
function readingAgrees(section: string, l: FiledSequenceLeaf, region: Region): boolean {
  const base = baseLeafId({ ctdSection: section, fileName: l.fileName });
  if (l.leafId !== base && !(l.leafId.startsWith(`${base}-`) && /^\d+$/.test(l.leafId.slice(base.length + 1)))) return false;
  let expected: string;
  try {
    expected = path.posix.dirname(leafPackagePath({ ctdSection: section, fileName: l.fileName }, region).relPath);
  } catch {
    return false;
  }
  const folder = path.posix.dirname(l.href);
  // A study report and its STF sit one folder below their section's (regional-packager leafPackagePath).
  if (folder !== expected && !(/^m[45]\//.test(expected) && path.posix.dirname(folder) === expected)) return false;
  const code = normalizeCtdCode(section);
  const heading = normalizeCtdCode(l.ctdSection);
  return code !== null && heading !== null && (code === heading || code.startsWith(`${heading}.`));
}
