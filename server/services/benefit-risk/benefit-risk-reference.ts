/**
 * Structured Benefit-Risk Assessment — fixed reference text
 * ==========================================================
 *
 * The citation registry, the ordinal score tables, the condition, endpoint,
 * frequency and evidence-source texts, the default importance weights, the
 * weighting guidance, the per-audience communication texts and the
 * uncertainty-source texts of benefit-risk-knowledge.ts, moved here unchanged on
 * 2026-11-09 (Rule 2 S5d) so that the engine stays under the 100,000-byte
 * ceiling (CLAUDE.md Rule 6: a file split out of a large one goes inside the
 * folder it came from). Pure data, pure lookups and two pure helpers that moved
 * with them (deriveMagnitude, the ordinal magnitude from stated treatment and
 * control values, and worseUncertainty): no LLM, no network, no database. The
 * engine is the only importer.
 *
 * @module server/services/benefit-risk/benefit-risk-reference
 */

import type {
  BRAudience,
  EffectInput,
  KeyBenefitClaim,
  KeyRiskItem,
  MagnitudeLevel,
  ResolvedUncertaintySource,
  ReversibilityLevel,
  SeverityLevel,
  StructureBenefitRiskFrameworkParams,
  UncertaintyLevel,
  UncertaintySourceType,
} from './benefit-risk-knowledge';

/** A single regulatory citation with a stable identifier. */
export interface Citation {
  readonly id: string;
  readonly source: string;
  readonly reference: string;
  readonly year: number;
}

/**
 * Canonical citation registry. Every citation surfaced by the engine is drawn
 * from this table so that wording is identical across all six functions. The
 * keys are stable identifiers used internally; the `reference` strings are the
 * verbatim text callers must report.
 */
export interface CitationRegistry {
  readonly [key: string]: Citation;
}

