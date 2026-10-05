/**
 * Forensic audit (LOW → GA-safety) — keyless production must not serve demo text
 *
 * FORENSIC_CODE_AUDIT_2026-05-29.md flagged that a keyless prod deploy would
 * silently serve demo-mode regulatory text. The AI gateway now fails closed in
 * production when no provider is available, instead of falling back to the
 * deterministic/demo response. The explicit deterministicMode opt-in is unchanged.
 *
 * Source-integrity guard (the gateway pulls heavy provider/config deps at import).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../server/services/ai-gateway/gateway.ts'),
  'utf8'
);

describe('AI gateway fails closed on keyless production', () => {
  it('throws in production when no provider is available, before any demo fallback', () => {
    // The no-provider branch must guard on production and throw. Production is
    // read through isProductionEnv (pii-screen.ts), as every production rule in
    // the gateway reads it (track GW review [6], 2026-09-28): NODE_ENV
    // 'Production' boots as production, and must not serve demo content here.
    // Behaviour: governance-review.test.ts "[6] … a keyless deploy refuses".
    const branch = src.slice(src.indexOf('if (!selectedModel) {'));
    expect(branch.slice(0, branch.indexOf('throw new Error'))).toContain('if (isProductionEnv()) {');
    expect(src).toContain('refusing to serve demo-mode content');
    // The throw must come before the demo fallback within the no-provider branch.
    const throwIdx = branch.indexOf('No AI provider is configured in production');
    const fallbackIdx = branch.indexOf('buildDeterministicResponse');
    expect(throwIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeLessThan(fallbackIdx);
  });
});
