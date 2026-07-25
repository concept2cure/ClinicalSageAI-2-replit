/**
 * BLA 351(a) biologics + CTD nonclinical/clinical tool definitions.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 2). These are pure `AnaTool` definition objects — deterministic
 * biologics engines (analytical similarity, comparability, immunogenicity),
 * nonclinical/clinical CTD drafting, and the governed platform-command bridge.
 * Their handlers live in AnaToolExecutor.ts. Imported back into
 * AnaToolDefinitions.ts so `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// BLA 351(a) biologics tools — deterministic engines (analytical similarity,
// comparability, immunogenicity). These compute on measured lot/subject data;
// report their numbers and verdicts verbatim, never estimate by hand.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ANALYTICAL_SIMILARITY: AnaTool = {
  name: 'assess_analytical_similarity',
  description:
    "Run the DETERMINISTIC analytical-similarity engine for a BLA 351(a)/biosimilar 351(k) program. Compares a proposed biologic to a reference product across critical quality attributes using the FDA tiered framework: Tier 1 equivalence test (EAC = ±1.5·σ_R, 90% CI), Tier 2 quality range (mean_R ± k·σ_R, % of test lots within), Tier 3 min–max. Use when the user asks to run a Tier 1 similarity check, compare to a reference product, or assess analytical similarity. Returns per-attribute verdicts with the underlying statistics and an overall conclusion. Report the verdicts and numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      referenceProduct: { type: 'string', description: 'Reference product name (e.g. the originator/RP).' },
      modality: { type: 'string', description: 'Product modality, e.g. monoclonal_antibody, fusion_protein, adc.' },
      targetAgency: { type: 'string', description: 'Target agency (FDA, EMA, PMDA).' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist the assessment against.' },
      attributes: {
        type: 'array',
        description: 'Critical quality attributes with reference and test lot measurements.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'CQA name, e.g. "Potency (relative %)".' },
            tier: { type: 'number', enum: [1, 2, 3], description: '1=most critical/MoA-related, 2=moderate, 3=least critical.' },
            criticality: { type: 'string', description: 'Free-text criticality note.' },
            unit: { type: 'string' },
            reference: { type: 'array', items: { type: 'number' }, description: 'Reference-product lot measurements.' },
            test: { type: 'array', items: { type: 'number' }, description: 'Proposed/test-product lot measurements.' },
            eacSigmaMultiplier: { type: 'number', description: 'Tier 1 σ_R multiplier for the EAC (default 1.5).' },
            qualityRangeK: { type: 'number', description: 'Tier 2 SD multiplier (default 3).' },
            withinThreshold: { type: 'number', description: 'Tier 2/3 fraction of test lots required within range (default 0.9).' },
            mechanismRelated: { type: 'boolean' },
          },
          required: ['name', 'tier', 'reference', 'test'],
        },
      },
    },
    required: ['attributes'],
  },
};

export const ASSESS_COMPARABILITY: AnaTool = {
  name: 'assess_comparability',
  description:
    "Run the DETERMINISTIC ICH Q5E comparability engine: assess whether a biologic produced after a manufacturing change (process/site/scale/formulation) is comparable to the pre-change material. Per attribute it tests post-change lots against the pre-change quality range, the standardized mean shift, and (for high-criticality attributes) equivalence; then derives the overall conclusion and whether analytical data alone is sufficient or non-clinical/clinical bridging is indicated. Use for manufacturing change comparability questions. Report the verdicts, the bridging recommendation, and numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      changeDescription: { type: 'string', description: 'What changed (e.g. "new DS manufacturing site").' },
      changeType: { type: 'string', description: 'process | site | scale | formulation | cell_bank.' },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      attributes: {
        type: 'array',
        description: 'Quality attributes with pre- and post-change lot measurements.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            criticality: { type: 'string', enum: ['high', 'moderate', 'low'] },
            unit: { type: 'string' },
            preChange: { type: 'array', items: { type: 'number' } },
            postChange: { type: 'array', items: { type: 'number' } },
            qualityRangeK: { type: 'number', description: 'SD multiplier (default 3).' },
            withinThreshold: { type: 'number', description: 'Fraction of post-change lots required within range (default 0.9).' },
            eacSigmaMultiplier: { type: 'number', description: 'σ_pre multiplier for high-criticality equivalence (default 1.5).' },
          },
          required: ['name', 'criticality', 'preChange', 'postChange'],
        },
      },
    },
    required: ['attributes'],
  },
};

export const ASSESS_IMMUNOGENICITY: AnaTool = {
  name: 'assess_immunogenicity',
  description:
    "Run the DETERMINISTIC immunogenicity engine: compute ADA and neutralizing-antibody (NAb) incidence with 95% Wilson CIs per arm, the comparative between-arm difference (Newcombe), and an overall immunogenicity risk classification (low/moderate/high) using the FDA risk-based framework (likelihood × clinical consequence). Use for immunogenicity incidence, comparative immunogenicity, and risk-assessment questions. Report the incidences, comparison, and risk tier verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      riskFactors: {
        type: 'object',
        description: 'Product/patient factors that modulate immunogenicity risk.',
        properties: {
          chronicDosing: { type: 'boolean' },
          immunomodulator: { type: 'boolean' },
          foreignSequence: { type: 'boolean' },
          aggregationProne: { type: 'boolean' },
          neutralizesEndogenous: { type: 'boolean', description: 'Product neutralizes a non-redundant endogenous protein (severe consequence).' },
        },
      },
      arms: {
        type: 'array',
        description: 'Study arms with tiered-assay subject counts.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            role: { type: 'string', enum: ['test', 'reference', 'comparator'] },
            nSubjects: { type: 'number', description: 'Evaluable subjects.' },
            adaPositive: { type: 'number', description: 'Confirmed ADA-positive subjects.' },
            treatmentEmergentAda: { type: 'number', description: 'Treatment-emergent (induced + boosted) ADA+ — preferred numerator.' },
            nabPositive: { type: 'number', description: 'Neutralizing-antibody-positive subjects.' },
            persistentAda: { type: 'number' },
            titers: { type: 'array', items: { type: 'number' }, description: 'ADA reciprocal titers among positives.' },
            impactedPk: { type: 'number', description: 'ADA+ subjects with a relevant PK impact.' },
            impactedEfficacy: { type: 'number', description: 'ADA+ subjects with loss of efficacy.' },
            hypersensitivity: { type: 'number', description: 'Serious hypersensitivity/anaphylaxis events associated with ADA.' },
          },
          required: ['label', 'nSubjects'],
        },
      },
    },
    required: ['arms'],
  },
};

export const ASSESS_BLA_FILING_RISK: AnaTool = {
  name: 'assess_bla_filing_risk',
  description:
    "Run the DETERMINISTIC BLA 351(a) filing-risk engine. Maps a biologics program's CMC/clinical readiness signals — and the conclusions of the analytical-similarity, comparability, and immunogenicity engines — onto Refuse-to-File (RTF) and Complete Response Letter (CRL) failure modes (21 CFR 601.2; ICH Q5A/Q5E/Q6B/Q1A; FDA immunogenicity & process-validation guidance). Use when the user asks about BLA filing readiness, RTF/CRL risk, or what would block a biologics filing. Returns cited per-finding triggers with mitigations and overall RTF/CRL risk bands. Report the triggers and bands verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
      programId: { type: 'string', description: 'Optional regulatory_programs UUID to persist against.' },
      manufacturingChange: { type: 'boolean', description: 'True if a manufacturing change requiring comparability is in scope.' },
      analyticalSimilarity: {
        type: 'string',
        enum: ['similar', 'similar_with_residual_uncertainty', 'not_demonstrated', 'insufficient_data'],
        description: 'Conclusion from assess_analytical_similarity, if run.',
      },
      comparability: {
        type: 'string',
        enum: ['comparable', 'comparable_with_additional_data', 'not_comparable', 'insufficient_data'],
        description: 'Conclusion from assess_comparability, if run.',
      },
      immunogenicityRisk: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description: 'Risk tier from assess_immunogenicity, if run.',
      },
      readiness: {
        type: 'object',
        description: 'CMC/clinical/quality readiness signals (true=met, false=known missing, omit=unknown).',
        properties: {
          potencyAssayValidated: { type: 'boolean' },
          viralClearanceValidated: { type: 'boolean' },
          adventitiousAgentTesting: { type: 'boolean' },
          cellBankCharacterized: { type: 'boolean' },
          stabilityMonths: { type: 'number' },
          requiredShelfLifeMonths: { type: 'number' },
          processValidationComplete: { type: 'boolean' },
          containerClosureQualified: { type: 'boolean' },
          inspectionReady: { type: 'boolean' },
        },
      },
      administrative: {
        type: 'object',
        description: 'BLA completeness signals for RTF assessment (21 CFR 601.2).',
        properties: {
          form356h: { type: 'boolean' },
          coverLetter: { type: 'boolean' },
          module3CmcComplete: { type: 'boolean' },
          clinicalSummaries: { type: 'boolean' },
          immunogenicityData: { type: 'boolean' },
          cdiscDatasets: { type: 'boolean' },
        },
      },
    },
    required: [],
  },
};

export const GENERATE_SOP: AnaTool = {
  name: 'generate_sop',
  description:
    "Generate a GxP-structured client Standard Operating Procedure (SOP), region-aware across FDA (US), EMA (EU), and PMDA (Japan). Use when the user asks AnA to write/draft an SOP for a process (e.g. change control, CAPA, deviation, document control, eCTD publishing, regulatory submission, pharmacovigilance case processing, training, supplier qualification, internal audit). Returns the SOP as structured sections plus rendered markdown, with the canonical SOP skeleton (Purpose, Scope, Responsibilities, Definitions, Procedure, Records, References, Revision history, Approval) and region-appropriate regulatory references. The draft opens in AnA's editor; the client tailors and approves it.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'SOP title, e.g. "Change Control for Manufacturing Processes".' },
      processType: {
        type: 'string',
        enum: [
          'change_control', 'document_control', 'capa', 'deviation_management',
          'ectd_publishing', 'regulatory_submission', 'pharmacovigilance_case',
          'training', 'supplier_qualification', 'internal_audit', 'generic',
        ],
        description: 'Known regulated process (drives the starter procedure). Use generic for an unlisted topic.',
      },
      regions: {
        type: 'array',
        items: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'] },
        description: 'Regions the SOP must satisfy (default FDA).',
      },
      filingType: { type: 'string', description: 'Optional filing context (NDA/BLA/MAA/JNDA/IND).' },
      organization: { type: 'string' },
      documentId: { type: 'string', description: 'SOP identifier, e.g. SOP-QA-CC-001 (generated if omitted).' },
      effectiveDate: { type: 'string', description: 'ISO date; defaults to today.' },
      ownerRole: { type: 'string', description: 'Role accountable for the SOP (e.g. "Head of Quality").' },
      scopeNote: { type: 'string', description: 'Extra scope sentence from the client.' },
    },
    required: ['title'],
  },
};

export const RESOLVE_SUBMISSION_PLAN: AnaTool = {
  name: 'resolve_submission_plan',
  description:
    "Resolve the multi-region BUILD + SUBMIT plan for a filing across FDA (US), EMA (EU), and PMDA (Japan). Given a filing type (IND/NDA/BLA/MAA/JNDA/…) and/or product class, returns the regional equivalent application per region (e.g. a biologic marketing application → US BLA, EU MAA, JP JNDA), each with its dossier standard, region Module 1 path, validation profile, blueprints, and submission gateway, plus whether region-correct build and gateway submission are supported. Also returns an overall coverage summary asserting which (filing × region) combinations are fully supported. Use when the user asks whether/how a product can be filed in the US, EU, and Japan, or which gateway/structure applies.",
  input_schema: {
    type: 'object',
    properties: {
      filingType: { type: 'string', description: 'Filing string or registry id (IND, NDA, BLA, MAA, JNDA, …).' },
      applicationFamily: {
        type: 'string',
        enum: ['clinical_trial', 'marketing_authorization', 'variation', 'renewal', 'supplement', 'pediatric', 'orphan'],
        description: 'Used when no filingType is given.',
      },
      productClass: {
        type: 'string',
        enum: ['small_molecule', 'biologic', 'biosimilar', 'vaccine', 'atmp', 'generic', 'any'],
        description: 'Drives the regional equivalent (biologic → BLA in the US).',
      },
      regions: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'JP', 'UK', 'CA', 'CN', 'AU', 'CH'] },
        description: 'Target regions (default US, EU, JP).',
      },
    },
    required: [],
  },
};

export const GET_CTD_MODULE_HOME: AnaTool = {
  name: 'get_ctd_module_home',
  description:
    "Return the CTD Module 1 (regional administrative) and Module 2 (CTD summaries) section structure for a region (FDA / EMA / PMDA). Module 1 is region-specific (FDA forms 356h/1571 + labeling; EU application form + SmPC/PL + RMP; JP 様式 + 添付文書 + J-RMP); Module 2 is the ICH-common summary set 2.1–2.7 where each summary declares its source module (2.3 ← M3, 2.4/2.6 ← M4, 2.5/2.7 ← M5). Use when the user asks what goes in Module 1 or Module 2, how the CTD summaries map to the source modules, or to scaffold a dedicated M1/M2 authoring view. Per-program build-state (which sections are drafted/approved) is available from GET /api/biopharma/ctd/build-state.",
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EMA', 'PMDA', 'US', 'EU', 'JP'], description: 'Region (default FDA).' },
      module: { type: 'string', enum: ['1', '2'], description: 'Restrict to a single module; omit for both.' },
    },
    required: [],
  },
};

/** Custom JSON-schema tools dispatched by our local AnaToolExecutor. */
// ─────────────────────────────────────────────────────────────────────────────
// Nonclinical & Clinical Pharmacology Engines (deterministic)
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_FIH_DOSE: AnaTool = {
  name: 'compute_fih_dose',
  description:
    "Compute a defensible first-in-human (FIH) starting dose using the platform's DETERMINISTIC dose engine. Shows BOTH standard derivations: (1) NOAEL → HED (FDA 2005 body-surface Km scaling) → safety factor → MRSD from the most sensitive species, and (2) MABEL from the minimum anticipated effective exposure (EMA FIH guidance), then selects the more conservative and flags which is limiting. ALWAYS call this tool for FIH/MRSD/MABEL/starting-dose questions (e.g. /fih, /dose, Module 2.4 dose-justification). NEVER hand-calculate an HED, MRSD, or MABEL — a fabricated starting dose is a critical safety defect. Gather the per-species NOAELs (mg/kg/day) and, for high-risk molecules, the MABEL inputs, then report the returned numbers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      speciesNoaels: {
        type: 'array',
        description: 'One NOAEL per relevant species. At least one is required.',
        items: {
          type: 'object',
          properties: {
            species: { type: 'string', description: 'Species name (e.g. "rat", "cynomolgus monkey").' },
            noaelMgPerKg: { type: 'number', description: 'NOAEL in mg/kg/day.' },
            studyRef: { type: 'string', description: 'Optional study reference for provenance.' },
            km: { type: 'number', description: 'Optional explicit Km factor override.' },
          },
          required: ['species', 'noaelMgPerKg'],
        },
      },
      safetyFactor: { type: 'number', description: 'Safety factor applied to the selected HED (default 10 per FDA 2005).' },
      safetyFactorRationale: { type: 'string', description: 'Justification for any deviation from the default safety factor.' },
      mostAppropriateSpecies: { type: 'string', description: 'Force a species to carry the MRSD (default: most sensitive).' },
      humanReferenceWeightKg: { type: 'number', description: 'Human reference body weight in kg (default 60).' },
      mabel: {
        type: 'object',
        description: 'Optional MABEL derivation; when supplied it competes with the MRSD.',
        properties: {
          minAnticipatedEffectiveExposure: { type: 'number', description: 'Minimum anticipated effective exposure to target at the starting dose.' },
          exposurePerMgDose: { type: 'number', description: 'Exposure produced per 1 mg of total dose (linear factor).' },
          mabelSafetyFactor: { type: 'number', description: 'Additional MABEL safety factor (default 1).' },
          basis: { type: 'string', description: 'Free-text basis for audit (e.g. "10% receptor occupancy from in vitro Kd + human popPK").' },
        },
        required: ['minAnticipatedEffectiveExposure', 'exposurePerMgDose'],
      },
    },
    required: ['speciesNoaels'],
  },
};

