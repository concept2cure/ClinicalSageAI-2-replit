/**
 * `writeThroughToCanonicalSource` reports what happened.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * The core write-through caught every error, wrote it to the console and
 * returned `null` — the same null a caller saw for "no project was given". A
 * Module 3 propagation failure was therefore indistinguishable from a refusal,
 * and the twenty-two fire-and-forget register sites that did
 * `writeThroughX(...).catch(observe)` never observed anything, because a
 * function that swallows its own errors never rejects. The register row was
 * saved, the API answered `{ success: true }`, and the dossier silently never
 * received the record.
 *
 * The contract now: a discriminated outcome. `{ ok: true, ... }` carries the
 * source object; `{ ok: false, code, reason }` says WHY not, with the
 * no-project refusal distinct from a failed write. Nothing is thrown — the
 * register row is real recorded data whether or not the dossier layer accepted
 * it this second — and nothing is returned that a caller could mistake for
 * silence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connect, client, createUnifiedTask } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, connect: vi.fn(async () => client), createUnifiedTask: vi.fn() };
});

vi.mock('../../db', () => ({
  getPool: () => ({ connect, query: vi.fn() }),
  db: {},
}));
vi.mock('../unifiedTaskService', () => ({ default: { createUnifiedTask } }));

import { writeThroughToCanonicalSource, writeThroughAnalyticalMethod } from '../cmc-write-through';
import { impactedSectionsForSourceType } from '../module3Composer';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

const input = (over: Partial<Parameters<typeof writeThroughToCanonicalSource>[0]> = {}) => ({
  orgId: 42,
  projectId: PROJECT,
  sourceType: 'method' as const,
  sourceKey: 'method:7',
  sourcePayload: { methodName: 'Assay by HPLC' },
  createdBy: 'u-1',
  ...over,
});

/** A client that answers the transaction bookkeeping and fails the upsert. */
function failTheUpsert(message: string) {
  client.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql === 'COMMIT') return { rows: [] };
    throw new Error(message);
  });
}

/** A client that answers every statement, returning the upserted row. */
function acceptTheUpsert(id: string | number, isNew: boolean) {
  client.query.mockImplementation(async (sql: string) => {
    if (/INSERT INTO cmc_source_objects/.test(sql)) return { rows: [{ id, is_new: isNew }] };
    return { rows: [], rowCount: 0 };
  });
}

beforeEach(() => {
  client.query.mockReset();
  client.release.mockReset();
  connect.mockClear();
  createUnifiedTask.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('writeThroughToCanonicalSource — a failed canonical write is reported, not swallowed', () => {
  it('a rejected upsert query yields ok:false with the reason, after rolling back and releasing', async () => {
    failTheUpsert('connection terminated unexpectedly');

    const outcome = await writeThroughToCanonicalSource(input());

    expect(outcome).toEqual({
      ok: false,
      code: 'write_failed',
      reason: expect.stringContaining('connection terminated unexpectedly'),
    });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('a pool that cannot hand out a connection is reported the same way, not thrown', async () => {
    connect.mockRejectedValueOnce(new Error('too many clients already'));

    await expect(writeThroughToCanonicalSource(input())).resolves.toEqual({
      ok: false,
      code: 'write_failed',
      reason: expect.stringContaining('too many clients already'),
    });
  });

  it('an unrecognised failure value still carries a non-empty reason', async () => {
    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      throw { code: '42P01' };
    });

    const outcome = await writeThroughToCanonicalSource(input());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.code).toBe('write_failed');
    expect(outcome.reason.trim()).not.toBe('');
  });

  it('no projectId is a DISTINCT, reportable refusal — no connection is even taken', async () => {
    const outcome = await writeThroughToCanonicalSource(input({ projectId: '' }));

    expect(outcome).toEqual({
      ok: false,
      code: 'no_project',
      reason: expect.stringMatching(/project/i),
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('a successful upsert yields ok:true with the source object and the sections it made stale', async () => {
    acceptTheUpsert(910, true);

    const outcome = await writeThroughToCanonicalSource(input());

    expect(outcome).toEqual({
      ok: true,
      sourceObjectId: '910',
      sourceHash: expect.any(String),
      staleSections: impactedSectionsForSourceType('method'),
      isNew: true,
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('the convenience wrappers hand the outcome through unchanged', async () => {
    failTheUpsert('relation "cmc_source_objects" does not exist');

    const outcome = await writeThroughAnalyticalMethod(42, PROJECT, '7', {
      id: 7,
      methodCode: 'AM-001',
      title: 'Assay by HPLC',
      technique: 'HPLC',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    expect(outcome.code).toBe('write_failed');
    expect(outcome.reason).toContain('does not exist');
  });
});
