import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('../server/db', () => ({
  db: mockDb,
}));

vi.mock('../shared/schema', () => {
  const col = new Proxy({}, { get: (_t, p) => String(p) });
  return {
    c2cSubmissionPackages: col,
    c2cPackageSections: col,
    c2cArtifactSectionMap: col,
    c2cMilestones: col,
    c2cMilestoneSections: col,
    c2cSubmissionPolicies: col,
    c2cReadinessSnapshots: col,
    c2cBlockers: col,
    c2cAutomationRuns: col,
    c2cAutomationActions: col,
    c2cDigests: col,
    concept2cureArtifacts: col,
    concept2cureReviewThreads: col,
    concept2cureReviewTasks: col,
    concept2cureReviewAssignments: col,
    concept2cureNotifications: col,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ __op: 'eq' })),
  and: vi.fn(() => ({ __op: 'and' })),
  desc: vi.fn(() => ({ __op: 'desc' })),
  sql: vi.fn(() => ({ __op: 'sql' })),
  count: vi.fn(() => ({ __op: 'count' })),
  inArray: vi.fn(() => ({ __op: 'inArray' })),
  isNull: vi.fn(() => ({ __op: 'isNull' })),
  asc: vi.fn(() => ({ __op: 'asc' })),
}));

vi.mock('../server/submission-ops/policy-engine', () => ({
  resolvePolicy: vi.fn(),
  resolveAllPolicies: vi.fn(),
}));

vi.mock('../server/submission-ops/readiness-engine', () => ({
  computePackageReadiness: vi.fn(),
}));

vi.mock('../server/submission-ops/automation-runner', () => ({
  runAutomationSweep: vi.fn(),
}));

vi.mock('../server/services/intelligence/index.js', () => ({
  getProjectSignals: vi.fn(),
  analyzeCrossArtifactIntelligence: vi.fn(),
}));

import submissionOpsRouter from '../server/routes/submission-ops';

function appWithAuth() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).organizationId = 99;
    (req as any).user = { id: 777, organizationId: 99 };
    next();
  });
  app.use('/api/submission-ops', submissionOpsRouter);
  return app;
}

function queueSelect(results: any[]) {
  let idx = 0;
  mockDb.select.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => results[idx++] ?? []),
      innerJoin: vi.fn(() => ({
        where: vi.fn(async () => results[idx++] ?? []),
      })),
      orderBy: vi.fn(async () => results[idx++] ?? []),
    })),
  }));
}

describe('Submission Ops hardening runtime integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 on exact route when artifact and target section package projects mismatch', async () => {
    queueSelect([
      [{ id: 5, projectId: 200 }],
      [{ id: 8, packageDbId: 31 }],
      [{ id: 31, projectId: 201 }],
    ]);

    const res = await request(appWithAuth()).post('/api/submission-ops/artifact-section-map').send({
      artifactId: 5,
      sectionDbId: 8,
      reason: 'Map the protocol into the clinical section', // governed change
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Artifact and target section package must belong to the same project');
  });

  it('returns 400 on exact route when milestone section IDs are outside target package', async () => {
    queueSelect([[{ id: 31, packageId: 'pkg_abc', projectId: 200 }], []]);

    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 41 }]),
      })),
    }));

    const res = await request(appWithAuth())
      .post('/api/submission-ops/packages/pkg_abc/milestones')
      .send({
        title: 'Gate 1',
        sectionIds: [999],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('sectionId 999 does not belong to package pkg_abc');
  });
});
