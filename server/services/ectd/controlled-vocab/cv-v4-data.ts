/**
 * FDA eCTD v4.0 (HL7 RPS) controlled vocabularies — GENERATED DATA.
 *
 * Source: FDA Module 1 eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06),
 * OASIS genericode files (CL1–CL13 + status/telecom lists). Only ACTIVE codes are
 * retained. Regenerate from the genericode package when FDA publishes a new CV
 * version; do not hand-edit individual rows.
 *
 * @module server/services/ectd/controlled-vocab/cv-v4-data
 */

export interface CvCodeRow {
  /** genericode 'code' column — the value carried in @code. */
  code: string;
  /** human-readable description. */
  description: string;
}

export interface CvCodeList {
  /** semantic key, e.g. 'applicationType'. */
  id: string;
  /** genericode ShortName. */
  shortName: string;
  /** HL7 codeSystem OID ('na' when the list is not OID-governed). */
  oid: string;
  codes: CvCodeRow[];
}

/** usfda-application-type — 9 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.1.4 */
export const CV_APPLICATION_TYPE: CvCodeList = {
  id: 'applicationType',
  shortName: 'usfda-application-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.1.4',
  codes: [
    { code: 'us_application_type_1', description: 'New Drug Application (NDA)' },
    { code: 'us_application_type_2', description: 'Abbreviated New Drug Application (ANDA)' },
    { code: 'us_application_type_3', description: 'Biologic License Application (BLA)' },
    { code: 'us_application_type_4', description: 'Investigational New Drug (IND)' },
    { code: 'us_application_type_5', description: 'Drug Master File (MF)' },
    { code: 'us_application_type_6', description: 'Emergency Use Authorization (EUA)' },
    { code: 'us_application_type_7', description: 'Investigational Device Exemption (IDE)' },
    { code: 'us_application_type_9', description: 'Premarket Approval Application (PMA)' },
    { code: 'us_application_type_10', description: 'Premarket Notification 510k (510K)' },
  ],
};

/** us-submission-type — 11 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.12.5 */
export const CV_SUBMISSION_TYPE: CvCodeList = {
  id: 'submissionType',
  shortName: 'us-submission-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.12.5',
  codes: [
    { code: 'us_submission_type_1', description: 'Original Application' },
    { code: 'us_submission_type_2', description: 'Efficacy Supplement' },
    { code: 'us_submission_type_3', description: 'Chemistry Manufacturing Controls Supplement' },
    { code: 'us_submission_type_4', description: 'Labeling Supplement' },
    { code: 'us_submission_type_5', description: 'Annual Report' },
    { code: 'us_submission_type_6', description: 'Product Correspondence' },
    { code: 'us_submission_type_7', description: 'Postmarketing Requirements or Postmarketing Commitments' },
    { code: 'us_submission_type_8', description: 'Promotional Labeling Advertising' },
    { code: 'us_submission_type_9', description: 'IND Safety Reports' },
    { code: 'us_submission_type_10', description: 'Periodic Safety Reports' },
    { code: 'us_submission_type_11', description: 'REMS Supplement' },
  ],
};

/** us-submission-unit-type — 7 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.13.2 */
export const CV_SUBMISSION_UNIT_TYPE: CvCodeList = {
  id: 'submissionUnitType',
  shortName: 'us-submission-unit-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.13.2',
  codes: [
    { code: 'us_submission_unit_type_1', description: 'Original' },
    { code: 'us_submission_unit_type_2', description: 'Presubmission' },
    { code: 'us_submission_unit_type_3', description: 'Application' },
    { code: 'us_submission_unit_type_4', description: 'Amendment' },
    { code: 'us_submission_unit_type_5', description: 'Resubmission' },
    { code: 'us_submission_unit_type_6', description: 'Report' },
    { code: 'us_submission_unit_type_7', description: 'Correspondence' },
  ],
};

