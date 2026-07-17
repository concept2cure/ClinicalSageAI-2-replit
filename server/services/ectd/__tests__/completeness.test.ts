import { describe, it, expect } from 'vitest';
import {
  computeEctdCompleteness,
  assertEctdSubmissionComplete,
  EctdCompletenessError,
} from '../completeness';

describe('eCTD submission-completeness gate', () => {
  describe('computeEctdCompleteness', () => {
    it('reports a fully authored package as complete', () => {
      const r = computeEctdCompleteness(12, 0, []);
      expect(r.complete).toBe(true);
      expect(r.completeLeaves).toBe(12);
      expect(r.placeholderLeaves).toBe(0);
      expect(r.completenessPct).toBe(100);
    });

    it('reports a package with placeholder leaves as incomplete with a percentage', () => {
      const incomplete = [{ granuleId: '3.2.P.5', granuleName: 'Control of Drug Product', status: 'draft' }];
      const r = computeEctdCompleteness(10, 3, incomplete);
      expect(r.complete).toBe(false);
      expect(r.completeLeaves).toBe(7);
      expect(r.placeholderLeaves).toBe(3);
      expect(r.completenessPct).toBe(70);
      expect(r.incompleteSections).toBe(incomplete);
    });

    it('treats an empty dossier (no leaves) as incomplete, not vacuously complete', () => {
      const r = computeEctdCompleteness(0, 0, []);
      expect(r.complete).toBe(false);
      expect(r.completenessPct).toBe(0);
      expect(r.totalLeaves).toBe(0);
    });

    it('clamps a placeholder count that exceeds the leaf count', () => {
      const r = computeEctdCompleteness(5, 99, []);
      expect(r.placeholderLeaves).toBe(5);
      expect(r.completeLeaves).toBe(0);
      expect(r.completenessPct).toBe(0);
      expect(r.complete).toBe(false);
    });
  });

  describe('assertEctdSubmissionComplete', () => {
    it('passes silently for a complete package', () => {
      expect(() => assertEctdSubmissionComplete(computeEctdCompleteness(4, 0, []))).not.toThrow();
    });

    it('throws EctdCompletenessError carrying the report when placeholders remain', () => {
      const report = computeEctdCompleteness(8, 2, [
        { granuleId: '2.5', granuleName: 'Clinical Overview', status: 'draft' },
      ]);
      let caught: unknown;
      try {
        assertEctdSubmissionComplete(report);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(EctdCompletenessError);
      const err = caught as EctdCompletenessError;
      expect(err.code).toBe('ECTD_INCOMPLETE');
      expect(err.completeness).toBe(report);
      expect(err.message).toMatch(/2 of 8 leaf document\(s\) are unfinished placeholders \(75% complete\)/);
    });

    it('throws with an "nothing to file" message for an empty dossier', () => {
      let caught: unknown;
      try {
        assertEctdSubmissionComplete(computeEctdCompleteness(0, 0, []));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(EctdCompletenessError);
      expect((caught as Error).message).toMatch(/no content leaves/i);
    });
  });
});