export const CITATIONS: CitationRegistry = {
  FDA_BR_FRAMEWORK_2023: {
    id: 'FDA_BR_FRAMEWORK_2023',
    source: 'FDA Guidance for Industry',
    reference:
      'FDA, "Benefit-Risk Assessment for New Drug and Biological Products: ' +
      'Guidance for Industry" (final guidance, September 2023)',
    year: 2023,
  },
  FDA_PDUFA_VI: {
    id: 'FDA_PDUFA_VI',
    source: 'PDUFA Reauthorization Performance Goals',
    reference:
      'PDUFA VI Commitment Letter (FY2018-2022), Section I.J — Enhancement ' +
      'and Modernization of the FDA Drug Safety System and Benefit-Risk Assessment',
    year: 2017,
  },
  FDA_PDUFA_VII: {
    id: 'FDA_PDUFA_VII',
    source: 'PDUFA Reauthorization Performance Goals',
    reference:
      'PDUFA VII Commitment Letter (FY2023-2027), Section I — Patient-Focused ' +
      'Drug Development and Benefit-Risk Assessment in Regulatory Decision-Making',
    year: 2021,
  },
  FDA_BR_FRAMEWORK_GRID: {
    id: 'FDA_BR_FRAMEWORK_GRID',
    source: 'FDA Benefit-Risk Framework',
    reference:
      'FDA Benefit-Risk Assessment Framework grid: Analysis of Condition, ' +
      'Current Treatment Options, Benefit, Risk and Risk Management → Conclusions',
    year: 2023,
  },
  EMA_BR_METHODOLOGY: {
    id: 'EMA_BR_METHODOLOGY',
    source: 'EMA Benefit-Risk Methodology Project',
    reference:
      'EMA, "Benefit-Risk Methodology Project" Work Packages 1-4 ' +
      '(EMA/549682/2010; final report 2012)',
    year: 2012,
  },
  EMA_EFFECTS_TABLE: {
    id: 'EMA_EFFECTS_TABLE',
    source: 'EMA Assessment Report Template',
    reference:
      'EMA effects table — standardized tabulation of favourable and ' +
      'unfavourable effects (CHMP assessment report template; EPAR benefit-risk section)',
    year: 2014,
  },
  PROACT_URL: {
    id: 'PROACT_URL',
    source: 'PrOACT-URL Framework',
    reference:
      'Hammond, Keeney & Raiffa, adapted by EMA — PrOACT-URL: Problem, ' +
      'Objectives, Alternatives, Consequences, Trade-offs, Uncertainty, ' +
      'Risk attitude, Linked decisions',
    year: 2012,
  },
  IMI_PROTECT_BRAT: {
    id: 'IMI_PROTECT_BRAT',
    source: 'IMI PROTECT Benefit-Risk',
    reference:
      'IMI PROTECT Work Package 5, "Recommendations for the methodology and ' +
      'visualisation techniques to be used in the assessment of benefit and risk ' +
      'of medicines" (2013); BRAT framework, Coplan et al., Clin Pharmacol Ther 2011',
    year: 2013,
  },
  ICH_M4E_R2: {
    id: 'ICH_M4E_R2',
    source: 'ICH Harmonised Guideline',
    reference:
      'ICH M4E(R2), Common Technical Document for the Registration of ' +
      'Pharmaceuticals — Clinical Overview, §2.5.6 Benefits and Risks Conclusions (2016)',
    year: 2016,
  },
  CIOMS_IV: {
    id: 'CIOMS_IV',
    source: 'CIOMS Working Group IV',
    reference:
      'CIOMS Working Group IV, "Benefit-Risk Balance for Marketed Drugs: ' +
      'Evaluating Safety Signals" (Geneva, 1998)',
    year: 1998,
  },
  CIOMS_VI: {
    id: 'CIOMS_VI',
    source: 'CIOMS Working Group VI',
    reference:
      'CIOMS Working Group VI, "Management of Safety Information from Clinical ' +
      'Trials" (Geneva, 2005)',
    year: 2005,
  },
  MCDA_SWING: {
    id: 'MCDA_SWING',
    source: 'Multi-Criteria Decision Analysis methodology',
    reference:
      'Mussen, Salek & Walker, "A quantitative approach to benefit-risk ' +
      'assessment of medicines" — MCDA with swing weighting (Pharmacoepidemiol ' +
      'Drug Saf 2007); EMA MCDA pilot, PROTECT WP5',
    year: 2007,
  },
  FDA_PFDD: {
    id: 'FDA_PFDD',
    source: 'FDA Patient-Focused Drug Development',
    reference:
      'FDA PFDD Guidance Series (Guidances 1-4, 2018-2023) on collecting and ' +
      'submitting patient experience data to inform benefit-risk assessment',
    year: 2023,
  },
  ICH_E2C_R2: {
    id: 'ICH_E2C_R2',
    source: 'ICH Harmonised Guideline',
    reference:
      'ICH E2C(R2), Periodic Benefit-Risk Evaluation Report (PBRER) — ' +
      'integrated benefit-risk evaluation for marketed products (2012)',
    year: 2012,
  },
  EMA_RMP_GVP_V: {
    id: 'EMA_RMP_GVP_V',
    source: 'EMA Good Pharmacovigilance Practices',
    reference:
      'EMA GVP Module V — Risk Management Systems (Rev 2, 2017); risk ' +
      'minimisation measures feeding the benefit-risk balance',
    year: 2017,
  },
};

export function uncertaintySourceLabel(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Data quality / risk of bias';
    case 'extrapolation':
      return 'Extrapolation beyond studied conditions';
    case 'rare_events':
      return 'Rare serious adverse events (limited exposure)';
    case 'indirect_evidence':
      return 'Indirect / network evidence';
    case 'surrogate_endpoint':
      return 'Surrogate endpoint translation';
    case 'missing_data':
      return 'Missing data / dropout';
    case 'external_validity':
      return 'External validity / generalizability';
    case 'subgroup':
      return 'Subgroup heterogeneity';
    case 'long_term':
      return 'Long-term efficacy and safety';
    case 'comparator':
      return 'Comparator relevance';
    default:
      return 'Uncertainty source';
  }
}

export function uncertaintyDefaultDescription(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Internal validity may be limited by design or conduct issues (randomization, blinding, ascertainment).';
    case 'extrapolation':
      return 'Conclusions are extended beyond the populations, doses, or durations actually studied.';
    case 'rare_events':
      return 'The trial exposure is too small to characterize low-frequency serious harms; absence of evidence is not evidence of absence.';
    case 'indirect_evidence':
      return 'Comparisons rely on indirect or network evidence rather than head-to-head randomized data.';
    case 'surrogate_endpoint':
      return 'Benefit rests on a surrogate whose link to clinical outcomes is incompletely established.';
    case 'missing_data':
      return 'Incomplete follow-up or missing outcomes could bias both efficacy and safety estimates.';
    case 'external_validity':
      return 'The studied population may not represent the real-world indicated population.';
    case 'subgroup':
      return 'The balance may differ across subgroups, and subgroup estimates are imprecise.';
    case 'long_term':
      return 'Durability of benefit and emergence of late harms are not yet characterized.';
    case 'comparator':
      return 'The comparator may not reflect the relevant standard of care, affecting the incremental balance.';
    default:
      return 'An uncertainty affecting the benefit-risk estimate.';
  }
}

