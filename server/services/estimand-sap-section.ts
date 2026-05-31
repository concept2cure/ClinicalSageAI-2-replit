/**
 * Estimand → SAP section renderer (ICH E9(R1)).
 *
 * Renders the estimand framework as a first-class, deterministic Statistical
 * Analysis Plan section. The five estimand attributes (treatment condition,
 * population, variable/endpoint, intercurrent-event handling, and the
 * population-level summary measure) are laid out per ICH E9(R1) so the SAP a
 * reviewer reads carries the same estimand the protocol designer captured.
 *
 * This module is pure (no DB, no clock, no AI): the same estimands always
 * render the same text. That keeps it reproducible and unit-testable, and lets
 * the SAP generator call it synchronously. When no estimand is supplied it does
 * NOT fabricate one — it renders an explicit deferral that names what the study
 * statistician must specify, mirroring the SAP generator's existing honesty
 * stance on sample-size justification.
 */

/** The five ICH E9(R1) intercurrent-event handling strategies. */
export type EstimandStrategy =
  | 'treatment_policy'
  | 'hypothetical'
  | 'composite'
  | 'principal_stratum'
  | 'while_on_treatment';

export const ESTIMAND_STRATEGIES: readonly EstimandStrategy[] = [
  'treatment_policy',
  'hypothetical',
  'composite',
  'principal_stratum',
  'while_on_treatment',
] as const;

/** Human-readable label for each strategy, as it should read in a SAP. */
const STRATEGY_LABEL: Record<EstimandStrategy, string> = {
  treatment_policy: 'Treatment policy',
  hypothetical: 'Hypothetical',
  composite: 'Composite variable',
  principal_stratum: 'Principal stratum',
  while_on_treatment: 'While on treatment',
};

/** A single intercurrent event and the strategy used to address it. */
export interface IntercurrentEventInput {
  name: string;
  description?: string;
  strategy: EstimandStrategy;
  justification?: string;
}

/**
 * An estimand as captured by the protocol designer / estimand engine. Mirrors
 * the attributes of `estimandDefinitions` so a row from that table maps onto
 * this shape directly.
 */
export interface EstimandInput {
  endpointName: string;
  /** Population (analysis set) the estimand targets, e.g. "all randomized patients (ITT)". */
  population: string;
  /** Variable / endpoint measure, e.g. "change from baseline in HbA1c at week 24". */
  variable: string;
  /** Population-level summary measure, e.g. "difference in means", "hazard ratio". */
  summaryMeasure: string;
  /** Intercurrent events and their handling strategies. */
  intercurrentEvents: IntercurrentEventInput[];
  /** The estimand's overall strategy (the primary intercurrent-event strategy). */
  strategy: EstimandStrategy;
  /** Optional treatment-condition description; defaults to a generic statement. */
  treatmentCondition?: string;
}

export interface RenderedEstimandSection {
  /** The SAP section text, ready to splice into the plan. */
  text: string;
  /** Number of estimands rendered (0 ⇒ the deferral was rendered). */
  estimandCount: number;
  /**
   * Per-estimand completeness against ICH E9(R1). An estimand is `complete`
   * only when all five attributes are present and at least one intercurrent
   * event is addressed. This is the same bar the estimand engine validates to;
   * it is surfaced here so the SAP reader sees which estimands are reviewer-ready.
   *
   * `missing` lists structural (error-severity) gaps that block completeness.
   * `warnings` lists defensibility weaknesses that do not block completeness but
   * that a reviewer would expect addressed (e.g. an intercurrent-event strategy
   * stated without a rationale, or a treatment condition not restated in the
   * SAP). `attributesSpecified` counts how many of the five ICH E9(R1)
   * attributes are explicitly present (0–5).
   */
  attributeCompleteness: Array<{
    endpointName: string;
    complete: boolean;
    attributesSpecified: number;
    totalAttributes: 5;
    missing: string[];
    warnings: string[];
  }>;
}

const SECTION_HEADER = 'ESTIMAND FRAMEWORK (ICH E9(R1))';

