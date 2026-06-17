/**
 * Honesty envelope — the platform's defining moat made reusable.
 *
 * The product sells "decision confidence with its denominator attached, not
 * certainty": every quantitative output should carry its confidence, the n it
 * is based on, and how fresh that evidence is — and "final-ready" must be
 * blocked when a dependency is missing or stale, with the blockers shown. This
 * generalises the confidence logic from the pre-mortem into a primitive any
 * AnA output can stamp.
 *
 * Pure and deterministic (no I/O, no LLM) so the confidence/freshness/gating
 * rules are directly unit-testable.
 */

export type Confidence = 'low' | 'medium' | 'high';

export interface EvidenceBasis {
  /** Number of data points / precedents the claim is based on (the denominator). */
  n: number;
  /** Age of the freshest supporting evidence, in days. Omit when unknown. */
  freshnessDays?: number;
  /** Maximum age (days) before evidence is considered stale. Default 180. */
  maxFreshnessDays?: number;
}

export interface HonestyEnvelope {
  confidence: Confidence;
  n: number;
  freshnessDays: number | null;
  stale: boolean;
  /** Human-readable, e.g. "confidence: medium (n=28, freshness: 6 days ago)". */
  label: string;
}

/**
 * Confidence as a function of evidence volume, downgraded one step when the
 * evidence is stale. Never asserted beyond the data: n=0 is always 'low'.
 */
export function confidenceFromEvidence(basis: EvidenceBasis): Confidence {
  const n = Math.max(0, Math.floor(basis.n));
  const maxFresh = basis.maxFreshnessDays ?? 180;
  let level: Confidence = n >= 20 ? 'high' : n >= 5 ? 'medium' : 'low';

  const stale = typeof basis.freshnessDays === 'number' && basis.freshnessDays > maxFresh;
  if (stale) level = level === 'high' ? 'medium' : 'low';
  return level;
}

function freshnessPhrase(freshnessDays: number | undefined, stale: boolean): string | null {
  if (typeof freshnessDays !== 'number') return null;
  if (freshnessDays <= 0) return 'freshness: today';
  const unit = freshnessDays === 1 ? 'day' : 'days';
  return `freshness: ${freshnessDays} ${unit} ago${stale ? ', STALE' : ''}`;
}

/** Build the full honesty envelope (confidence + n + freshness + label). */
export function buildHonestyEnvelope(basis: EvidenceBasis): HonestyEnvelope {
  const n = Math.max(0, Math.floor(basis.n));
  const maxFresh = basis.maxFreshnessDays ?? 180;
  const stale = typeof basis.freshnessDays === 'number' && basis.freshnessDays > maxFresh;
  const confidence = confidenceFromEvidence(basis);

  const parts = [`n=${n}`];
  const fresh = freshnessPhrase(basis.freshnessDays, stale);
  if (fresh) parts.push(fresh);

  return {
    confidence,
    n,
    freshnessDays: typeof basis.freshnessDays === 'number' ? basis.freshnessDays : null,
    stale,
    label:
      n === 0
        ? 'confidence: low (insufficient data — no supporting evidence; not a calibrated estimate)'
        : `confidence: ${confidence} (${parts.join(', ')})`,
  };
}

export interface Dependency {
  name: string;
  present: boolean;
  freshnessDays?: number;
}

export interface FinalReadyResult {
  ready: boolean;
  blockers: string[];
}

/**
 * Gate a "final-ready" claim: ready only when every dependency is present and
 * not stale. Returns the explicit blockers so they can be shown to the user
 * (never silently passes a stale/missing dependency).
 */
export function finalReadyGate(deps: Dependency[], maxFreshnessDays = 180): FinalReadyResult {
  const blockers: string[] = [];
  for (const d of deps) {
    if (!d.present) {
      blockers.push(`${d.name}: missing`);
    } else if (typeof d.freshnessDays === 'number' && d.freshnessDays > maxFreshnessDays) {
      blockers.push(`${d.name}: stale (${d.freshnessDays} days old, limit ${maxFreshnessDays})`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}
