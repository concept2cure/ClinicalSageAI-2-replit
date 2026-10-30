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
    "Run the DETERMINISTIC analytical-similarity engine for a BLA 351(a)/biosimilar 351(k) program. Compares a proposed biologic to a reference product across critical quality attributes using the FDA tiered framework: Tier 1 equivalence test (EAC = ±1.5·σ_R, 90% CI), Tier 2 quality range (mean_R ± k·σ_R, % of test lots within), Tier 3 min–max. Use when the user asks to run a Tier 1 similarity check, compare to a reference product, or assess analytical similarity. Returns per-attribute verdicts with the underlying statistics and an overall conclusion. Report the verdicts and numbers verbatim. Computes only; it does not save or sign an assessment. Use the governed NDA/BLA assessment controls for saving and signing.",
  input_schema: {
    type: 'object',
    properties: {
      referenceProduct: { type: 'string', description: 'Reference product name (e.g. the originator/RP).' },
      modality: { type: 'string', description: 'Product modality, e.g. monoclonal_antibody, fusion_protein, adc.' },
      targetAgency: { type: 'string', description: 'Target agency (FDA, EMA, PMDA).' },
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
    "Run the DETERMINISTIC ICH Q5E comparability engine: assess whether a biologic produced after a manufacturing change (process/site/scale/formulation) is comparable to the pre-change material. Per attribute it tests post-change lots against the pre-change quality range, the standardized mean shift, and (for high-criticality attributes) equivalence; then derives the overall conclusion and whether analytical data alone is sufficient or non-clinical/clinical bridging is indicated. Use for manufacturing change comparability questions. Report the verdicts, the bridging recommendation, and numbers verbatim. Computes only; it does not save or sign an assessment. Use the governed NDA/BLA assessment controls for saving and signing.",
  input_schema: {
    type: 'object',
    properties: {
      changeDescription: { type: 'string', description: 'What changed (e.g. "new DS manufacturing site").' },
      changeType: { type: 'string', description: 'process | site | scale | formulation | cell_bank.' },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
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
    "Run the DETERMINISTIC immunogenicity engine: compute ADA and neutralizing-antibody (NAb) incidence with 95% Wilson CIs per arm, the comparative between-arm difference (Newcombe), and an overall immunogenicity risk classification (low/moderate/high) using the FDA risk-based framework (likelihood × clinical consequence). Use for immunogenicity incidence, comparative immunogenicity, and risk-assessment questions. Report the incidences, comparison, and risk tier verbatim. Computes only; it does not save or sign an assessment. Use the governed NDA/BLA assessment controls for saving and signing.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
      targetAgency: { type: 'string' },
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
    "Run the DETERMINISTIC BLA 351(a) filing-risk engine. Maps a biologics program's CMC/clinical readiness signals — and the conclusions of the analytical-similarity, comparability, and immunogenicity engines — onto Refuse-to-File (RTF) and Complete Response Letter (CRL) failure modes (21 CFR 601.2; ICH Q5A/Q5E/Q6B/Q1A; FDA immunogenicity & process-validation guidance). Use when the user asks about BLA filing readiness, RTF/CRL risk, or what would block a biologics filing. Returns cited per-finding triggers with mitigations and overall RTF/CRL risk bands. Report the triggers and bands verbatim. Computes only; it does not save or sign an assessment. Use the governed NDA/BLA assessment controls for saving and signing.",
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['biologic', 'biosimilar'] },
      modality: { type: 'string' },
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
    "Generate a GxP-structured client Standard Operating Procedure (SOP), region-aware across FDA (US), EMA (EU), and PMDA (Japan). Use when the user asks AnA to write/draft an SOP for a process (e.g. change control, CAPA, deviation, complaint handling, management review, document control, eCTD publishing, regulatory submission, pharmacovigilance case processing, training, supplier qualification, internal audit). Pass productType: a device SOP answers to the QMSR / ISO 13485:2016, a drug or biologic SOP to 21 CFR 211 and ICH Q10 (a biologic also 21 CFR 600/601). Ask the user if you do not know it; the SOP says when it was assumed. Returns the SOP as structured sections plus rendered markdown, with the canonical SOP skeleton, a 'Requirements this procedure addresses' section listing each clause with its basis (checked regulator text, recall, or platform convention — say which when you cite one), and region-appropriate references. The draft opens in AnA's editor; the client tailors and approves it.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'SOP title, e.g. "Change Control for Manufacturing Processes".' },
      processType: {
        type: 'string',
        enum: [
          'change_control', 'document_control', 'capa', 'deviation_management',
          'ectd_publishing', 'regulatory_submission', 'pharmacovigilance_case',
          'training', 'supplier_qualification', 'internal_audit',
          'complaint_handling', 'management_review', 'generic',
        ],
        description: 'Known regulated process (drives the starter procedure). Use generic for an unlisted topic.',
      },
      regions: {
        type: 'array',
        items: { type: 'string', enum: ['FDA', 'EMA', 'PMDA'] },
        description: 'Regions the SOP must satisfy (default FDA).',
      },
      filingType: { type: 'string', description: 'Optional filing context (NDA/BLA/MAA/JNDA/IND).' },
      productType: {
        type: 'string',
        enum: ['drug', 'biologic', 'device'],
        description: 'The product the procedure governs. Device (including IVD): QMSR / ISO 13485:2016. Drug or biologic: 21 CFR 211 and ICH Q10. Omitted, drug is assumed and the SOP says so.',
      },
      organization: { type: 'string' },
      documentId: { type: 'string', description: 'SOP identifier, e.g. SOP-QA-CC-001 (generated if omitted).' },
      effectiveDate: { type: 'string', description: 'ISO date; defaults to today.' },
      ownerRole: { type: 'string', description: 'Role accountable for the SOP (e.g. "Head of Quality").' },
      scopeNote: { type: 'string', description: 'Extra scope sentence from the client.' },
    },
    required: ['title'],
  },
};

