/**
 * Document retention job (server/jobs/retentionCron.ts) — behavioral tests.
 *
 * Replaces the orphaned tests/unit/retention.test.js (chai/sinon, no runner,
 * mocked a long-removed Supabase client). These tests exercise the real
 * Drizzle-based implementation by mocking '../server/db' (the same pattern as
 * the other job/route tests in this directory) and asserting:
 *
 *  - expired documents are processed per-policy (archive vs soft- vs hard-delete)
 *  - unknown/absent policy falls back to archive + soft-delete (never hard)
 *  - a per-document failure increments summary.errors and the sweep CONTINUES
 *  - an enumeration-level failure makes runRetentionSweep throw; runRetentionJob
 *    catches it, audits 'retention_sweep_failure', returns false, skips notify
 *  - notifyAdmins is silently skipped when SMTP/recipients are unconfigured
 *  - a notify (sendMail) failure triggers reportSecurityAlert and never throws
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mutable state shared with the hoisted vi.mock factories ───────────

const h = vi.hoisted(() => ({
  /** Rows returned for db.select().from(vaultDocuments)... */
  expiredDocs: [] as Record<string, unknown>[],
  /** Rows returned for db.select().from(vaultRetentionPolicies)... */
  policies: [] as Record<string, unknown>[],
  /** When set, every select enumeration rejects with this error. */
  enumerationError: null as Error | null,
  /** Captured db.insert(vaultDocumentArchives).values(...) payloads. */
  archiveInserts: [] as Record<string, unknown>[],
  /** originalDocumentIds whose archive insert should fail. */
  archiveFailFor: new Set<string>(),
  /** Captured db.update(...).set(...) patches (soft-deletes). */
  softDeletePatches: [] as Record<string, unknown>[],
  /** Number of db.delete(...) executions (hard-deletes). */
  hardDeleteCount: 0,
  /** nodemailer transport.sendMail mock. */
  sendMail: vi.fn(),
  logAction: vi.fn(),
  logSystemEvent: vi.fn(),
  reportSecurityAlert: vi.fn(),
}));

// ── Mocks (hoisted above the import of the module under test) ─────────────────

vi.mock('../server/db', async () => {
  const schema = await import('../shared/schema/vault');
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (h.enumerationError) throw h.enumerationError;
          if (table === schema.vaultDocuments) return h.expiredDocs;
          if (table === schema.vaultRetentionPolicies) return h.policies;
          return [];
        },
      }),
    }),
    insert: () => ({
      values: async (vals: Record<string, unknown>) => {
        if (h.archiveFailFor.has(String(vals.originalDocumentId))) {
          throw new Error(`archive insert failed for ${vals.originalDocumentId}`);
        }
        h.archiveInserts.push(vals);
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          h.softDeletePatches.push(patch);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        h.hardDeleteCount += 1;
      },
    }),
  };
  return { db };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: h.sendMail })),
  },
}));

vi.mock('../server/utils/audit-logger.js', () => ({
  logAction: h.logAction,
  logSystemEvent: h.logSystemEvent,
}));

vi.mock('../server/services/security-alerts', () => ({
  reportSecurityAlert: h.reportSecurityAlert,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';
import { runRetentionJob, runRetentionSweep } from '../server/jobs/retentionCron';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1111',
    programId: 'prog-1',
    documentCode: 'PRT-001',
    documentTitle: 'Protocol v1.0',
    documentType: 'protocol',
    retentionPolicy: null as string | null,
    retentionUntil: '2020-01-01',
    deletedAt: null,
    ...overrides,
  };
}

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol-1',
    policyName: 'default-archive',
    retentionDays: 365,
    archiveBeforeDelete: true,
    hardDelete: false,
    active: true,
    ...overrides,
  };
}

const SMTP_ENV = ['RETENTION_ADMIN_EMAILS', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  h.expiredDocs = [];
  h.policies = [];
  h.enumerationError = null;
  h.archiveInserts = [];
  h.archiveFailFor = new Set();
  h.softDeletePatches = [];
  h.hardDeleteCount = 0;
  h.sendMail.mockReset().mockResolvedValue(undefined);
  h.logAction.mockReset();
  h.logSystemEvent.mockReset();
  h.reportSecurityAlert.mockReset();
  vi.mocked(nodemailer.createTransport).mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
  vi.restoreAllMocks();
});

function configureSmtp() {
  process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com, qa@example.com';
  process.env.SMTP_USER = 'mailer';
  process.env.SMTP_PASSWORD = 'secret';
}

// ── Sweep: per-policy branches ────────────────────────────────────────────────

