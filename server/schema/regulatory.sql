-- Regulatory Management Schema
-- Creates all tables needed for the enhanced regulatory tab functionality

-- Main regulatory programs table
CREATE TABLE IF NOT EXISTS reg_programs (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  organization_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory submissions
CREATE TABLE IF NOT EXISTS reg_submissions (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  submission_type VARCHAR(50) NOT NULL, -- IND, NDA, BLA, MAA, etc.
  agency VARCHAR(50) NOT NULL, -- FDA, EMA, PMDA, HC, etc.
  product_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'PLANNING',
  submission_date DATE,
  target_date DATE,
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  review_division VARCHAR(255),
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory requirements and commitments
CREATE TABLE IF NOT EXISTS reg_requirements (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- CMC, Clinical, Nonclinical, etc.
  severity INTEGER DEFAULT 2, -- 1=Low, 2=Medium, 3=High, 4=Critical
  status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, READY, CLOSED
  due_date DATE,
  assigned_to VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory tasks and obligations
CREATE TABLE IF NOT EXISTS reg_tasks (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  kind VARCHAR(50), -- COMMITMENT, M3, IR, VALIDATION, etc.
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  status VARCHAR(50) DEFAULT 'OPEN',
  due_date DATE,
  assigned_to VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory changes (Q12)
CREATE TABLE IF NOT EXISTS reg_changes (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  impact TEXT,
  category VARCHAR(50), -- Minor, Moderate, Major
  pathway VARCHAR(50), -- CBE, CBE-30, PAS, etc.
  rationale TEXT,
  status VARCHAR(50) DEFAULT 'DRAFT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory questions and information requests
CREATE TABLE IF NOT EXISTS reg_questions (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  question TEXT NOT NULL,
  agency VARCHAR(50),
  type VARCHAR(50), -- IR, Scientific Advice, etc.
  status VARCHAR(50) DEFAULT 'RECEIVED',
  draft_response TEXT,
  final_response TEXT,
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- eCTD packages
CREATE TABLE IF NOT EXISTS reg_ectd_packages (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50),
  sequence VARCHAR(20),
  status VARCHAR(50) DEFAULT 'DRAFT',
  validation_status VARCHAR(50),
  validation_results JSONB,
  file_count INTEGER DEFAULT 0,
  total_size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory policies
CREATE TABLE IF NOT EXISTS reg_policies (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100), -- Quality, Manufacturing, Clinical, etc.
  region VARCHAR(50), -- ICH, FDA, EMA, etc.
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  compliance INTEGER DEFAULT 100,
  ai_recommendations INTEGER DEFAULT 0,
  violations INTEGER DEFAULT 0,
  last_update DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policy violations and compliance issues
CREATE TABLE IF NOT EXISTS reg_policy_violations (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  policy_id INTEGER REFERENCES reg_policies(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
  status VARCHAR(50) DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- AI recommendations
CREATE TABLE IF NOT EXISTS reg_ai_recommendations (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  recommendation TEXT,
  confidence DECIMAL(5,2), -- 0.00 to 100.00
  impact VARCHAR(20) DEFAULT 'medium',
  timeline VARCHAR(100),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workflow instances
CREATE TABLE IF NOT EXISTS reg_workflow_instances (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  workflow_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  metadata JSONB
);

-- Checklists
CREATE TABLE IF NOT EXISTS reg_checklists (
  id SERIAL PRIMARY KEY,
  program_id VARCHAR(50) REFERENCES reg_programs(program_id),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  items JSONB, -- Array of checklist items
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reg_submissions_program_id ON reg_submissions(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_requirements_program_id ON reg_requirements(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_tasks_program_id ON reg_tasks(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_tasks_status ON reg_tasks(status);
CREATE INDEX IF NOT EXISTS idx_reg_changes_program_id ON reg_changes(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_questions_program_id ON reg_questions(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_ectd_packages_program_id ON reg_ectd_packages(program_id);
CREATE INDEX IF NOT EXISTS idx_reg_policies_program_id ON reg_policies(program_id);