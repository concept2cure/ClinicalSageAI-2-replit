-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Restore the canonical immutable-report lookup indexes on fresh and deployed databases.
--
-- eCTD/CTD Context:
--   - Module(s): Reporting and analytics evidence supporting regulatory submissions across CTD modules.
--   - Integrity Risk Addressed: Schema/model drift leaving governed report evidence without its declared lookup indexes.
--
-- Determinism Contract:
--   - Add only replay-safe indexes; preserve all report content, hashes, signatures and access policies.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- Audit remediation O01/O02: the native fresh installer verified every
-- required column/FK but found no declared non-unique Report OS indexes after
-- drizzle-kit push. Restore the model's exact indexes in the raw overlay and
-- deploy path. No data, immutable content, signatures or policies change.
CREATE INDEX IF NOT EXISTS irr_org_idx ON public.immutable_report_records (organization_id);
CREATE INDEX IF NOT EXISTS irr_project_idx ON public.immutable_report_records (project_id);
CREATE INDEX IF NOT EXISTS irr_domain_idx ON public.immutable_report_records (report_domain);
CREATE INDEX IF NOT EXISTS irr_seal_idx ON public.immutable_report_records (seal_status);
CREATE INDEX IF NOT EXISTS irr_hash_idx ON public.immutable_report_records (content_hash);
CREATE INDEX IF NOT EXISTS irr_regulatory_idx ON public.immutable_report_records (target_regulatory);
CREATE INDEX IF NOT EXISTS irr_code_idx ON public.immutable_report_records (report_code);
CREATE INDEX IF NOT EXISTS irr_created_idx ON public.immutable_report_records (created_at);
