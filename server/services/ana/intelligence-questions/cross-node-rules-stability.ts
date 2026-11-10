/**
 * The shelf-life rule: a proposed shelf life or dating period against the
 * long-term (or real-time) stability data behind it.
 *
 * Split out of cross-node-rules.ts on 2026-11-02 (S4) to keep that file under
 * its line limit (RULE 6: split, don't add). It is the one cross-node rule that
 * leans on another engine — the Q1E ceiling is services/cmc/shelf-life.ts's own
 * — and it brought its own readers, so it is the natural seam.
 *
 * @module server/services/ana/intelligence-questions/cross-node-rules-stability
 */

import type { CrossNodeRule } from './cross-node-rules.js';
import { isBlank, numVal, strVal } from './cross-node-context.js';
import { q1eExtrapolationLimit } from '../../cmc/shelf-life.js';

/* ── Stability: the shelf-life claim against the long-term data ─────────────
   2026-11-02 (S4). The Q1E ceiling is the CMC engine's own
   (services/cmc/shelf-life.ts), reused rather than restated here. */

/** A month count, or null for a blank, an own position, or anything not a number. */
const monthsIn = (value: unknown): number | null => (isBlank(value) ? null : numVal(value));

/**
 * The NDA's long-term data answer is a band, read as "fewer months than the
 * next option's floor", so a claim is called past the limit only where it is
 * past it for EVERY value in the band. '36mo' is open-ended and reads as unknown.
 */
const NDA_LONG_TERM_BELOW: Readonly<Record<string, number | null>> = {
  '6mo': 12,
  '12mo': 18,
  '18mo': 24,
  '24mo': 36,
  '36mo': null,
};

function longTermDataOf(flat: Record<string, unknown>): { months: number; banded: boolean } | null {
  const exact = monthsIn(flat['long_term_data_available_months']);
  if (exact !== null) return { months: exact, banded: false };
  const band = flat['stability_data_duration'];
  if (typeof band !== 'string' || !(band in NDA_LONG_TERM_BELOW)) return null;
  const below = NDA_LONG_TERM_BELOW[band];
  return below === null ? null : { months: below, banded: true };
}

const isBiologicProduct = (flat: Record<string, unknown>, category: string): boolean =>
  category === 'bla_submission' || flat['is_biologic'] === true || ['yes', 'true'].includes(strVal(flat['is_biologic']));

/** A registration claim, where a shelf life past the data is a deficiency rather than a gap to justify. */
function isMarketingClaim(flat: Record<string, unknown>, category: string): boolean {
  if (category === 'nda_submission') return strVal(flat['nda_type']) !== 'supplement';
  if (category === 'bla_submission') return true;
  if (category === 'stability_study') return strVal(flat['development_stage']) === 'registration';
  return false;
}

/** Q5C's reference, by what the BLA says the product is. */
function q5cReferenceFor(flat: Record<string, unknown>, category: string): string {
  if (category !== 'bla_submission') return 'ICH Q5C';
  const productClass = strVal(flat['product_class']);
  if (['vaccine', 'blood_product'].includes(productClass)) {
    return 'ICH Q5C where the product is a well-characterised protein (including plasma-derived factors); otherwise 21 CFR 211.166 and 21 CFR 610.53';
  }
  if (['cell_therapy', 'gene_therapy', '__other__'].includes(productClass)) return '21 CFR 211.166; 21 CFR 211.137';
  return 'ICH Q5C (Step 4 November 1995; FDA guidance July 1996)';
}

/** Why a shelf life past the data is a gap to justify rather than a deficiency, by stage. */
function notMarketingNote(flat: Record<string, unknown>, category: string): string {
  if (category === 'nda_submission' || strVal(flat['development_stage']) === 'post_approval') {
    return ' ICH Q1A(R2) does not cover variations; a post-approval extension beyond the data goes to FDA as a supplement with its justification.';
  }
  return ' For a clinical-stage programme the data must support the clinical supply for the duration of the planned studies (21 CFR 312.23(a)(7)); state the basis for this dating rather than treating it as a registration claim.';
}

