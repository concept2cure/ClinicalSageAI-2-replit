-- 2026-11-14 · F1 / P-114 item 5 · Complete the existing IVD 510(k) outline.
--
-- WHAT ALREADY EXISTS: the generic fda-estar-510k-v1.1 tree remains unchanged
-- for non-IVD and retained documents. The existing US IVD authoring blueprint
-- used six EU performance headings; the generic governed tree had no analytical
-- performance node. Both now use the same 47 stable keys, verified against the
-- pinned FDA IVD eSTAR 7.1 (assets/estar-templates/eSTAR-510k-ivd.pdf;
-- SHA-256 df5e31dcbbe60e55b93c6006c4771c01df75a9d1c21e4b473605e20dfacce1e1).
--
-- A-D/F/G retain their meaning and flags. E1 biocompatibility preserves the
-- existing required review: record evidence or an accountable non-contact
-- rationale. The form permits zero tissue-contacting materials, but the
-- product holds no structured sponsor answer that safely waives this review.
-- E2/E3/E4/E7/E8 retain their meaning. E5 bench and E6 animal keep their meanings as conditional headings,
-- never an always-required bench/animal obligation. E9 analytical performance is required by the existing IVD
-- mapper; E10-E17 are FDA's comparison/expected-values/assay questions, whose
-- applicability a person assesses. Individual studies are not all mandatory.
-- A-G keys are platform keys, not the form's chapter numbering.
--
-- No table, class or agency is added. This parallel variant does not supersede
-- the generic tree and no existing document or signed content is rewritten.
-- Exact product-family selection belongs to the canonical rule-pack resolver;
-- an absent IVD row must not silently return the generic form.
--
-- RULE 1: every deploy replays this file. Conflict-safe insertion plus exact
-- count/tree assertion refuses a truncated or different pre-existing row. The
-- earlier generic migration exempts only this approved parallel version from
-- its one-generic-live assertion. Local structure proof is not agency approval.

