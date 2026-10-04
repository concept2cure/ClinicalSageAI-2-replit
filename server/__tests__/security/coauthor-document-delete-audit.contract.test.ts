/**
 * Part 11 contract test — coauthor_documents deletes are audited in-transaction.
 *
 * Both routes that hard-delete coauthor_documents (a regulated eCTD document
 * record) — ectd-documents.ts and coauthor.ts — previously deleted with no
 * audit (§11.10(e) gap, QA_REPORT #14). They now delete and write an
 * audit_events row in the SAME transaction (atomic, fail-closed). Mocks the
 * data layer; runs without a DB.
 *
 * 2026-10-01 (D5, P11-B-1): both go through deleteCoauthorDocument
 * (services/coauthor/coauthor-audit.ts), which reads the row and its version
 * count FOR UPDATE first and refuses a document with saved versions (409),
 * deleting nothing. The event's reason is the person's stated changeReason, or
 * null: it was a sentence the code wrote ('coauthor document deleted').
 * Pinned on a real database by routes/__tests__/coauthorPutStatus.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { order, clientQuery, state, audits } = vi.hoisted(() => ({
  order: [] as string[],
  clientQuery: vi.fn(),
  state: { auditShouldThrow: false, evidenceFound: true, versions: 0 },
  audits: [] as Array<{ sql: string; params: unknown[] }>,
}));

/**
 * The audit_events row an INSERT would write, column by column: the column
 * list zipped with the VALUES tuple, $n resolved from the params and SQL
 * literals kept as written. 2026-09-23 (W5/D7, co-author final pass): the
 * cases above pinned only statement order and rollback, so the event type,
 * the reason and the Part 11 flags could change and every test still passed.
 */
function auditRow(sql: string, params: unknown[]): Record<string, unknown> {
  const m = /INSERT\s+INTO\s+audit_events\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*$/i.exec(sql.trim());
  if (!m) throw new Error(`not an audit_events INSERT: ${sql}`);
  const cols = m[1].split(',').map((c) => c.trim());
  const vals = m[2].split(/,(?![^(]*\))/).map((v) => v.trim());
  expect(vals).toHaveLength(cols.length);
  return Object.fromEntries(
    cols.map((c, i) => {
      const v = vals[i];
      const ref = /^\$(\d+)$/.exec(v);
      if (ref) return [c, params[Number(ref[1]) - 1]];
      if (/^'.*'$/.test(v)) return [c, v.slice(1, -1)];
      if (/^(true|false)$/i.test(v)) return [c, v.toLowerCase() === 'true'];
      return [c, v];
    }),
  );
}

vi.mock('../../db', () => ({
  db: {},
  query: vi.fn(async () => ({ rows: [] })),
  transaction: async (cb: (c: any) => Promise<any>) => cb({ query: clientQuery }),
}));
// coauthor.ts authenticates via ../auth; pass-through with an injected user.
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, name: 'Author', role: 'regulatory-author' };
    next();
  },
}));

function resetClient() {
  clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/FROM\s+coauthor_documents\b[\s\S]*FOR UPDATE/i.test(sql)) {
      order.push('lock');
      return { rows: state.evidenceFound ? [{ id: 42, status: 'draft', title: 'Doc', content: '<p>x</p>' }] : [] };
    }
    if (/FROM\s+coauthor_document_versions/i.test(sql)) {
      order.push('count');
      return { rows: [{ versions: state.versions }] };
    }
    if (/DELETE\s+FROM\s+coauthor_documents/i.test(sql)) {
      order.push('delete');
      return { rows: [] };
    }
    if (/INSERT\s+INTO\s+audit_events/i.test(sql)) {
      order.push('audit');
      audits.push({ sql, params: [...(params ?? [])] });
      if (state.auditShouldThrow) throw new Error('audit_events insert failed');
      return { rows: [] };
    }
    return { rows: [] };
  });
}

async function makeApp(routerPath: string, mount: string) {
  const router = (await import(routerPath)).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = {
      id: 1,
      organizationId: 7,
      name: 'Author',
      role: 'regulatory-author',
      roles: ['regulatory-author'],
    };
    next();
  });
  app.use(mount, router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  audits.length = 0;
  state.auditShouldThrow = false;
  state.evidenceFound = true;
  state.versions = 0;
  resetClient();
});

describe.each([
  ['../../routes/ectd-documents', '/api/ectd-documents', '/42'],
  ['../../routes/coauthor', '/api/coauthor', '/documents/42'],
])('Part 11 — coauthor_documents delete audit (%s)', (routerPath, mount, path) => {
  const reason = 'Duplicate placed in error';

  it('deletes and audits in one transaction', async () => {
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`);
    expect(res.status).toBe(200);
    expect(order).toEqual(['lock', 'count', 'delete', 'audit']);
  });

  it('fails closed — an audit failure rolls the delete back (500)', async () => {
    state.auditShouldThrow = true;
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`);
    expect(res.status).toBe(500);
    expect(order).toEqual(['lock', 'count', 'delete', 'audit']);
  });

  it('404 when the document is absent performs no delete and no audit', async () => {
    state.evidenceFound = false;
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`);
    expect(res.status).toBe(404);
    expect(order).toEqual(['lock']);
  });

  it('409 when the document has saved versions: nothing deleted, nothing audited', async () => {
    state.versions = 2;
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'DOCUMENT_HAS_HISTORY', versions: 2 });
    expect(order).toEqual(['lock', 'count']);
  });

  it('400 for a stated reason the one rule refuses: nothing read, deleted or audited', async () => {
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`).send({ changeReason: 'dup' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_INVALID');
    expect(order).toEqual([]);
  });

  it('records no reason when none was stated, rather than one the code wrote', async () => {
    const app = await makeApp(routerPath, mount);
    expect((await request(app).delete(`${mount}${path}`)).status).toBe(200);
    expect(auditRow(audits[0].sql, audits[0].params).reason).toBeNull();
  });

  it('writes the deleted event with its reason, actor and Part 11 flags', async () => {
    const app = await makeApp(routerPath, mount);
    const res = await request(app).delete(`${mount}${path}`).send({ changeReason: reason });
    expect(res.status).toBe(200);
    expect(audits).toHaveLength(1);
    expect(auditRow(audits[0].sql, audits[0].params)).toMatchObject({
      organization_id: 7,
      event_type: 'coauthor_document.deleted',
      entity_type: 'coauthor_document',
      entity_id: 42,
      user_id: 1,
      user_name: 'Author',
      user_role: 'regulatory-author',
      reason,
      regulatory_significant: true,
      gxp_relevant: true,
    });
  });
});
