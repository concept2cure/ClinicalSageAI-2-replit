/**
 * Global Regulatory Compliance Engine
 *
 * Master orchestrator for multi-region regulatory compliance validation.
 * Covers FDA (US), EMA (EU), PMDA (Japan), NMPA (China), ANVISA (Brazil),
 * MFDS (Korea), TGA (Australia), Health Canada, MHRA (UK), Swissmedic,
 * ICH harmonised guidelines, WHO prequalification, and PIC/S GMP.
 *
 * Each framework encodes real regulatory requirements including retention
 * periods, electronic-signature mandates, hash-chain algorithms, data-residency
 * constraints, timestamp/timezone rules, language requirements, export format
 * requirements, and mandatory audit record fields drawn from the cited
 * regulations.
 *
 * @module server/services/compliance/globalComplianceEngine
 */

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

export type ComplianceDomain =
  | 'audit_trail'
  | 'e_signatures'
  | 'data_integrity'
  | 'data_residency'
  | 'pharmacovigilance'
  | 'change_control'
  | 'validation';

export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-3-256' | 'SM3';

export type ExportFormat =
  | 'PDF/A-2'
  | 'PDF/A-3'
  | 'XML'
  | 'CSV'
  | 'JSON'
  | 'HL7-FHIR'
  | 'eCTD-XML'
  | 'CDISC-ODM';

export interface TimestampRequirement {
  /** ISO 8601 date-time format pattern */
  format: string;
  /** Whether UTC storage is mandatory */
  utcRequired: boolean;
  /** Whether local time must also be recorded alongside UTC */
  localTimeRequired: boolean;
  /** Acceptable IANA timezone identifiers; empty array means any timezone is acceptable */
  allowedTimezones: string[];
}

export interface DataResidencyRequirement {
  /** Whether data must remain within specific geographic boundaries */
  restricted: boolean;
  /** ISO country/region codes where data storage is permitted */
  allowedRegions: string[];
  /** Whether cross-border transfer requires an adequacy decision or equivalent safeguard */
  crossBorderTransferRequiresAdequacy: boolean;
  /** Regulatory citation for this data residency requirement */
  citation: string;
}

export interface AuditTrailRequirements {
  /** Minimum retention period in years */
  retentionYears: number;
  /** Regulatory citation for the retention period */
  retentionCitation: string;
  /** Whether electronic signatures are required on audit entries */
  electronicSignaturesRequired: boolean;
  /** Required hash-chain algorithm for tamper evidence */
  hashAlgorithm: HashAlgorithm;
  /** Whether a reason-for-change must be captured on every modification */
  reasonForChangeRequired: boolean;
  /** Timestamp format and timezone rules */
  timestamp: TimestampRequirement;
  /** Languages that audit records must be available in (ISO 639-1 codes) */
  requiredLanguages: string[];
  /** Accepted export formats for audit trail data */
  exportFormats: ExportFormat[];
  /** Fields that must be present on every audit record */
  mandatoryFields: string[];
}

export interface RegulatoryFramework {
  /** Unique identifier for the framework */
  id: string;
  /** Human-readable name including regulation reference */
  name: string;
  /** ISO 3166-1 alpha-2 region code, or 'INTL' for international frameworks */
  region: string;
  /** Regulatory authority name */
  authority: string;
  /** Applicable compliance domains */
  domains: ComplianceDomain[];
  /** Detailed audit trail requirements */
  auditRequirements: AuditTrailRequirements;
  /** Data residency requirements */
  dataResidency: DataResidencyRequirement;
  /** Additional regulation-specific notes and guidance */
  notes: string[];
}

export interface ComplianceGap {
  frameworkId: string;
  frameworkName: string;
  field: string;
  requirement: string;
  currentValue: string | number | boolean | null;
  severity: 'critical' | 'major' | 'minor';
  citation: string;
  remediation: string;
}

export interface ComplianceGapAnalysis {
  regions: string[];
  applicableFrameworks: string[];
  totalGaps: number;
  criticalGaps: number;
  majorGaps: number;
  minorGaps: number;
  gaps: ComplianceGap[];
  compliant: boolean;
  assessedAt: string;
}

export interface AuditConfig {
  retentionYears?: number;
  electronicSignaturesEnabled?: boolean;
  hashAlgorithm?: HashAlgorithm;
  reasonForChangeEnabled?: boolean;
  timestampFormat?: string;
  utcStorage?: boolean;
  localTimeRecorded?: boolean;
  supportedLanguages?: string[];
  exportFormats?: ExportFormat[];
  auditFields?: string[];
  dataResidencyRegions?: string[];
  crossBorderAdequacy?: boolean;
}

export interface RegionalAuditRequirements {
  region: string;
  frameworks: string[];
  retentionYears: number;
  requiredLanguages: string[];
  timestampRules: TimestampRequirement;
  mandatoryFields: string[];
  exportFormats: ExportFormat[];
  electronicSignaturesRequired: boolean;
  hashAlgorithm: HashAlgorithm;
  dataResidency: DataResidencyRequirement;
}

// ---------------------------------------------------------------------------
// Supported Regions
// ---------------------------------------------------------------------------

export const SUPPORTED_REGIONS = [
  'US',
  'EU',
  'JP',
  'CN',
  'BR',
  'KR',
  'AU',
  'CA',
  'GB',
  'CH',
  'INTL',
] as const;

export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

// ---------------------------------------------------------------------------
// Baseline mandatory audit fields common to all frameworks
// ---------------------------------------------------------------------------

const BASE_AUDIT_FIELDS: string[] = [
  'record_id',
  'timestamp_utc',
  'user_id',
  'user_name',
  'action',
  'entity_type',
  'entity_id',
  'old_value',
  'new_value',
  'ip_address',
  'session_id',
];

