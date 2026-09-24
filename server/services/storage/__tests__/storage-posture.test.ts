/**
 * Production names a durable home for vault bytes, or it does not start.
 *
 * A production process with STORAGE_PROVIDER unset served local disk. Every
 * deployment target this repository ships behaves that way: the Fargate task
 * definition, the docker-compose stacks and the CI boot smoke. Local disk
 * belongs to the container. A Fargate task's disk is deleted when the task
 * stops, and a compose `app` container's when it is recreated. The vault's
 * database rows (content hash, filename, provider version id) outlive both, so
 * a filing's source documents would become rows that describe nothing. The
 * upload path refuses to record a document whose bytes were not written
 * (vault-ingest.service.ts); nothing refused bytes that were written somewhere
 * about to disappear.
 *
 * The rule, in the shape of the other boot postures (auditSealPosture.ts):
 * production must set STORAGE_PROVIDER. `s3` needs a bucket. `local` needs
 * STORAGE_ACCEPT_LOCAL_DISK=true, the operator's statement that storage/ is a
 * durable volume.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDurableStorageForProduction } from '../storage-posture';

const prod = (extra: Record<string, string>) => ({ NODE_ENV: 'production', ...extra });

describe('assertDurableStorageForProduction', () => {
  it('refuses production with no STORAGE_PROVIDER', () => {
    expect(() => assertDurableStorageForProduction(prod({}))).toThrow(/STORAGE_PROVIDER/);
  });

  it('refuses a provider it does not implement', () => {
    expect(() => assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 'gcs' }))).toThrow(/gcs/);
  });

  it('refuses S3 without a bucket, and accepts it with one', () => {
    expect(() => assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 's3' }))).toThrow(/AWS_S3_BUCKET/);
    expect(() =>
      assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 's3', AWS_S3_BUCKET: 'c2c-vault' })),
    ).not.toThrow();
  });

  it('refuses local disk unless the operator states it is durable', () => {
    expect(() => assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 'local' }))).toThrow(
      /STORAGE_ACCEPT_LOCAL_DISK/,
    );
    expect(() =>
      assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 'local', STORAGE_ACCEPT_LOCAL_DISK: 'yes' })),
    ).toThrow(/STORAGE_ACCEPT_LOCAL_DISK/);
    expect(() =>
      assertDurableStorageForProduction(prod({ STORAGE_PROVIDER: 'local', STORAGE_ACCEPT_LOCAL_DISK: 'true' })),
    ).not.toThrow();
  });

  it('is a no-op outside production', () => {
    expect(() => assertDurableStorageForProduction({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDurableStorageForProduction({ NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('the server configuration fires it on import', () => {
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

  /** Import the real server/config/environment.ts in a fresh production process. */
  function loadConfig(extra: Record<string, string>): string {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'production',
      RLS_ENFORCE: 'on',
      DATABASE_URL: 'postgresql://probe@127.0.0.1:1/probe',
      // Every other production posture, satisfied, so the only refusal left to
      // observe is the one under test.
      JWT_SECRET: 'probe-jwt-secret-min-32-chars-long-aaaaaa',
      REFRESH_TOKEN_SECRET: 'probe-refresh-secret-min-32-chars-bbbbbbb',
      MFA_ENCRYPTION_KEY: 'probe-mfa-encryption-key-min-32-chars-ccc',
      AUDIT_HMAC_KEY: 'probe-audit-hmac-key-min-32-chars-ddddddd',
      AUDIT_HMAC_SECRET: 'probe-audit-hmac-secret-min-32-chars-eeeee',
      AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
      AI_PROVIDER_PLACEMENT_APPROVALS:
        '{"private-deployment":{"region":"us","zeroRetentionApproved":true,"approvedDataClasses":[],"approvedIntendedUses":[]}}',
      ...extra,
    };
    return execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '-e',
        "import('./server/config/environment.ts').then(() => console.log('LOADED'), (e) => console.log('REFUSED: ' + e.message))",
      ],
      { cwd: REPO_ROOT, env, encoding: 'utf8' },
    );
  }

  it('refuses to load production configuration that names no vault store', () => {
    const out = loadConfig({});
    expect(out, 'production must not start with vault bytes on container disk').toMatch(/REFUSED: .*STORAGE_PROVIDER/);
  }, 60_000);

  it('loads it once the store is named', () => {
    expect(loadConfig({ STORAGE_PROVIDER: 's3', AWS_S3_BUCKET: 'c2c-vault-probe' })).toMatch(/LOADED/);
  }, 60_000);
});
