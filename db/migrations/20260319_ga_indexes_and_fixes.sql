-- GA Readiness: Add missing indexes for billing/Stripe performance
-- Date: 2026-03-19

-- Index on organizations.stripe_customer_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Index on organizations.stripe_subscription_id for subscription status queries
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_subscription_id
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Index on api_usage_logs for billing dashboard queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_org_date
  ON api_usage_logs (organization_id, created_at DESC);

-- Index on billing_alerts for unacknowledged alert queries
CREATE INDEX IF NOT EXISTS idx_billing_alerts_org_unack
  ON billing_alerts (organization_id, acknowledged)
  WHERE acknowledged = false;

-- Index on stripe_events for idempotency checks
CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id
  ON stripe_events (event_id);