DO $mig$
DECLARE
  ivd_tree jsonb := $pack$[{"key":"A","parent_key":null,"label":"Administrative","mandatory":true,"path_order":1},{"key":"A1","parent_key":"A","label":"Cover letter","mandatory":true,"path_order":2},{"key":"A2","parent_key":"A","label":"Submitter, applicant and correspondent information","mandatory":true,"path_order":3},{"key":"A3","parent_key":"A","label":"Pre-submission correspondence and previous communications","mandatory":false,"path_order":4},{"key":"A4","parent_key":"A","label":"Consensus standards and declarations of conformity","mandatory":false,"path_order":5},{"key":"A5","parent_key":"A","label":"510(k) summary or 510(k) statement (21 CFR 807.92 / 807.93)","mandatory":true,"path_order":6},{"key":"A6","parent_key":"A","label":"Truthful and accuracy statement (21 CFR 807.87(k))","mandatory":true,"path_order":7},{"key":"A7","parent_key":"A","label":"Class III summary and certification (21 CFR 807.94), where applicable","mandatory":false,"path_order":8},{"key":"A8","parent_key":"A","label":"Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on","mandatory":false,"path_order":9},{"key":"A9","parent_key":"A","label":"MDUFA user fee — Form FDA 3601 and payment","mandatory":true,"path_order":10},{"key":"B","parent_key":null,"label":"Device description","mandatory":true,"path_order":11},{"key":"B1","parent_key":"B","label":"Device description and principles of operation","mandatory":true,"path_order":12},{"key":"B2","parent_key":"B","label":"Indications for use statement","mandatory":true,"path_order":13},{"key":"B3","parent_key":"B","label":"Classification, product code and regulation","mandatory":true,"path_order":14},{"key":"C","parent_key":null,"label":"Substantial equivalence","mandatory":true,"path_order":15},{"key":"C1","parent_key":"C","label":"Predicate and reference devices","mandatory":true,"path_order":16},{"key":"C2","parent_key":"C","label":"Substantial equivalence discussion and comparison table","mandatory":true,"path_order":17},{"key":"D","parent_key":null,"label":"Design, manufacturing and labeling","mandatory":true,"path_order":18},{"key":"D1","parent_key":"D","label":"Design and manufacturing information","mandatory":false,"path_order":19},{"key":"D2","parent_key":"D","label":"Proposed labeling and instructions for use","mandatory":true,"path_order":20},{"key":"D3","parent_key":"D","label":"Reprocessing and reuse","mandatory":false,"path_order":21},{"key":"D4","parent_key":"D","label":"Sterilization","mandatory":false,"path_order":22},{"key":"D5","parent_key":"D","label":"Shelf life and packaging","mandatory":false,"path_order":23},{"key":"D6","parent_key":"D","label":"Benefits, risks and mitigation measures — risk management (ISO 14971), Special 510(k) design control activities","mandatory":false,"path_order":24},{"key":"E","parent_key":null,"label":"Performance and safety testing","mandatory":true,"path_order":25},{"key":"E1","parent_key":"E","label":"Biocompatibility","mandatory":true,"path_order":26},{"key":"E2","parent_key":"E","label":"Software and firmware","mandatory":false,"path_order":27},{"key":"E3","parent_key":"E","label":"Cybersecurity (FD&C Act section 524B, cyber devices)","mandatory":false,"path_order":28},{"key":"E4","parent_key":"E","label":"Electromagnetic compatibility, electrical, mechanical and thermal safety","mandatory":false,"path_order":29},{"key":"E5","parent_key":"E","label":"Bench performance testing","mandatory":false,"path_order":30},{"key":"E6","parent_key":"E","label":"Animal performance testing","mandatory":false,"path_order":31},{"key":"E7","parent_key":"E","label":"Clinical performance testing","mandatory":false,"path_order":32},{"key":"E8","parent_key":"E","label":"Human factors and usability","mandatory":false,"path_order":33},{"key":"E9","parent_key":"E","label":"Analytical performance — assay and instrument performance (precision, detection limit, linearity, interference)","mandatory":true,"path_order":34},{"key":"E10","parent_key":"E","label":"Method comparison study","mandatory":false,"path_order":35},{"key":"E11","parent_key":"E","label":"Validation of specimens / matrix comparison","mandatory":false,"path_order":36},{"key":"E12","parent_key":"E","label":"Reference range / expected values","mandatory":false,"path_order":37},{"key":"E13","parent_key":"E","label":"Stability of specimens","mandatory":false,"path_order":38},{"key":"E14","parent_key":"E","label":"Metrological traceability of calibrators and controls","mandatory":false,"path_order":39},{"key":"E15","parent_key":"E","label":"Assay cut-off","mandatory":false,"path_order":40},{"key":"E16","parent_key":"E","label":"Carry-over","mandatory":false,"path_order":41},{"key":"E17","parent_key":"E","label":"High-dose hook effect","mandatory":false,"path_order":42},{"key":"F","parent_key":null,"label":"Quality management","mandatory":false,"path_order":43},{"key":"F1","parent_key":"F","label":"Quality management system information","mandatory":false,"path_order":44},{"key":"G","parent_key":null,"label":"References and additional information","mandatory":false,"path_order":45},{"key":"G1","parent_key":"G","label":"References and bibliography","mandatory":false,"path_order":46},{"key":"G2","parent_key":"G","label":"Additional information / amendment responses","mandatory":false,"path_order":47}]$pack$::jsonb;
  actual_count integer;
  same_tree boolean;
  still_live boolean;
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping IVD 510(k) outline';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('k510', 'fda', 'fda-estar-510k-ivd-v1.0',
     '510(k) IVD × FDA · IVD eSTAR 7.1 · 21 CFR Part 807',
     ivd_tree, 'CDRH-Portal', DATE '2026-11-14')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis = 'guidance_transcription',
      confidence = 'medium',
      governing_rule = 'FDA IVD eSTAR 7.1; 21 CFR 807.87, 807.92, 807.93, 807.94; FDA 3601',
      uncertainties = 'Platform section groups matched to the pinned FDA IVD eSTAR 7.1 structure and captions on 2026-11-14. Platform keys are not FDA chapter numbers. '
        || 'The IVD analytical slot is required; individual studies and the other branches require documented applicability assessment. '
        || 'This is a content outline, not an official completed form, regulatory professional review, Acrobat execution or agency acceptance. '
        || 'Existing documents retain their stored outline version; no automatic upgrade or alteration of signed content.'
    WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-ivd-v1.0';
  END IF;

  SELECT jsonb_array_length(required_sections), required_sections = ivd_tree, superseded_by IS NULL
    INTO actual_count, same_tree, still_live
    FROM c2c_rule_packs
   WHERE doc_type = 'k510' AND agency = 'fda' AND version = 'fda-estar-510k-ivd-v1.0';
  IF NOT FOUND OR actual_count IS DISTINCT FROM 47 OR NOT same_tree OR NOT still_live THEN
    RAISE EXCEPTION 'k510:fda fda-estar-510k-ivd-v1.0 must hold this file''s 47 nodes and remain live; found % (tree matches: %, live: %)',
      coalesce(actual_count::text, 'no row'), coalesce(same_tree::text, 'n/a'), coalesce(still_live::text, 'n/a');
  END IF;
END
$mig$;
