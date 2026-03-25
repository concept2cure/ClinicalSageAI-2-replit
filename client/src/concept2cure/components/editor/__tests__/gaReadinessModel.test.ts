import { describe, expect, it } from 'vitest';
import { buildCapabilityModels, buildRemediationQueue } from '../gaReadinessModel';

describe('gaReadinessModel', () => {
  it('marks data room capability missing when project context is absent', () => {
    const capabilities = buildCapabilityModels({
      projectId: undefined,
      hasActiveArtifact: false,
      artifactCount: 0,
      collaborationConnected: false,
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
    });

    const queue = buildRemediationQueue(checks, capabilities);
    expect(queue.some(item => item.severity === 'high')).toBe(true);
    expect(queue.length).toBeGreaterThan(0);
  });
});
