-- ============================================================================
-- Phase 9 — Document schema unification (c2c_documents family) · Day 1
--
-- Lands the universal authoring data model:
--   c2c_rule_packs                  — (doc_type, agency, version) registry
--   c2c_documents                   — unified document row (replaces the
--                                     misnamed cerv2_510k_sections home for
--                                     510k / pma / cer + biopharma INDs/NDAs)
--   c2c_document_sections           — sectioned content
--   c2c_document_section_versions   — per-change snapshot (Part-11 history)
--   c2c_document_section_evidence   — section ↔ vault evidence links
--
-- Plus two triggers: readiness recompute + version snapshot.
-- Seeds 13 rule packs from ui_kits/authoring/data.jsx > AUTH_OUTLINES (115
-- sections). Day-2 backfill from legacy tables ships in a separate migration.
--
-- Type reconciliations vs PHASE_9_SCHEMA_MIGRATION_BRIEF.md (the brief assumed
-- a uuid-keyed user/org model; the live schema is integer-keyed):
--   org_id     : integer  — regulatory_programs.organization_id is integer
--   owner_id   : integer  — users.id is serial/integer (no FK; consistent with
--                           20260527_mutation_primitives.sql, so the migration
--                           runs on bare CI / Neon-preview schemas)
--   author_id  : integer  — same
--   linked_by  : integer  — same
--   project_id : uuid     — regulatory_programs.id IS uuid (FK kept)
--   artifact_id / template_id : text, NO FK — target tables not guaranteed in
--                           every schema state; relationship enforced at the
--                           application layer.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING). One txn.
-- ============================================================================

BEGIN;

-- ── 1. c2c_rule_packs — created first; c2c_documents has a composite FK to it ──

CREATE TABLE IF NOT EXISTS c2c_rule_packs (
  doc_type           text NOT NULL,
  agency             text NOT NULL,
  version            text NOT NULL,                          -- 'ich-m4-v2.0' | 'fda-510k-2024' | …
  label              text NOT NULL,                          -- 'IND × FDA'
  required_sections  jsonb NOT NULL,                         -- [{key, parent_key, label, mandatory, path_order}]
  validators         jsonb NOT NULL DEFAULT '[]'::jsonb,     -- Moat #1 lint rules (populated later)
  template_id        text,                                   -- no FK (account_template_registry not guaranteed)
  esubmit_channel    text,                                   -- 'ESG' | 'CESP' | 'PMDA' | …
  effective_from     date NOT NULL DEFAULT now(),
  superseded_by      text,
  PRIMARY KEY (doc_type, agency, version)
);

-- ── 2. c2c_documents — the unified document row ────────────────────────────────

CREATE TABLE IF NOT EXISTS c2c_documents (
  id                 text PRIMARY KEY,                       -- doc_<uuid>
  org_id             integer NOT NULL,
  project_id         uuid NOT NULL REFERENCES regulatory_programs(id),
  doc_type           text NOT NULL,
  agency             text NOT NULL,
  rule_pack_version  text NOT NULL,
  title              text NOT NULL,
  status             text NOT NULL DEFAULT 'draft',          -- draft | review | approved | locked | submitted | archived
  readiness          integer NOT NULL DEFAULT 0,             -- 0..100; recomputed by trigger
  owner_id           integer,
  artifact_id        text,                                   -- immutable snapshot on lock; no FK
  locked_at          timestamptz,
  submitted_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT c2c_documents_doc_type_check
    CHECK (doc_type IN ('ind','cta','nda','bla','maa','jnda','k510','denovo','pma','cer','psur',
                        'ib','protocol','csr','briefing','mod3','mod2','haq')),
  CONSTRAINT c2c_documents_agency_check
    CHECK (agency IN ('fda','ema','pmda','hc','mhra','ich','tga','nmpa','mfds')),
  CONSTRAINT c2c_documents_status_check
    CHECK (status IN ('draft','review','approved','locked','submitted','archived')),
  CONSTRAINT c2c_documents_rule_pack_fk
    FOREIGN KEY (doc_type, agency, rule_pack_version)
    REFERENCES c2c_rule_packs (doc_type, agency, version)
);

CREATE INDEX IF NOT EXISTS c2c_documents_project_idx ON c2c_documents (project_id);
CREATE INDEX IF NOT EXISTS c2c_documents_pack_idx    ON c2c_documents (doc_type, agency);
CREATE INDEX IF NOT EXISTS c2c_documents_owner_idx   ON c2c_documents (owner_id) WHERE owner_id IS NOT NULL;

