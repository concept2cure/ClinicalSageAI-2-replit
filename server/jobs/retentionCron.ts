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
 *
 * Each organisation is swept in its OWN scope: its tenant id and its
 * organisation uuid, no role (P-72 slice 1b, 2026-10-30;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). Only the list of
 * organisations is read in the system scope, from `organizations`, whose read
 * policy is open. Until then the whole sweep ran in the system scope (tenant
 * '0', no uuid), where vault.documents decides through core.can_access_program
 * on the organisation uuid and admits nothing: on a production-shaped database
 * it scanned 0 of 2 expired documents, so the Vault's retention never ran. It
 * read the legal holds only through the platform arm, which P-72 removes. In
 * its own scope an organisation's policies admit its documents, its programmes
 * and its holds, with or without that arm, and nothing of another
 * organisation's.
 *
 * An organisation sweeps the expired documents of the programmes it OWNS. A
 * hold is always placed by the organisation that owns its programme or
 * document (routes/vault-legal-holds.ts targetOwned), so that organisation's
 * scope reads every hold that can cover them; a delegate's scope, which also
 * admits a sponsor's programme (identity.org_relationships), does not read
 * the sponsor's holds, and so never sweeps the sponsor's documents. A
 * document that names a different organisation from its programme's owner
 * (vault.documents carries no same-organisation key: scripts/db/
 * program-same-org-preflight.mjs) is left in place and counted
 * (organizationMismatch): its disposal would be audited under its own
 * organisation, whose scope cannot read the owner's holds.
 */

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
import { sendGenericEmail } from '../services/emailService';
import { runWithSystemTenantScope, runWithTenantScope } from '../db/tenantStore';
import { runScheduledOncePerWindow, windowKeyOf } from '../db/scheduledOnce';
import { createScopedLogger } from '../utils/logger';

const CALLER = 'retention-sweep';
const logger = createScopedLogger(CALLER);

type VaultDocument = typeof vaultDocuments.$inferSelect;
type RetentionPolicy = typeof vaultRetentionPolicies.$inferSelect;

/** Behavior applied to an expired document when no named policy matches. */
const DEFAULT_BEHAVIOR = { archiveBeforeDelete: true, hardDelete: false } as const;

export interface RetentionSummary {
  /** Organisations swept, each in its own scope. */
  organizations: number;
  /**
   * Organisations with no uuid: their Vault cannot be read in their own scope,
   * so none of their documents was swept. The deployed schema makes the column
   * NOT NULL; a run that finds one fails rather than report a clean sweep.
   */
  organizationsNotSwept: number;
  scanned: number;
  archived: number;
  softDeleted: number;
  /**
   * Expired documents whose policy asks for destruction, left untouched. The
   * database refuses to delete a recorded version (VR-07), and whether
   * retention may ever destroy one is founder decision FD3
   * (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md). Until then the sweep
   * reports these instead of attempting a delete that would fail.
   */
  destructionRefused: number;
  /** Expired documents left in place because a legal hold covers them. */
  heldByLegalHold: number;
  /**
   * Expired documents left in place because the document names another
   * organisation than its programme's owner: no one scope reads every hold on
   * it and can also audit its disposal. Not a clean sweep (runRetentionJob).
   */
  organizationMismatch: number;
  /**
   * Expired documents another run had already disposed of by the time this
   * one reached them: nothing archived, nothing audited (U19).
   */
  alreadyDisposed: number;
  errors: number;
}

/**
 * The expired, undeleted documents of the programmes this organisation owns,
 * whatever organisation each document names (the sweep refuses a mismatch).
 * The organisation's scope admits a programme it is a delegate on too
 * (identity.org_relationships); that sponsor's documents are swept in the
 * sponsor's own run, whose scope reads the sponsor's holds.
 */
