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
 *      relative difference beyond tolerance. severity major if relative diff > 0.25,
 *      else minor.
 *   2. direct_conflict — same subject, opposite polarity (positive vs negative).
 *      severity critical.
 *   3. temporal_inconsistency — same subject, opposite polarity AND both dated with
 *      DIFFERING dates → the later-dated claim is treated as superseding; severity
 *      major (a dated supersession is softer than a bare direct conflict).
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
  /** How many claims were considered (had a non-empty subject). */
  checkedClaims: number;
  /** Subjects (original casing) that had at least one contradiction, sorted. */
  subjectsWithConflicts: string[];
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
  return (s ?? '').trim().toLowerCase();
}

function toRef(ic: IndexedClaim): ContradictionClaimRef {
  const { claim, refId } = ic;
  const ref: ContradictionClaimRef = { id: refId };
  if (claim.source !== undefined) ref.source = claim.source;
  if (claim.metric !== undefined) ref.metric = claim.metric;
  if (isFiniteNumber(claim.value)) ref.value = claim.value;
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
  // Require the SAME metric (case-insensitive). Treat both-absent as the same metric.
  if (normalize(ca.metric) !== normalize(cb.metric)) return null;
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

/**
 * Detect a polarity conflict for a pair, or null if none. Returns either a
 * temporal_inconsistency (opposite polarity + differing dates → later supersedes,
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

  const bothDated = typeof ca.date === 'string' && typeof cb.date === 'string';
  if (bothDated && ca.date !== cb.date) {
    const aIsLater = (ca.date as string) > (cb.date as string);
    const later = aIsLater ? a : b;
    return {
      type: 'temporal_inconsistency',
      severity: 'major',
      subject,
      claimA: toRef(a),
      claimB: toRef(b),
      detail:
        `Opposite polarity assertions for "${subject}" on different dates ` +
        `(${ca.polarity} @ ${ca.date} vs ${cb.polarity} @ ${cb.date}); ` +
        `the later-dated claim (${later.refId} @ ${later.claim.date}) supersedes.`,
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

const TYPE_ORDER: Record<ContradictionType, number> = {
  numerical_mismatch: 0,
  direct_conflict: 1,
  temporal_inconsistency: 2,
};

/**
 * Detect structural contradictions among a set of evidence claims, BEFORE synthesis.
 *
 * Pure / deterministic: claims missing a (trimmed, non-empty) subject are ignored;
 * each unordered pair within the same subject is evaluated once; findings are returned
 * in a stable order (by subject, then type precedence, then claimA id, then claimB id).
 *
 * @param claims  the structured evidence claims to check.
 * @param options.relativeTolerance  numerical_mismatch tolerance (default 0.1).
 */
export function detectContradictions(
  claims: EvidenceClaim[],
  options?: { relativeTolerance?: number },
): ContradictionReport {
  const relativeTolerance =
    options && isFiniteNumber(options.relativeTolerance) && options.relativeTolerance >= 0
      ? options.relativeTolerance
      : DEFAULT_RELATIVE_TOLERANCE;

  // Keep only claims with a usable subject, preserving original index for ref ids.
  const considered: IndexedClaim[] = [];
  claims.forEach((claim, index) => {
    if (!claim || typeof claim.subject !== 'string' || claim.subject.trim() === '') return;
    const refId =
      typeof claim.id === 'string' && claim.id.trim() !== '' ? claim.id : `#${index}`;
    considered.push({ claim, refId, index });
  });

  // Group considered claims by normalized subject, keeping first original casing.
  const groups = new Map<string, { display: string; members: IndexedClaim[] }>();
  for (const ic of considered) {
    const key = normalize(ic.claim.subject);
    const existing = groups.get(key);
    if (existing) existing.members.push(ic);
    else groups.set(key, { display: ic.claim.subject, members: [ic] });
  }

  const contradictions: Contradiction[] = [];
  const subjectsWithConflicts = new Set<string>();

  for (const { display, members } of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
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
    subjectsWithConflicts: Array.from(subjectsWithConflicts).sort(),
    notes: [STRUCTURAL_NOTE],
  };
}

export default {
  CONTRADICTION_TYPES,
  detectContradictions,
};
