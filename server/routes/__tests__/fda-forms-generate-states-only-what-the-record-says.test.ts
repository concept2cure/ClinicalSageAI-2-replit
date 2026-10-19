/**
 * POST /api/fda-forms/project/:projectId/generate/:formType drafts from the
 * project's own record, and a failed read is an error.
 *
 * Until 2026-10-15 the route never read the project charter, so Form 3514
 * printed "Traditional 510(k)" whatever 510(k) type the charter recorded; Form
 * 3654 was stored with complianceScore 100 while every attestation was
 * unchecked, with the project lead's name in the signature slot; and
 * fetchProjectData caught every read failure and returned null, which the
 * route answered as 404 "Project not found".
 *
 * The database is the only thing replaced; the router and generator are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { getTableName } from 'drizzle-orm';

const S = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  failOn: null as string | null,
  inserted: [] as Array<Record<string, unknown>>,
}));

/** A drizzle chain whose `.where()` is both awaitable and `.limit()`-able. */
function chain(table: unknown) {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  const read = (): Promise<Array<Record<string, unknown>>> =>
    S.failOn === name ? Promise.reject(new Error(`SENTINEL-DB-DETAIL: read of ${name} failed`)) : Promise.resolve(S.rows[name] ?? []);
  return {
    where: () => {
      const awaited = read();
      // Marked handled for callers that chain .limit() instead; an await still sees the rejection.
      awaited.catch(() => undefined);
      return Object.assign(awaited, { limit: () => read() });
    },
  };
}

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: (table: unknown) => chain(table) }),
    execute: async () => ({ rows: [] }),
    insert: () => ({ values: async (v: Record<string, unknown>) => { S.inserted.push(v); } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock('../../services/DocumentOrchestrationService', () => ({ default: class {} }));

import router from '../fda-forms.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/fda-forms', router);
  return a;
}

beforeEach(() => {
  S.failOn = null;
  S.inserted.length = 0;
  S.rows = {
    fda_510k_projects: [{ id: 1, projectId: 12, organizationId: 7, deviceName: 'Widget', deviceClassification: 'Class II', productCode: 'ABC', metadata: {} }],
    projects: [{ id: 12 }],
    organizations: [{ id: 7, name: 'Acme Devices' }],
    fda_510k_stage_progress: [],
    fda_510k_documents: [],
    project_charters: [],
  };
});

describe('POST /api/fda-forms/project/:projectId/generate/FDA_3514', () => {
  it('prints the 510(k) type the charter records', async () => {
    S.rows.project_charters = [{ k510Config: { submissionSubtype: 'abbreviated' } }];
    const r = await request(app()).post('/api/fda-forms/project/12/generate/FDA_3514');
    expect(r.status).toBe(200);
    expect(r.body.form.formData.submissionType).toBe('Abbreviated 510(k)');
    expect(S.inserted[0].formData).toMatchObject({ submissionType: 'Abbreviated 510(k)' });
  });

  it('says the type is not stated when the project has no charter', async () => {
    const r = await request(app()).post('/api/fda-forms/project/12/generate/FDA_3514');
    expect(r.status).toBe(200);
    expect(r.body.form.formData.submissionType).toBeNull();
    expect(r.body.form.htmlContent).not.toContain('Traditional 510(k)');
  });
});

describe('POST /api/fda-forms/project/:projectId/generate/FDA_3654', () => {
  it('stores a completeness below 100 while the attestations are unmade, and names no signer', async () => {
    S.rows.fda_510k_stage_progress = [
      { stageName: 'setup', collectedData: { projectLead: 'Pat Lead' } },
      { stageName: 'certification', collectedData: { certifierName: 'Dana Doe', certifierTitle: 'VP Regulatory' } },
    ];
    const r = await request(app()).post('/api/fda-forms/project/12/generate/FDA_3654');
    expect(r.status).toBe(200);
    expect(S.inserted[0].complianceScore).toBeLessThan(100);
    expect(r.body.form.htmlContent).not.toContain('Pat Lead');
    expect(/<strong>Signature:<\/strong>([\s\S]*?)<\/span>/.exec(r.body.form.htmlContent)![1].trim()).toBe('');
  });
});

describe('a failed read is an error, not "Project not found"', () => {
  it.each(['fda_510k_stage_progress', 'project_charters'])('answers 500 when the %s read fails', async (table) => {
    S.failOn = table;
    const r = await request(app()).post('/api/fda-forms/project/12/generate/FDA_3514');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('SENTINEL-DB-DETAIL');
    expect(S.inserted).toEqual([]);
  });
});
