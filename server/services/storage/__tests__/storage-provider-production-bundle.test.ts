/**
 * The storage provider, built the way production builds it and run the way
 * production runs it.
 *
 * `STORAGE_PROVIDER=s3` could never work in a deployed build. s3-provider.ts
 * loaded the AWS SDK with `require()`, and the server bundle is ESM
 * (scripts/build-server.mjs), where esbuild turns an external `require` into a
 * shim that throws "Dynamic require … is not supported". The provider caught
 * that, logged "AWS SDK not installed", and its constructor then refused with
 * "@aws-sdk/client-s3 package not installed", although the package is a
 * dependency. A deployment could therefore keep vault bytes only on local
 * disk: per-task, ephemeral storage on Fargate.
 *
 * Vitest cannot show this. It gives every module a working `require`
 * (scripts/ci/check-commonjs-require.mjs explains at length), so an in-process
 * test passes against the broken code. This test bundles the storage module
 * with the production esbuild options and selects the provider in a plain Node
 * process.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- an .mjs build script with no type declarations
import { SERVER_BUILD_OPTIONS } from '../../../../scripts/build-server.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// Under the repo, so the bundle's external imports resolve from its node_modules.
const OUT = path.join(REPO_ROOT, 'node_modules', '.cache', `storage-bundle-${process.pid}.mjs`);

beforeAll(async () => {
  await build({
    ...SERVER_BUILD_OPTIONS,
    entryPoints: [path.join(REPO_ROOT, 'server/services/storage/index.ts')],
    outfile: OUT,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}, 60_000);

afterAll(() => {
  fs.rmSync(OUT, { force: true });
});

/** Select a provider inside a fresh Node process running the bundle. */
function selectInBundle(env: Record<string, string>): { name?: string; error?: string } {
  const script =
    `const m = await import(${JSON.stringify(OUT)});` +
    `try { process.stdout.write(JSON.stringify({ name: m.getStorageProvider().name })); }` +
    `catch (e) { process.stdout.write(JSON.stringify({ error: String(e && e.message) })); }`;
  const clean = { ...process.env };
  delete clean.STORAGE_PROVIDER;
  delete clean.AWS_S3_BUCKET;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...clean, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out.slice(out.lastIndexOf('{"')));
}

describe('the production bundle selects the storage provider it is configured with', () => {
  it('serves S3 when STORAGE_PROVIDER=s3 and a bucket is named', () => {
    const got = selectInBundle({ STORAGE_PROVIDER: 's3', AWS_S3_BUCKET: 'c2c-vault-probe', AWS_REGION: 'us-east-1' });
    expect(got.error, 'selecting S3 in the production bundle must not throw').toBeUndefined();
    expect(got.name).toBe('s3');
  });

  it('refuses an S3 selection that names no bucket', () => {
    expect(selectInBundle({ STORAGE_PROVIDER: 's3' }).error).toMatch(/AWS_S3_BUCKET/);
  });

  it('refuses a value it does not recognise instead of writing to local disk', () => {
    const got = selectInBundle({ STORAGE_PROVIDER: 'gcs' });
    expect(got.name, 'an unrecognised provider must never fall back to local disk').toBeUndefined();
    expect(got.error).toMatch(/STORAGE_PROVIDER/);
    expect(got.error).toMatch(/gcs/);
  });

  it('still serves local disk by default outside production configuration', () => {
    expect(selectInBundle({})).toEqual({ name: 'local' });
  });
});
