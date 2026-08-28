/**
 * Companion to cerv2-ai-fallback-honesty.test.ts. That file proved the
 * AI-unavailable fallback no longer emits fabricated *statistics*; this file
 * proves it no longer emits fabricated *regulatory conclusions*.
 *
 * Substantial equivalence (510(k)), the benefit-risk determination, and GSPR
 * conformity (EU MDR CER) are conclusions FDA / the notified body / the
 * reviewer reach from a documented comparison — they are not facts the tool
 * may assert. The pre-fix templates and enhancedMockContent builders stated
 * them outright ("the subject device is substantially equivalent ... and
 * should be cleared", "the benefit-risk profile is favorable and supports
 * conformity with ... MDR 2017/745", a GSPR table pre-filled "✅ Compliant"),
 * with no bracketed placeholder in the conclusory clause — so the section read
 * as a finished, favorable determination that could flow straight into a
 * filing. The fix leaves every such conclusion as a catchable [ALL-CAPS]
 * placeholder for a human to complete.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: async () => '',
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({
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

const { enhancedMockContent, sectionTemplates, validateSectionServer, PLACEHOLDER_REGEX } =
  __testInternals;

const ctx = {
  deviceName: 'CardioFlow X1',
  predicateDevice: 'LegacyFlow 2000',
  predicateK: 'K123456',
  intendedUse: 'transcatheter aortic valve replacement',
  deviceClass: 'III',
};

// Conclusory determinations that must NOT be asserted by any fallback/template.
const FABRICATED_CONCLUSION_PATTERNS: RegExp[] = [
  /is substantially equivalent to/i,
  /should be cleared/i,
  /benefit-risk (profile|ratio) is favorable/i,
  /significantly outweigh/i,
  /\boutweigh(s)? (its|the)\b/i,
  /meets the relevant general safety and performance requirements/i,
  /supports? conformity with/i,
  /do not raise new questions of safety or effectiveness/i,
  /performs at least as well/i,
  /are mitigat(ed|able)/i,
  /✅\s*Compliant/,
];

function freshPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_REGEX.source, PLACEHOLDER_REGEX.flags);
}

function assertNoFabricatedConclusion(content: string) {
  for (const pattern of FABRICATED_CONCLUSION_PATTERNS) {
    expect(content).not.toMatch(pattern);
  }
}

function assertHasCatchablePlaceholder(content: string) {
  expect(content.match(freshPlaceholderRegex())).not.toBeNull();
}

describe('cerv2 AI fallback — no fabricated regulatory conclusions (enhancedMockContent)', () => {
  const cases: Array<[string, string]> = [
    ['cerv2_510k', 'se'],
    ['cerv2_510k', 'concl'],
    ['cerv2_pma', 'risk'],
    ['cerv2_cer', 'benefitrisk'],
    ['cerv2_cer', 'gspr'],
  ];

  it.each(cases)('%s/%s asserts no conclusion and stays catchably incomplete', (docType, section) => {
    const content = enhancedMockContent[docType][section](ctx);
    assertNoFabricatedConclusion(content);
    assertHasCatchablePlaceholder(content);
    const result = validateSectionServer(docType, section, content, ctx);
    expect(result.severity).toBe('error');
  });

  it('510(k) SE conclusion leaves the determination to FDA as a placeholder', () => {
    const content = enhancedMockContent.cerv2_510k.concl(ctx);
    expect(content).toContain('[SUBSTANTIAL EQUIVALENCE DETERMINATION]');
    expect(content).toMatch(/made by FDA/i);
    // Real caller context is still surfaced.
    expect(content).toContain(ctx.deviceName);
    expect(content).toContain(ctx.predicateDevice);
  });

  it('CER GSPR table no longer pre-fills a compliant status for every requirement', () => {
    const content = enhancedMockContent.cerv2_cer.gspr(ctx);
    expect(content).not.toMatch(/✅\s*Compliant/);
    expect(content).toContain('[GSPR STATUS]');
  });
});

describe('cerv2 section templates — no fabricated regulatory conclusions', () => {
  const templateCases: Array<[string, string]> = [
    ['cerv2_510k', 'se'],
    ['cerv2_510k', 'se_discussion'],
    ['cerv2_510k', 'concl'],
    ['cerv2_510k', 'conclusion'],
    ['cerv2_pma', 'risk'],
    ['cerv2_pma', 'risk_analysis'],
    ['cerv2_cer', 'benefitrisk'],
    ['cerv2_cer', 'residual_risks'],
    ['cerv2_cer', 'gspr'],
    ['cerv2_cer', 'gspr_overview'],
    ['cerv2_cer', 'concl'],
    ['cerv2_cer', 'overall_conclusion'],
  ];

  it.each(templateCases)('%s/%s template asserts no conclusion', (docType, section) => {
    const content = sectionTemplates[docType][section];
    expect(content).toBeDefined();
    assertNoFabricatedConclusion(content);
    // The conclusion is deferred to a catchable placeholder.
    assertHasCatchablePlaceholder(content);
  });
});
