-- ═══════════════════════════════════════════════════════════════════════════════
-- cta:ema — the real CTR 536/2014 outline
--
-- WHAT THIS CLOSES
-- `cta:ema` shipped Module 1 plus a bare Module 2 and nothing else. The contract
-- test at tests/schema-contract/c2c-rule-pack-outlines.contract.test.ts recorded
-- it as known-thin rather than exempting it, with a tripwire that FAILS the
-- moment someone gives it a real outline — so the thin pack could not go quiet.
-- This is that moment; the tripwire is updated in the same change.
--
-- It also could not be reached: 'cta' is a legal doc_type and PROGRAM_TO_DOC_TYPE
-- maps it, but VALID_PROGRAM_TYPES in server/routes/c2c/projects.ts omitted it,
-- so POST /api/c2c/projects rejected every attempt to create one. A built
-- capability behind a closed gate. The gate opens in this change too, because
-- opening it earlier would have handed customers a two-node dossier for a real
-- submission — the exact hollow-outline failure 20260804 existed to end.
--
-- WHY THIS SHAPE AND NOT M1-M5
-- An EU clinical trial application under Regulation (EU) No 536/2014 is not a
-- five-module CTD. Annex I defines a lettered set split across two assessment
-- parts: Part I (A-J) is assessed jointly by the Member States concerned and
-- covers the science and the product; Part II (K-R) is assessed nationally and
-- covers ethics, sites, insurance and data protection. Forcing M1-M5 onto it
-- would assert the wrong shape, which is why the companion contract test
-- excludes cta from its five-module assertion by name.
--
-- The IMPD (G) carries the CTD-like quality split (G.1.S / G.1.P) because that
-- is how Annex I structures it, not because it is a CTD.
--
-- WHY A NEW VERSION RATHER THAN AN UPDATE
-- Same reason as 20260804: c2c_rule_packs is keyed (doc_type, agency, version)
-- and c2c_documents carries a composite FK to it. Rewriting required_sections in
-- place would silently change the content of a pack that already-scaffolded
-- documents claim to have been built against — in a Part 11 table that is a
-- falsified record, not a shortcut.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Guarded exactly as 20260804 is: this file lives in the durable apply-set
-- (scripts/db/migration-set.mjs), which runs against databases that may never
-- have had the Phase 9 schema applied — c2c_rule_packs is created by drizzle
-- push from shared/schema.ts, not by a migration in the set. Without the guard
-- the whole set fails on 'relation c2c_rule_packs does not exist', which is how
-- the tenant-isolation sweep caught this before it shipped.
DO $mig$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping cta:ema CTR outline';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('cta', 'ema', 'ctr-536-2014-annex-i-v1.0',
     'CTA × EMA · CTR 536/2014 Annex I (Part I + Part II)',
     '[{"key":"PI","parent_key":null,"label":"Part I · Scientific and medicinal-product assessment (jointly assessed)","mandatory":true,"path_order":1},{"key":"A","parent_key":"PI","label":"A · Introduction and general principles","mandatory":true,"path_order":2},{"key":"B","parent_key":"PI","label":"B · Cover letter","mandatory":true,"path_order":3},{"key":"C","parent_key":"PI","label":"C · EU application form","mandatory":true,"path_order":4},{"key":"D","parent_key":"PI","label":"D · Protocol","mandatory":true,"path_order":5},{"key":"E","parent_key":"PI","label":"E · Investigator''s brochure (IB)","mandatory":true,"path_order":6},{"key":"F","parent_key":"PI","label":"F · Documentation relating to compliance with GMP for the IMP","mandatory":true,"path_order":7},{"key":"G","parent_key":"PI","label":"G · Investigational medicinal product dossier (IMPD)","mandatory":true,"path_order":8},{"key":"G.1","parent_key":"G","label":"G.1 · IMPD — Quality data","mandatory":true,"path_order":9},{"key":"G.1.S","parent_key":"G.1","label":"G.1.S · Drug substance","mandatory":true,"path_order":10},{"key":"G.1.P","parent_key":"G.1","label":"G.1.P · Drug product","mandatory":true,"path_order":11},{"key":"G.1.A","parent_key":"G.1","label":"G.1.A · Appendices (facilities, adventitious agents)","mandatory":false,"path_order":12},{"key":"G.2","parent_key":"G","label":"G.2 · IMPD — Non-clinical pharmacology and toxicology","mandatory":true,"path_order":13},{"key":"G.3","parent_key":"G","label":"G.3 · IMPD — Previous clinical trial and human experience","mandatory":true,"path_order":14},{"key":"G.4","parent_key":"G","label":"G.4 · Overall risk and benefit assessment","mandatory":true,"path_order":15},{"key":"H","parent_key":"PI","label":"H · Auxiliary medicinal product dossier (AxMPD)","mandatory":false,"path_order":16},{"key":"I","parent_key":"PI","label":"I · Scientific advice and paediatric investigation plan (PIP)","mandatory":false,"path_order":17},{"key":"J","parent_key":"PI","label":"J · Content of the labelling of the investigational medicinal products","mandatory":true,"path_order":18},{"key":"PII","parent_key":null,"label":"Part II · National and ethics assessment (per Member State concerned)","mandatory":true,"path_order":19},{"key":"K","parent_key":"PII","label":"K · Recruitment arrangements","mandatory":true,"path_order":20},{"key":"L","parent_key":"PII","label":"L · Subject information, informed consent form and consent procedure","mandatory":true,"path_order":21},{"key":"M","parent_key":"PII","label":"M · Suitability of the investigator","mandatory":true,"path_order":22},{"key":"N","parent_key":"PII","label":"N · Suitability of the facilities","mandatory":true,"path_order":23},{"key":"O","parent_key":"PII","label":"O · Proof of insurance cover or indemnification","mandatory":true,"path_order":24},{"key":"P","parent_key":"PII","label":"P · Financial and other arrangements","mandatory":false,"path_order":25},{"key":"Q","parent_key":"PII","label":"Q · Proof of payment of fee","mandatory":false,"path_order":26},{"key":"R","parent_key":"PII","label":"R · Proof that data will be processed in compliance with Union data-protection law","mandatory":true,"path_order":27}]'::jsonb,
     'CTIS',
     now())
  ON CONFLICT (doc_type, agency, version) DO NOTHING;
  
  -- Supersede the thin pack, pointing at its replacement.
  UPDATE c2c_rule_packs
     SET superseded_by = 'ctr-536-2014-annex-i-v1.0'
   WHERE doc_type = 'cta'
     AND agency = 'ema'
     AND version <> 'ctr-536-2014-annex-i-v1.0'
     AND superseded_by IS NULL;
END
$mig$;
