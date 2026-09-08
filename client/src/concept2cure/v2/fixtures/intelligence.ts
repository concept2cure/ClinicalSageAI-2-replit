/**
 * Deterministic-intelligence reference data — ported verbatim from the kit's
 * intelligence-data.jsx (design_handoff_c2c_v2_ui_replacement).
 *
 * This is REFERENCE data, not a live-data fixture: the pedigree taxonomy
 * mirrors server/services/ana/tool-pedigree.ts and the catalog enumerates the
 * 142 deterministic_registry tools (24 domains, 4 waves). The worked DEMOS
 * and the CDISC validation example are the DetResultCard /
 * ValidationSummaryPanel binding shapes — sample records surfaces must show
 * only behind the SampleTag pill.
 *
 * GENERATED from the kit data file (scripts in the design package) — edit the
 * kit first, then re-port.
 */

export interface DetFinding { sev: string; text: string }
export interface DetResult {
  tool: string;
  domain: string;
  pedigree: string;
  verdict?: { value: string; label: string; tone: string };
  findings?: DetFinding[];
  rationale?: string[];
  recommendations?: string[];
  citations?: string[];
  warnings?: string[];
}
export interface ValidationSummary {
  title: string;
  standard: string;
  valid: boolean;
  pedigree?: string;
  groups: { label: string; rows: { sev: string; rule: string; domain?: string; msg: string }[] }[];
}

export const INTEL_PEDIGREE = {
  deterministic_registry: {
    label: 'Registry',
    icon: 'shieldCheck',
    deterministic: true,
    trust: 'high',
    guide: 'Pure rule/registry lookup — no LLM, no network. Reproducible and bulletproof; may be cited directly as a deterministic fact (confirm against the governing citation it returns).',
  },
  deterministic_query: {
    label: 'Query',
    icon: 'database',
    deterministic: true,
    trust: 'high',
    guide: 'Pure query over governed internal data — no LLM. Reproducible for the same data snapshot; may be relied on directly (note the data version when records can change).',
  },
  rim_learned: {
    label: 'RIM pattern',
    icon: 'network',
    deterministic: false,
    trust: 'medium',
    guide: 'RIM learned pattern — accumulated from deterministic outputs over time, tenant-scoped, occurrence-weighted. Cite pattern confidence and occurrence count; flag low-occurrence for verification.',
  },
  external_api_live: {
    label: 'Live authority',
    icon: 'globe',
    deterministic: false,
    trust: 'medium',
    guide: 'Live external authority API — authoritative but time-varying. Cite the source and verify currency (results can change between calls).',
  },
  model_assisted: {
    label: 'Model-assisted',
    icon: 'sparkles',
    deterministic: false,
    trust: 'requires_verification',
    guide: 'Model-generated — verify against a cited primary source before relying.',
  },
};

export const INTEL_TRUST_LABEL = { high: 'High trust', medium: 'Medium trust', requires_verification: 'Verify before relying' };

