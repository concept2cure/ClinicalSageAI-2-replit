/**
 * @fileoverview Seat licensing — purchased-seat enforcement & monitoring
 * @module server/services/seat-licensing
 *
 * Enterprise seat licensing keyed on organizations.seats_purchased (the seats a
 * customer has paid for). A seat is consumed by an ACTIVE member
 * (organization_users) or an OUTSTANDING invitation (organization_invitations,
 * status='pending') — both hold a seat so an org cannot over-invite past its
 * license. This complements the existing per-tier max_users quota
 * (atomicQuotaService): the stricter ceiling wins.
 *
 * The decision math (evaluateSeats) is PURE and unit-tested; DB wrappers are
 * thin. Changing the purchased-seat count is a governed action (admin-only,
 * reason-for-change, 21 CFR Part 11 audit) — see setSeatsPurchased.
 *
 * Enforcement posture (SEAT_LIMIT_ENFORCEMENT): 'enforce' blocks over-seat adds,
 * 'report' computes and surfaces the decision without blocking. Unset defaults to
 * ENFORCE in production and report-only elsewhere — see isSeatEnforcementOn for
 * why the production default is no longer report-only.
 */

import { pool } from '../db.js';
import { logAuditEvent } from './audit/auditLogger.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('seat-licensing');

export type SeatState = 'unlimited' | 'ok' | 'full' | 'over';

export interface SeatUsage {
  seatsPurchased: number; // 0 / null in DB ⇒ treated as unlimited
  seatsUsed: number; // active members
  seatsPending: number; // outstanding invitations
  seatsConsumed: number; // used + pending
}

