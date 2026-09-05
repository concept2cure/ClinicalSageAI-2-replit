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
  /**
   * Application types (lower-case registry applicationType: ind | nda | bla |
   * anda) for which `required` applies. Absent = every application type. A
   * debarment certification is required for a marketing application and not
   * for an IND; the general investigational plan is the reverse.
   */
  requiredFor?: string[];
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
  // FDA eCTD Module 1 Specification v2.3 headings — the same list the packager
  // derives its us-regional.xml elements from (controlled-vocab/cv-v4-data.ts).
  // Drives the dispatch-readiness required-section check for every FDA
  // sequence, so an IND is asked for its plan and brochure, a marketing
  // application for its debarment certification and draft labeling. Held to the
  // FDA list by tests/regulatory/fda-module1-numbering.test.ts.
  module1Sections: [
    { number: '1.1', title: 'Forms', required: true, description: 'FDA forms filed under the forms heading: 1571 (IND), 356h (NDA/BLA/ANDA), 3674 (ClinicalTrials.gov certification), 3397 (user fee cover sheet), 2253' },
    { number: '1.2', title: 'Cover Letter', required: true, description: 'Submission cover letter addressed to the appropriate FDA review division' },
    {
      number: '1.3', title: 'Administrative Information', required: true, description: 'Certifications, disclosures, patent and contact changes',
      childSections: [
        { number: '1.3.1', title: 'Contact/Sponsor/Applicant Information', required: false, description: 'Changes of address, contact agent, sponsor or ownership; transfer of obligation (1.3.1.1–1.3.1.5). Initial contact details travel on Form 1571 / 356h.' },
        { number: '1.3.2', title: 'Field Copy Certification', required: false, description: 'Certification for field copy submissions' },
        { number: '1.3.3', title: 'Debarment Certification', required: true, requiredFor: ['nda', 'bla', 'anda'], description: 'Certification under 21 USC 335a — marketing applications' },
        { number: '1.3.4', title: 'Financial Certification and Disclosure', required: true, requiredFor: ['nda', 'bla', 'anda'], description: 'Forms FDA 3454/3455 for clinical investigators (21 CFR 54)' },
        { number: '1.3.5', title: 'Patent and Exclusivity Information', required: false, description: '1.3.5.1 patent information, 1.3.5.2 patent certification, 1.3.5.3 exclusivity claim' },
      ],
    },
    {
      number: '1.4', title: 'References', required: false, description: 'Letters of authorization, right of reference, cross-references',
      childSections: [
        { number: '1.4.1', title: 'Letters of Authorization', required: false, description: 'Authorization to reference a DMF or another application' },
        { number: '1.4.2', title: 'Statement of Right of Reference', required: false, description: 'Statement allowing FDA to access referenced data' },
        { number: '1.4.3', title: 'List of Authorized Persons to Incorporate by Reference', required: false, description: 'Persons authorized to incorporate the file by reference' },
        { number: '1.4.4', title: 'Cross Reference to Previously Submitted Information', required: false, description: 'Cross-reference to information in another application' },
      ],
    },
    { number: '1.5', title: 'Application Status', required: false, description: 'Withdrawal, inactivation, reactivation and reinstatement requests' },
    { number: '1.6', title: 'Meetings', required: false, description: 'Meeting requests, background materials and correspondence regarding meetings' },
    { number: '1.9', title: 'Pediatric Administrative Information', required: false, description: 'Waiver, deferral and pediatric study plan requests and correspondence' },
    {
      number: '1.12', title: 'Other Correspondence', required: false, description: 'Pre-IND correspondence, requests and waivers, environmental analysis',
      childSections: [
        { number: '1.12.1', title: 'Pre-IND Correspondence', required: false, description: 'Pre-IND meeting materials carried into the application' },
        { number: '1.12.14', title: 'Environmental Analysis', required: true, requiredFor: ['ind', 'nda', 'bla', 'anda'], description: 'Environmental assessment or claim of categorical exclusion (21 CFR 25.31)' },
      ],
    },
    { number: '1.13', title: 'Annual Report', required: false, description: 'IND (21 CFR 312.33) and NDA/BLA (21 CFR 314.81) annual reports, DSUR' },
    {
      number: '1.14', title: 'Labeling', required: true, description: 'Draft, final, listed-drug and investigational labeling',
      childSections: [
        { number: '1.14.1', title: 'Draft Labeling', required: true, requiredFor: ['nda', 'bla', 'anda'], description: 'Draft carton and container labels, annotated and clean draft labeling text (Prescribing Information, Medication Guide, PPI)' },
        { number: '1.14.2', title: 'Final Labeling', required: false, description: 'Final carton/container labels, final package insert, final labeling text' },
        { number: '1.14.3', title: 'Listed Drug Labeling', required: false, description: 'ANDA / 505(b)(2) annotated comparison with the reference listed drug' },
        {
          number: '1.14.4', title: 'Investigational Drug Labeling', required: true, requiredFor: ['ind'], description: "Investigator's brochure and investigational drug labeling for an IND",
          childSections: [
            { number: '1.14.4.1', title: "Investigator's Brochure", required: true, requiredFor: ['ind'], description: '21 CFR 312.23(a)(5)' },
            { number: '1.14.4.2', title: 'Investigational Drug Labeling', required: true, requiredFor: ['ind'], description: '21 CFR 312.6; 312.23(a)(7)(iv)(d)' },
          ],
        },
      ],
    },
    { number: '1.15', title: 'Promotional Material', required: false, description: 'Promotional labeling and advertising submissions (Form 2253 travels under 1.1)' },
    { number: '1.16', title: 'Risk Management Plan / REMS', required: false, description: 'Risk management (non-REMS) and REMS documents' },
    { number: '1.20', title: 'General Investigational Plan for Initial IND', required: true, requiredFor: ['ind'], description: 'Introductory statement and general investigational plan (21 CFR 312.23(a)(3))' },
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
  // Module 1 per the authoritative EU Module 1 eCTD Specification (EMA eSubmission
  // portal / Notice to Applicants). Verified headings: 1.0 Cover Letter, 1.1 TOC,
  // 1.2 Application Form, 1.3 Product Information, 1.4 Experts, 1.5 Specific
  // Requirements, 1.6 Environmental Risk Assessment, 1.7 Orphan Market Exclusivity,
  // 1.8 Pharmacovigilance (1.8.1 PSMF / 1.8.2 RMP), 1.9 Clinical Trials, 1.10 Paediatrics.
  module1Sections: [
    { number: '1.0', title: 'Cover Letter', required: true, description: 'EU regional cover letter' },
    { number: '1.1', title: 'Comprehensive Table of Contents', required: true, description: 'Table of contents covering Modules 1–5' },
    { number: '1.2', title: 'Application Form', required: true, description: 'Completed EU application form' },
    {
      number: '1.3', title: 'Product Information', required: true, description: 'SmPC, labelling and package leaflet',
      childSections: [
        { number: '1.3.1', title: 'SmPC, Labelling and Package Leaflet', titleLocal: 'SmPC', required: true, description: 'Proposed Summary of Product Characteristics, labelling and package leaflet' },
        { number: '1.3.2', title: 'Mock-up', required: false, description: 'Mock-ups of the outer/immediate packaging and the package leaflet' },
        { number: '1.3.3', title: 'Specimen', required: false, description: 'Specimens of the packaging, where applicable' },
        { number: '1.3.4', title: 'Consultation with Target Patient Groups', required: false, description: 'Package-leaflet readability / user-testing results' },
      ],
    },
    {
      number: '1.4', title: 'Information about the Experts', required: true, description: 'Expert declarations and signatures',
      childSections: [
        { number: '1.4.1', title: 'Quality', required: true, description: 'Quality expert declaration' },
        { number: '1.4.2', title: 'Non-Clinical', required: true, description: 'Non-clinical expert declaration' },
        { number: '1.4.3', title: 'Clinical', required: true, description: 'Clinical expert declaration' },
      ],
    },
    {
      number: '1.5', title: 'Specific Requirements for Different Types of Applications', required: false, description: 'Additional requirements by application type',
      childSections: [
        { number: '1.5.1', title: 'Information for Bibliographical Applications', required: false, description: 'Well-established use applications' },
        { number: '1.5.2', title: 'Information for Generic, Hybrid or Bio-similar Applications', required: false, description: 'Generic / hybrid / biosimilar applications' },
      ],
    },
    { number: '1.6', title: 'Environmental Risk Assessment', required: true, description: 'ERA (incl. GMO aspects where applicable)' },
    {
      number: '1.7', title: 'Information relating to Orphan Market Exclusivity', required: false, description: 'Orphan similarity and market exclusivity',
      childSections: [
        { number: '1.7.1', title: 'Similarity', required: false, description: 'Report on similarity with authorised orphan medicinal products' },
        { number: '1.7.2', title: 'Market Exclusivity', required: false, description: 'Market-exclusivity considerations' },
      ],
    },
    {
      number: '1.8', title: 'Information relating to Pharmacovigilance', required: true, description: 'Pharmacovigilance system and risk management',
      childSections: [
        { number: '1.8.1', title: 'Pharmacovigilance System', required: true, description: 'Summary of the pharmacovigilance system (PSMF summary), incl. the QPPV' },
        { number: '1.8.2', title: 'Risk Management System', required: true, description: 'EU Risk Management Plan (EU-RMP)' },
      ],
    },
    { number: '1.9', title: 'Information relating to Clinical Trials', required: false, description: 'Statement on GCP compliance for clinical trials conducted outside the EU/EEA' },
    { number: '1.10', title: 'Information relating to Paediatrics', required: false, description: 'PIP / PDCO decision, deferral or waiver information' },
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
  // Module 1 per the authoritative NMPA M4 Module 1 — Administrative Documents and
  // Drug Information (行政文件和药品信息, NMPA notice 2019 No. 17, effective 1 July 2019;
  // nmpa.gov.cn). Verified headings: 1.0 说明函 Cover Letter, 1.1 目录 Table of
  // Contents, 1.2 申请表 Application Form, 1.3 产品信息相关材料 Product Information
  // (说明书 / 包装标签 / 产品质量标准和生产工艺 / 临床试验相关资料 / 产品证明性文件).
  module1Sections: [
    { number: '1.0', title: 'Cover Letter', titleLocal: '说明函', required: true, description: 'Cover letter summarizing the key information of the application' },
    { number: '1.1', title: 'Comprehensive Table of Contents', titleLocal: '目录', required: true, description: 'Table of contents / navigation structure for the submission' },
    { number: '1.2', title: 'Application Form', titleLocal: '申请表', required: true, description: 'CDE drug registration application form (Chinese)' },
    {
      number: '1.3', title: 'Product Information', titleLocal: '产品信息相关材料', required: true, description: 'Prescribing information, labelling, quality/process, clinical and certification documents',
      childSections: [
        { number: '1.3.1', title: 'Prescribing Information', titleLocal: '说明书', required: true, description: 'Chinese package insert / prescribing information' },
        { number: '1.3.2', title: 'Packaging and Labels', titleLocal: '包装标签', required: true, description: 'Chinese packaging and label text' },
        { number: '1.3.3', title: 'Product Quality Standards and Manufacturing Process', titleLocal: '产品质量标准和生产工艺', required: true, description: 'Drug quality standards and manufacturing process (incl. GMP compliance)' },
        { number: '1.3.4', title: 'Clinical Trial Materials', titleLocal: '临床试验相关资料', required: false, description: 'Clinical trial protocol/data and self-inspection report, where applicable' },
        { number: '1.3.5', title: 'Product Certification Documents', titleLocal: '产品证明性文件', required: true, description: 'Drug approval/origin certificate, manufacturer authorization, and Chinese agent authorization (imported drugs)' },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// MFDS (South Korea)
// ═══════════════════════════════════════════════════════════════════════════════

export const MFDS_TEMPLATE: RegionalTemplate = {
  agency: 'MFDS',
  region: 'KR',
  language: 'ko',
  currency: 'KRW',
  forms: [
    { name: 'Marketing Authorization Application', formId: 'mfds-maa', required: true, description: '의약품 품목허가·신고 신청서 (MFDS marketing-authorization / notification application form, Korean)' },
  ],
  prescribingInfoTemplate: 'mfds-prescribing-information',
  coverLetterTemplate: 'mfds-cover-letter',
  specificRequirements: [
    'Korea uses the K-CTD (의약품 국제공통기술문서); Module 1 = Administrative Information and Prescribing Information',
    'Korean-language Module 1 documents required (행정정보 / 표지문서 / 신청서 / 제품정보)',
    'MFDS electronic submission; eCTD v4.0 voluntary phase expected from 2027 (mandatory date not yet set)',
    'Korean GMP (KGMP) compliance; DMF (Drug Master File) where applicable',
    'Local marketing-authorization holder or Korean agent required for foreign applicants',
    '⚠ APPROXIMATE: the Module 1 section numbering below reflects confirmed K-CTD content areas and general ICH M1 convention — verify against the official MFDS K-CTD guidance (의약품 국제공통기술문서(CTD) 해설서) before relying on exact numbers',
  ],
  // NOTE: K-CTD Module 1 — Administrative Information and Prescribing Information.
  // The content areas (행정정보 / 표지문서 / 신청서 / 제품정보) are confirmed from MFDS
  // guidance, but the exact section numbering is not published in accessible English
  // sources; the numbering below is an ICH-M1-convention approximation and is flagged
  // as such in specificRequirements above. Verify against the official MFDS K-CTD 해설서.
  module1Sections: [
    { number: '1.1', title: 'Comprehensive Table of Contents', titleLocal: '목차', required: true, description: 'Table of contents for the K-CTD submission' },
    { number: '1.2', title: 'Cover Letter', titleLocal: '표지문서', required: true, description: 'Submission cover document' },
    { number: '1.3', title: 'Application Form', titleLocal: '신청서', required: true, description: '의약품 품목허가·신고 신청서 (MFDS marketing-authorization application form, Korean)' },
    { number: '1.4', title: 'Administrative Information', titleLocal: '행정정보', required: true, description: 'Certificates, authorizations and qualification documents (e.g., KGMP, manufacturer / Korean-agent authorization)' },
    {
      number: '1.5', title: 'Product Information', titleLocal: '제품정보', required: true, description: 'Korean prescribing information and labeling',
      childSections: [
        { number: '1.5.1', title: 'Prescribing Information', titleLocal: '첨부문서(허가사항)', required: true, description: 'Korean prescribing information / package insert' },
        { number: '1.5.2', title: 'Labeling', titleLocal: '표시기재', required: true, description: 'Korean labeling and packaging text' },
      ],
    },
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
  MFDS: MFDS_TEMPLATE,
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
