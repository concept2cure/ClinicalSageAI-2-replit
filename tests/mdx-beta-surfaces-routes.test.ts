/**
 * Integration tests for the MDX beta-surface routes added in migration
 * 20260507. Validates HTTP envelope, auth gate, Zod validation, and
 * tenant-scoping per surface.
 *
 * Coverage: AnA review queue + Vault aggregator + UDI CRUD + risk
 * management CRUD + software lifecycle CRUD + Engineering aggregator.
 * The underlying SQL is mocked at the pool layer — these tests assert
 * route behavior, not query correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

/* Stub the pg pool used by every route file in this batch. Each test
   sets the next query result by pushing onto pool.__queueResult — the
   default returns { rows: [], rowCount: 0 } so unmocked queries
   produce a sensible empty response. */
const queryFn = vi.fn();
const connectFn = vi.fn();

/** Risk/Engineering use the request's current actor and transaction, while these
 * narrow envelope/score cases retain their existing domain-query fixtures. */
function requestClient() {
  const ownership = new Map<string, { rows: Array<Record<string, unknown>> }>();
  return { query: async (sql: string, params?: unknown[]) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
    if (sql.includes('SELECT ou.role')) return { rows: [{ role: 'admin' }] };
    if (sql.includes('FROM regulatory_programs') && typeof params?.[0] === 'string') {
      const key = params[0];
      if (!ownership.has(key)) ownership.set(key, await queryFn(sql, params));
      return ownership.get(key)!;
    }
    if (sql.includes('client_workspace_id AS "clientWorkspaceId"')) return { rows: [{ id: 11, clientWorkspaceId: 71 }] };
    if (sql.includes('FROM projects p LEFT JOIN project_visibility_settings')) return { rows: [{
      id: 11, owner_id: 777, created_by_id: 777, settings: {}, visibility: 'org_public', members: [], review_assigned: false,
    }] };
    return queryFn(sql, params);
  } };
}

vi.mock('../server/db', () => ({
  pool: {
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  },
  getPool: () => ({
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  }),
  db: {},
}));

/* Stub the constants module so REGULATORY_PATHWAYS is concrete in the
   z.enum() construction inside mdx-ana-drafts.ts. */
vi.mock('../shared/constants/mdx', () => ({
  REGULATORY_PATHWAYS: ['k510', 'pma', 'cer'] as const,
  REGULATORY_PATH_TO_PATHWAY: { '510k': 'k510', pma: 'pma', cer: 'cer' },
}));

import anaDraftsRouter from '../server/routes/mdx-ana-drafts';
import udiRouter from '../server/routes/mdx-udi';
import riskRouter from '../server/routes/mdx-risk-management';
import softwareRouter from '../server/routes/mdx-software';
import engineeringRouter from '../server/routes/mdx-engineering';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      /* A role: every governed write on these routers is role-gated
         (requireEditorAccess). The harness attached none and still passed,
         which is what it failed to notice. */
      (req as any).user = { id: 777, organizationId: 99, role: 'admin' };
      (req as any).userRole = 'admin';
      Object.assign(req, { dbClient: requestClient() });
      next();
    });
  }
  app.use('/api/mdx', anaDraftsRouter);
  app.use('/api/mdx', udiRouter);
  app.use('/api/mdx', riskRouter);
  app.use('/api/mdx', softwareRouter);
  app.use('/api/mdx', engineeringRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
});

/* ─── Auth gate ──────────────────────────────────────────────────── */

describe('mdx beta routes — auth gate', () => {
  it('AnA review queue returns 403 without org context', async () => {
    const res = await request(makeApp({ withAuth: false })).get('/api/mdx/ana-drafts');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Organization context required/);
  });

  it('UDI list returns 403 without org context', async () => {
    const res = await request(makeApp({ withAuth: false })).get('/api/mdx/udi');
    expect(res.status).toBe(403);
  });

  it('Risk items list returns 403 without org context', async () => {
    const res = await request(makeApp({ withAuth: false })).get('/api/mdx/risk-items');
    expect(res.status).toBe(403);
  });

  it('Software list returns 403 without org context', async () => {
    const res = await request(makeApp({ withAuth: false })).get('/api/mdx/software');
    expect(res.status).toBe(403);
  });
});

