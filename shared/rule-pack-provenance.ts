/**
 * What a filing outline was actually built FROM, in one vocabulary.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * `migrations/20260810c_rule_pack_provenance.sql` added five columns to
 * `c2c_rule_packs` so a rule pack could finally say whether its section tree
 * was transcribed from a regulation that enumerates its own contents, or
 * constructed by reasoning about a regulation that does not. That migration
 * fixed the record. It did not fix the product: no route selected the columns
 * and no surface rendered them, so a customer building a submission against a
 * reasoned construction still had no way to know that is what they were doing
 * — the exact sentence the migration was written to make false.
 *
 * This module is the single definition both sides use. The server normalises
 * rows through `normalizeRulePackProvenance` before serialising, and the
 * editor renders `describeRulePackProvenance`. One vocabulary, so the API and
 * the UI cannot drift into disagreeing about what a pack claims.
 *
 * ── Why normalisation is conservative, not pass-through ──────────────────────
 * Every unrecognised, absent, or null value collapses to
 * ('undeclared','unknown','unreviewed') — the same conservative default the
 * migration applies before any specific attestation. Two things make that
 * necessary rather than decorative:
 *
 *   1. The CHECK constraints only exist AFTER the migration has run. A database
 *      that has not taken it yet has no column at all, and the route reads it
 *      via `to_jsonb(rp) ->> '…'`, which yields NULL rather than erroring.
 *   2. These values arrive at the client over HTTP. A value this module does
 *      not recognise must never be forwarded to the screen, because the failure
 *      mode of forwarding is a filer reading an authority claim nothing in this
 *      codebase stands behind.
 *
 * Getting the mapping wrong can therefore cost visibility. It cannot
 * manufacture authority.
 *
 * @module shared/rule-pack-provenance
 */

/** What kind of thing the outline was derived from. */
export type RulePackSourceBasis =
  /** The regulation enumerates its own contents; the tree is read off the text. */
  | 'statutory_transcription'
  /** ICH M4 and equivalents — a published international standard. */
  | 'harmonised_standard'
  /** An agency guidance document's structure, which is not law. */
  | 'guidance_transcription'
  /** No enumerated structure exists; the tree is built from the obligations. */
  | 'reasoned_construction'
  /** Not yet attested. Never treat as verified. */
  | 'undeclared';

export type RulePackConfidence = 'high' | 'medium' | 'low' | 'unknown';

/** Whether a regulatory professional has signed the outline off. */
export type RulePackReviewStatus = 'unreviewed' | 'reviewed';

export interface RulePackProvenance {
  sourceBasis: RulePackSourceBasis;
  confidence: RulePackConfidence;
  reviewStatus: RulePackReviewStatus;
  /** The rule the outline answers to, e.g. '21 CFR 814.20(b)'. */
  governingRule: string | null;
  /** What specifically is not settled about this outline. */
  uncertainties: string | null;
}

const SOURCE_BASIS_VALUES: readonly RulePackSourceBasis[] = [
  'statutory_transcription',
  'harmonised_standard',
  'guidance_transcription',
  'reasoned_construction',
  'undeclared',
];

const CONFIDENCE_VALUES: readonly RulePackConfidence[] = ['high', 'medium', 'low', 'unknown'];

const REVIEW_STATUS_VALUES: readonly RulePackReviewStatus[] = ['unreviewed', 'reviewed'];

/**
 * The state assumed for anything not positively attested.
 *
 * Deliberately the weakest claim the vocabulary can express: unknown basis,
 * unknown confidence, nobody has reviewed it.
 */
export const UNDECLARED_PROVENANCE: Readonly<RulePackProvenance> = Object.freeze({
  sourceBasis: 'undeclared',
  confidence: 'unknown',
  reviewStatus: 'unreviewed',
  governingRule: null,
  uncertainties: null,
});

