-- Orthofix client seed data (real client workspace + projects)

WITH org AS (
  INSERT INTO organizations (name, slug, domain, tier, status, created_at, updated_at)
  SELECT 'Orthofix', 'orthofix', 'orthofix.com', 'enterprise', 'active', NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'orthofix')
  RETURNING id
),
org_id AS (
  SELECT id FROM org
  UNION ALL
  SELECT id FROM organizations WHERE slug = 'orthofix' LIMIT 1
),
workspace AS (
  INSERT INTO client_workspaces (
    organization_id,
    name,
    slug,
    description,
    industry,
    status,
    quota_projects,
    quota_storage,
    created_at,
    updated_at
  )
  SELECT
    org_id.id,
    'Orthofix Spine & Biologics',
    'orthofix-spine-biologics',
    'Regulatory workspace for Orthofix spine and biologics portfolio.',
    'medical_device',
    'active',
    25,
    25,
    NOW(),
    NOW()
  FROM org_id
  WHERE NOT EXISTS (
    SELECT 1 FROM client_workspaces
    WHERE organization_id = org_id.id AND slug = 'orthofix-spine-biologics'
  )
  RETURNING id, organization_id
),
workspace_id AS (
  SELECT id, organization_id FROM workspace
  UNION ALL
  SELECT id, organization_id FROM client_workspaces
  WHERE slug = 'orthofix-spine-biologics'
  LIMIT 1
)
INSERT INTO client_workspace_settings (
  client_workspace_id,
  organization_id,
  general_settings,
  quota_settings,
  module_settings,
  integration_settings,
  appearance_settings,
  notification_settings,
  created_at,
  updated_at
)
SELECT
  workspace_id.id,
  workspace_id.organization_id,
  '{
    "name": "Orthofix Spine & Biologics",
    "industry": "medical_device",
    "tier": "enterprise",
    "useCases": [
      {
        "title": "510(k) dossier acceleration",
        "detail": "Coordinate evidence intake, section authoring, and FDA review readiness for spine and fixation systems."
      },
      {
        "title": "Predicate + standards traceability",
        "detail": "Maintain predicate comparisons, consensus standards mapping, and test evidence linkage across projects."
      },
      {
        "title": "Cross-functional submission governance",
        "detail": "Track review cycles, audit trails, and submission package readiness across regulatory, QA, and clinical teams."
      }
    ]
  }'::jsonb,
  '{"maxUsers": 50, "maxProjects": 50, "maxStorageGB": 200}'::jsonb,
  '{"medicalDeviceEnabled": true, "vaultEnabled": true, "csrEnabled": true}'::jsonb,
  '{}'::jsonb,
  '{"theme": "system", "primaryColor": "#0f172a"}'::jsonb,
  '{"emailNotifications": true, "digestFrequency": "daily"}'::jsonb,
  NOW(),
  NOW()
FROM workspace_id
WHERE NOT EXISTS (
  SELECT 1 FROM client_workspace_settings
  WHERE client_workspace_id = workspace_id.id
);

-- Seed Orthofix projects
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'orthofix' LIMIT 1
),
workspace_id AS (
  SELECT id FROM client_workspaces WHERE slug = 'orthofix-spine-biologics' LIMIT 1
)
INSERT INTO projects (
  organization_id,
  client_workspace_id,
  name,
  description,
  status,
  priority,
  type,
  metadata,
  created_at,
  updated_at
)
SELECT
  org_id.id,
  workspace_id.id,
  proj.name,
  proj.description,
  'active',
  'high',
  'regulatory',
  proj.metadata::jsonb,
  NOW(),
  NOW()
FROM org_id, workspace_id, (
  VALUES
    (
      'OrthoFixation System – Lumbar Fusion',
      '510(k) submission for next-generation lumbar fixation system with updated instrumentation.',
      '{"manufacturer": "Orthofix", "deviceClass": "II", "productCode": "NEK", "intendedUse": "Spinal fixation and fusion", "regulatoryPathway": "510k"}'
    ),
    (
      'Biologics Bone Growth Stimulator',
      '510(k) submission for non-invasive bone growth stimulation platform.',
      '{"manufacturer": "Orthofix", "deviceClass": "II", "productCode": "KFR", "intendedUse": "Adjunct to spinal fusion", "regulatoryPathway": "510k"}'
    )
) AS proj(name, description, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE organization_id = org_id.id AND name = proj.name
);

-- Seed 510(k) workflow records for Orthofix projects
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'orthofix' LIMIT 1
),
base_projects AS (
  SELECT id, name, metadata
  FROM projects
  WHERE organization_id = (SELECT id FROM org_id)
    AND name IN (
      'OrthoFixation System – Lumbar Fusion',
      'Biologics Bone Growth Stimulator'
    )
)
INSERT INTO fda_510k_projects (
  organization_id,
  project_id,
  device_name,
  device_classification,
  product_code,
  current_stage,
  current_stage_progress,
  overall_progress,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  org_id.id,
  base_projects.id,
  base_projects.name,
  COALESCE(base_projects.metadata->>'deviceClass', 'II'),
  base_projects.metadata->>'productCode',
  'strategy',
  15,
  12,
  'active',
  base_projects.metadata,
  NOW(),
  NOW()
FROM base_projects, org_id
WHERE NOT EXISTS (
  SELECT 1 FROM fda_510k_projects
  WHERE organization_id = org_id.id AND project_id = base_projects.id
);
