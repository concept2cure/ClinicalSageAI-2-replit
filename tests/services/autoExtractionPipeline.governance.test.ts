import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockPoolQuery, mockResolveGovernedContext, mockAiChat } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockResolveGovernedContext: vi.fn(),
  mockAiChat: vi.fn(),
}));

vi.mock('../../server/db', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('../../server/lib/unified-ai-client', () => ({
  ai: {
    chat: mockAiChat,
  },
}));

vi.mock('../../server/services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: mockResolveGovernedContext,
}));

import { queueExtraction, getExtractionStatus } from '../../server/services/autoExtractionPipeline';

async function waitForStatus(jobId: string, expected: string, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = getExtractionStatus(jobId);
    if (job?.status === expected) return job;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return getExtractionStatus(jobId);
}

describe('autoExtractionPipeline governed artifact enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAiChat.mockResolvedValue({
      content: JSON.stringify({
        documentType: 'evidence_memo',
        submissionModule: null,
        therapeuticArea: null,
        compoundName: null,
        studyId: null,
        phase: null,
        language: 'en',
        confidence: 0.9,
      }),
    });
    mockResolveGovernedContext.mockReturnValue({
      validation: {
        valid: true,
        errors: [],
        warnings: [],
      },
      contract: {
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        documentClass: 'evidence_memo',
        readinessGate: 'internal_review',
        workspaceTarget: 'project',
        originSurface: 'import_pipeline',
        recommendationSource: 'report_engine',
        regulatorIntent: 'evidence_analysis',
        exportEligibility: {
          gateChecks: [],
          blockingReasons: [],
          readinessOutcome: 'conditional',
        },
      },
      resolved: {},
    });
    mockPoolQuery.mockImplementation((sql: string) => {
      const statement = String(sql).toLowerCase();
      if (statement.includes('select content from concept2cure_artifacts')) {
        return Promise.resolve({ rows: [{ content: 'Clinical evidence text with section support.' }] });
      }
      if (statement.includes('select content, file_path from uploads')) {
        return Promise.resolve({ rows: [] });
      }
      if (statement.includes('insert into auto_extraction_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      if (statement.includes('update auto_extraction_jobs')) {
        return Promise.resolve({ rows: [] });
      }
      if (statement.includes('insert into regulatory_audit_logs')) {
        return Promise.resolve({ rows: [] });
      }
      if (statement.includes('insert into concept2cure_artifacts')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it('fails extraction job when governed context is invalid during artifact storage', async () => {
    mockResolveGovernedContext.mockReset();
    mockResolveGovernedContext.mockReturnValue({
      validation: {
        valid: false,
        errors: ['clientTrack is required'],
        warnings: [],
      },
      contract: {
        exportEligibility: {
          gateChecks: [],
          blockingReasons: ['document_class_rules_satisfied'],
          readinessOutcome: 'blocked',
        },
      },
      resolved: {},
    });

    const queued = await queueExtraction('file-1', 'sample.txt', 1200, 101, 22, 7, {
      immediate: true,
    });
    const failedJob = await waitForStatus(queued.id, 'failed');
    expect(failedJob).toBeTruthy();
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error).toContain('governed extraction');
  });
});
