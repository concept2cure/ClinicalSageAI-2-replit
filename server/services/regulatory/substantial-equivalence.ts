/**
 * Substantial-equivalence (SE) reasoning for FDA 510(k).
 *
 * The existing predicate tooling finds candidate predicates and stores a
 * similarities/differences data shape, but performs no SE *decision*. This
 * module implements the FDA SE decision flowchart from "The 510(k) Program:
 * Evaluating Substantial Equivalence in Premarket Notifications" — the core
 * intellectual step of a 510(k) — as a deterministic, auditable walk that
 * returns SE / NSE / INSUFFICIENT_DATA with the exact decision path and
 * rationale. It also compares technological characteristics attribute-by-
 * attribute to feed the "same technological characteristics?" node.
 *
 * Pure and deterministic. The boolean judgments (intended-use match, whether
 * differences raise new questions) are reviewer determinations the engine
 * consumes; it does not fabricate them.
 */

// ── Technological-characteristics comparison ─────────────────────────────────

export interface DeviceCharacteristic {
  name: string;
  subjectValue: string;
  predicateValue: string;
}

export interface CharacteristicComparison extends DeviceCharacteristic {
  same: boolean;
}

export interface TechnologicalComparisonResult {
  comparisons: CharacteristicComparison[];
  /** Names of characteristics that differ between subject and predicate. */
  differences: string[];
  /** True when every characteristic matches. */
  sameOverall: boolean;
}

/** Normalize for comparison: trim + collapse whitespace + lowercase. */
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Compare a subject device's technological characteristics against a predicate. */
export function compareTechnologicalCharacteristics(
  characteristics: DeviceCharacteristic[]
): TechnologicalComparisonResult {
  if (characteristics.length === 0) {
    throw new Error('At least one technological characteristic is required.');
  }
  const comparisons = characteristics.map(c => ({
    ...c,
    same: norm(c.subjectValue) === norm(c.predicateValue),
  }));
  const differences = comparisons.filter(c => !c.same).map(c => c.name);
  return { comparisons, differences, sameOverall: differences.length === 0 };
}

// ── SE decision flowchart ────────────────────────────────────────────────────

export type SeDetermination = 'SE' | 'NSE' | 'INSUFFICIENT_DATA';

export interface SubstantialEquivalenceInput {
  /** Does the subject device have the same intended use as the predicate? */
  sameIntendedUse: boolean;
  /** Are the technological characteristics the same as the predicate's? */
  sameTechnologicalCharacteristics: boolean;
  /**
   * Only consulted when characteristics differ: do the differences raise
   * DIFFERENT questions of safety and effectiveness?
   */
  differencesRaiseNewQuestions?: boolean;
  /**
   * Do the performance data demonstrate the device is as safe and effective as
   * the predicate? `null`/undefined = data not yet available.
   */
  performanceDataSupportsEquivalence?: boolean | null;
}

export interface SubstantialEquivalenceResult {
  determination: SeDetermination;
  /** Ordered decision-flowchart steps taken, for the audit trail. */
  decisionPath: string[];
  rationale: string;
  /** Suggested alternative pathway when NSE. */
  recommendedPathway?: string;
  framework: 'FDA 510(k) SE flowchart';
}

/**
 * Walk the FDA 510(k) substantial-equivalence decision flowchart.
 */
export function evaluateSubstantialEquivalence(
  input: SubstantialEquivalenceInput
): SubstantialEquivalenceResult {
  const decisionPath: string[] = [];
  const result = (
    determination: SeDetermination,
    rationale: string,
    recommendedPathway?: string
  ): SubstantialEquivalenceResult => ({
    determination,
    decisionPath: [...decisionPath],
    rationale,
    recommendedPathway,
    framework: 'FDA 510(k) SE flowchart',
  });

  // Node 1 — same intended use?
  if (!input.sameIntendedUse) {
    decisionPath.push('Same intended use as predicate? No');
    return result(
      'NSE',
      'The subject device does not have the same intended use as the predicate; it cannot be found substantially equivalent.',
      'De Novo classification (if low–moderate risk) or PMA'
    );
  }
  decisionPath.push('Same intended use as predicate? Yes');

  const perf = input.performanceDataSupportsEquivalence ?? null;

  // Node 2 — same technological characteristics?
  if (input.sameTechnologicalCharacteristics) {
    decisionPath.push('Same technological characteristics? Yes');
    if (perf === false) {
      decisionPath.push('Performance data demonstrate equivalence? No');
      return result(
        'NSE',
        'Same intended use and technological characteristics, but the performance data do not demonstrate the device is as safe and effective as the predicate.'
      );
    }
    if (perf === null) {
      decisionPath.push('Performance data demonstrate equivalence? Not yet available');
      return result(
        'INSUFFICIENT_DATA',
        'Same intended use and technological characteristics; performance data are required to confirm substantial equivalence.'
      );
    }
    decisionPath.push('Performance data demonstrate equivalence? Yes');
    return result(
      'SE',
      'Same intended use and same technological characteristics, with performance data demonstrating the device is as safe and effective as the predicate.'
    );
  }
  decisionPath.push('Same technological characteristics? No (different characteristics)');

  // Node 3 — do the differences raise new questions of safety/effectiveness?
  if (input.differencesRaiseNewQuestions === undefined) {
    decisionPath.push('Do differences raise new questions of safety/effectiveness? Undetermined');
    return result(
      'INSUFFICIENT_DATA',
      'Technological characteristics differ; a determination of whether the differences raise new questions of safety and effectiveness is required before SE can be evaluated.'
    );
  }
  if (input.differencesRaiseNewQuestions) {
    decisionPath.push('Do differences raise new questions of safety/effectiveness? Yes');
    return result(
      'NSE',
      'The different technological characteristics raise new questions of safety and effectiveness; the device is not substantially equivalent.',
      'De Novo classification (if low–moderate risk) or PMA'
    );
  }
  decisionPath.push('Do differences raise new questions of safety/effectiveness? No');

  // Node 4 — performance data demonstrate SE despite the differences?
  if (perf === false) {
    decisionPath.push('Performance data demonstrate equivalence? No');
    return result(
      'NSE',
      'The different technological characteristics do not raise new questions, but the performance data do not demonstrate substantial equivalence.'
    );
  }
  if (perf === null) {
    decisionPath.push('Performance data demonstrate equivalence? Not yet available');
    return result(
      'INSUFFICIENT_DATA',
      'Different technological characteristics that do not raise new questions; performance data are required to demonstrate substantial equivalence.'
    );
  }
  decisionPath.push('Performance data demonstrate equivalence? Yes');
  return result(
    'SE',
    'Same intended use; the different technological characteristics do not raise new questions of safety and effectiveness, and performance data demonstrate the device is as safe and effective as the predicate.'
  );
}
