-- ============================================================================
-- Grant funding profile (Capability C2C-14, intelligent opportunity finder)
-- ============================================================================
--
-- The org-scoped profile the intelligent opportunity finder matches Grants.gov
-- opportunities against: research keywords, target agencies, preferred
-- mechanisms, institution type, and award-size range. One profile per org.
--
-- Schema:  shared/schema/grant-funding-profiles.ts
-- Logic:   server/services/grants/opportunity-matching.ts (pure scoring)
-- Service: server/services/grants/grant-finder-service.ts
-- Routes:  server/routes/grant-finder.ts (/api/grant-finder)
-- ============================================================================

CREATE TABLE IF NOT EXISTS grant_funding_profiles (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  keywords         text[],
  agencies         text[],
  mechanisms       text[],
  institution_type text,
  min_award        numeric(14,2),
  max_award        numeric(14,2),
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_funding_profiles_org ON grant_funding_profiles(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_grant_funding_profiles_org ON grant_funding_profiles(organization_id);
