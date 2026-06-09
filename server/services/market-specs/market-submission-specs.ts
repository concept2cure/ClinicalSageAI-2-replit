/**
 * Market submission specifications — the consolidated, per-market-per-format
 * datasheet of submission GOVERNANCE + FORMATTING requirements.
 *
 * WHY THIS EXISTS: the concrete "what does market X require to file in format Y"
 * facts were scattered across global-regulatory-authorities.json (authorities),
 * regional-ctd-templates.ts (forms/templates), region-profiles (Module 1),
 * ectd-regional-rules.ts (eCTD package validators), and validation-rule-corpus.ts
 * (named rules). Nothing answered, in ONE queryable place: which file formats /
 * PDF versions / naming + size + path limits / language + translation rules /
 * e-signature basis / sequence + lifecycle governance / forms / templates apply to
 * a given market and submission format. This registry is that single source of
 * truth, cross-referenced (not copied) to the modules that enforce each dimension.
 *
 * SCOPE: every submission format the Submission Center operates — drug/biologic
 * eCTD (FDA / EU / JP / Health Canada), FDA eSTAR (device 510(k)/De Novo), EU MDR
 * & IVDR technical documentation (EUDAMED), and EU CTIS (clinical trials). The
 * `MarketSubmissionSpec` shape is uniform, so additional markets from the
 * authorities catalog can be added without code changes.
 *
 * HONESTY ABOUT VALUES: fields reflect the PUBLISHED specifications cited in
 * `sources` (ICH/regional eCTD specs, agency technical-conformance guidance, the
 * device regulations, and the EU CTR). They are accurate to those documents as of
 * their cited versions, NOT a live feed — verify against current agency guidance
 * before an actual filing. Where the system already enforces a dimension, the
 * spec points at the enforcing module rather than re-deriving the check.
 *
 * PURE + DETERMINISTIC data + lookups: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/market-submission-specs
 */

export type SubmissionFamily = 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis';
export type ProductScope = 'drug' | 'biologic' | 'generic' | 'device' | 'ivd' | 'clinical-trial';

export interface MarketLanguageSpec {
  /** Primary submission language (ISO 639-1). */
  primary: string;
  /** Languages product information must ultimately be provided in (e.g. EU's 24). */
  productInfoLanguages?: string;
  /** Whether non-primary-language source content must be translated to file. */
  translationRequired: boolean;
  note: string;
}

export interface MarketFormattingSpec {
  /** Accepted leaf file formats. */
  fileFormats: string[];
  /** Accepted PDF version range, where PDF applies. */
  pdfVersions?: string[];
  /** PDF/A posture: 'required' | 'recommended' | 'accepted' | 'n/a'. */
  pdfA?: string;
  /** Whether encrypted / permission-restricted files are allowed (almost never). */
  encryptionAllowed: boolean;
  /** File-naming convention, expressed as a human note. */
  fileNaming: string;
  /** Regex (as a string) a leaf file name should satisfy, where defined. */
  fileNamePattern?: string;
  /** Max characters in a single file/folder name. */
  maxFileNameLength?: number;
  /** Max characters in the full relative path. */
  maxPathLength?: number;
  /** Max size of a single file (MB), or null if not separately capped. */
  maxFileSizeMb?: number | null;
  /** Max total submission/sequence size (MB) at the gateway, or null. */
  maxSubmissionSizeMb?: number | null;
  /** Integrity checksum algorithm. */
  checksumAlgorithm?: string;
  /** Folder/structure convention note. */
  folderConvention?: string;
}

export interface MarketBackboneSpec {
  /** Whether an ICH index.xml backbone applies. */
  indexXml: boolean;
  /** Regional Module 1 backbone path, where applicable. */
  regionalXmlPath?: string;
  /** Module 1 folder. */
  module1Folder?: string;
  /** Whether Study Tagging Files are required for study reports. */
  studyTaggingFiles?: boolean;
  note?: string;
}

