/**
 * Post-submission change classification — the catalog of FDA supplement and EU
 * variation categories, plus a deterministic, flag-driven classifier that maps a
 * proposed change to its category and to the canonical sequence type.
 *
 * After a product is filed/approved, a change is handled through a market-specific
 * lifecycle category (FDA: Prior Approval Supplement / CBE-30 / CBE-0 / Annual
 * Report; EU: Type IA / IAIN / IB / II / Extension). This module catalogs those
 * categories (definition, timing, examples, basis) and provides
 * `recommendChangeCategory`, which selects a candidate from explicit structured
 * flags — deterministic, with the agency's variation/classification guideline as
 * the authority for the final call.
 *
 * HONESTY: the categories reflect the cited published frameworks (FDA CFR
 * supplement types; EU Variations Regulation 1234/2008 + Classification Guideline).
 * `recommendChangeCategory` is a structured decision aid from your flags, NOT the
 * agency's classification decision and not a substitute for the classification
 * guideline's specific line items.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/post-submission-changes
 */

export type ChangeMarket = 'us' | 'eu';
export type SequenceTypeHint = 'variation' | 'amendment' | 'annual' | 'response';

export interface ChangeCategory {
  id: string;
  market: ChangeMarket;
  label: string;
  definition: string;
  /** When/how the change is reviewed. */
  reviewTiming: string;
  /** Canonical-core sequence type this category maps to. */
  sequenceType: SequenceTypeHint;
  examples: string[];
  basis: string;
}

export const CHANGE_CATEGORIES: ChangeCategory[] = [
  // ── FDA supplements ─────────────────────────────────────────────────────────
  {
    id: 'fda_pas',
    market: 'us',
    label: 'Prior Approval Supplement (PAS)',
    definition: 'A change with substantial potential to have an adverse effect on identity, strength, quality, purity, or potency — must be approved BEFORE the product is distributed.',
    reviewTiming: 'Prior approval required (FDA review before implementation)',
    sequenceType: 'variation',
    examples: ['New indication', 'New manufacturing site for a sterile product', 'Major formulation change', 'Relaxation of a specification acceptance criterion'],
    basis: 'FDA 21 CFR 314.70(b) / 601.12(b)',
  },
  {
    id: 'fda_cbe30',
    market: 'us',
    label: 'Changes Being Effected in 30 Days (CBE-30)',
    definition: 'A moderate change that may be distributed 30 days after the FDA receives the supplement, absent FDA objection.',
    reviewTiming: '30-day notice (distribute after 30 days unless FDA objects)',
    sequenceType: 'variation',
    examples: ['Moderate manufacturing process change', 'Addition of a new container/closure system tested for compatibility', 'Tightening of a specification'],
    basis: 'FDA 21 CFR 314.70(c) / 601.12(c)',
  },
  {
    id: 'fda_cbe0',
    market: 'us',
    label: 'Changes Being Effected (CBE-0)',
    definition: 'A moderate change that may be distributed immediately upon FDA receipt of the supplement.',
    reviewTiming: 'Immediate (distribute on FDA receipt)',
    sequenceType: 'variation',
    examples: ['Addition of a safety-related labeling statement', 'Change to a tighter analytical method'],
    basis: 'FDA 21 CFR 314.70(c)(6) / 601.12(c)(5)',
  },
  {
    id: 'fda_ar',
    market: 'us',
    label: 'Annual Report (AR)',
    definition: 'A minor change with minimal potential to have an adverse effect — reported in the next annual report; no pre-approval.',
    reviewTiming: 'Annual report (no pre-approval)',
    sequenceType: 'annual',
    examples: ['Minor editorial labeling change', 'Tightening of an in-process control within validated ranges', 'Minor equipment change of the same design'],
    basis: 'FDA 21 CFR 314.70(d) / 601.12(d)',
  },

  // ── EU variations ───────────────────────────────────────────────────────────
  {
    id: 'eu_type_ia',
    market: 'eu',
    label: 'Type IA Minor Variation',
    definition: 'A minor variation with only minimal or no impact on quality, safety, or efficacy — "do and tell" (notify within 12 months).',
    reviewTiming: 'Do-and-tell (notify within 12 months)',
    sequenceType: 'variation',
    examples: ['Change in the name/address of the MAH', 'Deletion of a manufacturing site', 'Minor change to an approved test procedure'],
    basis: 'Regulation (EC) 1234/2008; EU Variations Classification Guideline',
  },
  {
    id: 'eu_type_iain',
    market: 'eu',
    label: 'Type IAIN Minor Variation (Immediate Notification)',
    definition: 'A Type IA variation that must be notified immediately after implementation.',
    reviewTiming: 'Immediate notification after implementation',
    sequenceType: 'variation',
    examples: ['Change requiring immediate notification per the classification guideline (e.g. certain manufacturing-site or QP changes)'],
    basis: 'Regulation (EC) 1234/2008; EU Variations Classification Guideline',
  },
  {
    id: 'eu_type_ib',
    market: 'eu',
    label: 'Type IB Minor Variation',
    definition: 'A minor variation that is neither Type IA nor Type II — "tell, wait, and do" (submit and wait for acknowledgement before implementing).',
    reviewTiming: 'Tell-wait-do (default for unclassified minor changes)',
    sequenceType: 'variation',
    examples: ['Moderate change to a specification', 'Addition of a new pack size within approved parameters'],
    basis: 'Regulation (EC) 1234/2008; EU Variations Classification Guideline',
  },
  {
    id: 'eu_type_ii',
    market: 'eu',
    label: 'Type II Major Variation',
    definition: 'A major variation that may have a significant impact on quality, safety, or efficacy — requires assessment and approval before implementation.',
    reviewTiming: 'Prior assessment/approval (typically 60/90 days)',
    sequenceType: 'variation',
    examples: ['New therapeutic indication', 'Significant change to the manufacturing process of a biological', 'Change with a significant safety/efficacy impact'],
    basis: 'Regulation (EC) 1234/2008; EU Variations Classification Guideline',
  },
  {
    id: 'eu_extension',
    market: 'eu',
    label: 'Line Extension',
    definition: 'A change listed in Annex I to the Variations Regulation (e.g. new strength, pharmaceutical form, or route) — assessed as an extension of the marketing authorisation.',
    reviewTiming: 'Extension application (assessed like a new MAA scope)',
    sequenceType: 'variation',
    examples: ['New strength', 'New pharmaceutical form', 'New route of administration'],
    basis: 'Regulation (EC) 1234/2008 Annex I',
  },
];