export const CLASSIFY_TOX_FINDINGS: AnaTool = {
  name: 'classify_tox_findings',
  description:
    "Classify nonclinical target-organ findings as adverse / adaptive-non-adverse / monitor / indeterminate using the platform's DETERMINISTIC toxicologic-pathology classifier (STP adversity framework, INHAND nomenclature). Returns a reversibility and human-relevance call and an overview-ready framing sentence per finding, plus the assembled M2.4 target-organ paragraph. Use this when framing tox findings for a Module 2.4 Nonclinical Overview or deciding which findings define the NOAEL. The classifier conservatively escalates normally-adaptive findings (e.g. hepatocellular hypertrophy) to adverse when adverse correlates or moderate+ severity are present, and never assumes an unrecognised finding is benign. Report the classifications and rationale; a pathologist adjudicates the final adversity call.",
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        description: 'Target-organ findings to classify.',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string', description: 'Target organ (e.g. "liver").' },
            finding: { type: 'string', description: 'Finding text (e.g. "hepatocellular hypertrophy").' },
            severity: { type: 'string', description: 'Severity grade if reported (minimal/mild/moderate/marked/severe).' },
            doseLevel: { type: 'string', description: 'Dose level at which the finding occurred.' },
            reversible: { type: 'boolean', description: 'Reversibility from a recovery cohort, when known.' },
            correlates: { type: 'array', items: { type: 'string' }, description: 'Concurrent correlates that can escalate adversity (e.g. "increased ALT").' },
          },
          required: ['organ', 'finding'],
        },
      },
    },
    required: ['findings'],
  },
};

