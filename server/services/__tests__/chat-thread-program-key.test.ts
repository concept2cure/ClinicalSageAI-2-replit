/**
 * A conversation started with a project open is minted CARRYING that project,
 * and only a project of the caller's own organization (PF-10 S2).
 *
 * The shell's project key is a regulatory_programs UUID. It is written to
 * chat_threads.program_id (20261001c: a same-organization key, ON DELETE SET
 * NULL (program_id)) at mint time, after programInOrganization says the
 * program is the thread organization's, and read back by
 * GET /api/chat/threads?program_id=. Until S2 it rode in metadata.programId,
 * written with no organization check, so a thread could name another
 * organization's program and be listed under it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { getOrCreateThread, programIdForThread } from '../chat-thread-helpers';

const PROGRAM = '0F3C1A2B-1111-4222-8333-444455556666';

/** The INSERT the mint issues, if it issued one. */
const insert = () =>
  query.mock.calls.find(([sql]) => /INSERT INTO chat_threads/.test(String(sql)));
/** The INSERT's parameters by column name. */
const inserted = () => {
  const [sql, params] = insert()!;
  const cols = /INSERT INTO chat_threads\s*\(([^)]*)\)/.exec(String(sql))![1].split(',').map((c) => c.trim());
  return Object.fromEntries(cols.map((c, i) => [c, (params as unknown[])[i]]));
};
/** The organization check the mint asks before binding, if it asked. */
const programLookup = () =>
  query.mock.calls.find(([sql]) => /FROM regulatory_programs/.test(String(sql)));
/** regulatory_programs answers: the program is (or is not) this organization's. */
const programIs = (ours: boolean) =>
  query.mockImplementation(async (sql: string) =>
    /FROM regulatory_programs/.test(sql) ? { rows: ours ? [{ id: PROGRAM.toLowerCase() }] : [] } : { rows: [] });

beforeEach(() => {
  query.mockReset();
  // CREATE TABLE IF NOT EXISTS … and any lookup: no rows unless a test says so.
  query.mockImplementation(async () => ({ rows: [] }));
});

describe('getOrCreateThread — the program key', () => {
  it("binds the program, lower-cased, to program_id once it is the organization's", async () => {
    programIs(true);
    const id = await getOrCreateThread(null, 1, 'ana-ri', 7, PROGRAM);
    expect(id.startsWith('ana-ri_')).toBe(true);
    expect(programLookup()![1]).toEqual([PROGRAM.toLowerCase(), 7]);
    expect(inserted()).toMatchObject({ organization_id: 7, program_id: PROGRAM.toLowerCase() });
    // One store for a thread's program: the metadata copy is not written.
    expect(inserted().metadata ?? null).toBeNull();
  });

  it('a program of another organization, or a deleted one, is never bound: the thread is minted unbound', async () => {
    programIs(false);
    await getOrCreateThread(null, 1, 'ana-ri', 7, PROGRAM);
    expect(programLookup()).toBeDefined();
    expect(inserted()).toMatchObject({ organization_id: 7, program_id: null });
    expect(JSON.stringify(insert()![1])).not.toContain(PROGRAM.toLowerCase());
  });

  it('without an organization nothing is bound, and nothing is asked', async () => {
    await getOrCreateThread(null, 1, 'ana-ri', null, PROGRAM);
    expect(programLookup()).toBeUndefined();
    expect(inserted()).toMatchObject({ organization_id: null, program_id: null });
  });

  it('a check that could not complete mints nothing: it is not read as "not ours"', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/FROM regulatory_programs/.test(sql)) throw Object.assign(new Error('connection reset'), { code: '08006' });
      return { rows: [] };
    });
    await expect(getOrCreateThread(null, 1, 'ana-ri', 7, PROGRAM)).rejects.toThrow('connection reset');
    expect(insert()).toBeUndefined();
  });

  it('binds nothing, and asks nothing, when no project is open or the id is not a program key', async () => {
    for (const value of [undefined, null, '', '42', 42]) {
      query.mockClear();
      await getOrCreateThread(null, 1, 'ana-ri', 7, value as never);
      expect(programLookup(), String(value)).toBeUndefined();
      expect(inserted().program_id, String(value)).toBeNull();
    }
  });

  it('does not re-home an existing thread — continuing a conversation never rewrites its program', async () => {
    query.mockImplementation(async (sql: string) =>
      /SELECT id, user_id, organization_id FROM chat_threads/.test(sql)
        ? { rows: [{ id: 'ana-ri_existing', user_id: 1, organization_id: 7 }] }
        : { rows: [] });
    const id = await getOrCreateThread('ana-ri_existing', 1, 'ana-ri', 7, PROGRAM);
    expect(id).toBe('ana-ri_existing');
    expect(insert()).toBeUndefined();
  });

  it('programIdForThread accepts only a UUID', () => {
    expect(programIdForThread(PROGRAM)).toBe(PROGRAM.toLowerCase());
    expect(programIdForThread('42')).toBeNull();
    expect(programIdForThread(42)).toBeNull();
  });
});

describe('the stream route hands the mint its program key', () => {
  it('passes the request\'s project id through programIdForThread', () => {
    // Read as source: importing the stream route pulls the whole AnA stack in.
    const src = fs.readFileSync(
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../routes/ana-ri/stream.ts'),
      'utf8',
    );
    expect(src).toMatch(/programIdForThread\(\s*project_id \|\| resolveProjectIdFromBody\(req\.body\)\s*\)/);
  });
});