/** us-context-of-use — 124 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.2.6 */
export const CV_CONTEXT_OF_USE: CvCodeList = {
  id: 'contextOfUse',
  shortName: 'us-context-of-use',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6',
  codes: [
    { code: 'us_1.1', description: 'm1.1 forms' },
    { code: 'us_1.2', description: 'm1.2 cover letters' },
    { code: 'us_1.3.1.1', description: 'm1.3.1.1 change of address or corporate name' },
    { code: 'us_1.3.1.2', description: 'm1.3.1.2 change in contact agent' },
    { code: 'us_1.3.1.3', description: 'm1.3.1.3 change in sponsor' },
    { code: 'us_1.3.1.4', description: 'm1.3.1.4 transfer of obligation' },
    { code: 'us_1.3.1.5', description: 'm1.3.1.5 change in ownership of an application or reissuance of license' },
    { code: 'us_1.3.2', description: 'm1.3.2 field copy certification' },
    { code: 'us_1.3.3', description: 'm1.3.3 debarment certification' },
    { code: 'us_1.3.4', description: 'm1.3.4 financial certification and disclosure' },
    { code: 'us_1.3.5.1', description: 'm1.3.5.1 patent information' },
    { code: 'us_1.3.5.2', description: 'm1.3.5.2 patent certification' },
    { code: 'us_1.3.5.3', description: 'm1.3.5.3 exclusivity claim' },
    { code: 'us_1.3.6', description: 'm1.3.6 tropical disease priority review voucher' },
    { code: 'us_1.4.1', description: 'm1.4.1 letter of authorization' },
    { code: 'us_1.4.2', description: 'm1.4.2 statement of right of reference' },
    { code: 'us_1.4.3', description: 'm1.4.3 list of authorized persons to incorporate by reference' },
    { code: 'us_1.4.4', description: 'm1.4.4 cross reference to previously submitted information' },
    { code: 'us_1.5.1', description: 'm1.5.1 withdrawal of an ind' },
    { code: 'us_1.5.2', description: 'm1.5.2 inactivation request' },
    { code: 'us_1.5.3', description: 'm1.5.3 reactivation request' },
    { code: 'us_1.5.4', description: 'm1.5.4 reinstatement request' },
    { code: 'us_1.5.5', description: 'm1.5.5 withdrawal of an unapproved bla nda anda or supplement' },
    { code: 'us_1.5.6', description: 'm1.5.6 withdrawal of listed drug' },
    { code: 'us_1.5.7', description: 'm1.5.7 withdrawal of approval of an application or revocation of license' },
    { code: 'us_1.6.1', description: 'm1.6.1 meeting request' },
    { code: 'us_1.6.2', description: 'm1.6.2 meeting background materials' },
    { code: 'us_1.6.3', description: 'm1.6.3 correspondence regarding meetings' },
    { code: 'us_1.7.1', description: 'm1.7.1 fast track designation request' },
    { code: 'us_1.7.2', description: 'm1.7.2 fast track designation withdrawal request' },
    { code: 'us_1.7.3', description: 'm1.7.3 rolling review request' },
    { code: 'us_1.7.4', description: 'm1.7.4 correspondence regarding fast track rolling review' },
    { code: 'us_1.8.1', description: 'm1.8.1 clinical study' },
    { code: 'us_1.8.2', description: 'm1.8.2 carcinogenicity study' },
    { code: 'us_1.8.3', description: 'm1.8.3 stability study' },
    { code: 'us_1.8.4', description: 'm1.8.4 animal efficacy study for approval under the animal rule' },
    { code: 'us_1.9.1', description: 'm1.9.1 request for waiver of pediatric studies' },
    { code: 'us_1.9.2', description: 'm1.9.2 request for deferral of pediatric studies' },
    { code: 'us_1.9.3', description: 'm1.9.3 request for pediatric exclusivity determination' },
    { code: 'us_1.9.4', description: 'm1.9.4 proposed pediatric study request and amendments' },
    { code: 'us_1.9.6', description: 'm1.9.6 other correspondence regarding pediatric exclusivity or study plans' },
    { code: 'us_1.10.1', description: 'm1.10.1 request for dispute resolution' },
    { code: 'us_1.10.2', description: 'm1.10.2 correspondence related to dispute resolution' },
    { code: 'us_1.11.1', description: 'm1.11.1 quality information amendment' },
    { code: 'us_1.11.2', description: 'm1.11.2 nonclinical information amendment' },
    { code: 'us_1.11.3', description: 'm1.11.3 clinical information amendment' },
    { code: 'us_1.11.4', description: 'm1.11.4 multiple module information amendment' },
    { code: 'us_1.12.1', description: 'm1.12.1 pre ind correspondence' },
    { code: 'us_1.12.2', description: 'm1.12.2 request to charge for clinical trial' },
    { code: 'us_1.12.3', description: 'm1.12.3 request to charge for expanded access' },
    { code: 'us_1.12.4', description: 'm1.12.4 request for comments and advice' },
    { code: 'us_1.12.5', description: 'm1.12.5 request for a waiver' },
    { code: 'us_1.12.6', description: 'm1.12.6 exception from informed consent for emergency research' },
    { code: 'us_1.12.7', description: 'm1.12.7 public disclosure statement for exception from informed consent for emergency research' },
    { code: 'us_1.12.8', description: 'm1.12.8 correspondence regarding exception from informed consent for emergency research' },
    { code: 'us_1.12.9', description: 'm1.12.9 notification of discontinuation of clinical trial' },
    { code: 'us_1.12.10', description: 'm1.12.10 generic drug enforcement act statement' },
    { code: 'us_1.12.11', description: 'm1.12.11 anda basis for submission statement' },
    { code: 'us_1.12.12', description: 'm1.12.12 comparison of generic drug and reference listed drug' },
    { code: 'us_1.12.13', description: 'm1.12.13 request for waiver for in vivo studies' },
    { code: 'us_1.12.14', description: 'm1.12.14 environmental analysis' },
    { code: 'us_1.12.15', description: 'm1.12.15 request for waiver of in vivo bioavailability studies' },
    { code: 'us_1.12.16', description: 'm1.12.16 field alert reports' },
    { code: 'us_1.12.17', description: 'm1.12.17 orphan drug designation' },
    { code: 'us_1.12.18', description: 'm1.12.18 regenerative medicine advanced therapy (rmat) designation' },
    { code: 'us_1.13.1', description: 'm1.13.1 summary for nonclinical studies' },
    { code: 'us_1.13.2', description: 'm1.13.2 summary of clinical pharmacology information' },
    { code: 'us_1.13.3', description: 'm1.13.3 summary of safety information' },
    { code: 'us_1.13.4', description: 'm1.13.4 summary of labeling changes' },
    { code: 'us_1.13.5', description: 'm1.13.5 summary of manufacturing changes' },
    { code: 'us_1.13.6', description: 'm1.13.6 summary of microbiological changes' },
    { code: 'us_1.13.7', description: 'm1.13.7 summary of other significant new information' },
    { code: 'us_1.13.8', description: 'm1.13.8 individual study information' },
    { code: 'us_1.13.9', description: 'm1.13.9 general investigational plan' },
    { code: 'us_1.13.10', description: 'm1.13.10 foreign marketing' },
    { code: 'us_1.13.11', description: 'm1.13.11 distribution data' },
    { code: 'us_1.13.12', description: 'm1.13.12 status of postmarketing study commitments and requirements' },
    { code: 'us_1.13.13', description: 'm1.13.13 status of other postmarketing studies and requirements' },
    { code: 'us_1.13.14', description: 'm1.13.14 log of outstanding regulatory business' },
    { code: 'us_1.13.15', description: 'm1.13.15 development safety update report (DSUR)' },
    { code: 'us_1.14.1.1', description: 'm1.14.1.1 draft carton and container labels' },
    { code: 'us_1.14.1.2', description: 'm1.14.1.2 annotated draft labeling text' },
    { code: 'us_1.14.1.3', description: 'm1.14.1.3 draft labeling text' },
    { code: 'us_1.14.1.4', description: 'm1.14.1.4 label comprehension studies' },
    { code: 'us_1.14.1.5', description: 'm1.14.1.5 labeling history' },
    { code: 'us_1.14.2.1', description: 'm1.14.2.1 final carton or container labels' },
    { code: 'us_1.14.2.2', description: 'm1.14.2.2 final package insert (package inserts patient information medication guides)' },
    { code: 'us_1.14.2.3', description: 'm1.14.2.3 final labeling text' },
    { code: 'us_1.14.3.1', description: 'm1.14.3.1 annotated comparison with listed drug' },
    { code: 'us_1.14.3.2', description: 'm1.14.3.2 approved labeling text for listed drug' },
    { code: 'us_1.14.3.3', description: 'm1.14.3.3 labeling text for reference listed drug' },
    { code: 'us_1.14.4.1', description: 'm1.14.4.1 investigational brochure' },
    { code: 'us_1.14.4.2', description: 'm1.14.4.2 investigational drug labeling' },
    { code: 'us_1.14.5', description: 'm1.14.5 foreign labeling' },
    { code: 'us_1.14.6', description: 'm1.14.6 product labeling for 2253 submissions' },
    { code: 'us_1.15.1.1', description: 'm1.15.1.1 request for advisory comments on launch materials' },
    { code: 'us_1.15.1.2', description: 'm1.15.1.2 request for advisory comments on non launch materials' },
    { code: 'us_1.15.1.3', description: 'm1.15.1.3 pre submission of launch promotional materials for accelerated approval products' },
    { code: 'us_1.15.1.4', description: 'm1.15.1.4 pre submission of non launch promotional materials for accelerated approval products' },
    { code: 'us_1.15.1.5', description: 'm1.15.1.5 pre dissemination review of televisions ads' },
    { code: 'us_1.15.1.6', description: 'm1.15.1.6 response to untitled letter or warning letter' },
    { code: 'us_1.15.1.7', description: 'm1.15.1.7 response to information request' },
    { code: 'us_1.15.1.8', description: 'm1.15.1.8 correspondence accompanying materials previously missing or rejected' },
    { code: 'us_1.15.1.9', description: 'm1.15.1.9 withdrawal request' },
    { code: 'us_1.15.1.10', description: 'm1.15.1.10 submission of annotated references' },
    { code: 'us_1.15.1.11', description: 'm1.15.1.11 general correspondence' },
    { code: 'us_1.15.2.1.1', description: 'm1.15.2.1.1 clean version' },
    { code: 'us_1.15.2.1.2', description: 'm1.15.2.1.2 annotated version' },
    { code: 'us_1.15.2.1.3', description: 'm1.15.2.1.3 annotated labeling version' },
    { code: 'us_1.15.2.1.4', description: 'm1.15.2.1.4 annotated references' },
    { code: 'us_1.16.1', description: 'm1.16.1 risk management (Non-REMS)' },
    { code: 'us_1.16.2.1', description: 'm1.16.2.1 final rems' },
    { code: 'us_1.16.2.2', description: 'm1.16.2.2 draft rems' },
    { code: 'us_1.16.2.3', description: 'm1.16.2.3 rems assessment' },
    { code: 'us_1.16.2.4', description: 'm1.16.2.4 rems assessment methodology' },
    { code: 'us_1.16.2.5', description: 'm1.16.2.5 rems correspondence' },
    { code: 'us_1.16.2.6', description: 'm1.16.2.6 rems modification history' },
    { code: 'us_1.17.1', description: 'm1.17.1 correspondence regarding postmarketing commitments' },
    { code: 'us_1.17.2', description: 'm1.17.2 correspondence regarding postmarketing requirements' },
    { code: 'us_1.18', description: 'm1.18.1 naming' },
    { code: 'us_1.18.1', description: 'm1.18.1 proprietary name' },
    { code: 'us_1.18.2', description: 'm1.18.2 biological proper name suffix' },
    { code: 'us_1.19', description: 'm1.19 pre eua and eua' },
    { code: 'us_1.20', description: 'm1.20 general investigational plan for initial ind' },
  ],
};

