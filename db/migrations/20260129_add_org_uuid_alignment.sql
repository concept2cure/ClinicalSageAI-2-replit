-- Adds UUID identifier to organizations and aligns UUID-based tenant helpers

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();

UPDATE organizations
SET uuid = COALESCE(uuid, gen_random_uuid())
WHERE uuid IS NULL;

ALTER TABLE organizations
  ALTER COLUMN uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_uuid_idx ON organizations (uuid);

-- Ensure helper uses UUID from organizations when available
-- ── The uuid cast that threw on the scope the app sets most often ────────────
-- This helper, and the policies that inline the same expression, cast whatever
-- is in `app.current_org_id` straight to UUID. That GUC is set to the EMPTY
-- STRING on the paths that carry no org uuid — systemSessionVars() (the
-- cross-tenant super-admin scope), tenantSessionVars() whenever `orgUuid` is
-- null, lazyRequestDbClient's release, withTenantConnection's reset and
-- poolInstrumentation's reset all write ''. `''::uuid` does not yield NULL; it
-- raises
--     ERROR: invalid input syntax for type uuid: ""
-- so on the 19 non-public policies that inline the cast WITHOUT a NULLIF, every
-- read on those scopes died. It is the same defect as the integer-side cast
-- documented in migrations/0021_enable_rls_everywhere.sql, in the other
-- direction, and it was equally invisible: the app connects as the owner, for
-- whom RLS is inert.
--
-- `substring(… from '<uuid pattern>')` EXTRACTS a uuid instead of casting
-- whatever is there — NULL for '' and for anything that is not a uuid, the uuid
-- when there genuinely is one. Every caller that worked before still works: a
-- COALESCE(…, org_id) wrapper still falls through to "no tenant context, see
-- everything", and a bare comparison still matches nothing.

CREATE OR REPLACE FUNCTION identity.current_org_uuid()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT substring(current_setting('app.current_org_id', TRUE) from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')::UUID;
$$;
