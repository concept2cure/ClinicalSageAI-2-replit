/**
 * Stripe invoiced-revenue loader for the Business Center cost accounting.
 *
 * The Business Center models revenue from a per-tier price card. The owner
 * wants ACTUAL invoiced revenue from Stripe where we have it, falling back to
 * the modeled rate card where we don't. This module provides the actual side:
 * for each organization that carries a stripe_customer_id, it sums the
 * `amount_paid` of paid invoices in a trailing window.
 *
 * Design constraints:
 *   - Platform-admin tooling. We never read an org / tenant id from request
 *     input; the caller (business-center.ts) is already gated by
 *     requireBusinessAdmin and we enumerate orgs directly from the DB.
 *   - MUST be defensive: cost accounting must never break because Stripe is
 *     down, slow, or misconfigured. Every customer call is wrapped in
 *     try/catch (log + skip), and any top-level failure returns whatever was
 *     collected so far (possibly empty) rather than throwing.
 *   - If no Stripe key is configured, return an empty Map so the caller falls
 *     back cleanly to modeled revenue.
 */

import Stripe from 'stripe';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('stripe-revenue');

/** True if a Stripe secret key is present in the environment. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY);
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
  // Caller guards with stripeConfigured(); this throw is a belt-and-braces.
  if (!key) throw new Error('Stripe secret key not configured.');
  return new Stripe(key, { apiVersion: '2023-10-16' as any });
}

/**
 * Returns a map of organizationId → invoiced revenue (cents) over the trailing
 * `periodDays` window, summed from paid Stripe invoices.
 *
 * Organizations with no stripe_customer_id (or no paid invoices) are simply
 * absent from the map — the caller treats absence as "no Stripe data, use the
 * modeled rate card".
 *
 * NOTE (v1): we list up to 100 invoices per customer and do not deep-paginate.
 * For the trailing-30-day Business Center window this is comfortably enough for
 * normal subscriptions (≈1 invoice/customer/month). If a customer routinely
 * exceeds 100 invoices in the window, follow-up pagination via
 * `starting_after` would be required.
 */
export async function getInvoicedRevenueCentsByOrg(
  periodDays: number
): Promise<Map<number, number>> {
  const revenueByOrg = new Map<number, number>();

  if (!stripeConfigured()) {
    // No Stripe — caller falls back to modeled revenue for every org.
    return revenueByOrg;
  }

  try {
    const stripe = getStripe();
    const gte = Math.floor(Date.now() / 1000) - Math.max(1, Math.trunc(periodDays)) * 86400;

    const orgsRes = await query(
      'SELECT id, stripe_customer_id FROM organizations WHERE stripe_customer_id IS NOT NULL'
    );
    const orgs = orgsRes.rows as Array<{ id: number; stripe_customer_id: string }>;

    for (const org of orgs) {
      try {
        const invoices = await stripe.invoices.list({
          customer: org.stripe_customer_id,
          created: { gte },
          status: 'paid',
          limit: 100,
        });
        const sumCents = invoices.data.reduce(
          (sum, inv) => sum + (inv.amount_paid ?? 0),
          0
        );
        // Record even a zero so the caller can distinguish "Stripe says $0
        // invoiced" from "no Stripe customer at all" (absent from the map).
        revenueByOrg.set(org.id, sumCents);
      } catch (err) {
        // One bad customer must not poison the whole report.
        logger.warn('Failed to load Stripe invoices for org; skipping', {
          organizationId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    // Top-level failure (DB read, Stripe init, etc.) — return whatever we have.
    logger.error('Stripe invoiced-revenue load failed; returning partial/empty map', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return revenueByOrg;
}
