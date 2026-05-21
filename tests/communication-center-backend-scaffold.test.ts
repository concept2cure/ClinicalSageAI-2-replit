import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockGetSecureOrgId, mockGetOrCreateProfile, mockDbInsertValues } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSecureOrgId: vi.fn(() => '2'),
  mockGetOrCreateProfile: vi.fn(async () => 123),
  mockDbInsertValues: vi.fn(async () => undefined),
}));

vi.mock('../server/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = 11;
    req.user = { id: 11 };
    next();
  },
}));

vi.mock('../server/utils/tenantContext', () => ({
  getSecureOrgId: (...args: any[]) => mockGetSecureOrgId(...args),
}));

vi.mock('../server/services/intelligence/project-intelligence-service', () => ({
  getOrCreateProfile: (...args: any[]) => mockGetOrCreateProfile(...args),
}));

vi.mock('../server/db', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
  db: {
    insert: () => ({ values: (...args: any[]) => mockDbInsertValues(...args) }),
    // Routes added since this test was written reach for db.select.from(...);
    // a chainable stub keeps the heuristic-mode happy path reachable.
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
  },
}));

vi.mock('@shared/schema', async (importOriginal) => {
  // The route reaches for several tables from @shared/schema. Spreading the
  // real exports lets new ones land without a mock update; the explicit
  // overrides keep test fixtures predictable.
  const actual = await importOriginal<typeof import('@shared/schema')>();
  return {
    ...actual,
    projectMemoryEntries: {},
  };
});

import regulatoryCorrespondenceRoutes from '../server/routes/regulatory-correspondence';

function appWithAuth() {
  const app = express();
  app.use(express.json());
  app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes);
  return app;
}

describe('Communication center runtime integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE = 'true';
    delete process.env.REG_CORRESPONDENCE_ISSUE_PARSER_MODE;

    mockQuery.mockImplementation(async (sqlText: string, params?: any[]) => {
      if (sqlText.includes('to_regclass')) return { rows: [{ tbl: 'c2c_submissions' }] };
      if (sqlText.includes('FROM c2c_submissions') && sqlText.includes('WHERE id = $1')) {
        return { rows: [{ id: params?.[0], project_id: 17 }] };
      }
      return { rows: [] };
    });
  });


  it('returns parser governance health for runtime readiness checks', async () => {
    const res = await request(appWithAuth()).get('/api/regulatory-correspondence/parser/health');

    expect(res.status).toBe(200);
    expect(res.body.data.parserVersion).toBe('governed-parser-pipeline-v1');
    expect(res.body.data.parserGovernance.mode).toBe('heuristic_v2');
    expect(res.body.data.parserGovernance.available).toBe(true);
  });


  it('rejects intake payloads when parsedText and summary are effectively empty', async () => {
    const res = await request(appWithAuth())
      .post('/api/regulatory-correspondence/correspondence/intake')
      .send({
        projectId: 17,
        submissionId: 'sub_1',
        communicationType: 'deficiency_letter',
        subject: 'Agency deficiency request',
        parsedText: '   ',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('uses governed heuristic-mode extraction contract for exact intake route', async () => {
    const res = await request(appWithAuth())
      .post('/api/regulatory-correspondence/correspondence/intake')
      .send({
        projectId: 17,
        submissionId: 'sub_1',
        communicationType: 'deficiency_letter',
        subject: 'Agency deficiency request',
        parsedText: 'Deficiency and missing information for CMC stability package.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.parserMetadata.parserMode).toBe('heuristic');
    expect(res.body.data.parserMetadata.responseContract).toBe('governed_heuristic_mode_v1');
    expect(res.body.data.parserMetadata.confidenceMethod).toBe('rule_weighted_keyword_parser');
    expect(res.body.issues[0].humanReviewStatus).toBe('pending');
  });

  it('fails closed on the exact intake route when heuristic mode is disabled', async () => {
    process.env.ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE = 'false';
    process.env.REG_CORRESPONDENCE_ISSUE_PARSER_MODE = 'disabled';

    const res = await request(appWithAuth())
      .post('/api/regulatory-correspondence/correspondence/intake')
      .send({
        projectId: 17,
        submissionId: 'sub_1',
        communicationType: 'deficiency_letter',
        subject: 'Agency deficiency request',
        parsedText: 'Missing information regarding stability.',
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Issue parser unavailable');
    expect(res.body.message).toContain('ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE=true');
    expect(res.body.parserGovernance.mode).toBe('disabled');
  });
});
