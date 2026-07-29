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
    // The no-provider branch must guard on production and throw.
    expect(src).toContain("process.env.NODE_ENV === 'production'");
    expect(src).toContain('refusing to serve demo-mode content');
    // The throw must come before the demo fallback within the no-provider branch.
    const branch = src.slice(src.indexOf('if (!selectedModel) {'));
    const throwIdx = branch.indexOf('No AI provider is configured in production');
    const fallbackIdx = branch.indexOf('buildDeterministicResponse');
    expect(throwIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeLessThan(fallbackIdx);
  });
});
