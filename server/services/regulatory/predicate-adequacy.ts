/**
 * Predicate substantial-equivalence adequacy scoring (510(k) / De Novo screening).
 *
 * A pure, deterministic, transparent rubric that scores how adequate a candidate
 * predicate device is for a substantial-equivalence (SE) argument, from explicit
 * structured factors the caller supplies (product-code match, intended-use and
 * technological-characteristics alignment, review panel, clearance recency,
 * decision type, and adverse status). It does NOT read free text or call a model
 * — the caller (which has already read both device descriptions) provides the
 * comparison signals, and this engine combines them with fixed, inspectable
 * weights so the same inputs always produce the same score.
 *
 * This is a SCREENING AID, not a regulatory determination: it ranks candidate
 * predicates and surfaces the strengths/concerns a reviewer would weigh, so the
 * strongest predicate can be chosen and the weak points addressed before filing.
 * Every point of the score is attributable to a named factor, and any factor the
 * caller leaves unknown is reported as such rather than assumed favourable.
 *
 * No DB, no network, no LLM. Submission-defensible by construction: the rubric
 * and weights are explicit and the output explains itself.
 *
 * @module server/services/regulatory/predicate-adequacy
 */

export type Alignment = 'same' | 'similar' | 'different' | 'unknown';
export type PredicateDecision = 'SE' | 'NSE' | 'DENOVO_GRANT' | 'other' | 'unknown';
export type AdequacyBand = 'adequate' | 'marginal' | 'inadequate';

export interface PredicateCandidateInput {
  /** 510(k)/De Novo identifier, e.g. "K203456" / "DEN200012". */
  identifier: string;
  /** Optional human-readable device name for the report. */
  deviceName?: string;
  /** Subject vs predicate share the same FDA product code (same device type/regulation). */
  sameProductCode?: boolean;
  /** Intended-use / indications-for-use alignment between subject and predicate. */
  intendedUseAlignment?: Alignment;
  /** Technological-characteristics alignment between subject and predicate. */
  technologyAlignment?: Alignment;
  /** Subject vs predicate reviewed by the same FDA advisory panel/medical specialty. */
  samePanel?: boolean;
  /** Calendar year the predicate was cleared/granted (used for recency). */
  clearanceYear?: number;
  /** The predicate's own FDA decision. A non-SE/NSE predicate is a weak basis. */
  decision?: PredicateDecision;
  /** Predicate has been recalled, withdrawn, or is subject to a safety action. */
  adverseStatus?: boolean;
}

export interface PredicateAdequacyOptions {
  /** "Now" for recency scoring (defaults to the current calendar year). */
  currentYear?: number;
}

export interface FactorScore {
  factor: string;
  /** Points awarded for this factor. */
  awarded: number;
  /** Maximum points this factor can contribute. */
  max: number;
  /** Plain-language explanation of why these points were (or were not) awarded. */
  rationale: string;
}

export interface PredicateAdequacyResult {
  identifier: string;
  deviceName?: string;
  /** 0–100 adequacy score (sum of factor awards). */
  score: number;
  band: AdequacyBand;
  factors: FactorScore[];
  /** Strong points supporting the SE argument. */
  strengths: string[];
  /** Concerns that weaken the SE argument or need to be addressed before filing. */
  concerns: string[];
  /** Factors the caller did not supply (scored as 0, not assumed favourable). */
  unknownFactors: string[];
}

export interface ScorePredicateAdequacyInput {
  candidates: PredicateCandidateInput[];
  options?: PredicateAdequacyOptions;
}

export interface ScorePredicateAdequacyResult {
  /** Candidates scored, ranked highest-adequacy first (ties keep input order). */
  ranked: PredicateAdequacyResult[];
  /** The highest-scoring candidate's identifier, or null if none were supplied. */
  recommended: string | null;
  methodology: string;
  disclaimer: string;
}

