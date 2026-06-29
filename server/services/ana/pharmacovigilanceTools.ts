/**
 * Pharmacovigilance & Signal Detection tools — exposes the deterministic
 * knowledge engines in
 * `server/services/pharmacovigilance/pharmacovigilance-knowledge` to AnA as
 * first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   classify_expedited_reporting   — SUSAR / 7-15-day / periodic reporting clock
 *   assess_pv_causality            — WHO-UMC + Naranjo causality grading
 *   plan_aggregate_safety_report   — PBRER/PSUR, DSUR, PADER selection & schedule
 *   detect_safety_signal           — PRR/ROR/EBGM disproportionality (SDR)
 *   assess_signal_priority         — GVP IX validated-signal prioritisation
 *   design_pv_system               — QPPV/PSMF/safety database/RMP PV system design
 *
 * @module server/services/ana/pharmacovigilanceTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_expedited_reporting
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_EXPEDITED_REPORTING: AnaTool = {
  name: 'classify_expedited_reporting',
  description:
    'Classify an individual case safety report (ICSR) and determine the expedited-reporting ' +
    'obligation and regulatory clock, separately for FDA and the EU, from seriousness, ' +
    'expectedness, relatedness, and lifecycle stage. Implements the ICH E2A expedited-reporting ' +
    'matrix: a SUSAR (Serious + Unexpected + reasonable causal relationship) in development ' +
    'triggers a 7-calendar-day clock if fatal/life-threatening or 15 days otherwise; ' +
    'postmarketing serious+unexpected cases trigger the FDA 15-day Alert report (21 CFR ' +
    '314.80/600.80) and the EU 15-day EudraVigilance report (GVP Module VI), with a 90-day ' +
    'clock for non-serious EEA-origin cases. Returns the classification, SUSAR flag, per-region ' +
    'obligations with the report type/destination/citation, the fastest applicable clock, ' +
    'rationale, and warnings (e.g., unknown causality treated conservatively). Use when the ' +
    'user needs to know whether and how fast a case must be reported and to whom. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      stage: {
        type: 'string',
        enum: ['investigational', 'marketed', 'both'],
        description:
          'Lifecycle stage of the product generating the case. "investigational" applies the ' +
          'SUSAR / IND-safety rules; "marketed" applies 21 CFR 314.80/600.80 and GVP Module VI.',
      },
      serious: {
        type: 'boolean',
        description:
          'Whether the case meets at least one ICH E2A seriousness criterion (death, ' +
          'life-threatening, hospitalization/prolongation, disability, congenital anomaly, ' +
          'or other medically important event). Seriousness is NOT severity.',
      },
      seriousnessCriteria: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'death',
            'life_threatening',
            'hospitalization',
            'prolonged_hospitalization',
            'disability',
            'congenital_anomaly',
            'medically_important',
          ],
        },
        description:
          'The specific seriousness criteria met. Including "death" or "life_threatening" ' +
          'triggers the SHORTER 7-day SUSAR clock in development.',
      },
      expectedness: {
        type: 'string',
        enum: ['expected', 'unexpected', 'unknown'],
        description:
          'Whether the reaction is listed in / consistent with the Reference Safety Information ' +
          '(Development RSI in the IB for investigational; approved label/CCDS/SmPC for marketed). ' +
          '"unknown" is treated conservatively as unexpected.',
      },
      relatedness: {
        type: 'string',
        enum: ['related', 'not_related', 'unknown'],
        description:
          'Whether there is a reasonable possibility of a causal relationship between the ' +
          'product and the event (per reporter and/or sponsor). "unknown" is treated ' +
          'conservatively as a reasonable possibility (reportable).',
      },
      region: {
        type: 'string',
        enum: ['fda', 'eu', 'both'],
        description: 'Regulatory region(s) for which to compute the obligation.',
      },
      fromInterventionalStudy: {
        type: 'boolean',
        description:
          'Whether the case arises from an interventional clinical trial under an IND/CTA ' +
          '(forces SUSAR/development reporting rules even if stage is "both").',
      },
      occurredInEU: {
        type: 'boolean',
        description:
          'Whether the case occurred in the EEA. Relevant for the EU 90-day clock on ' +
          'NON-serious EEA-origin postmarketing cases.',
      },
    },
    required: ['stage', 'serious', 'expectedness', 'relatedness', 'region'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_pv_causality
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PV_CAUSALITY: AnaTool = {
  name: 'assess_pv_causality',
  description:
    'Assess the causal relationship between a suspected product and an adverse reaction for a ' +
    'single case using BOTH the WHO-UMC standardized categories (certain/probable/possible/' +
    'unlikely/conditional/unassessable) AND the Naranjo ADR Probability Scale, with ' +
    'dechallenge/rechallenge logic. The engine deterministically computes the Naranjo total ' +
    'from the 10 weighted answers (>=9 definite, 5-8 probable, 1-4 possible, <=0 doubtful) and ' +
    'derives the WHO-UMC category from temporal plausibility, alternative explanations, ' +
    'dechallenge/rechallenge, and pharmacological recognisability. Returns the Naranjo score with ' +
    'a per-question breakdown, the WHO-UMC category with its criteria, an agreement/divergence ' +
    'note between the two systems, rationale, and citations (WHO-UMC; Naranjo CA et al., Clin ' +
    'Pharmacol Ther 1981; ICH E2A/E2D). Use when the user needs a defensible, reproducible ' +
    'causality grade for an ICSR. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      naranjoAnswers: {
        type: 'object',
        description:
          'Answers to the 10 Naranjo questions, each "yes" | "no" | "unknown". Missing keys ' +
          'default to "unknown" (the scale\'s "do not know / not done" column).',
        properties: {
          q1_previous_reports: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Previous conclusive reports on this reaction? (+1 yes)' },
          q2_after_drug: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Event appeared after the drug was given? (+2 yes / -1 no)' },
          q3_dechallenge: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Improved on withdrawal/antagonist? (+1 yes)' },
          q4_rechallenge: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Reappeared on re-administration? (+2 yes / -1 no)' },
          q5_alternative_causes: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Alternative causes could explain it? (-1 yes / +2 no)' },
          q6_placebo: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Reaction reappeared with placebo? (-1 yes / +1 no)' },
          q7_toxic_concentration: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Drug detected in toxic concentrations? (+1 yes)' },
          q8_dose_response: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Dose-response relationship observed? (+1 yes)' },
          q9_previous_exposure: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Similar reaction to same/similar drug before? (+1 yes)' },
          q10_objective_evidence: { type: 'string', enum: ['yes', 'no', 'unknown'], description: 'Confirmed by objective evidence? (+1 yes)' },
        },
      },
      dechallenge: {
        type: 'string',
        enum: ['positive', 'negative', 'not_done', 'unknown'],
        description:
          'Dechallenge outcome (drug withdrawn). "positive" = reaction abated on withdrawal. ' +
          'If q3 is not supplied, this drives the Naranjo q3 answer.',
      },
      rechallenge: {
        type: 'string',
        enum: ['positive', 'negative', 'not_done', 'unknown'],
        description:
          'Rechallenge outcome (drug re-administered). "positive" = reaction recurred — the ' +
          'strongest single-case causal evidence. If q4 is not supplied, this drives Naranjo q4.',
      },
      temporalPlausible: {
        type: 'string',
        enum: ['yes', 'no', 'unknown'],
        description: 'Is the time relationship between exposure and reaction plausible/reasonable?',
      },
      alternativeExplanation: {
        type: 'string',
        enum: ['yes', 'no', 'unknown'],
        description:
          'Could the event be explained by concurrent disease or other drugs? Drives the ' +
          'WHO-UMC category (e.g., "possible" if yes despite plausible timing).',
      },
      pharmacologicallyKnown: {
        type: 'string',
        enum: ['yes', 'no', 'unknown'],
        description:
          'Is the event a recognised pharmacological/phenomenological effect of the drug ' +
          '(supports WHO-UMC "certain")?',
      },
      informationSufficient: {
        type: 'boolean',
        description:
          'Whether the available information is sufficient and non-contradictory to assess ' +
          'causality at all. If false, WHO-UMC returns "unassessable/unclassifiable".',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. plan_aggregate_safety_report
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_AGGREGATE_SAFETY_REPORT: AnaTool = {
  name: 'plan_aggregate_safety_report',
  description:
    'Select and schedule the applicable aggregate safety report types (DSUR, PBRER/PSUR, PADER) ' +
    'for a product based on lifecycle stage, marketing status, and region, and compute each ' +
    "report's cadence, data-lock-point (DLP) anchoring, submission deadline, and content modules " +
    'per ICH E2C(R2), ICH E2F, and 21 CFR 314.80. Returns, for each applicable report: the ' +
    'cadence (e.g., EU 6-monthly/annual/3-yearly by years since authorisation or the EURD list; ' +
    'US PADER quarterly-then-annual; annual DSUR off the DIBD), the DLP rule, the submission ' +
    'clock (DSUR 60 days; EU PSUR 70/90 days; PADER 30/60 days), and the full content-module ' +
    'outline. Also flags the option to submit a PBRER in lieu of a PADER (FDAAA 505(k)(4)). ' +
    'Use when the user needs to plan the periodic safety reporting calendar for a product. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      stage: {
        type: 'string',
        enum: ['investigational', 'marketed', 'both'],
        description:
          'Lifecycle stage. "investigational"/"both" => DSUR; "marketed"/"both" => PBRER/PSUR and/or PADER.',
      },
      marketed: {
        type: 'boolean',
        description: 'Whether the product is marketed somewhere in the world (drives PBRER/PADER).',
      },
      inDevelopment: {
        type: 'boolean',
        description: 'Whether the product is still in active clinical development (drives the DSUR).',
      },
      region: {
        type: 'string',
        enum: ['fda', 'eu', 'both'],
        description: 'Region(s) for which to plan submissions (EU => PBRER/PSUR; FDA => PADER).',
      },
      yearsSinceAuthorization: {
        type: 'number',
        description:
          'Years since first marketing authorisation (anchored to the IBD). Sets the default EU ' +
          'PBRER cadence: <=2 years => 6-monthly; 3-4 years => annual; >=5 years => every 3 years.',
      },
      onEURDList: {
        type: 'boolean',
        description:
          'Whether the product is on the EU Reference Dates (EURD) list. If true, the EURD DLP and ' +
          'frequency override the default schedule.',
      },
      withinFirstThreeYearsUS: {
        type: 'boolean',
        description:
          'Whether the product is within the first 3 years of US approval. If true (default), the ' +
          'PADER cadence is quarterly (30 days after each quarter); otherwise annual (60 days).',
      },
    },
    required: ['stage', 'region'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. detect_safety_signal
// ─────────────────────────────────────────────────────────────────────────────

export const DETECT_SAFETY_SIGNAL: AnaTool = {
  name: 'detect_safety_signal',
  description:
    'Perform disproportionality analysis on a drug-event 2x2 contingency table from a ' +
    'spontaneous-report database (FAERS / EudraVigilance) and determine whether a Signal of ' +
    'Disproportionate Reporting (SDR) is present. Computes the PRR (Proportional Reporting ' +
    'Ratio) with Yates-corrected chi-squared (Evans 2001 criterion: PRR>=2, chi2>=4, a>=3), the ' +
    'ROR (Reporting Odds Ratio) with a 95% CI and Haldane-Anscombe correction for zero cells ' +
    '(signal when the CI lower bound > 1), and an EBGM/EB05 deterministic approximation of the ' +
    'FDA MGPS criterion (EB05>=2; note: a shrinkage approximation, not a full Gamma-Poisson fit). ' +
    'Returns each measure with point estimate and 95% bounds, the threshold applied, the SDR ' +
    'determination, rationale, and warnings (small counts, zero cells). An SDR is a statistical ' +
    'signal requiring qualitative validation (GVP IX) — NOT a confirmed causal association. ' +
    'Use when the user has 2x2 counts and needs a disproportionality / signal-detection result. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: 'Cell a — number of reports with BOTH the drug of interest AND the event of interest.',
      },
      b: {
        type: 'number',
        description: 'Cell b — reports with the drug of interest but NOT the event of interest.',
      },
      c: {
        type: 'number',
        description: 'Cell c — reports with the event of interest but NOT the drug of interest.',
      },
      d: {
        type: 'number',
        description: 'Cell d — reports with NEITHER the drug nor the event of interest.',
      },
      methods: {
        type: 'array',
        items: { type: 'string', enum: ['PRR', 'ROR', 'EBGM'] },
        description: 'Which disproportionality measures to compute (default: all three).',
      },
      designatedMedicalEvent: {
        type: 'boolean',
        description:
          'Whether the event is a Designated/Important Medical Event (DME/IME). If true, the ' +
          'minimum-count requirement is lowered (a>=1 instead of a>=3) because DMEs warrant ' +
          'review even with very few cases.',
      },
    },
    required: ['a', 'b', 'c', 'd'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_signal_priority
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_SIGNAL_PRIORITY: AnaTool = {
  name: 'assess_signal_priority',
  description:
    'Prioritize a VALIDATED safety signal into a high/medium/low tier with an action timeline ' +
    'per EU GVP Module IX. The deterministic score is a weighted sum of the GVP prioritisation ' +
    'criteria — strength of evidence, seriousness/clinical importance, novelty, public-health ' +
    'impact, and preventability (actionability) — plus modifiers for vulnerable populations and ' +
    'Designated Medical Events. Returns the priority tier and score, the action timeline (e.g., ' +
    'an EU emerging safety issue notified within 3 working days for high; ~90-day routine ' +
    'assessment for medium; continued monitoring for low), recommended actions, the per-factor ' +
    'sub-scores, rationale, and citations (GVP Module IX & Addendum I; ICH E2C(R2)). A fatal ' +
    'seriousness flag forces the high tier. Use when the user has a validated signal and needs ' +
    'a prioritisation and action plan. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      strengthOfEvidence: {
        type: 'string',
        enum: ['strong', 'moderate', 'weak'],
        description: 'Strength of the combined statistical and clinical evidence for the association.',
      },
      seriousness: {
        type: 'string',
        enum: ['serious_fatal', 'serious_non_fatal', 'non_serious'],
        description: 'Clinical seriousness of the reaction. "serious_fatal" forces the high priority tier.',
      },
      novelty: {
        type: 'string',
        enum: ['new', 'known_change', 'known'],
        description:
          'Whether the association is new (not in the current RSI), a change to a known risk, or already known.',
      },
      publicHealthImpact: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Public-health impact based on exposed population size and frequency of the reaction.',
      },
      preventability: {
        type: 'string',
        enum: ['preventable', 'partially', 'not_preventable'],
        description:
          'Whether the risk is preventable/actionable (e.g., via labelling, monitoring, dose change). ' +
          'A preventable serious risk is higher priority because it is actionable.',
      },
      vulnerablePopulation: {
        type: 'boolean',
        description: 'Whether a vulnerable population (paediatric, pregnancy, elderly) is affected (escalates priority).',
      },
      designatedMedicalEvent: {
        type: 'boolean',
        description: 'Whether the reaction is a Designated Medical Event (DME), which is prioritised irrespective of disproportionality strength.',
      },
    },
    required: ['strengthOfEvidence', 'seriousness', 'novelty', 'publicHealthImpact', 'preventability'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. design_pv_system
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PV_SYSTEM: AnaTool = {
  name: 'design_pv_system',
  description:
    'Design a pharmacovigilance system — the required components, the QPPV/PSMF/RMP obligations, ' +
    'the safety-database requirements, and the ICH E2E pharmacovigilance plan — for a given region ' +
    'and lifecycle stage, per EU GVP (Modules I, II, V, VI, IX) and ICH E2E. Returns the list of ' +
    'system components (QPPV, PSMF, validated E2B(R3) safety database, MedDRA coding, literature ' +
    'monitoring, signal management, periodic/expedited reporting, RMP/risk minimisation, quality ' +
    'system/audit/inspection readiness) with required/optional flags and citations; whether a QPPV, ' +
    'PSMF, and RMP are required; the safety-database functional requirements (E2B(R3) gateway ' +
    'submission, MedDRA coding, duplicate detection, 21 CFR Part 11 audit trail, configurable ' +
    'reporting clocks); and the PV plan (safety specification + routine/additional PV activities). ' +
    'Use when the user is standing up or scoping a PV system for an investigational or marketed ' +
    'product. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        enum: ['fda', 'eu', 'both'],
        description:
          'Region(s) the PV system must serve. EU scope mandates a QPPV and PSMF; US-only scope ' +
          'focuses on FAERS reporting, PADER, and REMS.',
      },
      stage: {
        type: 'string',
        enum: ['investigational', 'marketed', 'both'],
        description: 'Product lifecycle stage (drives SUSAR vs postmarketing emphasis and RMP timing).',
      },
      newActiveSubstance: {
        type: 'boolean',
        description: 'Whether the product is a new active substance / first-in-class (mandates an RMP with additional PV activities).',
      },
      hasImportantRisks: {
        type: 'boolean',
        description: 'Whether the product has important identified/potential risks or missing information requiring an RMP.',
      },
      estimatedAnnualICSRVolume: {
        type: 'number',
        description: 'Estimated annual ICSR volume, used to size the safety database and staffing.',
      },
      euMarketingAuthorization: {
        type: 'boolean',
        description:
          'Whether the company holds (or is applying for) an EU marketing authorisation. If false, ' +
          'QPPV/PSMF may not yet be legally mandated but are prerequisites for an EU MA application.',
      },
      portfolioSize: {
        type: 'number',
        description: 'Number of products in the portfolio (informs the PSMF scope).',
      },
    },
    required: ['region', 'stage'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Pharmacovigilance & signal-detection tools, spread into ALL_ANA_TOOLS. */
export const PHARMACOVIGILANCE_TOOLS: AnaTool[] = [
  CLASSIFY_EXPEDITED_REPORTING,
  ASSESS_PV_CAUSALITY,
  PLAN_AGGREGATE_SAFETY_REPORT,
  DETECT_SAFETY_SIGNAL,
  ASSESS_SIGNAL_PRIORITY,
  DESIGN_PV_SYSTEM,
];
