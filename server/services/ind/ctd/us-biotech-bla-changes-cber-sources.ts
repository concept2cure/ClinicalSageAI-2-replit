/**
 * Canonical lifecycle source records for licensed-biologic changes and the
 * CBER-specific filings in the contract (docs/design/
 * US_BIOTECH_FILING_COMPLETION_2026-10-27.md, interfaces items 1-2): the BLA
 * prior approval supplement, CBE-30 and CBE-0 under 21 CFR 601.12, the CBER
 * biologics master file, lot release protocols and samples under 21 CFR 610.2,
 * and the FD&C Act section 564 emergency use authorization request for a drug
 * or biologic (the device EUA stays the separate US_EUA identity).
 *
 * What already exists, and why these are separate records: `nda_pas`, `cbe_30`
 * and `cbe_0` in lifecycle-document-types.ts follow 21 CFR 314.70, and the
 * outline map (market-specs/lifecycle-record-outlines.ts) gives US_BLA_SUPP the
 * NDA PAS record. post-approval-knowledge.ts already classifies a biologic change
 * into 601.12(b), (c)(1), (c)(5) or (d); these records are the documents that
 * classification leads to, not a second classifier. The CBER master file follows
 * the existing US_DMF identity's practice; Form FDA 356h is the form the existing
 * forms engine (ind-forms/*) already fills, so it is named, never re-modelled.
 *
 * Confidence: every basis is `recall`. www.ecfr.gov and fda.gov were not
 * reachable from this session (proxy CONNECT refused, 2026-10-29), so no section
 * was re-read; each citation says so. Guidance titles and dates are from
 * knowledge and carry the same mark. No review clock is stated for a PAS or an
 * EUA request: neither has one in regulation.
 *
 * AnA eligibility follows the existing projection rule
 * (market-specs/us-biotech-lifecycle-templates.ts): `table`/`form`/`data`
 * components are manual/source-controlled. No component here is `mixed`.
 *
 * @module server/services/ind/ctd/us-biotech-bla-changes-cber-sources
 */
import type { CtdContentType, LifecycleComponent, LifecycleDocumentType } from './types.js';

/** Lifecycle ids and the registry ids they serve. US_BLA_SUPP already exists. */
export const US_BLA_CHANGES_CBER_SOURCE_IDS = {
  pas: { id: 'us_bla_pas', registryId: 'US_BLA_SUPP' },
  cbe30: { id: 'us_bla_cbe_30', registryId: 'US_BLA_CBE30' },
  cbe0: { id: 'us_bla_cbe_0', registryId: 'US_BLA_CBE0' },
  masterFile: { id: 'us_cber_master_file', registryId: 'US_CBER_MASTER_FILE' },
  lotRelease: { id: 'us_cber_lot_release', registryId: 'US_CBER_LOT_RELEASE' },
  eua: { id: 'us_eua_therapeutic', registryId: 'US_EUA_THERAPEUTIC' },
} as const;

const NOT_REREAD = 'recall: not re-read on eCFR for this record';

/** A 21 CFR citation string carrying its confidence mark. */
const cfr = (section: string, what: string): string => `21 CFR ${section} (${what}) (${NOT_REREAD})`;
/** An FD&C Act citation string carrying its confidence mark. */
const act = (section: string, what: string): string =>
  `FD&C Act section ${section} (${what}) (recall: not re-read for this record)`;
/** A named FDA guidance or page citation carrying its confidence mark. */
const guidance = (title: string, date: string): string =>
  `FDA guidance: ${title} (${date}) (recall: title and date not re-read on fda.gov)`;

const MANUAL_NOTE = 'Prepared from the controlled source record; AnA does not generate or replace it.';

interface PartSpec {
  code: string;
  title: string;
  contentType: CtdContentType;
  basis: string;
  authoring: string;
  elements: string[];
  prompt?: string;
  required?: boolean;
}

/** One component with its basis written into the governing reference. */
function part(spec: PartSpec): LifecycleComponent {
  const manual = spec.contentType === 'form' || spec.contentType === 'data' || spec.contentType === 'table';
  return {
    code: spec.code, title: spec.title, required: spec.required ?? true, contentType: spec.contentType,
    guidance: `Basis: ${spec.basis}.`,
    authoringGuidance: manual ? `${spec.authoring} ${MANUAL_NOTE}` : spec.authoring,
    keyContentElements: spec.elements,
    generationPrompt: manual ? 'Not drafted: populate from the controlled source record.' : (spec.prompt ?? ''),
  };
}

