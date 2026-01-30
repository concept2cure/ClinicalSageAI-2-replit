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
CREATE OR REPLACE FUNCTION identity.current_org_uuid()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
$$;