function oneOf<T extends string>(values: readonly T[], raw: unknown, fallback: T): T {
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Trim to a non-empty string, or null. Whitespace-only is not a statement. */
function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Coerce a database row or an API payload into the vocabulary.
 *
 * Accepts both the snake_case shape Postgres returns and the camelCase shape
 * the API emits, so the same function guards the row on the way out and the
 * payload on the way in.
 */
export function normalizeRulePackProvenance(raw: unknown): RulePackProvenance {
  if (!raw || typeof raw !== 'object') return { ...UNDECLARED_PROVENANCE };
  const r = raw as Record<string, unknown>;
  const pick = (snake: string, camel: string) => (r[snake] !== undefined ? r[snake] : r[camel]);

  return {
    sourceBasis: oneOf(SOURCE_BASIS_VALUES, pick('source_basis', 'sourceBasis'), 'undeclared'),
    confidence: oneOf(CONFIDENCE_VALUES, pick('confidence', 'confidence'), 'unknown'),
    reviewStatus: oneOf(REVIEW_STATUS_VALUES, pick('review_status', 'reviewStatus'), 'unreviewed'),
    governingRule: text(pick('governing_rule', 'governingRule')),
    uncertainties: text(pick('uncertainties', 'uncertainties')),
  };
}

/**
 * How a chip should be toned. Not severity — what the reader has to do next.
 *
 * 'idle' is the resting state for an unreviewed transcription, NOT 'ok'.
 * Every pack in this table is currently `unreviewed`, including the ones
 * transcribed verbatim from FDA regulation, and painting those green would
 * reintroduce the false equivalence the provenance columns were added to
 * remove. Green is reserved for an outline a regulatory professional has
 * actually signed off.
 */
export type RulePackProvenanceTone = 'ok' | 'idle' | 'warn' | 'err';

export interface RulePackProvenanceSummary {
  /** Two or three words for a chip. */
  headline: string;
  /** One sentence saying what the reader should do about it. */
  detail: string;
  tone: RulePackProvenanceTone;
}

const BASIS_HEADLINE: Record<RulePackSourceBasis, string> = {
  statutory_transcription: 'From regulation',
  harmonised_standard: 'Harmonised standard',
  guidance_transcription: 'From guidance',
  reasoned_construction: 'Constructed',
  undeclared: 'Basis undeclared',
};

const BASIS_DETAIL: Record<RulePackSourceBasis, string> = {
  statutory_transcription:
    'The section tree is transcribed from a regulation that enumerates its own contents.',
  harmonised_standard:
    'The section tree follows a published international standard rather than one agency’s regulation.',
  guidance_transcription:
    'The section tree follows an agency guidance document. Guidance states current thinking; it is not binding law.',
  reasoned_construction:
    'No enumerated structure exists for this pathway, so this tree was constructed by reasoning about the regulation’s obligations. Check it against the regulation before relying on it.',
  undeclared:
    'This outline does not record what it was built from. Treat nothing in it as verified.',
};

/**
 * Turn provenance into the words and tone a filer sees.
 *
 * The review sentence is appended for every unreviewed pack regardless of
 * basis, because "faithfully transcribed" and "right pathway for this product"
 * are different claims and only the first is being made here.
 */
export function describeRulePackProvenance(p: RulePackProvenance): RulePackProvenanceSummary {
  const reviewed = p.reviewStatus === 'reviewed';

  let tone: RulePackProvenanceTone;
  if (reviewed) tone = 'ok';
  else if (p.sourceBasis === 'undeclared') tone = 'err';
  else if (p.sourceBasis === 'reasoned_construction') tone = 'warn';
  else tone = 'idle';

  const parts = [BASIS_DETAIL[p.sourceBasis]];
  if (p.governingRule) parts.push(`Governing rule: ${p.governingRule}.`);
  if (p.uncertainties) parts.push(p.uncertainties);
  if (!reviewed) {
    parts.push('Not reviewed by a regulatory professional.');
  }

  return {
    headline: reviewed ? `${BASIS_HEADLINE[p.sourceBasis]} · reviewed` : BASIS_HEADLINE[p.sourceBasis],
    detail: parts.join(' '),
    tone,
  };
}

/**
 * The SQL select-list fragment that reads provenance from an aliased
 * `c2c_rule_packs` row without assuming the migration has run.
 *
 * `to_jsonb(alias) ->> 'col'` yields NULL for a column that does not exist,
 * where a bare `SELECT source_basis` raises 42703 and takes the whole route
 * down with it. That window is real: application code deploys before
 * migrations run, and the outline route is what the document editor loads.
 *
 * Verified against Postgres both ways — absent column yields NULL, present
 * column yields the value.
 *
 * @param alias the table alias used for c2c_rule_packs in the query
 */
export function rulePackProvenanceSelectSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`rulePackProvenanceSelectSql: unsafe alias ${JSON.stringify(alias)}`);
  }
  return [
    'source_basis',
    'confidence',
    'review_status',
    'governing_rule',
    'uncertainties',
  ]
    .map((col) => `to_jsonb(${alias}) ->> '${col}' AS ${col}`)
    .join(',\n              ');
}
