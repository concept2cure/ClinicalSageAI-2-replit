/**
 * License-gated medical-coding tools — exposes the MedDRA and WHODrug coders in
 * `server/services/medical-coding/*` to AnA as first-class, selectable tools.
 *
 * MedDRA and WHODrug are PROPRIETARY, LICENSED dictionaries whose content is NOT
 * shipped with this platform. These tools are therefore honest-by-construction:
 * without a configured, licensed dictionary they return a `license_required`
 * status and NEVER a fabricated code; with a dictionary loaded they perform
 * DETERMINISTIC lookups over governed data (no LLM, no network). Handlers live in
 * AnaToolExecutor.ts (registerToolHandler) over the medical-coding service.
 *
 * Tools:
 *   code_meddra   — adverse-event/condition verbatim → MedDRA Preferred Term
 *   code_whodrug  — drug/substance free text → WHODrug ingredient (+ ATC)
 *
 * @module server/services/ana/codingTools
 */

import type { AnaTool } from '../ai-gateway/types';

const VERBATIM_NOTE =
  'Report the returned code and name verbatim — never fabricate or amend a code. If the status is ' +
  "'license_required', state plainly that the licensed dictionary is not configured (do NOT guess a code). " +
  "If the status is 'no_match', report that no term matched and ask for a refined verbatim term.";

export const CODE_MEDDRA: AnaTool = {
  name: 'code_meddra',
  description:
    "Code a free-text adverse-event or medical-condition term to a MedDRA Preferred Term (PT) using the " +
    "configured LICENSED MedDRA dictionary. DETERMINISTIC lookup over governed dictionary data — normalized " +
    "exact match, then LLT synonym, then a conservative substring rank (no LLM, no network, no guessing). " +
    "Returns { ptCode, ptName, llt?, hlt?, soc?, confidence }. MedDRA is a proprietary, license-gated " +
    "dictionary that is NOT shipped: when no licensed dictionary is configured this tool returns " +
    "status 'license_required' and NO code (fail-closed, honest by construction) — for open condition/" +
    "diagnosis coding use the ICD-10 tools instead. " +
    VERBATIM_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      term: {
        type: 'string',
        description: 'The verbatim adverse-event / medical-condition term to code (e.g. "bad headache").',
      },
      context: {
        type: 'string',
        description: 'Optional free-text clinical context recorded for the audit trail (does not change the match).',
      },
    },
    required: ['term'],
  },
};

export const CODE_WHODRUG: AnaTool = {
  name: 'code_whodrug',
  description:
    "Code a free-text drug/substance name to a WHODrug ingredient (with ATC classification) using the " +
    "configured LICENSED WHODrug dictionary. DETERMINISTIC lookup over governed dictionary data — normalized " +
    "exact match, then trade-name synonym, then a conservative substring rank (no LLM, no network, no guessing). " +
    "Returns { ingredient, atcCode?, atcText?, confidence }. WHODrug is a proprietary, license-gated " +
    "dictionary that is NOT shipped: when no licensed dictionary is configured this tool returns " +
    "status 'license_required' and NO code (fail-closed, honest by construction) — for open US drug coding " +
    "use code_drug (RxNorm/RxNav) instead. " +
    VERBATIM_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugName: {
        type: 'string',
        description: 'The drug or substance name to code (free text), e.g. "synthadol 500 mg".',
      },
    },
    required: ['drugName'],
  },
};

/** License-gated medical-coding tools, spread into ALL_ANA_TOOLS. */
export const CODING_TOOLS: AnaTool[] = [CODE_MEDDRA, CODE_WHODRUG];
