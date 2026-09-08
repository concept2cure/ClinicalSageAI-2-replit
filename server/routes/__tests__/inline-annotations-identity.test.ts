/**
 * Inline annotations — who acted, and on whose behalf.
 *
 * The route's own header claims "@compliance FDA 21 CFR Part 11 — all
 * annotations immutably audit-logged". Three things were wrong with that.
 *
 *   • `getOrgId` ended `|| 1`, so a request with no tenant context read and
 *     wrote ORGANIZATION 1's annotations and its approve/reject decisions.
 *   • `createdBy` and `resolvedBy` were the literal string 'Current User'. The
 *     record of who approved or rejected a passage of a regulated document was
 *     words nobody is.
 *   • Every `logAction` call omitted tenantId and userId, so each audit row
 *     landed under tenant 0 with a null actor — a trail recording neither whose
 *     document it was nor who touched it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const queryMock = vi.fn();
const insertMock = vi.fn();
const getByIdMock = vi.fn();
const updateMock = vi.fn();
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({
    query: (...a: unknown[]) => queryMock(...a),
    insert: (...a: unknown[]) => insertMock(...a),
    getById: (...a: unknown[]) => getByIdMock(...a),
    update: (...a: unknown[]) => updateMock(...a),
  }),
}));

const logAction = vi.fn();
vi.mock('../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));

import annotationsRouter from '../inline-annotations';

/** org null = no tenant context; user null = authenticated shape without a user. */
function app(org: number | null = 7, user: Record<string, unknown> | null = { id: 42, name: 'R. Okafor' }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantContext = { organizationId: org };
    if (user !== null) (req as any).user = user;
    next();
  });
  a.use('/api/inline-annotations', annotationsRouter);
  return a;
}

const newAnnotation = {
  annotationType: 'approval',
  selectedText: 'The primary endpoint is overall survival.',
  rangeFrom: 10,
  rangeTo: 52,
  content: 'Confirm this matches the SAP.',
};

beforeEach(() => {
  queryMock.mockReset();
  insertMock.mockReset();
  getByIdMock.mockReset();
  updateMock.mockReset();
  logAction.mockReset();
  queryMock.mockResolvedValue([]);
  insertMock.mockResolvedValue({ id: 5 });
  updateMock.mockResolvedValue({ id: 5 });
});

describe('the inline-annotation router refuses without organization context', () => {
  it('403s rather than defaulting to organization 1', async () => {
    const res = await request(app(null)).get('/api/inline-annotations/12');

    expect(res.status).toBe(403);
    // Nothing was read on somebody else's behalf.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('403s on a write too — no decision is recorded for a tenant nobody named', async () => {
    const res = await request(app(null))
      .post('/api/inline-annotations/12/3/decide')
      .send({ decision: 'approved' });

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });
});

describe('an annotation records who actually made it', () => {
  it('creates with the signed-in user, not "Current User"', async () => {
    const res = await request(app()).post('/api/inline-annotations/12').send(newAnnotation);

    expect(res.status).toBe(201);
    const [, , , data] = insertMock.mock.calls[0] as [number, string, string, Record<string, unknown>];
    expect(data.createdBy).toBe('R. Okafor');
    expect(data.createdBy).not.toBe('Current User');
    expect(data.createdByUserId).toBe(42);
  });

  it('falls back to the email, then the user id — never to a placeholder', async () => {
    await request(app(7, { id: 42, email: 'r.okafor@example.test' }))
      .post('/api/inline-annotations/12')
      .send(newAnnotation);
    expect((insertMock.mock.calls[0][3] as Record<string, unknown>).createdBy).toBe('r.okafor@example.test');

    insertMock.mockClear();
    await request(app(7, { id: 42 })).post('/api/inline-annotations/12').send(newAnnotation);
    expect((insertMock.mock.calls[0][3] as Record<string, unknown>).createdBy).toBe('user #42');
  });

  it('refuses the write when the user cannot be identified at all', async () => {
    const res = await request(app(7, null)).post('/api/inline-annotations/12').send(newAnnotation);

    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('a decision records who decided, and the audit row says whose document it was', () => {
  it('names the decider and carries tenant + actor into the audit row', async () => {
    getByIdMock.mockResolvedValue({ id: 3, annotationType: 'approval', selectedText: 'x', replies: [] });

    const res = await request(app())
      .post('/api/inline-annotations/12/3/decide')
      .send({ decision: 'approved', note: 'Matches the SAP.' });

    expect(res.status).toBe(200);
    const [, , updated] = updateMock.mock.calls[0] as [number, number, Record<string, unknown>];
    expect(updated.resolvedBy).toBe('R. Okafor');
    expect(updated.resolvedByUserId).toBe(42);

    const entry = logAction.mock.calls[0][0] as Record<string, unknown>;
    // Was tenant 0 with a null actor on every row this route wrote.
    expect(entry.tenantId).toBe(7);
    expect(entry.userId).toBe(42);
    expect(entry.action).toBe('inline_annotation_approved');
  });
});

describe('a failure does not hand the caller the exception text', () => {
  it('returns a plain message, not err.message', async () => {
    queryMock.mockRejectedValue(new Error('relation "project_memory_entries" does not exist'));

    const res = await request(app()).get('/api/inline-annotations/12');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch annotations');
    expect(JSON.stringify(res.body)).not.toMatch(/project_memory_entries/);
  });
});
