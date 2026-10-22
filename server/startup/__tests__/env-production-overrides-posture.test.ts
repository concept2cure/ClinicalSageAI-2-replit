/**
 * Production refuses test routes everywhere, and the hosted deployment refuses
 * every operator override (MR-03 Stage 2: OPS-28, SEC-18; decision P-43 in
 * docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * ENABLE_TEST_ROUTES=true mounted the test-assembly and integration-test
 * routes in a production process. Nothing sets it, and test routes have no
 * production use, so production refuses it like the dev, mock and demo route
 * flags.
 *
 * The *_ACCEPT_* variables each switch a production refusal off on the
 * operator's written word. A self-hosted install (docker-compose.yml, the
 * install SKU) needs some of them: no KMS, no object store. The hosted
 * deployment never does, and until this change only the deploy pipeline's
 * preflight kept them out: a revision registered or edited outside it booted
 * with one. On an ECS task (ECS_CONTAINER_METADATA_URI_V4, which the ECS agent
 * sets and a task definition cannot remove) the boot refuses them itself, and
 * AUDIT_REQUIRE_ENFORCE=false with them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The posture is checked against the environment each case sets, not a
// developer's `.env`, which server/config/load-env-files would otherwise read.
vi.mock('../../config/load-env-files', () => ({ ENV_FILES: [] }));

const ORIGINAL = { ...process.env };
const ECS = { ECS_CONTAINER_METADATA_URI_V4: 'http://169.254.170.2/v4/0123456789abcdef-1234' };

function bootWith(env: Record<string, string | undefined>) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL, {
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://app_service:y@localhost:5432/z',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-min-32-chars-long',
    ...env,
  });
  delete process.env.ECS_CONTAINER_METADATA_URI;
  if (!('ECS_CONTAINER_METADATA_URI_V4' in env)) delete process.env.ECS_CONTAINER_METADATA_URI_V4;
  // Not inherited from the runner (CI's test job sets DATABASE_URL): on an ECS
  // task the boot refuses an owner URL (env-hosted-owner-credential.test.ts).
  for (const k of ['DATABASE_URL', 'DATABASE_URL_PROD', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL', 'DATABASE_OWNER_URL', 'APP_SERVICE_DB_PASSWORD']) {
    if (!(k in env)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
}

const OVERRIDES = [
  'AUDIT_SEAL_ACCEPT_UNSEALED',
  'AI_GOVERNANCE_ACCEPT_PERMISSIVE',
  'STORAGE_ACCEPT_LOCAL_DISK',
  'CONCEPT2CURE_SIGNER_ACCEPT_HMAC',
  'AI_GATEWAY_ACCEPT_DETERMINISTIC',
  // A later override is refused too: the rule is the name's shape, not a list.
  'SOME_FUTURE_ACCEPT_RISK',
];

describe('production boot posture: test routes and operator overrides', () => {
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

  describe('ENABLE_TEST_ROUTES', () => {
    it('refuses it in every production boot, naming it', async () => {
      bootWith({ ENABLE_TEST_ROUTES: 'true' });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
      expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/ENABLE_TEST_ROUTES/);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('never mounts the test routes in production, whatever the flag says', async () => {
      bootWith({ ENABLE_TEST_ROUTES: 'true' });
      const { resolveStartupFlags } = await import('../env');
      expect(resolveStartupFlags().testRoutesEnabled).toBe(false);
    });

    it('still mounts them outside production', async () => {
      bootWith({ NODE_ENV: 'development' });
      const { resolveStartupFlags, validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).not.toThrow();
      expect(resolveStartupFlags().testRoutesEnabled).toBe(true);
    });
  });

  describe('on the hosted deployment (an ECS task)', () => {
    it.each(OVERRIDES)('refuses %s=true, naming it', async name => {
      bootWith({ ...ECS, [name]: 'true' });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
      expect(errorSpy.mock.calls.flat().join('\n')).toMatch(new RegExp(name));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it.each(['TRUE', ' true ', 'yes', '1'])('refuses an override set to %j: anything but false is an acceptance', async value => {
      bootWith({ ...ECS, STORAGE_ACCEPT_LOCAL_DISK: value });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
    });

    it('refuses AUDIT_REQUIRE_ENFORCE=false', async () => {
      bootWith({ ...ECS, AUDIT_REQUIRE_ENFORCE: 'false' });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).toThrow(/process\.exit\(1\)/);
      expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/AUDIT_REQUIRE_ENFORCE/);
    });

    it('boots with an override set to false, which accepts nothing', async () => {
      bootWith({ ...ECS, CONCEPT2CURE_SIGNER_ACCEPT_HMAC: 'false', AUDIT_REQUIRE_ENFORCE: 'true' });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('boots with no override at all', async () => {
      bootWith({ ...ECS });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).not.toThrow();
    });
  });

  describe('on a self-hosted install (no ECS task metadata)', () => {
    it('keeps each written acceptance: the install SKU runs on them', async () => {
      bootWith({
        CONCEPT2CURE_SIGNER_ACCEPT_HMAC: 'true',
        STORAGE_ACCEPT_LOCAL_DISK: 'true',
        AUDIT_REQUIRE_ENFORCE: 'false',
      });
      const { validateEnvironment } = await import('../env');
      expect(() => validateEnvironment()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
