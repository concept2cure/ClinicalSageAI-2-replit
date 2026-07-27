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

  it('allows document creation so the database trigger can seed OWNER and AUTHOR', async () => {
    const req = request({ method: 'POST', path: '/docs', user: author, body: { title: 'New' } });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('allows a document author to edit the section', async () => {
    installQueryBehavior({ roles: ['AUTHOR'] });
    const req = request({ method: 'PATCH', path: `/sections/${SECTION_ID}`, user: author });
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
      path: `/sections/${SECTION_ID}`,
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
      path: `/sections/${SECTION_ID}/comment`,
      user: reviewer,
    });
    const commentRes = response();
    const commentNext = vi.fn();
    await authoringObjectAuthorization(commentReq, commentRes, commentNext);
    expect(commentNext).toHaveBeenCalledOnce();

    const editReq = request({ method: 'PATCH', path: `/sections/${SECTION_ID}`, user: reviewer });
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
      path: `/sections/${SECTION_ID}/approve`,
      user: approver,
    });
    const approveRes = response();
    const approveNext = vi.fn();
    await authoringObjectAuthorization(approveReq, approveRes, approveNext);
    expect(approveNext).toHaveBeenCalledOnce();

    const editReq = request({ method: 'DELETE', path: `/sections/${SECTION_ID}`, user: approver });
    const editRes = response();
    const editNext = vi.fn();
    await authoringObjectAuthorization(editReq, editRes, editNext);
    expect(editNext).not.toHaveBeenCalled();
    expect(editRes.statusCode).toBe(403);
  });

  it('blocks content mutation after the document becomes immutable', async () => {
    installQueryBehavior({ status: 'APPROVED', roles: ['OWNER', 'AUTHOR'] });
    const req = request({ method: 'PATCH', path: `/sections/${SECTION_ID}`, user: author });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'AUTHORING_DOCUMENT_IMMUTABLE' } });
  });

  it('fails closed with 503 when the permission store cannot be queried', async () => {
    installQueryBehavior({ throwOnPermission: true });
    const req = request({ method: 'PATCH', path: `/sections/${SECTION_ID}`, user: author });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'AUTHORING_AUTHORIZATION_UNAVAILABLE' } });
  });

  it('rejects a mutation when verified principal or tenant context is missing', async () => {
    const req = request({ method: 'PATCH', path: `/sections/${SECTION_ID}` });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('does not impose mutation permission checks on safe reads', async () => {
    const req = request({ method: 'GET', path: `/sections/${SECTION_ID}` });
    const res = response();
    const next = vi.fn();

    await authoringObjectAuthorization(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(h.query).not.toHaveBeenCalled();
  });
});
