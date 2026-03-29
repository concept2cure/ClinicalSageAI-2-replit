export type CheckStatus = 'ready' | 'partial' | 'missing';
export type CapabilityStatus = 'yes' | 'partial' | 'missing';

export interface SessionSnapshot {
  projectId?: string;
  hasActiveArtifact: boolean;
  artifactCount: number;
  collaborationConnected: boolean;
  signatureCount?: number;
  provenanceCount?: number;
  unresolvedCommentCount?: number;
  trustLoadFailed?: boolean;
}

export interface ReadinessCheckModel {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
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

export function buildReadinessChecks(snapshot: SessionSnapshot): ReadinessCheckModel[] {
  return [
    {
      id: 'project-context',
      label: 'Project context available',
      status: snapshot.projectId ? 'ready' : 'missing',
      detail: snapshot.projectId
        ? 'Project context is loaded and available for document operations.'
        : 'No project context — save, export, and compliance features require a project.',
    },
    {
      id: 'active-artifact',
      label: 'Active document loaded',
      status: snapshot.hasActiveArtifact ? 'ready' : 'missing',
      detail: snapshot.hasActiveArtifact
        ? 'An artifact is loaded in the editor.'
        : 'No document loaded — create or open an artifact to begin.',
    },
    {
      id: 'collaboration',
      label: 'Real-time collaboration',
      status: snapshot.collaborationConnected ? 'ready' : 'partial',
      detail: snapshot.collaborationConnected
        ? 'WebSocket collaboration channel is connected.'
        : 'Collaboration channel is not connected — edits will still autosave.',
    },
    {
      id: 'signatures',
      label: 'E-signature workflow',
      status: (snapshot.signatureCount ?? 0) > 0 ? 'ready' : snapshot.hasActiveArtifact ? 'partial' : 'missing',
      detail: (snapshot.signatureCount ?? 0) > 0
        ? `${snapshot.signatureCount} signature(s) recorded.`
        : 'No signatures yet — available via Sign/Approve in the editor toolbar.',
    },
    {
      id: 'provenance',
      label: 'Provenance trail',
      status: (snapshot.provenanceCount ?? 0) > 0 ? 'ready' : snapshot.hasActiveArtifact ? 'partial' : 'missing',
      detail: (snapshot.provenanceCount ?? 0) > 0
        ? `${snapshot.provenanceCount} provenance entries tracked.`
        : 'No provenance entries — they will accumulate as you edit and save.',
    },
    {
      id: 'comments-resolved',
      label: 'Open comments resolved',
      status: (snapshot.unresolvedCommentCount ?? 0) === 0 ? 'ready' : 'partial',
      detail: (snapshot.unresolvedCommentCount ?? 0) === 0
        ? 'All comments resolved.'
        : `${snapshot.unresolvedCommentCount} unresolved comment(s) — review before advancing stage.`,
    },
    {
      id: 'api-wiring',
      label: 'Backend connectivity',
      status: snapshot.trustLoadFailed ? 'missing' : 'ready',
      detail: snapshot.trustLoadFailed
        ? 'Some API calls failed — document operations may be degraded.'
        : 'All backend services are responding.',
    },
  ];
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
      inspectorTarget:
        check.id === 'project-context'
          ? 'submission-readiness'
          : check.id === 'collaboration'
            ? 'comments'
            : check.id === 'api-wiring'
              ? 'versions'
              : 'intelligence',
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
