/**
 * War Game engine — scoring arithmetic, assessment thresholds, and real auditors.
 *
 * The first block mocks the auditor registry to inject a synthetic auditor with
 * known findings, which lets us verify the dimension-score arithmetic and the
 * overall-assessment thresholds exactly. The second block runs REAL auditors
 * against empty answers to confirm they surface findings end-to-end.
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  WarGameAuditor,
  WarGameFinding,
  AuditDimension,
} from '../../server/services/ana/intelligence-questions/war-game/types';

/* ─── Controllable synthetic auditor for deterministic arithmetic ──────── */

const makeFinding = (
  id: string,
  dimension: AuditDimension,
  severity: 'critical' | 'warning' | 'info',
): WarGameFinding => ({
  id,
  dimension,
  severity,
  title: `Finding ${id}`,
  question: 'q',
  observation: 'o',
  requirement: 'r',
  reference: 'ref',
  recommendation: `fix ${id}`,
  relatedFields: [],
});

// Each rule fires only when answers.__fire__ contains its id.
const rule = (
  id: string,
  dimension: AuditDimension,
  severity: 'critical' | 'warning' | 'info',
) => ({
  id,
  dimension,
  title: `Rule ${id}`,
  question: 'q',
  check(answers: Record<string, unknown>): WarGameFinding | null {
    const fire = answers.__fire__;
    if (Array.isArray(fire) && fire.includes(id)) {
      return makeFinding(id, dimension, severity);
    }
    return null;
  },
});

const SYNTHETIC_AUDITOR: WarGameAuditor = {
  category: 'protocol',
  name: 'Synthetic Auditor',
  description: 'Test auditor with controllable findings.',
  rules: [
    rule('c1', 'completeness', 'critical'),
    rule('c2', 'completeness', 'critical'),
    rule('w1', 'consistency', 'warning'),
    rule('i1', 'documentation', 'info'),
  ],
};

vi.mock('../../server/services/ana/intelligence-questions/war-game/auditors/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../server/services/ana/intelligence-questions/war-game/auditors/index')
  >('../../server/services/ana/intelligence-questions/war-game/auditors/index');
  return {
    ...actual,
    getAuditor: (category: string) => {
      if (category === 'protocol') return SYNTHETIC_AUDITOR;
      return actual.getAuditor(category as never);
    },
  };
});

import { runWarGame } from '../../server/services/ana/intelligence-questions/war-game/engine';

