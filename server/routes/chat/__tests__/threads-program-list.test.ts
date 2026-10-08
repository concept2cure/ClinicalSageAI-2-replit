/**
 * GET /api/chat/threads?program_id= — the program-scoped thread list.
 *
 * Threads carry the shell's program key in chat_threads.program_id (PF-10 S2,
 * bound only to a program of the thread's own organization); the list reads it
 * back org-scoped, refuses a non-UUID, and never lists across tenants. A
 * thread whose legacy metadata names a program but whose program_id is NULL
 * (the 20261001c backfill left it unbound: the program was another
 * organization's) is not listed under that program.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { listThreads } from '../threads';
import { programIdForThread } from '../../../services/chat-thread-helpers';

function res() {
  const r: any = { statusCode: 200, body: null };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}

const PID = '0F3C1A2B-1111-4222-8333-444455556666';

beforeEach(() => { query.mockReset(); query.mockImplementation(async () => ({ rows: [] })); });

describe('programIdForThread', () => {
  it('accepts a UUID (normalised to lower case) and nothing else', () => {
    expect(programIdForThread(PID)).toBe(PID.toLowerCase());
    expect(programIdForThread('42')).toBeNull();
    expect(programIdForThread(42)).toBeNull();
    expect(programIdForThread(undefined)).toBeNull();
  });
});

describe('listThreads by program', () => {
  it('lists the org\'s threads bound to the program, newest first, with the first user message as title', async () => {
    query.mockResolvedValue({ rows: [{ id: 'ana-ri_1', title: 'Draft 2.5', created_at: 'x', updated_at: 'y', program_id: PID.toLowerCase() }] });
    const r = res();
    await listThreads({ query: { program_id: PID, limit: '5' }, tenantId: 7, user: { id: 41 } } as any, r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ threads: [expect.objectContaining({ id: 'ana-ri_1', title: 'Draft 2.5' })] });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/t\.program_id = \$2/);
    expect(sql).not.toMatch(/metadata->>'programId'/);
    expect(sql).toMatch(/organization_id = \$1/);
    expect(sql).toMatch(/role = 'user'/);
    expect(sql).toMatch(/t\.user_id = \$4/);
    // The fifth parameter is the page offset (e04b568f, QA 2026-10-08); none asked, so 0.
    expect(params).toEqual([7, PID.toLowerCase(), 5, 41, 0]);
  });

  it('refuses a program id that is not a UUID rather than querying with it', async () => {
    const r = res();
    await listThreads({ query: { program_id: '42' }, tenantId: 7 } as any, r);
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('THREAD_PROGRAM_INVALID');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns nothing without an organization — never a cross-tenant list', async () => {
    const r = res();
    await listThreads({ query: { program_id: PID } } as any, r);
    expect(r.body).toEqual({ threads: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports a failed read as a failure, not as no threads', async () => {
    // A rejection created lazily per call — an eagerly created rejected
    // promise is reported by the runner as unhandled even though the route
    // catches it.
    query.mockImplementation(async () => { throw Object.assign(new Error('boom'), { code: '42P01' }); });
    const r = res();
    await listThreads({ query: { program_id: PID }, tenantId: 7, user: { id: 41 } } as any, r);
    expect(r.statusCode).toBe(503);
    expect(r.body.code).toBe('THREAD_STORE_UNPROVISIONED');
  });
});

/* docs/design/ONE_ANA_ONE_CANVAS.md, slice 3. A colleague's conversation
   cannot be opened (resolveAccessibleThread answers THREAD_FORBIDDEN), yet both
   lists named it by its first message. They list the caller's own. */
describe('listThreads lists only the caller\'s own conversations', () => {
  it('scopes the recents list to the signed-in person', async () => {
    const r = res();
    await listThreads({ query: {}, tenantId: 7, user: { id: 41 } } as any, r);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/t\.organization_id = \$1 AND t\.user_id = \$3/);
    expect(params).toEqual([7, 10, 41]);
  });

  it('scopes the project list to the signed-in person', async () => {
    const r = res();
    await listThreads({ query: { program_id: PID }, tenantId: 7, user: { id: 41 } } as any, r);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/t\.user_id = \$4/);
    expect(params[3]).toBe(41);
  });

  it('lists nothing for a caller it cannot identify, rather than the organisation\'s', async () => {
    for (const q of [{}, { program_id: PID }]) {
      const r = res();
      await listThreads({ query: q, tenantId: 7 } as any, r);
      expect(r.body).toEqual({ threads: [] });
    }
    expect(query).not.toHaveBeenCalled();
  });
});
