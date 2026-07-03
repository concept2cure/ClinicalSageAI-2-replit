/**
 * @fileoverview Billing Dashboard API Routes
 * @module server/routes/billing-dashboard
 * @version 1.0.0
 *
 * @description
 * REST API for the billing dashboard: usage tracking, budget management,
 * invoice listing, alert system, rate limits, and activity feed.
 * Complements the core billing routes (checkout, portal, status, pricing,
 * webhooks) in billing.ts. Modeled after Anthropic/Claude's billing dashboard.
 *
 * Endpoints:
 * GET  /usage              — Get usage data (date range, granularity)
 * GET  /usage/summary      — Get usage summary for current billing period
 * GET  /invoices           — List invoices from Stripe
 * GET  /budgets            — Get current budget settings
 * POST /budgets            — Update budget settings
 * GET  /alerts/history     — Get alert history
 * POST /alerts/:id/acknowledge — Acknowledge a billing alert
 * GET  /rate-limits        — Get rate limits for current plan
 * GET  /activity           — Get recent billing activity
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getSecureOrgId } from '../utils/tenantContext.js';
import {
  WEEKLY_METRICS,
  type WeeklyMetric,
  listLimits,
  setWeeklyLimit,
  getWeeklyMonitor,
  getOverageLedger,
} from '../services/weekly-usage-limits.js';
import { checkSeatAvailability, setSeatsPurchased, isSeatEnforcementOn } from '../services/seat-licensing.js';
import { getUsageLimitsSnapshot, getWeeklyUsageByModel } from '../services/usage-windows.js';
import {
  getCreditBalance,
  getCreditLedger,
  getAutoReload,
  setAutoReload,
  addCreditEntry,
} from '../services/credit-ledger.js';
import { resolveCapabilities } from '../services/entitlements/resolver.js';
import { requirePlatformAdmin } from '../middleware/requirePlatformAdmin.js';
import Stripe from 'stripe';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('billing-dashboard');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = getSecureOrgId(req as any);
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (!key) throw new Error('Stripe secret key not configured');
    _stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
  }
  return _stripe;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /usage — Get usage data for the billing dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/usage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const {
      startDate,
      endDate,
      granularity = 'daily',
    } = req.query as { startDate?: string; endDate?: string; granularity?: string };

    if (!['daily', 'weekly', 'monthly'].includes(granularity)) {
      return res.status(400).json({ error: 'granularity must be "daily", "weekly", or "monthly"' });
    }

    // Determine the date_trunc interval for SQL grouping
    const truncInterval = granularity === 'daily' ? 'day'
      : granularity === 'weekly' ? 'week'
      : 'month';

    // Default to current month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const start = startDate || defaultStart;
    const end = endDate || defaultEnd;

    const result = await pool.query(
      `SELECT
         date_trunc($1, created_at)::date AS date,
         module,
         COUNT(*)::int AS requests,
         COALESCE(SUM(tokens_used), 0)::bigint AS tokens_used,
         COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM api_usage_logs
       WHERE organization_id = $2
         AND created_at >= $3::date
         AND created_at < ($4::date + interval '1 day')
       GROUP BY date_trunc($1, created_at)::date, module
       ORDER BY date ASC, module ASC`,
      [truncInterval, orgId, start, end],
    );

    // Compute totals
    const totals = result.rows.reduce(
      (acc: { totalRequests: number; totalTokens: number; totalCost: number }, row: any) => {
        acc.totalRequests += Number(row.requests);
        acc.totalTokens += Number(row.tokens_used);
        acc.totalCost += Number(row.cost_cents) / 100;
        return acc;
      },
      { totalRequests: 0, totalTokens: 0, totalCost: 0 },
    );

    res.json({
      usage: result.rows.map((r: any) => ({
        date: r.date,
        module: r.module,
        requests: Number(r.requests),
        tokensUsed: Number(r.tokens_used),
        cost: Number(r.cost_cents) / 100,
      })),
      totals,
      granularity,
      startDate: start,
      endDate: end,
    });
  } catch (error) {
    logger.error('Usage error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch usage data';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /usage/summary — Get usage summary for current billing period
// ─────────────────────────────────────────────────────────────────────────────
router.get('/usage/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Determine billing period start (first of current month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // Total usage, per-module usage, and budget info are independent — run in parallel
    const [totalResult, moduleResult, budgetResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_requests,
           COALESCE(SUM(tokens_used), 0)::bigint AS total_tokens,
           COALESCE(SUM(cost_cents), 0) AS total_cost_cents
         FROM api_usage_logs
         WHERE organization_id = $1
           AND created_at >= $2::date`,
        [orgId, periodStart],
      ),
      pool.query(
        `SELECT
           module,
           COUNT(*)::int AS requests,
           COALESCE(SUM(tokens_used), 0)::bigint AS tokens_used,
           COALESCE(SUM(cost_cents), 0) AS cost_cents
         FROM api_usage_logs
         WHERE organization_id = $1
           AND created_at >= $2::date
         GROUP BY module
         ORDER BY cost_cents DESC`,
        [orgId, periodStart],
      ),
      pool.query(
        `SELECT monthly_budget_cents FROM billing_budgets WHERE organization_id = $1 LIMIT 1`,
        [orgId],
      ),
    ]);

    const totalRow = totalResult.rows[0] || { total_requests: 0, total_tokens: 0, total_cost_cents: 0 };
    const totalCost = Number(totalRow.total_cost_cents) / 100;
    const monthlyBudget = budgetResult.rows[0]?.monthly_budget_cents != null
      ? Number(budgetResult.rows[0].monthly_budget_cents) / 100
      : null;

    const byModule: Record<string, { requests: number; tokensUsed: number; cost: number }> = {};
    for (const row of moduleResult.rows) {
      byModule[row.module] = {
        requests: Number(row.requests),
        tokensUsed: Number(row.tokens_used),
        cost: Number(row.cost_cents) / 100,
      };
    }

    res.json({
      totalCost,
      totalRequests: Number(totalRow.total_requests),
      totalTokens: Number(totalRow.total_tokens),
      byModule,
      creditsRemaining: monthlyBudget != null ? Math.max(0, monthlyBudget - totalCost) : null,
      budgetUsedPct: monthlyBudget != null && monthlyBudget > 0
        ? Math.round((totalCost / monthlyBudget) * 10000) / 100
        : null,
      periodStart,
    });
  } catch (error) {
    logger.error('Usage summary error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch usage summary';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /invoices — List invoices from Stripe
// ─────────────────────────────────────────────────────────────────────────────
router.get('/invoices', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    // Look up the Stripe customer ID for this org
    const orgResult = await pool.query(
      `SELECT stripe_customer_id FROM organizations WHERE id = $1`,
      [orgId],
    );

    const stripeCustomerId = orgResult.rows[0]?.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.json({ invoices: [], hasMore: false, total: 0 });
    }

    const stripe = getStripe();

    // Stripe uses cursor-based pagination; for simplicity we use starting_after
    // For page 1, no cursor. For subsequent pages, caller can pass `startingAfter`.
    const listParams: Stripe.InvoiceListParams = {
      customer: stripeCustomerId,
      limit,
    };

    const startingAfter = req.query.startingAfter as string | undefined;
    if (startingAfter) {
      listParams.starting_after = startingAfter;
    }

    const stripeInvoices = await stripe.invoices.list(listParams);

    const invoices = stripeInvoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      amount: (inv.amount_due || 0) / 100,
      amountPaid: (inv.amount_paid || 0) / 100,
      status: inv.status,
      pdfUrl: inv.invoice_pdf || null,
      hostedUrl: inv.hosted_invoice_url || null,
      currency: inv.currency,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
    }));

    res.json({
      invoices,
      hasMore: stripeInvoices.has_more,
      total: stripeInvoices.data.length,
    });
  } catch (error) {
    logger.error('Invoices error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch invoices';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /budgets — Get current budget settings
// ─────────────────────────────────────────────────────────────────────────────
router.get('/budgets', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Get current month spend
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // Budget settings and current spend are independent — run in parallel
    const [budgetResult, spendResult] = await Promise.all([
      pool.query(
        `SELECT monthly_budget_cents, hard_limit_enabled, alert_thresholds
         FROM billing_budgets
         WHERE organization_id = $1
         LIMIT 1`,
        [orgId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(cost_cents), 0) AS current_spend_cents
         FROM api_usage_logs
         WHERE organization_id = $1
           AND created_at >= $2::date`,
        [orgId, periodStart],
      ),
    ]);

    const currentSpend = Number(spendResult.rows[0]?.current_spend_cents || 0) / 100;

    if (budgetResult.rows.length === 0) {
      return res.json({
        monthlyBudget: null,
        hardLimitEnabled: false,
        alerts: [],
        currentSpend,
        budgetUsedPct: null,
      });
    }

    const row = budgetResult.rows[0];
    const monthlyBudget = row.monthly_budget_cents != null ? Number(row.monthly_budget_cents) / 100 : null;

    res.json({
      monthlyBudget,
      hardLimitEnabled: row.hard_limit_enabled || false,
      alerts: row.alert_thresholds || [],
      currentSpend,
      budgetUsedPct: monthlyBudget != null && monthlyBudget > 0
        ? Math.round((currentSpend / monthlyBudget) * 10000) / 100
        : null,
    });
  } catch (error) {
    logger.error('Budgets error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch budget settings';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /budgets — Update budget settings
// ─────────────────────────────────────────────────────────────────────────────
router.post('/budgets', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { monthlyBudget, hardLimitEnabled, alerts } = req.body;

    if (monthlyBudget !== undefined && monthlyBudget !== null) {
      if (typeof monthlyBudget !== 'number' || monthlyBudget < 0) {
        return res.status(400).json({ error: 'monthlyBudget must be a non-negative number' });
      }
    }

    if (alerts !== undefined && !Array.isArray(alerts)) {
      return res.status(400).json({ error: 'alerts must be an array' });
    }

    // Validate alert thresholds
    if (alerts) {
      for (const alert of alerts) {
        if (typeof alert.threshold !== 'number' || alert.threshold < 0 || alert.threshold > 100) {
          return res.status(400).json({ error: 'Each alert threshold must be a number between 0 and 100' });
        }
      }
    }

    // Convert dollar amount from client to cents for storage
    const budgetCents = (monthlyBudget !== undefined && monthlyBudget !== null)
      ? Math.round(monthlyBudget * 100)
      : null;

    const result = await pool.query(
      `INSERT INTO billing_budgets (organization_id, monthly_budget_cents, hard_limit_enabled, alert_thresholds, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET
         monthly_budget_cents = COALESCE($2, billing_budgets.monthly_budget_cents),
         hard_limit_enabled = COALESCE($3, billing_budgets.hard_limit_enabled),
         alert_thresholds = COALESCE($4, billing_budgets.alert_thresholds),
         updated_at = NOW()
       RETURNING monthly_budget_cents, hard_limit_enabled, alert_thresholds`,
      [
        orgId,
        budgetCents,
        hardLimitEnabled ?? false,
        alerts ? JSON.stringify(alerts) : null,
      ],
    );

    const row = result.rows[0];

    res.json({
      monthlyBudget: row.monthly_budget_cents != null ? Number(row.monthly_budget_cents) / 100 : null,
      hardLimitEnabled: row.hard_limit_enabled || false,
      alerts: row.alert_thresholds || [],
    });
  } catch (error) {
    logger.error('Update budget error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to update budget settings';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /alerts/history — Get alert history
// ─────────────────────────────────────────────────────────────────────────────
router.get('/alerts/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM billing_alerts WHERE organization_id = $1`,
      [orgId],
    );

    const result = await pool.query(
      `SELECT id, type, threshold, message, sent_at, acknowledged
       FROM billing_alerts
       WHERE organization_id = $1
       ORDER BY sent_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset],
    );

    const total = countResult.rows[0]?.total || 0;

    res.json({
      alerts: result.rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        threshold: r.threshold ? Number(r.threshold) : null,
        message: r.message,
        sentAt: r.sent_at,
        acknowledged: r.acknowledged || false,
      })),
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    logger.error('Alerts history error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch alert history';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /alerts/:id/acknowledge — Acknowledge a billing alert
// ─────────────────────────────────────────────────────────────────────────────
router.post('/alerts/:id/acknowledge', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const alertId = parseInt(String(req.params.id), 10);
    if (isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const result = await pool.query(
      `UPDATE billing_alerts
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, type, threshold, message, sent_at, acknowledged, acknowledged_at`,
      [alertId, orgId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const r = result.rows[0];
    res.json({
      id: r.id,
      type: r.type,
      threshold: r.threshold ? Number(r.threshold) : null,
      message: r.message,
      sentAt: r.sent_at,
      acknowledged: r.acknowledged,
      acknowledgedAt: r.acknowledged_at,
    });
  } catch (error) {
    logger.error('Acknowledge alert error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to acknowledge alert';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /rate-limits — Get rate limits for current plan
// ─────────────────────────────────────────────────────────────────────────────

// Rate limit definitions per tier
const RATE_LIMITS: Record<string, {
  requestsPerMinute: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  modules: Record<string, { requestsPerMinute: number; requestsPerDay: number }>;
}> = {
  free: {
    requestsPerMinute: 10,
    requestsPerDay: 100,
    tokensPerMinute: 10_000,
    tokensPerDay: 100_000,
    modules: {
      'ind-wizard': { requestsPerMinute: 5, requestsPerDay: 20 },
      'csr-intelligence': { requestsPerMinute: 5, requestsPerDay: 30 },
      'cer-generator': { requestsPerMinute: 3, requestsPerDay: 10 },
      'vault': { requestsPerMinute: 10, requestsPerDay: 100 },
    },
  },
  standard: {
    requestsPerMinute: 60,
    requestsPerDay: 5_000,
    tokensPerMinute: 100_000,
    tokensPerDay: 1_000_000,
    modules: {
      'ind-wizard': { requestsPerMinute: 20, requestsPerDay: 500 },
      'csr-intelligence': { requestsPerMinute: 30, requestsPerDay: 1_000 },
      'cer-generator': { requestsPerMinute: 15, requestsPerDay: 200 },
      'vault': { requestsPerMinute: 60, requestsPerDay: 5_000 },
    },
  },
  professional: {
    requestsPerMinute: 120,
    requestsPerDay: 20_000,
    tokensPerMinute: 500_000,
    tokensPerDay: 5_000_000,
    modules: {
      'ind-wizard': { requestsPerMinute: 60, requestsPerDay: 2_000 },
      'csr-intelligence': { requestsPerMinute: 60, requestsPerDay: 5_000 },
      'cer-generator': { requestsPerMinute: 40, requestsPerDay: 1_000 },
      'vault': { requestsPerMinute: 120, requestsPerDay: 20_000 },
    },
  },
  enterprise: {
    requestsPerMinute: 500,
    requestsPerDay: 100_000,
    tokensPerMinute: 2_000_000,
    tokensPerDay: 20_000_000,
    modules: {
      'ind-wizard': { requestsPerMinute: 200, requestsPerDay: 10_000 },
      'csr-intelligence': { requestsPerMinute: 200, requestsPerDay: 20_000 },
      'cer-generator': { requestsPerMinute: 100, requestsPerDay: 5_000 },
      'vault': { requestsPerMinute: 500, requestsPerDay: 100_000 },
    },
  },
};

router.get('/rate-limits', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Look up the org's tier
    const orgResult = await pool.query(
      `SELECT tier FROM organizations WHERE id = $1`,
      [orgId],
    );

    const tier = orgResult.rows[0]?.tier || 'standard';
    const limits = RATE_LIMITS[tier] || RATE_LIMITS.standard;

    res.json({
      tier,
      limits,
    });
  } catch (error) {
    logger.error('Rate limits error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch rate limits';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /activity — Get recent billing activity
// ─────────────────────────────────────────────────────────────────────────────
router.get('/activity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    // Look up the Stripe customer ID for this org
    const orgResult = await pool.query(
      `SELECT stripe_customer_id FROM organizations WHERE id = $1`,
      [orgId],
    );
    const stripeCustomerId = orgResult.rows[0]?.stripe_customer_id;

    // Fetch recent Stripe events for this org
    let stripeEvents: any[] = [];
    if (stripeCustomerId) {
      // Tenant-scoped by organization_id (the real tenant key on stripe_events).
      // The previous query filtered `WHERE customer_id = $1` and selected `data`,
      // neither of which exist on stripe_events — it was both unscoped and a
      // latent runtime bug. The actual columns are organization_id + payload.
      const eventsResult = await pool.query(
        `SELECT id, event_type, payload, created_at
         FROM stripe_events
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [orgId, limit],
      );
      stripeEvents = eventsResult.rows.map((r: any) => ({
        id: `stripe_${r.id}`,
        type: r.event_type,
        source: 'stripe',
        message: formatStripeEventMessage(r.event_type, r.payload),
        timestamp: r.created_at,
        data: r.payload,
      }));
    }

    // Fetch recent billing alerts
    const alertsResult = await pool.query(
      `SELECT id, type, message, sent_at
       FROM billing_alerts
       WHERE organization_id = $1
       ORDER BY sent_at DESC
       LIMIT $2`,
      [orgId, limit],
    );

    const alertEvents = alertsResult.rows.map((r: any) => ({
      id: `alert_${r.id}`,
      type: r.type,
      source: 'alert',
      message: r.message,
      timestamp: r.sent_at,
    }));

    // Merge and sort by timestamp descending
    const activity = [...stripeEvents, ...alertEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    res.json({ activity });
  } catch (error) {
    logger.error('Activity error', { err: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : 'Failed to fetch billing activity';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Format Stripe event type into a human-readable message
// ─────────────────────────────────────────────────────────────────────────────
function formatStripeEventMessage(eventType: string, _data?: any): string {
  const messages: Record<string, string> = {
    'invoice.paid': 'Invoice payment received',
    'invoice.payment_failed': 'Invoice payment failed',
    'invoice.created': 'New invoice created',
    'invoice.finalized': 'Invoice finalized',
    'customer.subscription.created': 'Subscription created',
    'customer.subscription.updated': 'Subscription updated',
    'customer.subscription.deleted': 'Subscription canceled',
    'customer.subscription.trial_will_end': 'Trial period ending soon',
    'payment_intent.succeeded': 'Payment successful',
    'payment_intent.payment_failed': 'Payment failed',
    'charge.succeeded': 'Charge successful',
    'charge.failed': 'Charge failed',
    'charge.refunded': 'Charge refunded',
  };

  return messages[eventType] || `Billing event: ${eventType.replace(/\./g, ' ')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly usage limits & overage caps (Anthropic-style usage controls)
// ─────────────────────────────────────────────────────────────────────────────

function getUserId(req: Request): number | null {
  const raw = (req as any).userId ?? req.user?.id;
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// GET /weekly-limits — configured weekly limits + a live monitoring snapshot.
router.get('/weekly-limits', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const [limits, monitor] = await Promise.all([listLimits(orgId), getWeeklyMonitor(orgId)]);
    res.json({ metrics: WEEKLY_METRICS, limits, monitor });
  } catch (error) {
    logger.error('Get weekly limits error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load weekly usage limits' });
  }
});

// GET /weekly-usage — live monitoring snapshot only (used vs limit/cap per metric).
router.get('/weekly-usage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    res.json({ monitor: await getWeeklyMonitor(orgId) });
  } catch (error) {
    logger.error('Get weekly usage error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load weekly usage' });
  }
});

// GET /seats — seat-license utilization (purchased vs active members + pending).
router.get('/seats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const seats = await checkSeatAvailability(orgId, 0);
    res.json({ seats, enforcement: isSeatEnforcementOn() ? 'enforce' : 'report-only' });
  } catch (error) {
    logger.error('Get seats error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load seat usage' });
  }
});

// PUT /seats — set purchased seats. GOVERNED: admin/owner only, reason required, audited.
router.put('/seats', authenticateToken, requireRole('admin', 'owner'), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'User context required' });

    const { seats, reason } = req.body ?? {};
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'A reason-for-change is required to change purchased seats' });
    }
    const decision = await setSeatsPurchased(orgId, Number(seats), { userId }, reason);
    res.json({ seats: decision });
  } catch (error) {
    const validation = (error as any)?.validation;
    if (Array.isArray(validation)) return res.status(400).json({ error: (error as Error).message, validation });
    if ((error as any)?.conflict) return res.status(409).json({ error: (error as Error).message });
    logger.error('Set seats error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to set purchased seats' });
  }
});

// GET /weekly-overage — accrued billable overage for the current weekly window.
router.get('/weekly-overage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    res.json({ overage: await getOverageLedger(orgId) });
  } catch (error) {
    logger.error('Get weekly overage error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load weekly overage' });
  }
});

// PUT /weekly-limits/:metric — set/raise a weekly limit + overage cap.
// GOVERNED: org admins only, reason-for-change required, audited (21 CFR Part 11).
router.put('/weekly-limits/:metric', authenticateToken, requireRole('admin', 'owner'), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'User context required' });

    const metric = req.params.metric as WeeklyMetric;
    if (!WEEKLY_METRICS.includes(metric)) {
      return res.status(400).json({ error: `metric must be one of: ${WEEKLY_METRICS.join(', ')}` });
    }

    const { weeklyLimit, overageCapPct, overageHardCap, warnThresholdPct, weekStartDow, enabled, reason } = req.body ?? {};
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'A reason-for-change is required to set a weekly usage limit' });
    }

    const saved = await setWeeklyLimit(
      orgId,
      {
        metric,
        weeklyLimit: Number(weeklyLimit),
        overageCapPct: overageCapPct == null ? 0 : Number(overageCapPct),
        overageHardCap: overageHardCap == null ? null : Number(overageHardCap),
        warnThresholdPct: warnThresholdPct == null ? 80 : Number(warnThresholdPct),
        weekStartDow: weekStartDow == null ? 1 : Number(weekStartDow),
        enabled: enabled == null ? true : Boolean(enabled),
      },
      { userId },
      reason,
    );
    res.json({ limit: saved });
  } catch (error) {
    const validation = (error as any)?.validation;
    if (Array.isArray(validation)) {
      return res.status(400).json({ error: (error as Error).message, validation });
    }
    logger.error('Set weekly limit error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to set weekly usage limit' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan usage windows (Anthropic-style session + weekly per-model buckets)
// ─────────────────────────────────────────────────────────────────────────────

// GET /usage/limits — the "Plan usage limits" snapshot: current session window
// (% used, resets at) + weekly "All models" and premium buckets.
router.get('/usage/limits', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    res.json(await getUsageLimitsSnapshot(orgId));
  } catch (error) {
    logger.error('Get usage limits error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load plan usage limits' });
  }
});

// GET /usage/by-model — weekly per-model drill-down beneath the bucket bars.
router.get('/usage/by-model', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    res.json({ models: await getWeeklyUsageByModel(orgId) });
  } catch (error) {
    logger.error('Get usage by model error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load per-model usage' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Credit balance + auto-reload (Anthropic-style billing page)
// ─────────────────────────────────────────────────────────────────────────────

// GET /credits — current balance, recent ledger, auto-reload settings.
router.get('/credits', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const [balanceCents, ledger, autoReload] = await Promise.all([
      getCreditBalance(orgId),
      getCreditLedger(orgId, 50),
      getAutoReload(orgId),
    ]);
    res.json({ balanceCents, ledger, autoReload });
  } catch (error) {
    logger.error('Get credits error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to load credit balance' });
  }
});

// PUT /credits/auto-reload — set the "top off to $X when balance is $Y" rule.
// GOVERNED: org admins only, reason-for-change required, audited (Part 11).
router.put('/credits/auto-reload', authenticateToken, requireRole('admin', 'owner'), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'User context required' });

    const { enabled, thresholdCents, topupCents, reason } = req.body ?? {};
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'A reason-for-change is required to change auto-reload settings' });
    }
    const saved = await setAutoReload(
      orgId,
      { enabled: Boolean(enabled), thresholdCents: Number(thresholdCents), topupCents: Number(topupCents) },
      { userId },
      reason,
    );
    res.json({ autoReload: saved });
  } catch (error) {
    const validation = (error as any)?.validation;
    if (Array.isArray(validation)) return res.status(400).json({ error: (error as Error).message, validation });
    logger.error('Set auto-reload error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to set auto-reload' });
  }
});

// POST /credits/adjust — grant / adjust an org's credit balance. PLATFORM
// ADMIN ONLY: ledger credits move money-equivalent value, so tenants cannot
// self-issue them; payment-backed purchases wire through Stripe checkout
// separately. Audited via the ledger row (created_by) + description.
router.post('/credits/adjust', authenticateToken, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { organizationId, entryType, amountCents, description, reference } = req.body ?? {};
    const targetOrg = Number(organizationId);
    if (!Number.isInteger(targetOrg) || targetOrg <= 0) {
      return res.status(400).json({ error: 'organizationId must be a positive integer' });
    }
    if (entryType !== 'grant' && entryType !== 'adjustment') {
      return res.status(400).json({ error: "entryType must be 'grant' or 'adjustment'" });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'A description (reason) is required for a credit adjustment' });
    }
    const entry = await addCreditEntry(
      targetOrg,
      { entryType, amountCents: Number(amountCents), description, reference, allowNegative: entryType === 'adjustment' },
      { userId },
    );
    res.json({ entry });
  } catch (error) {
    const validation = (error as any)?.validation;
    if (Array.isArray(validation)) return res.status(400).json({ error: (error as Error).message, validation });
    logger.error('Credit adjust error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to adjust credits' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities (unified entitlement view)
// ─────────────────────────────────────────────────────────────────────────────

// GET /capabilities — effective capabilities: tier matrix ⊕ toggle grants,
// module subscriptions, and the org-relevant flags (the settings page shape).
router.get('/capabilities', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });
    res.json(await resolveCapabilities(orgId));
  } catch (error) {
    logger.error('Get capabilities error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to resolve capabilities' });
  }
});

export default router;
