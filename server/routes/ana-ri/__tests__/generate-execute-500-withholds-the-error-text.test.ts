/**
 * POST /api/ana-ri/generate and /execute answer an unexpected failure with a
 * fixed message; the error's text goes to the log, not the response.
 *
 * What the routes used to do (until 2026-10-15): the 500 body was
 * `error?.message || 'Internal server error'`, so a driver error such as
 * `relation "..." does not exist` reached the caller verbatim.
 */
import express, { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const SENTINEL = 'SENTINEL-DB-DETAIL relation "governed_artifacts" does not exist';

vi.mock('../../../db.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }));
vi.mock('../../../services/ai-gateway/index.js', () => ({ getGateway: () => ({}) }));
vi.mock('../../../services/ana-ri/artifact-generator.js', () => ({
  generateArtifact: async () => { throw new Error(SENTINEL); },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  COMMAND_REGISTRY: [{ name: 'list_projects' }],
  executeCommands: async () => { throw new Error(SENTINEL); },
}));

import { mountGenerateExecuteRoutes } from '../generate-execute';

const router = Router();
mountGenerateExecuteRoutes(router);
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { tenantId: 4, userId: 7 });
  next();
});
app.use('/api/ana-ri', router);

describe('ana-ri generate/execute 500s', () => {
  it('/generate does not return the error text', async () => {
    const res = await request(app).post('/api/ana-ri/generate').send({
      action_type: 'risk_memo', conversation_context: [{ role: 'user', content: 'x' }], project_id: 12,
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('/execute does not return the error text', async () => {
    const res = await request(app).post('/api/ana-ri/execute').send({ command: 'list_projects', params: {} });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
    expect(res.body.error.code).toBe('EXECUTION_ERROR');
  });
});
