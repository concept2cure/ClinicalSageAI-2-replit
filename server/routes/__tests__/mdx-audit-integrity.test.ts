/**
 * GET /api/mdx/audit — integrity reporting contract.
 *
 * This route feeds the Part 11 audit surface. Until 2026-08-14 it emitted
 * `chain: 'ok'` as a literal constant on every row and read `sha`/`prev` from
 * `new_values.sha` / `new_values.prev` — keys `auditService` has never written
 * (auditService.ts:264 stores `entry.details ?? entry.metadata` there). The
 * surface therefore rendered blank hash fields under a "Hash chain" heading
 * while a shield badge asserted tamper-evidence, and it said exactly the same
 * thing whether every row was sealed or none was.
 *
 * These tests exist so that cannot come back. Each one fails against the old
 * implementation: the constant `'ok'` is not a value this contract permits.
 *
 * Locked here:
 *   • `sha` is the REAL `sha256_chain` column, never a JSON blob key.
 *   • `chain` is derived per row: sealed > chained > unchained.
 *   • a row with no chain link is reported `unchained` — never as ok.
 *   • `prev` is empty and `prevAvailable` is false, because the audit_logs
 *     chain is global across tenants and the predecessor is not the caller's
 *     to see (docs/AUDIT_SUBSTRATE_DECISION_2026-08.md).
 *   • the window's `integrity` summary counts what is actually there.
 *   • the tenant predicate is `tenant_id = $1`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import mdxAuditRouter from '../mdx-audit';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', mdxAuditRouter);
  return app;
}

const SHA = 'a'.repeat(64);
const SEAL = 'b'.repeat(64);

/** A row as `auditService` actually writes it — note `new_values` carries the
 *  caller's details, and has never carried `sha` or `prev`. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 42,
    actor_name: 'Test Reviewer',
    action: 'sign',
    table_name: 'submissions',
    record_id: 'SUB-1',
    new_values: { reason: 'Approved for filing' },
    created_at: new Date('2026-08-14T10:00:00Z'),
    sha256_chain: SHA,
    hmac_seal: SEAL,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/audit — per-row integrity', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/audit');
    expect(res.status).toBe(403);
  });

  it('scopes to the caller tenant', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/mdx/audit');
    expect(query.mock.calls[0][0]).toContain('al.tenant_id = $1');
    expect(query.mock.calls[0][1][0]).toBe(7);
  });

  it('reports sha from the real chain column, not from new_values', async () => {
    // The old implementation read new_values.sha. Seed a *different* value
    // there: if it ever leaks into the response, this fails loudly.
    query.mockResolvedValueOnce({
      rows: [row({ new_values: { sha: 'FROM-JSON-BLOB', prev: 'ALSO-JSON' } })],
    });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    expect(res.status).toBe(200);
    expect(res.body.data.events[0].sha).toBe(SHA);
    expect(res.body.data.events[0].sha).not.toBe('FROM-JSON-BLOB');
    expect(res.body.data.events[0].prev).toBe('');
  });

  it('marks a sealed row sealed, a chained-but-unsealed row chained', async () => {
    query.mockResolvedValueOnce({
      rows: [row({ id: 1 }), row({ id: 2, hmac_seal: null })],
    });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    expect(res.body.data.events[0].chain).toBe('sealed');
    expect(res.body.data.events[1].chain).toBe('chained');
  });

  it('marks a row written outside the chain unchained — never ok', async () => {
    query.mockResolvedValueOnce({
      rows: [row({ id: 3, sha256_chain: null, hmac_seal: null })],
    });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    const ev = res.body.data.events[0];
    expect(ev.chain).toBe('unchained');
    expect(ev.chain).not.toBe('ok');
    expect(ev.sha).toBe('');
  });

  it('never claims the chain predecessor is tenant-visible', async () => {
    query.mockResolvedValueOnce({ rows: [row()] });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    // The chain is global across tenants; the predecessor belongs to whichever
    // org wrote last. Presenting the tenant-local previous row as the chain
    // predecessor would be a fabricated linkage.
    expect(res.body.data.events[0].prevAvailable).toBe(false);
    expect(res.body.data.events[0].prev).toBe('');
  });

  it('summarises the window honestly, and flags unchained rows', async () => {
    query.mockResolvedValueOnce({
      rows: [
        row({ id: 1 }),                                            // sealed
        row({ id: 2, hmac_seal: null }),                           // chained
        row({ id: 3, sha256_chain: null, hmac_seal: null }),       // unchained
      ],
    });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    const { integrity } = res.body.data;
    expect(integrity).toMatchObject({
      total: 3,
      sealed: 1,
      chained: 1,
      unchained: 1,
      chainScope: 'global',
      verifiableHere: false,
    });
    expect(integrity.note).toMatch(/1 of 3/);
  });

  it('reports no note when every row in the window is chained', async () => {
    query.mockResolvedValueOnce({ rows: [row({ id: 1 }), row({ id: 2 })] });
    const res = await request(appWith(7)).get('/api/mdx/audit');
    expect(res.body.data.integrity.unchained).toBe(0);
    expect(res.body.data.integrity.note).toBeNull();
  });

  it('fails closed when the audit store is not provisioned', async () => {
    // An empty "ok" audit log reads as "nothing happened", which is the one
    // answer a reviewer must never be given by accident.
    query.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/mdx/audit');
    expect(res.status).toBe(503);
  });
});
