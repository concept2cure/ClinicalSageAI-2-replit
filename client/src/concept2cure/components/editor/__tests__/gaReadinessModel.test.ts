import { describe, expect, it } from 'vitest';
import {
  buildCapabilityModels,
  buildReadinessChecks,
  buildRemediationQueue,
} from '../gaReadinessModel';

describe('gaReadinessModel', () => {
  it('marks data room capability missing when project context is absent', () => {
    const capabilities = buildCapabilityModels({
      projectId: undefined,
      hasActiveArtifact: false,
      artifactCount: 0,
      collaborationConnected: false,
      signatureCount: 0,
      provenanceCount: 0,
      unresolvedCommentCount: 0,
      trustLoadFailed: false,
    });

    const dataRoom = capabilities.find(c => c.id === 'data-room-figure-insertion');
    expect(dataRoom?.c2c).toBe('missing');
  });

  it('generates high severity remediation items for missing checks/capabilities', () => {
    const checks = [
      {
        id: 'project-context',
        label: 'Project context',
        status: 'missing' as const,
        detail: 'Missing project context.',
      },
    ];
    const capabilities = buildCapabilityModels({
      projectId: undefined,
      hasActiveArtifact: false,
      artifactCount: 0,
      collaborationConnected: false,
      signatureCount: 0,
      provenanceCount: 0,
      unresolvedCommentCount: 0,
      trustLoadFailed: false,
    });

    const queue = buildRemediationQueue(checks, capabilities);
    expect(queue.some(item => item.severity === 'high')).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
  });

  it('flags trust telemetry as missing when trust indicators fail to load', () => {
    const checks = buildReadinessChecks({
      projectId: 'proj_123',
      hasActiveArtifact: true,
      artifactCount: 3,
      collaborationConnected: true,
      signatureCount: 1,
      provenanceCount: 5,
      unresolvedCommentCount: 0,
      trustLoadFailed: true,
    });

    const trust = checks.find(c => c.id === 'provenance-audit');
    expect(trust?.status).toBe('missing');
  });
});
