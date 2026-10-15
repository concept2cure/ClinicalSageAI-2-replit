/**
 * The Phase 3 AI routes fail closed when their flags are on (2026-10-04).
 *
 * The flags these routes check are never set, so today every one answers 503.
 * Behind them sat answers nobody computed: global-change/execute returned
 * `digital_signature_verified: true` without checking a signature or changing
 * anything; the service stub answered `compliant: true, score: 1.0` for any
 * Module 2/3 pair, no entities for any text and an empty vector; and the
 * global-change preview ran ILIKE on a json column and handed out a change
 * request id that named nothing. These tests turn the flags on and pin what
 * each route says instead.
 */
import express from 'express';
import request from 'supertest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  where: [] as unknown[],
}));
vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          dbState.where.push(condition);
          return Promise.resolve(dbState.rows);
        },
      }),
    }),
  },
}));

import router from '../phase3-routes.js';
import regulatoryAIPhase3 from '../../../services/regulatoryAIServicePhase3.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: 11, organizationId: 7, role: 'member' };
    next();
  });
  app.use('/api', router);
  return app;
}

function allEntries() {
  return (regulatoryAIPhase3 as any).getDeadLetterQueue({ all: true });
}

beforeEach(() => {
  dbState.rows = [];
  dbState.where = [];
  (regulatoryAIPhase3 as any).clearDeadLetterQueue(undefined, { all: true });
  vi.spyOn(regulatoryAIPhase3 as any, 'getFeatureFlags').mockReturnValue({
    ENABLE_AI_INTELLIGENCE: true,
    ENABLE_ECTD_4_AUTOMATION: true,
  });
});

afterEach(() => vi.restoreAllMocks());

describe('global-change/execute', () => {
  it('refuses with 501 and claims no signature verification and no execution', async () => {
    const res = await request(makeApp())
      .post('/api/ai/global-change/execute')
      .send({ transaction_id: '0f8fad5b-d9cb-469f-a165-70867728950e', digital_signature: 'anything' });

    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({ success: false, code: 'GLOBAL_CHANGE_NOT_IMPLEMENTED' });
    expect(res.body).not.toHaveProperty('digital_signature_verified');
    expect(res.body).not.toHaveProperty('executed_at');
  });
});

describe('the unimplemented AI methods', () => {
  it.each([
    ['/api/ai/consistency-check', { module2Content: 'Module 2 text', module3Content: 'Module 3 text' }, 'consistency-check'],
    ['/api/ai/ner-extract', { componentText: 'some component text' }, 'ner-extract'],
    ['/api/ai/generate-embedding', { text: 'some text' }, 'generate-embedding'],
  ])('%s answers an error, never a result, and dead-letters it', async (path, body, operation) => {
    const res = await request(makeApp()).post(path).send(body);

    expect(res.status).toBe(500);
    expect(res.body.success).not.toBe(true);
    expect(res.body).not.toHaveProperty('data');
    expect(res.body).not.toHaveProperty('embedding');
    expect(allEntries()).toEqual([expect.objectContaining({ operation, organizationId: 7 })]);
    expect(allEntries()[0].error).toMatch(/not implemented/);
  });

  it('never answers a compliance verdict it did not compute', async () => {
    await expect(regulatoryAIPhase3.checkCompliance('a', 'b', 'c')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });
});

describe('global-change/initiate', () => {
  it('matches the json content as text, literally, and returns a preview with no change-request id', async () => {
    dbState.rows = [
      { udi: '3.2.S.4.1-p-1', type: 'paragraph', moduleContext: 'Module 3.2.S', lifecycleState: 'new' },
    ];
    const res = await request(makeApp())
      .post('/api/ai/global-change/initiate')
      .send({ entity_type: 'assay', original_value: '50%_HPLC', new_value: 'UPLC' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, preview_only: true });
    expect(res.body).not.toHaveProperty('transaction_id');
    expect(res.body).not.toHaveProperty('requires_approval');
    expect(res.body.preview.components).toEqual([
      { udi: '3.2.S.4.1-p-1', type: 'paragraph', module: 'Module 3.2.S', lifecycle_state: 'new' },
    ]);
    expect(res.body.preview.estimated_impact.modules_affected).toEqual(['Module 3.2.S']);

    const query = new PgDialect().sqlToQuery(dbState.where[0] as never);
    expect(query.sql).toContain('"components"."content"::text ILIKE');
    expect(query.params).toContain(7);
    expect(query.params).toContain('%50\\%\\_HPLC%');
  });
});