-- ── 3. c2c_document_sections — sectioned content ───────────────────────────────

CREATE TABLE IF NOT EXISTS c2c_document_sections (
  id                 bigserial PRIMARY KEY,
  document_id        text NOT NULL REFERENCES c2c_documents(id) ON DELETE CASCADE,
  section_key        text NOT NULL,                          -- 'm2.5' | 'C2' | '3.2.S' | …
  parent_key         text,
  label              text NOT NULL,
  path_order         integer NOT NULL,
  mandatory          boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'todo',           -- todo | drafted | review | approved | locked
  owner_id           integer,
  content            jsonb NOT NULL DEFAULT '{}'::jsonb,      -- { paragraphs:[…], xml?, diff? }
  draft_source       text,                                   -- 'human' | 'ana' | 'imported' | 'template'
  drafted_at         timestamptz,
  accepted_by        integer,
  accepted_at        timestamptz,
  version            integer NOT NULL DEFAULT 1,

  CONSTRAINT c2c_doc_sections_status_check
    CHECK (status IN ('todo','drafted','review','approved','locked')),
  UNIQUE (document_id, section_key)
);

CREATE INDEX IF NOT EXISTS c2c_doc_sections_doc_idx    ON c2c_document_sections (document_id);
CREATE INDEX IF NOT EXISTS c2c_doc_sections_owner_idx  ON c2c_document_sections (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS c2c_doc_sections_status_idx ON c2c_document_sections (status) WHERE status IN ('todo','drafted','review');

-- ── 4. c2c_document_section_versions — per-change snapshot ──────────────────────

CREATE TABLE IF NOT EXISTS c2c_document_section_versions (
  id                 bigserial PRIMARY KEY,
  section_id         bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  content            jsonb NOT NULL,
  author_id          integer NOT NULL,
  author_kind        text NOT NULL DEFAULT 'human',          -- 'human' | 'ana'
  reason             text NOT NULL,                          -- Part-11 reason for change
  ana_action_id      text REFERENCES c2c_ana_actions(id),    -- backlink when AnA-mediated
  parent_version_id  bigint REFERENCES c2c_document_section_versions(id),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, version)
);

CREATE INDEX IF NOT EXISTS c2c_doc_section_versions_section_idx ON c2c_document_section_versions (section_id);

-- ── 5. c2c_document_section_evidence — section ↔ vault evidence ─────────────────

CREATE TABLE IF NOT EXISTS c2c_document_section_evidence (
  id                 bigserial PRIMARY KEY,
  section_id         bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  evidence_kind      text NOT NULL,                          -- 'artifact' | 'vault_doc' | 'rim_precedent' | 'guidance'
  evidence_ref       text NOT NULL,
  paragraph_id       text,                                   -- null = section-level cite
  confidence         numeric(3,2),
  linked_by          integer NOT NULL,
  linked_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c2c_doc_evidence_section_idx ON c2c_document_section_evidence (section_id);

-- ── 6. Triggers ────────────────────────────────────────────────────────────────
--
-- 6a. Readiness is computed, not stored. Recompute on section insert / status
--     change. Fires during Day-2 backfill INSERTs too (desirable).

CREATE OR REPLACE FUNCTION c2c_recompute_document_readiness() RETURNS trigger AS $$
BEGIN
  UPDATE c2c_documents d
  SET readiness = COALESCE((
        SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE s.status IN ('approved','locked'))
                     / NULLIF(COUNT(*), 0))::integer
        FROM c2c_document_sections s
        WHERE s.document_id = d.id
      ), 0),
      updated_at = now()
  WHERE d.id = NEW.document_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS c2c_doc_readiness_after_section ON c2c_document_sections;
CREATE TRIGGER c2c_doc_readiness_after_section
AFTER INSERT OR UPDATE OF status ON c2c_document_sections
FOR EACH ROW EXECUTE FUNCTION c2c_recompute_document_readiness();

-- 6b. Version snapshot on content change. BEFORE UPDATE only — backfill uses
--     INSERT so this never fires during backfill. The author_id + reason come
--     from per-request GUCs the route layer sets (app.actor_id / app.reason);
--     Part-11 requires both, so a content change with neither raises loudly
--     rather than writing an unattributed version row.

