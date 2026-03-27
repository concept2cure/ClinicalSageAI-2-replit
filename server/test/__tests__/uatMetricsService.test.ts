import { describe, expect, it } from 'vitest';
import { computeHumanUatMetrics } from '../../services/evals/uatMetricsService';

describe('computeHumanUatMetrics', () => {
  it('computes aggregate metrics across sessions', () => {
    const metrics = computeHumanUatMetrics([
      {
        session_id: 'UAT-1',
        stage: 'beta',
        user_role: 'regulatory_writer',
        tasks_attempted: 4,
        tasks_passed: 3,
        citation_trust_score: 4.0,
        critical_defects_found: 0,
      },
      {
        session_id: 'UAT-2',
        stage: 'ga',
        user_role: 'qa_reviewer',
        tasks_attempted: 6,
        tasks_passed: 6,
        citation_trust_score: 4.5,
        critical_defects_found: 1,
      },
    ]);

    expect(metrics.sessionsTotal).toBe(2);
    expect(metrics.betaSessions).toBe(1);
    expect(metrics.gaSessions).toBe(1);
    expect(metrics.coreTaskSuccessRate).toBe(0.9);
    expect(metrics.citationTrustMean).toBe(4.25);
    expect(metrics.criticalDefectsOpen).toBe(1);
  });

  it('handles empty sessions safely', () => {
    const metrics = computeHumanUatMetrics([]);

    expect(metrics.sessionsTotal).toBe(0);
    expect(metrics.coreTaskSuccessRate).toBe(0);
    expect(metrics.citationTrustMean).toBe(0);
    expect(metrics.criticalDefectsOpen).toBe(0);
  });
});
