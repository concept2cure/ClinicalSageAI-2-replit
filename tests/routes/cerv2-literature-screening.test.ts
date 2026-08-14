/**
 * POST /api/cerv2/literature/screen + GET /api/cerv2/literature/screening —
 * the MEDDEV 2.7/1 Rev 4 screening trail at the HTTP layer.
 *
 * (The service itself is covered by
 * server/services/__tests__/literature-screening.service.test.ts.)
 *
 * HTTP-layer contract:
 *   - org comes from the authenticated request, NEVER the body or query;
 *   - a decision must be attributable to a named reviewer (Part 11 §11.10(e)) —
 *     no user context, no write;
 *   - both paths run on the REQUEST-SCOPED client (requestPgClient), mirroring
 *     the record route; both server/db and server/db/requestDb are mocked, per
 *     that suite's pattern;
 *   - programId is validated as org-visible (404 outside the org, no leak);
 *   - MEDDEV §8: an exclusion without a reason is rejected, and a reason on a
 *     non-exclusion is rejected, BEFORE the service is reached;
 *   - the decision is audited through the canonical `auditService` path, with
 *     the SUPERSEDED decision in the payload — never a hand-rolled INSERT;
 *   - a refusal answers 422 with the service's real reason; a genuine failure
 *     answers 500 with screened:false — never a fake success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

class FakeScreeningRefusal extends Error {
  readonly code: string;
  readonly statusCode = 422;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScreeningRefusal';
    this.code = code;
  }
}

const { mockScreen, mockRead, mockLogAction, mockProgramRows, fakeDb, fakePgClient } = vi.hoisted(
  () => ({
    mockScreen: vi.fn(),
    mockRead: vi.fn(),
    mockLogAction: vi.fn(async () => undefined),
    mockProgramRows: vi.fn<[], unknown[]>(() => []),
    fakeDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), execute: vi.fn() } as any,
    fakePgClient: { query: vi.fn(async () => ({ rows: [] })) },
  }),
);

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({
  requestDb: () => fakeDb,
  requestPgClient: () => fakePgClient,
}));

vi.mock('../../server/services/literature-screening.service', () => ({
  recordScreeningDecision: mockScreen,
  getScreeningDecisions: mockRead,
  ScreeningRefusal: FakeScreeningRefusal,
  SCREENING_STAGE_LABELS: {
    title_abstract: 'Title/abstract screening',
    full_text: 'Full-text screening',
  },
}));

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: mockLogAction },
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

const PROGRAM_ID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const DECISION_ID = 'd0000000-0000-0000-0000-000000000001';

const STORED = {
  id: DECISION_ID,
  pmid: '38012345',
  title: 'Continuous glucose monitoring in adults',
  literatureEntryId: 'e0000000-0000-0000-0000-000000000001',
  programId: null,
  stage: 'title_abstract' as const,
  decision: 'included' as const,
  exclusionReason: null,
  decidedBy: 42,
  decidedAt: '2026-08-14T10:00:00.000Z',
};

function makeReq(
  init: { body?: Record<string, unknown>; query?: Record<string, unknown> },
  orgId: number | null = 7,
  userId: number | null = 42,
) {
  const req = createMockRequest({ body: init.body ?? {}, query: init.query ?? {} }) as any;
  // createMockRequest defaults tenantContext.organizationId to a slug, which
  // resolveOrganizationId treats as non-numeric → 400. Model a real request.
  req.tenantContext = orgId !== null ? { organizationId: orgId } : {};
  if (orgId !== null) req.user = { organizationId: orgId };
  if (userId !== null) req.userId = userId;
  req.get = () => 'vitest-agent';
  req.ip = '10.0.0.1';
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockScreen.mockResolvedValue({ current: STORED, superseded: null, outcome: 'created' });
  mockRead.mockResolvedValue({ available: true, decisions: [STORED] });
  mockProgramRows.mockReturnValue([]);
});

describe('POST /api/cerv2/literature/screen', () => {
  const BODY = { pmid: '38012345', stage: 'title_abstract', decision: 'included' };

  it('records the decision org-scoped from the request, on the request-scoped client', async () => {
    const req = makeReq({ body: BODY });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(mockScreen).toHaveBeenCalledTimes(1);
    const [client, orgId, userId, input] = mockScreen.mock.calls[0];
    expect(client).toBe(fakePgClient); // request-scoped, not the shared pool
    expect(orgId).toBe(7);
    expect(userId).toBe(42);
    expect(input).toMatchObject({ pmid: '38012345', stage: 'title_abstract', decision: 'included' });

    const payload = res.json.mock.calls[0][0];
    expect(payload.screened).toBe(true);
    expect(payload.outcome).toBe('created');
    expect(payload.decision).toEqual(STORED);
  });

  it('ignores an org id smuggled in the body — org is request-derived only', async () => {
    const req = makeReq({ body: { ...BODY, organizationId: 999 } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(mockScreen.mock.calls[0][1]).toBe(7);
  });

  it('400s without an organization context', async () => {
    const req = makeReq({ body: BODY }, null);
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('400s without a named reviewer — an unattributed decision is not Part 11 evidence', async () => {
    const req = makeReq({ body: BODY }, 7, null);
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/attributable to a named reviewer/);
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('400s an exclusion with no reason (MEDDEV 2.7/1 Rev 4 §8)', async () => {
    const req = makeReq({ body: { ...BODY, decision: 'excluded' } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toMatch(/must carry a reason/);
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('400s a reason attached to a non-exclusion — no stale rationale is stored', async () => {
    const req = makeReq({ body: { ...BODY, exclusionReason: 'left over' } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('400s an unknown stage or decision', async () => {
    for (const body of [
      { ...BODY, stage: 'abstract_only' },
      { ...BODY, decision: 'maybe' },
      { ...BODY, pmid: 'not-a-pmid' },
      {},
    ]) {
      const req = makeReq({ body });
      const res = createMockResponse() as any;
      await getHandler('/literature/screen', 'post')(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('404s a programId outside the caller org without screening anything', async () => {
    mockProgramRows.mockReturnValue([]);
    const req = makeReq({ body: { ...BODY, programId: PROGRAM_ID } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('accepts an org-visible programId and passes it through as the scope key', async () => {
    mockProgramRows.mockReturnValue([{ id: PROGRAM_ID }]);
    const req = makeReq({ body: { ...BODY, programId: PROGRAM_ID } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(mockScreen.mock.calls[0][3].programId).toBe(PROGRAM_ID);
    expect(res.json.mock.calls[0][0].screened).toBe(true);
  });

  it('audits through the canonical auditService path, carrying old→new', async () => {
    mockScreen.mockResolvedValue({
      current: { ...STORED, decision: 'excluded', exclusionReason: 'wrong population' },
      superseded: {
        decision: 'included',
        exclusionReason: null,
        decidedBy: 9,
        decidedAt: '2026-08-01T09:00:00.000Z',
      },
      outcome: 'updated',
    });
    const req = makeReq({
      body: { ...BODY, decision: 'excluded', exclusionReason: 'wrong population' },
    });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const entry = mockLogAction.mock.calls[0][0] as any;
    expect(entry.organizationId).toBe(7);
    expect(entry.userId).toBe(42);
    expect(entry.action).toBe('update');
    expect(entry.resourceType).toBe('literature_screening_decision');
    expect(entry.resourceId).toBe(DECISION_ID);
    expect(entry.details.decision).toBe('excluded');
    expect(entry.details.exclusionReason).toBe('wrong population');
    // The superseded call is in the chain, not just the surviving one.
    expect(entry.details.supersededDecision).toBe('included');
    expect(entry.details.supersededDecidedBy).toBe(9);
    expect(entry.details.stage).toBe('title_abstract');
    expect(entry.details.basis).toMatch(/MEDDEV 2\.7\/1 Rev 4/);
  });

  it('audits a first decision as a create with a null superseded value', async () => {
    const req = makeReq({ body: BODY });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    const entry = mockLogAction.mock.calls[0][0] as any;
    expect(entry.action).toBe('create');
    expect(entry.details.supersededDecision).toBeNull();
  });

  it('422s a service refusal with its real reason, and does not audit a non-event', async () => {
    mockScreen.mockRejectedValueOnce(
      new FakeScreeningRefusal(
        'ENTRY_NOT_IN_CORPUS',
        "PMID 38012345 — that article is not in this organization's literature corpus",
      ),
    );
    const req = makeReq({ body: BODY });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.screened).toBe(false);
    expect(payload.code).toBe('ENTRY_NOT_IN_CORPUS');
    expect(payload.error).toMatch(/not in this organization's literature corpus/);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('500s with screened:false and the reason when the write genuinely fails', async () => {
    mockScreen.mockRejectedValueOnce(new Error('deadlock detected'));
    const req = makeReq({ body: BODY });
    const res = createMockResponse() as any;

    await getHandler('/literature/screen', 'post')(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.screened).toBe(false);
    expect(payload.error).toMatch(/deadlock detected/);
    expect(mockLogAction).not.toHaveBeenCalled();
  });
});

describe('GET /api/cerv2/literature/screening', () => {
  it('reads the trail org-scoped from the request, on the request-scoped client', async () => {
    const req = makeReq({ query: {} });
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    expect(mockRead).toHaveBeenCalledTimes(1);
    const [client, orgId, query] = mockRead.mock.calls[0];
    expect(client).toBe(fakePgClient);
    expect(orgId).toBe(7);
    expect(query.programId).toBeNull();
    expect(res.json.mock.calls[0][0]).toEqual({ available: true, decisions: [STORED] });
  });

  it('splits the pmids query into a list the service can filter on', async () => {
    const req = makeReq({ query: { pmids: '38012345, 12345678 ,' } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    expect(mockRead.mock.calls[0][2].pmids).toEqual(['38012345', '12345678']);
  });

  it('400s without an organization context', async () => {
    const req = makeReq({ query: {} }, null);
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('404s a programId outside the caller org without reading anything', async () => {
    mockProgramRows.mockReturnValue([]);
    const req = makeReq({ query: { programId: PROGRAM_ID } });
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('passes the honest unavailable payload through untouched', async () => {
    mockRead.mockResolvedValue({
      available: false,
      unavailableReason: 'the literature screening store is not provisioned on this database',
      decisions: [],
    });
    const req = makeReq({ query: {} });
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.available).toBe(false);
    expect(payload.unavailableReason).toMatch(/not provisioned/);
    expect(payload.decisions).toEqual([]);
  });

  it('500s with available:false rather than an empty trail on a genuine failure', async () => {
    mockRead.mockRejectedValueOnce(new Error('connection terminated'));
    const req = makeReq({ query: {} });
    const res = createMockResponse() as any;

    await getHandler('/literature/screening', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.available).toBe(false);
    expect(payload.error).toMatch(/connection terminated/);
  });
});
