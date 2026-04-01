import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

export interface CompiledResponseAssembly {
  issueMatrix: Array<{
    issueId: string;
    category: string;
    severity: string;
    blocker: boolean;
    sectionKeys: string[];
    artifactIds: string[];
  }>;
  impactedSections: string[];
  revisedArtifacts: string[];
  evidenceChecklist: Array<{ item: string; status: 'missing' | 'satisfied' }>;
  coverLetterDraft: string;
  unresolvedGaps: string[];
  readinessState: 'draft' | 'evidence_gap' | 'review_ready' | 'approval_ready' | 'send_ready';
  provenance: {
    compilerVersion: string;
    compiledAt: string;
    deterministic: boolean;
  };
}

export function compileGovernedResponseAssembly(input: {
  correspondenceId: string;
  issues: CorrespondenceIssue[];
  selectedIssueIds?: string[];
  revisedArtifactIds?: string[];
}): CompiledResponseAssembly {
  const selected = input.selectedIssueIds?.length
    ? input.issues.filter(issue => input.selectedIssueIds?.includes(issue.id))
    : input.issues;

  const impactedSections = [...new Set(selected.flatMap(i => i.mappedCtdSections || []))];
  const revisedArtifacts = [...new Set(input.revisedArtifactIds || selected.flatMap(i => i.mappedArtifactIds || []))];
  const evidenceChecklist = selected.flatMap(issue =>
    (issue.structuredExtraction?.evidenceNeeds || ['Issue evidence attachment']).map(item => ({
      item: `${issue.id}: ${item}`,
      status: 'missing' as const,
    }))
  );

  const unresolvedGaps = evidenceChecklist.filter(e => e.status === 'missing').map(e => e.item);
  const readinessState = unresolvedGaps.length > 0 ? 'evidence_gap' : 'review_ready';

  return {
    issueMatrix: selected.map(issue => ({
      issueId: issue.id,
      category: issue.category,
      severity: issue.severity,
      blocker: issue.blocker,
      sectionKeys: issue.mappedCtdSections || [],
      artifactIds: issue.mappedArtifactIds || [],
    })),
    impactedSections,
    revisedArtifacts,
    evidenceChecklist,
    coverLetterDraft: `Response package for correspondence ${input.correspondenceId} addressing ${selected.length} issue(s).`,
    unresolvedGaps,
    readinessState,
    provenance: {
      compilerVersion: 'response-assembly-v1',
      compiledAt: new Date().toISOString(),
      deterministic: true,
    },
  };
}
