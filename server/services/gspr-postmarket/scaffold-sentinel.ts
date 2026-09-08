/**
 * The scaffold sentinel that every generated post-market document field carries
 * until the sponsor specialises it.
 *
 * The authoring generators (post-market-authoring.ts, pmcf-plan-generator.ts)
 * fill each required field with non-empty guidance prose that embeds this marker
 * — e.g. "… DRAFT — state the evidence-based conclusion." or "DRAFT — FACTUAL
 * FIELD — insert the actual volume of sales …". A field whose content still
 * contains this marker is unspecialised boilerplate, NOT real regulatory
 * content, and must not pass the approval gate (post-market.service.ts).
 *
 * Defined here as the single source of truth so the string the generators EMIT
 * and the string the validation gate DETECTS cannot drift apart: change it in
 * one place and both the producer and the gate move together.
 */
export const DRAFT_SENTINEL = 'DRAFT —';
