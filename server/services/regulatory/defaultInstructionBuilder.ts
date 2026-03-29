/**
 * Default Instruction Builder — Generates AI custom instructions
 * based on registry entry metadata.
 *
 * Replaces the hardcoded submissionTypeInstructionTemplates in concept2cure.ts
 * with a registry-driven approach that works for all application types.
 *
 * @module server/services/regulatory/defaultInstructionBuilder
 */

import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';
import { getRegionProfile } from '../../../shared/regulatory/region-profiles.js';

// ─── Specialized Templates ────────────────────────────────────────────────────

/**
 * Specialized instruction templates for high-usage application types.
 * These provide deeper domain expertise than the generic template.
 */
const SPECIALIZED_TEMPLATES: Record<string, (product: string, entry: RegulatoryApplicationType) => string> = {
  US_IND: (product) =>
    `You are an FDA IND (Investigational New Drug) regulatory expert for ${product}. Focus on preclinical data requirements, clinical trial protocol design, CMC (Chemistry, Manufacturing, and Controls) documentation, and IND submission strategy per 21 CFR 312. Reference all project documents and intelligence when responding.`,

  US_NDA: (product) =>
    `You are an FDA NDA (New Drug Application) regulatory expert for ${product}. Focus on clinical efficacy and safety data, labeling strategy, risk-benefit analysis, CMC compliance, and NDA submission readiness per 21 CFR 314. Reference all project documents and intelligence when responding.`,

  US_BLA: (product) =>
    `You are an FDA BLA (Biologics License Application) regulatory expert for ${product}. Focus on biological product characterization, manufacturing process validation, clinical immunogenicity data, and BLA submission strategy per 21 CFR 601. Reference all project documents and intelligence when responding.`,

  US_510K: (product) =>
    `You are an FDA 510(k) regulatory expert for ${product}. Focus on substantial equivalence analysis, predicate device comparison, performance data requirements, and 510(k) submission readiness per 21 CFR 807. Reference all project documents, predicate device information, and intelligence when responding.`,

  US_PMA: (product) =>
    `You are an FDA PMA (Premarket Approval) regulatory expert for ${product}. Focus on clinical evidence requirements, device safety and effectiveness, manufacturing quality systems, and PMA submission strategy. Reference all project documents and intelligence when responding.`,

  US_DE_NOVO: (product) =>
    `You are an FDA De Novo classification regulatory expert for ${product}. Focus on risk-benefit analysis for novel devices, classification rationale, special controls development, and De Novo submission readiness. Reference all project documents and intelligence when responding.`,

  US_EUA: (product) =>
    `You are an FDA EUA (Emergency Use Authorization) regulatory expert for ${product}. Focus on known and potential benefits vs. risks, available alternatives analysis, emergency use criteria, and EUA submission strategy. Reference all project documents and intelligence when responding.`,

  EU_MAA: (product) =>
    `You are an EMA MAA (Marketing Authorisation Application) regulatory expert for ${product}. Focus on EU regulatory requirements, CTD Module structure, scientific advice alignment, SmPC drafting, RMP preparation, and MAA submission readiness across EU member states. Reference all project documents and intelligence when responding.`,

  EU_CTA: (product) =>
    `You are an EU CTA (Clinical Trial Application) regulatory expert for ${product}. Focus on EU Clinical Trials Regulation (CTR 536/2014), CTIS portal requirements, IMPD preparation, and multi-member-state coordination. Reference all project documents and intelligence when responding.`,

  CA_NDS: (product) =>
    `You are a Health Canada NDS (New Drug Submission) regulatory expert for ${product}. Focus on Canadian regulatory requirements, Product Monograph preparation, CTD structure per HC guidelines, and NDS submission readiness. Reference all project documents and intelligence when responding.`,

  JP_MKT_APPROVAL: (product) =>
    `You are a PMDA Marketing Approval regulatory expert for ${product}. Focus on Japanese regulatory requirements, bridging study needs, J-CTD structure, ethnic sensitivity factors, and PMDA submission strategy. Reference all project documents and intelligence when responding.`,

  CN_CTA: (product) =>
    `You are an NMPA CTA (Clinical Trial Application) regulatory expert for ${product}. Focus on Chinese regulatory requirements, CDE guidance, CTD structure per NMPA standards, and China-specific clinical trial requirements. Reference all project documents and intelligence when responding.`,
};

