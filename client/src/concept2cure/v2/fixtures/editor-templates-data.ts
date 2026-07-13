/**
 * Regulatory template library (core pathways) -- ported verbatim from concept2cure-v2:
 *   app/editor-ta-templates.jsx -> REG_TEMPLATES (ctd through biosimilar)
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Shared template interfaces ---- */

export interface TemplateItem {
  readonly id: string;
  readonly num: string;
  readonly label: string;
}

export interface TemplateGroup {
  readonly group: string;
  readonly items: readonly TemplateItem[];
}

/* ---- Core pathway templates ---- */

export const REG_TEMPLATES_CORE: Record<string, readonly TemplateGroup[]> = {

  /* CTD (NDA/BLA universal) */
  ctd: [
    { group: 'Module 1 — Administrative', items: [
      { id: 't-356h', num: '1.1', label: 'FDA 356h application form' },
      { id: 't-1571', num: '1.1', label: 'FDA 1571 (IND) form' },
      { id: 't-cover', num: '1.2', label: 'Cover letter' },
      { id: 't-pi', num: '1.14.1', label: 'Prescribing information (PLR/PLLR)' },
      { id: 't-meet', num: '1.6', label: 'Meeting request / briefing package' },
      { id: 't-patent', num: '1.3.1', label: 'Patent information' },
      { id: 't-excl', num: '1.3.2', label: 'Exclusivity claim' },
      { id: 't-debarment', num: '1.3.4', label: 'Debarment certification' },
      { id: 't-foia', num: '1.3.5', label: 'Field copy certification (FOI)' },
      { id: 't-env', num: '1.3.3', label: 'Environmental assessment / categorical exclusion' },
    ] },
    { group: 'Module 2 — CTD Summaries', items: [
      { id: 't-toc', num: '2.1', label: 'CTD table of contents' },
      { id: 't-intro', num: '2.2', label: 'CTD introduction' },
      { id: 't-qos', num: '2.3', label: 'Quality overall summary' },
      { id: 't-nco', num: '2.4', label: 'Nonclinical overview' },
      { id: 't-clo', num: '2.5', label: 'Clinical overview' },
      { id: 't-251', num: '2.5.1', label: 'Product development rationale' },
      { id: 't-252', num: '2.5.2', label: 'Overview of biopharmaceutics' },
      { id: 't-253', num: '2.5.3', label: 'Overview of clinical pharmacology' },
      { id: 't-254', num: '2.5.4', label: 'Overview of efficacy' },
      { id: 't-255', num: '2.5.5', label: 'Overview of safety' },
      { id: 't-256', num: '2.5.6', label: 'Benefit-risk conclusions' },
      { id: 't-261', num: '2.6.1', label: 'Introduction (nonclinical)' },
      { id: 't-262', num: '2.6.2', label: 'Pharmacology written summary' },
      { id: 't-263', num: '2.6.3', label: 'Pharmacology tabulated summary' },
      { id: 't-264', num: '2.6.4', label: 'Pharmacokinetics written summary' },
      { id: 't-265', num: '2.6.5', label: 'Pharmacokinetics tabulated summary' },
      { id: 't-266', num: '2.6.6', label: 'Toxicology written summary' },
      { id: 't-267', num: '2.6.7', label: 'Toxicology tabulated summary' },
      { id: 't-271', num: '2.7.1', label: 'Summary of biopharmaceutic studies' },
      { id: 't-272', num: '2.7.2', label: 'Summary of clinical pharmacology studies' },
      { id: 't-273', num: '2.7.3', label: 'Summary of clinical efficacy' },
      { id: 't-274', num: '2.7.4', label: 'Summary of clinical safety' },
      { id: 't-275', num: '2.7.5', label: 'Literature references' },
      { id: 't-276', num: '2.7.6', label: 'Synopses of individual studies' },
    ] },
    { group: 'Module 3 — Quality (CMC)', items: [
      { id: 't-32s1', num: '3.2.S.1', label: 'Drug substance — general information' },
      { id: 't-32s2', num: '3.2.S.2', label: 'Drug substance — manufacture' },
      { id: 't-32s3', num: '3.2.S.3', label: 'Drug substance — characterisation' },
      { id: 't-32s4', num: '3.2.S.4', label: 'Control of drug substance' },
      { id: 't-32s5', num: '3.2.S.5', label: 'Reference standards' },
      { id: 't-32s6', num: '3.2.S.6', label: 'Container closure system' },
      { id: 't-32s7', num: '3.2.S.7', label: 'Stability — drug substance' },
      { id: 't-32p1', num: '3.2.P.1', label: 'Drug product — description & composition' },
      { id: 't-32p2', num: '3.2.P.2', label: 'Pharmaceutical development' },
      { id: 't-32p3', num: '3.2.P.3', label: 'Drug product — manufacture' },
      { id: 't-32p4', num: '3.2.P.4', label: 'Control of excipients' },
      { id: 't-32p5', num: '3.2.P.5', label: 'Control of drug product' },
      { id: 't-32p6', num: '3.2.P.6', label: 'Reference standards (drug product)' },
      { id: 't-32p7', num: '3.2.P.7', label: 'Container closure system (drug product)' },
      { id: 't-32p8', num: '3.2.P.8', label: 'Stability — drug product' },
      { id: 't-32a1', num: '3.2.A.1', label: 'Facilities & equipment' },
      { id: 't-32a2', num: '3.2.A.2', label: 'Adventitious agents safety evaluation' },
      { id: 't-32a3', num: '3.2.A.3', label: 'Novel excipients' },
      { id: 't-32r', num: '3.2.R', label: 'Regional information' },
    ] },
    { group: 'Module 4 — Nonclinical', items: [
      { id: 't-421', num: '4.2.1', label: 'Pharmacology — primary pharmacodynamics' },
      { id: 't-4212', num: '4.2.1.2', label: 'Pharmacology — secondary pharmacodynamics' },
      { id: 't-4213', num: '4.2.1.3', label: 'Pharmacology — safety pharmacology' },
      { id: 't-422', num: '4.2.2', label: 'Pharmacokinetics — ADME studies' },
      { id: 't-4231', num: '4.2.3.1', label: 'Toxicology — single-dose toxicity' },
      { id: 't-4232', num: '4.2.3.2', label: 'Toxicology — repeat-dose toxicity' },
      { id: 't-4233', num: '4.2.3.3', label: 'Toxicology — genotoxicity' },
      { id: 't-4234', num: '4.2.3.4', label: 'Toxicology — carcinogenicity' },
      { id: 't-4235', num: '4.2.3.5', label: 'Toxicology — reproductive & developmental' },
      { id: 't-4237', num: '4.2.3.7', label: 'Toxicology — other studies (immunotox, dependence, phototox)' },
      { id: 't-423', num: '4.2.3', label: 'Toxicology study report' },
    ] },
    { group: 'Module 5 — Clinical', items: [
      { id: 't-531', num: '5.3.1', label: 'BA / BE study reports' },
      { id: 't-532', num: '5.3.2', label: 'Comparative PK reports' },
      { id: 't-533', num: '5.3.3', label: 'Human PK study report' },
      { id: 't-534', num: '5.3.4', label: 'Human PD study report' },
      { id: 't-535', num: '5.3.5', label: 'Efficacy & safety CSR (ICH E3)' },
      { id: 't-5353', num: '5.3.5.3', label: 'Integrated summary of safety (ISS)' },
      { id: 't-5354', num: '5.3.5.3', label: 'Integrated summary of efficacy (ISE)' },
      { id: 't-54', num: '5.4', label: 'Literature references' },
    ] },
  ],

  /* eSTAR (510(k)) */
  estar: [
    { group: 'Administrative', items: [
      { id: 't-3881', num: '§05', label: 'Indications for use (FDA 3881)' },
      { id: 't-k510sum', num: '§06', label: '510(k) summary' },
      { id: 't-k510stmt', num: '§06', label: '510(k) statement' },
      { id: 't-truthful', num: '§04', label: 'Truthful & accuracy statement' },
      { id: 't-class3', num: '§04', label: 'Class III certification (if applicable)' },
    ] },
    { group: 'Device & Substantial Equivalence', items: [
      { id: 't-se', num: '§07', label: 'Substantial equivalence discussion' },
      { id: 't-devdesc', num: '§08', label: 'Device description' },
      { id: 't-compare', num: '§07', label: 'SE comparison table' },
      { id: 't-predicate', num: '§07', label: 'Predicate device information' },
    ] },
    { group: 'Performance & Safety', items: [
      { id: 't-bench', num: '§14', label: 'Bench performance test report' },
      { id: 't-biocomp', num: '§11', label: 'Biocompatibility evaluation (ISO 10993)' },
      { id: 't-soft', num: '§12', label: 'Software documentation (IEC 62304)' },
      { id: 't-cyber', num: '§17', label: 'Cybersecurity documentation' },
      { id: 't-ster', num: '§10', label: 'Sterilization & shelf life' },
      { id: 't-emc', num: '§15', label: 'EMC / electrical safety (IEC 60601)' },
      { id: 't-label510', num: '§09', label: 'Proposed labeling' },
      { id: 't-clin510', num: '§13', label: 'Clinical data (if applicable)' },
      { id: 't-hf510', num: '§16', label: 'Human factors / usability (IEC 62366)' },
      { id: 't-wireless', num: '§18', label: 'Wireless / RF testing' },
      { id: 't-mri', num: '§19', label: 'MRI safety evaluation' },
    ] },
  ],

  /* PMA */
  pma: [
    { group: 'Summary & Administrative', items: [
      { id: 't-ssed', num: '2.1', label: 'Summary of safety & effectiveness (SSED)' },
      { id: 't-device-pma', num: '2.2', label: 'Device description' },
      { id: 't-ifu-pma', num: '2.3', label: 'Indications for use' },
      { id: 't-alt-pma', num: '2.4', label: 'Alternative practices & procedures' },
      { id: 't-market-pma', num: '2.5', label: 'Marketing history' },
    ] },
    { group: 'Manufacturing & Quality', items: [
      { id: 't-qsr', num: '3.2', label: 'Quality system (QSR) summary' },
      { id: 't-mfg-pma', num: '3.1', label: 'Manufacturing information' },
      { id: 't-sterilize-pma', num: '3.3', label: 'Sterilization information' },
      { id: 't-shelf-pma', num: '3.4', label: 'Shelf life / packaging' },
      { id: 't-biocomp-pma', num: '3.5', label: 'Biocompatibility' },
      { id: 't-soft-pma', num: '3.6', label: 'Software (IEC 62304)' },
    ] },
    { group: 'Non-Clinical Testing', items: [
      { id: 't-risk', num: '2.2', label: 'Risk analysis (ISO 14971)' },
      { id: 't-bench-pma', num: '4.1', label: 'Non-clinical laboratory studies' },
      { id: 't-animal-pma', num: '4.2', label: 'Animal testing' },
    ] },
    { group: 'Clinical', items: [
      { id: 't-clin', num: '5.1', label: 'Clinical investigation summary' },
      { id: 't-protocol-pma', num: '5.2', label: 'Clinical protocol' },
      { id: 't-irb-pma', num: '5.3', label: 'IRB information' },
      { id: 't-sap', num: '5.4', label: 'Statistical analysis plan' },
      { id: 't-csr-pma', num: '5.5', label: 'Clinical study report' },
    ] },
    { group: 'Post-Approval', items: [
      { id: 't-pas', num: '6.1', label: 'Post-approval study plan' },
      { id: 't-pma-supp', num: '6.2', label: 'PMA supplement (180-day / real-time / 30-day)' },
      { id: 't-pma-annual', num: '6.3', label: 'PMA annual report' },
    ] },
  ],

  /* CER (EU MDR) */
  cer: [
    { group: 'Scope & Planning', items: [
      { id: 't-cerscope', num: '1', label: 'Scope of the clinical evaluation' },
      { id: 't-cep', num: '2', label: 'Clinical evaluation plan (MEDDEV 2.7/1 Rev 4)' },
      { id: 't-equiv', num: '3', label: 'Equivalence demonstration' },
    ] },
    { group: 'Clinical Evidence', items: [
      { id: 't-sota', num: '4', label: 'State-of-the-art analysis' },
      { id: 't-litprot', num: 'A', label: 'Literature search protocol' },
      { id: 't-litappr', num: '5', label: 'Literature appraisal (Stage 1–3)' },
      { id: 't-clindata', num: '6', label: 'Analysis of clinical data' },
    ] },
    { group: 'Conformity & Conclusions', items: [
      { id: 't-gspr', num: '7', label: 'GSPR conformity checklist (Annex I)' },
      { id: 't-br-cer', num: '8', label: 'Benefit-risk analysis' },
      { id: 't-cerconc', num: '9', label: 'Clinical evaluation conclusions' },
    ] },
    { group: 'Post-Market', items: [
      { id: 't-pmcf', num: '10', label: 'PMCF plan (MDCG 2020-7)' },
      { id: 't-pmcfr', num: '11', label: 'PMCF evaluation report' },
      { id: 't-sscp', num: '12', label: 'Summary of safety & clinical performance (SSCP)' },
    ] },
  ],

  /* CSR (ICH E3) */
  csr: [
    { group: 'Front Matter', items: [
      { id: 't-syn', num: '—', label: 'Synopsis' },
      { id: 't-toc-csr', num: '—', label: 'Table of contents' },
      { id: 't-abbr', num: '—', label: 'List of abbreviations' },
    ] },
    { group: 'Ethics & Study Design', items: [
      { id: 't-ethics', num: '1', label: 'Ethics (IRB/IEC, ICF, regulatory compliance)' },
      { id: 't-intro-csr', num: '2', label: 'Study introduction' },
      { id: 't-obj', num: '3', label: 'Study objectives' },
      { id: 't-plan', num: '4', label: 'Investigational plan (design, endpoints, dosing)' },
      { id: 't-sap-csr', num: '5', label: 'Statistical methods' },
      { id: 't-disposition', num: '6', label: 'Study patients — disposition, demographics, compliance' },
    ] },
    { group: 'Results', items: [
      { id: 't-eff', num: '7', label: 'Efficacy evaluation' },
      { id: 't-saf', num: '8', label: 'Safety evaluation (AEs, lab, vital signs, deaths)' },
    ] },
    { group: 'Conclusions', items: [
      { id: 't-disc', num: '9', label: 'Discussion & overall conclusions' },
      { id: 't-append', num: '10–16', label: 'Appendices (protocol, CRFs, patient listings, publications)' },
    ] },
  ],

  /* IND */
  ind: [
    { group: 'Module 1 — Administrative (IND)', items: [
      { id: 't-ind-1571', num: '1.1', label: 'FDA Form 1571 (IND cover sheet)' },
      { id: 't-ind-cover', num: '1.2', label: 'Cover letter' },
      { id: 't-ind-intro', num: '1.4', label: 'Introductory statement & general investigational plan' },
      { id: 't-ind-ib', num: '1.5', label: 'Investigator brochure (IB)' },
      { id: 't-ind-prot', num: '1.6', label: 'Clinical protocol(s)' },
      { id: 't-ind-icf', num: '1.7', label: 'Informed consent form (ICF)' },
      { id: 't-ind-1572', num: '1.8', label: 'FDA Form 1572 (investigator statement)' },
      { id: 't-ind-3674', num: '1.9', label: 'FDA Form 3674 (ClinicalTrials.gov)' },
      { id: 't-ind-amend', num: '1.10', label: 'IND amendment' },
      { id: 't-ind-annual', num: '1.11', label: 'IND annual report' },
      { id: 't-ind-safety', num: '1.12', label: 'IND safety report (7/15-day)' },
    ] },
    { group: 'CMC / Nonclinical / Clinical (IND)', items: [
      { id: 't-ind-cmc', num: '2–3', label: 'CMC information (Module 3 subset)' },
      { id: 't-ind-pharm', num: '4', label: 'Pharmacology & toxicology (Module 4 subset)' },
      { id: 't-ind-clinprev', num: '5', label: 'Previous human experience & protocol' },
    ] },
  ],

  /* BLA */
  bla: [
    { group: 'Module 1 — BLA Administrative', items: [
      { id: 't-bla-356h', num: '1.1', label: 'FDA Form 356h (BLA application)' },
      { id: 't-bla-cover', num: '1.2', label: 'Cover letter' },
      { id: 't-bla-label', num: '1.14', label: 'Draft labeling / package insert (USPI)' },
      { id: 't-bla-rems', num: '1.14.5', label: 'REMS (if applicable)' },
      { id: 't-bla-ea', num: '1.12', label: 'Environmental assessment' },
    ] },
    { group: 'Module 2 — BLA Summaries', items: [
      { id: 't-bla-qos', num: '2.3', label: 'Quality overall summary (biologics)' },
      { id: 't-bla-co', num: '2.5', label: 'Clinical overview' },
      { id: 't-bla-274', num: '2.7.4', label: 'Summary of clinical safety (biologics)' },
    ] },
    { group: 'Module 3 — Quality (Biologics CMC)', items: [
      { id: 't-bla-3s2', num: '3.2.S.2', label: 'DS manufacture (cell line, upstream, downstream)' },
      { id: 't-bla-3s3', num: '3.2.S.3', label: 'Characterisation (structure, glycosylation, variants)' },
      { id: 't-bla-3s4', num: '3.2.S.4', label: 'Control of drug substance' },
      { id: 't-bla-3p3', num: '3.2.P.3', label: 'DP manufacture (formulation, fill-finish)' },
      { id: 't-bla-comp', num: '3.2.R', label: 'Comparability protocol (process changes)' },
      { id: 't-bla-adv', num: '3.2.A.2', label: 'Adventitious agents safety (viral clearance)' },
    ] },
    { group: 'Module 5 — Clinical (BLA)', items: [
      { id: 't-bla-csr', num: '5.3.5', label: 'Pivotal clinical study report(s)' },
      { id: 't-bla-immuno', num: '5.3.5.4', label: 'Immunogenicity assessment' },
    ] },
  ],

  /* De Novo */
  denovo: [
    { group: 'Administrative', items: [
      { id: 't-dn-form', num: 'A.2', label: 'De Novo request form (FDA 3514)' },
      { id: 't-dn-cover', num: 'A.1', label: 'Cover letter' },
      { id: 't-dn-fee', num: 'A.3', label: 'User fee cover sheet (FDA 3601)' },
    ] },
    { group: 'Classification & Regulatory', items: [
      { id: 't-dn-class', num: 'B.1', label: 'Proposed classification & product code' },
      { id: 't-dn-risk', num: 'B.3', label: 'Risk-based classification rationale' },
      { id: 't-dn-special', num: 'B.4', label: 'Special controls recommendation' },
    ] },
    { group: 'Device & Performance', items: [
      { id: 't-dn-desc', num: 'C.1', label: 'Device description' },
      { id: 't-dn-ifu', num: 'C.2', label: 'Indications for use' },
      { id: 't-dn-bench', num: 'D.1', label: 'Non-clinical performance testing' },
      { id: 't-dn-bio', num: 'D.2', label: 'Biocompatibility (ISO 10993)' },
      { id: 't-dn-sw', num: 'D.3', label: 'Software documentation' },
      { id: 't-dn-cyber', num: 'D.4', label: 'Cybersecurity documentation' },
      { id: 't-dn-clin', num: 'D.7', label: 'Clinical evidence' },
      { id: 't-dn-hf', num: 'D.8', label: 'Human factors / usability' },
    ] },
  ],

  /* IVDR */
  ivdr: [
    { group: 'Annex II — Technical Documentation', items: [
      { id: 't-ivdr-desc', num: '1', label: 'Device description & specification' },
      { id: 't-ivdr-info', num: '2', label: 'Information supplied by manufacturer (label/IFU)' },
      { id: 't-ivdr-design', num: '3', label: 'Design & manufacturing information' },
      { id: 't-ivdr-gspr', num: '4', label: 'GSPR checklist (Annex I IVDR)' },
      { id: 't-ivdr-ba', num: '5', label: 'Benefit-risk analysis & risk management' },
      { id: 't-ivdr-vv', num: '6', label: 'Product verification & validation' },
    ] },
    { group: 'Annex III — Performance Evaluation', items: [
      { id: 't-ivdr-pep', num: '7', label: 'Performance evaluation plan' },
      { id: 't-ivdr-sci', num: '8', label: 'Scientific validity' },
      { id: 't-ivdr-anal', num: '9', label: 'Analytical performance' },
      { id: 't-ivdr-clin', num: '10', label: 'Clinical performance & clinical evidence' },
      { id: 't-ivdr-per', num: '11', label: 'Performance evaluation report' },
    ] },
    { group: 'Post-Market', items: [
      { id: 't-ivdr-pms', num: '12', label: 'Post-market surveillance plan' },
      { id: 't-ivdr-pmpf', num: '13', label: 'PMPF plan' },
      { id: 't-ivdr-sscp', num: '14', label: 'Summary of safety & clinical performance (SSCP)' },
    ] },
  ],

  /* DMF */
  dmf: [
    { group: 'Administrative', items: [
      { id: 't-dmf-cover', num: 'A.1', label: 'Transmittal letter' },
      { id: 't-dmf-loa', num: 'A.2', label: 'Letter of authorization (LOA)' },
      { id: 't-dmf-holder', num: 'A.4', label: 'DMF holder & agent information' },
    ] },
    { group: 'Drug Substance (3.2.S)', items: [
      { id: 't-dmf-3s1', num: '3.2.S.1', label: 'General information (nomenclature, structure)' },
      { id: 't-dmf-3s2', num: '3.2.S.2', label: 'Manufacture (synthesis, process controls)' },
      { id: 't-dmf-3s3', num: '3.2.S.3', label: 'Characterisation (structure, impurities)' },
      { id: 't-dmf-3s4', num: '3.2.S.4', label: 'Control of drug substance (specs, methods)' },
      { id: 't-dmf-3s7', num: '3.2.S.7', label: 'Stability (ICH Q1A/Q1B/Q1E)' },
    ] },
    { group: 'Facilities', items: [
      { id: 't-dmf-fac', num: 'F.1', label: 'Manufacturing facility information' },
      { id: 't-dmf-gmp', num: 'F.2', label: 'GMP compliance / inspection history' },
    ] },
  ],

  /* ANDA */
  anda: [
    { group: 'Module 1 — Administrative (ANDA)', items: [
      { id: 't-anda-356h', num: '1.1', label: 'FDA Form 356h' },
      { id: 't-anda-piv', num: '1.3', label: 'Paragraph IV certification' },
      { id: 't-anda-label', num: '1.14', label: 'Draft labeling / USPI' },
      { id: 't-anda-bio', num: '1.15', label: 'Bioequivalence statement' },
    ] },
    { group: 'Quality & BE', items: [
      { id: 't-anda-qos', num: '2.3', label: 'Quality overall summary' },
      { id: 't-anda-p2', num: '3.2.P.2', label: 'Pharmaceutical development' },
      { id: 't-anda-diss', num: '3.2.P.5', label: 'Dissolution method & data' },
      { id: 't-anda-stab', num: '3.2.P.8', label: 'Stability data' },
      { id: 't-anda-be', num: '5.3.1', label: 'Bioequivalence study report' },
      { id: 't-anda-compdiss', num: '5.3.2', label: 'Comparative dissolution data' },
    ] },
  ],

  /* MAA (EU/EMA) */
  maa: [
    { group: 'Module 1 — EU Administrative', items: [
      { id: 't-maa-form', num: '1.0', label: 'EMA application form' },
      { id: 't-maa-smpc', num: '1.3.1', label: 'Summary of product characteristics (SmPC)' },
      { id: 't-maa-pil', num: '1.3.2', label: 'Package leaflet (PIL)' },
      { id: 't-maa-label', num: '1.3.3', label: 'Labelling (outer/inner packaging)' },
      { id: 't-maa-expert', num: '1.4', label: 'Expert declarations' },
      { id: 't-maa-orphan', num: '1.5', label: 'Orphan designation documentation' },
      { id: 't-maa-env', num: '1.6', label: 'Environmental risk assessment (ERA)' },
      { id: 't-maa-pip', num: '1.7', label: 'Paediatric investigation plan (PIP) compliance' },
      { id: 't-maa-condit', num: '1.8', label: 'Conditional MA / exceptional circumstances' },
      { id: 't-maa-rmp', num: '1.8.2', label: 'Risk management plan (RMP)' },
    ] },
    { group: 'Modules 2–5 (EU-specific)', items: [
      { id: 't-maa-qos', num: '2.3', label: 'Quality overall summary (EU-specific aspects)' },
      { id: 't-maa-co', num: '2.5', label: 'Clinical overview (EU patient population)' },
      { id: 't-maa-3r', num: '3.2.R', label: 'Regional information (TSE, GMP, QP declarations)' },
      { id: 't-maa-3a2', num: '3.2.A.2', label: 'Adventitious agents (TSE/BSE compliance)' },
    ] },
  ],

  /* IDE */
  ide: [
    { group: 'Administrative', items: [
      { id: 't-ide-cover', num: 'A.1', label: 'Cover letter' },
      { id: 't-ide-form', num: 'A.3', label: 'IDE application form' },
      { id: 't-ide-agree', num: 'A.4', label: 'Investigator agreements' },
    ] },
    { group: 'Device & Clinical Plan', items: [
      { id: 't-ide-desc', num: 'B.1', label: 'Device description' },
      { id: 't-ide-risk', num: 'B.2', label: 'Risk analysis (ISO 14971)' },
      { id: 't-ide-plan', num: 'C.1', label: 'Investigational plan (clinical protocol)' },
      { id: 't-ide-sap', num: 'C.2', label: 'Statistical analysis plan' },
      { id: 't-ide-icf', num: 'C.3', label: 'Informed consent form' },
      { id: 't-ide-monitor', num: 'C.5', label: 'Monitoring plan' },
    ] },
    { group: 'Manufacturing & Testing', items: [
      { id: 't-ide-mfg', num: 'D.1', label: 'Manufacturing information' },
      { id: 't-ide-bench', num: 'D.2', label: 'Non-clinical bench testing' },
      { id: 't-ide-bio', num: 'D.3', label: 'Biocompatibility' },
      { id: 't-ide-sw', num: 'D.5', label: 'Software documentation' },
    ] },
  ],

  /* 505(b)(2) */
  '505b2': [
    { group: 'Administrative', items: [
      { id: 't-505-356h', num: '1.1', label: 'FDA Form 356h' },
      { id: 't-505-stmt', num: '1.3', label: '505(b)(2) statement / right of reference' },
      { id: 't-505-patent', num: '1.4', label: 'Patent certification (Paragraph III/IV)' },
      { id: 't-505-label', num: '1.14', label: 'Draft labeling' },
    ] },
    { group: 'Bridging', items: [
      { id: 't-505-nco', num: '2.4', label: 'Nonclinical overview (bridging rationale)' },
      { id: 't-505-co', num: '2.5', label: 'Clinical overview (bridging rationale)' },
      { id: 't-505-dev', num: '3.2.P.2', label: 'Pharmaceutical development (bridging dissolution)' },
      { id: 't-505-bridge', num: '5.1', label: 'Bridging study report (BA/BE or clinical endpoint)' },
      { id: 't-505-pk', num: '5.3.1', label: 'Relative BA / comparative PK studies' },
      { id: 't-505-lit', num: '5.4', label: 'Literature references (relied-upon RLD data)' },
    ] },
  ],

  /* Biosimilar 351(k) */
  biosimilar: [
    { group: 'Administrative', items: [
      { id: 't-bs-356h', num: '1.1', label: 'FDA Form 356h' },
      { id: 't-bs-label', num: '1.14', label: 'Draft labeling (reference to RP)' },
    ] },
    { group: 'Analytical Similarity', items: [
      { id: 't-bs-qos', num: '2.3', label: 'QOS — analytical similarity' },
      { id: 't-bs-totality', num: '2.5', label: 'Clinical overview — totality of evidence' },
      { id: 't-bs-finger', num: '3.S.F', label: 'Analytical fingerprinting' },
      { id: 't-bs-struct', num: '3.2.S.3', label: 'Structural / functional characterisation' },
    ] },
    { group: 'Clinical', items: [
      { id: 't-bs-pkpd', num: '5.1', label: 'Comparative clinical PK/PD study' },
      { id: 't-bs-eff', num: '5.2', label: 'Comparative clinical efficacy trial' },
      { id: 't-bs-immuno', num: '5.3', label: 'Immunogenicity assessment (comparative)' },
      { id: 't-bs-switch', num: '5.4', label: 'Switching / interchangeability study' },
    ] },
  ],
};
