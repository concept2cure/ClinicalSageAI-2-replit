/**
 * The response package: what it is built FROM, and what its readiness claims.
 *
 * Two defects measured on 2026-09-20, both invisible behind an `as any`:
 *
 * 1. `POST /response-packages` passed `SELECT * FROM c2c_correspondence_issues`
 *    into the compiler unmapped. The row is snake_case, the contract camelCase,
 *    so `mappedCtdSections` and `mappedArtifactIds` read `undefined` and every
 *    package ever compiled carried an EMPTY issue matrix — while the data to
 *    fill it sat in the row being passed.
 *
 * 2. `evidenceChecklist` set `status: 'missing' as const`, so `unresolvedGaps`
 *    was always the whole list and `readinessState` was always `evidence_gap`.
 *    Three of the five declared states were unreachable, and the one case that
 *    escaped — no issues at all — reported `review_ready`: nothing assessed,
 *    reported ready for review.
 */
import { describe, it, expect } from 'vitest';
import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

import { compileGovernedResponseAssembly } from '../response-package-compiler';
import {
  issueRowToCorrespondenceIssue,
  issueRowsToCorrespondenceIssues,
  type CorrespondenceIssueRow,
} from '../issue-row-mapper';

/** Exactly what `SELECT *` returns for one issue. */
function row(over: Partial<CorrespondenceIssueRow> = {}): CorrespondenceIssueRow {
  return {
    id: 'i1',
    correspondence_id: 'c1',
    category: 'nonclinical_issue',
    subcategory: 'biocompatibility',
    severity: 'high',
    blocker: true,
    response_required: true,
    source_excerpt: 'Your biocompatibility evaluation…',
    confidence: '0.7800',
    human_review_status: 'confirmed',
    due_date: null,
    mapped_ctd_sections: ['E1'],
    mapped_artifact_ids: ['art-1'],
    owner_user_id: 5,
    resolution_status: 'open',
    structured_extraction: {
      regulatorAskType: 'biocompatibility_evidence',
      impactedSubmissionComponent: 'nonclinical_testing',
      sectionCandidates: ['E1'],
      recommendedOwnerFunction: 'nonclinical',
      recommendedResponsePackageType: 'nonclinical_evidence_response',
      evidenceNeeds: ['ISO 10993 endpoint matrix'],
      confidenceTrace: [{ signal: 'rule_match', score: 0.6, deterministic: true }],
      humanReviewRequired: true,
    },
    ...over,
  };
}

describe('the DB row reaches the compiler as the contract it declares', () => {
  it('carries the section keys the row holds', () => {
    const issue = issueRowToCorrespondenceIssue(row());
    expect(issue.mappedCtdSections).toEqual(['E1']);
    expect(issue.mappedArtifactIds).toEqual(['art-1']);
  });

  it('carries the structured extraction, including the real evidence needs', () => {
    const issue = issueRowToCorrespondenceIssue(row());
    expect(issue.structuredExtraction?.evidenceNeeds).toEqual(['ISO 10993 endpoint matrix']);
    expect(issue.structuredExtraction?.sectionCandidates).toEqual(['E1']);
  });

  it('carries the device topic the parser named', () => {
    expect(issueRowToCorrespondenceIssue(row()).subcategory).toBe('biocompatibility');
  });

  it('reads numeric confidence out of the NUMERIC column the driver returns as text', () => {
    expect(issueRowToCorrespondenceIssue(row()).confidence).toBeCloseTo(0.78, 4);
  });

  it('survives jsonb arriving as text rather than parsed', () => {
    const issue = issueRowToCorrespondenceIssue(
      row({ mapped_ctd_sections: '["E1","E3"]' as unknown as string[] }),
    );
    expect(issue.mappedCtdSections).toEqual(['E1', 'E3']);
  });

  it('a malformed jsonb column is no sections, never a throw', () => {
    const issue = issueRowToCorrespondenceIssue(
      row({ mapped_ctd_sections: '{not json' as unknown as string[] }),
    );
    expect(issue.mappedCtdSections).toEqual([]);
  });

  it('a row written before the column existed reports NO extraction, not an empty one', () => {
    /* The column defaults to `{}`. Returning an object of empty strings would
       read as an extraction that was recorded and said nothing. */
    const issue = issueRowToCorrespondenceIssue(row({ structured_extraction: {} }));
    expect(issue.structuredExtraction).toBeUndefined();
  });

  it('the compiled matrix is not empty — the defect this mapper exists for', () => {
    const compiled = compileGovernedResponseAssembly({
      correspondenceId: 'c1',
      issues: issueRowsToCorrespondenceIssues([row()]),
    });
    expect(compiled.impactedSections).toEqual(['E1']);
    expect(compiled.issueMatrix[0].sectionKeys).toEqual(['E1']);
    // And the checklist names the regulator's actual ask, not the fallback.
    expect(compiled.evidenceChecklist[0].item).toContain('ISO 10993 endpoint matrix');
    expect(compiled.evidenceChecklist[0].item).not.toContain('Issue evidence attachment');
  });
});

