/**
 * The bytes sent to an agency, kept before they are sent (W5/D7, 2026-10-29).
 *
 * A transmit recorded the package's SHA-256 and the path of a staged file, and
 * the sequence spine then deleted that file (transmitSequence's
 * `assembled.cleanup()`). Re-assembling the same sequence later gives a
 * different zip and a different digest, so what went to FDA could be named by
 * its hash but not produced. 21 CFR 312.57 and 11.10(c) ask for the record
 * itself, retrievable for as long as it is kept.
 *
 * The guarded transmit (index.ts) calls this as its last step before the wire.
 * It reads the package through the same integrity gate every gateway reads it
 * through (readVerifiedBundle), so the stored copy and the bytes sent both hash
 * to the signed descriptor. It stores them with the platform's storage provider,
 * which production refuses to boot without durable storage
 * (storage/storage-posture.ts), and checks the stored copy's own digest. When
 * any of that fails the transmit is refused and nothing is sent.
 */
import { readVerifiedBundle } from './bundle-integrity';
import { getStorageProvider } from '../storage';
import type { GatewayTransmitRequest, Region, GatewayName } from './types';

/** The storage namespace sent packages live in, apart from any project's Vault files. */
export const SENT_PACKAGE_PROJECT = 'sent-packages';

/** Where the exact bytes sent are kept, as each transmittal row records it. */
export interface SentPackageRecord {
  storageVersionId: string;
  provider: string;
  sha256: string;
  sizeBytes: number;
  filename: string;
}

/** The package could not be kept, so it was not sent. */
export class SentPackageNotArchivedError extends Error {
  readonly code = 'SENT_PACKAGE_NOT_ARCHIVED' as const;
  readonly transmitted = false as const;
  constructor(detail: string, readonly cause?: unknown) {
    super(`Nothing was sent: a copy of the package's exact bytes could not be kept (${detail}). Try again once storage is available.`);
    this.name = 'SentPackageNotArchivedError';
  }
}

export async function archiveSentPackage(
  req: GatewayTransmitRequest,
  region: Region,
  gateway: GatewayName,
): Promise<SentPackageRecord> {
  const bytes = await readVerifiedBundle(req.bundle);
  const filename = `${region}-${gateway}-${req.bundle.sha256}.zip`;
  let stored: Awaited<ReturnType<ReturnType<typeof getStorageProvider>['put']>>;
  try {
    stored = await getStorageProvider().put({
      orgId: req.organizationId,
      projectId: SENT_PACKAGE_PROJECT,
      filename,
      bytes,
      mime: 'application/zip',
      metadata: {
        kind: 'sent-package',
        region,
        gateway,
        environment: req.environment,
        programId: req.programId ?? '',
        packageId: req.packageId == null ? '' : String(req.packageId),
        sha256: req.bundle.sha256,
      },
    });
  } catch (err) {
    throw new SentPackageNotArchivedError('storage refused the write', err);
  }
  if (stored.sha256 !== req.bundle.sha256 || stored.sizeBytes !== req.bundle.sizeBytes) {
    throw new SentPackageNotArchivedError('the stored copy does not match the signed package');
  }
  return {
    storageVersionId: stored.vaultVersionId,
    provider: stored.provider,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    filename,
  };
}