/** True when a string carries usable content (matches the engine's ≥3/≥5 guards loosely). */
function present(value: string | undefined | null, min = 1): boolean {
  return typeof value === 'string' && value.trim().length >= min;
}

interface EstimandAssessment {
  /** Structural (error-severity) gaps that block completeness. */
  missing: string[];
  /** Defensibility weaknesses that do not block completeness. */
  warnings: string[];
  /** How many of the five ICH E9(R1) attributes are explicitly present (0–5). */
  attributesSpecified: number;
}

/**
 * Assess one estimand against the five ICH E9(R1) attributes. Distinguishes
 * structural gaps (errors that block completeness) from defensibility
 * weaknesses (warnings). Pure and honest: it reports gaps, never fills them.
 *
 * The treatment condition is the fifth attribute. The estimand data model
 * captures it implicitly via the protocol's arms/randomization, so a SAP
 * estimand that does not restate it is a defensibility warning rather than a
 * structural error — but it still counts against `attributesSpecified` so the
 * X/5 signal stays honest.
 */
function assessEstimand(e: EstimandInput): EstimandAssessment {
  const missing: string[] = [];
  const warnings: string[] = [];

  const treatmentOk = present(e.treatmentCondition);
  if (!treatmentOk) {
    warnings.push(
      'treatment condition not restated in the SAP (defaults to the protocol arms); restate it to support defensibility',
    );
  }

  const populationOk = present(e.population, 5);
  if (!populationOk) missing.push('population');

  const variableOk = present(e.variable, 3);
  if (!variableOk) missing.push('variable (endpoint)');

  const summaryOk = present(e.summaryMeasure, 3);
  if (!summaryOk) missing.push('population-level summary measure');

  const hasIces = Array.isArray(e.intercurrentEvents) && e.intercurrentEvents.length > 0;
  const strategyOk = ESTIMAND_STRATEGIES.includes(e.strategy);
  if (!hasIces) {
    missing.push('intercurrent-event handling');
  }
  if (!strategyOk) {
    missing.push('a recognized ICH E9(R1) strategy');
  }
  // An intercurrent-event strategy without a stated rationale is a defensibility
  // weakness, not a structural error (per the addendum's expectations).
  if (hasIces) {
    e.intercurrentEvents.forEach(ice => {
      if (ESTIMAND_STRATEGIES.includes(ice.strategy) && !present(ice.justification)) {
        warnings.push(
          `intercurrent event "${ice.name || 'unnamed'}" states a strategy without a rationale`,
        );
      }
    });
  }

  // intercurrent-event handling counts as one attribute once at least one ICE is
  // declared with a recognized strategy.
  const iceAttributeOk = hasIces && strategyOk;
  const attributesSpecified =
    (treatmentOk ? 1 : 0) +
    (populationOk ? 1 : 0) +
    (variableOk ? 1 : 0) +
    (iceAttributeOk ? 1 : 0) +
    (summaryOk ? 1 : 0);

  return { missing, warnings, attributesSpecified };
}

/** Render the intercurrent-event handling lines for one estimand. */
function renderIntercurrentEvents(events: IntercurrentEventInput[]): string {
  if (!events || events.length === 0) {
    return '         No intercurrent events were specified. Per ICH E9(R1), the ' +
      'study statistician must identify and address each relevant intercurrent ' +
      'event (e.g. treatment discontinuation, rescue medication, treatment ' +
      'switching, death) before this estimand is reviewer-ready.';
  }
  return events
    .map((ice, i) => {
      const label = ESTIMAND_STRATEGIES.includes(ice.strategy)
        ? STRATEGY_LABEL[ice.strategy]
        : `${ice.strategy} (unrecognized strategy)`;
      const desc = present(ice.description) ? ` — ${ice.description!.trim()}` : '';
      const just = present(ice.justification)
        ? `\n            Rationale: ${ice.justification!.trim()}`
        : '';
      return `         ${i + 1}. ${ice.name}${desc}\n            Strategy: ${label}${just}`;
    })
    .join('\n');
}