// ---------------------------------------------------------------------------
// Framework Definitions
// ---------------------------------------------------------------------------

export const REGULATORY_FRAMEWORKS: readonly RegulatoryFramework[] = [
  // =========================================================================
  // UNITED STATES
  // =========================================================================
  {
    id: 'US_21CFR11',
    name: '21 CFR Part 11 — Electronic Records; Electronic Signatures',
    region: 'US',
    authority: 'FDA',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        '21 CFR 11.10(e) — audit trails shall be retained for a period at least as long as required for the subject electronic records and shall be available for agency review and copying',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: false,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'signature_meaning',
        'computer_generated_timestamp',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation:
        'No explicit data residency requirement under 21 CFR Part 11',
    },
    notes: [
      'Closed-system controls required per 11.10',
      'Electronic signatures must be linked to their respective electronic records (11.70)',
      'Signature manifestations must contain printed name, date/time of signing, and meaning (11.50)',
      'Authority checks must limit system access to authorized individuals (11.10(d))',
    ],
  },
  {
    id: 'US_21CFR820',
    name: '21 CFR 820 — Quality System Regulation (QSR)',
    region: 'US',
    authority: 'FDA',
    domains: ['audit_trail', 'data_integrity', 'change_control', 'validation'],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        '21 CFR 820.184 — Device History Record retention; 820.180 — all records shall be retained for a period equivalent to the design and expected life of the device but in no case less than 2 years from date of release',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: false,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'document_revision',
        'approval_status',
        'device_identifier',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation: 'No explicit data residency requirement under 21 CFR 820',
    },
    notes: [
      'Device Master Record (DMR) and Device History Record (DHR) must be maintained',
      'Design History File (DHF) required per 820.30',
      'CAPA system per 820.198 must maintain documented procedures',
      'Quality System Record retention for the lifetime of the device (820.180)',
    ],
  },

  // =========================================================================
  // EUROPEAN UNION
  // =========================================================================
  {
    id: 'EU_ANNEX11',
    name: 'EU GMP Annex 11 — Computerised Systems',
    region: 'EU',
    authority: 'EMA',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'Annex 11, Clause 9 — Audit trails shall be available and convertible to a generally intelligible form; retained for the period required by the batch documentation',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'local_timestamp',
        'system_identifier',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['EU', 'EEA', 'CH', 'GB'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'GDPR Art. 44-49 adequacy decisions apply to GMP data containing personal data',
    },
    notes: [
      'System must be validated per Annex 11 Clause 4',
      'Audit trail review should be part of routine data review (Clause 9)',
      'Data must be convertible to a generally intelligible form (Clause 9)',
      'Printed copies of electronically stored data should indicate if data has changed since original entry (Clause 8.2)',
    ],
  },
  {
    id: 'EU_MDR',
    name: 'EU MDR 2017/745 — Medical Device Regulation',
    region: 'EU',
    authority: 'European Commission / Notified Bodies',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'MDR Art. 10(8) — Technical documentation retention for at least 10 years after last device placed on market; 15 years for implantable devices',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'udi_di',
        'device_class',
        'notified_body_id',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['EU', 'EEA'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'MDR Art. 33 — EUDAMED data residency; GDPR applies to all personal data within scope',
    },
    notes: [
      'UDI system mandatory per Art. 27',
      'Post-market surveillance system per Art. 83-86',
      'Periodic safety update report (PSUR) required for Class IIa, IIb, III devices',
      'Serious incident reporting to competent authority within 15 days (Art. 87)',
    ],
  },
  {
    id: 'EU_IVDR',
    name: 'EU IVDR 2017/746 — In Vitro Diagnostic Regulation',
    region: 'EU',
    authority: 'European Commission / Notified Bodies',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'IVDR Art. 10(8) — Technical documentation retention for at least 10 years after the last device has been placed on the market',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'udi_di',
        'device_class',
        'performance_evaluation_id',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['EU', 'EEA'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'IVDR Art. 30 — EUDAMED registration; GDPR applies to personal data',
    },
    notes: [
      'Performance evaluation per Art. 56-58',
      'Common specifications may apply per Art. 9',
      'Companion diagnostics require parallel conformity assessment with the medicinal product',
      'Transitional provisions extended for certain device classes',
    ],
  },
  {
    id: 'EU_GDPR',
    name: 'GDPR — General Data Protection Regulation (EU) 2016/679',
    region: 'EU',
    authority: 'National Data Protection Authorities / EDPB',
    domains: ['audit_trail', 'data_integrity', 'data_residency'],
    auditRequirements: {
      retentionYears: 6,
      retentionCitation:
        'GDPR Art. 5(1)(e) — Storage limitation principle; Art. 30 — Records of processing activities; typical statute of limitations 5-6 years',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: false,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['JSON', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'data_subject_category',
        'processing_purpose',
        'legal_basis',
        'data_controller_id',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['EU', 'EEA'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'GDPR Art. 44-49 — Transfers of personal data to third countries require adequacy decision, Standard Contractual Clauses (SCCs), or Binding Corporate Rules (BCRs)',
    },
    notes: [
      'Data Protection Impact Assessment (DPIA) required for high-risk processing (Art. 35)',
      'Right to erasure (Art. 17) must be balanced with retention obligations from other frameworks',
      'Data breach notification to supervisory authority within 72 hours (Art. 33)',
      'Data portability right applies to automated processing based on consent or contract (Art. 20)',
    ],
  },

  // =========================================================================
  // JAPAN
  // =========================================================================
  {
    id: 'JP_MHW21',
    name: 'PMDA MHW Ordinance No. 21 — Standards for Application of ERES',
    region: 'JP',
    authority: 'PMDA / MHLW',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'MHW Ordinance 21, Art. 4 — Audit trail retention period shall match the retention period of the primary record to which the trail pertains',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Tokyo'],
      },
      requiredLanguages: ['ja', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'local_timestamp_jst',
        'operator_role',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['JP'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'Act on Protection of Personal Information (APPI) Art. 28 — Cross-border transfer of personal data requires consent or an equivalent system',
    },
    notes: [
      'Electronic signatures must comply with the Japanese e-Signature Act (Act No. 102 of 2000)',
      'System validation required per MHW Ordinance 21 Art. 3',
      'Audit trail must record who, what, when, and why for every change',
      'Handwritten signature or seal may substitute electronic signature with documented justification',
    ],
  },
  {
    id: 'JP_JGCP',
    name: 'J-GCP — Japanese Good Clinical Practice (MHW Ordinance No. 28)',
    region: 'JP',
    authority: 'PMDA / MHLW',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'J-GCP Art. 41 — Essential documents shall be retained for 3 years after marketing approval or 5 years after discontinuation of clinical trial',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Tokyo'],
      },
      requiredLanguages: ['ja', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CDISC-ODM'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'trial_site_id',
        'investigator_id',
        'protocol_number',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['JP'],
      crossBorderTransferRequiresAdequacy: true,
      citation: 'APPI Art. 28 and J-GCP data management requirements',
    },
    notes: [
      'Sponsor must report ADRs to PMDA within 15 days (serious/unexpected) or 30 days (non-serious)',
      'Central IRB system permitted per 2019 Clinical Trials Act revision',
      'Informed consent documentation must include Japanese-language version',
    ],
  },
  {
    id: 'JP_GPSP',
    name: 'GPSP — Good Post-marketing Study Practice (MHW Ordinance No. 171)',
    region: 'JP',
    authority: 'PMDA / MHLW',
    domains: ['audit_trail', 'data_integrity', 'pharmacovigilance'],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'GPSP Ordinance No. 171 — Post-marketing study records must be retained for the re-examination period plus additional years',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Tokyo'],
      },
      requiredLanguages: ['ja', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'post_marketing_study_id',
        'safety_signal_flag',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['JP'],
      crossBorderTransferRequiresAdequacy: true,
      citation: 'APPI Art. 28',
    },
    notes: [
      'Re-examination period data must be collected per GPSP throughout the product lifecycle',
      'Safety reporting obligations continue throughout the product lifecycle',
      'Use-results surveys require protocol submission to PMDA',
    ],
  },

  // =========================================================================
  // CHINA
  // =========================================================================
  {
    id: 'CN_NMPA87',
    name: 'NMPA Order No. 87 — Good Clinical Practice for Drug Trials',
    region: 'CN',
    authority: 'NMPA (National Medical Products Administration)',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'data_residency',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'NMPA Order 87, Art. 69 — Essential documents shall be retained for at least 5 years after trial completion; 10 years recommended for marketing application support',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SM3',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Shanghai'],
      },
      requiredLanguages: ['zh', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'local_timestamp_cst',
        'nmpa_registration_number',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['CN'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'Cybersecurity Law Art. 37 — Critical information infrastructure operators must store personal information and important data within mainland China; Personal Information Protection Law (PIPL) Art. 38-39; Data Security Law Art. 31',
    },
    notes: [
      'SM3 hash algorithm preferred per Chinese cryptographic standards (GB/T 32905-2016)',
      'Clinical trial data generated in China must remain within Chinese borders unless a security assessment is passed',
      'NMPA filing required for cross-border data transfers per PIPL Art. 38',
      'Ethics committee approval must be obtained before any trial-related procedure',
    ],
  },
  {
    id: 'CN_GCP',
    name: 'China GCP — Good Clinical Practice (2020 Revision)',
    region: 'CN',
    authority: 'NMPA',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'China GCP (2020) Chapter IX — Document retention requirements align with NMPA Order 87',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SM3',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Shanghai'],
      },
      requiredLanguages: ['zh', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'ethics_committee_approval_id',
        'informed_consent_version',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['CN'],
      crossBorderTransferRequiresAdequacy: true,
      citation: 'PIPL Art. 38-39; Cybersecurity Law Art. 37',
    },
    notes: [
      'Ethics committee review and approval mandatory before any trial-related procedure',
      'Multi-regional clinical trial (MRCT) data generated in China is subject to strict data localization',
      'SUSAR reporting within 15 calendar days; fatal/life-threatening within 7 days with 8-day follow-up',
    ],
  },

  // =========================================================================
  // BRAZIL
  // =========================================================================
  {
    id: 'BR_RDC17',
    name: 'ANVISA RDC 17/2010 — Good Manufacturing Practice',
    region: 'BR',
    authority: 'ANVISA (Agencia Nacional de Vigilancia Sanitaria)',
    domains: ['audit_trail', 'data_integrity', 'change_control', 'validation'],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'RDC 17/2010, Art. 192 — Documentation shall be retained for at least 1 year after product shelf-life expiry; minimum 5 years for Active Pharmaceutical Ingredients',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['America/Sao_Paulo'],
      },
      requiredLanguages: ['pt', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'anvisa_registration_number',
        'batch_number',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['BR'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'LGPD (Lei Geral de Protecao de Dados) Art. 33 — International transfer of personal data is only permitted under enumerated conditions including adequacy determination',
    },
    notes: [
      'ANVISA inspection authority extends to computerized systems per RDC 17',
      'Brazil LGPD (effective 2020) imposes GDPR-like data protection obligations',
      'Annual product quality review (RPP — Revisao Periodica do Produto) required',
      'Self-inspection program must cover GMP compliance at least annually',
    ],
  },

  // =========================================================================
  // SOUTH KOREA
  // =========================================================================
  {
    id: 'KR_KGMP',
    name: 'MFDS KGMP — Korean Good Manufacturing Practice',
    region: 'KR',
    authority: 'MFDS (Ministry of Food and Drug Safety)',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'KGMP Standards — Records shall be retained for at least 5 years after product distribution; medical device records for 10 years',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Asia/Seoul'],
      },
      requiredLanguages: ['ko', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'mfds_permit_number',
        'quality_manager_id',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['KR'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'Personal Information Protection Act (PIPA) Art. 17 — Cross-border data transfer requires data subject consent and notification of receiving country',
    },
    notes: [
      'MFDS conducts GMP inspections every 3 years for Class II-IV medical devices',
      'Korean Electronic Signature Act (2020 revision) governs e-signature legal validity',
      'Post-market safety reporting to MFDS within 15 days for serious adverse events',
      'Korean-language labeling mandatory for all products marketed domestically',
    ],
  },

  // =========================================================================
  // AUSTRALIA
  // =========================================================================
  {
    id: 'AU_TGA',
    name: 'TGA — Therapeutic Goods Act 1989 & Therapeutic Goods Regulations',
    region: 'AU',
    authority: 'TGA (Therapeutic Goods Administration)',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'Therapeutic Goods Act 1989, s.35C; TGA Guidance — Record retention for at least 15 years for biologicals, 5 years minimum for other therapeutic goods',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'artg_number',
        'sponsor_name',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'Australian Privacy Act 1988, APP 8 — Cross-border disclosure of personal information requires reasonable steps to ensure the overseas recipient complies with Australian Privacy Principles',
    },
    notes: [
      'Australian Register of Therapeutic Goods (ARTG) listing required before supply',
      'PIC/S GMP Guide adopted by TGA for manufacturing standards',
      'Annual reporting of adverse events to TGA required for sponsors',
      'eCTD submissions accepted since 2012; mandatory for prescription medicines',
    ],
  },

  // =========================================================================
  // CANADA
  // =========================================================================
  {
    id: 'CA_HC',
    name: 'Health Canada C.05.012 — Good Manufacturing Practices',
    region: 'CA',
    authority: 'Health Canada / HPFBI',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'Food and Drug Regulations C.05.012 — Records shall be retained for at least 5 years after distribution of final lot; C.05.010 for API retention',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en', 'fr'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'din_number',
        'establishment_license_number',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'PIPEDA s. 4.1.3 — An organization is responsible for personal information in its possession or custody, including information that has been transferred to a third party for processing',
    },
    notes: [
      'Bilingual (English/French) labeling and records required by the Official Languages Act',
      'Health Canada eCTD submissions mandatory since 2018 for drug submissions',
      'PIPEDA applies to personal health information in the commercial sector',
      'Vanessa\'s Law (Protecting Canadians from Unsafe Drugs Act) expanded post-market powers',
    ],
  },
  {
    id: 'CA_PIPEDA',
    name: 'PIPEDA — Personal Information Protection and Electronic Documents Act',
    region: 'CA',
    authority: 'Office of the Privacy Commissioner of Canada',
    domains: ['audit_trail', 'data_integrity', 'data_residency'],
    auditRequirements: {
      retentionYears: 7,
      retentionCitation:
        'PIPEDA Principle 4.5 — Limiting Use, Disclosure, and Retention; standard limitation period of 6 years plus 1 year discovery',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: false,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: false,
        allowedTimezones: [],
      },
      requiredLanguages: ['en', 'fr'],
      exportFormats: ['JSON', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'consent_type',
        'processing_purpose',
        'data_controller_id',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'PIPEDA s. 4.1.3 — A comparable level of protection must be ensured when personal information is transferred across borders for processing',
    },
    notes: [
      'Breach notification mandatory under PIPEDA Digital Privacy Act (effective Nov 2018)',
      'Provincial privacy laws (e.g., Quebec Law 25) may impose stricter data protection requirements',
      'Individual access request must be responded to within 30 days',
    ],
  },

  // =========================================================================
  // UNITED KINGDOM
  // =========================================================================
  {
    id: 'GB_MHRA',
    name: 'MHRA — Medicines and Healthcare products Regulatory Agency GxP',
    region: 'GB',
    authority: 'MHRA',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'MHRA GxP Data Integrity Guidance (2018) — Retention period aligned with marketing authorisation lifecycle; batch records retained for 1 year after expiry or 5 years after QP certification',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'data_integrity_risk_level',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'UK GDPR Art. 44-49 — Adequate level of protection required for transfers outside UK; UK adequacy regulations apply post-Brexit',
    },
    notes: [
      'MHRA ALCOA+ principles: Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available',
      'Post-Brexit: UK operates an independent regulatory framework but continues to recognise PIC/S GMP standards',
      'MHRA Data Integrity Guidance (2018) applies to all GxP regulated data and computerised systems',
      'MHRA Yellow Card Scheme for adverse reaction reporting',
    ],
  },
  {
    id: 'GB_UKGDPR',
    name: 'UK GDPR — UK General Data Protection Regulation',
    region: 'GB',
    authority: 'ICO (Information Commissioner\'s Office)',
    domains: ['audit_trail', 'data_integrity', 'data_residency'],
    auditRequirements: {
      retentionYears: 6,
      retentionCitation:
        'UK GDPR Art. 5(1)(e) — Storage limitation principle; Limitation Act 1980 six-year limitation period for civil claims',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: false,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['JSON', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'data_subject_category',
        'processing_purpose',
        'legal_basis',
        'data_controller_id',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['GB', 'EU', 'EEA'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'UK GDPR Art. 44-49; UK adequacy regulations for international data transfers; EU-UK adequacy decision effective 28 June 2021',
    },
    notes: [
      'ICO breach reporting within 72 hours of becoming aware',
      'EU-UK adequacy decision grants mutual recognition for data transfers',
      'DPIA required for processing likely to result in high risk to individuals',
      'UK International Data Transfer Agreement (IDTA) replaces SCCs for UK transfers',
    ],
  },

  // =========================================================================
  // SWITZERLAND
  // =========================================================================
  {
    id: 'CH_SWISSMEDIC',
    name: 'Swissmedic — HMG / VAM Regulatory Framework',
    region: 'CH',
    authority: 'Swissmedic (Swiss Agency for Therapeutic Products)',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'HMG (Heilmittelgesetz) Art. 18; VAM (Verordnung uber die Arzneimittel) — Record retention aligned with EU GMP Annex 11 requirements and marketing authorisation lifecycle',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: ['Europe/Zurich'],
      },
      requiredLanguages: ['de', 'fr', 'it', 'en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'swissmedic_authorization_number',
      ],
    },
    dataResidency: {
      restricted: true,
      allowedRegions: ['CH', 'EU', 'EEA'],
      crossBorderTransferRequiresAdequacy: true,
      citation:
        'revDSG (revised Federal Act on Data Protection, effective 1 Sept 2023) Art. 16-17 — Cross-border transfer requires adequate level of protection as determined by the Federal Council',
    },
    notes: [
      'Switzerland is a PIC/S member state; adopts PIC/S GMP Guide for manufacturing standards',
      'Four official languages (de, fr, it, rm) may apply to product information and submissions',
      'Mutual Recognition Agreement with the EU for GMP inspections remains in force',
      'revDSG (effective Sept 2023) aligns closely with GDPR provisions',
    ],
  },

  // =========================================================================
  // ICH (International)
  // =========================================================================
  {
    id: 'ICH_E6R3',
    name: 'ICH E6(R3) — Good Clinical Practice',
    region: 'INTL',
    authority: 'ICH (International Council for Harmonisation)',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'ICH E6(R3) Section 4 — Essential documents shall be retained for at least 15 years or as required by applicable regulatory requirements, whichever is longer',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CDISC-ODM', 'eCTD-XML'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'protocol_number',
        'site_id',
        'investigator_id',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation:
        'ICH E6(R3) does not impose data residency requirements but defers to local regulatory requirements in each ICH member region',
    },
    notes: [
      'Risk-based approach to quality management introduced in E6(R2), expanded in E6(R3)',
      'Proportionate monitoring based on risk assessment rather than prescriptive on-site monitoring',
      'Technology-neutral approach to data capture and management systems',
      'Applicable in all ICH member and observer regions (US, EU, JP, CA, CH, BR, KR, AU, CN, SG, etc.)',
    ],
  },
  {
    id: 'ICH_E8R1',
    name: 'ICH E8(R1) — General Considerations for Clinical Studies',
    region: 'INTL',
    authority: 'ICH',
    domains: ['audit_trail', 'data_integrity', 'change_control'],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'ICH E8(R1) — Quality by design for clinical studies; retention period defers to local regulatory requirements',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: false,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CDISC-ODM'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'study_design_type',
        'critical_to_quality_factor',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation: 'Defers to local regulation in each member jurisdiction',
    },
    notes: [
      'Emphasis on identifying factors Critical to Quality (CtQ) of clinical studies',
      'Stakeholder engagement throughout the study lifecycle',
      'Study design should be proportionate to the risks to participants and data reliability',
    ],
  },
  {
    id: 'ICH_E9R1',
    name: 'ICH E9(R1) — Statistical Principles: Estimands and Sensitivity Analysis',
    region: 'INTL',
    authority: 'ICH',
    domains: ['audit_trail', 'data_integrity'],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'ICH E9(R1) — Audit trail for statistical analysis datasets and estimand definitions per local regulatory requirements',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: false,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CDISC-ODM', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'estimand_id',
        'analysis_dataset_version',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation: 'Defers to local regulation in each member jurisdiction',
    },
    notes: [
      'Estimand framework requires clear documentation of intercurrent events and their handling strategies',
      'All amendments to the statistical analysis plan must be documented with audit trail',
      'Sensitivity analyses should evaluate robustness of primary analysis conclusions',
    ],
  },

  // =========================================================================
  // WHO
  // =========================================================================
  {
    id: 'WHO_PQ',
    name: 'WHO Prequalification — Pharmaceutical/Vaccine/Diagnostic Standards',
    region: 'INTL',
    authority: 'WHO (World Health Organization)',
    domains: [
      'audit_trail',
      'data_integrity',
      'pharmacovigilance',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 10,
      retentionCitation:
        'WHO TRS 996 Annex 5 — GMP for pharmaceutical products; documentation including records and reports shall be retained for not less than 5 years after expiry date of product; 10 years recommended',
      electronicSignaturesRequired: false,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'who_pq_listing_number',
        'product_dossier_id',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation:
        'WHO PQ does not impose data residency requirements; however, local laws of the manufacturing site jurisdiction apply',
    },
    notes: [
      'WHO PQ listing is required for UN procurement (UNICEF Supply Division, Global Fund, etc.)',
      'Inspections conducted by WHO or WHO-designated NRAs from member states',
      'WHO TRS 996 Annex 5 aligns with PIC/S GMP Guide PE 009',
      'Pharmacovigilance requirements per WHO TRS 996 Annex 10',
    ],
  },

  // =========================================================================
  // PIC/S
  // =========================================================================
  {
    id: 'PICS_GMP',
    name: 'PIC/S GMP Guide — Pharmaceutical Inspection Co-operation Scheme',
    region: 'INTL',
    authority: 'PIC/S (Pharmaceutical Inspection Co-operation Scheme)',
    domains: [
      'audit_trail',
      'e_signatures',
      'data_integrity',
      'change_control',
      'validation',
    ],
    auditRequirements: {
      retentionYears: 15,
      retentionCitation:
        'PIC/S Guide to GMP PE 009-16, Chapter 4 — Documentation shall be retained for at least 1 year after product expiry date; clinical trial and stability data retained for at least 5 years after formal batch release or certification',
      electronicSignaturesRequired: true,
      hashAlgorithm: 'SHA-256',
      reasonForChangeRequired: true,
      timestamp: {
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
        utcRequired: true,
        localTimeRequired: true,
        allowedTimezones: [],
      },
      requiredLanguages: ['en'],
      exportFormats: ['PDF/A-2', 'XML', 'CSV'],
      mandatoryFields: [
        ...BASE_AUDIT_FIELDS,
        'reason_for_change',
        'electronic_signature_id',
        'batch_number',
        'gmp_certificate_reference',
      ],
    },
    dataResidency: {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: false,
      citation:
        'PIC/S does not impose data residency requirements; member states\' national laws apply',
    },
    notes: [
      'PIC/S Annex 11 mirrors EU GMP Annex 11 for computerised systems validation and data integrity',
      'PI 041-1 — Good Practices for Data Management and Integrity in Regulated GMP/GDP Environments (2021)',
      '54 participating authorities worldwide as of 2024',
      'ALCOA+ principles (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available) are foundational',
    ],
  },
];