// ── 21 CFR 601.12 supplements ────────────────────────────────────────────────
const S_6012A = cfr('601.12(a)', 'general: notify FDA of each change in the product, production process, quality controls, equipment, facilities or responsible personnel; assess the effects before distribution');
const S_6012B = cfr('601.12(b)', 'changes requiring supplement submission and approval prior to distribution (major changes)');
const S_6012B3 = cfr('601.12(b)(3)', 'contents of a supplement: detailed description of the change, products involved, sites or areas affected, methods and studies to evaluate the effect, data, validation protocols and data, and SOPs');
const S_6012C1 = cfr('601.12(c)(1)', 'moderate changes: supplement submitted at least 30 days prior to distribution of product made using the change');
const S_6012C = cfr('601.12(c)', 'changes requiring supplement submission at least 30 days prior to distribution; supplement content and labeling of the submission');
const S_6012C5 = cfr('601.12(c)(5)', 'categories of moderate change FDA designates for which distribution may begin upon FDA receipt of the supplement');
const S_6012E = cfr('601.12(e)', 'comparability protocols');
const S_6012F1 = cfr('601.12(f)(1)', 'labeling changes requiring prior approval');
const S_6012F2 = cfr('601.12(f)(2)', 'labeling changes that may be implemented upon FDA receipt of a Changes Being Effected supplement');
const FORM_356H = cfr('601.2(a)', 'application submitted on the forms FDA prescribes; Form FDA 356h is the prescribed application form, also used for a supplement (the regulation does not name the form number)');
const BIO_CHANGES_1997 = guidance('Changes to an Approved Application for Specified Biotechnology and Specified Synthetic Biological Products', 'July 1997');
const BIO_CMC_2021 = guidance('Chemistry, Manufacturing, and Controls Changes to an Approved Application: Certain Biological Products', 'draft, June 2021');
const Q5E = guidance('ICH Q5E Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process', 'June 2005');

/**
 * The CTD sections a 601.12 manufacturing or labeling change updates, as the NDA
 * PAS/CBE records name theirs (added at integration, 2026-10-29): 1.2 the cover
 * letter, 1.3 administrative information, 1.14.1 the labeling, 2.3 the QOS and
 * the Module 3 sections. They name WHERE the change's content files; which of
 * them a given change updates is the filer's. ICH M4Q placement; FDA eCTD M1 v2.3.
 */
const BLA_CHANGE_CTD_CODES = ['1.2', '1.3', '1.14.1', '2.3', '3.2.S', '3.2.P', '3.2.A', '3.2.R'];

interface SupplementSpec {
  prefix: string;
  label: string;
  basis: string;
  timingBasis: string;
}

