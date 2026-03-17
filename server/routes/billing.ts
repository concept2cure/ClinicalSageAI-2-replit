/**
 * @fileoverview Billing API Routes
 * @module server/routes/billing
 * @version 1.0.0
 *
 * @description
 * REST API for Stripe billing: checkout sessions, subscription management,
 * customer portal, and webhook processing. Uses Stripe Checkout with Link
 * for frictionless payment — modeled after Anthropic/Claude's billing UX.
 *
 * Endpoints:
 * POST /checkout          — Create a Stripe Checkout Session (with Link)
 * POST /portal            — Create a Stripe Customer Portal session
 * GET  /status            — Get subscription status for current org
 * GET  /pricing           — Get pricing tiers for current org's archetype
 * POST /webhooks/stripe   — Stripe webhook endpoint (no auth required)
 */

import { Router, raw } from 'express';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  processWebhookEvent,
  PRICING,
} from '../services/billing.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /checkout — Create Stripe Checkout Session with Link
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId
      || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { tier, billingCycle, seats } = req.body;

    if (!tier || !billingCycle) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['tier', 'billingCycle'],
      });
    }

    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json({ error: 'billingCycle must be "monthly" or "annual"' });
    }

    if (!['standard', 'professional', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'tier must be "standard", "professional", or "enterprise"' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await createCheckoutSession({
      organizationId: Number(orgId),
      tier,
      billingCycle,
      seats: seats ? Number(seats) : undefined,
      successUrl: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/billing/canceled`,
    });

    res.json({
      checkoutUrl: result.url,
      sessionId: result.sessionId,
    });
  } catch (error) {
    console.error('[Billing] Checkout error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create checkout session';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /portal — Create Stripe Customer Portal session
// ─────────────────────────────────────────────────────────────────────────────
router.post('/portal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId
      || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const returnUrl = req.body.returnUrl || `${baseUrl}/settings/billing`;

    const portalUrl = await createPortalSession(Number(orgId), returnUrl);

    res.json({ portalUrl });
  } catch (error) {
    console.error('[Billing] Portal error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create portal session';
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /status — Get subscription status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId
      || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const status = await getSubscriptionStatus(Number(orgId));
    res.json(status);
  } catch (error) {
    console.error('[Billing] Status error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /pricing — Get pricing tiers for the org's archetype
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pricing', async (req: Request, res: Response) => {
  try {
    const industryMode = (req.query.industry as string) || 'virtual_biotech';
    const pricing = PRICING[industryMode] || PRICING.virtual_biotech;

    // Format for frontend display (convert cents to dollars)
    const tiers = pricing.map(p => ({
      name: p.name,
      tier: p.tier,
      baseMonthly: p.baseMonthly / 100,
      perSeatMonthly: p.perSeatMonthly / 100,
      annualDiscountPct: p.annualDiscountPct,
      maxUsers: p.maxUsers,
      maxProjects: p.maxProjects === -1 ? 'Unlimited' : p.maxProjects,
      maxStorageGB: p.maxStorageGB,
    }));

    res.json({ industryMode, tiers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/stripe — Stripe webhook endpoint
// IMPORTANT: This must use raw body parsing for signature verification.
// It should be mounted BEFORE the JSON body parser in index.ts.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhooks/stripe', raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Billing] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event: Stripe.Event;
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    const stripe = new Stripe(stripeKey!, { apiVersion: '2023-10-16' as any });
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid signature';
    console.error('[Billing] Webhook signature verification failed:', message);
    return res.status(400).json({ error: `Webhook Error: ${message}` });
  }

  try {
    await processWebhookEvent(event);
    res.json({ received: true });
  } catch (error) {
    console.error('[Billing] Webhook processing error:', error);
    // Return 200 to prevent Stripe retries for processing errors
    // The error is logged and stored in stripe_events table
    res.json({ received: true, error: 'Processing error logged' });
  }
});

export default router;
