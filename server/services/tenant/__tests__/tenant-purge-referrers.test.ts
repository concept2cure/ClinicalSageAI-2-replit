/**
 * The referrer block and the tables the purge does not erase (D6, 2026-10-29;
 * docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * purge-referrers.ts holds the 149 tables that name a project, a workspace, a
 * document or a program with no delete action, spread into PURGE_CHILD_TABLES
 * before `projects`, and PURGE_REFERRERS_NOT_ERASED, the signatures, audit
 * trails and ledgers whose retention the founder has not decided. No injected
 * list may erase one of those: the purge refuses it before any query.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { purgeTenant, PURGE_CHILD_TABLES, PURGE_REFERRERS_NOT_ERASED, PURGE_RETAINED_RECORDS } from '../tenant-offboarding';
import { PURGE_REFERRER_TABLES } from '../purge-referrers';

vi.mock('../../../middleware/orgMembership', () => ({ invalidateOrgMembershipCache: vi.fn() }));

describe('the referrer block', () => {
  it('is spread into the purge list in its own order, before projects', () => {
    const at = PURGE_CHILD_TABLES.indexOf(PURGE_REFERRER_TABLES[0]);
    expect(at).toBeGreaterThan(-1);
    expect(PURGE_CHILD_TABLES.slice(at, at + PURGE_REFERRER_TABLES.length)).toEqual([...PURGE_REFERRER_TABLES]);
    expect(at + PURGE_REFERRER_TABLES.length).toBeLessThanOrEqual(PURGE_CHILD_TABLES.indexOf('projects'));
    expect(new Set(PURGE_CHILD_TABLES).size).toBe(PURGE_CHILD_TABLES.length);
  });

  it('names documents before projects and client_workspaces, which each document names with no cascade', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    expect(at('documents')).toBeGreaterThan(-1);
    expect(at('documents')).toBeLessThan(at('projects'));
    expect(at('documents')).toBeLessThan(at('client_workspaces'));
  });
});

describe('a table the purge does not erase', () => {
  it('each has its reason, and none is on the list or retained twice', () => {
    for (const [table, reason] of Object.entries(PURGE_REFERRERS_NOT_ERASED)) {
      expect(reason.trim().length, table).toBeGreaterThan(40);
      expect(PURGE_CHILD_TABLES, table).not.toContain(table);
      expect(Object.keys(PURGE_RETAINED_RECORDS), table).not.toContain(table);
    }
    expect(Object.isFrozen(PURGE_REFERRERS_NOT_ERASED)).toBe(true);
  });

  it.each(Object.keys(PURGE_REFERRERS_NOT_ERASED))('%s on an injected list is refused before any query', async (table) => {
    const query = vi.fn();
    const pool = { query, connect: vi.fn() } as unknown as Pool;
    await expect(purgeTenant(pool, {
      organizationId: 11, purgedByUserId: 7, preconditions: { finalExportDigest: 'x' }, childTables: ['projects', table],
    })).rejects.toMatchObject({ code: 'PURGE_RETAINED_RECORD' });
    expect(query).not.toHaveBeenCalled();
  });
});
