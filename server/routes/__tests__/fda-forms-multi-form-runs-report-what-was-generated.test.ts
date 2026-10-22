/**
 * The FDA-forms routes that draft several forms in one call say which forms
 * were drafted and saved and which were not — with a fixed reason, never the
 * caught error's text, and never as a blanket 200 "success".
 *
 * Until 2026-10-15:
 *   - POST …/auto-generate put each failed form's `error.message` (the
 *     database's own text) into a 200 body headed `success: true`,
 *     "Forms auto-generated successfully".
 *   - POST …/generate-all answered "All FDA forms generated successfully"
 *     whatever the orchestration produced — the service dropped a form it
 *     could not draft or save — and ran with no organization context at all.
 *   - POST …/generate-stage did the same as auto-generate.
 *   - GET …/forms listed FDA_3654 as "FDA Form 3654 - Certification/Disclosure
 *     Statement"; the repository's own registry (server/config/FDAFormsRegistry.ts)
 *     and catalog snapshot say Form FDA 3654 is the Standards Data Report for
 *     510(k)s.
 *
 * The database and the orchestration service are replaced; the router and the
 * form generator are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { getTableName } from 'drizzle-orm';

const S = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  failInsertOf: null as string | null,
  inserted: [] as Array<Record<string, unknown>>,
  orchestrate: vi.fn(),
  user: { id: 5, organizationId: 7 } as Record<string, unknown>,
}));

function chain(table: unknown) {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  const read = (): Promise<Array<Record<string, unknown>>> => Promise.resolve(S.rows[name] ?? []);
  return { where: () => Object.assign(read(), { limit: () => read() }) };
}

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: (table: unknown) => chain(table) }),
    execute: async () => ({ rows: [] }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (S.failInsertOf && v.documentType === S.failInsertOf) {
          throw new Error('SENTINEL-DB-DETAIL: duplicate key value violates unique constraint "fda_510k_documents_document_id_key"');
        }
        S.inserted.push(v);
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock('../../services/DocumentOrchestrationService', () => ({
  default: class {
    orchestrateDocumentGeneration(...a: unknown[]) {
      return S.orchestrate(...a);
    }
  },
}));

import router from '../fda-forms.routes';
import FDAFormGenerator from '../../services/FDAFormGenerator';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = S.user;
    next();
  });
  a.use('/api/fda-forms', router);
  return a;
}

beforeEach(() => {
  S.failInsertOf = null;
  S.inserted.length = 0;
  S.orchestrate.mockReset();
  S.user = { id: 5, organizationId: 7 };
  S.rows = {
    fda_510k_projects: [{ id: 1, projectId: 12, organizationId: 7, deviceName: 'Widget', metadata: {} }],
    projects: [{ id: 12 }],
    organizations: [{ id: 7, name: 'Acme Devices' }],
    fda_510k_stage_progress: [],
    fda_510k_documents: [],
    project_charters: [],
  };
});

describe('POST /api/fda-forms/project/:projectId/auto-generate', () => {
  it('names the form it could not save with a fixed reason, and is not a 200 success', async () => {
    S.failInsertOf = 'FDA_3881';
    const r = await request(app()).post('/api/fda-forms/project/12/auto-generate');

    expect(r.status).toBe(207);
    expect(r.body.success).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('SENTINEL-DB-DETAIL');
    const failed = (r.body.results as Array<{ formType: string; success: boolean; reason?: string }>).filter((x) => !x.success);
    expect(failed).toEqual([{ formType: 'FDA_3881', success: false, reason: expect.any(String) }]);
    expect(r.body.message).toMatch(/FDA_3881/);
    expect(r.body.message).not.toMatch(/successfully/);
  });

  it('answers 200 success only when every form was drafted and saved', async () => {
    const r = await request(app()).post('/api/fda-forms/project/12/auto-generate');

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect((r.body.results as Array<{ success: boolean }>).every((x) => x.success)).toBe(true);
    expect(S.inserted.length).toBe(r.body.results.length);
  });
});

describe('POST /api/fda-forms/project/:projectId/generate-all', () => {
  it('reports the forms the orchestration did not produce instead of "All FDA forms generated successfully"', async () => {
    S.orchestrate.mockResolvedValueOnce({
      success: false,
      forms: [{ documentType: 'FDA_3514' }, { documentType: 'FDA_3881' }, { documentType: 'FDA_3654' }],
      failed: [{ formType: 'FDA_3601', reason: 'The form was drafted but could not be saved.' }],
      message: '3 of 4 FDA forms drafted and saved; not saved: FDA_3601.',
    });
    const r = await request(app()).post('/api/fda-forms/project/12/generate-all');

    expect(r.status).toBe(207);
    expect(r.body.success).toBe(false);
    expect(r.body.failed).toEqual([{ formType: 'FDA_3601', reason: 'The form was drafted but could not be saved.' }]);
    expect(r.body.message).not.toMatch(/All FDA forms generated successfully/);
    expect(r.body.forms).toHaveLength(3);
  });

  it('refuses without an organization context, and orchestrates nothing', async () => {
    S.user = { id: 5 };
    const r = await request(app()).post('/api/fda-forms/project/12/generate-all');

    expect(r.status).toBe(401);
    expect(S.orchestrate).not.toHaveBeenCalled();
  });
});

describe('POST /api/fda-forms/project/:projectId/generate-stage/:stage', () => {
  // 2026-10-15: this ran stage 0 and expected every form to fail — the route's
  // stage map named ids ('form_3514') no registry key matched. It drafts them
  // now (fda-forms-generate-stage-drafts-the-registry-forms.test.ts); a form
  // whose draft fails is made to fail here.
  it('reports a form it could not draft with a fixed reason, and is not a 200 success', async () => {
    const draft = vi.spyOn(FDAFormGenerator.prototype, 'generateSmartForm');
    draft.mockRejectedValueOnce(new Error('SENTINEL-DB-DETAIL: relation "fda_510k_stage_progress" does not exist'));
    try {
      const r = await request(app()).post('/api/fda-forms/project/12/generate-stage/0');

      expect(r.status).toBe(207);
      expect(r.body.success).toBe(false);
      expect(JSON.stringify(r.body)).not.toContain('SENTINEL-DB-DETAIL');
      const [first, second] = r.body.results as Array<{ formId: string; status: string; reason?: string }>;
      expect(first).toMatchObject({ formId: 'FDA_3514', status: 'error', reason: expect.any(String) });
      expect(second).toMatchObject({ formId: 'FDA_3601', status: 'success' });
    } finally {
      draft.mockRestore();
    }
  });
});

describe('GET /api/fda-forms/project/:projectId/forms', () => {
  it('does not list the certification/disclosure statement as Form FDA 3654', async () => {
    const r = await request(app()).get('/api/fda-forms/project/12/forms');

    expect(r.status).toBe(200);
    const entry = (r.body.forms as Array<{ id: string; name: string }>).find((f) => f.id === 'FDA_3654')!;
    expect(entry.name).toMatch(/Certification\/Disclosure Statement/);
    expect(entry.name).not.toMatch(/3654/);
  });
});