/**
 * Fixed, inspectable rubric. The weights sum to 100. Product-code identity and
 * intended-use alignment dominate because they are the gates FDA applies first
 * in the SE decision tree; technological characteristics, panel, recency,
 * decision type and adverse status refine the ranking.
 */
const WEIGHTS = {
  productCode: 30,
  intendedUse: 25,
  technology: 20,
  panel: 8,
  recency: 7,
  decision: 6,
  adverse: 4,
} as const;

const ALIGNMENT_FRACTION: Record<Alignment, number> = {
  same: 1,
  similar: 0.5,
  different: 0,
  unknown: 0,
};

function bandFor(score: number): AdequacyBand {
  if (score >= 75) return 'adequate';
  if (score >= 50) return 'marginal';
  return 'inadequate';
}

function scoreOne(
  c: PredicateCandidateInput,
  currentYear: number,
): PredicateAdequacyResult {
  const factors: FactorScore[] = [];
  const strengths: string[] = [];
  const concerns: string[] = [];
  const unknownFactors: string[] = [];

  // ── Product code ──
  if (c.sameProductCode === undefined) {
    unknownFactors.push('sameProductCode');
    factors.push({ factor: 'Product code', awarded: 0, max: WEIGHTS.productCode, rationale: 'Product-code match not provided; scored 0 (not assumed).' });
  } else if (c.sameProductCode) {
    factors.push({ factor: 'Product code', awarded: WEIGHTS.productCode, max: WEIGHTS.productCode, rationale: 'Same FDA product code — same device type and regulation as the subject.' });
    strengths.push('Shares the subject device\'s FDA product code.');
  } else {
    factors.push({ factor: 'Product code', awarded: 0, max: WEIGHTS.productCode, rationale: 'Different product code — a cross-product-code predicate weakens the SE basis and may need a special/abbreviated rationale.' });
    concerns.push('Different product code from the subject device.');
  }

  // ── Intended use ──
  const iu = c.intendedUseAlignment ?? 'unknown';
  const iuPts = Math.round(WEIGHTS.intendedUse * ALIGNMENT_FRACTION[iu]);
  factors.push({ factor: 'Intended use', awarded: iuPts, max: WEIGHTS.intendedUse, rationale: `Intended-use alignment: ${iu}.` });
  if (iu === 'unknown') unknownFactors.push('intendedUseAlignment');
  if (iu === 'same') strengths.push('Same intended use / indications for use.');
  if (iu === 'different') concerns.push('Different intended use — likely fatal to a direct SE claim.');

  // ── Technological characteristics ──
  const tech = c.technologyAlignment ?? 'unknown';
  const techPts = Math.round(WEIGHTS.technology * ALIGNMENT_FRACTION[tech]);
  factors.push({ factor: 'Technological characteristics', awarded: techPts, max: WEIGHTS.technology, rationale: `Technology alignment: ${tech}.` });
  if (tech === 'unknown') unknownFactors.push('technologyAlignment');
  if (tech === 'different') concerns.push('Different technological characteristics — requires performance data showing they do not raise new questions of safety/effectiveness.');

  // ── Review panel ──
  if (c.samePanel === undefined) {
    unknownFactors.push('samePanel');
    factors.push({ factor: 'Review panel', awarded: 0, max: WEIGHTS.panel, rationale: 'Same-panel status not provided; scored 0.' });
  } else if (c.samePanel) {
    factors.push({ factor: 'Review panel', awarded: WEIGHTS.panel, max: WEIGHTS.panel, rationale: 'Same FDA advisory panel / medical specialty.' });
  } else {
    factors.push({ factor: 'Review panel', awarded: 0, max: WEIGHTS.panel, rationale: 'Different review panel.' });
    concerns.push('Cleared under a different FDA review panel.');
  }

  // ── Clearance recency ── (full marks ≤5y, linear decline to 0 at ≥20y)
  if (c.clearanceYear === undefined || !Number.isFinite(c.clearanceYear)) {
    unknownFactors.push('clearanceYear');
    factors.push({ factor: 'Clearance recency', awarded: 0, max: WEIGHTS.recency, rationale: 'Clearance year not provided; scored 0.' });
  } else {
    const age = Math.max(0, currentYear - c.clearanceYear);
    const frac = age <= 5 ? 1 : age >= 20 ? 0 : (20 - age) / 15;
    const recPts = Math.round(WEIGHTS.recency * frac);
    factors.push({ factor: 'Clearance recency', awarded: recPts, max: WEIGHTS.recency, rationale: `Predicate is ~${age} year(s) old.` });
    if (age > 10) concerns.push(`Older predicate (~${age} years); FDA prefers recent predicates reflecting current technology.`);
  }

  // ── Decision type ──
  const dec = c.decision ?? 'unknown';
  const decPts = dec === 'SE' || dec === 'DENOVO_GRANT' ? WEIGHTS.decision : 0;
  factors.push({ factor: 'Decision type', awarded: decPts, max: WEIGHTS.decision, rationale: `Predicate decision: ${dec}.` });
  if (dec === 'unknown') unknownFactors.push('decision');
  if (dec === 'NSE') concerns.push('Predicate itself was found Not Substantially Equivalent — not a valid predicate.');

  // ── Adverse status ──
  if (c.adverseStatus === undefined) {
    unknownFactors.push('adverseStatus');
    factors.push({ factor: 'Adverse status', awarded: 0, max: WEIGHTS.adverse, rationale: 'Recall/withdrawal status not provided; scored 0.' });
  } else if (c.adverseStatus) {
    factors.push({ factor: 'Adverse status', awarded: 0, max: WEIGHTS.adverse, rationale: 'Predicate has a recall/withdrawal/safety action.' });
    concerns.push('Predicate is subject to a recall, withdrawal, or safety action — citing it invites scrutiny.');
  } else {
    factors.push({ factor: 'Adverse status', awarded: WEIGHTS.adverse, max: WEIGHTS.adverse, rationale: 'No known recall/withdrawal/safety action.' });
  }

  const score = factors.reduce((s, f) => s + f.awarded, 0);
  return {
    identifier: c.identifier,
    deviceName: c.deviceName,
    score,
    band: bandFor(score),
    factors,
    strengths,
    concerns,
    unknownFactors,
  };
}

