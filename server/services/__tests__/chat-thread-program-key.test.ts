/**
 * A conversation started with a project open must be minted CARRYING that
 * project, or the project's own list can never find it again.
 *
 * `chat_threads.project_id` is an INTEGER and the shell's project key is a
 * regulatory_programs UUID, so the program key rides in `metadata.programId` —
 * written here, at mint time, and read back by
 * GET /api/chat/threads?program_id=. This is the write half of that pair; it
 * had no test, and the browser can only prove the client sends the id (the
 * stream route mints well after the AI-provider check, which fails closed in
 * an environment with no provider).
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

beforeEach(() => {
  query.mockReset();
  // CREATE TABLE IF NOT EXISTS … and any lookup: no rows unless a test says so.
  query.mockImplementation(async () => ({ rows: [] }));
});

describe('getOrCreateThread — the program key', () => {
  it('writes the program into metadata, lower-cased, when one is open', async () => {
    const id = await getOrCreateThread(null, 1, 'ana-ri', 7, PROGRAM);
    expect(id.startsWith('ana-ri_')).toBe(true);
    const [, params] = insert()!;
    expect(params[2]).toBe(7); // organization
    expect(JSON.parse(String(params[3]))).toEqual({ programId: PROGRAM.toLowerCase() });
  });

  it('writes no metadata when no project is open, or when the id is not a program key', async () => {
    for (const value of [undefined, null, '', '42', 42]) {
      query.mockClear();
      await getOrCreateThread(null, 1, 'ana-ri', 7, value as never);
      const [, params] = insert()!;
      expect(params[3], String(value)).toBeNull();
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
