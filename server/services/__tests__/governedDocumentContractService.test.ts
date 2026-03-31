import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { validateGovernedArtifactMutation } from '../concept2cure/governedDocumentContractService';

function mockRequest(overrides?: Partial<Request>): Request {
  return {
    userId: 'user_42',
    userEmail: 'qa@example.com',
    userRole: 'author',
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
