/**
 * Q-Sub service tests — focus on the tenant-access invariant.
 *
 * Heavy drizzle-chain mocking is fragile, so these tests target what matters
 * most for BETA: that any program/commitment lookup returning [] (i.e. wrong
 * org) results in a TenantAccessError at every write entry-point.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});


// vi.hoisted so dbMock is initialized before the vi.mock factory runs.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  } as { select: any; insert: any; update: any },
}));

vi.mock('../../../db', () => ({
  db: dbMock,
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }),
  getDb: () => dbMock,
}));

vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

import {
  createQSubmission,
  setCommitmentRolledIn,
  TenantAccessError,
} from '../q-sub.service';

const ORG_A = 1;
const PROGRAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMMITMENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function chainResolving(rows: unknown[]) {
  // Build a fluent .from().innerJoin().where().limit() chain that resolves to rows.
  const terminal = {
    limit: () => Promise.resolve(rows),
    then: (resolve: (r: unknown[]) => void) => resolve(rows),
  };
  const where = { where: () => terminal };
  const innerJoin: any = {
    innerJoin: () => innerJoin,
    where: () => terminal,
  };
  const from = { from: () => innerJoin };
  return { ...from };
}

describe('createQSubmission tenant gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws TenantAccessError when program lookup returns empty', async () => {
    dbMock.select = vi.fn().mockReturnValue(chainResolving([])); // no program for org

    await expect(
      createQSubmission(ORG_A, {
        programId: PROGRAM,
        qSubType: 'presub',
        title: 'test',
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  test('does not call insert when tenant gate fails', async () => {
    dbMock.select = vi.fn().mockReturnValue(chainResolving([]));
    dbMock.insert = vi.fn();

    await expect(
      createQSubmission(ORG_A, {
        programId: PROGRAM,
        qSubType: 'presub',
        title: 'test',
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe('setCommitmentRolledIn tenant gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('throws TenantAccessError when commitment is not in org', async () => {
    dbMock.select = vi.fn().mockReturnValue(chainResolving([]));

    await expect(
      setCommitmentRolledIn(ORG_A, {
        commitmentId: COMMITMENT,
        rolledIn: true,
        rolledInBy: 'u-1',
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  test('does not call update when tenant gate fails', async () => {
    dbMock.select = vi.fn().mockReturnValue(chainResolving([]));
    dbMock.update = vi.fn();

    await expect(
      setCommitmentRolledIn(ORG_A, {
        commitmentId: COMMITMENT,
        rolledIn: true,
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

describe('TenantAccessError shape', () => {
  test('has the expected name', () => {
    const err = new TenantAccessError('nope');
    expect(err.name).toBe('TenantAccessError');
    expect(err.message).toBe('nope');
    expect(err).toBeInstanceOf(Error);
  });
});
