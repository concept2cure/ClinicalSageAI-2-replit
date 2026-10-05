/**
 * Regional Module 1 — the one record of where FDA, EMA and PMDA file Module 1
 * documents, with a basis on every heading.
 *
 * Module 1 is the only regional part of the CTD (ICH M4 harmonises Modules 2–5),
 * and each regulator numbers it differently: a cover letter is US 1.2 and EU
 * 1.0; the product-information draft is US 1.14.1.3, EU 1.3.1 and JP 1.8; the
 * risk-management plan is EU 1.8.2 and JP 1.11. Every reader that needs those
 * answers derives them from here.
 *
 * Each `RegionalHeading` carries:
 *   - `basis`: where the heading's number and title come from
 *     (`regulator-text` only where the regulator's text was read — for the US,
 *     the FDA controlled vocabulary vendored in
 *     server/services/ectd/controlled-vocab/cv-v4-data.ts; `recall` otherwise);
 *   - `applies`: for which application kinds it is required, conditional on an
 *     evaluable fact, filed only when applicable, or required at the
 *     authority's request. `[]` makes no requirement claim (a heading only);
 *   - `roles`: what the document is (a closed `DocumentRole` list), from which
 *     `placementFor` and `equivalentsOf` are derived — no separate
 *     equivalence table exists to drift from it.
 *
 * The trees were moved here from server/services/regional-ctd-templates.ts
 * (FDA_TEMPLATE / EMA_TEMPLATE / PMDA_TEMPLATE `module1Sections`), which now
 * projects them. The facts relied on are in
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-regional-module1-record-facts.md.
 *
 * Pure data plus pure helpers. Runtime imports: `shared/**` only (`import type`
 * is erased), so the client bundle can read it — held by
 * server/services/ind/ctd/__tests__/record-purity.test.ts.
 *
 * Not modelled: Module 1 for any other regulator (CA, UK, CH, AU, CN, KR, BR,
 * IN, SG). A caller gets nothing for those, never another regulator's tree.
 *
 * @module shared/regulatory/regional-module1
 */

import type { CanonicalRegion } from './region-identity';
import type { LegacyLowerType } from './submission-type-bridge';
import type { DeviceFlagId } from '../constants/domain/device-classification';
import type { RegulatoryBasis } from './regulatory-basis';
import { compareSectionCode, normalizeCtdCode } from './section-code';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ModeledJurisdiction = Extract<CanonicalRegion, 'US' | 'EU' | 'JP'>;

export const MODELED_JURISDICTIONS: readonly ModeledJurisdiction[] = Object.freeze(['US', 'EU', 'JP'] as const);

export type ApplicationKind =
  | Exclude<LegacyLowerType, 'cer' | 'ectd' | 'general'> // ind nda bla anda maa jnda cta 510k de_novo pma mdr_td ivdr_td
  | 'dmf' | 'asmf' | 'jmf' | 'ctn' | 'hde' | 'jp_todokede' | 'jp_ninsho' | 'jp_shonin';

/** One enum: the eSTAR `Necessity` ∪ `E3Applicability`. */
export type Necessity = 'always' | 'conditional' | 'when-applicable' | 'authority-dependent';

export type M1ConditionId =
  | 'orphan_designation'
  | 'paediatric_obligation'
  | 'generic_hybrid_biosimilar'
  | 'bibliographic'
  | 'foreign_manufacturer'
  | 'referenced_master_file'
  | 'clinical_data_required'
  | 'sponsor_investigator';

export type ConditionId = M1ConditionId | DeviceFlagId;

export interface Applicability<C extends string = ConditionId> {
  /** Absent = every application kind that uses the tree. */
  kinds?: ApplicationKind[];
  necessity: Necessity;
  /** For 'conditional': the deciding fact. Unknown ⇒ undetermined (a gap), never "not required". */
  condition?: C;
  /** For 'when-applicable': the deciding circumstance in words. */
  when?: string;
  basis?: RegulatoryBasis[];
}

