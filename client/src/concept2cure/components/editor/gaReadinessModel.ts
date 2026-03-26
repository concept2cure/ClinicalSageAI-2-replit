export type CheckStatus = 'ready' | 'partial' | 'missing';
export type CapabilityStatus = 'yes' | 'partial' | 'missing';

export interface SessionSnapshot {
  projectId?: string;
  hasActiveArtifact: boolean;
  artifactCount: number;
  collaborationConnected: boolean;
  signatureCount: number;
  provenanceCount: number;
  unresolvedCommentCount: number;
  trustLoadFailed: boolean;
}

export interface ReadinessCheckModel {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  inspectorTarget?: string;
}

export interface CapabilityModel {
  id: string;
  capability: string;
  weaveBio: 'yes' | 'partial' | 'unknown';
  artos: 'yes' | 'partial' | 'unknown';
  c2c: CapabilityStatus;
  inspectorTarget?: string;
  gapSummary?: string;
}

export interface RemediationModel {
  id: string;
  title: string;
  detail: string;
  inspectorTarget: string;
  severity: 'high' | 'medium';
}

export function buildCapabilityModels(snapshot: SessionSnapshot): CapabilityModel[] {
  return [
    {
      id: 'templated-module-drafting',
      capability: 'Template-guided module drafting from source documents',
      weaveBio: 'yes',
      artos: 'yes',
      c2c: snapshot.hasActiveArtifact ? 'yes' : 'partial',
      inspectorTarget: 'intelligence',
      gapSummary: snapshot.hasActiveArtifact
        ? undefined
        : 'Open or create an artifact to enable structured AI-assisted drafting.',
    },
    {
      id: 'data-room-figure-insertion',
      capability: 'Data room style evidence/figure retrieval into draft',
      weaveBio: 'yes',
      artos: 'partial',
      c2c: snapshot.projectId ? 'partial' : 'missing',
      inspectorTarget: 'dataroom',
      gapSummary: snapshot.projectId
        ? 'Data room is available, but insertion quality depends on project source completeness.'
        : 'Project context is required before evidence retrieval can be enabled.',
    },
    {
      id: 'cross-document-consistency',
      capability: 'Cross-document consistency and inconsistency detection',
      weaveBio: 'partial',
      artos: 'yes',
      c2c: snapshot.artifactCount > 1 ? 'yes' : 'partial',
      inspectorTarget: 'inconsistency',
      gapSummary:
        snapshot.artifactCount > 1
          ? undefined
          : 'Add more than one artifact to activate cross-document consistency checks.',
    },
    {
      id: 'governed-review-e-sign',
      capability: 'Governed review workflow, audit trail, and e-signature',
      weaveBio: 'yes',
      artos: 'partial',
      c2c: snapshot.hasActiveArtifact ? 'yes' : 'partial',
      inspectorTarget: 'audit',
      gapSummary: snapshot.hasActiveArtifact
        ? undefined
        : 'Audit trail and e-sign flow become actionable after selecting an active artifact.',
    },
    {
      id: 'submission-readiness',
      capability: 'Submission readiness validation before handoff',
      weaveBio: 'yes',
      artos: 'partial',
      c2c: snapshot.projectId ? 'yes' : 'partial',
      inspectorTarget: 'submission-readiness',
      gapSummary: snapshot.projectId
        ? undefined
        : 'Submission readiness requires project-scoped context and mapped artifacts.',
    },
  ];
}

export function buildReadinessChecks(snapshot: SessionSnapshot): ReadinessCheckModel[] {
  return [
    {
      id: 'project-context',
      label: 'Project context',
      status: snapshot.projectId ? 'ready' : 'missing',
      detail: snapshot.projectId
        ? `Linked to project ${snapshot.projectId.slice(0, 8)}…`
        : 'Open editor with a projectId to enable persistence, governance, and audit.',
      inspectorTarget: 'submission-readiness',
    },
    {
      id: 'artifact-loaded',
      label: 'Document loaded',
      status: snapshot.hasActiveArtifact ? 'ready' : 'missing',
      detail: snapshot.hasActiveArtifact
        ? 'Active artifact selected for editing.'
        : 'No active artifact selected. Choose or create a document.',
      inspectorTarget: 'versions',
    },
    {
      id: 'api-wiring',
      label: 'Authoring API wiring',
      status: snapshot.artifactCount > 0 ? 'ready' : 'partial',
      detail:
        snapshot.artifactCount > 0
          ? `Artifact APIs responding (${snapshot.artifactCount} document${snapshot.artifactCount === 1 ? '' : 's'} loaded).`
          : 'No artifacts fetched yet. Confirm artifact list endpoint wiring.',
      inspectorTarget: 'versions',
    },
    {
      id: 'collaboration',
      label: 'Collaboration channel',
      status: snapshot.collaborationConnected ? 'ready' : 'partial',
      detail: snapshot.collaborationConnected
        ? 'Presence and typing channel connected.'
        : 'Collaboration socket offline; single-user authoring still available.',
      inspectorTarget: 'comments',
    },
    {
      id: 'part11-signatures',
      label: 'Part 11 signature coverage',
      status: snapshot.signatureCount > 0 ? 'ready' : 'partial',
      detail:
        snapshot.signatureCount > 0
          ? `${snapshot.signatureCount} electronic signature(s) recorded.`
          : 'No signatures recorded yet for this artifact.',
      inspectorTarget: 'audit',
    },
    {
      id: 'provenance-audit',
      label: 'Provenance and trust telemetry',
      status: snapshot.trustLoadFailed ? 'missing' : snapshot.provenanceCount > 0 ? 'ready' : 'partial',
      detail: snapshot.trustLoadFailed
        ? 'Trust indicators failed to load; verify provenance/audit APIs.'
        : snapshot.provenanceCount > 0
          ? `${snapshot.provenanceCount} provenance events loaded.`
          : 'No provenance events visible yet.',
      inspectorTarget: 'provenance',
    },
    {
      id: 'review-closure',
      label: 'Review closure signal',
      status: snapshot.unresolvedCommentCount === 0 ? 'ready' : 'partial',
      detail:
        snapshot.unresolvedCommentCount === 0
          ? 'No unresolved comments.'
          : `${snapshot.unresolvedCommentCount} unresolved comment thread(s) remain.`,
      inspectorTarget: 'comments',
    },
  ];
}

export function buildRemediationQueue(
  checks: ReadinessCheckModel[],
  capabilities: CapabilityModel[]
): RemediationModel[] {
  const fromChecks: RemediationModel[] = checks
    .filter(check => check.status !== 'ready')
    .map(check => ({
      id: `check-${check.id}`,
      title: check.label,
      detail: check.detail,
      inspectorTarget: check.inspectorTarget || 'intelligence',
      severity: check.status === 'missing' ? 'high' : 'medium',
    }));

  const fromCapabilities: RemediationModel[] = capabilities
    .filter(cap => cap.c2c !== 'yes' && cap.inspectorTarget)
    .map(cap => ({
      id: `cap-${cap.id}`,
      title: cap.capability,
      detail: cap.gapSummary || 'This capability is partially wired in the current session.',
      inspectorTarget: cap.inspectorTarget!,
      severity: cap.c2c === 'missing' ? 'high' : 'medium',
    }));

  return [...fromChecks, ...fromCapabilities].slice(0, 6);
}
