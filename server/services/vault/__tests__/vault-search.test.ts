/**
 * The one Vault search query carries the tenant boundary in every statement
 * (plan critique 15, library search).
 *
 * On PostgreSQL the runtime role's RLS also hides another organisation's
 * documents (tests/db/vault-library-search.dbtest.ts), so a query that lost its
 * organisation predicate would still pass there. This pins the predicate
 * itself, the second wall: the count and the page each name the
 * organisation as $1, for a project search and for the library search.
 */
import { describe, it, expect, vi } from 'vitest';
import { searchVaultDocuments } from '../vault-search';

function capture() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: /count\(\*\)/.test(sql) ? [{ total: 0 }] : [] };
    }),
  };
  return { db, calls };
}

const ORG = 42;
const PROGRAM = '11111111-1111-4111-8111-111111111111';

describe('searchVaultDocuments', () => {
  it('the library search names the organisation in the count and in the page', async () => {
    const { db, calls } = capture();
    await searchVaultDocuments(db, { organizationId: ORG, programId: null, q: 'stability', limit: 25, offset: 0, includeSuperseded: false });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.params[0]).toBe(ORG);
      expect(c.sql).toMatch(/rp\.organization_id = \$1/);
      expect(c.sql).not.toMatch(/d\.program_id = \$/);
    }
    expect(calls[1].sql).toMatch(/prog\.organization_id = \$1/);
  });

  it('a project search adds the project, and keeps the organisation', async () => {
    const { db, calls } = capture();
    await searchVaultDocuments(db, { organizationId: ORG, programId: PROGRAM, q: 'stability', limit: 25, offset: 0, includeSuperseded: true });
    for (const c of calls) {
      expect(c.sql).toMatch(/rp\.organization_id = \$1/);
      expect(c.sql).toMatch(/d\.program_id = \$3::uuid/);
      expect(c.params.slice(0, 3)).toEqual([ORG, 'stability', PROGRAM]);
    }
    // Earlier versions were asked for, so the count filters none out.
    expect(calls[0].sql).not.toMatch(/vault\.documents succ/);
  });
});

describe('any-term matching (AnA asks in sentences)', () => {
  it('turns a question into an OR of its words, without operators from punctuation', async () => {
    const { anyTermsQuery } = await import('../vault-search');
    expect(anyTermsQuery('Which report shows 24-month stability for "batch 12"?')).toBe(
      'which or report or shows or 24 or month or stability or for or batch or 12',
    );
    expect(anyTermsQuery('  -- ??  ')).toBe('');
  });

  it("'any' sends the OR query; the default keeps the search box's every-term meaning", async () => {
    const { db, calls } = capture();
    await searchVaultDocuments(db, { organizationId: ORG, programId: null, q: 'stability batch', limit: 5, offset: 0, includeSuperseded: false, match: 'any' });
    expect(calls[0].params[1]).toBe('stability or batch');
    const plain = capture();
    await searchVaultDocuments(plain.db, { organizationId: ORG, programId: null, q: 'stability batch', limit: 5, offset: 0, includeSuperseded: false });
    expect(plain.calls[0].params[1]).toBe('stability batch');
  });
});
