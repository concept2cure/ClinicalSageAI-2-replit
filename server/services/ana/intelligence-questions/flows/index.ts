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
import { createNdaSubmissionFlow } from './nda-submission.js';
import { createBlaSubmissionFlow } from './bla-submission.js';
import { createDevicePmaFlow } from './device-pma.js';
import { createCmcSpecificationFlow } from './cmc-specification.js';
import { createRiskManagementFlow } from './risk-management.js';
import { createSafetyNarrativeFlow } from './safety-narrative.js';
import { createLabelingFlow } from './labeling.js';
import { createBriefingBookFlow } from './briefing-book.js';
import { createStabilityStudyFlow } from './stability-study.js';
import { createProjectSetupFlow } from './project-setup.js';

const FLOW_REGISTRY: Record<string, FlowFactory> = {
  protocol_development: () => createProtocolDevelopmentFlow(),
  csr_report: () => createCsrReportFlow(),
  ind_submission: () => createIndSubmissionFlow(),
  sop_development: () => createSopDevelopmentFlow(),
  device_510k: () => createDevice510kFlow(),
  cer_report: () => createCerReportFlow(),
  nda_submission: () => createNdaSubmissionFlow(),
  bla_submission: () => createBlaSubmissionFlow(),
  device_pma: () => createDevicePmaFlow(),
  cmc_specification: () => createCmcSpecificationFlow(),
  risk_management: () => createRiskManagementFlow(),
  safety_narrative: () => createSafetyNarrativeFlow(),
  labeling: () => createLabelingFlow(),
  briefing_book: () => createBriefingBookFlow(),
  stability_study: () => createStabilityStudyFlow(),
  project_setup: () => createProjectSetupFlow(),
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
    // Protocol Development
    'protocol': 'protocol_development',
    'clinical protocol': 'protocol_development',
    'study protocol': 'protocol_development',
    'protocol development': 'protocol_development',
    // CSR Report
    'csr': 'csr_report',
    'clinical study report': 'csr_report',
    'study report': 'csr_report',
    // IND Submission
    'ind': 'ind_submission',
    'ind submission': 'ind_submission',
    'investigational new drug': 'ind_submission',
    // NDA Submission
    'nda': 'nda_submission',
    'nda submission': 'nda_submission',
    'new drug application': 'nda_submission',
    'marketing application': 'nda_submission',
    // BLA Submission
    'bla': 'bla_submission',
    'biologics license': 'bla_submission',
    'biologic': 'bla_submission',
    'bla submission': 'bla_submission',
    // SOP Development
    'sop': 'sop_development',
    'standard operating procedure': 'sop_development',
    'sop development': 'sop_development',
    // Device 510(k)
    '510k': 'device_510k',
    '510(k)': 'device_510k',
    'premarket notification': 'device_510k',
    // Device PMA
    'pma': 'device_pma',
    'premarket approval': 'device_pma',
    'class iii device': 'device_pma',
    // CER Report
    'cer': 'cer_report',
    'clinical evaluation report': 'cer_report',
    'clinical evaluation': 'cer_report',
    // CMC Specification
    'cmc': 'cmc_specification',
    'cmc specification': 'cmc_specification',
    'chemistry manufacturing controls': 'cmc_specification',
    'drug substance': 'cmc_specification',
    'drug product': 'cmc_specification',
    // Risk Management
    'risk management': 'risk_management',
    'risk management plan': 'risk_management',
    'risk assessment': 'risk_management',
    'iso 14971': 'risk_management',
    // Safety Narrative
    'safety narrative': 'safety_narrative',
    'patient narrative': 'safety_narrative',
    'sae narrative': 'safety_narrative',
    'death narrative': 'safety_narrative',
    // Labeling
    'labeling': 'labeling',
    'label': 'labeling',
    'uspi': 'labeling',
    'prescribing information': 'labeling',
    'package insert': 'labeling',
    // Briefing Book
    'briefing book': 'briefing_book',
    'briefing document': 'briefing_book',
    'advisory committee': 'briefing_book',
    'adcom': 'briefing_book',
    // Stability Study
    'stability': 'stability_study',
    'stability study': 'stability_study',
    'shelf life': 'stability_study',
    'ich q1a': 'stability_study',
    // Project Setup
    'project': 'project_setup',
    'project setup': 'project_setup',
    'new project': 'project_setup',
    'setup': 'project_setup',
  };

  // Exact match
  if (ALIASES[normalized]) return ALIASES[normalized];

  // Substring match
  for (const [alias, category] of Object.entries(ALIASES)) {
    if (normalized.includes(alias)) return category;
  }

  return null;
}