export interface MarketGovernanceSpec {
  /** Electronic-signature requirement + its regulatory basis. */
  eSignature: { required: boolean; basis: string };
  /** Sequence numbering convention, where applicable. */
  sequenceNumbering?: string;
  /** Whether the format defines lifecycle operations, and which. */
  lifecycleOperations?: string[];
  /** Whether a validation pass is expected before transmit. */
  validationBeforeDispatch: boolean;
  /** Whether the record is immutable once submitted/registered. */
  immutabilityAfterSubmission: boolean;
  note?: string;
}

export interface MarketFormSpec {
  formId?: string;
  name: string;
  required: boolean;
}

export interface MarketSubmissionSpec {
  /** Stable id `${market}-${family}` (e.g. 'us-ectd', 'eu-mdr'). */
  id: string;
  /** Market code (ISO-ish): us | eu | jp | ca | … */
  market: string;
  /** Authority short name. */
  authority: string;
  /** Key into server/data/global-regulatory-authorities.json. */
  authorityId: string;
  /** The system's region code, where the format maps to one (fda|eu|jp). */
  region?: 'fda' | 'eu' | 'jp';
  family: SubmissionFamily;
  /** Human-readable format name + version. */
  submissionFormat: string;
  /** Gateway / transport / portal the bytes go through. */
  gateway: string;
  productScope: ProductScope[];
  language: MarketLanguageSpec;
  formatting: MarketFormattingSpec;
  backbone?: MarketBackboneSpec;
  governance: MarketGovernanceSpec;
  forms: MarketFormSpec[];
  /** Template-set references (regional-ctd-templates.ts / regulatory/templateCatalog.ts). */
  templates: string[];
  /** Region whose rules in validation-rule-corpus.ts apply (eCTD families). */
  ruleCorpusRegion?: 'fda' | 'eu' | 'jp';
  /** Published specification sources these values derive from. */
  sources: string[];
}

const ICH = 'ICH eCTD Specification (v3.2.2 / v4.0); ICH M4 CTD';

