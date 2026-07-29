-- ============================================================================
-- Phase 9 · Day 2 — Legacy backfill
--
-- Populates c2c_documents + c2c_document_sections from the three legacy
-- section stores (cerv2_510k_sections, cer_reports/sections, pma_submissions)
-- and from regulatory_programs (biopharma types).  Also seeds 5 extra rule
-- packs (nda, bla, maa, jnda, denovo) needed for the regulatory_programs
-- backfill.
--
-- Design notes vs PHASE_9_SCHEMA_MIGRATION_BRIEF.md:
--   - project_id made nullable here: legacy 510k/PMA/CER rows predate
--     regulatory_programs; populated by the app when the user opens the
--     document.  New documents created post-migration always have project_id.
--   - Doc IDs are deterministic: 'doc_fda510k_<id>', 'doc_cer_<id>',
--     'doc_pma_<id>', 'doc_rp_<id>' — safe to re-run (idempotent).
--   - All DO $$ … $$ blocks guard against missing tables (bare-CI safe).
--   - content_paragraphs / section_xml do not exist in the live schema;
--     cerv2_510k_sections.content (text) is wrapped into the c2c canonical
--     jsonb shape: { "paragraphs": [{"id":…,"text":…,"prov":"legacy"}] }.
--   - cer_sections.content (json) is cast to jsonb directly; shape preserved.
--   - pma_submissions has no sections table → empty documents only.
--   - REVOKE issued only if application_role exists (dev/CI skip).
-- ============================================================================

BEGIN;

-- ── 1. Relax project_id NOT NULL ─────────────────────────────────────────────
--
-- Legacy 510k/PMA/CER rows have no regulatory_programs UUID yet.
-- The FK constraint stays; NULL is valid in FK columns.
ALTER TABLE c2c_documents ALTER COLUMN project_id DROP NOT NULL;

-- ── 2. Seed rule packs for biopharma types not covered by Day 1 ───────────────
--
-- NDA, BLA, MAA, J-NDA, De Novo share the eCTD M1-5 skeleton.  These are
-- stripped-down summaries; the full outlines will be updated in a later kit.

INSERT INTO c2c_rule_packs
  (doc_type, agency, version, label, required_sections, effective_from)
VALUES
  ('nda', 'fda', 'ich-m4-v2.0', 'NDA × FDA · eCTD M1-5 (US)',
    '[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US)","mandatory":true,"path_order":1},
      {"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":2},
      {"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":3},
      {"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical","mandatory":true,"path_order":4},
      {"key":"M5","parent_key":null,"label":"Module 5 · Clinical","mandatory":true,"path_order":5}]'::jsonb,
    '2026-05-26'),
  ('bla', 'fda', 'ich-m4-v2.0', 'BLA × FDA · eCTD M1-5 (US)',
    '[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US)","mandatory":true,"path_order":1},
      {"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":2},
      {"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":3},
      {"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical","mandatory":true,"path_order":4},
      {"key":"M5","parent_key":null,"label":"Module 5 · Clinical","mandatory":true,"path_order":5}]'::jsonb,
    '2026-05-26'),
  ('maa', 'ema', 'ich-m4-v2.0', 'MAA × EMA · eCTD M1-5 (EU)',
    '[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (EU)","mandatory":true,"path_order":1},
      {"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":2},
      {"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":3},
      {"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical","mandatory":true,"path_order":4},
      {"key":"M5","parent_key":null,"label":"Module 5 · Clinical","mandatory":true,"path_order":5}]'::jsonb,
    '2026-05-26'),
  ('jnda', 'pmda', 'ich-m4-v2.0', 'J-NDA × PMDA · eCTD M1-5 (JP)',
    '[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (JP)","mandatory":true,"path_order":1},
      {"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":2},
      {"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":3},
      {"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical","mandatory":true,"path_order":4},
      {"key":"M5","parent_key":null,"label":"Module 5 · Clinical","mandatory":true,"path_order":5}]'::jsonb,
    '2026-05-26'),
  ('denovo', 'fda', 'fda-510k-2024', 'De Novo × FDA',
    '[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},
      {"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":2},
      {"key":"C","parent_key":null,"label":"Proposed classification","mandatory":true,"path_order":3},
      {"key":"D","parent_key":null,"label":"Performance testing","mandatory":true,"path_order":4},
      {"key":"E","parent_key":null,"label":"Labeling","mandatory":true,"path_order":5}]'::jsonb,
    '2026-05-26')
ON CONFLICT (doc_type, agency, version) DO NOTHING;

