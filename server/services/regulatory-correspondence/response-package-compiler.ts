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

/**
 * The readiness state, from signals that exist.
 *
 * NOTHING SELECTED IS `draft`, NOT `review_ready`. The previous rule was
 * `unresolvedGaps.length > 0 ? 'evidence_gap' : 'review_ready'`, and with no
 * issues there are no gaps — so an empty response package, in which nothing was
 * assessed at all, reported itself ready for review. That is the
 * unassessed-reads-as-clean failure, in the one field a reviewer uses to decide
 * whether to look.
 *
 * `approval_ready` and `send_ready` are deliberately NOT produced here and are
 * not reachable anywhere else either (searched 2026-09-20). They are downstream
 * governance states — something approved, something dispatched — and compiling
 * a package is neither. Naming them from compilation would assert an approval
 * nobody gave. They stay in the union for whatever sets them; that nothing does
 * yet is a real gap, and a gap is better left visible than filled in by the
 * wrong component.
 */
function resolveReadinessState(
  selected: CorrespondenceIssue[],
  revisedArtifacts: string[],
  unresolvedGaps: string[],
): CompiledResponseAssembly['readinessState'] {
  if (selected.length === 0) return 'draft';
  // A machine extraction a person has not confirmed is not ready for review;
  // the thing that would be reviewed is still a proposal.
  if (selected.some(i => i.humanReviewStatus === 'pending')) return 'draft';
  if (unresolvedGaps.length > 0) return 'evidence_gap';
  // Every issue closed, and something actually revised in response.
  if (revisedArtifacts.length === 0) return 'evidence_gap';
  return 'review_ready';
}

export function compileGovernedResponseAssembly(
  input: CompileResponseAssemblyInput,
): CompiledResponseAssembly {
  const selected = input.selectedIssueIds?.length
    ? input.issues.filter(issue => input.selectedIssueIds?.includes(issue.id))
    : input.issues;

  const impactedSections = [...new Set(selected.flatMap(i => i.mappedCtdSections || []))];
  const revisedArtifacts = [...new Set(input.revisedArtifactIds || selected.flatMap(i => i.mappedArtifactIds || []))];

  /*
   * THE CHECKLIST USED TO BE A CONSTANT. `status` was `'missing' as const` for
   * every item, so `unresolvedGaps` was always the whole list and
   * `readinessState` was always `evidence_gap` — measured 2026-09-20: resolving
   * the issue and attaching the artifacts did not move it, and three of the five
   * declared states were unreachable.
   *
   * What the compiler can honestly say about an evidence item is whether the
   * issue it belongs to has been CLOSED BY A PERSON — `resolved` or `waived`,
   * both set through PATCH /issues/:id/review. It cannot say whether a specific
   * uploaded artifact satisfies a specific regulator ask; there is no mapping
   * from an evidence need to an artifact, and inventing one would be the
   * fabrication this module's readiness signal exists to avoid.
   */
  const closed = (issue: CorrespondenceIssue) =>
    issue.resolutionStatus === 'resolved' || issue.resolutionStatus === 'waived';

  const evidenceChecklist = selected.flatMap(issue =>
    (issue.structuredExtraction?.evidenceNeeds || ['Issue evidence attachment']).map(item => ({
      item: `${issue.id}: ${item}`,
      status: (closed(issue) ? 'satisfied' : 'missing') as 'missing' | 'satisfied',
    }))
  );

  const unresolvedGaps = evidenceChecklist.filter(e => e.status === 'missing').map(e => e.item);
  const readinessState = resolveReadinessState(selected, revisedArtifacts, unresolvedGaps);

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
