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
