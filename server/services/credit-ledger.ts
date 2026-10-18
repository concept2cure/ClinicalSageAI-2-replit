/**
 * @fileoverview Administrative allocation ledger and payment capability boundaries.
 * @module server/services/credit-ledger
 *
 * This ledger records administrative allocations in integer cents. It does
 * not fund feature usage, sell prepaid credits or charge a payment method.
 * Subscription prices, provider costs and feature-quota units are separate
 * contracts; no approved conversion binds them to this ledger.
 *
 * Administrative grants/adjustments carry an identified actor and reason.
 * The entry and its chained audit row commit together under a per-org lock.
 * Historical purchase/reload/debit rows stay readable, but these entry types
 * cannot be created until their payment and usage contracts are implemented.
 * Legacy reload requests are reported separately from effective availability.
 */

import { pool } from '../db.js';
import { logAuditEvent } from './audit/auditLogger.js';
import { auditRowOutcomeFrom, type AuditRowOutcome } from './audit/audit-write-outcome.js';
import { writeChainedAuditRow } from './auditService';
import { setTenantContextTx } from './tenant/governed-tenant-context';

export const CREDIT_ENTRY_TYPES = ['grant', 'purchase', 'auto_reload', 'debit', 'adjustment'] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export type CreditCapability = 'purchase' | 'autoReload' | 'usageDebit';

/** No environment switch enables a financial workflow that does not exist. */
export function getCreditCapabilities() {
  return {
    balanceMode: 'administrative_allocation' as const,
    unit: 'ledger_cent' as const,
    purchase: { available: false as const, reason: 'Credit purchases are unavailable. Contact your administrator about allocations.' },
    autoReload: { available: false as const, reason: 'Automatic credit reload is unavailable.' },
    usageDebit: { available: false as const, reason: 'Allocations are not debited for usage and do not increase plan limits.' },
  };
}

export class CreditCapabilityUnavailableError extends Error {
  readonly code = 'CREDIT_CAPABILITY_UNAVAILABLE';
  constructor(readonly capability: CreditCapability) {
    super(getCreditCapabilities()[capability].reason);
    this.name = 'CreditCapabilityUnavailableError';
  }
}

export interface CreditEntry {
  id: number;
  organizationId: number;
  entryType: CreditEntryType;
  amountCents: number;
  balanceAfterCents: number;
  description: string | null;
  reference: string | null;
  createdBy: number | null;
  createdAt: Date;
}

export interface AutoReloadSettings {
  organizationId: number;
  /** Effective state; false while the charging workflow is unavailable. */
  enabled: boolean;
  requestedEnabled: boolean;
  available: false;
  /** Reload triggers when balance <= threshold. */
  thresholdCents: number;
  /** Amount credited by each reload. */
  topupCents: number;
  updatedBy: number | null;
  reason: string | null;
  updatedAt: Date | null;
}

/** Legacy preference defaults, retained for read compatibility; no charge is enabled. */
export const DEFAULT_AUTORELOAD: Pick<AutoReloadSettings, 'enabled' | 'thresholdCents' | 'topupCents'> = {
  enabled: false,
  thresholdCents: 1_000,
  topupCents: 2_500,
};

// ─────────────────────────────────────────────────────────────────────────────
// PURE helpers
// ─────────────────────────────────────────────────────────────────────────────

/** PURE: whether a balance qualifies for an auto-reload under the settings. */
export function shouldAutoReload(
  balanceCents: number,
  settings: Pick<AutoReloadSettings, 'enabled' | 'thresholdCents' | 'topupCents'> | null,
): boolean {
  if (!settings || !settings.enabled) return false;
  if (!Number.isFinite(balanceCents)) return false;
  return balanceCents <= settings.thresholdCents;
}

/** PURE: validate auto-reload settings. Returns human-readable errors (empty = valid). */
export function validateAutoReload(input: {
  enabled?: unknown;
  thresholdCents?: unknown;
  topupCents?: unknown;
}): string[] {
  const errors: string[] = [];
  if (typeof input.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }
  const threshold = Number(input.thresholdCents);
  if (!Number.isInteger(threshold) || threshold < 0) {
    errors.push('thresholdCents must be a non-negative integer');
  }
  const topup = Number(input.topupCents);
  if (!Number.isInteger(topup) || topup <= 0) {
    errors.push('topupCents must be a positive integer');
  }
  return errors;
}

/** PURE: the signed amount an entry type requires (throws on sign mismatch). */
export function normalizeEntryAmount(entryType: CreditEntryType, amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents === 0 || Math.abs(amountCents) > 2_147_483_647) {
    throw validationError(['amountCents must be a non-zero integer within the ledger range']);
  }
  if (entryType === 'debit' && amountCents > 0) return -amountCents;
  if ((entryType === 'grant' || entryType === 'purchase' || entryType === 'auto_reload') && amountCents < 0) {
    throw validationError([`${entryType} entries must have a positive amount`]);
  }
  return amountCents;
}