/** Closed list. Every role is used by at least one node (tests/regulatory/regional-module1-record.test.ts). */
export const DOCUMENT_ROLES = Object.freeze([
  'cover_letter',
  'application_form',
  'product_information_draft',
  'labeling_mockup',
  'labeling_specimen',
  'readability_consultation',
  'investigators_brochure',
  'rmp',
  'rems',
  'pv_system',
  'paediatric',
  'environmental',
  'orphan',
  'patent',
  'debarment',
  'financial_disclosure',
  'letter_of_authorization',
  'expert_information',
  'meeting_information',
] as const);
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export interface RegionalHeading {
  number: string;
  title: string;
  /** Title in the regulator's language (添付文書(案)). */
  titleLocal?: string;
  /** `[]` = heading only, no requirement claim. */
  applies: Applicability[];
  roles?: DocumentRole[];
  description: string;
  childSections?: RegionalHeading[];
  /** Non-empty. */
  basis: RegulatoryBasis[];
  /** EU/JP depth. US depth stays in CTD_AUTHORING_GUIDANCE. */
  contains?: string[];
  pitfalls?: string[];
  /** Platform keys filed under this FDA heading (US 1.1.1–1.1.4 under 1.1 Forms); they are not FDA headings. */
  platformSubKeys?: Array<{ code: string; title: string }>;
  /** Where the document's own format lives; labelling depth stays in its engine. */
  pointsTo?: { outline: 'us-pi' | 'eu-smpc-qrd' | 'jp-package-insert' | 'eu-rmp'; module: string };
  /** Not an eCTD item (EU 1.1: the eCTD backbone is the table of contents). */
  notInEctd?: true;
}