-- ── 3. Backfill fda_510k_projects → c2c_documents ────────────────────────────
--
-- One c2c_documents row per fda_510k_projects row.
-- ID: 'doc_fda510k_<id>' — deterministic, safe to re-run.
-- project_id stays NULL (fda_510k_projects.id is integer, not uuid).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fda_510k_projects'
  ) THEN
    INSERT INTO c2c_documents
      (id, org_id, project_id, doc_type, agency, rule_pack_version,
       title, status, readiness, created_at, updated_at)
    SELECT
      'doc_fda510k_' || p.id::text,
      p.organization_id,
      NULL,
      'k510',
      'fda',
      'fda-510k-2024',
      p.device_name,
      CASE WHEN p.locked_for_submission THEN 'locked' ELSE 'draft' END,
      COALESCE(p.overall_progress, 0),
      COALESCE(p.created_at, now()),
      COALESCE(p.updated_at, now())
    FROM fda_510k_projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM c2c_documents d
      WHERE d.id = 'doc_fda510k_' || p.id::text
    );
    RAISE NOTICE 'fda_510k_projects → c2c_documents: done';
  ELSE
    RAISE NOTICE 'fda_510k_projects not present — skipping k510 document backfill';
  END IF;
END $$;

-- ── 4. Backfill cerv2_510k_sections → c2c_document_sections ──────────────────
--
-- Link: cerv2_510k_sections.document_id → fda_510k_documents.id
--              → fda_510k_documents.project_id → fda_510k_projects.id
--              → c2c_documents via 'doc_fda510k_<project_id>'
--
-- content (text) is wrapped: {"paragraphs":[{"id":"…","text":"…","prov":"legacy"}]}
-- status mapping: 'todo'→'todo', 'drafting'→'drafted', 'validated'→'approved'.
-- Sections with NULL document_id cannot be reliably attributed; skipped.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cerv2_510k_sections'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fda_510k_documents'
    ) THEN
      INSERT INTO c2c_document_sections
        (document_id, section_key, parent_key, label, path_order,
         mandatory, status, content, draft_source, drafted_at, accepted_at, version)
      SELECT
        'doc_fda510k_' || fd.project_id::text,
        s.section_key,
        NULL,
        COALESCE(s.section_title, s.section_key),
        COALESCE(s.display_order, 0),
        COALESCE(s.is_required, false),
        CASE s.status
          WHEN 'drafting'  THEN 'drafted'
          WHEN 'validated' THEN 'approved'
          ELSE 'todo'
        END,
        CASE
          WHEN s.content IS NOT NULL AND s.content <> ''
            THEN jsonb_build_object(
                   'paragraphs', jsonb_build_array(jsonb_build_object(
                     'id',   gen_random_uuid()::text,
                     'text', s.content,
                     'prov', 'legacy'
                   ))
                 )
          ELSE '{}'::jsonb
        END,
        s.draft_source,
        s.drafted_at,
        s.accepted_at,
        1
      FROM cerv2_510k_sections s
      JOIN fda_510k_documents fd ON fd.id = s.document_id
      WHERE s.document_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM c2c_documents d
          WHERE d.id = 'doc_fda510k_' || fd.project_id::text
        )
      ON CONFLICT (document_id, section_key) DO NOTHING;
      RAISE NOTICE 'cerv2_510k_sections → c2c_document_sections (via fda_510k_documents): done';
    ELSE
      -- fda_510k_documents absent: link by organisation + doc_type only.
      -- Each section goes to the first (or only) c2c_documents row for the org.
      INSERT INTO c2c_document_sections
        (document_id, section_key, parent_key, label, path_order,
         mandatory, status, content, draft_source, drafted_at, accepted_at, version)
      SELECT DISTINCT ON (d.id, s.section_key)
        d.id,
        s.section_key,
        NULL,
        COALESCE(s.section_title, s.section_key),
        COALESCE(s.display_order, 0),
        COALESCE(s.is_required, false),
        CASE s.status
          WHEN 'drafting'  THEN 'drafted'
          WHEN 'validated' THEN 'approved'
          ELSE 'todo'
        END,
        CASE
          WHEN s.content IS NOT NULL AND s.content <> ''
            THEN jsonb_build_object(
                   'paragraphs', jsonb_build_array(jsonb_build_object(
                     'id',   gen_random_uuid()::text,
                     'text', s.content,
                     'prov', 'legacy'
                   ))
                 )
          ELSE '{}'::jsonb
        END,
        s.draft_source,
        s.drafted_at,
        s.accepted_at,
        1
      FROM cerv2_510k_sections s
      JOIN c2c_documents d
        ON d.doc_type = 'k510' AND d.org_id = s.organization_id
      ORDER BY d.id, s.section_key, s.id
      ON CONFLICT (document_id, section_key) DO NOTHING;
      RAISE NOTICE 'cerv2_510k_sections → c2c_document_sections (org-level fallback): done';
    END IF;
  ELSE
    RAISE NOTICE 'cerv2_510k_sections not present — skipping k510 section backfill';
  END IF;
