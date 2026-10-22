import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-study-tagging-secret-32-chars';
});
const svc = vi.hoisted(() => ({ upsertLeaf: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return { ...actual, upsertLeaf: (...a: unknown[]) => svc.upsertLeaf(...a) };
});
import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  if (req.headers['x-no-user'] !== 'true') req.user = { id: 3, userId: 3, organizationId: 7,
    role: req.headers['x-viewer'] ? 'viewer' : 'member',
    roles: req.headers['x-viewer'] ? ['viewer'] : expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);
const EDIT = { leafId: 99, sectionCode: '5.3.5.1', title: 'Study report', studyId: 'STUDY-101', stfFileTag: 'study-report-body',
  studyTaggingEdit: { expectedStudyId: null, expectedStfFileTag: null, expectedUpdatedAt: '2026-10-20T00:00:00.000Z' },
  reason: 'Sponsor confirmed study classification' };
const put = (body: Record<string, unknown>) => request(app).put('/api/submissions/sequences/11/leaves').send(body);
beforeEach(() => { svc.upsertLeaf.mockReset(); svc.upsertLeaf.mockResolvedValue({ id: 99, sequenceId: 11, studyId: 'STUDY-101',
  stfFileTag: 'study-report-body', auditTrail: { persisted: true } }); });

describe('study metadata on the existing governed leaf PUT', () => {
  it('passes the exact edit snapshot and normalized values with session identity', async () => {
    const res = await put({ ...EDIT, studyId: ' STUDY-101 ', stfFileTag: ' study-report-body ', organizationId: 999, userId: 999 });
    expect(res.status).toBe(200);
    expect(svc.upsertLeaf.mock.calls[0]).toEqual([{ ...EDIT, sequenceId: 11 }, { userId: 3, organizationId: 7, ipAddress: expect.any(String) }]);
  });
  it.each([{ studyId: 'bad/id' }, { stfFileTag: 'wrong\ntag' }, { stfFileTag: '\tstudy-report-body' }, { stfFileTag: 'x'.repeat(129) },
    { studyId: '' }, { studyTaggingEdit: {} }, { leafId: undefined }, { studyId: undefined }, { stfFileTag: undefined }])('refuses malformed metadata or incomplete edit before the writer: %j', async (invalid) => {
      const res = await put({ ...EDIT, ...invalid });
      expect(res.status).toBe(400);
      expect(svc.upsertLeaf).not.toHaveBeenCalled();
    });
  it('accepts an advisory document tag absent from the recall list and explicit null clearing', async () => {
    expect((await put({ ...EDIT, stfFileTag: 'sponsor-reviewed-classification' })).status).toBe(200);
    expect((await put({ ...EDIT, studyId: null, stfFileTag: null })).status).toBe(200);
  });
  it('requires the existing governed reason', async () => {
    expect((await put({ ...EDIT, reason: '' })).status).toBe(400);
    expect(svc.upsertLeaf).not.toHaveBeenCalled();
  });
  it('retains authentication and author-role checks', async () => {
    expect((await put(EDIT).set('x-no-user', 'true')).status).toBe(401);
    expect((await put(EDIT).set('x-viewer', 'true')).status).toBe(403);
    expect(svc.upsertLeaf).not.toHaveBeenCalled();
  });
  it('reports stale state as conflict', async () => {
    svc.upsertLeaf.mockRejectedValue(Object.assign(new Error('Reread the leaf before editing.'), { code: 'STALE_LEAF' }));
    const res = await put(EDIT);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_LEAF');
  });
});
