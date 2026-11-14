/**
 * Narrate supplied analysis values without changing their numeric precision.
 * Only an explicit, coherent two-sided frequentist superiority context permits
 * a significance statement. This is a wording tool, not a statistical engine
 * or source of study evidence; unsupported methods remain descriptive.
 */
export type AnalysisType = 'time_to_event' | 'binary' | 'continuous';
export type EffectMeasure = 'HR' | 'OR' | 'RR' | 'rate ratio' | 'risk difference' | 'mean difference' | 'rate difference';
export interface ArmValue { name: string; n?: number; value?: number | string; unit?: string }
export interface StatResultInput {
  endpoint: string;
  analysisType: AnalysisType;
  arms?: ArmValue[];
  measure?: EffectMeasure;
  estimate?: number;
  ciLower?: number;
  ciUpper?: number;
  ciLevel?: number;
  pValue?: number;
  alpha?: number;
  /** Context reported by the source analysis, never inferred from an estimate. */
  method?: string;
  hypothesis?: string;
  sidedness?: string;
  prespecified?: boolean;
  exploratory?: boolean;
  multiplicityControlled?: boolean;
}
export interface StatNarrative {
  narrative: string;
  /** Null means this wording tool did not assess the hypothesis decision. */
  significant: boolean | null;
  statementStrength: 'confirmatory' | 'exploratory' | 'descriptive';
  flags: string[];
}
interface SourceValues {
  alpha?: number;
  ciLevel?: number;
  pValue?: number;
  knownMeasure: boolean;
  ratio: boolean;
  nullValue: number | null;
  hasInterval: boolean;
  interval: { lower: number; upper: number } | null;
}
const RATIO_MEASURES = new Set<EffectMeasure>(['HR', 'OR', 'RR', 'rate ratio']);
const EFFECT_MEASURES = new Set<EffectMeasure>([...RATIO_MEASURES, 'risk difference', 'mean difference', 'rate difference']);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const levelWithin = (value: unknown, maximum: number): number | undefined => finite(value) && value > 0 && value < maximum ? value : undefined;
const fmt = (value: number): string => String(value);

