/**
 * GET /api/doc-journey — document-journey read contract.
 *
 * The v2 DocJourney surface adopts this list to drive the stage rail and the
 * per-stage snapshot pane. Locks: 403 without org, the { data } envelope with
 * the display keys ({ id, label, ic, when, who, ver, done, active, sub, kind,
 * snap }, with when_label → when and snap rehydrated), and 42P01 fail-closed to
 * an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import docJourneyRouter from '../doc-journey.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/doc-journey', docJourneyRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/doc-journey', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/doc-journey');
    expect(res.status).toBe(403);
  });

  it('returns journey stages shaped to the display contract (when_label → when)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'ideate', label: 'Ideation', ic: 'sparkles', when_label: 'May 28',
          who: 'AnA + J. Chen', ver: '—', done: true, active: false,
          sub: 'Need identified', kind: 'brief',
          snap: { mode: 'brief', title: 'Document brief', lines: [['Document', 'Clinical Overview']] },
        },
        {
          id: 'submit', label: 'Submission', ic: 'rocket', when_label: 'Jun 18',
          who: 'Reg ops', ver: 'v1.0', done: false, active: true,
          sub: 'BLA 761xyz · sequence 0000 · FDA ESG', kind: 'submit',
          snap: { mode: 'submit', heading: 'Transmission', lines: [], note: 'In transit' },
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/doc-journey');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'label', 'ic', 'when', 'who', 'ver', 'done', 'active', 'sub', 'kind', 'snap']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.when).toBe('May 28');
    expect(first.snap.mode).toBe('brief');
    expect(res.body.data[1].active).toBe(true);
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/doc-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
