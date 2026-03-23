/**
 * Module 3 — Endpoint / Method Defensibility Judgment
 *
 * Evaluates whether the chosen endpoint-method pairing is appropriate,
 * acceptable with caveats, vulnerable, or poorly matched.
 *
 * Rule-backed classification using endpoint type, study objective,
 * and method fit heuristics.
 *
 * @module server/services/biostatistics-judgment/endpoint-method-defensibility
 */

import type { StudyDesignInput, EndpointMethodDefensibility, DefensibilityRating } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// METHOD FIT MATRICES
// ═══════════════════════════════════════════════════════════════════════════════

type EndpointType = StudyDesignInput['endpointType'];

/**
 * Maps endpoint types to appropriate statistical methods.
 * Each entry: method name → fit level.
 */
const METHOD_FIT_MATRIX: Record<EndpointType, Record<string, 'optimal' | 'acceptable' | 'suboptimal' | 'inappropriate'>> = {
  continuous: {
    't-test': 'optimal',
    't_test': 'optimal',
    'ttest': 'optimal',
    'anova': 'optimal',
    'ancova': 'optimal',
    'linear_regression': 'optimal',
    'mixed_model': 'optimal',
    'mmrm': 'optimal',
    'wilcoxon': 'acceptable',
    'mann_whitney': 'acceptable',
    'rank_test': 'acceptable',
    'chi_square': 'inappropriate',
    'log_rank': 'inappropriate',
    'cox_regression': 'inappropriate',
    'kaplan_meier': 'inappropriate',
    'logistic_regression': 'suboptimal',
    'fisher_exact': 'inappropriate',
  },
  binary: {
    'chi_square': 'optimal',
    'fisher_exact': 'optimal',
    'logistic_regression': 'optimal',
    'cmh': 'optimal',
    'cochran_mantel_haenszel': 'optimal',
    'proportion_test': 'optimal',
    't-test': 'inappropriate',
    't_test': 'inappropriate',
    'anova': 'inappropriate',
    'ancova': 'suboptimal',
    'cox_regression': 'inappropriate',
    'log_rank': 'inappropriate',
    'kaplan_meier': 'inappropriate',
    'mixed_model': 'suboptimal',
    'mmrm': 'suboptimal',
  },
  time_to_event: {
    'log_rank': 'optimal',
    'cox_regression': 'optimal',
    'kaplan_meier': 'optimal',
    'weibull': 'acceptable',
    'accelerated_failure_time': 'acceptable',
    'landmark_analysis': 'acceptable',
    'restricted_mean_survival': 'acceptable',
    'rmst': 'acceptable',
    't-test': 'inappropriate',
    't_test': 'inappropriate',
    'chi_square': 'suboptimal',
    'logistic_regression': 'suboptimal',
    'anova': 'inappropriate',
    'fisher_exact': 'inappropriate',
  },
  ordinal: {
    'proportional_odds': 'optimal',
    'wilcoxon': 'optimal',
    'mann_whitney': 'optimal',
    'rank_test': 'optimal',
    'cmh': 'acceptable',
    'cochran_mantel_haenszel': 'acceptable',
    't-test': 'suboptimal',
    't_test': 'suboptimal',
    'chi_square': 'acceptable',
    'logistic_regression': 'acceptable',
    'anova': 'suboptimal',
  },
  count: {
    'poisson_regression': 'optimal',
    'negative_binomial': 'optimal',
    'quasi_poisson': 'acceptable',
    't-test': 'suboptimal',
    't_test': 'suboptimal',
    'wilcoxon': 'acceptable',
    'mann_whitney': 'acceptable',
    'chi_square': 'suboptimal',
    'anova': 'suboptimal',
  },
  composite: {
    'chi_square': 'acceptable',
    'logistic_regression': 'acceptable',
    'log_rank': 'acceptable',
    'cox_regression': 'acceptable',
    'win_ratio': 'optimal',
    'desirability_of_outcome': 'optimal',
    'hierarchical_testing': 'acceptable',
    't-test': 'suboptimal',
    't_test': 'suboptimal',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY TYPE / ENDPOINT PAIRING RULES
// ═══════════════════════════════════════════════════════════════════════════════

interface PairingRule {
  condition: (input: StudyDesignInput) => boolean;
  caveat?: string;
  limitation?: string;
  regulatory?: string;
}

const PAIRING_RULES: PairingRule[] = [
  {
    condition: (i) => i.studyType === 'non_inferiority' && i.endpointType === 'composite',
    caveat: 'Non-inferiority with composite endpoints is complex — ensure the margin is defined for the composite, not individual components.',
    regulatory: 'FDA has flagged non-inferiority trials with composite endpoints for unclear margin interpretation.',
  },
  {
    condition: (i) => i.studyType === 'non_inferiority' && !i.nonInferiorityMargin,
    limitation: 'Non-inferiority margin is not specified — this is a critical design parameter.',
    regulatory: 'Regulatory agencies require justification of the non-inferiority margin based on historical data.',
  },
  {
    condition: (i) => i.studyType === 'equivalence' && i.endpointType === 'time_to_event',
    caveat: 'Equivalence testing with time-to-event endpoints is uncommon and requires careful margin definition.',
  },
  {
    condition: (i) => i.phase === 'III' && i.endpointType === 'ordinal' && !i.statisticalMethod.includes('proportional'),
    caveat: 'Phase III ordinal endpoints should typically use proportional odds or stratified methods for regulatory acceptability.',
  },
  {
    condition: (i) => i.adaptiveDesign === true && i.studyType === 'non_inferiority',
    limitation: 'Adaptive designs combined with non-inferiority testing raise type I error control concerns.',
    regulatory: 'Pre-specify adaptation rules and demonstrate type I error control under all adaptation paths.',
  },
  {
    condition: (i) => i.endpointType === 'binary' && i.studyType === 'single_arm',
    caveat: 'Single-arm trials with binary endpoints require careful selection of historical control rates.',
    regulatory: 'Regulatory reviewers will scrutinize the choice of historical response rate and its source.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DEFENSIBILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export function judgeEndpointMethodDefensibility(input: StudyDesignInput): EndpointMethodDefensibility {
  const caveats: string[] = [];
  const limitations: string[] = [];
  const regulatoryConsiderations: string[] = [];

  // Normalize method name for lookup
  const normalizedMethod = normalizeMethod(input.statisticalMethod);

  // 1. Assess endpoint alone
  const endpointAssessment = assessEndpoint(input);

  // 2. Assess method fit
  const fitMatrix = METHOD_FIT_MATRIX[input.endpointType] || {};
  const methodFit = fitMatrix[normalizedMethod] ?? 'suboptimal';
  const methodAssessment = buildMethodAssessment(input.statisticalMethod, methodFit, input.endpointType);

  // 3. Assess pairing
  const pairingAssessment = buildPairingAssessment(methodFit, input);

  // 4. Apply pairing rules
  for (const rule of PAIRING_RULES) {
    if (rule.condition(input)) {
      if (rule.caveat) caveats.push(rule.caveat);
      if (rule.limitation) limitations.push(rule.limitation);
      if (rule.regulatory) regulatoryConsiderations.push(rule.regulatory);
    }
  }

  // 5. Determine overall rating
  let rating: DefensibilityRating;
  if (methodFit === 'inappropriate') {
    rating = 'poorly_matched';
    limitations.push(`${input.statisticalMethod} is not an appropriate method for ${input.endpointType} endpoints.`);
  } else if (methodFit === 'suboptimal') {
    rating = 'vulnerable';
    caveats.push(`${input.statisticalMethod} is suboptimal for ${input.endpointType} endpoints — consider alternatives.`);
  } else if (methodFit === 'acceptable' || caveats.length > 0 || limitations.length > 0) {
    rating = 'acceptable_with_caveats';
  } else {
    rating = 'appropriate';
  }

  // Downgrade if study-level concerns exist
  if (limitations.length >= 2 && rating === 'acceptable_with_caveats') {
    rating = 'vulnerable';
  }

  // Add generic regulatory considerations based on phase
  if (input.phase === 'III') {
    regulatoryConsiderations.push('Phase III pivotal trial — method choice will receive heightened regulatory scrutiny.');
  }
  if (input.interimAnalyses && input.interimAnalyses > 0 && !input.multiplicityAdjustment) {
    regulatoryConsiderations.push('Interim analyses present without multiplicity adjustment — alpha spending must be addressed.');
    if (rating === 'appropriate') rating = 'acceptable_with_caveats';
    caveats.push('Interim analyses require alpha-spending function (e.g., O\'Brien-Fleming, Lan-DeMets).');
  }

  return {
    rating,
    endpointAssessment,
    methodAssessment,
    pairingAssessment,
    caveats,
    limitations,
    regulatoryConsiderations,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeMethod(method: string): string {
  return method.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function assessEndpoint(input: StudyDesignInput): string {
  const type = input.endpointType;
  const study = input.studyType;

  const descriptions: Record<EndpointType, string> = {
    continuous: 'Continuous endpoint — well-suited for parametric analysis with adequate sample sizes.',
    binary: 'Binary endpoint — straightforward for proportion comparisons, sample size driven by event rates.',
    time_to_event: 'Time-to-event endpoint — standard for survival/durability analyses, requires adequate follow-up.',
    ordinal: 'Ordinal endpoint — requires appropriate methods that preserve ordering information.',
    count: 'Count endpoint — consider overdispersion and appropriate regression models.',
    composite: 'Composite endpoint — regulatory scrutiny on component contributions and clinical meaningfulness.',
  };

  return descriptions[type] || `${type} endpoint — ensure method compatibility.`;
}

function buildMethodAssessment(method: string, fit: string, endpointType: string): string {
  switch (fit) {
    case 'optimal':
      return `${method} is an optimal choice for ${endpointType} endpoints.`;
    case 'acceptable':
      return `${method} is acceptable for ${endpointType} endpoints, though alternatives may provide more power or precision.`;
    case 'suboptimal':
      return `${method} is suboptimal for ${endpointType} endpoints — consider using methods specifically designed for this endpoint type.`;
    case 'inappropriate':
      return `${method} is inappropriate for ${endpointType} endpoints — this pairing will likely be rejected by reviewers.`;
    default:
      return `${method} fit for ${endpointType} endpoints could not be automatically assessed.`;
  }
}

function buildPairingAssessment(fit: string, input: StudyDesignInput): string {
  const base = `${input.statisticalMethod} applied to ${input.endpointType} endpoint in a ${input.studyType} ${input.phase} trial`;

  switch (fit) {
    case 'optimal':
      return `${base}: this is a well-established, defensible pairing.`;
    case 'acceptable':
      return `${base}: this pairing is defensible with appropriate justification.`;
    case 'suboptimal':
      return `${base}: this pairing may be questioned by reviewers — provide strong justification.`;
    case 'inappropriate':
      return `${base}: this pairing has a fundamental mismatch between method assumptions and endpoint characteristics.`;
    default:
      return `${base}: defensibility could not be fully assessed — manual review recommended.`;
  }
}
