/**
 * Q-Sub service tests — focus on the tenant-access invariant.
 *
 * Heavy drizzle-chain mocking is fragile, so these tests target what matters
 * most for BETA: that any program/commitment lookup returning [] (i.e. wrong
 * org) results in a TenantAccessError at every write entry-point.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

// Reset before each suite — we re-mock per scenario.
const dbMock: { select: any; insert: any; update: any } = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../../db', () => ({
  db: dbMock,
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
