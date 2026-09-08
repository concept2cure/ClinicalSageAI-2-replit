-- Catalog descriptions are customer copy. Stop shipping engineering notes as it.
--
-- THE DEFECT. 20260810_reconcile_module_catalog.sql seeded each module's
-- `description` by copying the surface registry's `notes` field verbatim. Those
-- notes are written for whoever is building the surface next; the description
-- column is rendered to CUSTOMERS in the Apps catalog
-- (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx, the `Apps` surface,
-- which maps description straight into each card's `desc`).
--
-- So the catalog a prospect opens has been telling them, in the vendor's own
-- words, that the product is unfinished:
--
--   device-510k         "... In progress."
--   device-cer          "... Dashboard only today."
--   projects            "Entry to everything. Partially built in ui_kits/home and ui_kits/mdx."
--   template-library    "... No UI yet - strongest backend without a surface."
--   document-authoring  "... all have working backends, no UI."
--
-- device-510k is the sharpest case: it is the ONE module with a live
-- entitlement gate enforced against it, and its catalog card said "In progress."
--
-- Others leak internals rather than build status - repository paths, endpoint
-- routes, `@shared` module names, `ui_kits/`, "Contract ref (not yet a @shared
-- file)", "read-model", "SEGMENT_MODULES". 32 of the 84 descriptions carry one
-- or both.
--
-- WHY NO GATE CAUGHT IT. scripts/ci/check-internals-in-copy.mjs exists for
-- exactly this failure and passes clean, because it scans
-- `client/src/**/*.{ts,tsx}` only. This copy lives in SQL and reaches the client
-- over HTTP at runtime, so it is invisible to a source scan. The gate is
-- extended to cover this file in the same change; without that, the next person
-- to add a module re-introduces the problem and CI still says clean.
--
-- WHAT THIS DOES. Replaces those 33 descriptions with copy that says what the
-- module DOES for the person using it. No build status, no file paths, no
-- endpoint names, no roadmap language. The other 52 already read as product
-- copy and are left exactly as they are.
--
-- Capability claims are deliberately conservative: each sentence describes what
-- the surface presents today. Where a module's honest scope is narrower than
-- its name suggests, the description says the narrower thing rather than the
-- aspirational one - overstating capability in a catalog a regulated buyer
-- reads is a worse defect than the one being fixed.
--
-- REVERSIBILITY. Data-only, one transaction, single column. Descriptions are
-- display text: nothing keys on them, no entitlement reads them, and no
-- subscription row is touched. Re-running is a no-op.

BEGIN;

CREATE TEMP TABLE module_copy (module_id TEXT PRIMARY KEY, description TEXT NOT NULL)
  ON COMMIT DROP;

