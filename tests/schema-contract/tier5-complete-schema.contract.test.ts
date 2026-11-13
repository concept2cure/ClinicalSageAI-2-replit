/**
 * Contract: the authenticated Tier 5 smoke must run against the deploy-shaped
 * database, not the intentionally incomplete install-fresh baseline.
 *
 * install-fresh provisions the app/Drizzle/root-migration surface. The
 * out-of-band C2C migration set is deliberately owned by deploy-migrate and
 * contains security-critical stores such as audit.tamper_proof_log and
 * ai.gateway_audit_log. A browser can still log in when those stores are
 * absent, so navigation alone would otherwise produce a false-green release
 * signal while audit persistence and other governed capabilities are degraded.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { load as loadYaml } from 'js-yaml';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

interface WorkflowStep { run?: string; env?: Record<string, unknown> }
interface SmokeWorkflow {
  env?: Record<string, unknown>;
  jobs: Record<string, { env?: Record<string, unknown>; steps: WorkflowStep[] }>;
}
const workflow = loadYaml(fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/tier5-browser-smoke.yml'), 'utf8')) as SmokeWorkflow;
const smokeJob = workflow.jobs['tier5-smoke'];
const browserSpecs = ['authenticated-app-smoke.e2e.spec.ts', 'golden-customer-journey.e2e.ts',
  'launch-surface-access-control.e2e.spec.ts', 'launch-surface-keyboard.e2e.spec.ts'];

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Tier 5 authenticated smoke uses the complete deployed schema', () => {
  it('applies deploy migrations before starting the browser smoke', () => {
    const command = packageJson.scripts?.['test:e2e:smoke'];
    expect(command, 'package.json scripts.test:e2e:smoke is missing').toBeTypeOf('string');

    const deployIndex = command!.indexOf('scripts/db/deploy-migrate.mjs');
    const browserIndex = command!.indexOf('scripts/run-e2e-smoke.mjs');

    expect(deployIndex, 'Tier 5 does not apply the out-of-band deploy migration set').toBeGreaterThanOrEqual(0);
    expect(browserIndex, 'Tier 5 browser runner is missing').toBeGreaterThanOrEqual(0);
    expect(deployIndex, 'deploy migrations must complete before the browser starts').toBeLessThan(browserIndex);
  });
});

describe('Tier 5 browser identity is the account the actual seed creates', () => {
  it.each(browserSpecs)('names the same fictional seed and login identity for %s', spec => {
    const steps = smokeJob.steps.filter(step => step.run?.includes(spec));
    expect(steps, 'Every browser proof must name its own executed step').toHaveLength(1);
    const env = { ...workflow.env, ...smokeJob.env, ...steps[0].env };
    // seed-admin reads ADMIN_EMAIL; dev-auth-helper reads SMOKE_USER_EMAIL.
    // A shared explicit test identity avoids both an unnamed login and the
    // local admin seed's historical personal default, for every browser step.
    expect(env.ADMIN_EMAIL).toMatch(/^[^@\s]+@(?:trialsage\.test|example\.test)$/);
    expect(env.SMOKE_USER_EMAIL).toBe(env.ADMIN_EMAIL);
    expect(env.ADMIN_NAME).toEqual(expect.any(String));
    expect(String(env.ADMIN_NAME).trim().length).toBeGreaterThan(0);
  });

  it('still refuses an unnamed dev-login before any network request', async () => {
    vi.stubEnv('SMOKE_USER_EMAIL', ''); vi.stubEnv('DEMO_USER_EMAIL', '');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    vi.resetModules();
    const { authenticateViaDevLogin } = await import('../e2e/dev-auth-helper');
    await expect(authenticateViaDevLogin({} as Parameters<typeof authenticateViaDevLogin>[0], 'http://127.0.0.1:5000'))
      .rejects.toThrow('dev-login needs an identity: set SMOKE_USER_EMAIL or DEMO_USER_EMAIL.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
