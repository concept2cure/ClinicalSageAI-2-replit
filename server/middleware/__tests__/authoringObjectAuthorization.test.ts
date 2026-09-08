import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db', () => ({
  getPool: () => ({ query: h.query }),
}));

import { authoringObjectAuthorization } from '../authoringObjectAuthorization';

const DOC_ID = '10000000-0000-4000-8000-000000000001';
const SECTION_ID = '20000000-0000-4000-8000-000000000001';

function request(input: {
  method: string;
  path: string;
  user?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Request {
  return {
    method: input.method,
    path: input.path,
    user: input.user,
    body: input.body ?? {},
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

const author = {
  id: 'user-author',
  userId: 'user-author',
  email: 'author@example.com',
  organizationId: 1,
  roles: [],
};

function scopeRow(status = 'draft') {
  return {
    section_id: SECTION_ID,
    doc_id: DOC_ID,
    tenant_id: 1,
    status,
    created_by: 'user-author',
  };
}

function installQueryBehavior(options?: {
  status?: string;
  roles?: string[];
  throwOnPermission?: boolean;
}) {
  h.query.mockImplementation(async (sql: string) => {
    if (/FROM authoring_sections s/i.test(sql) && /JOIN authoring_documents d/i.test(sql)) {
      return { rows: [scopeRow(options?.status)] };
    }
    if (/FROM authoring_documents/i.test(sql) && !/doc_permissions/i.test(sql)) {
      return {
        rows: [
          {
            doc_id: DOC_ID,
            tenant_id: 1,
            status: options?.status ?? 'draft',
            created_by: 'user-author',
          },
        ],
      };
    }
    if (/FROM doc_permissions p/i.test(sql)) {
      if (options?.throwOnPermission) throw new Error('permission store unavailable');
      return { rows: (options?.roles ?? []).map(role => ({ role })) };
    }
    return { rows: [] };
  });
}

describe('mandatory authoring object authorization middleware', () => {
  beforeEach(() => {
    h.query.mockReset();
  });

  it('ignores non-authoring API mutations at the shared /api mount', async () => {
    const req = request({ method: 'POST', path: '/projects', body: { name: 'Project' } });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('allows document creation so the database trigger can seed OWNER and AUTHOR', async () => {
    const req = request({
      method: 'POST',
      path: '/authoring/docs',
      user: author,
      body: { title: 'New' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('allows a document author to edit the section', async () => {
    installQueryBehavior({ roles: ['AUTHOR'] });
    const req = request({
      method: 'PATCH',
      path: `/authoring/sections/${SECTION_ID}`,
      user: author,
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((res.locals as any).authoringAuthorization).toMatchObject({
      action: 'edit',
      docId: DOC_ID,
      sectionId: SECTION_ID,
      matchedRoles: ['AUTHOR'],
    });
  });

  it('denies a same-tenant authenticated user with no object permission', async () => {
    installQueryBehavior({ roles: [] });
    const req = request({
      method: 'PATCH',
      path: `/authoring/sections/${SECTION_ID}`,
      user: { ...author, id: 'unrelated-user', userId: 'unrelated-user', email: 'unrelated@example.com' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'AUTHORING_OBJECT_FORBIDDEN' } });
  });

  it('lets a REVIEWER comment but does not let the reviewer edit content', async () => {
    installQueryBehavior({ roles: ['REVIEWER'] });
    const reviewer = {
      ...author,
      id: 'reviewer-user',
      userId: 'reviewer-user',
      email: 'reviewer@example.com',
    };

    const commentReq = request({
      method: 'POST',
      path: `/authoring/sections/${SECTION_ID}/comment`,
      user: reviewer,
    });
    const commentRes = response();
    const commentNext = vi.fn();
    await authoringObjectAuthorization(commentReq, commentRes, commentNext);
    expect(commentNext).toHaveBeenCalledOnce();

    const editReq = request({
      method: 'PATCH',
      path: `/authoring/sections/${SECTION_ID}`,
      user: reviewer,
    });
    const editRes = response();
    const editNext = vi.fn();
    await authoringObjectAuthorization(editReq, editRes, editNext);
    expect(editNext).not.toHaveBeenCalled();
    expect(editRes.statusCode).toBe(403);
  });

  it('lets a section-scoped APPROVER reach an approval action but not an ordinary edit', async () => {
    installQueryBehavior({ roles: ['APPROVER'] });
    const approver = {
      ...author,
      id: 'approver-user',
      userId: 'approver-user',
      email: 'approver@example.com',
    };

    const approveReq = request({
      method: 'POST',
      path: `/authoring/sections/${SECTION_ID}/approve`,
      user: approver,
    });
    const approveRes = response();
    const approveNext = vi.fn();
    await authoringObjectAuthorization(approveReq, approveRes, approveNext);
    expect(approveNext).toHaveBeenCalledOnce();

    const editReq = request({
      method: 'DELETE',
      path: `/authoring/sections/${SECTION_ID}`,
      user: approver,
    });
    const editRes = response();
    const editNext = vi.fn();
    await authoringObjectAuthorization(editReq, editRes, editNext);
    expect(editNext).not.toHaveBeenCalled();
    expect(editRes.statusCode).toBe(403);
  });

  it('blocks content mutation after the document becomes immutable', async () => {
    installQueryBehavior({ status: 'APPROVED', roles: ['OWNER', 'AUTHOR'] });
    const req = request({
      method: 'PATCH',
      path: `/authoring/sections/${SECTION_ID}`,
      user: author,
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'AUTHORING_DOCUMENT_IMMUTABLE' } });
  });

  it('fails closed with 503 when the permission store cannot be queried', async () => {
    installQueryBehavior({ throwOnPermission: true });
    const req = request({
      method: 'PATCH',
      path: `/authoring/sections/${SECTION_ID}`,
      user: author,
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE' } });
  });

  it('rejects a mutation when verified principal or tenant context is missing', async () => {
    const req = request({ method: 'PATCH', path: `/authoring/sections/${SECTION_ID}` });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not impose mutation permission checks on safe reads', async () => {
    const req = request({ method: 'GET', path: `/authoring/sections/${SECTION_ID}` });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('the tracked-change-decision routes — the regex miss that let them run unchecked', () => {
  /**
   * These sit under /documents/:id, not /docs/:id, and docMatch above only
   * matches /docs/ — so they reached the handler with no authorization check
   * at all: targetForRequest returned null and the middleware called next()
   * unconditionally. actionFromPath's own `review` alternatives list
   * 'tracked-change' and 'decision', which looks like it should have caught
   * this, but the real path segment is `tracked-change-decisions` and every
   * alternative in that regex requires a whole segment — `tracked-change` is
   * followed by `-`, not `/` or end-of-string — so it falls through to 'edit'.
   * That is also the CORRECT action: the content change lands via
   * PATCH /sections/:sectionId, already gated as 'edit'.
   */
  it('denies a same-tenant member with no doc_permissions grant — this is the case the fix exists for', async () => {
    installQueryBehavior({ roles: [] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/tracked-change-decisions`,
      user: { ...author, id: 'user-outsider', userId: 'user-outsider' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect((res.body as any).error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
  });

  it('denies the same caller on the bulk route identically', async () => {
    installQueryBehavior({ roles: [] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/tracked-change-decisions/bulk`,
      user: { ...author, id: 'user-outsider', userId: 'user-outsider' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('still allows the document author — an AUTHOR grant is enough to record a decision', async () => {
    installQueryBehavior({ roles: ['AUTHOR'] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/tracked-change-decisions`,
      user: author,
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((res.locals as any).authoringAuthorization).toMatchObject({ action: 'edit', docId: DOC_ID });
  });

  it('a REVIEWER who can review but not edit is still refused here — the same person can accept via /sections/:id, so this is not a workflow lockout', async () => {
    installQueryBehavior({ roles: ['REVIEWER'] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/tracked-change-decisions`,
      user: { ...author, id: 'user-reviewer', userId: 'user-reviewer' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses a FROZEN document with 409, not a silent pass-through', async () => {
    installQueryBehavior({ status: 'FROZEN', roles: ['AUTHOR'] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/tracked-change-decisions`,
      user: author,
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect((res.body as any).error.code).toBe('AUTHORING_DOCUMENT_IMMUTABLE');
  });

  it('does not match a document id that merely starts with "docs" or an unrelated /documents/ route', async () => {
    // Sanity check on the regex's boundaries: it must not swallow neighbouring
    // routes this fix deliberately leaves alone (see the production comment —
    // /documents/:id/review and /request-review have different, incompatible
    // role requirements and must keep going through their own route RBAC).
    installQueryBehavior({ roles: [] });
    const req = request({
      method: 'POST',
      path: `/authoring/documents/${DOC_ID}/review`,
      user: { ...author, id: 'user-outsider', userId: 'user-outsider' },
    });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    // Falls through to `return null` — untouched by this fix, exactly as before.
    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });
});
