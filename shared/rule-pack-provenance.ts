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

/**
 * What a sign-off is actually worth right now.
 *
 * `reviewed_but_changed` is the state that makes the other two trustworthy. A
 * review attests to a specific section tree; if the tree is edited afterwards,
 * the sign-off silently starts covering content nobody approved. Collapsing
 * that into 'reviewed' would be the most damaging simplification available
 * here, because it is the case where a filer is MOST likely to rely on the
 * claim and LEAST likely to suspect it.
 */
export type RulePackReviewState = 'unreviewed' | 'reviewed_current' | 'reviewed_but_changed';

/** Who signed an outline off, when, and to what extent. */
export interface RulePackReview {
  /** Named individual and credential. Never a team, never a system. */
  reviewedBy: string | null;
  /** ISO timestamp of the sign-off. */
  reviewedAt: string | null;
  /** What the reviewer actually attested to — rarely "everything". */
  reviewScope: string | null;
}

export interface RulePackProvenance {
  sourceBasis: RulePackSourceBasis;
  confidence: RulePackConfidence;
  reviewStatus: RulePackReviewStatus;
  /** The rule the outline answers to, e.g. '21 CFR 814.20(b)'. */
  governingRule: string | null;
  /** What specifically is not settled about this outline. */
  uncertainties: string | null;
  /** Whether the sign-off, if any, still covers the tree on screen. */
  reviewState: RulePackReviewState;
  review: RulePackReview;
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
  reviewState: 'unreviewed',
  review: Object.freeze({ reviewedBy: null, reviewedAt: null, reviewScope: null }),
});

