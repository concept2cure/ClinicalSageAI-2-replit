/**
 * The retention sweep's policy branches, failure semantics, orchestration and
 * admin notification, against the transactional sweep (P1-22). These cases
 * came from tests/retention-cron.test.ts, which modelled the pre-P1-22 sweep
 * (drizzle inserts, a file audit logger) and could not drive the one that
 * ships; the harness here is the legal-hold test's: a pool client double that
 * records every statement of the disposition transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let selectResults: unknown[][] = [];
let selectThrowsAt: number | null = null;
let selectCall = 0;

const tx = vi.hoisted(() => ({
  statements: [] as string[],
  archiveFailFor: new Set<string>(),
  audit: vi.fn(async (_client: unknown, _entry: unknown, _tenant?: unknown, _resource?: unknown) => undefined),
}));
// Typed loosely on purpose: the call ARGUMENTS are what the cases read, and a
// precise no-parameter spy makes vitest infer `calls` as an empty tuple.
const mail = vi.hoisted(() => ({
  sendMail: vi.fn(async (..._args: any[]): Promise<void> => undefined),
  createTransport: vi.fn((..._args: any[]) => undefined),
  reportSecurityAlert: vi.fn((..._args: any[]) => undefined),
}));
const deleted: string[] = [];
const softDeleted: string[] = [];
const archived: string[] = [];

vi.mock('../../db', () => {
  const selectChain: any = {
    from: () => selectChain,
    where: () => selectChain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const i = selectCall++;
      if (selectThrowsAt === i) return Promise.reject(new Error('relation vault.documents does not exist')).catch(reject);
      return Promise.resolve(selectResults[i] ?? []).then(resolve);
    },
  };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const s = String(sql).trim();
      tx.statements.push(s.split(/\s+/).slice(0, 3).join(' '));
      if (/INSERT INTO vault\.document_archives/i.test(s)) {
        if (tx.archiveFailFor.has(String(params[0]))) throw new Error(`archive insert failed for ${params[0]}`);
        archived.push(String(params[0]));
      }
      if (/DELETE FROM vault\.documents/i.test(s)) deleted.push(String(params[0]));
      if (/UPDATE vault\.documents SET deleted_at/i.test(s)) softDeleted.push(String(params[0]));
      if (/FROM regulatory_programs/i.test(s)) return { rows: [{ organization_id: 7 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return { db: { select: () => selectChain }, pool: { connect: vi.fn(async () => client), query: vi.fn() } };
});
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: (client: unknown, entry: unknown, tenant?: unknown, resource?: unknown) => tx.audit(client, entry, tenant, resource),
}));
vi.mock('../../db/tenantStore', () => ({ runWithSystemTenantScope: (_label: string, fn: () => unknown) => fn() }));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: (...a: unknown[]) => mail.reportSecurityAlert(...a) }));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (...a: unknown[]) => {
      mail.createTransport(...a);
      return { sendMail: mail.sendMail };
    },
  },
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import { runRetentionJob, runRetentionSweep } from '../retentionCron';

const PROGRAM = '11111111-1111-1111-1111-111111111111';
const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  programId: PROGRAM,
  documentCode: 'PRT-001',
  documentTitle: 'Protocol v1.0',
  documentType: 'protocol',
  retentionPolicy: null as string | null,
  retentionUntil: '2020-01-01',
  deletedAt: null,
  ...over,
});
const policy = (policyName: string, archiveBeforeDelete: boolean, hardDelete: boolean) => ({ policyName, archiveBeforeDelete, hardDelete, active: true });
function arrange(opts: { docs?: unknown[]; policies?: unknown[]; holds?: unknown[]; enumerationFails?: boolean }) {
  selectResults = [opts.docs ?? [], opts.policies ?? [], opts.holds ?? []];
  selectCall = 0;
  selectThrowsAt = opts.enumerationFails ? 0 : null;
}
const auditEntries = () => tx.audit.mock.calls.map(c => c[1] as { action: string; resourceId: string; details: Record<string, unknown> });

const SMTP_ENV = ['RETENTION_ADMIN_EMAILS', 'SMTP_USER', 'SMTP_PASSWORD'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tx.statements = [];
  tx.archiveFailFor = new Set();
  tx.audit.mockClear();
  mail.sendMail.mockClear();
  mail.sendMail.mockResolvedValue(undefined);
  mail.createTransport.mockClear();
  mail.reportSecurityAlert.mockClear();
  deleted.length = 0;
  softDeleted.length = 0;
  archived.length = 0;
  for (const k of SMTP_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of SMTP_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('runRetentionSweep — per-policy processing', () => {
  it('falls back to archive + soft-delete for a document with no policy, and never hard-deletes it', async () => {
    arrange({ docs: [doc('doc-nopolicy')] });
    const summary = await runRetentionSweep();
    expect(summary).toEqual({ scanned: 1, archived: 1, softDeleted: 1, hardDeleted: 0, heldByLegalHold: 0, errors: 0 });
    expect(archived).toEqual(['doc-nopolicy']);
    expect(softDeleted).toEqual(['doc-nopolicy']);
    expect(deleted).toEqual([]);
    expect(auditEntries()).toHaveLength(1);
    expect(auditEntries()[0]).toMatchObject({ action: 'vault.document.retention_soft_delete', resourceId: 'doc-nopolicy', details: { archived: true, policyMatched: false } });
  });

  it('uses the default (archive + soft-delete) when the named policy is unknown or inactive', async () => {
    arrange({ docs: [doc('doc-ghost', { retentionPolicy: 'no-such-policy' })], policies: [policy('something-else', true, true)] });
    const summary = await runRetentionSweep();
    expect(summary).toEqual({ scanned: 1, archived: 1, softDeleted: 1, hardDeleted: 0, heldByLegalHold: 0, errors: 0 });
    expect(deleted).toEqual([]);
    expect(auditEntries()[0].details).toMatchObject({ policyMatched: false, retentionPolicy: 'no-such-policy' });
  });

  it('applies each matched policy branch: hard-delete, soft-delete, and skip-archive', async () => {
    arrange({
      docs: [doc('doc-purge', { retentionPolicy: 'purge' }), doc('doc-keep', { retentionPolicy: 'keep-row' }), doc('doc-noarch', { retentionPolicy: 'no-archive' })],
      policies: [policy('purge', true, true), policy('keep-row', true, false), policy('no-archive', false, false)],
    });
    const summary = await runRetentionSweep();
    expect(summary).toEqual({ scanned: 3, archived: 2, softDeleted: 2, hardDeleted: 1, heldByLegalHold: 0, errors: 0 });
    expect(archived).toEqual(['doc-purge', 'doc-keep']);
    expect(deleted).toEqual(['doc-purge']);
    expect(softDeleted).toEqual(['doc-keep', 'doc-noarch']);
    expect(auditEntries().map(e => e.action)).toEqual([
      'vault.document.retention_hard_delete',
      'vault.document.retention_soft_delete',
      'vault.document.retention_soft_delete',
    ]);
    expect(auditEntries()[2].details).toMatchObject({ archived: false, policyMatched: true });
  });
});

describe('runRetentionSweep — failure semantics', () => {
  it('a per-document failure rolls that document back, counts one error, and the sweep continues', async () => {
    arrange({ docs: [doc('doc-bad'), doc('doc-good')] });
    tx.archiveFailFor = new Set(['doc-bad']);
    const summary = await runRetentionSweep();
    expect(summary).toEqual({ scanned: 2, archived: 1, softDeleted: 1, hardDeleted: 0, heldByLegalHold: 0, errors: 1 });
    expect(archived).toEqual(['doc-good']);
    expect(softDeleted).toEqual(['doc-good']);
    expect(auditEntries().map(e => e.resourceId)).toEqual(['doc-good']);
    // The failed document's transaction was rolled back, the good one's committed.
    expect(tx.statements.filter(s => s === 'ROLLBACK')).toHaveLength(1);
    expect(tx.statements.filter(s => s === 'COMMIT')).toHaveLength(1);
  });

  it('an enumeration-level failure makes the sweep itself throw, having disposed of nothing', async () => {
    arrange({ enumerationFails: true });
    await expect(runRetentionSweep()).rejects.toThrow('relation vault.documents does not exist');
    expect(tx.statements).toEqual([]);
  });
});

describe('runRetentionJob — orchestration', () => {
  it('returns true on a clean sweep', async () => {
    arrange({ docs: [doc('doc-1')] });
    await expect(runRetentionJob()).resolves.toBe(true);
    expect(mail.reportSecurityAlert).not.toHaveBeenCalled();
  });

  it('returns false, without throwing, when per-document errors occurred', async () => {
    arrange({ docs: [doc('doc-bad'), doc('doc-good')] });
    tx.archiveFailFor = new Set(['doc-bad']);
    await expect(runRetentionJob()).resolves.toBe(false);
  });

  it('an enumeration-level failure aborts: returns false, raises the security alert, and skips notification', async () => {
    process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    arrange({ enumerationFails: true });
    await expect(runRetentionJob()).resolves.toBe(false);
    expect(mail.reportSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'retention_sweep_failed' }));
    expect(mail.createTransport).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe('admin notification', () => {
  it('is skipped when recipients or SMTP credentials are unconfigured', async () => {
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    arrange({ docs: [doc('doc-1')] });
    await expect(runRetentionJob()).resolves.toBe(true);
    expect(mail.createTransport).not.toHaveBeenCalled();
    delete process.env.SMTP_USER;
    process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com';
    arrange({ docs: [doc('doc-1')] });
    await expect(runRetentionJob()).resolves.toBe(true);
    expect(mail.createTransport).not.toHaveBeenCalled();
  });

  it('emails every configured recipient with the sweep summary', async () => {
    process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com, qa@example.com';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    arrange({ docs: [doc('doc-1')] });
    await expect(runRetentionJob()).resolves.toBe(true);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    const sent = mail.sendMail.mock.calls[0][0] as unknown as { to: string; subject: string; html: string };
    expect(sent.to).toBe('admin@example.com, qa@example.com');
    expect(sent.subject).toContain('1 document(s) processed');
    expect(sent.html).toContain('Soft-deleted: 1');
  });

  it('a notify failure raises the security alert and never makes the job fail', async () => {
    process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    mail.sendMail.mockRejectedValueOnce(new Error('smtp down'));
    arrange({ docs: [doc('doc-1')] });
    await expect(runRetentionJob()).resolves.toBe(true);
    expect(mail.reportSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'retention_notify_failed' }));
  });
});
