/**
 * FlowCategory → WarGameCategory explicit mapping.
 * Eliminates implicit naming convention dependency.
 * @module shared/constants/domain/mappings/flow-war-game-mapping
 */

import type { FlowCategory } from '../../../types/intelligence-questions.js';

type WarGameCategory =
  | 'protocol' | 'ind' | 'csr' | '510k' | 'cer' | 'sop'
  | 'nda' | 'bla' | 'pma' | 'cmc'
  | 'risk_management' | 'safety_narrative' | 'labeling'
  | 'briefing_book' | 'stability';

export const FLOW_TO_WAR_GAME: Partial<Record<FlowCategory, WarGameCategory>> = {
  protocol_development: 'protocol',
  csr_report: 'csr',
  ind_submission: 'ind',
  nda_submission: 'nda',
  bla_submission: 'bla',
  sop_development: 'sop',
  device_510k: '510k',
  device_pma: 'pma',
  cer_report: 'cer',
  briefing_book: 'briefing_book',
  safety_narrative: 'safety_narrative',
  labeling: 'labeling',
  risk_management: 'risk_management',
  cmc_specification: 'cmc',
  stability_study: 'stability',
  // project_setup has no war game — intentionally omitted
};

export function getWarGameCategory(flowCategory: FlowCategory): WarGameCategory | undefined {
  return FLOW_TO_WAR_GAME[flowCategory];
}

export function hasWarGame(flowCategory: FlowCategory): boolean {
  return flowCategory in FLOW_TO_WAR_GAME;
}

/** All flow categories that have a war game auditor. */
export function auditableFlowCategories(): FlowCategory[] {
  return Object.keys(FLOW_TO_WAR_GAME) as FlowCategory[];
}
