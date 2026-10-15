/**
 * A client objective is filed under the caller's organisation and author.
 *
 * POST /api/client-intelligence/ana/objectives inserted
 * { organizationId, createdBy, ...req.body }: the body came last, so it chose
 * the organisation the objective was filed under, its author, its id and its
 * timestamps. And an objective whose status nobody stated was stored as the
 * column default, "on_track". Only the database is replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ values: [] as Array<Record<string, unknown>> }));
vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.values.push(v);
        return { returning: async () => [{ id: 1, ...v }] };
      },
    }),
  },
}));

import router from '../client-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 5 };
    next();
  });
  a.use('/api/client-intelligence', router);
  return a;
}

beforeEach(() => {
  h.values.length = 0;
});

describe('POST /api/client-intelligence/ana/objectives', () => {
  it('takes the organisation and author from the session, and no id or timestamp from the body', async () => {
    const r = await request(app()).post('/api/client-intelligence/ana/objectives').send({
      objective: 'File the IND', category: 'regulatory', status: 'at_risk',
      organizationId: 999, createdBy: 666, id: 4242, createdAt: '2000-01-01', updatedAt: '2000-01-01',
    });
    expect(r.status).toBe(200);
    expect(h.values).toHaveLength(1);
    expect(h.values[0]).toMatchObject({ organizationId: 5, createdBy: 17, objective: 'File the IND', status: 'at_risk' });
    expect(h.values[0]).not.toHaveProperty('id');
    expect(h.values[0]).not.toHaveProperty('createdAt');
    expect(h.values[0]).not.toHaveProperty('updatedAt');
  });

  it('records an objective whose status nobody stated as not assessed, not "on_track"', async () => {
    await request(app()).post('/api/client-intelligence/ana/objectives').send({ objective: 'O', category: 'clinical' });
    expect(h.values[0].status).toBe('not_assessed');
  });
});
