/**
 * AnA context enrichment — no organization, no memory.
 *
 * Four reads of `project_memory_entries` carried
 * `($2::int IS NULL OR organization_id = $2)` — a tenant guard the caller
 * could switch off, described in the code as preserving "prior behavior
 * exactly" for "legacy paths without org context". What it preserved was a
 * read across every tenant, and what these functions return goes into a
 * MODEL'S PROMPT: another sponsor's notes and decisions would have been
 * summarised back to the user as their own context.
 *
 * `enrichWithClientJourney` and `enrichWithAgentActivity` in the same file
 * already returned '' without an org. These now agree with them: contributing
 * nothing is a smaller loss than contributing someone else's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));

import { enrichContextForChat } from '../context-enrichment';

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('project-memory enrichment is tenant-scoped', () => {
  it('issues no project_memory_entries read at all without an organization', async () => {
    /* `/claims` dispatches enrichWithClaims, which reads
       project_memory_entries — a deterministic way in, rather than hoping a
       natural-language trigger fires. */
    await enrichContextForChat({ message: '/claims', projectId: 42, organizationId: undefined });

    const memoryReads = poolQuery.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((sql) => sql.includes('project_memory_entries'));

    expect(memoryReads).toHaveLength(0);
  });

  it('scopes every project-memory read to the caller organization', async () => {
    await enrichContextForChat({ message: '/claims', projectId: 42, organizationId: 7 });

    const memoryReads = poolQuery.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('project_memory_entries'),
    );

    expect(memoryReads.length).toBeGreaterThan(0);
    for (const call of memoryReads) {
      const sql = String(call[0]);
      expect(sql).toContain('organization_id = $2');
      // The escape that made the guard optional.
      expect(sql).not.toMatch(/IS NULL OR/);
      expect((call[1] as unknown[])[1]).toBe(7);
    }
  });
});