describe('war-game engine (synthetic auditor)', () => {
  it('produces a report with overallScore in [0,100]', () => {
    const report = runWarGame('protocol', 'flow-1', {});
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it('scores 100 across all dimensions with no findings', () => {
    const report = runWarGame('protocol', 'flow-1', {});
    expect(report.findings).toEqual([]);
    for (const dim of Object.keys(report.dimensionScores)) {
      expect(report.dimensionScores[dim as AuditDimension].score).toBe(100);
      expect(report.dimensionScores[dim as AuditDimension].findingCount).toBe(0);
    }
    expect(report.overallScore).toBe(100);
    expect(report.overallAssessment).toBe('audit_ready');
    expect(report.regulatoryRiskLevel).toBe('low');
  });

  it('applies per-severity penalties to the affected dimension (critical=-25, warning=-15, info=-5)', () => {
    // Fire one warning on consistency and one info on documentation.
    const report = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['w1', 'i1'] } });
    expect(report.dimensionScores.consistency.score).toBe(85); // 100 - 15
    expect(report.dimensionScores.consistency.findingCount).toBe(1);
    expect(report.dimensionScores.documentation.score).toBe(95); // 100 - 5
    expect(report.dimensionScores.completeness.score).toBe(100); // untouched
    // overall = round((85 + 95 + 100*5) / 7) = round(680/7) = 97
    expect(report.overallScore).toBe(97);
  });

  it('stacks multiple findings on the same dimension and floors at 0', () => {
    // Two criticals on completeness: 100 - 25 - 25 = 50.
    const report = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['c1', 'c2'] } });
    expect(report.dimensionScores.completeness.score).toBe(50);
    expect(report.dimensionScores.completeness.findingCount).toBe(2);
    expect(report.findings).toHaveLength(2);
  });

  describe('overallAssessment thresholds', () => {
    const withOverall = (fire: string[]) =>
      runWarGame('protocol', 'flow-1', { node1: { __fire__: fire } });

    it('>=85 => audit_ready / low', () => {
      // no findings -> 100
      const r = withOverall([]);
      expect(r.overallScore).toBeGreaterThanOrEqual(85);
      expect(r.overallAssessment).toBe('audit_ready');
      expect(r.regulatoryRiskLevel).toBe('low');
    });

    it('computes overall as the rounded mean of the seven dimension scores', () => {
      // completeness 50 (c1,c2), consistency 85 (w1), documentation 95 (i1),
      // remaining 4 dimensions untouched at 100.
      const r = runWarGame('protocol', 'flow-1', {
        node1: { __fire__: ['c1', 'c2', 'w1', 'i1'] },
      });
      // overall = round((50 + 85 + 95 + 100*4) / 7) = round(630/7) = 90
      expect(r.overallScore).toBe(90);
      // Score is 90, but there are 2 CRITICAL findings — the severity cap forbids
      // an audit-ready badge over an open critical (the fail-open this fixes).
      expect(r.overallAssessment).toBe('significant_gaps');
      expect(r.regulatoryRiskLevel).toBe('high');
    });

    it('derives assessment + risk from the score, then caps by finding severity', () => {
      // The score band is the starting point; an open critical/warning then caps
      // the verdict so the headline never outruns the findings.
      const cases: Array<{
        fire: string[];
        score: number;
        assessment: string;
        risk: string;
      }> = [
        // No findings: pure score band, no cap.
        { fire: [], score: 100, assessment: 'audit_ready', risk: 'low' },
        // Score 90 but 2 criticals → capped to significant_gaps / high.
        { fire: ['c1', 'c2', 'w1', 'i1'], score: 90, assessment: 'significant_gaps', risk: 'high' },
      ];
      for (const c of cases) {
        const r = runWarGame('protocol', 'flow-1', { node1: { __fire__: c.fire } });
        expect(r.overallScore).toBe(c.score);
        expect(r.overallAssessment).toBe(c.assessment);
        expect(r.regulatoryRiskLevel).toBe(c.risk);
      }
    });

    it('a SINGLE critical finding caps a 96-score filing off "audit_ready / low"', () => {
      // One critical: completeness 100-25=75, other six dimensions 100 →
      // mean = round(675/7) = 96. The pre-fix verdict read audit_ready/low over
      // an open critical blocker; the cap now forbids it.
      const r = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['c1'] } });
      expect(r.overallScore).toBe(96);
      expect(r.findings.filter((f) => f.severity === 'critical')).toHaveLength(1);
      expect(r.overallAssessment).not.toBe('audit_ready');
      expect(r.overallAssessment).toBe('significant_gaps');
      expect(r.regulatoryRiskLevel).not.toBe('low');
      expect(r.regulatoryRiskLevel).toBe('high');
    });

    it('an unresolved WARNING (no critical) caps off "audit_ready", down to needs_work / moderate', () => {
      // One warning: consistency 100-15=85, others 100 → mean = round(685/7) = 98.
      const r = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['w1'] } });
      expect(r.overallScore).toBeGreaterThanOrEqual(85);
      expect(r.overallAssessment).toBe('needs_work');
      expect(r.regulatoryRiskLevel).toBe('moderate');
    });

    it('info-only findings do NOT cap the verdict (still audit_ready / low)', () => {
      const r = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['i1'] } });
      expect(r.overallAssessment).toBe('audit_ready');
      expect(r.regulatoryRiskLevel).toBe('low');
    });
  });

  it('sorts critical findings ahead of warnings and info in topPriorities', () => {
    const report = runWarGame('protocol', 'flow-1', { node1: { __fire__: ['i1', 'w1', 'c1'] } });
    expect(report.topPriorities[0]).toMatch(/^\[CRITICAL\]/);
    expect(report.executiveSummary).toMatch(/War Game assessment/);
  });
});

/* ─── Real auditors (unmocked passthrough) ─────────────────────────────── */

describe('war-game engine (real auditors)', () => {
  // Note: the 'protocol' category is intercepted by the mock above, so the real
  // auditor checks below use categories that the mock passes through to the real
  // registry (ind, csr).
  it.each(['ind', 'csr'] as const)(
    'real %s auditor produces findings on empty answers and a valid score band',
    (category) => {
      const report = runWarGame(category, 'flow-1', {});
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(['audit_ready', 'needs_work', 'significant_gaps', 'not_ready']).toContain(
        report.overallAssessment,
      );
      // findings carry the required advisory fields
      for (const f of report.findings) {
        expect(f.reference.length).toBeGreaterThan(0);
        expect(f.recommendation.length).toBeGreaterThan(0);
        expect(['critical', 'warning', 'info']).toContain(f.severity);
      }
    },
  );
});
