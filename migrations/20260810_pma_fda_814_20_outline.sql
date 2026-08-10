-- ═══════════════════════════════════════════════════════════════════════════════
-- pma:fda — the real 21 CFR 814.20 outline
--
-- WHAT THIS CLOSES
-- pma:fda was six flat sections, seeded by 20260528 and never revisited:
--   A Administrative · B SSED · C Preclinical · D Clinical · E Manufacturing ·
--   F Labeling
-- Every one parent_key null. No substructure at all.
--
-- A PMA is the most demanding submission the FDA accepts — the pathway for a
-- Class III device sustaining human life — and a customer starting one was
-- scaffolded six empty folders, then shown a readiness rollup computed over
-- them. This is the same hollow-outline defect 20260804 fixed for nda, bla, maa,
-- jnda and denovo (5 -> 71/71/73/64/28). PMA was left behind because nothing
-- pointed at it.
--
-- WHY NO GUARD CAUGHT IT
-- tests/schema-contract/c2c-rule-pack-outlines.contract.test.ts has two rules and
-- pma slips between them: "no pack is empty" passes at six, and the five-module
-- CTD assertion queries doc_type IN ('ind','nda','bla','maa','jnda') — pma is not
-- listed, correctly, because a PMA is not a CTD. So the pack was neither empty
-- nor in scope. The companion test in this change closes that gap by asserting
-- the PMA's own shape.
--
-- WHY THIS SHAPE
-- 21 CFR 814.20(b) enumerates the required content and this follows its order:
-- (1)-(2) administrative and ToC, (3) summary of safety and effectiveness data,
-- (4)(i) complete device description, (4)(v) manufacturing/processing/packing/
-- storage/installation, (5) performance standards, (6)(i) nonclinical laboratory
-- studies, (6)(ii) clinical investigations, (7) single-investigator
-- justification, (8) bibliography, (9) device sample, (10) proposed labeling,
-- (11) environmental assessment, (13) other information. Part 54 financial
-- disclosure sits under administrative because that is where it is filed.
--
-- Post-approval commitments (814.82 PAS, section 522 surveillance, Part 803 MDR)
-- are their own root rather than an appendix: they are conditions of approval a
-- sponsor plans for during the application, not afterthoughts.
--
-- Optional sections are marked mandatory=false rather than omitted — sterility,
-- software, cybersecurity, EMC and animal studies do not apply to every Class III
-- device, and a dossier that demands them of a device that has none is as wrong
-- as one that omits them where they are required.
--
-- WHY A NEW VERSION RATHER THAN AN UPDATE
-- Same reason as 20260804, 20260806 and 20260806b: c2c_rule_packs is keyed
-- (doc_type, agency, version) and c2c_documents carries a composite FK to it.
-- Rewriting required_sections in place would silently change the content of a
-- pack that already-scaffolded documents claim to have been built against — in a
-- Part 11 table that is a falsified record, not a shortcut.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Guarded exactly as its three siblings are: this file lives in the durable
-- apply-set (scripts/db/migration-set.mjs), which runs against databases that may
-- never have had the Phase 9 schema applied — c2c_rule_packs comes from drizzle
-- push, not from a migration in the set.
DO $mig$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping pma:fda 814.20 outline';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('pma', 'fda', 'fda-pma-21cfr814-20-v1.0',
     'PMA × FDA · 21 CFR 814.20 (Class III premarket approval)',
     '[{"key":"A","parent_key":null,"label":"A · Administrative information (21 CFR 814.20(b)(1)–(2))","mandatory":true,"path_order":1},{"key":"A.1","parent_key":"A","label":"Applicant name, address and establishment registration","mandatory":true,"path_order":2},{"key":"A.2","parent_key":"A","label":"FDA Form 3514 — CDRH cover sheet","mandatory":true,"path_order":3},{"key":"A.3","parent_key":"A","label":"Cover letter and application type (original / panel-track / 180-day / real-time)","mandatory":true,"path_order":4},{"key":"A.4","parent_key":"A","label":"Comprehensive table of contents","mandatory":true,"path_order":5},{"key":"A.5","parent_key":"A","label":"Prior submissions cross-reference (IDE, Q-Sub, predicate history)","mandatory":false,"path_order":6},{"key":"A.6","parent_key":"A","label":"Financial certification or disclosure — 21 CFR Part 54","mandatory":true,"path_order":7},{"key":"A.7","parent_key":"A","label":"Truthful and accurate statement","mandatory":true,"path_order":8},{"key":"B","parent_key":null,"label":"B · Summary of safety and effectiveness data (21 CFR 814.20(b)(3))","mandatory":true,"path_order":9},{"key":"B.1","parent_key":"B","label":"Indications for use","mandatory":true,"path_order":10},{"key":"B.2","parent_key":"B","label":"Device description summary","mandatory":true,"path_order":11},{"key":"B.3","parent_key":"B","label":"Alternative practices and procedures","mandatory":true,"path_order":12},{"key":"B.4","parent_key":"B","label":"Marketing history — US and foreign","mandatory":true,"path_order":13},{"key":"B.5","parent_key":"B","label":"Summary of nonclinical laboratory studies","mandatory":true,"path_order":14},{"key":"B.6","parent_key":"B","label":"Summary of clinical investigations","mandatory":true,"path_order":15},{"key":"B.7","parent_key":"B","label":"Conclusions drawn from the studies","mandatory":true,"path_order":16},{"key":"C","parent_key":null,"label":"C · Complete device description (21 CFR 814.20(b)(4)(i))","mandatory":true,"path_order":17},{"key":"C.1","parent_key":"C","label":"Functional components, properties and principles of operation","mandatory":true,"path_order":18},{"key":"C.2","parent_key":"C","label":"Engineering drawings, specifications and materials of construction","mandatory":true,"path_order":19},{"key":"C.3","parent_key":"C","label":"Accessories, compatible devices and system configuration","mandatory":false,"path_order":20},{"key":"C.4","parent_key":"C","label":"Software description and level of concern","mandatory":false,"path_order":21},{"key":"C.5","parent_key":"C","label":"Cybersecurity — FDA §524B, SBOM and threat model","mandatory":false,"path_order":22},{"key":"D","parent_key":null,"label":"D · Manufacturing, processing, packing, storage and installation (814.20(b)(4)(v))","mandatory":true,"path_order":23},{"key":"D.1","parent_key":"D","label":"Manufacturing process flow and process controls","mandatory":true,"path_order":24},{"key":"D.2","parent_key":"D","label":"Facilities, equipment and environmental controls","mandatory":true,"path_order":25},{"key":"D.3","parent_key":"D","label":"Quality System Regulation conformance — 21 CFR 820 / ISO 13485","mandatory":true,"path_order":26},{"key":"D.4","parent_key":"D","label":"Sterilization validation and pyrogenicity","mandatory":false,"path_order":27},{"key":"D.5","parent_key":"D","label":"Packaging, shelf life and stability","mandatory":true,"path_order":28},{"key":"D.6","parent_key":"D","label":"Supplier and component controls","mandatory":true,"path_order":29},{"key":"D.7","parent_key":"D","label":"Installation, servicing and decommissioning","mandatory":false,"path_order":30},{"key":"E","parent_key":null,"label":"E · Reference to performance standards (21 CFR 814.20(b)(5))","mandatory":false,"path_order":31},{"key":"E.1","parent_key":"E","label":"FDA-recognised consensus standards and declarations of conformity","mandatory":false,"path_order":32},{"key":"E.2","parent_key":"E","label":"Deviations from recognised standards, with justification","mandatory":false,"path_order":33},{"key":"F","parent_key":null,"label":"F · Nonclinical laboratory studies (21 CFR 814.20(b)(6)(i))","mandatory":true,"path_order":34},{"key":"F.1","parent_key":"F","label":"Biocompatibility — ISO 10993 series","mandatory":true,"path_order":35},{"key":"F.2","parent_key":"F","label":"Bench performance and design verification testing","mandatory":true,"path_order":36},{"key":"F.3","parent_key":"F","label":"Mechanical, stress, fatigue and wear testing","mandatory":false,"path_order":37},{"key":"F.4","parent_key":"F","label":"Electrical safety and EMC — IEC 60601 series","mandatory":false,"path_order":38},{"key":"F.5","parent_key":"F","label":"Software verification and validation","mandatory":false,"path_order":39},{"key":"F.6","parent_key":"F","label":"Animal studies","mandatory":false,"path_order":40},{"key":"F.7","parent_key":"F","label":"Microbiology, toxicology and immunology","mandatory":false,"path_order":41},{"key":"F.8","parent_key":"F","label":"Good Laboratory Practice statement — 21 CFR 58","mandatory":true,"path_order":42},{"key":"G","parent_key":null,"label":"G · Clinical investigations (21 CFR 814.20(b)(6)(ii))","mandatory":true,"path_order":43},{"key":"G.1","parent_key":"G","label":"Study protocols and amendments","mandatory":true,"path_order":44},{"key":"G.2","parent_key":"G","label":"Investigational plan and IDE reference","mandatory":false,"path_order":45},{"key":"G.3","parent_key":"G","label":"Safety data — adverse events, complications, device failures and replacements","mandatory":true,"path_order":46},{"key":"G.4","parent_key":"G","label":"Effectiveness data against the primary endpoint","mandatory":true,"path_order":47},{"key":"G.5","parent_key":"G","label":"Statistical analysis plan and results","mandatory":true,"path_order":48},{"key":"G.6","parent_key":"G","label":"Patient accountability, discontinuation and loss to follow-up","mandatory":true,"path_order":49},{"key":"G.7","parent_key":"G","label":"Line listings and tabulations of individual patient data","mandatory":true,"path_order":50},{"key":"G.8","parent_key":"G","label":"Investigator agreements, IRB approvals and informed consent","mandatory":true,"path_order":51},{"key":"G.9","parent_key":"G","label":"Justification for a single investigator — 21 CFR 814.20(b)(7)","mandatory":false,"path_order":52},{"key":"G.10","parent_key":"G","label":"Human factors and usability engineering — IEC 62366-1","mandatory":false,"path_order":53},{"key":"G.11","parent_key":"G","label":"Pediatric subpopulation data — FDAAA §515A","mandatory":false,"path_order":54},{"key":"H","parent_key":null,"label":"H · Proposed labeling (21 CFR 814.20(b)(10))","mandatory":true,"path_order":55},{"key":"H.1","parent_key":"H","label":"Instructions for use / physician labeling","mandatory":true,"path_order":56},{"key":"H.2","parent_key":"H","label":"Patient labeling and implant card","mandatory":false,"path_order":57},{"key":"H.3","parent_key":"H","label":"Package labels, UDI and GUDID submission","mandatory":true,"path_order":58},{"key":"H.4","parent_key":"H","label":"Promotional and training materials","mandatory":false,"path_order":59},{"key":"I","parent_key":null,"label":"I · Post-approval and surveillance commitments","mandatory":true,"path_order":60},{"key":"I.1","parent_key":"I","label":"Post-Approval Study plan — 21 CFR 814.82","mandatory":false,"path_order":61},{"key":"I.2","parent_key":"I","label":"Post-market surveillance under section 522","mandatory":false,"path_order":62},{"key":"I.3","parent_key":"I","label":"MDR procedures and complaint handling — 21 CFR 803","mandatory":true,"path_order":63},{"key":"J","parent_key":null,"label":"J · Environmental assessment (21 CFR 814.20(b)(11))","mandatory":false,"path_order":64},{"key":"K","parent_key":null,"label":"K · Bibliography (21 CFR 814.20(b)(8))","mandatory":true,"path_order":65},{"key":"L","parent_key":null,"label":"L · Device sample or photographs (21 CFR 814.20(b)(9))","mandatory":false,"path_order":66},{"key":"M","parent_key":null,"label":"M · Other information requested by FDA (21 CFR 814.20(b)(13))","mandatory":false,"path_order":67}]'::jsonb,
     -- A PMA is a CDRH submission and goes through the CDRH Customer
     -- Collaboration Portal, not the eCTD gateway a drug application uses. Same
     -- reasoning as ide:fda in 20260806b.
     'CDRH-Portal',
     now())
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- Supersede the six-node stub, pointing at its replacement. Documents already
  -- built against 'fda-pma-2024' keep the version they were actually built from.
  UPDATE c2c_rule_packs
     SET superseded_by = 'fda-pma-21cfr814-20-v1.0'
   WHERE doc_type = 'pma'
     AND agency = 'fda'
     AND version <> 'fda-pma-21cfr814-20-v1.0'
     AND superseded_by IS NULL;
END
$mig$;