/** The components every 601.12 supplement shares, worded for its category. */
function supplementParts(s: SupplementSpec): LifecycleComponent[] {
  return [
    part({
      code: `${s.prefix}.cover`, title: 'Cover Letter', contentType: 'narrative', basis: `${s.basis}; ${S_6012B3}`,
      authoring: `Identify the BLA (STN), the product's proper name and the submission as "${s.label}", and justify the reporting category against 601.12 and the applicable guidance. A change with more potential for an adverse effect than this category allows is submitted in the higher category.`,
      elements: [`Submission labeled "${s.label}"`, 'BLA STN, proper and proprietary names', 'Summary of the change', 'Reporting-category rationale with its guidance citation', 'Intended distribution date, where the category allows one', 'Applicant contact'],
      prompt: `Draft the cover letter for {{SPONSOR}}'s ${s.label} to the BLA for {{PRODUCT_NAME}} (21 CFR 601.12): STN, the change summarized from the change-control record, and the reporting-category rationale. Use bracketed placeholders for the STN, numbers and dates; do not state a date the records do not give.`,
    }),
    part({
      code: `${s.prefix}.356h`, title: 'Form FDA 356h', contentType: 'form', basis: FORM_356H,
      authoring: 'Complete the official Form FDA 356h with "Supplement" marked and each establishment identified, through the forms registry and its original-asset review gate.',
      elements: ['Completed Form FDA 356h, supplement marked', 'Establishments implementing the change'],
    }),
    part({
      code: `${s.prefix}.description`, title: 'Detailed Description of the Change, Products and Sites Involved', contentType: 'narrative', basis: S_6012B3,
      authoring: 'Describe the change in detail, the products involved and the manufacturing site(s) or area(s) affected, and the methods used and studies performed to evaluate its effect on identity, strength, quality, purity and potency.',
      elements: ['Detailed description of the change', 'Products involved', 'Manufacturing site(s) or area(s) affected', 'Methods used and studies performed to evaluate the effect', 'Comparability conclusion and its basis'],
      prompt: 'Draft the detailed description of the change for {{PRODUCT_NAME}} (21 CFR 601.12(b)(3)) from the change-control and comparability records: the change, products, sites or areas affected, and the methods and studies that evaluated its effect. Do not state a result or conclusion the records do not contain.',
    }),
    part({
      code: `${s.prefix}.data`, title: 'Data From the Studies Evaluating the Change', contentType: 'data', basis: `${S_6012B3}; ${Q5E}`,
      authoring: 'Attach the data derived from the studies and tests performed to evaluate the change, including comparability and stability data.',
      elements: ['Pre- and post-change comparability results', 'Stability data where applicable', 'Reference to each controlled study report'],
    }),
    part({
      code: `${s.prefix}.validation`, title: 'Validation Protocols, Data and SOP References', contentType: 'table', basis: S_6012B3,
      authoring: 'List the relevant validation protocols and data and a reference list of the relevant standard operating procedures.',
      elements: ['Validation protocol identifiers and results', 'SOP reference list with versions'],
    }),
    part({
      code: `${s.prefix}.labeling`, title: 'Labeling Changes', contentType: 'narrative', basis: s.timingBasis === S_6012B ? S_6012F1 : S_6012F2, required: false,
      authoring: 'Describe each labeling change in the supplement, before and after, and why it belongs in this category.',
      elements: ['Each labeling change, before and after', 'Category rationale under 601.12(f)'],
      prompt: 'Describe the labeling changes in this supplement for {{PRODUCT_NAME}} (21 CFR 601.12(f)) from the labeling change record, before and after. Do not state a change the record does not contain.',
    }),
  ];
}

function blaPas(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.pas;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Prior Approval Supplement', category: 'supplement', family: 'SUPPLEMENT', agency: 'FDA',
    description: 'A supplement to an approved BLA for a change with a substantial potential to have an adverse effect on the identity, strength, quality, purity or potency of the product; the product made with the change is not distributed before FDA approves the supplement (21 CFR 601.12(b)). It reads 601.12, not the NDA rule in 314.70. A comparability protocol approved under 601.12(e) may reduce the reporting category of the changes it covers.',
    regulatoryBasis: [S_6012A, S_6012B, S_6012B3, S_6012E, S_6012F1, FORM_356H, BIO_CHANGES_1997, BIO_CMC_2021, Q5E],
    timing: `Approval is obtained before distribution of the product made using the change (${S_6012B}). No review clock is stated here.`,
    ctdSectionCodes: [...BLA_CHANGE_CTD_CODES],
    components: supplementParts({ prefix: 'bla_pas', label: 'Prior Approval Supplement', basis: S_6012B, timingBasis: S_6012B }),
  };
}

function blaCbe30(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.cbe30;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Changes Being Effected in 30 Days Supplement (CBE-30)', category: 'supplement', family: 'SUPPLEMENT', agency: 'FDA',
    description: 'A supplement to an approved BLA for a change with a moderate potential to have an adverse effect on the identity, strength, quality, purity or potency of the product, submitted at least 30 days before the product made with the change is distributed (21 CFR 601.12(c)(1)). If FDA informs the applicant within that period that the change requires prior approval or that required information is missing, the product is not distributed until FDA determines that compliance is achieved (21 CFR 601.12(c)(4)).',
    regulatoryBasis: [S_6012A, S_6012C1, S_6012C, S_6012B3, FORM_356H, BIO_CHANGES_1997, BIO_CMC_2021, Q5E],
    timing: `Submitted at least 30 days prior to distribution of the product made using the change (${S_6012C1}).`,
    ctdSectionCodes: [...BLA_CHANGE_CTD_CODES],
    components: supplementParts({ prefix: 'bla_cbe30', label: 'Supplement - Changes Being Effected in 30 Days', basis: S_6012C1, timingBasis: S_6012C }),
  };
}

