/**
 * Boot posture for vault byte storage.
 *
 * Production must name where vault bytes live. With STORAGE_PROVIDER unset the
 * provider is local disk (./index.ts), and local disk belongs to the container.
 * A Fargate task's disk goes when the task stops, and a compose container's when
 * it is recreated. The database rows that describe the documents would outlive
 * them.
 *
 *   s3                                    needs AWS_S3_BUCKET
 *   local + STORAGE_ACCEPT_LOCAL_DISK=true  the operator states that storage/
 *                                         is a durable volume (the
 *                                         AUDIT_SEAL_ACCEPT_UNSEALED shape)
 *
 * Fired on import from server/config/environment.ts. No-op outside production.
 *
 * @module server/services/storage/storage-posture
 */
import { resolveStorageProviderName } from './provider-name';

export function assertDurableStorageForProduction(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  if (!isProduction) return;

  if ((env.STORAGE_PROVIDER ?? '').trim() === '') {
    throw new Error(
      '[storage-posture] REFUSING TO BOOT: STORAGE_PROVIDER is not set in production, so vault ' +
        "documents would be written to this container's own disk and lost with it. Set " +
        'STORAGE_PROVIDER=s3 with AWS_S3_BUCKET, or STORAGE_PROVIDER=local with ' +
        'STORAGE_ACCEPT_LOCAL_DISK=true where storage/ is a durable volume.',
    );
  }

  // Throws, by name, for a value this server does not implement.
  const provider = resolveStorageProviderName(env);

  if (provider === 's3' && (env.AWS_S3_BUCKET ?? '').trim() === '') {
    throw new Error(
      '[storage-posture] REFUSING TO BOOT: STORAGE_PROVIDER=s3 names no bucket. Set AWS_S3_BUCKET.',
    );
  }

  if (provider === 'local' && env.STORAGE_ACCEPT_LOCAL_DISK !== 'true') {
    throw new Error(
      '[storage-posture] REFUSING TO BOOT: STORAGE_PROVIDER=local in production keeps vault ' +
        'documents under storage/ on this host. Set STORAGE_ACCEPT_LOCAL_DISK=true only where ' +
        'that directory is a durable volume that outlives the container; otherwise use s3.',
    );
  }
}