/** us-form-type — 11 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.5.6 */
export const CV_FORM_TYPE: CvCodeList = {
  id: 'formType',
  shortName: 'us-form-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.5.6',
  codes: [
    { code: 'us_form_type_1', description: 'Form FDA 1571: Investigational New Drug Application (IND)' },
    { code: 'us_form_type_2', description: 'Form FDA 356h: Application to Market a New Drug, Biologic, or an Antibiotic Drug for Human Use' },
    { code: 'us_form_type_3', description: 'Form FDA 3397: User Fee Cover Sheet' },
    { code: 'us_form_type_4', description: 'Form FDA 2252: Transmittal of Annual Reports for Drugs and Biologics for Human Use' },
    { code: 'us_form_type_5', description: 'Form FDA 2253: Transmittal of Advertisements and Promotional Labeling for Drugs and Biologics for Human Use' },
    { code: 'us_form_type_6', description: 'Form FDA 2567: Transmittal of Labels and Circulars' },
    { code: 'us_form_type_7', description: 'Form FDA 3674: Certification of Compliance' },
    { code: 'us_form_type_8', description: 'Form FDA 3792: Biosimilar User Fee Cover Sheet (BsUFA)' },
    { code: 'us_form_type_9', description: 'Form FDA 3794: Generic Drug User Fee Cover Sheet (GDUFA)' },
    { code: 'us_form_type_10', description: 'Form FDA 3988: Transmittal of PMR/PMC Submissions for Drugs and Biologics' },
    { code: 'us_form_type_11', description: 'Form FDA 3938: Drug Master File' },
  ],
};