export const STABILITY_SHELF_LIFE_RULE: CrossNodeRule = {
  id: 'xn_stability_insufficient_for_shelf_life',
  appliesTo: ['stability_study', 'cmc_specification', 'nda_submission', 'bla_submission'],
  /* 2026-11-02 (S4): the ids each interview asks. The rule read
     proposed_shelf_life, shelf_life_months, long_term_data_months and
     stability_data_months — none asked by the flows it named — so it never
     triggered. Both numbers are facts the finding RESTS on; it asserts no
     absence, so it declares no mitigation. cmc_specification asks neither and
     is named in the gate as not asked yet. */
  triggeredBy: ['proposed_shelf_life_months', 'long_term_data_available_months', 'stability_data_duration'],
  check(flat, state) {
    /* An intermediate has a holding time, not a Q1E retest period or shelf life. */
    if (strVal(flat['product_type']) === 'intermediate') return null;
    const claim = monthsIn(flat['proposed_shelf_life_months']);
    const data = longTermDataOf(flat);
    if (claim === null || data === null) return null;
    const category = state.flowCategory;
    const triggerValues = {
      proposed_shelf_life_months: flat['proposed_shelf_life_months'],
      long_term_data_available_months: flat['long_term_data_available_months'],
      stability_data_duration: flat['stability_data_duration'],
    };

    if (isBiologicProduct(flat, category)) {
      /* Q5C: the dating period rests on real-time, real-temperature data. */
      if (claim <= data.months) return null;
      const sixMonthNote =
        data.months < 6 && claim > 6
          ? ' Where more than 6 months is requested, Q5C expects at least 6 months of real-time data at submission.'
          : '';
      return {
        checkId: 'xn_stability_insufficient_for_shelf_life',
        severity: 'warning',
        title: 'Proposed Dating Period Runs Past the Real-Time Data',
        message:
          `A dating period of ${claim} months is proposed against ${data.months} months of real-time data at the proposed ` +
          'storage condition. ICH Q5C bases the dating period on real-time, real-temperature data; accelerated and stress ' +
          'data support it but do not replace it. State how the remaining period will be supported (stability updates ' +
          `during review, or a post-approval stability protocol), or propose ${data.months} months.` +
          sixMonthNote,
        reference: q5cReferenceFor(flat, category),
        questionId: '_cross_node',
        triggerValues,
      };
    }

    /* Q1E. No data at all is the stability interview's own node check. */
    if (data.months <= 0) return null;
    const limit = q1eExtrapolationLimit(data.months);
    const past = data.banded ? claim >= limit : claim > limit;
    if (!past) return null;
    const marketing = isMarketingClaim(flat, category);
    const from = data.banded
      ? `from fewer than ${data.months} months of long-term data (under ${limit} months)`
      : `from ${data.months} months of long-term data (${limit} months)`;
    return {
      checkId: 'xn_stability_insufficient_for_shelf_life',
      severity: marketing ? 'critical' : 'warning',
      title: 'Proposed Shelf Life Exceeds Extrapolation Limits',
      message:
        `A shelf life of ${claim} months exceeds the most ICH Q1E allows ${from}: at most twice the period covered, ` +
        'and no more than 12 months beyond it, and only in the most favourable case. Refrigerated storage, or ' +
        'significant change at the accelerated condition, allows less, and frozen storage allows no extrapolation.' +
        (marketing ? '' : notMarketingNote(flat, category)),
      reference:
        'ICH Q1E Evaluation of Stability Data (Step 4 February 2003; FDA guidance June 2004), Appendix A; ICH Q1A(R2) §2.2.7',
      questionId: '_cross_node',
      triggerValues,
    };
  },
};
