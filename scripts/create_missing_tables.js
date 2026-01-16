import postgres from 'postgres';

(async () => {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL not set in environment');
    }

    const sql = postgres(connectionString, {
      ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    });

    const createSql = `
CREATE TABLE IF NOT EXISTS ai_token_budget (
  id integer PRIMARY KEY,
  daily_limit bigint DEFAULT 100000,
  tokens_used bigint DEFAULT 0,
  reset_at timestamptz,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coauthor_validation_rules (
  id serial PRIMARY KEY,
  rule_id text NOT NULL UNIQUE,
  organization_id integer,
  module text NOT NULL,
  section text,
  agency text NOT NULL,
  category text NOT NULL,
  rule_type text NOT NULL,
  severity text NOT NULL,
  rule_name text NOT NULL,
  description text NOT NULL,
  check_logic json NOT NULL,
  remediation_text text NOT NULL,
  auto_fix_available boolean DEFAULT false,
  auto_fix_logic json,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS validation_rules_module_idx ON coauthor_validation_rules (module);
CREATE INDEX IF NOT EXISTS validation_rules_agency_idx ON coauthor_validation_rules (agency);
CREATE INDEX IF NOT EXISTS validation_rules_severity_idx ON coauthor_validation_rules (severity);
CREATE INDEX IF NOT EXISTS validation_rules_category_idx ON coauthor_validation_rules (category);
CREATE INDEX IF NOT EXISTS validation_rules_type_idx ON coauthor_validation_rules (rule_type);
`;

    await sql.unsafe(createSql);
    console.log('✅ Missing tables created or confirmed existing');
    await sql.end({ timeout: 5 });
  } catch (err) {
    console.error('Failed to create tables:', err);
    process.exit(1);
  }
})();
