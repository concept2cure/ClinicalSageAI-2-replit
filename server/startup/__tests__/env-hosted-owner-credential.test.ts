/**
 * The hosted API refuses to boot holding the database owner's credential
 * (MR-03 Stage 3, OPS-16; MR-05 DATA-03; consistent with decision P-43).
 *
 * The owner role owns every table and bypasses RLS. The API serves as
 * app_service and creates no schema, and only the one-off database task carries
 * the owner's URL and the password app_service is minted with
 * (terraform/modules/ecs-fargate). The deploy preflight refuses them on the API
 * task definition; on an ECS task the boot refuses them too, so a revision
 * registered or edited outside the pipeline cannot serve as the owner. A
 * self-hosted install keeps its owner URL: it migrates from the same host.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../config/load-env-files', () => ({ ENV_FILES: [] }));

const ORIGINAL = { ...process.env };
const ECS = { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/0123456789abcdef-1234' };
const OWNER = 'postgresql://c2c_admin:pw@db:5432/app?sslmode=verify-full';

function bootWith(env: Record<string, string>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL, {
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://app_service:pw@db:5432/app?sslmode=verify-full',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-min-32-chars-long',
  });
  // Deleted, not assigned undefined: process.env stores that as the string "undefined".
  for (const k of [
    'ECS_CONTAINER_METADATA_URI', 'ECS_CONTAINER_METADATA_URI_V4',
    'DATABASE_URL', 'DATABASE_URL_PROD', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL',
    'DATABASE_OWNER_URL', 'APP_SERVICE_DB_PASSWORD',
  ]) delete process.env[k];
  Object.assign(process.env, env);
}

describe('the hosted API holds no database owner credential', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL);
  });

  it.each([
    'DATABASE_URL',
    'DATABASE_URL_PROD',
    'DATABASE_NEON_NEW_SECRET',
    'NEON_DATABASE_URL',
    'DATABASE_OWNER_URL',
    'APP_SERVICE_DB_PASSWORD',
  ])('on an ECS task, refuses %s, naming it', async name => {
    bootWith({ ...ECS, [name]: OWNER });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('on an ECS task, boots with APP_DATABASE_URL alone', async () => {
    bootWith({ ...ECS });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('on an ECS task, an empty variable holds nothing and is not refused', async () => {
    bootWith({ ...ECS, DATABASE_URL: '  ' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('a self-hosted install (no ECS task metadata) keeps its owner URL', async () => {
    bootWith({ DATABASE_URL: OWNER, APP_SERVICE_DB_PASSWORD: 'pw' });
    const { validateEnvironment } = await import('../env');
    expect(() => validateEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('refuses exactly the names the deploy preflight refuses on the API task definition', async () => {
    const workflow = readFileSync(
      fileURLToPath(new URL('../../../.github/workflows/deploy-aws.yml', import.meta.url)),
      'utf8',
    );
    const step = workflow.match(/OWNER_CREDENTIALS=\$\(jq[\s\S]*?map\(select\(IN\(([^)]*)\)\)\)/);
    expect(step, 'the preflight\'s OWNER_CREDENTIALS IN(...) list').not.toBeNull();
    const preflight = [...step![1].matchAll(/"([A-Z0-9_]+)"/g)].map(m => m[1]).sort();
    const { HOSTED_OWNER_CREDENTIAL_NAMES } = await import('../env');
    expect(preflight).toEqual([...HOSTED_OWNER_CREDENTIAL_NAMES].sort());
  });
});