export const MARKET_SUBMISSION_SPECS: MarketSubmissionSpec[] = [
  // ── FDA — drug/biologic eCTD ────────────────────────────────────────────────
  {
    id: 'us-ectd',
    market: 'us',
    authority: 'FDA',
    authorityId: 'FDA',
    region: 'fda',
    family: 'ectd',
    submissionFormat: 'eCTD v4.0 (FDA also accepts v3.2.2)',
    gateway: 'FDA ESG (AS2 over HTTPS or SFTP)',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      translationRequired: true,
      note: 'All content in English; certified translations required for foreign-language source documents.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'accepted (PDF 2.0 not accepted)',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9 and hyphens; no spaces; descriptive, ≤ 64 characters.',
      fileNamePattern: '^[a-z0-9-]{1,64}\\.[a-z0-9]+$',
      maxFileNameLength: 64,
      maxPathLength: 230,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: 4096,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/us/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/us/us-regional.xml',
      module1Folder: 'm1/us',
      studyTaggingFiles: true,
      note: 'ICH index.xml + FDA us-regional.xml; STFs index study reports.',
    },
    governance: {
      eSignature: { required: true, basis: '21 CFR Part 11' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [
      { formId: 'FDA 356h', name: 'Application to Market a New or Abbreviated New Drug or Biologic', required: true },
      { formId: 'FDA 1571', name: 'Investigational New Drug Application (IND)', required: false },
      { formId: 'FDA 3674', name: 'Certification of Compliance (ClinicalTrials.gov)', required: true },
      { formId: 'FDA 3397', name: 'User Fee Cover Sheet (PDUFA)', required: false },
    ],
    templates: ['regional-ctd-templates:FDA_TEMPLATE', 'templateCatalog:CTD_TEMPLATES'],
    ruleCorpusRegion: 'fda',
    sources: [ICH, 'FDA eCTD Technical Conformance Guide; Specifications for eCTD Validation Criteria; FDA ESG User Guide'],
  },

  // ── EU — drug/biologic eCTD ─────────────────────────────────────────────────
  {
    id: 'eu-ectd',
    market: 'eu',
    authority: 'EMA',
    authorityId: 'EMA',
    region: 'eu',
    family: 'ectd',
    submissionFormat: 'EU eCTD (EU M1 spec; eCTD v3.2.2 / v4.0)',
    gateway: 'CESP (Common European Submission Portal) / eSubmission Gateway',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      productInfoLanguages: 'Product information (SmPC/PIL/labelling) in all 24 official EU languages for a centralised authorisation.',
      translationRequired: true,
      note: 'Dossier in English; product information translated into EU official languages on approval.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9, hyphens and periods only; no spaces; ≤ 64 characters.',
      fileNamePattern: '^[a-z0-9.-]{1,64}$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: 600,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/eu/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/eu/eu-regional.xml',
      module1Folder: 'm1/eu',
      studyTaggingFiles: false,
      note: 'ICH index.xml + EU eu-regional.xml (EU M1 schema).',
    },
    governance: {
      eSignature: { required: true, basis: 'EU GMP Annex 11 (computerised systems); eIDAS for qualified e-signatures' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [
      { formId: 'eAF', name: 'electronic Application Form (eAF)', required: true },
      { name: 'EU Orphan Drug Application (where applicable)', required: false },
    ],
    templates: ['regional-ctd-templates:EMA_TEMPLATE', 'templateCatalog:EU_SPECIFIC_TEMPLATES', 'templateCatalog:CTD_TEMPLATES'],
    ruleCorpusRegion: 'eu',
    sources: [ICH, 'EU Module 1 eCTD Specification; EU eCTD Validation Criteria; CESP guidance'],
  },

  // ── Japan — drug/biologic eCTD ──────────────────────────────────────────────
  {
    id: 'jp-ectd',
    market: 'jp',
    authority: 'PMDA',
    authorityId: 'PMDA',
    region: 'jp',
    family: 'ectd',
    submissionFormat: 'Japan eCTD (PMDA; JP Module 1)',
    gateway: 'PMDA submission gateway (SFTP)',
    productScope: ['drug', 'biologic'],
    language: {
      primary: 'ja',
      translationRequired: true,
      note: 'Module 1 and key summaries in Japanese; Japanese translations of foreign data expected.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'accepted',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9 and hyphens; PMDA file-naming convention; no spaces.',
      fileNamePattern: '^[a-z0-9-]{1,64}\\.[a-z0-9]+$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: 1024,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/jp/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/jp/jp-regional.xml',
      module1Folder: 'm1/jp',
      studyTaggingFiles: true,
      note: 'ICH index.xml + PMDA jp-regional.xml; STFs required for study reports.',
    },
    governance: {
      eSignature: { required: true, basis: 'Japan PMDA notifications (ER/ES requirements)' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'Japanese CTD Application Form (申請書)', required: true }],
    templates: ['regional-ctd-templates:PMDA_TEMPLATE', 'templateCatalog:CTD_TEMPLATES'],
    ruleCorpusRegion: 'jp',
    sources: [ICH, 'Japan/PMDA eCTD Notification & Specification'],
  },

  // ── Health Canada — drug/biologic eCTD ──────────────────────────────────────
  {
    id: 'ca-ectd',
    market: 'ca',
    authority: 'Health Canada',
    authorityId: 'HealthCanada',
    family: 'ectd',
    submissionFormat: 'Health Canada eCTD',
    gateway: 'Health Canada Common Electronic Submissions Gateway (CESG)',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      productInfoLanguages: 'Product monograph and labelling in both English and French.',
      translationRequired: true,
      note: 'Bilingual (English/French) product information required.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'accepted',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9 and hyphens; ≤ 64 characters.',
      fileNamePattern: '^[a-z0-9-]{1,64}\\.[a-z0-9]+$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/ca/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/ca/ca-regional.xml',
      module1Folder: 'm1/ca',
      studyTaggingFiles: false,
      note: 'ICH index.xml + Health Canada ca-regional.xml.',
    },
    governance: {
      eSignature: { required: true, basis: 'Health Canada electronic records guidance' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'Drug Submission Application Form (HC/SC)', required: true }],
    templates: ['regional-ctd-templates:FDA_TEMPLATE'],
    sources: [ICH, 'Health Canada eCTD / Regulatory Enrolment Process (REP) guidance'],
  },

  // ── UK — drug/biologic eCTD (post-Brexit) ───────────────────────────────────
  {
    id: 'uk-ectd',
    market: 'uk',
    authority: 'MHRA',
    authorityId: 'MHRA',
    family: 'ectd',
    submissionFormat: 'UK eCTD (UK M1; post-Brexit, based on the EU eCTD with a UK Module 1)',
    gateway: 'MHRA Submissions portal',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      translationRequired: true,
      note: 'English; product information (SmPC/PIL) in English for the UK market.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9, hyphens and periods; ≤ 64 characters (EU eCTD convention).',
      fileNamePattern: '^[a-z0-9.-]{1,64}$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/uk/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/uk/uk-regional.xml',
      module1Folder: 'm1/uk',
      studyTaggingFiles: false,
      note: 'ICH index.xml + UK uk-regional.xml (UK M1 schema, derived from the EU M1).',
    },
    governance: {
      eSignature: { required: true, basis: 'UK GMP/GDP (MHRA) electronic records; eIDAS-equivalent' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'MHRA application form (per procedure)', required: true }],
    templates: ['regional-ctd-templates:EMA_TEMPLATE'],
    sources: [ICH, 'UK eCTD / MHRA Module 1 specification; MHRA Submissions guidance'],
  },

  // ── Switzerland — drug/biologic eCTD ────────────────────────────────────────
  {
    id: 'ch-ectd',
    market: 'ch',
    authority: 'Swissmedic',
    authorityId: 'Swissmedic',
    family: 'ectd',
    submissionFormat: 'Swissmedic eCTD (Swiss Module 1)',
    gateway: 'Swissmedic eGov / Portal',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      productInfoLanguages: 'Product information in German, French and Italian (Swiss official languages).',
      translationRequired: true,
      note: 'Dossier in English or an official language; product information in DE/FR/IT.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9, hyphens and periods; ≤ 64 characters (EU eCTD convention).',
      fileNamePattern: '^[a-z0-9.-]{1,64}$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/ch/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/ch/ch-regional.xml',
      module1Folder: 'm1/ch',
      studyTaggingFiles: false,
      note: 'ICH index.xml + Swiss ch-regional.xml (Swissmedic M1 schema).',
    },
    governance: {
      eSignature: { required: true, basis: 'Swissmedic electronic submission guidance' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'Swissmedic application form', required: true }],
    templates: ['regional-ctd-templates:EMA_TEMPLATE'],
    sources: [ICH, 'Swissmedic eCTD specification & guidance'],
  },

  // ── Australia — drug/biologic eCTD ──────────────────────────────────────────
  {
    id: 'au-ectd',
    market: 'au',
    authority: 'TGA',
    authorityId: 'TGA',
    family: 'ectd',
    submissionFormat: 'TGA eCTD (AU Module 1)',
    gateway: 'TGA Business Services (TBS) portal',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'en',
      translationRequired: true,
      note: 'English; Product Information (PI) and Consumer Medicine Information (CMI) in English.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9, hyphens and periods; ≤ 64 characters (EU eCTD convention).',
      fileNamePattern: '^[a-z0-9.-]{1,64}$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/au/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/au/au-regional.xml',
      module1Folder: 'm1/au',
      studyTaggingFiles: false,
      note: 'ICH index.xml + TGA au-regional.xml (AU M1 schema).',
    },
    governance: {
      eSignature: { required: true, basis: 'TGA electronic submission requirements' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'TGA application form (per submission type)', required: true }],
    templates: ['regional-ctd-templates:FDA_TEMPLATE'],
    sources: [ICH, 'TGA eCTD specification; AU Module 1 and regional specification'],
  },

  // ── China — drug/biologic eCTD ──────────────────────────────────────────────
  {
    id: 'cn-ectd',
    market: 'cn',
    authority: 'NMPA',
    authorityId: 'NMPA',
    family: 'ectd',
    submissionFormat: 'NMPA eCTD (China Module 1; eCTD transitioning)',
    gateway: 'NMPA / CDE submission portal',
    productScope: ['drug', 'biologic', 'generic'],
    language: {
      primary: 'zh',
      productInfoLanguages: 'Chinese (Simplified) for labelling and product information.',
      translationRequired: true,
      note: 'Module 1 and labelling in Chinese; Chinese translations of foreign-language data expected.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'accepted',
      encryptionAllowed: false,
      fileNaming: 'Lowercase a–z, 0–9 and hyphens; CDE naming convention; no spaces.',
      fileNamePattern: '^[a-z0-9-]{1,64}\\.[a-z0-9]+$',
      maxFileNameLength: 64,
      maxPathLength: 180,
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      checksumAlgorithm: 'MD5',
      folderConvention: 'CTD m1–m5 tree; Module 1 under m1/cn/.',
    },
    backbone: {
      indexXml: true,
      regionalXmlPath: 'm1/cn/cn-regional.xml',
      module1Folder: 'm1/cn',
      studyTaggingFiles: false,
      note: 'ICH index.xml + China cn-regional.xml (CDE M1 schema); eCTD being phased in.',
    },
    governance: {
      eSignature: { required: true, basis: 'NMPA/CDE electronic submission requirements' },
      sequenceNumbering: 'Four-digit zero-padded (0000, 0001, …)',
      lifecycleOperations: ['new', 'replace', 'append', 'delete'],
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
    },
    forms: [{ name: 'CDE application form (申请表)', required: true }],
    templates: ['regional-ctd-templates:NMPA_TEMPLATE'],
    sources: [ICH, 'NMPA/CDE eCTD technical specification (China M1)'],
  },

  // ── FDA — device 510(k) / De Novo eSTAR ─────────────────────────────────────
  {
    id: 'us-estar',
    market: 'us',
    authority: 'FDA',
    authorityId: 'FDA',
    region: 'fda',
    family: 'estar',
    submissionFormat: 'FDA eSTAR (electronic Submission Template And Resource)',
    gateway: 'CDRH Customer Collaboration Portal (CCP) / FDA ESG',
    productScope: ['device', 'ivd'],
    language: {
      primary: 'en',
      translationRequired: true,
      note: 'English; eSTAR is a single self-contained interactive PDF with attachments.',
    },
    formatting: {
      fileFormats: ['PDF (eSTAR form)', 'PDF attachments'],
      pdfVersions: ['1.7'],
      pdfA: 'n/a (eSTAR is an interactive AcroForm PDF)',
      encryptionAllowed: false,
      fileNaming: 'Attachments embedded in / referenced by the eSTAR; follow the template’s attachment prompts.',
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
      folderConvention: 'Single eSTAR PDF plus attachments; not a CTD folder tree.',
    },
    backbone: {
      indexXml: false,
      note: 'eSTAR is a guided PDF form, not an eCTD backbone; the form enforces completeness at the field level.',
    },
    governance: {
      eSignature: { required: true, basis: '21 CFR Part 11' },
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: true,
      note: 'eSTAR is mandatory for 510(k) (since Oct 1, 2023) and De Novo; the FDA auto-runs a technical (eSTAR completeness) check at receipt.',
    },
    forms: [
      { name: 'eSTAR 510(k) template', required: true },
      { name: 'eSTAR De Novo template', required: false },
    ],
    templates: ['templateCatalog:DEVICE_TEMPLATES', 'pathway-engines:estar-mapper'],
    sources: ['FDA eSTAR program; FDA Guidance "Electronic Submission Template for Medical Device 510(k) Submissions"; 21 CFR 807.92 (substantial equivalence)'],
  },

  // ── EU — medical device MDR technical documentation ─────────────────────────
  {
    id: 'eu-mdr',
    market: 'eu',
    authority: 'EU Notified Bodies / EUDAMED',
    authorityId: 'EMA',
    region: 'eu',
    family: 'eu_mdr',
    submissionFormat: 'EU MDR technical documentation (Annex II/III) + EUDAMED registration',
    gateway: 'Notified Body portal (conformity assessment) + EUDAMED (UDI/device/certificate registration)',
    productScope: ['device'],
    language: {
      primary: 'en',
      productInfoLanguages: 'IFU/labelling in the official language(s) of each member state where the device is placed on the market.',
      translationRequired: true,
      note: 'Technical documentation typically in English (per NB agreement); IFU/labelling per member-state language.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'No eCTD naming rule; organise per Annex II/III sections (NB-specific conventions may apply).',
      folderConvention: 'Technical file structured to MDR Annex II/III; not a CTD tree.',
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
    },
    backbone: {
      indexXml: false,
      note: 'Structured technical file (Annex II/III). The Submission Center assembles a manifest + ZIP (technical-file-packager).',
    },
    governance: {
      eSignature: { required: true, basis: 'EU MDR (2017/745); EU GMP Annex 11; eIDAS' },
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: false,
      note: 'EUDAMED registration of UDI-DI, device and certificate data; technical documentation kept up to date over the lifecycle.',
    },
    forms: [
      { name: 'EU Declaration of Conformity', required: true },
      { name: 'GSPR (Annex I) checklist', required: true },
      { name: 'EUDAMED actor / device / UDI registration', required: true },
    ],
    templates: ['pathway-engines:tech-doc-assembler', 'technical-file-manifest', 'templateCatalog:DEVICE_TEMPLATES'],
    sources: ['Regulation (EU) 2017/745 (MDR) Annex I/II/III; MDCG guidance; EUDAMED documentation'],
  },

  // ── EU — IVD IVDR technical documentation ───────────────────────────────────
  {
    id: 'eu-ivdr',
    market: 'eu',
    authority: 'EU Notified Bodies / EUDAMED',
    authorityId: 'EMA',
    region: 'eu',
    family: 'eu_ivdr',
    submissionFormat: 'EU IVDR technical documentation (Annex II/III) + EUDAMED registration',
    gateway: 'Notified Body portal (conformity assessment, class-dependent) + EUDAMED',
    productScope: ['ivd'],
    language: {
      primary: 'en',
      productInfoLanguages: 'IFU/labelling in the official language(s) of each member state of placement.',
      translationRequired: true,
      note: 'Technical documentation in English (per NB); performance evaluation evidence emphasised under IVDR.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'No eCTD naming rule; organise per Annex II/III sections.',
      folderConvention: 'Technical file structured to IVDR Annex II/III; not a CTD tree.',
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
    },
    backbone: {
      indexXml: false,
      note: 'Structured technical file (Annex II/III) incl. Performance Evaluation Report. Assembled via technical-file-packager.',
    },
    governance: {
      eSignature: { required: true, basis: 'EU IVDR (2017/746); EU GMP Annex 11; eIDAS' },
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: false,
      note: 'EUDAMED registration; conformity-assessment route depends on the IVDR risk class (A–D).',
    },
    forms: [
      { name: 'EU Declaration of Conformity', required: true },
      { name: 'GSPR (Annex I) checklist', required: true },
      { name: 'Performance Evaluation Report (PER)', required: true },
      { name: 'EUDAMED actor / device / UDI registration', required: true },
    ],
    templates: ['pathway-engines:tech-doc-assembler', 'technical-file-manifest', 'templateCatalog:DEVICE_TEMPLATES'],
    sources: ['Regulation (EU) 2017/746 (IVDR) Annex I/II/III; MDCG guidance; EUDAMED documentation'],
  },

  // ── EU — clinical trial application (CTIS) ──────────────────────────────────
  {
    id: 'eu-ctis',
    market: 'eu',
    authority: 'EMA / National Competent Authorities',
    authorityId: 'EMA',
    region: 'eu',
    family: 'ctis',
    submissionFormat: 'EU CTIS clinical trial application (CTR 536/2014; Part I + Part II)',
    gateway: 'CTIS (Clinical Trials Information System) portal',
    productScope: ['clinical-trial'],
    language: {
      primary: 'en',
      productInfoLanguages: 'Part II (subject-facing documents, e.g. ICF) in the official language(s) of each concerned member state.',
      translationRequired: true,
      note: 'Part I (scientific) typically in English; Part II national documents in member-state languages.',
    },
    formatting: {
      fileFormats: ['PDF'],
      pdfVersions: ['1.4', '1.5', '1.6', '1.7'],
      pdfA: 'recommended',
      encryptionAllowed: false,
      fileNaming: 'Uploaded per CTIS document category; portal-managed structure (not eCTD).',
      folderConvention: 'Part I (common) + Part II (per concerned member state); portal-structured.',
      maxFileSizeMb: null,
      maxSubmissionSizeMb: null,
    },
    backbone: {
      indexXml: false,
      note: 'CTIS is a portal data model (Part I/II per member state); the Submission Center assembles a Part I/II manifest (ctis-mapper).',
    },
    governance: {
      eSignature: { required: true, basis: 'EU CTR 536/2014; EU GMP Annex 11; eIDAS' },
      validationBeforeDispatch: true,
      immutabilityAfterSubmission: false,
      note: 'Single EU-wide assessment for Part I; Part II assessed per concerned member state; defined assessment/RFI timelines.',
    },
    forms: [
      { name: 'CTIS clinical trial application (Part I)', required: true },
      { name: 'CTIS Part II national documents (per member state)', required: true },
      { name: 'IMPD (quality / safety-efficacy)', required: true },
    ],
    templates: ['pathway-engines:ctis-mapper', 'templateCatalog:EU_SPECIFIC_TEMPLATES'],
    sources: ['Regulation (EU) 536/2014 (Clinical Trials Regulation); CTIS sponsor handbook; EU eCTD/eAF where referenced'],
  },
];

