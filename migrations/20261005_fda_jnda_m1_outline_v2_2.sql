-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: File Module 1 where FDA and PMDA file it in the nda:fda, bla:fda,
--          anda:fda and jnda:pmda rule packs, so the compile, validate and
--          readiness gates stop requiring headings that hold something else.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 only. Modules 2–5 of every new version are the prior
--     version's, node for node.
--   - Integrity Risk Addressed: a gate that demands the wrong heading. The gates
--     derive what an application must file from these packs' mandatory flags
--     (server/services/ectd/required-sections.ts requiredSectionsFromPack), so
--     an NDA that filed its environmental assessment correctly at 1.12.14 read
--     "missing 1.19", and a carton label at 1.14.1.1 read "missing 1.14.4".
--
-- Determinism Contract:
--   - New versions; no existing row's required_sections is rewritten.
--   - Idempotent on replay (Rule 1): ON CONFLICT DO NOTHING, supersede guarded on
--     superseded_by IS NULL and the exact prior version, then a row-count RAISE.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2026-10-05 · D2 · g-fda-jnda-rule-pack-m1-v2-2
--
-- WHAT WAS WRONG (the live packs before this file)
--   nda:fda / bla:fda ich-m4-v2.1 (migrations/20260804, required by the gates):
--     1.19   'Environmental analysis', mandatory. FDA 1.19 is Pre-EUA and EUA; the
--            environmental analysis is 1.12.14, and the pack had no 1.12.14.
--     1.14.4 'Label and container labeling', mandatory. FDA 1.14.4 is
--            investigational labeling; draft carton/container labels are 1.14.1.1.
--     1.14.5 'Structured product labeling (SPL)', mandatory. FDA 1.14.5 is foreign
--            labeling; the draft labeling text (SPL) is 1.14.1.3.
--     1.3.1  'Contact and agent information', mandatory. FDA 1.3.1 holds CHANGES
--            (address, agent, sponsor) — the defect 20260902 corrected for IND.
--     1.4    one node for letters of authorization AND right of reference; FDA
--            has 1.4.1 and 1.4.2.
--     1.14.1 labelled '(PLLR)'. The prescribing-information format is PLR; PLLR
--            is the pregnancy and lactation labeling rule.
--   anda:fda fda-anda-21cfr314-94-v1.0 (migrations/20260806b):
--     1.3.5  'Field copy certification'. FDA files it at 1.3.2; 1.3.5 is patent
--            and exclusivity.
--     1.15 / 1.15.1 / 1.15.2 patent and exclusivity, all mandatory. FDA 1.15 is
--            Promotional material. 1.15.3 'Exclusivity statement' is not an FDA
--            heading at all (FDA: 1.3.5.3 exclusivity claim).
--   jnda:pmda ich-m4-v2.1 (migrations/20260804): 1.1–1.10, 1.12, 1.13 — no 1.11.
--     PMDA files the draft risk management plan (医薬品リスク管理計画書（案）)
--     with an approval application at CTD M1.11.
--
-- WHAT IS NOW TRUE (new versions, Module 1 only)
--   nda:fda, bla:fda  ich-m4-v2.2              1.12.14 environmental analysis
--     (mandatory) and no 1.19; 1.14.1 Draft labeling → 1.14.1.1 draft carton and
--     container labels + 1.14.1.3 draft labeling text (USPI in PLR format; SPL),
--     both mandatory, and no 1.14.4 / 1.14.5; 1.3.1 optional; 1.4 → 1.4.1 letters
--     of authorization + 1.4.2 statements of right of reference, both optional.
--   anda:fda          fda-anda-21cfr314-94-v1.1  1.3.2 field copy certification
--     (optional — FDA says an individual field copy is no longer needed for an
--     eCTD submission); 1.3.5 patent and exclusivity → 1.3.5.1 patent
--     information, 1.3.5.2 patent certification, 1.3.5.3 exclusivity claim, all
--     mandatory; no 1.15.x.
--   jnda:pmda         ich-m4-v2.2              1.11 draft risk management plan
--     (医薬品リスク管理計画書（案）), mandatory, between 1.10 and 1.12.
--   Every other node, label and flag is the prior version's. The sources and
--   which flags are recall rather than regulator text are in each row's
--   uncertainties, and in
--   docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-fda-jnda-rule-pack-m1-v2-2-facts.md.
--
-- NOT CHANGED HERE
--   maa:ema is not minted: product decision 3 of 2026-10-05
--   (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/DECISIONS.md) —
--   no rule pack is minted from EU Module 1 text nobody has read.
--   NDA 1.3.5 patent information stays optional and 1.18 proprietary name request
--   stays mandatory. Both flags are doubtful from recall (21 CFR 314.50(h)/314.53;
--   not every application requests a name) and are named in the uncertainties,
--   not changed on recall.
--
-- THE LIMIT
--   A c2c_documents row already bound to nda/bla ich-m4-v2.1, anda v1.0 or jnda
--   v2.1 keeps that outline: c2c_documents carries a composite FK to
--   (doc_type, agency, version), and rewriting a version's tree would change what
--   a scaffolded document claims to have been built against — in a Part 11 table,
--   a falsified record. New projects get the new versions (the scaffolder and the
--   gates select superseded_by IS NULL). Existing documents are detected and
--   surfaced, never rewritten silently (product decision 6).
--
-- RULE 1 (every file in C2C_MIGRATION_FILES re-runs on every deploy)
--   No DROP and no edit of 20260804 / 20260806b. 20260810c re-runs before this
--   file on every deploy and resets governing_rule for ich-m4-% and anda rows; the
--   provenance UPDATE below runs after it every time, so the final state is this
--   file's. ON CONFLICT DO NOTHING never corrects a wrong row already holding a new
--   key, so the RAISE at the end refuses one whose node count is not this file's.
--   The RAISE requires each new row to be live OR superseded by a version that
--   exists, so a later version superseding one of these rows does not break the
--   replay.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
DECLARE
  expected CONSTANT jsonb := '[
    {"doc_type":"nda","agency":"fda","old":"ich-m4-v2.1","new":"ich-m4-v2.2","nodes":73,"m1":22},
    {"doc_type":"bla","agency":"fda","old":"ich-m4-v2.1","new":"ich-m4-v2.2","nodes":73,"m1":22},
    {"doc_type":"anda","agency":"fda","old":"fda-anda-21cfr314-94-v1.0","new":"fda-anda-21cfr314-94-v1.1","nodes":46,"m1":21},
    {"doc_type":"jnda","agency":"pmda","old":"ich-m4-v2.1","new":"ich-m4-v2.2","nodes":65,"m1":14}
  ]'::jsonb;
  e    jsonb;
  n    integer;
  m1   integer;
  sup  text;
