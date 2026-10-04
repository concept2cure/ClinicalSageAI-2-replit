/**
 * What was checked about one AnA answer, as the client keeps it: read once
 * from the live `grounding_strip` event and once from a stored message, so a
 * reopened conversation shows the same strip the person saw (2026-10-04, AnA
 * reasoning).
 *
 * Two readings, never merged (server/services/ana/turn-verification.ts):
 *   - `check`: the engine's comparison of the answer's identifiers,
 *     regulations, quotes and figures with what AnA consulted this turn, and
 *     the verdicts the answer states. It leads.
 *   - the label fields: AnA's own [KNOWN] / [INFERRED] / [MISSING] labels.
 *
 * `attempted` is carried: a label check that ran and failed is not "not
 * assessed". Until this module the client dropped it, and every failed
 * verdict (any overclaim, any contradiction) rendered as not assessed.
 *
 * Pure: no React, no I/O. A field of the wrong type is dropped, never
 * guessed; a malformed check is no check.
 *
 * @module client/src/concept2cure/components/ana/anaAnswerCheck
 */

/** A claim the check read: its kind (a trial id, a figure, …) and its text. */
export interface CheckedClaim {
  kind: string;
  text: string;
}

/** The engine's check (server/services/ana/answer-grounding.ts, AnswerCheck). */
export interface AnswerCheckView {
  engine: string;
  /** 'no_sources': AnA consulted nothing this turn; claims are unchecked, not "not found". */
  basis: 'sources' | 'no_sources';
  claims: number;
  checked: number;
  found: number;
  notFound: CheckedClaim[];
  unchecked: CheckedClaim[];
  sources: string[];
  unreadable: string[];
  verdicts: { text: string; reason: string }[];
}

/** What the strip under an answer shows. */
export interface AnaGroundingEvidence {
  /** AnA's labels were assessed (a short answer is not). */
  attempted: boolean;
  /** The labels passed: no overclaim, no contradiction, few unlabelled claims. */
  validated: boolean;
  /** [KNOWN] and [INFERRED] labels: AnA's own, not sources anything read. */
  sourceCount: number;
  /** Claims with a [KNOWN] or [INFERRED] label nearby. */
  groundedClaims: number;
  /** Claims with no label nearby, and overclaims. */
  weakClaims: number;
  /** Claims AnA marked [MISSING]. */
  missingSupport: number;
  riskSummary?: string;
  flaggedClaims?: { kind: 'ungrounded' | 'overclaim' | 'contradiction'; text: string }[];
  /** The engine's check, when one ran. */
  check?: AnswerCheckView;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const strings = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((s) => typeof s === 'string') ? (v as string[]) : null;
const claims = (v: unknown): CheckedClaim[] | null =>
  Array.isArray(v) && v.every((c) => isObj(c) && typeof c.kind === 'string' && typeof c.text === 'string')
    ? v.map((c) => ({ kind: (c as CheckedClaim).kind, text: (c as CheckedClaim).text }))
    : null;

/** The engine's check, or undefined when the value is not one. */
export function readAnswerCheck(raw: unknown): AnswerCheckView | undefined {
  if (!isObj(raw)) return undefined;
  const basis = raw.basis === 'sources' || raw.basis === 'no_sources' ? raw.basis : null;
  const counts = [num(raw.claims), num(raw.checked), num(raw.found)];
  const notFound = claims(raw.notFound);
  const unchecked = claims(raw.unchecked);
  const sources = strings(raw.sources);
  const unreadable = strings(raw.unreadable);
  const verdicts =
    Array.isArray(raw.verdicts) && raw.verdicts.every((v) => isObj(v) && typeof v.text === 'string' && typeof v.reason === 'string')
      ? raw.verdicts.map((v) => ({ text: (v as { text: string }).text, reason: (v as { reason: string }).reason }))
      : null;
  if (typeof raw.engine !== 'string' || !basis || counts.some((c) => c === null)) return undefined;
  if (!notFound || !unchecked || !sources || !unreadable || !verdicts) return undefined;
  return {
    engine: raw.engine,
    basis,
    claims: counts[0]!,
    checked: counts[1]!,
    found: counts[2]!,
    notFound,
    unchecked,
    sources,
    unreadable,
    verdicts,
  };
}

const FLAG_KINDS = new Set(['ungrounded', 'overclaim', 'contradiction']);

/** AnA's labels, from the server's evidence verdict (snake_case, as sent). */
function readLabels(raw: unknown): Omit<AnaGroundingEvidence, 'check'> {
  const ev = isObj(raw) ? raw : {};
  const flagged = Array.isArray(ev.flagged_claims)
    ? ev.flagged_claims
        .filter((c): c is { kind: string; text: string } => isObj(c) && typeof c.text === 'string' && typeof c.kind === 'string')
        .filter((c) => FLAG_KINDS.has(c.kind))
        .map((c) => ({ kind: c.kind as 'ungrounded' | 'overclaim' | 'contradiction', text: c.text }))
    : undefined;
  return {
    attempted: ev.attempted === true,
    validated: ev.validated === true,
    sourceCount: num(ev.source_count) ?? 0,
    groundedClaims: num(ev.grounded_claim_count) ?? 0,
    weakClaims: num(ev.weak_or_ungrounded_claim_count) ?? 0,
    missingSupport: num(ev.missing_support_count) ?? 0,
    riskSummary: typeof ev.reviewer_risk_summary === 'string' ? ev.reviewer_risk_summary : undefined,
    flaggedClaims: flagged,
  };
}

/** The strip from a live `grounding_strip` event: `{ evidence, check }`. */
export function readGroundingStrip(event: unknown): AnaGroundingEvidence {
  const e = isObj(event) ? event : {};
  const check = readAnswerCheck(e.check);
  return { ...readLabels(e.evidence), ...(check ? { check } : {}) };
}

/**
 * The strip from a stored assistant message's metadata (`verification`:
 * `{ check, labels }`), or undefined for a message stored before checks were
 * kept, which shows no strip rather than an invented one.
 */
export function readStoredVerification(metadata: unknown): AnaGroundingEvidence | undefined {
  const v = isObj(metadata) && isObj(metadata.verification) ? metadata.verification : null;
  if (!v) return undefined;
  return readGroundingStrip({ evidence: v.labels, check: v.check });
}
