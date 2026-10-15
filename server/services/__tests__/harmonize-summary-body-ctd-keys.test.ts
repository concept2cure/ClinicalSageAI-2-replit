/**
 * HARMONIZE compares a Module 2 summary with the reports it summarises when the
 * sections are keyed by CTD code, and says so when the input holds no such pair.
 *
 * Before (to 2026-10-15): checkSummaryBody looked its pairs up under the keys
 * 'module-2.5', 'module-5', 'module-2.4', 'module-4', 'module-2.3', 'module-3',
 * 'module-2.7' … while every caller — authoring-actions harmonize-sections,
 * cross-section-consistency and section preflight, and the contradiction
 * engine — keys sections by the artifact's ctdSection ('2.5', 'm2.5',
 * '5.3.5.1'). No pair ever matched, so the Summary-vs-Body comparison never
 * ran, and every result still listed 'summary_body' in checkedDimensions.
 */
import { describe, expect, it } from 'vitest';
import { HarmonizeEngine, type HarmonizeResult } from '../harmonize-engine';

async function run(sections: Record<string, string>): Promise<HarmonizeResult> {
  return new HarmonizeEngine().check({ sections, submissionType: 'NDA' });
}

const summaryBody = (r: HarmonizeResult) => r.issues.filter((i) => i.type === 'summary_body');

const OVERVIEW_CLAIM = 'The pivotal trial demonstrates durable hepatoprotection across fibrosis stages.';
const UNRELATED_REPORT = 'Pharmacokinetic sampling occurred on days 1, 8 and 15 by LC-MS/MS.';

describe('HARMONIZE summary/body runs on CTD-coded sections', () => {
  it('a Clinical Overview claim the Module 5 report does not support is reported, by CTD code', async () => {
    const r = await run({ '2.5': OVERVIEW_CLAIM, '5.3.5.1': UNRELATED_REPORT });
    const hits = summaryBody(r);
    expect(hits, JSON.stringify(r.issues)).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sectionA: '2.5', sectionB: '5.3.5.1', severity: 'error' });
    expect(hits[0].description).toMatch(/hepatoprotection/);
    expect(r.checkedDimensions).toContain('summary_body');
  });

  it('the eCTD "m" prefix and the Module 2.3 / 2.4 pairs match too', async () => {
    const quality = await run({
      'm2.3': 'The control strategy confirms consistent impurity clearance below qualification thresholds.',
      'm3.2.S.4.1': 'Dissolution used apparatus 2 at 50 rpm.',
    });
    expect(summaryBody(quality)).toEqual([
      expect.objectContaining({ sectionA: 'm2.3', sectionB: 'm3.2.S.4.1' }),
    ]);

    const nonclinical = await run({
      '2.4': 'Repeat-dose toxicology establishes a generous margin for hepatic enzymes.',
      '4.2.3.2': 'Body weights were recorded weekly.',
    });
    expect(summaryBody(nonclinical)).toEqual([
      expect.objectContaining({ sectionA: '2.4', sectionB: '4.2.3.2' }),
    ]);
  });

  it('a claim one Module 5 report supports is not reported against another', async () => {
    const r = await run({
      '2.5': OVERVIEW_CLAIM,
      '5.3.5.1': 'Durable hepatoprotection was observed across all fibrosis stages.',
      '5.3.5.2': UNRELATED_REPORT,
    });
    expect(summaryBody(r)).toEqual([]);
    expect(r.checkedDimensions).toContain('summary_body');
  });

  it('with no summary and report pair the dimension is skipped and says why, not listed as checked', async () => {
    const r = await run({ '2.5': OVERVIEW_CLAIM, '2.7.4': 'Exposure is summarised by study.' });
    expect(r.checkedDimensions).not.toContain('summary_body');
    expect(r.skippedDimensions).toEqual([
      { dimension: 'summary_body', reason: expect.stringMatching(/2\.5, 2\.7\.4/) },
    ]);
    // The dimensions that did run are still reported as run.
    expect(r.checkedDimensions).toEqual(['terminology', 'numerics', 'references', 'cross_section']);
  });
});