BEGIN
  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping nda/bla/anda:fda and jnda:pmda Module 1 outlines';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('nda', 'fda', 'ich-m4-v2.2', 'NDA × FDA · 505(b)(1) · eCTD M1–M5',
     $pack$[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms (FDA 356h)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":4},{"key":"1.3.1","parent_key":"1.3","label":"Contact, sponsor and applicant information (changes of address, agent or sponsor)","mandatory":false,"path_order":5},{"key":"1.3.3","parent_key":"1.3","label":"Debarment certification","mandatory":true,"path_order":6},{"key":"1.3.4","parent_key":"1.3","label":"Financial disclosure (FDA 3454 / 3455)","mandatory":true,"path_order":7},{"key":"1.3.5","parent_key":"1.3","label":"Patent information","mandatory":false,"path_order":8},{"key":"1.4","parent_key":"M1","label":"References","mandatory":false,"path_order":9},{"key":"1.4.1","parent_key":"1.4","label":"Letters of authorization (DMF / cross-reference)","mandatory":false,"path_order":10},{"key":"1.4.2","parent_key":"1.4","label":"Statements of right of reference","mandatory":false,"path_order":11},{"key":"1.6","parent_key":"M1","label":"Meeting materials","mandatory":false,"path_order":12},{"key":"1.9","parent_key":"M1","label":"Pediatric administrative information (PSP / PREA)","mandatory":true,"path_order":13},{"key":"1.12","parent_key":"M1","label":"Other correspondence","mandatory":false,"path_order":14},{"key":"1.12.14","parent_key":"1.12","label":"Environmental analysis — environmental assessment or claim of categorical exclusion (21 CFR part 25)","mandatory":true,"path_order":15},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":true,"path_order":16},{"key":"1.14.1","parent_key":"1.14","label":"Draft labeling","mandatory":true,"path_order":17},{"key":"1.14.1.1","parent_key":"1.14.1","label":"Draft carton and container labels","mandatory":true,"path_order":18},{"key":"1.14.1.3","parent_key":"1.14.1","label":"Draft labeling text (USPI in PLR format; SPL)","mandatory":true,"path_order":19},{"key":"1.16","parent_key":"M1","label":"Risk evaluation and mitigation strategy (REMS)","mandatory":false,"path_order":20},{"key":"1.17","parent_key":"M1","label":"Postmarketing commitments and requirements","mandatory":false,"path_order":21},{"key":"1.18","parent_key":"M1","label":"Proprietary name request","mandatory":true,"path_order":22},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":23},{"key":"2.1","parent_key":"M2","label":"CTD table of contents","mandatory":true,"path_order":24},{"key":"2.2","parent_key":"M2","label":"Introduction","mandatory":true,"path_order":25},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":26},{"key":"2.4","parent_key":"M2","label":"Nonclinical overview","mandatory":true,"path_order":27},{"key":"2.5","parent_key":"M2","label":"Clinical overview","mandatory":true,"path_order":28},{"key":"2.6","parent_key":"M2","label":"Nonclinical written and tabulated summaries","mandatory":true,"path_order":29},{"key":"2.7","parent_key":"M2","label":"Clinical summary","mandatory":true,"path_order":30},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":31},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":32},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":33},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":34},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":35},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":36},{"key":"3.2.S.5","parent_key":"3.2.S","label":"Reference standards or materials","mandatory":true,"path_order":37},{"key":"3.2.S.6","parent_key":"3.2.S","label":"Container closure system","mandatory":true,"path_order":38},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":39},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":40},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":41},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":true,"path_order":42},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":43},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":44},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":45},{"key":"3.2.P.6","parent_key":"3.2.P","label":"Reference standards or materials","mandatory":true,"path_order":46},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":47},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":48},{"key":"3.2.A","parent_key":"M3","label":"Appendices","mandatory":false,"path_order":49},{"key":"3.2.A.1","parent_key":"3.2.A","label":"Facilities and equipment","mandatory":false,"path_order":50},{"key":"3.2.A.2","parent_key":"3.2.A","label":"Adventitious agents safety evaluation","mandatory":false,"path_order":51},{"key":"3.2.A.3","parent_key":"3.2.A","label":"Excipients","mandatory":false,"path_order":52},{"key":"3.2.R","parent_key":"M3","label":"Regional information","mandatory":true,"path_order":53},{"key":"3.3","parent_key":"M3","label":"Literature references","mandatory":false,"path_order":54},{"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical study reports","mandatory":true,"path_order":55},{"key":"4.2.1","parent_key":"M4","label":"Pharmacology","mandatory":true,"path_order":56},{"key":"4.2.2","parent_key":"M4","label":"Pharmacokinetics","mandatory":true,"path_order":57},{"key":"4.2.3","parent_key":"M4","label":"Toxicology","mandatory":true,"path_order":58},{"key":"4.3","parent_key":"M4","label":"Literature references","mandatory":false,"path_order":59},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":60},{"key":"5.2","parent_key":"M5","label":"Tabular listing of all clinical studies","mandatory":true,"path_order":61},{"key":"5.3.1","parent_key":"M5","label":"Reports of biopharmaceutic studies","mandatory":true,"path_order":62},{"key":"5.3.2","parent_key":"M5","label":"Reports of studies pertinent to PK using human biomaterials","mandatory":false,"path_order":63},{"key":"5.3.3","parent_key":"M5","label":"Reports of human pharmacokinetic studies","mandatory":true,"path_order":64},{"key":"5.3.4","parent_key":"M5","label":"Reports of human pharmacodynamic studies","mandatory":true,"path_order":65},{"key":"5.3.5","parent_key":"M5","label":"Reports of efficacy and safety studies","mandatory":true,"path_order":66},{"key":"5.3.5.1","parent_key":"5.3.5","label":"Study reports of controlled clinical studies","mandatory":true,"path_order":67},{"key":"5.3.5.2","parent_key":"5.3.5","label":"Study reports of uncontrolled clinical studies","mandatory":false,"path_order":68},{"key":"5.3.5.3","parent_key":"5.3.5","label":"Reports of analyses of data from more than one study (ISS / ISE)","mandatory":true,"path_order":69},{"key":"5.3.5.4","parent_key":"5.3.5","label":"Other clinical study reports","mandatory":false,"path_order":70},{"key":"5.3.6","parent_key":"M5","label":"Reports of post-marketing experience","mandatory":false,"path_order":71},{"key":"5.3.7","parent_key":"M5","label":"Case report forms and individual patient listings","mandatory":false,"path_order":72},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":73}]$pack$::jsonb,
     NULL,
     DATE '2026-10-05'),
    ('bla', 'fda', 'ich-m4-v2.2', 'BLA × FDA · 351(a) · eCTD M1–M5',
     $pack$[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (US)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms (FDA 356h)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":4},{"key":"1.3.1","parent_key":"1.3","label":"Contact, sponsor and applicant information (changes of address, agent or sponsor)","mandatory":false,"path_order":5},{"key":"1.3.3","parent_key":"1.3","label":"Debarment certification","mandatory":true,"path_order":6},{"key":"1.3.4","parent_key":"1.3","label":"Financial disclosure (FDA 3454 / 3455)","mandatory":true,"path_order":7},{"key":"1.3.5","parent_key":"1.3","label":"Patent information","mandatory":false,"path_order":8},{"key":"1.4","parent_key":"M1","label":"References","mandatory":false,"path_order":9},{"key":"1.4.1","parent_key":"1.4","label":"Letters of authorization (DMF / cross-reference)","mandatory":false,"path_order":10},{"key":"1.4.2","parent_key":"1.4","label":"Statements of right of reference","mandatory":false,"path_order":11},{"key":"1.6","parent_key":"M1","label":"Meeting materials","mandatory":false,"path_order":12},{"key":"1.9","parent_key":"M1","label":"Pediatric administrative information (PSP / PREA)","mandatory":true,"path_order":13},{"key":"1.12","parent_key":"M1","label":"Other correspondence","mandatory":false,"path_order":14},{"key":"1.12.14","parent_key":"1.12","label":"Environmental analysis — environmental assessment or claim of categorical exclusion (21 CFR part 25)","mandatory":true,"path_order":15},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":true,"path_order":16},{"key":"1.14.1","parent_key":"1.14","label":"Draft labeling","mandatory":true,"path_order":17},{"key":"1.14.1.1","parent_key":"1.14.1","label":"Draft carton and container labels","mandatory":true,"path_order":18},{"key":"1.14.1.3","parent_key":"1.14.1","label":"Draft labeling text (USPI in PLR format; SPL)","mandatory":true,"path_order":19},{"key":"1.16","parent_key":"M1","label":"Risk evaluation and mitigation strategy (REMS)","mandatory":false,"path_order":20},{"key":"1.17","parent_key":"M1","label":"Postmarketing commitments and requirements","mandatory":false,"path_order":21},{"key":"1.18","parent_key":"M1","label":"Proprietary name request","mandatory":true,"path_order":22},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":23},{"key":"2.1","parent_key":"M2","label":"CTD table of contents","mandatory":true,"path_order":24},{"key":"2.2","parent_key":"M2","label":"Introduction","mandatory":true,"path_order":25},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":26},{"key":"2.4","parent_key":"M2","label":"Nonclinical overview","mandatory":true,"path_order":27},{"key":"2.5","parent_key":"M2","label":"Clinical overview","mandatory":true,"path_order":28},{"key":"2.6","parent_key":"M2","label":"Nonclinical written and tabulated summaries","mandatory":true,"path_order":29},{"key":"2.7","parent_key":"M2","label":"Clinical summary","mandatory":true,"path_order":30},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":31},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":32},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":33},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":34},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":35},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":36},{"key":"3.2.S.5","parent_key":"3.2.S","label":"Reference standards or materials","mandatory":true,"path_order":37},{"key":"3.2.S.6","parent_key":"3.2.S","label":"Container closure system","mandatory":true,"path_order":38},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":39},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":40},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":41},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":true,"path_order":42},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":43},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":44},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":45},{"key":"3.2.P.6","parent_key":"3.2.P","label":"Reference standards or materials","mandatory":true,"path_order":46},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":47},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":48},{"key":"3.2.A","parent_key":"M3","label":"Appendices","mandatory":true,"path_order":49},{"key":"3.2.A.1","parent_key":"3.2.A","label":"Facilities and equipment","mandatory":true,"path_order":50},{"key":"3.2.A.2","parent_key":"3.2.A","label":"Adventitious agents safety evaluation","mandatory":true,"path_order":51},{"key":"3.2.A.3","parent_key":"3.2.A","label":"Excipients","mandatory":false,"path_order":52},{"key":"3.2.R","parent_key":"M3","label":"Regional information","mandatory":true,"path_order":53},{"key":"3.3","parent_key":"M3","label":"Literature references","mandatory":false,"path_order":54},{"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical study reports","mandatory":true,"path_order":55},{"key":"4.2.1","parent_key":"M4","label":"Pharmacology","mandatory":true,"path_order":56},{"key":"4.2.2","parent_key":"M4","label":"Pharmacokinetics","mandatory":true,"path_order":57},{"key":"4.2.3","parent_key":"M4","label":"Toxicology","mandatory":true,"path_order":58},{"key":"4.3","parent_key":"M4","label":"Literature references","mandatory":false,"path_order":59},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":60},{"key":"5.2","parent_key":"M5","label":"Tabular listing of all clinical studies","mandatory":true,"path_order":61},{"key":"5.3.1","parent_key":"M5","label":"Reports of biopharmaceutic studies","mandatory":true,"path_order":62},{"key":"5.3.2","parent_key":"M5","label":"Reports of studies pertinent to PK using human biomaterials","mandatory":false,"path_order":63},{"key":"5.3.3","parent_key":"M5","label":"Reports of human pharmacokinetic studies","mandatory":true,"path_order":64},{"key":"5.3.4","parent_key":"M5","label":"Reports of human pharmacodynamic studies","mandatory":true,"path_order":65},{"key":"5.3.5","parent_key":"M5","label":"Reports of efficacy and safety studies","mandatory":true,"path_order":66},{"key":"5.3.5.1","parent_key":"5.3.5","label":"Study reports of controlled clinical studies","mandatory":true,"path_order":67},{"key":"5.3.5.2","parent_key":"5.3.5","label":"Study reports of uncontrolled clinical studies","mandatory":false,"path_order":68},{"key":"5.3.5.3","parent_key":"5.3.5","label":"Reports of analyses of data from more than one study (ISS / ISE)","mandatory":true,"path_order":69},{"key":"5.3.5.4","parent_key":"5.3.5","label":"Other clinical study reports","mandatory":false,"path_order":70},{"key":"5.3.6","parent_key":"M5","label":"Reports of post-marketing experience","mandatory":false,"path_order":71},{"key":"5.3.7","parent_key":"M5","label":"Case report forms and individual patient listings","mandatory":false,"path_order":72},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":73}]$pack$::jsonb,
     NULL,
     DATE '2026-10-05'),
    ('anda', 'fda', 'fda-anda-21cfr314-94-v1.1', 'ANDA × FDA · 21 CFR 314.94 (eCTD M1, M2, M3, M5)',
     $pack$[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative information (US)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Forms (FDA 356h, 3674)","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Cover letter","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Administrative information","mandatory":true,"path_order":4},{"key":"1.3.2","parent_key":"1.3","label":"Field copy certification (21 CFR 314.94(d)(5))","mandatory":false,"path_order":5},{"key":"1.3.5","parent_key":"1.3","label":"Patent and exclusivity","mandatory":true,"path_order":6},{"key":"1.3.5.1","parent_key":"1.3.5","label":"Patent information","mandatory":true,"path_order":7},{"key":"1.3.5.2","parent_key":"1.3.5","label":"Patent certification (Paragraph I / II / III / IV) or section viii statement","mandatory":true,"path_order":8},{"key":"1.3.5.3","parent_key":"1.3.5","label":"Exclusivity claim (exclusivity statement)","mandatory":true,"path_order":9},{"key":"1.4","parent_key":"M1","label":"References","mandatory":false,"path_order":10},{"key":"1.5","parent_key":"M1","label":"Application status","mandatory":false,"path_order":11},{"key":"1.6","parent_key":"M1","label":"Meetings","mandatory":false,"path_order":12},{"key":"1.7","parent_key":"M1","label":"Fast track / expedited","mandatory":false,"path_order":13},{"key":"1.12","parent_key":"M1","label":"Other correspondence","mandatory":false,"path_order":14},{"key":"1.12.11","parent_key":"1.12","label":"Basis for ANDA submission — reference listed drug (RLD)","mandatory":true,"path_order":15},{"key":"1.12.12","parent_key":"1.12","label":"Comparison between generic drug and RLD","mandatory":true,"path_order":16},{"key":"1.12.14","parent_key":"1.12","label":"Environmental analysis / categorical exclusion","mandatory":true,"path_order":17},{"key":"1.12.15","parent_key":"1.12","label":"Request for waiver of in vivo bioavailability studies","mandatory":false,"path_order":18},{"key":"1.14","parent_key":"M1","label":"Labeling","mandatory":true,"path_order":19},{"key":"1.14.1","parent_key":"1.14","label":"Draft labeling","mandatory":true,"path_order":20},{"key":"1.14.3","parent_key":"1.14","label":"Labeling comparison with RLD (side-by-side)","mandatory":true,"path_order":21},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":22},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":23},{"key":"2.7","parent_key":"M2","label":"Clinical summary — bioequivalence","mandatory":true,"path_order":24},{"key":"2.7.1","parent_key":"2.7","label":"Summary of biopharmaceutic studies and analytical methods","mandatory":true,"path_order":25},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":26},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":27},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":28},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":29},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":30},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":31},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":32},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":33},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":34},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":true,"path_order":35},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":36},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":37},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":38},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":39},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":40},{"key":"3.2.R","parent_key":"M3","label":"Regional information (executed batch records, comparability protocols)","mandatory":true,"path_order":41},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":42},{"key":"5.3.1","parent_key":"M5","label":"Reports of biopharmaceutic studies","mandatory":true,"path_order":43},{"key":"5.3.1.2","parent_key":"5.3.1","label":"Comparative bioavailability and bioequivalence study reports","mandatory":true,"path_order":44},{"key":"5.3.1.4","parent_key":"5.3.1","label":"Reports of bioanalytical and analytical methods","mandatory":true,"path_order":45},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":46}]$pack$::jsonb,
     'ESG',
     DATE '2026-10-05'),
    ('jnda', 'pmda', 'ich-m4-v2.2', 'J-NDA × PMDA · eCTD M1–M5',
     $pack$[{"key":"M1","parent_key":null,"label":"Module 1 · Administrative (JP)","mandatory":true,"path_order":1},{"key":"1.1","parent_key":"M1","label":"Table of contents","mandatory":true,"path_order":2},{"key":"1.2","parent_key":"M1","label":"Approval application form","mandatory":true,"path_order":3},{"key":"1.3","parent_key":"M1","label":"Certificates","mandatory":true,"path_order":4},{"key":"1.4","parent_key":"M1","label":"Patent status","mandatory":false,"path_order":5},{"key":"1.5","parent_key":"M1","label":"Origin or history of discovery, and usage in foreign countries","mandatory":true,"path_order":6},{"key":"1.6","parent_key":"M1","label":"Usage conditions in foreign countries","mandatory":false,"path_order":7},{"key":"1.7","parent_key":"M1","label":"List of similar drugs","mandatory":true,"path_order":8},{"key":"1.8","parent_key":"M1","label":"Proposed package insert","mandatory":true,"path_order":9},{"key":"1.9","parent_key":"M1","label":"Documents relating to the generic (JAN) name","mandatory":false,"path_order":10},{"key":"1.10","parent_key":"M1","label":"Summary of poisonous / powerful drug designation review","mandatory":false,"path_order":11},{"key":"1.11","parent_key":"M1","label":"Draft risk management plan — 医薬品リスク管理計画書（案）","mandatory":true,"path_order":12},{"key":"1.12","parent_key":"M1","label":"List of attached documents","mandatory":true,"path_order":13},{"key":"1.13","parent_key":"M1","label":"Other","mandatory":false,"path_order":14},{"key":"M2","parent_key":null,"label":"Module 2 · Summaries","mandatory":true,"path_order":15},{"key":"2.1","parent_key":"M2","label":"CTD table of contents","mandatory":true,"path_order":16},{"key":"2.2","parent_key":"M2","label":"Introduction","mandatory":true,"path_order":17},{"key":"2.3","parent_key":"M2","label":"Quality overall summary","mandatory":true,"path_order":18},{"key":"2.4","parent_key":"M2","label":"Nonclinical overview","mandatory":true,"path_order":19},{"key":"2.5","parent_key":"M2","label":"Clinical overview","mandatory":true,"path_order":20},{"key":"2.6","parent_key":"M2","label":"Nonclinical written and tabulated summaries","mandatory":true,"path_order":21},{"key":"2.7","parent_key":"M2","label":"Clinical summary","mandatory":true,"path_order":22},{"key":"M3","parent_key":null,"label":"Module 3 · Quality (CMC)","mandatory":true,"path_order":23},{"key":"3.2.S","parent_key":"M3","label":"Drug substance","mandatory":true,"path_order":24},{"key":"3.2.S.1","parent_key":"3.2.S","label":"General information","mandatory":true,"path_order":25},{"key":"3.2.S.2","parent_key":"3.2.S","label":"Manufacture","mandatory":true,"path_order":26},{"key":"3.2.S.3","parent_key":"3.2.S","label":"Characterisation","mandatory":true,"path_order":27},{"key":"3.2.S.4","parent_key":"3.2.S","label":"Control of drug substance","mandatory":true,"path_order":28},{"key":"3.2.S.5","parent_key":"3.2.S","label":"Reference standards or materials","mandatory":true,"path_order":29},{"key":"3.2.S.6","parent_key":"3.2.S","label":"Container closure system","mandatory":true,"path_order":30},{"key":"3.2.S.7","parent_key":"3.2.S","label":"Stability","mandatory":true,"path_order":31},{"key":"3.2.P","parent_key":"M3","label":"Drug product","mandatory":true,"path_order":32},{"key":"3.2.P.1","parent_key":"3.2.P","label":"Description and composition","mandatory":true,"path_order":33},{"key":"3.2.P.2","parent_key":"3.2.P","label":"Pharmaceutical development","mandatory":true,"path_order":34},{"key":"3.2.P.3","parent_key":"3.2.P","label":"Manufacture","mandatory":true,"path_order":35},{"key":"3.2.P.4","parent_key":"3.2.P","label":"Control of excipients","mandatory":true,"path_order":36},{"key":"3.2.P.5","parent_key":"3.2.P","label":"Control of drug product","mandatory":true,"path_order":37},{"key":"3.2.P.6","parent_key":"3.2.P","label":"Reference standards or materials","mandatory":true,"path_order":38},{"key":"3.2.P.7","parent_key":"3.2.P","label":"Container closure system","mandatory":true,"path_order":39},{"key":"3.2.P.8","parent_key":"3.2.P","label":"Stability","mandatory":true,"path_order":40},{"key":"3.2.A","parent_key":"M3","label":"Appendices","mandatory":false,"path_order":41},{"key":"3.2.A.1","parent_key":"3.2.A","label":"Facilities and equipment","mandatory":false,"path_order":42},{"key":"3.2.A.2","parent_key":"3.2.A","label":"Adventitious agents safety evaluation","mandatory":false,"path_order":43},{"key":"3.2.A.3","parent_key":"3.2.A","label":"Excipients","mandatory":false,"path_order":44},{"key":"3.2.R","parent_key":"M3","label":"Regional information","mandatory":true,"path_order":45},{"key":"3.3","parent_key":"M3","label":"Literature references","mandatory":false,"path_order":46},{"key":"M4","parent_key":null,"label":"Module 4 · Nonclinical study reports","mandatory":true,"path_order":47},{"key":"4.2.1","parent_key":"M4","label":"Pharmacology","mandatory":true,"path_order":48},{"key":"4.2.2","parent_key":"M4","label":"Pharmacokinetics","mandatory":true,"path_order":49},{"key":"4.2.3","parent_key":"M4","label":"Toxicology","mandatory":true,"path_order":50},{"key":"4.3","parent_key":"M4","label":"Literature references","mandatory":false,"path_order":51},{"key":"M5","parent_key":null,"label":"Module 5 · Clinical study reports","mandatory":true,"path_order":52},{"key":"5.2","parent_key":"M5","label":"Tabular listing of all clinical studies","mandatory":true,"path_order":53},{"key":"5.3.1","parent_key":"M5","label":"Reports of biopharmaceutic studies","mandatory":true,"path_order":54},{"key":"5.3.2","parent_key":"M5","label":"Reports of studies pertinent to PK using human biomaterials","mandatory":false,"path_order":55},{"key":"5.3.3","parent_key":"M5","label":"Reports of human pharmacokinetic studies","mandatory":true,"path_order":56},{"key":"5.3.4","parent_key":"M5","label":"Reports of human pharmacodynamic studies","mandatory":true,"path_order":57},{"key":"5.3.5","parent_key":"M5","label":"Reports of efficacy and safety studies","mandatory":true,"path_order":58},{"key":"5.3.5.1","parent_key":"5.3.5","label":"Study reports of controlled clinical studies","mandatory":true,"path_order":59},{"key":"5.3.5.2","parent_key":"5.3.5","label":"Study reports of uncontrolled clinical studies","mandatory":false,"path_order":60},{"key":"5.3.5.3","parent_key":"5.3.5","label":"Reports of analyses of data from more than one study (ISS / ISE)","mandatory":true,"path_order":61},{"key":"5.3.5.4","parent_key":"5.3.5","label":"Other clinical study reports","mandatory":false,"path_order":62},{"key":"5.3.6","parent_key":"M5","label":"Reports of post-marketing experience","mandatory":false,"path_order":63},{"key":"5.3.7","parent_key":"M5","label":"Case report forms and individual patient listings","mandatory":false,"path_order":64},{"key":"5.4","parent_key":"M5","label":"Literature references","mandatory":false,"path_order":65}]$pack$::jsonb,
     NULL,
     DATE '2026-10-05')
  ON CONFLICT (doc_type, agency, version) DO NOTHING;

  -- Provenance (columns exist once 20260810c has run; guarded so a database
  -- that never had that migration still gets the outlines).
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'c2c_rule_packs' AND column_name = 'source_basis') THEN
    UPDATE c2c_rule_packs SET
      source_basis   = 'harmonised_standard',
      confidence     = 'high',
      governing_rule = 'ICH M4 — Organisation of the CTD (Modules 2–5); FDA eCTD Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (US regional Module 1); 21 CFR 314.50 (NDA content and format)',
      uncertainties  = 'Module 1 headings checked against the FDA Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (https://www.fda.gov/media/76444/download) on 2026-10-05: environmental analysis at 1.12.14 (1.19 is Pre-EUA and EUA), draft carton and container labels at 1.14.1.1 and draft labeling text (SPL) at 1.14.1.3 (1.14.4 is investigational labeling, 1.14.5 foreign labeling), letters of authorization at 1.4.1 and right of reference at 1.4.2. Mandatory flags are defaults to be tuned per programme: 1.3.1 is optional because it holds changes of address, agent or sponsor; 1.3.5 patent information is left optional and 1.18 proprietary name request is left mandatory, both doubtful from recall (21 CFR 314.50(h) and 314.53 require patent information for an NDA; not every application requests a proprietary name) and not checked against regulator text. Not reviewed by a regulatory professional; confirm against current FDA guidance before filing.'
    WHERE doc_type = 'nda' AND agency = 'fda' AND version = 'ich-m4-v2.2';

    UPDATE c2c_rule_packs SET
      source_basis   = 'harmonised_standard',
      confidence     = 'high',
      governing_rule = 'ICH M4 — Organisation of the CTD (Modules 2–5); FDA eCTD Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (US regional Module 1); 21 CFR 601.2 (biologics license application)',
      uncertainties  = 'Module 1 headings checked against the FDA Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (https://www.fda.gov/media/76444/download) on 2026-10-05: environmental analysis at 1.12.14 (1.19 is Pre-EUA and EUA), draft carton and container labels at 1.14.1.1 and draft labeling text (SPL) at 1.14.1.3 (1.14.4 is investigational labeling, 1.14.5 foreign labeling), letters of authorization at 1.4.1 and right of reference at 1.4.2. Mandatory flags are defaults to be tuned per programme: 1.3.1 is optional because it holds changes of address, agent or sponsor; 1.3.5 patent information is left optional and 1.18 proprietary name request is left mandatory, both from recall and not checked against regulator text. Not reviewed by a regulatory professional; confirm against current FDA guidance before filing.'
    WHERE doc_type = 'bla' AND agency = 'fda' AND version = 'ich-m4-v2.2';

    UPDATE c2c_rule_packs SET
      source_basis   = 'statutory_transcription',
      confidence     = 'high',
      governing_rule = '21 CFR 314.94 — Content and format of an abbreviated application; FDA guidance ANDA Submissions — Content and Format; FDA eCTD Comprehensive Table of Contents Headings and Hierarchy v2.3.3 (US regional Module 1)',
      uncertainties  = 'Module 1 placement checked against FDA guidance ANDA Submissions — Content and Format (https://www.fda.gov/media/128127/download) and the Comprehensive Table of Contents v2.3.3 (https://www.fda.gov/media/76444/download) on 2026-10-05: field copy certification at 1.3.2; patent information, patent certification and exclusivity at 1.3.5.1, 1.3.5.2 and 1.3.5.3 (1.15 is Promotional material). 1.3.2 is optional because the guidance says an individual field copy is no longer required for an eCTD submission. The 1.3.5.3 exclusivity statement is mandatory as a default; whether every ANDA must file one has not been confirmed against regulator text. Not reviewed by a regulatory professional; confirm against current FDA guidance before filing.'
    WHERE doc_type = 'anda' AND agency = 'fda' AND version = 'fda-anda-21cfr314-94-v1.1';

    UPDATE c2c_rule_packs SET
      source_basis   = 'harmonised_standard',
      confidence     = 'medium',
      governing_rule = 'ICH M4 — Organisation of the CTD (Modules 2–5); MHLW/PMDA CTD Module 1 (Japan regional); PMDA domestic eCTD Q&A (M1.11 医薬品リスク管理計画書（案）)',
      uncertainties  = '1.11 draft risk management plan (医薬品リスク管理計画書（案）) added: the PMDA domestic eCTD Q&A (https://www.pmda.go.jp/int-activities/int-harmony/ich/0083.html) and the PMDA RMP example notice (https://www.pmda.go.jp/files/000221872.pdf) place the draft RMP filed with an approval application at CTD M1.11 (checked 2026-10-05). Its mandatory flag is a default from recall (an RMP is expected with a new drug application). The other Module 1 headings are unchanged from ich-m4-v2.1 and are recall, not checked against the MHLW CTD notice. Not reviewed by a regulatory professional; confirm against current PMDA/MHLW notices before filing.'
    WHERE doc_type = 'jnda' AND agency = 'pmda' AND version = 'ich-m4-v2.2';
  END IF;

  UPDATE c2c_rule_packs SET superseded_by = 'ich-m4-v2.2'
   WHERE doc_type = 'nda' AND agency = 'fda' AND version = 'ich-m4-v2.1'
     AND superseded_by IS NULL;

  UPDATE c2c_rule_packs SET superseded_by = 'ich-m4-v2.2'
   WHERE doc_type = 'bla' AND agency = 'fda' AND version = 'ich-m4-v2.1'
     AND superseded_by IS NULL;

  UPDATE c2c_rule_packs SET superseded_by = 'fda-anda-21cfr314-94-v1.1'
   WHERE doc_type = 'anda' AND agency = 'fda' AND version = 'fda-anda-21cfr314-94-v1.0'
     AND superseded_by IS NULL;

  UPDATE c2c_rule_packs SET superseded_by = 'ich-m4-v2.2'
   WHERE doc_type = 'jnda' AND agency = 'pmda' AND version = 'ich-m4-v2.1'
     AND superseded_by IS NULL;

  -- Row-count assertion (CLAUDE.md Rule 1, seed corollary): a missing or
  -- truncated new row, a new row superseded by nothing that exists, or an old
  -- row still live fails the deploy here instead of shipping a partial tree.
  FOR e IN SELECT * FROM jsonb_array_elements(expected) LOOP
    SELECT jsonb_array_length(required_sections),
           (SELECT count(*) FROM jsonb_array_elements(required_sections) s
             WHERE s->>'key' = 'M1' OR s->>'key' LIKE '1.%'),
           superseded_by
      INTO n, m1, sup
      FROM c2c_rule_packs
     WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND version = e->>'new';
    IF NOT FOUND OR n IS DISTINCT FROM (e->>'nodes')::int OR m1 IS DISTINCT FROM (e->>'m1')::int THEN
      RAISE EXCEPTION '%:% % must hold % nodes (% in Module 1); found % (%)',
        e->>'doc_type', e->>'agency', e->>'new', e->>'nodes', e->>'m1', coalesce(n::text, 'no row'), coalesce(m1::text, '-');
    END IF;
    IF sup IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM c2c_rule_packs
          WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND version = sup) THEN
      RAISE EXCEPTION '%:% % is superseded by %, which does not exist', e->>'doc_type', e->>'agency', e->>'new', sup;
    END IF;
    IF EXISTS (SELECT 1 FROM c2c_rule_packs
                WHERE doc_type = e->>'doc_type' AND agency = e->>'agency' AND version = e->>'old'
                  AND superseded_by IS NULL) THEN
      RAISE EXCEPTION '%:% % is still live after %', e->>'doc_type', e->>'agency', e->>'old', e->>'new';
    END IF;
  END LOOP;
END
$mig$;