INSERT INTO module_copy (module_id, description) VALUES
  ('crl-library', 'Searchable library of FDA complete-response findings, drawn from the same regulatory evidence graph that CSR authoring, study design and AnA read.'),
  ('decision-lineage', 'The immutable, hash-chained record behind every governed artifact: who decided what, when, on what evidence, and signed how. Verifiable and exportable.'),
  ('device-510k', '510(k) submission workbench — eSTAR section tree, content editor, and predicate and substantial-equivalence analysis in one place.'),
  ('device-cer', 'Clinical Evaluation Reports for EU MDR — Annex XIV structure, literature and vigilance evidence, GSPR checklist, and export.'),
  ('device-diagnostics', 'IVD and diagnostics workbench — classification, analytical and clinical performance, risk analysis, and IVDR, CLIA, CDx and LDT pathways.'),
  ('device-pma', 'PMA submissions for Class III devices — module status, clinical trial metrics, and pathway progress across the program.'),
  ('device-presub', 'Pre-submission and Q-Sub management — meeting requests, briefing packages, agency feedback, and the commitments that follow.'),
  ('dispatch-readiness', 'The final gate before transmit — structural validation, unacknowledged critical findings, and validator results, in one decision.'),
  ('document-authoring', 'The regulatory document editor — simultaneous co-authoring, tracked changes, comments, version history, review, approval and electronic signature.'),
  ('ectd-compile', 'Compile, validate and export a submission-ready eCTD backbone across FDA and EMA for a program.'),
  ('gateway-transmittals', 'Dispatch submissions to agencies across regions — gateway roster, credential status, governed transmit with re-authentication, and acknowledgement tracking.'),
  ('global-ri', 'Global regulatory intelligence — country and region requirements, pathway comparison, and market-by-market planning.'),
  ('haq-manager', 'Health-authority questions — agency information requests, Day-120 lists of questions and complete response letters, decomposed into source-traced, signed responses.'),
  ('inconsistency', 'Change a governed value once and propagate it to every document that cites it. Draft sections update in place; approved sections are flagged for re-approval with a task and an audit entry.'),
  ('insights', 'Conversational governed reporting — 30 report types with a per-segment catalog and best-practice packs, assembled by AnA and traceable to source.'),
  ('intelligence-catalog', 'Reference catalog of the deterministic tools available across regulatory domains, with the trust level of each.'),
  ('ivd-completeness', 'IVDR technical-file completeness — GSPR Annex I, the Performance Evaluation Report under Annex XIII, analytical and clinical performance, scientific validity, and PMPF and PMS planning.'),
  ('labeling', 'Device labeling and instructions for use — authoring, the symbols register, and translation workflow.'),
  ('pdev', 'Product development through IND — activity tracking, AI drafting, evidence capture and confirmation across CMC, nonclinical, clinical and regulatory.'),
  ('projects', 'The portfolio entry point — programs, status and starred work; the door to everything else.'),
  ('pv-cockpit', 'Pharmacovigilance workbench — safety KPIs, disproportionality screening, expedited reporting clocks, and a regional compliance matrix.'),
  ('pyramid', 'Deterministic submission work breakdown — submission type selector, phase and task drill-down, critical path, and progress analytics.'),
  ('qmp', 'Quality management plans — lifecycle, completeness, gate-level status and risk factors.'),
  ('quality', 'SOP and controlled-document register with periodic review and read-and-understood tracking, plus the change-control log.'),
  ('rbm', 'Risk-based monitoring under ICH E6(R3) — risk assessment, key risk indicators, quality tolerance limits, central monitoring and site risk.'),
  ('report-governance', 'Sealed-report lifecycle — cryptographic integrity verification, provenance and attestations, and governed sealing and revocation with justification.'),
  ('risk', 'ISO 14971 risk management — the risk file, hazard analysis, and control measures with verification of effectiveness.'),
  ('shadow-review', 'AnA simulates the reviewer — FDA filing, EMA Day 120, PMDA, and MDR and IVDR notified body — and scores refuse-to-file and major-deficiency risk before you submit.'),
  ('source-tracer', 'Sentence-level provenance. Every claim carries a typed source link with a confidence score, untraced claims are surfaced, and citations are verified against PubMed and CrossRef.'),
  ('submission-center', 'The submission workspace — package assembly and preview, validation, and dispatch by agency gateway or eSTAR export.'),
  ('submission-twin', 'Living submission intelligence — readiness and fragility scoring, narrative drift detection, simulated reviewer challenges, and change-impact analysis.'),
  ('tasks', 'Task board with dependency mapping and critical path, plus channels, messages, activity and mentions.'),
  ('template-library', 'Organization-scoped template store — extract templates from existing documents, author from a specification, and render to Word or PDF.');

-- Diverge loudly rather than silently skipping. A module id renamed out of the
-- catalog would otherwise leave its old description in place with nothing said.
DO $$
DECLARE v_unknown TEXT;
BEGIN
  SELECT string_agg(c.module_id, ', ' ORDER BY c.module_id) INTO v_unknown
  FROM module_copy c LEFT JOIN available_modules m USING (module_id)
  WHERE m.module_id IS NULL;
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'copy names modules that are not in available_modules: %', v_unknown;
  END IF;
END $$;

UPDATE available_modules m
   SET description = c.description,
       updated_at = now()
  FROM module_copy c
 WHERE c.module_id = m.module_id
   AND m.description IS DISTINCT FROM c.description;

COMMIT;