export const INTEL_CATALOG = [
  {
    wave: 'Wave 1',
    sub: 'Core development science — 6 domains, 34 tools',
    domains: [
      {
        name: 'Bioequivalence & generic drugs',
        icon: 'beaker',
        tools: [
          'classify_bcs',
          'design_be_study',
          'assess_dissolution_similarity',
          'assess_biowaiver',
          'guidance_for_anda',
        ],
      },
      {
        name: 'Pharmacometrics',
        icon: 'sigma',
        tools: [
          'design_popk_study',
          'evaluate_pbpk_model',
          'analyze_exposure_response',
          'advise_midd',
          'select_dose',
        ],
      },
      {
        name: 'Preclinical toxicology',
        icon: 'microscope',
        tools: [
          'select_tox_species',
          'design_repeat_dose_study',
          'calculate_safety_margin',
          'design_genotox_battery',
          'assess_carcinogenicity_need',
          'design_repro_tox_study',
        ],
      },
      {
        name: 'Pediatric development',
        icon: 'stethoscope',
        tools: [
          'classify_pediatric_age',
          'design_pediatric_investigation',
          'assess_pediatric_extrapolation',
          'select_pediatric_formulation',
          'select_pediatric_dose',
          'assess_pediatric_requirements',
        ],
      },
      {
        name: 'Advanced therapy (ATMP/CGT)',
        icon: 'atom',
        tools: [
          'classify_atmp',
          'assess_gene_therapy_requirements',
          'assess_cell_therapy_manufacturing',
          'assess_cart_requirements',
          'select_atmp_pathway',
          'assess_atmp_comparability',
        ],
      },
      {
        name: 'Real-world evidence',
        icon: 'barChart',
        tools: [
          'design_target_trial',
          'score_rwe_data_source',
          'design_propensity_analysis',
          'select_rwe_design',
          'assess_rwe_bias_risk',
          'assess_rwe_regulatory_acceptability',
        ],
      },
    ],
  },
  {
    wave: 'Wave 2',
    sub: 'Regulatory & quality — 6 domains, 36 tools',
    domains: [
      {
        name: 'Clinical pharmacology',
        icon: 'beaker',
        tools: [
          'classify_ddi_risk',
          'assess_qtc_risk',
          'design_organ_impairment_study',
          'classify_cyp_phenotype',
          'design_bioanalytical_method',
          'assess_food_effect',
        ],
      },
      {
        name: 'CMC quality',
        icon: 'fileCheck',
        tools: [
          'design_stability_study',
          'validate_analytical_method',
          'classify_impurity',
          'set_specifications',
          'assess_process_validation',
          'assess_comparability_protocol',
        ],
      },
      {
        name: 'Regulatory strategy',
        icon: 'scale',
        tools: [
          'assess_expedited_program',
          'plan_fda_meeting',
          'assess_orphan_designation',
          'select_505_pathway',
          'assess_rolling_submission',
          'compare_global_pathways',
        ],
      },
      {
        name: 'Biosimilar development',
        icon: 'atom',
        tools: [
          'assess_analytical_similarity_biosimilar',
          'design_biosimilar_clinical',
          'assess_indication_extrapolation',
          'assess_interchangeability',
          'plan_biosimilar_ip_strategy',
          'assess_biosimilar_cmc',
        ],
      },
      {
        name: 'Mutagenic impurity (ICH M7)',
        icon: 'shieldAlert',
        tools: [
          'classify_mutagenic_impurity',
          'calculate_ttc',
          'assess_structural_alerts',
          'design_purge_study',
          'assess_nitrosamine_risk',
          'control_mutagenic_impurity',
        ],
      },
      {
        name: 'Labeling',
        icon: 'tag',
        tools: [
          'assess_plr_structure',
          'assess_boxed_warning',
          'design_rems',
          'assess_pregnancy_lactation_labeling',
          'structure_smpc',
          'assess_otc_labeling',
        ],
      },
    ],
  },
  {
    wave: 'Wave 3',
    sub: 'Clinical & safety — 6 domains, 36 tools',
    domains: [
      {
        name: 'Immunogenicity',
        icon: 'shieldAlert',
        tools: [
          'assess_immunogenicity_risk',
          'design_ada_assay_strategy',
          'classify_immunogenicity_clinical_impact',
          'design_nab_assay',
          'plan_immunogenicity_sampling',
          'assess_immunogenicity_comparability',
        ],
      },
      {
        name: 'Safety pharmacology',
        icon: 'shieldAlert',
        tools: [
          'design_core_battery',
          'assess_cardiovascular_safety_pharmacology',
          'assess_cns_safety_pharmacology',
          'assess_respiratory_safety_pharmacology',
          'design_followup_safety_study',
          'assess_abuse_liability',
        ],
      },
      {
        name: 'Pharmacovigilance & signal detection',
        icon: 'bell',
        tools: [
          'classify_expedited_reporting',
          'assess_pv_causality',
          'plan_aggregate_safety_report',
          'detect_safety_signal',
          'assess_signal_priority',
          'design_pv_system',
        ],
      },
      {
        name: 'Clinical outcome assessment (COA/PRO)',
        icon: 'clipboardList',
        tools: [
          'select_coa_type',
          'assess_coa_validation',
          'determine_meaningful_change',
          'assess_coa_fit_for_purpose',
          'position_coa_endpoint',
          'plan_coa_development',
        ],
      },
      {
        name: 'Oncology dose optimization (Project Optimus)',
        icon: 'sigma',
        tools: [
          'select_dose_finding_design',
          'assess_project_optimus_alignment',
          'design_randomized_dose_comparison',
          'select_rp2d',
          'design_backfill_strategy',
          'assess_dose_exposure_response',
        ],
      },
      {
        name: 'Combination products',
        icon: 'gitBranch',
        tools: [
          'determine_primary_mode_of_action',
          'classify_combination_product',
          'plan_combination_cgmp',
          'design_human_factors_study',
          'assess_device_constituent_controls',
          'select_combination_submission_pathway',
        ],
      },
    ],
  },
  {
    wave: 'Wave 4',
    sub: 'Trials, GMP & specialized — 6 domains, 36 tools',
    domains: [
      {
        name: 'Trial statistics & estimands',
        icon: 'sigma',
        tools: [
          'define_estimand',
          'assess_intercurrent_event_strategy',
          'plan_multiplicity_control',
          'design_adaptive_design',
          'select_missing_data_strategy',
          'estimate_sample_size',
        ],
      },
      {
        name: 'GMP quality systems & data integrity',
        icon: 'fileCheck',
        tools: [
          'assess_data_integrity',
          'design_capa',
          'classify_gmp_deviation',
          'assess_api_gmp',
          'design_sterile_controls',
          'assess_computer_system_validation',
        ],
      },
      {
        name: 'Nonclinical PK/ADME & toxicokinetics',
        icon: 'beaker',
        tools: [
          'design_adme_program',
          'design_mass_balance_study',
          'assess_metabolite_safety',
          'design_toxicokinetics',
          'design_reaction_phenotyping',
          'assess_protein_binding',
        ],
      },
      {
        name: 'Biomarkers & companion diagnostics',
        icon: 'microscope',
        tools: [
          'classify_biomarker',
          'plan_biomarker_qualification',
          'design_cdx_codevelopment',
          'assess_biomarker_analytical_validation',
          'assess_biomarker_clinical_validation',
          'plan_enrichment_strategy',
        ],
      },
      {
        name: 'Rare disease & external control arms',
        icon: 'globe',
        tools: [
          'design_natural_history_study',
          'design_external_control',
          'assess_small_population_design',
          'plan_bayesian_borrowing',
          'assess_rare_disease_endpoint',
          'plan_rare_disease_program',
        ],
      },
      {
        name: 'GCP & clinical trial operations',
        icon: 'checkSquare',
        tools: [
          'design_monitoring_plan',
          'assess_inspection_readiness',
          'assess_gcp_compliance',
          'design_informed_consent',
          'classify_protocol_deviation',
          'plan_essential_documents',
        ],
      },
    ],
  },
];