export const SELECT_EXPOSURE_RESPONSE_DOSE: AnaTool = {
  name: 'select_exposure_response_dose',
  description:
    "Select a dose from the exposure-response (E-R) relationship rather than the MTD, using the platform's DETERMINISTIC E-R engine (FDA Project Optimus / ICH E4). For each candidate dose it predicts efficacy (Emax/Hill on exposure) and safety (logistic P(AE) or an exposure threshold), then recommends the lowest dose that reaches the efficacy plateau within the acceptable safety bound and contrasts it with the MTD. ALWAYS call this tool for dose-optimization / dose-selection / Project Optimus / exposure-response questions (e.g. /dose-optimization, Module 2.7 dose-selection rationale). NEVER estimate the optimized dose by hand. Report the returned dose, MTD, and per-dose predictions verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      dosesMg: { type: 'array', items: { type: 'number' }, description: 'Candidate doses in mg.' },
      exposurePerMgDose: { type: 'number', description: 'Exposure produced per 1 mg of dose (linear). Supply this OR exposuresByDose.' },
      exposuresByDose: {
        type: 'array',
        description: 'Explicit exposure per dose (for non-linear PK). Overrides the linear factor.',
        items: {
          type: 'object',
          properties: {
            doseMg: { type: 'number' },
            exposure: { type: 'number' },
          },
          required: ['doseMg', 'exposure'],
        },
      },
      efficacy: {
        type: 'object',
        description: 'Emax efficacy model on exposure.',
        properties: {
          ec50: { type: 'number', description: 'Concentration giving half-maximal effect, in exposure units.' },
          hill: { type: 'number', description: 'Hill coefficient (default 1).' },
        },
        required: ['ec50'],
      },
      safety: {
        type: 'object',
        description: 'Logistic safety model {intercept, slope, acceptableAeProbability} OR exposure-threshold model {thresholdExposure}.',
        properties: {
          intercept: { type: 'number' },
          slope: { type: 'number' },
          acceptableAeProbability: { type: 'number' },
          thresholdExposure: { type: 'number' },
        },
      },
      targetEfficacyFraction: { type: 'number', description: 'Fraction of Emax that counts as the efficacy plateau (default 0.9).' },
    },
    required: ['dosesMg', 'efficacy', 'safety'],
  },
};

