/**
 * Task blueprint — a statistical assessment becomes work the board carries.
 *
 * Pure: the fixtures are hand-built judgments, so each rule is exercised on
 * exactly the finding it exists for, and the set is stable across re-runs.
 */
import { describe, expect, it } from 'vitest';

import type { JudgmentResult, StatisticalInput } from '../../ana-biostats/types';
import type { DesignGap } from '../design-adapter';
import { dedupeBlueprints, tasksFromAssessment } from '../task-blueprint';

function judgment(over: Partial<JudgmentResult> = {}): JudgmentResult {
  return {
    overallVerdict: 'adequate',
    overallRisk: 'low',
    actionRecommendation: 'proceed',
    confidence: { level: 'high', score: 90, factors: [], limitations: [] },
    dimensions: [],
    fragility: { fragilityIndex: 20, category: 'robust', sensitiveParameters: [], narrative: 'Robust to plausible variation.' },
    endpointMethodFit: { fit: 'strong', suggestedMethod: 'MMRM', currentMethod: 'MMRM', rationale: 'fits', alternatives: [] },
    escalationReasons: [],
    roleExplanations: { technical: 'tech', clinical: 'clin', regulatory: 'reg', executive: 'exec' },
    ...over,
  };
}

function input(over: Partial<StatisticalInput> = {}): StatisticalInput {
  return {
    clientTrack: 'biotech_pharma',
    studyType: 'superiority',
    objectiveType: 'efficacy',
    endpointType: 'continuous',
    alpha: 0.05,
    powerTarget: 0.9,
    effectSize: 0.4,
    attritionRate: 0.15,
    allocationRatio: 1,
    ...over,
  };
}

const base = { designTitle: 'Study X', gaps: [] as DesignGap[], applicationType: null };

describe('tasksFromAssessment', () => {
  it('an adequate, robust, proceed judgment with no filing raises no tasks', () => {
    expect(tasksFromAssessment({ ...base, judgment: judgment(), input: input() })).toEqual([]);
  });

  it('an inadequate verdict raises a critical, critical-path revision task', () => {
    const out = tasksFromAssessment({ ...base, judgment: judgment({ overallVerdict: 'inadequate', overallRisk: 'high' }), input: input() });
    expect(out.map((t) => t.key)).toEqual(['verdict:inadequate']);
    expect(out[0]).toMatchObject({ priority: 'critical', criticalPath: true, regulatoryImpact: true, category: 'analysis' });
    expect(out[0].title).toContain('Study X');
  });

  it('escalate raises a review task naming the reasons', () => {
    const out = tasksFromAssessment({
      ...base,
      judgment: judgment({ actionRecommendation: 'escalate', escalationReasons: ['power below 70%'] }),
      input: input(),
    });
    const esc = out.find((t) => t.key === 'action:escalate');
    expect(esc).toMatchObject({ priority: 'critical', taskType: 'review' });
    expect(esc!.description).toContain('power below 70%');
  });

  it('fragility and a weak method fit each raise their own task', () => {
    const out = tasksFromAssessment({
      ...base,
      judgment: judgment({
        fragility: { fragilityIndex: 80, category: 'very_fragile', sensitiveParameters: [{ parameter: 'effect_size', currentValue: 0.4, breakpointValue: 0.35, percentMargin: 12 }], narrative: 'n' },
        endpointMethodFit: { fit: 'mismatch', suggestedMethod: 'Cox PH', currentMethod: 't-test', rationale: 'time-to-event endpoint', alternatives: [] },
      }),
      input: input(),
    });
    const keys = out.map((t) => t.key);
    expect(keys).toContain('fragility:sensitivity');
    expect(keys).toContain('method:fit');
    expect(out.find((t) => t.key === 'fragility:sensitivity')!.title).toContain('effect_size');
  });

  it('a blocking gap becomes a design-completion task even when nothing could be judged', () => {
    const gaps: DesignGap[] = [
      { field: 'eventRate', message: 'No event rate.', severity: 'blocking', designPath: 'statisticalPlan.powerAssumptions.eventRate' },
      { field: 'alpha', message: 'Alpha assumed 0.05.', severity: 'defaulted', designPath: 'statisticalPlan.alpha' },
    ];
    const out = tasksFromAssessment({ ...base, gaps, judgment: null, input: null });
    expect(out.map((t) => t.key)).toEqual(['design-gap:eventRate', 'design-gap:confirm-defaults']);
    expect(out[0].description).toContain('statisticalPlan.powerAssumptions.eventRate');
    expect(out[0].criticalPath).toBe(true);
  });

  it('a non-inferiority frame and planned interims raise their obligations', () => {
    const out = tasksFromAssessment({
      ...base,
      judgment: judgment(),
      input: input({ studyType: 'non_inferiority', nonInferiorityMargin: -0.3, interimAnalyses: 2 }),
    });
    const keys = out.map((t) => t.key);
    expect(keys).toContain('frame:ni-margin');
    expect(keys).toContain('interim:dmc');
    expect(out.find((t) => t.key === 'interim:dmc')!.deliverable).toBe('dsmb_charter');
  });

  it('the filing checklist proposes only required/expected deliverables not already persisted', () => {
    const out = tasksFromAssessment({
      ...base,
      judgment: judgment(),
      input: input(),
      applicationType: 'nda',
      existingDeliverables: ['full_statistical_analysis_plan'],
    });
    const deliverables = out.filter((t) => t.key.startsWith('deliverable:'));
    expect(deliverables.length).toBeGreaterThan(0);
    expect(deliverables.map((t) => t.deliverable)).not.toContain('full_statistical_analysis_plan');
    expect(deliverables.map((t) => t.deliverable)).not.toContain('statistical_risk_memo'); // never filed
    expect(deliverables.map((t) => t.deliverable)).toContain('submission_statistical_note'); // 2.7.3, required for an NDA
    for (const t of deliverables) expect(t.title).toContain('NDA');
  });

  it('is deterministic and de-duplicated across re-runs', () => {
    const ctx = { ...base, judgment: judgment({ overallVerdict: 'inadequate' as const }), input: input({ interimAnalyses: 1 }), applicationType: 'ind' as const };
    const a = tasksFromAssessment(ctx);
    const b = tasksFromAssessment(ctx);
    expect(a).toEqual(b);
    expect(dedupeBlueprints([...a, ...b])).toEqual(a);
  });
});