const REVIEW_STATES: readonly RulePackReviewState[] = [
  'unreviewed',
  'reviewed_current',
  'reviewed_but_changed',
];

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

  const reviewStatus = oneOf(REVIEW_STATUS_VALUES, pick('review_status', 'reviewStatus'), 'unreviewed');

  // Postgres returns the attribution as flat columns; this function emits it
  // nested under `review`. Both shapes have to be readable, because the client
  // re-normalises what the server already normalised — deliberately, so an
  // older server that omits these fields still yields a safe value. Reading
  // only the flat form would make that second pass silently drop the reviewer's
  // name, turning a named sign-off into an anonymous one on its way to screen.
  const nested = (r.review && typeof r.review === 'object' ? r.review : {}) as Record<string, unknown>;
  const reviewPick = (snake: string, camel: string) => {
    const top = pick(snake, camel);
    return top !== undefined && top !== null ? top : nested[camel];
  };
  const review: RulePackReview = {
    reviewedBy: text(reviewPick('reviewed_by', 'reviewedBy')),
    reviewedAt: text(reviewPick('reviewed_at', 'reviewedAt')),
    reviewScope: text(reviewPick('review_scope', 'reviewScope')),
  };

  // The database's own view is preferred when present, because only it can
  // compare the stored digest against the current tree. Absent that — an older
  // server, or a payload re-normalised on the client — a claimed 'reviewed'
  // with no named reviewer is downgraded rather than believed: the CHECK that
  // makes attribution mandatory lives in a migration a given database may not
  // have taken, so the value alone is not evidence.
  const declaredState = oneOf(REVIEW_STATES, pick('effective_review_state', 'reviewState'), null as never);
  let reviewState: RulePackReviewState;
  if (declaredState) reviewState = declaredState;
  else if (reviewStatus === 'reviewed' && review.reviewedBy) reviewState = 'reviewed_current';
  else reviewState = 'unreviewed';

  return {
    sourceBasis: oneOf(SOURCE_BASIS_VALUES, pick('source_basis', 'sourceBasis'), 'undeclared'),
    confidence: oneOf(CONFIDENCE_VALUES, pick('confidence', 'confidence'), 'unknown'),
    // An unattributed sign-off is not a sign-off. Reported as unreviewed rather
    // than passed through, so a row written before the attribution CHECK
    // existed cannot present as approved.
    reviewStatus: reviewState === 'unreviewed' ? 'unreviewed' : reviewStatus,
    governingRule: text(pick('governing_rule', 'governingRule')),
    uncertainties: text(pick('uncertainties', 'uncertainties')),
    reviewState,
    review: reviewState === 'unreviewed'
      ? { reviewedBy: null, reviewedAt: null, reviewScope: null }
      : review,
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
  const reviewed = p.reviewState === 'reviewed_current';
  const drifted = p.reviewState === 'reviewed_but_changed';

  let tone: RulePackProvenanceTone;
  if (reviewed) tone = 'ok';
  // Drift is toned 'err', not 'warn'. A stale sign-off is more dangerous than
  // an absent one: the reader has a name and a date in front of them and no
  // reason to doubt it, which is exactly when they stop checking.
  else if (drifted) tone = 'err';
  else if (p.sourceBasis === 'undeclared') tone = 'err';
  else if (p.sourceBasis === 'reasoned_construction') tone = 'warn';
  else tone = 'idle';

  const parts = [BASIS_DETAIL[p.sourceBasis]];
  if (p.governingRule) parts.push(`Governing rule: ${p.governingRule}.`);
  if (p.uncertainties) parts.push(p.uncertainties);

  if (reviewed) {
    const who = p.review.reviewedBy ?? 'a regulatory professional';
    const when = p.review.reviewedAt ? ` on ${p.review.reviewedAt.slice(0, 10)}` : '';
    parts.push(`Reviewed by ${who}${when}.`);
    if (p.review.reviewScope) parts.push(`Scope of that review: ${p.review.reviewScope}.`);
  } else if (drifted) {
    const who = p.review.reviewedBy ?? 'a reviewer';
    const when = p.review.reviewedAt ? ` on ${p.review.reviewedAt.slice(0, 10)}` : '';
    parts.push(
      `This outline was reviewed by ${who}${when}, but its sections have changed since. ` +
        'That sign-off does not cover what you are looking at.',
    );
  } else {
    parts.push('Not reviewed by a regulatory professional.');
  }

  let headline = BASIS_HEADLINE[p.sourceBasis];
  if (reviewed) headline = `${headline} · reviewed`;
  else if (drifted) headline = 'Review out of date';

  return { headline, detail: parts.join(' '), tone };
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
  const cols = [
    'source_basis',
    'confidence',
    'review_status',
    'governing_rule',
    'uncertainties',
    'reviewed_by',
    'reviewed_at',
    'review_scope',
  ]
    .map((col) => `to_jsonb(${alias}) ->> '${col}' AS ${col}`);

  // Derived in SQL rather than read from a column, because the answer depends
  // on comparing the digest stored at review time against the tree as it is
  // NOW — which no stored column can stay correct about. Falls back to
  // 'unreviewed' on a database that has not taken 20260810d, where both
  // operands are absent and the review therefore cannot be substantiated.
  cols.push(
    `CASE\n` +
      `                WHEN to_jsonb(${alias}) ->> 'review_status' IS DISTINCT FROM 'reviewed' THEN 'unreviewed'\n` +
      // Must stay byte-identical to c2c_rule_pack_sections_digest() in
      // migration 20260810d — including the COALESCE. If the two ever disagree
      // about what was hashed, the view and this route would report different
      // review states for the same row, and the quieter one would be believed.
      `                WHEN to_jsonb(${alias}) ->> 'reviewed_sections_sha' IS NOT DISTINCT FROM\n` +
      `                     encode(sha256(convert_to(COALESCE(${alias}.required_sections, '[]'::jsonb)::text, 'UTF8')), 'hex')\n` +
      `                     THEN 'reviewed_current'\n` +
      `                ELSE 'reviewed_but_changed'\n` +
      `              END AS effective_review_state`,
  );

  return cols.join(',\n              ');
}
