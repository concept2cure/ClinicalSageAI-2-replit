import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  resolveGovernedContext,
  validateGovernedArtifactMutation,
} from '../concept2cure/governedDocumentContractService';

function mockRequest(overrides?: Partial<Request>): Request {
  return {
    userId: 42 as any,
    userEmail: 'qa@example.com',
    userRole: 'regulatory',
    body: {
      metadata: {
        traceId: 'trace_abc123',
      },
    },
    ...overrides,
  } as Request;
}

describe('validateGovernedArtifactMutation', () => {
  it('returns valid for a complete create mutation context', () => {
    const result = validateGovernedArtifactMutation({
      req: mockRequest(),
      projectId: 77,
      artifactId: null,
      documentType: 'clinical-overview',
      generationMode: 'manual',
      lifecycleStatus: 'draft',
      originSurface: 'ri_copilot',
      clientTrack: 'biotech',
      submissionProgram: 'ind',
      persona: 'regulatory',
      regulatorScope: 'fda',
      evidenceMode: 'mixed',
      documentClass: 'strategy_memo',
      readinessGate: 'internal_review',
      approvalPathType: 'single_reviewer',
      recommendationSource: 'ana_ri',
      workspaceTarget: 'project',
      regulatorIntent: 'strategy',
      title: 'Clinical overview draft',
      content: 'Sufficiently complete governed content for create validation.',
      ctdSection: '2.5',
      sourceRefs: ['ref-1'],
      exportAllowed: false,
      eventType: 'artifact.created',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('resolves dossier placement and Module 3 gates', () => {
    const resolved = resolveGovernedContext({
      req: mockRequest(),
      projectId: 77,
      artifactId: null,
      documentType: 'module3',
      generationMode: 'ai_generated',
      lifecycleStatus: 'in_review',
      originSurface: 'cmc_workspace',
      clientTrack: 'biotech',
      submissionProgram: 'ectd',
      persona: 'cmc',
      regulatorScope: 'fda',
      evidenceMode: 'cmc_source',
      documentClass: 'module3_output',
      readinessGate: 'submission_candidate',
      workspaceTarget: 'dossier',
      dossierContainerId: 'dossier_44',
      title: 'Module 3.2.S Drug Substance',
      content:
        '## Materials\nLots and controls.\n## Methods\nValidated methods.\n## Controls\nSpecifications.',
      ctdSection: '3.2.S',
      sourceRefs: ['cmc-batch-001'],
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      eventType: 'artifact.created',
    });

    expect(resolved.validation.valid).toBe(true);
    expect(resolved.contract.workspaceTarget).toBe('dossier');
    expect(resolved.contract.placementTarget.workspace).toBe('dossier');
    expect(resolved.contract.exportEligibility.gateChecks?.some(g => g.name === 'module_mapping_present')).toBe(
      true
    );
  });

  it('fails inspection-ready when provenance is incomplete', () => {
    const result = validateGovernedArtifactMutation({
      req: mockRequest(),
      projectId: 55,
      artifactId: null,
      documentType: 'audit',
      generationMode: 'ai_generated',
      lifecycleStatus: 'locked',
      originSurface: 'api_route',
      clientTrack: 'biotech',
      submissionProgram: 'ectd',
      persona: 'qa',
      regulatorScope: 'fda',
      evidenceMode: 'mixed',
      documentClass: 'audit_report',
      readinessGate: 'inspection_ready',
      workspaceTarget: 'vault',
      artifactContainerId: 'vault_1',
      title: 'Inspection audit report',
      content: 'Detailed audit findings with controls and actions.',
      sourceRefs: ['artifact:123'],
      eventType: 'artifact.created',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['inspection_ready requires provenancePayload provider and model'])
    );
  });

  it('fails closed when required fields are missing', () => {
    const result = validateGovernedArtifactMutation({
      req: mockRequest({ userId: '' as any, userEmail: '' as any }),
      projectId: 0,
      artifactId: 9,
      documentType: '',
      generationMode: 'amendment',
      lifecycleStatus: 'draft',
      title: '',
      content: '',
      eventType: 'artifact.updated',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'projectId is required',
        'documentType is required',
        'editorPayload.title is required',
        'editorPayload.content is required',
      ])
    );
  });
});