function blaCbe0(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.cbe0;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Changes Being Effected Supplement (CBE-0)', category: 'supplement', family: 'SUPPLEMENT', agency: 'FDA',
    description: 'A supplement to an approved BLA for a moderate change in a category FDA has designated for distribution upon FDA receipt of the supplement (21 CFR 601.12(c)(5)), or a labeling change listed in 21 CFR 601.12(f)(2). FDA may still disapprove the change and order the product made with it out of distribution (21 CFR 601.12(c)).',
    regulatoryBasis: [S_6012A, S_6012C5, S_6012C, S_6012F2, S_6012B3, FORM_356H, BIO_CHANGES_1997, BIO_CMC_2021],
    timing: `Distribution may begin upon FDA receipt of the supplement (${S_6012C5}; ${S_6012F2}).`,
    ctdSectionCodes: [...BLA_CHANGE_CTD_CODES],
    components: supplementParts({ prefix: 'bla_cbe0', label: 'Supplement - Changes Being Effected', basis: S_6012C5, timingBasis: S_6012C }),
  };
}

// ── CBER master file ─────────────────────────────────────────────────────────
const MF_314_420 = cfr('314.420', 'drug master files: content, letter of authorization, changes and the list of authorized parties; applied by CBER to biologics master files by practice');
const MF_601_51 = cfr('601.51(a)', 'the biological product file includes master files and related submissions');
const MF_PAGE = guidance('Master Files at CBER (CBER web page)', 'current page; date not recorded');
const DMF_GUIDANCE = guidance('Drug Master Files', 'draft, October 2019');

function cberMasterFile(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.masterFile;
  return {
    id: ids.id, registryId: ids.registryId, label: 'CBER Biologics Master File', category: 'application', family: 'BLA', agency: 'FDA',
    description: 'A master file submitted to CBER by a holder (for example a cell bank, excipient, device-component or facility supplier) so that an IND or BLA sponsor may incorporate its confidential information by reference with the holder\'s letter of authorization. FDA does not approve a master file; it is reviewed only in connection with a referencing application. Family BLA is the nearest existing value: the file supports IND and BLA referencing alike.',
    regulatoryBasis: [MF_314_420, MF_601_51, MF_PAGE, DMF_GUIDANCE],
    components: [
      part({
        code: 'cber_mf.cover', title: 'Cover Letter and Administrative Information', contentType: 'narrative', basis: `${MF_314_420}; ${MF_PAGE}`,
        authoring: 'State whether the submission is an original master file, an amendment or an annual update; identify the holder, its address, the responsible official and any agent, and the subject of the file. The master file number is assigned by FDA and is never invented.',
        elements: ['Submission type (original, amendment, update)', 'Holder name, address and responsible official', 'Agent, if any', 'Subject of the master file', 'Master file number, as assigned by FDA'],
        prompt: 'Draft the cover letter and administrative information for {{SPONSOR}}\'s CBER biologics master file on {{PRODUCT_NAME}}: submission type, holder, responsible official and subject, with a bracketed placeholder for the FDA-assigned master file number.',
      }),
      part({
        code: 'cber_mf.commitment', title: 'Statement of Commitment', contentType: 'form', basis: DMF_GUIDANCE,
        authoring: 'The signed statement by the holder that it will comply with the statements made in the master file. It is a signed record.',
        elements: ['Signed holder commitment statement'],
      }),
      part({
        code: 'cber_mf.technical', title: 'Technical Content', contentType: 'data', basis: MF_314_420,
        authoring: 'The confidential technical information (manufacturing, controls, facility or component data) in the format CBER accepts, taken from the controlled CMC records.',
        elements: ['Manufacturing and control information', 'Facility or component information', 'Supporting data and reports'],
      }),
      part({
        code: 'cber_mf.loa', title: 'Letters of Authorization', contentType: 'form', basis: MF_314_420,
        authoring: 'One signed letter per referencing party, identifying the master file, the specific information authorized for reference and the referencing application.',
        elements: ['Signed letter of authorization per referencing party', 'Master file and the information authorized', 'Referencing application'],
      }),
      part({
        code: 'cber_mf.authorized', title: 'List of Persons Authorized to Reference', contentType: 'table', basis: MF_314_420,
        authoring: 'The current list of every person authorized to incorporate information in the file by reference.',
        elements: ['Authorized party', 'Referencing application', 'Date authorized or withdrawn'],
      }),
      part({
        code: 'cber_mf.changes', title: 'Description of Changes (Amendments)', contentType: 'narrative', basis: MF_314_420, required: false,
        authoring: 'For an amendment, describe each addition, change or deletion and identify the information affected by its location in the file, and notify each authorized party of a change that may affect it.',
        elements: ['Each addition, change or deletion', 'Location of the information affected', 'Authorized parties notified'],
        prompt: 'Draft the description of changes for the amendment to {{SPONSOR}}\'s CBER master file from the change record: each addition, change or deletion and the location of the information affected. Do not state a change the record does not contain.',
      }),
    ],
  };
}

