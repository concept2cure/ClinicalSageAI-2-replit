/**
 * DailyMed published-label connector tool. DailyMed (NLM) is the official
 * repository of FDA-approved drug labeling as SPL — same open, documented,
 * stable-shape NLM service class as RxNorm (code_drug). This complements the
 * SPL authoring tools (generate_spl/validate_spl) by retrieving the ACTUAL
 * published label for a drug.
 *
 * @module server/services/ana/dailymedTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const LOOKUP_PUBLISHED_LABEL: AnaTool = {
  name: 'lookup_published_label',
  description:
    "Look up the FDA-published drug labeling (SPL) for a drug from NLM DailyMed (the official open SPL repository). Returns the matching published labels with their setid, title, SPL version, and published date — use the setid to reference or retrieve the authoritative current label. Use to check what is currently published before drafting/comparing labeling. Reports an honest 'no_match' / 'lookup_failed' rather than guessing — never fabricate a setid or label content.",
  input_schema: {
    type: 'object',
    properties: {
      drug_name: { type: 'string', description: 'Drug name to search (brand or generic), e.g. "atorvastatin".' },
      max_results: { type: 'number', description: 'Maximum published labels to return (default 10, max 50).' },
    },
    required: ['drug_name'],
  },
};

/** DailyMed connector tools, spread into ALL_ANA_TOOLS. */
export const DAILYMED_TOOLS: AnaTool[] = [LOOKUP_PUBLISHED_LABEL];
