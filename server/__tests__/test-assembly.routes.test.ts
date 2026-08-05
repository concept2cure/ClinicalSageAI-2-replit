/**
 * test-assembly routes — start / edit / polish, end to end over HTTP.
 *
 * Moved out of `server/test/`, a directory no vitest include glob covers, so
 * this had never run. It was allowlisted as "needs a real AI provider"; the
 * real problem is that it asserted on `polish`'s FALLBACK text while letting
 * the live AI gateway run. Without a provider key the gateway does not fail —
 * it answers "## AnA Response (Demo Mode)…", a success with content — so the
 * fallback never executes and the assertion cannot pass. With a key it would
 * get real model prose and also not match. The test was unpassable either way.
 *
 * The gateway is mocked here for the same reason as in assemblyLine.test.ts:
 * the route's job is to carry the service's result out over HTTP faithfully,
 * and that is testable without a model in the loop.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* AssemblyLine.polish() imports the gateway dynamically; the mock must match
   the specifier the source uses, extension included. */
const chat = vi.hoisted(() => vi.fn());
vi.mock('../services/ai-gateway/index.js', () => ({ getGateway: () => ({ chat }) }));

import { testAssemblyRoutes } from '../routes/test-assembly';

function createMockDb() {
  const store: Record<string, any> = {};
  return {
    async query(sql: string, params: any[]) {
      const stmt = sql.toLowerCase().trim();
      if (stmt.startsWith('insert into assembly_docs')) {
        const [id, status, content] = params;
        store[id] = { id, status, content, created_at: new Date().toISOString() };
        return { rows: [] };
      }
      if (stmt.startsWith('update assembly_docs')) {
        const [content, id] = params;
        if (!store[id]) return { rows: [] };
        store[id].content = content;
        if (sql.includes("ai_polished")) store[id].status = 'ai_polished';
        if (sql.includes("human_edited")) store[id].status = 'human_edited';
        return { rows: [] };
      }
      if (stmt.startsWith('select * from assembly_docs')) {
        const [id] = params;
        return { rows: store[id] ? [store[id]] : [] };
      }
      return { rows: [] };
    }
  };
}

beforeEach(() => chat.mockReset());

describe('test-assembly routes', () => {
  it('carries the model\u2019s polished text out over HTTP', async () => {
    chat.mockResolvedValue({ content: 'Polished, shorter regulatory prose.' });
    const app = express();
    app.use(express.json());
    const db = createMockDb();
    app.use('/api/test-assembly', testAssemblyRoutes(db as any));

    const startResp = await request(app)
      .post('/api/test-assembly/start')
      .send({ request: 'Please draft a test doc' })
      .expect(200);

    expect(startResp.body.success).toBe(true);
    const docId = startResp.body.data?.docId;
    expect(docId).toBeTruthy();

    const editResp = await request(app)
      .post('/api/test-assembly/edit')
      .send({ docId, content: 'Human edits applied' })
      .expect(200);
    expect(editResp.body.success).toBe(true);

    const polishResp = await request(app)
      .post('/api/test-assembly/polish')
      .send({ docId, instruction: 'Polish tone and shorten' })
      .expect(200);
    expect(polishResp.body.success).toBe(true);
    // The route returns what the service produced, unaltered.
    expect(polishResp.body.data.content).toBe('Polished, shorter regulatory prose.');
  });

  it('carries the MARKED fallback out over HTTP when the model returns nothing', async () => {
    // The branch the original assertion described but could never reach.
    chat.mockResolvedValue({ content: '' });
    const app = express();
    app.use(express.json());
    app.use('/api/test-assembly', testAssemblyRoutes(createMockDb() as any));

    const { body: started } = await request(app)
      .post('/api/test-assembly/start')
      .send({ request: 'Please draft a test doc' })
      .expect(200);

    const polishResp = await request(app)
      .post('/api/test-assembly/polish')
      .send({ docId: started.data.docId, instruction: 'Polish tone and shorten' })
      .expect(200);

    expect(polishResp.body.success).toBe(true);
    // Author's text survives, and the substitution is attributed rather than
    // passed off as the model's work.
    expect(polishResp.body.data.content).toContain('Please draft a test doc');
    expect(polishResp.body.data.content).toContain('[AI added: Polish tone and shorten]');
  });

  it('validates input', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/test-assembly', testAssemblyRoutes(createMockDb() as any));

    await request(app).post('/api/test-assembly/start').send({}).expect(400);
    await request(app).post('/api/test-assembly/edit').send({}).expect(400);
    await request(app).post('/api/test-assembly/polish').send({}).expect(400);
  });
});
