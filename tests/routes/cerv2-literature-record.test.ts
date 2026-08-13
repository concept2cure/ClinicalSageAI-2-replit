/**
 * POST /api/cerv2/literature/record — the literature_entries write path.
 *
 * HTTP-layer contract (the service itself is covered by
 * server/services/__tests__/literature-recording.service.test.ts):
 *   - org comes from the authenticated request, NEVER the body;
 *   - the write runs on the REQUEST-SCOPED client (requestPgClient), mirroring
 *     the requestDb migration of 510k-device-routes — both server/db and
 *     server/db/requestDb are mocked, per that suite's pattern;
 *   - programId is validated as org-visible (404 outside the org, no leak);
 *   - honest failure: a service error answers 500 with recorded:false and the
 *     reason, never a fake success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockRecord, mockProgramRows, fakeDb, fakePgClient } = vi.hoisted(() => ({
  mockRecord: vi.fn(async () => ({
    created: 1,
    updated: 0,
    entries: [{ pmid: '38012345', id: 'lit-1', outcome: 'created' }],
  })),
  mockProgramRows: vi.fn<[], unknown[]>(() => []),
  fakeDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), execute: vi.fn() } as any,
  fakePgClient: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({
  requestDb: () => fakeDb,
  requestPgClient: () => fakePgClient,
}));

vi.mock('../../server/services/literature-recording.service', () => ({
  recordLiteratureEntries: mockRecord,
  SCREENING_STATE_UNSUPPORTED:
    'literature_entries has no screening-state or metadata column — entries are stored unscreened',
  PROGRAM_BINDING_NOTE: 'entries are recorded to the organization corpus',
}));

fakeDb.select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(async () => mockProgramRows()) })),
  })),
}));

import cerv2DocumentRoutes from '../../server/routes/cerv2-document-routes';

function getHandler(path: string, method: 'get' | 'post') {
  const layer = cerv2DocumentRoutes.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ENTRY = {
  pmid: '38012345',
  title: 'Continuous glucose monitoring in adults',
  journal: 'Diabetes Care',
  year: 2023,
  authors: 'Smith J, Lee K',
  doi: '10.1000/x',
  url: 'https://pubmed.ncbi.nlm.nih.gov/38012345/',
};

function makeReq(body: Record<string, unknown>, orgId: number | null = 7) {
  const req = createMockRequest({ body }) as any;
  // createMockRequest defaults tenantContext.organizationId to a slug, which
  // resolveOrganizationId treats as non-numeric → 400. Model a real request:
  // numeric org everywhere, or no org context at all.
  req.tenantContext = orgId !== null ? { organizationId: orgId } : {};
  if (orgId !== null) req.user = { organizationId: orgId };
  return req;
}

describe('POST /api/cerv2/literature/record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue({
      created: 1,
      updated: 0,
      entries: [{ pmid: '38012345', id: 'lit-1', outcome: 'created' }],
    });
    mockProgramRows.mockReturnValue([]);
  });

  it('records entries org-scoped from the request, on the request-scoped client', async () => {
    const req = makeReq({ entries: [ENTRY] });
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const [client, orgId, entries] = mockRecord.mock.calls[0];
    expect(client).toBe(fakePgClient); // request-scoped, not the shared pool
    expect(orgId).toBe(7);
    expect(entries).toHaveLength(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.recorded).toBe(true);
    expect(payload.created).toBe(1);
    expect(payload.screeningState).toBeNull();
    expect(payload.notes.join(' ')).toMatch(/unscreened/);
  });

  it('ignores any org id smuggled in the body — org is request-derived only', async () => {
    const req = makeReq({ entries: [ENTRY], organizationId: 999 });
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(mockRecord.mock.calls[0][1]).toBe(7);
  });

  it('400s without an organization context', async () => {
    const req = makeReq({ entries: [ENTRY] }, null);
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('400s an invalid payload (no entries / malformed pmid)', async () => {
    for (const body of [{}, { entries: [] }, { entries: [{ ...ENTRY, pmid: 'not-a-pmid' }] }]) {
      const req = makeReq(body);
      const res = createMockResponse() as any;
      await getHandler('/literature/record', 'post')(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('404s a programId outside the caller org without recording anything', async () => {
    mockProgramRows.mockReturnValue([]);
    const req = makeReq({
      entries: [ENTRY],
      programId: '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70',
    });
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('accepts an org-visible programId', async () => {
    mockProgramRows.mockReturnValue([{ id: '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70' }]);
    const req = makeReq({
      entries: [ENTRY],
      programId: '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70',
    });
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].recorded).toBe(true);
  });

  it('answers 500 with recorded:false and the reason when the write fails', async () => {
    mockRecord.mockRejectedValueOnce(new Error('relation "literature_entries" does not exist'));
    const req = makeReq({ entries: [ENTRY] });
    const res = createMockResponse() as any;

    await getHandler('/literature/record', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.recorded).toBe(false);
    expect(payload.error).toMatch(/literature_entries/);
  });
});
