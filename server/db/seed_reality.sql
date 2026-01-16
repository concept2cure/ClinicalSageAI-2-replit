-- Reality seed: Active Defense live data

-- 1. INJECT CRITICAL THREAT (Apex Bio)
INSERT INTO deficiency_bank (source_system, content, insight, severity, source_url, created_at)
VALUES (
  'FDA_WARNING_LETTER',
  'Apex Bio-Synthetics Inc.',
  'CRITICAL FAILURE: Sterile barrier breach detected in Lot #404. Immediate recall mandated for all synthetic tubing distributed between Q3-Q4.',
  'CRITICAL',
  'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/apex-bio-synthetics-inc-678901-01152026',
  NOW()
);

-- 2. INJECT HIGH RISK (EMA)
INSERT INTO deficiency_bank (source_system, content, insight, severity, source_url, created_at)
VALUES (
  'EMA_REJECTION',
  'Novacore Pacemaker Leads',
  'Submission rejected due to insufficient biocompatibility data (ISO 10993-1) for long-term implant duration.',
  'HIGH',
  'https://www.ema.europa.eu/en/medicines/human/EPAR/novacore-leads',
  NOW() - INTERVAL '2 HOURS'
);

-- 3. ENSURE PROJECT EXISTS (War Room target)
INSERT INTO projects (
  organization_id,
  client_workspace_id,
  name,
  description,
  status,
  priority,
  type,
  created_at,
  updated_at
)
SELECT
  1,
  1,
  'Project Zeus: Next-Gen Catheter',
  '510(k) submission for novel cardiac catheter',
  'active',
  'high',
  'regulatory',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM projects WHERE name = 'Project Zeus: Next-Gen Catheter'
);
