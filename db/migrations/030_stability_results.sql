-- Sprint 1-4: Stability Results and Exports Tables
-- Migration for comprehensive stability data management

-- Results table for the Results Grid
CREATE TABLE IF NOT EXISTS stab_results (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50) NOT NULL,
  test_name VARCHAR(100) NOT NULL,
  condition VARCHAR(20) NOT NULL,
  timepoint VARCHAR(10) NOT NULL,
  value DECIMAL(10,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  pass BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Exports table for P.8 push functionality
CREATE TABLE IF NOT EXISTS stab_exports (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50) NOT NULL,
  export_type VARCHAR(20) NOT NULL, -- 'p8_push', 'pdf_export', etc.
  tokens JSONB NOT NULL,
  markdown TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CAPA table for OOT/OOS management
CREATE TABLE IF NOT EXISTS capa (
  id SERIAL PRIMARY KEY,
  study_id VARCHAR(50),
  process_id VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  why TEXT NOT NULL,
  owner VARCHAR(100) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'DONE'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Strategy P.3.4 exports table
CREATE TABLE IF NOT EXISTS strategy_p34_exports (
  id SERIAL PRIMARY KEY,
  process_id VARCHAR(50) NOT NULL,
  export_type VARCHAR(20) NOT NULL, -- 'p34_push', 'pdf_export', etc.
  tokens JSONB NOT NULL,
  markdown TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytical method linking for cross-module integration
CREATE TABLE IF NOT EXISTS method_links (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL, -- 'stability_test', 'strategy_control'
  entity_id VARCHAR(50) NOT NULL,
  method_id INTEGER NOT NULL,
  linked_at TIMESTAMP DEFAULT NOW(),
  linked_by VARCHAR(100) NOT NULL
);

-- Add indexes for performance
DO $$
BEGIN
  IF to_regclass('public.stab_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_results_study_id ON stab_results(study_id);
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'stab_results' AND column_name = 'test_name'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_stab_results_test_condition ON stab_results(test_name, condition);
    END IF;
  END IF;
  IF to_regclass('public.stab_exports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_exports_study_id ON stab_exports(study_id);
  END IF;
  IF to_regclass('public.capa') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_capa_study_id ON capa(study_id);
    CREATE INDEX IF NOT EXISTS idx_capa_process_id ON capa(process_id);
  END IF;
  IF to_regclass('public.strategy_p34_exports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_strategy_p34_exports_process_id ON strategy_p34_exports(process_id);
  END IF;
  IF to_regclass('public.method_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_method_links_entity ON method_links(entity_type, entity_id);
  END IF;
END $$;

-- Insert sample data for Results Grid demonstration
DO $$
BEGIN
  IF to_regclass('public.stab_results') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'stab_results' AND column_name = 'test_name'
     ) THEN
    INSERT INTO stab_results (study_id, test_name, condition, timepoint, value, unit, pass) VALUES
    ('STAB-001', 'Assay', 'LT', '0M', 100.2, '%', true),
    ('STAB-001', 'Assay', 'LT', '3M', 99.8, '%', true),
    ('STAB-001', 'Assay', 'LT', '6M', 99.1, '%', true),
    ('STAB-001', 'Dissolution', 'ACC', '0M', 95.5, '%', true),
    ('STAB-001', 'Dissolution', 'ACC', '3M', 93.2, '%', false),
    ('STAB-001', 'Related Substances', 'LT', '6M', 0.15, '%', true),
    ('STAB-002', 'Assay', 'LT', '0M', 99.9, '%', true),
    ('STAB-002', 'Assay', 'LT', '3M', 99.5, '%', true),
    ('STAB-002', 'Water Content', 'INT', '0M', 2.1, '%', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Insert sample CAPA records
INSERT INTO capa (study_id, title, why, owner, due_date, status) VALUES
('STAB-001', 'Investigate Dissolution OOT at ACC 3M', 'Result below specification limit requiring investigation', 'Dr. Johnson', CURRENT_DATE + INTERVAL '30 days', 'OPEN'),
('STAB-002', 'Review Water Content Methodology', 'Trending upward requires method validation review', 'QA Team', CURRENT_DATE + INTERVAL '45 days', 'IN_PROGRESS');

-- Add comments for documentation
COMMENT ON TABLE stab_results IS 'Stability test results for Results Grid with sparkline support';
COMMENT ON TABLE stab_exports IS 'Export records for P.8 push to authoring functionality';
COMMENT ON TABLE capa IS 'CAPA records linked to stability OOT/OOS investigations';
COMMENT ON TABLE strategy_p34_exports IS 'Strategy P.3.4 export records for push to authoring';
COMMENT ON TABLE method_links IS 'Cross-module analytical method linkages for Sprint 2 integration';