// ── Lot release (21 CFR 610.2) ───────────────────────────────────────────────
const LR_610_1 = cfr('610.1', 'no lot released by the manufacturer before completion of the tests for conformity with applicable standards');
const LR_610_2 = cfr('610.2', 'requests for samples and protocols; official release: the Center Director may require samples of any lot with protocols showing the results of applicable tests, and the lot is not distributed until released');

function cberLotRelease(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.lotRelease;
  return {
    id: ids.id, registryId: ids.registryId, label: 'CBER Lot Release Protocol and Samples', category: 'periodic', family: 'BLA', agency: 'FDA',
    description: 'The per-lot submission of a lot release protocol, summarizing the manufacture and test results of a licensed biological product lot, and of samples when FDA requires them, for a product subject to official release (21 CFR 610.2). Which products and lots are subject, and the protocol format, are set by FDA for the license; this record does not decide them.',
    regulatoryBasis: [LR_610_2, LR_610_1],
    timing: `Per lot when FDA requires it; the lot is not distributed until FDA releases it (${LR_610_2}).`,
    components: [
      part({
        code: 'cber_lr.cover', title: 'Cover Letter', contentType: 'narrative', basis: LR_610_2,
        authoring: 'Identify the license (STN), the product, the lot(s) submitted and whether samples accompany the protocol.',
        elements: ['BLA STN and product proper name', 'Lot number(s) submitted', 'Samples enclosed or not', 'Manufacturer contact'],
        prompt: 'Draft a short cover letter transmitting the lot release protocol for {{SPONSOR}}\'s {{PRODUCT_NAME}} (21 CFR 610.2), identifying the STN and lot number(s). Use bracketed placeholders for numbers.',
      }),
      part({
        code: 'cber_lr.protocol', title: 'Lot Release Protocol', contentType: 'data', basis: `${LR_610_2}; ${LR_610_1}`,
        authoring: 'The protocol in the format FDA has accepted for the license, showing the manufacturing history and the result of each applicable test for the lot, with the sign-off the accepted format requires.',
        elements: ['Lot manufacturing summary', 'Result of each applicable test against its specification', 'Sign-off the accepted format requires'],
      }),
      part({
        code: 'cber_lr.samples', title: 'Sample Shipment Record', contentType: 'table', basis: LR_610_2, required: false,
        authoring: 'Record the samples shipped with the protocol when FDA requires samples.',
        elements: ['Lot number', 'Sample quantity and container', 'Shipment date and conditions'],
      }),
    ],
  };
}

// ── Therapeutic EUA (FD&C Act 564) ───────────────────────────────────────────
const EUA_564 = act('564', 'authorization for medical products for use in emergencies; 21 U.S.C. 360bbb-3');
const EUA_564B = act('564(b)', 'HHS Secretary declaration that circumstances exist justifying emergency use');
const EUA_564C = act('564(c)', 'criteria: serious or life-threatening disease or condition, may be effective, known and potential benefits outweigh known and potential risks, no adequate approved and available alternative');
const EUA_564E = act('564(e)', 'conditions of authorization, including information to health care providers and recipients and adverse event monitoring and reporting');
const EUA_GUIDANCE = guidance('Emergency Use Authorization of Medical Products and Related Authorities', 'January 2017');

