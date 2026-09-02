-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Reseed the ind:fda outline with FDA eCTD Module 1 Specification v2.3 numbering and the leaf granularity an IND is actually authored at.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (FDA regional, v2.3 heading list); Modules 2–5 to leaf granularity (3.2.S.4, 4.2.3.2, 5.3.5.1)
--   - Integrity Risk Addressed: broken cross-refs and an unsatisfiable compile gate — the live pack's Module 1 stopped at four headings, so 21 CFR 312.23(a)(3)/(a)(5) and 21 CFR 25.31 content had nowhere to be authored and the platform's own 1.20 / 1.14.4.x check could never pass
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Numbering authority: the same v2.3 heading list the packager derives its
--     us-regional.xml heading elements from, so tree and package agree.
--   - Idempotent reseed of the outline pack; no customer content is altered.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- ind:fda — Module 1 numbered the way FDA files it, and the leaves an IND is
-- actually authored at
--
-- WHAT THIS CLOSES
-- The live ind:fda pack (ich-m4-v2.0, seeded by 20260528) was 24 coarse nodes.
-- Its Module 1 was numbered correctly but stopped at four headings, so the
-- editor had nowhere to author the three things 21 CFR 312.23 makes an initial
-- IND out of beyond the forms: the general investigational plan (312.23(a)(3)),
-- the investigator's brochure (312.23(a)(5)) and the environmental analysis
-- (21 CFR 25.31). The eCTD compile gate requires 1.20 and 1.14.4.x — so a
-- customer authoring against the live pack could never satisfy the platform's
-- own Module 1 check, whatever they wrote.
--
-- Modules 2–5 were single nodes for 3.2.S, 3.2.P, 4.2.x and 5.3.5 while every
-- other authoring rail (the CTD guidance overlay, the deep IND map, the NDA/BLA
-- packs) works at leaf granularity (3.2.S.4, 4.2.3.2, 5.3.5.1). The one tree the
-- editor renders was the shallowest tree in the product.
--
-- NUMBERING AUTHORITY
-- Module 1 follows the FDA eCTD Module 1 Specification v2.3 heading list, the
-- same list the packager derives its us-regional.xml heading elements from
-- (server/services/ectd/controlled-vocab/cv-v4-data.ts →
-- fda-regional-sections.ts). 1.1 forms · 1.2 cover letter · 1.3 administrative
-- information (1.3.4 financial disclosure) · 1.4 references · 1.12 other
-- correspondence (1.12.14 environmental analysis) · 1.14 labeling (1.14.4.1
-- investigator's brochure, 1.14.4.2 investigational drug labeling) · 1.20
-- general investigational plan for initial IND. Modules 2–5 follow ICH M4.
-- tests/regulatory/fda-module1-numbering.test.ts holds every IND tree in the
-- repository, this pack included, to that one list.
--
-- MANDATORY FLAGS are defaults for an initial IND under 21 CFR 312.23 and are to
-- be tuned per programme; they are not regulatory advice.
--
-- WHY A NEW VERSION RATHER THAN AN UPDATE
-- Same reason as 20260804, 20260806, 20260806b, 20260810 and 20260810b:
-- c2c_rule_packs is keyed (doc_type, agency, version) and c2c_documents carries
-- a composite FK to it. Rewriting required_sections in place would change what
-- already-scaffolded documents claim to have been built against — in a Part 11
-- table that is a falsified record. New version, then supersede.
--
-- Idempotent: ON CONFLICT DO NOTHING on the insert; the supersede UPDATE is
-- guarded on superseded_by IS NULL and scoped to the exact prior version.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping ind:fda M1 v2.3 outline';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('ind', 'fda', 'ich-m4-v2.1',
     'IND × FDA · eCTD M1 (FDA Module 1 Spec v2.3) + ICH M4 M2–M5',
     $pack$[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US regional — FDA eCTD Module 1 Specification v2.3)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms","mandatory":true,"path_order":2},{"key":"1.1.1","parent_key":"1.1","label":"Form FDA 1571 — Investigational New Drug Application","mandatory":true,"path_order":3},{"key":"1.1.2","parent_key":"1.1","label":"Form FDA 1572 — Statement of Investigator","mandatory":true,"path_order":4},{"key":"1.1.3","parent_key":"1.1","label":"Form FDA 3674 — Certification of Compliance (ClinicalTrials.gov)","mandatory":true,"path_order":5},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":6},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":7},{"key":"1.3.1","parent_key":"1.3","label":"Contact, sponsor and U.S. agent information","mandatory":true,"path_order":8},{"key":"1.3.4","parent_key":"1.3","label":"Financial certification and disclosure (Forms FDA 3454 / 3455)","mandatory":false,"path_order":9},{"key":"1.4","parent_key":"M1","label":"References","mandatory":false,"path_order":10},{"key":"1.4.1","parent_key":"1.4","label":"Letters of authorization (DMF / cross-reference)","mandatory":false,"path_order":11},{"key":"1.4.2","parent_key":"1.4","label":"Statements of right of reference","mandatory":false,"path_order":12},{"key":"1.12","parent_key":"M1","label":"Other correspondence","mandatory":true,"path_order":13},{"key":"1.12.1","parent_key":"1.12","label":"Pre-IND correspondence","mandatory":false,"path_order":14},{"key":"1.12.14","parent_key":"1.12","label":"Environmental analysis or claim of categorical exclusion (21 CFR 25.31)","mandatory":true,"path_order":15},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":true,"path_order":16},{"key":"1.14.4.1","parent_key":"1.14","label":"Investigator's brochure","mandatory":true,"path_order":17},{"key":"1.14.4.2","parent_key":"1.14","label":"Investigational drug labeling (21 CFR 312.6)","mandatory":true,"path_order":18},{"key":"1.20","parent_key":"M1","label":"Introductory statement and general investigational plan (21 CFR 312.23(a)(3))","mandatory":true,"path_order":19},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":20},{"key":"2.2","parent_key":"M2","label":"Introduction","mandatory":true,"path_order":21},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":22},{"key":"2.3.S","parent_key":"2.3","label":"Drug substance summary","mandatory":true,"path_order":23},{"key":"2.3.P","parent_key":"2.3","label":"Drug product summary","mandatory":true,"path_order":24},{"key":"2.4","parent_key":"M2","label":"Nonclinical overview","mandatory":true,"path_order":25},{"key":"2.5","parent_key":"M2","label":"Clinical overview","mandatory":true,"path_order":26},{"key":"2.6","parent_key":"M2","label":"Nonclinical written and tabulated summaries","mandatory":true,"path_order":27},{"key":"2.6.2","parent_key":"2.6","label":"Pharmacology written summary","mandatory":true,"path_order":28},{"key":"2.6.3","parent_key":"2.6","label":"Pharmacology tabulated summary","mandatory":false,"path_order":29},{"key":"2.6.4","parent_key":"2.6","label":"Pharmacokinetics written summary","mandatory":true,"path_order":30},{"key":"2.6.5","parent_key":"2.6","label":"Pharmacokinetics tabulated summary","mandatory":false,"path_order":31},{"key":"2.6.6","parent_key":"2.6","label":"Toxicology written summary","mandatory":true,"path_order":32},{"key":"2.6.7","parent_key":"2.6","label":"Toxicology tabulated summary","mandatory":false,"path_order":33},{"key":"2.7","parent_key":"M2","label":"Clinical summary (abbreviated for an initial IND)","mandatory":false,"path_order":34},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":35},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":36},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":37},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":38},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":39},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":40},{"key":"3.2.S.5","parent_key":"3.2.S","label":"Reference standards or materials","mandatory":false,"path_order":41},{"key":"3.2.S.6","parent_key":"3.2.S","label":"Container closure system","mandatory":true,"path_order":42},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":43},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":44},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":45},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":false,"path_order":46},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":47},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":48},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":49},{"key":"3.2.P.6","parent_key":"3.2.P","label":"Reference standards or materials","mandatory":false,"path_order":50},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":51},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":52},{"key":"3.2.A","parent_key":"M3","label":"Appendices","mandatory":false,"path_order":53},{"key":"3.2.A.1","parent_key":"3.2.A","label":"Facilities and equipment","mandatory":false,"path_order":54},{"key":"3.2.A.2","parent_key":"3.2.A","label":"Adventitious agents safety evaluation","mandatory":false,"path_order":55},{"key":"3.2.A.3","parent_key":"3.2.A","label":"Excipients (novel)","mandatory":false,"path_order":56},{"key":"3.2.R","parent_key":"M3","label":"Regional information","mandatory":false,"path_order":57},{"key":"3.3","parent_key":"M3","label":"Literature references","mandatory":false,"path_order":58},{"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical study reports","mandatory":true,"path_order":59},{"key":"4.2.1","parent_key":"M4","label":"Pharmacology","mandatory":true,"path_order":60},{"key":"4.2.1.1","parent_key":"4.2.1","label":"Primary pharmacodynamics","mandatory":true,"path_order":61},{"key":"4.2.1.2","parent_key":"4.2.1","label":"Secondary pharmacodynamics","mandatory":false,"path_order":62},{"key":"4.2.1.3","parent_key":"4.2.1","label":"Safety pharmacology","mandatory":true,"path_order":63},{"key":"4.2.1.4","parent_key":"4.2.1","label":"Pharmacodynamic drug interactions","mandatory":false,"path_order":64},{"key":"4.2.2","parent_key":"M4","label":"Pharmacokinetics","mandatory":true,"path_order":65},{"key":"4.2.2.1","parent_key":"4.2.2","label":"Analytical methods and validation reports","mandatory":false,"path_order":66},{"key":"4.2.2.2","parent_key":"4.2.2","label":"Absorption","mandatory":false,"path_order":67},{"key":"4.2.2.3","parent_key":"4.2.2","label":"Distribution","mandatory":false,"path_order":68},{"key":"4.2.2.4","parent_key":"4.2.2","label":"Metabolism","mandatory":false,"path_order":69},{"key":"4.2.2.5","parent_key":"4.2.2","label":"Excretion","mandatory":false,"path_order":70},{"key":"4.2.2.6","parent_key":"4.2.2","label":"Pharmacokinetic drug interactions (nonclinical)","mandatory":false,"path_order":71},{"key":"4.2.2.7","parent_key":"4.2.2","label":"Other pharmacokinetic studies","mandatory":false,"path_order":72},{"key":"4.2.3","parent_key":"M4","label":"Toxicology","mandatory":true,"path_order":73},{"key":"4.2.3.1","parent_key":"4.2.3","label":"Single-dose toxicity","mandatory":true,"path_order":74},{"key":"4.2.3.2","parent_key":"4.2.3","label":"Repeat-dose toxicity","mandatory":true,"path_order":75},{"key":"4.2.3.3","parent_key":"4.2.3","label":"Genotoxicity","mandatory":true,"path_order":76},{"key":"4.2.3.4","parent_key":"4.2.3","label":"Carcinogenicity","mandatory":false,"path_order":77},{"key":"4.2.3.5","parent_key":"4.2.3","label":"Reproductive and developmental toxicity","mandatory":false,"path_order":78},{"key":"4.2.3.6","parent_key":"4.2.3","label":"Local tolerance","mandatory":false,"path_order":79},{"key":"4.2.3.7","parent_key":"4.2.3","label":"Other toxicity studies","mandatory":false,"path_order":80},{"key":"4.3","parent_key":"M4","label":"Literature references","mandatory":false,"path_order":81},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":82},{"key":"5.2","parent_key":"M5","label":"Tabular listing of all clinical studies","mandatory":true,"path_order":83},{"key":"5.3","parent_key":"M5","label":"Clinical study reports","mandatory":true,"path_order":84},{"key":"5.3.1","parent_key":"5.3","label":"Reports of biopharmaceutic studies","mandatory":false,"path_order":85},{"key":"5.3.3","parent_key":"5.3","label":"Reports of human pharmacokinetic studies","mandatory":false,"path_order":86},{"key":"5.3.5","parent_key":"5.3","label":"Reports of efficacy and safety studies","mandatory":true,"path_order":87},{"key":"5.3.5.1","parent_key":"5.3.5","label":"Study reports of controlled clinical studies — includes the clinical protocol(s) and IRB information for an initial IND (21 CFR 312.23(a)(6))","mandatory":true,"path_order":88},{"key":"5.3.5.2","parent_key":"5.3.5","label":"Study reports of uncontrolled clinical studies","mandatory":false,"path_order":89},{"key":"5.3.5.4","parent_key":"5.3.5","label":"Other study reports — previous human experience (21 CFR 312.23(a)(9))","mandatory":false,"path_order":90},{"key":"5.3.7","parent_key":"5.3","label":"Case report forms and individual patient listings","mandatory":false,"path_order":91},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":92}]$pack$::jsonb,
     'ESG',
     DATE '2026-09-01')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- Provenance (columns exist once 20260810c has run; guarded so a database
  -- that never had that migration still gets the outline).
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis   = 'harmonised_standard',
      confidence     = 'high',
      governing_rule = 'ICH M4 — Organisation of the CTD (Modules 2–5); FDA eCTD Module 1 Specification v2.3 (US regional Module 1); 21 CFR 312.23 (IND content and format)',
      uncertainties  = 'Module 1 headings transcribed from the FDA Module 1 v2.3 heading list; mandatory flags are 21 CFR 312.23 defaults for an initial IND. Not reviewed by a regulatory professional; confirm against current FDA IND eCTD guidance before filing.'
    WHERE doc_type = 'ind' AND agency = 'fda' AND version = 'ich-m4-v2.1';
  END IF;

  UPDATE c2c_rule_packs SET superseded_by = 'ich-m4-v2.1'
   WHERE doc_type = 'ind' AND agency = 'fda' AND version = 'ich-m4-v2.0'
     AND superseded_by IS NULL;
END
$mig$;
