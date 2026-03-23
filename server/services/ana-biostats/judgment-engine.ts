/**
 * AnA Biostats — Layer 3: Biostatistical Judgment Engine
 *
 * Rule-backed judgment modules on top of deterministic results.
 * No LLM involvement — all judgments are typed, reproducible, and reusable.
 * Feeds both AnA explanations and governed documents.
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  JudgmentVerdict,
  RiskLevel,
  ActionRecommendation,
  ConfidenceLevel,
  JudgmentDimension,
  FragilityAssessment,
  EndpointMethodFit,
  RoleExplanations,
} from './types';

export class JudgmentEngine {

  judge(input: StatisticalInput, computation: ComputationResult): JudgmentResult {
    const dimensions = this.assessAllDimensions(input, computation);
    const fragility = this.assessFragility(input, computation);
    const endpointMethodFit = this.assessEndpointMethodFit(input, computation);
    const confidence = this.assessConfidence(input, computation, dimensions);

    const overallVerdict = this.deriveOverallVerdict(dimensions);
    const overallRisk = this.deriveOverallRisk(dimensions, fragility);
    const actionRecommendation = this.deriveAction(overallVerdict, overallRisk, confidence);
    const escalationReasons = this.collectEscalationReasons(dimensions, fragility, confidence);
    const roleExplanations = this.generateRoleExplanations(input, computation, overallVerdict, actionRecommendation, fragility);

    return {
      overallVerdict,
      overallRisk,
      actionRecommendation,
      confidence,
      dimensions,
      fragility,
      endpointMethodFit,
      escalationReasons,
      roleExplanations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Dimension assessments
  // ════════════════════════════════════════════════════════════════

  private assessAllDimensions(input: StatisticalInput, comp: ComputationResult): JudgmentDimension[] {
    return [
      this.assessPowerAdequacy(input, comp),
      this.assessSampleSizeAdequacy(input, comp),
      this.assessAssumptionQuality(input, comp),
      this.assessDesignAppropriateness(input, comp),
      this.assessAttritionRisk(input, comp),
      this.assessOverinterpretationRisk(input, comp),
    ];
  }

  private assessPowerAdequacy(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const power = comp.power;
    let verdict: JudgmentVerdict;
    let score: number;
    const flags: string[] = [];

    if (power >= 0.90) {
      verdict = 'adequate'; score = 95;
    } else if (power >= 0.80) {
      verdict = 'adequate'; score = 80;
    } else if (power >= 0.70) {
      verdict = 'marginal'; score = 55;
      flags.push('Power below 80% — may draw regulatory scrutiny');
    } else if (power >= 0.50) {
      verdict = 'inadequate'; score = 30;
      flags.push('Power below 70% — study likely underpowered');
      flags.push('Consider increasing sample size or effect size assumption');
    } else {
      verdict = 'inadequate'; score = 10;
      flags.push('Power critically low — study would be futile at this sample size');
    }

    // Phase-specific calibration
    if (input.phase === 'III' && power < 0.80) {
      flags.push('Phase III confirmatory trial with <80% power is a significant regulatory risk');
      score = Math.min(score, 25);
      verdict = 'inadequate';
    }

    return {
      name: 'Power Adequacy',
      verdict,
      score,
      rationale: `Achieved power: ${(power * 100).toFixed(1)}%. ${power >= 0.80 ? 'Meets standard regulatory threshold.' : 'Below standard 80% threshold.'}`,
      flags,
    };
  }

  private assessSampleSizeAdequacy(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 80;
    let verdict: JudgmentVerdict = 'adequate';

    // Check if sample size seems too small for the context
    if (comp.sampleSize.total < 20) {
      verdict = 'marginal';
      score = 40;
      flags.push('Very small sample size — statistical validity may be limited');
    }

    // Check if attrition adjustment is significant
    if (input.attritionRate > 0.20 && comp.adjustedTotal) {
      const overhead = comp.adjustedTotal - comp.sampleSize.total;
      const overheadPct = (overhead / comp.sampleSize.total) * 100;
      if (overheadPct > 30) {
        flags.push(`Attrition adjustment adds ${overheadPct.toFixed(0)}% overhead — high dropout may signal feasibility concerns`);
        score -= 15;
      }
    }

    // Phase III confirmatory considerations
    if (input.phase === 'III' && comp.sampleSize.total < 100) {
      flags.push('Phase III with <100 total subjects is unusual — verify regulatory alignment');
      score -= 20;
      verdict = 'marginal';
    }

    // Device single-arm considerations
    if (input.clientTrack === 'medical_device' && input.studyType === 'performance' && comp.sampleSize.total < 50) {
      flags.push('Device performance study with <50 subjects may face FDA scrutiny');
    }

    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Sample Size Adequacy',
      verdict,
      score,
      rationale: `Total N=${comp.sampleSize.total} (${comp.adjustedTotal ?? comp.sampleSize.total} after attrition adjustment). ${comp.sampleSize.groups} groups with ${comp.sampleSize.perGroup} per group.`,
      flags,
    };
  }

  private assessAssumptionQuality(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;

    const highSensitivity = comp.assumptions.filter(a => a.sensitivity === 'high');
    const defaulted = comp.assumptions.filter(a => a.source === 'default');

    if (highSensitivity.length > 3) {
      score -= 10;
      flags.push(`${highSensitivity.length} high-sensitivity assumptions — results are fragile to input changes`);
    }

    if (defaulted.length > 2) {
      score -= 15;
      flags.push(`${defaulted.length} parameters used default values — user should verify these match the actual study context`);
    }

    // Effect size plausibility
    if (input.endpointType === 'continuous' && input.effectSize > 1.0) {
      flags.push('Large effect size assumed — verify with literature or pilot data');
      score -= 10;
    }

    if (input.endpointType === 'binary') {
      const diff = Math.abs((input.treatmentRate ?? 0) - (input.controlRate ?? 0));
      if (diff > 0.30) {
        flags.push(`Treatment difference of ${(diff * 100).toFixed(0)}% is large — ensure this is clinically plausible`);
        score -= 10;
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Assumption Quality',
      verdict,
      score,
      rationale: `${comp.assumptions.length} assumptions evaluated. ${highSensitivity.length} are high-sensitivity, ${defaulted.length} used defaults.`,
      flags,
    };
  }

  private assessDesignAppropriateness(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;

    // Check study type / endpoint coherence
    if (input.endpointType === 'time_to_event' && input.studyType === 'equivalence') {
      flags.push('Equivalence testing for time-to-event endpoints is methodologically complex — ensure proper justification');
      score -= 10;
    }

    if (input.clientTrack === 'diagnostics_ivd' && input.studyType === 'superiority') {
      flags.push('Superiority design is unusual for diagnostic studies — consider diagnostic accuracy or agreement designs');
      score -= 15;
    }

    if (input.studyType === 'adaptive' && !input.interimAnalyses) {
      flags.push('Adaptive design specified but no interim analyses defined');
      score -= 20;
    }

    if (input.studyType === 'non_inferiority' && !input.nonInferiorityMargin) {
      flags.push('Non-inferiority design without a defined margin — this is a critical gap');
      score -= 30;
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Design Appropriateness',
      verdict,
      score,
      rationale: `${input.studyType} design with ${input.endpointType} endpoint for ${input.clientTrack} track.`,
      flags,
    };
  }

  private assessAttritionRisk(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 90;

    if (input.attritionRate > 0.30) {
      score = 40;
      flags.push('Attrition >30% — feasibility at serious risk, consider retention strategies');
    } else if (input.attritionRate > 0.20) {
      score = 60;
      flags.push('Attrition 20-30% — above typical range, ensure dropout assumptions are evidence-based');
    } else if (input.attritionRate > 0.15) {
      score = 75;
      flags.push('Attrition 15-20% — within acceptable range but monitor closely');
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Attrition Sensitivity',
      verdict,
      score,
      rationale: `Assumed dropout rate: ${(input.attritionRate * 100).toFixed(0)}%. Adjusted total: ${comp.adjustedTotal ?? 'N/A'}.`,
      flags,
    };
  }

  private assessOverinterpretationRisk(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 90;

    // Single-arm studies
    if (input.studyType === 'single_arm') {
      score -= 15;
      flags.push('Single-arm design limits causal inference — results should be interpreted with caution');
    }

    // Small sample + many endpoints
    if (comp.sampleSize.total < 50 && input.objectiveType !== 'dose_finding') {
      score -= 10;
      flags.push('Small sample size increases risk of overinterpreting results');
    }

    // Optimistic effect size
    if (comp.scenarios && comp.scenarios.length > 0) {
      const conservative = comp.scenarios.find(s => s.label.includes('Conservative'));
      if (conservative && conservative.sampleSize.total > comp.sampleSize.total * 1.5) {
        flags.push('Conservative scenario requires >50% more subjects — base case may be optimistic');
        score -= 10;
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Overinterpretation Risk',
      verdict,
      score,
      rationale: `Study type: ${input.studyType}. Design complexity and sample size considered.`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Fragility assessment
  // ════════════════════════════════════════════════════════════════

  assessFragility(input: StatisticalInput, comp: ComputationResult): FragilityAssessment {
    const sensitiveParams: FragilityAssessment['sensitiveParameters'] = [];

    // Effect size sensitivity: at what effect size does power drop below 80%?
    const baseEffect = input.effectSize;
    let breakpointEffect = baseEffect;
    for (let mult = 0.95; mult > 0.3; mult -= 0.05) {
      const testEffect = baseEffect * mult;
      // Rough power estimate: power scales with effect^2 / n
      const approxPower = 1 - this.normCdf(this.normQuantile(1 - input.alpha / 2) - testEffect / baseEffect * this.normQuantile(input.powerTarget));
      if (approxPower < 0.80) {
        breakpointEffect = testEffect;
        break;
      }
    }
    if (breakpointEffect < baseEffect) {
      sensitiveParams.push({
        parameter: 'effect_size',
        currentValue: baseEffect,
        breakpointValue: Number(breakpointEffect.toFixed(4)),
        percentMargin: Number(((1 - breakpointEffect / baseEffect) * 100).toFixed(1)),
      });
    }

    // Attrition sensitivity
    const maxAttrition = 1 - comp.sampleSize.total / (comp.adjustedTotal ?? comp.sampleSize.total + 1);
    if (input.attritionRate > 0) {
      sensitiveParams.push({
        parameter: 'attrition_rate',
        currentValue: input.attritionRate,
        breakpointValue: Math.min(input.attritionRate * 1.5, 0.50),
        percentMargin: 50,
      });
    }

    // Compute fragility index
    let fragilityIndex = 0;
    if (comp.power < 0.85) fragilityIndex += 20;
    if (comp.power < 0.80) fragilityIndex += 20;
    if (sensitiveParams.length > 0 && sensitiveParams[0].percentMargin < 20) fragilityIndex += 25;
    if (input.attritionRate > 0.20) fragilityIndex += 15;
    if (comp.sampleSize.total < 50) fragilityIndex += 10;
    const defaultCount = comp.assumptions.filter(a => a.source === 'default').length;
    fragilityIndex += defaultCount * 5;
    fragilityIndex = Math.min(fragilityIndex, 100);

    let category: FragilityAssessment['category'];
    if (fragilityIndex <= 20) category = 'robust';
    else if (fragilityIndex <= 40) category = 'moderate';
    else if (fragilityIndex <= 65) category = 'fragile';
    else category = 'very_fragile';

    const narrative = this.buildFragilityNarrative(category, sensitiveParams, comp);

    return { fragilityIndex, category, sensitiveParameters: sensitiveParams, narrative };
  }

  private normCdf(z: number): number {
    if (z < -8) return 0;
    if (z > 8) return 1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  private normQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    // Beasley-Springer-Moro approximation
    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425;
    if (p < pLow) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
    } else if (p <= 1 - pLow) {
      const q = p - 0.5, r = q * q;
      return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q / (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
    } else {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
    }
  }

  private buildFragilityNarrative(
    category: FragilityAssessment['category'],
    params: FragilityAssessment['sensitiveParameters'],
    comp: ComputationResult
  ): string {
    switch (category) {
      case 'robust':
        return `The design is robust. Power of ${(comp.power * 100).toFixed(1)}% provides adequate margin, and assumptions are well-supported.`;
      case 'moderate':
        return `The design is moderately sensitive to assumptions. ${params.length > 0 ? `Key parameter(s) have ${params[0].percentMargin.toFixed(0)}% margin before power drops below threshold.` : ''} Consider sensitivity analyses in the SAP.`;
      case 'fragile':
        return `The design is fragile. Small changes in assumptions (especially ${params.map(p => p.parameter).join(', ')}) could undermine study conclusions. Strongly recommend formal sensitivity analysis and contingency planning.`;
      case 'very_fragile':
        return `The design is very fragile and should be revisited. Multiple assumptions are at or near breakpoints. The study risks being underpowered under realistic scenario variations. Recommend revising assumptions or increasing sample size before proceeding.`;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Endpoint-Method fit assessment
  // ════════════════════════════════════════════════════════════════

  assessEndpointMethodFit(input: StatisticalInput, comp: ComputationResult): EndpointMethodFit {
    const suggested = this.suggestMethod(input);
    const current = comp.method;

    // Check if current method aligns with suggested
    const suggestedLower = suggested.toLowerCase();
    const currentLower = current.toLowerCase();

    let fit: EndpointMethodFit['fit'];
    if (currentLower.includes(suggestedLower.split(' ')[0])) {
      fit = 'strong';
    } else if (this.areMethodsCompatible(currentLower, suggestedLower)) {
      fit = 'acceptable';
    } else {
      fit = 'weak';
    }

    return {
      fit,
      suggestedMethod: suggested,
      currentMethod: current,
      rationale: this.methodFitRationale(input, fit),
      alternatives: this.getAlternativeMethods(input),
    };
  }

  private suggestMethod(input: StatisticalInput): string {
    if (input.clientTrack === 'diagnostics_ivd') {
      switch (input.endpointType) {
        case 'sensitivity_specificity': return 'Exact binomial confidence interval';
        case 'agreement': return 'Cohen\'s kappa / Fleiss\' kappa';
        case 'auc_roc': return 'DeLong\'s test for AUC comparison';
        default: return 'Diagnostic accuracy analysis';
      }
    }

    switch (input.endpointType) {
      case 'continuous':
        if (input.studyType === 'non_inferiority') return 'Two-sample t-test (non-inferiority)';
        if (input.studyType === 'equivalence') return 'TOST equivalence test';
        if ((input.numberOfGroups ?? 2) > 2) return 'ANOVA with post-hoc tests';
        return 'Two-sample t-test';
      case 'binary':
        if (input.studyType === 'non_inferiority') return 'Two-proportion z-test (non-inferiority)';
        if (input.studyType === 'single_arm') return 'Exact binomial test';
        return 'Chi-squared test / Fisher\'s exact test';
      case 'time_to_event':
        return 'Log-rank test with Cox proportional hazards';
      case 'ordinal':
        return 'Wilcoxon rank-sum test / proportional odds model';
      case 'count':
        return 'Poisson regression / negative binomial regression';
      case 'composite':
        return 'Win ratio / component-wise testing';
      default:
        return 'Two-sample t-test';
    }
  }

  private areMethodsCompatible(a: string, b: string): boolean {
    const groups = [
      ['t-test', 'anova', 'ancova', 'mixed model'],
      ['z-test', 'chi-squared', 'fisher', 'logistic'],
      ['log-rank', 'cox', 'kaplan-meier', 'survival'],
      ['wilcoxon', 'mann-whitney', 'rank-sum', 'kruskal'],
      ['binomial', 'clopper-pearson', 'exact'],
    ];
    for (const group of groups) {
      const aMatch = group.some(m => a.includes(m));
      const bMatch = group.some(m => b.includes(m));
      if (aMatch && bMatch) return true;
    }
    return false;
  }

  private methodFitRationale(input: StatisticalInput, fit: EndpointMethodFit['fit']): string {
    switch (fit) {
      case 'strong': return `The statistical method is well-matched to the ${input.endpointType} endpoint and ${input.studyType} design.`;
      case 'acceptable': return `The method is acceptable but a more specific approach may improve precision for ${input.endpointType} endpoints.`;
      case 'weak': return `The current method may not be optimal for ${input.endpointType} endpoints in a ${input.studyType} design. Consider alternatives.`;
      case 'mismatch': return `The method does not align with the endpoint type. This could be flagged in regulatory review.`;
    }
  }

  private getAlternativeMethods(input: StatisticalInput): string[] {
    const alts: string[] = [];
    switch (input.endpointType) {
      case 'continuous':
        alts.push('ANCOVA with baseline adjustment', 'Mixed-effects model for repeated measures (MMRM)', 'Bayesian adaptive design');
        break;
      case 'binary':
        alts.push('Logistic regression', 'Mantel-Haenszel stratified test', 'Exact conditional test');
        break;
      case 'time_to_event':
        alts.push('Restricted mean survival time (RMST)', 'Weighted log-rank test', 'Accelerated failure time model');
        break;
    }
    return alts;
  }

  // ════════════════════════════════════════════════════════════════
  // Overall derivation
  // ════════════════════════════════════════════════════════════════

  private deriveOverallVerdict(dimensions: JudgmentDimension[]): JudgmentVerdict {
    const scores = dimensions.map(d => d.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const hasCritical = dimensions.some(d => d.verdict === 'inadequate');

    if (hasCritical) return 'inadequate';
    if (avg >= 80) return 'adequate';
    if (avg >= 60) return 'marginal';
    return 'inadequate';
  }

  private deriveOverallRisk(dimensions: JudgmentDimension[], fragility: FragilityAssessment): RiskLevel {
    const inadequateCount = dimensions.filter(d => d.verdict === 'inadequate').length;
    const marginalCount = dimensions.filter(d => d.verdict === 'marginal').length;

    if (inadequateCount >= 2 || fragility.category === 'very_fragile') return 'critical';
    if (inadequateCount >= 1 || fragility.category === 'fragile') return 'high';
    if (marginalCount >= 2 || fragility.category === 'moderate') return 'moderate';
    return 'low';
  }

  private deriveAction(verdict: JudgmentVerdict, risk: RiskLevel, confidence: ConfidenceLevel): ActionRecommendation {
    if (verdict === 'inadequate' || risk === 'critical') return 'escalate';
    if (verdict === 'marginal' || risk === 'high') return 'revise';
    if (confidence.level === 'low' || confidence.level === 'very_low') return 'proceed_with_conditions';
    return 'proceed';
  }

  private assessConfidence(input: StatisticalInput, comp: ComputationResult, dimensions: JudgmentDimension[]): ConfidenceLevel {
    const factors: string[] = [];
    const limitations: string[] = [];
    let score = 85;

    // Power-based confidence
    if (comp.power >= 0.90) {
      factors.push('High power (≥90%)');
    } else if (comp.power >= 0.80) {
      factors.push('Standard power (≥80%)');
    } else {
      limitations.push(`Power below standard threshold (${(comp.power * 100).toFixed(1)}%)`);
      score -= 20;
    }

    // Assumption quality
    const defaults = comp.assumptions.filter(a => a.source === 'default').length;
    if (defaults > 2) {
      limitations.push(`${defaults} parameters used default values`);
      score -= defaults * 5;
    } else {
      factors.push('Most parameters user-specified');
    }

    // Design appropriateness
    const designScore = dimensions.find(d => d.name === 'Design Appropriateness')?.score ?? 80;
    if (designScore < 70) {
      limitations.push('Design appropriateness concerns');
      score -= 10;
    }

    // Track-specific caveats
    if (input.clientTrack === 'diagnostics_ivd' && !input.prevalence) {
      limitations.push('Prevalence not specified — PPV/NPV are estimates');
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));
    let level: ConfidenceLevel['level'];
    if (score >= 80) level = 'high';
    else if (score >= 60) level = 'moderate';
    else if (score >= 40) level = 'low';
    else level = 'very_low';

    return { level, score, factors, limitations };
  }

  private collectEscalationReasons(dimensions: JudgmentDimension[], fragility: FragilityAssessment, confidence: ConfidenceLevel): string[] {
    const reasons: string[] = [];

    for (const dim of dimensions) {
      if (dim.verdict === 'inadequate') {
        reasons.push(`${dim.name}: ${dim.flags[0] || dim.rationale}`);
      }
    }

    if (fragility.category === 'very_fragile') {
      reasons.push(`Design fragility: ${fragility.narrative}`);
    }

    if (confidence.level === 'very_low') {
      reasons.push('Overall confidence is very low — human biostatistician review recommended');
    }

    return reasons;
  }

  // ════════════════════════════════════════════════════════════════
  // Role-aware explanations
  // ════════════════════════════════════════════════════════════════

  private generateRoleExplanations(
    input: StatisticalInput,
    comp: ComputationResult,
    verdict: JudgmentVerdict,
    action: ActionRecommendation,
    fragility: FragilityAssessment
  ): RoleExplanations {
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    const powerPct = (comp.power * 100).toFixed(1);
    const trackLabel = input.clientTrack === 'biotech_pharma' ? 'pharma/biotech' : input.clientTrack === 'medical_device' ? 'device' : 'diagnostic';

    return {
      technical: `${comp.method} yields N=${n} (${comp.sampleSize.perGroup}/group) at ${powerPct}% power, α=${input.alpha}. Effect size: ${input.effectSize}. Fragility: ${fragility.category} (index ${fragility.fragilityIndex}). ${fragility.sensitiveParameters.map(p => `${p.parameter} has ${p.percentMargin}% margin to breakpoint`).join('; ')}.`,

      clinical: `This ${trackLabel} study requires ${n} subjects total to detect the expected treatment effect with ${powerPct}% confidence. ${verdict === 'adequate' ? 'The design is statistically sound.' : verdict === 'marginal' ? 'The design has some statistical concerns that should be addressed.' : 'The design has significant statistical limitations.'}${input.attritionRate > 0.15 ? ` Note: a ${(input.attritionRate * 100).toFixed(0)}% dropout rate is assumed.` : ''}`,

      regulatory: `The sample size of ${n} subjects provides ${powerPct}% power using ${comp.method}. ${action === 'proceed' ? 'The statistical design appears defensible for regulatory submission.' : action === 'revise' ? 'Consider strengthening the statistical rationale before submission — potential review concerns identified.' : action === 'escalate' ? 'Significant statistical gaps exist that would likely be identified in regulatory review.' : 'The design is acceptable but may benefit from additional justification in specific areas.'}`,

      executive: `${verdict === 'adequate' ? '✓ Study design is statistically sound' : verdict === 'marginal' ? '⚠ Study design needs attention' : '✗ Study design has significant issues'}. ${n} subjects needed. ${action === 'proceed' ? 'Ready to proceed.' : action === 'revise' ? 'Revisions recommended before proceeding.' : action === 'escalate' ? 'Escalation to senior biostatistician recommended.' : 'Proceed with noted conditions.'}`,
    };
  }
}

export const judgmentEngine = new JudgmentEngine();
