import { describe, expect, it } from 'vitest';
import type { GovernedDocumentActionContract } from '../../../shared/types/document-contract';
import { resolveRulePack } from '../concept2cure/rules/ruleResolver';

function baseContract(): GovernedDocumentActionContract {
  return {
    projectId: 42,
    artifactId: null,
    documentType: 'module-3-draft',
    originSurface: 'cmc_workspace',
    generationMode: 'ai_generated',
    lifecycleStatus: 'draft',
    clientTrack: 'biotech',
    submissionProgram: 'ectd',
    persona: 'cmc',
    regulatorScope: 'fda',
    evidenceMode: 'cmc_source',
    documentClass: 'module3_output',
    readinessGate: 'submission_candidate',
    approvalPathType: 'regulated_dual_review',
    recommendationSource: 'cmc_builder',
    workspaceTarget: 'dossier',
    dossierContainerId: 'dossier-1',
    regulatorIntent: 'submission_authoring',
    editorPayload: {
      title: 'Module 3.2.S draft',
      content: 'Detailed CMC content with source mapping and controls.',
      ctdSection: '3.2.S',
    },
    placementTarget: {
      workspace: 'dossier',
      containerId: 'dossier-1',
      sectionKey: '3.2.S',
    },
    provenancePayload: {
      generatedAt: '2026-04-01T00:00:00.000Z',
      generatedBy: 'user-1',
      sourceRefs: ['batch-record-01'],
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    },
    auditEventPayload: {
      eventType: 'artifact.created',
      actorId: 'user-1',
      at: '2026-04-01T00:00:00.000Z',
    },
    exportEligibility: {
      allowed: false,
    },
  };
}

describe('resolveRulePack', () => {
  it('resolves biotech module3 constraints', () => {
    const result = resolveRulePack(baseContract());

    expect(result.requiredPlacementConstraints).toEqual(
      expect.arrayContaining(['module_mapping_present', 'ctdSection'])
    );
    expect(result.requiredEvidenceConstraints).toEqual(expect.arrayContaining(['source_refs_present']));
    expect(result.disallowedCombinations).toEqual([]);
  });

  it('flags disallowed track/class combinations', () => {
    const result = resolveRulePack({
      ...baseContract(),
      clientTrack: 'device',
      submissionProgram: '510k',
    });

    expect(result.disallowedCombinations).toEqual(
      expect.arrayContaining(['documentClass module3_output is not allowed for clientTrack device'])
    );
  });
});