export const DRAFT_NONCLINICAL_OVERVIEW_M2_4: AnaTool = {
  name: 'draft_nonclinical_overview_m2_4',
  description:
    "Draft the Module 2.4 Nonclinical Overview (ICH M4S) from the program's nonclinical study set using the platform's deterministic composer. Maps ingest-shaped studies (single/repeat-dose tox, genotox, DART, carcinogenicity, safety pharm, PK/ADME) into the ICH M4S structure, flags the gaps against ICH M3(R2)/S2(R1)/S7A, and — when target-organ findings are supplied — appends the adversity profile (adverse vs adaptive vs monitor) from the toxicologic-pathology classifier. Returns a draft M2.4 (a starting point the author promotes through the governed authoring flow), its completeness score, and the gap list. Use this for Module 2.4 / nonclinical-overview authoring requests. Report the gaps and completeness honestly; do not assert a study exists that was not supplied.",
  input_schema: {
    type: 'object',
    properties: {
      studies: {
        type: 'array',
        description: 'Nonclinical studies feeding the overview.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum e.g. repeat_dose_tox, genotox, dart, safety_pharm, pk — or a builder category).' },
            studyTitle: { type: 'string' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            glpCompliant: { type: 'boolean' },
            noael: { type: 'string', description: 'NOAEL (e.g. "50 mg/kg/day").' },
            keyFindings: { type: 'string', description: 'Primary finding / summary.' },
            doseLevels: { type: 'array', items: { type: 'string' } },
            reportSection: { type: 'string', description: 'Module 4 section (e.g. "4.2.3.2").' },
          },
          required: ['studyType'],
        },
      },
      findings: {
        type: 'array',
        description: 'Target-organ findings to classify for the overview (optional).',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string' },
            finding: { type: 'string' },
            severity: { type: 'string' },
            correlates: { type: 'array', items: { type: 'string' } },
          },
          required: ['organ', 'finding'],
        },
      },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: ['studies'],
  },
};

