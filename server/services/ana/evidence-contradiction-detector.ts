/**
 * Evidence contradiction detector — AnA's self-check that catches self-contradicting
 * evidence BEFORE it synthesizes an answer.
 *
 * AnA gathers structured evidence claims from many tools/sources. Before it weaves
 * those claims into a narrative, it must notice when they DISAGREE with each other —
 * e.g. two sources reporting different ORR for the same trial, or one source asserting
 * benefit while another asserts no benefit for the same drug. Synthesizing over
 * contradictory inputs without flagging the contradiction produces a confident but
 * dishonest answer.
 *
 * This module is a PURE, deterministic detector. CRITICALLY, it is HONEST about its
 * own limits: it operates ONLY over the STRUCTURED fields of each claim (subject,
 * metric, numeric value, polarity, date) — NOT over free text. It performs no semantic
 * NLP and makes no inference about meaning. It therefore:
 *   - No LLM, no network, no DB, no IO of any kind.
 *   - Identical input always yields identical output (stable ordering).
 *   - Reports only structurally-detectable disagreements; it never claims to have
 *     understood the prose. A clean report does NOT mean "no contradiction exists" —
 *     only "no structural contradiction in the provided fields".
 *
 * Detection rules (pairwise, within the SAME subject, case-insensitive subject/metric):
 *   1. numerical_mismatch — same subject + same metric, both finite numeric `value`,
 *      matching case-sensitive units (or both unspecified with a caveat), relative difference beyond tolerance. severity major if relative diff > 0.25,
 *      else minor.
 *   2. direct_conflict — same subject, opposite polarity (positive vs negative).
 *      severity critical.
 *   3. temporal_inconsistency — same subject, opposite polarity AND both dated with
 *      DIFFERING dates → chronology is reported without resolving the conflict; severity major.
 *      A newer date alone cannot establish source supersession.
 *
 * @module server/services/ana/evidence-contradiction-detector
 */

/** The provenance/shape of one structured evidence claim fed to AnA. */
export interface EvidenceClaim {
  /** Optional stable id; the array index is used when absent. */
  id?: string;
  /** Tool/source that produced the claim (e.g. 'search_clinical_evidence'). */
  source?: string;
  /** The entity the claim is about (NCT id, drug, endpoint) — REQUIRED for pairing. */
  subject: string;
  /** Optional metric label (e.g. 'ORR', 'p_value', 'N'). */
  metric?: string;
  /** Optional numeric value for the metric. */
  value?: number;
  /** Optional unit for the value. */
  unit?: string;
  /** Optional directional assertion (benefit vs no benefit / safe vs signal). */
  polarity?: 'positive' | 'negative' | 'neutral';
  /** Optional ISO yyyy-mm-dd date the claim is anchored to. */
  date?: string;
  /** Optional human-readable text, carried into the finding (never parsed). */
  text?: string;
}

/** The kinds of structural contradiction this detector can report. */
export type ContradictionType =
  | 'numerical_mismatch'
  | 'direct_conflict'
  | 'temporal_inconsistency';

/** The known contradiction types, in reporting precedence order. */
export const CONTRADICTION_TYPES: ContradictionType[] = [
  'numerical_mismatch',
  'direct_conflict',
  'temporal_inconsistency',
];

/** A compact reference to one side of a contradicting pair. */
export interface ContradictionClaimRef {
  /** The claim's stable id, or the synthesized index id (e.g. '#3'). */
  id: string;
  /** The producing tool/source, if known. */
  source?: string;
  /** The metric label, if present. */
  metric?: string;
  /** The numeric value, if present. */
  value?: number;
  /** The unit, as supplied; no implicit conversion. */
  unit?: string;
  /** The polarity, if present. */
  polarity?: 'positive' | 'negative' | 'neutral';
  /** The date, if present. */
  date?: string;
}

/** A single detected contradiction between two claims about the same subject. */
export interface Contradiction {
  /** Which structural rule fired. */
  type: ContradictionType;
  /** How serious the disagreement is. */
  severity: 'critical' | 'major' | 'minor';
  /** The shared subject (as first observed, original casing). */
  subject: string;
  /** The first claim in the pair (lower index). */
  claimA: ContradictionClaimRef;
  /** The second claim in the pair (higher index). */
  claimB: ContradictionClaimRef;
  /** Human-readable explanation of the disagreement. */
  detail: string;
}

