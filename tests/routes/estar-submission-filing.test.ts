/**
 * Filing an eSTAR is a signature, over HTTP.
 *
 * `PATCH /api/510k/estar/submissions/:id` moved a filing to `filed` on a date
 * the CLIENT supplied (`filedAt: z.coerce.date().optional()`), with a free-text
 * tracking number and no link to any artifact
 * (docs/reports/device-market-readiness-2026-09-07.md §5). Declaring a
 * submission made to FDA — the most consequential act in this workflow — asked
 * for nothing: no reason, no §11.50 meaning, no re-authentication, no bytes.
 *
 * These pin the route's half of the fix: the re-auth gate runs FIRST and only
 * for the transition that is a signature, the signature body is required, a
 * client-supplied filing date has nowhere to go, and every other transition is
 * left exactly as it was.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockAdvance, mockVerifyReauth, mockLogAction } = vi.hoisted(() => ({
  mockAdvance: vi.fn(async () => ({ id: 'sub-1', status: 'filed' })),
  mockVerifyReauth: vi.fn(async () => ({ ok: true })),
  mockLogAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/services/auditService', () => ({ default: { logAction: mockLogAction } }));

vi.mock('../../server/services/pathway-engines/estar/estar-submission-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  advanceEstarSubmission: mockAdvance,
}));

/* The re-auth verifier is the real one's contract: ok, or a named refusal. */
vi.mock('../../server/routes/c2c/actions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyReauth: mockVerifyReauth,
}));

const { fakeDb } = vi.hoisted(() => ({ fakeDb: { select: vi.fn(), update: vi.fn() } as any }));
vi.mock('../../server/db', () => ({ db: fakeDb, pool: { query: vi.fn() } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

import estarRoutes from '../../server/routes/510k-estar-routes';

function handler() {
  const layer = estarRoutes.stack.find(
    (l: any) => l.route?.path === '/submissions/:id' && l.route?.methods?.patch,
  );
  if (!layer) throw new Error('Missing route PATCH /submissions/:id');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const DOC = 'a2b4c6d8-0000-4000-8000-000000000002';

function makeReq(body: any) {
  const req = createMockRequest({ body, params: { id: 'sub-1' } }) as any;
  req.userRole = 'editor';
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  req.ip = '10.0.0.1';
  return req;
}

const signedBody = {
  status: 'filed',
  filedArtifactDocumentId: DOC,
  reason: 'Filed the cleared 510(k) package with CDRH today.',
  meaning: 'responsibility',
  reauth: { password: 'correct-horse' },
};

describe('PATCH /submissions/:id — filing carries a signature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyReauth.mockResolvedValue({ ok: true });
    mockAdvance.mockResolvedValue({ id: 'sub-1', status: 'filed' });
  });

  it('files with the artifact, the declared meaning and what was actually verified', async () => {
    const req = makeReq(signedBody);
    const res = createMockResponse() as any;

    await handler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockVerifyReauth).toHaveBeenCalledWith(9, { password: 'correct-horse' });
    const [, input, ctx] = mockAdvance.mock.calls[0] as any[];
    expect(input).toMatchObject({
      toStatus: 'filed',
      signature: {
        artifactDocumentId: DOC,
        reason: signedBody.reason,
        meaning: 'responsibility',
        authenticationMethod: 'password',
        secondFactorVerified: false,
        ipAddress: '10.0.0.1',
      },
    });
    expect(ctx).toEqual({ organizationId: 2, userId: 9 });
  });

  it('records a second factor only when one was actually presented', async () => {
    const req = makeReq({ ...signedBody, reauth: { password: 'correct-horse', totp: '123456' } });
    const res = createMockResponse() as any;

    await handler()(req, res);

    const [, input] = mockAdvance.mock.calls[0] as any[];
    expect(input.signature).toMatchObject({
      authenticationMethod: 'password+totp',
      secondFactorVerified: true,
    });
  });

  it.each([
    ['no artifact', { status: 'filed', reason: 'Filed with CDRH today, package complete.', reauth: { password: 'p' } }, 'filedArtifactDocumentId'],
    ['no reason', { status: 'filed', filedArtifactDocumentId: DOC, reauth: { password: 'p' } }, 'reason'],
    ['a too-short reason', { status: 'filed', filedArtifactDocumentId: DOC, reason: 'done', reauth: { password: 'p' } }, 'reason'],
  ])('refuses a filing with %s, and nothing is advanced', async (_label, body, field) => {
    const req = makeReq(body);
    const res = createMockResponse() as any;

    await handler()(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toContain(field);
    expect(mockAdvance).not.toHaveBeenCalled();
    expect(mockVerifyReauth).not.toHaveBeenCalled();
  });

  it('refuses a filing whose re-authentication failed, before anything is advanced', async () => {
    mockVerifyReauth.mockResolvedValue({ ok: false, error: 'REAUTH_PASSWORD_INVALID' });
    const req = makeReq(signedBody);
    const res = createMockResponse() as any;

    await handler()(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'REAUTH_PASSWORD_INVALID' });
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'ReAuth required');
    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it('has nowhere to put a client-supplied filing date', async () => {
    const req = makeReq({ ...signedBody, filedAt: '2020-01-01T00:00:00.000Z' });
    const res = createMockResponse() as any;

    await handler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [, input] = mockAdvance.mock.calls[0] as any[];
    expect(input).not.toHaveProperty('filedAt');
    expect(JSON.stringify(input)).not.toContain('2020-01-01');
  });

  it('leaves every other transition unsigned and un-gated', async () => {
    mockAdvance.mockResolvedValue({ id: 'sub-1', status: 'under_review' } as any);
    const req = makeReq({ status: 'under_review', fdaTrackingNumber: 'K260001' });
    const res = createMockResponse() as any;

    await handler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockVerifyReauth).not.toHaveBeenCalled();
    const [, input] = mockAdvance.mock.calls[0] as any[];
    expect(input).toMatchObject({ toStatus: 'under_review', fdaTrackingNumber: 'K260001' });
    expect(input.signature).toBeUndefined();
  });
});