// ---------------------------------------------------------------------------
// Internal lookup index for fast region-based queries
// ---------------------------------------------------------------------------

const frameworksByRegion: Map<string, RegulatoryFramework[]> = new Map();

for (const fw of REGULATORY_FRAMEWORKS) {
  const existing = frameworksByRegion.get(fw.region) ?? [];
  existing.push(fw as RegulatoryFramework);
  frameworksByRegion.set(fw.region, existing);
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

/**
 * Returns all regulatory frameworks applicable to the given set of regions.
 *
 * International frameworks (ICH, WHO, PIC/S) are always included because
 * harmonised guidelines apply universally regardless of target market.
 *
 * @param regions - Array of ISO 3166-1 alpha-2 region codes (e.g., ['US', 'EU', 'JP'])
 * @returns Array of applicable RegulatoryFramework objects
 */
export function getApplicableFrameworks(regions: string[]): RegulatoryFramework[] {
  const normalised = new Set(regions.map((r) => r.toUpperCase()));
  // International frameworks always apply
  normalised.add('INTL');

  const result: RegulatoryFramework[] = [];
  const seen = new Set<string>();

  for (const region of normalised) {
    const frameworks = frameworksByRegion.get(region);
    if (frameworks) {
      for (const fw of frameworks) {
        if (!seen.has(fw.id)) {
          seen.add(fw.id);
          result.push(fw);
        }
      }
    }
  }

  return result;
}

/**
 * Validates an audit configuration against all frameworks applicable to
 * the specified regions and returns a detailed gap analysis.
 *
 * The analysis checks:
 *  - Retention period sufficiency
 *  - Electronic signature enablement
 *  - Hash algorithm compatibility (including SM3 for China)
 *  - Reason-for-change capture
 *  - UTC storage and local time recording
 *  - Language support completeness
 *  - Export format coverage
 *  - Mandatory audit field presence
 *  - Data residency compliance
 *  - Cross-border transfer adequacy
 *
 * @param regions - Target region codes
 * @param auditConfig - Current audit system configuration to validate
 * @returns Detailed ComplianceGapAnalysis with per-framework gap breakdown
 */
export function validateComplianceForRegions(
  regions: string[],
  auditConfig: AuditConfig,
): ComplianceGapAnalysis {
  const frameworks = getApplicableFrameworks(regions);
  const gaps: ComplianceGap[] = [];

  for (const fw of frameworks) {
    const req = fw.auditRequirements;

    // --- Retention period ---
    if (
      auditConfig.retentionYears !== undefined &&
      auditConfig.retentionYears < req.retentionYears
    ) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        field: 'retentionYears',
        requirement: `Minimum ${req.retentionYears} years retention required`,
        currentValue: auditConfig.retentionYears,
        severity: 'critical',
        citation: req.retentionCitation,
        remediation: `Increase audit trail retention period to at least ${req.retentionYears} years to satisfy ${fw.name}`,
      });
    }

    // --- Electronic signatures ---
    if (
      req.electronicSignaturesRequired &&
      auditConfig.electronicSignaturesEnabled === false
    ) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        field: 'electronicSignaturesEnabled',
        requirement: 'Electronic signatures must be enabled',
        currentValue: false,
        severity: 'critical',
        citation: `${fw.name} mandates electronic signatures on audit records`,
        remediation: `Enable electronic signature capabilities to comply with ${fw.name}`,
      });
    }

    // --- Hash algorithm (SM3 requirement for China) ---
    if (auditConfig.hashAlgorithm !== undefined) {
      const isChinaFramework =
        fw.region === 'CN' && req.hashAlgorithm === 'SM3';
      if (isChinaFramework && auditConfig.hashAlgorithm !== 'SM3') {
        gaps.push({
          frameworkId: fw.id,
          frameworkName: fw.name,
          field: 'hashAlgorithm',
          requirement: `Hash algorithm must be SM3 per GB/T 32905-2016`,
          currentValue: auditConfig.hashAlgorithm,
          severity: 'critical',
          citation:
            'GB/T 32905-2016 (SM3 Cryptographic Hash Algorithm) required by NMPA for data within Chinese jurisdiction',
          remediation:
            'Implement SM3 hash algorithm for China-destined data; consider a dual-hash strategy (SM3 + SHA-256) for multi-region compliance',
        });
      }
    }

    // --- Reason for change ---
    if (
      req.reasonForChangeRequired &&
      auditConfig.reasonForChangeEnabled === false
    ) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        field: 'reasonForChangeEnabled',
        requirement:
          'A reason for change must be captured on every data modification',
        currentValue: false,
        severity: 'critical',
        citation: `${fw.name} requires recording the rationale for each change to GxP-relevant data`,
        remediation:
          'Enable mandatory reason-for-change capture in the audit trail configuration',
      });
    }

    // --- UTC timestamp storage ---
    if (req.timestamp.utcRequired && auditConfig.utcStorage === false) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        field: 'utcStorage',
        requirement: 'Timestamps must be stored in Coordinated Universal Time (UTC)',
        currentValue: false,
        severity: 'major',
        citation: `${fw.name} requires UTC timestamp storage for audit trail records`,
        remediation:
          'Configure the audit system to store all timestamps in UTC format',
      });
    }

    // --- Local time recording alongside UTC ---
    if (
      req.timestamp.localTimeRequired &&
      auditConfig.localTimeRecorded === false
    ) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        field: 'localTimeRecorded',
        requirement:
          'Local time must be recorded alongside UTC for audit traceability',
        currentValue: false,
        severity: 'major',
        citation: `${fw.name} requires local timestamp recording in addition to UTC`,
        remediation:
          'Enable local time recording alongside UTC storage in the audit configuration',
      });
    }

    // --- Language requirements ---
    if (
      auditConfig.supportedLanguages !== undefined &&
      req.requiredLanguages.length > 0
    ) {
      const configLangs = new Set(
        auditConfig.supportedLanguages.map((l) => l.toLowerCase()),
      );
      const missingLangs = req.requiredLanguages.filter(
        (l) => !configLangs.has(l.toLowerCase()),
      );
      if (missingLangs.length > 0) {
        gaps.push({
          frameworkId: fw.id,
          frameworkName: fw.name,
          field: 'supportedLanguages',
          requirement: `Audit records must be available in: ${req.requiredLanguages.join(', ')}`,
          currentValue: auditConfig.supportedLanguages.join(', '),
          severity: 'major',
          citation: `${fw.name} language requirements for audit trail records`,
          remediation: `Add support for the following missing languages: ${missingLangs.join(', ')}`,
        });
      }
    }

    // --- Export formats ---
    if (
      auditConfig.exportFormats !== undefined &&
      req.exportFormats.length > 0
    ) {
      const configFormats = new Set(auditConfig.exportFormats);
      const missingFormats = req.exportFormats.filter(
        (f) => !configFormats.has(f),
      );
      if (missingFormats.length > 0) {
        gaps.push({
          frameworkId: fw.id,
          frameworkName: fw.name,
          field: 'exportFormats',
          requirement: `Required export formats: ${req.exportFormats.join(', ')}`,
          currentValue: auditConfig.exportFormats.join(', '),
          severity: 'minor',
          citation: `${fw.name} data export format requirements`,
          remediation: `Implement support for the following missing export formats: ${missingFormats.join(', ')}`,
        });
      }
    }

    // --- Mandatory audit fields ---
    if (
      auditConfig.auditFields !== undefined &&
      req.mandatoryFields.length > 0
    ) {
      const configFields = new Set(auditConfig.auditFields);
      const missingFields = req.mandatoryFields.filter(
        (f) => !configFields.has(f),
      );
      if (missingFields.length > 0) {
        const criticalFields = [
          'electronic_signature_id',
          'reason_for_change',
          'timestamp_utc',
          'user_id',
          'record_id',
        ];
        const hasCriticalMissing = missingFields.some((f) =>
          criticalFields.includes(f),
        );
        gaps.push({
          frameworkId: fw.id,
          frameworkName: fw.name,
          field: 'auditFields',
          requirement: `Mandatory audit record fields: ${req.mandatoryFields.join(', ')}`,
          currentValue: auditConfig.auditFields.join(', '),
          severity: hasCriticalMissing ? 'critical' : 'major',
          citation: `${fw.name} audit record field requirements`,
          remediation: `Add the following mandatory fields to audit records: ${missingFields.join(', ')}`,
        });
      }
    }

    // --- Data residency ---
    if (fw.dataResidency.restricted) {
      if (
        auditConfig.dataResidencyRegions !== undefined &&
        auditConfig.dataResidencyRegions.length > 0
      ) {
        const allowedSet = new Set(
          fw.dataResidency.allowedRegions.map((r) => r.toUpperCase()),
        );
        const violations = auditConfig.dataResidencyRegions.filter(
          (r) => !allowedSet.has(r.toUpperCase()),
        );
        if (violations.length > 0) {
          gaps.push({
            frameworkId: fw.id,
            frameworkName: fw.name,
            field: 'dataResidencyRegions',
            requirement: `Data must reside within: ${fw.dataResidency.allowedRegions.join(', ')}`,
            currentValue: auditConfig.dataResidencyRegions.join(', '),
            severity: 'critical',
            citation: fw.dataResidency.citation,
            remediation: `Data is stored in non-compliant regions (${violations.join(', ')}). Migrate or replicate data to permitted regions: ${fw.dataResidency.allowedRegions.join(', ')}`,
          });
        }
      }

      if (
        fw.dataResidency.crossBorderTransferRequiresAdequacy &&
        auditConfig.crossBorderAdequacy === false
      ) {
        gaps.push({
          frameworkId: fw.id,
          frameworkName: fw.name,
          field: 'crossBorderAdequacy',
          requirement:
            'Cross-border data transfer requires an adequacy decision or equivalent safeguards (SCCs, BCRs)',
          currentValue: false,
          severity: 'critical',
          citation: fw.dataResidency.citation,
          remediation:
            'Establish an adequacy decision, Standard Contractual Clauses (SCCs), or Binding Corporate Rules (BCRs) before initiating cross-border data transfers',
        });
      }
    }
  }

  const criticalCount = gaps.filter((g) => g.severity === 'critical').length;
  const majorCount = gaps.filter((g) => g.severity === 'major').length;
  const minorCount = gaps.filter((g) => g.severity === 'minor').length;

  return {
    regions,
    applicableFrameworks: frameworks.map((f) => f.id),
    totalGaps: gaps.length,
    criticalGaps: criticalCount,
    majorGaps: majorCount,
    minorGaps: minorCount,
    gaps,
    compliant: gaps.length === 0,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Returns the most stringent consolidated audit trail requirements for a
 * given region by merging all applicable frameworks and selecting the
 * strictest value for each parameter.
 *
 * - Retention: maximum across all frameworks
 * - Languages: union of all required languages
 * - Mandatory fields: union of all mandatory fields
 * - Export formats: union of all required formats
 * - Electronic signatures: required if ANY framework mandates them
 * - Hash algorithm: region-specific algorithm takes precedence (e.g., SM3 for CN)
 * - Data residency: intersection of allowed regions for the most restrictive outcome
 *
 * @param region - ISO 3166-1 alpha-2 region code
 * @returns Consolidated RegionalAuditRequirements
 * @throws Error if the region has no applicable frameworks
 */
export function getRegionalAuditRequirements(
  region: string,
): RegionalAuditRequirements {
  const normalised = region.toUpperCase();
  const frameworks = getApplicableFrameworks([normalised]);

  if (frameworks.length === 0) {
    throw new Error(
      `No regulatory frameworks found for region "${region}". Supported regions: ${SUPPORTED_REGIONS.join(', ')}`,
    );
  }

  // Most stringent (maximum) retention period
  const retentionYears = Math.max(
    ...frameworks.map((f) => f.auditRequirements.retentionYears),
  );

  // Union of all required languages
  const requiredLanguages = [
    ...new Set(
      frameworks.flatMap((f) => f.auditRequirements.requiredLanguages),
    ),
  ];

  // Most restrictive timestamp rules
  const utcRequired = frameworks.some(
    (f) => f.auditRequirements.timestamp.utcRequired,
  );
  const localTimeRequired = frameworks.some(
    (f) => f.auditRequirements.timestamp.localTimeRequired,
  );
  const allowedTimezones = [
    ...new Set(
      frameworks.flatMap((f) => f.auditRequirements.timestamp.allowedTimezones),
    ),
  ];

  const timestampRules: TimestampRequirement = {
    format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    utcRequired,
    localTimeRequired,
    allowedTimezones,
  };

  // Union of all mandatory fields
  const mandatoryFields = [
    ...new Set(
      frameworks.flatMap((f) => f.auditRequirements.mandatoryFields),
    ),
  ];

  // Union of all export formats
  const exportFormats = [
    ...new Set(
      frameworks.flatMap((f) => f.auditRequirements.exportFormats),
    ),
  ] as ExportFormat[];

  // E-signatures required if any framework requires them
  const electronicSignaturesRequired = frameworks.some(
    (f) => f.auditRequirements.electronicSignaturesRequired,
  );

  // Hash algorithm: prefer region-specific (e.g., SM3 for CN)
  const regionFrameworks = frameworks.filter((f) => f.region === normalised);
  let hashAlgorithm: HashAlgorithm = 'SHA-256';
  if (regionFrameworks.length > 0) {
    hashAlgorithm = regionFrameworks[0].auditRequirements.hashAlgorithm;
  }

  // Data residency: most restrictive (intersection of allowed regions)
  const restrictedFrameworks = frameworks.filter(
    (f) => f.dataResidency.restricted,
  );
  let dataResidency: DataResidencyRequirement;

  if (restrictedFrameworks.length > 0) {
    const allAllowedSets = restrictedFrameworks.map(
      (f) => new Set(f.dataResidency.allowedRegions.map((r) => r.toUpperCase())),
    );
    // Intersection: only regions allowed by ALL restricted frameworks
    const intersected = [...allAllowedSets[0]].filter((r) =>
      allAllowedSets.every((s) => s.has(r)),
    );

    dataResidency = {
      restricted: true,
      allowedRegions: intersected,
      crossBorderTransferRequiresAdequacy: restrictedFrameworks.some(
        (f) => f.dataResidency.crossBorderTransferRequiresAdequacy,
      ),
      citation: restrictedFrameworks
        .map((f) => f.dataResidency.citation)
        .join('; '),
    };
  } else {
    dataResidency = {
      restricted: false,
      allowedRegions: [],
      crossBorderTransferRequiresAdequacy: frameworks.some(
        (f) => f.dataResidency.crossBorderTransferRequiresAdequacy,
      ),
      citation:
        'No data residency restrictions imposed by applicable frameworks',
    };
  }

  return {
    region: normalised,
    frameworks: frameworks.map((f) => f.id),
    retentionYears,
    requiredLanguages,
    timestampRules,
    mandatoryFields,
    exportFormats,
    electronicSignaturesRequired,
    hashAlgorithm,
    dataResidency,
  };
}
