-- ============================================================================
-- Translation Platform — regulated, tenant-isolated localization of
-- submission content (projects, segments, glossary/DNT registry, TM cache).
--
-- Central guardrail (enforced in the workflow state machine, surfaced here by
-- the provenance columns): a segment whose translation `method` is 'machine'
-- can NEVER reach a submission-approved status without human post-edit +
-- back-translation evidence (post_editor, reviewer, back_translation_verified,
-- approved_at). Machine translation is a DRAFT ACCELERATOR ONLY.
--
-- Do-not-translate identifiers (21 CFR / ICH citations, eCTD module labels,
-- agency names, INN / drug names, MedDRA terms, codes, JSON keys, slash
-- commands) are masked before translation and restored after — "translate
-- meaning, not identifiers" (cf. server/services/ana-ri/locale-overlays.ts).
-- The glossary_terms table is the DNT / forced-translation registry that
-- drives that masking.
--
-- Tenancy/audit mirror the platform: organization_id integer NOT NULL FK to
-- organizations(id); RLS is auto-installed by 0021_enable_rls_everywhere.sql.
-- Enum-like columns are CHECK-constrained (TS models them as text + union).
--
-- Schema: shared/schema.ts (translation_* / glossary_terms region)
-- ============================================================================

-- ─── Translation projects ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translation_projects (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  name                text NOT NULL,
  source_language     text NOT NULL,
  target_languages    text[] NOT NULL DEFAULT ARRAY[]::text[],
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_translation','in_review','approved','archived')),
  submission_context  text,
  description         text,
  metadata            jsonb DEFAULT '{}',
  created_by          integer NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS translation_projects_org_idx    ON translation_projects(organization_id);
CREATE INDEX IF NOT EXISTS translation_projects_status_idx ON translation_projects(organization_id, status);

-- ─── Translation segments (provenance-bearing units) ────────────────────────
CREATE TABLE IF NOT EXISTS translation_segments (
  id                        serial PRIMARY KEY,
  organization_id           integer NOT NULL REFERENCES organizations(id),
  project_id                integer NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
  target_language           text NOT NULL,
  segment_key               text NOT NULL,
  source_text               text NOT NULL,
  target_text               text,
  source_hash               text NOT NULL,
  method                    text NOT NULL DEFAULT 'machine'
                              CHECK (method IN ('human','machine','translation_memory')),
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','machine_translated','post_edited',
                                                'in_review','back_translation_pending','approved','rejected')),
  engine                    text,
  engine_version            text,
  post_editor               integer REFERENCES users(id),
  reviewer                  integer REFERENCES users(id),
  back_translation_verified boolean NOT NULL DEFAULT false,
  back_translation_text     text,
  approved_by               integer REFERENCES users(id),
  approved_at               timestamptz,
  metadata                  jsonb DEFAULT '{}',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz,
  -- Workflow guardrail: a machine-origin segment cannot be 'approved' without
  -- a human post-editor AND back-translation evidence on the row.
  CONSTRAINT translation_segments_machine_needs_postedit CHECK (
    NOT (status = 'approved' AND method = 'machine'
         AND (post_editor IS NULL OR back_translation_verified = false))
  )
);
CREATE INDEX IF NOT EXISTS translation_segments_org_idx     ON translation_segments(organization_id);
CREATE INDEX IF NOT EXISTS translation_segments_project_idx ON translation_segments(project_id);
CREATE INDEX IF NOT EXISTS translation_segments_status_idx  ON translation_segments(organization_id, status);
CREATE INDEX IF NOT EXISTS translation_segments_lang_idx    ON translation_segments(project_id, target_language);
CREATE INDEX IF NOT EXISTS translation_segments_hash_idx    ON translation_segments(source_hash);

-- ─── Glossary terms (DNT / preferred / forbidden registry) ──────────────────
CREATE TABLE IF NOT EXISTS glossary_terms (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  project_id          integer REFERENCES translation_projects(id) ON DELETE CASCADE,
  source_language     text NOT NULL,
  source_term         text NOT NULL,
  target_language     text,
  target_term         text,
  term_type           text NOT NULL DEFAULT 'preferred'
                        CHECK (term_type IN ('do_not_translate','preferred','forbidden')),
  case_sensitive      boolean NOT NULL DEFAULT false,
  notes               text,
  metadata            jsonb DEFAULT '{}',
  created_by          integer NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS glossary_terms_org_idx     ON glossary_terms(organization_id);
CREATE INDEX IF NOT EXISTS glossary_terms_project_idx ON glossary_terms(project_id);
CREATE INDEX IF NOT EXISTS glossary_terms_term_idx    ON glossary_terms(organization_id, source_term);

-- ─── Translation memory (exact-match reuse cache) ───────────────────────────
CREATE TABLE IF NOT EXISTS translation_memory_entries (
  id                  serial PRIMARY KEY,
  organization_id     integer NOT NULL REFERENCES organizations(id),
  source_language     text NOT NULL,
  target_language     text NOT NULL,
  source_text         text NOT NULL,
  target_text         text NOT NULL,
  source_hash         text NOT NULL,
  method              text NOT NULL DEFAULT 'human'
                        CHECK (method IN ('human','machine','translation_memory')),
  usage_count         integer NOT NULL DEFAULT 0,
  approved_for_reuse  boolean NOT NULL DEFAULT false,
  origin_segment_id   integer REFERENCES translation_segments(id) ON DELETE SET NULL,
  metadata            jsonb DEFAULT '{}',
  created_by          integer REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS translation_memory_org_idx  ON translation_memory_entries(organization_id);
CREATE INDEX IF NOT EXISTS translation_memory_hash_idx ON translation_memory_entries(organization_id, source_hash);
CREATE INDEX IF NOT EXISTS translation_memory_lang_idx ON translation_memory_entries(organization_id, source_language, target_language);
