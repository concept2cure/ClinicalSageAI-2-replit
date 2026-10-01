/**
 * Guidance Ingestion tool definitions — exposes the guidance ingestion
 * service (server/services/regulatory-currency/guidance-ingestion-service.ts)
 * to AnA as first-class tools.
 *
 * Tools:
 *   fetch_fda_guidance_list      — says no FDA guidance index is connected
 *   fetch_ich_guideline_updates  — check ICH guideline updates by category
 *   check_guidance_freshness     — verify cited guidances are current
 *
 * @module server/services/ana/guidanceIngestionTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const FETCH_FDA_GUIDANCE_LIST: AnaTool = {
  name: 'fetch_fda_guidance_list',
  description:
    'List FDA guidance documents. No FDA guidance index is connected yet, so this returns {status: "unavailable"} with the reason; it never lists a guidance. Say an FDA guidance needs confirming unless the user supplied it.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Topic or keyword to search for in FDA guidances (e.g. "biomarker", "companion diagnostic", "AI/ML").',
      },
      year: {
        type: 'number',
        description: 'Filter to guidances from a specific year (e.g. 2024).',
      },
      status: {
        type: 'string',
        enum: ['final', 'draft', 'withdrawn'],
        description: 'Filter by guidance status: final, draft, or withdrawn.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10).',
      },
    },
    required: [],
  },
};

export const FETCH_ICH_GUIDELINE_UPDATES: AnaTool = {
  name: 'fetch_ich_guideline_updates',
  description:
    'Check for ICH guideline updates in a curated list of ICH guidelines with their step dates. Covers E6(R3), M11, Q12, Q14, E8(R1), M4(R4) only. Filter by category (Q/S/E/M) and/or a since-date to find guidelines that reached a milestone after a given point. Deterministic — no network call; a guideline not in the list is not covered, not absent.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['Q', 'S', 'E', 'M'],
        description: 'ICH category to filter by: Q (Quality), S (Safety), E (Efficacy), M (Multidisciplinary).',
      },
      since: {
        type: 'string',
        description: 'ISO date (YYYY-MM) — only return guidelines whose step date is on or after this date. Omit to return all.',
      },
    },
    required: [],
  },
};

export const CHECK_GUIDANCE_FRESHNESS: AnaTool = {
  name: 'check_guidance_freshness',
  description:
    "Check whether cited guidances are still current against the verified regulatory currency registry and the ICH step-date list. DETERMINISTIC — no LLM, no network. A citation is identified only by its ICH code, by a revision the registry records as superseded, or by an exact registry name; for those it reports current or not, the latest known date, and the registry entry and source it rests on. A citation it cannot identify is reported unverified (current: null) — never current. Use when reviewing a document's regulatory citations for currency.",
  input_schema: {
    type: 'object',
    properties: {
      citedGuidances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title or identifier of the cited guidance (e.g. "ICH E6(R2)", "EU AI Act", "LDT final rule").',
            },
            citedDate: {
              type: 'string',
              description: 'ISO date (YYYY-MM-DD) the guidance was cited as of — used to detect if the guidance has been updated since.',
            },
            jurisdiction: {
              type: 'string',
              description: 'Jurisdiction of the guidance (e.g. "US", "EU", "ICH").',
            },
          },
          required: ['title'],
        },
        description: 'Array of guidances cited in the document to check for freshness.',
      },
    },
    required: ['citedGuidances'],
  },
};

/** All guidance-ingestion tools, spread into ALL_ANA_TOOLS. */
export const GUIDANCE_INGESTION_TOOLS: AnaTool[] = [
  FETCH_FDA_GUIDANCE_LIST,
  FETCH_ICH_GUIDELINE_UPDATES,
  CHECK_GUIDANCE_FRESHNESS,
];
