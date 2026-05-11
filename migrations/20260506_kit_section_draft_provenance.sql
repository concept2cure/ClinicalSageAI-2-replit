-- 20260506_kit_section_draft_provenance.sql
--
-- Add draft-provenance columns to cerv2_510k_sections so the MDX surfaces
-- (K510Surface, PmaSurface, CerSurface) can render an "AnA drafted this —
-- accept / refine" affordance after the write_kit_section tool persists a
-- drafted section. Without these columns the kit can't distinguish a
-- human-typed draft from an AnA-authored one, and the user has no way to
-- accept the draft into a reviewed state.
--
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE cerv2_510k_sections
  ADD COLUMN IF NOT EXISTS draft_source     text,            -- 'ana' | 'ana_template' | 'human' | NULL
  ADD COLUMN IF NOT EXISTS drafted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS drafted_summary  text,            -- one-line summary written by the tool
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz,     -- set when a human accepts the AnA draft
  ADD COLUMN IF NOT EXISTS accepted_by      integer;         -- users.id who accepted

CREATE INDEX IF NOT EXISTS cerv2_sections_draft_source_idx
  ON cerv2_510k_sections (organization_id, draft_source)
  WHERE draft_source IS NOT NULL;

-- Unique key for upsert — one row per (organization_id, section_key).
-- The seed-mdx-content.mjs script already populates one row per section_key
-- per org; this constraint formalizes the invariant the write_kit_section
-- tool relies on for ON CONFLICT semantics.
CREATE UNIQUE INDEX IF NOT EXISTS cerv2_sections_org_key_uniq
  ON cerv2_510k_sections (organization_id, section_key);
