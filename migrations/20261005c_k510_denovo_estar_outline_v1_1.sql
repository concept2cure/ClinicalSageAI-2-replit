-- ═══════════════════════════════════════════════════════════════════════════════
-- 2026-10-05 · D2 · g-k510-denovo-pack-v1-1
-- k510:fda fda-estar-510k-v1.1 and denovo:fda fda-estar-denovo-v1.1 — the MDUFA
-- user fee (Form FDA 3601) in both outlines, and FDA's "Benefits, Risks, and
-- Mitigation Measures" (risk management) section in the 510(k) outline
--
-- WHAT WAS WRONG
--   fda-estar-510k-v1.0 and fda-estar-denovo-v1.0
--   (migrations/20260901b_estar_510k_denovo_outlines.sql) have no section for
--   the user-fee cover sheet, and the 510(k) pack none for risk management. The
--   eSTAR readiness engine (server/services/pathway-engines/estar/estar-mapper.ts)
--   requires both slots, so a governed 510(k) authored section by section against
--   its own outline could never score complete. Measured, not inferred:
--   tests/schema-contract/estar-mapper-matches-shipped-outlines.contract.test.ts
--   scored the fully authored v1.0 packs at missingRequired
--   k510 [risk-management, user-fee-cover-sheet], De Novo [user-fee-cover-sheet].
--
-- WHAT IS NOW TRUE
--   fda-estar-510k-v1.1 is v1.0 node for node (keys, parents, labels, mandatory
--   flags; path_order renumbered 1..38) plus two nodes:
--     A9 "MDUFA user fee — Form FDA 3601 and payment"            mandatory
--     D6 "Benefits, risks and mitigation measures — risk management (ISO 14971),
--         Special 510(k) design control activities"                optional
--   fda-estar-denovo-v1.1 is v1.0 node for node (path_order 1..33) plus
--     A7 "MDUFA user fee — Form FDA 3601 and payment"            mandatory
--   (De Novo v1.0 already had F "Risk management summary".) Each supersedes
--   exactly its v1.0. New 510(k) and De Novo projects scaffold v1.1 (the
--   scaffolder selects superseded_by IS NULL).
--
-- BASIS
--   - User fee: FDA "MDUFA Cover Sheets"
--     (https://www.fda.gov/industry/medical-device-user-fee-amendments-mdufa-fees/mdufa-cover-sheets)
--     — 510(k) (Traditional, Special, Abbreviated) and De Novo submissions are
--     subject to user fees and are accompanied by the Form FDA 3601 cover sheet;
--     checked 2026-10-05 against fda.gov search extracts. FDA's vendored eSTAR
--     v7.0 templates (assets/estar-templates) carry an "Administrative
--     Documentation | User Fee Form" attachment (CH1.04/CH1.09) whose FDA text
--     reads "Please attach your User Fee form here".
--   - Risk management: the vendored eSTAR v7.0 nIVD and IVD templates route
--     "Benefits, Risks, and Mitigation Measures" attachments to CH2.08, and the
--     template script SHOWS that section for a Special 510(k) (design control
--     activities, signed V&V statements), De Novo and PMA, and HIDES it for a
--     Traditional or Abbreviated 510(k). So the 510(k) node is mandatory=false.
--     estar-mapper.ts still marks risk-management 'always' for every 510(k);
--     that disagreement with FDA's template is the mapper's to correct, not
--     this outline's to paper over by demanding the section of everyone.
--   - The label avoids "cover sheet" on purpose: the mapper's cover-letter slot
--     matches that phrase, and a user-fee section must not mark the cover
--     letter present.
--
-- THE LIMIT (product decision 6, DECISIONS.md of 2026-10-05)
--   A c2c_documents row already bound to v1.0 keeps v1.0's outline: the composite
--   FK (doc_type, agency, version) is what that document claims to have been
--   built against, and rewriting the tree would falsify it in a Part 11 table.
--   Remediating those documents is a founder decision, not this file.
--
-- RULE 1 (every file in C2C_MIGRATION_FILES re-runs on every deploy)
--   No DROP; 20260901b is not edited (its supersede UPDATEs are scoped to the
--   exact 2024 versions, so they never touch v1.0 or v1.1 on replay). This
--   file's supersedes name exactly v1.0 and are guarded on superseded_by IS NULL.
--   ON CONFLICT DO NOTHING never corrects a wrong row already holding the key,
--   so the RAISEs at the end refuse a v1.1 row whose tree is not this file's,
--   a v1.0 still live, or any second live pack.
--   Proof: tests/schema-contract/k510-denovo-outline-v1-1-replay.contract.test.ts
--   (applies the set's k510/denovo files three times). Evidence:
--   docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-k510-denovo-pack-v1-1-*.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  k510_tree   jsonb := $pack$[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"Cover letter","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Submitter, applicant and correspondent information","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Pre-submission correspondence and previous communications","mandatory":false,"path_order":4},{"key":"A4","parent_key":"A","label":"Consensus standards and declarations of conformity","mandatory":false,"path_order":5},{"key":"A5","parent_key":"A","label":"510(k) summary or 510(k) statement (21 CFR 807.92 / 807.93)","mandatory":true,"path_order":6},{"key":"A6","parent_key":"A","label":"Truthful and accuracy statement (21 CFR 807.87(k))","mandatory":true,"path_order":7},{"key":"A7","parent_key":"A","label":"Class III summary and certification (21 CFR 807.94), where applicable","mandatory":false,"path_order":8},{"key":"A8","parent_key":"A","label":"Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on","mandatory":false,"path_order":9},{"key":"A9","parent_key":"A","label":"MDUFA user fee — Form FDA 3601 and payment","mandatory":true,"path_order":10},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":11},{"key":"B1","parent_key":"B","label":"Device description and principles of operation","mandatory":true,"path_order":12},{"key":"B2","parent_key":"B","label":"Indications for use statement","mandatory":true,"path_order":13},{"key":"B3","parent_key":"B","label":"Classification, product code and regulation","mandatory":true,"path_order":14},{"key":"C","parent_key":null,"label":"Substantial equivalence","mandatory":true,"path_order":15},{"key":"C1","parent_key":"C","label":"Predicate and reference devices","mandatory":true,"path_order":16},{"key":"C2","parent_key":"C","label":"Substantial equivalence discussion and comparison table","mandatory":true,"path_order":17},{"key":"D","parent_key":null,"label":"Design, manufacturing and labeling","mandatory":true,"path_order":18},{"key":"D1","parent_key":"D","label":"Design and manufacturing information","mandatory":false,"path_order":19},{"key":"D2","parent_key":"D","label":"Proposed labeling and instructions for use","mandatory":true,"path_order":20},{"key":"D3","parent_key":"D","label":"Reprocessing and reuse","mandatory":false,"path_order":21},{"key":"D4","parent_key":"D","label":"Sterilization","mandatory":false,"path_order":22},{"key":"D5","parent_key":"D","label":"Shelf life and packaging","mandatory":false,"path_order":23},{"key":"D6","parent_key":"D","label":"Benefits, risks and mitigation measures — risk management (ISO 14971), Special 510(k) design control activities","mandatory":false,"path_order":24},{"key":"E","parent_key":null,"label":"Performance and safety testing","mandatory":true,"path_order":25},{"key":"E1","parent_key":"E","label":"Biocompatibility","mandatory":true,"path_order":26},{"key":"E2","parent_key":"E","label":"Software and firmware","mandatory":false,"path_order":27},{"key":"E3","parent_key":"E","label":"Cybersecurity (FD&C Act section 524B, cyber devices)","mandatory":false,"path_order":28},{"key":"E4","parent_key":"E","label":"Electromagnetic compatibility, electrical, mechanical and thermal safety","mandatory":false,"path_order":29},{"key":"E5","parent_key":"E","label":"Bench performance testing","mandatory":true,"path_order":30},{"key":"E6","parent_key":"E","label":"Animal performance testing","mandatory":false,"path_order":31},{"key":"E7","parent_key":"E","label":"Clinical performance testing","mandatory":false,"path_order":32},{"key":"E8","parent_key":"E","label":"Human factors and usability","mandatory":false,"path_order":33},{"key":"F","parent_key":null,"label":"Quality management","mandatory":false,"path_order":34},{"key":"F1","parent_key":"F","label":"Quality management system information","mandatory":false,"path_order":35},{"key":"G","parent_key":null,"label":"References and additional information","mandatory":false,"path_order":36},{"key":"G1","parent_key":"G","label":"References and bibliography","mandatory":false,"path_order":37},{"key":"G2","parent_key":"G","label":"Additional information / amendment responses","mandatory":false,"path_order":38}]$pack$::jsonb;
  denovo_tree jsonb := $pack$[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"Cover letter and requester information","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Indications for use statement","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Pre-submission correspondence and previous communications","mandatory":false,"path_order":4},{"key":"A4","parent_key":"A","label":"Truthful and accuracy statement","mandatory":true,"path_order":5},{"key":"A5","parent_key":"A","label":"Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on","mandatory":false,"path_order":6},{"key":"A6","parent_key":"A","label":"Consensus standards and declarations of conformity","mandatory":false,"path_order":7},{"key":"A7","parent_key":"A","label":"MDUFA user fee — Form FDA 3601 and payment","mandatory":true,"path_order":8},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":9},{"key":"B1","parent_key":"B","label":"Device description and principle of operation","mandatory":true,"path_order":10},{"key":"B2","parent_key":"B","label":"Components, accessories and specifications","mandatory":true,"path_order":11},{"key":"B3","parent_key":"B","label":"Prior submissions and regulatory history","mandatory":false,"path_order":12},{"key":"C","parent_key":null,"label":"Classification","mandatory":true,"path_order":13},{"key":"C1","parent_key":"C","label":"Reason De Novo is appropriate (no legally marketed predicate)","mandatory":true,"path_order":14},{"key":"C2","parent_key":"C","label":"Proposed classification and regulation","mandatory":true,"path_order":15},{"key":"C3","parent_key":"C","label":"Proposed special controls","mandatory":true,"path_order":16},{"key":"C4","parent_key":"C","label":"Benefit-risk considerations","mandatory":true,"path_order":17},{"key":"D","parent_key":null,"label":"Performance testing","mandatory":true,"path_order":18},{"key":"D1","parent_key":"D","label":"Bench performance testing","mandatory":true,"path_order":19},{"key":"D2","parent_key":"D","label":"Biocompatibility","mandatory":true,"path_order":20},{"key":"D3","parent_key":"D","label":"Sterilization, shelf life and packaging","mandatory":false,"path_order":21},{"key":"D4","parent_key":"D","label":"Software and firmware","mandatory":false,"path_order":22},{"key":"D5","parent_key":"D","label":"Cybersecurity (FD&C Act section 524B, cyber devices)","mandatory":false,"path_order":23},{"key":"D6","parent_key":"D","label":"Electromagnetic compatibility and electrical safety","mandatory":false,"path_order":24},{"key":"D7","parent_key":"D","label":"Animal studies","mandatory":false,"path_order":25},{"key":"D8","parent_key":"D","label":"Clinical performance data","mandatory":false,"path_order":26},{"key":"D9","parent_key":"D","label":"Human factors and usability","mandatory":false,"path_order":27},{"key":"E","parent_key":null,"label":"Labeling","mandatory":true,"path_order":28},{"key":"E1","parent_key":"E","label":"Proposed labeling and instructions for use","mandatory":true,"path_order":29},{"key":"E2","parent_key":"E","label":"Package label and physician / patient labeling","mandatory":false,"path_order":30},{"key":"F","parent_key":null,"label":"Risk management summary","mandatory":true,"path_order":31},{"key":"G","parent_key":null,"label":"Quality management","mandatory":false,"path_order":32},{"key":"G1","parent_key":"G","label":"Quality management system information","mandatory":false,"path_order":33}]$pack$::jsonb;
  n           integer;
  same        boolean;
  live        text;
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping k510/denovo eSTAR outline v1.1';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('k510', 'fda', 'fda-estar-510k-v1.1',
     '510(k) × FDA · eSTAR (nIVD/IVD v7.0) · 21 CFR Part 807',
     k510_tree, 'CDRH-Portal', DATE '2026-10-05'),
    ('denovo', 'fda', 'fda-estar-denovo-v1.1',
     'De Novo × FDA · eSTAR (nIVD/IVD v7.0) · 21 CFR 860.220',
     denovo_tree, 'CDRH-Portal', DATE '2026-10-05')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- Provenance (columns exist once 20260810c has run; guarded so a database
  -- that never had that migration still gets the outlines). Written here every
  -- deploy, so the row carries it from the deploy that inserts it.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis   = 'guidance_transcription',
      confidence     = 'medium',
      governing_rule = 'FDA eSTAR (nIVD / IVD) v7.0 section structure; 21 CFR 807.87, 807.92, 807.93, 807.94; FD&C Act section 524B (cyber devices); MDUFA user fee, Form FDA 3601',
      uncertainties  = 'Section families transcribed from the eSTAR template structure and Part 807 content requirements; the official eSTAR PDF is the artifact CDRH ingests and is filled from these sections, not replaced by them. Not reviewed by a regulatory professional. '
                    || 'v1.1 adds A9 (user fee, Form FDA 3601: FDA "MDUFA Cover Sheets", https://www.fda.gov/industry/medical-device-user-fee-amendments-mdufa-fees/mdufa-cover-sheets, checked 2026-10-05 against fda.gov search extracts; eSTAR v7.0 "User Fee Form" attachment) '
                    || 'and D6 (Benefits, Risks, and Mitigation Measures, eSTAR v7.0 CH2.08), optional because the vendored eSTAR v7.0 template shows that section for a Special 510(k) and hides it for a Traditional or Abbreviated 510(k).'
    WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-v1.1';

    UPDATE c2c_rule_packs SET
      source_basis   = 'guidance_transcription',
      confidence     = 'medium',
      governing_rule = 'FDA eSTAR (nIVD / IVD) v7.0 section structure; 21 CFR 860.220 (De Novo request content); FD&C Act 513(f)(2); MDUFA user fee, Form FDA 3601',
      uncertainties  = 'Section families transcribed from the eSTAR template structure and 21 CFR 860.220; the official eSTAR PDF is the artifact CDRH ingests. Not reviewed by a regulatory professional. '
                    || 'v1.1 adds A7 (user fee, Form FDA 3601: FDA "MDUFA Cover Sheets", https://www.fda.gov/industry/medical-device-user-fee-amendments-mdufa-fees/mdufa-cover-sheets, checked 2026-10-05 against fda.gov search extracts; eSTAR v7.0 "User Fee Form" attachment).'
    WHERE doc_type = 'denovo' AND agency = 'fda' AND version = 'fda-estar-denovo-v1.1';
  END IF;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-estar-510k-v1.1'
   WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-v1.0'
     AND superseded_by IS NULL;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-estar-denovo-v1.1'
   WHERE doc_type = 'denovo' AND agency = 'fda' AND version = 'fda-estar-denovo-v1.0'
     AND superseded_by IS NULL;

  -- Row-count and content assertions (CLAUDE.md Rule 1, seed corollary): a
  -- missing or truncated v1.1 row, a v1.1 whose tree is not this file's, or a
  -- (doc_type, agency) with any live pack other than v1.1 fails the deploy here.
  SELECT jsonb_array_length(required_sections), required_sections = k510_tree INTO n, same
    FROM c2c_rule_packs WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-v1.1';
  IF NOT FOUND OR n IS DISTINCT FROM 38 OR NOT same THEN
    RAISE EXCEPTION 'k510:fda fda-estar-510k-v1.1 must hold this file''s 38 nodes; found % (tree matches: %)',
      coalesce(n::text, 'no row'), coalesce(same::text, 'n/a');
  END IF;

  SELECT jsonb_array_length(required_sections), required_sections = denovo_tree INTO n, same
    FROM c2c_rule_packs WHERE doc_type = 'denovo' AND agency = 'fda' AND version = 'fda-estar-denovo-v1.1';
  IF NOT FOUND OR n IS DISTINCT FROM 33 OR NOT same THEN
    RAISE EXCEPTION 'denovo:fda fda-estar-denovo-v1.1 must hold this file''s 33 nodes; found % (tree matches: %)',
      coalesce(n::text, 'no row'), coalesce(same::text, 'n/a');
  END IF;

  SELECT string_agg(doc_type || ':' || version, ', ' ORDER BY doc_type, version) INTO live
    FROM c2c_rule_packs
   WHERE agency = 'fda' AND superseded_by IS NULL
     AND ((doc_type = 'k510' AND version <> 'fda-estar-510k-v1.1')
       OR (doc_type = 'denovo' AND version <> 'fda-estar-denovo-v1.1'));
  IF live IS NOT NULL THEN
    RAISE EXCEPTION 'k510/denovo:fda must have exactly one live pack (v1.1) each; also live: %', live;
  END IF;

  IF (SELECT count(*) FROM c2c_rule_packs
       WHERE agency = 'fda' AND superseded_by IS NULL
         AND version IN ('fda-estar-510k-v1.1', 'fda-estar-denovo-v1.1')) <> 2 THEN
    RAISE EXCEPTION 'k510/denovo:fda v1.1 must both be live after this file';
  END IF;
END
$mig$;
