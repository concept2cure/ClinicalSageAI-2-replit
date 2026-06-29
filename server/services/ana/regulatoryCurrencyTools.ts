/**
 * Regulatory Currency tools — exposes the curated, freshness-stamped registry of
 * DATED regulatory facts (server/services/regulatory-currency/currency-registry.ts)
 * to AnA as first-class, selectable tools.
 *
 * AnA's broader regulatory knowledge is STATIC/embedded, so it can silently advise
 * on a rule that has been vacated, rescinded, superseded, or whose mandatory date
 * arrived. These two tools are the currency guard: they let AnA check whether a
 * topic's status is still live and warn when guidance changed since a document was
 * drafted. Each is a pure registry lookup (no LLM, no network) — handlers live in
 * AnaToolExecutor.ts (registerToolHandler) and are classified `deterministic_registry`
 * in tool-pedigree.ts.
 *
 * Tools:
 *   check_regulatory_currency — current status + lastVerified + source for matching facts
 *   guidance_change_radar     — facts that drifted (esp. since a draftedOn date), ranked
 *
 * @module server/services/ana/regulatoryCurrencyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const CURRENCY_NOTE =
  'These are curated, dated facts verified against the official source each returns (lastVerified + sourceUrl). Report the status verbatim and cite the source. Treat any fact with status void/vacated/rescinded as NO LONGER IN FORCE — never advise the user to follow a void rule. If nothing matches, say so rather than relying on embedded/static knowledge that may be stale.';

export const CHECK_REGULATORY_CURRENCY: AnaTool = {
  name: 'check_regulatory_currency',
  description:
    "Check whether a regulatory rule/expectation is STILL CURRENT against a curated, freshness-stamped registry of dated facts (e.g. the US LDT final rule, ICH E6(R3)/M11 steps, FDA eSTAR/eCTD mandates, PMDA eCTD v4.0, EU EUDAMED/CTIS, EU AI Act). DETERMINISTIC registry lookup — no LLM, no network. Given an optional topic, jurisdiction and/or segment, returns each matching fact with its current status (in_force / mandatory_upcoming / vacated / rescinded / superseded / void), effective date, lastVerified date and official source URL. Use BEFORE advising on any of these areas so AnA does not cite a rule that has been voided or superseded. " +
    CURRENCY_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description:
          'Free-text topic to match over fact topic/keywords/id (e.g. "LDT", "eCTD", "EUDAMED", "GCP", "AI Act"). Omit to return all facts (optionally narrowed by jurisdiction/segment).',
      },
      jurisdiction: {
        type: 'string',
        enum: ['US', 'EU', 'JP', 'UK', 'CA', 'ICH', 'GLOBAL'],
        description: 'Restrict to facts governing this jurisdiction. "ICH" = harmonised across ICH-member regulators.',
      },
      segment: {
        type: 'string',
        enum: ['mdx', 'biotech', 'pharma'],
        description: 'Restrict to facts most load-bearing for this client segment.',
      },
    },
    required: [],
  },
};

export const GUIDANCE_CHANGE_RADAR: AnaTool = {
  name: 'guidance_change_radar',
  description:
    "Detect regulatory DRIFT — changes a drafted document may not reflect — over the curated dated-facts registry. DETERMINISTIC. Given an optional draftedOn date, returns the facts whose effective date falls AFTER it (so AnA can warn 'guidance changed since this was drafted'); without draftedOn it returns ALL current changes. Optionally filter by topics and/or jurisdictions. Each hit carries a severity — 'void_rule' (a vacated/rescinded/void rule; highest) > 'mandatory_change' (a future mandatory date or a supersession) > 'info' — and results are ordered most-urgent first. Use when reviewing or refreshing a previously drafted submission/strategy. " +
    CURRENCY_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional topic terms to match over fact topic/keywords/id (any match keeps the fact). Omit to consider all topics.',
      },
      jurisdictions: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'JP', 'UK', 'CA', 'ICH', 'GLOBAL'] },
        description: 'Optional jurisdictions to restrict to. Omit to consider all jurisdictions.',
      },
      draftedOn: {
        type: 'string',
        description: 'ISO date (YYYY-MM-DD) the document was drafted. Facts effective strictly after this are flagged as drift. Omit to surface all current changes.',
      },
    },
    required: [],
  },
};

/** All regulatory-currency tools, spread into ALL_ANA_TOOLS. */
export const REGULATORY_CURRENCY_TOOLS: AnaTool[] = [
  CHECK_REGULATORY_CURRENCY,
  GUIDANCE_CHANGE_RADAR,
];