CREATE OR REPLACE FUNCTION c2c_snapshot_section_version() RETURNS trigger AS $$
DECLARE
  v_actor  text := current_setting('app.actor_id', true);
  v_reason text := current_setting('app.reason', true);
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    IF v_actor IS NULL OR v_actor = '' THEN
      RAISE EXCEPTION 'c2c_snapshot_section_version: app.actor_id GUC required for section content change (Part-11 attribution)';
    END IF;
    INSERT INTO c2c_document_section_versions
      (section_id, version, content, author_id, author_kind, reason)
    VALUES
      (NEW.id, OLD.version, OLD.content, v_actor::integer, 'human', COALESCE(NULLIF(v_reason, ''), 'content change'));
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS c2c_doc_section_version_before_update ON c2c_document_sections;
CREATE TRIGGER c2c_doc_section_version_before_update
BEFORE UPDATE ON c2c_document_sections
FOR EACH ROW EXECUTE FUNCTION c2c_snapshot_section_version();

-- ── 7. Seed c2c_rule_packs (13 packs / 115 sections from AUTH_OUTLINES) ─────────
--
-- Generated from ui_kits/authoring/data.jsx > AUTH_OUTLINES via
-- migrations/_generated/phase9_rule_packs.json. effective_from = launch date.

INSERT INTO c2c_rule_packs (doc_type, agency, version, label, required_sections, effective_from)
SELECT rp.doc_type, rp.agency, rp.version, rp.label, rp.required_sections, DATE '2026-05-26'
FROM jsonb_to_recordset($rulepacks$[{"doc_type":"ind","agency":"fda","version":"ich-m4-v2.0","label":"IND × FDA","required_sections":[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms (1571, 1572, 3674)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":4},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":false,"path_order":5},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":6},{"key":"2.2","parent_key":"M2","label":"Introduction","mandatory":true,"path_order":7},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":8},{"key":"2.4","parent_key":"M2","label":"Nonclinical overview","mandatory":true,"path_order":9},{"key":"2.5","parent_key":"M2","label":"Clinical overview","mandatory":true,"path_order":10},{"key":"2.6","parent_key":"M2","label":"Nonclinical written and tabulated summaries","mandatory":true,"path_order":11},{"key":"2.7","parent_key":"M2","label":"Clinical summary","mandatory":true,"path_order":12},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":13},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":14},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":15},{"key":"3.2.A","parent_key":"M3","label":"Appendices","mandatory":false,"path_order":16},{"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical","mandatory":true,"path_order":17},{"key":"4.2.1","parent_key":"M4","label":"Pharmacology","mandatory":true,"path_order":18},{"key":"4.2.2","parent_key":"M4","label":"Pharmacokinetics","mandatory":true,"path_order":19},{"key":"4.2.3","parent_key":"M4","label":"Toxicology","mandatory":true,"path_order":20},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical","mandatory":true,"path_order":21},{"key":"5.2","parent_key":"M5","label":"Tabular listings of studies","mandatory":true,"path_order":22},{"key":"5.3.5","parent_key":"M5","label":"Study reports of efficacy and safety","mandatory":true,"path_order":23},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":24}]},{"doc_type":"ind","agency":"mhra","version":"ich-m4-v2.0","label":"IND × MHRA","required_sections":[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (UK)","mandatory":true,"path_order":1},{"key":"1.0","parent_key":"M1","label":"Cover letter (UK)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Application form","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"SmPC, labeling, package leaflet","mandatory":true,"path_order":4}]},{"doc_type":"cta","agency":"ema","version":"ich-m4-v2.0","label":"CTA × EMA","required_sections":[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (EU)","mandatory":true,"path_order":1},{"key":"1.0","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Comprehensive ToC","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Product information","mandatory":true,"path_order":4},{"key":"1.4","parent_key":"M1","label":"Information on experts","mandatory":true,"path_order":5},{"key":"1.5","parent_key":"M1","label":"Specific requirements","mandatory":false,"path_order":6},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries (ICH)","mandatory":true,"path_order":7}]},{"doc_type":"k510","agency":"fda","version":"fda-510k-2024","label":"510(k) × FDA","required_sections":[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"FDA Form 3514","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Cover letter","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Indications for use","mandatory":true,"path_order":4},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":5},{"key":"B1","parent_key":"B","label":"Device description","mandatory":true,"path_order":6},{"key":"B2","parent_key":"B","label":"Technological comparison","mandatory":true,"path_order":7},{"key":"C","parent_key":null,"label":"Substantial equivalence","mandatory":true,"path_order":8},{"key":"C1","parent_key":"C","label":"Predicate device(s)","mandatory":true,"path_order":9},{"key":"C2","parent_key":"C","label":"SE discussion","mandatory":true,"path_order":10},{"key":"D","parent_key":null,"label":"Performance testing","mandatory":true,"path_order":11},{"key":"D1","parent_key":"D","label":"Bench testing","mandatory":true,"path_order":12},{"key":"D2","parent_key":"D","label":"Animal / clinical","mandatory":false,"path_order":13},{"key":"D3","parent_key":"D","label":"Biocompatibility","mandatory":true,"path_order":14},{"key":"D4","parent_key":"D","label":"Sterilization / shelf life","mandatory":true,"path_order":15},{"key":"D5","parent_key":"D","label":"Software","mandatory":false,"path_order":16},{"key":"D6","parent_key":"D","label":"Cybersecurity","mandatory":false,"path_order":17},{"key":"E","parent_key":null,"label":"Labeling","mandatory":true,"path_order":18}]},{"doc_type":"pma","agency":"fda","version":"fda-pma-2024","label":"PMA × FDA","required_sections":[{"key":"A","parent_key":null,"label":"Administrative information","mandatory":true,"path_order":1},{"key":"B","parent_key":null,"label":"Summary of safety and effectiveness data (SSED)","mandatory":true,"path_order":2},{"key":"C","parent_key":null,"label":"Preclinical studies","mandatory":true,"path_order":3},{"key":"D","parent_key":null,"label":"Clinical investigations","mandatory":true,"path_order":4},{"key":"E","parent_key":null,"label":"Manufacturing information","mandatory":true,"path_order":5},{"key":"F","parent_key":null,"label":"Labeling","mandatory":true,"path_order":6}]},{"doc_type":"cer","agency":"ema","version":"eu-mdr-2017-745","label":"Clinical Evaluation Report × EMA","required_sections":[{"key":"A0","parent_key":null,"label":"Scope of the clinical evaluation","mandatory":true,"path_order":1},{"key":"A1","parent_key":null,"label":"State of the art","mandatory":true,"path_order":2},{"key":"A2","parent_key":null,"label":"Device description and equivalence","mandatory":true,"path_order":3},{"key":"A3","parent_key":null,"label":"Clinical evaluation methodology","mandatory":true,"path_order":4},{"key":"A4","parent_key":null,"label":"Clinical data sources","mandatory":true,"path_order":5},{"key":"A5","parent_key":null,"label":"Appraisal of clinical data","mandatory":true,"path_order":6},{"key":"A6","parent_key":null,"label":"Risk-benefit analysis","mandatory":true,"path_order":7},{"key":"A7","parent_key":null,"label":"PMS / PMCF linkage","mandatory":true,"path_order":8},{"key":"A8","parent_key":null,"label":"Conclusions","mandatory":true,"path_order":9}]},{"doc_type":"psur","agency":"ema","version":"ich-e2c-r2","label":"PSUR / PBRER × EMA","required_sections":[{"key":"1","parent_key":null,"label":"Introduction","mandatory":true,"path_order":1},{"key":"2","parent_key":null,"label":"Worldwide marketing authorization status","mandatory":true,"path_order":2},{"key":"3","parent_key":null,"label":"Actions taken in the reporting interval for safety reasons","mandatory":true,"path_order":3},{"key":"5","parent_key":null,"label":"Estimated exposure and use patterns","mandatory":true,"path_order":4},{"key":"6","parent_key":null,"label":"Data in summary tabulations","mandatory":true,"path_order":5},{"key":"15","parent_key":null,"label":"Signal and risk evaluation","mandatory":true,"path_order":6},{"key":"17","parent_key":null,"label":"Benefit-risk analysis evaluation","mandatory":true,"path_order":7},{"key":"18","parent_key":null,"label":"Conclusions and actions","mandatory":true,"path_order":8}]},{"doc_type":"ib","agency":"ich","version":"ich-m4-v2.0","label":"Investigator Brochure × ICH harmonized","required_sections":[{"key":"1","parent_key":null,"label":"Summary","mandatory":true,"path_order":1},{"key":"2","parent_key":null,"label":"Introduction","mandatory":true,"path_order":2},{"key":"3","parent_key":null,"label":"Physical, chemical, pharmaceutical properties and formulation","mandatory":true,"path_order":3},{"key":"4","parent_key":null,"label":"Nonclinical studies","mandatory":true,"path_order":4},{"key":"5","parent_key":null,"label":"Effects in humans","mandatory":true,"path_order":5},{"key":"6","parent_key":null,"label":"Summary of data and guidance for the investigator","mandatory":true,"path_order":6}]},{"doc_type":"protocol","agency":"ich","version":"ich-m4-v2.0","label":"Protocol × ICH harmonized","required_sections":[{"key":"1","parent_key":null,"label":"General information","mandatory":true,"path_order":1},{"key":"2","parent_key":null,"label":"Background and rationale","mandatory":true,"path_order":2},{"key":"3","parent_key":null,"label":"Objectives and endpoints","mandatory":true,"path_order":3},{"key":"4","parent_key":null,"label":"Trial design","mandatory":true,"path_order":4},{"key":"5","parent_key":null,"label":"Population and selection criteria","mandatory":true,"path_order":5},{"key":"6","parent_key":null,"label":"Treatments and interventions","mandatory":true,"path_order":6},{"key":"7","parent_key":null,"label":"Assessments and procedures","mandatory":true,"path_order":7},{"key":"8","parent_key":null,"label":"Statistical considerations","mandatory":true,"path_order":8},{"key":"9","parent_key":null,"label":"Ethics, regulatory and quality oversight","mandatory":true,"path_order":9}]},{"doc_type":"csr","agency":"ich","version":"ich-m4-v2.0","label":"Clinical Study Report (E3) × ICH harmonized","required_sections":[{"key":"1","parent_key":null,"label":"Title page and synopsis","mandatory":true,"path_order":1},{"key":"6","parent_key":null,"label":"Investigators and admin","mandatory":true,"path_order":2},{"key":"7","parent_key":null,"label":"Introduction","mandatory":true,"path_order":3},{"key":"8","parent_key":null,"label":"Study objectives","mandatory":true,"path_order":4},{"key":"9","parent_key":null,"label":"Investigational plan","mandatory":true,"path_order":5},{"key":"11","parent_key":null,"label":"Efficacy evaluation","mandatory":true,"path_order":6},{"key":"12","parent_key":null,"label":"Safety evaluation","mandatory":true,"path_order":7},{"key":"13","parent_key":null,"label":"Discussion and overall conclusions","mandatory":true,"path_order":8}]},{"doc_type":"briefing","agency":"fda","version":"fda-meeting-2024","label":"Briefing Book × FDA","required_sections":[{"key":"1","parent_key":null,"label":"Introduction and purpose","mandatory":true,"path_order":1},{"key":"2","parent_key":null,"label":"Product overview","mandatory":true,"path_order":2},{"key":"3","parent_key":null,"label":"Development plan","mandatory":true,"path_order":3},{"key":"4","parent_key":null,"label":"Questions for the agency","mandatory":true,"path_order":4},{"key":"5","parent_key":null,"label":"Supporting summaries","mandatory":true,"path_order":5},{"key":"6","parent_key":null,"label":"Appendices","mandatory":false,"path_order":6}]},{"doc_type":"mod3","agency":"ich","version":"ich-m4-v2.0","label":"Module 3 · CMC × ICH harmonized","required_sections":[{"key":"3.2.S","parent_key":null,"label":"Drug substance","mandatory":true,"path_order":1},{"key":"3.2.P","parent_key":null,"label":"Drug product","mandatory":true,"path_order":2},{"key":"3.2.A","parent_key":null,"label":"Appendices","mandatory":false,"path_order":3},{"key":"3.2.R","parent_key":null,"label":"Regional information","mandatory":true,"path_order":4}]},{"doc_type":"mod2","agency":"ich","version":"ich-m4-v2.0","label":"Module 2 summaries × ICH harmonized","required_sections":[{"key":"2.2","parent_key":null,"label":"Introduction","mandatory":true,"path_order":1},{"key":"2.3","parent_key":null,"label":"Quality overall summary","mandatory":true,"path_order":2},{"key":"2.4","parent_key":null,"label":"Nonclinical overview","mandatory":true,"path_order":3},{"key":"2.5","parent_key":null,"label":"Clinical overview","mandatory":true,"path_order":4},{"key":"2.6","parent_key":null,"label":"Nonclinical written / tabulated summaries","mandatory":true,"path_order":5},{"key":"2.7","parent_key":null,"label":"Clinical summary","mandatory":true,"path_order":6}]}]$rulepacks$::jsonb)
  AS rp(doc_type text, agency text, version text, label text, required_sections jsonb)
ON CONFLICT (doc_type, agency, version) DO NOTHING;

COMMIT;
