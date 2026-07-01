/**
 * Flow registry — maps flow categories to their definitions.
 *
 * Each flow factory receives the engine context so it can customize
 * the flow for the client type, submission type, and project state.
 *
 * @module server/services/ana/intelligence-questions/flows/index
 */

import type { FlowCategory, FlowDefinition } from '../types.js';
import type { FlowEngineContext, FlowFactory } from '../types.js';

import { createProtocolDevelopmentFlow } from './protocol-development.js';
import { createCsrReportFlow } from './csr-report.js';
import { createIndSubmissionFlow } from './ind-submission.js';
import { createSopDevelopmentFlow } from './sop-development.js';
import { createDevice510kFlow } from './device-510k.js';
import { createCerReportFlow } from './cer-report.js';

const FLOW_REGISTRY: Record<string, FlowFactory> = {
  protocol_development: () => createProtocolDevelopmentFlow(),
  csr_report: () => createCsrReportFlow(),
  ind_submission: () => createIndSubmissionFlow(),
  sop_development: () => createSopDevelopmentFlow(),
  device_510k: () => createDevice510kFlow(),
  cer_report: () => createCerReportFlow(),
};

/**
 * Resolve a flow definition by category and context.
 * Returns null if no flow exists for the given category.
 */
export function getFlowDefinition(
  category: FlowCategory,
  ctx: FlowEngineContext,
): FlowDefinition | null {
  const factory = FLOW_REGISTRY[category];
  if (!factory) return null;

  const definition = factory(ctx);

  // Filter nodes by client type if the flow specifies client type restrictions
  if (ctx.clientType && definition.clientTypes.length > 0) {
    if (!definition.clientTypes.includes(ctx.clientType)) {
      return null;
    }
  }

  return definition;
}

/**
 * List all flows available for the given context.
 */
export function getAvailableFlows(ctx: FlowEngineContext): Array<{
  category: FlowCategory;
  name: string;
  description: string;
  estimatedMinutes?: number;
}> {
  const available: Array<{
    category: FlowCategory;
    name: string;
    description: string;
    estimatedMinutes?: number;
  }> = [];

  for (const [category, factory] of Object.entries(FLOW_REGISTRY)) {
    try {
      const definition = factory(ctx);
      if (
        definition.clientTypes.length === 0 ||
        !ctx.clientType ||
        definition.clientTypes.includes(ctx.clientType)
      ) {
        available.push({
          category: category as FlowCategory,
          name: definition.name,
          description: definition.description,
          estimatedMinutes: definition.estimatedMinutes,
        });
      }
    } catch {
      // Skip flows that fail to construct for this context
    }
  }

  return available;
}

/**
 * Resolve a flow category from a free-text document type string.
 * Handles common aliases and variations.
 */
export function resolveFlowCategory(documentType: string): FlowCategory | null {
  const normalized = documentType.toLowerCase().trim();

  const ALIASES: Record<string, FlowCategory> = {
    'protocol': 'protocol_development',
    'clinical protocol': 'protocol_development',
    'study protocol': 'protocol_development',
    'protocol development': 'protocol_development',
    'csr': 'csr_report',
    'clinical study report': 'csr_report',
    'study report': 'csr_report',
    'ind': 'ind_submission',
    'ind submission': 'ind_submission',
    'investigational new drug': 'ind_submission',
    'nda': 'nda_submission',
    'new drug application': 'nda_submission',
    'bla': 'bla_submission',
    'biologics license': 'bla_submission',
    'sop': 'sop_development',
    'standard operating procedure': 'sop_development',
    'sop development': 'sop_development',
    '510k': 'device_510k',
    '510(k)': 'device_510k',
    'premarket notification': 'device_510k',
    'pma': 'device_pma',
    'premarket approval': 'device_pma',
    'cer': 'cer_report',
    'clinical evaluation report': 'cer_report',
    'clinical evaluation': 'cer_report',
    'briefing book': 'briefing_book',
    'briefing document': 'briefing_book',
    'label': 'labeling',
    'labeling': 'labeling',
    'uspi': 'labeling',
    'risk management': 'risk_management',
    'risk management plan': 'risk_management',
    'cmc': 'cmc_specification',
    'cmc specification': 'cmc_specification',
    'stability': 'stability_study',
    'stability study': 'stability_study',
    'project': 'project_setup',
    'project setup': 'project_setup',
    'new project': 'project_setup',
  };

  // Exact match
  if (ALIASES[normalized]) return ALIASES[normalized];

  // Substring match
  for (const [alias, category] of Object.entries(ALIASES)) {
    if (normalized.includes(alias)) return category;
  }

  return null;
}