END $$;

-- ── 5. Backfill cer_reports → c2c_documents ──────────────────────────────────
--
-- One c2c_documents row per cer_reports row.
-- ID: 'doc_cer_<id>'
-- cer_reports.status values are not CHECK-constrained; mapped defensively.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cer_reports'
  ) THEN
    INSERT INTO c2c_documents
      (id, org_id, project_id, doc_type, agency, rule_pack_version,
       title, status, readiness, created_at, updated_at)
    SELECT
      'doc_cer_' || r.id::text,
      r.organization_id,
      NULL,
      'cer',
      'ema',
      'eu-mdr-2017-745',
      COALESCE(r.device_name, r.report_id),
      CASE r.status
        WHEN 'draft'     THEN 'draft'
        WHEN 'review'    THEN 'review'
        WHEN 'approved'  THEN 'approved'
        WHEN 'locked'    THEN 'locked'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'complete'  THEN 'approved'
        WHEN 'final'     THEN 'approved'
        ELSE 'draft'
      END,
      0,
      COALESCE(r.created_at, now()),
      COALESCE(r.updated_at, now())
    FROM cer_reports r
    WHERE NOT EXISTS (
      SELECT 1 FROM c2c_documents d
      WHERE d.id = 'doc_cer_' || r.id::text
    );
    RAISE NOTICE 'cer_reports → c2c_documents: done';
  ELSE
    RAISE NOTICE 'cer_reports not present — skipping cer document backfill';
  END IF;
END $$;

-- ── 6. Backfill cer_sections → c2c_document_sections ─────────────────────────
--
-- cer_sections.content is json (not text); cast to jsonb.  If the existing
-- shape already has a "paragraphs" key it is preserved; otherwise the raw
-- json is stored under "paragraphs" as a single-element array.
-- cer_sections.section_id (text) → section_key.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cer_sections'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cer_reports'
  ) THEN
    INSERT INTO c2c_document_sections
      (document_id, section_key, parent_key, label, path_order,
       mandatory, status, content, version)
    SELECT
      'doc_cer_' || r.id::text,
      s.section_id,
      NULL,
      s.title,
      s.order,
      false,
      CASE s.status
        WHEN 'draft'    THEN 'drafted'
        WHEN 'review'   THEN 'review'
        WHEN 'approved' THEN 'approved'
        WHEN 'locked'   THEN 'locked'
        ELSE 'todo'
      END,
      CASE
        WHEN s.content IS NOT NULL
          THEN COALESCE(s.content::jsonb, '{}'::jsonb)
        ELSE '{}'::jsonb
      END,
      1
    FROM cer_sections s
    JOIN cer_reports r ON r.report_id = s.report_id
    WHERE EXISTS (
      SELECT 1 FROM c2c_documents d
      WHERE d.id = 'doc_cer_' || r.id::text
    )
    ON CONFLICT (document_id, section_key) DO NOTHING;
    RAISE NOTICE 'cer_sections → c2c_document_sections: done';
  ELSE
    RAISE NOTICE 'cer_sections / cer_reports not present — skipping cer section backfill';
  END IF;
END $$;

-- ── 7. Backfill pma_submissions → c2c_documents ──────────────────────────────
--
-- PMA has no legacy sections table — empty document rows only.
-- ID: 'doc_pma_<id>'
-- pma_submissions.submission_status is not CHECK-constrained; mapped defensively.
-- Title: pma_number when assigned, else 'PMA-<id>'.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pma_submissions'
  ) THEN
    INSERT INTO c2c_documents
      (id, org_id, project_id, doc_type, agency, rule_pack_version,
       title, status, readiness, created_at, updated_at)
    SELECT
      'doc_pma_' || sub.id::text,
      sub.organization_id,
      NULL,
      'pma',
      'fda',
      'fda-pma-2024',
      COALESCE(sub.pma_number, 'PMA-' || sub.id::text),
      CASE sub.submission_status
        WHEN 'draft'       THEN 'draft'
        WHEN 'review'      THEN 'review'
        WHEN 'under_review' THEN 'review'
        WHEN 'approved'    THEN 'approved'
        WHEN 'cleared'     THEN 'approved'
        WHEN 'locked'      THEN 'locked'
        WHEN 'submitted'   THEN 'submitted'
        WHEN 'archived'    THEN 'archived'
        ELSE 'draft'
      END,
      0,
      COALESCE(sub.created_at, now()),
      COALESCE(sub.updated_at, now())
    FROM pma_submissions sub
    WHERE NOT EXISTS (
      SELECT 1 FROM c2c_documents d
      WHERE d.id = 'doc_pma_' || sub.id::text
    );
    RAISE NOTICE 'pma_submissions → c2c_documents: done';
  ELSE
    RAISE NOTICE 'pma_submissions not present — skipping pma document backfill';
  END IF;