describe('runRetentionSweep — per-policy processing', () => {
  it('falls back to archive + soft-delete for a document with no policy (never hard-deletes)', async () => {
    h.expiredDocs = [makeDoc({ id: 'doc-nopolicy', retentionPolicy: null })];

    const summary = await runRetentionSweep();

    expect(summary).toEqual({ scanned: 1, archived: 1, softDeleted: 1, hardDeleted: 0, errors: 0 });
    expect(h.hardDeleteCount).toBe(0);
    expect(h.archiveInserts).toHaveLength(1);
    expect(h.archiveInserts[0]).toMatchObject({
      originalDocumentId: 'doc-nopolicy',
      archiveReason: 'retention_policy',
      archivedBy: 'system:retention-job',
    });
    // The archive snapshot is the full document row.
    expect(h.archiveInserts[0].snapshot).toMatchObject({ id: 'doc-nopolicy' });
    // Soft-delete stamps deletedAt.
    expect(h.softDeletePatches).toHaveLength(1);
    expect(h.softDeletePatches[0].deletedAt).toBeInstanceOf(Date);
    // Audit record marks the soft-delete and the unmatched policy.
    expect(h.logAction).toHaveBeenCalledTimes(1);
    expect(h.logAction.mock.calls[0][0]).toMatchObject({
      action: 'document.retention_soft_delete',
      entityType: 'vault_document',
      entityId: 'doc-nopolicy',
      details: expect.objectContaining({ policyMatched: false, archived: true }),
    });
  });

  it('uses the default (archive + soft-delete) when the named policy is unknown/inactive', async () => {
    h.expiredDocs = [makeDoc({ id: 'doc-ghost', retentionPolicy: 'no-such-policy' })];
    h.policies = [makePolicy({ policyName: 'something-else', hardDelete: true })];

    const summary = await runRetentionSweep();

    expect(summary).toEqual({ scanned: 1, archived: 1, softDeleted: 1, hardDeleted: 0, errors: 0 });
    expect(h.hardDeleteCount).toBe(0);
    expect(h.logAction.mock.calls[0][0].details).toMatchObject({
      retentionPolicy: 'no-such-policy',
      policyMatched: false,
    });
  });

  it('applies each matched policy branch: hard-delete, soft-delete, and skip-archive', async () => {
    h.policies = [
      makePolicy({ policyName: 'purge', archiveBeforeDelete: true, hardDelete: true }),
      makePolicy({ policyName: 'keep-row', archiveBeforeDelete: true, hardDelete: false }),
      makePolicy({ policyName: 'no-archive', archiveBeforeDelete: false, hardDelete: false }),
    ];
    h.expiredDocs = [
      makeDoc({ id: 'doc-purge', retentionPolicy: 'purge' }),
      makeDoc({ id: 'doc-keep', retentionPolicy: 'keep-row' }),
      makeDoc({ id: 'doc-noarch', retentionPolicy: 'no-archive' }),
    ];

    const summary = await runRetentionSweep();

    expect(summary).toEqual({ scanned: 3, archived: 2, softDeleted: 2, hardDeleted: 1, errors: 0 });
    // Only the archiveBeforeDelete policies snapshot the document.
    expect(h.archiveInserts.map(v => v.originalDocumentId)).toEqual(['doc-purge', 'doc-keep']);
    expect(h.hardDeleteCount).toBe(1);
    expect(h.softDeletePatches).toHaveLength(2);
    // Audit actions reflect the delete mode per document.
    const actions = h.logAction.mock.calls.map(c => [c[0].entityId, c[0].action]);
    expect(actions).toEqual([
      ['doc-purge', 'document.retention_hard_delete'],
      ['doc-keep', 'document.retention_soft_delete'],
      ['doc-noarch', 'document.retention_soft_delete'],
    ]);
    expect(h.logAction.mock.calls[2][0].details).toMatchObject({ archived: false, policyMatched: true });
  });
});

// ── Sweep: failure semantics ──────────────────────────────────────────────────

describe('runRetentionSweep — failure semantics', () => {
  it('a per-document failure increments errors and the sweep continues to the next document', async () => {
    h.expiredDocs = [
      makeDoc({ id: 'doc-bad' }),
      makeDoc({ id: 'doc-good' }),
    ];
    h.archiveFailFor = new Set(['doc-bad']);

    const summary = await runRetentionSweep();

    // doc-bad failed at the archive step (so it was neither archived nor
    // deleted, and no audit action was written for it); doc-good completed.
    expect(summary).toEqual({ scanned: 2, archived: 1, softDeleted: 1, hardDeleted: 0, errors: 1 });
    expect(h.archiveInserts.map(v => v.originalDocumentId)).toEqual(['doc-good']);
    expect(h.softDeletePatches).toHaveLength(1);
    expect(h.logAction).toHaveBeenCalledTimes(1);
    expect(h.logAction.mock.calls[0][0].entityId).toBe('doc-good');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process document doc-bad'),
      expect.any(String)
    );
  });

  it('an enumeration-level failure makes the sweep itself throw', async () => {
    h.enumerationError = new Error('relation vault.documents does not exist');
    await expect(runRetentionSweep()).rejects.toThrow('relation vault.documents does not exist');
  });
});