/** Render a single estimand as a numbered sub-block. */
function renderOneEstimand(e: EstimandInput, index: number): string {
  const strategyLabel = ESTIMAND_STRATEGIES.includes(e.strategy)
    ? STRATEGY_LABEL[e.strategy]
    : `${e.strategy} (unrecognized — verify against ICH E9(R1))`;
  const treatment = present(e.treatmentCondition)
    ? e.treatmentCondition!.trim()
    : 'Randomized study treatment versus comparator as specified in the protocol';
  const { missing, warnings, attributesSpecified } = assessEstimand(e);
  const completeness =
    missing.length === 0
      ? `         Attribute completeness: ${attributesSpecified}/5 attributes specified` +
        (attributesSpecified === 5
          ? ' (ICH E9(R1) complete).'
          : ' — structurally complete; see defensibility warnings below.')
      : `         Attribute completeness: ${attributesSpecified}/5 attributes specified — ` +
        `incomplete, missing ${missing.join(', ')}. This estimand is recorded as ` +
        'drafted; the study statistician must complete the missing attribute(s) ' +
        'before finalization.';
  const warningsLine =
    warnings.length > 0
      ? `\n         Defensibility warnings: ${warnings.join('; ')}.`
      : '';

  return [
    `   Estimand ${index + 1}: ${e.endpointName}`,
    `      A. Treatment condition: ${treatment}`,
    `      B. Population: ${present(e.population, 5) ? e.population.trim() : 'not specified'}`,
    `      C. Variable (endpoint): ${present(e.variable, 3) ? e.variable.trim() : 'not specified'}`,
    `      D. Intercurrent-event handling (primary strategy: ${strategyLabel}):`,
    renderIntercurrentEvents(e.intercurrentEvents),
    `      E. Population-level summary measure: ${present(e.summaryMeasure, 3) ? e.summaryMeasure.trim() : 'not specified'}`,
    completeness + warningsLine,
  ].join('\n');
}

/** The deferral block rendered when no estimand is supplied. */
function renderDeferral(): string {
  return [
    '   No estimand was supplied with this protocol. Per ICH E9(R1), the ' +
      'estimand must be defined prospectively and aligned with the trial ' +
      'objective before the analysis is finalized.',
    '',
    '   For the primary objective, the study statistician must specify the five ' +
      'estimand attributes:',
    '      A. Treatment condition',
    '      B. Population (analysis set)',
    '      C. Variable (endpoint)',
    '      D. Strategy for each relevant intercurrent event (treatment policy, ' +
      'hypothetical, composite, principal stratum, or while on treatment)',
    '      E. Population-level summary measure',
    '',
    '   This draft does not assert an estimand that has not been defined.',
  ].join('\n');
}

/**
 * Render the estimand framework SAP section. Deterministic: same input ⇒ same
 * text. Returns the section text plus structured metadata the caller can attach
 * to the SAP result.
 */
export function renderEstimandSection(estimands?: EstimandInput[]): RenderedEstimandSection {
  const list = Array.isArray(estimands) ? estimands : [];

  const attributeCompleteness = list.map(e => {
    const { missing, warnings, attributesSpecified } = assessEstimand(e);
    return {
      endpointName: e.endpointName,
      complete: missing.length === 0,
      attributesSpecified,
      totalAttributes: 5 as const,
      missing,
      warnings,
    };
  });

  if (list.length === 0) {
    return {
      text: `${SECTION_HEADER}\n${renderDeferral()}`,
      estimandCount: 0,
      attributeCompleteness,
    };
  }

  const blocks = list.map((e, i) => renderOneEstimand(e, i)).join('\n\n');
  const intro =
    '   Each primary and key secondary objective is expressed as an estimand ' +
    'with the five ICH E9(R1) attributes below. Estimands marked incomplete ' +
    'require the study statistician to specify the missing attribute(s).';

  return {
    text: `${SECTION_HEADER}\n${intro}\n\n${blocks}`,
    estimandCount: list.length,
    attributeCompleteness,
  };
}
