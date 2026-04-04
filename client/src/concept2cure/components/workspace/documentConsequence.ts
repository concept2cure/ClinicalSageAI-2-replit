export type ConsequenceSourceType = 'compute' | 'proposal_accept' | 'generated_draft';

export interface ConsequenceArtifact {
  id: string;
  title: string;
  version?: number;
  status?: string;
  ctdSection?: string | null;
  templateId?: string | null;
  metadata?: Record<string, any>;
}

export interface ConsequenceComputeJob {
  artifact_id?: string;
  artifact_title?: string;
  artifact_version?: number;
  artifact_status?: string;
  artifact_ctd_section?: string;
  placement_state?: 'placed' | 'unplaced';
  provenance_ref?: string | null;
  audit_ref?: string | null;
  created_at: string;
}

export interface ConsequenceProposal {
  id: string;
  status: string;
  governanceState?: 'ACCEPTED_GOVERNED' | 'ACCEPTED_PERSISTED_NO_GOVERNANCE' | 'REJECTED';
  artifactId?: string;
  artifactVersion?: number;
  artifactStatus?: string;
  placementState?: string;
  provenanceRef?: string;
  auditRef?: string;
}

/**
 * Governed fabric state — first-class operating truth for document consequences.
 *
 * This is the canonical governance evaluation state for an artifact.
 * When present, it is the authoritative source for readiness, eligibility,
 * and blocker information. Not optional metadata — operating truth.
 */
export interface GovernedFabricState {
  decisionId?: string;
  outcome?: 'allow' | 'block' | 'review' | 'degraded';
  readiness?: string;
  readinessScore?: number;
  placementOutcome?: string;
  exportEligible?: boolean;
  publishEligible?: boolean;
  blockerCount?: number;
  warningCount?: number;
  consequenceCount?: number;
  /** Lifecycle state from the governed decision queue */
  lifecycleState?: 'recommended_only' | 'under_review' | 'approved' | 'rejected' | 'executed' | 'deferred' | 'escalated' | 'superseded';
}

export interface DocumentConsequenceRow {
  rowKey: string;
  title: string;
  artifactId: string;
  version: number;
  status: string;
  sourceType: ConsequenceSourceType;
  placement: string;
  provenancePresent: boolean;
  auditPresent: boolean;
  openable: boolean;
  /** Governed fabric evaluation state — present when fabric has evaluated this artifact */
  governedFabric?: GovernedFabricState;
}

function inferSourceType(artifact: ConsequenceArtifact): ConsequenceSourceType | null {
  if (artifact.metadata?.source === 'compute') return 'compute';
  if (artifact.metadata?.source === 'proposal_accept') return 'proposal_accept';
  if (artifact.metadata?.source === 'generated_draft' || artifact.templateId) return 'generated_draft';
  return null;
}

export function buildDocumentConsequenceRows(args: {
  artifacts: ConsequenceArtifact[];
  computeJobs: ConsequenceComputeJob[];
  proposals: ConsequenceProposal[];
  canOpenArtifact?: (artifactId: string, status: string) => boolean;
  /** Map of artifactId → governed fabric state from backend evaluations */
  fabricStateMap?: Record<string, GovernedFabricState>;
}): DocumentConsequenceRow[] {
  const rows: DocumentConsequenceRow[] = [];
  const seen = new Set<string>();

  const record = (row: DocumentConsequenceRow) => {
    if (seen.has(row.artifactId)) return;
    seen.add(row.artifactId);
    // Attach governed fabric state if available
    if (args.fabricStateMap && args.fabricStateMap[row.artifactId]) {
      row.governedFabric = args.fabricStateMap[row.artifactId];
    }
    rows.push(row);
  };

  for (const job of args.computeJobs) {
    if (!job.artifact_id) continue;
    record({
      rowKey: `compute:${job.artifact_id}`,
      title: job.artifact_title || job.artifact_id,
      artifactId: job.artifact_id,
      version: job.artifact_version || 1,
      status: job.artifact_status || 'draft',
      sourceType: 'compute',
      placement:
        job.placement_state === 'placed' && job.artifact_ctd_section
          ? `§${job.artifact_ctd_section}`
          : 'unplaced',
      provenancePresent: Boolean(job.provenance_ref),
      auditPresent: Boolean(job.audit_ref),
      openable: args.canOpenArtifact ? args.canOpenArtifact(job.artifact_id, job.artifact_status || 'draft') : true,
    });
  }

  for (const proposal of args.proposals) {
    if (!proposal.artifactId || proposal.status !== 'accepted') continue;
    record({
      rowKey: `proposal:${proposal.id}`,
      title: `Accepted proposal ${proposal.id.slice(0, 8)}`,
      artifactId: proposal.artifactId,
      version: proposal.artifactVersion || 1,
      status: proposal.artifactStatus || 'accepted',
      sourceType: 'proposal_accept',
      placement: proposal.placementState || 'unplaced',
      provenancePresent: Boolean(proposal.provenanceRef),
      auditPresent: Boolean(proposal.auditRef),
      openable: args.canOpenArtifact ? args.canOpenArtifact(proposal.artifactId, proposal.artifactStatus || 'draft') : true,
    });
  }

  for (const artifact of args.artifacts) {
    const sourceType = inferSourceType(artifact);
    if (!sourceType) continue;
    record({
      rowKey: `artifact:${artifact.id}`,
      title: artifact.title,
      artifactId: artifact.id,
      version: artifact.version || 1,
      status: artifact.status || 'draft',
      sourceType,
      placement: artifact.ctdSection ? `§${artifact.ctdSection}` : 'unplaced',
      provenancePresent: Boolean(artifact.metadata?.provenancePresent),
      auditPresent: Boolean(artifact.metadata?.auditPresent),
      openable: args.canOpenArtifact ? args.canOpenArtifact(artifact.id, artifact.status || 'draft') : true,
    });
  }

  return rows.slice(0, 10);
}

// ── Governance-Aware Consequence Summary ��────────────────────────────────────

export interface ConsequenceGovernanceSummary {
  totalRows: number;
  governedRows: number;
  ungoverned: number;
  blocked: number;
  allowed: number;
  underReview: number;
  hasBlockers: boolean;
}

/**
 * Derive governance summary from consequence rows.
 * Makes governance the primary lens for viewing consequence state.
 */
export function summarizeConsequenceGovernance(
  rows: DocumentConsequenceRow[]
): ConsequenceGovernanceSummary {
  let governed = 0;
  let blocked = 0;
  let allowed = 0;
  let underReview = 0;

  for (const row of rows) {
    if (row.governedFabric) {
      governed++;
      if (row.governedFabric.outcome === 'block') blocked++;
      else if (row.governedFabric.outcome === 'allow') allowed++;
      else if (row.governedFabric.outcome === 'review') underReview++;
    }
  }

  return {
    totalRows: rows.length,
    governedRows: governed,
    ungoverned: rows.length - governed,
    blocked,
    allowed,
    underReview,
    hasBlockers: blocked > 0,
  };
}