END $$;

-- ── 8. Backfill regulatory_programs (biopharma + device) → c2c_documents ──────
--
-- One c2c_documents row per regulatory_programs row where program_type maps to
-- a doc_type that has a seeded rule pack for the program's primary_agency.
-- Only programs not already covered (e.g., 510K/PMA regulatory_programs that
-- already have a fda_510k_projects or pma_submissions entry) are inserted.
--
-- agency mapping: primary_agency is stored as 'FDA','EMA','PMDA','HC','MHRA',
-- 'ICH','TGA','NMPA','MFDS' (values from regulatory_programs schema).
-- Lower-cased to match c2c_documents.agency CHECK values.
--
-- Programs with unknown (doc_type, agency) pairs — i.e., no rule pack exists —
-- are silently skipped by the JOIN on c2c_rule_packs.
--
-- ID: 'doc_rp_<id_without_dashes>'  (regulatory_programs.id is uuid)

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulatory_programs'
  ) THEN
    INSERT INTO c2c_documents
      (id, org_id, project_id, doc_type, agency, rule_pack_version,
       title, status, readiness, created_at, updated_at)
    SELECT
      'doc_rp_' || replace(p.id::text, '-', ''),
      p.organization_id,
      p.id,
      CASE p.program_type
        WHEN 'IND'     THEN 'ind'
        WHEN 'CTA'     THEN 'cta'
        WHEN 'NDA'     THEN 'nda'
        WHEN 'BLA'     THEN 'bla'
        WHEN 'MAA'     THEN 'maa'
        WHEN 'JNDA'    THEN 'jnda'
        WHEN '510K'    THEN 'k510'
        WHEN 'PMA'     THEN 'pma'
        WHEN 'CER'     THEN 'cer'
        WHEN 'DE_NOVO' THEN 'denovo'
      END,
      LOWER(p.primary_agency),
      rp.version,
      p.product_name,
      CASE p.status
        WHEN 'draft'     THEN 'draft'
        WHEN 'active'    THEN 'draft'
        WHEN 'in_review' THEN 'review'
        WHEN 'submitted' THEN 'submitted'
        WHEN 'approved'  THEN 'approved'
        WHEN 'rejected'  THEN 'archived'
        WHEN 'archived'  THEN 'archived'
        ELSE 'draft'
      END,
      COALESCE(p.progress_percent, 0),
      COALESCE(p.created_at, now()),
      COALESCE(p.updated_at, now())
    FROM regulatory_programs p
    -- Filter to (doc_type, agency) pairs that have a seeded rule pack.
    -- Programs with no matching pack are silently skipped by this JOIN.
    JOIN c2c_rule_packs rp
      ON rp.doc_type = CASE p.program_type
                         WHEN 'IND'     THEN 'ind'
                         WHEN 'CTA'     THEN 'cta'
                         WHEN 'NDA'     THEN 'nda'
                         WHEN 'BLA'     THEN 'bla'
                         WHEN 'MAA'     THEN 'maa'
                         WHEN 'JNDA'    THEN 'jnda'
                         WHEN '510K'    THEN 'k510'
                         WHEN 'PMA'     THEN 'pma'
                         WHEN 'CER'     THEN 'cer'
                         WHEN 'DE_NOVO' THEN 'denovo'
                       END
     AND rp.agency = LOWER(p.primary_agency)
     AND rp.superseded_by IS NULL
    WHERE p.program_type IN ('IND','CTA','NDA','BLA','MAA','JNDA','510K','PMA','CER','DE_NOVO')
      AND p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM c2c_documents d
        WHERE d.id = 'doc_rp_' || replace(p.id::text, '-', '')
      );
    RAISE NOTICE 'regulatory_programs → c2c_documents: done';
  ELSE
    RAISE NOTICE 'regulatory_programs not present — skipping biopharma backfill';
  END IF;
END $$;

-- ── 9. Revoke write path on legacy section tables ────────────────────────────
--
-- Keep tables READ-ONLY for one release cycle so existing reports continue
-- to work.  Run DROP in a separate migration after ≥30 days of zero 5xx on
-- the legacy routes (tracked by monitoring brief).
--
-- Only issued if application_role exists (bare-CI / Neon-preview envs skip).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_role') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'cerv2_510k_sections'
    ) THEN
      REVOKE INSERT, UPDATE, DELETE ON cerv2_510k_sections FROM application_role;
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'cer_sections'
    ) THEN
      REVOKE INSERT, UPDATE, DELETE ON cer_sections FROM application_role;
    END IF;
    RAISE NOTICE 'Write revoked on legacy section tables from application_role';
  ELSE
    RAISE NOTICE 'application_role not found — skipping REVOKE (dev/CI env)';
  END IF;
END $$;

COMMIT;