describe('readinessState is computed, and every state it claims is reachable', () => {
  const issue = (over: Partial<CorrespondenceIssue> = {}): CorrespondenceIssue =>
    issueRowToCorrespondenceIssue(row()) && { ...issueRowToCorrespondenceIssue(row()), ...over };

  const state = (issues: CorrespondenceIssue[], revisedArtifactIds?: string[]) =>
    compileGovernedResponseAssembly({ correspondenceId: 'c1', issues, revisedArtifactIds })
      .readinessState;

  it('nothing assessed is a DRAFT, not ready for review', () => {
    /* The old rule was `gaps > 0 ? evidence_gap : review_ready`, and with no
       issues there are no gaps — so an empty package reported itself ready. */
    expect(state([])).toBe('draft');
  });

  it('an extraction no person has confirmed is a draft', () => {
    expect(state([issue({ humanReviewStatus: 'pending', resolutionStatus: 'resolved' })], ['a'])).toBe(
      'draft',
    );
  });

  it('a confirmed but unresolved issue is an evidence gap', () => {
    expect(state([issue({ resolutionStatus: 'open' })], ['a'])).toBe('evidence_gap');
    expect(state([issue({ resolutionStatus: 'in_progress' })], ['a'])).toBe('evidence_gap');
  });

  it('all issues closed but nothing actually revised is still a gap', () => {
    expect(state([issue({ resolutionStatus: 'resolved', mappedArtifactIds: [] })], [])).toBe(
      'evidence_gap',
    );
  });

  it('closed, confirmed and revised is review_ready — the state that was unreachable', () => {
    expect(state([issue({ resolutionStatus: 'resolved' })], ['art-1'])).toBe('review_ready');
    expect(state([issue({ resolutionStatus: 'waived' })], ['art-1'])).toBe('review_ready');
  });

  it('one open issue among several holds the whole package back', () => {
    expect(
      state(
        [
          issue({ id: 'a', resolutionStatus: 'resolved' }),
          issue({ id: 'b', resolutionStatus: 'in_progress' }),
        ],
        ['art-1'],
      ),
    ).toBe('evidence_gap');
  });

  it('doing the work MOVES the signal — it is not a constant', () => {
    const open = state([issue({ resolutionStatus: 'open' })], ['art-1']);
    const done = state([issue({ resolutionStatus: 'resolved' })], ['art-1']);
    expect(open).not.toBe(done);
  });

  it('the checklist reflects the human decision, per item', () => {
    const c = compileGovernedResponseAssembly({
      correspondenceId: 'c1',
      issues: [
        issue({ id: 'a', resolutionStatus: 'resolved' }),
        issue({ id: 'b', resolutionStatus: 'open' }),
      ],
    });
    const byIssue = Object.fromEntries(
      c.evidenceChecklist.map((e) => [e.item.split(':')[0], e.status]),
    );
    expect(byIssue.a).toBe('satisfied');
    expect(byIssue.b).toBe('missing');
  });

  it('never claims approval_ready or send_ready from compilation alone', () => {
    /* Those are downstream governance states — something approved, something
       dispatched. Compiling a package is neither, and asserting them here would
       assert an approval nobody gave. */
    for (const s of [
      state([]),
      state([issue({ resolutionStatus: 'resolved' })], ['art-1']),
      state([issue({ resolutionStatus: 'open' })]),
    ]) {
      expect(['draft', 'evidence_gap', 'review_ready']).toContain(s);
    }
  });
});
