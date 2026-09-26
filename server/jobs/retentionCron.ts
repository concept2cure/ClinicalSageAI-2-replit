/**
 * Document Retention Job
 *
 * Enforces document retention on the canonical vault model. A document expires
 * when its `retention_until` date has passed and it has not already been deleted.
 * For each expired document the job — best-effort, per document — optionally
 * snapshots it into `vault.document_archives`, then deletes it (soft-delete by
 * stamping `deleted_at`, or a hard row DELETE when the resolved policy says so),
 * and writes an audit record. One document's failure never stops the sweep.
 *
 * Policy resolution: `vault.documents.retention_policy` (text) names a row in
 * `vault.retention_policies`. An unknown / absent policy falls back to
 * archive + soft-delete — the job NEVER silently hard-deletes.
 *
 * Honest scope: this governs the document RECORD (the DB row), not the S3 object
 * bytes. Purging the underlying storage object is a separate lifecycle concern
 * the job does not perform.
 *
 * Scheduled by the process (startRetentionSchedule, from server/index.ts) the
 * way the audit-chain sweep is: explicit ENABLE_RETENTION_SWEEP wins, production
 * defaults on, anything else is opt-in (security audit 2026-09-24, DP-20; plan
 * P1-22). server/bin/run-retention.ts still runs one sweep by hand.
 *
 * Each disposition is ONE transaction: the archive snapshot, the delete (soft
 * or hard) and the chained audit_logs row (writeChainedAuditRow) commit
 * together or not at all. A deletion that cannot be audited — no organisation
 * to chain it under, or the row cannot be written — is not made. Until
 * 2026-09-26 the record of a deletion was a line in logs/audit.log on the
 * task's disk.
 */

import nodemailer from 'nodemailer';
import cron from 'node-cron';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import {
  vaultDocuments,
  vaultRetentionPolicies,
  vaultLegalHolds,
} from '../../shared/schema/vault';
import { writeChainedAuditRow } from '../services/auditService';
import { reportSecurityAlert } from '../services/security-alerts';
import { runWithSystemTenantScope } from '../db/tenantStore';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('retention-sweep');

type VaultDocument = typeof vaultDocuments.$inferSelect;
type RetentionPolicy = typeof vaultRetentionPolicies.$inferSelect;

/** Behavior applied to an expired document when no named policy matches. */
const DEFAULT_BEHAVIOR = { archiveBeforeDelete: true, hardDelete: false } as const;

export interface RetentionSummary {
  scanned: number;
  archived: number;
  softDeleted: number;
  hardDeleted: number;
  /** Expired documents left in place because a legal hold covers them. */
  heldByLegalHold: number;
  errors: number;
}

/** Documents whose retention_until has passed and that are not already deleted. */
async function findExpiredDocuments(): Promise<VaultDocument[]> {
  return db
    .select()
    .from(vaultDocuments)
    .where(
      and(
        isNull(vaultDocuments.deletedAt),
        sql`${vaultDocuments.retentionUntil} IS NOT NULL`,
        sql`${vaultDocuments.retentionUntil} < CURRENT_DATE`
      )
    );
}

/** Active named policies, keyed by policy_name. */
async function loadPolicies(): Promise<Map<string, RetentionPolicy>> {
  const rows = await db
    .select()
    .from(vaultRetentionPolicies)
    .where(eq(vaultRetentionPolicies.active, true));
  return new Map(rows.map(p => [p.policyName, p]));
}

interface TxClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  release: () => void;
}

/** The organisation a document's audit row chains under: its own column, else its program's. */
async function organisationOf(client: TxClient, doc: VaultDocument): Promise<number | null> {
  const own = Number((doc as { organizationId?: unknown }).organizationId);
  if (Number.isInteger(own) && own > 0) return own;
  const r = await client.query('SELECT organization_id FROM regulatory_programs WHERE id = $1 LIMIT 1', [doc.programId]);
  const viaProgram = Number(r.rows[0]?.organization_id);
  return Number.isInteger(viaProgram) && viaProgram > 0 ? viaProgram : null;
}

/**
 * Dispose of one expired document: the archive snapshot when the policy asks
 * for one, the soft or hard delete, and the chained audit row, in one
 * transaction. Throws (after ROLLBACK) when any of it cannot be done; the
 * caller counts the error and the document stays.
 */
