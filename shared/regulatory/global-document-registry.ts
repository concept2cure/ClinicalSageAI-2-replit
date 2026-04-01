/**
 * Global Regulatory Document Registry — Canonical source of truth for all
 * regulatory application/document types across all regions and agencies.
 *
 * Replaces hardcoded submission type logic throughout the platform.
 * Every project creation, template selection, milestone generation,
 * and readiness check should reference this registry.
 *
 * @module shared/regulatory/global-document-registry
 */

import {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  ProductClass,
  LegacySubmissionType,
  LEGACY_TO_REGISTRY_ID,
} from './document-taxonomy';

// ─── Helper to create entries ─────────────────────────────────────────────────

function entry(
  id: string,
  region: Region,
  country: string,
  agency: Agency,
  family: ApplicationFamily,
  type: string,
  displayName: string,
  opts: Partial<RegulatoryApplicationType> = {}
): RegulatoryApplicationType {
  return {
    id,
    region,
    country,
    agency,
    applicationFamily: family,
    applicationType: type,
    displayName,
    synonyms: opts.synonyms || [],
    stage: opts.stage || 'initial',
    productClass: opts.productClass || ['any'],
    dossierStandard: opts.dossierStandard || 'eCTD',
    parentApplicationType: opts.parentApplicationType,
    requiredArtifacts: opts.requiredArtifacts || [],
    defaultSectionBlueprint: opts.defaultSectionBlueprint || `${id.toLowerCase()}_sections`,
    defaultTaskBlueprint: opts.defaultTaskBlueprint || `${id.toLowerCase()}_tasks`,
    validationProfile: opts.validationProfile || `${id.toLowerCase()}_validation`,
    lifecycleActions: opts.lifecycleActions || ['submit', 'amend'],
    active: opts.active !== false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNITED STATES (FDA)
// ═══════════════════════════════════════════════════════════════════════════════

const US_ENTRIES: RegulatoryApplicationType[] = [
  // Clinical Trial
  entry('US_PRE_IND', 'US', 'United States', 'FDA', 'pre_submission', 'Pre-IND Meeting', 'Pre-IND Meeting Request', { stage: 'pre_submission', synonyms: ['Type B meeting', 'pre-IND'], lifecycleActions: ['submit'] }),
  entry('US_IND', 'US', 'United States', 'FDA', 'clinical_trial', 'IND', 'Investigational New Drug Application', { synonyms: ['IND', 'Investigational New Drug'], productClass: ['small_molecule', 'biologic', 'biosimilar', 'vaccine', 'atmp'], requiredArtifacts: ['form_1571', 'form_1572', 'form_3674', 'cover_letter', 'toc', 'clinical_overview', 'quality_overall_summary', 'nonclinical_overview'], lifecycleActions: ['submit', 'amend', 'supplement', 'annual_report', 'withdraw'] }),
  entry('US_IND_AMENDMENT', 'US', 'United States', 'FDA', 'clinical_trial', 'IND Amendment', 'IND Amendment', { stage: 'amendment', parentApplicationType: 'US_IND', synonyms: ['IND amendment', 'protocol amendment'] }),

  // Marketing Authorization
  entry('US_NDA', 'US', 'United States', 'FDA', 'marketing_authorization', 'NDA', 'New Drug Application', { synonyms: ['NDA', '505(b)(1)'], productClass: ['small_molecule'], requiredArtifacts: ['form_356h', 'clinical_overview', 'quality_overall_summary', 'nonclinical_overview', 'csr'], lifecycleActions: ['submit', 'amend', 'supplement', 'annual_report'] }),
  entry('US_BLA', 'US', 'United States', 'FDA', 'marketing_authorization', 'BLA', 'Biologics License Application', { synonyms: ['BLA', 'Biologics License'], productClass: ['biologic', 'biosimilar', 'vaccine', 'atmp'], requiredArtifacts: ['form_356h', 'clinical_overview', 'quality_overall_summary'] }),
  entry('US_ANDA', 'US', 'United States', 'FDA', 'marketing_authorization', 'ANDA', 'Abbreviated New Drug Application', { synonyms: ['ANDA', 'generic'], productClass: ['generic'], requiredArtifacts: ['form_356h', 'bioequivalence_study'] }),
  entry('US_505B2', 'US', 'United States', 'FDA', 'marketing_authorization', '505(b)(2)', '505(b)(2) Application', { synonyms: ['505(b)(2)', 'Section 505(b)(2)'], productClass: ['small_molecule'] }),

  // Supplements
  entry('US_NDA_SUPP', 'US', 'United States', 'FDA', 'supplement', 'NDA Supplement', 'NDA Supplement (sNDA)', { stage: 'supplement', parentApplicationType: 'US_NDA', synonyms: ['sNDA', 'NDA supplement'] }),
  entry('US_BLA_SUPP', 'US', 'United States', 'FDA', 'supplement', 'BLA Supplement', 'BLA Supplement (sBLA)', { stage: 'supplement', parentApplicationType: 'US_BLA', synonyms: ['sBLA', 'BLA supplement'] }),

  // Master Files
  entry('US_DMF', 'US', 'United States', 'FDA', 'master_file', 'DMF', 'Drug Master File', { synonyms: ['DMF', 'Drug Master File'], lifecycleActions: ['submit', 'amend'] }),

  // Device
  entry('US_510K', 'US', 'United States', 'FDA', 'device_clearance', '510(k)', '510(k) Premarket Notification', { synonyms: ['510(k)', '510k', 'premarket notification'], productClass: ['medical_device', 'ivd'], dossierStandard: 'eSTAR', requiredArtifacts: ['cover_letter', 'device_description', 'predicate_comparison', 'performance_testing'] }),
  entry('US_PMA', 'US', 'United States', 'FDA', 'device_approval', 'PMA', 'Premarket Approval Application', { synonyms: ['PMA', 'premarket approval'], productClass: ['medical_device'], requiredArtifacts: ['cover_letter', 'device_description', 'clinical_data'] }),
  entry('US_DE_NOVO', 'US', 'United States', 'FDA', 'device_clearance', 'De Novo', 'De Novo Classification Request', { synonyms: ['De Novo', 'de novo classification'], productClass: ['medical_device', 'ivd'] }),
  entry('US_EUA', 'US', 'United States', 'FDA', 'device_clearance', 'EUA', 'Emergency Use Authorization', { synonyms: ['EUA', 'emergency use'], productClass: ['medical_device', 'ivd', 'vaccine'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// EUROPEAN UNION (EMA)
// ═══════════════════════════════════════════════════════════════════════════════

const EU_ENTRIES: RegulatoryApplicationType[] = [
  entry('EU_CTA', 'EU', 'European Union', 'EMA', 'clinical_trial', 'CTA', 'Clinical Trial Application (EU CTR)', { synonyms: ['CTA', 'EU Clinical Trial Application', 'CTIS'], requiredArtifacts: ['protocol', 'investigator_brochure', 'impd'] }),
  entry('EU_MAA', 'EU', 'European Union', 'EMA', 'marketing_authorization', 'MAA', 'Marketing Authorisation Application', { synonyms: ['MAA', 'centralised procedure'], requiredArtifacts: ['clinical_overview', 'quality_overall_summary', 'rmp'] }),
  entry('EU_ASMF', 'EU', 'European Union', 'EMA', 'master_file', 'ASMF', 'Active Substance Master File', { synonyms: ['ASMF', 'EU DMF', 'active substance master file'] }),
  entry('EU_VARIATION_IA', 'EU', 'European Union', 'EMA', 'variation', 'Type IA Variation', 'Type IA Variation (Minor)', { stage: 'amendment', synonyms: ['Type IA', 'minor variation'] }),
  entry('EU_VARIATION_IB', 'EU', 'European Union', 'EMA', 'variation', 'Type IB Variation', 'Type IB Variation', { stage: 'amendment', synonyms: ['Type IB'] }),
  entry('EU_VARIATION_II', 'EU', 'European Union', 'EMA', 'variation', 'Type II Variation', 'Type II Variation (Major)', { stage: 'amendment', synonyms: ['Type II', 'major variation'] }),
  entry('EU_PIP', 'EU', 'European Union', 'EMA', 'pediatric', 'PIP', 'Paediatric Investigation Plan', { synonyms: ['PIP', 'paediatric plan'] }),
  entry('EU_ORPHAN', 'EU', 'European Union', 'EMA', 'orphan', 'Orphan Designation', 'Orphan Medicinal Product Designation', { synonyms: ['orphan designation', 'rare disease'] }),
  entry('EU_RMP', 'EU', 'European Union', 'EMA', 'safety_report', 'RMP', 'Risk Management Plan', { synonyms: ['RMP', 'risk management'] }),
  entry('EU_PSUR', 'EU', 'European Union', 'EMA', 'safety_report', 'PSUR/PBRER', 'Periodic Safety Update Report', { synonyms: ['PSUR', 'PBRER', 'periodic safety'] }),
  entry('EU_RENEWAL', 'EU', 'European Union', 'EMA', 'renewal', 'Renewal', 'Marketing Authorisation Renewal', { stage: 'renewal' }),
  entry('EU_CER', 'EU', 'European Union', 'EMA', 'device_approval', 'CER', 'Clinical Evaluation Report (EU MDR)', { synonyms: ['CER', 'clinical evaluation report', 'EU MDR'], productClass: ['medical_device'], dossierStandard: 'regional' }),
  entry('EU_IVDR', 'EU', 'European Union', 'EMA', 'device_approval', 'IVDR', 'In Vitro Diagnostic Regulation', { synonyms: ['IVDR', 'IVD regulation'], productClass: ['ivd'], dossierStandard: 'regional' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// UNITED KINGDOM (MHRA)
// ═══════════════════════════════════════════════════════════════════════════════

const UK_ENTRIES: RegulatoryApplicationType[] = [
  entry('UK_CTA', 'UK', 'United Kingdom', 'MHRA', 'clinical_trial', 'CTA', 'Clinical Trial Authorisation (UK)', { synonyms: ['UK CTA'] }),
  entry('UK_MA', 'UK', 'United Kingdom', 'MHRA', 'marketing_authorization', 'UK MA', 'UK Marketing Authorisation', { synonyms: ['UK MA', 'UK marketing authorization'] }),
  entry('UK_IRP', 'UK', 'United Kingdom', 'MHRA', 'marketing_authorization', 'IRP', 'International Recognition Procedure', { synonyms: ['IRP'] }),
  entry('UK_VARIATION', 'UK', 'United Kingdom', 'MHRA', 'variation', 'UK Variation', 'UK Marketing Authorisation Variation', { stage: 'amendment' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CANADA (Health Canada)
// ═══════════════════════════════════════════════════════════════════════════════

const CA_ENTRIES: RegulatoryApplicationType[] = [
  entry('CA_CTA', 'CA', 'Canada', 'Health_Canada', 'clinical_trial', 'CTA', 'Clinical Trial Application (Canada)', { synonyms: ['Canadian CTA'] }),
  entry('CA_CTA_A', 'CA', 'Canada', 'Health_Canada', 'clinical_trial', 'CTA-A', 'Clinical Trial Application Amendment', { stage: 'amendment', parentApplicationType: 'CA_CTA' }),
  entry('CA_NDS', 'CA', 'Canada', 'Health_Canada', 'marketing_authorization', 'NDS', 'New Drug Submission', { synonyms: ['NDS'] }),
  entry('CA_SNDS', 'CA', 'Canada', 'Health_Canada', 'supplement', 'SNDS', 'Supplemental New Drug Submission', { stage: 'supplement', parentApplicationType: 'CA_NDS' }),
  entry('CA_ANDS', 'CA', 'Canada', 'Health_Canada', 'marketing_authorization', 'ANDS', 'Abbreviated New Drug Submission', { synonyms: ['ANDS', 'Canadian generic'], productClass: ['generic'] }),
  entry('CA_SANDS', 'CA', 'Canada', 'Health_Canada', 'supplement', 'SANDS', 'Supplemental Abbreviated New Drug Submission', { stage: 'supplement', parentApplicationType: 'CA_ANDS' }),
  entry('CA_MF', 'CA', 'Canada', 'Health_Canada', 'master_file', 'MF', 'Master File (Canada)', { synonyms: ['Canadian MF'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// JAPAN (PMDA)
// ═══════════════════════════════════════════════════════════════════════════════

const JP_ENTRIES: RegulatoryApplicationType[] = [
  entry('JP_CTN', 'JP', 'Japan', 'PMDA', 'clinical_trial', 'CTN', 'Clinical Trial Notification', { synonyms: ['CTN', '治験届'] }),
  entry('JP_MKT_APPROVAL', 'JP', 'Japan', 'PMDA', 'marketing_authorization', 'Marketing Approval', 'Marketing Approval Application (Japan)', { synonyms: ['承認申請', 'JNDA'] }),
  entry('JP_MF', 'JP', 'Japan', 'PMDA', 'master_file', 'MF', 'Master File (Japan)', { synonyms: ['Japanese MF', 'MF登録'] }),
  entry('JP_PARTIAL_CHANGE', 'JP', 'Japan', 'PMDA', 'variation', 'Partial Change', 'Partial Change Application', { stage: 'amendment', synonyms: ['一部変更承認申請'] }),
  entry('JP_MINOR_CHANGE', 'JP', 'Japan', 'PMDA', 'variation', 'Minor Change', 'Minor Change Notification', { stage: 'amendment', synonyms: ['軽微変更届'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CHINA (NMPA)
// ═══════════════════════════════════════════════════════════════════════════════

const CN_ENTRIES: RegulatoryApplicationType[] = [
  entry('CN_CTA', 'CN', 'China', 'NMPA', 'clinical_trial', 'CTA', 'Clinical Trial Application (China)', { synonyms: ['Chinese CTA', '药物临床试验申请'], dossierStandard: 'CTD' }),
  entry('CN_MAA', 'CN', 'China', 'NMPA', 'marketing_authorization', 'MAA', 'Marketing Authorization Application (China)', { synonyms: ['Chinese MAA', '药品注册申请'], dossierStandard: 'CTD' }),
  entry('CN_SUPPLEMENT', 'CN', 'China', 'NMPA', 'supplement', 'Supplementary Application', 'Supplementary Application (China)', { stage: 'supplement', dossierStandard: 'CTD' }),
  entry('CN_RENEWAL', 'CN', 'China', 'NMPA', 'renewal', 'Renewal', 'Registration Renewal (China)', { stage: 'renewal', dossierStandard: 'CTD' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// AUSTRALIA (TGA)
// ═══════════════════════════════════════════════════════════════════════════════

const AU_ENTRIES: RegulatoryApplicationType[] = [
  entry('AU_CTN', 'AU', 'Australia', 'TGA', 'clinical_trial', 'CTN', 'Clinical Trial Notification (Australia)', { synonyms: ['CTN', 'TGA notification'] }),
  entry('AU_CTA', 'AU', 'Australia', 'TGA', 'clinical_trial', 'CTA', 'Clinical Trial Approval (Australia)', { synonyms: ['TGA CTA'] }),
  entry('AU_CAT1', 'AU', 'Australia', 'TGA', 'marketing_authorization', 'Category 1', 'Category 1 Registration', { synonyms: ['Cat 1'] }),
  entry('AU_CAT2', 'AU', 'Australia', 'TGA', 'marketing_authorization', 'Category 2', 'Category 2 Registration', { synonyms: ['Cat 2'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SWITZERLAND (Swissmedic)
// ═══════════════════════════════════════════════════════════════════════════════

const CH_ENTRIES: RegulatoryApplicationType[] = [
  entry('CH_CTA', 'CH', 'Switzerland', 'Swissmedic', 'clinical_trial', 'CTA', 'Clinical Trial Application (Switzerland)', { synonyms: ['Swiss CTA'] }),
  entry('CH_MA', 'CH', 'Switzerland', 'Swissmedic', 'marketing_authorization', 'MA', 'Marketing Authorisation (Switzerland)', { synonyms: ['Swiss MA'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// BRAZIL (ANVISA)
// ═══════════════════════════════════════════════════════════════════════════════

const BR_ENTRIES: RegulatoryApplicationType[] = [
  entry('BR_DDCM', 'BR', 'Brazil', 'ANVISA', 'clinical_trial', 'DDCM', 'Dossiê de Desenvolvimento Clínico de Medicamento', { synonyms: ['DDCM', 'Brazilian clinical trial'], dossierStandard: 'CTD' }),
  entry('BR_DEEC', 'BR', 'Brazil', 'ANVISA', 'clinical_trial', 'DEEC', 'Dossiê Específico de Ensaio Clínico', { synonyms: ['DEEC'], dossierStandard: 'CTD' }),
  entry('BR_MA', 'BR', 'Brazil', 'ANVISA', 'marketing_authorization', 'MA', 'Marketing Authorization (Brazil)', { synonyms: ['Brazilian MA', 'registro'], dossierStandard: 'CTD' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// INDIA (CDSCO)
// ═══════════════════════════════════════════════════════════════════════════════

const IN_ENTRIES: RegulatoryApplicationType[] = [
  entry('IN_CT04', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-04', 'Form CT-04 (New Drug Clinical Trial)', { synonyms: ['CT-04', 'Indian CT application'], dossierStandard: 'CTD' }),
  entry('IN_CT06', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-06', 'Form CT-06 (Bioequivalence/Bioavailability)', { synonyms: ['CT-06'], dossierStandard: 'CTD' }),
  entry('IN_CT07', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-07', 'Form CT-07 (Post-Marketing Study)', { synonyms: ['CT-07'], dossierStandard: 'CTD' }),
  entry('IN_CT11', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-11', 'Form CT-11 (Clinical Trial Report)', { synonyms: ['CT-11'], dossierStandard: 'CTD' }),
  entry('IN_CT18', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-18', 'Form CT-18 (New Drug Marketing)', { synonyms: ['CT-18'], dossierStandard: 'CTD' }),
  entry('IN_CT19', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-19', 'Form CT-19 (Import Registration)', { synonyms: ['CT-19'], dossierStandard: 'CTD' }),
  entry('IN_CT21', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-21', 'Form CT-21 (Generic Drug Marketing)', { synonyms: ['CT-21'], dossierStandard: 'CTD', productClass: ['generic'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SOUTH KOREA (MFDS)
// ═══════════════════════════════════════════════════════════════════════════════

const KR_ENTRIES: RegulatoryApplicationType[] = [
  entry('KR_IND', 'KR', 'South Korea', 'MFDS', 'clinical_trial', 'IND', 'IND Application (South Korea)', { synonyms: ['Korean IND', '임상시험계획승인'] }),
  entry('KR_MA_NEW', 'KR', 'South Korea', 'MFDS', 'marketing_authorization', 'New Drug MA', 'Marketing Application — New Drug (Korea)', { synonyms: ['Korean MA', '품목허가'] }),
  entry('KR_MA_GENERIC', 'KR', 'South Korea', 'MFDS', 'marketing_authorization', 'Generic MA', 'Marketing Application — Generic (Korea)', { productClass: ['generic'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SINGAPORE (HSA)
// ═══════════════════════════════════════════════════════════════════════════════

const SG_ENTRIES: RegulatoryApplicationType[] = [
  entry('SG_NDA', 'SG', 'Singapore', 'HSA', 'marketing_authorization', 'NDA', 'New Drug Application (Singapore)', { synonyms: ['Singapore NDA'], dossierStandard: 'ACTD' }),
  entry('SG_GDA', 'SG', 'Singapore', 'HSA', 'marketing_authorization', 'GDA', 'Generic Drug Application (Singapore)', { synonyms: ['Singapore GDA', 'ACTD generic'], dossierStandard: 'ACTD', productClass: ['generic'] }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const GLOBAL_REGISTRY: RegulatoryApplicationType[] = [
  ...US_ENTRIES,
  ...EU_ENTRIES,
  ...UK_ENTRIES,
  ...CA_ENTRIES,
  ...JP_ENTRIES,
  ...CN_ENTRIES,
  ...AU_ENTRIES,
  ...CH_ENTRIES,
  ...BR_ENTRIES,
  ...IN_ENTRIES,
  ...KR_ENTRIES,
  ...SG_ENTRIES,
];

// ─── Query Functions ──────────────────────────────────────────────────────────

/** Get a specific entry by ID */
export function getApplicationType(id: string): RegulatoryApplicationType | undefined {
  return GLOBAL_REGISTRY.find(e => e.id === id);
}

/** Get all entries for a region */
export function getByRegion(region: Region): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.region === region && e.active);
}

/** Get all entries for an agency */
export function getByAgency(agency: Agency): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.agency === agency && e.active);
}

/** Get all entries for an application family */
export function getByFamily(family: ApplicationFamily): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.applicationFamily === family && e.active);
}

/** Get all entries for a product class */
export function getByProductClass(productClass: ProductClass): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.productClass.includes(productClass) && e.active);
}

/** Search by display name, synonyms, or type */
export function search(query: string): RegulatoryApplicationType[] {
  const q = query.toLowerCase();
  return GLOBAL_REGISTRY.filter(e =>
    e.active && (
      e.displayName.toLowerCase().includes(q) ||
      e.applicationType.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.synonyms.some(s => s.toLowerCase().includes(q))
    )
  );
}

/** Resolve a legacy submission type to a registry entry */
export function resolveFromLegacy(legacyType: string): RegulatoryApplicationType | undefined {
  const id = LEGACY_TO_REGISTRY_ID[legacyType as LegacySubmissionType];
  if (id) return getApplicationType(id);
  // Fallback: search by name
  return search(legacyType)[0];
}

/** Get all unique regions */
export function getRegions(): Region[] {
  return [...new Set(GLOBAL_REGISTRY.map(e => e.region))];
}

/** Get count by region */
export function getCountByRegion(): Record<Region, number> {
  const counts: Partial<Record<Region, number>> = {};
  for (const e of GLOBAL_REGISTRY) {
    counts[e.region] = (counts[e.region] || 0) + 1;
  }
  return counts as Record<Region, number>;
}

export default GLOBAL_REGISTRY;
