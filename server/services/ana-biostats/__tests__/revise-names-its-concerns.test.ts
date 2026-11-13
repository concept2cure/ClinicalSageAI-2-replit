/**
 * A "revise" recommendation names what it rests on (T2-F10).
 *
 * The Design Assumption Note ended:
 *
 *     Revision recommended before proceeding. Key concerns:
 *
 * and then nothing. `deriveAction` returns "revise" when the overall verdict is
 * marginal OR the overall risk is high, and the risk is high whenever the design
 * is fragile. But the list under "Key concerns:" printed `escalationReasons`,
 * which collects only an INADEQUATE dimension, a VERY fragile design, or very
 * low confidence — none of which "revise" requires. So the commonest "revise"
 * (an adequate verdict on a fragile design) told the reader to revise and gave
 * no reason. Found by the 2026-11-10 sales rehearsal on a seeded study.
 *
 * The first case is the engine's own output for the worked survival design at
 * 80% power with no missing-data method stated — nothing hand-built.
 */
import { describe, expect, it } from 'vitest';
import { computationEngine } from '../computation-engine';
import { ADEQUATE_MEAN_SCORE, judgmentEngine } from '../judgment-engine';
import { domainAdapter } from '../domain-adapter';
import { documentGenerator } from '../document-generator';
import type { JudgmentResult, StatisticalInput } from '../types';

const FRAGILE: StatisticalInput = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy',
  endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.8, effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15,
  allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, interimAnalyses: 2, comparatorType: 'placebo',
  estimandStrategy: 'treatment_policy', indication: 'Oncology', phase: 'Phase III',
};

const note = (input: StatisticalInput, override?: (j: JudgmentResult) => JudgmentResult) => {
  const computation = computationEngine.compute(input);
  const judged = judgmentEngine.judge(input, computation);
  const judgment = override ? override(judged) : judged;
  const domain = domainAdapter.adapt(input, computation, judgment);
  const content = documentGenerator.generate('design_assumption_note', input, computation, judgment, domain, undefined, {
    projectId: 1, organizationId: 1, userId: 1,
  }).content;
  const recommendations = content.slice(content.indexOf('## Recommendations'));
  const bullets = recommendations.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  return { judgment, recommendations, bullets };
};

describe('the engine’s own "revise" on a fragile design', () => {
  it('is a real case: adequate verdict, high risk, revise, and no escalation reason', () => {
    const { judgment } = note(FRAGILE);
    expect(judgment.actionRecommendation).toBe('revise');
    expect(judgment.escalationReasons).toEqual([]);
    expect(judgment.fragility.category).toBe('fragile');
  });

  it('lists the fragility and the dimension judged short of adequate — not an empty list', () => {
    const { judgment, recommendations, bullets } = note(FRAGILE);
    expect(recommendations).toContain('Revision recommended before proceeding. Key concerns:');
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets).toContain(`Design fragility: ${judgment.fragility.narrative}`);
    for (const d of judgment.dimensions.filter((x) => x.verdict !== 'adequate')) {
      expect(bullets).toContain(`${d.name}: ${d.flags[0] || d.rationale}`);
    }
  });
});

