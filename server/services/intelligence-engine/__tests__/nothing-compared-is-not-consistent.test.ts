/**
 * The intelligence engine does not score what it did not compare
 * (2026-10-15, finding 8).
 *
 * What the code used to do, executed on a two-sentence cover note:
 *  - consistencyScore was `100 − penalty`, so zero assertions, or one section,
 *    scored 100/100;
 *  - the defensibility consistency dimension then took 25/25 and added the
 *    positive driver "Document sections are highly consistent";
 *  - the Module-6 "evaluation gate" ran a regex over the engine's own
 *    formatted report and certified it passed, qualityScore 100;
 *  - the claim/evidence report said overallRisk 'low' when no claim was
 *    analysed;
 *  - buildConstrainedPrompt wrote "Consistency score: 100/100" into the model's
 *    prompt.
 */
import { describe, it, expect } from 'vitest';
import { analyzeConsistency } from '../consistency-engine';
import { analyzeDocument } from '../claim-evidence-engine';
import { computeDefensibility } from '../defensibility-engine';
import { classifyRisks } from '../risk-classification-engine';
import { runIntelligencePipeline, buildConstrainedPrompt, emitRIMSignals } from '../index';

const COVER_NOTE =
  'Please find enclosed the amended protocol for your records.\n\n' +
  'We look forward to your feedback on the revised dosing schedule.';

describe('cross-section consistency', () => {
  it('has no score when there is one section', () => {
    const r = analyzeConsistency([
      { id: 's1', name: 'Results', content: 'The primary endpoint showed median PFS of 14.2 months with HR=0.48.' },
    ]);
    expect(r.consistencyScore).toBeNull();
    expect(r.comparisons).toBe(0);
  });

  it('has no score when the sections make no comparable statements', () => {
    const r = analyzeConsistency([
      { id: 's1', name: 'Cover', content: 'Please find enclosed the amended protocol.' },
      { id: 's2', name: 'Closing', content: 'We look forward to your feedback.' },
    ]);
    expect(r.consistencyScore).toBeNull();
    expect(r.comparisons).toBe(0);
  });

  it('scores sections whose statements were compared and agree', () => {
    const r = analyzeConsistency([
      { id: 's1', name: 'Summary', content: 'The primary endpoint showed median PFS of 14.2 months (HR=0.48).' },
      { id: 's2', name: 'Results', content: 'The primary endpoint showed median PFS of 14.2 months with HR=0.48.' },
    ]);
    expect(r.comparisons).toBeGreaterThan(0);
    expect(r.consistencyScore).toBe(100);
  });
});

describe('the pipeline on a two-sentence cover note', () => {
  const analysis = runIntelligencePipeline(COVER_NOTE);

  it('does not call the note consistent, nor give it 25/25 for consistency', () => {
    expect(analysis.consistency.consistencyScore).toBeNull();
    expect(analysis.defensibility.breakdown.consistency).toBeNull();
    expect(analysis.defensibility.drivers.map(d => d.detail)).not.toContain('Document sections are highly consistent');
    expect(analysis.defensibility.partial).toBe(true);
    expect(analysis.defensibility.notAssessed).toContain('consistency');
  });

  it('does not certify its own report', () => {
    expect(analysis).not.toHaveProperty('evaluation');
  });

  it('does not write a consistency score into the model prompt', () => {
    const prompt = buildConstrainedPrompt(analysis, 'explain_risk');
    expect(prompt).not.toContain('Consistency score: 100/100');
    expect(prompt).not.toMatch(/Consistency: \d+\/25/);
    expect(prompt).toMatch(/Consistency score: not assessed/);
  });

  it('renormalises the defensibility score over the dimensions it measured', () => {
    const { breakdown, score } = analysis.defensibility;
    const measured = [breakdown.evidencePresence, breakdown.claimPrecision, breakdown.completeness];
    expect(measured.every(v => typeof v === 'number')).toBe(true);
    const sum = (measured as number[]).reduce((s, v) => s + v, 0);
    expect(score).toBe(Math.round((sum / 75) * 100));
  });
});

describe('claims', () => {
  it('a text with no claim analysed has no claim risk, and no claim-based defensibility', () => {
    const ce = analyzeDocument('Too short.');
    expect(ce.alignments).toHaveLength(0);
    expect(ce.overallRisk).toBe('not_assessed');

    const cons = analyzeConsistency([{ id: 'doc', name: 'Doc', content: 'Too short.' }]);
    const def = computeDefensibility(ce, cons, 'Too short.');
    expect(def.breakdown.evidencePresence).toBeNull();
    expect(def.breakdown.claimPrecision).toBeNull();
    expect(def.score).toBeNull();
    expect(def.riskLevel).toBe('not_assessed');

    // Nothing downstream reads an unassessed score as a low one.
    const risks = classifyRisks(ce, cons, def, 'Too short.');
    expect(risks.classifications.map(c => c.finding).join(' ')).not.toMatch(/defensibility score|consistency score/i);
    const signals = emitRIMSignals({ ...runIntelligencePipeline('Too short.') });
    expect(signals.map(s => s.type)).not.toContain('defensibility_drop');
  });
});
