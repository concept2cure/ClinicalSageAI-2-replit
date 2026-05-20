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
  createDTCCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  processWebhookEvent,
  PRICING,
  DTC_PRICING,
} from '../services/billing.js';
import { authenticateToken } from '../middleware/auth.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('billing');
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

    const { tier, billingCycle, seats, successUrl, cancelUrl } = req.body;

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
    const checkoutSuccessUrl =
      typeof successUrl === 'string' && successUrl.trim().length > 0
        ? successUrl
        : `${baseUrl}/concept2cure/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const checkoutCancelUrl =
      typeof cancelUrl === 'string' && cancelUrl.trim().length > 0
        ? cancelUrl
        : `${baseUrl}/concept2cure/billing?checkout=canceled`;

    const result = await createCheckoutSession({
      organizationId: Number(orgId),
      tier,
      billingCycle,
      seats: seats ? Number(seats) : undefined,
      successUrl: checkoutSuccessUrl,
      cancelUrl: checkoutCancelUrl,
    });

    res.json({
      checkoutUrl: result.url,
      sessionId: result.sessionId,
    });
  } catch (error) {
    logger.error('Checkout error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create checkout session' });
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
    logger.error('Portal error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create portal session' });
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
    logger.error('Status error', { err: error instanceof Error ? error.message : String(error) });
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
// POST /dtc-checkout — DTC self-service checkout (like Claude.ai)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/dtc-checkout', authenticateToken, async (req: Request, res: Response) => {
  try {
    // SECURITY: a body-supplied organizationId would have let a caller
    // start a DTC checkout that bills another tenant's payment method.
    // Source the org from the JWT only.
    const orgId =
      (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { tier, billingCycle, currency } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await createDTCCheckoutSession({
      organizationId: Number(orgId),
      tier: tier || 'standard',
      billingCycle: billingCycle || 'monthly',
      successUrl:
        req.body.successUrl ||
        `${baseUrl}/concept2cure/billing?checkout=success&welcome=true`,
      cancelUrl: req.body.cancelUrl || `${baseUrl}/concept2cure/signup`,
      currency,
    });

    res.json(result);
  } catch (error) {
    logger.error('DTC checkout error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create DTC checkout' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /dtc-pricing — Get DTC pricing tiers (public, no auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dtc-pricing', async (_req: Request, res: Response) => {
  const tiers = DTC_PRICING.map(p => ({
    name: p.name,
    tier: p.tier,
    priceMonthly: p.baseMonthly / 100,
    annualDiscountPct: p.annualDiscountPct,
    maxUsers: p.maxUsers === -1 ? 'Unlimited' : p.maxUsers,
    maxProjects: p.maxProjects === -1 ? 'Unlimited' : p.maxProjects,
    maxStorageGB: p.maxStorageGB === -1 ? 'Unlimited' : p.maxStorageGB,
    deepResearchCredits: p.deepResearchCredits === -1 ? 'Unlimited' : p.deepResearchCredits,
    builderCredits: p.builderCredits === -1 ? 'Unlimited' : p.builderCredits,
    trialDays: p.trialDays,
  }));
  res.json({ tiers });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/stripe — Stripe webhook endpoint
// IMPORTANT: This must use raw body parsing for signature verification.
// It should be mounted BEFORE the JSON body parser in index.ts.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhooks/stripe', raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET not configured');
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
    // Log details server-side for triage but never echo the SDK message
    // back — that fingerprints our implementation (Stripe library version,
    // exact verification path) for whoever is probing the endpoint.
    logger.error('Webhook signature verification failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    await processWebhookEvent(event);
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error', {
      err: error instanceof Error ? error.message : String(error),
      eventType: event?.type,
    });
    // Return 200 to prevent Stripe retries for processing errors —
    // the error is logged and the event was already stored in
    // stripe_events for replay.
    res.json({ received: true, error: 'Processing error logged' });
  }
});

export default router;
