-- Research Security / COI-FCOI (add-on) — NOT-OD-26-017 / NSPM-33 / 42 CFR 50 Subpart F.
CREATE TABLE IF NOT EXISTS coi_disclosures (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  personnel_id integer NOT NULL REFERENCES research_personnel(id),
  disclosure_type text NOT NULL CHECK (disclosure_type IN ('financial_interest','outside_activity','foreign_appointment','foreign_support','other_support','gift','intellectual_property','other')),
  entity_name text NOT NULL, country text, description text, monetary_value numeric(14,2), related_to_research text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','no_conflict','managed','conflict','denied')),
  reviewed_by integer REFERENCES users(id), reviewed_at timestamptz, management_plan text, disclosed_date date,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_coi_disclosures_org ON coi_disclosures(organization_id);
CREATE INDEX IF NOT EXISTS idx_coi_disclosures_personnel ON coi_disclosures(personnel_id);
