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
  Segment,
  FilingCategory,
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
    segment: opts.segment,
    category: opts.category,
    description: opts.description,
    submissionFormat: opts.submissionFormat,
    ctdModule: opts.ctdModule,
    /* Carried through deliberately. This helper copies field by field rather
       than spreading `opts`, so a property added to the interface is silently
       dropped here until it is named — which is what happened on the first pass
       of BP-W1-3: every `moduleAuthority` string was written into the entries
       and none of them survived into the registry. The gate caught it. */
    moduleAuthority: opts.moduleAuthority,
    pathwayKey: opts.pathwayKey,
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
  entry('US_PRE_IND', 'US', 'United States', 'FDA', 'pre_submission', 'Pre-IND Meeting', 'Pre-IND Meeting Request', { stage: 'pre_submission', synonyms: ['Type B meeting', 'pre-IND'], lifecycleActions: ['submit'], segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', description: 'Type B meeting request to FDA before IND filing; outlines development plan and seeks feedback on nonclinical package, CMC, and clinical trial design' }),
  entry('US_IND', 'US', 'United States', 'FDA', 'clinical_trial', 'IND', 'Investigational New Drug Application', { synonyms: ['IND', 'Investigational New Drug'], productClass: ['small_molecule', 'biologic', 'biosimilar', 'vaccine', 'atmp'], requiredArtifacts: ['form_1571', 'form_1572', 'form_3674', 'cover_letter', 'toc', 'clinical_overview', 'quality_overall_summary', 'nonclinical_overview'], lifecycleActions: ['submit', 'amend', 'supplement', 'annual_report', 'withdraw'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Application to begin clinical trials; includes CMC (Module 3), nonclinical data (Module 4), clinical protocol and IB (Module 5). Submit 30 days before trial start.' }),
  entry('US_IND_AMENDMENT', 'US', 'United States', 'FDA', 'clinical_trial', 'IND Amendment', 'IND Amendment', { stage: 'amendment', parentApplicationType: 'US_IND', synonyms: ['IND amendment', 'protocol amendment'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5', description: 'Amendment to an active IND; protocol amendments, new investigator additions, chemistry changes, response to clinical hold' }),

  // Marketing Authorization
  entry('US_NDA', 'US', 'United States', 'FDA', 'marketing_authorization', 'NDA', 'New Drug Application', { synonyms: ['NDA', '505(b)(1)'], productClass: ['small_molecule'], requiredArtifacts: ['form_356h', 'clinical_overview', 'quality_overall_summary', 'nonclinical_overview', 'csr'], lifecycleActions: ['submit', 'amend', 'supplement', 'annual_report'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Full CTD dossier for new small molecule drugs; Standard review (10 mo) or Priority Review (6 mo). Triggers PDUFA user fee.' }),
  entry('US_BLA', 'US', 'United States', 'FDA', 'marketing_authorization', 'BLA', 'Biologics License Application', { synonyms: ['BLA', 'Biologics License'], productClass: ['biologic', 'biosimilar', 'vaccine', 'atmp'], requiredArtifacts: ['form_356h', 'clinical_overview', 'quality_overall_summary'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Marketing application for biological products under PHS Act §351(a); biologics-specific CMC requirements' }),
  entry('US_ANDA', 'US', 'United States', 'FDA', 'marketing_authorization', 'ANDA', 'Abbreviated New Drug Application', { synonyms: ['ANDA', 'generic'], productClass: ['generic'], requiredArtifacts: ['form_356h', 'bioequivalence_study'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5 (BE reports in 5.3.1)', moduleAuthority: 'ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: was M1–M3, which cannot carry the bioequivalence study reports that ARE the evidence of an ANDA. "No original clinical data" means no new safety/efficacy trials; the BE study is still a clinical study report and still Module 5.', description: 'Application for generic drugs demonstrating bioequivalence to a reference listed drug; no new safety/efficacy trials required (505(j)), but the bioequivalence study reports are filed in Module 5.3.1' }),
  entry('US_505B2', 'US', 'United States', 'FDA', 'marketing_authorization', '505(b)(2)', '505(b)(2) Application', { synonyms: ['505(b)(2)', 'Section 505(b)(2)'], productClass: ['small_molecule'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'NDA pathway relying partially on literature or FDA’s prior findings; commonly used for new formulations, indications, or combinations' }),

  // Supplements
  entry('US_NDA_SUPP', 'US', 'United States', 'FDA', 'supplement', 'NDA Supplement', 'NDA/BLA Supplement (Prior Approval)', { stage: 'supplement', parentApplicationType: 'US_NDA', synonyms: ['sNDA', 'NDA supplement', 'PAS'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Supplement requiring FDA approval before implementation; new indications, dosage forms, manufacturing site changes' }),
  entry('US_BLA_SUPP', 'US', 'United States', 'FDA', 'supplement', 'BLA Supplement', 'BLA Supplement (sBLA)', { stage: 'supplement', parentApplicationType: 'US_BLA', synonyms: ['sBLA', 'BLA supplement'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Supplement to an approved BLA requiring FDA approval before implementation' }),

  // Master Files
  entry('US_DMF', 'US', 'United States', 'FDA', 'master_file', 'DMF', 'Drug Master File', { synonyms: ['DMF', 'Drug Master File'], lifecycleActions: ['submit', 'amend'], segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', description: 'Confidential filing by API/excipient manufacturers containing detailed CMC information; referenced by IND/NDA applicants' }),

  // Device
  entry('US_510K', 'US', 'United States', 'FDA', 'device_clearance', '510(k)', '510(k) Premarket Notification', { synonyms: ['510(k)', '510k', 'premarket notification'], productClass: ['medical_device', 'ivd'], dossierStandard: 'eSTAR', requiredArtifacts: ['cover_letter', 'device_description', 'predicate_comparison', 'performance_testing'], segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'eSTAR', description: 'Substantial equivalence to predicate for Class II devices. Includes device description, predicate comparison, performance testing, biocompatibility. 90-day review. Sub-types: Traditional, Special, Abbreviated.' }),
  entry('US_PMA', 'US', 'United States', 'FDA', 'device_approval', 'PMA', 'Premarket Approval Application', { synonyms: ['PMA', 'premarket approval'], productClass: ['medical_device'], requiredArtifacts: ['cover_letter', 'device_description', 'clinical_data'], segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'eCopy', description: 'Most rigorous FDA pathway for Class III high-risk devices; requires valid scientific evidence. 180-day review. Includes manufacturing inspection.' }),
  entry('US_DE_NOVO', 'US', 'United States', 'FDA', 'device_clearance', 'De Novo', 'De Novo Classification Request', { synonyms: ['De Novo', 'de novo classification'], productClass: ['medical_device', 'ivd'], dossierStandard: 'eSTAR', segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'eSTAR', description: 'Risk-based pathway for novel low-to-moderate risk devices with no predicate; creates new classification regulation and product code' }),
  entry('US_EUA', 'US', 'United States', 'FDA', 'device_clearance', 'EUA', 'Emergency Use Authorization', { synonyms: ['EUA', 'emergency use'], productClass: ['medical_device', 'ivd', 'vaccine'], dossierStandard: 'none', segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'none', description: 'Temporary authorization during public health emergencies for unapproved devices or unapproved uses of approved devices' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// EUROPEAN UNION (EMA)
// ═══════════════════════════════════════════════════════════════════════════════

const EU_ENTRIES: RegulatoryApplicationType[] = [
  entry('EU_CTA', 'EU', 'European Union', 'EMA', 'clinical_trial', 'CTA', 'Clinical Trial Application (EU CTR)', { synonyms: ['CTA', 'EU Clinical Trial Application', 'CTIS'], requiredArtifacts: ['protocol', 'investigator_brochure', 'impd'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTIS', dossierStandard: 'regional', ctdModule: 'Part I–II', moduleAuthority: 'Regulation (EU) 536/2014 Annex I — a CTR CTA is a Part I / Part II submission through CTIS, not an eCTD five-module dossier. The client mirror carried this correction; unified here (BP-W1-2).', description: 'EU application under Clinical Trial Regulation (EU 536/2014) submitted via CTIS portal; single application covers all member states' }),
  entry('EU_MAA', 'EU', 'European Union', 'EMA', 'marketing_authorization', 'MAA', 'Marketing Authorisation Application', { synonyms: ['MAA', 'centralised procedure'], requiredArtifacts: ['clinical_overview', 'quality_overall_summary', 'rmp'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'EU centralized procedure application to CHMP; mandatory for biotech products, orphan drugs, advanced therapies' }),
  entry('EU_ASMF', 'EU', 'European Union', 'EMA', 'master_file', 'ASMF', 'Active Substance Master File', { synonyms: ['ASMF', 'EU DMF', 'active substance master file'], segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', ctdModule: '3.2.S', description: 'EU equivalent of DMF; confidential manufacturing and quality data for active substances filed by API manufacturers' }),
  entry('EU_VARIATION_IA', 'EU', 'European Union', 'EMA', 'variation', 'Type IA Variation', 'Type IA Variation (Minor)', { stage: 'amendment', synonyms: ['Type IA', 'minor variation'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'EU post-authorization change: Type IA (minor, notification)' }),
  entry('EU_VARIATION_IB', 'EU', 'European Union', 'EMA', 'variation', 'Type IB Variation', 'Type IB Variation', { stage: 'amendment', synonyms: ['Type IB'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'EU post-authorization change: Type IB (30-day review)' }),
  entry('EU_VARIATION_II', 'EU', 'European Union', 'EMA', 'variation', 'Type II Variation', 'Type II Variation (Major)', { stage: 'amendment', synonyms: ['Type II', 'major variation'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'EU post-authorization change: Type II (major, full CHMP assessment)' }),
  entry('EU_PIP', 'EU', 'European Union', 'EMA', 'pediatric', 'PIP', 'Paediatric Investigation Plan', { synonyms: ['PIP', 'paediatric plan'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1 (EU regional)', moduleAuthority: 'Regulation (EC) No 1901/2006; EMA Paediatric Committee (PDCO). BP-W1-3: the PSP synonym was removed — a PIP is agreed with the PDCO on the EMA timeline and is not the same record, submission or deadline as an FDA PSP.', description: 'EU paediatric development plan agreed with the EMA Paediatric Committee under Regulation (EC) No 1901/2006; normally agreed after end-of-Phase-1 PK studies and before the MAA. Distinct from the FDA PSP (US_PSP).' }),
  entry('EU_ORPHAN', 'EU', 'European Union', 'EMA', 'orphan', 'Orphan Designation', 'Orphan Drug Designation (ODD)', { synonyms: ['orphan designation', 'rare disease', 'ODD'], segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', description: 'Designation for drugs treating rare diseases; unlocks incentives, fee waivers, and market exclusivity' }),
  entry('EU_RMP', 'EU', 'European Union', 'EMA', 'safety_report', 'RMP', 'Risk Management Plan', { synonyms: ['RMP', 'risk management'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1.8', description: 'EU mandatory risk management plan: safety specification, pharmacovigilance plan, and risk minimisation measures' }),
  entry('EU_PSUR', 'EU', 'European Union', 'EMA', 'safety_report', 'PSUR/PBRER', 'PSUR / PBRER', { synonyms: ['PSUR', 'PBRER', 'periodic safety'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M5', description: 'ICH E2C(R2) harmonized periodic safety report evaluating benefit-risk balance; submitted at defined intervals post-authorization' }),
  entry('EU_RENEWAL', 'EU', 'European Union', 'EMA', 'renewal', 'Renewal', 'Renewal Application', { stage: 'renewal', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1', description: 'Application to renew marketing authorization after initial 5-year period; after renewal, authorization is typically unlimited' }),
  entry('EU_CER', 'EU', 'European Union', 'EMA', 'device_approval', 'CER', 'Clinical Evaluation Report (CER)', { synonyms: ['CER', 'clinical evaluation report', 'EU MDR'], productClass: ['medical_device'], dossierStandard: 'regional', segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'MEDDEV 2.7/1', description: 'Systematic assessment of clinical data demonstrating conformity with General Safety and Performance Requirements' }),
  entry('EU_IVDR', 'EU', 'European Union', 'EMA', 'device_approval', 'IVDR', 'IVDR Technical Documentation', { synonyms: ['IVDR', 'IVD regulation', 'IVDR technical file'], productClass: ['ivd'], dossierStandard: 'regional', segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'STED', description: 'Complete technical file per IVDR Annexes II–III: device description, GSPR compliance, performance evaluation, labeling, PMS plan' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// UNITED KINGDOM (MHRA)
// ═══════════════════════════════════════════════════════════════════════════════

const UK_ENTRIES: RegulatoryApplicationType[] = [
  entry('UK_CTA', 'UK', 'United Kingdom', 'MHRA', 'clinical_trial', 'CTA', 'Clinical Trial Authorisation (UK)', { synonyms: ['UK CTA'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', description: 'UK post-Brexit clinical trial authorisation submitted to MHRA; parallels EU CTR but under UK-specific regulations' }),
  entry('UK_MA', 'UK', 'United Kingdom', 'MHRA', 'marketing_authorization', 'UK MA', 'UK Marketing Authorisation', { synonyms: ['UK MA', 'UK marketing authorization'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'National marketing authorisation application to MHRA; UK-specific Module 1 with CTD Modules 2–5' }),
  entry('UK_IRP', 'UK', 'United Kingdom', 'MHRA', 'marketing_authorization', 'IRP', 'International Recognition Procedure', { synonyms: ['IRP'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'MHRA pathway recognising approvals from trusted reference agencies (FDA, EMA, TGA, Health Canada, Swissmedic, etc.)' }),
  entry('UK_VARIATION', 'UK', 'United Kingdom', 'MHRA', 'variation', 'UK Variation', 'UK Marketing Authorisation Variation', { stage: 'amendment', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Post-authorisation change to a UK MA; classified as Type IA, IB, or II mirroring the EU variation system' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CANADA (Health Canada)
// ═══════════════════════════════════════════════════════════════════════════════

const CA_ENTRIES: RegulatoryApplicationType[] = [
  entry('CA_CTA', 'CA', 'Canada', 'Health_Canada', 'clinical_trial', 'CTA', 'Clinical Trial Application (Canada)', { synonyms: ['Canadian CTA'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Health Canada clinical trial application; CTD format with Canadian Module 1 requirements' }),
  entry('CA_CTA_A', 'CA', 'Canada', 'Health_Canada', 'clinical_trial', 'CTA-A', 'Clinical Trial Application Amendment', { stage: 'amendment', parentApplicationType: 'CA_CTA', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', description: 'Amendment to an approved Canadian CTA; protocol amendments, IB updates, safety information' }),
  entry('CA_NDS', 'CA', 'Canada', 'Health_Canada', 'marketing_authorization', 'NDS', 'New Drug Submission (NDS)', { synonyms: ['NDS'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Canadian marketing authorization application; CTD format with Canada-specific Module 1' }),
  entry('CA_SNDS', 'CA', 'Canada', 'Health_Canada', 'supplement', 'SNDS', 'Supplemental New Drug Submission', { stage: 'supplement', parentApplicationType: 'CA_NDS', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Supplement to an approved NDS for new indications, formulation changes, or manufacturing site changes' }),
  entry('CA_ANDS', 'CA', 'Canada', 'Health_Canada', 'marketing_authorization', 'ANDS', 'Abbreviated New Drug Submission', { synonyms: ['ANDS', 'Canadian generic'], productClass: ['generic'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5 (BE reports in 5.3.1)', moduleAuthority: 'ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: was M1–M3, same defect as US_ANDA — no module for the comparative bioavailability evidence the submission exists to present.', description: 'Canadian generic drug submission demonstrating bioequivalence to a Canadian Reference Product; comparative bioavailability study reports are filed in Module 5.3.1' }),
  entry('CA_SANDS', 'CA', 'Canada', 'Health_Canada', 'supplement', 'SANDS', 'Supplemental Abbreviated New Drug Submission', { stage: 'supplement', parentApplicationType: 'CA_ANDS', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', description: 'Supplement to an approved ANDS for post-approval changes to generic products' }),
  entry('CA_MF', 'CA', 'Canada', 'Health_Canada', 'master_file', 'MF', 'Master File (Canada)', { synonyms: ['Canadian MF'], segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.S', description: 'Confidential manufacturing and quality data for APIs or excipients; referenced by NDS/ANDS applicants' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// JAPAN (PMDA)
// ═══════════════════════════════════════════════════════════════════════════════

const JP_ENTRIES: RegulatoryApplicationType[] = [
  entry('JP_CTN', 'JP', 'Japan', 'PMDA', 'clinical_trial', 'CTN', 'Clinical Trial Notification', { synonyms: ['CTN', '治験届'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Notification to PMDA 30 days before commencing a clinical trial in Japan; Japanese-language Module 1 requirements' }),
  entry('JP_MKT_APPROVAL', 'JP', 'Japan', 'PMDA', 'marketing_authorization', 'Marketing Approval', 'Marketing Approval Application (Japan)', { synonyms: ['承認申請', 'JNDA'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Japanese marketing approval application submitted to PMDA; CTD format with Japan-specific Module 1 and potentially Japanese clinical data' }),
  entry('JP_MF', 'JP', 'Japan', 'PMDA', 'master_file', 'MF', 'Master File (Japan)', { synonyms: ['Japanese MF', 'MF登録'], segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.S', description: 'PMDA Master File for APIs and excipients; confidential quality data referenced by marketing approval applicants' }),
  entry('JP_PARTIAL_CHANGE', 'JP', 'Japan', 'PMDA', 'variation', 'Partial Change', 'Partial Change Application', { stage: 'amendment', synonyms: ['一部変更承認申請'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Major post-approval change requiring PMDA approval before implementation; new indications, formulations, manufacturing changes' }),
  entry('JP_MINOR_CHANGE', 'JP', 'Japan', 'PMDA', 'variation', 'Minor Change', 'Minor Change Notification', { stage: 'amendment', synonyms: ['軽微変更届'], segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', description: 'Minor post-approval change notification to PMDA; no prior approval required' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CHINA (NMPA)
// ═══════════════════════════════════════════════════════════════════════════════

const CN_ENTRIES: RegulatoryApplicationType[] = [
  entry('CN_CTA', 'CN', 'China', 'NMPA', 'clinical_trial', 'CTA', 'Clinical Trial Application (China)', { synonyms: ['Chinese CTA', '药物临床试验申请'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'NMPA clinical trial application; 60-day tacit approval. CTD format with China-specific Module 1 requirements.' }),
  entry('CN_MAA', 'CN', 'China', 'NMPA', 'marketing_authorization', 'MAA', 'Marketing Authorization Application (China)', { synonyms: ['Chinese MAA', '药品注册申请'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'NMPA marketing authorization; CTD format with China-specific Module 1, ethnic sensitivity bridging data may be required' }),
  entry('CN_SUPPLEMENT', 'CN', 'China', 'NMPA', 'supplement', 'Supplementary Application', 'Supplementary Application (China)', { stage: 'supplement', dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'Post-approval change application to NMPA for new indications, formulations, or manufacturing changes' }),
  entry('CN_RENEWAL', 'CN', 'China', 'NMPA', 'renewal', 'Renewal', 'Registration Renewal (China)', { stage: 'renewal', dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'CTD', ctdModule: 'M1', description: 'Five-year registration renewal application to NMPA; includes pharmacovigilance summary and benefit-risk reassessment' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// AUSTRALIA (TGA)
// ═══════════════════════════════════════════════════════════════════════════════

const AU_ENTRIES: RegulatoryApplicationType[] = [
  entry('AU_CTN', 'AU', 'Australia', 'TGA', 'clinical_trial', 'CTN', 'Clinical Trial Notification (CTN)', { synonyms: ['CTN', 'TGA notification'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', description: 'Notification to Australia’s TGA before commencing a clinical trial' }),
  entry('AU_CTA', 'AU', 'Australia', 'TGA', 'clinical_trial', 'CTA', 'Clinical Trial Approval (Australia)', { synonyms: ['TGA CTA'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'TGA Clinical Trial Approval scheme for higher-risk trials; TGA reviews the trial before it can proceed' }),
  entry('AU_CAT1', 'AU', 'Australia', 'TGA', 'marketing_authorization', 'Category 1', 'Category 1 Registration', { synonyms: ['Cat 1'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'TGA Category 1 application for new chemical entities and biologics; full evaluation with CTD dossier' }),
  entry('AU_CAT2', 'AU', 'Australia', 'TGA', 'marketing_authorization', 'Category 2', 'Category 2 Registration', { synonyms: ['Cat 2'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'TGA Category 2 (abridged) for products approved by a comparable overseas regulator; relies on foreign assessment reports' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SWITZERLAND (Swissmedic)
// ═══════════════════════════════════════════════════════════════════════════════

const CH_ENTRIES: RegulatoryApplicationType[] = [
  entry('CH_CTA', 'CH', 'Switzerland', 'Swissmedic', 'clinical_trial', 'CTA', 'Clinical Trial Application (Switzerland)', { synonyms: ['Swiss CTA'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Swissmedic clinical trial authorisation; dual submission to Swissmedic and cantonal ethics committee' }),
  entry('CH_MA', 'CH', 'Switzerland', 'Swissmedic', 'marketing_authorization', 'MA', 'Marketing Authorisation (Switzerland)', { synonyms: ['Swiss MA'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'Swissmedic marketing authorisation; CTD dossier with Swiss-specific Module 1. Fast-track and prior-notification pathways available.' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// BRAZIL (ANVISA)
// ═══════════════════════════════════════════════════════════════════════════════

const BR_ENTRIES: RegulatoryApplicationType[] = [
  entry('BR_DDCM', 'BR', 'Brazil', 'ANVISA', 'clinical_trial', 'DDCM', 'Dossiê de Desenvolvimento Clínico de Medicamento', { synonyms: ['DDCM', 'Brazilian clinical trial'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'ANVISA clinical development dossier for new drugs; CTD format with Brazil-specific requirements and CEP ethics approval' }),
  entry('BR_DEEC', 'BR', 'Brazil', 'ANVISA', 'clinical_trial', 'DEEC', 'Dossiê Específico de Ensaio Clínico', { synonyms: ['DEEC'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', description: 'ANVISA study-specific clinical trial dossier submitted alongside DDCM for each individual study protocol' }),
  entry('BR_MA', 'BR', 'Brazil', 'ANVISA', 'marketing_authorization', 'MA', 'Marketing Authorization (Brazil)', { synonyms: ['Brazilian MA', 'registro'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'ANVISA registration (registro) for new drugs; CTD format with Brazilian Module 1 requirements. MDSAP accepted for devices.' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// INDIA (CDSCO)
// ═══════════════════════════════════════════════════════════════════════════════

const IN_ENTRIES: RegulatoryApplicationType[] = [
  entry('IN_CT04', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-04', 'Form CT-04 (New Drug Clinical Trial)', { synonyms: ['CT-04', 'Indian CT application'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'CDSCO Form CT-04 for new drug clinical trial permission under New Drugs & Clinical Trials Rules 2019; via SUGAM portal' }),
  entry('IN_CT06', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-06', 'Form CT-06 (Bioequivalence/Bioavailability)', { synonyms: ['CT-06'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', description: 'CDSCO Form CT-06 for bioequivalence and bioavailability studies; required for generic drug development in India' }),
  entry('IN_CT07', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-07', 'Form CT-07 (Post-Marketing Study)', { synonyms: ['CT-07'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'CTD', description: 'CDSCO Form CT-07 for post-marketing surveillance studies; Phase IV commitments and safety monitoring' }),
  entry('IN_CT11', 'IN', 'India', 'CDSCO', 'clinical_trial', 'CT-11', 'Form CT-11 (Clinical Trial Report)', { synonyms: ['CT-11'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'CTD', ctdModule: 'M5', description: 'CDSCO Form CT-11 for clinical trial completion reports; submitted within specified timelines after study completion' }),
  entry('IN_CT18', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-18', 'Form CT-18 (New Drug Marketing)', { synonyms: ['CT-18'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'CDSCO Form CT-18 for marketing approval of new drugs; full CTD dossier submission via SUGAM portal' }),
  entry('IN_CT19', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-19', 'Form CT-19 (Import Registration)', { synonyms: ['CT-19'], dossierStandard: 'CTD', segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'CTD', ctdModule: 'M1–M5', description: 'CDSCO Form CT-19 for import registration of new drugs manufactured outside India; requires GMP certificate from country of origin' }),
  entry('IN_CT21', 'IN', 'India', 'CDSCO', 'marketing_authorization', 'CT-21', 'Form CT-21 (Generic Drug Marketing)', { synonyms: ['CT-21'], dossierStandard: 'CTD', productClass: ['generic'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'CTD', ctdModule: 'M1–M3', description: 'CDSCO Form CT-21 for marketing approval of generic drugs; bioequivalence data and abbreviated CMC package' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SOUTH KOREA (MFDS)
// ═══════════════════════════════════════════════════════════════════════════════

const KR_ENTRIES: RegulatoryApplicationType[] = [
  entry('KR_IND', 'KR', 'South Korea', 'MFDS', 'clinical_trial', 'IND', 'IND Application (South Korea)', { synonyms: ['Korean IND', '임상시험계획승인'], segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'MFDS clinical trial plan approval application; 30-day review with Korean-language Module 1' }),
  entry('KR_MA_NEW', 'KR', 'South Korea', 'MFDS', 'marketing_authorization', 'New Drug MA', 'Marketing Application — New Drug (Korea)', { synonyms: ['Korean MA', '품목허가'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'MFDS marketing approval for new drugs; CTD format with Korean-specific requirements. Korean bridging data may be required.' }),
  entry('KR_MA_GENERIC', 'KR', 'South Korea', 'MFDS', 'marketing_authorization', 'Generic MA', 'Marketing Application — Generic (Korea)', { productClass: ['generic'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M3', description: 'MFDS generic drug marketing approval; bioequivalence data and abbreviated CMC package' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// SINGAPORE (HSA)
// ═══════════════════════════════════════════════════════════════════════════════

const SG_ENTRIES: RegulatoryApplicationType[] = [
  entry('SG_NDA', 'SG', 'Singapore', 'HSA', 'marketing_authorization', 'NDA', 'New Drug Application (Singapore)', { synonyms: ['Singapore NDA'], dossierStandard: 'ACTD', segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'ACTD', ctdModule: 'M1–M5', description: 'HSA new drug application using ASEAN CTD format; full evaluation route for new chemical entities and biologics' }),
  entry('SG_GDA', 'SG', 'Singapore', 'HSA', 'marketing_authorization', 'GDA', 'Generic Drug Application (Singapore)', { synonyms: ['Singapore GDA', 'ACTD generic'], dossierStandard: 'ACTD', productClass: ['generic'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'ACTD', ctdModule: 'M1–M3', description: 'HSA generic drug application with bioequivalence data; abbreviated ACTD dossier' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// TAXONOMY BUILDOUT — Concept2Cure Regulatory Filing & Document Taxonomy
//
// Entries below are organized by the document's SEGMENT → CATEGORY structure
// (the second axis). Each still carries full region/agency metadata (the first
// axis), so both organizing views resolve the same canonical entries. Filings
// already defined in the region blocks above are tagged there, not duplicated.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SEGMENT 1 · PHARMA & BIOTECH ─────────────────────────────────────────────

// Category: Preclinical / Pre-IND
const SEG_PHARMA_PRECLINICAL: RegulatoryApplicationType[] = [
  entry('EU_SCIENTIFIC_ADVICE', 'EU', 'European Union', 'EMA', 'pre_submission', 'Scientific Advice', 'Scientific Advice / Protocol Assistance', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', lifecycleActions: ['submit'], synonyms: ['scientific advice', 'protocol assistance', 'CHMP advice', 'SAWP'], description: 'Formal scientific advice from CHMP/SAWP on development strategy, endpoints, comparators, and study design' }),
  entry('US_ORPHAN', 'US', 'United States', 'FDA', 'orphan', 'Orphan Designation', 'Orphan Drug Designation (ODD)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', synonyms: ['orphan designation', 'ODD', 'rare disease'], description: 'Designation for drugs treating rare diseases; unlocks incentives, fee waivers, and market exclusivity' }),
  entry('US_BTD', 'US', 'United States', 'FDA', 'designation', 'Breakthrough Therapy', 'Breakthrough Therapy Designation (BTD)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['BTD', 'breakthrough therapy'], description: 'Expedited development and intensive FDA guidance for drugs showing substantial improvement over existing treatments' }),
  entry('EU_PRIME', 'EU', 'European Union', 'EMA', 'designation', 'PRIME', 'PRIME Designation', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', lifecycleActions: ['submit'], synonyms: ['PRIME', 'priority medicines'], description: 'EU priority medicines scheme providing enhanced interaction and early dialogue with EMA for products addressing unmet medical need' }),
  entry('US_FAST_TRACK', 'US', 'United States', 'FDA', 'designation', 'Fast Track', 'Fast Track Designation', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['fast track'], description: 'Enables rolling review and more frequent interactions for drugs treating serious conditions and filling an unmet medical need' }),
  entry('US_RMAT', 'US', 'United States', 'FDA', 'designation', 'RMAT', 'Regenerative Medicine Advanced Therapy (RMAT)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', productClass: ['atmp', 'biologic'], lifecycleActions: ['submit'], synonyms: ['RMAT', 'regenerative medicine'], description: 'Designation for cell therapy, gene therapy, tissue engineering products providing expedited development features' }),
];

// Category: Investigational (Clinical Development)
const SEG_PHARMA_INVESTIGATIONAL: RegulatoryApplicationType[] = [
  entry('US_IND_SR', 'US', 'United States', 'FDA', 'safety_report', 'IND Safety Report', 'IND Safety Reports (IND-SR)', { stage: 'post_approval', parentApplicationType: 'US_IND', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5', productClass: ['small_molecule', 'biologic'], synonyms: ['IND-SR', 'safety report'], description: 'Expedited safety reports of serious and unexpected adverse reactions within 15 days (7 days for fatal/life-threatening)' }),
  entry('US_IND_ANNUAL', 'US', 'United States', 'FDA', 'safety_report', 'IND Annual Report', 'Annual Report (IND)', { stage: 'annual_report', parentApplicationType: 'US_IND', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5', synonyms: ['IND annual report'], description: 'Annual summary within 60 days of IND anniversary covering clinical study progress, safety data, CMC changes' }),
  entry('ICH_DSUR', 'GLOBAL', 'Global', 'ICH', 'safety_report', 'DSUR', 'Development Safety Update Report (DSUR)', { stage: 'annual_report', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5', synonyms: ['DSUR', 'ICH E2F'], description: 'ICH E2F-harmonized annual safety report covering all ongoing clinical trials globally' }),
  entry('ICH_PROTOCOL', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Protocol', 'Protocol & Protocol Amendments', { segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5', lifecycleActions: ['submit', 'amend'], synonyms: ['protocol', 'protocol amendment', 'SAP'], description: 'Clinical trial protocol defining study design, endpoints, populations, and SAP; amendments require notification or approval' }),
  entry('ICH_IB', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Investigator Brochure', 'Investigator’s Brochure (IB)', { segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M1 (US IND — FDA eCTD m1.14.4.1)', moduleAuthority: 'FDA eCTD Module 1 Specification v2.3 — m1.14.4.1 (investigator brochure). BP-W1-3: was M5, which is where the CLINICAL STUDY REPORTS live; the IB is regional Module 1 administrative/reference content for a US IND, so an M5 assignment puts it in the wrong backbone node and the sequence does not validate.', lifecycleActions: ['submit', 'amend'], synonyms: ['IB', 'investigator brochure', 'ICH E6'], description: 'ICH E6 GCP-required document compiling all relevant clinical and nonclinical data; updated at least annually' }),
  entry('ICH_ICF', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Informed Consent Form', 'Informed Consent Form (ICF)', { segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', dossierStandard: 'CTD', ctdModule: 'M5 (5.3.5 — CSR appendix 16.1.3)', moduleAuthority: 'ICH E3 §16.1.3 (sample consent form is a CSR appendix); ICH M4 Annex 5.3.5. BP-W1-3: the row carried submissionFormat/dossierStandard \'none\' and no module, so it was in the catalog as a filing type that could not be filed anywhere. SME DECISION REQUIRED — the work order offers \'assign a format and module, or remove from the catalog\'. Assigned rather than removed, because the specimen ICF IS a filed artefact: it travels as CSR appendix 16.1.3 in M5.3.5. Note this is the SPECIMEN filed with the dossier, not the executed patient-signed consents, which are site records and are never submitted.', lifecycleActions: ['submit', 'amend'], synonyms: ['ICF', 'informed consent'], description: 'Patient-facing document meeting 21 CFR 50 / ICH GCP requirements; reviewed by IRB/Ethics Committee' }),
  entry('ICH_CSR', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Clinical Study Report', 'Clinical Study Report (CSR)', { segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'eCTD', ctdModule: 'M5 (5.3.5)', synonyms: ['CSR', 'ICH E3'], description: 'ICH E3-structured comprehensive report of individual clinical study results; foundational efficacy and safety document' }),
  entry('ICH_SAP', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Statistical Analysis Plan', 'Statistical Analysis Plan (SAP)', { segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'none', dossierStandard: 'none', ctdModule: 'M5', synonyms: ['SAP', 'statistical analysis plan'], description: 'Pre-specified plan detailing statistical methods, analysis populations, multiplicity adjustments, and endpoint definitions' }),
];

// Category: Marketing Authorization (Registration)
const SEG_PHARMA_MARKETING: RegulatoryApplicationType[] = [
  entry('US_351K', 'US', 'United States', 'FDA', 'marketing_authorization', '351(k)', 'Biosimilar Application (351(k))', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', productClass: ['biosimilar'], synonyms: ['351(k)', 'biosimilar'], description: 'Application for biosimilar biological products demonstrating biosimilarity to a reference product' }),
  entry('US_ACCEL_APPROVAL', 'US', 'United States', 'FDA', 'marketing_authorization', 'Accelerated Approval', 'Accelerated Approval Application', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', synonyms: ['accelerated approval', 'subpart H'], description: 'NDA/BLA using surrogate or intermediate endpoint; requires post-marketing confirmatory trials' }),
  entry('EU_CMA', 'EU', 'European Union', 'EMA', 'marketing_authorization', 'Conditional MA', 'Conditional Marketing Authorisation', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', lifecycleActions: ['submit', 'renew'], synonyms: ['conditional MA', 'CMA'], description: 'EU approval based on less comprehensive data; subject to annual renewal and obligations to provide complete data' }),
  entry('US_ROLLING', 'US', 'United States', 'FDA', 'marketing_authorization', 'Rolling Submission', 'Rolling Submission / Review', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', synonyms: ['rolling review', 'rolling submission'], description: 'Under Breakthrough or Fast Track; allows completed sections to be submitted before the full application is complete' }),
  entry('US_PSP', 'US', 'United States', 'FDA', 'pediatric', 'PSP', 'Pediatric Study Plan (PSP)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1', synonyms: ['PSP', 'pediatric study plan', 'iPSP'], moduleAuthority: '21 CFR 314.55; FDCA §505B. BP-W1-3: the PIP synonym was removed — an initial PSP is submitted to FDA no later than 60 days after the end-of-Phase-2 meeting, a different agency and a different clock from the EMA PIP (EU_PIP).', description: 'US initial Pediatric Study Plan submitted to FDA under 21 CFR 314.55, no later than 60 days after the end-of-Phase-2 meeting. Distinct from the EMA PIP (EU_PIP).' }),
];

// Category: Post-Approval Lifecycle
const SEG_PHARMA_POST_APPROVAL: RegulatoryApplicationType[] = [
  entry('US_CBE', 'US', 'United States', 'FDA', 'supplement', 'CBE Supplement', 'CBE-30 / CBE-0 Supplement', { stage: 'supplement', parentApplicationType: 'US_NDA', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M3', synonyms: ['CBE-30', 'CBE-0', 'changes being effected'], description: 'Changes Being Effected supplements: CBE-30 (moderate changes, 30-day); CBE-0 (labeling safety updates, immediate)' }),
  entry('US_NDA_ANNUAL', 'US', 'United States', 'FDA', 'safety_report', 'Annual Report (NDA/BLA)', 'Annual Report (NDA/BLA)', { stage: 'annual_report', parentApplicationType: 'US_NDA', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1', synonyms: ['annual report'], description: 'Post-approval annual report covering distribution data, labeling changes, manufacturing changes, post-marketing commitments' }),
  entry('US_REMS', 'US', 'United States', 'FDA', 'safety_report', 'REMS', 'Risk Evaluation & Mitigation Strategy (REMS)', { stage: 'post_approval', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'none', dossierStandard: 'none', ctdModule: 'M1', synonyms: ['REMS', 'risk mitigation'], description: 'Risk management program for drugs with serious safety concerns; medication guides, ETASU, implementation systems' }),
  entry('US_PMR', 'US', 'United States', 'FDA', 'post_market', 'PMR/PMC', 'Post-Marketing Requirement (PMR) / PMC', { stage: 'post_approval', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M5', synonyms: ['PMR', 'PMC', 'post-marketing requirement'], description: 'FDA-required or committed post-marketing studies or clinical trials; common for accelerated approval confirmatory trials' }),
  entry('US_SUPAC', 'US', 'United States', 'FDA', 'supplement', 'SUPAC', 'SUPAC Supplement', { stage: 'supplement', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M3', synonyms: ['SUPAC', 'scale-up post-approval changes'], description: 'Scale-Up and Post-Approval Changes for CMC manufacturing process changes, site transfers; classified by level of change' }),
  /* BP-W1-3: 'MedWatch / FAERS Report' was one catalog row. FAERS is a
     DATABASE and MedWatch is the form family that feeds it — neither is a
     submission a sponsor plans, schedules or assembles, so the row could not be
     started, tracked or gated like every other filing type beside it. It also
     collapsed two obligations with different legal bases and different clocks
     into one description ('15-day … 90-day'), which is the kind of conflation
     that produces a missed report.

     Replaced by the two obligations a US sponsor actually owes. Both remain
     dossierStandard 'none': an ICSR is transmitted as an E2B(R3) message to
     the gateway, and a PADER is a periodic report — neither is eCTD content. */
  entry('US_ICSR_15DAY', 'US', 'United States', 'FDA', 'safety_report', '15-Day Alert Report', '15-Day Alert Report (ICSR)', { stage: 'post_approval', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'E2B(R3)', dossierStandard: 'none', synonyms: ['15-day', 'alert report', 'ICSR', 'MedWatch', 'FAERS'], moduleAuthority: '21 CFR 314.80(c)(1). Not eCTD content — an E2B(R3) transmission to FAERS.', description: 'Expedited individual case safety report for a serious, unexpected, suspected adverse reaction. Due within 15 calendar days of receipt; transmitted as an E2B(R3) message to FAERS.' }),
  entry('US_PADER', 'US', 'United States', 'FDA', 'safety_report', 'PADER', 'Periodic Adverse Drug Experience Report (PADER)', { stage: 'post_approval', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['PADER', 'periodic safety report', 'periodic report'], moduleAuthority: '21 CFR 314.80(c)(2).', description: 'US periodic adverse drug experience report: quarterly for the first three years after approval, annually thereafter. Covers non-expedited cases plus a narrative summary.' }),
];

// Category: CMC / Quality (Module 3)
const SEG_PHARMA_CMC: RegulatoryApplicationType[] = [
  entry('ICH_M3_DS', 'GLOBAL', 'Global', 'ICH', 'quality_cmc', 'Module 3.2.S', 'Module 3.2.S — Drug Substance', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.S', synonyms: ['3.2.S', 'drug substance'], description: 'Complete drug substance quality package: manufacturing process, characterization, specifications, stability, container closure' }),
  entry('ICH_M3_DP', 'GLOBAL', 'Global', 'ICH', 'quality_cmc', 'Module 3.2.P', 'Module 3.2.P — Drug Product', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.P', synonyms: ['3.2.P', 'drug product'], description: 'Complete drug product quality package: formulation, manufacturing process, validation, excipient controls, specifications, stability' }),
  entry('ICH_QOS', 'GLOBAL', 'Global', 'ICH', 'quality_cmc', 'QOS', 'Quality Overall Summary (QOS)', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '2.3', synonyms: ['QOS', 'quality overall summary'], description: 'Module 2.3 summary of all quality data; must cross-reference Module 3 data without contradiction' }),
  entry('ICH_COMPARABILITY', 'GLOBAL', 'Global', 'ICH', 'quality_cmc', 'Comparability Protocol', 'Comparability Protocol', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.S/P', synonyms: ['comparability protocol'], description: 'Pre-approved protocol for managing future manufacturing changes with pre-defined acceptance criteria' }),
  entry('US_EA', 'US', 'United States', 'FDA', 'quality_cmc', 'Environmental Assessment', 'Environmental Assessment (EA)', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: 'M1', synonyms: ['EA', 'environmental assessment', 'NEPA'], description: 'NEPA-required environmental impact assessment for drug manufacturing and use' }),
];

// ─── SEGMENT 2 · MEDICAL DEVICES ──────────────────────────────────────────────

// Category: Classification & Pre-Submission
const SEG_DEVICE_CLASSIFICATION: RegulatoryApplicationType[] = [
  entry('US_513G', 'US', 'United States', 'FDA', 'pre_submission', '513(g)', '513(g) Classification Request', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_classification_pre_sub', submissionFormat: 'Letter', dossierStandard: 'none', productClass: ['medical_device'], lifecycleActions: ['submit'], synonyms: ['513(g)', 'classification request'], description: 'Formal request to FDA to classify a device; FDA responds with classification (Class I, II, or III) and product code' }),
  entry('US_QSUB', 'US', 'United States', 'FDA', 'pre_submission', 'Q-Sub', 'Pre-Submission (Q-Sub)', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_classification_pre_sub', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], lifecycleActions: ['submit'], synonyms: ['Q-Sub', 'pre-submission', 'presub'], description: 'Formal FDA feedback request covering testing strategy, clinical study design, regulatory pathway, and data requirements' }),
  entry('US_RFD', 'US', 'United States', 'FDA', 'pre_submission', 'RFD', 'Request for Designation (RFD)', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_classification_pre_sub', submissionFormat: 'Letter', dossierStandard: 'none', productClass: ['combination_product'], lifecycleActions: ['submit'], synonyms: ['RFD', 'request for designation'], description: 'Request to determine product jurisdiction (CDER, CBER, or CDRH) and primary mode of action for combination products' }),
  entry('US_BREAKTHROUGH_DEVICE', 'US', 'United States', 'FDA', 'designation', 'Breakthrough Device', 'Breakthrough Device Designation', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_classification_pre_sub', submissionFormat: 'Letter', dossierStandard: 'none', productClass: ['medical_device'], lifecycleActions: ['submit'], synonyms: ['breakthrough device'], description: 'Designation for devices providing more effective treatment/diagnosis of life-threatening conditions; prioritized review' }),
];

// Category: Market Authorization (US FDA) — 510(k)/PMA/De Novo/EUA tagged in US_ENTRIES
const SEG_DEVICE_MARKET_US: RegulatoryApplicationType[] = [
  entry('US_HDE', 'US', 'United States', 'FDA', 'device_approval', 'HDE', 'Humanitarian Device Exemption (HDE)', { segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'eCopy', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['HDE', 'humanitarian device'], description: 'Pathway for devices treating <8,000 patients/year; requires probable benefit, not effectiveness. Annual reporting and IRB approval required.' }),
  entry('US_IDE', 'US', 'United States', 'FDA', 'device_clearance', 'IDE', 'Investigational Device Exemption (IDE)', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_market_auth_us', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['IDE', 'investigational device'], description: 'Authorization to conduct clinical trials with a significant risk device; required before pivotal trials for PMA' }),
];

// Category: Market Authorization (EU / International) — CER tagged in EU_ENTRIES
const SEG_DEVICE_MARKET_EU: RegulatoryApplicationType[] = [
  entry('EU_MDR_TECHDOC', 'EU', 'European Union', 'EMA', 'device_approval', 'EU MDR Tech Doc', 'EU MDR Technical Documentation', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'STED', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['MDR technical documentation', 'technical file', 'EU MDR 2017/745'], description: 'Technical file per EU MDR 2017/745 Annexes II–III: device description, GSPR checklist, risk management (ISO 14971), clinical evaluation, PMS plan' }),
  entry('EU_SSCP', 'EU', 'European Union', 'EMA', 'device_approval', 'SSCP', 'Summary of Safety & Clinical Performance (SSCP)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['SSCP', 'EUDAMED'], description: 'Public-facing document per MDR Article 32 for implantable and Class III devices; published on EUDAMED' }),
  entry('EU_DOC', 'EU', 'European Union', 'EMA', 'device_approval', 'DoC', 'EU Declaration of Conformity (DoC)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['DoC', 'declaration of conformity'], description: 'Manufacturer’s legally binding declaration that the device conforms to applicable EU MDR requirements' }),
  entry('UK_DEVICE_REG', 'UK', 'United Kingdom', 'MHRA', 'device_clearance', 'UK MHRA Registration', 'UK MHRA Registration', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['UKCA', 'UK device registration'], description: 'Post-Brexit device registration with UK MHRA; CE to UKCA marking migration' }),
  entry('CA_MDL', 'CA', 'Canada', 'Health_Canada', 'device_approval', 'MDL', 'Health Canada Medical Device Licence (MDL)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['MDL', 'medical device licence', 'SOR/98-282'], description: 'Device license under Medical Devices Regulations SOR/98-282; Class I–IV. MDSAP certification accepted.' }),
  entry('JP_SHONIN', 'JP', 'Japan', 'PMDA', 'device_approval', 'Shonin', 'PMDA Shonin (Approval)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['Shonin', '承認'], description: 'Japanese approval for Class III/IV devices; requires Japanese-language documentation and may require Japanese clinical data' }),
];

// Category: Post-Market & Lifecycle (devices)
const SEG_DEVICE_POST_MARKET: RegulatoryApplicationType[] = [
  entry('US_PMA_SUPP', 'US', 'United States', 'FDA', 'supplement', 'PMA Supplement', 'PMA Supplement (Panel-Track / 180-day / Real-Time / 30-day / Special)', { stage: 'supplement', parentApplicationType: 'US_PMA', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'eCopy', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['PMA supplement', 'panel-track'], description: 'Supplements for modifications to approved PMA; classified by significance of change' }),
  entry('US_510K_MOD', 'US', 'United States', 'FDA', 'device_clearance', '510(k) Modified Device', '510(k) for Modified Device', { parentApplicationType: 'US_510K', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'eSTAR', dossierStandard: 'eSTAR', productClass: ['medical_device'], synonyms: ['510(k) modification'], description: 'New 510(k) required when modifications could significantly affect safety or effectiveness' }),
  entry('US_PMA_ANNUAL', 'US', 'United States', 'FDA', 'post_market', 'Annual Report (PMA)', 'Annual Report (PMA)', { stage: 'annual_report', parentApplicationType: 'US_PMA', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['PMA annual report', '21 CFR 814.84'], description: 'Annual report per 21 CFR 814.84 summarizing manufacturing changes, clinical data, device failures, labeling changes' }),
  entry('US_MDR_REPORT', 'US', 'United States', 'FDA', 'post_market', 'MDR', 'Medical Device Report (MDR)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'eMDR', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['MDR', 'medical device report', 'eMDR', 'adverse event'], description: 'Mandatory adverse event reporting; deaths/serious injuries within 30 days (5 days if remedial action needed), malfunctions within 30 days' }),
  entry('EU_PSUR_DEVICE', 'EU', 'European Union', 'EMA', 'post_market', 'PSUR — Device', 'PSUR — Device (EU MDR Art. 86)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['device PSUR', 'MDR Article 86'], description: 'EU MDR Article 86 periodic safety update for Class IIa/IIb/III devices; updated CER conclusions, PMS data, CAPA trends' }),
  entry('EU_PMCF', 'EU', 'European Union', 'EMA', 'post_market', 'PMCF', 'Post-Market Clinical Follow-Up (PMCF)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['PMCF', 'MDR Annex XIV'], description: 'EU MDR Annex XIV Part B; proactive clinical data collection plan after CE marking to confirm long-term safety and performance' }),
  entry('EU_FSCA', 'EU', 'European Union', 'EMA', 'post_market', 'FSCA', 'Field Safety Corrective Action (FSCA)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['FSCA', 'field safety notice', 'FSN'], description: 'Corrective action to reduce risk of death or serious deterioration; accompanied by Field Safety Notice (FSN)' }),
  entry('US_RECALL', 'US', 'United States', 'FDA', 'post_market', 'Recall', 'Recall / Correction Report', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['recall', 'correction', '21 CFR 806'], description: '21 CFR 806; mandatory reporting of corrections and removals within 10 working days; classified Class I–III' }),
  entry('US_DHF', 'US', 'United States', 'FDA', 'quality_system', 'DHF', 'Design History File (DHF)', { stage: 'initial', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['DHF', 'design history file', '21 CFR 820.30'], description: 'Compilation of design control records per 21 CFR 820.30; design inputs, outputs, reviews, verification, validation, transfer' }),
  entry('ISO_RMF', 'GLOBAL', 'Global', 'ISO', 'quality_system', 'Risk Management File', 'Risk Management File (ISO 14971)', { stage: 'initial', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['risk management file', 'ISO 14971'], description: 'Complete risk documentation: risk management plan, hazard identification, risk estimation/evaluation, risk controls, residual risk' }),
];

// Category: Software as Medical Device (SaMD) / AI
const SEG_DEVICE_SAMD: RegulatoryApplicationType[] = [
  entry('US_SAMD_PRESUB', 'US', 'United States', 'FDA', 'pre_submission', 'SaMD Pre-Sub', 'SaMD Pre-Submission', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_samd_ai', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], lifecycleActions: ['submit'], synonyms: ['SaMD pre-submission', 'software pre-sub'], description: 'Pre-submission addressing software classification, IMDRF risk categorization, clinical evaluation, and cybersecurity' }),
  entry('US_PCCP', 'US', 'United States', 'FDA', 'software_documentation', 'PCCP', 'Predetermined Change Control Plan (PCCP)', { segment: 'medical_devices', category: 'device_samd_ai', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['PCCP', 'predetermined change control', 'AI/ML'], description: 'Plan describing anticipated AI/ML model modifications post-market; allows certain algorithm changes without new submissions' }),
  entry('IEC_62304', 'GLOBAL', 'Global', 'IEC', 'software_documentation', 'IEC 62304', 'Software Documentation (IEC 62304)', { segment: 'medical_devices', category: 'device_samd_ai', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['IEC 62304', 'software lifecycle'], description: 'Software lifecycle documentation: development plan, requirements, architecture, design, testing, maintenance' }),
  entry('US_CYBERSECURITY', 'US', 'United States', 'FDA', 'software_documentation', 'Cybersecurity', 'Cybersecurity Documentation', { segment: 'medical_devices', category: 'device_samd_ai', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['cybersecurity', 'SBOM', 'threat modeling', '524B'], description: 'Threat modeling, SBOM, vulnerability assessment, and cybersecurity management plan for connected devices' }),
];

// ─── SEGMENT 3 · DIAGNOSTICS & IVD ────────────────────────────────────────────

// Category: Classification & Pre-Submission (IVD)
const SEG_IVD_CLASSIFICATION: RegulatoryApplicationType[] = [
  entry('EU_IVDR_CLASSIFICATION', 'EU', 'European Union', 'EMA', 'pre_submission', 'IVDR Classification', 'IVDR Classification Self-Assessment', { stage: 'pre_submission', segment: 'diagnostics_ivd', category: 'ivd_classification_pre_sub', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], lifecycleActions: ['submit'], synonyms: ['IVDR classification', 'IVDR Rules 1-7'], description: 'Classification under EU IVDR 2017/746 Rules 1–7; IVDs classified as Class A, B, C, or D based on risk' }),
  entry('US_IVD_QSUB', 'US', 'United States', 'FDA', 'pre_submission', 'IVD Q-Sub', 'IVD Pre-Submission (Q-Sub)', { stage: 'pre_submission', segment: 'diagnostics_ivd', category: 'ivd_classification_pre_sub', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], lifecycleActions: ['submit'], synonyms: ['IVD Q-Sub', 'IVD pre-submission'], description: 'Pre-submission for IVD-specific questions: intended use, analytical/clinical performance, predicate selection, clinical trial design' }),
  entry('US_CLIA_WAIVER', 'US', 'United States', 'FDA', 'pre_submission', 'CLIA Waiver', 'CLIA Waiver Application', { segment: 'diagnostics_ivd', category: 'ivd_classification_pre_sub', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['CLIA waiver', 'waived test'], description: 'Application for CLIA waiver for simple IVD tests suitable for use outside traditional laboratories' }),
];

// Category: Market Authorization (US FDA, IVD)
const SEG_IVD_MARKET_US: RegulatoryApplicationType[] = [
  entry('US_510K_IVD', 'US', 'United States', 'FDA', 'device_clearance', '510(k) IVD', '510(k) for IVD', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'eSTAR', dossierStandard: 'eSTAR', productClass: ['ivd'], synonyms: ['510(k) IVD'], description: 'Substantial equivalence for Class II IVDs; analytical performance (precision, accuracy, LOD/LOQ) and clinical performance (sensitivity/specificity)' }),
  entry('US_PMA_IVD', 'US', 'United States', 'FDA', 'device_approval', 'PMA IVD', 'PMA for IVD', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'eCopy', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['PMA IVD'], description: 'Premarket approval for high-risk Class III IVDs; requires prospective clinical trials demonstrating clinical validity' }),
  entry('US_DE_NOVO_IVD', 'US', 'United States', 'FDA', 'device_clearance', 'De Novo IVD', 'De Novo for IVD', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'eSTAR', dossierStandard: 'eSTAR', productClass: ['ivd'], synonyms: ['De Novo IVD', 'novel biomarker assay'], description: 'Classification pathway for novel IVDs with no predicate; creates new regulatory classification. Common for novel biomarker assays.' }),
  entry('US_EUA_IVD', 'US', 'United States', 'FDA', 'device_clearance', 'EUA IVD', 'Emergency Use Authorization (EUA) for IVD', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['EUA IVD'], description: 'Rapid authorization during public health emergencies; streamlined data requirements vs. full clearance/approval' }),
  entry('US_LDT', 'US', 'United States', 'FDA', 'marketing_authorization', 'LDT', 'Laboratory Developed Test (LDT) Notification', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['LDT', 'laboratory developed test'], description: 'Under FDA’s 2024 LDT final rule; phased requirements: registration/listing, MDR/labeling, QSR, premarket review' }),
];

// Category: Companion Diagnostics (CDx)
const SEG_IVD_CDX: RegulatoryApplicationType[] = [
  entry('US_CDX_PMA', 'US', 'United States', 'FDA', 'companion_diagnostic', 'CDx PMA', 'CDx PMA', { segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'eCopy', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['CDx PMA', 'companion diagnostic'], description: 'PMA for companion diagnostic reviewed concurrently with the therapeutic product’s NDA/BLA; requires bridging study' }),
  entry('US_CDX_510K', 'US', 'United States', 'FDA', 'companion_diagnostic', 'CDx 510(k)', 'CDx 510(k) (Expanded Use)', { segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'eSTAR', dossierStandard: 'eSTAR', productClass: ['ivd'], synonyms: ['CDx 510(k)', 'expanded use'], description: '510(k) for expanding an existing cleared IVD to a new companion diagnostic claim; analytical bridging and clinical concordance' }),
  entry('US_COMPLEMENTARY_DX', 'US', 'United States', 'FDA', 'companion_diagnostic', 'Complementary Dx', 'Complementary Diagnostic', { segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'eSTAR/eCopy', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['complementary diagnostic'], description: 'Diagnostic that aids therapeutic decisions but is not required for safe/effective use of the drug; lower evidentiary bar than CDx' }),
  entry('US_CDX_CODEV', 'US', 'United States', 'FDA', 'companion_diagnostic', 'CDx Co-Dev', 'CDx Co-Development Agreement', { stage: 'pre_submission', segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['CDx co-development'], description: 'Parallel development of CDx with therapeutic; joint pre-submissions, coordinated review, concurrent labeling alignment' }),
];

// Category: Market Authorization (EU IVDR) — IVDR tech doc tagged on EU_IVDR
const SEG_IVD_MARKET_EU: RegulatoryApplicationType[] = [
  entry('EU_PER', 'EU', 'European Union', 'EMA', 'device_approval', 'PER', 'Performance Evaluation Report (PER)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['PER', 'performance evaluation report', 'IVDR Article 56'], description: 'IVDR Article 56; systematic evaluation of scientific validity, analytical performance, and clinical performance' }),
  entry('EU_PERF_STUDY', 'EU', 'European Union', 'EMA', 'clinical_trial', 'Performance Study', 'Performance Study Application', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['performance study', 'IVDR Article 58'], description: 'IVDR Article 58; application to conduct clinical performance studies for IVDs; ethics committee and competent authority approval' }),
  entry('EU_REF_LAB', 'EU', 'European Union', 'EMA', 'pre_submission', 'EU Ref Lab', 'EU Reference Laboratory Consultation', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['EU reference laboratory', 'IVDR Article 100', 'Class D'], description: 'IVDR Article 100; Class D IVDs require batch verification by EU Reference Laboratories before market placement' }),
  entry('EU_SSCP_IVD', 'EU', 'European Union', 'EMA', 'device_approval', 'SSCP IVD', 'SSCP for IVD', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['SSCP IVD', 'IVDR Article 29'], description: 'Summary of Safety and Performance for Class C/D IVDs per IVDR Article 29; public document on EUDAMED' }),
];

// Category: Post-Market & Lifecycle (IVD)
const SEG_IVD_POST_MARKET: RegulatoryApplicationType[] = [
  entry('EU_PMPF', 'EU', 'European Union', 'EMA', 'post_market', 'PMPF', 'Post-Market Performance Follow-Up (PMPF)', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['PMPF', 'IVDR Annex XIII'], description: 'IVDR Annex XIII Part B; proactive performance data collection after CE marking; IVD equivalent of PMCF' }),
  entry('US_TREND_REPORT', 'US', 'United States', 'FDA', 'post_market', 'Trend Reporting', 'Trend Reporting', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['trend reporting', '21 CFR 803.65'], description: '21 CFR 803.65; report significant increases in events on a semi-annual basis' }),
  entry('US_DEVICE_REG', 'US', 'United States', 'FDA', 'post_market', 'Annual Device Registration', 'Annual Device Registration & Listing', { stage: 'annual_report', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], synonyms: ['device registration', 'establishment registration', '21 CFR 807'], description: 'Annual establishment registration and device listing per 21 CFR 807 for all IVD manufacturers' }),
  entry('EU_IVD_REEVAL', 'EU', 'European Union', 'EMA', 'post_market', 'IVD Re-Evaluation', 'IVD Performance Re-Evaluation', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['IVD re-evaluation', 'state of the art'], description: 'Periodic review of device performance against current state of the art under IVDR GSPR requirements' }),
];

// ─── SEGMENT 4 · CROSS-CUTTING DOCUMENTS ──────────────────────────────────────

// Category: ICH Common Technical Document (CTD/eCTD)
const SEG_CROSS_CTD: RegulatoryApplicationType[] = [
  entry('ICH_CTD_M1', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'Module 1', 'Module 1 — Administrative & Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', synonyms: ['Module 1', 'M1', 'administrative'], description: 'Region-specific administrative documents: cover letters, application forms, patent certifications, labeling, environmental assessment' }),
  entry('ICH_CTD_M2', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'Module 2', 'Module 2 — Summaries & Overviews', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M2', synonyms: ['Module 2', 'M2', 'summaries'], description: 'High-level summaries: 2.2 (Introduction), 2.3 (QOS), 2.4 (Nonclinical Overview), 2.5 (Clinical Overview), 2.6 (Nonclinical Summaries), 2.7 (Clinical Summary)' }),
  entry('ICH_CTD_M3', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'Module 3', 'Module 3 — Quality', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M3', synonyms: ['Module 3', 'M3', 'quality', 'CMC'], description: 'Complete CMC: 3.2.S (Drug Substance), 3.2.P (Drug Product), 3.2.A (Appendices), 3.2.R (Regional), 3.3 (Literature)' }),
  entry('ICH_CTD_M4', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'Module 4', 'Module 4 — Nonclinical Study Reports', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M4', synonyms: ['Module 4', 'M4', 'nonclinical'], description: 'Nonclinical reports: 4.2.1 (Pharmacology), 4.2.2 (Pharmacokinetics), 4.2.3 (Toxicology)' }),
  entry('ICH_CTD_M5', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'Module 5', 'Module 5 — Clinical Study Reports', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M5', synonyms: ['Module 5', 'M5', 'clinical'], description: 'Clinical data: 5.2 (Study Listing), 5.3.1–5.3.6 (PK, PD, Efficacy, Safety, CSRs, Post-marketing), 5.4 (Literature)' }),
];

// Category: Quality Management System (QMS)
const SEG_CROSS_QMS: RegulatoryApplicationType[] = [
  entry('QMS_QUALITY_MANUAL', 'GLOBAL', 'Global', 'ISO', 'quality_system', 'Quality Manual', 'Quality Manual', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['quality manual', 'ISO 13485', '21 CFR 820'], description: 'Top-level QMS document defining quality policy, organizational structure, and quality process interactions' }),
  entry('QMS_DESIGN_CONTROLS', 'US', 'United States', 'FDA', 'quality_system', 'Design Controls / DHF', 'Design Controls / DHF', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['design controls', 'DHF', '21 CFR 820.30', 'ISO 13485 7.3'], description: 'Design control records per 21 CFR 820.30 and ISO 13485 §7.3; design planning through design transfer' }),
  entry('QMS_DMR', 'US', 'United States', 'FDA', 'quality_system', 'DMR', 'Device Master Record (DMR)', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['DMR', 'device master record', '21 CFR 820.181'], description: '21 CFR 820.181; procedures and specifications for a finished device including production processes and QA procedures' }),
  entry('QMS_DHR', 'US', 'United States', 'FDA', 'quality_system', 'DHR', 'Device History Record (DHR)', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['DHR', 'device history record', '21 CFR 820.184'], description: '21 CFR 820.184; production record for each batch/unit demonstrating manufacture per DMR' }),
  entry('QMS_MDSAP', 'GLOBAL', 'Global', 'IMDRF', 'quality_system', 'MDSAP Audit Report', 'MDSAP Audit Report', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['MDSAP', 'single audit'], description: 'Single QMS audit recognized by FDA, Health Canada, TGA, ANVISA, MHLW; conducted against ISO 13485 + country-specific requirements' }),
];

// Category: Safety & Pharmacovigilance (Global)
const SEG_CROSS_SAFETY: RegulatoryApplicationType[] = [
  entry('ICH_ICSR', 'GLOBAL', 'Global', 'ICH', 'safety_report', 'ICSR', 'Individual Case Safety Report (ICSR)', { stage: 'post_approval', segment: 'cross_cutting', category: 'safety_pv', submissionFormat: 'E2B(R3)', dossierStandard: 'none', synonyms: ['ICSR', 'individual case safety report', 'E2B'], description: 'Individual adverse event report; includes patient demographics, drug information, reaction description. Expedited (15-day) or periodic.' }),
  entry('EU_PSMF', 'EU', 'European Union', 'EMA', 'safety_report', 'PSMF', 'Pharmacovigilance System Master File (PSMF)', { stage: 'post_approval', segment: 'cross_cutting', category: 'safety_pv', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['PSMF', 'QPPV', 'GVP Module II'], description: 'EU GVP Module II; describes the pharmacovigilance system; names the Qualified Person for Pharmacovigilance (QPPV)' }),
  entry('ICH_SIGNAL', 'GLOBAL', 'Global', 'ICH', 'safety_report', 'Signal Detection', 'Signal Detection & Evaluation Report', { stage: 'post_approval', segment: 'cross_cutting', category: 'safety_pv', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['signal detection', 'ICH E2E', 'GVP Module IX'], description: 'Systematic analysis of aggregate safety data per ICH E2E and EU GVP Module IX; disproportionality analysis and clinical review' }),
  entry('ICH_BENEFIT_RISK', 'GLOBAL', 'Global', 'ICH', 'safety_report', 'Benefit-Risk Assessment', 'Benefit-Risk Assessment', { segment: 'cross_cutting', category: 'safety_pv', submissionFormat: 'eCTD', ctdModule: '2.5', synonyms: ['benefit-risk', 'PrOACT-URL'], description: 'Structured benefit-risk evaluation in Module 2.5 and PSURs/PBRERs; FDA Framework and EMA PrOACT-URL methodology' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// ABSORBED FROM THE CLIENT REGISTRY MIRROR (BP-W1-2)
//
// The client held a second, hand-maintained catalog (RegistryBridge.tsx) with
// rows this registry lacked; the Filings catalog fixture carried a third. The
// unification makes THIS file the only source, so every row that existed only
// in a mirror is absorbed here. Metadata is carried verbatim from the mirror
// row it came from, with two deliberate exceptions, both flagged for SME
// review (BP-W1-4):
//   • Issuing-authority corrections in the BP-W1-3 class: EU device/IVD
//     conformity rows named EMA, which has no role in device conformity — they
//     now name the Notified Body or national competent authority.
//   • Regional Module 1 rows are split per agency (BP-W1-5): Module 1 is
//     regional by definition, so a single "non-US Module 1" row is not one
//     thing. Each row names its regional specification where established.
// ═══════════════════════════════════════════════════════════════════════════════

const ABS_PHARMA: RegulatoryApplicationType[] = [
  // FDA formal meetings (pre_submission)
  entry('US_TYPE_A_MEETING', 'US', 'United States', 'FDA', 'pre_submission', 'Type A Meeting', 'Type A Meeting', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['Type A'], description: 'Immediately-needed meetings (safety, stalled programs).' }),
  entry('US_TYPE_B_MEETING', 'US', 'United States', 'FDA', 'pre_submission', 'Type B Meeting', 'Type B Meeting', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['Type B'], description: 'Pre-IND, pre-NDA/BLA, end-of-phase meetings.' }),
  entry('US_TYPE_C_MEETING', 'US', 'United States', 'FDA', 'pre_submission', 'Type C Meeting', 'Type C Meeting', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['Type C'], description: 'Other meetings not qualifying as Type A or B.' }),
  entry('CA_PRESUB_MEETING', 'CA', 'Canada', 'Health_Canada', 'pre_submission', 'Pre-submission Meeting', 'Pre-submission Meeting (Health Canada)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'eCTD', lifecycleActions: ['submit'], description: 'Health Canada pre-submission scientific advice.' }),
  entry('JP_PRE_CONSULT', 'JP', 'Japan', 'PMDA', 'pre_submission', 'Pre-application Consultation', 'Pre-application Consultation (PMDA)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'CTD', dossierStandard: 'CTD', lifecycleActions: ['submit'], description: 'PMDA regulatory consultation before J-NDA filing.' }),
  entry('AU_PRESUB_MEETING', 'AU', 'Australia', 'TGA', 'pre_submission', 'Pre-submission Meeting', 'Pre-submission Meeting (TGA)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'Letter', dossierStandard: 'none', lifecycleActions: ['submit'], description: 'TGA pre-submission meeting request.' }),
  // Designations (pre_submission)
  entry('JP_SAKIGAKE', 'JP', 'Japan', 'PMDA', 'designation', 'Sakigake', 'Sakigake Designation', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'CTD', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['Sakigake', '先駆け'], description: 'PMDA expedited review for innovative therapies.' }),
  entry('US_PRIORITY_REVIEW', 'US', 'United States', 'FDA', 'designation', 'Priority Review', 'Priority Review', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'none', dossierStandard: 'none', lifecycleActions: ['submit'], description: '6-month review target for significant advances.' }),
  entry('EU_ACCEL_ASSESS', 'EU', 'European Union', 'EMA', 'designation', 'Accelerated Assessment', 'Accelerated Assessment', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'none', dossierStandard: 'none', lifecycleActions: ['submit'], description: '150-day assessment for major public-health interest.' }),
  entry('UK_ILAP', 'UK', 'United Kingdom', 'MHRA', 'designation', 'ILAP', 'Innovation Passport (ILAP)', { stage: 'pre_submission', segment: 'pharma_biotech', category: 'preclinical_pre_ind', submissionFormat: 'none', dossierStandard: 'none', lifecycleActions: ['submit'], synonyms: ['ILAP', 'Innovation Passport'], description: 'MHRA Innovative Licensing and Access Pathway.' }),
  // Marketing authorization
  entry('EU_BIOSIMILAR_MAA', 'EU', 'European Union', 'EMA', 'marketing_authorization', 'Biosimilar MAA', 'Biosimilar MAA', { productClass: ['biosimilar'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'EU centralized biosimilar application.' }),
  entry('JP_BIOSIMILAR', 'JP', 'Japan', 'PMDA', 'marketing_authorization', 'Biosimilar', 'Biosimilar (Japan)', { productClass: ['biosimilar'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'PMDA biosimilar application.' }),
  entry('AU_BIOSIMILAR', 'AU', 'Australia', 'TGA', 'marketing_authorization', 'Biosimilar', 'Biosimilar (TGA)', { productClass: ['biosimilar'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'TGA biosimilar medicine registration.' }),
  entry('EU_GENERIC_DCP', 'EU', 'European Union', 'National_Competent_Authority', 'marketing_authorization', 'Generic Decentralized', 'Generic Decentralized (DCP)', { productClass: ['generic'], segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: 'M1–M5 (BE in 5.3.1)', moduleAuthority: 'ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: same defect class as US_ANDA — an abbreviated pathway scoped M1–M3 has no module for the bioequivalence evidence it exists to present.', description: 'EU decentralised generic application; bioequivalence study reports are filed in Module 5.3.1. Assessed by the Reference Member State and concerned member states, not centrally by EMA.' }),
  // Dossier summary documents (Module 2 family)
  entry('ICH_CLIN_OVERVIEW', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Clinical Overview', 'Clinical Overview (M2.5)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: '2.5', synonyms: ['M2.5', 'clinical overview'], description: 'Integrated clinical overview across studies.' }),
  entry('ICH_CLIN_SUMMARY', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Clinical Summary', 'Clinical Summary (M2.7)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: '2.7', synonyms: ['M2.7', 'clinical summary'], description: 'Integrated summary of clinical data.' }),
  entry('ICH_NONCLIN_OVERVIEW', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Nonclinical Overview', 'Nonclinical Overview (M2.4)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: '2.4', synonyms: ['M2.4', 'nonclinical overview'], description: 'Integrated nonclinical overview.' }),
  entry('ICH_NONCLIN_SUMMARY', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Nonclinical Summary', 'Nonclinical Summary (M2.6)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: '2.6', synonyms: ['M2.6', 'nonclinical written and tabulated summaries'], description: 'Nonclinical written and tabulated summaries.' }),
  entry('ICH_TABULATED_SUMMARIES', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Tabulated Summaries', 'Tabulated Summaries (M2.7.4)', { segment: 'pharma_biotech', category: 'marketing_authorization', submissionFormat: 'eCTD', ctdModule: '2.7.4', description: 'Individual patient data listings.' }),
  // Post-approval lifecycle
  entry('EU_LINE_EXTENSION', 'EU', 'European Union', 'EMA', 'variation', 'Line Extension', 'Line Extension', { stage: 'amendment', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'New strength, route, or pharmaceutical form.' }),
  entry('EU_EUDRAVIGILANCE_ICSR', 'EU', 'European Union', 'EMA', 'safety_report', 'EudraVigilance Report', 'EudraVigilance Report', { stage: 'post_approval', segment: 'pharma_biotech', category: 'post_approval_lifecycle', submissionFormat: 'E2B(R3)', dossierStandard: 'none', description: 'Electronic individual case safety report transmitted to EudraVigilance.' }),
  entry('ICH_SUSAR', 'GLOBAL', 'Global', 'ICH', 'safety_report', 'SUSAR Report', 'SUSAR Report', { stage: 'post_approval', segment: 'pharma_biotech', category: 'investigational', submissionFormat: 'E2B(R3)', dossierStandard: 'none', synonyms: ['SUSAR'], moduleAuthority: '21 CFR 312.32; Regulation (EU) 536/2014 Art. 42; ICH E2A. BP-W1-3: was carried as an eCTD Module 5 document — it is not eCTD content at all, but an E2B(R3) ICSR transmitted to FAERS / EudraVigilance on the 7-day (fatal/life-threatening) or 15-day clock.', description: 'Suspected Unexpected Serious Adverse Reaction — an E2B transmission to FAERS / EudraVigilance on the 7-day (fatal or life-threatening) or 15-day clock. Not an eCTD Module 5 document.' }),
  // CMC / quality
  entry('EU_CEP', 'EU', 'European Union', 'EDQM', 'quality_cmc', 'CEP', 'Certificate of Suitability (CEP)', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['CEP', 'certificate of suitability'], description: 'EDQM monograph conformity for well-known substances. Issued by the European Directorate for the Quality of Medicines & HealthCare, not EMA.' }),
  entry('EU_GMP_CERT', 'EU', 'European Union', 'National_Competent_Authority', 'quality_cmc', 'GMP Certificate', 'GMP Certificate', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'none', dossierStandard: 'none', description: 'Issued by the national competent authority that performed the inspection and published in the EudraGMDP database. Not issued by EMA.' }),
  entry('ICH_STABILITY_PROTOCOL', 'GLOBAL', 'Global', 'ICH', 'quality_cmc', 'Stability Protocol', 'Stability Protocol', { segment: 'pharma_biotech', category: 'cmc_quality', submissionFormat: 'eCTD', ctdModule: '3.2.P.8', synonyms: ['ICH Q1A', 'stability study design'], description: 'ICH Q1A/Q1E stability study design.' }),
];

const ABS_DEVICES: RegulatoryApplicationType[] = [
  entry('EU_NB_CONSULT', 'EU', 'European Union', 'Notified_Body', 'pre_submission', 'NB Consultation', 'Notified Body Consultation', { stage: 'pre_submission', segment: 'medical_devices', category: 'device_classification_pre_sub', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], lifecycleActions: ['submit'], description: 'EU Notified Body pre-submission consultation.' }),
  // EU MDR conformity, split by class. The mirror named EMA as agency on these
  // rows; EMA has no role in device conformity — Class I is manufacturer
  // self-declaration and Class IIa–III run through the Notified Body.
  entry('EU_MDR_CLASS_I', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU MDR Class I', 'EU MDR Class I Self-declaration', { parentApplicationType: 'EU_MDR_TECHDOC', segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], description: 'Manufacturer self-declares conformity.' }),
  entry('EU_MDR_CLASS_IIA', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU MDR Class IIa', 'EU MDR Class IIa', { parentApplicationType: 'EU_MDR_TECHDOC', segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], description: 'Notified Body assessment required.' }),
  entry('EU_MDR_CLASS_IIB', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU MDR Class IIb', 'EU MDR Class IIb', { parentApplicationType: 'EU_MDR_TECHDOC', segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], description: 'Higher-risk device assessment.' }),
  entry('EU_MDR_CLASS_III', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU MDR Class III', 'EU MDR Class III', { parentApplicationType: 'EU_MDR_TECHDOC', segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], description: 'Highest-risk implantable/life-sustaining devices.' }),
  entry('JP_NINTEI', 'JP', 'Japan', 'PMDA', 'device_approval', 'Nintei', 'Nintei Certification', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'CTD', dossierStandard: 'CTD', productClass: ['medical_device'], synonyms: ['Nintei', '認証'], description: 'PMDA certified medical device.' }),
  entry('CN_DEVICE_REG', 'CN', 'China', 'NMPA', 'device_approval', 'Device Registration', 'Device Registration (NMPA)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'CTD', dossierStandard: 'CTD', productClass: ['medical_device'], description: 'NMPA medical device registration for China.' }),
  entry('AU_DEVICE_INCLUSION', 'AU', 'Australia', 'TGA', 'device_approval', 'Device Inclusion', 'Device Inclusion (ARTG)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'ARTG', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['ARTG'], description: 'TGA inclusion in the ARTG.' }),
  entry('CH_DEVICE_CONFORMITY', 'CH', 'Switzerland', 'Swissmedic', 'device_approval', 'Device Conformity', 'Device Conformity (Swissmedic)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], description: 'Swissmedic conformity assessment.' }),
  entry('BR_DEVICE_REG', 'BR', 'Brazil', 'ANVISA', 'device_approval', 'Device Registration', 'Device Registration (ANVISA)', { segment: 'medical_devices', category: 'device_market_auth_eu_intl', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], description: 'ANVISA device registration for Brazil.' }),
  // Device clinical investigations
  entry('EU_CLIN_INVESTIGATION', 'EU', 'European Union', 'National_Competent_Authority', 'clinical_trial', 'Clinical Investigation', 'Clinical Investigation (EU MDR)', { segment: 'medical_devices', category: 'device_clinical', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], description: 'EU MDR clinical investigation application.' }),
  entry('ISO_CIP', 'GLOBAL', 'Global', 'ISO', 'clinical_document', 'Clinical Investigation Plan', 'Clinical Investigation Plan (ISO 14155)', { segment: 'medical_devices', category: 'device_clinical', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['CIP', 'ISO 14155'], description: 'ISO 14155 clinical investigation plan.' }),
  // Post-market
  entry('EU_SIG_CHANGE', 'EU', 'European Union', 'Notified_Body', 'post_market', 'Significant Change', 'Significant Change Notification', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['medical_device'], synonyms: ['MDR Article 120'], description: 'MDR Art 120 significant change to the Notified Body.' }),
  entry('EU_MIR', 'EU', 'European Union', 'National_Competent_Authority', 'post_market', 'MIR', 'Manufacturer Incident Report (MIR)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['MIR', 'MDR Article 87'], description: 'MDR serious-incident vigilance report to the competent authority via EUDAMED.' }),
  entry('EU_TREND_REPORT_DEVICE', 'EU', 'European Union', 'National_Competent_Authority', 'post_market', 'Trend Report', 'Trend Report (EU MDR)', { stage: 'post_approval', segment: 'medical_devices', category: 'device_post_market', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device'], synonyms: ['MDR Article 88'], description: 'MDR reporting of a statistically significant rise in non-serious incidents.' }),
];

const ABS_IVD: RegulatoryApplicationType[] = [
  // EU IVDR conformity, split by class (mirror rows named EMA; corrected as for MDR).
  entry('EU_IVDR_CLASS_A', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU IVDR Class A', 'EU IVDR Class A', { parentApplicationType: 'EU_IVDR', segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'Self-declared conformity for low-risk IVDs.' }),
  entry('EU_IVDR_CLASS_B', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU IVDR Class B', 'EU IVDR Class B', { parentApplicationType: 'EU_IVDR', segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'Notified Body assessment for Class B IVDs.' }),
  entry('EU_IVDR_CLASS_CD', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'EU IVDR Class C/D', 'EU IVDR Class C/D', { parentApplicationType: 'EU_IVDR', segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'High-risk IVD assessment (incl. self-testing, blood screening).' }),
  entry('EU_CDX_IVDR_D', 'EU', 'European Union', 'Notified_Body', 'companion_diagnostic', 'CDx IVDR Class D', 'CDx EU IVDR Class D', { segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'EU companion diagnostic under IVDR.' }),
  entry('JP_CDX', 'JP', 'Japan', 'PMDA', 'companion_diagnostic', 'CDx Approval', 'CDx Approval (PMDA)', { segment: 'diagnostics_ivd', category: 'ivd_companion_dx', submissionFormat: 'CTD', dossierStandard: 'CTD', productClass: ['ivd'], description: 'PMDA companion diagnostic device approval.' }),
  entry('EU_IVD_CLIN_EVIDENCE', 'EU', 'European Union', 'Notified_Body', 'device_approval', 'Clinical Evidence Summary', 'Clinical Evidence Summary (IVDR)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_eu', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'EU IVDR clinical evidence compilation.' }),
  entry('US_IVD_ANALYTICAL_VALIDATION', 'US', 'United States', 'FDA', 'device_clearance', 'Analytical Validation', 'Analytical Validation Report', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_us', submissionFormat: 'eSTAR', dossierStandard: 'eSTAR', productClass: ['ivd'], description: 'Analytical and clinical validation study report.' }),
  // International IVD registrations
  entry('JP_IVD_APPROVAL', 'JP', 'Japan', 'PMDA', 'device_approval', 'IVD Approval', 'IVD Approval (PMDA)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_intl', submissionFormat: 'CTD', dossierStandard: 'CTD', productClass: ['ivd'], description: 'PMDA IVD medical device approval.' }),
  entry('CN_IVD_REG', 'CN', 'China', 'NMPA', 'device_approval', 'IVD Registration', 'IVD Registration (NMPA)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_intl', submissionFormat: 'CTD', dossierStandard: 'CTD', productClass: ['ivd'], description: 'NMPA IVD registration for China.' }),
  entry('AU_IVD_INCLUSION', 'AU', 'Australia', 'TGA', 'device_approval', 'IVD Inclusion', 'IVD Inclusion (ARTG)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_intl', submissionFormat: 'ARTG', dossierStandard: 'none', productClass: ['ivd'], description: 'TGA IVD inclusion in the ARTG.' }),
  entry('CA_IVD_LICENCE', 'CA', 'Canada', 'Health_Canada', 'device_approval', 'IVD Licence', 'IVD Licence (Health Canada)', { segment: 'diagnostics_ivd', category: 'ivd_market_auth_intl', submissionFormat: 'none', dossierStandard: 'none', productClass: ['ivd'], description: 'Health Canada IVD device licence.' }),
  // Post-market
  entry('EU_IVD_PMS_PLAN', 'EU', 'European Union', 'Notified_Body', 'post_market', 'PMS Plan', 'Post-Market Surveillance Plan (IVDR)', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'EU IVDR post-market surveillance plan.' }),
  entry('EU_IVD_VIGILANCE', 'EU', 'European Union', 'National_Competent_Authority', 'post_market', 'Vigilance Report', 'Vigilance Report (IVDR)', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'NeeS', dossierStandard: 'regional', productClass: ['ivd'], description: 'EU IVDR vigilance incident report.' }),
  entry('EU_PSUR_IVD', 'EU', 'European Union', 'Notified_Body', 'post_market', 'PSUR — IVD', 'PSUR — IVD (IVDR Art. 81)', { stage: 'post_approval', segment: 'diagnostics_ivd', category: 'ivd_post_market', submissionFormat: 'none', dossierStandard: 'regional', productClass: ['ivd'], synonyms: ['IVDR Article 81'], description: 'IVDR Periodic Safety Update Report for the device benefit-risk profile.' }),
];

const ABS_CROSS: RegulatoryApplicationType[] = [
  entry('ICH_ECTD_BACKBONE', 'GLOBAL', 'Global', 'ICH', 'dossier_module', 'eCTD Backbone', 'eCTD Backbone Structure', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1–M5', description: 'ICH eCTD v3.2.2/v4.0 backbone and envelope.' }),
  // Regional Module 1 — one row per modeled agency (BP-W1-5). Module 1 is
  // regional by definition; "non-US Module 1" as a single entity is not one
  // thing. Authorities: named per row where a published specification exists.
  entry('US_CTD_M1_REGIONAL', 'US', 'United States', 'FDA', 'dossier_module', 'CTD Module 1 — US', 'CTD Module 1 — US Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'FDA eCTD Module 1 Specification v2.3.', description: 'US-specific administrative and prescribing information.' }),
  entry('EU_CTD_M1_REGIONAL', 'EU', 'European Union', 'EMA', 'dossier_module', 'CTD Module 1 — EU', 'CTD Module 1 — EU Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'EU Module 1 Specification v3.0.', description: 'EU-specific application forms and product information.' }),
  entry('JP_CTD_M1_REGIONAL', 'JP', 'Japan', 'PMDA', 'dossier_module', 'CTD Module 1 — JP', 'CTD Module 1 — JP Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'PMDA J-eCTD specification (JP Module 1).', description: 'J-CTD Module 1; PMDA-specific forms.' }),
  entry('CA_CTD_M1_REGIONAL', 'CA', 'Canada', 'Health_Canada', 'dossier_module', 'CTD Module 1 — CA', 'CTD Module 1 — CA Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'Health Canada eCTD Module 1 (CA regional) specification.', description: 'Health Canada administrative forms (HC-SC 3011), product monograph, and fee forms.' }),
  entry('UK_CTD_M1_REGIONAL', 'UK', 'United Kingdom', 'MHRA', 'dossier_module', 'CTD Module 1 — UK', 'CTD Module 1 — UK Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'MHRA UK eCTD Module 1 guidance (post-Brexit national).', description: 'UK-specific application forms and product information.' }),
  entry('AU_CTD_M1_REGIONAL', 'AU', 'Australia', 'TGA', 'dossier_module', 'CTD Module 1 — AU', 'CTD Module 1 — AU Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'TGA AU eCTD Module 1 and regional specification.', description: 'TGA administrative information and Australian product information.' }),
  entry('CH_CTD_M1_REGIONAL', 'CH', 'Switzerland', 'Swissmedic', 'dossier_module', 'CTD Module 1 — CH', 'CTD Module 1 — CH Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'eCTD', ctdModule: 'M1', moduleAuthority: 'Swissmedic CH eCTD Module 1 specification.', description: 'Swissmedic application forms and Swiss product information.' }),
  entry('CN_CTD_M1_REGIONAL', 'CN', 'China', 'NMPA', 'dossier_module', 'CTD Module 1 — CN', 'CTD Module 1 — CN Regional', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'CTD', dossierStandard: 'CTD', ctdModule: 'M1', moduleAuthority: 'NMPA CTD regional Module 1 requirements.', description: 'NMPA administrative documents and China-specific forms.' }),
  entry('EU_NEES', 'EU', 'European Union', 'EMA', 'dossier_module', 'NeeS', 'NeeS Submission', { segment: 'cross_cutting', category: 'ctd_ectd', submissionFormat: 'NeeS', dossierStandard: 'NeeS', description: 'Non-eCTD electronic submission for variations.' }),
  // QMS / compliance packages
  entry('QMS_GMP_INSPECTION', 'GLOBAL', 'Global', 'ICH', 'quality_system', 'GMP Inspection Readiness', 'GMP Inspection Readiness', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', description: 'Pre-inspection GMP compliance package.' }),
  entry('QMS_GCP_COMPLIANCE', 'GLOBAL', 'Global', 'ICH', 'quality_system', 'GCP Compliance Package', 'GCP Compliance Package', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['ICH E6(R2)'], description: 'ICH E6(R2) GCP compliance documentation.' }),
  entry('QMS_GLP_COMPLIANCE', 'GLOBAL', 'Global', 'ICH', 'quality_system', 'GLP Compliance Package', 'GLP Compliance Package', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', synonyms: ['OECD GLP'], description: 'OECD GLP compliance documentation.' }),
  entry('QMS_QSR_820', 'US', 'United States', 'FDA', 'quality_system', 'QSR (21 CFR 820)', 'QSR (21 CFR 820)', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], synonyms: ['QSR', '21 CFR 820', 'QMSR'], description: 'Quality System Regulation for medical devices.' }),
  entry('QMS_ISO_13485', 'GLOBAL', 'Global', 'ISO', 'quality_system', 'ISO 13485 QMS', 'ISO 13485 QMS', { segment: 'cross_cutting', category: 'qms', submissionFormat: 'none', dossierStandard: 'none', productClass: ['medical_device', 'ivd'], description: 'QMS for medical devices — international standard.' }),
  // Regulatory intelligence work products
  entry('RI_STRATEGY', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Regulatory Strategy', 'Regulatory Strategy Document', { segment: 'cross_cutting', category: 'regulatory_intelligence', submissionFormat: 'none', dossierStandard: 'none', description: 'Cross-market regulatory strategy and pathway analysis.' }),
  entry('RI_GAP_ANALYSIS', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Gap Analysis', 'Gap Analysis Report', { segment: 'cross_cutting', category: 'regulatory_intelligence', submissionFormat: 'none', dossierStandard: 'none', description: 'Dossier gap analysis against target filing.' }),
  entry('RI_COMPETITIVE', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'Competitive Landscape', 'Competitive Landscape Analysis', { segment: 'cross_cutting', category: 'regulatory_intelligence', submissionFormat: 'none', dossierStandard: 'none', description: 'Competitive intelligence and precedent analysis.' }),
  entry('RI_HA_MEETING', 'GLOBAL', 'Global', 'ICH', 'clinical_document', 'HA Meeting Minutes', 'Health Authority Meeting Minutes', { segment: 'cross_cutting', category: 'regulatory_intelligence', submissionFormat: 'none', dossierStandard: 'none', description: 'Formal meeting minutes and commitments.' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const GLOBAL_REGISTRY: RegulatoryApplicationType[] = [
  // Axis 1 — region/agency blocks
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
  // Axis 2 — segment/category buildout (taxonomy reference)
  ...SEG_PHARMA_PRECLINICAL,
  ...SEG_PHARMA_INVESTIGATIONAL,
  ...SEG_PHARMA_MARKETING,
  ...SEG_PHARMA_POST_APPROVAL,
  ...SEG_PHARMA_CMC,
  ...SEG_DEVICE_CLASSIFICATION,
  ...SEG_DEVICE_MARKET_US,
  ...SEG_DEVICE_MARKET_EU,
  ...SEG_DEVICE_POST_MARKET,
  ...SEG_DEVICE_SAMD,
  ...SEG_IVD_CLASSIFICATION,
  ...SEG_IVD_MARKET_US,
  ...SEG_IVD_CDX,
  ...SEG_IVD_MARKET_EU,
  ...SEG_IVD_POST_MARKET,
  ...SEG_CROSS_CTD,
  ...SEG_CROSS_QMS,
  ...SEG_CROSS_SAFETY,
  // Absorbed from the retired client registry mirror (BP-W1-2)
  ...ABS_PHARMA,
  ...ABS_DEVICES,
  ...ABS_IVD,
  ...ABS_CROSS,
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

/** Get all entries for a taxonomy segment (axis 2) */
export function getBySegment(segment: Segment): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.segment === segment && e.active);
}

/** Get all entries for a taxonomy filing category (axis 2) */
export function getByCategory(category: FilingCategory): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(e => e.category === category && e.active);
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
