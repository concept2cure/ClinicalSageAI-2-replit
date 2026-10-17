/**
 * The pre-mortems order findings without the pattern seed value (2026-10-15).
 *
 * What the code used to do: rankFindings (run_submission_premortem) and
 * buildFixList (assemble_crl_premortem_artifact) broke severity ties on
 * matchConfidence, which scanText filled with the pattern's hand-set seed
 * value (80-95, uncited, uncalibrated). Two high findings — "superior to"
 * (WL-002, seed 90) and "overall population" (RT-002, seed 85) — were ordered
 * by that constant, and the tools printed it as each finding's matchConfidence.
 * Equal severities now order by patternId, and every finding says its match
 * confidence was not computed.
 */
import { describe, expect, it } from 'vitest';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { rankFindings, type PremortemFinding } from '../submission-premortem-core';
import { bindRisksToGrounding, buildFixList } from '../crl-premortem-report';

const TEXT = 'Efficacy in the overall population was superior to placebo at week 12.';

const finding = (over: Partial<PremortemFinding>): PremortemFinding => ({
  patternId: 'P',
  title: 'pattern',
  category: 'reviewer_trigger',
  severity: 'high',
  matchedText: '…',
  matchConfidence: null,
  matchConfidenceBasis: 'not_computed',
  reviewerQuestion: 'Why?',
  regulatoryBasis: 'ICH E9',
  remediation: 'Fix it.',
  ...over,
});

// A numeric matchConfidence is what scanText used to supply (the seed values).
const SEEDED = [
  finding({ patternId: 'WL-002', title: 'Unsupported superiority claims', matchConfidence: 90 }),
  finding({ patternId: 'RT-002', title: 'Missing subgroup analysis', matchConfidence: 85 }),
  finding({ patternId: 'DEF-001', title: 'Missing primary endpoint justification', severity: 'critical' }),
];

async function run(tool: string, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler(tool)!(input, {}));
}

describe('equal-severity findings', () => {
  it('rankFindings orders them by patternId, never by a match confidence', () => {
    expect(rankFindings(SEEDED).map(f => f.patternId)).toEqual(['DEF-001', 'RT-002', 'WL-002']);
  });

  it('buildFixList orders them the same way', () => {
    const fixes = buildFixList(SEEDED, bindRisksToGrounding(SEEDED, []));
    expect(fixes.map(f => f.addressesRisk)).toEqual([
      'Missing primary endpoint justification',
      'Missing subgroup analysis',
      'Unsupported superiority claims',
    ]);
  });
});

describe('the tools over real pattern hits', () => {
  it('scan_regulatory_deficiencies says each match confidence was not computed', async () => {
    const res = await run('scan_regulatory_deficiencies', { text: TEXT });
    expect(res.findings.map((f: Record<string, unknown>) => [f.patternId, f.matchConfidence, f.matchConfidenceBasis])).toEqual([
      ['RT-002', null, 'not_computed'],
      ['WL-002', null, 'not_computed'],
    ]);
  });

  it('run_submission_premortem ranks by severity then patternId and prints no confidence', async () => {
    const res = await run('run_submission_premortem', { text: TEXT });
    expect(res.findings.map((f: Record<string, unknown>) => [f.patternId, f.matchConfidence, f.matchConfidenceBasis])).toEqual([
      ['RT-002', null, 'not_computed'],
      ['WL-002', null, 'not_computed'],
    ]);
  });

  it('assemble_crl_premortem_artifact lists risks and fixes in the same order', async () => {
    const res = await run('assemble_crl_premortem_artifact', { text: TEXT });
    const order = ['Missing subgroup analysis', 'Unsupported superiority claims'];
    expect(res.artifact.topRisks.map((r: Record<string, unknown>) => r.title)).toEqual(order);
    expect(res.artifact.fixList.map((f: Record<string, unknown>) => f.addressesRisk)).toEqual(order);
  });
});
