/**
 * An Authoring export record is kept (CSR path review, 2026-10-29).
 *
 * DELETE /api/authoring/export-history/:id hard-deleted the row that records
 * what was exported, by whom, with the bytes' SHA-256 and, for a filing, the
 * Vault copy it became. Its exporter or anyone with QA in the token could do
 * it. That row is read beyond the Exports rail: data disposition takes it as
 * the proof that a filed Vault rendition carries another document's data
 * (document-data-disposition/impact.ts), so deleting it let that source be
 * withdrawn while its filed copy stayed. No client calls the route. It now
 * refuses, and writes nothing.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-export-record';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(roles: string[]): Promise<string> {
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co', roles })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET))}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const writes = () => mockQuery.mock.calls.map(([sql]) => String(sql)).filter((s) => /^\s*(DELETE|INSERT|UPDATE)\b/i.test(s));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM authoring_export_history')) {
      return { rowCount: 1, rows: [{ exported_by: 'author@test.co', document_id: 'd0c0d0c0-0000-4000-8000-0000000000d1' }] };
    }
    return { rowCount: 0, rows: [] };
  });
});

describe('DELETE /api/authoring/export-history/:id', () => {
  it.each([[['AUTHOR']], [['QA']]])('refuses for the exporter and for QA (%j), and deletes and writes nothing', async (roles) => {
    const res = await request(makeApp()).delete('/api/authoring/export-history/e1').set('Authorization', await bearer(roles));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EXPORT_RECORD_RETAINED');
    expect(res.body.error).toMatch(/Nothing was deleted/);
    expect(writes()).toEqual([]);
  });
});