function validationError(errors: string[]): Error {
  const err = new Error(errors.join('; '));
  (err as any).validation = errors;
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger reads
// ─────────────────────────────────────────────────────────────────────────────

/** Current balance in cents (0 for an org with no ledger history). */
export async function getCreditBalance(organizationId: number): Promise<number> {
  const res = await pool.query<{ balance: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM credit_ledger WHERE organization_id = $1`,
    [organizationId],
  );
  return Number(res.rows[0]?.balance ?? 0);
}

function rowToEntry(r: any): CreditEntry {
  return {
    id: Number(r.id),
    organizationId: Number(r.organization_id),
    entryType: r.entry_type,
    amountCents: Number(r.amount_cents),
    balanceAfterCents: Number(r.balance_after_cents),
    description: r.description ?? null,
    reference: r.reference ?? null,
    createdBy: r.created_by == null ? null : Number(r.created_by),
    createdAt: r.created_at,
  };
}

/** Recent ledger entries, newest first. */
export async function getCreditLedger(organizationId: number, limit = 50): Promise<CreditEntry[]> {
  const res = await pool.query(
    `SELECT * FROM credit_ledger WHERE organization_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [organizationId, Math.min(Math.max(1, limit), 200)],
  );
  return res.rows.map(rowToEntry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger writes
// ─────────────────────────────────────────────────────────────────────────────

export interface AddEntryInput {
  entryType: CreditEntryType;
  /** Signed or unsigned; debits are normalized to negative. Non-zero integer. */
  amountCents: number;
  description?: string;
  reference?: string;
  /** Permit the balance to go negative (platform-admin adjustments only). */
  allowNegative?: boolean;
}

/** Validate the administrative mutation before opening a database connection. */
function allocationInput(organizationId: number, input: AddEntryInput, actor?: { userId: number | null }) {
  if (!CREDIT_ENTRY_TYPES.includes(input.entryType)) {
    throw validationError([`entryType must be one of: ${CREDIT_ENTRY_TYPES.join(', ')}`]);
  }
  const unsupported = { purchase: 'purchase', auto_reload: 'autoReload', debit: 'usageDebit' } as const;
  if (input.entryType in unsupported) {
    throw new CreditCapabilityUnavailableError(unsupported[input.entryType as keyof typeof unsupported]);
  }
  const actorId = Number(actor?.userId);
  const reason = typeof input.description === 'string' ? input.description.trim() : '';
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw validationError(['organizationId must be a positive integer']);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw validationError(['An identified actor is required for an administrative allocation']);
  if (!reason) throw validationError(['A reason is required for an administrative allocation']);
  return { actorId, reason, amount: normalizeEntryAmount(input.entryType, input.amountCents) };
}

/**
 * Append a ledger entry. Serializes per-org on a transaction-scoped advisory
 * lock so the balance-after computation cannot race a concurrent write.
 * Rejects a negative resulting allocation unless a platform adjustment permits it.
 */
export async function addCreditEntry(
  organizationId: number,
  input: AddEntryInput,
  actor?: { userId: number | null },
): Promise<CreditEntry> {
  const { actorId, reason, amount } = allocationInput(organizationId, input, actor);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, organizationId);
    // Per-org serialization: same lock key for every ledger write of this org.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('credit_ledger:' || $1::text))`, [organizationId]);
    const balRes = await client.query<{ balance: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM credit_ledger WHERE organization_id = $1`,
      [organizationId],
    );
    const balance = Number(balRes.rows[0]?.balance ?? 0);
    const after = balance + amount;
    if (after < 0 && !input.allowNegative) {
      const err = new Error(
        `Insufficient credits: balance ${balance} cents, requested ${amount} cents`,
      );
      (err as any).code = 'INSUFFICIENT_CREDITS';
      (err as any).balanceCents = balance;
      throw err;
    }
    const res = await client.query(
      `INSERT INTO credit_ledger
         (organization_id, entry_type, amount_cents, balance_after_cents, description, reference, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        organizationId,
        input.entryType,
        amount,
        after,
        reason,
        input.reference?.trim() || null,
        actorId,
      ],
    );
    const entry = rowToEntry(res.rows[0]);
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: actorId,
      action: `billing.credit_allocation.${input.entryType}`,
      resourceType: 'credit_ledger',
      resourceId: entry.id,
      reason,
      details: {
        reason, entryType: input.entryType,
        amountCents: amount, balanceBeforeCents: balance, balanceAfterCents: after,
        reference: input.reference?.trim() || null,
        balanceMode: 'administrative_allocation',
      },
    });
    await client.query('COMMIT');
    return entry;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reserved usage boundary. An explicit refusal prevents a new caller from
 * mistaking feature-quota units or provider costs for an approved customer tariff.
 */
export async function debitCredits(
  _organizationId: number,
  _amountCents: number,
  _opts: { description?: string; reference?: string; actor?: { userId: number | null } } = {},
): Promise<{ debit: CreditEntry; reload: CreditEntry | null }> {
  throw new CreditCapabilityUnavailableError('usageDebit');
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-reload
// ─────────────────────────────────────────────────────────────────────────────

/** The org's auto-reload settings, or the platform defaults when unset. */
export async function getAutoReload(organizationId: number): Promise<AutoReloadSettings> {
  const res = await pool.query(
    `SELECT * FROM credit_autoreload_settings WHERE organization_id = $1`,
    [organizationId],
  );
  if (!res.rows.length) {
    return {
      organizationId,
      ...DEFAULT_AUTORELOAD,
      requestedEnabled: false, available: false,
      updatedBy: null,
      reason: null,
      updatedAt: null,
    };
  }
  const r = res.rows[0];
  return {
    organizationId,
    enabled: false,
    requestedEnabled: r.enabled === true, available: false,
    thresholdCents: Number(r.threshold_cents),
    topupCents: Number(r.topup_cents),
    updatedBy: r.updated_by == null ? null : Number(r.updated_by),
    reason: r.reason ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/**
 * Set auto-reload. GOVERNED: validates, requires a reason-for-change, and
 * writes a 21 CFR Part 11 audit event with before/after values.
 *
 * Resolves the saved settings AND what happened to that audit event. The
 * settings stand when the event is lost (an audit outage must not undo an
 * admin's change); the caller is told which, and the route forwards it.
 */
export async function setAutoReload(
  organizationId: number,
  settings: { enabled: boolean; thresholdCents: number; topupCents: number },
  actor: { userId: number },
  reason: string,
): Promise<{ settings: AutoReloadSettings; auditTrail: AuditRowOutcome }> {
  const errors = validateAutoReload(settings);
  if (errors.length) throw validationError(errors);
  if (settings.enabled) throw new CreditCapabilityUnavailableError('autoReload');
  if (!reason || !reason.trim()) {
    throw validationError(['A reason-for-change is required to change auto-reload settings']);
  }

  const previous = await getAutoReload(organizationId);

  await pool.query(
    `INSERT INTO credit_autoreload_settings
       (organization_id, enabled, threshold_cents, topup_cents, updated_by, reason, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       threshold_cents = EXCLUDED.threshold_cents,
       topup_cents = EXCLUDED.topup_cents,
       updated_by = EXCLUDED.updated_by,
       reason = EXCLUDED.reason,
       updated_at = NOW()`,
    [organizationId, settings.enabled, settings.thresholdCents, settings.topupCents, actor.userId, reason.trim()],
  );
  const saved = await getAutoReload(organizationId);

  /* WO-16C. This was `try { await logAuditEvent(…) } catch { logger.error }`
     with the resolved outcome thrown away. logAuditEvent RESOLVES
     `persisted: false` when the row is lost — it does not reject — so the catch
     could only ever see a bug, and a rule change with no §11.10(e) row returned
     exactly what one with a row did. The outcome is now carried. The catch
     stays for the bug case, and reports it as a lost row, not as success. */
  const auditContext = {
    action: 'compliance.credit_autoreload.update',
    resourceType: 'credit_autoreload_settings',
    resourceId: String(organizationId),
  };
  let auditTrail: AuditRowOutcome;
  try {
    const written = await logAuditEvent({
      category: 'compliance',
      severity: 'info',
      action: 'credit_autoreload.update',
      userId: String(actor.userId),
      organizationId: String(organizationId),
      resourceType: 'credit_autoreload_settings',
      resourceId: String(organizationId),
      previousValue: previous,
      newValue: saved,
      metadata: { reason: reason.trim() },
      success: true,
    });
    auditTrail = auditRowOutcomeFrom(written, auditContext);
  } catch (e) {
    auditTrail = auditRowOutcomeFrom(undefined, {
      ...auditContext,
      thrown: e instanceof Error ? e.message : String(e),
    });
  }

  return { settings: saved, auditTrail };
}

/**
 * No reload can be fulfilled without a verified successful payment. Retained
 * as a safe compatibility boundary; a saved legacy request never mints credits.
 */
export async function maybeAutoReload(_organizationId: number): Promise<CreditEntry | null> {
  return null;
}