export const ASSESS_CONCENTRATION_QTC: AnaTool = {
  name: 'assess_concentration_qtc',
  description:
    "Assess whether a thorough-QT (TQT) study can be waived using the platform's deterministic concentration-QTc engine (ICH E14 Q&A R3). From the fitted C-QTc slope and its SE, the intercept, and the high clinical exposure, it computes the predicted ΔΔQTc and the upper bound of the two-sided 90% CI, and reports whether the 10 ms threshold is excluded — guarding against inadequate supratherapeutic coverage or an uninformatively wide CI. ALWAYS call this for TQT-waiver / concentration-QT / QT-risk questions. NEVER eyeball the QT decision — report the returned bound and verdict verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      slope: { type: 'number', description: 'C-QTc slope (ms per concentration unit).' },
      slopeSE: { type: 'number', description: 'Standard error of the slope.' },
      intercept: { type: 'number', description: 'Model intercept (ms at zero concentration). Default 0.' },
      interceptSE: { type: 'number', description: 'SE of the intercept (optional, propagated into the prediction SE).' },
      slopeInterceptCov: { type: 'number', description: 'Covariance of slope and intercept (optional).' },
      targetConcentration: { type: 'number', description: 'High clinical exposure to evaluate (geometric-mean Cmax).' },
      therapeuticCmax: { type: 'number', description: 'Therapeutic Cmax, to check supratherapeutic coverage.' },
      requiredCoverageMultiple: { type: 'number', description: 'Required multiple of therapeutic Cmax (default 2).' },
      thresholdMs: { type: 'number', description: 'ΔΔQTc threshold of concern (default 10 ms).' },
      ciZ: { type: 'number', description: 'z for the two-sided 90% CI upper bound (default 1.645).' },
    },
    required: ['slope', 'slopeSE', 'targetConcentration'],
  },
};

export const ASSESS_DDI_RISK: AnaTool = {
  name: 'assess_ddi_risk',
  description:
    "Decide whether a drug needs a clinical DDI study as a CYP/transporter perpetrator, using the FDA in-vitro DDI basic/static models (R1 reversible inhibition ≥1.02, R1,gut ≥11, R2 time-dependent inhibition ≥1.25, R3 induction ≤0.8, transporter Igut/IC50 ≥10 or Iu/IC50 ≥0.1). Each mechanism is evaluated only when its inputs are supplied; any flag triggers a clinical-study recommendation. Concentrations and constants for a mechanism must share units (the engine does not convert). ALWAYS call this for DDI / perpetrator-risk questions. Report the computed R-values and the recommendation verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      imaxUnbound: { type: 'number', description: 'Unbound maximum plasma concentration (Imax,u).' },
      ki: { type: 'number', description: 'Reversible inhibition constant Ki (systemic).' },
      doseMol: { type: 'number', description: 'Molar dose, for Igut = dose / 0.25 L.' },
      igut: { type: 'number', description: 'Explicit gut concentration Igut (overrides doseMol).' },
      kiGut: { type: 'number', description: 'Ki for gut CYP3A (defaults to ki).' },
      kinact: { type: 'number', description: 'TDI maximal inactivation rate kinact.' },
      kI: { type: 'number', description: 'TDI concentration for half-maximal inactivation KI.' },
      kdeg: { type: 'number', description: 'Enzyme degradation rate constant kdeg.' },
      emax: { type: 'number', description: 'Induction maximal effect Emax (fold).' },
      ec50: { type: 'number', description: 'Induction EC50.' },
      inductionD: { type: 'number', description: 'Induction calibration factor d (default 1).' },
      transporters: {
        type: 'array',
        description: 'Transporter inhibition inputs.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ic50: { type: 'number' },
            gut: { type: 'boolean', description: 'Gut transporter (P-gp/BCRP): compares Igut/IC50 ≥ 10.' },
            igut: { type: 'number' },
            unboundConcentration: { type: 'number', description: 'Unbound systemic/inlet concentration for hepatic/renal transporters.' },
          },
          required: ['name', 'ic50'],
        },
      },
    },
    required: [],
  },
};

