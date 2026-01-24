-- Regulatory Intelligence Schema
-- This schema defines the database structure needed for the regulatory intelligence module

-- Regulatory Sources
CREATE TABLE IF NOT EXISTS regulatory_sources (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  color VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory Updates
CREATE TABLE IF NOT EXISTS regulatory_updates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  source_id VARCHAR(50) NOT NULL REFERENCES regulatory_sources(id),
  url TEXT,
  published_date TIMESTAMP WITH TIME ZONE NOT NULL,
  document_type VARCHAR(100),
  reference_number VARCHAR(100),
  is_new BOOLEAN DEFAULT false,
  topics TEXT[] DEFAULT '{}',
  therapeutic_areas TEXT[] DEFAULT '{}',
  indications TEXT[] DEFAULT '{}',
  submission_types TEXT[] DEFAULT '{}',
  submission_regions TEXT[] DEFAULT '{}',
  effective_date TIMESTAMP WITH TIME ZONE,
  key_points TEXT[] DEFAULT '{}',
  impact TEXT,
  applicability TEXT,
  impact_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create text search index for regulatory updates
CREATE INDEX IF NOT EXISTS regulatory_updates_search_idx ON regulatory_updates USING GIN (
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'C')
);

-- ICH Guidelines
CREATE TABLE IF NOT EXISTS regulatory_ich_guidelines (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- IHE Profiles
CREATE TABLE IF NOT EXISTS regulatory_ihe_profiles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(100) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory Deadlines
CREATE TABLE IF NOT EXISTS regulatory_deadlines (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  deadline_date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  regulatory_authority VARCHAR(100),
  priority_level INTEGER DEFAULT 1,
  therapeutic_areas TEXT[] DEFAULT '{}',
  indications TEXT[] DEFAULT '{}',
  submission_types TEXT[] DEFAULT '{}',
  submission_regions TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial regulatory sources
INSERT INTO regulatory_sources (id, name, full_name, color)
VALUES 
  ('fda', 'FDA', 'U.S. Food and Drug Administration', 'blue'),
  ('ema', 'EMA', 'European Medicines Agency', 'cyan'),
  ('ich', 'ICH', 'International Council for Harmonisation', 'purple'),
  ('pmda', 'PMDA', 'Pharmaceuticals and Medical Devices Agency (Japan)', 'red'),
  ('health-canada', 'Health Canada', 'Health Canada', 'green'),
  ('ihe', 'IHE', 'Integrating the Healthcare Enterprise', 'orange')
ON CONFLICT (id) DO NOTHING;

-- Seed sample ICH guidelines
INSERT INTO regulatory_ich_guidelines (id, name, category, status, date, description, url)
VALUES 
  ('e6r3', 'E6(R3) Good Clinical Practice', 'Efficacy', 'Step 4', '2023-11-30', 'Provides an international ethical and scientific quality standard for designing, conducting, recording, and reporting trials that involve human subjects.', 'https://database.ich.org/sites/default/files/ICH_E6-R3_GuideLine_Step4_2023_1130.pdf'),
  ('m4q', 'M4Q(R1) CTD - Quality', 'Multidisciplinary', 'Step 4', '2022-07-15', 'Defines the organization of the Common Technical Document (CTD) for the registration of pharmaceuticals for human use - Quality section.', 'https://database.ich.org/sites/default/files/M4Q_R1_Guideline.pdf'),
  ('m4s', 'M4S(R2) CTD - Safety', 'Multidisciplinary', 'Step 4', '2022-07-15', 'Defines the organization of the Common Technical Document (CTD) for the registration of pharmaceuticals for human use - Safety section.', 'https://database.ich.org/sites/default/files/M4S_R2_Guideline.pdf'),
  ('m4e', 'M4E(R2) CTD - Efficacy', 'Multidisciplinary', 'Step 4', '2022-07-15', 'Defines the organization of the Common Technical Document (CTD) for the registration of pharmaceuticals for human use - Efficacy section.', 'https://database.ich.org/sites/default/files/M4E_R2_Guideline.pdf'),
  ('e8r1', 'E8(R1) General Considerations for Clinical Trials', 'Efficacy', 'Step 4', '2022-10-01', 'Addresses a broad range of issues critical to the design and conduct of clinical trials, focusing on study quality and efficiency.', 'https://database.ich.org/sites/default/files/ICH_E8-R1_Guideline_Step4_2022_1001.pdf')
ON CONFLICT (id) DO NOTHING;

-- Seed sample IHE profiles
INSERT INTO regulatory_ihe_profiles (id, name, domain, description, url)
VALUES 
  ('rpe', 'Retrieve Protocol for Execution (RPE)', 'Quality, Research, and Public Health', 'Enables the electronic sharing of detailed protocol definition and eligibility criteria for clinical research.', 'https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_RPE.pdf'),
  ('crpc', 'Clinical Research Process Content (CRPC)', 'Quality, Research, and Public Health', 'Defines the structure and content of documents used in clinical research processes.', 'https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_CRPC.pdf'),
  ('sdc', 'Structured Data Capture (SDC)', 'Quality, Research, and Public Health', 'Provides infrastructure for capturing, managing, and retrieving structured data in healthcare settings.', 'https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_SDC.pdf'),
  ('dsi', 'Drug Safety Content (DSC)', 'Quality, Research, and Public Health', 'Supports the exchange of drug safety and adverse event information in clinical trials.', 'https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_DSC.pdf'),
  ('ctr', 'Clinical Trial Registration (CTR)', 'Quality, Research, and Public Health', 'Defines the process for registering clinical trials in registry systems like ClinicalTrials.gov.', 'https://www.ihe.net/uploadedFiles/Documents/QRPH/IHE_QRPH_Suppl_CTR.pdf')
ON CONFLICT (id) DO NOTHING;

-- Create a function to auto-update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger on all tables
CREATE TRIGGER update_regulatory_sources_timestamp
BEFORE UPDATE ON regulatory_sources
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_regulatory_updates_timestamp
BEFORE UPDATE ON regulatory_updates
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_regulatory_ich_guidelines_timestamp
BEFORE UPDATE ON regulatory_ich_guidelines
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_regulatory_ihe_profiles_timestamp
BEFORE UPDATE ON regulatory_ihe_profiles
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_regulatory_deadlines_timestamp
BEFORE UPDATE ON regulatory_deadlines
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();