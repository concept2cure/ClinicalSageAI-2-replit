/**
 * IVD knowledge base — corpus aggregation.
 *
 * Combines every domain corpus into a single, frozen array consumed by the
 * knowledge service, the /api/ivd-knowledge routes, and the AnA citation tool.
 */

import type { KnowledgeEntry } from './types';
import { FDA_IVD_KNOWLEDGE } from './regulatory/fda-ivd';
import { EU_IVDR_KNOWLEDGE } from './regulatory/eu-ivdr';
import { GLOBAL_IVD_KNOWLEDGE } from './regulatory/global-ivd';
import { MDCG_GUIDANCE_KNOWLEDGE } from './regulatory/mdcg-guidance';
import { LABELING_RULES_KNOWLEDGE } from './regulatory/labeling-rules';
import { ANALYTICAL_PERFORMANCE_KNOWLEDGE } from './scientific/analytical-performance';
import { CLINICAL_PERFORMANCE_KNOWLEDGE } from './scientific/clinical-performance';
import { BIOMARKER_VALIDITY_KNOWLEDGE } from './scientific/biomarker-validity';
import { LEGAL_IVD_KNOWLEDGE } from './legal/legal-ivd';
import { IVD_STANDARDS_KNOWLEDGE } from './standards/ivd-standards';

export * from './types';

/** The full, immutable IVD knowledge corpus. */
export const IVD_KNOWLEDGE_BASE: readonly KnowledgeEntry[] = Object.freeze([
  ...FDA_IVD_KNOWLEDGE,
  ...EU_IVDR_KNOWLEDGE,
  ...GLOBAL_IVD_KNOWLEDGE,
  ...MDCG_GUIDANCE_KNOWLEDGE,
  ...LABELING_RULES_KNOWLEDGE,
  ...ANALYTICAL_PERFORMANCE_KNOWLEDGE,
  ...CLINICAL_PERFORMANCE_KNOWLEDGE,
  ...BIOMARKER_VALIDITY_KNOWLEDGE,
  ...LEGAL_IVD_KNOWLEDGE,
  ...IVD_STANDARDS_KNOWLEDGE,
]);

/** Per-domain corpora, exported for targeted consumers/tests. */
export const IVD_KNOWLEDGE_CORPORA = {
  'fda-ivd': FDA_IVD_KNOWLEDGE,
  'eu-ivdr': EU_IVDR_KNOWLEDGE,
  'global-ivd': GLOBAL_IVD_KNOWLEDGE,
  'mdcg-guidance': MDCG_GUIDANCE_KNOWLEDGE,
  'labeling-rules': LABELING_RULES_KNOWLEDGE,
  'analytical-performance': ANALYTICAL_PERFORMANCE_KNOWLEDGE,
  'clinical-performance': CLINICAL_PERFORMANCE_KNOWLEDGE,
  'biomarker-validity': BIOMARKER_VALIDITY_KNOWLEDGE,
  legal: LEGAL_IVD_KNOWLEDGE,
  standards: IVD_STANDARDS_KNOWLEDGE,
} as const;