/** us-cou-keyword-definition-type — 2 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.3.3 */
export const CV_COU_KEYWORD_DEFINITION_TYPE: CvCodeList = {
  id: 'couKeywordDefinitionType',
  shortName: 'us-cou-keyword-definition-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.3.3',
  codes: [
    { code: 'us_keyword_definition_type_1', description: 'material-id' },
    { code: 'us_keyword_definition_type_2', description: 'issue-date' },
  ],
};

/** us-promotional-document-type — 6 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.6.2 */
export const CV_PROMOTIONAL_DOCUMENT_TYPE: CvCodeList = {
  id: 'promotionalDocumentType',
  shortName: 'us-promotional-document-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.6.2',
  codes: [
    { code: 'us_promo_document_type_1', description: 'Promotional 2253' },
    { code: 'us_promo_document_type_2', description: 'Request For Advisory Launch' },
    { code: 'us_promo_document_type_3', description: 'Request For Advisory Non-Launch' },
    { code: 'us_promo_document_type_4', description: 'Presubmission Accelerated Launch' },
    { code: 'us_promo_document_type_5', description: 'Presubmission Accelerated Non-launch' },
    { code: 'us_promo_document_type_6', description: 'Pre-Dissemination Review of Television Ads' },
  ],
};

/** us-promotional-material-audience-type — 2 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.7.2 */
export const CV_PROMOTIONAL_MATERIAL_AUDIENCE_TYPE: CvCodeList = {
  id: 'promotionalMaterialAudienceType',
  shortName: 'us-promotional-material-audience-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.7.2',
  codes: [
    { code: 'us_promo_material_audience_type_1', description: 'Consumer' },
    { code: 'us_promo_material_audience_type_2', description: 'Professional' },
  ],
};