export function uncertaintyMitigation(type: UncertaintySourceType): string {
  switch (type) {
    case 'data_quality':
      return 'Sensitivity analyses excluding higher-risk-of-bias data; confirmatory trial if pivotal evidence is affected.';
    case 'extrapolation':
      return 'Restrict the indication/label to the studied conditions, or generate confirmatory data in the extrapolated setting.';
    case 'rare_events':
      return 'Post-authorisation safety study (PASS), registry, and enhanced pharmacovigilance powered for rare events.';
    case 'indirect_evidence':
      return 'Head-to-head randomized comparison or a well-conducted real-world comparative effectiveness study.';
    case 'surrogate_endpoint':
      return 'Confirmatory outcome trial, or post-marketing requirement to verify clinical benefit.';
    case 'missing_data':
      return 'Pre-specified multiple-imputation and tipping-point analyses; minimize loss to follow-up.';
    case 'external_validity':
      return 'Real-world evidence and broader-population studies; pragmatic trial.';
    case 'subgroup':
      return 'Pre-specified subgroup analyses with interaction tests; adequately powered subgroup data.';
    case 'long_term':
      return 'Long-term extension study and post-authorisation safety/efficacy surveillance.';
    case 'comparator':
      return 'Add the current standard-of-care comparator arm or an external comparator with calibration.';
    default:
      return 'Targeted evidence generation to reduce the specific uncertainty.';
  }
}

export function audienceLabel(a: BRAudience): string {
  switch (a) {
    case 'label':
      return 'Product label / prescribing information';
    case 'advisory_committee':
      return 'Advisory committee';
    case 'prescriber':
      return 'Prescribers / healthcare professionals';
    case 'patient':
      return 'Patients and caregivers';
    case 'payer':
      return 'Payers / HTA bodies';
    case 'regulator_internal':
      return 'Internal regulatory review team';
    default:
      return 'Audience';
  }
}

export function audienceFormat(a: BRAudience): string {
  switch (a) {
    case 'label':
      return 'Structured prescribing information per regional template (US PI / EU SmPC).';
    case 'advisory_committee':
      return 'Sponsor briefing document + slide deck with effects table and forest/value-tree visuals.';
    case 'prescriber':
      return 'Concise benefit-risk summary, educational materials, and (where applicable) DHPC.';
    case 'patient':
      return 'Plain-language leaflet / patient information using icon arrays and natural frequencies.';
    case 'payer':
      return 'Value dossier with comparative benefit-risk and subgroup analyses.';
    case 'regulator_internal':
      return 'Assessment report (Module 2.5.6 / EPAR benefit-risk section).';
    default:
      return 'Audience-appropriate format.';
  }
}

export function audienceMustInclude(a: BRAudience): string[] {
  switch (a) {
    case 'label':
      return [
        'Indication and population precisely matching the evidence',
        'Serious risks with frequency and management in Warnings/Precautions',
        'No unsupported comparative or superiority claims',
      ];
    case 'advisory_committee':
      return [
        'Even-handed presentation of favourable and unfavourable evidence',
        'Explicit statement of key uncertainties and what would change the conclusion',
        'The specific questions posed to the committee',
      ];
    case 'prescriber':
      return [
        'Patient-selection guidance',
        'Monitoring and risk-mitigation steps',
        'Absolute (not only relative) effect sizes',
      ];
    case 'patient':
      return [
        'Natural-frequency presentation of benefits and harms',
        'Plain language, no jargon',
        'What to watch for and when to seek care',
      ];
    case 'payer':
      return [
        'Incremental benefit vs relevant comparator',
        'Subgroup / enriched-population analyses',
        'Risk-management and budget implications',
      ];
    case 'regulator_internal':
      return [
        'Complete structured framework with all evidence and uncertainties',
        'Traceable reasoning to the decision',
        'Risk management plan linkage',
      ];
    default:
      return ['Audience-appropriate content'];
  }
}

