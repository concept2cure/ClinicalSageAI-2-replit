/**
 * Which storage provider STORAGE_PROVIDER names. Dependency-free, so the boot
 * posture (./storage-posture.ts, fired while server/config/environment.ts loads)
 * can use it without loading the providers, the logger or the AWS SDK.
 *
 * @module server/services/storage/provider-name
 */

/**
 * The provider STORAGE_PROVIDER names. Unset means local disk.
 *
 * Any other value is refused. It used to fall through to local disk: a typo,
 * or a provider this module does not implement, sent every vault byte to the
 * container's own disk, with nothing said. On Fargate that disk belongs to one
 * task and disappears with it, so the vault's database rows would outlive the
 * documents they describe.
 */
export function resolveStorageProviderName(env: NodeJS.ProcessEnv = process.env): 'local' | 's3' {
  const raw = env.STORAGE_PROVIDER;
  if (raw === undefined || raw.trim() === '') return 'local';
  const name = raw.trim().toLowerCase();
  if (name === 'local') return 'local';
  if (name === 's3' || name === 'aws') return 's3';
  throw new Error(
    `STORAGE_PROVIDER '${raw}' is not a storage provider this server implements ` +
      `(local, s3). Refusing to fall back to local disk.`,
  );
}
