/**
 * integerProjectForRef through the real anchor reader (ana-14, 2026-10-08).
 *
 * project-ref.test.ts pins the dispatch with the anchor mocked. AnA's context
 * readers (the stream route, context enrichment) now depend on the whole
 * chain, so it is pinned here end to end: integerProjectForRef →
 * resolveProgramProjectAnchor → readProgramAnchorRow, over a raw `{ query }`
 * connection that answers like Postgres.
 *
 * strictProjectRowForRef is the strict form AnA's turn uses: the same answer
 * wherever the lookup completes (pinned below, ref by ref, against
 * integerProjectForRef), and a throw, never null, where it could not tell.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integerProjectForRef } from '../project-ref';
import { resolveProgramProjectAnchor, strictProjectRowForRef } from '../program-project-anchor';
import type { RequestDb } from '../../../db/requestDb';

const query = vi.fn();
const DB = { query } as unknown as RequestDb;
const PROGRAM = 'D6160C9F-33D2-4be9-b779-eb27375f6e49';
const ask = (ref: unknown) => integerProjectForRef(DB, { ref, orgId: 7, context: 'test' });
const fault = (code: string, message: string) => Object.assign(new Error(message), { code });

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [{ id: 42, clientWorkspaceId: null }] });
});

describe('integerProjectForRef with the real anchor reader', () => {
  it('an integer, or proj_ and an integer, is itself, with no read', async () => {
    for (const ref of [42, '42', 'proj_42']) expect(await ask(ref), String(ref)).toBe(42);
    expect(query).not.toHaveBeenCalled();
  });

  it('a linked program UUID is its lowest-id projects row, read lower-cased and org-scoped', async () => {
    expect(await ask(PROGRAM)).toBe(42);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/regulatory_program_id = \$1 AND organization_id = \$2 ORDER BY id/);
    expect(params).toEqual([PROGRAM.toLowerCase(), 7]);
  });

  it('an unlinked program UUID is no project', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await ask(PROGRAM)).toBeNull();
  });

  it('a database without the anchor column is no project', async () => {
    query.mockRejectedValue(fault('42703', 'column "regulatory_program_id" does not exist'));
    expect(await ask(PROGRAM)).toBeNull();
  });

  it('any other failed lookup is no project here (not strict), and is rethrown where strict is asked for', async () => {
    query.mockRejectedValue(fault('57P01', 'terminating connection'));
    expect(await ask(PROGRAM)).toBeNull();
    await expect(
      resolveProgramProjectAnchor(DB, { programId: PROGRAM.toLowerCase(), orgId: 7, context: 'test', strict: true }),
    ).rejects.toThrow('terminating connection');
  });

  it('never the integer a UUID starts with, and nothing else is read', async () => {
    for (const ref of ['7abb1c22', '12.5', '-3', '0', '', null, undefined]) expect(await ask(ref), String(ref)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('strictProjectRowForRef: the same answer, except that could-not-tell throws', () => {
  const strict = (ref: unknown, orgId = 7) => strictProjectRowForRef(DB, { ref, orgId, context: 'test' });
  const REFS: unknown[] = [42, '42', 'proj_42', PROGRAM, '7abb1c22', '12.5', '-3', '0', '', null, undefined];

  it('answers as integerProjectForRef does for every ref, linked and unlinked', async () => {
    for (const rows of [[{ id: 42, clientWorkspaceId: null }], []]) {
      query.mockResolvedValue({ rows });
      for (const ref of REFS) expect(await strict(ref), `${String(ref)} with ${rows.length} row(s)`).toBe(await ask(ref));
    }
  });

  it('a database without the anchor column is still no project: no anchor can exist', async () => {
    query.mockRejectedValue(fault('42703', 'column "regulatory_program_id" does not exist'));
    expect(await strict(PROGRAM)).toBeNull();
  });

  it('a lookup that could not complete throws, where integerProjectForRef answers no project', async () => {
    query.mockRejectedValue(fault('57P01', 'terminating connection'));
    await expect(strict(PROGRAM)).rejects.toThrow('terminating connection');
    expect(await ask(PROGRAM)).toBeNull();
  });

  it('a program with no organization to scope it throws and reads nothing; an integer needs no organization', async () => {
    await expect(strict(PROGRAM, 0)).rejects.toThrow('no organization');
    expect(query).not.toHaveBeenCalled();
    expect(await strict(42, 0)).toBe(42);
  });

  it('takes a loader, and loads only for a program UUID', async () => {
    const load = vi.fn(async () => DB);
    expect(await strictProjectRowForRef(load, { ref: 42, orgId: 7, context: 'test' })).toBe(42);
    expect(load).not.toHaveBeenCalled();
    expect(await strictProjectRowForRef(load, { ref: PROGRAM, orgId: 7, context: 'test' })).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