/** 2026-10-08 (D2): AnA reviews a client's SOP against what its topic requires (shared/regulatory/sop-requirements.ts). */
export const REVIEW_SOP_REQUIREMENTS: AnaTool = {
  name: 'review_sop_requirements',
  description:
    "Review a client's SOP text against what its topic requires, by the product it governs: for each requirement (e.g. for a device CAPA SOP, ISO 13485:2016 §8.5.2 (a)-(f) under the QMSR; for a drug CAPA SOP, 21 CFR 211.192 and ICH Q10 §3.2.2) it reports 'addressed' with the sentence that addresses it, or 'not_found'. Deterministic wording check, no model: 'not_found' means no wording for it was found, not that the procedure is deficient — tell the user to read for it. Each requirement carries its basis (checked regulator text, recall, or platform convention); say which when you cite it. Use when the user asks whether an SOP is complete, inspection-ready or compliant, or before revising one. Topics: capa, deviation, complaint_handling, document_control, training, supplier_qualification, internal_audit, management_review, change_control.",
  input_schema: {
    type: 'object',
    properties: {
      sop_text: { type: 'string', description: 'The full text of the SOP to review.' },
      topic: {
        type: 'string',
        enum: ['capa', 'deviation', 'complaint_handling', 'document_control', 'training', 'supplier_qualification', 'internal_audit', 'management_review', 'change_control'],
        description: 'The quality-system process the SOP governs.',
      },
      product_type: {
        type: 'string',
        enum: ['drug', 'biologic', 'device'],
        description: 'The product the procedure governs. Device includes IVD. Ask the user if you do not know it.',
      },
    },
    required: ['sop_text', 'topic', 'product_type'],
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
    "Calculate a first-in-human dose worksheet from NOAELs explicitly stated by the person: NOAEL to HED to safety factor to MRSD, and optional MABEL, using the canonical deterministic engine. Shows both derivations and which limits. No study records are read; this is not the program's starting dose or governed Module 2.4 content. Do not pass invented or inferred NOAELs or treat the result as a readiness determination. Report the stated basis, numbers, limiting derivation and warnings verbatim.",
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
    "Classify nonclinical target-organ findings as adverse / adaptive-non-adverse / monitor / indeterminate using the platform's DETERMINISTIC toxicologic-pathology classifier (STP adversity framework, INHAND nomenclature). Returns a reversibility and human-relevance call and an overview-ready framing sentence per finding, plus the assembled M2.4 target-organ paragraph. Use this only as a worksheet over findings stated in the conversation; no study records are read and it is not governed Module 2.4 content or the program's NOAEL determination. The classifier conservatively escalates normally-adaptive findings (e.g. hepatocellular hypertrophy) to adverse when adverse correlates or moderate+ severity are present, and never assumes an unrecognised finding is benign. Report the classifications and rationale; a pathologist adjudicates the final adversity call.",
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
    "Draft the Module 2.4 Nonclinical Overview (ICH M4S) for the open project. Its studies, NOAELs and findings come from the project's recorded nonclinical studies only: do not pass studies, doses, NOAELs or findings, and do not restate them from the conversation. Until nonclinical studies are recorded against a project it returns the record's ICH M4S outline (2.4.1 to 2.4.6: overview of the nonclinical testing strategy, pharmacology, pharmacokinetics, toxicology, integrated overview and conclusions, list of literature references; each heading with its key content) and says that no study is recorded; figures given in the call are refused and named as not used. Use this for Module 2.4 / nonclinical-overview requests. Report what it returns as it is: never fill a heading with a study, NOAEL or finding it did not return.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: { type: 'number', description: 'The project whose recorded studies to read, when none is open. A project open in the workspace is used as it is; another project is refused.' },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: [],
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
    "Draft the Module 2.7 Clinical Summary (ICH M4E) from the program's completed clinical study reports, using the platform's deterministic composer — the integrated summary of biopharmaceutics (2.7.1), clinical pharmacology (2.7.2), efficacy (2.7.3) and safety (2.7.4). Returns a draft (a starting point the author promotes through the governed authoring flow), with gap-flagging. Its figures come from the program's CSR records only: do not pass results, counts or rates. If the program has no completed CSR, say so.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'number',
        description: "Program (project) id whose completed CSRs the summary is composed from; defaults to the open program.",
      },
      indication: { type: 'string' },
      investigationalProduct: { type: 'string' },
    },
    required: ['indication', 'investigationalProduct'],
  },
};

