import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('/home/user/ClinicalSageAI-2-replit/server/db', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }), pool: { query: async () => ({ rows: [] }) } }));
import { authoringObjectAuthorization } from '../authoringObjectAuthorization';
describe('POST /api/authoring/docs/from-draft passes the object-authorization gate', () => {
  it('reaches the router (the gate treats it like POST /docs — no object exists yet)', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).user = { id: 3, userId: 3, organizationId: 1, email: 'a@b.c', roles: [] }; next(); });
    app.use('/api', authoringObjectAuthorization);
    app.post('/api/authoring/docs/from-draft', (_req, res) => res.status(201).json({ reached: true }));
    const res = await request(app).post('/api/authoring/docs/from-draft').send({ title: 'x' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });
});