/* ─── AnA review queue ───────────────────────────────────────────── */

describe('GET /api/mdx/ana-drafts', () => {
  it('returns the canonical envelope with the card list', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [
        {
          section_id:      42,
          section_key:     'substantial-equivalence',
          section_number:  '11',
          section_title:   'Substantial Equivalence Discussion',
          drafted_at:      new Date('2026-05-15T10:00:00Z'),
          drafted_summary: 'drafted SE narrative against K251234',
          category:        'device',
          program_id:      PROGRAM_ID,
          program_code:    'BX-204',
          program_name:    'BX-204 CGM',
          regulatory_path: '510k',
        },
      ],
    });
    const res = await request(makeApp()).get('/api/mdx/ana-drafts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      sectionId:   42,
      sectionKey:  'substantial-equivalence',
      pathway:     'k510',
      programCode: 'BX-204',
    });
    expect(res.body.meta.count).toBe(1);
  });

  it('rejects an invalid pathway value', async () => {
    const res = await request(makeApp()).get('/api/mdx/ana-drafts?pathway=oops');
    expect(res.status).toBe(422);
  });

  it('rejects an out-of-range limit', async () => {
    const res = await request(makeApp()).get('/api/mdx/ana-drafts?limit=9999');
    expect(res.status).toBe(422);
  });

  it('surfaces a 409 when the draft_source column is missing', async () => {
    const err = Object.assign(new Error('column does not exist'), { code: '42703' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp()).get('/api/mdx/ana-drafts');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/20260506/);
  });
});

/* No vault aggregator: GET /api/mdx/vault left with the device vault, which
   folded into the Vault (D2, fold F3, 2026-10-29). The Vault's reads are
   tested in server/routes/c2c/__tests__/project-vault-governed-artifacts*.test.ts
   and server/routes/__tests__/artifacts-center-accessible-projects.pglite.test.ts. */

/* ─── UDI CRUD ───────────────────────────────────────────────────── */

describe('UDI records routes', () => {
  it('GET /api/mdx/udi returns the canonical list envelope', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 1, device_name: 'CGM v2', udi_di: '00819...', issuing_agency: 'GS1', gudid_status: 'draft' }] });
    const res = await request(makeApp()).get('/api/mdx/udi');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.count).toBe(1);
  });

  it('POST /api/mdx/udi rejects missing required fields', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/udi')
      .send({ deviceName: 'CGM v2' });
    expect(res.status).toBe(422);
  });

  it('POST /api/mdx/udi returns 201 with the created row', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 99, device_name: 'CGM v2', udi_di: '00819000000001', issuing_agency: 'GS1' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/udi')
      .send({
        deviceName: 'CGM v2',
        udiDi: '00819000000001',
        issuingAgency: 'GS1',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(99);
  });

  it('POST /api/mdx/udi surfaces a 409 on duplicate UDI-DI', async () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp())
      .post('/api/mdx/udi')
      .send({
        deviceName: 'CGM v2',
        udiDi: '00819000000001',
        issuingAgency: 'GS1',
      });
    expect(res.status).toBe(409);
  });

  it('POST /api/mdx/udi/:id/submit-gudid flips status', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, gudid_status: 'submitted', gudid_submitted_at: new Date() }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/udi/1/submit-gudid')
      .send({ payload: { foo: 'bar' } });
    expect(res.status).toBe(200);
    expect(res.body.data.gudid_status).toBe('submitted');
  });
});

/* ─── Risk management CRUD ───────────────────────────────────────── */

describe('risk-items routes', () => {
  it('POST validates severity in [1..5]', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/risk-items')
      .send({ hazard: 'sharp edge', harm: 'cut', severity: 9, probability: 2 });
    expect(res.status).toBe(422);
  });

  it('POST computes initial_risk = severity × probability', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, hazard: 'sharp edge', harm: 'cut', severity: 4, probability: 3, initial_risk: 12 }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/risk-items')
      .send({ hazard: 'sharp edge', harm: 'cut', severity: 4, probability: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.initial_risk).toBe(12);
  });

  it('GET /risk-summary/:programId requires UUID', async () => {
    const res = await request(makeApp()).get('/api/mdx/risk-summary/not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('POST /risk-items/:id/controls 404s on cross-tenant id', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] }); // own check returns nothing
    const res = await request(makeApp())
      .post('/api/mdx/risk-items/999/controls')
      .send({ description: 'add interlock', controlType: 'protective_measure' });
    expect(res.status).toBe(404);
  });
});

