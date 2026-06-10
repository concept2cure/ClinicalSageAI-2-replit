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
import { GLOBAL_IVD_KNOWLEDGE_2 } from './regulatory/global-ivd-2';
import { MDCG_GUIDANCE_KNOWLEDGE } from './regulatory/mdcg-guidance';
import { LABELING_RULES_KNOWLEDGE } from './regulatory/labeling-rules';
import { AI_GOVERNANCE_KNOWLEDGE } from './regulatory/ai-governance';
import { ANALYTICAL_PERFORMANCE_KNOWLEDGE } from './scientific/analytical-performance';
import { CLINICAL_PERFORMANCE_KNOWLEDGE } from './scientific/clinical-performance';
import { BIOMARKER_VALIDITY_KNOWLEDGE } from './scientific/biomarker-validity';
import { BIOMARKER_VALIDITY_KNOWLEDGE_2 } from './scientific/biomarker-validity-2';
import { STANDARDIZATION_QC_KNOWLEDGE } from './scientific/standardization-qc';
import { NGS_MOLECULAR_KNOWLEDGE } from './scientific/ngs-molecular';
import { PREANALYTICAL_MICRO_KNOWLEDGE } from './scientific/preanalytical-micro';
import { PLATFORM_METHODOLOGY_KNOWLEDGE } from './scientific/platform-methodology';
import { CLINICAL_AREAS_KNOWLEDGE } from './scientific/clinical-areas';
import { LEGAL_IVD_KNOWLEDGE } from './legal/legal-ivd';
import { DTC_GENETIC_LEGAL_KNOWLEDGE } from './legal/dtc-genetic';
import { HTA_MARKET_ACCESS_KNOWLEDGE } from './legal/hta-market-access';
import { IVD_STANDARDS_KNOWLEDGE } from './standards/ivd-standards';

export * from './types';

/** The full, immutable IVD knowledge corpus. */
export const IVD_KNOWLEDGE_BASE: readonly KnowledgeEntry[] = Object.freeze([
  ...FDA_IVD_KNOWLEDGE,
  ...EU_IVDR_KNOWLEDGE,
  ...GLOBAL_IVD_KNOWLEDGE,
  ...GLOBAL_IVD_KNOWLEDGE_2,
  ...MDCG_GUIDANCE_KNOWLEDGE,
  ...LABELING_RULES_KNOWLEDGE,
  ...AI_GOVERNANCE_KNOWLEDGE,
  ...ANALYTICAL_PERFORMANCE_KNOWLEDGE,
  ...CLINICAL_PERFORMANCE_KNOWLEDGE,
  ...BIOMARKER_VALIDITY_KNOWLEDGE,
  ...BIOMARKER_VALIDITY_KNOWLEDGE_2,
  ...STANDARDIZATION_QC_KNOWLEDGE,
  ...NGS_MOLECULAR_KNOWLEDGE,
  ...PREANALYTICAL_MICRO_KNOWLEDGE,
  ...PLATFORM_METHODOLOGY_KNOWLEDGE,
  ...CLINICAL_AREAS_KNOWLEDGE,
  ...LEGAL_IVD_KNOWLEDGE,
  ...DTC_GENETIC_LEGAL_KNOWLEDGE,
  ...HTA_MARKET_ACCESS_KNOWLEDGE,
  ...IVD_STANDARDS_KNOWLEDGE,
]);

/** Per-domain corpora, exported for targeted consumers/tests. */
export const IVD_KNOWLEDGE_CORPORA = {
  'fda-ivd': FDA_IVD_KNOWLEDGE,
  'eu-ivdr': EU_IVDR_KNOWLEDGE,
  'global-ivd': GLOBAL_IVD_KNOWLEDGE,
  'global-ivd-2': GLOBAL_IVD_KNOWLEDGE_2,
  'mdcg-guidance': MDCG_GUIDANCE_KNOWLEDGE,
  'labeling-rules': LABELING_RULES_KNOWLEDGE,
  'ai-governance': AI_GOVERNANCE_KNOWLEDGE,
  'analytical-performance': ANALYTICAL_PERFORMANCE_KNOWLEDGE,
  'clinical-performance': CLINICAL_PERFORMANCE_KNOWLEDGE,
  'biomarker-validity': BIOMARKER_VALIDITY_KNOWLEDGE,
  'biomarker-validity-2': BIOMARKER_VALIDITY_KNOWLEDGE_2,
  'standardization-qc': STANDARDIZATION_QC_KNOWLEDGE,
  'ngs-molecular': NGS_MOLECULAR_KNOWLEDGE,
  'preanalytical-micro': PREANALYTICAL_MICRO_KNOWLEDGE,
  'platform-methodology': PLATFORM_METHODOLOGY_KNOWLEDGE,
  'clinical-areas': CLINICAL_AREAS_KNOWLEDGE,
  legal: LEGAL_IVD_KNOWLEDGE,
  'dtc-genetic': DTC_GENETIC_LEGAL_KNOWLEDGE,
  'hta-market-access': HTA_MARKET_ACCESS_KNOWLEDGE,
  standards: IVD_STANDARDS_KNOWLEDGE,
} as const;
