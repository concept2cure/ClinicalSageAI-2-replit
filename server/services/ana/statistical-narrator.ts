/**
 * Statistical-results narrator for AnA.
 *
 * Turns a structured analysis result (effect measure + estimate + CI + p, plus
 * per-arm values) into correctly-hedged, ICH-E3-style prose — distinguishing
 * statistical significance from clinical relevance, respecting confidence
 * intervals over bare p-values, and labeling exploratory / multiplicity-
 * uncontrolled analyses. Deterministic; never overstates beyond what the inputs
 * support (a core biostatistics-writing rule).
 *
 * @module server/services/ana/statistical-narrator
 */

export type AnalysisType = 'time_to_event' | 'binary' | 'continuous';
export type EffectMeasure =
  | 'HR' | 'OR' | 'RR' | 'rate ratio' // ratio measures (null = 1)
  | 'risk difference' | 'mean difference' | 'rate difference'; // difference measures (null = 0)

export interface ArmValue {
  name: string;
  n?: number;
  value?: number | string; // median (TTE), rate/% (binary), mean change (continuous)
  unit?: string;
}

export interface StatResultInput {
  endpoint: string;
  analysisType: AnalysisType;
  arms?: ArmValue[];
  measure?: EffectMeasure;
  estimate?: number;
  ciLower?: number;
  ciUpper?: number;
  ciLevel?: number; // default 95
  pValue?: number;
  alpha?: number; // default 0.05
  exploratory?: boolean;
  multiplicityControlled?: boolean;
}

export interface StatNarrative {
  narrative: string;
  /** True/false when determinable, else null (insufficient inputs). */
  significant: boolean | null;
  statementStrength: 'confirmatory' | 'exploratory' | 'descriptive';
  flags: string[];
}

const RATIO_MEASURES = new Set<EffectMeasure>(['HR', 'OR', 'RR', 'rate ratio']);

function nullValueFor(measure?: EffectMeasure): number | null {
  if (!measure) return null;
  return RATIO_MEASURES.has(measure) ? 1 : 0;
}

function fmt(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function fmtP(p: number | undefined): string {
  if (p === undefined || Number.isNaN(p)) return '';
  if (p < 0.001) return 'p<0.001';
  return `p=${Math.round(p * 1000) / 1000}`;
}

function armPhrase(arms: ArmValue[] | undefined, valueWord: string): string {
  if (!arms || arms.length === 0) return '';
  const parts = arms.map(a => {
    const v = a.value !== undefined ? `${a.value}${a.unit ? ` ${a.unit}` : ''}` : 'not reported';
    const n = a.n !== undefined ? ` (n=${a.n})` : '';
    return `${v} in the ${a.name} arm${n}`;
  });
  return `The ${valueWord} was ${parts.join(' versus ')}.`;
}

/** Compose a hedged statistical narrative from a structured result. */
export function narrateStatisticalResult(input: StatResultInput): StatNarrative {
  const alpha = input.alpha ?? 0.05;
  const ciLevel = input.ciLevel ?? 95;
  const flags: string[] = [];

  // Determine significance: prefer the CI (excludes the null value), else p.
  const nullVal = nullValueFor(input.measure);
  let significant: boolean | null = null;
  if (input.ciLower !== undefined && input.ciUpper !== undefined && nullVal !== null) {
    const excludesNull = input.ciLower > nullVal || input.ciUpper < nullVal;
    significant = excludesNull;
    if (!excludesNull) flags.push(`The ${ciLevel}% CI includes the null value (${nullVal}).`);
  } else if (input.pValue !== undefined) {
    significant = input.pValue < alpha;
  }
  if (input.pValue !== undefined && input.pValue >= alpha) {
    flags.push(`Not statistically significant at α=${alpha}.`);
  }

  // Per-arm descriptive sentence.
  const valueWord =
    input.analysisType === 'time_to_event' ? 'median'
      : input.analysisType === 'binary' ? 'rate'
        : 'mean change';
  const arms = armPhrase(input.arms, valueWord);

  // Effect sentence.
  let effect = '';
  if (input.measure && input.estimate !== undefined) {
    const ciTxt =
      input.ciLower !== undefined && input.ciUpper !== undefined
        ? ` (${ciLevel}% CI ${fmt(input.ciLower)}–${fmt(input.ciUpper)}${input.pValue !== undefined ? `; ${fmtP(input.pValue)}` : ''})`
        : input.pValue !== undefined ? ` (${fmtP(input.pValue)})` : '';
    effect = `The ${input.measure} was ${fmt(input.estimate)}${ciTxt}.`;
  } else if (input.pValue !== undefined) {
    effect = `The between-group comparison yielded ${fmtP(input.pValue)}.`;
  }

  // Interpretive (hedged) sentence.
  let interpretation: string;
  if (significant === true) {
    interpretation = `The difference in ${input.endpoint} reached statistical significance; assess whether the magnitude is clinically meaningful.`;
  } else if (significant === false) {
    interpretation = `The analysis did not demonstrate a statistically significant difference in ${input.endpoint}; a clinically meaningful effect cannot be concluded.`;
  } else {
    interpretation = `Statistical significance for ${input.endpoint} could not be determined from the inputs provided.`;
  }

  // Strength + standing flags.
  let statementStrength: StatNarrative['statementStrength'];
  if (input.exploratory) {
    statementStrength = 'exploratory';
    flags.push('Exploratory/post-hoc analysis — hypothesis-generating, not confirmatory.');
  } else if (input.measure && input.estimate !== undefined) {
    statementStrength = 'confirmatory';
  } else {
    statementStrength = 'descriptive';
  }
  if (input.multiplicityControlled === false) {
    flags.push('Multiplicity not controlled — interpret with caution and do not treat as confirmatory.');
  }
  flags.push('Statistical significance does not by itself establish clinical relevance.');

  const narrative = [
    `For ${input.endpoint}:`,
    arms,
    effect,
    interpretation,
  ].filter(Boolean).join(' ');

  return { narrative, significant, statementStrength, flags };
}