async function findExpiredDocuments(organizationId: number): Promise<VaultDocument[]> {
  return db
    .select()
    .from(vaultDocuments)
    .where(
      and(
        isNull(vaultDocuments.deletedAt),
        sql`${vaultDocuments.retentionUntil} IS NOT NULL`,
        sql`${vaultDocuments.retentionUntil} < CURRENT_DATE`,
        sql`${vaultDocuments.programId} IN (SELECT rp.id FROM regulatory_programs rp WHERE rp.organization_id = ${organizationId})`
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
 * for one, the soft delete, and the chained audit row, in one transaction.
 * Throws (after ROLLBACK) when any of it cannot be done; the caller counts the
 * error and the document stays. A policy that asks for destruction never
 * reaches here (see RetentionSummary.destructionRefused).
 */
async function disposeDocument(
  doc: VaultDocument,
  behaviour: { archiveBeforeDelete: boolean; policyMatched: boolean },
  scopeOrganizationId: number,
): Promise<'disposed' | 'already_disposed'> {
  const client = (await pool.connect()) as unknown as TxClient;
  try {
    await client.query('BEGIN');
    const organizationId = await organisationOf(client, doc);
    if (organizationId === null) {
      throw new Error('no organisation for the document: the deletion cannot be audited, so it is not made');
    }
    if (organizationId !== scopeOrganizationId) {
      throw new Error(`the document belongs to organisation ${organizationId}, not to the one being swept: it is not disposed of in another organisation's scope`);
    }
    if (behaviour.archiveBeforeDelete) {
      await client.query(
        `INSERT INTO vault.document_archives
           (original_document_id, program_id, document_code, document_title, document_type, retention_policy, snapshot, archive_reason, archived_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'retention_policy', 'system:retention-job')`,
        [doc.id, doc.programId, doc.documentCode, doc.documentTitle, doc.documentType, doc.retentionPolicy, JSON.stringify(doc)],
      );
    }
    // Only the run whose UPDATE matched records the disposition. Another
    // process may have disposed of the document since the sweep listed it; its
    // archive snapshot above is rolled back with this transaction, and no
    // second retention_soft_delete audit row records a deletion this run did
    // not make (U19).
    const softDelete = await client.query('UPDATE vault.documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [doc.id]);
    if (softDelete.rowCount === 0) {
      await client.query('ROLLBACK');
      return 'already_disposed';
    }
    await writeChainedAuditRow(
      client,
      {
        action: 'vault.document.retention_soft_delete',
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
    return 'disposed';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Programs and documents under an ACTIVE legal hold.
 *
 * Read once per sweep rather than per document: a hold covers a program, so the
 * per-document query would be the same handful of rows N times.
 *
 * FAILS CLOSED. If the hold table cannot be read — it does not exist yet on this
 * database, the query errors, anything — this THROWS, and the sweep aborts
 * having deleted nothing more. Read in the organisation's own scope, whose
 * tenant arm admits its holds; in the system scope only the platform arm did. The alternative is a sweep that proceeds as though no
 * holds existed, which is the same outcome as having no holds at all and is
 * unrecoverable for the records it destroys.
 */
async function loadActiveHolds(organizationId: number): Promise<{ programs: Set<string>; documents: Set<string> }> {
  const rows = await db
    .select({ programId: vaultLegalHolds.programId, documentId: vaultLegalHolds.documentId })
    .from(vaultLegalHolds)
    .where(and(isNull(vaultLegalHolds.liftedAt), eq(vaultLegalHolds.organizationId, organizationId)));

  const programs = new Set<string>();
  const documents = new Set<string>();
  for (const r of rows) {
    if (r.programId) programs.add(r.programId);
    if (r.documentId) documents.add(r.documentId);
  }
  return { programs, documents };
}

/** Every organisation, or only the ones named; read in the system scope, where `organizations` is an open read. */
async function listOrganizations(organizationIds?: number[]): Promise<Array<{ id: number; uuid: string | null }>> {
  return runWithSystemTenantScope(CALLER, async () => {
    const { rows } = await pool.query<{ id: number; uuid: string | null }>(
      `SELECT id, uuid::text AS uuid FROM public.organizations
        WHERE ($1::int[] IS NULL OR id = ANY($1::int[])) ORDER BY id`,
      [organizationIds ?? null],
    );
    return rows.map((r) => ({ id: Number(r.id), uuid: r.uuid ? String(r.uuid) : null }));
  });
}

/**
 * The other organisation an expired document names, when it names one that is
 * not its programme's owner (the organisation being swept); null otherwise.
 */
function namesAnotherOrganization(doc: VaultDocument, organizationId: number): number | null {
  const named = Number((doc as { organizationId?: unknown }).organizationId);
  return Number.isInteger(named) && named > 0 && named !== organizationId ? named : null;
}

/** One organisation's expired documents, in that organisation's own scope. */
async function sweepOrganization(
  organizationId: number,
  policies: Map<string, RetentionPolicy>,
  summary: RetentionSummary,
): Promise<void> {
  /* Holds are loaded BEFORE anything is deleted, and a failure here aborts the
     whole sweep rather than one document — see loadActiveHolds. */
  const [expired, holds] = await Promise.all([
    findExpiredDocuments(organizationId),
    loadActiveHolds(organizationId),
  ]);
  summary.scanned += expired.length;

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
          organizationId,
          documentId: doc.id,
          programId: doc.programId,
          retentionUntil: doc.retentionUntil,
          heldBy: holds.documents.has(doc.id) ? 'document' : 'program',
        });
        continue;
      }

      const named = namesAnotherOrganization(doc, organizationId);
      if (named !== null) {
        summary.organizationMismatch += 1;
        logger.warn('Expired document left in place: it names another organisation than its programme\'s owner', {
          organizationId,
          documentOrganizationId: named,
          documentId: doc.id,
          programId: doc.programId,
          retentionUntil: doc.retentionUntil,
        });
        continue;
      }

      const policy = doc.retentionPolicy ? policies.get(doc.retentionPolicy) : undefined;
      const archiveBeforeDelete = policy
        ? policy.archiveBeforeDelete
        : DEFAULT_BEHAVIOR.archiveBeforeDelete;
      const hardDelete = policy ? policy.hardDelete : DEFAULT_BEHAVIOR.hardDelete;
      if (hardDelete) {
        // Nothing is archived or tombstoned either: the policy asked for
        // destruction, not for this, and the record stays as it is.
        summary.destructionRefused += 1;
        logger.warn('Expired document left untouched: its policy asks for destruction, which is refused', {
          organizationId,
          documentId: doc.id,
          programId: doc.programId,
          retentionPolicy: doc.retentionPolicy,
          retentionUntil: doc.retentionUntil,
        });
        continue;
      }

      const outcome = await disposeDocument(doc, { archiveBeforeDelete, policyMatched: Boolean(policy) }, organizationId);
      if (outcome === 'already_disposed') {
        summary.alreadyDisposed += 1;
        continue;
      }
      if (archiveBeforeDelete) summary.archived += 1;
      summary.softDeleted += 1;
    } catch (error) {
      summary.errors += 1; // per-document best-effort; keep sweeping
      logger.error('Expired document not disposed of', {
        organizationId,
        documentId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Run one retention sweep over every organisation, or only the ones named (an
 * operator re-running one tenant; a test that must not touch another suite's
 * rows). Best-effort per document; returns counts. Throws only on a failure to
 * enumerate work (the organisation list, the policies, an organisation's
 * documents or holds), not on per-document errors (those are counted and the
 * sweep continues).
 */
export async function runRetentionSweep(opts: { organizationIds?: number[] } = {}): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    organizations: 0,
    organizationsNotSwept: 0,
    scanned: 0,
    archived: 0,
    softDeleted: 0,
    destructionRefused: 0,
    heldByLegalHold: 0,
    organizationMismatch: 0,
    alreadyDisposed: 0,
    errors: 0,
  };
  const organizations = await listOrganizations(opts.organizationIds);
  // vault.retention_policies is reference data with no tenant key or policy: read once.
  const policies = await runWithSystemTenantScope(CALLER, () => loadPolicies());

  for (const org of organizations) {
    if (!org.uuid) {
      summary.organizationsNotSwept += 1;
      logger.error('Organisation not swept: it has no uuid, so its Vault cannot be read in its own scope', { organizationId: org.id });
      continue;
    }
    summary.organizations += 1;
    await runWithTenantScope(
      { tenantId: String(org.id), orgUuid: org.uuid, role: null, source: 'job', caller: CALLER },
      () => sweepOrganization(org.id, policies, summary),
    );
  }

  return summary;
}

/**
 * Best-effort admin notification. Recipients come from RETENTION_ADMIN_EMAILS
 * (comma-separated); with none configured nothing is sent.
 *
 * Sent through the one mail path (services/emailService.ts), which reads the
 * SMTP_HOST / SMTP_USER / SMTP_PASS that terraform/stack renders. This used to
 * build its own transport from SMTP_PASSWORD, which nothing sets, so in
 * production the summary was never sent and nothing said so. Recipients with
 * no deliverable mail now raise the alert instead of passing silently.
 */
async function notifyAdmins(summary: RetentionSummary): Promise<void> {
  const recipients = (process.env.RETENTION_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const lines: Array<[string, number]> = [
    ['Organisations swept', summary.organizations],
    ['Organisations NOT swept (no uuid: their Vault cannot be read)', summary.organizationsNotSwept],
    ['Scanned (expired)', summary.scanned],
    ['Archived', summary.archived],
    ['Soft-deleted', summary.softDeleted],
    ['Destruction refused (policy asks to destroy; awaiting the retention decision)', summary.destructionRefused],
    ['Left in place: the document names another organisation than its programme\'s owner', summary.organizationMismatch],
    ['Already disposed of by another run', summary.alreadyDisposed],
    ['Errors', summary.errors],
  ];
  const sent = await sendGenericEmail(
    recipients.join(', '),
    `[Retention] ${summary.softDeleted} document(s) processed, ${summary.destructionRefused} destruction(s) refused`,
    ['Document retention sweep complete.', ...lines.map(([label, n]) => `${label}: ${n}`)].join('\n'),
    `<p>Document retention sweep complete.</p>\n<ul>${lines.map(([label, n]) => `<li>${label}: ${n}</li>`).join('')}</ul>`,
  );
  if (!sent) {
    logger.error('Retention sweep admin notification was not delivered', { recipients: recipients.length });
    reportSecurityAlert({
      kind: 'retention_notify_failed',
      message: 'Retention sweep admin notification was not delivered',
      detail: {
        scanned: summary.scanned,
        softDeleted: summary.softDeleted,
        destructionRefused: summary.destructionRefused,
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
    if (summary.organizationsNotSwept > 0) {
      reportSecurityAlert({
        kind: 'retention_sweep_failed',
        message: `Document retention sweep could not read the Vault of ${summary.organizationsNotSwept} organisation(s)`,
        detail: { organizations: summary.organizations, organizationsNotSwept: summary.organizationsNotSwept },
      });
    }
    const clean = summary.errors === 0 && summary.organizationsNotSwept === 0 && summary.organizationMismatch === 0;
    if (!clean) logger.warn('Document retention sweep complete with errors', { ...summary });
    else logger.info('Document retention sweep complete', { ...summary });
    await notifyAdmins(summary);
    return clean;
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

/** The sweep runs at most once per UTC day across every server process. */
const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    // Every server process schedules this (two API tasks and the worker). One
    // run per day: the first process to claim the day's window runs it, the
    // others skip (U19). A run that throws gives the window back.
    cron.schedule(expr, () => {
      void runScheduledOncePerWindow('retention-sweep', windowKeyOf(RETENTION_WINDOW_MS), () => runRetentionJob()).catch((err) =>
        logger.error('Scheduled retention sweep failed', { error: err instanceof Error ? err.message : String(err) }),
      );
    });
    logger.info(`Document retention sweep scheduled (${expr})`, { enabled: true, controlledBy: posture.controlledBy, schedule: expr });
  } catch (err) {
    logger.error('Failed to schedule the document retention sweep', { error: err instanceof Error ? err.message : String(err) });
  }
}