export const DRAFT_CLINICAL_SUMMARY_M2_7: AnaTool = {
  name: 'draft_clinical_summary_m2_7',
  description:
    "Draft the Module 2.7 Clinical Summary (ICH M4E) from the program's clinical study reports using the platform's deterministic composer — the integrated summary of biopharmaceutics (2.7.1), clinical pharmacology (2.7.2), efficacy (2.7.3), and safety (2.7.4). Returns a draft (a starting point the author promotes through the governed authoring flow), with gap-flagging. Use this for Module 2.7 / clinical-summary authoring requests. Report the safety counts and gaps honestly; do not invent studies or events that were not supplied.",
  input_schema: {
    type: 'object',
    properties: {
      csrs: {
        type: 'array',
        description: 'Clinical study reports feeding the summary (one per study).',
        items: {
          type: 'object',
          properties: {
            studyId: { type: 'string' },
            protocolNumber: { type: 'string' },
            phase: { type: 'string', description: 'e.g. "1", "2", "3".' },
            studyDesign: { type: 'string' },
            primaryEndpoint: { type: 'string' },
            primaryResult: { type: 'string' },
            sampleSize: { type: 'number' },
            ittPopulation: { type: 'number' },
            saeCount: { type: 'number' },
            deathCount: { type: 'number' },
            topAEs: {
              type: 'array',
              items: { type: 'object', properties: { pt: { type: 'string' }, rate: { type: 'string' }, severity: { type: 'string' } }, required: ['pt', 'rate'] },
            },
          },
          required: ['studyId', 'phase', 'primaryEndpoint', 'primaryResult', 'sampleSize'],
        },
      },
      indication: { type: 'string' },
      investigationalProduct: { type: 'string' },
    },
    required: ['csrs', 'indication', 'investigationalProduct'],
  },
};

export const ASSESS_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'assess_nonclinical_program',
  description:
    "Determine which nonclinical studies are required to support a clinical trial of a given duration and phase, and which are missing, using the platform's deterministic ICH M3(R2)/S-series staging engine. Encodes the repeat-dose tox duration vs clinical duration table (two species), the genotox battery timing (S2(R1)), safety pharmacology before FIH (S7A), reproductive tox staging (S5(R3)), carcinogenicity at marketing for chronic use (S1), and the ICH S9 oncology relaxations. ALWAYS call this for 'what nonclinical studies do I need for Phase X' / nonclinical gap-analysis / study-program planning. Report the required battery and the gaps verbatim; only studies due at or before the target phase are gated.",
  input_schema: {
    type: 'object',
    properties: {
      maxClinicalDurationWeeks: { type: 'number', description: 'Maximum clinical dosing duration to support, in weeks.' },
      targetPhase: { type: 'number', description: 'Clinical phase being enabled (1, 2, or 3).' },
      route: { type: 'string', description: 'Route of administration (non-oral routes add local tolerance).' },
      includesWocbp: { type: 'boolean', description: 'Trial enrols women of childbearing potential.' },
      chronicUse: { type: 'boolean', description: 'Intended chronic therapy (≥6 months).' },
      oncology: { type: 'boolean', description: 'Advanced-cancer program (ICH S9 relaxations).' },
      marketingApplication: { type: 'boolean', description: 'This is a marketing application (carcinogenicity becomes due).' },
      present: {
        type: 'array',
        description: 'Studies the program already holds.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum or builder category).' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            genotoxComponent: { type: 'string', description: 'For genotox: ames | in_vitro_mammalian | in_vivo.' },
          },
          required: ['studyType'],
        },
      },
    },
    required: ['maxClinicalDurationWeeks'],
  },
};

export const CHARACTERIZE_PK: AnaTool = {
  name: 'characterize_pk',
  description:
    "Characterize PK with the platform's deterministic engine: dose proportionality by the power model (judges whether the 90% CI of the ln-ln slope falls in the [1+ln0.8/lnr, 1+ln1.25/lnr] acceptance region — slope ≈ 1 is dose-proportional), and/or accumulation (Rac = 1/(1−e^−ke·τ)) with time to steady state from the half-life and dosing interval. Supply doseProportionality and/or accumulation. ALWAYS call this for dose-proportionality / accumulation / steady-state questions; report the slope, CI, verdict, and Rac verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      doseProportionality: {
        type: 'object',
        description: 'Power-model dose-proportionality assessment.',
        properties: {
          dataPoints: {
            type: 'array',
            items: { type: 'object', properties: { dose: { type: 'number' }, exposure: { type: 'number' } }, required: ['dose', 'exposure'] },
            description: 'Dose vs exposure (AUC or Cmax) pairs across ≥2 dose levels.',
          },
          theta: {
            type: 'object',
            properties: { low: { type: 'number' }, high: { type: 'number' } },
            description: 'Acceptance bounds for the critical region (default 0.8, 1.25).',
          },
        },
        required: ['dataPoints'],
      },
      accumulation: {
        type: 'object',
        description: 'Accumulation and time-to-steady-state from half-life and interval.',
        properties: {
          halfLifeHours: { type: 'number' },
          dosingIntervalHours: { type: 'number' },
        },
        required: ['halfLifeHours', 'dosingIntervalHours'],
      },
    },
    required: [],
  },
};