/**
 * Score and rank candidate predicates for substantial-equivalence adequacy.
 * Deterministic: identical input yields identical output. Ranks highest score
 * first; ties preserve input order (stable).
 */
export function scorePredicateAdequacy(
  input: ScorePredicateAdequacyInput,
): ScorePredicateAdequacyResult {
  if (!input || !Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new Error('candidates[] is required and must be non-empty');
  }
  for (const c of input.candidates) {
    if (!c || typeof c.identifier !== 'string' || c.identifier.trim() === '') {
      throw new Error('each candidate requires a non-empty identifier');
    }
  }
  const currentYear = input.options?.currentYear ?? new Date().getUTCFullYear();

  const scored = input.candidates.map((c) => scoreOne(c, currentYear));
  // Stable sort by score desc.
  const ranked = scored
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.score - a.r.score) || (a.i - b.i))
    .map((x) => x.r);

  return {
    ranked,
    recommended: ranked.length > 0 ? ranked[0].identifier : null,
    methodology:
      'Weighted rubric (sum=100): product code 30, intended use 25, technological characteristics 20, ' +
      'review panel 8, clearance recency 7, decision type 6, adverse status 4. Alignment maps same=full, ' +
      'similar=half, different/unknown=0. Recency: full ≤5y, linear to 0 at ≥20y. Bands: ≥75 adequate, ' +
      '≥50 marginal, else inadequate.',
    disclaimer:
      'Screening aid only — NOT a regulatory determination of substantial equivalence. Scores combine the ' +
      'structured factors supplied; unknown factors score 0 (never assumed favourable). Confirm against the ' +
      'device description, the FDA product-code regulation, and the 510(k)/De Novo decision summary before filing.',
  };
}