/** us-promotional-material-type — 47 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.8.3 */
export const CV_PROMOTIONAL_MATERIAL_TYPE: CvCodeList = {
  id: 'promotionalMaterialType',
  shortName: 'us-promotional-material-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.8.3',
  codes: [
    { code: 'us_promo_material_type_1', description: 'Audio' },
    { code: 'us_promo_material_type_2', description: 'Book' },
    { code: 'us_promo_material_type_3', description: 'Carrier' },
    { code: 'us_promo_material_type_4', description: 'Carton' },
    { code: 'us_promo_material_type_5', description: 'Catalog' },
    { code: 'us_promo_material_type_6', description: 'CD-ROM' },
    { code: 'us_promo_material_type_7', description: 'Direct Mail' },
    { code: 'us_promo_material_type_8', description: 'Drug Sample' },
    { code: 'us_promo_material_type_9', description: 'Exhibit' },
    { code: 'us_promo_material_type_10', description: 'File Card' },
    { code: 'us_promo_material_type_11', description: 'Formulary Economic' },
    { code: 'us_promo_material_type_12', description: 'Formulary Kit' },
    { code: 'us_promo_material_type_13', description: 'Giveaway' },
    { code: 'us_promo_material_type_14', description: 'House Organ' },
    { code: 'us_promo_material_type_15', description: 'Kit' },
    { code: 'us_promo_material_type_16', description: 'Monograph' },
    { code: 'us_promo_material_type_17', description: 'Other' },
    { code: 'us_promo_material_type_18', description: 'Press Release' },
    { code: 'us_promo_material_type_19', description: 'Print Ad' },
    { code: 'us_promo_material_type_20', description: 'Print Other' },
    { code: 'us_promo_material_type_21', description: 'Promotional Labeling' },
    { code: 'us_promo_material_type_22', description: 'Radio' },
    { code: 'us_promo_material_type_23', description: 'Reply Card' },
    { code: 'us_promo_material_type_24', description: 'Reprint' },
    { code: 'us_promo_material_type_25', description: 'Sales Aid' },
    { code: 'us_promo_material_type_26', description: 'Slides' },
    { code: 'us_promo_material_type_27', description: 'Telephone' },
    { code: 'us_promo_material_type_28', description: 'TV' },
    { code: 'us_promo_material_type_29', description: 'Video News Release' },
    { code: 'us_promo_material_type_30', description: 'Video' },
    { code: 'us_promo_material_type_31', description: 'www-banner' },
    { code: 'us_promo_material_type_32', description: 'www-ecomm' },
    { code: 'us_promo_material_type_33', description: 'www-links' },
    { code: 'us_promo_material_type_34', description: 'www-other' },
    { code: 'us_promo_material_type_35', description: 'www-soc-med' },
    { code: 'us_promo_material_type_36', description: 'www-website' },
    { code: 'us_promo_material_type_37', description: 'www-video' },
    { code: 'us_promo_material_type_38', description: 'www-mobile' },
    { code: 'us_promo_material_type_39', description: 'Corrective Internet' },
    { code: 'us_promo_material_type_40', description: 'Corrective Letter' },
    { code: 'us_promo_material_type_41', description: 'Corrective Print Ad' },
    { code: 'us_promo_material_type_42', description: 'Corrective TV' },
    { code: 'us_promo_material_type_43', description: 'Electronic Detail Aid' },
    { code: 'us_promo_material_type_44', description: 'Form' },
    { code: 'us_promo_material_type_45', description: 'Training Materials' },
    { code: 'us_promo_material_type_46', description: 'www-audio' },
    { code: 'us_promo_material_type_47', description: 'PDURS' },
  ],
};