async function disposeDocument(
  doc: VaultDocument,
  behaviour: { archiveBeforeDelete: boolean; hardDelete: boolean; policyMatched: boolean },
): Promise<void> {
  const client = (await pool.connect()) as unknown as TxClient;
  try {
    await client.query('BEGIN');
    const organizationId = await organisationOf(client, doc);
    if (organizationId === null) {
      throw new Error('no organisation for the document: the deletion cannot be audited, so it is not made');
    }
    if (behaviour.archiveBeforeDelete) {
      await client.query(
        `INSERT INTO vault.document_archives
           (original_document_id, program_id, document_code, document_title, document_type, retention_policy, snapshot, archive_reason, archived_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'retention_policy', 'system:retention-job')`,
        [doc.id, doc.programId, doc.documentCode, doc.documentTitle, doc.documentType, doc.retentionPolicy, JSON.stringify(doc)],
      );
    }
    if (behaviour.hardDelete) {
      await client.query('DELETE FROM vault.documents WHERE id = $1', [doc.id]);
    } else {
      await client.query('UPDATE vault.documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [doc.id]);
    }
    await writeChainedAuditRow(
      client,
      {
        action: behaviour.hardDelete ? 'vault.document.retention_hard_delete' : 'vault.document.retention_soft_delete',
        resourceType: 'vault_document',
        resourceId: doc.id,
        details: {
          programId: doc.programId,
          documentCode: doc.documentCode,
          retentionPolicy: doc.retentionPolicy ?? null,
          policyMatched: behaviour.policyMatched,
          retentionUntil: doc.retentionUntil,
          archived: behaviour.archiveBeforeDelete,
          actor: 'system:retention-job',
        },
      },
      organizationId,
      doc.id,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run one retention sweep. Best-effort per document; returns counts. Throws only
 * on a failure to enumerate work (e.g. the initial queries), not on per-document
 * errors (those are counted and the sweep continues).
 */
/**
 * Programs and documents under an ACTIVE legal hold.
 *
 * Read once per sweep rather than per document: a hold covers a program, so the
 * per-document query would be the same handful of rows N times.
 *
 * FAILS CLOSED. If the hold table cannot be read — it does not exist yet on this
 * database, the query errors, anything — this THROWS, and the sweep aborts
 * having deleted nothing. The alternative is a sweep that proceeds as though no
 * holds existed, which is the same outcome as having no holds at all and is
 * unrecoverable for the records it destroys.
 */
async function loadActiveHolds(): Promise<{ programs: Set<string>; documents: Set<string> }> {
  const rows = await db
    .select({ programId: vaultLegalHolds.programId, documentId: vaultLegalHolds.documentId })
    .from(vaultLegalHolds)
    .where(isNull(vaultLegalHolds.liftedAt));

  const programs = new Set<string>();
  const documents = new Set<string>();
  for (const r of rows) {
    if (r.programId) programs.add(r.programId);
    if (r.documentId) documents.add(r.documentId);
  }
  return { programs, documents };
}

export async function runRetentionSweep(): Promise<RetentionSummary> {
  return runWithSystemTenantScope('retention-sweep', async () => {
    const summary: RetentionSummary = {
      scanned: 0,
      archived: 0,
      softDeleted: 0,
      hardDeleted: 0,
      heldByLegalHold: 0,
      errors: 0,
    };

    /* Holds are loaded BEFORE anything is deleted, and a failure here aborts the
       whole sweep rather than one document — see loadActiveHolds. */
    const [expired, policies, holds] = await Promise.all([
      findExpiredDocuments(),
      loadPolicies(),
      loadActiveHolds(),
    ]);
    summary.scanned = expired.length;

    for (const doc of expired) {
      try {
        /* LEGAL HOLD OUTRANKS RETENTION.
           Checked before the policy is even resolved, so no archive is written
           and no delete is attempted for a held record. A retention policy says
           when a record MAY be destroyed; a hold says it may not be, and the
           hold wins. Destroying a record under hold is spoliation and is the one
           thing in this job that cannot be undone. */
        if (holds.documents.has(doc.id) || holds.programs.has(doc.programId)) {
          summary.heldByLegalHold += 1;
          logger.info('Expired document left in place: legal hold', {
            documentId: doc.id,
            programId: doc.programId,
            retentionUntil: doc.retentionUntil,
            heldBy: holds.documents.has(doc.id) ? 'document' : 'program',
          });
          continue;
        }

        const policy = doc.retentionPolicy ? policies.get(doc.retentionPolicy) : undefined;
        const archiveBeforeDelete = policy
          ? policy.archiveBeforeDelete
          : DEFAULT_BEHAVIOR.archiveBeforeDelete;
        const hardDelete = policy ? policy.hardDelete : DEFAULT_BEHAVIOR.hardDelete;

        await disposeDocument(doc, { archiveBeforeDelete, hardDelete, policyMatched: Boolean(policy) });
        if (archiveBeforeDelete) summary.archived += 1;
        if (hardDelete) summary.hardDeleted += 1;
        else summary.softDeleted += 1;
      } catch (error) {
        summary.errors += 1; // per-document best-effort; keep sweeping
        logger.error('Expired document not disposed of', {
          documentId: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  });
}

/** Best-effort admin notification. Recipients come from RETENTION_ADMIN_EMAILS
 *  (comma-separated); silently skipped when SMTP or recipients are unconfigured. */
async function notifyAdmins(summary: RetentionSummary): Promise<void> {
  const recipients = (process.env.RETENTION_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!recipients.length || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return;
  }

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transport.sendMail({
      from: process.env.EMAIL_FROM || 'Concept2Cure Vault <no-reply@trialsage.ai>',
      to: recipients.join(', '),
      subject: `[Retention] ${summary.softDeleted + summary.hardDeleted} document(s) processed`,
      html: `<p>Document retention sweep complete.</p>
        <ul>
          <li>Scanned (expired): ${summary.scanned}</li>
          <li>Archived: ${summary.archived}</li>
          <li>Soft-deleted: ${summary.softDeleted}</li>
          <li>Hard-deleted: ${summary.hardDeleted}</li>
          <li>Errors: ${summary.errors}</li>
        </ul>`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RETENTION] Failed to send notification:', message);
    reportSecurityAlert({
      kind: 'retention_notify_failed',
      message: 'Retention sweep admin notification failed',
      detail: {
        error: message,
        scanned: summary.scanned,
        softDeleted: summary.softDeleted,
        hardDeleted: summary.hardDeleted,
        errors: summary.errors,
      },
    });
  }
}

/**
 * Entry point used by server/bin/run-retention.ts. Runs a sweep, records a
 * job-level audit event, notifies admins, and returns whether it completed
 * without an enumeration-level failure.
 */
export async function runRetentionJob(): Promise<boolean> {
  logger.info('Document retention sweep starting');
  try {
    const summary = await runRetentionSweep();
    if (summary.errors > 0) logger.warn('Document retention sweep complete with errors', { ...summary });
    else logger.info('Document retention sweep complete', { ...summary });
    await notifyAdmins(summary);
    return summary.errors === 0;
  } catch (error) {
    logger.error('Document retention sweep failed', { error: error instanceof Error ? error.message : String(error) });
    reportSecurityAlert({
      kind: 'retention_sweep_failed',
      message: 'Document retention sweep failed before disposing of anything',
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

export default { runRetentionJob, runRetentionSweep };

// ── Scheduling ───────────────────────────────────────────────────────────────

export interface RetentionSweepPosture {
  enabled: boolean;
  controlledBy: 'ENABLE_RETENTION_SWEEP';
  reason: string;
}

/**
 * Whether the process schedules the nightly sweep. The same gating shape as
 * the audit-chain sweep (startup/audit-enforcement.ts): an explicit
 * ENABLE_RETENTION_SWEEP wins; production defaults ON, because a retention
 * policy nobody runs is a promise nobody keeps (Annex 11 §17, GDPR 5(1)(e));
 * anything else is opt-in.
 */
export function resolveRetentionSweepPosture(env: NodeJS.ProcessEnv = process.env): RetentionSweepPosture {
  const controlledBy = 'ENABLE_RETENTION_SWEEP' as const;
  const explicit = env.ENABLE_RETENTION_SWEEP;
  if (explicit === 'false') return { enabled: false, controlledBy, reason: 'explicitly disabled (ENABLE_RETENTION_SWEEP=false)' };
  if (explicit === 'true') return { enabled: true, controlledBy, reason: 'explicitly enabled (ENABLE_RETENTION_SWEEP=true)' };
  if ((env.NODE_ENV ?? '').toLowerCase() === 'production') {
    return { enabled: true, controlledBy, reason: 'production default (retention policies are enforced)' };
  }
  return { enabled: false, controlledBy, reason: 'opt-in outside production (set ENABLE_RETENTION_SWEEP=true)' };
}

export const DEFAULT_RETENTION_SWEEP_CRON = '30 3 * * *';

/** Schedule the nightly sweep, or say why not. Called once at boot (server/index.ts). */
export function startRetentionSchedule(): void {
  const posture = resolveRetentionSweepPosture(process.env);
  if (!posture.enabled) {
    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
      logger.warn('Document retention sweep DISABLED in production: retention policies are not enforced', posture);
    } else {
      logger.info('Document retention sweep disabled', posture);
    }
    return;
  }
  const expr = process.env.RETENTION_SWEEP_CRON || DEFAULT_RETENTION_SWEEP_CRON;
  try {
    cron.schedule(expr, () => {
      void runRetentionJob().catch((err) =>
        logger.error('Scheduled retention sweep failed', { error: err instanceof Error ? err.message : String(err) }),
      );
    });
    logger.info(`Document retention sweep scheduled (${expr})`, { enabled: true, controlledBy: posture.controlledBy, schedule: expr });
  } catch (err) {
    logger.error('Failed to schedule the document retention sweep', { error: err instanceof Error ? err.message : String(err) });
  }
}