export const ASSESS_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'assess_nonclinical_program',
  description:
    "List required nonclinical studies for a stated clinical duration and phase, and compare only the studies you listed, using the platform's deterministic ICH M3(R2)/S-series staging engine. Encodes the repeat-dose tox duration vs clinical duration table (two species), the genotox battery timing (S2(R1)), safety pharmacology before FIH (S7A), reproductive tox staging (S5(R3)), carcinogenicity at marketing for chronic use (S1), and the ICH S9 oncology relaxations. ALWAYS call this for 'what nonclinical studies do I need for Phase X' / nonclinical gap-analysis / study-program planning. Report the requirements and comparison against the stated list; it does not establish program adequacy. No listed studies means requirements only, with gaps null.",
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
        description: 'Studies stated in the conversation for a worksheet comparison; not read from the program records.',
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
    "Draft the Module 2.6 Nonclinical Written and Tabulated Summaries (ICH M4S) for the open project. Its studies, NOAELs and findings come from the project's recorded nonclinical studies only: do not pass studies, doses, NOAELs or findings, and do not restate them from the conversation. Until nonclinical studies are recorded against a project it returns the record's ICH M4S outline (the 2.6.1 introduction, the 2.6.2/2.6.4/2.6.6 written summaries and the 2.6.3/2.6.5/2.6.7 tabulated summaries for pharmacology, pharmacokinetics and toxicology, each heading with its key content) and says that no study is recorded; figures given in the call are refused and named as not used. Use this for Module 2.6 requests. Report what it returns as it is: never fill a heading or a table with a figure it did not return.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: { type: 'number', description: 'The project whose recorded studies to read, when none is open. A project open in the workspace is used as it is; another project is refused.' },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
    },
    required: [],
  },
};