/** us-submission-contact-type — 4 active codes. OID: 2.16.840.1.113883.3.989.5.1.2.2.1.11.3 */
export const CV_SUBMISSION_CONTACT_TYPE: CvCodeList = {
  id: 'submissionContactType',
  shortName: 'us-submission-contact-type',
  oid: '2.16.840.1.113883.3.989.5.1.2.2.1.11.3',
  codes: [
    { code: 'us_submission_contact_type_1', description: 'Regulatory Contact' },
    { code: 'us_submission_contact_type_2', description: 'Technical Contact' },
    { code: 'us_submission_contact_type_3', description: 'United States Agent' },
    { code: 'us_submission_contact_type_4', description: 'Promotional Labeling and Advertising Regulatory Contact' },
  ],
};

/** us-submission-contact-status — 2 active codes. OID: na */
export const CV_SUBMISSION_CONTACT_STATUS: CvCodeList = {
  id: 'submissionContactStatus',
  shortName: 'us-submission-contact-status',
  oid: 'na',
  codes: [
    { code: 'active', description: 'RoleStatusActive' },
    { code: 'suspended', description: 'RoleStatusSuspended' },
  ],
};

/** us-submission-unit-status — 1 active codes. OID: na */
export const CV_SUBMISSION_UNIT_STATUS: CvCodeList = {
  id: 'submissionUnitStatus',
  shortName: 'us-submission-unit-status',
  oid: 'na',
  codes: [
    { code: 'active', description: 'ActStatusActive' },
  ],
};

