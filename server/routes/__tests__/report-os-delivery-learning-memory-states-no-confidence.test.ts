/**
 * The learning memory a Report OS delivery captures states no confidence: it
 * records that a letter went out, and nothing computed a confidence for it.
 *
 * What the code used to do (until 2026-10-15): captureLearningMemory wrote
 * `confidenceScore: params.confidenceScore ?? 0.8`, and its only caller
 * (POST /deliveries with captureForLearning) passes none, so every captured
 * delivery entered project memory at an invented 80% confidence — which the
 * memory readers rank by and print ("[80% confidence]"). Unscored is null; the
 * readers render it as "[unscored]".
 *
 * The harness is report-os-delivery-recording.test.ts's: real router and
 * drizzle, the connection logging every statement with its parameters.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  const NAME = Symbol.for('drizzle:Name');
  const tables: Record<string, unknown[][]> = {};
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const chain = (next: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['where', 'limit', 'orderBy', 'innerJoin', 'set', 'returning', 'values']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(next).then(ok, ko);
    return c;
  };
  const db = {
    select: () => {
      let table = '';
      const c = chain(() => tables[table]?.shift() ?? []);
      c.from = (t: Record<symbol, string>) => {
        table = t[NAME];
        return c;
      };
      return c;
    },
    insert: () => chain(() => []),
    update: () => chain(() => []),
  };
  const client = {
    query: async (q: string | { text: string; rowMode?: string }, params: unknown[] = []) => {
      const text = (typeof q === 'string' ? q : q.text).replace(/\s+/g, ' ').trim();
      calls.push({ text, params });
      const arrayMode = typeof q !== 'string' && q.rowMode === 'array';
      if (arrayMode && /project_intelligence_profiles/.test(text)) return { rows: [[3]], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async (sql: string) => {
      if (/FROM c2c_submissions/.test(sql)) return { rows: [{ '?column?': 1 }] };
      if (/to_regclass/.test(sql)) return { rows: [{ table_name: 'present' }] };
      return { rows: [] };
    },
  };
  return { tables, calls, db, pool, audit: vi.fn(async () => undefined) };
});

vi.mock('../../services/report-os/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [12],
  canAccessReportScope: async () => true,
}));
vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { boundInsertColumn } from './_report-os-route-harness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: Record<string, unknown> }).user = { id: 5, organizationId: 7, role: 'manager', roles: ['manager'] };
  next();
});
app.use('/api/report-os', reportOsRouter);

const MEMORY = /^insert into "project_memory_entries"/;

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k];
  h.calls.length = 0;
  h.tables.projects = [[{ id: 12 }]];
  h.tables.report_runs = [[{
    id: 41, runUuid: '00000000-0000-4000-8000-000000000041', organizationId: 7, scopeType: 'project',
    scopeId: '12', reportTypeId: 'readiness.executive_digest', status: 'completed', dependencySummary: {},
  }]];
});

describe('POST /deliveries with captureForLearning — the learning memory row', () => {
  it('is written with confidence_score null, not an invented 0.8', async () => {
    const res = await request(app).post('/api/report-os/deliveries').send({
      runId: 41,
      channel: 'external_pdf_export',
      subject: 'Readiness digest for the partner',
      recipients: ['partner'],
      captureForLearning: true,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const learning = h.calls.find(
      (c) => MEMORY.test(c.text) && c.params.includes('outbound_regulatory_correspondence'),
    );
    expect(learning, 'the learning memory was not written').toBeDefined();
    expect(boundInsertColumn(learning!.text, learning!.params, 'confidence_score')).toBeNull();
  });
});
