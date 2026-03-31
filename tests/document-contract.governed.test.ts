import { describe, expect, it } from 'vitest';
import {
  type GovernedDocumentActionContract,
  validateGovernedDocumentActionContract,
} from '../shared/types/document-contract';

function buildValidContract(): GovernedDocumentActionContract {
  return {
    projectId: 101,
    artifactId: 202,
    documentType: '510k-summary',
    originSurface: 'api_route',
    generationMode: 'manual',
    lifecycleStatus: 'draft',
    editorPayload: {
      title: 'Initial submission narrative',
      content: 'This governed document contains sufficiently detailed controlled content.',
    },
    placementTarget: {
      workspace: 'project',
      containerId: '101',
    },
    provenancePayload: {
      generatedAt: '2026-03-31T00:00:00.000Z',
      generatedBy: 'user_1',
    },
    auditEventPayload: {
      eventType: 'artifact.created',
      actorId: 'user_1',
      at: '2026-03-31T00:00:00.000Z',
    },
    exportEligibility: {
      allowed: false,
    },
  };
}

describe('validateGovernedDocumentActionContract', () => {
  it('accepts a valid governed document action contract', () => {
    const result = validateGovernedDocumentActionContract(buildValidContract());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing required platform-law fields', () => {
    const result = validateGovernedDocumentActionContract({
      ...buildValidContract(),
      projectId: 0,
      editorPayload: { title: '', content: '' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'projectId is required',
        'editorPayload.title is required',
        'editorPayload.content is required',
      ])
    );
  });

  it('warns when draft content is marked export-eligible', () => {
    const result = validateGovernedDocumentActionContract({
      ...buildValidContract(),
      exportEligibility: { allowed: true, reason: 'manual override' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'draft artifacts marked export-eligible should be explicitly justified'
    );
  });
});