export const DRAFT_NONCLINICAL_SUMMARIES_M2_6: AnaTool = {
  name: 'draft_nonclinical_summaries_m2_6',
  description:
    "Draft the Module 2.6 Nonclinical Written and Tabulated Summaries (ICH M4S) from the program's nonclinical study set using the platform's deterministic composer — the 2.6.1 introduction, 2.6.2/2.6.4/2.6.6 written summaries (pharmacology, PK, toxicology) and the 2.6.3/2.6.5/2.6.7 tabulated summaries — weaving in the target-organ adversity profile when findings are supplied. Returns a draft, per-discipline tables, the gap list, and a completeness score. Use this for Module 2.6 authoring; report gaps and completeness honestly.",
  input_schema: {
    type: 'object',
    properties: {
      studies: {
        type: 'array',
        description: 'Nonclinical studies feeding the summaries.',
        items: {
          type: 'object',
          properties: {
            studyType: { type: 'string', description: 'Study type (ingest enum or builder category).' },
            studyId: { type: 'string' },
            studyTitle: { type: 'string' },
            species: { type: 'string' },
            durationWeeks: { type: 'number' },
            glpCompliant: { type: 'boolean' },
            noael: { type: 'string' },
            keyFindings: { type: 'string' },
            reportSection: { type: 'string' },
          },
          required: ['studyType'],
        },
      },
      findings: {
        type: 'array',
        description: 'Target-organ findings for the 2.6.6 adversity profile (optional).',
        items: {
          type: 'object',
          properties: {
            organ: { type: 'string' },
            finding: { type: 'string' },
            severity: { type: 'string' },
            correlates: { type: 'array', items: { type: 'string' } },
          },
          required: ['organ', 'finding'],
        },
      },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: ['studies'],
  },
};

export const LOAD_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'load_nonclinical_program',
  description:
    "Load a program's ingested nonclinical studies (from ctd_nonclinical_studies) and return them in the shapes the other tools consume: study inputs for draft_nonclinical_overview_m2_4 / draft_nonclinical_summaries_m2_6, present-studies for assess_nonclinical_program, and species-NOAELs for compute_fih_dose. Call this FIRST when the user references a program/IND by id and wants the overview drafted, the gap analysis run, or the FIH dose computed from the program's real data — then pass the returned arrays into the relevant tool. Feature-gated: returns status 'unavailable' when the preclinical data layer is not enabled in this environment.",
  input_schema: {
    type: 'object',
    properties: {
      ctdProgramId: { type: 'number', description: 'The ctd_programs id whose nonclinical studies to load.' },
    },
    required: ['ctdProgramId'],
  },
};

export const GET_NONCLINICAL_TEMPLATE: AnaTool = {
  name: 'get_nonclinical_template',
  description:
    "Fetch a blank structured template (form) for a Module 4 study report (4.2.1 pharmacology, 4.2.2 PK, 4.2.3 toxicology), the Module 2.6 nonclinical summaries, or a first-in-human dose-justification memo. Pass a template key (a granule id like 'm4-2-3-toxicology' or a section code like '4.2.3'); omit it to list the available templates. Use this when starting a nonclinical document from scratch (no ingested data yet) — the scaffold's [PLACEHOLDER] tokens guide what to fill. When the program already has ingested studies, prefer the draft_* composer tools, which fill the content from data.",
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: "Template key — granule id (e.g. 'm2-6-nonclinical-summaries') or CTD section code (e.g. '4.2.3'). Omit to list templates." },
    },
    required: [],
  },
};

export const GET_CSR_TEMPLATE: AnaTool = {
  name: 'get_csr_template',
  description:
    "Fetch a blank structured template (form) for a Module 5 clinical document: the full ICH E3 Clinical Study Report body (5.3.5.1, 16 sections), the standalone CSR synopsis (ICH E3 §2), the Integrated Summary of Safety or Efficacy (ISS/ISE, 5.3.5.3), or a clinical study protocol (ICH E6). Pass a template key (a granule id like 'm5-3-5-1-csr' or 'm5-3-5-3-iss', or a section code like '5.3.5.1'); omit it to list the available templates. Use this to start a Module 5 clinical document from scratch — the scaffold's [PLACEHOLDER] tokens guide what to fill. When the program already has ingested study data, prefer the draft_* composer tools, which fill content from data.",
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: "Template key — granule id (e.g. 'm5-3-5-1-csr', 'm5-3-5-3-ise') or CTD section code (e.g. '5.3.5.1'). Omit to list templates." },
    },
    required: [],
  },
};