/* ─── Software lifecycle CRUD ────────────────────────────────────── */

describe('software lifecycle routes', () => {
  it('POST rejects unknown item_kind', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/software')
      .send({ doc_level: 'basic', item_kind: 'invalid', title: 'foo' });
    expect(res.status).toBe(422);
  });

  it('POST rejects unknown doc_level', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/software')
      .send({ doc_level: 'over9000', item_kind: 'srs', title: 'foo' });
    expect(res.status).toBe(422);
  });

  it('GET /software-summary requires UUID', async () => {
    const res = await request(makeApp()).get('/api/mdx/software-summary/not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('GET /software-summary returns matrix + completion %', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ doc_level: 'enhanced' }] })
      .mockResolvedValueOnce({
        rows: [
          { item_kind: 'srs', n: 1, approved: 1 },
          { item_kind: 'sbom', n: 1, approved: 0 },
        ],
      });
    const res = await request(makeApp()).get(`/api/mdx/software-summary/${PROGRAM_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.docLevel).toBe('enhanced');
    expect(res.body.data.matrix.length).toBeGreaterThan(0);
    expect(res.body.data.matrix.find((m: any) => m.kind === 'srs').approved).toBe(true);
  });
});

/* ─── Engineering aggregator ─────────────────────────────────────── */

describe('GET /api/mdx/engineering/:programId', () => {
  it('rejects non-UUID program', async () => {
    const res = await request(makeApp()).get('/api/mdx/engineering/foo');
    expect(res.status).toBe(422);
  });

  it('404s when program not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] }); // program check empty
    const res = await request(makeApp()).get(`/api/mdx/engineering/${PROGRAM_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns the panel shape the useEngineering hook destructures', async () => {
    /* The route used to return { dhfCompletion, openEcrs, bomLines,
       riskLastUpdated, deliverables } while its only consumer read
       { dhf, trace, risks, ecrs, issues, documents }. Every field came
       back undefined, so the surface silently rendered design-kit
       fixtures — a stranger's example risk file presented as the
       tenant's own. The route now serves what the hook reads, and the
       scalar KPIs live under `summary`. */
    queryFn
      .mockResolvedValueOnce({ rows: [{ id: PROGRAM_ID }] }) // tenancy check
      .mockResolvedValue({ rows: [] });                      // every panel

    const res = await request(makeApp()).get(`/api/mdx/engineering/${PROGRAM_ID}`);

    expect(res.status).toBe(200);
    for (const key of ['summary', 'dhf', 'trace', 'risks', 'ecrs', 'issues', 'documents']) {
      expect(res.body.data).toHaveProperty(key);
    }
    /* Per-panel tenancy, so organisation-wide panels can be labelled as
       such rather than implying they belong to the selected programme. */
    expect(res.body.meta.scopes.risks).toBe('program');
  });

  /* P-60 (2026-10-29): the DHF panel reads the project's own document sections
     (c2c_document_sections), so the figure is over their mandatory sections. */
  it('derives DHF completion over mandatory sections only', async () => {
    const section = (id: number, key: string, status: string, mandatory: boolean) => ({
      id, section_key: key, label: `Section ${key}`, status, mandatory, version: 1, updated_at: null,
      document_id: 'doc_1', document_title: 'Device 510(k)',
    });
    queryFn
      .mockResolvedValueOnce({ rows: [{ id: PROGRAM_ID }] }) // tenancy
      .mockResolvedValueOnce({ rows: [] })                   // risks
      .mockResolvedValueOnce({ rows: [] })                   // trace
      .mockResolvedValueOnce({
        rows: [section(1, '01', 'approved', true), section(2, '02', 'drafted', true), section(3, '03', 'drafted', false)],
      })
      .mockResolvedValue({ rows: [] });

    const res = await request(makeApp()).get(`/api/mdx/engineering/${PROGRAM_ID}`);
    /* 1 of 2 mandatory approved; the optional row is excluded from both
       numerator and denominator. */
    expect(res.body.data.summary.dhfCompletion).toBe(50);
  });

});