export function audienceCautions(a: BRAudience): string[] {
  switch (a) {
    case 'label':
      return ['Do not overstate benefit or understate risk', 'Keep claims within the studied evidence'];
    case 'advisory_committee':
      return ['Avoid selective presentation of favourable data', 'Disclose all material uncertainties'];
    case 'prescriber':
      return ['Avoid relative-risk-only framing that exaggerates benefit'];
    case 'patient':
      return ['Avoid technical jargon and relative-risk-only framing', 'Avoid alarming or minimizing language'];
    case 'payer':
      return ['Do not extrapolate beyond the evidenced population'];
    case 'regulator_internal':
      return ['Maintain an auditable, reproducible record'];
    default:
      return [];
  }
}

export interface OrdinalMap {
  readonly [key: string]: number;
}

/** Numeric anchors for magnitude levels (0..1), used for deterministic scoring. */
export const MAGNITUDE_SCORE: OrdinalMap = {
  negligible: 0.05,
  low: 0.25,
  moderate: 0.5,
  high: 0.75,
  very_high: 0.95,
};

/** Numeric anchors for severity levels (0..1). */
export const SEVERITY_SCORE: OrdinalMap = {
  mild: 0.15,
  moderate: 0.4,
  severe: 0.7,
  life_threatening: 0.9,
  fatal: 1.0,
};

/** Numeric anchors for reversibility (multiplier on harm weight). */
export const REVERSIBILITY_MULTIPLIER: OrdinalMap = {
  fully_reversible: 0.6,
  partially_reversible: 0.85,
  irreversible: 1.0,
};

/** Numeric anchors for uncertainty (penalty applied to confidence). */
export const UNCERTAINTY_PENALTY: OrdinalMap = {
  low: 0.05,
  moderate: 0.18,
  high: 0.35,
};

export function magnitudeScore(level: MagnitudeLevel): number {
  const v = MAGNITUDE_SCORE[level];
  return v === undefined ? 0.5 : v;
}

export function severityScore(level: SeverityLevel): number {
  const v = SEVERITY_SCORE[level];
  return v === undefined ? 0.5 : v;
}

export function reversibilityMultiplier(level: ReversibilityLevel): number {
  const v = REVERSIBILITY_MULTIPLIER[level];
  return v === undefined ? 1.0 : v;
}

export function uncertaintyPenalty(level: UncertaintyLevel): number {
  const v = UNCERTAINTY_PENALTY[level];
  return v === undefined ? 0.18 : v;
}

export const CONDITION_SEVERITY_RANK: OrdinalMap = {
  mild: 0.2,
  moderate: 0.45,
  serious: 0.65,
  severe: 0.8,
  life_threatening: 1.0,
};

export function describeConditionSeverity(
  severity: StructureBenefitRiskFrameworkParams['conditionSeverity'],
): string {
  switch (severity) {
    case 'life_threatening':
      return 'life-threatening condition; tolerance for risk and uncertainty is correspondingly higher';
    case 'severe':
      return 'severe condition with substantial impact on survival or daily functioning';
    case 'serious':
      return 'serious condition associated with meaningful morbidity if untreated';
    case 'moderate':
      return 'moderate condition; risk tolerance is calibrated to symptom and functional burden';
    case 'mild':
      return 'mild condition; tolerance for serious risk is low and the safety bar is high';
    default:
      return 'condition severity not specified; risk tolerance cannot be anchored to disease burden';
  }
}

export function describeConditionCourse(
  course: StructureBenefitRiskFrameworkParams['conditionCourse'],
): string {
  switch (course) {
    case 'acute':
      return 'acute course — benefit and risk are evaluated over a short, defined treatment window';
    case 'chronic':
      return 'chronic course — cumulative and long-term risks weigh more heavily because of prolonged exposure';
    case 'progressive':
      return 'progressive course — delay or denial of an effective therapy itself carries a risk of irreversible decline';
    case 'relapsing':
      return 'relapsing course — durability of benefit and risk across repeated treatment cycles is material';
    case 'episodic':
      return 'episodic course — intermittent exposure changes the relevant time-horizon for harms';
    default:
      return 'disease course not specified';
  }
}

