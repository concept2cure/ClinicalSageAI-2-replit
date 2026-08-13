/**
 * Cross-tenant read scope for 510(k) workflow routes.
 *
 * Regression tests for the IDOR fix in server/routes/510k-workflow-routes.ts:
 * every read endpoint that takes a projectId from the path (stage-data,
 * audit-trail, data-lineage, versions, compliance-report, and the plain
 * workflow GET) must verify — same convention as the save handler in the same
 * file — that the fda510kProjects row for that projectId does not belong to a
 * different org. A cross-tenant request gets 404 (never the data, and never a
 * 403 that would confirm the project exists).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { authState, tracker, audit, dbState } = vi.hoisted(() => ({
  authState: { user: null as Record<string, any> | null },
  tracker: {
    trackWorkflowAction: vi.fn(),
    createDocumentVersion: vi.fn(),
    getAuditTrail: vi.fn(),
    getDataLineage: vi.fn(),
    getVersionHistory: vi.fn(),
    generateComplianceReport: vi.fn(),
  },
  audit: { logAction: vi.fn() },
  dbState: {
    // Org that owns the fda510kProjects row for the requested projectId;
    // null = no row exists (e.g. demo projects, which never get a row).
    projectOwnerOrg: null as number | null,
    stageRows: [] as any[],
  },
}));

vi.mock('../../server/services/510kComplianceTracker', () => ({ default: tracker }));
vi.mock('../../server/services/auditService', () => ({ default: audit }));
vi.mock('../../server/services/DocumentOrchestrationService', () => ({
  default: class {
    async orchestrateDocumentGeneration() {
      return {};
    }
  },
}));
vi.mock('../../server/services/documentTemplateMapper', () => ({
  TemplateMapper: { mapWorkflowToTemplate: vi.fn(() => ({ sections: {}, metadata: {} })) },
}));
vi.mock('../../server/storage', () => ({
  MemStorage: class {
    async createCerSection() {
      return {};
    }
  },
}));

// The route builds its query handle via drizzle(pool). Mock the driver factory
// with a chain that emulates the two org-scoped selects the read path issues:
//   - fda_510k_projects: the guard's "projectId exists under a DIFFERENT org"
//     probe — matches exactly when an owning row exists for another org;
//   - fda_510k_stage_progress: the stage-data payload rows.
// Tables are identified via drizzle's global name symbol so this mock does not
// depend on sharing a schema module instance with the route.
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: () => ({
    select: () => ({
      from: (table: any) => ({
        where: async () => {
          const tableName = table?.[Symbol.for('drizzle:Name')];
          if (tableName === 'fda_510k_projects') {
            const callerOrg = Number(authState.user?.organizationId);
            if (dbState.projectOwnerOrg !== null && dbState.projectOwnerOrg !== callerOrg) {
              return [{ id: 1, projectId: 123, organizationId: dbState.projectOwnerOrg }];
            }
            return [];
          }
          if (tableName === 'fda_510k_stage_progress') {
            return dbState.stageRows;
          }
          return [];
        },
      }),
    }),
  }),
}));

import { create510kWorkflowRoutes } from '../../server/routes/510k-workflow-routes';

const PROJECT_ID = 123;

let app: express.Express;

beforeEach(() => {
  vi.clearAllMocks();

  // Caller is org 2; the project belongs to org 1 (cross-tenant by default).
  authState.user = { id: 42, organizationId: 2 };
  dbState.projectOwnerOrg = 1;
  dbState.stageRows = [
    {
      collectedData: { deviceName: 'TENANT-1-SECRET-DEVICE' },
      status: 'in_progress',
      progress: 50,
    },
  ];

  // Sentinel tenant-1 data: none of it may ever appear in a denial response.
  tracker.getAuditTrail.mockResolvedValue({
    success: true,
    auditTrail: [{ action: 'SAVE', userId: 7, data: { deviceName: 'TENANT-1-SECRET-DEVICE' } }],
  });
  tracker.getDataLineage.mockResolvedValue({
    success: true,
    lineage: [{ source: 'TENANT-1-SECRET-LINEAGE' }],
  });
  tracker.getVersionHistory.mockResolvedValue({
    success: true,
    versions: [{ changeDescription: 'TENANT-1-SECRET-VERSION' }],
  });
  tracker.generateComplianceReport.mockResolvedValue({
    projectId: String(PROJECT_ID),
    completeness: 61,
    detail: 'TENANT-1-SECRET-REPORT',
  });

  app = express();
  app.use((req, _res, next) => {
    (req as any).user = authState.user;
    next();
  });
  app.use('/api/510k-workflow', create510kWorkflowRoutes({} as any));
});

describe('510k workflow routes — cross-tenant read scope', () => {
  const trackerReads: Array<{ label: string; path: string; spy: () => ReturnType<typeof vi.fn> }> =
    [
      {
        label: 'compliance report',
        path: `/api/510k-workflow/${PROJECT_ID}/compliance-report`,
        spy: () => tracker.generateComplianceReport,
      },
      {
        label: 'audit trail',
        path: `/api/510k-workflow/${PROJECT_ID}/audit-trail`,
        spy: () => tracker.getAuditTrail,
      },
      {
        label: 'data lineage',
        path: `/api/510k-workflow/${PROJECT_ID}/data-lineage`,
        spy: () => tracker.getDataLineage,
      },
      {
        label: 'version history',
        path: `/api/510k-workflow/${PROJECT_ID}/versions`,
        spy: () => tracker.getVersionHistory,
      },
    ];

  for (const { label, path, spy } of trackerReads) {
    it(`denies the ${label} for a project owned by another org — 404, no data`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Project not found' });
      // The tracker must never even be consulted for another tenant's project.
      expect(spy()).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain('TENANT-1-SECRET');
    });
  }

  it('denies stage-data for a project owned by another org — 404, no collected data', async () => {
    const res = await request(app).get(
      `/api/510k-workflow/${PROJECT_ID}/stage-data?stage=setup&section=device_intake`
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Project not found' });
    expect(res.body.collectedData).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('TENANT-1-SECRET');
  });

  it('denies the plain workflow GET for a project owned by another org — 404', async () => {
    const res = await request(app).get(`/api/510k-workflow/${PROJECT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Project not found' });
  });

  it('still serves the compliance report to the owning org', async () => {
    authState.user = { id: 7, organizationId: 1 };
    const res = await request(app).get(`/api/510k-workflow/${PROJECT_ID}/compliance-report`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.report.detail).toBe('TENANT-1-SECRET-REPORT');
    expect(tracker.generateComplianceReport).toHaveBeenCalledWith(String(PROJECT_ID));
  });

  it('still serves stage-data to the owning org', async () => {
    authState.user = { id: 7, organizationId: 1 };
    const res = await request(app).get(`/api/510k-workflow/${PROJECT_ID}/stage-data`);
    expect(res.status).toBe(200);
    expect(res.body.collectedData).toEqual({ deviceName: 'TENANT-1-SECRET-DEVICE' });
  });

  it('rejects reads with no organization context — 401, tracker never consulted', async () => {
    authState.user = null;
    const res = await request(app).get(`/api/510k-workflow/${PROJECT_ID}/audit-trail`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Organization context required' });
    expect(tracker.getAuditTrail).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric projectId with 404 instead of querying the tracker', async () => {
    const res = await request(app).get('/api/510k-workflow/not-a-number/compliance-report');
    expect(res.status).toBe(404);
    expect(tracker.generateComplianceReport).not.toHaveBeenCalled();
  });

  it('does not block reads for a projectId with no owning row (demo-project semantics)', async () => {
    // Mirrors the save handler: demo projects (id >= 500) never get an
    // fda510kProjects row, so the cross-org guard has nothing to match on and
    // the read proceeds for the authenticated caller.
    dbState.projectOwnerOrg = null;
    const res = await request(app).get('/api/510k-workflow/510/audit-trail');
    expect(res.status).toBe(200);
    expect(tracker.getAuditTrail).toHaveBeenCalledWith('510', expect.any(Object));
  });
});
