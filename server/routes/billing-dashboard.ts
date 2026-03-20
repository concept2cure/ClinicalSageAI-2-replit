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
import { authenticateToken } from '../middleware/auth.js';
import { getSecureOrgId } from '../utils/tenantContext.js';
import Stripe from 'stripe';

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
    console.error('[Billing Dashboard] Usage error:', error);
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
    console.error('[Billing Dashboard] Usage summary error:', error);
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
    console.error('[Billing Dashboard] Invoices error:', error);
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
    console.error('[Billing Dashboard] Budgets error:', error);
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
    console.error('[Billing Dashboard] Update budget error:', error);
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
    console.error('[Billing Dashboard] Alerts history error:', error);
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

    const alertId = parseInt(req.params.id, 10);
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
    console.error('[Billing Dashboard] Acknowledge alert error:', error);
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
    console.error('[Billing Dashboard] Rate limits error:', error);
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
      const eventsResult = await pool.query(
        `SELECT id, event_type, data, created_at
         FROM stripe_events
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [stripeCustomerId, limit],
      );
      stripeEvents = eventsResult.rows.map((r: any) => ({
        id: `stripe_${r.id}`,
        type: r.event_type,
        source: 'stripe',
        message: formatStripeEventMessage(r.event_type, r.data),
        timestamp: r.created_at,
        data: r.data,
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
    console.error('[Billing Dashboard] Activity error:', error);
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

export default router;
