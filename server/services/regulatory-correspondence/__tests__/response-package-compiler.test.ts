
import { vi } from 'vitest';

// Auth middleware imports `../config/environment.js` which is a `.ts` file
// in v2. Node ESM strict mode rejects the .js extension. Mock the
// middleware so the import chain doesn't touch the .js → .ts resolution.
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return {
    db: {},
    pool,
    getPool: () => pool,
    getDb: () => ({}),
  };
});


import { compileGovernedResponseAssembly } from '../response-package-compiler';
import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

const makeIssue = (overrides: Partial<CorrespondenceIssue> = {}): CorrespondenceIssue => ({
  id: `issue-${Math.random().toString(36).slice(2, 8)}`,
  correspondenceId: 'corr-test',
  category: 'cmc_quality_issue',
  severity: 'high',
  blocker: true,
  responseRequired: true,
  confidence: 0.9,
  humanReviewStatus: 'pending',
  mappedCtdSections: ['3.2.S'],
  mappedArtifactIds: ['44'],
  resolutionStatus: 'open',
  structuredExtraction: {
    regulatorAskType: 'cmc_data_request',
    impactedSubmissionComponent: 'module_3',
    sectionCandidates: ['3.2.S'],
    recommendedOwnerFunction: 'cmc',
    recommendedResponsePackageType: 'cmc_amendment',
    evidenceNeeds: ['updated stability dataset'],
    confidenceTrace: [{ signal: 'rule_match', score: 0.8, deterministic: true }],
    humanReviewRequired: true,
  },
  ...overrides,
});

describe('response package compiler', () => {
  it('builds governed assembly with evidence and gaps', () => {
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-123',
      /* `humanReviewStatus` is spelled out because the fixture defaults to
         'pending', and since 2026-09-20 an extraction no person has confirmed
         is a `draft` — the thing missing there is the confirmation, not the
         evidence. This case is about the evidence, so the confirmation is
         given. */
      issues: [
        makeIssue({ id: 'issue-1', correspondenceId: 'corr-123', humanReviewStatus: 'confirmed' }),
      ],
    });

    expect(assembly.issueMatrix.length).toBe(1);
    expect(assembly.evidenceChecklist.length).toBeGreaterThan(0);
    expect(assembly.readinessState).toBe('evidence_gap');
    expect(assembly.provenance.deterministic).toBe(true);
    expect(assembly.provenance.compilerVersion).toContain('response-assembly');
  });

  it('returns review_ready when no evidence gaps exist', () => {
    /*
     * REWRITTEN 2026-09-20. This test was named for `review_ready` and asserted
     * `evidence_gap`, and its own comment said why: "falls back to ['Issue
     * evidence attachment'] which is ALWAYS marked 'missing'". It was a test
     * written around a constant — `status: 'missing' as const` — which made
     * `review_ready` unreachable, so the name and the assertion could not both
     * be satisfied.
     *
     * The checklist now follows the human decision on each issue, so the test
     * asserts what its name always claimed.
     */
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-no-gaps',
      issues: [makeIssue({ humanReviewStatus: 'confirmed', resolutionStatus: 'resolved' })],
      revisedArtifactIds: ['44'],
    });

    expect(assembly.unresolvedGaps).toEqual([]);
    expect(assembly.readinessState).toBe('review_ready');
  });

  it('a missing structuredExtraction still yields a checklist item, and no invented ask', () => {
    /* The half of the old test that WAS about the fallback. */
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-no-extraction',
      issues: [makeIssue({ structuredExtraction: undefined, humanReviewStatus: 'confirmed' })],
    });
    expect(assembly.evidenceChecklist).toHaveLength(1);
    expect(assembly.evidenceChecklist[0].item).toContain('Issue evidence attachment');
    expect(assembly.readinessState).toBe('evidence_gap');
  });

  it('handles empty issues array', () => {
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-empty',
      issues: [],
    });

    expect(assembly.issueMatrix.length).toBe(0);
    expect(assembly.evidenceChecklist.length).toBe(0);
    expect(assembly.unresolvedGaps.length).toBe(0);
    /* CHANGED 2026-09-20, and this assertion WAS the defect: with no issues
       there are no gaps, and the old rule read `gaps > 0 ? evidence_gap :
       review_ready`, so a package in which nothing had been assessed reported
       itself ready for review — in the one field a reviewer uses to decide
       whether to look at it. Nothing assessed is a draft. */
    expect(assembly.readinessState).toBe('draft');
    expect(assembly.impactedSections.length).toBe(0);
    expect(assembly.coverLetterDraft).toContain('0 issue(s)');
  });

  it('handles multiple issues with mixed severities', () => {
    const issues = [
      makeIssue({ id: 'i-1', severity: 'critical', blocker: true, mappedCtdSections: ['2.5'] }),
      makeIssue({ id: 'i-2', severity: 'medium', blocker: false, mappedCtdSections: ['3.2.P'] }),
      makeIssue({ id: 'i-3', severity: 'low', blocker: false, mappedCtdSections: ['3.2.S'] }),
    ];

    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-multi',
      issues,
    });

    expect(assembly.issueMatrix.length).toBe(3);
    expect(assembly.impactedSections).toContain('2.5');
    expect(assembly.impactedSections).toContain('3.2.P');
    expect(assembly.impactedSections).toContain('3.2.S');
    expect(assembly.coverLetterDraft).toContain('3 issue(s)');
  });

  it('filters by selectedIssueIds when provided', () => {
    const issues = [
      makeIssue({ id: 'sel-1' }),
      makeIssue({ id: 'sel-2' }),
      makeIssue({ id: 'sel-3' }),
    ];

    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-filter',
      issues,
      selectedIssueIds: ['sel-1', 'sel-3'],
    });

    expect(assembly.issueMatrix.length).toBe(2);
    expect(assembly.issueMatrix.map(m => m.issueId)).toEqual(['sel-1', 'sel-3']);
  });

  it('deduplicates impacted sections across issues', () => {
    const issues = [
      makeIssue({ id: 'd-1', mappedCtdSections: ['3.2.S', '3.2.P'] }),
      makeIssue({ id: 'd-2', mappedCtdSections: ['3.2.S', '2.5'] }),
    ];

    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-dedup',
      issues,
    });

    // Should be deduplicated
    expect(assembly.impactedSections.length).toBe(3);
    expect(new Set(assembly.impactedSections).size).toBe(3);
  });

  it('uses revisedArtifactIds when provided', () => {
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-revised',
      issues: [makeIssue()],
      revisedArtifactIds: ['art-100', 'art-200'],
    });

    expect(assembly.revisedArtifacts).toEqual(['art-100', 'art-200']);
  });
});
