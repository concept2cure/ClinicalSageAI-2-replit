/**
 * Integration tests for /api/mdx/imports — auth gate, validation, tenant
 * scoping, error envelopes. The detector is mocked so tests don't depend
 * on a real archive on disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryFn = vi.fn();
const connectFn = vi.fn();

vi.mock('../server/db', () => ({
  pool:    { query: (...a: unknown[]) => queryFn(...a), connect: (...a: unknown[]) => connectFn(...a) },
  getPool: () => ({ query: (...a: unknown[]) => queryFn(...a), connect: (...a: unknown[]) => connectFn(...a) }),
  db: {},
}));

const { detectFn } = vi.hoisted(() => ({ detectFn: vi.fn() }));
vi.mock('../server/services/legacy-importer/detector', () => ({
  detectArchive: (...args: unknown[]) => detectFn(...args),
}));

import importsRouter from '../server/routes/mdx-imports';

function makeApp(opts: { withAuth?: boolean; role?: string } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      /* A role: every governed write on these routers is role-gated
         (requireEditorAccess). The harness attached none and still passed,
         which is what it failed to notice. */
      (req as any).user = { id: 777, organizationId: 99, role: opts.role ?? 'admin' };
      (req as any).userRole = opts.role ?? 'admin';
      next();
    });
  }
  app.use('/api/mdx', importsRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  detectFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
  connectFn.mockReset();
});

describe('auth gate', () => {
  it.each([
    ['GET', '/api/mdx/imports'],
    ['POST', '/api/mdx/imports'],
    ['GET', '/api/mdx/imports/1'],
    ['POST', '/api/mdx/imports/1/approve'],
  ])('%s %s returns 403 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url) : req.post(url).send({}));
    expect(res.status).toBe(403);
  });
});

describe('POST /imports', () => {
  it('rejects missing sourcePath', async () => {
    const res = await request(makeApp()).post('/api/mdx/imports').send({});
    expect(res.status).toBe(422);
  });

  it('detects + persists files + findings, returns 201', async () => {
    /* Job insert returns id=42. */
    queryFn.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    /* Detection returns 2 files + 1 finding. */
    detectFn.mockResolvedValueOnce({
      format: 'fda_ectd',
      region: 'fda',
      applicationId: 'IND-12345',
      sequence: '0001',
      sponsor: 'Acme Pharma',
      files: [
        {
          relativePath: 'm1/us/1-1/cover-letter.pdf', fileName: 'cover-letter.pdf',
          sizeBytes: 1024, sha256: 'a'.repeat(64), detectedKind: 'leaf',
          mappedCtdSection: '1.1', mappedSectionKey: 'cover-letter',
          mappedArtifactKind: 'cover_letter',
          mappingConfidence: 1.0, mappingSource: 'backbone_xml',
        },
        {
          relativePath: 'm3/3-2-s/spec.pdf', fileName: 'spec.pdf',
          sizeBytes: 8192, sha256: 'b'.repeat(64), detectedKind: 'leaf',
          mappedCtdSection: '3.2.S', mappedSectionKey: null,
          mappedArtifactKind: 'document',
          mappingConfidence: 0.3, mappingSource: 'fallback',
        },
      ],
      findings: [
        { severity: 'warning', code: 'low_confidence_mapping', message: '1 low-confidence file' },
      ],
    });
    /* Per-file inserts (2x) + per-finding insert (1x) + header update + final SELECT. */
    queryFn.mockResolvedValue({ rows: [{ id: 42, status: 'ready_for_review', file_count: 2 }] });

    const res = await request(makeApp())
      .post('/api/mdx/imports')
      .send({ sourcePath: '/tmp/archive.zip' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(42);
  });

  it('marks job failed when detector throws', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    detectFn.mockRejectedValueOnce(new Error('zip corrupt'));
    queryFn.mockResolvedValue({ rows: [{ id: 99 }] }); // update-failed query
    const res = await request(makeApp())
      .post('/api/mdx/imports')
      .send({ sourcePath: '/tmp/bad.zip' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /imports/:id', () => {
  it('404s when not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp()).get('/api/mdx/imports/999');
    expect(res.status).toBe(404);
  });

  it('returns job + files + findings', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'ready_for_review', file_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, relative_path: 'foo.pdf', status: 'mapped' }] })
      .mockResolvedValueOnce({ rows: [{ id: 20, severity: 'warning', message: 'low conf' }] });
    const res = await request(makeApp()).get('/api/mdx/imports/1');
    expect(res.status).toBe(200);
    expect(res.body.data.files).toHaveLength(1);
    expect(res.body.data.findings).toHaveLength(1);
  });
});

