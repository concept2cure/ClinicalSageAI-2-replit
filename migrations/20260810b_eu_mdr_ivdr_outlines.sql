-- ═══════════════════════════════════════════════════════════════════════════════
-- mdr:ema and ivdr:ema — EU MDR 2017/745 and IVDR 2017/746 technical documentation
--
-- WHAT THIS CLOSES
-- Thirteen EU device and diagnostics filing types were offered in the New Project
-- wizard and every one of them scaffolded a US NDA: eu_mdr_i, eu_mdr_iia,
-- eu_mdr_iib, eu_mdr_iii, eu_sig_change, eu_clin_inv, eu_ivdr_a, eu_ivdr_b,
-- eu_ivdr_cd, cdx_ivdr_d, ivdr_perf_study, ivdr_pmpf, ivd_pms_plan. Their
-- registry rows had no pathwayKey, defaulted to 'ctd', and programTypeFor
-- returned 'nda'. A CE-marking technical file became a 71-section 505(b)(1)
-- marketing application.
--
-- The client-side routing was fixed first, which stopped the wrong dossier but
-- left them mapped to 'device'/'ivd' — both deliberately unmapped, so they failed
-- closed and produced nothing. Honest, and unsellable. This is the other half:
-- real doc_types with real outlines, so the whole EU device and diagnostics
-- segment becomes deliverable instead of merely non-lying.
--
-- WHY 'mdr' AND 'ivdr' ARE LEGITIMATE doc_types WHEN 'device' AND 'ivd' ARE NOT
-- 'device' names a product class, not a submission — it could be a 510(k), a
-- De Novo, a PMA or an IDE, which is why document-class.ts refuses to map it and
-- why that refusal stays. MDR Annex II and IVDR Annex II are the opposite: one
-- named, enumerated dossier structure each, defined by the Regulation itself.
-- There is nothing to guess.
--
-- WHY THIS SHAPE
-- MDR: Annex II §1-6 (description and specification, information supplied,
-- design and manufacturing, GSPR, benefit-risk and risk management, verification
-- and validation) + Annex III (PMS plan, PMS report/PSUR, PMCF plan and report),
-- plus the conformity and registration artifacts a CE mark actually requires —
-- EU declaration of conformity (Annex IV), Notified Body certificate, EUDAMED
-- registration, SSCP for Class III and implantables (Article 32), and the PRRC
-- under Article 15.
--
-- IVDR: the same Annex II/III spine, but the verification half is the one that
-- distinguishes an IVD — analytical performance (LoD/LoQ, interference and
-- cross-reactivity, trueness and precision, measuring range, metrological
-- traceability) and clinical performance (scientific validity, diagnostic
-- sensitivity and specificity, the Annex XIII performance evaluation report).
-- Neither belongs in an MDR file and neither exists in a CTD.
--
-- Class-dependent items are mandatory=false, not omitted. A Class I device needs
-- no Notified Body certificate; a Class D IVD needs EU reference laboratory
-- testing. A dossier demanding both of everything is as wrong as one omitting
-- them where the Regulation requires them.
--
-- WHY agency 'ema'
-- Neither Regulation is administered by EMA — conformity assessment is done by
-- Notified Bodies and registration is in EUDAMED. 'ema' is used because it is the
-- EU value c2c_documents_agency_check admits, it is what the registry rows
-- already carry, and cer:ema (MEDDEV 2.7/1 rev4) set that precedent. Naming a
-- Notified Body as the agency would be more accurate and would violate the CHECK;
-- widening the CHECK for a cosmetic gain is not worth a second migration.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $mig$
BEGIN
  -- Widen doc_type first. A strict superset of the previous IN-list, so no
  -- existing row can be invalidated and no backfill is needed. DROP ... IF
  -- EXISTS because on a drizzle-push database the table exists while the named
  -- constraint does not.
  IF to_regclass('public.c2c_documents') IS NOT NULL THEN
    ALTER TABLE c2c_documents DROP CONSTRAINT IF EXISTS c2c_documents_doc_type_check;
    ALTER TABLE c2c_documents ADD CONSTRAINT c2c_documents_doc_type_check
      CHECK (doc_type IN ('ind','cta','nda','anda','bla','maa','jnda','k510','denovo','pma',
                          'ide','cer','mdr','ivdr','psur','ib','protocol','csr','briefing',
                          'mod3','mod2','haq'));
  END IF;

  IF to_regclass('public.c2c_rule_packs') IS NULL THEN
    RAISE NOTICE 'c2c_rule_packs not present - skipping mdr:ema and ivdr:ema outlines';
    RETURN;
  END IF;

  INSERT INTO c2c_rule_packs
    (doc_type, agency, version, label, required_sections, esubmit_channel, effective_from)
  VALUES
    ('mdr', 'ema', 'eu-mdr-2017-745-annex-ii-v1.0',
     'EU MDR × Notified Body · Regulation 2017/745 Annex II + III',
     '[{"key":"II","parent_key":null,"label":"Annex II · Technical documentation","mandatory":true,"path_order":1},{"key":"II.1","parent_key":"II","label":"1 · Device description and specification","mandatory":true,"path_order":2},{"key":"II.1.a","parent_key":"II.1","label":"Product/trade name, general description, intended purpose and intended users","mandatory":true,"path_order":3},{"key":"II.1.b","parent_key":"II.1","label":"Basic UDI-DI and UDI-DI assigned by the manufacturer","mandatory":true,"path_order":4},{"key":"II.1.c","parent_key":"II.1","label":"Risk class and applicable classification rule (Annex VIII)","mandatory":true,"path_order":5},{"key":"II.1.d","parent_key":"II.1","label":"Principles of operation and mode of action","mandatory":true,"path_order":6},{"key":"II.1.e","parent_key":"II.1","label":"Rationale for qualification as a medical device","mandatory":true,"path_order":7},{"key":"II.1.f","parent_key":"II.1","label":"Variants, configurations and accessories","mandatory":false,"path_order":8},{"key":"II.1.g","parent_key":"II.1","label":"Reference to previous and similar generations of the device","mandatory":false,"path_order":9},{"key":"II.2","parent_key":"II","label":"2 · Information supplied by the manufacturer","mandatory":true,"path_order":10},{"key":"II.2.a","parent_key":"II.2","label":"Labels on the device and its packaging","mandatory":true,"path_order":11},{"key":"II.2.b","parent_key":"II.2","label":"Instructions for use, in the required Union languages","mandatory":true,"path_order":12},{"key":"II.3","parent_key":"II","label":"3 · Design and manufacturing information","mandatory":true,"path_order":13},{"key":"II.3.a","parent_key":"II.3","label":"Design stages applied to the device","mandatory":true,"path_order":14},{"key":"II.3.b","parent_key":"II.3","label":"Manufacturing processes and their validation","mandatory":true,"path_order":15},{"key":"II.3.c","parent_key":"II.3","label":"Sites of design and manufacture, including suppliers and subcontractors","mandatory":true,"path_order":16},{"key":"II.4","parent_key":"II","label":"4 · General safety and performance requirements (Annex I)","mandatory":true,"path_order":17},{"key":"II.4.a","parent_key":"II.4","label":"GSPR checklist — applicability, method of conformity, evidence","mandatory":true,"path_order":18},{"key":"II.4.b","parent_key":"II.4","label":"Harmonised standards and common specifications applied","mandatory":true,"path_order":19},{"key":"II.5","parent_key":"II","label":"5 · Benefit-risk analysis and risk management (Annex I §1, §8)","mandatory":true,"path_order":20},{"key":"II.5.a","parent_key":"II.5","label":"Risk management plan and file — EN ISO 14971","mandatory":true,"path_order":21},{"key":"II.5.b","parent_key":"II.5","label":"Benefit-risk determination and residual risk acceptability","mandatory":true,"path_order":22},{"key":"II.6","parent_key":"II","label":"6 · Product verification and validation","mandatory":true,"path_order":23},{"key":"II.6.1","parent_key":"II.6","label":"6.1 · Pre-clinical and clinical data","mandatory":true,"path_order":24},{"key":"II.6.1.a","parent_key":"II.6.1","label":"Biocompatibility — EN ISO 10993 series","mandatory":true,"path_order":25},{"key":"II.6.1.b","parent_key":"II.6.1","label":"Physical, chemical and microbiological characterisation","mandatory":true,"path_order":26},{"key":"II.6.1.c","parent_key":"II.6.1","label":"Electrical safety and EMC — EN 60601 series","mandatory":false,"path_order":27},{"key":"II.6.1.d","parent_key":"II.6.1","label":"Software verification and validation — EN 62304","mandatory":false,"path_order":28},{"key":"II.6.1.e","parent_key":"II.6.1","label":"Stability, shelf life and transport validation","mandatory":true,"path_order":29},{"key":"II.6.1.f","parent_key":"II.6.1","label":"Usability and human factors — EN 62366-1","mandatory":false,"path_order":30},{"key":"II.6.1.g","parent_key":"II.6.1","label":"Clinical evaluation report — Annex XIV Part A","mandatory":true,"path_order":31},{"key":"II.6.2","parent_key":"II.6","label":"6.2 · Additional information in specific cases","mandatory":true,"path_order":32},{"key":"II.6.2.a","parent_key":"II.6.2","label":"Devices incorporating a medicinal substance","mandatory":false,"path_order":33},{"key":"II.6.2.b","parent_key":"II.6.2","label":"Devices of human or animal origin","mandatory":false,"path_order":34},{"key":"II.6.2.c","parent_key":"II.6.2","label":"CMR or endocrine-disrupting substances — Annex I §10.4","mandatory":false,"path_order":35},{"key":"II.6.2.d","parent_key":"II.6.2","label":"Sterile devices — sterilisation validation and packaging","mandatory":false,"path_order":36},{"key":"II.6.2.e","parent_key":"II.6.2","label":"Devices with a measuring function","mandatory":false,"path_order":37},{"key":"III","parent_key":null,"label":"Annex III · Post-market surveillance","mandatory":true,"path_order":38},{"key":"III.1","parent_key":"III","label":"1 · Post-market surveillance plan (Article 84)","mandatory":true,"path_order":39},{"key":"III.2","parent_key":"III","label":"2 · PMS report (Class I) or PSUR (Class IIa/IIb/III, Article 86)","mandatory":true,"path_order":40},{"key":"III.3","parent_key":"III","label":"3 · Post-market clinical follow-up plan — Annex XIV Part B","mandatory":true,"path_order":41},{"key":"III.4","parent_key":"III","label":"4 · PMCF evaluation report","mandatory":false,"path_order":42},{"key":"IV","parent_key":null,"label":"Conformity assessment and registration","mandatory":true,"path_order":43},{"key":"IV.1","parent_key":"IV","label":"EU declaration of conformity — Annex IV","mandatory":true,"path_order":44},{"key":"IV.2","parent_key":"IV","label":"Notified Body certificate and conformity assessment route","mandatory":false,"path_order":45},{"key":"IV.3","parent_key":"IV","label":"EUDAMED registration — actor, device and UDI data","mandatory":true,"path_order":46},{"key":"IV.4","parent_key":"IV","label":"Summary of safety and clinical performance (SSCP) — Class III and implantable","mandatory":false,"path_order":47},{"key":"IV.5","parent_key":"IV","label":"Person responsible for regulatory compliance — Article 15","mandatory":true,"path_order":48},{"key":"IV.6","parent_key":"IV","label":"Authorised Representative mandate — Article 11","mandatory":false,"path_order":49}]'::jsonb,
     -- Not ESG and not CTIS. An MDR technical file goes to a Notified Body, and
     -- device and UDI data are registered in EUDAMED.
     'EUDAMED',
     now()),
    ('ivdr', 'ema', 'eu-ivdr-2017-746-annex-ii-v1.0',
     'EU IVDR × Notified Body · Regulation 2017/746 Annex II + III',
     '[{"key":"II","parent_key":null,"label":"Annex II · Technical documentation","mandatory":true,"path_order":1},{"key":"II.1","parent_key":"II","label":"1 · Device description and specification","mandatory":true,"path_order":2},{"key":"II.1.a","parent_key":"II.1","label":"Product name, general description, intended purpose and intended user","mandatory":true,"path_order":3},{"key":"II.1.b","parent_key":"II.1","label":"Basic UDI-DI and UDI-DI","mandatory":true,"path_order":4},{"key":"II.1.c","parent_key":"II.1","label":"Risk class and applicable classification rule (Annex VIII)","mandatory":true,"path_order":5},{"key":"II.1.d","parent_key":"II.1","label":"Scientific principle, mode of action and analyte/marker measured","mandatory":true,"path_order":6},{"key":"II.1.e","parent_key":"II.1","label":"Specimen types, matrices and intended testing population","mandatory":true,"path_order":7},{"key":"II.1.f","parent_key":"II.1","label":"Companion diagnostic designation and associated medicinal product","mandatory":false,"path_order":8},{"key":"II.1.g","parent_key":"II.1","label":"Instrumentation, software and required reagents/calibrators/controls","mandatory":false,"path_order":9},{"key":"II.2","parent_key":"II","label":"2 · Information supplied by the manufacturer","mandatory":true,"path_order":10},{"key":"II.2.a","parent_key":"II.2","label":"Labels on the device, packaging and any calibrators or controls","mandatory":true,"path_order":11},{"key":"II.2.b","parent_key":"II.2","label":"Instructions for use, in the required Union languages","mandatory":true,"path_order":12},{"key":"II.3","parent_key":"II","label":"3 · Design and manufacturing information","mandatory":true,"path_order":13},{"key":"II.3.a","parent_key":"II.3","label":"Design stages and design control","mandatory":true,"path_order":14},{"key":"II.3.b","parent_key":"II.3","label":"Manufacturing processes and their validation","mandatory":true,"path_order":15},{"key":"II.3.c","parent_key":"II.3","label":"Sites of design and manufacture, suppliers and subcontractors","mandatory":true,"path_order":16},{"key":"II.4","parent_key":"II","label":"4 · General safety and performance requirements (Annex I)","mandatory":true,"path_order":17},{"key":"II.4.a","parent_key":"II.4","label":"GSPR checklist — applicability, method of conformity, evidence","mandatory":true,"path_order":18},{"key":"II.4.b","parent_key":"II.4","label":"Harmonised standards and common specifications applied","mandatory":true,"path_order":19},{"key":"II.5","parent_key":"II","label":"5 · Benefit-risk analysis and risk management","mandatory":true,"path_order":20},{"key":"II.5.a","parent_key":"II.5","label":"Risk management plan and file — EN ISO 14971","mandatory":true,"path_order":21},{"key":"II.5.b","parent_key":"II.5","label":"Benefit-risk determination and residual risk acceptability","mandatory":true,"path_order":22},{"key":"II.6","parent_key":"II","label":"6 · Product verification and validation","mandatory":true,"path_order":23},{"key":"II.6.1","parent_key":"II.6","label":"6.1 · Analytical performance","mandatory":true,"path_order":24},{"key":"II.6.1.a","parent_key":"II.6.1","label":"Analytical sensitivity — limit of detection and limit of quantitation","mandatory":true,"path_order":25},{"key":"II.6.1.b","parent_key":"II.6.1","label":"Analytical specificity — interference and cross-reactivity","mandatory":true,"path_order":26},{"key":"II.6.1.c","parent_key":"II.6.1","label":"Trueness, precision (repeatability and reproducibility) and accuracy","mandatory":true,"path_order":27},{"key":"II.6.1.d","parent_key":"II.6.1","label":"Measuring range, linearity and cut-off determination","mandatory":true,"path_order":28},{"key":"II.6.1.e","parent_key":"II.6.1","label":"Metrological traceability of calibrators and control materials","mandatory":true,"path_order":29},{"key":"II.6.1.f","parent_key":"II.6.1","label":"Specimen stability, matrix equivalence and sample carry-over","mandatory":true,"path_order":30},{"key":"II.6.2","parent_key":"II.6","label":"6.2 · Clinical performance and evidence","mandatory":true,"path_order":31},{"key":"II.6.2.a","parent_key":"II.6.2","label":"Scientific validity of the analyte-condition association","mandatory":true,"path_order":32},{"key":"II.6.2.b","parent_key":"II.6.2","label":"Clinical performance — sensitivity, specificity, predictive values, likelihood ratios","mandatory":true,"path_order":33},{"key":"II.6.2.c","parent_key":"II.6.2","label":"Performance evaluation plan and report (PER) — Annex XIII","mandatory":true,"path_order":34},{"key":"II.6.2.d","parent_key":"II.6.2","label":"Clinical performance study protocol and report — Annex XIII Part A §2","mandatory":false,"path_order":35},{"key":"II.6.3","parent_key":"II.6","label":"6.3 · Stability","mandatory":true,"path_order":36},{"key":"II.6.3.a","parent_key":"II.6.3","label":"Claimed shelf life and real-time stability","mandatory":true,"path_order":37},{"key":"II.6.3.b","parent_key":"II.6.3","label":"In-use stability and open-vial stability","mandatory":true,"path_order":38},{"key":"II.6.3.c","parent_key":"II.6.3","label":"Shipping and transport stability","mandatory":true,"path_order":39},{"key":"II.6.4","parent_key":"II.6","label":"6.4 · Software and cybersecurity","mandatory":false,"path_order":40},{"key":"II.6.4.a","parent_key":"II.6.4","label":"Software verification and validation — EN 62304","mandatory":false,"path_order":41},{"key":"II.6.4.b","parent_key":"II.6.4","label":"IT security, network and interoperability measures","mandatory":false,"path_order":42},{"key":"II.6.5","parent_key":"II.6","label":"6.5 · Usability and human factors — EN 62366-1","mandatory":false,"path_order":43},{"key":"III","parent_key":null,"label":"Annex III · Post-market surveillance","mandatory":true,"path_order":44},{"key":"III.1","parent_key":"III","label":"1 · Post-market surveillance plan (Article 79)","mandatory":true,"path_order":45},{"key":"III.2","parent_key":"III","label":"2 · PMS report (Class A/B) or PSUR (Class C/D, Article 81)","mandatory":true,"path_order":46},{"key":"III.3","parent_key":"III","label":"3 · Post-market performance follow-up plan — Annex XIII Part B","mandatory":true,"path_order":47},{"key":"III.4","parent_key":"III","label":"4 · PMPF evaluation report","mandatory":false,"path_order":48},{"key":"IV","parent_key":null,"label":"Conformity assessment and registration","mandatory":true,"path_order":49},{"key":"IV.1","parent_key":"IV","label":"EU declaration of conformity — Annex IV","mandatory":true,"path_order":50},{"key":"IV.2","parent_key":"IV","label":"Notified Body certificate and conformity assessment route","mandatory":false,"path_order":51},{"key":"IV.3","parent_key":"IV","label":"EUDAMED registration — actor, device and UDI data","mandatory":true,"path_order":52},{"key":"IV.4","parent_key":"IV","label":"Summary of safety and performance (SSP) — Class C and D","mandatory":false,"path_order":53},{"key":"IV.5","parent_key":"IV","label":"Person responsible for regulatory compliance — Article 15","mandatory":true,"path_order":54},{"key":"IV.6","parent_key":"IV","label":"EU reference laboratory testing — Class D","mandatory":false,"path_order":55}]'::jsonb,
     'EUDAMED',
     now())
  ON CONFLICT (doc_type, agency, version) DO NOTHING;
END
$mig$;
