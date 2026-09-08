/**
 * The retention sweep will not destroy a record under legal hold.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `runRetentionSweep` resolved each expired document's policy and, when that
 * policy set `hardDelete`, issued `db.delete(vaultDocuments)` — unconditional
 * and unrecoverable. Nothing anywhere consulted a hold: a grep for legal_hold /
 * legalHold / litigation across server/, shared/ and client/ returned only
 * unapplied legacy DDL that no runner applies.
 *
 * Destroying a record under hold is spoliation, and it is the one operation in
 * this job that cannot be undone.
 *
 * ── Why the guard could land safely ──────────────────────────────────────────
 * The sweep has never actually fired. `findExpiredDocuments` matches on
 * `retention_until IS NOT NULL` and nothing in the tree writes that column —
 * retentionCron.ts holds the only reference and it is a read. So this lands
 * BEFORE the clock starts rather than after the first record is gone.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * Both hold scopes stop disposition; a lifted hold does not; and — the branch
 * that matters most — a sweep that CANNOT READ the holds aborts having deleted
 * nothing, rather than proceeding as though none existed. That last one is the
 * difference between a guard and a decoration: an unreadable hold table and an
 * empty one are indistinguishable unless the code refuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { select, deleteFn, update, insert } = vi.hoisted(() => ({
  select: vi.fn(),
  deleteFn: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

/** Rows each successive `db.select()` chain resolves to. */
let selectResults: unknown[][] = [];
/** Set to throw on the Nth select (0-based) — used for the holds read. */
let selectThrowsAt: number | null = null;
let selectCall = 0;

/** Documents hard-deleted, by id. */
const deleted: unknown[] = [];
/** Documents soft-deleted (an update carrying deletedAt). */
const softDeleted: unknown[] = [];

vi.mock('../../db', () => {
  const selectChain: any = {
    from: () => selectChain,
    where: () => selectChain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const i = selectCall++;
      if (selectThrowsAt === i) return Promise.reject(new Error('holds table unavailable')).catch(reject);
      return Promise.resolve(selectResults[i] ?? []).then(resolve);
    },
  };
  const deleteChain: any = {
    where: (w: unknown) => {
      deleted.push(w);
      deleteFn(w);
      return Promise.resolve();
    },
  };
  const updateChain: any = {
    set: (v: Record<string, unknown>) => ({
      where: (w: unknown) => {
        if ('deletedAt' in v) softDeleted.push(w);
        update(v);
        return Promise.resolve();
      },
    }),
  };
  return {
    db: {
      select: (...a: unknown[]) => (select(...a), selectChain),
      delete: (...a: unknown[]) => (deleteFn(...a), deleteChain),
      update: (...a: unknown[]) => (update(...a), updateChain),
      insert: (...a: unknown[]) => (insert(...a), { values: () => Promise.resolve() }),
    },
  };
});

vi.mock('../../db/tenantStore', () => ({
  runWithSystemTenantScope: (_label: string, fn: () => unknown) => fn(),
}));
vi.mock('../../utils/audit-logger.js', () => ({ logAction: vi.fn(), logSystemEvent: vi.fn() }));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));

import { runRetentionSweep } from '../retentionCron';

const PROGRAM = '11111111-1111-1111-1111-111111111111';
const DOC = '22222222-2222-2222-2222-222222222222';

/** An expired document whose policy hard-deletes — the destructive path. */
const expiredDoc = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  programId: PROGRAM,
  documentCode: 'CSR-201',
  documentTitle: 'CSR',
  documentType: 'CSR',
  retentionPolicy: 'purge',
  retentionUntil: '2020-01-01',
  ...over,
});

const HARD_DELETE_POLICY = [
  { policyName: 'purge', archiveBeforeDelete: false, hardDelete: true },
];

/**
 * The sweep reads, in order: expired documents, policies, holds.
 * (`Promise.all`, so the order is the array order.)
 */
function arrange(opts: { docs?: unknown[]; policies?: unknown[]; holds?: unknown[] }) {
  selectResults = [opts.docs ?? [], opts.policies ?? [], opts.holds ?? []];
  selectCall = 0;
  selectThrowsAt = null;
}

beforeEach(() => {
  deleted.length = 0;
  softDeleted.length = 0;
  selectResults = [];
  selectCall = 0;
  selectThrowsAt = null;
  vi.clearAllMocks();
});

describe('a hold stops disposition', () => {
  it('a DOCUMENT-scoped hold prevents the hard delete', async () => {
    arrange({
      docs: [expiredDoc()],
      policies: HARD_DELETE_POLICY,
      holds: [{ programId: null, documentId: DOC }],
    });

    const summary = await runRetentionSweep();

    expect(deleted).toHaveLength(0);
    expect(softDeleted).toHaveLength(0);
    expect(summary.heldByLegalHold).toBe(1);
    expect(summary.hardDeleted).toBe(0);
  });

  it('a PROGRAM-scoped hold covers every document of that program', async () => {
    arrange({
      docs: [expiredDoc(), expiredDoc({ id: 'other-doc' })],
      policies: HARD_DELETE_POLICY,
      holds: [{ programId: PROGRAM, documentId: null }],
    });

    const summary = await runRetentionSweep();

    expect(deleted).toHaveLength(0);
    expect(summary.heldByLegalHold).toBe(2);
  });

  it('is checked before the policy resolves, so no archive is written either', async () => {
    arrange({
      docs: [expiredDoc()],
      // archiveBeforeDelete would otherwise write a snapshot row.
      policies: [{ policyName: 'purge', archiveBeforeDelete: true, hardDelete: true }],
      holds: [{ programId: PROGRAM, documentId: null }],
    });

    const summary = await runRetentionSweep();

    expect(insert).not.toHaveBeenCalled();
    expect(summary.archived).toBe(0);
  });
});

describe('a hold that does not apply does not block', () => {
  it('deletes when no hold exists — the guard is not a blanket stop', async () => {
    // Guards against "fixing" the defect by never deleting anything.
    arrange({ docs: [expiredDoc()], policies: HARD_DELETE_POLICY, holds: [] });

    const summary = await runRetentionSweep();

    expect(summary.hardDeleted).toBe(1);
    expect(summary.heldByLegalHold).toBe(0);
  });

  it('deletes when the only hold covers a DIFFERENT program', async () => {
    arrange({
      docs: [expiredDoc()],
      policies: HARD_DELETE_POLICY,
      holds: [{ programId: '99999999-9999-9999-9999-999999999999', documentId: null }],
    });

    expect((await runRetentionSweep()).hardDeleted).toBe(1);
  });

  it('a LIFTED hold does not block — the query already excludes it', async () => {
    // loadActiveHolds filters `lifted_at IS NULL`, so a lifted hold never
    // reaches the sweep. Modelled as the empty result that filter produces.
    arrange({ docs: [expiredDoc()], policies: HARD_DELETE_POLICY, holds: [] });
    expect((await runRetentionSweep()).hardDeleted).toBe(1);
  });
});

describe('the sweep fails closed when holds cannot be read', () => {
  it('aborts having deleted nothing, rather than proceeding as if none existed', async () => {
    selectResults = [[expiredDoc()], HARD_DELETE_POLICY, []];
    selectCall = 0;
    selectThrowsAt = 2; // the holds read

    await expect(runRetentionSweep()).rejects.toThrow(/holds table unavailable/);

    // The distinction that makes this a guard: an unreadable hold table and an
    // empty one are the same input unless the code refuses.
    expect(deleted).toHaveLength(0);
    expect(softDeleted).toHaveLength(0);
  });
});
