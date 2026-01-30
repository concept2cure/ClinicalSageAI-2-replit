import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
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

describe('test-assembly routes', () => {
  it('works end-to-end', async () => {
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
    expect(polishResp.body.data.content).toContain('AI added: Polish tone and shorten');
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
