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

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

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
