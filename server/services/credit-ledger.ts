/**
 * @fileoverview Credit balance ledger + auto-reload (Anthropic-style).
 * @module server/services/credit-ledger
 *
 * A rechargeable usage-credit balance modeled on Anthropic's billing page:
 * a current balance, purchasable top-ups, and an auto-reload rule ("top off
 * to $X when your balance is $Y"). Distinct from the per-tier monthly credit
 * grid in usage-metering.ts (fixed allowances that reset each period): this
 * ledger is a durable, signed, append-only account balance.
 *
 * Ledger invariants:
 *   - amount_cents is SIGNED: credits (grant/purchase/auto_reload) >= 0,
 *     debits <= 0 (also CHECK-constrained in the migration).
 *   - balance = SUM(amount_cents); each row also stores balance_after_cents
 *     for cheap history reads. Writes serialize on a per-org advisory lock
 *     so concurrent entries cannot interleave balance computation.
 *   - debits that would take the balance below zero are rejected with an
 *     INSUFFICIENT_CREDITS error unless allowNegative is passed (for
 *     platform-admin adjustments).
 *
 * Money handling per the Business Center convention: integer cents only.
 * Governed mutations (auto-reload settings, admin grants/adjustments) carry
 * who/why and write a 21 CFR Part 11 audit event, mirroring
 * weekly-usage-limits.setWeeklyLimit.
 *
 * NOTE: purchase/auto_reload entries record the ledger movement only —
 * charging the payment method (Stripe) is deliberately out of scope here
 * and can be wired to the existing billing.ts checkout flow later. Until
 * then these entry types are restricted to platform-admin surfaces.
 */

import { pool } from '../db.js';
import { logAuditEvent } from './audit/auditLogger.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('credit-ledger');

export const CREDIT_ENTRY_TYPES = ['grant', 'purchase', 'auto_reload', 'debit', 'adjustment'] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

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
  enabled: boolean;
  /** Reload triggers when balance <= threshold. */
  thresholdCents: number;
  /** Amount credited by each reload. */
  topupCents: number;
  updatedBy: number | null;
  reason: string | null;
  updatedAt: Date | null;
}

/** Platform defaults mirror Anthropic's "top off to $25 when balance is $10". */
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
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw validationError(['amountCents must be a non-zero integer']);
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

/**
 * Append a ledger entry. Serializes per-org on a transaction-scoped advisory
 * lock so the balance-after computation cannot race a concurrent write.
 * Rejects debits that would overdraw unless allowNegative.
 */
export async function addCreditEntry(
  organizationId: number,
  input: AddEntryInput,
  actor?: { userId: number | null },
): Promise<CreditEntry> {
  if (!CREDIT_ENTRY_TYPES.includes(input.entryType)) {
    throw validationError([`entryType must be one of: ${CREDIT_ENTRY_TYPES.join(', ')}`]);
  }
  const amount = normalizeEntryAmount(input.entryType, input.amountCents);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
        input.description?.trim() || null,
        input.reference?.trim() || null,
        actor?.userId ?? null,
      ],
    );
    await client.query('COMMIT');
    return rowToEntry(res.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Debit the balance for a metered feature run, then apply auto-reload when
 * the post-debit balance qualifies. Returns the debit entry plus the reload
 * entry when one fired.
 */
export async function debitCredits(
  organizationId: number,
  amountCents: number,
  opts: { description?: string; reference?: string; actor?: { userId: number | null } } = {},
): Promise<{ debit: CreditEntry; reload: CreditEntry | null }> {
  const debit = await addCreditEntry(
    organizationId,
    { entryType: 'debit', amountCents, description: opts.description, reference: opts.reference },
    opts.actor,
  );
  const reload = await maybeAutoReload(organizationId);
  return { debit, reload };
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
      updatedBy: null,
      reason: null,
      updatedAt: null,
    };
  }
  const r = res.rows[0];
  return {
    organizationId,
    enabled: r.enabled === true,
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
 */
export async function setAutoReload(
  organizationId: number,
  settings: { enabled: boolean; thresholdCents: number; topupCents: number },
  actor: { userId: number },
  reason: string,
): Promise<AutoReloadSettings> {
  const errors = validateAutoReload(settings);
  if (errors.length) throw validationError(errors);
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

  try {
    await logAuditEvent({
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
  } catch (e) {
    // Audit-trail outage must not break the governed action it records.
    logger.error('credit_autoreload audit write failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  return saved;
}

/**
 * Apply an auto-reload when the current balance qualifies. Idempotent per
 * qualifying dip in practice: the top-up itself raises the balance above the
 * threshold, so a second call after a single dip is a no-op. Best-effort —
 * returns null (never throws) when reload is off, unqualified, or errored.
 */
export async function maybeAutoReload(organizationId: number): Promise<CreditEntry | null> {
  try {
    const settings = await getAutoReload(organizationId);
    const balance = await getCreditBalance(organizationId);
    if (!shouldAutoReload(balance, settings)) return null;
    const entry = await addCreditEntry(organizationId, {
      entryType: 'auto_reload',
      amountCents: settings.topupCents,
      description: `Auto-reload: balance ${balance}¢ <= threshold ${settings.thresholdCents}¢`,
    });
    logger.info('auto-reload applied', {
      organizationId,
      topupCents: settings.topupCents,
      balanceAfter: entry.balanceAfterCents,
    });
    return entry;
  } catch (err) {
    logger.error('maybeAutoReload failed', {
      organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