export interface RegionalModule1 {
  jurisdiction: ModeledJurisdiction;
  /** The specification the tree follows. */
  spec: RegulatoryBasis;
  /** Application kinds whose Module 1 this tree is. */
  kinds: readonly ApplicationKind[];
  tree: readonly RegionalHeading[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASES
// ═══════════════════════════════════════════════════════════════════════════════

const CHECKED = '2026-10-05';
const CV_VENDORED = 'server/services/ectd/controlled-vocab/cv-v4-data.ts';
const SEARCH_NOTE = 'search extract of the regulator-hosted document; verbatim re-read owed';

/** A heading FDA publishes in its Module 1 controlled vocabulary (vendored, read). */
function fdaCv(code: string): RegulatoryBasis {
  return {
    ref: `FDA eCTD Module 1 controlled vocabulary (context of use us_${code})`,
    confidence: 'regulator-text',
    vendored: CV_VENDORED,
    checked: CHECKED,
  };
}

const FDA_M1_CV: RegulatoryBasis = {
  ref: 'FDA Module 1 eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06), context-of-use list',
  confidence: 'regulator-text',
  vendored: CV_VENDORED,
  checked: CHECKED,
};

/** A US heading the vendored CV does not list itself (a parent of listed codes, or not listed). */
function usRecall(note: string): RegulatoryBasis {
  return { ref: 'FDA eCTD Module 1 heading (not listed as such in the vendored controlled vocabulary)', confidence: 'recall', note };
}
const US_PARENT = usRecall('the number is implied by the controlled-vocabulary codes beneath it; the heading title is not in the CV');

const EU_M1_V31: RegulatoryBasis = {
  ref: 'EU Module 1 eCTD Specification v3.1 (June 2024)',
  confidence: 'regulator-text',
  url: 'https://esubmission.ema.europa.eu/eumodule1/EU%20M1%20eCTD%20Spec%20v3.1%20-%20June%202024%20-%20final%20version.pdf',
  checked: CHECKED,
  note: `${SEARCH_NOTE}. v3.1.1 is the version EMA accepts from 1 December 2025 (secondary source, recall); headings cited from v3.1`,
};
const EU_RECALL: RegulatoryBasis = {
  ref: 'EU Module 1 eCTD Specification (heading recalled; not checked against v3.1)',
  confidence: 'recall',
};
const EU_ECTD_GUIDANCE_NO_TOC: RegulatoryBasis = {
  ref: 'EMA eCTD Guidance v4.0 (22 April 2016): no table of contents in eCTD; the XML backbone acts as one',
  confidence: 'regulator-text',
  url: 'https://esubmission.ema.europa.eu/tiges/docs/eCTD%20Guidance%20v4%200-20160422-final.pdf',
  checked: CHECKED,
  note: SEARCH_NOTE,
};

const JP_SAKUSEI_YORYO: RegulatoryBasis = {
  ref: 'MHLW 薬生薬審発0705第4号 (2017-07-05) amending 「新医薬品の製造販売の承認申請に際し承認申請書に添付すべき資料の作成要領について」',
  confidence: 'regulator-text',
  url: 'https://www.mhlw.go.jp/web/t_doc?dataId=00tc2799&dataType=1&pageNo=1',
  checked: CHECKED,
  note: SEARCH_NOTE,
};
const JP_RMP_GUIDANCE: RegulatoryBasis = {
  ref: '薬食審査発0426第2号 / 薬食安発0426第1号 (2012-04-26; amended 2013-03-04): 医薬品リスク管理計画の策定について',
  confidence: 'regulator-text',
  url: 'https://www.pmda.go.jp/files/000143712.pdf',
  checked: CHECKED,
  note: `${SEARCH_NOTE}; the draft RMP (医薬品リスク管理計画書（案）) is filed at CTD M1.11`,
};
const JP_RMP_EXAMPLE: RegulatoryBasis = {
  ref: 'PMDA 医薬品リスク管理計画書記載事例 (draft RMP filed with the application as CTD M1.11)',
  confidence: 'regulator-text',
  url: 'https://www.pmda.go.jp/files/000221872.pdf',
  checked: CHECKED,
  note: SEARCH_NOTE,
};
const JP_RECALL: RegulatoryBasis = {
  ref: 'MHLW/PMDA CTD Module 1 composition (heading recalled; not checked against the notice)',
  confidence: 'recall',
};

/** Where the three labelling formats are checked. */
const LABELING_ENGINE = 'server/services/global-ri/labeling-requirements.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICABILITY SHORTHANDS
// ═══════════════════════════════════════════════════════════════════════════════

const always = (kinds?: ApplicationKind[]): Applicability => (kinds ? { kinds, necessity: 'always' } : { necessity: 'always' });
const whenApplicable = (when: string, kinds?: ApplicationKind[]): Applicability =>
  kinds ? { kinds, necessity: 'when-applicable', when } : { necessity: 'when-applicable', when };
const conditional = (condition: ConditionId, kinds?: ApplicationKind[]): Applicability =>
  kinds ? { kinds, necessity: 'conditional', condition } : { necessity: 'conditional', condition };

const MARKETING_US: ApplicationKind[] = ['nda', 'bla', 'anda'];

// ═══════════════════════════════════════════════════════════════════════════════
// US — FDA eCTD Module 1 (moved from FDA_TEMPLATE.module1Sections)
// ═══════════════════════════════════════════════════════════════════════════════

const US_TREE: RegionalHeading[] = [
  {
    number: '1.1', title: 'Forms', applies: [always()], roles: ['application_form'], basis: [fdaCv('1.1')],
    description: 'FDA forms filed under the forms heading: 1571 (IND), 356h (NDA/BLA/ANDA), 3674 (ClinicalTrials.gov certification), 3397 (user fee cover sheet), 2253',
    platformSubKeys: [
      { code: '1.1.1', title: 'Form FDA 1571 — Investigational New Drug Application' },
      { code: '1.1.2', title: 'Form FDA 1572 — Statement of Investigator' },
      { code: '1.1.3', title: 'Form FDA 3674 — Certification of Compliance with ClinicalTrials.gov' },
      { code: '1.1.4', title: 'Form FDA 356h — Application to Market a New or Abbreviated New Drug or Biologic' },
    ],
  },
  { number: '1.2', title: 'Cover Letter', applies: [always()], roles: ['cover_letter'], basis: [fdaCv('1.2')], description: 'Submission cover letter addressed to the appropriate FDA review division' },
  {
    number: '1.3', title: 'Administrative Information', applies: [always()], basis: [US_PARENT],
    description: 'Certifications, disclosures, patent and contact changes',
    childSections: [
      { number: '1.3.1', title: 'Contact/Sponsor/Applicant Information', basis: [US_PARENT], applies: [whenApplicable('a change of address, contact agent, sponsor or ownership, or a transfer of obligation')], description: 'Changes of address, contact agent, sponsor or ownership; transfer of obligation (1.3.1.1–1.3.1.5). Initial contact details travel on Form 1571 / 356h.' },
      { number: '1.3.2', title: 'Field Copy Certification', basis: [fdaCv('1.3.2')], applies: [whenApplicable('a field copy certification is part of the application')], description: 'Certification for field copy submissions' },
      { number: '1.3.3', title: 'Debarment Certification', applies: [always(MARKETING_US)], roles: ['debarment'], basis: [fdaCv('1.3.3')], description: 'Certification under 21 USC 335a — marketing applications' },
      { number: '1.3.4', title: 'Financial Certification and Disclosure', applies: [always(MARKETING_US)], roles: ['financial_disclosure'], basis: [fdaCv('1.3.4')], description: 'Forms FDA 3454/3455 for clinical investigators (21 CFR 54)' },
      { number: '1.3.5', title: 'Patent and Exclusivity Information', roles: ['patent'], basis: [US_PARENT], applies: [whenApplicable('patent information, a patent certification or an exclusivity claim is filed')], description: '1.3.5.1 patent information, 1.3.5.2 patent certification, 1.3.5.3 exclusivity claim' },
    ],
  },
  {
    number: '1.4', title: 'References', basis: [US_PARENT],
    applies: [whenApplicable('the application references a master file, another application or previously submitted information')],
    description: 'Letters of authorization, right of reference, cross-references',
    childSections: [
      { number: '1.4.1', title: 'Letters of Authorization', applies: [conditional('referenced_master_file')], roles: ['letter_of_authorization'], basis: [fdaCv('1.4.1')], description: 'Authorization to reference a DMF or another application' },
      { number: '1.4.2', title: 'Statement of Right of Reference', basis: [fdaCv('1.4.2')], applies: [whenApplicable('the applicant grants or relies on a right of reference')], description: 'Statement allowing FDA to access referenced data' },
      { number: '1.4.3', title: 'List of Authorized Persons to Incorporate by Reference', basis: [fdaCv('1.4.3')], applies: [whenApplicable('persons are authorized to incorporate the file by reference')], description: 'Persons authorized to incorporate the file by reference' },
      { number: '1.4.4', title: 'Cross Reference to Previously Submitted Information', basis: [fdaCv('1.4.4')], applies: [whenApplicable('information already submitted to FDA is relied on by cross-reference')], description: 'Cross-reference to information in another application' },
    ],
  },
  { number: '1.5', title: 'Application Status', basis: [US_PARENT], applies: [whenApplicable('a withdrawal, inactivation, reactivation or reinstatement is requested')], description: 'Withdrawal, inactivation, reactivation and reinstatement requests' },
  { number: '1.6', title: 'Meetings', roles: ['meeting_information'], basis: [US_PARENT], applies: [whenApplicable('a meeting is requested or meeting materials are submitted')], description: 'Meeting requests, background materials and correspondence regarding meetings' },
  { number: '1.9', title: 'Pediatric Administrative Information', roles: ['paediatric'], basis: [US_PARENT], applies: [conditional('paediatric_obligation', ['ind', 'nda', 'bla'])], description: 'Waiver, deferral and pediatric study plan requests and correspondence' },
  {
    number: '1.12', title: 'Other Correspondence', basis: [US_PARENT],
    applies: [whenApplicable('other correspondence, requests or waivers are submitted')],
    description: 'Pre-IND correspondence, requests and waivers, environmental analysis',
    childSections: [
      { number: '1.12.1', title: 'Pre-IND Correspondence', basis: [fdaCv('1.12.1')], applies: [whenApplicable('pre-IND meeting materials are carried into the application', ['ind'])], description: 'Pre-IND meeting materials carried into the application' },
      { number: '1.12.14', title: 'Environmental Analysis', applies: [always(['ind', 'nda', 'bla', 'anda'])], roles: ['environmental'], basis: [fdaCv('1.12.14')], description: 'Environmental assessment or claim of categorical exclusion (21 CFR 25.31)' },
    ],
  },
  { number: '1.13', title: 'Annual Report', basis: [US_PARENT], applies: [whenApplicable('an annual report or DSUR is due for an open IND or an approved application')], description: 'IND (21 CFR 312.33) and NDA/BLA (21 CFR 314.81) annual reports, DSUR' },
  {
    number: '1.14', title: 'Labeling', applies: [always()], basis: [US_PARENT],
    description: 'Draft, final, listed-drug and investigational labeling',
    childSections: [
      {
        number: '1.14.1', title: 'Draft Labeling', applies: [always(MARKETING_US)], basis: [US_PARENT],
        description: 'Draft carton and container labels, annotated and clean draft labeling text (Prescribing Information, Medication Guide, PPI)',
        childSections: [
          { number: '1.14.1.1', title: 'Draft Carton and Container Labels', applies: [], roles: ['labeling_mockup'], basis: [fdaCv('1.14.1.1')], description: 'Draft carton and container label artwork' },
          { number: '1.14.1.2', title: 'Annotated Draft Labeling Text', applies: [], basis: [fdaCv('1.14.1.2')], description: 'Draft labeling text annotated to the summary and technical sections that support each statement' },
          { number: '1.14.1.3', title: 'Draft Labeling Text', applies: [], roles: ['product_information_draft'], basis: [fdaCv('1.14.1.3')], description: 'Clean draft labeling text (Prescribing Information, Medication Guide, Patient Package Insert)', pointsTo: { outline: 'us-pi', module: LABELING_ENGINE } },
        ],
      },
      { number: '1.14.2', title: 'Final Labeling', basis: [US_PARENT], applies: [whenApplicable('final labeling is submitted after agreement with FDA')], description: 'Final carton/container labels, final package insert, final labeling text' },
      { number: '1.14.3', title: 'Listed Drug Labeling', basis: [US_PARENT], applies: [whenApplicable('the application relies on a reference listed drug (ANDA, 505(b)(2))', ['anda', 'nda'])], description: 'ANDA / 505(b)(2) annotated comparison with the reference listed drug' },
      {
        number: '1.14.4', title: 'Investigational Drug Labeling', applies: [always(['ind'])], basis: [US_PARENT],
        description: "Investigator's brochure and investigational drug labeling for an IND",
        childSections: [
          { number: '1.14.4.1', title: "Investigator's Brochure", applies: [always(['ind'])], roles: ['investigators_brochure'], basis: [fdaCv('1.14.4.1')], description: '21 CFR 312.23(a)(5)' },
          { number: '1.14.4.2', title: 'Investigational Drug Labeling', applies: [always(['ind'])], basis: [fdaCv('1.14.4.2')], description: '21 CFR 312.6; 312.23(a)(7)(iv)(d)' },
        ],
      },
    ],
  },
  { number: '1.15', title: 'Promotional Material', basis: [US_PARENT], applies: [whenApplicable('promotional labeling or advertising is submitted')], description: 'Promotional labeling and advertising submissions (Form 2253 travels under 1.1)' },
  { number: '1.16', title: 'Risk Management Plan / REMS', roles: ['rems'], basis: [US_PARENT], applies: [{ kinds: ['nda', 'bla', 'anda'], necessity: 'authority-dependent' }], description: 'Risk management (non-REMS) and REMS documents' },
  { number: '1.20', title: 'General Investigational Plan for Initial IND', applies: [always(['ind'])], basis: [fdaCv('1.20')], description: 'Introductory statement and general investigational plan (21 CFR 312.23(a)(3))' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EU — EU Module 1 eCTD Specification (moved from EMA_TEMPLATE.module1Sections)
// ═══════════════════════════════════════════════════════════════════════════════

const EU_TREE: RegionalHeading[] = [
  { number: '1.0', title: 'Cover Letter', applies: [always()], roles: ['cover_letter'], basis: [EU_RECALL], description: 'EU regional cover letter' },
  { number: '1.1', title: 'Comprehensive Table of Contents', basis: [EU_RECALL], notInEctd: true, applies: [{ ...whenApplicable('a non-eCTD (NeeS or paper) submission; in eCTD the XML backbone acts as the table of contents'), basis: [EU_ECTD_GUIDANCE_NO_TOC] }], description: 'Table of contents covering Modules 1–5 (non-eCTD submissions only)' },
  { number: '1.2', title: 'Application Form', applies: [always()], roles: ['application_form'], basis: [EU_RECALL], description: 'Completed EU application form' },
  {
    number: '1.3', title: 'Product Information', applies: [always()], basis: [EU_RECALL], description: 'SmPC, labelling and package leaflet',
    childSections: [
      { number: '1.3.1', title: 'SmPC, Labelling and Package Leaflet', titleLocal: 'SmPC', applies: [always()], roles: ['product_information_draft'], basis: [EU_M1_V31], description: 'Proposed Summary of Product Characteristics, labelling and package leaflet', pointsTo: { outline: 'eu-smpc-qrd', module: LABELING_ENGINE } },
      { number: '1.3.2', title: 'Mock-up', roles: ['labeling_mockup'], basis: [EU_M1_V31], applies: [whenApplicable('mock-ups of the outer/immediate packaging and package leaflet are submitted')], description: 'Mock-ups of the outer/immediate packaging and the package leaflet' },
      { number: '1.3.3', title: 'Specimen', roles: ['labeling_specimen'], basis: [EU_M1_V31], applies: [whenApplicable('specimens of the packaging are requested or submitted')], description: 'Specimens of the packaging, where applicable' },
      { number: '1.3.4', title: 'Consultation with Target Patient Groups', roles: ['readability_consultation'], basis: [EU_RECALL], applies: [whenApplicable('package-leaflet user testing results or a bridging justification are submitted')], description: 'Package-leaflet readability / user-testing results' },
      { number: '1.3.5', title: 'Product Information already approved in the Member States', basis: [EU_M1_V31], applies: [whenApplicable('the product information is already approved in Member States (MRP/DCP, variations)')], description: 'Product information already approved in the Member States' },
      { number: '1.3.6', title: 'Braille', basis: [EU_M1_V31], applies: [whenApplicable('Braille information on the packaging is submitted')], description: 'Braille text on the packaging' },
    ],
  },
  {
    number: '1.4', title: 'Information about the Experts', applies: [always()], roles: ['expert_information'], basis: [EU_RECALL], description: 'Expert declarations and signatures',
    childSections: [
      { number: '1.4.1', title: 'Quality', applies: [always()], basis: [EU_RECALL], description: 'Quality expert declaration' },
      { number: '1.4.2', title: 'Non-Clinical', applies: [always()], basis: [EU_RECALL], description: 'Non-clinical expert declaration' },
      { number: '1.4.3', title: 'Clinical', applies: [always()], basis: [EU_RECALL], description: 'Clinical expert declaration' },
    ],
  },
  {
    number: '1.5', title: 'Specific Requirements for Different Types of Applications', basis: [EU_RECALL],
    applies: [whenApplicable('the legal basis or type of application has specific requirements')],
    description: 'Additional requirements by application type',
    childSections: [
      { number: '1.5.1', title: 'Information for Bibliographical Applications', applies: [conditional('bibliographic')], basis: [EU_RECALL], description: 'Well-established use applications' },
      { number: '1.5.2', title: 'Information for Generic, Hybrid or Bio-similar Applications', applies: [conditional('generic_hybrid_biosimilar')], basis: [EU_RECALL], description: 'Generic / hybrid / biosimilar applications' },
      { number: '1.5.3', title: '(Extended) Data/Market Exclusivity', basis: [EU_RECALL], applies: [whenApplicable('an additional period of data or market protection is claimed')], description: 'Claims for (extended) data or market exclusivity' },
    ],
  },
  { number: '1.6', title: 'Environmental Risk Assessment', applies: [always()], roles: ['environmental'], basis: [EU_RECALL], description: 'ERA (incl. GMO aspects where applicable)' },
  {
    number: '1.7', title: 'Information relating to Orphan Market Exclusivity', applies: [conditional('orphan_designation')], roles: ['orphan'], basis: [EU_RECALL],
    description: 'Orphan similarity and market exclusivity',
    childSections: [
      { number: '1.7.1', title: 'Similarity', applies: [conditional('orphan_designation')], basis: [EU_RECALL], description: 'Report on similarity with authorised orphan medicinal products' },
      { number: '1.7.2', title: 'Market Exclusivity', applies: [conditional('orphan_designation')], basis: [EU_RECALL], description: 'Market-exclusivity considerations' },
    ],
  },
  {
    number: '1.8', title: 'Information relating to Pharmacovigilance', applies: [always()], basis: [EU_RECALL], description: 'Pharmacovigilance system and risk management',
    childSections: [
      { number: '1.8.1', title: 'Pharmacovigilance System', applies: [always()], roles: ['pv_system'], basis: [EU_RECALL], description: 'Summary of the pharmacovigilance system (PSMF summary), incl. the QPPV' },
      { number: '1.8.2', title: 'Risk Management System', applies: [always()], roles: ['rmp'], basis: [EU_M1_V31], description: 'EU Risk Management Plan (EU-RMP)' },
    ],
  },
  { number: '1.9', title: 'Information relating to Clinical Trials', basis: [EU_RECALL], applies: [whenApplicable('clinical trials were conducted outside the EU/EEA')], description: 'Statement on GCP compliance for clinical trials conducted outside the EU/EEA' },
  { number: '1.10', title: 'Information relating to Paediatrics', applies: [conditional('paediatric_obligation')], roles: ['paediatric'], basis: [EU_M1_V31], description: 'PIP / PDCO decision, deferral or waiver information' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// JP — MHLW/PMDA CTD Module 1 (moved from PMDA_TEMPLATE.module1Sections)
// ═══════════════════════════════════════════════════════════════════════════════

const JP_TREE: RegionalHeading[] = [
  { number: '1.1', title: 'Table of Contents', titleLocal: '第1部（モジュール1）目次', applies: [always()], basis: [JP_RECALL], description: 'Module 1 table of contents' },
  { number: '1.2', title: 'Application Form', titleLocal: '承認申請書(写)', applies: [always()], roles: ['application_form'], basis: [JP_RECALL], description: 'Copy of the marketing-approval application form (承認申請書)' },
  { number: '1.3', title: 'Certificates', titleLocal: '証明書類', basis: [JP_RECALL], applies: [whenApplicable('certificates are required for the application (e.g. GMP compliance, foreign approval)')], description: 'Certificates required for the application (e.g. GMP compliance, foreign approval)' },
  { number: '1.4', title: 'Patent Status', titleLocal: '特許状況', roles: ['patent'], basis: [JP_RECALL], applies: [whenApplicable('patents relevant to the application exist')], description: 'Patent information relevant to the application' },
  { number: '1.5', title: 'Origin / History of Discovery and Development', titleLocal: '起原又は発見の経緯及び開発の経緯', applies: [always()], basis: [JP_RECALL], description: 'Background on the origin/discovery and the development history' },
  { number: '1.6', title: 'Status of Use in Foreign Countries', titleLocal: '外国における使用状況等に関する資料', basis: [JP_RECALL], applies: [whenApplicable('the product is approved or used outside Japan')], description: 'Approval and use status in other countries' },
  { number: '1.7', title: 'List of Drugs with Similar Indications/Efficacy', titleLocal: '同種同効品一覧表', applies: [always()], basis: [JP_RECALL], description: 'Comparison table of products with similar indications/efficacy in Japan' },
  { number: '1.8', title: 'Package Insert (Draft)', titleLocal: '添付文書(案)', applies: [always()], roles: ['product_information_draft'], basis: [JP_SAKUSEI_YORYO], description: 'Draft Japanese Package Insert (添付文書 / JPI)', pointsTo: { outline: 'jp-package-insert', module: LABELING_ENGINE } },
  { number: '1.9', title: 'Documents on the Nonproprietary Name', titleLocal: '一般的名称に係る文書', basis: [JP_RECALL], applies: [whenApplicable('a Japanese Accepted Name (JAN) applies')], description: 'Documents related to the Japanese Accepted Name (JAN), if applicable' },
  { number: '1.10', title: 'Poisonous/Powerful Drug Designation Materials', titleLocal: '毒薬・劇薬等の指定審査資料のまとめ', basis: [JP_RECALL], applies: [whenApplicable('a poisonous/powerful-drug or related designation is under review')], description: 'Summary supporting poisonous/powerful-drug or related designations' },
  { number: '1.11', title: 'Post-Marketing Surveillance Plan / Risk Management Plan', titleLocal: '製造販売後調査基本計画書(案)／医薬品リスク管理計画書(案)', roles: ['rmp'], basis: [JP_RMP_GUIDANCE, JP_RMP_EXAMPLE], applies: [whenApplicable('a draft J-RMP or post-marketing surveillance plan is filed (expected for a new drug application — recall)')], description: 'Post-marketing surveillance basic plan; the J-RMP (医薬品リスク管理計画(案)) is submitted here for new drug applications' },
  { number: '1.12', title: 'List of Attached Materials', titleLocal: '添付資料一覧', applies: [always()], basis: [JP_SAKUSEI_YORYO], description: 'List of the Module 3–5 materials attached to the application' },
  { number: '1.13', title: 'Others', titleLocal: 'その他', basis: [JP_SAKUSEI_YORYO], applies: [whenApplicable('other Japan-specific materials are attached')], description: 'Japan-specific items (e.g. 1.13.x: references to previously approved products, electronic study-data notices, and accelerated-review / SAKIGAKE / 先駆的医薬品 designation information)' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// THE RECORD
// ═══════════════════════════════════════════════════════════════════════════════

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export const REGIONAL_MODULE1: Readonly<Record<ModeledJurisdiction, RegionalModule1>> = deepFreeze({
  US: { jurisdiction: 'US', spec: FDA_M1_CV, kinds: ['ind', 'nda', 'bla', 'anda'], tree: US_TREE },
  EU: { jurisdiction: 'EU', spec: EU_M1_V31, kinds: ['maa'], tree: EU_TREE },
  JP: { jurisdiction: 'JP', spec: JP_SAKUSEI_YORYO, kinds: ['jnda'], tree: JP_TREE },
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** The top-level headings of one jurisdiction's tree. */
export function moduleOneTree(j: ModeledJurisdiction): readonly RegionalHeading[] {
  return REGIONAL_MODULE1[j].tree;
}

function walk(nodes: readonly RegionalHeading[], visit: (n: RegionalHeading) => boolean): void {
  for (const n of nodes) if (visit(n)) walk(n.childSections ?? [], visit);
}

/** True when the heading speaks to `kind`: a heading-only node, or an applicability naming it (or naming no kinds). */
function appliesToKind(n: RegionalHeading, kind: ApplicationKind): boolean {
  return n.applies.length === 0 || n.applies.some((a) => !a.kinds || a.kinds.includes(kind));
}

/** One heading by code (m-prefix accepted), or null. Never a heading from another tree; a platform sub-key is not a heading. */
export function module1Heading(j: ModeledJurisdiction, code: string): RegionalHeading | null {
  const c = normalizeCtdCode(code);
  if (!c) return null;
  return flattenModule1(j).find((n) => n.number === c) ?? null;
}

/**
 * Every heading of the tree in document order. With `kind`, only the headings
 * that apply to it (a heading excluded for the kind takes its subtree with it);
 * a kind that does not use this tree gets [].
 */
export function flattenModule1(j: ModeledJurisdiction, kind?: ApplicationKind): RegionalHeading[] {
  if (kind && !REGIONAL_MODULE1[j].kinds.includes(kind)) return [];
  const out: RegionalHeading[] = [];
  walk(moduleOneTree(j), (n) => {
    if (kind && !appliesToKind(n, kind)) return false;
    out.push(n);
    return true;
  });
  return out;
}

type FactMap = Partial<Record<ConditionId, boolean>>;

/** How one heading stands for `kind` given the known facts. */
function standing(n: RegionalHeading, kind: ApplicationKind, facts: FactMap):
  | { is: 'required' }
  | { is: 'undetermined'; condition: ConditionId }
  | { is: 'notApplicable' }
  | { is: 'optional' } {
  const mine = n.applies.filter((a) => !a.kinds || a.kinds.includes(kind));
  if (n.applies.length > 0 && mine.length === 0) return { is: 'notApplicable' };
  if (mine.some((a) => a.necessity === 'always')) return { is: 'required' };
  const conds = mine.filter((a) => a.necessity === 'conditional' && a.condition);
  if (conds.some((a) => facts[a.condition!] === true)) return { is: 'required' };
  const unknown = conds.find((a) => facts[a.condition!] === undefined);
  if (unknown) return { is: 'undetermined', condition: unknown.condition! };
  if (conds.length > 0 && conds.length === mine.length) return { is: 'notApplicable' };
  return { is: 'optional' };
}

/**
 * What Module 1 requires of one application, given what is known.
 *
 * `required`: always required for the kind, or conditional on a fact that holds.
 * `undetermined`: conditional on a fact nobody has stated — a gap to resolve,
 * never "not required". `notApplicable`: the heading does not apply to the kind,
 * or its condition is known to be false (with its subtree). A heading filed only
 * when applicable, or at the authority's request, is in none of the three.
 */
export function requiredModule1(
  j: ModeledJurisdiction,
  kind: ApplicationKind,
  facts: FactMap = {},
): { required: string[]; undetermined: Array<{ code: string; condition: ConditionId }>; notApplicable: string[] } {
  const required: string[] = [];
  const undetermined: Array<{ code: string; condition: ConditionId }> = [];
  const notApplicable: string[] = [];
  if (!REGIONAL_MODULE1[j].kinds.includes(kind)) return { required, undetermined, notApplicable };
  const excludeSubtree = (n: RegionalHeading): void => {
    notApplicable.push(n.number);
    for (const c of n.childSections ?? []) excludeSubtree(c);
  };
  walk(moduleOneTree(j), (n) => {
    const s = standing(n, kind, facts);
    if (s.is === 'notApplicable') {
      excludeSubtree(n);
      return false;
    }
    if (s.is === 'required') required.push(n.number);
    else if (s.is === 'undetermined') undetermined.push({ code: n.number, condition: s.condition });
    return true;
  });
  return { required, undetermined, notApplicable };
}

/**
 * The tree for one application as rows in CTD order. `required` is true only
 * where the heading is always required for the kind; a conditional heading
 * whose fact is unknown carries `undetermined` with its condition.
 */
export function module1Rows(
  j: ModeledJurisdiction,
  kind: ApplicationKind,
): Array<{ code: string; title: string; required: boolean; undetermined?: ConditionId }> {
  const { required, undetermined } = requiredModule1(j, kind);
  const req = new Set(required);
  const und = new Map(undetermined.map((u) => [u.code, u.condition]));
  return flattenModule1(j, kind)
    .map((n) => {
      const row: { code: string; title: string; required: boolean; undetermined?: ConditionId } = { code: n.number, title: n.title, required: req.has(n.number) };
      const cond = und.get(n.number);
      if (cond) row.undetermined = cond;
      return row;
    })
    .sort((a, b) => compareSectionCode(a.code, b.code));
}

/** The headings of one tree that hold a document with this role (for `kind`, when given). */
export function placementFor(role: DocumentRole, j: ModeledJurisdiction, kind?: ApplicationKind): RegionalHeading[] {
  return flattenModule1(j, kind).filter((n) => n.roles?.includes(role));
}

/**
 * The headings in the other modelled trees that hold the same document as
 * `code` in `j` — derived from shared roles, so it cannot drift from placement.
 * A heading with no role claims no equivalent.
 */
export function equivalentsOf(
  j: ModeledJurisdiction,
  code: string,
): Array<{ jurisdiction: ModeledJurisdiction; code: string; title: string }> {
  const roles = module1Heading(j, code)?.roles ?? [];
  const out: Array<{ jurisdiction: ModeledJurisdiction; code: string; title: string }> = [];
  for (const other of MODELED_JURISDICTIONS) {
    if (other === j) continue;
    for (const n of flattenModule1(other)) {
      if (n.roles?.some((r) => roles.includes(r)) && !out.some((o) => o.jurisdiction === other && o.code === n.number)) {
        out.push({ jurisdiction: other, code: n.number, title: n.title });
      }
    }
  }
  return out;
}
