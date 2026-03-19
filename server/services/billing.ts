/**
 * @fileoverview Stripe Billing Service
 * @module server/services/billing
 * @version 1.0.0
 *
 * @description
 * Handles all Stripe interactions: checkout sessions, subscription lifecycle,
 * webhook processing, and customer portal. Modeled after Anthropic/Claude's
 * billing approach — self-serve tier selection, Stripe Checkout with Link,
 * automatic feature provisioning, and Stripe Customer Portal for management.
 */

import Stripe from 'stripe';
import { pool } from '../db.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
  if (!key) {
    throw new Error('Stripe secret key not configured. Set STRIPE_SECRET_KEY env var.');
  }
  return new Stripe(key, { apiVersion: '2023-10-16' as any });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps archetype + tier + billing cycle to Stripe Price IDs.
 * In production, these come from env vars or Stripe Product catalog.
 * During development, we create prices dynamically if STRIPE_AUTO_CREATE_PRODUCTS is set.
 */
export interface PricingTier {
  name: string;
  tier: string;
  baseMonthly: number; // cents
  perSeatMonthly: number; // cents
  annualDiscountPct: number;
  maxUsers: number;
  maxProjects: number;
  maxStorageGB: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DTC (Direct-to-Consumer) PRICING — Self-service tiers like Claude.ai
// No enterprise sales cycles. Sign up, pay, use.
// ═══════════════════════════════════════════════════════════════════════════════

export interface DTCPricingTier extends PricingTier {
  deepResearchCredits: number;  // per month (-1 = unlimited)
  builderCredits: number;       // per month (-1 = unlimited)
  trialDays: number;
}

export const DTC_PRICING: DTCPricingTier[] = [
  {
    name: 'Researcher',
    tier: 'free',
    baseMonthly: 0,
    perSeatMonthly: 0,
    annualDiscountPct: 0,
    maxUsers: 1,
    maxProjects: 2,
    maxStorageGB: 1,
    deepResearchCredits: 5,
    builderCredits: 0,
    trialDays: 0,
  },
  {
    name: 'Startup Biotech',
    tier: 'standard',
    baseMonthly: 49900,       // $499/mo
    perSeatMonthly: 0,
    annualDiscountPct: 15,
    maxUsers: 5,
    maxProjects: 10,
    maxStorageGB: 25,
    deepResearchCredits: 50,
    builderCredits: 10,
    trialDays: 14,
  },
  {
    name: 'Growth',
    tier: 'professional',
    baseMonthly: 149900,      // $1,499/mo
    perSeatMonthly: 0,
    annualDiscountPct: 15,
    maxUsers: 25,
    maxProjects: 50,
    maxStorageGB: 100,
    deepResearchCredits: 200,
    builderCredits: 50,
    trialDays: 14,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    baseMonthly: 0,           // Custom pricing
    perSeatMonthly: 0,
    annualDiscountPct: 0,
    maxUsers: -1,
    maxProjects: -1,
    maxStorageGB: -1,
    deepResearchCredits: -1,
    builderCredits: -1,
    trialDays: 30,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY-BASED PRICING (legacy/enterprise sales)
// ═══════════════════════════════════════════════════════════════════════════════

export const PRICING: Record<string, PricingTier[]> = {
  big_pharma: [
    { name: 'Starter', tier: 'standard', baseMonthly: 500000, perSeatMonthly: 7500, annualDiscountPct: 15, maxUsers: 25, maxProjects: 50, maxStorageGB: 100 },
    { name: 'Professional', tier: 'professional', baseMonthly: 500000, perSeatMonthly: 7500, annualDiscountPct: 15, maxUsers: 200, maxProjects: 500, maxStorageGB: 1000 },
    { name: 'Enterprise', tier: 'enterprise', baseMonthly: 500000, perSeatMonthly: 7500, annualDiscountPct: 15, maxUsers: 500, maxProjects: -1, maxStorageGB: 5000 },
  ],
  virtual_biotech: [
    { name: 'Starter', tier: 'standard', baseMonthly: 150000, perSeatMonthly: 4500, annualDiscountPct: 10, maxUsers: 10, maxProjects: 20, maxStorageGB: 50 },
    { name: 'Professional', tier: 'professional', baseMonthly: 150000, perSeatMonthly: 4500, annualDiscountPct: 10, maxUsers: 50, maxProjects: 100, maxStorageGB: 250 },
    { name: 'Enterprise', tier: 'enterprise', baseMonthly: 150000, perSeatMonthly: 4500, annualDiscountPct: 10, maxUsers: 50, maxProjects: -1, maxStorageGB: 1000 },
  ],
  cro: [
    { name: 'Starter', tier: 'standard', baseMonthly: 300000, perSeatMonthly: 5500, annualDiscountPct: 12, maxUsers: 25, maxProjects: 50, maxStorageGB: 100 },
    { name: 'Professional', tier: 'professional', baseMonthly: 300000, perSeatMonthly: 5500, annualDiscountPct: 12, maxUsers: 100, maxProjects: 250, maxStorageGB: 500 },
    { name: 'Enterprise', tier: 'enterprise', baseMonthly: 300000, perSeatMonthly: 5500, annualDiscountPct: 12, maxUsers: 200, maxProjects: -1, maxStorageGB: 2000 },
  ],
  academic: [
    { name: 'Starter', tier: 'standard', baseMonthly: 50000, perSeatMonthly: 2000, annualDiscountPct: 20, maxUsers: 10, maxProjects: 20, maxStorageGB: 25 },
    { name: 'Professional', tier: 'professional', baseMonthly: 50000, perSeatMonthly: 2000, annualDiscountPct: 20, maxUsers: 50, maxProjects: 100, maxStorageGB: 100 },
    { name: 'Enterprise', tier: 'enterprise', baseMonthly: 50000, perSeatMonthly: 2000, annualDiscountPct: 20, maxUsers: 100, maxProjects: -1, maxStorageGB: 500 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT SESSION CREATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateCheckoutParams {
  organizationId: number;
  tier: string;
  billingCycle: 'monthly' | 'annual';
  successUrl: string;
  cancelUrl: string;
  seats?: number;
}

/**
 * Creates a Stripe Checkout Session with Link enabled.
 * This is the primary entry point for collecting payment — mirrors
 * how Anthropic handles tier upgrades and initial subscription.
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const { organizationId, tier, billingCycle, successUrl, cancelUrl, seats } = params;

  // Look up organization
  const orgResult = await pool.query(
    `SELECT id, name, stripe_customer_id, industry_mode, tier as current_tier
     FROM organizations WHERE id = $1`,
    [organizationId]
  );

  if (orgResult.rows.length === 0) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const org = orgResult.rows[0];
  const industryMode = org.industry_mode || 'virtual_biotech';

  // Find pricing for this archetype + tier
  const archetypePricing = PRICING[industryMode] || PRICING.virtual_biotech;
  const tierPricing = archetypePricing.find(p => p.tier === tier);
  if (!tierPricing) {
    throw new Error(`Invalid tier '${tier}' for industry '${industryMode}'`);
  }

  // Calculate price
  const seatCount = seats || tierPricing.maxUsers;
  let unitAmount = tierPricing.baseMonthly + (tierPricing.perSeatMonthly * seatCount);

  // Apply annual discount
  if (billingCycle === 'annual') {
    unitAmount = Math.round(unitAmount * (1 - tierPricing.annualDiscountPct / 100));
  }

  // Ensure Stripe customer exists
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: {
        organizationId: String(organizationId),
        industryMode,
      },
    });
    customerId = customer.id;
    await pool.query(
      `UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2`,
      [customerId, organizationId]
    );
  }

  // Create or look up a Stripe Product for this tier
  const productId = await getOrCreateProduct(stripe, tier, industryMode);

  // Create a Price for this configuration
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'usd',
    recurring: {
      interval: billingCycle === 'annual' ? 'year' : 'month',
    },
    metadata: {
      tier,
      industryMode,
      seats: String(seatCount),
      billingCycle,
    },
  });

  // Create Checkout Session with Link payment method
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card', 'link'],
    line_items: [
      {
        price: price.id,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        organizationId: String(organizationId),
        tier,
        industryMode,
        seats: String(seatCount),
        billingCycle,
        maxProjects: String(tierPricing.maxProjects),
        maxStorageGB: String(tierPricing.maxStorageGB),
      },
    },
    metadata: {
      organizationId: String(organizationId),
      tier,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
  });

  return {
    url: session.url!,
    sessionId: session.id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DTC CHECKOUT — Self-service signup with optional free trial
// ═══════════════════════════════════════════════════════════════════════════════

export interface DTCCheckoutParams {
  organizationId: number;
  tier: string;
  billingCycle: 'monthly' | 'annual';
  successUrl: string;
  cancelUrl: string;
  currency?: string; // usd, eur, jpy, cny
}

/**
 * Creates a Stripe Checkout Session for DTC self-service plans.
 * Includes trial period for paid tiers. No per-seat pricing.
 */
export async function createDTCCheckoutSession(params: DTCCheckoutParams): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const { organizationId, tier, billingCycle, successUrl, cancelUrl, currency } = params;

  const dtcTier = DTC_PRICING.find(p => p.tier === tier);
  if (!dtcTier) throw new Error(`Invalid DTC tier: ${tier}`);
  if (dtcTier.baseMonthly === 0 && tier !== 'free') throw new Error('Enterprise tier requires custom pricing');

  // Free tier — no checkout needed
  if (tier === 'free') {
    await pool.query(
      `UPDATE organizations SET tier = 'free', payment_status = 'active', updated_at = NOW() WHERE id = $1`,
      [organizationId]
    );
    await provisionModulesForTier(organizationId, 'free');
    return { url: successUrl, sessionId: 'free' };
  }

  // Look up org
  const orgResult = await pool.query(
    `SELECT id, name, stripe_customer_id FROM organizations WHERE id = $1`,
    [organizationId]
  );
  if (orgResult.rows.length === 0) throw new Error(`Organization ${organizationId} not found`);
  const org = orgResult.rows[0];

  // Ensure Stripe customer
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { organizationId: String(organizationId), pricingModel: 'dtc' },
    });
    customerId = customer.id;
    await pool.query(`UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2`, [customerId, organizationId]);
  }

  // Calculate price
  let unitAmount = dtcTier.baseMonthly;
  if (billingCycle === 'annual') {
    unitAmount = Math.round(unitAmount * (1 - dtcTier.annualDiscountPct / 100));
  }

  const productId = await getOrCreateProduct(stripe, tier, 'dtc');
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: currency || 'usd',
    recurring: { interval: billingCycle === 'annual' ? 'year' : 'month' },
    metadata: { tier, pricingModel: 'dtc', billingCycle },
  });

