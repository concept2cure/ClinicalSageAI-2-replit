/**
 * Business Center rate cards — owner-managed cost rates and tier pricing.
 *
 * A sub-router mounted by ../business-center.ts AFTER its auth + requireBusinessAdmin
 * gate, so it does NOT re-apply auth here. Edits are governed (reason-for-change)
 * and written to the 21 CFR Part 11 audit chain via auditService.
 */

import { Router, Request, Response } from 'express';
import { query } from '../../../db';
import { createScopedLogger } from '../../../utils/logger';
import auditService from '../../../services/auditService';
import { DEFAULT_COST_RATES, DEFAULT_TIER_PRICES } from './cost-model';

const logger = createScopedLogger('admin-business-rate-cards');
const router = Router();

// ─── Rate cards — cost rates ─────────────────────────────────────────────────

router.get('/cost-rates', async (_req: Request, res: Response) => {
  try {
    const res2 = await query(
      'SELECT cost_key, label, unit_cost_cents, unit, updated_at FROM platform_cost_rates'
    );
    const overrides = new Map(
      (res2.rows as Array<{ cost_key: string }>).map(r => [r.cost_key, r])
    );
    const merged = Object.entries(DEFAULT_COST_RATES).map(([costKey, d]) => {
      const o = overrides.get(costKey) as
        | { label: string | null; unit_cost_cents: number; unit: string; updated_at: string }
        | undefined;
      return {
        costKey,
        label: o?.label ?? d.label,
        unitCostCents: o?.unit_cost_cents ?? d.unitCostCents,
        unit: o?.unit ?? d.unit,
        source: o ? 'override' : 'default',
        updatedAt: o?.updated_at ?? null,
      };
    });
    // Include any custom keys the owner added that aren't in the defaults.
    for (const row of res2.rows as Array<{
      cost_key: string;
      label: string | null;
      unit_cost_cents: number;
      unit: string;
      updated_at: string;
    }>) {
      if (!DEFAULT_COST_RATES[row.cost_key]) {
        merged.push({
          costKey: row.cost_key,
          label: row.label ?? row.cost_key,
          unitCostCents: row.unit_cost_cents,
          unit: row.unit,
          source: 'override',
          updatedAt: row.updated_at,
        });
      }
    }
    return res.json({ rates: merged });
  } catch (err) {
    logger.error('Cost-rate list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load cost rates.' });
  }
});

router.patch('/cost-rates/:costKey', async (req: Request, res: Response) => {
  try {
    const costKey = String(req.params.costKey || '').trim();
    if (!costKey) return res.status(400).json({ error: 'costKey is required.' });
    const body = req.body as { unitCostCents?: unknown; label?: unknown; unit?: unknown; reason?: unknown };
    const unitCostCents = Number(body.unitCostCents);
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) {
      return res.status(400).json({ error: 'unitCostCents must be a non-negative number.' });
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const label = typeof body.label === 'string' ? body.label.slice(0, 200) : null;
    const unit = typeof body.unit === 'string' ? body.unit.slice(0, 40) : 'credit';
    const actor = req.userEmail ?? null;

    const result = await query(
      `INSERT INTO platform_cost_rates (cost_key, label, unit_cost_cents, unit, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (cost_key) DO UPDATE
         SET unit_cost_cents = EXCLUDED.unit_cost_cents,
             label = COALESCE(EXCLUDED.label, platform_cost_rates.label),
             unit = EXCLUDED.unit,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING cost_key, label, unit_cost_cents, unit, updated_at`,
      [costKey, label, Math.trunc(unitCostCents), unit, actor]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'platform_cost_rate',
      resourceId: costKey,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        businessCenterAction: 'cost_rate.update',
        unitCostCents: Math.trunc(unitCostCents),
        reason: body.reason.trim(),
      },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Cost-rate update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update cost rate.' });
  }
});

// ─── Rate cards — tier pricing ───────────────────────────────────────────────

router.get('/tier-pricing', async (_req: Request, res: Response) => {
  try {
    const res2 = await query(
      'SELECT tier, monthly_price_cents, per_seat_cents, updated_at FROM tier_pricing'
    );
    const overrides = new Map((res2.rows as Array<{ tier: string }>).map(r => [r.tier, r]));
    const tiers = Object.entries(DEFAULT_TIER_PRICES).map(([tier, d]) => {
      const o = overrides.get(tier) as
        | { monthly_price_cents: number; per_seat_cents: number; updated_at: string }
        | undefined;
      return {
        tier,
        monthlyPriceCents: o?.monthly_price_cents ?? d.monthlyPriceCents,
        perSeatCents: o?.per_seat_cents ?? d.perSeatCents,
        source: o ? 'override' : 'default',
        updatedAt: o?.updated_at ?? null,
      };
    });
    return res.json({ tiers });
  } catch (err) {
    logger.error('Tier-pricing list failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to load tier pricing.' });
  }
});

router.patch('/tier-pricing/:tier', async (req: Request, res: Response) => {
  try {
    const tier = String(req.params.tier || '').trim().toLowerCase();
    if (!DEFAULT_TIER_PRICES[tier]) {
      return res.status(404).json({
        error: `Unknown tier. Expected one of: ${Object.keys(DEFAULT_TIER_PRICES).join(', ')}`,
      });
    }
    const body = req.body as { monthlyPriceCents?: unknown; perSeatCents?: unknown; reason?: unknown };
    const monthly = Number(body.monthlyPriceCents);
    const perSeat = body.perSeatCents == null ? 0 : Number(body.perSeatCents);
    if (!Number.isFinite(monthly) || monthly < 0 || !Number.isFinite(perSeat) || perSeat < 0) {
      return res.status(400).json({ error: 'monthlyPriceCents and perSeatCents must be non-negative numbers.' });
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason (min 3 chars) is required for this action.' });
    }
    const actor = req.userEmail ?? null;
    const result = await query(
      `INSERT INTO tier_pricing (tier, monthly_price_cents, per_seat_cents, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tier) DO UPDATE
         SET monthly_price_cents = EXCLUDED.monthly_price_cents,
             per_seat_cents = EXCLUDED.per_seat_cents,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
       RETURNING tier, monthly_price_cents, per_seat_cents, updated_at`,
      [tier, Math.trunc(monthly), Math.trunc(perSeat), actor]
    );

    await auditService.logAction({
      tenantId: 0,
      userId: req.userId,
      action: 'data_modify',
      resourceType: 'tier_pricing',
      resourceId: tier,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: {
        businessCenterAction: 'tier_pricing.update',
        monthlyPriceCents: Math.trunc(monthly),
        perSeatCents: Math.trunc(perSeat),
        reason: body.reason.trim(),
      },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Tier-pricing update failed', err as Record<string, unknown>);
    return res.status(500).json({ error: 'Failed to update tier pricing.' });
  }
});

export default router;