export function describeBenefitEndpoint(
  endpoint: KeyBenefitClaim['endpointType'],
): string {
  switch (endpoint) {
    case 'mortality':
      return 'mortality endpoint — the most clinically important category of benefit';
    case 'irreversible_morbidity':
      return 'prevention of irreversible morbidity — high clinical importance';
    case 'function':
      return 'functional endpoint — directly meaningful to how a patient feels and functions';
    case 'symptom':
      return 'symptomatic endpoint — patient-relevant but generally below survival/irreversible-morbidity in the hierarchy';
    case 'surrogate':
      return 'surrogate endpoint — clinical benefit is inferred and carries added uncertainty about translation to outcomes';
    case 'biomarker':
      return 'biomarker endpoint — requires explicit justification that it predicts clinical benefit';
    default:
      return 'endpoint type not specified';
  }
}

export function frequencyToProseFda(freq: KeyRiskItem['frequency']): string {
  switch (freq) {
    case 'very_common':
      return 'very common (≥1/10)';
    case 'common':
      return 'common (≥1/100 to <1/10)';
    case 'uncommon':
      return 'uncommon (≥1/1,000 to <1/100)';
    case 'rare':
      return 'rare (≥1/10,000 to <1/1,000)';
    case 'very_rare':
      return 'very rare (<1/10,000) — typically detectable only post-marketing';
    default:
      return 'frequency not characterized';
  }
}

export function evidenceSourceProse(src: EffectInput['evidenceSource']): string {
  switch (src) {
    case 'pivotal_rct':
      return 'pivotal randomized controlled trial (highest weight)';
    case 'supportive_rct':
      return 'supportive randomized controlled trial';
    case 'meta_analysis':
      return 'meta-analysis of randomized trials';
    case 'observational':
      return 'observational study (residual confounding possible)';
    case 'indirect':
      return 'indirect/network comparison (added uncertainty)';
    case 'modeling':
      return 'modeling or simulation (extrapolation beyond observed data)';
    default:
      return 'evidence source not specified';
  }
}

/** Map an evidence source to a baseline uncertainty floor. */
export function evidenceSourceUncertaintyFloor(src: EffectInput['evidenceSource']): UncertaintyLevel {
  switch (src) {
    case 'pivotal_rct':
    case 'meta_analysis':
      return 'low';
    case 'supportive_rct':
      return 'moderate';
    case 'observational':
    case 'indirect':
    case 'modeling':
      return 'high';
    default:
      return 'moderate';
  }
}

/** Default importance weight by benefit endpoint type (clinical hierarchy). */
export function defaultBenefitWeight(endpoint: KeyBenefitClaim['endpointType']): number {
  switch (endpoint) {
    case 'mortality':
      return 1.0;
    case 'irreversible_morbidity':
      return 0.9;
    case 'function':
      return 0.75;
    case 'symptom':
      return 0.6;
    case 'surrogate':
      return 0.45;
    case 'biomarker':
      return 0.35;
    default:
      return 0.6;
  }
}

/** Default importance weight by risk frequency (more common → more weight). */
export function defaultRiskFrequencyWeight(freq: KeyRiskItem['frequency']): number {
  switch (freq) {
    case 'very_common':
      return 1.0;
    case 'common':
      return 0.8;
    case 'uncommon':
      return 0.55;
    case 'rare':
      return 0.4;
    case 'very_rare':
      return 0.3;
    default:
      return 0.6;
  }
}

export function weightingGuidanceText(
  approach: 'qualitative' | 'swing_weighting' | 'mcda',
): string {
  switch (approach) {
    case 'qualitative':
      return (
        'Qualitative weighting: criteria are ranked and discussed without numerical weights. ' +
        'Appropriate for an initial structured assessment or when stakeholders are unwilling to ' +
        'commit to numeric trade-offs. Transparent but does not yield a single integrated score.'
      );
    case 'swing_weighting':
      return (
        'Swing weighting: stakeholders rank the "swing" from worst to best on each criterion, assign ' +
        '100 points to the most important swing, and score the rest relative to it; weights are then ' +
        'normalized to sum to 1. This captures both the importance of a criterion and the range of ' +
        'outcomes on it, and is the recommended elicitation method for MCDA value trees.'
      );
    case 'mcda':
      return (
        'Multi-criteria decision analysis (MCDA): each alternative is scored on every criterion, scores ' +
        'are combined with normalized swing weights into a single weighted value, and sensitivity analysis ' +
        'tests robustness to the weights. Yields a fully quantitative, auditable benefit-risk score but ' +
        'requires defensible value functions and weight elicitation.'
      );
    default:
      return 'Weighting approach not specified.';
  }
}

