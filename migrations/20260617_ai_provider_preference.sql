-- Per-organization AI provider preference (Claude-first).
--
-- Adds the tenant's preferred model provider to the existing per-org AI policy
-- table. The platform default is always Claude (anthropic); this column lets a
-- tenant pin a different selectable provider as its default. A per-request
-- override still wins, and provider CHOICE never overrides the residency /
-- zero-retention constraints in the same row (those are enforced by the gateway).
--
-- Resolved + written by server/services/ai-gateway/providers/provider-preference-db.ts
-- and wired in at startup via setTenantProviderResolver(). Reuses the existing,
-- tenant-scoped + RLS-enforced ai_placement_policies table — no new table, no new
-- RLS policy (the column inherits the table's tenant_isolation_policy).
--
-- Values: NULL = use the platform default (anthropic). Otherwise one of the
-- client-selectable provider ids (anthropic | bedrock | vertex | openai | azure |
-- moonshot). Validated in application code on read and write.

ALTER TABLE public.ai_placement_policies
  ADD COLUMN IF NOT EXISTS preferred_ai_provider TEXT;
