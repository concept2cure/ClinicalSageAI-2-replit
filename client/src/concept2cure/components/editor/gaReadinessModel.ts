export type CheckStatus = 'ready' | 'partial' | 'missing';
export type CapabilityStatus = 'yes' | 'partial' | 'missing';

export interface SessionSnapshot {
  projectId?: string;
  hasActiveArtifact: boolean;
  artifactCount: number;
  collaborationConnected: boolean;
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
