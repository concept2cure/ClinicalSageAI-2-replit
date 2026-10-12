/**
 * The result vocabulary of the clinical figure claims engine
 * (server/services/truth-engine/clinical-claims.ts), in one place for the server
 * that produces it and any reader (the client, a harness, a model narrating the
 * result) that interprets it. A reader that imports these lists cannot drift
 * from what the server sends.
 *
 * Three outcome classes, never more: two claims whose frames are identical are
 * `consistent` (values agree at the coarser written precision) or `conflict`;
 * everything else is `not_compared`, always with one of the reasons below. A
 * measure is never summarised as consistent unless a pair was actually
 * compared, and the report's verdict says "no conflict among compared", never
 * "consistent".
 *
 * @module shared/ana/clinical-claims-vocabulary
 *
 * 2026-10-05 (D2, product-owner decision of the same day): created with the
 * engine. Design: the clinical claims design note (§2 types, §7 comparator,
 * §8 conventions C1–C23).
 */

/** The outcome of setting two figures against each other. */
export const CLAIM_OUTCOMES = ['consistent', 'conflict', 'not_compared'] as const;
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number];

/** The report's verdict. There is deliberately no "consistent". */
export const CLAIM_REPORT_VERDICTS = ['conflicts_found', 'no_conflict_among_compared', 'nothing_compared'] as const;
export type ClaimReportVerdict = (typeof CLAIM_REPORT_VERDICTS)[number];

/** A measure's summary across every pair. "consistent_where_compared" needs at least one comparison. */
export const CLAIM_MEASURE_STATUSES = ['conflict_found', 'consistent_where_compared', 'not_compared'] as const;
export type ClaimMeasureStatus = (typeof CLAIM_MEASURE_STATUSES)[number];

/** Why a figure, or a pair of figures, was not compared — each with fixed copy. */
export const CLAIM_REASON_COPY = {
  // A slot of the figure's own frame is missing.
  study_unidentified: 'No study or pool is named for the figure (C1).',
  pool_membership_unidentified: 'A pooled figure whose member studies are not listed (C16).',
  population_unidentified: 'The figure names no analysis population (C3).',
  arm_unidentified: 'The figure is not bound to an arm or to the total in its own clause (C11).',
  arm_count_mismatch: 'The values cannot be bound one to one to the arms the text names (C11).',
  endpoint_unidentified: 'The endpoint the figure measures is not named (§6.2).',
  effect_type_unidentified: 'The effect measure (ratio, difference, adjustment) is not identified (C7).',
  contrast_unidentified: 'The arms of the contrast are not identified (C12).',
  ci_level_unstated: 'An interval is given without its confidence level (C15).',
  measure_unidentified: 'What the figure measures is not fully stated (for a discontinuation: of treatment or of the study, C6).',
  unrecognised_qualifier: 'A qualifier in the figure’s clause is not in the vocabulary, so its scope is unknown; it is never read as overall (§5.2).',
  subgroup_context_unresolved: 'Under a special-groups heading, the sentence names neither its subgroup nor the whole population (C17).',
  figure_not_read: 'The figure matched no canonical form, so what it measures is not identified.',

  // The two figures' frames differ in a slot.
  study_differs: 'The figures are from different studies (C1).',
  pool_vs_study: 'A pooled figure against a single-study figure (C16).',
  pool_membership_differs: 'The pools list different member studies (C16).',
  pool_scope_differs: 'The pools list the same member studies but name different analysis sets (a placebo-controlled pool against an all-exposure or long-term pool), which cover different exposure (C16).',
  cutoff_differs: 'The data cut-off dates differ (C14, C16).',
  population_differs: 'The analysis populations differ (C2, C3).',
  arm_differs: 'The figures are for different arms (C11).',
  per_arm_vs_total: 'A per-arm figure against a total; per-arm figures are never summed (C22).',
  subgroup_differs: 'The figures are for different subgroups, or one is for a subgroup and the other overall (C17).',
  period_differs: 'The figures cover different periods or time windows (C17).',
  timepoint_differs: 'The figures are at different timepoints.',
  part_differs: 'The figures are for different parts of the study (C16).',
  measure_differs: 'The figures measure different things (C4, C6, C21, C23).',
  event_basis_differs: 'Adverse reactions against adverse events, which are not the same measure here (C5).',
  causality_ambiguous: 'The other document states both an all-causality and a related figure, so which one an adverse-reaction figure matches is ambiguous (C5).',
  ascertainment_differs: 'Adjudicated against investigator-reported events.',
  effect_type_differs: 'Different effect measures (for example odds ratio and relative risk, or an adjusted and an unadjusted difference) (C7).',
  scale_differs: 'The effects are on different scales (percentage points and proportion are never converted) (C8).',
  unit_differs: 'The figures are in different units (C8).',
  contrast_direction_differs: 'The contrasts run in opposite directions (C12).',
  endpoint_differs: 'The figures are for different endpoints.',
  assessor_differs: 'Different assessors (independent central review and investigator).',
  model_differs: 'Different analysis models (for example stratified and unstratified).',
  estimand_differs: 'Different estimands (ICH E9(R1)).',
  imputation_differs: 'Different handling of missing data.',
  analysis_differs: 'Different analyses (primary or final, interim, sensitivity, supportive) (C13, C14).',
  ci_level_differs: 'The intervals have different confidence levels; the estimates are still compared (C15).',
  ci_sidedness_differs: 'One interval is one-sided and the other two-sided (C15).',
  interval_kind_differs: 'Intervals of different kinds (a confidence interval against a credible interval, or against a quartile or min–max range) (C15).',
  p_value_basis_differs: 'The p-values differ in sidedness, in the test named or in multiplicity adjustment, so they are different quantities (C15).',

  // The values themselves.
  ci_unreadable: 'The interval is referred to but its bounds cannot be read (C15).',
  bound_not_value: 'A bound (such as "<0.001" or "more than 500") is not a value (C9).',
  bounds_differ: 'Two different bounds cannot be compared (C9).',
  approximate_value: 'An approximation ("approximately", "ca.") is not a value (C9).',
  range_not_value: 'A range ("4.6% to 6.4%", the spread across the pooled studies) is not a value, and neither end of it is the figure (C9).',
  zero_precision_ambiguous: 'A zero against a value that rounds to zero at the zero’s precision cannot be told apart (C10).',
  value_format_ambiguous: 'The number’s reading depends on a decimal convention the source does not settle (C19).',

  // Pairing.
  ambiguous_candidates: 'More than one figure in the other document fits, and an unstated slot does not settle which (C13).',
  multiple_values_same_frame: 'One document states the same frame twice with different values.',
  no_counterpart: 'The other document states no figure of this measure.',
  derived_not_stated: 'The counterpart would have to be derived (summed, subtracted or computed); only stated figures are compared (C22).',

  // Source text.
  proposed_change: 'The figure is inside a proposed change, not the document’s current text.',
  ocr_text: 'The figure was read by OCR and is not compared.',

  // Not a claim of the kind compared.
  event_share_not_incidence: 'A share of events (severity, outcome or a subset), not a subject incidence (C21).',
  exposure_adjusted_rate: 'An exposure-adjusted rate, a different measure from a subject incidence (C21).',
  frequency_category: 'A frequency category or leaflet band, not a figure (C20).',
} as const;

export type ClaimReasonCode = keyof typeof CLAIM_REASON_COPY;
export const CLAIM_REASON_CODES = Object.keys(CLAIM_REASON_COPY) as ClaimReasonCode[];
