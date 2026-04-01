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
    clientTrack: 'device',
    submissionProgram: '510k',
    persona: 'regulatory',
    regulatorScope: 'fda',
    evidenceMode: 'predicate',
    documentClass: 'submission_component',
    readinessGate: 'internal_review',
    approvalPathType: 'regulated_dual_review',
    recommendationSource: 'cerv2_510k',
    workspaceTarget: 'project',
    regulatorIntent: 'submission_authoring',
    editorPayload: {
      title: 'Initial submission narrative',
      content: 'This governed document contains sufficiently detailed controlled content.',
      ctdSection: '2.5',
    },
    placementTarget: {
      workspace: 'project',
      containerId: '101',
    },
    provenancePayload: {
      generatedAt: '2026-03-31T00:00:00.000Z',
      generatedBy: 'user_1',
      sourceRefs: ['predicate:ABC'],
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
      clientTrack: undefined as any,
      editorPayload: { title: '', content: '' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'projectId is required',
        'clientTrack is required',
        'editorPayload.title is required',
        'editorPayload.content is required',
      ])
    );
  });

  it('rejects module3 output without 3.x mapping', () => {
    const result = validateGovernedDocumentActionContract({
      ...buildValidContract(),
      clientTrack: 'biotech',
      submissionProgram: 'ectd',
      documentClass: 'module3_output',
      evidenceMode: 'cmc_source',
      editorPayload: {
        title: 'M3 draft',
        content: 'Module content',
        ctdSection: '2.3',
      },
      provenancePayload: {
        generatedAt: '2026-03-31T00:00:00.000Z',
        generatedBy: 'user_1',
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('module3_output requires ctdSection mapping under section 3.x');
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