// ── Lookups (pure) ────────────────────────────────────────────────────────────

const BY_ID = new Map(MARKET_SUBMISSION_SPECS.map((s) => [s.id, s]));

export function getMarketSpec(id: string): MarketSubmissionSpec | undefined {
  return BY_ID.get(id);
}

/** All specs for a market code (us | eu | jp | ca | …). */
export function specsForMarket(market: string): MarketSubmissionSpec[] {
  return MARKET_SUBMISSION_SPECS.filter((s) => s.market === market.toLowerCase());
}

/** All specs for a submission family (ectd | estar | eu_mdr | eu_ivdr | ctis). */
export function specsForFamily(family: SubmissionFamily): MarketSubmissionSpec[] {
  return MARKET_SUBMISSION_SPECS.filter((s) => s.family === family);
}

/** All specs the system maps to a given region code (fda | eu | jp). */
export function specsForRegion(region: 'fda' | 'eu' | 'jp'): MarketSubmissionSpec[] {
  return MARKET_SUBMISSION_SPECS.filter((s) => s.region === region);
}

/** Distinct market codes present in the registry. */
export function markets(): string[] {
  return [...new Set(MARKET_SUBMISSION_SPECS.map((s) => s.market))];
}

export interface MarketSpecSummary {
  total: number;
  markets: string[];
  byFamily: Record<SubmissionFamily, number>;
}

export function marketSpecSummary(): MarketSpecSummary {
  const byFamily: Record<SubmissionFamily, number> = { ectd: 0, estar: 0, eu_mdr: 0, eu_ivdr: 0, ctis: 0 };
  for (const s of MARKET_SUBMISSION_SPECS) byFamily[s.family] += 1;
  return { total: MARKET_SUBMISSION_SPECS.length, markets: markets(), byFamily };
}

export default {
  MARKET_SUBMISSION_SPECS,
  getMarketSpec,
  specsForMarket,
  specsForFamily,
  specsForRegion,
  markets,
  marketSpecSummary,
};