// ── Lookups (pure) ────────────────────────────────────────────────────────────

const BY_ID = new Map(CHANGE_CATEGORIES.map((c) => [c.id, c]));

export function getChangeCategory(id: string): ChangeCategory | undefined {
  return BY_ID.get(id);
}

export function categoriesForMarket(market: ChangeMarket): ChangeCategory[] {
  return CHANGE_CATEGORIES.filter((c) => c.market === market);
}

export function changeCategoryIds(): string[] {
  return CHANGE_CATEGORIES.map((c) => c.id);
}

// ── Flag-driven classifier (pure decision aid) ────────────────────────────────

export interface ChangeFlags {
  /** New indication, strength, form, or route (a scope extension). */
  scopeExtension?: boolean;
  /** Substantial potential to adversely affect safety/efficacy/quality. */
  majorImpact?: boolean;
  /** Moderate potential impact (neither minimal nor major). */
  moderateImpact?: boolean;
  /** A safety-related change that should take effect immediately (US CBE-0). */
  immediateSafetyChange?: boolean;
  /** Minimal/no impact (administrative or within validated ranges). */
  minimalImpact?: boolean;
  /** EU: the change requires immediate notification (Type IAIN). */
  euImmediateNotification?: boolean;
}

export interface ChangeRecommendation {
  market: ChangeMarket;
  categoryId: string;
  label: string;
  sequenceType: SequenceTypeHint;
  rationale: string;
  /** Always present: confirm against the agency's classification guideline. */
  caveat: string;
}

const CAVEAT =
  'Structured decision aid from the supplied flags — confirm the final classification against the agency’s variation/classification guideline line items.';

/**
 * Recommend a change category from structured flags. Deterministic precedence:
 * scope extension → major → (US: immediate-safety → moderate → minimal;
 * EU: immediate-notification → moderate → minimal). Defaults to the most
 * conservative category when flags are ambiguous/absent.
 */
export function recommendChangeCategory(market: ChangeMarket, flags: ChangeFlags): ChangeRecommendation {
  const pick = (id: string, rationale: string): ChangeRecommendation => {
    const c = getChangeCategory(id)!;
    return { market, categoryId: c.id, label: c.label, sequenceType: c.sequenceType, rationale, caveat: CAVEAT };
  };

  if (market === 'us') {
    if (flags.scopeExtension || flags.majorImpact) {
      return pick('fda_pas', 'Substantial potential impact or a scope extension requires prior approval.');
    }
    if (flags.immediateSafetyChange) {
      return pick('fda_cbe0', 'A safety-related change intended to take effect immediately on FDA receipt.');
    }
    if (flags.moderateImpact) {
      return pick('fda_cbe30', 'A moderate change that may be distributed 30 days after FDA receipt.');
    }
    if (flags.minimalImpact) {
      return pick('fda_ar', 'A minor change with minimal impact, reportable in the annual report.');
    }
    return pick('fda_pas', 'Impact is unspecified; defaulting to the most conservative category (prior approval).');
  }

  // EU
  if (flags.scopeExtension) {
    return pick('eu_extension', 'A new strength/form/route is handled as a line extension.');
  }
  if (flags.majorImpact) {
    return pick('eu_type_ii', 'A significant impact on quality/safety/efficacy is a major (Type II) variation.');
  }
  if (flags.minimalImpact) {
    return pick(flags.euImmediateNotification ? 'eu_type_iain' : 'eu_type_ia', 'Minimal/no impact is a minor (Type IA) variation.');
  }
  if (flags.moderateImpact) {
    return pick('eu_type_ib', 'A minor change that is neither IA nor II defaults to Type IB.');
  }
  return pick('eu_type_ii', 'Impact is unspecified; defaulting to the most conservative category (Type II).');
}

export default {
  CHANGE_CATEGORIES,
  getChangeCategory,
  categoriesForMarket,
  changeCategoryIds,
  recommendChangeCategory,
};