describe('every way the engine reaches "revise" has a reason printed', () => {
  const revise = (j: JudgmentResult, over: Partial<JudgmentResult>): JudgmentResult =>
    ({ ...j, actionRecommendation: 'revise', escalationReasons: [], ...over });
  const robust = { fragilityIndex: 10, category: 'robust' as const, sensitiveParameters: [], narrative: 'Robust.' };

  it('a marginal dimension is named with its first flag', () => {
    const { bullets } = note(FRAGILE, (j) => revise(j, {
      fragility: robust,
      dimensions: [
        { name: 'Power Adequacy', verdict: 'adequate', score: 90, rationale: 'r', flags: [] },
        { name: 'Attrition Sensitivity', verdict: 'marginal', score: 60, rationale: 'the rationale', flags: ['Dropout assumption is optimistic'] },
      ],
    }));
    expect(bullets).toEqual(['Attrition Sensitivity: Dropout assumption is optimistic']);
  });

  it('a dimension with no flag is named with its rationale; one lacking information is named too', () => {
    const { bullets } = note(FRAGILE, (j) => revise(j, {
      fragility: robust,
      dimensions: [
        { name: 'Estimand Clarity', verdict: 'insufficient_information', score: 50, rationale: 'No estimand strategy is stated', flags: [] },
      ],
    }));
    expect(bullets).toEqual(['Estimand Clarity: No estimand strategy is stated']);
  });

  it('marginal on the average alone: says so, with the figure and the lowest dimensions', () => {
    const { recommendations, bullets } = note(FRAGILE, (j) => revise(j, {
      overallVerdict: 'marginal',
      fragility: robust,
      dimensions: [
        { name: 'Power Adequacy', verdict: 'adequate', score: 72, rationale: 'r', flags: ['Power at the minimum'] },
        { name: 'Assumption Quality', verdict: 'adequate', score: 78, rationale: 'two defaults used', flags: [] },
        { name: 'Design Appropriateness', verdict: 'adequate', score: 85, rationale: 'r', flags: [] },
      ],
    }));
    expect(recommendations).toContain(
      `No single dimension is judged short of adequate; their scores average 78/100, below the ${ADEQUATE_MEAN_SCORE} the engine takes as adequate. The lowest:`,
    );
    expect(bullets).toEqual(['Power Adequacy (72/100): Power at the minimum', 'Assumption Quality (78/100): two defaults used']);
  });

  it('an escalation reason is not repeated by the dimension it came from', () => {
    const { bullets } = note(FRAGILE, (j) => revise(j, {
      fragility: robust,
      escalationReasons: ['Sample Size Adequacy: Power below 70%'],
      dimensions: [{ name: 'Sample Size Adequacy', verdict: 'inadequate', score: 30, rationale: 'r', flags: ['Power below 70%'] }],
    }));
    expect(bullets).toEqual(['Sample Size Adequacy: Power below 70%']);
  });

  it('with nothing recorded at all, it says that and prints no empty list', () => {
    const { recommendations, bullets } = note(FRAGILE, (j) => revise(j, {
      overallVerdict: 'adequate',
      fragility: robust,
      dimensions: [{ name: 'Power Adequacy', verdict: 'adequate', score: 95, rationale: 'r', flags: [] }],
    }));
    expect(bullets).toEqual([]);
    expect(recommendations).not.toContain('Key concerns:');
    // It points at nothing the note does not print: the two figures the recommendation was derived from.
    expect(recommendations).toMatch(/The engine recorded no specific concern: its overall verdict is adequate and its overall risk is \w+\./);
    expect(recommendations).not.toMatch(/above/);
  });
});

describe('the other recommendations are unchanged', () => {
  it('"proceed" still reads as it did', () => {
    const { recommendations } = note(FRAGILE, (j) => ({ ...j, actionRecommendation: 'proceed' }));
    expect(recommendations).toContain('Assumptions are adequate for proceeding. Monitor key parameters during conduct.');
  });
});

describe('the fragility sentence names parameters only when the engine has some', () => {
  /* Found walking the page on 2026-11-12: the ROC / AUC example at 90% power reads "fragile", its
     sensitivity could not be recomputed, so no parameter is named — and the sentence said
     "Small changes in assumptions (especially ) could undermine study conclusions." */
  const ROC: StatisticalInput = {
    clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy',
    endpointType: 'auc_roc', alpha: 0.05, powerTarget: 0.9, effectSize: 0, aucTarget: 0.85, aucNull: 0.5, attritionRate: 0.1,
    allocationRatio: 1, numberOfGroups: 2,
  };

  it('a fragile design with no computed sensitivity point has no empty parenthesis', () => {
    const fragility = judgmentEngine.judge(ROC, computationEngine.compute(ROC)).fragility;
    expect(fragility.category).toBe('fragile');
    expect(fragility.sensitiveParameters).toEqual([]);
    expect(fragility.narrative).not.toContain('(especially )');
    expect(fragility.narrative).not.toMatch(/\(\s*\)| {2}/);
    expect(fragility.narrative).toContain('The design is fragile. Small changes in assumptions could undermine study conclusions.');
  });

  it('a fragile design with sensitivity points still names them', () => {
    const fragility = judgmentEngine.judge(FRAGILE, computationEngine.compute(FRAGILE)).fragility;
    expect(fragility.category).toBe('fragile');
    expect(fragility.sensitiveParameters.length).toBeGreaterThan(0);
    expect(fragility.narrative).toMatch(/Small changes in assumptions \(especially [a-z][a-z ,]+\) could undermine/);
  });

  it('no category leaves a doubled space where a clause was dropped', () => {
    for (const powerTarget of [0.8, 0.85, 0.9]) {
      for (const input of [{ ...ROC, powerTarget }, { ...FRAGILE, powerTarget }]) {
        expect(judgmentEngine.judge(input, computationEngine.compute(input)).fragility.narrative).not.toMatch(/ {2}/);
      }
    }
  });
});
