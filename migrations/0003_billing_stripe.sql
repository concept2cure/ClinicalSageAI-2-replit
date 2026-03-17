-- Migration: Add Stripe billing fields to organizations and create stripe_events table
-- This enables the Stripe Checkout + Link billing system

-- Add billing columns to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'incomplete';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS seats_purchased INTEGER DEFAULT 5;

-- Create stripe_events table for idempotent webhook processing
CREATE TABLE IF NOT EXISTS stripe_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  organization_id INTEGER REFERENCES organizations(id),
  payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for quick lookup by event type and processing status
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_org ON stripe_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_unprocessed ON stripe_events(processed) WHERE processed = false;

-- Index for subscription lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_sub ON organizations(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_payment_status ON organizations(payment_status);
