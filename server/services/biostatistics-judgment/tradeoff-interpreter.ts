/**
 * Module 4 — Statistical Tradeoff Interpreter
 *
 * Explains tradeoffs: larger sample vs operational burden,
 * conservative assumptions vs timeline, precision vs feasibility, etc.
 *
 * This is where AnA stops being a calculator and starts acting
 * like a real statistical advisor.
 *
 * @module server/services/biostatistics-judgment/tradeoff-interpreter
 */

import type { StudyDesignInput, StatisticalTradeoff, TradeoffAnalysis } from './types';
import type { PowerAdequacyJudgment } from './types';
import type { AssumptionFragility } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// TRADEOFF ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export function analyzeTradeoffs(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
  fragilityJudgment: AssumptionFragility,
): TradeoffAnalysis {
  const tradeoffs: StatisticalTradeoff[] = [];

  // 1. Sample size vs power tradeoff
  tradeoffs.push(analyzeSampleSizePowerTradeoff(input, powerJudgment));

  // 2. Conservative assumptions vs timeline
  tradeoffs.push(analyzeConservatismTradeoff(input, fragilityJudgment));

  // 3. Precision vs feasibility
  tradeoffs.push(analyzePrecisionFeasibilityTradeoff(input));

  // 4. Attrition planning tradeoff
  if (input.attritionAssumption > 0) {
    tradeoffs.push(analyzeAttritionTradeoff(input));
  }

  // 5. Adaptive design tradeoff (if applicable)
  if (input.adaptiveDesign || (input.interimAnalyses && input.interimAnalyses > 0)) {
    tradeoffs.push(analyzeAdaptiveTradeoff(input));
  }

  // 6. Alpha vs power tradeoff
  if (input.alpha > 0.01) {
    tradeoffs.push(analyzeAlphaTradeoff(input));
  }

  // Determine safest path
  const safestPath = determineSafestPath(input, powerJudgment, fragilityJudgment, tradeoffs);
  const overallGuidance = buildOverallGuidance(tradeoffs, safestPath);

  return { tradeoffs, safestPath, overallGuidance };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL TRADEOFF ASSESSMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSampleSizePowerTradeoff(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
): StatisticalTradeoff {
  const currentN = input.computedSampleSize;
  const increasedN = Math.ceil(currentN * 1.2);

  const whatImproves: string[] = [];
  const whatWorses: string[] = [];

  if (powerJudgment.classification === 'adequate') {
    whatImproves.push(`Increasing sample from ${currentN} to ${increasedN} adds safety margin for assumption slippage.`);
    whatImproves.push('Higher power provides more room for subgroup analyses and sensitivity analyses.');
    whatWorses.push(`Additional ${increasedN - currentN} participants increase cost and enrollment duration.`);
    whatWorses.push('Overpowered studies may detect clinically insignificant differences.');

    return {
      dimension: 'Sample Size vs. Power Margin',
      currentChoice: `N=${currentN} (${powerJudgment.classification} power)`,
      alternative: `N=${increasedN} (20% increase)`,
      whatImproves,
      whatWorses,
      netAssessment: 'neutral',
      recommendation: 'Current sample size is adequate. A 20% increase would add insurance but may not be necessary unless assumptions are uncertain.',
    };
  }

  if (powerJudgment.classification === 'marginal' || powerJudgment.classification === 'underpowered') {
    whatImproves.push(`Increasing sample from ${currentN} to ${increasedN} improves power toward adequacy.`);
    whatImproves.push('Reduces the risk of a failed trial due to insufficient sample.');
    whatImproves.push('Strengthens regulatory credibility of the design.');
    whatWorses.push(`Additional ${increasedN - currentN} participants increase cost and enrollment duration.`);
    whatWorses.push('If recruitment is already challenging, a larger sample may extend timelines substantially.');

    return {
      dimension: 'Sample Size vs. Power Adequacy',
      currentChoice: `N=${currentN} (${powerJudgment.classification} power)`,
      alternative: `N=${increasedN} (20% increase)`,
      whatImproves,
      whatWorses,
      netAssessment: 'favorable',
      recommendation: `Current design is ${powerJudgment.classification}. Increasing sample size is strongly recommended to reduce trial failure risk.`,
    };
  }

  return {
    dimension: 'Sample Size vs. Power',
    currentChoice: `N=${currentN}`,
    alternative: `N=${increasedN}`,
    whatImproves: ['Cannot fully assess — power classification is indeterminate.'],
    whatWorses: ['Larger sample increases cost and operational burden.'],
    netAssessment: 'neutral',
    recommendation: 'Resolve power calculation before assessing sample size tradeoffs.',
  };
}

function analyzeConservatismTradeoff(
  input: StudyDesignInput,
  fragilityJudgment: AssumptionFragility,
): StatisticalTradeoff {
  const whatImproves: string[] = [];
  const whatWorses: string[] = [];

  if (fragilityJudgment.fragilityLevel === 'high') {
    whatImproves.push('Using more conservative assumptions (smaller effect, higher variance) increases design robustness.');
    whatImproves.push('Reduces probability of trial failure due to optimistic planning.');
    whatImproves.push('Strengthens regulatory defensibility of the design.');
    whatWorses.push('Conservative assumptions increase required sample size.');
    whatWorses.push('Larger trial requires more time and resources.');
    whatWorses.push('May make the trial operationally infeasible for smaller sponsors.');

    return {
      dimension: 'Conservative Assumptions vs. Speed/Cost',
      currentChoice: 'Current assumptions (high fragility)',
      alternative: 'More conservative assumptions (lower effect size, higher variance)',
      whatImproves,
      whatWorses,
      netAssessment: 'favorable',
      recommendation: 'Given high assumption fragility, using more conservative parameters is strongly recommended even at the cost of a larger trial.',
    };
  }

  whatImproves.push('More conservative assumptions would add further safety margin.');
  whatWorses.push('Current assumptions already appear reasonable — conservatism may not justify the added cost.');

  return {
    dimension: 'Conservative Assumptions vs. Speed/Cost',
    currentChoice: `Current assumptions (${fragilityJudgment.fragilityLevel} fragility)`,
    alternative: 'More conservative assumptions',
    whatImproves,
    whatWorses,
    netAssessment: fragilityJudgment.fragilityLevel === 'moderate' ? 'neutral' : 'unfavorable',
    recommendation: fragilityJudgment.fragilityLevel === 'moderate'
      ? 'Moderate fragility — consider conservatism for critical parameters only.'
      : 'Low fragility — current assumptions appear well-calibrated, further conservatism is unnecessary.',
  };
}

function analyzePrecisionFeasibilityTradeoff(input: StudyDesignInput): StatisticalTradeoff {
  const whatImproves: string[] = [];
  const whatWorses: string[] = [];

  // If power target is exactly 80%, there's a precision-feasibility question
  if (input.powerTarget >= 0.90) {
    whatImproves.push('Reducing power target from 90% to 80% substantially reduces sample size.');
    whatImproves.push('Makes enrollment more feasible and reduces study duration.');
    whatWorses.push('Lower power increases the risk of missing a true treatment effect.');
    whatWorses.push('May weaken confidence in negative results.');

    return {
      dimension: 'Precision (90% Power) vs. Feasibility',
      currentChoice: `${(input.powerTarget * 100).toFixed(0)}% power target`,
      alternative: '80% power target',
      whatImproves,
      whatWorses,
      netAssessment: 'neutral',
      recommendation: '80% power is standard and acceptable. 90% provides extra insurance but at significant sample size cost.',
    };
  }

  whatImproves.push('Higher power target (e.g., 90%) provides more reliable detection of treatment effects.');
  whatImproves.push('Reduces probability of inconclusive results.');
  whatWorses.push('Increasing power from 80% to 90% typically requires ~30% more participants.');
  whatWorses.push('Increased enrollment burden and study cost.');

  return {
    dimension: 'Precision vs. Feasibility',
    currentChoice: `${(input.powerTarget * 100).toFixed(0)}% power target`,
    alternative: '90% power target',
    whatImproves,
    whatWorses,
    netAssessment: input.powerTarget < 0.80 ? 'favorable' : 'neutral',
    recommendation: input.powerTarget < 0.80
      ? 'Power target is below standard — consider increasing to at least 80%.'
      : '80% power is the standard threshold. Higher targets are valuable but costly.',
  };
}

function analyzeAttritionTradeoff(input: StudyDesignInput): StatisticalTradeoff {
  const currentAttrition = input.attritionAssumption;
  const conservativeAttrition = Math.min(currentAttrition * 1.5, 0.50);

  return {
    dimension: 'Attrition Buffer vs. Study Size',
    currentChoice: `${(currentAttrition * 100).toFixed(0)}% attrition assumption`,
    alternative: `${(conservativeAttrition * 100).toFixed(0)}% attrition assumption (50% higher)`,
    whatImproves: [
      'More conservative attrition assumption protects against higher-than-expected dropout.',
      'Reduces risk of underpowered analysis due to lost participants.',
    ],
    whatWorses: [
      `Requires inflating sample size to compensate for ${(conservativeAttrition * 100).toFixed(0)}% expected loss.`,
      'Additional enrollment increases cost and timeline.',
    ],
    netAssessment: currentAttrition < 0.15 ? 'favorable' : 'neutral',
    recommendation: currentAttrition < 0.15
      ? `Attrition of ${(currentAttrition * 100).toFixed(0)}% may be optimistic — consider modeling higher dropout scenarios.`
      : `Attrition of ${(currentAttrition * 100).toFixed(0)}% is reasonable. Ensure sample size inflation covers this rate.`,
  };
}

function analyzeAdaptiveTradeoff(input: StudyDesignInput): StatisticalTradeoff {
  return {
    dimension: 'Adaptive Design vs. Methodological Simplicity',
    currentChoice: 'Adaptive design / interim analyses',
    alternative: 'Fixed design with no interim looks',
    whatImproves: [
      'Fixed designs are simpler to implement and analyze.',
      'No alpha-spending adjustment needed — full alpha available at final analysis.',
      'Regulatory review is more straightforward.',
    ],
    whatWorses: [
      'Cannot stop early for efficacy or futility.',
      'Cannot re-estimate sample size mid-trial.',
      'May continue enrolling into a futile trial.',
    ],
    netAssessment: 'neutral',
    recommendation: 'Adaptive designs offer flexibility but add complexity. Ensure pre-specification of adaptation rules and alpha-spending functions.',
  };
}

function analyzeAlphaTradeoff(input: StudyDesignInput): StatisticalTradeoff {
  return {
    dimension: 'Type I Error Control vs. Power',
    currentChoice: `Alpha = ${input.alpha} (${input.alpha === 0.05 ? 'standard' : input.alpha < 0.05 ? 'conservative' : 'liberal'})`,
    alternative: input.alpha > 0.025 ? 'Alpha = 0.025 (one-sided or more conservative)' : 'Alpha = 0.05 (standard two-sided)',
    whatImproves: input.alpha > 0.025
      ? ['Lower alpha reduces false positive risk.', 'May be required for certain regulatory submissions.']
      : ['Standard alpha provides adequate error control for most confirmatory trials.'],
    whatWorses: input.alpha > 0.025
      ? ['Lower alpha requires larger sample size for the same power.']
      : ['Higher alpha slightly increases false positive risk.'],
    netAssessment: 'neutral',
    recommendation: input.alpha === 0.05
      ? 'Standard two-sided alpha of 0.05 is appropriate for most confirmatory trials.'
      : `Alpha of ${input.alpha} — ensure this aligns with the regulatory submission strategy.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFEST PATH DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════════

function determineSafestPath(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
  fragilityJudgment: AssumptionFragility,
  tradeoffs: readonly StatisticalTradeoff[],
): string {
  const actions: string[] = [];

  if (powerJudgment.classification === 'underpowered') {
    actions.push('Increase sample size to achieve at least 80% power');
  } else if (powerJudgment.classification === 'marginal') {
    actions.push('Consider a 15-20% sample size increase to provide adequate power margin');
  }

  if (fragilityJudgment.fragilityLevel === 'high') {
    actions.push('Adopt more conservative assumptions for key parameters (effect size, variance, attrition)');
  }

  const favorableTradeoffs = tradeoffs.filter(t => t.netAssessment === 'favorable');
  for (const t of favorableTradeoffs) {
    actions.push(t.recommendation);
  }

  if (actions.length === 0) {
    return 'The current design appears statistically sound. Maintain current assumptions and monitor during trial execution.';
  }

  return `Safest path: ${actions.join('. ')}`;
}

function buildOverallGuidance(tradeoffs: readonly StatisticalTradeoff[], safestPath: string): string {
  const favorable = tradeoffs.filter(t => t.netAssessment === 'favorable').length;
  const unfavorable = tradeoffs.filter(t => t.netAssessment === 'unfavorable').length;

  if (favorable > unfavorable) {
    return `${favorable} tradeoff(s) favor design adjustment. ${safestPath}`;
  }
  if (unfavorable > favorable) {
    return `Current design parameters appear well-calibrated. Most tradeoffs do not favor change. ${safestPath}`;
  }
  return `Tradeoffs are balanced. ${safestPath}`;
}
