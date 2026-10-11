/**
 * POST /api/authoring/documents/:id/request-review — who may send a document
 * for review (wave 2D, outside-file request C of wave 2C).
 *
 * The route was left unclassified by this middleware, so it required only an
 * authenticated member of the organization: anyone could send any of the
 * organization's documents for review, to anyone, with a reason written to the
 * document's audit trail in their name. It is now the sender's act on the
 * document: an OWNER or AUTHOR grant (the 'edit' action), or a global admin.
 *
 * The verdict route beside it, POST /documents/:id/review, stays unclassified:
 * reviewers are named by the request, which grants them no doc_permissions row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import supertest from 'supertest';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db', () => ({
  getPool: () => ({ query: h.query }),
}));

import { authoringObjectAuthorization } from '../authoringObjectAuthorization';

const DOC_ID = '10000000-0000-4000-8000-000000000001';
const PATH = `/authoring/documents/${DOC_ID}/request-review`;

function request(user: Record<string, unknown>, path = PATH, method = 'POST'): Request {
  return {
    method,
    path,
    user,
    body: { reviewers: [{ id: '42', name: 'OQ Signer' }], reason: 'Ready for medical review.' },
  } as unknown as Request;
}

function response(): Response & { statusCode?: number; body?: unknown } {
  const res: any = { locals: {} };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

const member = (id: string, roles: string[] = []) => ({
  id,
  userId: id,
  email: `${id}@example.com`,
  organizationId: 1,
  roles,
});

/** The document (in this tenant unless `found` is false) and the caller's grants on it. */
function installQueryBehavior(options: { roles?: string[]; status?: string; found?: boolean }) {
  h.query.mockImplementation(async (sql: string) => {
    if (/FROM authoring_documents/i.test(sql) && !/doc_permissions/i.test(sql)) {
      if (options.found === false) return { rows: [] };
      return {
        rows: [{ doc_id: DOC_ID, tenant_id: 1, status: options.status ?? 'draft', created_by: 'user-owner' }],
      };
    }
    if (/FROM doc_permissions p/i.test(sql)) {
      return { rows: (options.roles ?? []).map(role => ({ role })) };
    }
    return { rows: [] };
  });
}

async function run(req: Request) {
  const res = response();
  const next = vi.fn();
  await authoringObjectAuthorization(req, res, next);
  return { res, next };
}

describe('POST /documents/:id/request-review — only the document’s owner or author sends it for review', () => {
  beforeEach(() => {
    h.query.mockReset();
  });

  it('refuses a member of the organization with no role on the document: 403, the standard body', async () => {
    installQueryBehavior({ roles: [] });
    const { res, next } = await run(request(member('user-colleague')));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({
      error: {
        code: 'AUTHORING_OBJECT_FORBIDDEN',
        message: 'You do not have permission to perform this action on the authoring object.',
      },
    });
  });

  it.each([['REVIEWER'], ['APPROVER'], ['VIEWER']])('refuses a member whose only grant is %s', async role => {
    installQueryBehavior({ roles: [role] });
    const { res, next } = await run(request(member('user-granted')));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.body as any).error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
  });

  it.each([['OWNER'], ['AUTHOR']])('admits the document’s %s, classified as an edit of this document', async role => {
    installQueryBehavior({ roles: [role] });
    const { res, next } = await run(request(member('user-owner')));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((res.locals as any).authoringAuthorization).toMatchObject({
      action: 'edit',
      docId: DOC_ID,
      matchedRoles: [role],
      reason: 'allowed-object-role',
    });
  });

  it('admits a global admin without a grant, as on every other authoring object', async () => {
    installQueryBehavior({ roles: [] });
    const { res, next } = await run(request(member('user-admin', ['ADMIN'])));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((res.locals as any).authoringAuthorization).toMatchObject({ action: 'edit', reason: 'allowed-global-admin' });
    expect(h.query.mock.calls.some(([sql]) => /doc_permissions/i.test(String(sql)))).toBe(false);
  });

  it('answers 404 for a document this tenant does not have, before any grant is read', async () => {
    installQueryBehavior({ found: false, roles: ['OWNER'] });
    const { res, next } = await run(request(member('user-owner')));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect((res.body as any).error.code).toBe('AUTHORING_OBJECT_NOT_FOUND');
  });

  it('refuses a sealed document with 409: a request would reopen verdicts on a signed record', async () => {
    installQueryBehavior({ status: 'FROZEN', roles: ['OWNER'] });
    const { res, next } = await run(request(member('user-owner')));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.body as any).error.code).toBe('AUTHORING_DOCUMENT_IMMUTABLE');
  });

  it('leaves the verdict route alone: a reviewer has no grant, and still reaches POST /documents/:id/review', async () => {
    installQueryBehavior({ roles: [] });
    const { res, next } = await run(request(member('user-reviewer'), `/authoring/documents/${DOC_ID}/review`));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('matches the request path exactly, not a longer path that only begins with it', async () => {
    installQueryBehavior({ roles: [] });
    const { next } = await run(request(member('user-colleague'), `/authoring/documents/${DOC_ID}/request-review-extra`));

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });
});

