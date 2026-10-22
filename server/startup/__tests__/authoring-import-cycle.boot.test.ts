/** Vitest supplies different module semantics; the actual production bundle must initialize in plain Node. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- canonical .mjs build configuration has no type declarations
import { SERVER_BUILD_OPTIONS } from '../../../scripts/build-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let scratch: string;
let bundle: string;

beforeAll(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-authoring-boot-'));
  bundle = path.join(scratch, 'index.mjs');
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
  await build({
    ...SERVER_BUILD_OPTIONS,
    entryPoints: [path.join(ROOT, 'server/index.ts')],
    outfile: bundle,
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.BUILD_COMMIT': '"isolated-authoring-import-probe"' },
  });
}, 60_000);

afterAll(() => { if (scratch) fs.rmSync(scratch, { recursive: true, force: true }); });

/** A closed scratch configuration: no inherited credentials, no .env files, no usable database or provider key. */
function probeEnvironment(): Record<string, string> {
  const env: Record<string, string> = {
    NODE_ENV: 'production', RLS_ENFORCE: 'on', SKIP_DB_STARTUP_TEST: 'true',
    DATABASE_URL: 'postgresql://isolated_probe:dummy@127.0.0.1:1/unused?sslmode=disable',
    APP_DATABASE_URL: 'postgresql://isolated_probe:dummy@127.0.0.1:1/unused?sslmode=disable',
    AI_GATEWAY_DETERMINISTIC: 'true', AI_GATEWAY_ACCEPT_DETERMINISTIC: 'true',
    AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
    AI_PROVIDER_PLACEMENT_APPROVALS: JSON.stringify({ 'private-deployment': { region: 'us', zeroRetentionApproved: true, approvedDataClasses: [], approvedIntendedUses: [] } }),
    CONCEPT2CURE_SIGNER_MODE: 'hmac', CONCEPT2CURE_SIGNER_ACCEPT_HMAC: 'true',
    STORAGE_PROVIDER: 'local', STORAGE_ACCEPT_LOCAL_DISK: 'true',
    // This deliberate refusal comes from validateEnvironment in the composition
    // root, after module initialization and before any route registration.
    AUTH_BOUNDARY_MODE: 'warn',
  };
  for (const key of ['JWT_SECRET', 'SESSION_SECRET', 'REFRESH_TOKEN_SECRET', 'AUDIT_HMAC_SECRET', 'AUDIT_HMAC_KEY', 'AUDIT_EXPORT_SIGNING_KEY', 'MFA_ENCRYPTION_KEY', 'CONNECTOR_ENCRYPTION_KEY']) {
    env[key] = randomBytes(32).toString('hex');
  }
  return env;
}

describe('the shipped module graph completes authoring initialization', () => {
  it('reaches the composition root’s production posture refusal instead of waiting on circular init promises', () => {
    const result = spawnSync(process.execPath, [bundle], {
      cwd: scratch, env: probeEnvironment(), encoding: 'utf8', timeout: 15_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
    });
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    // Only safe outcome metadata is included in a failed assertion: never the
    // process's full output, environment or generated scratch key material.
    const outcome = {
      status: result.status, signal: result.signal, errorCode: result.error && 'code' in result.error ? result.error.code : undefined,
      validatorReached: output.includes('[FATAL] AUTH_BOUNDARY_MODE=warn is not permitted in production:'),
    };
    expect(outcome).toEqual({ status: 1, signal: null, errorCode: undefined, validatorReached: true });
    expect(output.includes('unsettled top-level await')).toBe(false);
  }, 45_000);
});
