-- Seed 3 IND programs for live PDEV verification.
-- Run against an empty DB after applying migrations:
--   psql $DATABASE_URL -f scripts/qa/seed-pdev-test-programs.sql
INSERT INTO organizations (id, name, slug, created_at)
VALUES (1, 'Concept2Cure Test Org', 'test', now())
ON CONFLICT DO NOTHING;

INSERT INTO regulatory_programs
  (id, organization_id, name, code, program_type, product_type, primary_agency,
   product_name, indication, status, target_submission_date, progress_percent, metadata)
VALUES
  ('11111111-1111-1111-1111-111111111111', 1, 'Vorelinib · KIT-mutant GIST IND', 'BX-501', 'IND', 'drug', 'FDA',
   'Vorelinib · KIT-mutant GIST', 'KIT-mutant GIST · 4L+', 'active', '2027-03-15', 58,
   '{"blocker": "GLP toxicology summary missing for Module 4"}'::json),
  ('22222222-2222-2222-2222-222222222222', 1, 'Selevadex · oral RA IND', 'PN-310', 'IND', 'drug', 'FDA',
   'Selevadex · oral RA', 'Rheumatoid arthritis · DMARD-IR', 'active', '2027-06-30', 41,
   '{"blocker": "CMC formulation lot stability under review"}'::json),
  ('33333333-3333-3333-3333-333333333333', 1, 'Aximab · inflammatory bowel IND', 'AX-208', 'IND', 'biologic', 'FDA',
   'Aximab · inflammatory bowel', 'Moderate-to-severe UC', 'active', '2026-11-22', 71,
   '{"blocker": "Pre-IND meeting feedback rollup pending"}'::json)
ON CONFLICT (id) DO NOTHING;