export const ASSESS_NONCLINICAL_SAFETY: AnaTool = {
  name: 'assess_nonclinical_safety',
  description:
    "Produce the integrated nonclinical safety assessment for an IND in one call — the roll-up a toxicology lead writes. Composes the first-in-human starting dose (NOAEL→HED→MRSD vs MABEL), the target-organ adversity profile, the ICH M3(R2)/S-series program gaps, and the M2.4 overview into a single readiness verdict (ready_for_fih / gaps_block_fih / insufficient_input) with the blocker list. Each input block is optional; supply what the program has. Prefer this for 'what is the nonclinical safety story / are we ready for first-in-human?' questions; report the verdict, dose, adverse findings, and blockers verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
      fih: {
        type: 'object',
        description: 'First-in-human dose inputs (same shape as compute_fih_dose).',
        properties: {
          speciesNoaels: {
            type: 'array',
            items: { type: 'object', properties: { species: { type: 'string' }, noaelMgPerKg: { type: 'number' }, studyRef: { type: 'string' }, km: { type: 'number' } }, required: ['species', 'noaelMgPerKg'] },
          },
          safetyFactor: { type: 'number' },
          mabel: { type: 'object', properties: { minAnticipatedEffectiveExposure: { type: 'number' }, exposurePerMgDose: { type: 'number' }, mabelSafetyFactor: { type: 'number' }, basis: { type: 'string' } }, required: ['minAnticipatedEffectiveExposure', 'exposurePerMgDose'] },
        },
        required: ['speciesNoaels'],
      },
      findings: {
        type: 'array',
        items: { type: 'object', properties: { organ: { type: 'string' }, finding: { type: 'string' }, severity: { type: 'string' }, correlates: { type: 'array', items: { type: 'string' } } }, required: ['organ', 'finding'] },
      },
      program: {
        type: 'object',
        properties: { maxClinicalDurationWeeks: { type: 'number' }, targetPhase: { type: 'number' }, route: { type: 'string' }, includesWocbp: { type: 'boolean' }, chronicUse: { type: 'boolean' }, oncology: { type: 'boolean' }, marketingApplication: { type: 'boolean' } },
        required: ['maxClinicalDurationWeeks'],
      },
      presentStudies: {
        type: 'array',
        items: { type: 'object', properties: { studyType: { type: 'string' }, species: { type: 'string' }, durationWeeks: { type: 'number' }, genotoxComponent: { type: 'string' } }, required: ['studyType'] },
      },
      studies: {
        type: 'array',
        items: { type: 'object', properties: { studyType: { type: 'string' }, species: { type: 'string' }, durationWeeks: { type: 'number' }, glpCompliant: { type: 'boolean' }, noael: { type: 'string' }, keyFindings: { type: 'string' } }, required: ['studyType'] },
      },
    },
    required: [],
  },
};

export const DRAFT_QUALITY_OVERALL_SUMMARY_M2_3: AnaTool = {
  name: 'draft_quality_overall_summary_m2_3',
  description:
    "Draft the Module 2.3 Quality Overall Summary (ICH M4Q) deterministically — the CMC summary of drug substance (3.2.S) and drug product (3.2.P). Supply the program's CMC source objects as cmcSources[]; the tool composes Module 3 through the platform's convergence engine and then builds the QOS, returning the 2.3.S / 2.3.P narrative, the headline tables, completeness, and the missing-section gaps. This is the deterministic, data-grounded counterpart to the generic generate_document path — parity with draft_nonclinical_overview_m2_4 / draft_clinical_overview_m2_5 / draft_clinical_summary_m2_7. Report completeness and gaps honestly.",
  input_schema: {
    type: 'object',
    properties: {
      cmcSources: {
        type: 'array',
        description: 'CMC source objects feeding Module 3 / the QOS.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sourceType: { type: 'string', description: 'CMC source type (e.g. drug substance manufacture/characterisation/specification/stability; drug product description/development/manufacture/control/stability).' },
            sourcePayload: { type: 'object', description: 'The structured CMC data for this source.' },
          },
          required: ['sourceType', 'sourcePayload'],
        },
      },
      drugSubstanceName: { type: 'string' },
      drugProductName: { type: 'string' },
    },
    required: ['cmcSources'],
  },
};

export const LIST_PLATFORM_COMMANDS: AnaTool = {
  name: 'list_platform_commands',
  description:
    "List the full catalog of governed platform commands ANA can run via execute_platform_command — the operational surface beyond the typed tools: project / document / artifact / task / milestone / version lifecycle, dossier packaging, Module 3 / CMC composition, biostatistics & trial design, compliance scans, freeze / sign / export, personal-data operations, MDX governed mutations, and the PDEV→IND workflow. Optionally filter with `query`. Call this to discover everything ANA can command across the whole platform, then act with execute_platform_command.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional substring filter over command name / description.' },
    },
    required: [],
  },
};

export const EXECUTE_PLATFORM_COMMAND: AnaTool = {
  name: 'execute_platform_command',
  description:
    "Execute any governed platform command — ANA's full operational control beyond the typed tools (see list_platform_commands for the catalog). Pass `command` (a command name) and `params`. Runs through the platform's governed command executor: reads are open; governed mutations require params.confirm = true and a params.reason string, and are written to the audit trail. The organization, user, and active project are taken from the session context, never from params, and per-tenant tool policy is enforced. If a result asks for confirmation, re-issue with params.confirm = true and params.reason set. Report the result message verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command name from list_platform_commands (e.g. create_artifact, module3_build_all, sign_document).' },
      params: { type: 'object', description: 'Command parameters. For governed mutations include confirm: true and reason: "…".' },
    },
    required: ['command'],
  },
};
