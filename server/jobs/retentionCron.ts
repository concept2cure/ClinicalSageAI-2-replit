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
 * Standalone job module (mirrors server/jobs/driftSentinelSweep.ts): it is not
 * auto-registered at boot. Invoke runRetentionJob() from server/bin/run-retention.ts
 * or an external scheduler.
 */

import nodemailer from 'nodemailer';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  vaultDocuments,
  vaultRetentionPolicies,
  vaultDocumentArchives,
} from '../../shared/schema/vault';
// audit-logger is plain JS; logAction is fire-and-forget, logSystemEvent records
// job-level events. Typed via the adjacent audit-logger.d.ts.
import { logSystemEvent, logAction } from '../utils/audit-logger.js';

type VaultDocument = typeof vaultDocuments.$inferSelect;
type RetentionPolicy = typeof vaultRetentionPolicies.$inferSelect;

/** Behavior applied to an expired document when no named policy matches. */
const DEFAULT_BEHAVIOR = { archiveBeforeDelete: true, hardDelete: false } as const;

export interface RetentionSummary {
  scanned: number;
  archived: number;
  softDeleted: number;
  hardDeleted: number;
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

/** Snapshot a document's record into the immutable archive table. */
async function archiveDocument(doc: VaultDocument): Promise<void> {
  await db.insert(vaultDocumentArchives).values({
    originalDocumentId: doc.id,
    programId: doc.programId,
    documentCode: doc.documentCode,
    documentTitle: doc.documentTitle,
    documentType: doc.documentType,
    retentionPolicy: doc.retentionPolicy,
    snapshot: doc,
    archiveReason: 'retention_policy',
    archivedBy: 'system:retention-job',
  });
}

/**
 * Run one retention sweep. Best-effort per document; returns counts. Throws only
 * on a failure to enumerate work (e.g. the initial queries), not on per-document
 * errors (those are counted and the sweep continues).
 */
export async function runRetentionSweep(): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    scanned: 0,
    archived: 0,
    softDeleted: 0,
    hardDeleted: 0,
    errors: 0,
  };

  const [expired, policies] = await Promise.all([findExpiredDocuments(), loadPolicies()]);
  summary.scanned = expired.length;

  for (const doc of expired) {
    try {
      const policy = doc.retentionPolicy ? policies.get(doc.retentionPolicy) : undefined;
      const archiveBeforeDelete = policy ? policy.archiveBeforeDelete : DEFAULT_BEHAVIOR.archiveBeforeDelete;
      const hardDelete = policy ? policy.hardDelete : DEFAULT_BEHAVIOR.hardDelete;

      if (archiveBeforeDelete) {
        await archiveDocument(doc);
        summary.archived += 1;
      }

      if (hardDelete) {
        await db.delete(vaultDocuments).where(eq(vaultDocuments.id, doc.id));
        summary.hardDeleted += 1;
      } else {
        await db
          .update(vaultDocuments)
          .set({ deletedAt: new Date() })
          .where(and(eq(vaultDocuments.id, doc.id), isNull(vaultDocuments.deletedAt)));
        summary.softDeleted += 1;
      }

      logAction({
        action: hardDelete ? 'document.retention_hard_delete' : 'document.retention_soft_delete',
        userId: 'system',
        username: 'retention-job',
        entityType: 'vault_document',
        entityId: doc.id,
        details: {
          programId: doc.programId,
          documentCode: doc.documentCode,
          retentionPolicy: doc.retentionPolicy ?? null,
          policyMatched: Boolean(policy),
          retentionUntil: doc.retentionUntil,
          archived: archiveBeforeDelete,
        },
      });
    } catch (error) {
      summary.errors += 1; // per-document best-effort; keep sweeping
      console.error(`[RETENTION] Failed to process document ${doc.id}:`, error instanceof Error ? error.message : error);
    }
  }

  return summary;
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
    console.error('[RETENTION] Failed to send notification:', error instanceof Error ? error.message : error);
  }
}

/**
 * Entry point used by server/bin/run-retention.ts. Runs a sweep, records a
 * job-level audit event, notifies admins, and returns whether it completed
 * without an enumeration-level failure.
 */
export async function runRetentionJob(): Promise<boolean> {
  console.log('[RETENTION] Starting document retention sweep...');
  try {
    const summary = await runRetentionSweep();

    logSystemEvent({
      event: 'retention_sweep_complete',
      component: 'retention_job',
      severity: summary.errors > 0 ? 'warning' : 'info',
      details: { ...summary },
    });

    console.log(
      `[RETENTION] Done — scanned ${summary.scanned}, archived ${summary.archived}, ` +
        `soft-deleted ${summary.softDeleted}, hard-deleted ${summary.hardDeleted}, errors ${summary.errors}`
    );

    await notifyAdmins(summary);
    return summary.errors === 0;
  } catch (error) {
    console.error('[RETENTION] Sweep failed:', error instanceof Error ? error.message : error);
    logSystemEvent({
      event: 'retention_sweep_failure',
      component: 'retention_job',
      severity: 'error',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

export default { runRetentionJob, runRetentionSweep };
