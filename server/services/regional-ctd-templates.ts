/**
 * @fileoverview Regional CTD Templates Service
 * @module server/services/regional-ctd-templates
 *
 * Manages region-specific templates for CTD Module 1 across
 * FDA, EMA, PMDA, and NMPA. Each agency has unique requirements
 * for Module 1 while Modules 2-5 follow ICH common format.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RegionalTemplate {
  agency: string;
  region: string;
  module1Sections: CTDSection[];
  forms: FormTemplate[];
  prescribingInfoTemplate: string;
  coverLetterTemplate: string;
  specificRequirements: string[];
  language: string;
  currency: string;
}

export interface CTDSection {
  number: string;
  title: string;
  titleLocal?: string; // In local language (JP/CN)
  required: boolean;
  description: string;
  template?: string;
  childSections?: CTDSection[];
}

export interface FormTemplate {
  name: string;
  formId?: string;
  required: boolean;
  description: string;
  url?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDA (United States)
// ═══════════════════════════════════════════════════════════════════════════════

export const FDA_TEMPLATE: RegionalTemplate = {
  agency: 'FDA',
  region: 'US',
  language: 'en',
  currency: 'USD',
  forms: [
    { name: 'FDA Form 356h', formId: '356h', required: true, description: 'Application to Market a New Drug, Biologic, or an Antibiotic Drug for Human Use' },
    { name: 'FDA Form 1571', formId: '1571', required: true, description: 'Investigational New Drug Application (IND)' },
    { name: 'FDA Form 3674', formId: '3674', required: true, description: 'Certification of Compliance with ClinicalTrials.gov Data Bank Requirements' },
    { name: 'FDA Form 3397', formId: '3397', required: false, description: 'Patent Information (Orange Book)' },
  ],
  prescribingInfoTemplate: 'us-prescribing-information',
  coverLetterTemplate: 'fda-cover-letter',
  specificRequirements: [
    '21 CFR Part 314 (NDA) or 21 CFR Part 601 (BLA)',
    'Electronic submission via FDA ESG',
    'eCTD format required for all submissions',
    'User fee (PDUFA) payment required',
    'English language required',
  ],
  module1Sections: [
    { number: '1.1', title: 'Comprehensive Table of Contents', required: true, description: 'Auto-generated listing of all documents in the submission' },
    { number: '1.2', title: 'Cover Letter', required: true, description: 'Submission cover letter addressed to the appropriate FDA review division' },
    {
      number: '1.3', title: 'Administrative Information', required: true, description: 'Forms, contact information, certifications',
      childSections: [
        { number: '1.3.1', title: 'Contact/Sponsor Information', required: true, description: 'Sponsor name, address, contact details' },
        { number: '1.3.2', title: 'Field Copy Certification', required: false, description: 'Certification for field copy submissions' },
        { number: '1.3.3', title: 'Debarment Certification', required: true, description: 'Certification under 21 USC 335a' },
        { number: '1.3.4', title: 'Financial Certification/Disclosure', required: true, description: 'Financial information for clinical investigators (21 CFR 54)' },
        { number: '1.3.5', title: 'Patent and Exclusivity', required: false, description: 'Patent information and exclusivity claims' },
      ],
    },
    {
      number: '1.4', title: 'References', required: false, description: 'Letters of authorization, right of reference',
      childSections: [
        { number: '1.4.1', title: 'Letters of Authorization', required: false, description: 'Right of reference letters' },
        { number: '1.4.2', title: 'Statement of Right of Reference', required: false, description: 'Statement allowing FDA to access referenced data' },
      ],
    },
    { number: '1.5', title: 'Application Status', required: false, description: 'Withdrawal or inactivation notifications' },
    {
      number: '1.14', title: 'Labeling', required: true, description: 'US Prescribing Information (USPI)',
      childSections: [
        { number: '1.14.1', title: 'Draft Labeling', required: true, description: 'Proposed US Prescribing Information' },
        { number: '1.14.2', title: 'Patient Package Insert', required: false, description: 'Patient-facing labeling' },
        { number: '1.14.3', title: 'Medication Guide', required: false, description: 'REMS medication guide if applicable' },
      ],
    },
    { number: '1.15', title: 'Clinical Trial Information', required: true, description: 'ClinicalTrials.gov compliance certification (Form 3674)' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// EMA (European Union)
// ═══════════════════════════════════════════════════════════════════════════════

export const EMA_TEMPLATE: RegionalTemplate = {
  agency: 'EMA',
  region: 'EU',
  language: 'en',
  currency: 'EUR',
  forms: [
    { name: 'Application Form', required: true, description: 'EMA centralised procedure application form' },
    { name: 'EU Orphan Drug Application', required: false, description: 'Required if seeking orphan drug designation' },
  ],
  prescribingInfoTemplate: 'ema-smpc',
  coverLetterTemplate: 'ema-cover-letter',
  specificRequirements: [
    'EU Marketing Authorisation Application (MAA)',
    'Centralised, Decentralised, or Mutual Recognition procedure',
    'eCTD format mandatory since 2010',
    'EMA fee payment required',
    'English preferred for centralised procedure',
    'Pharmacovigilance System Master File required',
  ],
  module1Sections: [
    { number: '1.0', title: 'Regional Cover Letter', required: true, description: 'EU-specific cover letter' },
    { number: '1.2', title: 'Application Form', required: true, description: 'Completed EMA application form' },
    {
      number: '1.3', title: 'Product Information', required: true, description: 'SmPC, PIL, Labelling',
      childSections: [
        { number: '1.3.1', title: 'Summary of Product Characteristics (SmPC)', titleLocal: 'SmPC', required: true, description: 'Harmonised SmPC for all EU member states' },
        { number: '1.3.2', title: 'Mock-up/Specimen of Outer/Inner Packaging', required: true, description: 'Artwork for packaging' },
        { number: '1.3.3', title: 'Package Leaflet (PIL)', required: true, description: 'Patient Information Leaflet' },
        { number: '1.3.4', title: 'Labelling', required: true, description: 'Labelling text' },
      ],
    },
    { number: '1.4', title: 'Information about the Experts', required: true, description: 'Qualifications of module 2-5 experts' },
    {
      number: '1.5', title: 'Specific Requirements for Different Types of Applications', required: false, description: 'Additional requirements by procedure type',
      childSections: [
        { number: '1.5.1', title: 'Bibliographic Applications', required: false, description: 'For well-established use applications' },
        { number: '1.5.2', title: 'Generic/Hybrid/Biosimilar', required: false, description: 'For generic, hybrid, or biosimilar applications' },
      ],
    },
    { number: '1.6', title: 'Environmental Risk Assessment', required: true, description: 'ERA as per CHMP/SWP/4447/00' },
    { number: '1.7', title: 'Pharmacovigilance System', required: true, description: 'PSMF summary, QPPV information, RMP summary' },
    {
      number: '1.8', title: 'Risk Management Plan', required: true, description: 'Full RMP per GVP Module V',
      childSections: [
        { number: '1.8.1', title: 'Risk Management Plan', required: true, description: 'Complete EU-RMP' },
        { number: '1.8.2', title: 'RMP Summary', required: true, description: 'Summary of the RMP for public assessment' },
      ],
    },
    { number: '1.9', title: 'Information Relating to Orphan Market Exclusivity', required: false, description: 'Orphan designation details' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PMDA (Japan)
// ═══════════════════════════════════════════════════════════════════════════════

export const PMDA_TEMPLATE: RegionalTemplate = {
  agency: 'PMDA',
  region: 'JP',
  language: 'ja',
  currency: 'JPY',
  forms: [
    { name: 'CTD Application Form (Japanese)', formId: 'jp-ctd-form', required: true, description: 'PMDA application form in Japanese' },
  ],
  prescribingInfoTemplate: 'pmda-package-insert',
  coverLetterTemplate: 'pmda-cover-letter',
  specificRequirements: [
    'PMDA pre-submission consultation recommended',
    'Japanese language required for Module 1',
    'J-NDA or J-BLA submission format',
    'eCTD is the required submission format (eCTD v4.0 mandatory for new applications from 1 April 2026)',
    'PMDA review fee required',
    'Bridging study data may be required',
    'Reexamination period (再審査期間): 8 years for a new active ingredient, 10 for orphan drugs, 6 for a new combination or route of administration, 4 for new efficacy/indication or dosage',
    'Electronic study data (申請電子データ, CDISC-compliant) required for new drug applications',
    'Risk Management Plan (J-RMP) and Early Post-marketing Phase Vigilance (市販直後調査 / EPPV) required',
    'Overseas sponsors without a Japanese MAH use the Foreign Special Approval system (外国特例承認) with a Designated MAH (選任製造販売業者 / D-MAH)',
    'NHI price listing (薬価収載) via Chuikyo (中医協) follows approval and gates reimbursement',
  ],
  // Module 1 structure per the Japanese CTD framework (MHLW/PMDA CTD構成 notification
  // and the JPMA eCTD 作成の手引き). Section numbers verified against authoritative JP
  // guidance: 承認申請書 = 1.2, 同種同効品一覧表 = 1.7, 添付文書 = 1.8,
  // 製造販売後調査基本計画書 = 1.11 (the J-RMP draft is submitted here), その他 = 1.13.
  module1Sections: [
    { number: '1.1', title: 'Table of Contents', titleLocal: '第1部（モジュール1）目次', required: true, description: 'Module 1 table of contents' },
    { number: '1.2', title: 'Application Form', titleLocal: '承認申請書(写)', required: true, description: 'Copy of the marketing-approval application form (承認申請書)' },
    { number: '1.3', title: 'Certificates', titleLocal: '証明書類', required: false, description: 'Certificates required for the application (e.g. GMP compliance, foreign approval)' },
    { number: '1.4', title: 'Patent Status', titleLocal: '特許状況', required: false, description: 'Patent information relevant to the application' },
    { number: '1.5', title: 'Origin / History of Discovery and Development', titleLocal: '起原又は発見の経緯及び開発の経緯', required: true, description: 'Background on the origin/discovery and the development history' },
    { number: '1.6', title: 'Status of Use in Foreign Countries', titleLocal: '外国における使用状況等に関する資料', required: false, description: 'Approval and use status in other countries' },
    { number: '1.7', title: 'List of Drugs with Similar Indications/Efficacy', titleLocal: '同種同効品一覧表', required: true, description: 'Comparison table of products with similar indications/efficacy in Japan' },
    { number: '1.8', title: 'Package Insert (Draft)', titleLocal: '添付文書(案)', required: true, description: 'Draft Japanese Package Insert (添付文書 / JPI)' },
    { number: '1.9', title: 'Documents on the Nonproprietary Name', titleLocal: '一般的名称に係る文書', required: false, description: 'Documents related to the Japanese Accepted Name (JAN), if applicable' },
    { number: '1.10', title: 'Poisonous/Powerful Drug Designation Materials', titleLocal: '毒薬・劇薬等の指定審査資料のまとめ', required: false, description: 'Summary supporting poisonous/powerful-drug or related designations' },
    { number: '1.11', title: 'Post-Marketing Surveillance Plan / Risk Management Plan', titleLocal: '製造販売後調査基本計画書(案)／医薬品リスク管理計画書(案)', required: false, description: 'Post-marketing surveillance basic plan; the J-RMP (医薬品リスク管理計画(案)) is submitted here for new drug applications' },
    { number: '1.12', title: 'List of Attached Materials', titleLocal: '添付資料一覧', required: true, description: 'Index/list of all attached data and materials' },
    { number: '1.13', title: 'Others', titleLocal: 'その他', required: false, description: 'Japan-specific items (e.g. 1.13.x: references to previously approved products, electronic study-data notices, and accelerated-review / SAKIGAKE / 先駆的医薬品 designation information)' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// NMPA (China)
// ═══════════════════════════════════════════════════════════════════════════════

export const NMPA_TEMPLATE: RegionalTemplate = {
  agency: 'NMPA',
  region: 'CN',
  language: 'zh',
  currency: 'CNY',
  forms: [
    { name: 'CDE Application Form', formId: 'cde-form', required: true, description: 'Center for Drug Evaluation application form (Chinese)' },
  ],
  prescribingInfoTemplate: 'nmpa-label',
  coverLetterTemplate: 'nmpa-cover-letter',
  specificRequirements: [
    'Chinese translation of all Module 1 documents',
    'CDE electronic submission system',
    'eCTD format increasingly accepted',
    'Chinese clinical trial data may be required',
    'Drug MAH (Marketing Authorization Holder) system since 2019',
    'Drug agent in China required for overseas applicants',
  ],
  module1Sections: [
    { number: '1.1', title: 'Application Form', titleLocal: '药品注册申请表', required: true, description: 'CDE application form in Chinese' },
    { number: '1.2', title: 'Drug Certificate', titleLocal: '药品证书', required: true, description: 'Proof of approval in country of origin (if imported)' },
    { number: '1.3', title: 'GMP Certificate', titleLocal: 'GMP证书', required: true, description: 'GMP compliance certification' },
    { number: '1.4', title: 'Manufacturer Authorization', titleLocal: '生产企业授权书', required: true, description: 'Authorization from manufacturer to MAH' },
    { number: '1.5', title: 'Agent Authorization', titleLocal: '代理人授权书', required: false, description: 'Authorization for Chinese agent (imported drugs)' },
    { number: '1.6', title: 'Package Label and Insert', titleLocal: '说明书和标签', required: true, description: 'Chinese labeling and package insert' },
    { number: '1.7', title: 'Drug Sample Information', titleLocal: '药品样品信息', required: false, description: 'Sample submission requirements' },
    { number: '1.8', title: 'Self-Inspection Report', titleLocal: '自查报告', required: true, description: 'Clinical trial data self-inspection report' },
    { number: '1.15', title: 'Clinical Trial Protocol', titleLocal: '临床试验方案', required: false, description: 'Protocol for Chinese clinical trials if required' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE API
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES: Record<string, RegionalTemplate> = {
  FDA: FDA_TEMPLATE,
  EMA: EMA_TEMPLATE,
  PMDA: PMDA_TEMPLATE,
  NMPA: NMPA_TEMPLATE,
};

/**
 * Get regional template for a specific agency.
 */
