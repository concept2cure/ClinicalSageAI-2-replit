import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from '../../services/evals/gaReadinessService';

describe('evaluateReadiness', () => {
  it('passes for valid beta payload', () => {
    const result = evaluateReadiness({
      stage: 'beta',
      weights: {
        parsing_quality: 0.25,
        retrieval_citation: 0.25,
        policy_enforcement: 0.2,
        workflow_reliability: 0.15,
        observability_completeness: 0.1,
        pilot_safety: 0.05,
      },
      scores: {
        parsing_quality: 4.1,
        retrieval_citation: 4.0,
        policy_enforcement: 4.3,
        workflow_reliability: 3.8,
        observability_completeness: 3.9,
        pilot_safety: 3.8,
      },
      hard_fail_conditions: {
        governed_export_bypass: false,
      },
      human_testing: {
        beta_sessions_completed: 12,
      },
    });

    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails for invalid ga payload', () => {
    const result = evaluateReadiness({
      stage: 'ga',
      weights: {
        parsing_quality: 0.25,
        retrieval_citation: 0.25,
        policy_enforcement: 0.2,
        workflow_reliability: 0.15,
        observability_completeness: 0.1,
        pilot_safety: 0.05,
      },
      scores: {
        parsing_quality: 3.0,
        retrieval_citation: 3.0,
        policy_enforcement: 3.0,
        workflow_reliability: 3.0,
        observability_completeness: 3.0,
        pilot_safety: 3.0,
      },
      hard_fail_conditions: {
        governed_export_bypass: true,
      },
      human_testing: {
        ga_sessions_completed: 10,
        critical_defects_open: 1,
        core_task_success_rate: 0.8,
        citation_trust_mean: 3.5,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('Hard fail active'))).toBe(true);
    expect(result.reasons.some(r => r.includes('GA threshold'))).toBe(true);
  });
});