describe('PATCH /imports/:id/files/:fileId', () => {
  it('400-equiv when both numeric ids missing', async () => {
    const res = await request(makeApp())
      .patch('/api/mdx/imports/abc/files/xyz')
      .send({ status: 'mapped' });
    expect(res.status).toBe(422);
  });

  it('marks mapping_source=manual on override', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 10, mapped_section_key: 'substantial-equivalence' }],
    });
    const res = await request(makeApp())
      .patch('/api/mdx/imports/1/files/10')
      .send({ mappedSectionKey: 'substantial-equivalence', status: 'mapped' });
    expect(res.status).toBe(200);
    expect(res.body.data.mapped_section_key).toBe('substantial-equivalence');
  });
});

describe('POST /imports/:id/approve', () => {
  it('rejects missing projectId', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/imports/1/approve')
      .send({});
    expect(res.status).toBe(422);
  });

  it('409 when job is not ready_for_review', async () => {
    const fakeClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ status: 'completed' }] })
        .mockResolvedValueOnce({}), // ROLLBACK
      release: vi.fn(),
    };
    connectFn.mockResolvedValueOnce(fakeClient);
    const res = await request(makeApp())
      .post('/api/mdx/imports/1/approve')
      .send({ projectId: 5 });
    expect(res.status).toBe(409);
  });
});

describe('POST /imports/:id/cancel', () => {
  it('409 when not in cancellable state', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/imports/1/cancel')
      .send({});
    expect(res.status).toBe(409);
  });

  it('200 when cancellable', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 1, status: 'cancelled' }] });
    const res = await request(makeApp())
      .post('/api/mdx/imports/1/cancel')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});

/**
 * These routers hold the device and IVD records a submission is assembled from:
 * UDI entries, IVDR classifications and performance evaluations, CDx pairings
 * and concordance, and the imports that materialise artifacts into the
 * registry. Every write was guarded by the caller's org context alone — tenant
 * scoping, not authorization — so a read-only `viewer` could create and amend
 * all of them.
 */
describe('MDX persistence routers — role gate on every governed write', () => {
  const WRITES: Array<[string, string]> = [
    ['post', '/api/mdx/imports'],
    ['patch', '/api/mdx/imports/1/files/2'],
    ['post', '/api/mdx/imports/1/approve'],
    ['post', '/api/mdx/imports/1/cancel'],
    ['post', '/api/mdx/imports/1/findings/2/resolve'],
  ];

  it.each(WRITES)('%s %s is refused for a read-only viewer', async (method, url) => {
    const res = await (request(makeApp({ withAuth: true, role: 'viewer' })) as any)[method](url).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(queryFn, 'nothing may be written').not.toHaveBeenCalled();
  });

  it.each(WRITES)('%s %s is not refused for a member', async (method, url) => {
    const res = await (request(makeApp({ withAuth: true, role: 'member' })) as any)[method](url).send({});
    expect(res.status, JSON.stringify(res.body)).not.toBe(403);
  });
});

/**
 * The import JOB was proved to be the caller's; the `projectId` it is approved
 * into was not, and it comes straight from the request body. A caller could
 * approve their own import into ANOTHER TENANT'S project lineage, taking the
 * artifacts and the provenance and audit rows that follow them with it.
 */
describe('POST /imports/:id/approve — the project must be the caller\'s too', () => {
  it('404s a projectId outside the tenant, and writes nothing', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({})                                  // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'ready_for_review' }] }) // import job IS ours
      .mockResolvedValueOnce({ rows: [] })                        // project is NOT ours
      .mockResolvedValueOnce({});                                 // ROLLBACK
    connectFn.mockResolvedValueOnce({ query: clientQuery, release: vi.fn() });

    const res = await request(makeApp()).post('/api/mdx/imports/1/approve').send({ projectId: 4242 });
    expect(res.status, JSON.stringify(res.body)).toBe(404);

    const statements = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((q) => q.includes('FROM projects')), 'the project was never checked').toBe(true);
    expect(statements.some((q) => /INSERT INTO/i.test(q)), 'nothing may be written').toBe(false);
    expect(statements.some((q) => /ROLLBACK/i.test(q))).toBe(true);

    /* Scoped by organization, not merely by id — an id-only check would pass a
       foreign project that happens to exist. */
    const projectCall = clientQuery.mock.calls.find((c) => String(c[0]).includes('FROM projects'));
    expect(String(projectCall?.[0])).toMatch(/organization_id/);
    expect(projectCall?.[1]).toEqual([4242, 99]);
  });

});