/** The full structural contradiction report for a set of claims. */
export interface ContradictionReport {
  /** All detected contradictions, in stable order. */
  contradictions: Contradiction[];
  /** Validated claims considered; zero when supplied input is invalid. */
  checkedClaims: number;
  /** Subjects (original casing) that had at least one contradiction, sorted. */
  subjectsWithConflicts: string[];
  /** True only when valid input yielded at least one structural comparison. */
  assessed: boolean;
  /** Number of pairs with comparable supplied numeric or polarity fields. */
  comparedPairs: number;
  /** Invalid supplied fields that prevent assessment of the submitted input. */
  inputIssues: string[];
  /** Honest caveats about the detection's scope. */
  notes: string[];
}

/** Internal: a claim paired with its synthesized stable ref id. */
interface IndexedClaim {
  claim: EvidenceClaim;
  /** Reporting id: the claim's id, or '#<index>'. */
  refId: string;
  /** Original array index, used as the final tie-breaker for ordering. */
  index: number;
}

const DEFAULT_RELATIVE_TOLERANCE = 0.1;
const MAJOR_RELATIVE_DIFF = 0.25;
/** Values whose magnitudes are both at/below this are treated as ~0 (i.e. equal). */
const NEAR_ZERO = 1e-12;

const STRUCTURAL_NOTE =
  'Structural detection over the provided fields (subject, metric, value, polarity, date) only — ' +
  'this is NOT semantic NLP. A clean report means no structural contradiction was found in those ' +
  'fields, not that the evidence is necessarily consistent in meaning.';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalize(s: string | undefined): string {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/** Unit symbols are case-sensitive; no alias inference or conversion. */
function unitKey(unit: string | undefined): string {
  return typeof unit === 'string' ? unit.trim() : '';
}

function toRef(ic: IndexedClaim): ContradictionClaimRef {
  const { claim, refId } = ic;
  const ref: ContradictionClaimRef = { id: refId };
  if (claim.source !== undefined) ref.source = claim.source;
  if (claim.metric !== undefined) ref.metric = claim.metric;
  if (isFiniteNumber(claim.value)) ref.value = claim.value;
  if (typeof claim.unit === 'string') ref.unit = claim.unit;
  if (claim.polarity !== undefined) ref.polarity = claim.polarity;
  if (claim.date !== undefined) ref.date = claim.date;
  return ref;
}

/**
 * Relative difference between two finite numbers, normalized by the larger magnitude.
 * Both ~0 → 0 (equal). Returns a value in [0, ∞).
 */
function relativeDifference(a: number, b: number): number {
  const maxMag = Math.max(Math.abs(a), Math.abs(b));
  if (maxMag <= NEAR_ZERO) return 0;
  return Math.abs(a - b) / maxMag;
}

function oppositePolarity(a: EvidenceClaim, b: EvidenceClaim): boolean {
  return (
    (a.polarity === 'positive' && b.polarity === 'negative') ||
    (a.polarity === 'negative' && b.polarity === 'positive')
  );
}

/** Detect a numerical_mismatch for a pair, or null if none. */
function detectNumericalMismatch(
  a: IndexedClaim,
  b: IndexedClaim,
  subject: string,
  relativeTolerance: number,
): Contradiction | null {
  const ca = a.claim;
  const cb = b.claim;
  if (!isFiniteNumber(ca.value) || !isFiniteNumber(cb.value)) return null;
  // An unlabelled number cannot establish which endpoint it measures.
  if (!normalize(ca.metric) || normalize(ca.metric) !== normalize(cb.metric)) return null;
  // No implicit conversion or assumed unit on just one side.
  if (unitKey(ca.unit) !== unitKey(cb.unit)) return null;
  const rel = relativeDifference(ca.value, cb.value);
  if (rel <= relativeTolerance) return null;
  const severity: Contradiction['severity'] = rel > MAJOR_RELATIVE_DIFF ? 'major' : 'minor';
  const metricLabel = ca.metric ?? cb.metric ?? '(unlabeled metric)';
  return {
    type: 'numerical_mismatch',
    severity,
    subject,
    claimA: toRef(a),
    claimB: toRef(b),
    detail:
      `Conflicting values for "${metricLabel}" on "${subject}": ${ca.value} vs ${cb.value} ` +
      `(relative difference ${(rel * 100).toFixed(1)}%, beyond tolerance ${(relativeTolerance * 100).toFixed(1)}%).`,
  };
}

/** Calendar-valid ISO dates only; no clock or inferred source precedence. */
function validClaimDate(date: unknown): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

function hasInvalidDate(claim: EvidenceClaim): boolean {
  return claim.date !== undefined && !validClaimDate(claim.date);
}

/**
 * Detect a polarity conflict for a pair, or null if none. Returns either a
 * temporal_inconsistency (opposite polarity + differing valid dates, unresolved,
 * major) or a direct_conflict (opposite polarity, critical).
 */
function detectPolarityConflict(
  a: IndexedClaim,
  b: IndexedClaim,
  subject: string,
): Contradiction | null {
  const ca = a.claim;
  const cb = b.claim;
  if (!oppositePolarity(ca, cb)) return null;

  const bothDated = validClaimDate(ca.date) && validClaimDate(cb.date);
  if (bothDated && ca.date !== cb.date) {
    return {
      type: 'temporal_inconsistency',
      severity: 'major',
      subject,
      claimA: toRef(a),
      claimB: toRef(b),
      detail:
        `Unresolved opposite polarity assertions for "${subject}" on different dates ` +
        `(${a.refId}: ${ca.polarity} @ ${ca.date} vs ${b.refId}: ${cb.polarity} @ ${cb.date}); ` +
        'dates alone do not establish which claim controls. Verify scope, population, methods and source authority before resolving the disagreement.',
    };
  }

  return {
    type: 'direct_conflict',
    severity: 'critical',
    subject,
    claimA: toRef(a),
    claimB: toRef(b),
    detail:
      `Directly conflicting polarity for "${subject}": ` +
      `${ca.polarity} (${a.refId}) vs ${cb.polarity} (${b.refId}).`,
  };
}

/** Record why a pair can or cannot support a structural comparison. */
function comparablePair(a: IndexedClaim, b: IndexedClaim, display: string, notes: Set<string>): boolean {
  const metricA = normalize(a.claim.metric);
  const metricB = normalize(b.claim.metric);
  const pair = `${a.refId} / ${b.refId} on "${display}"`;
  if (metricA !== metricB) {
    notes.add(!metricA || !metricB
      ? `Metric missing for ${pair}; endpoints were not compared.`
      : `Different metrics for ${pair}; endpoints were not compared.`);
    return false;
  }
  if (isFiniteNumber(a.claim.value) && isFiniteNumber(b.claim.value)) {
    const unitA = unitKey(a.claim.unit);
    const unitB = unitKey(b.claim.unit);
    if (!metricA) notes.add(`Metric missing for ${pair}; numerical values were not compared.`);
    else if (unitA !== unitB) notes.add(!unitA || !unitB
      ? `Unit missing on one side for ${pair}; numerical values were not compared.`
      : `Different units for ${pair}; numerical values were not compared. Supply an explicit verified conversion if comparison is needed.`);
    else if (!unitA) notes.add(`Units unspecified for ${pair}; any numerical mismatch is preliminary until the units and scale are verified.`);
  }
  return true;
}

function claimInputIssues(raw: unknown, index: number): string[] {
  const path = `claims[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [`${path} must be a structured object.`];
  const claim = raw as Record<string, unknown>;
  const issues: string[] = [];
  if (!normalize(claim.subject as string)) issues.push(`${path}.subject must be a non-empty string.`);
  for (const key of ['id', 'source', 'metric', 'unit', 'date', 'text']) {
    if (claim[key] !== undefined && typeof claim[key] !== 'string') issues.push(`${path}.${key} must be a string when supplied.`);
  }
  if (claim.value !== undefined && !isFiniteNumber(claim.value)) issues.push(`${path}.value must be a finite number when supplied.`);
  if (claim.polarity !== undefined && !['positive', 'negative', 'neutral'].includes(claim.polarity as string)) issues.push(`${path}.polarity must be positive, negative or neutral.`);
  return issues;
}

function contradictionInputIssues(claims: unknown, tolerance: unknown): string[] {
  const issues = Array.isArray(claims) ? claims.flatMap(claimInputIssues) : ['claims must be an array; unavailable claims are not an empty evidence result.'];
  if (tolerance !== undefined && (!isFiniteNumber(tolerance) || tolerance < 0)) issues.push('relativeTolerance must be a finite non-negative number when supplied.');
  return issues;
}

function hasComparableFields(a: EvidenceClaim, b: EvidenceClaim): boolean {
  const numeric = !!normalize(a.metric) && isFiniteNumber(a.value) && isFiniteNumber(b.value) && unitKey(a.unit) === unitKey(b.unit);
  return numeric || (a.polarity !== undefined && b.polarity !== undefined);
}

function groupClaims(considered: IndexedClaim[]): Map<string, { display: string; members: IndexedClaim[] }> {
  // Group considered claims by normalized subject, keeping first original casing.
  const groups = new Map<string, { display: string; members: IndexedClaim[] }>();
  for (const ic of considered) {
    const key = normalize(ic.claim.subject);
    const existing = groups.get(key);
    if (existing) existing.members.push(ic);
    else groups.set(key, { display: ic.claim.subject, members: [ic] });
  }

  return groups;
}

const TYPE_ORDER: Record<ContradictionType, number> = {
  numerical_mismatch: 0,
  direct_conflict: 1,
  temporal_inconsistency: 2,
};

/**
 * Detect structural contradictions among a set of evidence claims, BEFORE synthesis.
 *
 * Pure / deterministic: malformed supplied inputs return an unassessed report;
 * each unordered pair within the same subject is evaluated once; findings are returned
 * in a stable order (by subject, then type precedence, then claimA id, then claimB id).
 *
 * @param claims  the structured evidence claims to check.
 * @param options.relativeTolerance  numerical_mismatch tolerance (default 0.1).
 */
export function detectContradictions(
  rawClaims: unknown,
  options?: { relativeTolerance?: unknown },
): ContradictionReport {
  const inputIssues = contradictionInputIssues(rawClaims, options?.relativeTolerance);
  if (inputIssues.length > 0) return {
    contradictions: [], checkedClaims: 0, subjectsWithConflicts: [], assessed: false, comparedPairs: 0, inputIssues,
    notes: [STRUCTURAL_NOTE, 'Evidence contradictions were not assessed because supplied inputs are invalid. Correct the named tool fields using available source context and retry before requesting client clarification.', ...inputIssues],
  };
  const claims = rawClaims as EvidenceClaim[];
  const relativeTolerance = (options?.relativeTolerance ?? DEFAULT_RELATIVE_TOLERANCE) as number;

  // Validated claims retain their original order and fallback reference ids.
  const considered: IndexedClaim[] = claims.map((claim, index) => ({
    claim, refId: normalize(claim.id) ? claim.id as string : `#${index}`, index,
  }));

  const groups = groupClaims(considered);

  const notes = new Set<string>([STRUCTURAL_NOTE,
    'Matching subjects and metrics do not establish comparable populations, methods, timepoints or source authority. ' +
    'Verify applicability and ask for consequential missing context before resolving a scientific disagreement.']);
  if (considered.length === 0) notes.add('Assessment not performed: no usable claims were supplied. This is not evidence of consistency.');
  for (const { claim, refId } of considered) {
    if (hasInvalidDate(claim)) notes.add(`Invalid claim date for ${refId}; temporal ordering was not inferred.`);
  }
  let comparedPairs = 0;
  const contradictions: Contradiction[] = [];
  const subjectsWithConflicts = new Set<string>();

  for (const { display, members } of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (!comparablePair(a, b, display, notes)) continue;
        comparedPairs += Number(hasComparableFields(a.claim, b.claim));
        const numeric = detectNumericalMismatch(a, b, display, relativeTolerance);
        if (numeric) {
          contradictions.push(numeric);
          subjectsWithConflicts.add(display);
        }
        const polarity = detectPolarityConflict(a, b, display);
        if (polarity) {
          contradictions.push(polarity);
          subjectsWithConflicts.add(display);
        }
      }
    }
  }

  if (comparedPairs === 0) notes.add('Evidence contradictions were not assessed: no comparable claim pairs were supplied. An empty findings list is not evidence of consistency.');
  contradictions.sort((x, y) => {
    if (x.subject !== y.subject) return x.subject < y.subject ? -1 : 1;
    if (TYPE_ORDER[x.type] !== TYPE_ORDER[y.type]) return TYPE_ORDER[x.type] - TYPE_ORDER[y.type];
    if (x.claimA.id !== y.claimA.id) return x.claimA.id < y.claimA.id ? -1 : 1;
    if (x.claimB.id !== y.claimB.id) return x.claimB.id < y.claimB.id ? -1 : 1;
    return 0;
  });

  return {
    contradictions,
    checkedClaims: considered.length,
    assessed: comparedPairs > 0,
    comparedPairs,
    inputIssues,
    subjectsWithConflicts: Array.from(subjectsWithConflicts).sort(),
    notes: [...notes],
  };
}

export default {
  CONTRADICTION_TYPES,
  detectContradictions,
};
