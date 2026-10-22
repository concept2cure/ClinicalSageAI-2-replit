CREATE TABLE IF NOT EXISTS feature_toggles (
  id SERIAL PRIMARY KEY,
  feature_key TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_for_organization_ids JSON DEFAULT '[]'::json,
  enabled_for_client_workspace_ids JSON DEFAULT '[]'::json,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feature_toggles_feature_key_idx
  ON feature_toggles(feature_key);
