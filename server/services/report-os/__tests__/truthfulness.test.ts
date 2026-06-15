import { describe, it, expect } from 'vitest';
import {
  evaluateTruthfulness,
  DEFAULT_FINAL_CONFIDENCE_THRESHOLD,
  type RunTruthfulnessState,
  type TruthfulnessRules,
} from '../truthfulness';

function makeState(overrides: Partial<RunTruthfulnessState> = {}): RunTruthfulnessState {
  return {
    requestedStatus: 'final',
    confidence: 90,
    blockers: [],
    criticalBlockers: [],
    gapsSection: true,
    ...overrides,
  };
}

describe('evaluateTruthfulness', () => {
  it('passes a clean final report with no reasons', () => {
    const rules: TruthfulnessRules = {
      allowPartial: true,
      requireBlockers: true,
      requireConfidence: true,
      forbidFinalIfMissingCritical: true,
      requireExplicitGaps: true,
    };
    const result = evaluateTruthfulness(makeState(), rules);

    expect(result.allowedStatus).toBe('final');
    expect(result.downgradedFrom).toBeUndefined();
    expect(result.reasons).toEqual([]);
  });

  it('leaves a draft request untouched regardless of rules', () => {
    const rules: TruthfulnessRules = { allowPartial: true, requireConfidence: true };
    const result = evaluateTruthfulness(
      makeState({ requestedStatus: 'draft', confidence: 10, blockers: ['b'] }),
      rules,
    );

    expect(result.allowedStatus).toBe('draft');
    expect(result.downgradedFrom).toBeUndefined();
    expect(result.reasons).toEqual([]);
  });

  describe('forbidFinalIfMissingCritical', () => {
    it('downgrades final to partial when critical blockers exist and partial is allowed', () => {
      const rules: TruthfulnessRules = {
        allowPartial: true,
        forbidFinalIfMissingCritical: true,
      };
      const result = evaluateTruthfulness(
        makeState({ criticalBlockers: ['missing 2.7.1', 'missing CSR'] }),
        rules,
      );

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toMatch(/2 critical blocker/);
    });

    it('downgrades final to draft when critical blockers exist and partial is not allowed', () => {
      const rules: TruthfulnessRules = { forbidFinalIfMissingCritical: true };
      const result = evaluateTruthfulness(
        makeState({ criticalBlockers: ['missing CSR'] }),
        rules,
      );

      expect(result.allowedStatus).toBe('draft');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
      expect(result.reasons[0]).toMatch(/1 critical blocker/);
    });

    it('does not downgrade when there are no critical blockers', () => {
      const rules: TruthfulnessRules = {
        allowPartial: true,
        forbidFinalIfMissingCritical: true,
      };
      const result = evaluateTruthfulness(makeState({ criticalBlockers: [] }), rules);

      expect(result.allowedStatus).toBe('final');
      expect(result.reasons).toEqual([]);
    });
  });

  describe('requireConfidence', () => {
    it('downgrades final to partial when confidence is below the threshold', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireConfidence: true };
      const result = evaluateTruthfulness(
        makeState({ confidence: DEFAULT_FINAL_CONFIDENCE_THRESHOLD - 1 }),
        rules,
      );

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons[0]).toMatch(/confidence/i);
    });

    it('keeps final when confidence is exactly at the threshold', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireConfidence: true };
      const result = evaluateTruthfulness(
        makeState({ confidence: DEFAULT_FINAL_CONFIDENCE_THRESHOLD }),
        rules,
      );

      expect(result.allowedStatus).toBe('final');
      expect(result.reasons).toEqual([]);
    });

    it('downgrades to draft when confidence is low and partial is not allowed', () => {
      const rules: TruthfulnessRules = { requireConfidence: true };
      const result = evaluateTruthfulness(makeState({ confidence: 40 }), rules);

      expect(result.allowedStatus).toBe('draft');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('requireExplicitGaps', () => {
    it('downgrades final to partial when the gaps section is missing', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireExplicitGaps: true };
      const result = evaluateTruthfulness(makeState({ gapsSection: false }), rules);

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons[0]).toBe(
        'A final report of this type must include an explicit gaps section.',
      );
    });

    it('keeps final when the gaps section is present', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireExplicitGaps: true };
      const result = evaluateTruthfulness(makeState({ gapsSection: true }), rules);

      expect(result.allowedStatus).toBe('final');
      expect(result.reasons).toEqual([]);
    });
  });

  describe('requireBlockers', () => {
    it('downgrades final to partial when blockers are present', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireBlockers: true };
      const result = evaluateTruthfulness(
        makeState({ blockers: ['open finding A', 'open finding B'] }),
        rules,
      );

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons[0]).toMatch(/2 outstanding blocker/);
    });

    it('does not downgrade when there are no blockers', () => {
      const rules: TruthfulnessRules = { allowPartial: true, requireBlockers: true };
      const result = evaluateTruthfulness(makeState({ blockers: [] }), rules);

      expect(result.allowedStatus).toBe('final');
      expect(result.reasons).toEqual([]);
    });
  });

  describe('partial not allowed', () => {
    it('downgrades a requested partial to draft when allowPartial is not true', () => {
      const rules: TruthfulnessRules = { requireConfidence: true };
      const result = evaluateTruthfulness(makeState({ requestedStatus: 'partial' }), rules);

      expect(result.allowedStatus).toBe('draft');
      expect(result.downgradedFrom).toBe('partial');
      expect(result.reasons).toContain(
        'This report type does not allow a partial status.',
      );
    });

    it('keeps a requested partial when allowPartial is true', () => {
      const rules: TruthfulnessRules = { allowPartial: true };
      const result = evaluateTruthfulness(makeState({ requestedStatus: 'partial' }), rules);

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBeUndefined();
      expect(result.reasons).toEqual([]);
    });
  });

  describe('combinations', () => {
    it('aggregates multiple reasons and ends at the most restrictive status', () => {
      const rules: TruthfulnessRules = {
        requireConfidence: true,
        requireBlockers: true,
        requireExplicitGaps: true,
        forbidFinalIfMissingCritical: true,
        // allowPartial omitted -> partial not allowed -> draft
      };
      const result = evaluateTruthfulness(
        makeState({
          criticalBlockers: ['crit-1'],
          confidence: 30,
          blockers: ['b1'],
          gapsSection: false,
        }),
        rules,
      );

      // First rule (critical, no partial allowed) sends it straight to draft;
      // subsequent final-only rules no longer apply.
      expect(result.allowedStatus).toBe('draft');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
      expect(result.reasons[0]).toMatch(/critical blocker/);
    });

    it('applies confidence then gaps then blockers when partial is allowed', () => {
      const rules: TruthfulnessRules = {
        allowPartial: true,
        requireConfidence: true,
        requireExplicitGaps: true,
        requireBlockers: true,
      };
      const result = evaluateTruthfulness(
        makeState({ confidence: 50, gapsSection: false, blockers: ['b1'] }),
        rules,
      );

      // Confidence downgrades to partial first; later final-only rules no longer fire.
      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toMatch(/confidence/i);
    });

    it('ignores unknown extra keys in the rules object', () => {
      const rules: TruthfulnessRules = {
        allowPartial: true,
        requireConfidence: true,
        someFutureFlag: 'experimental',
      };
      const result = evaluateTruthfulness(makeState({ confidence: 60 }), rules);

      expect(result.allowedStatus).toBe('partial');
      expect(result.downgradedFrom).toBe('final');
    });
  });
});