export const INTEL_DEMOS_RAW = {
  ttc: {
    tool: 'calculate_ttc',
    domain: 'Mutagenic impurity · ICH M7(R2)',
    pedigree: 'deterministic_registry',
    verdict: { value: '1.5 µg/day', label: 'Acceptable intake — TTC (single impurity, chronic use)', tone: 'ok' },
    findings: [
      {
        sev: 'ok',
        text: 'Impurity is Class 3 (alerting structure, no mutagenicity data). The default TTC applies — no compound-specific limit derived.',
      },
      { sev: 'ok', text: 'At the intended 200 mg/day max daily dose, the concentration limit is 7.5 ppm.' },
      {
        sev: 'warning',
        text: 'Less-than-lifetime (LTL) exposure was not claimed; if the treatment duration is ≤10 years a higher staged limit (20 µg/day) may be justified.',
      },
    ],
    rationale: [
      'A structural alert with no adequate mutagenicity data defaults to the Class 3 TTC of 1.5 µg/day for a single impurity at chronic (>10 year) exposure.',
      'Concentration limit = TTC ÷ max daily dose = 1.5 µg/day ÷ 0.2 g/day = 7.5 µg/g (ppm).',
    ],
    recommendations: [
      'Confirm treatment duration; if ≤10 years, re-derive using the LTL staged limit and document the justification.',
      'If the impurity can be de-risked to Class 5 by (Q)SAR + expert review, remove it from the mutagenic control strategy.',
    ],
    citations: ['ICH M7(R2) §7.3', 'ICH M7(R2) Note 3', '21 CFR 211.84'],
    warnings: [
      'Single-impurity TTC. If multiple Class 2/3 impurities are present, apply the total daily intake limit of 5 µg/day.',
    ],
  },
  estimand: {
    tool: 'define_estimand',
    domain: 'Trial statistics & estimands · ICH E9(R1)',
    pedigree: 'deterministic_registry',
    verdict: {
      value: 'Treatment-policy',
      label: 'Recommended estimand strategy for the primary ORR endpoint',
      tone: 'ok',
    },
    findings: [
      {
        sev: 'ok',
        text: 'Population — all randomized patients with RTK-X-overexpressing advanced solid tumors (ITT).',
      },
      {
        sev: 'ok',
        text: 'Variable — confirmed objective response (RECIST 1.1) by blinded independent central review.',
      },
      {
        sev: 'ok',
        text: 'Population-level summary — difference in ORR (%) between arms with a two-sided 95% CI.',
      },
      {
        sev: 'warning',
        text: 'Intercurrent event — treatment discontinuation for toxicity is handled by the treatment-policy strategy; a composite strategy was not selected.',
      },
    ],
    rationale: [
      'The five estimand attributes (treatment, population, variable, intercurrent-event strategy, population-level summary) are specified per ICH E9(R1) before the SAP is locked.',
      'For an accelerated-approval ORR endpoint, treatment-policy aligns the estimand with the regulatory question of overall clinical benefit regardless of adherence.',
    ],
    recommendations: [
      'Pre-specify sensitivity analyses under a hypothetical strategy for the discontinuation-for-toxicity intercurrent event.',
      'Carry the estimand definition verbatim into SAP §3.1 and the protocol synopsis.',
    ],
    citations: ['ICH E9(R1) §A.3', 'ICH E9(R1) §A.4', 'FDA Guidance: Multiple Endpoints (2022)'],
    warnings: [],
  },
  naranjo: {
    tool: 'assess_pv_causality',
    domain: 'Pharmacovigilance & signal detection',
    pedigree: 'deterministic_registry',
    verdict: { value: 'Score 6 — Probable', label: 'Naranjo causality for the grade-3 ILD event', tone: 'warn' },
    findings: [
      {
        sev: 'warning',
        text: 'Adverse event appeared after the suspected drug was given (+2) and improved on dechallenge (+1).',
      },
      {
        sev: 'warning',
        text: 'No alternative cause fully explains the reaction (+2); event is consistent with the known class ILD signal (+1).',
      },
      {
        sev: 'ok',
        text: 'No rechallenge was performed (0) and no objective confirmatory test was applied (0).',
      },
    ],
    rationale: [
      'The Naranjo Adverse Drug Reaction Probability Scale sums 10 weighted items; a total of 5–8 classifies the association as Probable.',
      'The computed total of 6 places this event in the Probable band, supporting expedited 15-day reporting.',
    ],
    recommendations: [
      'Classify as expedited (15-day) — serious, unexpected, and reasonable possibility of causal relationship.',
      'Route the event to the aggregate safety report and open a signal for the class ILD finding.',
    ],
    citations: ['Naranjo et al. 1981', '21 CFR 312.32(c)', 'ICH E2A §III.A'],
    warnings: [
      'Score is deterministic given the item answers; changing the rechallenge or confirmatory-test items shifts the band.',
    ],
  },
};

