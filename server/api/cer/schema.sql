-- CER Schema for TrialSage

-- Reports Table
CREATE TABLE IF NOT EXISTS cer_reports (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  template_id INTEGER,
  product_id INTEGER,
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sections Table
CREATE TABLE IF NOT EXISTS cer_sections (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES cer_reports(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  section_order INTEGER NOT NULL,
  section_key VARCHAR(100),
  regulatory_framework VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Templates Table
CREATE TABLE IF NOT EXISTS cer_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(100) NOT NULL,
  regulatory_framework VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Template Sections Table
CREATE TABLE IF NOT EXISTS cer_template_sections (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES cer_templates(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  section_order INTEGER NOT NULL,
  section_key VARCHAR(100),
  regulatory_framework VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE IF NOT EXISTS cer_products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  identifier VARCHAR(100),
  description TEXT,
  manufacturer VARCHAR(255),
  classification VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Data Sources Table
CREATE TABLE IF NOT EXISTS cer_data_sources (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES cer_reports(id) ON DELETE CASCADE,
  source_type VARCHAR(100) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_identifier VARCHAR(255),
  source_date DATE,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analysis Results Table
CREATE TABLE IF NOT EXISTS cer_analysis_results (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES cer_reports(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES cer_sections(id) ON DELETE CASCADE,
  analysis_type VARCHAR(100) NOT NULL,
  score INTEGER,
  summary TEXT,
  strengths JSON,
  weaknesses JSON,
  recommendations JSON,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Conversations Table
CREATE TABLE IF NOT EXISTS cer_ai_conversations (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES cer_reports(id) ON DELETE SET NULL,
  section_id INTEGER REFERENCES cer_sections(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regulatory Guidelines Table
CREATE TABLE IF NOT EXISTS cer_regulatory_guidelines (
  id SERIAL PRIMARY KEY,
  regulatory_authority VARCHAR(100) NOT NULL,
  reference_id VARCHAR(100),
  section_key VARCHAR(100),
  requirement_text TEXT NOT NULL,
  guidance_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample templates
INSERT INTO cer_templates (name, description, type, regulatory_framework)
VALUES 
  ('EU MDR CER Template', 'Standard template for EU Medical Device Regulation Clinical Evaluation Reports', 'Medical Device', 'EU MDR'),
  ('FDA 510(k) CER Template', 'Standard template for FDA 510(k) Clinical Evaluation Reports', 'Medical Device', 'FDA'),
  ('Health Canada CER Template', 'Standard template for Health Canada Clinical Evaluation Reports', 'Medical Device', 'Health Canada')
ON CONFLICT DO NOTHING;

-- Insert sample template sections for EU MDR
INSERT INTO cer_template_sections (template_id, title, description, section_order, section_key, regulatory_framework)
VALUES 
  (1, 'Executive Summary', 'Provide a concise overview of the clinical evaluation and its conclusions', 1, 'executive_summary', 'EU MDR'),
  (1, 'Scope of the Clinical Evaluation', 'Define the scope and objectives of the clinical evaluation', 2, 'scope', 'EU MDR'),
  (1, 'Device Description', 'Detailed description of the device, including its intended purpose', 3, 'device_description', 'EU MDR'),
  (1, 'Clinical Background', 'Overview of the clinical context and state of the art', 4, 'clinical_background', 'EU MDR'),
  (1, 'Clinical Data Analysis', 'Analysis of clinical data and evidence', 5, 'clinical_data', 'EU MDR'),
  (1, 'Post-Market Surveillance', 'Analysis of post-market surveillance data', 6, 'post_market', 'EU MDR'),
  (1, 'Risk Management', 'Risk-benefit analysis and risk management', 7, 'risk_management', 'EU MDR'),
  (1, 'Conclusion', 'Overall conclusions of the clinical evaluation', 8, 'conclusion', 'EU MDR')
ON CONFLICT DO NOTHING;

-- Insert sample template sections for FDA
INSERT INTO cer_template_sections (template_id, title, description, section_order, section_key, regulatory_framework)
VALUES 
  (2, 'Executive Summary', 'Concise summary of the clinical evaluation and key findings', 1, 'executive_summary', 'FDA'),
  (2, 'Device Description', 'Detailed description of the device including intended use', 2, 'device_description', 'FDA'),
  (2, 'Regulatory History', 'Summary of previous regulatory decisions', 3, 'regulatory_history', 'FDA'),
  (2, 'Clinical Literature Review', 'Systematic review of relevant clinical literature', 4, 'literature_review', 'FDA'),
  (2, 'Clinical Studies', 'Summary and analysis of clinical studies', 5, 'clinical_studies', 'FDA'),
  (2, 'Risk Analysis', 'Analysis of risks and their mitigation', 6, 'risk_analysis', 'FDA'),
  (2, 'Benefit-Risk Assessment', 'Assessment of benefits versus risks', 7, 'benefit_risk', 'FDA'),
  (2, 'Conclusions', 'Overall conclusions and recommendation', 8, 'conclusions', 'FDA')
ON CONFLICT DO NOTHING;

-- Insert sample regulatory guidelines
INSERT INTO cer_regulatory_guidelines (regulatory_authority, reference_id, section_key, requirement_text, guidance_text)
VALUES
  ('EU MDR', 'Annex XIV Part A', 'executive_summary', 'The clinical evaluation report shall contain a concise, critical analysis of all clinical data collected, and clear conclusions about the clinical safety and performance of the device.', 'Include a clear statement of conformity with essential requirements and explain how the conclusions were reached.'),
  ('EU MDR', 'Annex XIV Part A', 'clinical_data', 'The clinical evaluation shall be thorough and objective, and take into account both favorable and unfavorable data.', 'Consider all available clinical data including clinical investigations, published literature, and clinical experience.'),
  ('FDA', '21 CFR 860.7', 'clinical_studies', 'There must be valid scientific evidence to support regulatory decisions regarding medical devices.', 'Valid scientific evidence may include well-controlled investigations, partially controlled studies, and objective trials without matched controls.'),
  ('FDA', 'Guidance on 510(k)', 'benefit_risk', 'The comparison of benefits and risks must demonstrate that the probable benefits outweigh the probable risks.', 'Consider the type, severity, and rate of harmful events versus the type, magnitude, and probability of benefits.')
ON CONFLICT DO NOTHING;

-- Insert sample products
INSERT INTO cer_products (name, identifier, description, manufacturer, classification)
VALUES
  ('MediPulse ECG Monitor', 'MPE-2023', 'Continuous cardiac monitoring device for high-risk patients', 'MediTech Inc.', 'Class II'),
  ('GlucoTrack Continuous Glucose Monitor', 'GT-500', 'Non-invasive continuous glucose monitoring system', 'DiaMed Solutions', 'Class II'),
  ('NeuraScan Brain Imaging System', 'NBS-3D', 'Advanced neurological imaging system for diagnostic procedures', 'NeuroVision Medical', 'Class III')
ON CONFLICT DO NOTHING;