export function audienceFraming(a: BRAudience, patientData: boolean): string {
  switch (a) {
    case 'label':
      return (
        'Frame the balance through the indication, Warnings/Precautions, and Adverse Reactions sections; ' +
        'state benefit precisely in terms of the studied endpoint and population, and present risks at the ' +
        'frequency and severity supported by the data. Avoid promotional or comparative claims not supported by adequate evidence.'
      );
    case 'advisory_committee':
      return (
        'Frame as a transparent, structured benefit-risk story: analysis of condition and unmet need, the ' +
        'magnitude and certainty of benefit, the seriousness and manageability of risk, key uncertainties, and ' +
        'the specific questions on which the committee\'s advice is sought. Present both favourable and ' +
        'unfavourable evidence even-handedly.'
      );
    case 'prescriber':
      return (
        'Frame around the clinical decision: which patients benefit most, what to monitor, how to manage and ' +
        'mitigate the principal risks, and how the product compares to alternatives in practice.'
      );
    case 'patient':
      return (
        'Frame in plain language around what the treatment can do, what it cannot do, the chance and ' +
        'seriousness of common and serious harms, and what to watch for — using absolute frequencies (natural ' +
        'frequencies, e.g. "x in 1,000") rather than relative risks.' +
        (patientData
          ? ' Incorporate patient-experience/PFDD data on which outcomes patients value most.'
          : '')
      );
    case 'payer':
      return (
        'Frame around incremental benefit versus the relevant comparator, the population in whom benefit is ' +
        'greatest, and the budget/risk-management implications; align with the HTA evidence requirements.'
      );
    case 'regulator_internal':
      return (
        'Frame using the full structured framework (FDA grid or EMA effects table plus PrOACT-URL), with all ' +
        'evidence, uncertainties, and the integrated reasoning documented for the administrative record.'
      );
    default:
      return 'Frame the benefit-risk balance appropriately for the audience.';
  }
}

export function uncertaintyImpactProse(
  affects: ResolvedUncertaintySource['affects'],
  level: UncertaintyLevel | 'not_stated',
): string {
  if (affects === 'not_stated') {
    return 'The affected side of the balance was not stated, so the impact on benefit or risk was not assessed.';
  }
  const side =
    affects === 'benefit'
      ? 'reduces confidence in the demonstrated benefit'
      : affects === 'risk'
        ? 'reduces confidence in the characterized risk (harms may be under- or over-stated)'
        : 'reduces confidence in both benefit and risk estimates';
  if (level === 'not_stated') {
    return `This ${side}; its level was not stated, so its impact on the balance is not graded.`;
  }
  const strength =
    level === 'high'
      ? 'materially — potentially decisive for a narrowly balanced conclusion'
      : level === 'moderate'
        ? 'moderately — relevant where the net margin is small'
        : 'modestly — unlikely to overturn a clear conclusion';
  return `This ${side}; impact is judged ${strength}.`;
}

/** Derive an ordinal magnitude from a numeric absolute difference, normalized. */
export function deriveMagnitude(effect: EffectInput): MagnitudeLevel {
  if (effect.magnitude) return effect.magnitude;
  if (effect.treatmentValue !== undefined && effect.controlValue !== undefined) {
    const base = Math.abs(effect.controlValue) > 1e-9 ? Math.abs(effect.controlValue) : 1;
    const rel = Math.abs(effect.treatmentValue - effect.controlValue) / base;
    if (rel >= 0.5) return 'very_high';
    if (rel >= 0.25) return 'high';
    if (rel >= 0.1) return 'moderate';
    if (rel >= 0.03) return 'low';
    return 'negligible';
  }
  return 'moderate';
}

/** Combine the worse (higher) of two uncertainty levels. */
export function worseUncertainty(a: UncertaintyLevel, b: UncertaintyLevel): UncertaintyLevel {
  const rank: OrdinalMap = { low: 0, moderate: 1, high: 2 };
  const inv: UncertaintyLevel[] = ['low', 'moderate', 'high'];
  const r = Math.max(rank[a] ?? 1, rank[b] ?? 1);
  return inv[r] ?? 'moderate';
}