export const INTEL_VALIDATION_RAW = {
  cdisc: {
    title: 'CDISC conformance — BX204-301 package',
    standard: 'SDTM-IG 3.4 · Pinnacle21',
    valid: false,
    pedigree: 'deterministic_query',
    groups: [
      {
        label: 'Reject',
        rows: [
          {
            sev: 'reject',
            rule: 'SD0063',
            domain: 'LB',
            msg: 'Non-standard unit — LBORRESU value "mmol/l" is not in the CDISC controlled terminology codelist for UNIT.',
          },
        ],
      },
      {
        label: 'Error',
        rows: [
          {
            sev: 'error',
            rule: 'SD1084',
            domain: 'AE',
            msg: 'Duplicate records — 3 AE rows share the same USUBJID, AEDECOD and AESTDTC.',
          },
          {
            sev: 'error',
            rule: 'CT2002',
            domain: 'EX',
            msg: 'EXDOSU value "milligram" is not the submission value "mg".',
          },
        ],
      },
      {
        label: 'Warning',
        rows: [
          {
            sev: 'warning',
            rule: 'SD0045',
            domain: 'DM',
            msg: 'RFXSTDTC is present but RFXENDTC is missing for 2 subjects still on treatment.',
          },
          {
            sev: 'warning',
            rule: 'SD1201',
            domain: 'VS',
            msg: 'VSSTRESN populated without VSSTRESU for 11 records.',
          },
        ],
      },
      {
        label: 'Notice',
        rows: [
          {
            sev: 'notice',
            rule: 'SD0002',
            domain: 'TS',
            msg: 'Trial summary parameter ADDON is not provided (optional for this study type).',
          },
        ],
      },
    ],
  },
};
export const INTEL_DEMOS: Record<string, DetResult> = INTEL_DEMOS_RAW;
/** tool name → domain/wave index across the whole catalog. */
export const INTEL_TOOL_INDEX: Record<string, { domain: string; wave: string }> = (() => {
  const idx: Record<string, { domain: string; wave: string }> = {};
  INTEL_CATALOG.forEach((w) =>
    w.domains.forEach((d) => d.tools.forEach((t) => { idx[t] = { domain: d.name, wave: w.wave }; }))
  );
  return idx;
})();

const INTEL_DEMO_OF: Record<string, string> = {
  calculate_ttc: 'ttc',
  define_estimand: 'estimand',
  assess_pv_causality: 'naranjo',
};


