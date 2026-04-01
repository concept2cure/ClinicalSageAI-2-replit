import { compileGovernedResponseAssembly } from '../response-package-compiler';

describe('response package compiler', () => {
  it('builds governed assembly with evidence and gaps', () => {
    const assembly = compileGovernedResponseAssembly({
      correspondenceId: 'corr-123',
      issues: [
        {
          id: 'issue-1',
          correspondenceId: 'corr-123',
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
        },
      ],
    });

    expect(assembly.issueMatrix.length).toBe(1);
    expect(assembly.evidenceChecklist.length).toBeGreaterThan(0);
    expect(assembly.readinessState).toBe('evidence_gap');
  });
});