  const sessionConfig: any = {
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card', 'link'],
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: {
      metadata: {
        organizationId: String(organizationId),
        tier,
        pricingModel: 'dtc',
        billingCycle,
        maxProjects: String(dtcTier.maxProjects),
        maxStorageGB: String(dtcTier.maxStorageGB),
      },
    },
    metadata: { organizationId: String(organizationId), tier },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
  };

  // Add trial period for paid tiers
  if (dtcTier.trialDays > 0) {
    sessionConfig.subscription_data.trial_period_days = dtcTier.trialDays;
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return { url: session.url!, sessionId: session.id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a Stripe Customer Portal session for self-service billing management.
 * Mirrors Claude's approach to subscription management.
 */
export async function createPortalSession(organizationId: number, returnUrl: string): Promise<string> {
  const stripe = getStripe();

  const orgResult = await pool.query(
    `SELECT stripe_customer_id FROM organizations WHERE id = $1`,
    [organizationId]
  );

  if (orgResult.rows.length === 0 || !orgResult.rows[0].stripe_customer_id) {
    throw new Error('No billing account found for this organization');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: orgResult.rows[0].stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SubscriptionStatus {
  active: boolean;
  tier: string;
  billingCycle: string;
  paymentStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: number;
  stripeSubscriptionId: string | null;
}

/**
 * Get current subscription status for an organization.
 */
export async function getSubscriptionStatus(organizationId: number): Promise<SubscriptionStatus> {
  const orgResult = await pool.query(
    `SELECT tier, billing_cycle, payment_status, stripe_subscription_id,
            next_billing_date, seats_purchased
     FROM organizations WHERE id = $1`,
    [organizationId]
  );

  if (orgResult.rows.length === 0) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const org = orgResult.rows[0];
  let cancelAtPeriodEnd = false;

  // If there's an active Stripe subscription, fetch real-time status
  if (org.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
      cancelAtPeriodEnd = sub.cancel_at_period_end;
    } catch {
      // Stripe unavailable — use cached data
    }
  }

  return {
    active: org.payment_status === 'active' || org.payment_status === 'trialing',
    tier: org.tier || 'standard',
    billingCycle: org.billing_cycle || 'monthly',
    paymentStatus: org.payment_status || 'incomplete',
    currentPeriodEnd: org.next_billing_date?.toISOString() || null,
    cancelAtPeriodEnd,
    seats: org.seats_purchased || 5,
    stripeSubscriptionId: org.stripe_subscription_id || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process a verified Stripe webhook event.
 * Idempotent — records each event in stripe_events table before processing.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<void> {
  // Idempotency check
  const existing = await pool.query(
    `SELECT id FROM stripe_events WHERE event_id = $1`,
    [event.id]
  );
  if (existing.rows.length > 0) {
    console.log(`[Billing] Skipping duplicate event: ${event.id}`);
    return;
  }

  // Record event
  const orgId = extractOrganizationId(event);
  await pool.query(
    `INSERT INTO stripe_events (event_id, event_type, organization_id, payload, processed)
     VALUES ($1, $2, $3, $4, false)`,
    [event.id, event.type, orgId, JSON.stringify(event)]
  );

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[Billing] Unhandled event type: ${event.type}`);
    }

    // Mark as processed
    await pool.query(
      `UPDATE stripe_events SET processed = true WHERE event_id = $1`,
      [event.id]
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE stripe_events SET error = $1 WHERE event_id = $2`,
      [errMsg, event.id]
    );
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const organizationId = session.metadata?.organizationId;
  const tier = session.metadata?.tier;

  if (!organizationId) {
    console.warn('[Billing] Checkout completed without organizationId metadata');
    return;
  }

  // The subscription is created separately — this just confirms checkout completed
  console.log(`[Billing] Checkout completed for org ${organizationId}, tier: ${tier}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  const tier = subscription.metadata?.tier || 'standard';
  const seats = parseInt(subscription.metadata?.seats || '5', 10);
  const billingCycle = subscription.metadata?.billingCycle || 'monthly';
  const maxProjects = parseInt(subscription.metadata?.maxProjects || '10', 10);
  const maxStorageGB = parseInt(subscription.metadata?.maxStorageGB || '5', 10);

  // Map Stripe status to our payment status
  const paymentStatus = mapStripeStatus(subscription.status);

  await pool.query(
    `UPDATE organizations SET
       stripe_subscription_id = $1,
       tier = $2,
       payment_status = $3,
       billing_cycle = $4,
       seats_purchased = $5,
       max_users = $5,
       max_projects = $6,
       max_storage = $7,
       next_billing_date = $8,
       updated_at = NOW()
     WHERE id = $9`,
    [
      subscription.id,
      tier,
      paymentStatus,
      billingCycle,
      seats,
      maxProjects > 0 ? maxProjects : 99999,
      maxStorageGB,
      new Date(subscription.current_period_end * 1000),
      parseInt(organizationId, 10),
    ]
  );

  // Auto-provision modules for new tier
  await provisionModulesForTier(parseInt(organizationId, 10), tier);

  console.log(`[Billing] Subscription updated: org=${organizationId}, tier=${tier}, status=${paymentStatus}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  await pool.query(
    `UPDATE organizations SET
       payment_status = 'canceled',
       tier = 'free',
       stripe_subscription_id = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [parseInt(organizationId, 10)]
  );

  console.log(`[Billing] Subscription canceled for org ${organizationId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const organizationId = sub.metadata?.organizationId;
  if (!organizationId) return;

  await pool.query(
    `UPDATE organizations SET
       payment_status = 'active',
       next_billing_date = $1,
       updated_at = NOW()
     WHERE id = $2`,
    [new Date(sub.current_period_end * 1000), parseInt(organizationId, 10)]
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const organizationId = sub.metadata?.organizationId;
  if (!organizationId) return;

  await pool.query(
    `UPDATE organizations SET
       payment_status = 'past_due',
       updated_at = NOW()
     WHERE id = $1`,
    [parseInt(organizationId, 10)]
  );

  console.warn(`[Billing] Payment failed for org ${organizationId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    case 'unpaid': return 'past_due';
    case 'incomplete': return 'incomplete';
    case 'incomplete_expired': return 'canceled';
    case 'paused': return 'incomplete';
    default: return 'incomplete';
  }
}

function extractOrganizationId(event: Stripe.Event): number | null {
  const obj = event.data.object as any;
  const orgIdStr = obj?.metadata?.organizationId
    || (obj as Stripe.Subscription)?.metadata?.organizationId;
  return orgIdStr ? parseInt(orgIdStr, 10) : null;
}

/**
 * Auto-provision modules based on the new tier.
 * Enables all modules that the tier qualifies for.
 */
async function provisionModulesForTier(organizationId: number, tier: string): Promise<void> {
  const tierLevel: Record<string, number> = { free: 0, standard: 1, professional: 2, enterprise: 3 };
  const orgLevel = tierLevel[tier] ?? 1;

  // Get all available modules
  const modulesResult = await pool.query(
    `SELECT module_id, metadata FROM available_modules`
  );

  for (const mod of modulesResult.rows) {
    const meta = mod.metadata || {};
    const requiredTiers: string[] = meta.tiers || [];

    // Check if org's tier qualifies
    const qualifies = requiredTiers.length === 0
      || requiredTiers.some((t: string) => orgLevel >= (tierLevel[t] ?? 99));

    if (qualifies) {
      await pool.query(
        `INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at)
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (organization_id, module_id)
         DO UPDATE SET enabled = true, enabled_at = NOW()`,
        [organizationId, mod.module_id]
      );
    }
  }
}

/**
 * Get or create a Stripe Product for a tier + industry combination.
 */
async function getOrCreateProduct(stripe: Stripe, tier: string, industryMode: string): Promise<string> {
  const productName = `Concept2Cure.RI ${tier.charAt(0).toUpperCase() + tier.slice(1)} - ${industryMode}`;
  const lookupKey = `concept2cure-ri_${industryMode}_${tier}`;

  // Search for existing product
  const products = await stripe.products.search({
    query: `metadata['lookup_key']:'${lookupKey}'`,
  });

  if (products.data.length > 0) {
    return products.data[0].id;
  }

  // Create new product
  const product = await stripe.products.create({
    name: productName,
    metadata: {
      lookup_key: lookupKey,
      tier,
      industryMode,
    },
  });

  return product.id;
}
