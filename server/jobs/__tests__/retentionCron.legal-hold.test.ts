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

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

/** Rows each successive `db.select()` chain resolves to. */
let selectResults: unknown[][] = [];
/** Set to throw on the Nth select (0-based) — used for the holds read. */
let selectThrowsAt: number | null = null;
let selectCall = 0;

/**
 * Since 2026-09-26 (P1-22) a disposition is one transaction on a pool client:
 * the archive snapshot, the delete and the chained audit row commit together.
 * The client records every statement, so the order can be asserted; the
 * chained writer is a recorder that can be told to fail.
 */
const tx = vi.hoisted(() => ({
  statements: [] as string[],
  params: [] as unknown[][],
  audit: vi.fn(async (_client: unknown, _entry: unknown, _tenant?: unknown, _resource?: unknown) => {
    tx.statements.push('AUDIT');
  }),
  auditThrows: false,
  programOrg: 7 as number | null,
}));

/** Documents hard-deleted, by id. */
const deleted: unknown[] = [];
/** Documents soft-deleted (an UPDATE stamping deleted_at). */
const softDeleted: unknown[] = [];
/** Archive snapshots written. */
const archived: unknown[] = [];

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
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const s = String(sql).trim();
      tx.statements.push(s.split(/\s+/).slice(0, 3).join(' '));
      tx.params.push(params);
      if (/DELETE FROM vault\.documents/i.test(s)) deleted.push(params[0]);
      if (/UPDATE vault\.documents SET deleted_at/i.test(s)) softDeleted.push(params[0]);
      if (/INSERT INTO vault\.document_archives/i.test(s)) archived.push(params[0]);
      if (/FROM regulatory_programs/i.test(s)) return { rows: tx.programOrg === null ? [] : [{ organization_id: tx.programOrg }], rowCount: tx.programOrg === null ? 0 : 1 };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return {
    db: { select: (...a: unknown[]) => (select(...a), selectChain) },
    pool: { connect: vi.fn(async () => client), query: vi.fn() },
  };
});
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: (client: unknown, entry: unknown, tenant?: unknown, resource?: unknown) => {
    if (tx.auditThrows) throw new Error('chain unavailable');
    return tx.audit(client, entry, tenant, resource);
  },
}));

vi.mock('../../db/tenantStore', () => ({
  runWithSystemTenantScope: (_label: string, fn: () => unknown) => fn(),
}));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

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
  archived.length = 0;
  tx.statements.length = 0;
  tx.params.length = 0;
  tx.auditThrows = false;
  tx.programOrg = 7;
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

    expect(archived).toHaveLength(0);
    expect(tx.statements).toEqual([]); // no transaction was even opened
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

describe('a disposition is one transaction with its chained audit row (P1-22)', () => {
  it('hard delete: BEGIN, the organisation, the delete, the chained audit row, COMMIT — and the row names the document', async () => {
    arrange({ docs: [expiredDoc()], policies: HARD_DELETE_POLICY, holds: [] });

    const summary = await runRetentionSweep();

    expect(summary.hardDeleted).toBe(1);
    expect(deleted).toEqual([DOC]);
    expect(tx.statements).toEqual(['BEGIN', 'SELECT organization_id FROM', 'DELETE FROM vault.documents', 'AUDIT', 'COMMIT']);
    const [, entry, tenant, resource] = tx.audit.mock.calls[0];
    expect(entry).toMatchObject({ action: 'vault.document.retention_hard_delete', resourceType: 'vault_document', resourceId: DOC });
    expect(tenant).toBe(7);
    expect(resource).toBe(DOC);
  });

  it('archive then soft delete, in the same transaction, under the document\'s own organisation', async () => {
    arrange({
      docs: [expiredDoc({ organizationId: 9 })],
      policies: [{ policyName: 'purge', archiveBeforeDelete: true, hardDelete: false }],
      holds: [],
    });

    const summary = await runRetentionSweep();

    expect(summary).toMatchObject({ archived: 1, softDeleted: 1, hardDeleted: 0, errors: 0 });
    expect(tx.statements).toEqual(['BEGIN', 'INSERT INTO vault.document_archives', 'UPDATE vault.documents SET', 'AUDIT', 'COMMIT']);
    expect(tx.audit.mock.calls[0][1]).toMatchObject({ action: 'vault.document.retention_soft_delete' });
    expect(tx.audit.mock.calls[0][2]).toBe(9);
  });

  it('a deletion whose audit row cannot be written is rolled back and counted as an error', async () => {
    tx.auditThrows = true;
    arrange({ docs: [expiredDoc()], policies: HARD_DELETE_POLICY, holds: [] });

    const summary = await runRetentionSweep();

    expect(summary.hardDeleted).toBe(0);
    expect(summary.errors).toBe(1);
    expect(tx.statements).toEqual(['BEGIN', 'SELECT organization_id FROM', 'DELETE FROM vault.documents', 'ROLLBACK']);
  });

  it('a document with no organisation to chain the row under is left in place (nothing is committed unaudited)', async () => {
    tx.programOrg = null;
    arrange({ docs: [expiredDoc()], policies: HARD_DELETE_POLICY, holds: [] });

    const summary = await runRetentionSweep();

    expect(summary.hardDeleted).toBe(0);
    expect(summary.errors).toBe(1);
    expect(tx.statements).toEqual(['BEGIN', 'SELECT organization_id FROM', 'ROLLBACK']);
    expect(tx.audit).not.toHaveBeenCalled();
  });
});