/** The narrative sections of an EUA request, by code, basis and content. */
function euaNarratives(): LifecycleComponent[] {
  const n = (code: string, title: string, basis: string, text: [string, string[], string]) =>
    part({ code: `eua.${code}`, title, contentType: 'narrative', basis, authoring: text[0], elements: text[1], prompt: text[2] });
  return [
    n('cover', 'Request Letter', `${EUA_564}; ${EUA_GUIDANCE}`,
      ['Request an EUA for the product and use, identify the declaration it relies on and any IND, master file or application cross-referenced.',
      ['Product and proposed emergency use', 'Declaration under 564(b) relied on', 'Cross-referenced IND, master file or application', 'Requester contact'],
      'Draft the EUA request letter for {{SPONSOR}}\'s {{PRODUCT_NAME}} for {{INDICATION}} under FD&C Act section 564, naming the declaration relied on and cross-referenced submissions. Use bracketed placeholders for identifiers and dates.']),
    n('product', 'Product Description and Intended Use', EUA_GUIDANCE,
      ['Describe the product, its proposed dosage and administration, and the population and setting of the proposed emergency use.',
      ['Product description', 'Proposed dosage and administration', 'Population and setting of use'],
      'Describe {{PRODUCT_NAME}} and its proposed emergency use in {{INDICATION}} from the product and clinical records. Do not state a dose or population the records do not give.']),
    n('criteria', 'Statement on the Statutory Criteria', `${EUA_564C}; ${EUA_564B}`,
      ['Address each 564(c) criterion with the evidence for it: the disease or condition and the agent, why the product may be effective, the benefit-risk assessment, and the absence of an adequate, approved and available alternative.',
      ['Disease or condition and causative agent', 'Evidence the product may be effective', 'Known and potential benefits versus known and potential risks', 'Adequate, approved and available alternatives considered'],
      'Draft the statement on each FD&C Act 564(c) criterion for {{PRODUCT_NAME}} in {{INDICATION}} from the cited study reports and literature. Do not state a result or alternative the sources do not contain.']),
    n('fact_sheets', 'Proposed Fact Sheets for Health Care Providers and for Recipients', `${EUA_564E}; ${EUA_GUIDANCE}`,
      ['Draft the proposed fact sheets that inform health care providers and recipients that the product is authorized for emergency use, of its known and potential benefits and risks, and of the option to accept or refuse it.',
      ['Health care provider fact sheet', 'Patient or caregiver fact sheet', 'Emergency-use status and benefits and risks', 'Option to accept or refuse'],
      'Draft the proposed health care provider and recipient fact sheets for {{PRODUCT_NAME}} under emergency use (FD&C Act 564(e)) from the benefit-risk statement. Do not state a risk or benefit the sources do not contain.']),
    n('conditions', 'Proposed Conditions of Authorization and Safety Monitoring', `${EUA_564E}; ${EUA_GUIDANCE}`,
      ['Propose how adverse events will be monitored and reported, records kept and distribution controlled under the authorization.',
      ['Adverse event monitoring and reporting', 'Record keeping', 'Distribution controls'],
      'Draft the proposed conditions of authorization and safety monitoring plan for {{SPONSOR}}\'s {{PRODUCT_NAME}} under FD&C Act 564(e). Do not commit to a reporting interval the sponsor has not set.']),
  ];
}

function euaTherapeutic(): LifecycleDocumentType {
  const ids = US_BLA_CHANGES_CBER_SOURCE_IDS.eua;
  return {
    id: ids.id, registryId: ids.registryId, label: 'Emergency Use Authorization Request (Drug or Biologic)', category: 'application', family: 'BLA', agency: 'FDA',
    description: 'A request under FD&C Act section 564 that FDA authorize the emergency use of an unapproved drug or biologic, or an unapproved use of an approved one, during a declared emergency. It is not an application for approval and has no regulatory review clock. A device EUA is the separate US_EUA identity. Family BLA is the nearest existing value; the request may concern a drug.',
    regulatoryBasis: [EUA_564, EUA_564B, EUA_564C, EUA_564E, EUA_GUIDANCE],
    components: [
      ...euaNarratives(),
      part({
        code: 'eua.data', title: 'Safety and Effectiveness Data', contentType: 'data', basis: `${EUA_564C}; ${EUA_GUIDANCE}`,
        authoring: 'The available nonclinical and clinical safety and effectiveness data, or the reference to them in an IND or application.',
        elements: ['Clinical study data and reports', 'Nonclinical data', 'Cross-reference to submissions holding them'],
      }),
      part({
        code: 'eua.cmc', title: 'Chemistry, Manufacturing and Controls Information', contentType: 'data', basis: EUA_GUIDANCE,
        authoring: 'Manufacturing, controls, facility and stability information, or the reference to it in an IND, master file or application.',
        elements: ['Manufacturing and controls summary', 'Facilities', 'Stability and storage', 'Cross-reference to submissions holding them'],
      }),
    ],
  };
}

/** The six change and CBER lifecycle records, in contract order. */
export function buildUsBlaChangesCberSources(): LifecycleDocumentType[] {
  return [blaPas(), blaCbe30(), blaCbe0(), cberMasterFile(), cberLotRelease(), euaTherapeutic()];
}

/** The same records as a value, for appending into LIFECYCLE_DOCUMENT_TYPES. */
export const US_BLA_CHANGES_CBER_SOURCES: readonly LifecycleDocumentType[] = Object.freeze(buildUsBlaChangesCberSources());