/** us-telecom-use — 2 active codes. OID: na */
export const CV_TELECOM_USE: CvCodeList = {
  id: 'telecomUse',
  shortName: 'us-telecom-use',
  oid: 'na',
  codes: [
    { code: 'WP', description: 'work place' },
    { code: 'MC', description: 'mobile contact' },
  ],
};

/** us-telecom-capabilities — 2 active codes. OID: na */
export const CV_TELECOM_CAPABILITIES: CvCodeList = {
  id: 'telecomCapabilities',
  shortName: 'us-telecom-capabilities',
  oid: 'na',
  codes: [
    { code: 'voice', description: 'phone number' },
    { code: 'fax', description: 'fax number' },
  ],
};

/** All FDA v4.0 controlled vocabularies keyed by semantic id. */
export const V4_CODE_LISTS: Record<string, CvCodeList> = {
  applicationType: CV_APPLICATION_TYPE,
  submissionType: CV_SUBMISSION_TYPE,
  submissionUnitType: CV_SUBMISSION_UNIT_TYPE,
  contextOfUse: CV_CONTEXT_OF_USE,
  formType: CV_FORM_TYPE,
  couKeywordDefinitionType: CV_COU_KEYWORD_DEFINITION_TYPE,
  promotionalDocumentType: CV_PROMOTIONAL_DOCUMENT_TYPE,
  promotionalMaterialAudienceType: CV_PROMOTIONAL_MATERIAL_AUDIENCE_TYPE,
  promotionalMaterialType: CV_PROMOTIONAL_MATERIAL_TYPE,
  submissionContactType: CV_SUBMISSION_CONTACT_TYPE,
  submissionContactStatus: CV_SUBMISSION_CONTACT_STATUS,
  submissionUnitStatus: CV_SUBMISSION_UNIT_STATUS,
  telecomUse: CV_TELECOM_USE,
  telecomCapabilities: CV_TELECOM_CAPABILITIES,
};

/** FDA eCTD v4.0 Regional Implementation Guide OID (message-header code system). */
export const FDA_REGIONAL_IG_OID = '2.16.840.1.113883.3.989.5.1.2.2.1.18.8';

/** Center-specific Application Id root OIDs (id@root for ApplicationReference). */
export const FDA_APPLICATION_ID_OID = {
  cber: '2.16.840.1.113883.3.989.5.1.2.2.1.15.1',
  cder: '2.16.840.1.113883.3.989.5.1.2.2.1.16.1',
  cdrh: '2.16.840.1.113883.3.989.5.1.2.2.1.17.1',
} as const;

/** ICH eCTD v4.0 Implementation Guide OID (the ICH backbone code system). */
export const ICH_ECTD_V4_IG_OID = '2.16.840.1.113883.3.989.5.1.2.1';