export const LOAD_NONCLINICAL_PROGRAM: AnaTool = {
  name: 'load_nonclinical_program',
  description:
    "Load a program's ingested nonclinical studies (from ctd_nonclinical_studies) and return them in the shapes the other tools consume: present-studies for assess_nonclinical_program and species-NOAELs for compute_fih_dose. These are model-extracted rows, not an approved starting-dose or readiness basis. Do not pass them on as a program determination; worksheet tools label any relayed values as stated inputs, not records they read. The Module 2.4 and 2.6 drafts do not take these studies: they take no studies, and until nonclinical studies are recorded against a project they return the ICH M4S outline. Feature-gated: returns status 'unavailable' when the preclinical data layer is not enabled in this environment.",
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
    "Fetch a blank structured template (form) for a Module 4 study report (4.2.1 pharmacology, 4.2.2 PK, 4.2.3 toxicology), the Module 2.6 nonclinical summaries, or a first-in-human dose-justification memo. Pass a template key (a granule id like 'm4-2-3-toxicology' or a section code like '4.2.3'); omit it to list the available templates. Use this when starting a nonclinical document from scratch (no ingested data yet) — the scaffold's [PLACEHOLDER] tokens guide what to fill. For Module 2.4 and 2.6, the draft_nonclinical_* tools take no studies and return the ICH M4S outline until nonclinical studies are recorded against a project.",
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
    "Assess nonclinical safety readiness from the open project's recorded studies only. Do not pass studies, presentStudies, findings, NOAELs, doses or FIH inputs, or restate them from the conversation. Until nonclinical studies are recorded against a project, returns readiness not_assessed and, when the clinical duration is stated, the ICH M3(R2)/S-series required battery. No studies were read: this is a requirement list, not a gap analysis or a starting-dose determination. Report the refusal and requirements as returned; never infer that the program holds or lacks a study or is ready for first-in-human.",
  input_schema: {
    type: 'object',
    properties: {
      project_id: { type: 'number', description: 'Project to resolve when none is open. Another project while one is open is refused.' },
      drugSubstanceName: { type: 'string' },
      indication: { type: 'string' },
      program: {
        type: 'object',
        properties: { maxClinicalDurationWeeks: { type: 'number' }, targetPhase: { type: 'number' }, route: { type: 'string' }, includesWocbp: { type: 'boolean' }, chronicUse: { type: 'boolean' }, oncology: { type: 'boolean' }, marketingApplication: { type: 'boolean' } },
        required: ['maxClinicalDurationWeeks'],
      },
    },
    required: [],
  },
};

export const DRAFT_QUALITY_OVERALL_SUMMARY_M2_3: AnaTool = {
  name: 'draft_quality_overall_summary_m2_3',
  description:
    "Draft the Module 2.3 Quality Overall Summary (ICH M4Q) of the OPEN program, deterministically, from the CMC " +
    "data that program has recorded — the same source records and the same composition engine as its Module 3 " +
    "build. Takes no CMC data: never pass figures, specifications or stability results; a call that does is " +
    "refused. Returns the 2.3.S / 2.3.P narrative, the headline tables, completeness and the missing-section gaps, " +
    "or says no program is open or that it has no recorded CMC data. Report completeness and gaps honestly.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
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
    "Run a platform command beyond the typed tools (see list_platform_commands for the catalog). Pass `command` (a command name) and `params`. Runs through the platform's governed command executor: reads run; a write never runs on your call. It comes back as a proposal (HUMAN_CONFIRMATION_REQUIRED or PART11_SIGNATURE_REQUIRED) that only the person's confirmation in the platform runs, and that confirmation is what the audit trail records. Tell the person what you proposed and that it has not been done; do not re-issue it, because calling again with any params only proposes it again. The organization, user, and active project are taken from the session context, never from params, and per-tenant tool policy is enforced. Report the result message verbatim.",
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command name from list_platform_commands (e.g. create_artifact, module3_build_all, sign_document).' },
      params: { type: 'object', description: 'Command parameters, as list_platform_commands lists them. A confirm flag here does nothing: only the person confirms a write.' },
    },
    required: ['command'],
  },
};