// ── runRetentionJob: orchestration, audit, exit semantics ─────────────────────

describe('runRetentionJob — orchestration', () => {
  it('returns true and audits retention_sweep_complete (info) on a clean sweep', async () => {
    h.expiredDocs = [makeDoc({ id: 'doc-1' })];

    await expect(runRetentionJob()).resolves.toBe(true);

    expect(h.logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention_sweep_complete',
        component: 'retention_job',
        severity: 'info',
        details: { scanned: 1, archived: 1, softDeleted: 1, hardDeleted: 0, errors: 0 },
      })
    );
  });

  it('returns false (with severity warning) when per-document errors occurred, without throwing', async () => {
    h.expiredDocs = [makeDoc({ id: 'doc-bad' }), makeDoc({ id: 'doc-good' })];
    h.archiveFailFor = new Set(['doc-bad']);

    await expect(runRetentionJob()).resolves.toBe(false);

    expect(h.logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention_sweep_complete',
        severity: 'warning',
        details: expect.objectContaining({ errors: 1 }),
      })
    );
  });

  it('an enumeration-level failure aborts: returns false, audits retention_sweep_failure, and skips notification', async () => {
    configureSmtp(); // notification WOULD be sent if the job reached it
    h.enumerationError = new Error('db down');

    await expect(runRetentionJob()).resolves.toBe(false);

    expect(h.logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention_sweep_failure',
        component: 'retention_job',
        severity: 'error',
        details: { error: 'db down' },
      })
    );
    expect(h.logSystemEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'retention_sweep_complete' })
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });
});

// ── notifyAdmins (via runRetentionJob) ────────────────────────────────────────

describe('admin notification', () => {
  it('is skipped when recipients are unconfigured', async () => {
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    // RETENTION_ADMIN_EMAILS deliberately unset.

    await expect(runRetentionJob()).resolves.toBe(true);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('is skipped when SMTP credentials are unconfigured', async () => {
    process.env.RETENTION_ADMIN_EMAILS = 'admin@example.com';
    // SMTP_USER / SMTP_PASSWORD deliberately unset.

    await expect(runRetentionJob()).resolves.toBe(true);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('emails all configured recipients with the sweep summary when configured', async () => {
    configureSmtp();
    h.expiredDocs = [makeDoc({ id: 'doc-1' })];

    await expect(runRetentionJob()).resolves.toBe(true);

    expect(h.sendMail).toHaveBeenCalledTimes(1);
    const mail = h.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('admin@example.com, qa@example.com');
    expect(mail.subject).toContain('1 document(s) processed');
    expect(mail.html).toContain('Soft-deleted: 1');
  });

  it('a notify failure triggers reportSecurityAlert and never makes the job throw', async () => {
    configureSmtp();
    h.expiredDocs = [makeDoc({ id: 'doc-1' })];
    h.sendMail.mockRejectedValue(new Error('SMTP connection refused'));

    // Sweep itself was clean, so the job still reports success.
    await expect(runRetentionJob()).resolves.toBe(true);

    expect(h.reportSecurityAlert).toHaveBeenCalledTimes(1);
    expect(h.reportSecurityAlert).toHaveBeenCalledWith({
      kind: 'retention_notify_failed',
      message: 'Retention sweep admin notification failed',
      detail: {
        error: 'SMTP connection refused',
        scanned: 1,
        softDeleted: 1,
        hardDeleted: 0,
        errors: 0,
      },
    });
  });

  it('a notify failure on a sweep WITH per-document errors still reports the alert and returns false', async () => {
    configureSmtp();
    h.expiredDocs = [makeDoc({ id: 'doc-bad' })];
    h.archiveFailFor = new Set(['doc-bad']);
    h.sendMail.mockRejectedValue(new Error('boom'));

    await expect(runRetentionJob()).resolves.toBe(false);
    expect(h.reportSecurityAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'retention_notify_failed',
        detail: expect.objectContaining({ error: 'boom', errors: 1 }),
      })
    );
  });
});