function readInterval(input: StatResultInput, ratio: boolean): SourceValues['interval'] {
  const lower = input.ciLower;
  const upper = input.ciUpper;
  if (!finite(lower) || !finite(upper) || lower > upper || (ratio && lower <= 0)) return null;
  return { lower, upper };
}
function sourceValues(input: StatResultInput): SourceValues {
  const knownMeasure = input.measure !== undefined && EFFECT_MEASURES.has(input.measure);
  const ratio = input.measure !== undefined && RATIO_MEASURES.has(input.measure);
  return {
    alpha: levelWithin(input.alpha, 1),
    ciLevel: levelWithin(input.ciLevel, 100),
    pValue: finite(input.pValue) && input.pValue >= 0 && input.pValue <= 1 ? input.pValue : undefined,
    knownMeasure, ratio, nullValue: knownMeasure ? (ratio ? 1 : 0) : null,
    hasInterval: input.ciLower !== undefined || input.ciUpper !== undefined,
    interval: readInterval(input, ratio),
  };
}
function numericIssues(input: StatResultInput, source: SourceValues): string[] {
  const issues: string[] = [];
  const fields = { estimate: input.estimate, ciLower: input.ciLower, ciUpper: input.ciUpper, ciLevel: input.ciLevel, pValue: input.pValue, alpha: input.alpha };
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && !finite(value)) issues.push(`Invalid ${name}: a finite numeric source value is required.`);
  }
  if (input.measure !== undefined && !source.knownMeasure) issues.push('Invalid or unsupported effect measure; its null value is not assumed.');
  if (finite(input.estimate) && source.ratio && input.estimate <= 0) issues.push('Invalid ratio estimate: a positive source value is required.');
  if (input.pValue !== undefined && source.pValue === undefined) issues.push('Invalid p-value: the supplied value must be between zero and one.');
  if (input.alpha !== undefined && source.alpha === undefined) issues.push('Invalid alpha: the supplied decision level must be strictly between zero and one.');
  return issues;
}
function intervalIssues(input: StatResultInput, source: SourceValues): string[] {
  if (!source.hasInterval) return [];
  const issues: string[] = [];
  if (!source.interval) issues.push('Invalid or incomplete reported interval; both ordered finite bounds are required, with positive bounds for a ratio.');
  if (source.ciLevel === undefined) issues.push('Invalid or missing reported interval level: the source level is required, not assumed.');
  if (source.interval && finite(input.estimate) && (input.estimate < source.interval.lower || input.estimate > source.interval.upper)) issues.push('The reported point estimate is outside the reported interval; resolve the source values before interpretation.');
  return issues;
}
function armIssues(arms: ArmValue[] | undefined): string[] {
  const issues: string[] = [];
  for (const arm of arms ?? []) {
    if (arm.n !== undefined && (!finite(arm.n) || !Number.isInteger(arm.n) || arm.n < 0)) issues.push('Invalid arm count: a finite nonnegative integer is required.');
    if (arm.value !== undefined && typeof arm.value !== 'string' && !finite(arm.value)) issues.push('Invalid arm value: use a finite source number or its reported text.');
  }
  return issues;
}
function intervalDecision(source: SourceValues): boolean | null {
  if (!source.interval || source.nullValue === null) return null;
  return source.interval.lower > source.nullValue || source.interval.upper < source.nullValue;
}
function pDecision(source: SourceValues): boolean | null {
  if (source.pValue === undefined || source.alpha === undefined) return null;
  return source.pValue < source.alpha;
}
function decisionIssues(source: SourceValues): string[] {
  const issues: string[] = [];
  if (source.hasInterval && source.nullValue === null) issues.push('The confidence interval has no supported effect measure; its decision is not assessed.');
  // Tolerance handles binary floating point, not rounding of source values.
  if (source.hasInterval && source.ciLevel !== undefined && source.alpha !== undefined && Math.abs(source.ciLevel - 100 * (1 - source.alpha)) > 1e-8) issues.push('The confidence interval level and alpha are inconsistent for a two-sided superiority decision.');
  const ci = intervalDecision(source);
  const p = pDecision(source);
  if (ci !== null && p !== null && ci !== p) issues.push('The confidence interval and p-value give conflicting superiority decisions; resolve the source analysis before interpretation.');
  return issues;
}
function supportsInference(input: StatResultInput): boolean {
  return input.method === 'frequentist' && input.hypothesis === 'superiority' && input.sidedness === 'two_sided';
}
function contextFlags(input: StatResultInput, source: SourceValues): string[] {
  const flags: string[] = [];
  if (!input.method || !input.hypothesis || !input.sidedness) flags.push('Statistical inference was not assessed: explicit analysis context (method, hypothesis and sidedness) is required.');
  else if (!supportsInference(input)) flags.push('Unsupported analysis context: this tool does not assess Bayesian, noninferiority, equivalence, one-sided or other hypothesis decisions. Retain the source analysis and qualified review.');
  if (source.alpha === undefined) flags.push('The supplied analysis has no valid alpha; statistical significance is not assessed.');
  if (input.exploratory === true || input.prespecified === false) flags.push('Exploratory/post-hoc analysis — hypothesis-generating, not confirmatory.');
  if (input.multiplicityControlled === false) flags.push('Multiplicity not controlled — interpret with caution and do not treat as confirmatory.');
  if (input.prespecified === undefined || input.exploratory === undefined || input.multiplicityControlled === undefined) flags.push('Prespecification, exploratory status and multiplicity control must all be explicit before confirmatory standing is described.');
  return flags;
}
function assessSignificance(input: StatResultInput, source: SourceValues, issues: string[], flags: string[]): boolean | null {
  if (!supportsInference(input) || source.alpha === undefined || issues.length > 0) return null;
  const significant = pDecision(source) ?? intervalDecision(source);
  if (significant === null) flags.push('Incomplete decision inputs: supply the reported p-value or a supported confidence interval.');
  if (intervalDecision(source) === false) flags.push(`The ${source.ciLevel}% CI includes the null value (${source.nullValue}).`);
  if (significant === false) flags.push(`The supplied two-sided superiority criterion was not met at α=${source.alpha}.`);
  return significant;
}
function standing(input: StatResultInput, significant: boolean | null): StatNarrative['statementStrength'] {
  if (significant === null) return 'descriptive';
  if (input.prespecified === true && input.exploratory === false && input.multiplicityControlled === true) return 'confirmatory';
  return input.exploratory === true || input.prespecified === false ? 'exploratory' : 'descriptive';
}
function armPhrase(arms: ArmValue[] | undefined, valueWord: string): string {
  if (!arms || arms.length === 0) return '';
  const parts = arms.map(arm => {
    const value = typeof arm.value === 'string' || finite(arm.value) ? arm.value : undefined;
    const reported = value !== undefined ? `${value}${arm.unit ? ` ${arm.unit}` : ''}` : 'not reported';
    const n = finite(arm.n) && Number.isInteger(arm.n) && arm.n >= 0 ? ` (n=${arm.n})` : '';
    return `${reported} in the ${arm.name} arm${n}`;
  });
  return `The ${valueWord} was ${parts.join(' versus ')}.`;
}
function effectPhrase(input: StatResultInput, source: SourceValues): string {
  const p = source.pValue !== undefined ? `p=${fmt(source.pValue)}` : '';
  if (!source.knownMeasure || !finite(input.estimate)) return p ? `The between-group comparison yielded ${p}.` : '';
  let uncertainty = p ? ` (${p})` : '';
  if (source.interval) {
    const level = source.ciLevel !== undefined ? `${fmt(source.ciLevel)}% ` : '';
    const label = input.method === 'frequentist' ? 'CI' : 'reported interval';
    uncertainty = ` (${level}${label} ${fmt(source.interval.lower)}–${fmt(source.interval.upper)}${p ? `; ${p}` : ''})`;
  }
  return `The ${input.measure} was ${fmt(input.estimate)}${uncertainty}.`;
}
function interpretation(input: StatResultInput, significant: boolean | null, strength: StatNarrative['statementStrength']): string {
  if (significant === null) return `Statistical significance for ${input.endpoint} could not be determined from the supplied analysis context. The reported values remain descriptive; no hypothesis decision is assessed.`;
  if (significant === false) return `The supplied analysis did not demonstrate a statistically significant difference in ${input.endpoint} at its stated alpha. This does not establish equivalence, absence of effect or lack of clinical importance.`;
  if (strength === 'confirmatory') return `The difference in ${input.endpoint} reached statistical significance; assess whether the magnitude is clinically meaningful.`;
  return `The supplied two-sided superiority criterion was met for ${input.endpoint} at α=${input.alpha}; the result is descriptive or exploratory and is not presented as confirmatory.`;
}
/** Compose wording from the caller's analysis values and explicit standing. */
export function narrateStatisticalResult(input: StatResultInput): StatNarrative {
  const source = sourceValues(input);
  const issues = [...numericIssues(input, source), ...intervalIssues(input, source), ...armIssues(input.arms), ...(supportsInference(input) ? decisionIssues(source) : [])];
  const flags = [...contextFlags(input, source), ...issues];
  const significant = assessSignificance(input, source, issues, flags);
  const statementStrength = standing(input, significant);
  const valueWord = input.analysisType === 'time_to_event' ? 'median' : input.analysisType === 'binary' ? 'rate' : 'mean change';
  const narrative = [`For ${input.endpoint}:`, armPhrase(input.arms, valueWord), effectPhrase(input, source), interpretation(input, significant, statementStrength)].filter(Boolean).join(' ');
  flags.push('Analysis context and figures are caller-supplied, not independently verified.');
  flags.push('Statistical significance does not by itself establish clinical relevance.');
  return { narrative, significant, statementStrength, flags };
}
