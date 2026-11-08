/**
 * Unit tests for the pre-submission gate verdict function.
 *
 * The verdict logic is the regulatory gate that decides ready / conditional
 * / hold for a submission. Every branch must be covered because a wrong
 * verdict can cause a real submission to be transmitted (or held) on the
 * wrong basis.
 */

import { describe, it, expect } from 'vitest';
import { deriveVerdict, reviewCorrespondenceBlockers } from '../server/services/orchestration/pre-submission-gate-verdict';
import { runGovernedIssueParser } from '../server/services/regulatory-correspondence/issue-parser';

function confirmedIssue(id: string, status: 'confirmed' | 'edited', resolution = 'open') {
  const text = 'Missing CMC stability data.';
  const issue = runGovernedIssueParser(text, 'letter').issues.find(item => item.blocker)!;
  const extraction = issue.structuredExtraction!;
  extraction.feedbackCoding!.humanConfirmed = true;
  extraction.humanReview = { reviewedBy: 11, reviewedAt: '2026-11-06T12:00:00.000Z', sourceTextDigest: extraction.sourceTextDigest!, status };
  return { id, correspondence_id: 'letter', category: issue.category, blocker: true, source_excerpt: issue.sourceExcerpt,
    human_review_status: status, resolution_status: resolution, structured_extraction: extraction, parsed_text: text, direction: 'inbound' };
}

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

  describe('what a ready verdict says it rests on', () => {
    it('does not call CRL/RTF risk acceptable when nothing assessed it', () => {
      const r = deriveVerdict({ ...baseInput, crlRisk: 'not_assessed', rtfRisk: 'not_assessed' });
      expect(r.verdict).toBe('ready');
      expect(r.rationale).toEqual([
        'Readiness on track, no critical blockers, ICH compliance clean; not assessed: CRL/RTF risk',
      ]);
    });

    it('does not call ICH compliance clean when the check was not run', () => {
      const r = deriveVerdict({ ...baseInput, ichStatus: undefined });
      expect(r.rationale).toEqual([
        'Readiness on track, no critical blockers, CRL/RTF risk acceptable; not assessed: ICH compliance (no CMC project linked)',
      ]);
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

  describe('human-reviewed correspondence blockers', () => {
    it('holds on a confirmed unresolved blocker even with otherwise clean checks', () => {
      const correspondenceReview = reviewCorrespondenceBlockers([
        confirmedIssue('confirmed', 'confirmed'),
        confirmedIssue('edited', 'edited', 'in_progress'),
      ]);
      const r = deriveVerdict({ ...baseInput, correspondenceReview });
      expect(r.verdict).toBe('hold');
      expect(r.rationale).toContain('2 unresolved human-confirmed correspondence blocker(s)');
      expect(correspondenceReview.blockingIssueIds).toEqual(['confirmed', 'edited']);
    });

    it('requires human review of pending or unknown blocker classifications', () => {
      const correspondenceReview = reviewCorrespondenceBlockers([
        { id: 'pending', blocker: true, human_review_status: 'pending', resolution_status: 'open' },
        { id: 'unknown', blocker: true, human_review_status: 'unexpected', resolution_status: 'open' },
      ]);
      expect(deriveVerdict({ ...baseInput, correspondenceReview })).toMatchObject({
        verdict: 'conditional', rationale: ['2 potential correspondence blocker(s) await human review'],
      });
    });
    it('does not turn old confirmed flags or changed source text into current confirmed findings', () => {
      const old = { id: 'old', blocker: true, human_review_status: 'confirmed', resolution_status: 'open' };
      const stale = { ...confirmedIssue('stale', 'confirmed'), parsed_text: 'The letter changed.' };
      expect(reviewCorrespondenceBlockers([old, stale])).toMatchObject({ blockingIssueIds: [], pendingIssueIds: ['old', 'stale'] });
    });

    it('does not resurrect rejected, resolved, waived or nonblocking issues', () => {
      const correspondenceReview = reviewCorrespondenceBlockers([
        { id: 'rejected', blocker: true, human_review_status: 'rejected', resolution_status: 'open' },
        { id: 'resolved', blocker: true, human_review_status: 'confirmed', resolution_status: 'resolved' },
        { id: 'waived', blocker: true, human_review_status: 'confirmed', resolution_status: 'waived' },
        { id: 'comment', blocker: false, human_review_status: 'pending', resolution_status: 'open' },
      ]);
      expect(deriveVerdict({ ...baseInput, correspondenceReview }).verdict).toBe('ready');
      expect(correspondenceReview).toMatchObject({ checkedIssueCount: 4, blockingIssueIds: [], pendingIssueIds: [], subjectiveFit: 'not_assessed' });
    });

    it('holds when correspondence could not be checked rather than claiming a clean file', () => {
      expect(deriveVerdict({ ...baseInput, correspondenceReview: {
        status: 'unavailable', checkedIssueCount: null, blockingIssueIds: [], pendingIssueIds: [], subjectiveFit: 'not_assessed',
      } })).toMatchObject({ verdict: 'hold', rationale: ['Correspondence blockers could not be read — review is unverified'] });
    });
  });
});
