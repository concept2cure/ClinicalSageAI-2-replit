CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS lumen_filing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  source text NOT NULL,
  cik text NOT NULL,
  accession_no text NOT NULL,
  filing_date date,
  report_year integer,
  company_name text,
  form_type text NOT NULL,
  primary_document text,
  filing_url text,
  content text,
  extracted_signals jsonb,
  rejection_signals jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source, accession_no)
);

CREATE INDEX IF NOT EXISTS lumen_filing_org_idx ON lumen_filing_documents (organization_id);
CREATE INDEX IF NOT EXISTS lumen_filing_date_idx ON lumen_filing_documents (filing_date);

CREATE TABLE IF NOT EXISTS lumen_data_atoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  source_id text,
  atom_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  structured_data jsonb,
  tags text[],
  confidence real NOT NULL DEFAULT 0.7,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lumen_atom_org_idx ON lumen_data_atoms (organization_id);
CREATE INDEX IF NOT EXISTS lumen_atom_type_idx ON lumen_data_atoms (atom_type);
CREATE INDEX IF NOT EXISTS lumen_atom_source_idx ON lumen_data_atoms (source_type, source_id);

CREATE TABLE IF NOT EXISTS lumen_observation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  term text NOT NULL,
  term_type text NOT NULL DEFAULT 'objective',
  category text,
  source_type text NOT NULL,
  source_id text,
  weight real NOT NULL DEFAULT 1,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lumen_term_org_idx ON lumen_observation_terms (organization_id);
CREATE INDEX IF NOT EXISTS lumen_term_idx ON lumen_observation_terms (term);
CREATE INDEX IF NOT EXISTS lumen_term_source_idx ON lumen_observation_terms (source_type, source_id);