/**
 * The gate must meet every spelling of a path that the router runs the handler
 * for. Express routes match without case and ignore a trailing slash (Router
 * defaults; authoring.router.ts:111 creates its Router with no options). The
 * gate compared the literal path, so POST …/request-review/ or
 * /api/Authoring/… ran the handler with no object check (wave 2D review). Each
 * spelling is first shown to reach the handler with no gate, so the case is
 * real, then shown to meet the gate.
 */
describe('every spelling the router accepts meets the gate', () => {
  beforeEach(() => {
    h.query.mockReset();
  });

  function app(gated: boolean) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as unknown as { user: unknown }).user = member('user-colleague');
      next();
    });
    if (gated) a.use('/api', authoringObjectAuthorization);
    // The authoring router's shape: Router() with Express's defaults.
    const router = express.Router();
    router.post('/documents/:id/request-review', (req, res) => { res.json({ reached: 'request-review', id: req.params.id }); });
    router.post('/documents/:id/tracked-change-decisions', (req, res) => { res.json({ reached: 'decision', id: req.params.id }); });
    router.post('/docs/:docId/freeze', (req, res) => { res.json({ reached: 'freeze', id: req.params.docId }); });
    a.use('/api/authoring', router);
    return a;
  }

  const SPELLINGS = [
    `/api/authoring/documents/${DOC_ID}/request-review`,
    `/api/authoring/documents/${DOC_ID}/request-review/`,
    `/api/authoring/documents/${DOC_ID}/Request-Review`,
    `/api/authoring/Documents/${DOC_ID}/request-review`,
    `/api/Authoring/documents/${DOC_ID}/request-review`,
    `/API/AUTHORING/DOCUMENTS/${DOC_ID.toUpperCase()}/REQUEST-REVIEW/`,
    `/api/authoring/documents/${DOC_ID}/tracked-change-decisions/`,
    `/api/authoring/documents/${DOC_ID}/Tracked-Change-Decisions`,
    `/api/authoring/docs/${DOC_ID}/freeze/`,
    `/api/Authoring/Docs/${DOC_ID}/Freeze`,
  ];

  it.each(SPELLINGS)('POST %s', async url => {
    installQueryBehavior({ roles: [] });
    const open = await supertest(app(false)).post(url).send({});
    expect(open.status, 'Express runs the handler for this spelling').toBe(200);
    expect(open.body.reached).toBeTruthy();

    const gated = await supertest(app(true)).post(url).send({});
    expect(gated.status, JSON.stringify(gated.body)).toBe(403);
    expect(gated.body.error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
  });

  it('decides on the document the handler acts on: the id keeps the spelling the caller sent', async () => {
    installQueryBehavior({ roles: ['OWNER'] });
    const res = await supertest(app(true)).post(`/api/Authoring/Documents/${DOC_ID.toUpperCase()}/request-review/`).send({});

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ reached: 'request-review', id: DOC_ID.toUpperCase() });
    const lookup = h.query.mock.calls.find(([sql]) => /FROM authoring_documents/i.test(String(sql)));
    expect(lookup?.[1]).toEqual([DOC_ID.toUpperCase(), 1]);
  });

  it('a path that only begins like an authoring route is still not classified', async () => {
    installQueryBehavior({ roles: [] });
    const res = await supertest(app(true)).post('/api/authoring-actions/documents/x/request-review').send({});

    expect(res.status).toBe(404);
    expect(h.query).not.toHaveBeenCalled();
  });
});
