-- ═══════════════════════════════════════════════════════════════════════════════
-- 2026-10-05 · D2 · g-pma-pack-software-doc-level
-- pma:fda fda-pma-21cfr814-20-v1.1 — node C.4 names FDA's software
-- Documentation Level, not the retired Level of Concern
--
-- WHAT WAS WRONG
--   fda-pma-21cfr814-20-v1.0 (migrations/20260810_pma_fda_814_20_outline.sql)
--   labels C.4 "Software description and level of concern". FDA's final guidance
--   "Content of Premarket Submissions for Device Software Functions" (14 June
--   2023, https://www.fda.gov/media/153781/download) replaced the 2005 Level of
--   Concern with two Documentation Levels, Basic and Enhanced. Enhanced applies
--   where a failure of a device software function could present a hazardous
--   situation with a probable risk of death or serious injury, assessed before
--   risk control measures. Every PMA a client scaffolded asked for a construct
--   FDA no longer uses. The determination itself lives in
--   server/services/market-specs/software-lifecycle.ts (fdaDocumentationLevel,
--   FDA_SOFTWARE_DOCUMENTATION_SET); this file only corrects the outline label.
--
-- WHAT IS NOW TRUE
--   fda-pma-21cfr814-20-v1.1 is v1.0 node for node — the same 67 keys, parents,
--   mandatory flags and path_order — except C.4, which reads
--   "Software description and FDA documentation level (Basic/Enhanced)".
--   It supersedes exactly v1.0. New PMA projects scaffold v1.1 (the scaffolder
--   selects superseded_by IS NULL).
--
-- THE LIMIT (product decision 6, DECISIONS.md of 2026-10-05)
--   A c2c_documents row already bound to v1.0 keeps v1.0's outline and its C.4
--   label: c2c_documents carries a composite FK to (doc_type, agency, version),
--   and rewriting a version's tree would change what a scaffolded document claims
--   to have been built against — in a Part 11 table, a falsified record.
--
-- RULE 1 (every file in C2C_MIGRATION_FILES re-runs on every deploy)
--   No DROP, and v1.0's tree is not edited. 20260810's supersede UPDATE was
--   `version <> v1.0 AND superseded_by IS NULL`, which on every replay would have
--   marked this row superseded by v1.0; it was amended in place in the same
--   change to name 'fda-pma-2024' only (dated note in that file's header).
--   20260810c re-runs before this file on every deploy and resets the pma
--   provenance doc_type-wide; the provenance UPDATE below runs after it every
--   time (and on the first deploy, when 20260810c ran before v1.1 existed), so
--   the final state is this file's. ON CONFLICT DO NOTHING never
--   corrects a wrong row already holding the key, so the RAISE at the end refuses
--   a v1.1 row whose node count or C.4 label is not this file's.
--   Proof: tests/schema-contract/pma-outline-v1-1-replay.contract.test.ts
--   (applies the set's pma files twice). Evidence:
--   docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-pma-pack-software-doc-level-*.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  n    integer;
  c4   text;
  sup  text;
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping pma:fda v1.1 outline';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('pma', 'fda', 'fda-pma-21cfr814-20-v1.1',
     'PMA × FDA · 21 CFR 814.20 (Class III premarket approval)',
     $pack$[{"key":"A","parent_key":null,"label":"A · Administrative information (21 CFR 814.20(b)(1)–(2))","mandatory":true,"path_order":1},{"key":"A.1","parent_key":"A","label":"Applicant name, address and establishment registration","mandatory":true,"path_order":2},{"key":"A.2","parent_key":"A","label":"FDA Form 3514 — CDRH cover sheet","mandatory":true,"path_order":3},{"key":"A.3","parent_key":"A","label":"Cover letter and application type (original / panel-track / 180-day / real-time)","mandatory":true,"path_order":4},{"key":"A.4","parent_key":"A","label":"Comprehensive table of contents","mandatory":true,"path_order":5},{"key":"A.5","parent_key":"A","label":"Prior submissions cross-reference (IDE, Q-Sub, predicate history)","mandatory":false,"path_order":6},{"key":"A.6","parent_key":"A","label":"Financial certification or disclosure — 21 CFR Part 54","mandatory":true,"path_order":7},{"key":"A.7","parent_key":"A","label":"Truthful and accurate statement","mandatory":true,"path_order":8},{"key":"B","parent_key":null,"label":"B · Summary of safety and effectiveness data (21 CFR 814.20(b)(3))","mandatory":true,"path_order":9},{"key":"B.1","parent_key":"B","label":"Indications for use","mandatory":true,"path_order":10},{"key":"B.2","parent_key":"B","label":"Device description summary","mandatory":true,"path_order":11},{"key":"B.3","parent_key":"B","label":"Alternative practices and procedures","mandatory":true,"path_order":12},{"key":"B.4","parent_key":"B","label":"Marketing history — US and foreign","mandatory":true,"path_order":13},{"key":"B.5","parent_key":"B","label":"Summary of nonclinical laboratory studies","mandatory":true,"path_order":14},{"key":"B.6","parent_key":"B","label":"Summary of clinical investigations","mandatory":true,"path_order":15},{"key":"B.7","parent_key":"B","label":"Conclusions drawn from the studies","mandatory":true,"path_order":16},{"key":"C","parent_key":null,"label":"C · Complete device description (21 CFR 814.20(b)(4)(i))","mandatory":true,"path_order":17},{"key":"C.1","parent_key":"C","label":"Functional components, properties and principles of operation","mandatory":true,"path_order":18},{"key":"C.2","parent_key":"C","label":"Engineering drawings, specifications and materials of construction","mandatory":true,"path_order":19},{"key":"C.3","parent_key":"C","label":"Accessories, compatible devices and system configuration","mandatory":false,"path_order":20},{"key":"C.4","parent_key":"C","label":"Software description and FDA documentation level (Basic/Enhanced)","mandatory":false,"path_order":21},{"key":"C.5","parent_key":"C","label":"Cybersecurity — FDA §524B, SBOM and threat model","mandatory":false,"path_order":22},{"key":"D","parent_key":null,"label":"D · Manufacturing, processing, packing, storage and installation (814.20(b)(4)(v))","mandatory":true,"path_order":23},{"key":"D.1","parent_key":"D","label":"Manufacturing process flow and process controls","mandatory":true,"path_order":24},{"key":"D.2","parent_key":"D","label":"Facilities, equipment and environmental controls","mandatory":true,"path_order":25},{"key":"D.3","parent_key":"D","label":"Quality System Regulation conformance — 21 CFR 820 / ISO 13485","mandatory":true,"path_order":26},{"key":"D.4","parent_key":"D","label":"Sterilization validation and pyrogenicity","mandatory":false,"path_order":27},{"key":"D.5","parent_key":"D","label":"Packaging, shelf life and stability","mandatory":true,"path_order":28},{"key":"D.6","parent_key":"D","label":"Supplier and component controls","mandatory":true,"path_order":29},{"key":"D.7","parent_key":"D","label":"Installation, servicing and decommissioning","mandatory":false,"path_order":30},{"key":"E","parent_key":null,"label":"E · Reference to performance standards (21 CFR 814.20(b)(5))","mandatory":false,"path_order":31},{"key":"E.1","parent_key":"E","label":"FDA-recognised consensus standards and declarations of conformity","mandatory":false,"path_order":32},{"key":"E.2","parent_key":"E","label":"Deviations from recognised standards, with justification","mandatory":false,"path_order":33},{"key":"F","parent_key":null,"label":"F · Nonclinical laboratory studies (21 CFR 814.20(b)(6)(i))","mandatory":true,"path_order":34},{"key":"F.1","parent_key":"F","label":"Biocompatibility — ISO 10993 series","mandatory":true,"path_order":35},{"key":"F.2","parent_key":"F","label":"Bench performance and design verification testing","mandatory":true,"path_order":36},{"key":"F.3","parent_key":"F","label":"Mechanical, stress, fatigue and wear testing","mandatory":false,"path_order":37},{"key":"F.4","parent_key":"F","label":"Electrical safety and EMC — IEC 60601 series","mandatory":false,"path_order":38},{"key":"F.5","parent_key":"F","label":"Software verification and validation","mandatory":false,"path_order":39},{"key":"F.6","parent_key":"F","label":"Animal studies","mandatory":false,"path_order":40},{"key":"F.7","parent_key":"F","label":"Microbiology, toxicology and immunology","mandatory":false,"path_order":41},{"key":"F.8","parent_key":"F","label":"Good Laboratory Practice statement — 21 CFR 58","mandatory":true,"path_order":42},{"key":"G","parent_key":null,"label":"G · Clinical investigations (21 CFR 814.20(b)(6)(ii))","mandatory":true,"path_order":43},{"key":"G.1","parent_key":"G","label":"Study protocols and amendments","mandatory":true,"path_order":44},{"key":"G.2","parent_key":"G","label":"Investigational plan and IDE reference","mandatory":false,"path_order":45},{"key":"G.3","parent_key":"G","label":"Safety data — adverse events, complications, device failures and replacements","mandatory":true,"path_order":46},{"key":"G.4","parent_key":"G","label":"Effectiveness data against the primary endpoint","mandatory":true,"path_order":47},{"key":"G.5","parent_key":"G","label":"Statistical analysis plan and results","mandatory":true,"path_order":48},{"key":"G.6","parent_key":"G","label":"Patient accountability, discontinuation and loss to follow-up","mandatory":true,"path_order":49},{"key":"G.7","parent_key":"G","label":"Line listings and tabulations of individual patient data","mandatory":true,"path_order":50},{"key":"G.8","parent_key":"G","label":"Investigator agreements, IRB approvals and informed consent","mandatory":true,"path_order":51},{"key":"G.9","parent_key":"G","label":"Justification for a single investigator — 21 CFR 814.20(b)(7)","mandatory":false,"path_order":52},{"key":"G.10","parent_key":"G","label":"Human factors and usability engineering — IEC 62366-1","mandatory":false,"path_order":53},{"key":"G.11","parent_key":"G","label":"Pediatric subpopulation data — FDAAA §515A","mandatory":false,"path_order":54},{"key":"H","parent_key":null,"label":"H · Proposed labeling (21 CFR 814.20(b)(10))","mandatory":true,"path_order":55},{"key":"H.1","parent_key":"H","label":"Instructions for use / physician labeling","mandatory":true,"path_order":56},{"key":"H.2","parent_key":"H","label":"Patient labeling and implant card","mandatory":false,"path_order":57},{"key":"H.3","parent_key":"H","label":"Package labels, UDI and GUDID submission","mandatory":true,"path_order":58},{"key":"H.4","parent_key":"H","label":"Promotional and training materials","mandatory":false,"path_order":59},{"key":"I","parent_key":null,"label":"I · Post-approval and surveillance commitments","mandatory":true,"path_order":60},{"key":"I.1","parent_key":"I","label":"Post-Approval Study plan — 21 CFR 814.82","mandatory":false,"path_order":61},{"key":"I.2","parent_key":"I","label":"Post-market surveillance under section 522","mandatory":false,"path_order":62},{"key":"I.3","parent_key":"I","label":"MDR procedures and complaint handling — 21 CFR 803","mandatory":true,"path_order":63},{"key":"J","parent_key":null,"label":"J · Environmental assessment (21 CFR 814.20(b)(11))","mandatory":false,"path_order":64},{"key":"K","parent_key":null,"label":"K · Bibliography (21 CFR 814.20(b)(8))","mandatory":true,"path_order":65},{"key":"L","parent_key":null,"label":"L · Device sample or photographs (21 CFR 814.20(b)(9))","mandatory":false,"path_order":66},{"key":"M","parent_key":null,"label":"M · Other information requested by FDA (21 CFR 814.20(b)(13))","mandatory":false,"path_order":67}]$pack$::jsonb,
     -- CDRH Customer Collaboration Portal, as v1.0.
     'CDRH-Portal',
     DATE '2026-10-05')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- Provenance (columns exist once 20260810c has run; guarded so a database
  -- that never had that migration still gets the outline). All four columns,
  -- not only uncertainties: 20260810c attests pma:fda doc_type-wide but runs
  -- BEFORE this file, so on the deploy that first inserts v1.1 the row would
  -- otherwise carry the column defaults ('undeclared' / 'unknown') until a
  -- later deploy re-ran 20260810c. Same pattern as 20260901 and 20260902.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis   = 'statutory_transcription',
      confidence     = 'high',
      governing_rule = '21 CFR 814.20(b) — Application contents; C.4 per FDA guidance Content of Premarket Submissions for Device Software Functions (2023)',
      uncertainties = 'Transcribed from the regulation text. Not reviewed by a regulatory professional; confirm module placement and current FDA guidance before filing. '
                   || 'C.4 relabelled from "level of concern" to the FDA Documentation Level (Basic/Enhanced): FDA final guidance "Content of Premarket Submissions for Device Software Functions", 14 June 2023 (https://www.fda.gov/media/153781/download), which replaced the 2005 Level of Concern; checked 2026-10-05 against fda.gov search extracts, the PDF itself not opened. '
                   || '21 CFR 814.20(b) names no software heading; placing software under (b)(4)(i) device description is this outline''s construction.'
    WHERE doc_type = 'pma' AND agency = 'fda' AND version = 'fda-pma-21cfr814-20-v1.1';
  END IF;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-pma-21cfr814-20-v1.1'
   WHERE doc_type = 'pma' AND agency = 'fda' AND version = 'fda-pma-21cfr814-20-v1.0'
     AND superseded_by IS NULL;

  -- Row-count assertion (CLAUDE.md Rule 1, seed corollary): a missing or
  -- truncated v1.1 row, a v1.1 whose C.4 is not this file's, a v1.1 superseded
  -- by nothing that exists, or a v1.0 still live fails the deploy here.
  SELECT jsonb_array_length(required_sections),
         (SELECT s->>'label' FROM jsonb_array_elements(required_sections) s WHERE s->>'key' = 'C.4'),
         superseded_by
    INTO n, c4, sup
    FROM c2c_rule_packs
   WHERE doc_type = 'pma' AND agency = 'fda' AND version = 'fda-pma-21cfr814-20-v1.1';
  IF NOT FOUND OR n IS DISTINCT FROM 67 THEN
    RAISE EXCEPTION 'pma:fda fda-pma-21cfr814-20-v1.1 must hold 67 nodes; found %', coalesce(n::text, 'no row');
  END IF;
  IF c4 IS DISTINCT FROM 'Software description and FDA documentation level (Basic/Enhanced)' THEN
    RAISE EXCEPTION 'pma:fda fda-pma-21cfr814-20-v1.1 C.4 must name the FDA documentation level; found %', coalesce(c4, 'no C.4');
  END IF;
  IF sup IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM c2c_rule_packs WHERE doc_type = 'pma' AND agency = 'fda' AND version = sup) THEN
    RAISE EXCEPTION 'pma:fda fda-pma-21cfr814-20-v1.1 is superseded by %, which does not exist', sup;
  END IF;
  IF EXISTS (SELECT 1 FROM c2c_rule_packs
              WHERE doc_type = 'pma' AND agency = 'fda' AND version = 'fda-pma-21cfr814-20-v1.0'
                AND superseded_by IS NULL) THEN
    RAISE EXCEPTION 'pma:fda fda-pma-21cfr814-20-v1.0 is still live after v1.1';
  END IF;
  -- A supersede cycle (v1.0 → v1.1 → v1.0, which the unamended 20260810 produced
  -- on the second deploy) leaves no live pack, and the scaffolder then creates a
  -- PMA project with no document. Refuse it here.
  IF NOT EXISTS (SELECT 1 FROM c2c_rule_packs
                  WHERE doc_type = 'pma' AND agency = 'fda' AND superseded_by IS NULL) THEN
    RAISE EXCEPTION 'pma:fda has no live rule pack after v1.1 (a supersede cycle)';
  END IF;
END
$mig$;
