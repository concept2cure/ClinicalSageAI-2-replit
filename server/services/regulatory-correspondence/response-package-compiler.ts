import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

import {
  composeCoverLetterDraft,
  type CoverLetterIssueSummary,
} from '../cover-letter/cover-letter-composer';

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

export interface CompileResponseAssemblyInput {
  correspondenceId: string;
  issues: CorrespondenceIssue[];
  selectedIssueIds?: string[];
  revisedArtifactIds?: string[];
}

export function compileGovernedResponseAssembly(
  input: CompileResponseAssemblyInput,
): CompiledResponseAssembly {
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

/**
 * Async variant that pulls verbatim eSTAR section content into the cover
 * letter via the cover-letter composer. Use this when you have an
 * organization + eSTAR document context — the synchronous variant remains
 * for callers that don't.
 *
 * The result extends the base assembly with `coverLetterMissingSections`
 * so the UI can surface gaps where the dossier still needs author work.
 */
export interface CompiledResponseAssemblyWithCoverLetter extends CompiledResponseAssembly {
  coverLetterMissingSections: string[];
  coverLetterProvenance: {
    composerVersion: string;
    composedAt: string;
    deterministic: true;
    sectionNumbers: string[];
    issueIds: string[];
  };
}

export interface CompileWithCoverLetterInput extends CompileResponseAssemblyInput {
  organizationId: number;
  eStarDocumentId: number;
  submissionTrackingNumber: string | null;
  sponsorName: string;
}

export async function compileWithCoverLetter(
  input: CompileWithCoverLetterInput,
): Promise<CompiledResponseAssemblyWithCoverLetter> {
  const base = compileGovernedResponseAssembly({
    correspondenceId: input.correspondenceId,
    issues: input.issues,
    selectedIssueIds: input.selectedIssueIds,
    revisedArtifactIds: input.revisedArtifactIds,
  });

  const selected = input.selectedIssueIds?.length
    ? input.issues.filter(issue => input.selectedIssueIds?.includes(issue.id))
    : input.issues;

  const issueSummaries: CoverLetterIssueSummary[] = selected.map(issue => ({
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    blocker: issue.blocker,
    description:
      issue.structuredExtraction?.evidenceNeeds?.join('; ') ||
      `${issue.category} response`,
    sectionNumbers: normalizeSectionNumbers(issue.mappedCtdSections || []),
  }));

  const draft = await composeCoverLetterDraft({
    organizationId: input.organizationId,
    documentId: input.eStarDocumentId,
    submissionTrackingNumber: input.submissionTrackingNumber,
    sponsorName: input.sponsorName,
    issues: issueSummaries,
  });

  return {
    ...base,
    coverLetterDraft: draft.body,
    coverLetterMissingSections: draft.missingSections,
    coverLetterProvenance: draft.provenance,
  };
}

/**
 * Reduce CTD-style section refs (e.g. "3.2.S", "2.5") to the eSTAR
 * top-level section numbers the composer expects ("3", "2"). This is a
 * deliberate simplification — full CTD/eSTAR mapping is a follow-up task
 * tracked under B5.4 in the BETA progress doc.
 */
function normalizeSectionNumbers(refs: string[]): string[] {
  const out = new Set<string>();
  for (const r of refs) {
    const top = r.split('.')[0];
    if (top && /^\d+$/.test(top)) out.add(top);
  }
  return [...out];
}
