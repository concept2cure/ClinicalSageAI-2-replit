/**
 * CERV2 AI analyze-section — fallback honesty.
 *
 * server/routes/cerv2-ai-routes.ts drafts sections of REAL 510(k)/PMA/EU-MDR
 * submissions. When the AI gateway is unavailable, POST /ai/analyze-section
 * falls back to `enhancedMockContent`. That fallback used to emit HARDCODED,
 * invented clinical-trial statistics — e.g. "300 subjects", "responder rate
 * of 78.5% ... vs 42.3% (p < 0.001)", "adverse event rate 12.8%", effect size
 * "0.65 (95% CI 0.42-0.88)" — for PMA `clin`/`risk` and CER `benefitrisk`.
 * None of those numbers come from `ctx` (the caller-supplied device
 * context); they were fabricated by the template author. Because the
 * fabricated prose carried no bracketed [PLACEHOLDER] tokens,
 * `validateSectionServer`'s PLACEHOLDER_REGEX never flagged it, so a
 * fabricated-but-"complete" section could pass the completeness gate and
 * flow into a real regulatory submission.
 *
 * This pins the honest contract: when the AI gateway fails, the fallback
 * section for these sections must read as an UN-FILLED TEMPLATE —
 * every invented N, subject count, responder rate, percentage, p-value,
 * effect size, confidence interval, AE rate, and follow-up figure must be a
 * bracketed placeholder that PLACEHOLDER_REGEX catches — never a bare
 * fabricated number. `validateSectionServer` must then mark the section
 * incomplete (severity 'error', a "placeholder" issue reported).
 *
 * The generators and the gate are pure functions with no DB/AI-gateway
 * dependency, so they are exercised directly via `__testInternals` (exported
 * for tests only) rather than through the authenticated HTTP route — no
 * supertest, no JWT, no live gateway needed. The route module's own
 * top-level imports (auth, RAG router, AI gateway, unified AI client) are
 * mocked purely so importing the module has no DB/network side effects;
 * none of those mocks affect the assertions below.
 *
 * This test FAILS against the pre-fix hardcoded content: the old `clin`
 * fallback literally contained "300 subjects", "78.5%", "42.3%", and
 * "p < 0.001" with zero bracketed placeholders, which trips every
 * `not.toMatch` assertion below and leaves PLACEHOLDER_REGEX with no match.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: async () => '',
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({
  // No enabled providers → generateWithRAG() never reaches the AI path in
  // any test that happened to exercise it; irrelevant here since these tests
  // call the fallback generators directly, but kept honest for the import.
  getGateway: () => ({
    getEnabledProviders: () => [] as string[],
    route: async () => ({ content: '' }),
  }),
}));
vi.mock('../../services/ragRouter.js', () => ({
  ragRouter: { retrieve: async () => ({ documents: [] as unknown[] }) },
}));
vi.mock('../../services/generation-guard.js', () => ({
  emitTraceEvent: () => {},
  createTraceId: () => 'test-trace-id',
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: {} }));

import { __testInternals } from '../cerv2-ai-routes';

const { enhancedMockContent, validateSectionServer, PLACEHOLDER_REGEX } = __testInternals;

// The exact fabricated figures the pre-fix template hardcoded. None of these
// may appear bare (unbracketed) in the AI-unavailable fallback.
const FABRICATED_STAT_PATTERNS: RegExp[] = [
  /\b300\s+subjects\b/i,
  /\b78\.5%/,
  /\b42\.3%/,
  /p\s*<\s*0\.001/,
  /\b12\.8%/,
  /\b11\.5%/,
  /\b15\s+(investigational\s+)?sites\b/i,
  /\b285\s+subjects\b/i,
  /\b270\s+subjects\b/i,
  /\b60%\s+was\s+exceeded\b/i,
  /\b30%\s+vs\.?\s+standard\s+of\s+care\b/i,
  /effect size:\s*0\.65/i,
  /95%\s*CI:\s*0\.42.?0\.88/i,
  /\b3\.2%/,
  /\b1\.8%/,
  /\b12-month\b/i,
];

function assertNoFabricatedStats(content: string) {
  for (const pattern of FABRICATED_STAT_PATTERNS) {
    expect(content).not.toMatch(pattern);
  }
}

// PLACEHOLDER_REGEX carries the sticky `g` flag on one shared instance
// exported from the route module, so `.test()`/`.exec()` calls mutate its
// `lastIndex` across invocations. `.match()`/`.matchAll()` are internally
// safe (spec resets/clones), but any `.test()`-style check gets a fresh
// clone here so this file never depends on call order or a matcher's
// internal use of `.test()` vs `.match()`.
function freshPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_REGEX.source, PLACEHOLDER_REGEX.flags);
}

function assertHasCatchablePlaceholder(content: string) {
  const matches = content.match(freshPlaceholderRegex());
  expect(matches).not.toBeNull();
  expect((matches as RegExpMatchArray).length).toBeGreaterThan(0);
}

const ctx = {
  deviceName: 'AcmeCardioValve',
  manufacturer: 'Acme Medical',
  predicateDevice: 'PredicateValve X',
  predicateK: 'P210001',
  intendedUse: 'transcatheter aortic valve replacement',
  deviceClass: 'III',
};

describe('CERV2 AI analyze-section fallback — no fabricated clinical statistics', () => {
  it('PMA "clin" fallback: no bare fabricated stats, has catchable placeholders, and validateSectionServer flags it incomplete', () => {
    const content = enhancedMockContent.cerv2_pma.clin(ctx);

    assertNoFabricatedStats(content);
    assertHasCatchablePlaceholder(content);

    const result = validateSectionServer('cerv2_pma', 'clin', content, ctx);
    expect(result.severity).toBe('error');
    expect(result.issues.some(i => /placeholder/i.test(i))).toBe(true);
  });

  it('PMA "risk" fallback: no bare fabricated stats, has catchable placeholders, and validateSectionServer flags it incomplete', () => {
    const content = enhancedMockContent.cerv2_pma.risk(ctx);

    assertNoFabricatedStats(content);
    assertHasCatchablePlaceholder(content);

    const result = validateSectionServer('cerv2_pma', 'risk', content, ctx);
    expect(result.severity).toBe('error');
    expect(result.issues.some(i => /placeholder/i.test(i))).toBe(true);
  });

  it('CER "benefitrisk" fallback: no bare fabricated stats, has catchable placeholders, and validateSectionServer flags it incomplete', () => {
    const content = enhancedMockContent.cerv2_cer.benefitrisk(ctx);

    assertNoFabricatedStats(content);
    assertHasCatchablePlaceholder(content);

    const result = validateSectionServer('cerv2_cer', 'benefitrisk', content, ctx);
    expect(result.severity).toBe('error');
    expect(result.issues.some(i => /placeholder/i.test(i))).toBe(true);
  });

  it('placeholder tokens used by the fallback are actually matched by PLACEHOLDER_REGEX (regression guard against too-short tokens like "[N]")', () => {
    // The regex requires at least 3 characters inside the brackets
    // (`[A-Z]` then `{2,}` more), so a bare "[N]" would silently NOT be
    // caught. Every placeholder introduced by the fix must be long enough.
    expect(freshPlaceholderRegex().test('[N]')).toBe(false);

    const clin = enhancedMockContent.cerv2_pma.clin(ctx);
    const matches = [...clin.matchAll(freshPlaceholderRegex())].map(m => m[0]);
    expect(matches.length).toBeGreaterThan(0);
    for (const token of matches) {
      // Strip the brackets and confirm real content, not a single letter.
      expect(token.slice(1, -1).length).toBeGreaterThanOrEqual(3);
    }
    expect(matches).toEqual(
      expect.arrayContaining(['[SUBJECT COUNT]', '[RESPONDER RATE]', '[CONTROL RATE]', '[P-VALUE]'])
    );
  });

  it('ctx-derived deviceName is still interpolated, unlike the bracketed statistical unknowns', () => {
    const clin = enhancedMockContent.cerv2_pma.clin(ctx);
    expect(clin).toContain(ctx.deviceName);

    const risk = enhancedMockContent.cerv2_pma.risk(ctx);
    expect(risk).toContain(ctx.deviceName);

    const benefitrisk = enhancedMockContent.cerv2_cer.benefitrisk(ctx);
    expect(benefitrisk).toContain(ctx.deviceName);
  });
});

describe('CERV2 AI analyze-section fallback — no asserted test results', () => {
  /* The statistics fix above covered PMA clin/risk and CER benefitrisk, and
     missed the 510(k) `testing` section, which stated four results as fact
     whenever the gateway returned nothing: biocompatibility "passed … at an
     ISO 17025 accredited laboratory", IEC 60601-1 "meets all applicable
     requirements … within specified limits", IEC 62304 "comply", and
     "meets or exceeds all design input specifications". None carried a
     placeholder, so the completeness gate had nothing to catch. */
  const ASSERTED_RESULT = [
    /\bpassed\b/i,
    /meets all applicable requirements/i,
    /within specified limits/i,
    /\bcompl(y|ies) with IEC 62304/i,
    /meets or exceeds/i,
    /ISO 17025 accredited laboratory\./i,
  ];

  it('510(k) "testing" fallback states no result, is all placeholders, and is flagged incomplete', () => {
    const content = enhancedMockContent.cerv2_510k.testing(ctx);
    for (const re of ASSERTED_RESULT) expect(content, `asserted result ${re}`).not.toMatch(re);
    assertHasCatchablePlaceholder(content);
    const result = validateSectionServer('cerv2_510k', 'testing', content, ctx);
    expect(result.severity).toBe('error');
    expect(result.issues.some(i => /placeholder/i.test(i))).toBe(true);
  });

  it('no section in any fallback template asserts a passed test or a met requirement', () => {
    for (const [docType, sections] of Object.entries(enhancedMockContent)) {
      for (const [sectionId, fn] of Object.entries(sections)) {
        const content = (fn as (c: typeof ctx) => string)(ctx);
        for (const re of ASSERTED_RESULT) {
          expect(content, `${docType}.${sectionId} asserts ${re}`).not.toMatch(re);
        }
      }
    }
  });
});