// ─── Builder Functions ────────────────────────────────────────────────────────

/**
 * Build default AI custom instructions for a project based on its registry entry.
 */
export function buildDefaultInstructions(
  entry: RegulatoryApplicationType,
  product?: string | null,
  projectName?: string
): string {
  const productLabel = product || projectName || 'this product';

  // Check for specialized template
  const specialized = SPECIALIZED_TEMPLATES[entry.id];
  if (specialized) {
    return specialized(productLabel, entry);
  }

  // Generic template built from registry metadata
  return buildGenericInstructions(entry, productLabel);
}

/**
 * Build generic instructions from registry entry metadata.
 * Works for any application type without needing specialized templates.
 */
function buildGenericInstructions(entry: RegulatoryApplicationType, product: string): string {
  const regionProfile = getRegionProfile(entry.region);
  const agencyName = regionProfile?.agencyFullName ?? entry.agency;
  const country = entry.country;
  const dossier = entry.dossierStandard !== 'none' ? ` in ${entry.dossierStandard} format` : '';

  const familyContext = getFamilyContext(entry.applicationFamily);
  const productClassContext = getProductClassContext(entry.productClass);

  return `You are a ${agencyName} (${country}) regulatory expert for ${product}, specializing in ${entry.displayName} submissions${dossier}. ${familyContext}${productClassContext} Focus on ${entry.agency}-specific requirements, submission readiness, and regulatory compliance. Reference all project documents and intelligence when responding.`;
}

function getFamilyContext(family: string): string {
  const contexts: Record<string, string> = {
    clinical_trial: 'Focus on clinical trial protocol requirements, subject safety, and investigational product documentation. ',
    marketing_authorization: 'Focus on comprehensive dossier preparation covering quality, nonclinical, and clinical data. ',
    supplement: 'Focus on change justification, impact assessment, and supplement-specific requirements. ',
    variation: 'Focus on variation classification, change documentation, and post-approval change management. ',
    renewal: 'Focus on benefit-risk re-evaluation, safety update, and renewal documentation. ',
    master_file: 'Focus on confidential drug substance/excipient documentation and reference authorization. ',
    device_clearance: 'Focus on substantial equivalence, predicate comparison, and performance testing. ',
    device_approval: 'Focus on clinical evidence, device safety and effectiveness demonstration. ',
    pediatric: 'Focus on pediatric development planning and age-appropriate formulation considerations. ',
    orphan: 'Focus on orphan designation criteria, prevalence data, and development incentives. ',
    safety_report: 'Focus on pharmacovigilance, signal detection, and risk management. ',
    pre_submission: 'Focus on meeting preparation, strategic questions, and regulatory feedback. ',
  };
  return contexts[family] ?? '';
}

function getProductClassContext(classes: string[]): string {
  if (classes.includes('any') || classes.length === 0) return '';

  const labels: Record<string, string> = {
    small_molecule: 'small molecule drug',
    biologic: 'biologic product',
    biosimilar: 'biosimilar product',
    generic: 'generic drug',
    medical_device: 'medical device',
    ivd: 'in vitro diagnostic',
    combination_product: 'combination product',
    atmp: 'advanced therapy medicinal product',
    vaccine: 'vaccine',
  };

  const classLabels = classes.map(c => labels[c] ?? c).join('/');
  return `This is a ${classLabels} submission. `;
}

/**
 * Build instructions from a legacy submission type string.
 * Backward-compatible with existing concept2cure.ts templates.
 */
export function buildInstructionsFromLegacyType(
  submissionType: string,
  product?: string | null,
  projectName?: string
): string {
  const productLabel = product || projectName || 'this product';

  // Try resolving via registry first
  const { resolveRegistryId } = require('./registry/legacySubmissionTypeMapper.js');
  const { getApplicationType } = require('../../../shared/regulatory/global-document-registry.js');

  const registryId = resolveRegistryId(submissionType);
  if (registryId) {
    const entry = getApplicationType(registryId);
    if (entry) {
      return buildDefaultInstructions(entry, product, projectName);
    }
  }

  // Final fallback for truly unknown types
  return `You are a ${submissionType} regulatory expert for ${productLabel}. Focus on regulatory strategy, submission readiness, and compliance. Reference all project documents and intelligence when responding.`;
}
