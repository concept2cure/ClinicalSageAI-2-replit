-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Replace the retired FDA 3514 cover-sheet sections in the k510:fda and denovo:fda outlines with the eSTAR-era sections 21 CFR Part 807 makes mandatory.
--
-- eCTD/CTD Context:
--   - Module(s): Device premarket submission outlines (eSTAR 510(k) and De Novo) — the CTD Module 1 equivalent for CDRH
--   - Integrity Risk Addressed: a mandatory section that no longer exists — both packs demanded a cover sheet FDA retired when eSTAR became mandatory (510(k) 2023-10-01, De Novo 2025-10-01), while the 807.92/807.93, 807.87(k) and Class III items eSTAR asks for by name had no section at all
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Outline data only: section identity, order and mandatory flags.
--   - Idempotent reseed; authored content and filings are untouched.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- k510:fda and denovo:fda — the eSTAR-era outlines
--
-- WHAT THIS CLOSES
-- Both live packs required a "CDRH premarket review submission cover sheet
-- (FDA 3514)" as the first mandatory section. FDA retired the paper cover sheet
-- for 510(k) and De Novo when eSTAR became mandatory (510(k): 1 October 2023;
-- De Novo: 1 October 2025): the eSTAR itself captures that data. The De Novo
-- pack also demanded a "Table of contents" that eSTAR has no slot for.
--
-- The 510(k) pack (fda-510k-2024, 18 nodes from 20260528) additionally had no
-- section for the four items 21 CFR Part 807 makes mandatory and eSTAR asks for
-- by name — the 510(k) summary or statement (807.92/807.93), the truthful and
-- accuracy statement (807.87(k)), the Class III summary and certification
-- (807.94) and the Part 54 financial certification — and no cybersecurity
-- (FD&C Act 524B), EMC/electrical safety, reprocessing or human-factors
-- sections. A customer authoring against it could reach "complete" while the
-- eSTAR readiness engine (pathway-engines/estar/estar-mapper.ts) still reported
-- required sections missing: two trees, one filing, and the editor's was the
-- stale one.
--
-- SHAPE
-- Section families follow the eSTAR (nIVD / IVD) v7.0 structure and the Part
-- 807 content requirements; keys stay lettered because a 510(k) is not a CTD.
-- Optional sections are marked mandatory=false rather than omitted — software,
-- sterilization, cybersecurity, animal and clinical testing do not apply to
-- every device, and demanding them where they do not apply is as wrong as
-- omitting them where they do.
--
-- WHY NEW VERSIONS RATHER THAN UPDATES — same Part 11 reasoning as every
-- outline migration since 20260804: composite FK from c2c_documents, so the
-- pack a document was built against must keep meaning what it meant.
--
-- Idempotent: ON CONFLICT DO NOTHING; supersede UPDATEs guarded and version-scoped.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping eSTAR 510(k)/De Novo outlines';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('k510', 'fda', 'fda-estar-510k-v1.0',
     '510(k) × FDA · eSTAR (nIVD/IVD v7.0) · 21 CFR Part 807',
     $pack$[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"Cover letter","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Submitter, applicant and correspondent information","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Pre-submission correspondence and previous communications","mandatory":false,"path_order":4},{"key":"A4","parent_key":"A","label":"Consensus standards and declarations of conformity","mandatory":false,"path_order":5},{"key":"A5","parent_key":"A","label":"510(k) summary or 510(k) statement (21 CFR 807.92 / 807.93)","mandatory":true,"path_order":6},{"key":"A6","parent_key":"A","label":"Truthful and accuracy statement (21 CFR 807.87(k))","mandatory":true,"path_order":7},{"key":"A7","parent_key":"A","label":"Class III summary and certification (21 CFR 807.94), where applicable","mandatory":false,"path_order":8},{"key":"A8","parent_key":"A","label":"Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on","mandatory":false,"path_order":9},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":10},{"key":"B1","parent_key":"B","label":"Device description and principles of operation","mandatory":true,"path_order":11},{"key":"B2","parent_key":"B","label":"Indications for use statement","mandatory":true,"path_order":12},{"key":"B3","parent_key":"B","label":"Classification, product code and regulation","mandatory":true,"path_order":13},{"key":"C","parent_key":null,"label":"Substantial equivalence","mandatory":true,"path_order":14},{"key":"C1","parent_key":"C","label":"Predicate and reference devices","mandatory":true,"path_order":15},{"key":"C2","parent_key":"C","label":"Substantial equivalence discussion and comparison table","mandatory":true,"path_order":16},{"key":"D","parent_key":null,"label":"Design, manufacturing and labeling","mandatory":true,"path_order":17},{"key":"D1","parent_key":"D","label":"Design and manufacturing information","mandatory":false,"path_order":18},{"key":"D2","parent_key":"D","label":"Proposed labeling and instructions for use","mandatory":true,"path_order":19},{"key":"D3","parent_key":"D","label":"Reprocessing and reuse","mandatory":false,"path_order":20},{"key":"D4","parent_key":"D","label":"Sterilization","mandatory":false,"path_order":21},{"key":"D5","parent_key":"D","label":"Shelf life and packaging","mandatory":false,"path_order":22},{"key":"E","parent_key":null,"label":"Performance and safety testing","mandatory":true,"path_order":23},{"key":"E1","parent_key":"E","label":"Biocompatibility","mandatory":true,"path_order":24},{"key":"E2","parent_key":"E","label":"Software and firmware","mandatory":false,"path_order":25},{"key":"E3","parent_key":"E","label":"Cybersecurity (FD&C Act section 524B, cyber devices)","mandatory":false,"path_order":26},{"key":"E4","parent_key":"E","label":"Electromagnetic compatibility, electrical, mechanical and thermal safety","mandatory":false,"path_order":27},{"key":"E5","parent_key":"E","label":"Bench performance testing","mandatory":true,"path_order":28},{"key":"E6","parent_key":"E","label":"Animal performance testing","mandatory":false,"path_order":29},{"key":"E7","parent_key":"E","label":"Clinical performance testing","mandatory":false,"path_order":30},{"key":"E8","parent_key":"E","label":"Human factors and usability","mandatory":false,"path_order":31},{"key":"F","parent_key":null,"label":"Quality management","mandatory":false,"path_order":32},{"key":"F1","parent_key":"F","label":"Quality management system information","mandatory":false,"path_order":33},{"key":"G","parent_key":null,"label":"References and additional information","mandatory":false,"path_order":34},{"key":"G1","parent_key":"G","label":"References and bibliography","mandatory":false,"path_order":35},{"key":"G2","parent_key":"G","label":"Additional information / amendment responses","mandatory":false,"path_order":36}]$pack$::jsonb,
     'CDRH-Portal',
     DATE '2026-09-01'),
    ('denovo', 'fda', 'fda-estar-denovo-v1.0',
     'De Novo × FDA · eSTAR (nIVD/IVD v7.0) · 21 CFR 860.220',
     $pack$[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"Cover letter and requester information","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Indications for use statement","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Pre-submission correspondence and previous communications","mandatory":false,"path_order":4},{"key":"A4","parent_key":"A","label":"Truthful and accuracy statement","mandatory":true,"path_order":5},{"key":"A5","parent_key":"A","label":"Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on","mandatory":false,"path_order":6},{"key":"A6","parent_key":"A","label":"Consensus standards and declarations of conformity","mandatory":false,"path_order":7},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":8},{"key":"B1","parent_key":"B","label":"Device description and principle of operation","mandatory":true,"path_order":9},{"key":"B2","parent_key":"B","label":"Components, accessories and specifications","mandatory":true,"path_order":10},{"key":"B3","parent_key":"B","label":"Prior submissions and regulatory history","mandatory":false,"path_order":11},{"key":"C","parent_key":null,"label":"Classification","mandatory":true,"path_order":12},{"key":"C1","parent_key":"C","label":"Reason De Novo is appropriate (no legally marketed predicate)","mandatory":true,"path_order":13},{"key":"C2","parent_key":"C","label":"Proposed classification and regulation","mandatory":true,"path_order":14},{"key":"C3","parent_key":"C","label":"Proposed special controls","mandatory":true,"path_order":15},{"key":"C4","parent_key":"C","label":"Benefit-risk considerations","mandatory":true,"path_order":16},{"key":"D","parent_key":null,"label":"Performance testing","mandatory":true,"path_order":17},{"key":"D1","parent_key":"D","label":"Bench performance testing","mandatory":true,"path_order":18},{"key":"D2","parent_key":"D","label":"Biocompatibility","mandatory":true,"path_order":19},{"key":"D3","parent_key":"D","label":"Sterilization, shelf life and packaging","mandatory":false,"path_order":20},{"key":"D4","parent_key":"D","label":"Software and firmware","mandatory":false,"path_order":21},{"key":"D5","parent_key":"D","label":"Cybersecurity (FD&C Act section 524B, cyber devices)","mandatory":false,"path_order":22},{"key":"D6","parent_key":"D","label":"Electromagnetic compatibility and electrical safety","mandatory":false,"path_order":23},{"key":"D7","parent_key":"D","label":"Animal studies","mandatory":false,"path_order":24},{"key":"D8","parent_key":"D","label":"Clinical performance data","mandatory":false,"path_order":25},{"key":"D9","parent_key":"D","label":"Human factors and usability","mandatory":false,"path_order":26},{"key":"E","parent_key":null,"label":"Labeling","mandatory":true,"path_order":27},{"key":"E1","parent_key":"E","label":"Proposed labeling and instructions for use","mandatory":true,"path_order":28},{"key":"E2","parent_key":"E","label":"Package label and physician / patient labeling","mandatory":false,"path_order":29},{"key":"F","parent_key":null,"label":"Risk management summary","mandatory":true,"path_order":30},{"key":"G","parent_key":null,"label":"Quality management","mandatory":false,"path_order":31},{"key":"G1","parent_key":"G","label":"Quality management system information","mandatory":false,"path_order":32}]$pack$::jsonb,
     'CDRH-Portal',
     DATE '2026-09-01')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis   = 'guidance_transcription',
      confidence     = 'medium',
      governing_rule = 'FDA eSTAR (nIVD / IVD) v7.0 section structure; 21 CFR 807.87, 807.92, 807.93, 807.94; FD&C Act section 524B (cyber devices)',
      uncertainties  = 'Section families transcribed from the eSTAR template structure and Part 807 content requirements; the official eSTAR PDF is the artifact CDRH ingests and is filled from these sections, not replaced by them. Not reviewed by a regulatory professional.'
    WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-v1.0';

    UPDATE c2c_rule_packs SET
      source_basis   = 'guidance_transcription',
      confidence     = 'medium',
      governing_rule = 'FDA eSTAR (nIVD / IVD) v7.0 section structure; 21 CFR 860.220 (De Novo request content); FD&C Act 513(f)(2)',
      uncertainties  = 'Section families transcribed from the eSTAR template structure and 21 CFR 860.220; the official eSTAR PDF is the artifact CDRH ingests. Not reviewed by a regulatory professional.'
    WHERE doc_type = 'denovo' AND agency = 'fda' AND version = 'fda-estar-denovo-v1.0';
  END IF;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-estar-510k-v1.0'
   WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-510k-2024'
     AND superseded_by IS NULL;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-estar-denovo-v1.0'
   WHERE doc_type = 'denovo' AND agency = 'fda' AND version = 'fda-denovo-2024'
     AND superseded_by IS NULL;
END
$mig$;
