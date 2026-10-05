-- ============================================================================
-- c2c_rule_packs: record what each outline was actually built FROM.
--
-- ── The problem ─────────────────────────────────────────────────────────────
-- Every rule pack in this table is presented to a filer identically. But they
-- are not alike:
--
--   • nda:fda   is the ICH M4 CTD — an international harmonised standard whose
--               module structure is published and stable.
--   • pma:fda   is transcribed from 21 CFR 814.20(b), which enumerates its own
--               contents in the regulation text.
--   • A UK device registration outline has NO enumerated statutory annex to
--               transcribe — UK MDR 2002 incorporates its essential
--               requirements by reference from the underlying Directives — so
--               any outline for it is a reasoned construction against the
--               regulation's obligations.
--
-- The first two are transcriptions. The third is a judgement. The table could
-- not tell them apart, so the product asserted all three with the same
-- authority. A customer building a submission against a reasoned construction
-- had no way to know that is what they were doing.
--
-- That is the falsehood this migration removes. It does not make any outline
-- more or less correct; it makes the record say which is which.
--
-- ── Why the default is the conservative one ─────────────────────────────────
-- The backfill sets every pack to ('undeclared','unknown','unreviewed') FIRST
-- and only then applies the specific attestations below. So a pack I failed to
-- enumerate is under-claimed, never over-claimed. Getting the list wrong can
-- cost visibility; it cannot manufacture authority.
--
-- ── review_status is 'unreviewed' for ALL of them, including FDA ────────────
-- Not a hedge. No pack in this table has been signed off by a regulatory
-- professional, including the ones transcribed from primary regulation text.
-- Transcription can be faithful and still be the wrong pathway for a given
-- product. Marking the FDA packs 'reviewed' because they feel safer would be
-- the same substitution this codebase already refuses elsewhere.
--
-- Guarded with to_regclass: c2c_rule_packs originates from drizzle push, so a
-- fresh database may run this before the table exists.
--
-- ── Amended in place 2026-10-05 (step g-csr-pack-provenance-amend) ──────────
-- WHAT CHANGED. Step 2 attested every `version LIKE 'ich-m4-%'` pack as
-- 'ICH M4 …' / harmonised_standard / high. That matched the csr:ich, ib:ich
-- and protocol:ich packs too, only because 20260528 seeded them under the
-- version label 'ich-m4-v2.0'. ICH M4 organises the CTD (Modules 1-5); it does
-- not define the structure of a clinical study report, an investigator's
-- brochure or a protocol. GET /api/c2c/rule-packs therefore served a false,
-- high-confidence basis for all three on every deploy.
--   • Step 2 now excludes doc_type csr, ib and protocol.
--   • A new step 2b attests those three as what they are: partial outlines
--     against ICH E3 (csr: 8 of E3's 16 top-level sections), ICH E6(R3)
--     Appendix A (ib) and ICH M11 / E6(R3) Appendix B (protocol), as
--     reasoned_construction with confidence 'low'.
-- WHY STEP 2b SETS VALUES RATHER THAN RELYING ON THE NARROWING. Every deploy
--   before this amendment already wrote the M4 values into those rows, and
--   step 1 only COALESCEs NULLs, so narrowing step 2 alone would leave the false
--   claim in every existing database forever. Step 2b is an unconditional,
--   idempotent assignment scoped to the exact (doc_type, agency, version) rows.
-- WHY IN PLACE. CLAUDE.md Rule 1: this file creates these values and re-runs on
--   every deploy. A later corrective file would leave this one re-asserting the
--   M4 claim on every run, to be undone a few files later — the
--   create-then-undo pairing Rule 1 forbids. review_status stays 'unreviewed'
--   (20260810d attribution constraint).
--   The journal will record this content-hash change as drift.
-- Pinned by tests/schema-contract/c2c-rule-pack-outlines.contract.test.ts
-- ("the csr, ib and protocol packs do not claim ICH M4 provenance").
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs absent — skipping provenance migration.';
    RETURN;
  END IF;

  ALTER TABLE c2c_rule_packs
    ADD COLUMN IF NOT EXISTS source_basis   text,
    ADD COLUMN IF NOT EXISTS confidence     text,
    ADD COLUMN IF NOT EXISTS review_status  text,
    ADD COLUMN IF NOT EXISTS governing_rule text,
    ADD COLUMN IF NOT EXISTS uncertainties  text;

  -- 1 ── conservative default for every existing row, applied before any
  --      specific attestation, so omissions under-claim.
  UPDATE c2c_rule_packs SET
    source_basis  = COALESCE(source_basis,  'undeclared'),
    confidence    = COALESCE(confidence,    'unknown'),
    review_status = COALESCE(review_status, 'unreviewed');

  -- 2 ── ICH M4 CTD. An international harmonised standard, not one agency's
  --      regulation. The module spine is published and stable.
  --      csr, ib and protocol carry an 'ich-m4-' version label from 20260528
  --      but are not CTD outlines; they are attested in 2b (amended 2026-10-05).
  UPDATE c2c_rule_packs SET
    source_basis   = 'harmonised_standard',
    confidence     = 'high',
    governing_rule = 'ICH M4 — Organisation of the Common Technical Document for the Registration of Pharmaceuticals for Human Use'
  WHERE version LIKE 'ich-m4-%' AND doc_type NOT IN ('csr', 'ib', 'protocol');

  -- 2b ── (added 2026-10-05) The three document outlines 20260528 seeded under
  --       an ICH M4 version label. Each is a partial outline of its real
  --       guideline, built by hand, so: reasoned_construction, low. These are
  --       explicit assignments, not COALESCEs, because pre-amendment deploys
  --       already wrote the M4 values into these rows.
  UPDATE c2c_rule_packs SET
    source_basis   = 'reasoned_construction',
    confidence     = 'low',
    governing_rule = 'ICH E3 headings, partial outline: 8 of 16 top-level sections; the platform''s E3 tree is server/services/ind/ctd/csr-e3-guidance.ts',
    uncertainties  = 'Seeded under the version label ich-m4-v2.0, which is historical and not a claim of ICH M4 structure. Holds E3 sections 1, 6, 7, 8, 9, 11, 12 and 13 only, with no subsections. Not reviewed by a regulatory professional.'
  WHERE doc_type = 'csr' AND agency = 'ich' AND version = 'ich-m4-v2.0';

  UPDATE c2c_rule_packs SET
    source_basis   = 'reasoned_construction',
    confidence     = 'low',
    governing_rule = 'ICH E6(R3) Appendix A (Investigator''s Brochure), partial outline: 6 top-level content headings, no subsections',
    uncertainties  = 'Seeded under the version label ich-m4-v2.0, which is historical and not a claim of ICH M4 structure. Not reviewed by a regulatory professional.'
  WHERE doc_type = 'ib' AND agency = 'ich' AND version = 'ich-m4-v2.0';

  UPDATE c2c_rule_packs SET
    source_basis   = 'reasoned_construction',
    confidence     = 'low',
    governing_rule = 'ICH M11 (CeSHarP) / ICH E6(R3) Appendix B (protocol), partial outline: 9 top-level headings, not numbered to the M11 template, no subsections',
    uncertainties  = 'Seeded under the version label ich-m4-v2.0, which is historical and not a claim of ICH M4 structure. Not reviewed by a regulatory professional.'
  WHERE doc_type = 'protocol' AND agency = 'ich' AND version = 'ich-m4-v2.0';

  -- 3 ── Outlines transcribed from a regulation that enumerates its own
  --      contents. The structure is read off the rule text, not constructed.
  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = '21 CFR 314.94 — Content and format of an abbreviated application'
  WHERE doc_type = 'anda' AND agency = 'fda';

  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = '21 CFR 812.20, 812.25, 812.27 — IDE application, investigational plan, report of prior investigations'
  WHERE doc_type = 'ide' AND agency = 'fda';

  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = '21 CFR 814.20(b) — Application contents',
    uncertainties  = 'Transcribed from the regulation text. Not reviewed by a regulatory professional; confirm module placement and current FDA guidance before filing.'
  WHERE doc_type = 'pma' AND agency = 'fda';

  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = 'Regulation (EU) No 536/2014, Annex I — Application dossier (Part I and Part II)'
  WHERE doc_type = 'cta' AND agency = 'ema';

  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = 'Regulation (EU) 2017/745 (MDR), Annex II — Technical documentation, and Annex III — Post-market surveillance',
    uncertainties  = 'Transcribed from the Annex structure. Not reviewed by a regulatory professional; Notified Body expectations vary by device class and by body.'
  WHERE doc_type = 'mdr' AND agency = 'ema';

  UPDATE c2c_rule_packs SET
    source_basis   = 'statutory_transcription',
    confidence     = 'high',
    governing_rule = 'Regulation (EU) 2017/746 (IVDR), Annex II — Technical documentation, and Annex III — Post-market surveillance',
    uncertainties  = 'Transcribed from the Annex structure. Not reviewed by a regulatory professional; Notified Body expectations vary by device class and by body.'
  WHERE doc_type = 'ivdr' AND agency = 'ema';

  -- 4 ── Constraints applied AFTER the backfill so they can be enforced
  --      without failing on pre-existing rows.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_rule_packs_source_basis_check') THEN
    ALTER TABLE c2c_rule_packs ADD CONSTRAINT c2c_rule_packs_source_basis_check
      CHECK (source_basis IN (
        'statutory_transcription',  -- the regulation enumerates its own contents
        'harmonised_standard',      -- ICH M4 and equivalents
        'guidance_transcription',   -- an agency guidance document's structure
        'reasoned_construction',    -- no enumerated structure exists; built from obligations
        'undeclared'                -- not yet attested. Never treat as verified.
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_rule_packs_confidence_check') THEN
    ALTER TABLE c2c_rule_packs ADD CONSTRAINT c2c_rule_packs_confidence_check
      CHECK (confidence IN ('high', 'medium', 'low', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_rule_packs_review_status_check') THEN
    ALTER TABLE c2c_rule_packs ADD CONSTRAINT c2c_rule_packs_review_status_check
      CHECK (review_status IN ('unreviewed', 'reviewed'));
  END IF;

  ALTER TABLE c2c_rule_packs
    ALTER COLUMN source_basis  SET NOT NULL,
    ALTER COLUMN confidence    SET NOT NULL,
    ALTER COLUMN review_status SET NOT NULL;

  ALTER TABLE c2c_rule_packs ALTER COLUMN source_basis  SET DEFAULT 'undeclared';
  ALTER TABLE c2c_rule_packs ALTER COLUMN confidence    SET DEFAULT 'unknown';
  ALTER TABLE c2c_rule_packs ALTER COLUMN review_status SET DEFAULT 'unreviewed';

  RAISE NOTICE 'c2c_rule_packs provenance columns added and backfilled.';
END $$;

COMMIT;
