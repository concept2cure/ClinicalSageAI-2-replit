/**
 * @fileoverview Regional CTD Templates Service
 * @module server/services/regional-ctd-templates
 *
 * Manages region-specific templates for CTD Module 1 across
 * FDA, EMA, PMDA, NMPA and MFDS. Each agency has unique requirements
 * for Module 1 while Modules 2-5 follow ICH common format.
 *
 * FDA, EMA and PMDA Module 1 is not kept here: it is the regional Module 1
 * record (shared/regulatory/regional-module1.ts), projected to `CTDSection` by
 * `toCtdSection`. NMPA and MFDS Module 1 stay hand-kept here and are labelled
 * `module1Record: 'not-modeled'`.
 */

import { moduleOneTree, type RegionalHeading } from '../../shared/regulatory/regional-module1';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RegionalTemplate {
  agency: string;
  region: string;
  /**
   * Where `module1Sections` comes from: the cited regional Module 1 record
   * (FDA, EMA, PMDA), or a hand-kept tree the record does not model.
   */
  module1Record: 'regional-module1' | 'not-modeled';
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

/**
 * A record heading as a `CTDSection`. `required` is true when the heading is
 * always required for some application kind; `requiredFor` names those kinds
 * (absent when it is required for every kind). A conditional heading whose
 * fact is unknown is not projected as required — `requiredModule1` reports it
 * as undetermined.
 */
export function toCtdSection(h: RegionalHeading): CTDSection {
  const always = h.applies.filter((a) => a.necessity === 'always');
  const requiredFor = always.some((a) => !a.kinds) ? undefined : [...new Set(always.flatMap((a) => a.kinds ?? []))];
  return {
    number: h.number,
    title: h.title,
    ...(h.titleLocal !== undefined ? { titleLocal: h.titleLocal } : {}),
    required: always.length > 0,
    ...(requiredFor && requiredFor.length > 0 ? { requiredFor } : {}),
    description: h.description,
    ...(h.childSections?.length ? { childSections: h.childSections.map(toCtdSection) } : {}),
  };
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
  // FDA eCTD Module 1 headings: projected from the regional Module 1 record
  // (shared/regulatory/regional-module1.ts), where each heading carries its
  // basis, roles and applicability. Drives the dispatch-readiness
  // required-section check for every FDA sequence. Held to the FDA list by
  // tests/regulatory/fda-module1-numbering.test.ts.
  module1Record: 'regional-module1',
  module1Sections: moduleOneTree('US').map(toCtdSection),
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
  // EU Module 1 eCTD Specification headings: projected from the regional
  // Module 1 record (shared/regulatory/regional-module1.ts). EU 1.1 is kept for
  // non-eCTD submissions and is not required: in eCTD the XML backbone is the
  // table of contents.
  module1Record: 'regional-module1',
  module1Sections: moduleOneTree('EU').map(toCtdSection),
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
  // Japanese CTD Module 1 (承認申請書 = 1.2, 添付文書(案) = 1.8, 医薬品リスク管理計画書(案)
  // = 1.11): projected from the regional Module 1 record
  // (shared/regulatory/regional-module1.ts).
  module1Record: 'regional-module1',
  module1Sections: moduleOneTree('JP').map(toCtdSection),
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
  // NOT MODELED by the regional Module 1 record (US, EU and JP only): this tree
  // is hand-kept here and carries no basis per heading.
  module1Record: 'not-modeled',
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
  // NOT MODELED by the regional Module 1 record (US, EU and JP only): this tree
  // is hand-kept here and carries no basis per heading.
  module1Record: 'not-modeled',
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
