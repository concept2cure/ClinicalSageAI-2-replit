/**
 * EU / global live-data tools — exposes the governed EU regulatory connectors to
 * AnA, closing the geographic data gap left by the US-centric `search_*` tools.
 *
 * Each tool is the EU analogue of an existing US live-data tool:
 *   search_eudamed   — EUDAMED EU device database  (analogue of FDA device tools)
 *   search_ema_epar  — EMA EPAR authorised medicines (analogue of search_drug_labels)
 *   search_eu_ctis   — EU CTIS clinical trials       (analogue of search_clinical_evidence)
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dispatch to the
 * matching `../integrations/*-client` wrapper, which NEVER throws — it returns a
 * typed `status: 'unavailable'` result on failure so AnA degrades to manual-search
 * guidance rather than erroring. Each tool's name begins `search_`, so the pedigree
 * classifier (tool-pedigree.ts) classifies them as `external_api_live` — live
 * external authority APIs, authoritative but time-varying (cite and verify currency).
 *
 * @module server/services/ana/euDataTools
 */

import type { AnaTool } from '../ai-gateway/types';

const EU_SOURCE_NOTE =
  'Live EU authority source — authoritative but time-varying. Cite results by their EU identifier and provided url, and verify currency. ' +
  "If the source is unavailable, relay the returned 'unavailable' status and offer manual-search guidance — never fabricate EU records, identifiers, or URLs.";

export const SEARCH_EUDAMED: AnaTool = {
  name: 'search_eudamed',
  description:
    'Search the live EUDAMED (European Database on Medical Devices) for registered medical devices — the EU analogue of the US FDA device databases. ' +
    'Returns devices with their Basic UDI-DI, manufacturer (and actor SRN), risk class, and a canonical EUDAMED url for citation. ' +
    'Use for EU device market intelligence, predicate/competitor scoping, and CE-mark landscape analysis. ' +
    EU_SOURCE_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text term: device trade name, Basic UDI-DI, or manufacturer.' },
      manufacturer: { type: 'string', description: 'Manufacturer / actor name filter.' },
      risk_class: { type: 'string', description: 'Risk class filter, e.g. "IIa", "III".' },
      max_results: { type: 'number', description: 'Maximum devices to return (default 10, max 50).' },
    },
    required: ['query'],
  },
};

export const SEARCH_EMA_EPAR: AnaTool = {
  name: 'search_ema_epar',
  description:
    'Search live EMA European Public Assessment Reports (EPARs) for centrally-authorised human medicines — the EU analogue of Drugs@FDA / search_drug_labels. ' +
    'Returns medicines with their EMA product number, active substance/INN, authorisation status, therapeutic area, marketing-authorisation holder, and a canonical EPAR url for citation. ' +
    'Use for EU regulatory precedent, comparator/reference-product scoping, and authorisation-status checks. ' +
    EU_SOURCE_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text term: medicine name, INN, active substance, or MAH.' },
      active_substance: { type: 'string', description: 'Active substance / INN filter.' },
      therapeutic_area: { type: 'string', description: 'Therapeutic area filter.' },
      max_results: { type: 'number', description: 'Maximum medicines to return (default 10, max 50).' },
    },
    required: ['query'],
  },
};

export const SEARCH_EU_CTIS: AnaTool = {
  name: 'search_eu_ctis',
  description:
    'Search the live EU CTIS (Clinical Trials Information System) under Regulation (EU) No 536/2014 for EU clinical trials — the EU analogue of search_clinical_evidence (ClinicalTrials.gov). ' +
    'Returns trials with their EU trial number, sponsor, condition(s), phase, overall status, and a canonical CTIS url for citation. ' +
    'Use for EU competitive/precedent intelligence and EU trial-landscape analysis. CTIS covers trials from 2022 onward (legacy trials are in EudraCT). ' +
    EU_SOURCE_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text query (condition, sponsor, or medicinal product).' },
      condition: { type: 'string', description: 'Medical condition / therapeutic indication filter.' },
      sponsor: { type: 'string', description: 'Sponsor name filter.' },
      phase: { type: 'string', description: 'Trial phase filter, e.g. "Phase III" or "3".' },
      status: { type: 'string', description: 'Overall trial status filter, e.g. "Ongoing", "Authorised".' },
      max_results: { type: 'number', description: 'Maximum trials to return (default 10, max 50).' },
    },
    required: ['query'],
  },
};

/** EU / global live-data tools, spread into ALL_ANA_TOOLS. */
export const EU_DATA_TOOLS: AnaTool[] = [SEARCH_EUDAMED, SEARCH_EMA_EPAR, SEARCH_EU_CTIS];