export function getRegionalTemplate(agency: string): RegionalTemplate | null {
  return TEMPLATES[agency.toUpperCase()] || null;
}

/**
 * Get all supported regional templates.
 */
export function getAllRegionalTemplates(): RegionalTemplate[] {
  return Object.values(TEMPLATES);
}

/**
 * Get Module 1 sections for a specific agency.
 */
export function getModule1Sections(agency: string): CTDSection[] {
  const template = TEMPLATES[agency.toUpperCase()];
  return template?.module1Sections || [];
}

/**
 * Get all supported agencies.
 */
export function getSupportedAgencies(): string[] {
  return Object.keys(TEMPLATES);
}

/**
 * Generate a merged CTD structure for multi-agency submissions.
 * Modules 2-5 are shared (ICH common), Module 1 is per-agency.
 */
export function getMultiAgencyCTDStructure(agencies: string[]): {
  commonModules: CTDSection[];
  regionalModule1: Record<string, CTDSection[]>;
} {
  const commonModules: CTDSection[] = [
    {
      number: '2', title: 'Common Technical Document Summaries', required: true, description: 'CTD Summaries',
      childSections: [
        { number: '2.1', title: 'CTD Table of Contents', required: true, description: 'Comprehensive TOC' },
        { number: '2.2', title: 'CTD Introduction', required: true, description: 'Introduction to the submission' },
        { number: '2.3', title: 'Quality Overall Summary', required: true, description: 'Summary of Module 3 (Quality)' },
        { number: '2.4', title: 'Nonclinical Overview', required: true, description: 'Nonclinical study overview' },
        { number: '2.5', title: 'Clinical Overview', required: true, description: 'Clinical study overview' },
        { number: '2.6', title: 'Nonclinical Written and Tabulated Summaries', required: true, description: 'Detailed nonclinical summaries' },
        { number: '2.7', title: 'Clinical Summary', required: true, description: 'Detailed clinical summaries' },
      ],
    },
    { number: '3', title: 'Quality', required: true, description: 'CMC data (Drug substance, Drug product, Quality)' },
    { number: '4', title: 'Nonclinical Study Reports', required: true, description: 'Nonclinical pharmacology, PK, toxicology' },
    { number: '5', title: 'Clinical Study Reports', required: true, description: 'Clinical study reports, case report forms, literature' },
  ];

  const regionalModule1: Record<string, CTDSection[]> = {};
  for (const agency of agencies) {
    const sections = getModule1Sections(agency);
    if (sections.length > 0) {
      regionalModule1[agency] = sections;
    }
  }

  return { commonModules, regionalModule1 };
}

export default {
  getRegionalTemplate,
  getAllRegionalTemplates,
  getModule1Sections,
  getSupportedAgencies,
  getMultiAgencyCTDStructure,
};
