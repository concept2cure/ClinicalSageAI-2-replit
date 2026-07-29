/**
 * Unit tests for the pre-submission gate verdict function.
 *
 * The verdict logic is the regulatory gate that decides ready / conditional
 * / hold for a submission. Every branch must be covered because a wrong
 * verdict can cause a real submission to be transmitted (or held) on the
 * wrong basis.
 */

import { describe, it, expect } from 'vitest';
import { deriveVerdict } from '../server/services/orchestration/pre-submission-gate-verdict';

describe('pre-submission gate verdict', () => {
  const baseInput = {
    readinessStatus: 'on_track',
    readinessScore: 85,
    readinessBlockers: [] as Array<{ severity: string }>,
    crlRisk: 'low',
    rtfRisk: 'low',
    cmcOpenCritical: 0,
    ichStatus: 'compliant' as const,
    ichFailCount: 0,
  };

  describe('verdict = ready', () => {
    it('returns ready when every signal is clean', () => {
      const r = deriveVerdict(baseInput);
      expect(r.verdict).toBe('ready');
      expect(r.rationale).toContain('Readiness on track, no critical blockers, CRL/RTF risk acceptable, ICH compliance clean');
    });
  });

  describe('verdict = hold', () => {
    it('holds on a critical readiness blocker', () => {
      const r = deriveVerdict({
        ...baseInput,
        readinessBlockers: [{ severity: 'critical' }],
      });
      expect(r.verdict).toBe('hold');
      expect(r.rationale).toContain('Readiness has critical blockers');
    });

    it('holds on any open critical CMC contradiction', () => {
      const r = deriveVerdict({ ...baseInput, cmcOpenCritical: 1 });
      expect(r.verdict).toBe('hold');
      expect(r.rationale.some(s => s.includes('open critical CMC'))).toBe(true);
    });

    it('holds on critical CRL risk', () => {
      const r = deriveVerdict({ ...baseInput, crlRisk: 'critical' });
      expect(r.verdict).toBe('hold');
      expect(r.rationale).toContain('CRL risk is critical');
    });

    it('holds on critical RTF risk', () => {
      const r = deriveVerdict({ ...baseInput, rtfRisk: 'critical' });
      expect(r.verdict).toBe('hold');
      expect(r.rationale).toContain('RTF risk is critical');
    });

    it('holds when ICH compliance is non_compliant', () => {
      const r = deriveVerdict({
        ...baseInput,
        ichStatus: 'non_compliant',
        ichFailCount: 3,
      });
      expect(r.verdict).toBe('hold');
      expect(r.rationale.some(s => s.includes('ICH compliance non-compliant'))).toBe(true);
      expect(r.rationale.some(s => s.includes('3 failing'))).toBe(true);
    });

    it('accumulates multiple hold reasons', () => {
      const r = deriveVerdict({
        ...baseInput,
        cmcOpenCritical: 2,
        crlRisk: 'critical',
        ichStatus: 'non_compliant',
        ichFailCount: 1,
      });
      expect(r.verdict).toBe('hold');
      expect(r.rationale.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('verdict = conditional', () => {
    it('downgrades to conditional on high CRL risk', () => {
      const r = deriveVerdict({ ...baseInput, crlRisk: 'high' });
      expect(r.verdict).toBe('conditional');
      expect(r.rationale).toContain('CRL risk is high');
    });

    it('downgrades to conditional on high RTF risk', () => {
      const r = deriveVerdict({ ...baseInput, rtfRisk: 'high' });
      expect(r.verdict).toBe('conditional');
      expect(r.rationale).toContain('RTF risk is high');
    });

    it('downgrades to conditional when readiness score < 70', () => {
      const r = deriveVerdict({ ...baseInput, readinessScore: 60 });
      expect(r.verdict).toBe('conditional');
      expect(r.rationale.some(s => s.includes('Readiness score is 60'))).toBe(true);
    });

    it('downgrades to conditional when readiness status is needs_attention', () => {
      const r = deriveVerdict({
        ...baseInput,
        readinessStatus: 'needs_attention',
        readinessScore: 75,
      });
      expect(r.verdict).toBe('conditional');
    });

    it('downgrades to conditional when ICH compliance has warnings', () => {
      const r = deriveVerdict({ ...baseInput, ichStatus: 'warnings' });
      expect(r.verdict).toBe('conditional');
      expect(r.rationale).toContain('ICH compliance has warnings');
    });
  });

  describe('verdict ordering — hold always beats conditional', () => {
    it('still holds even when many conditional signals are also present', () => {
      const r = deriveVerdict({
        ...baseInput,
        readinessBlockers: [{ severity: 'critical' }],
        crlRisk: 'high',         // would normally be conditional
        rtfRisk: 'high',         // would normally be conditional
        readinessScore: 50,      // would normally be conditional
        ichStatus: 'warnings',   // would normally be conditional
      });
      expect(r.verdict).toBe('hold');
      // Conditional-tier reasons must not appear when hold is in effect
      expect(r.rationale).not.toContain('CRL risk is high');
      expect(r.rationale).not.toContain('ICH compliance has warnings');
    });
  });

  describe('ichStatus optional', () => {
    it('treats missing ichStatus as no ICH gate signal', () => {
      const r = deriveVerdict({
        ...baseInput,
        ichStatus: undefined,
        ichFailCount: 0,
      });
      expect(r.verdict).toBe('ready');
    });
  });
});