export interface SeatDecision extends SeatUsage {
  state: SeatState;
  /** Seats still available against the license (0 when full/over/limited). */
  available: number;
  /** seatsConsumed after adding the requested seats. */
  projected: number;
  /** Whether adding the requested seats is permitted by the license. */
  allowed: boolean;
  /** Utilization as a percentage of purchased seats (0 when unlimited). */
  utilizationPct: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE CORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decide whether `adding` seats fit within the license. Pure. A non-positive
 * `seatsPurchased` means unlimited (unenforced) and always permits.
 */
export function evaluateSeats(args: { seatsPurchased: number; seatsUsed: number; seatsPending: number; adding: number }): SeatDecision {
  const seatsPurchased = Math.max(0, Math.floor(args.seatsPurchased || 0));
  const seatsUsed = Math.max(0, Math.floor(args.seatsUsed || 0));
  const seatsPending = Math.max(0, Math.floor(args.seatsPending || 0));
  const adding = Math.max(0, Math.floor(args.adding || 0));
  const seatsConsumed = seatsUsed + seatsPending;
  const projected = seatsConsumed + adding;

  const usage: SeatUsage = { seatsPurchased, seatsUsed, seatsPending, seatsConsumed };

  if (seatsPurchased <= 0) {
    return { ...usage, state: 'unlimited', available: Infinity, projected, allowed: true, utilizationPct: 0 };
  }

  const available = Math.max(0, seatsPurchased - seatsConsumed);
  const allowed = projected <= seatsPurchased;
  const state: SeatState =
    seatsConsumed > seatsPurchased ? 'over' : seatsConsumed >= seatsPurchased ? 'full' : 'ok';

  return {
    ...usage,
    state,
    available,
    projected,
    allowed,
    utilizationPct: Math.round((seatsConsumed / seatsPurchased) * 100),
  };
}

/**
 * Whether seat over-allocation should actually BLOCK (vs report-only).
 *
 * ── Why the default changed ───────────────────────────────────────────────────
 * This used to be `=== 'enforce'`, i.e. OFF unless an operator opted in — and no
 * deployment manifest in the repository set the variable, so the control shipped
 * inert. That is the same shape of defect the RLS rollout spent months closing
 * (`db/rlsEnforcement.ts`): a control that is built, tested, documented, and
 * switched off in every environment that matters.
 *
 * For a seat-licensed product this is not only a control gap, it is direct
 * revenue leakage: `seats_purchased` is what the customer pays for, and nothing
 * stopped an organization from adding the (N+1)th member. It also removes the
 * upsell signal — a tenant that silently runs 40 users on a 25-seat contract
 * never generates the expansion conversation.
 *
 * The posture now mirrors `readEnforcementMode`:
 *
 *   production, unset            → ENFORCE. Safe by default.
 *   production, 'report'         → report-only. An explicit, greppable decision
 *                                  for the migration window while over-seat
 *                                  tenants are reconciled with their contracts.
 *   non-production, unset        → report-only, so local and CI work is not
 *                                  gated on seeding a realistic seat count.
 *   any env, 'enforce'           → ENFORCE.
 *
 * `report` is deliberately spelled out rather than accepting any non-'enforce'
 * string: a typo must not silently disable a revenue control.
 */
export function isSeatEnforcementOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.SEAT_LIMIT_ENFORCEMENT || '').trim().toLowerCase();
  if (raw === 'enforce') return true;
  if (raw === 'report') return false;
  if (raw !== '') {
    logger.warn(
      'Unrecognized SEAT_LIMIT_ENFORCEMENT value; falling back to the environment default. ' +
        "Use 'enforce' or 'report'.",
      { value: raw }
    );
  }
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB WRAPPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Current seat usage for an org (purchased, active members, pending invites). */
export async function getSeatUsage(organizationId: number): Promise<SeatUsage> {
  const [orgRes, usedRes, pendingRes] = await Promise.all([
    pool.query(`SELECT seats_purchased FROM organizations WHERE id = $1`, [organizationId]),
    pool.query(`SELECT COUNT(*) AS cnt FROM organization_users WHERE organization_id = $1`, [organizationId]),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM organization_invitations WHERE organization_id = $1 AND status = 'pending'`,
      [organizationId],
    ),
  ]);
  const seatsPurchased = Number(orgRes.rows[0]?.seats_purchased ?? 0) || 0;
  const seatsUsed = Number(usedRes.rows[0]?.cnt ?? 0) || 0;
  const seatsPending = Number(pendingRes.rows[0]?.cnt ?? 0) || 0;
  return { seatsPurchased, seatsUsed, seatsPending, seatsConsumed: seatsUsed + seatsPending };
}

/**
 * Check whether `adding` seats fit. Fails OPEN (unlimited) on a metering error
 * so seat-counting outages never block member management.
 */
export async function checkSeatAvailability(organizationId: number, adding = 1): Promise<SeatDecision> {
  try {
    const usage = await getSeatUsage(organizationId);
    return evaluateSeats({ ...usage, adding });
  } catch (e) {
    logger.error('checkSeatAvailability failed (fail-open)', { err: e instanceof Error ? e.message : String(e) });
    return {
      seatsPurchased: 0, seatsUsed: 0, seatsPending: 0, seatsConsumed: 0,
      state: 'unlimited', available: Infinity, projected: adding, allowed: true, utilizationPct: 0,
    };
  }
}

/**
 * Set the purchased-seat count for an org. GOVERNED: validates, persists, and
 * writes a before/after audit event (21 CFR Part 11). Throws on invalid input
 * or when reducing below seats already consumed (caller maps to a 400/409).
 */
export async function setSeatsPurchased(
  organizationId: number,
  seats: number,
  actor: { userId: number },
  reason: string,
): Promise<SeatDecision> {
  if (!Number.isFinite(seats) || seats < 0 || !Number.isInteger(seats)) {
    const err = new Error('seats must be a non-negative integer');
    (err as any).validation = ['seats must be a non-negative integer'];
    throw err;
  }
  if (!reason || !reason.trim()) {
    const err = new Error('A reason-for-change is required to change purchased seats');
    (err as any).validation = ['reason is required'];
    throw err;
  }

  const before = await getSeatUsage(organizationId);
  if (seats > 0 && seats < before.seatsConsumed) {
    const err = new Error(`Cannot set seats (${seats}) below seats already consumed (${before.seatsConsumed}). Remove members or invitations first.`);
    (err as any).conflict = true;
    throw err;
  }

  await pool.query(`UPDATE organizations SET seats_purchased = $1, updated_at = NOW() WHERE id = $2`, [seats, organizationId]);
  const after = await getSeatUsage(organizationId);

  try {
    await logAuditEvent({
      category: 'compliance',
      severity: 'info',
      action: 'seats_purchased.update',
      userId: String(actor.userId),
      organizationId: String(organizationId),
      resourceType: 'organization_seats',
      resourceId: String(organizationId),
      previousValue: { seatsPurchased: before.seatsPurchased },
      newValue: { seatsPurchased: after.seatsPurchased },
      metadata: { reason: reason.trim(), seatsConsumed: after.seatsConsumed },
      success: true,
    });
  } catch (e) {
    logger.error('seats_purchased audit write failed', { err: e instanceof Error ? e.message : String(e) });
  }

  return evaluateSeats({ ...after, adding: 0 });
}
