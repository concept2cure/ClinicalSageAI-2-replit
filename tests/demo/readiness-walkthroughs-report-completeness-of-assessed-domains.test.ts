/**
 * The four submission-readiness walkthroughs (scripts/demo/*-walkthrough.ts) print
 * the completeness of the domains an assessor computed, and name the domains
 * nothing assessed (2026-10-15).
 *
 * What the code used to do: each demo typed in 1 for domains no code in it
 * assesses (analytical and clinical performance, the post-market plan; in the PMA
 * and EU IVDR demos a valid GS1 check digit stood for UDI/GUDID at 1), fed the
 * capstone, and printed "Overall readiness: 100% → VERDICT: READY". The capstone
 * now reports a missing domain as not assessed and its figure as completeness of
 * the assessed domains. Nothing ran these scripts: scripts/ is in neither the
 * typecheck nor the test include.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

async function runDemo(name: string): Promise<string> {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  await import(`../../scripts/demo/${name}-walkthrough.ts`);
  return lines.join('\n');
}

const CASES: Array<{ demo: string; notAssessed: string }> = [
  { demo: 'pma', notAssessed: 'clinicalPerformance, udiGudid, postMarketPlan' },
  { demo: 'ivd-510k', notAssessed: 'analyticalPerformance, clinicalPerformance, postMarketPlan' },
  { demo: 'cdx', notAssessed: 'analyticalPerformance, clinicalPerformance, postMarketPlan' },
  { demo: 'eu-ivdr', notAssessed: 'analyticalPerformance, clinicalPerformance, udiGudid' },
];

describe('submission-readiness walkthroughs', () => {
  for (const { demo, notAssessed } of CASES) {
    it(`${demo}: completeness of the assessed domains, with the rest named not assessed`, async () => {
      const out = await runDemo(demo);
      expect(out, `${demo} printed a readiness figure`).toMatch(/Completeness of the assessed domains: \d+% \(\d of \d required domains\)/);
      expect(out).toContain(`Not assessed: ${notAssessed}`);
      expect(out).not.toMatch(/NaN|Overall|READY/);
    }, 60_000);
  }
});
