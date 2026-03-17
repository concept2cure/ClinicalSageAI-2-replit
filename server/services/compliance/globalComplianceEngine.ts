/**
 * Global Regulatory Compliance Engine
 *
 * Master orchestrator defining all supported regulatory frameworks and their
 * specific audit/compliance requirements across global markets.
 *
 * Supported regulatory authorities:
 *   US (FDA), EU (EMA), Japan (PMDA), China (NMPA), Brazil (ANVISA),
 *   Korea (MFDS), Australia (TGA), Canada (Health Canada), UK (MHRA),
 *   Switzerland (Swissmedic), ICH, WHO PQ, PIC/S
 *
 * @module server/services/compliance/globalComplianceEngine
 */

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface RegulatoryFramework {
  id: string;
  name: string;
  region: string;
  authority: string;
  regulation: string;
  domains: ComplianceDomain[];
  requirements: FrameworkRequirements;
}

export type ComplianceDomain =
  | 'audit_trail'
  | 'e_signatures'
  | 'data_integrity'
  | 'data_residency'
  | 'pharmacovigilance'
  | 'change_control'
  | 'validation'
  | 'privacy'
  | 'gmp'
  | 'gcp'
  | 'safety_reporting';

export interface FrameworkRequirements {
  auditRetentionYears: number;
  eSignatureRequired: boolean;
  hashAlgorithm: string;
  dataResidencyRequired: boolean;
  dataResidencyRegion?: string;
  timestampFormat: string;
  timezoneRule: string;
  requiredLanguages: string[];
  exportFormats: string[];
  mandatoryAuditFields: string[];
  safetyReportingDeadlineDays?: { fatal: number; serious: number; routine: number };
  specificRegulations: string[];
}

export interface RegionalAuditRequirements {
  retentionYears: number;
  languages: string[];
  timezoneRule: string;
  eSignatureRequired: boolean;
  hashAlgorithm: string;
  exportFormats: string[];
  mandatoryFields: string[];
  dataResidencyRequired: boolean;
  dataResidencyRegion?: string;
  additionalRequirements: string[];
}

export interface ComplianceGapAnalysis {
  compliant: boolean;
  score: number; // 0-100
  gaps: ComplianceGap[];
  recommendations: string[];
  frameworksCovered: string[];
  frameworksMissing: string[];
}

export interface ComplianceGap {
  frameworkId: string;
  frameworkName: string;
  domain: ComplianceDomain;
  requirement: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
}

// ---------------------------------------------------------------------------
// SUPPORTED REGIONS
// ---------------------------------------------------------------------------

export const SUPPORTED_REGIONS: Record<string, string> = {
  US: 'United States (FDA)',
  EU: 'European Union (EMA)',
  JP: 'Japan (PMDA)',
  CN: 'China (NMPA)',
  BR: 'Brazil (ANVISA)',
  KR: 'Korea (MFDS)',
  AU: 'Australia (TGA)',
  CA: 'Canada (Health Canada)',
  UK: 'United Kingdom (MHRA)',
  CH: 'Switzerland (Swissmedic)',
  IN: 'India (CDSCO)',
  MX: 'Mexico (COFEPRIS)',
  ZA: 'South Africa (SAHPRA)',
  SG: 'Singapore (HSA)',
  IL: 'Israel (MOH)',
  SA: 'Saudi Arabia (SFDA)',
  AE: 'UAE (MOH)',
  WHO: 'WHO Prequalification',
  ICH: 'ICH (Harmonised Guidelines)',
  PICS: 'PIC/S (GMP)',
};

// ---------------------------------------------------------------------------
// REGULATORY FRAMEWORKS
// ---------------------------------------------------------------------------

const FRAMEWORKS: RegulatoryFramework[] = [
  // ── US ──
  {
    id: '21CFR11',
    name: '21 CFR Part 11 — Electronic Records & Signatures',
    region: 'US',
    authority: 'FDA',
    regulation: '21 CFR Part 11',
    domains: ['audit_trail', 'e_signatures', 'data_integrity', 'validation', 'change_control'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'server_authoritative',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'json', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'previous_value', 'new_value', 'reason', 'ip_address'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['21 CFR 11.10(e)', '21 CFR 11.50', '21 CFR 11.70', '21 CFR 11.100'],
    },
  },
  {
    id: '21CFR820',
    name: '21 CFR Part 820 — Quality System Regulation',
    region: 'US',
    authority: 'FDA',
    regulation: '21 CFR Part 820',
    domains: ['gmp', 'change_control', 'validation', 'audit_trail'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'server_authoritative',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'device_id', 'lot_number'],
      specificRegulations: ['21 CFR 820.184', '21 CFR 820.198'],
    },
  },
  // ── EU ──
  {
    id: 'EU_ANNEX11',
    name: 'EU Annex 11 — Computerised Systems',
    region: 'EU',
    authority: 'EMA',
    regulation: 'EudraLex Volume 4 Annex 11',
    domains: ['audit_trail', 'e_signatures', 'data_integrity', 'validation', 'change_control'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC_with_local',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'json', 'pdf', 'xml'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'previous_value', 'new_value', 'reason'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 90 },
      specificRegulations: ['Annex 11 §7', 'Annex 11 §9', 'Annex 11 §12', 'Annex 11 §14'],
    },
  },
  {
    id: 'EU_MDR',
    name: 'EU MDR 2017/745 — Medical Device Regulation',
    region: 'EU',
    authority: 'EMA / Notified Bodies',
    regulation: 'Regulation (EU) 2017/745',
    domains: ['audit_trail', 'safety_reporting', 'change_control', 'gmp'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'CET',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf', 'xml'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'udi', 'device_class'],
      safetyReportingDeadlineDays: { fatal: 10, serious: 15, routine: 30 },
      specificRegulations: ['MDR Art. 87', 'MDR Art. 92', 'MDR Annex XIV'],
    },
  },
  {
    id: 'GDPR',
    name: 'GDPR — General Data Protection Regulation',
    region: 'EU',
    authority: 'National DPAs',
    regulation: 'Regulation (EU) 2016/679',
    domains: ['privacy', 'data_integrity', 'audit_trail', 'data_residency'],
    requirements: {
      auditRetentionYears: 10,
      eSignatureRequired: false,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: true,
      dataResidencyRegion: 'EU/EEA',
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'json', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'lawful_basis', 'data_category'],
      specificRegulations: ['Art. 5(1)(f)', 'Art. 25', 'Art. 30', 'Art. 32', 'Art. 33', 'Art. 35'],
    },
  },
  {
    id: 'EU_IVDR',
    name: 'EU IVDR 2017/746 — In Vitro Diagnostic Regulation',
    region: 'EU',
    authority: 'EMA / Notified Bodies',
    regulation: 'Regulation (EU) 2017/746',
    domains: ['audit_trail', 'safety_reporting', 'gmp'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'CET',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf', 'xml'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'udi', 'risk_class'],
      safetyReportingDeadlineDays: { fatal: 10, serious: 15, routine: 30 },
      specificRegulations: ['IVDR Art. 82', 'IVDR Annex XIII'],
    },
  },
  // ── Japan ──
  {
    id: 'PMDA_ORD21',
    name: 'MHW Ordinance No. 21 — GMP for Drugs',
    region: 'JP',
    authority: 'PMDA',
    regulation: 'MHW Ministerial Ordinance No. 21',
    domains: ['audit_trail', 'e_signatures', 'data_integrity', 'validation', 'gmp'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'JST',
      requiredLanguages: ['en', 'ja'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'previous_value', 'new_value'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['Ordinance 21 Art. 20', 'J-GCP Art. 48', 'GPSP Ordinance'],
    },
  },
  // ── China ──
  {
    id: 'NMPA_ORDER87',
    name: 'NMPA Order 87 — Drug Administration',
    region: 'CN',
    authority: 'NMPA',
    regulation: 'NMPA Order No. 87',
    domains: ['audit_trail', 'data_integrity', 'data_residency', 'gcp'],
    requirements: {
      auditRetentionYears: 30,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: true,
      dataResidencyRegion: 'CN',
      timestampFormat: 'ISO 8601',
      timezoneRule: 'CST',
      requiredLanguages: ['en', 'zh'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'data_category'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['China GCP Art. 31', 'NMPA Order 87 Art. 42', 'Cybersecurity Law Art. 37'],
    },
  },
  // ── Brazil ──
  {
    id: 'ANVISA_RDC17',
    name: 'ANVISA RDC 17/2010 — GMP',
    region: 'BR',
    authority: 'ANVISA',
    regulation: 'RDC 17/2010',
    domains: ['audit_trail', 'data_integrity', 'gmp', 'validation'],
    requirements: {
      auditRetentionYears: 20,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'BRT',
      requiredLanguages: ['en', 'pt'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'gmp_certificate'],
      specificRegulations: ['RDC 17/2010', 'RDC 204/2017', 'LGPD'],
    },
  },
  // ── Korea ──
  {
    id: 'MFDS_KGMP',
    name: 'MFDS KGMP — Korean GMP',
    region: 'KR',
    authority: 'MFDS',
    regulation: 'KGMP',
    domains: ['audit_trail', 'data_integrity', 'gmp', 'validation'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'KST',
      requiredLanguages: ['en', 'ko'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['KGMP', 'Pharmaceutical Affairs Act'],
    },
  },
  // ── Australia ──
  {
    id: 'TGA_TGA89',
    name: 'TGA — Therapeutic Goods Act 1989',
    region: 'AU',
    authority: 'TGA',
    regulation: 'Therapeutic Goods Act 1989',
    domains: ['audit_trail', 'data_integrity', 'safety_reporting', 'gmp'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'AEST',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'artg_number'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['TG Act 1989', 'TGO 91', 'PIC/S PE 009-16'],
    },
  },
  // ── Canada ──
  {
    id: 'HC_C05012',
    name: 'Health Canada C.05.012 — Records',
    region: 'CA',
    authority: 'Health Canada',
    regulation: 'Food and Drug Regulations C.05.012',
    domains: ['audit_trail', 'data_integrity', 'validation', 'privacy'],
    requirements: {
      auditRetentionYears: 25,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'ET',
      requiredLanguages: ['en', 'fr'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'din'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['C.05.012', 'PIPEDA', 'Guidance on eCTD'],
    },
  },
  // ── UK ──
  {
    id: 'MHRA_UKGDPR',
    name: 'MHRA / UK GDPR — Post-Brexit Compliance',
    region: 'UK',
    authority: 'MHRA',
    regulation: 'UK MDR 2002, UK GDPR',
    domains: ['audit_trail', 'e_signatures', 'data_integrity', 'privacy', 'data_residency'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: true,
      dataResidencyRegion: 'UK',
      timestampFormat: 'ISO 8601',
      timezoneRule: 'GMT',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'json', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'previous_value', 'new_value', 'reason'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['UK MDR 2002 SI 618', 'UK GDPR', 'MHRA GXP Data Integrity Guidance'],
    },
  },
  // ── Switzerland ──
  {
    id: 'SWISSMEDIC_HMG',
    name: 'Swissmedic — Heilmittelgesetz (HMG)',
    region: 'CH',
    authority: 'Swissmedic',
    regulation: 'HMG/VAM',
    domains: ['audit_trail', 'data_integrity', 'gmp', 'validation'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'CET',
      requiredLanguages: ['en', 'de', 'fr'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action'],
      specificRegulations: ['HMG Art. 3', 'VAM Art. 5', 'AMBV'],
    },
  },
  // ── ICH ──
  {
    id: 'ICH_E6R3',
    name: 'ICH E6(R3) — Good Clinical Practice',
    region: 'ICH',
    authority: 'ICH',
    regulation: 'ICH E6(R3)',
    domains: ['audit_trail', 'data_integrity', 'gcp', 'safety_reporting'],
    requirements: {
      auditRetentionYears: 25,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'json', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'study_id', 'site_id'],
      safetyReportingDeadlineDays: { fatal: 7, serious: 15, routine: 30 },
      specificRegulations: ['ICH E6(R3) 5.5.3', 'ICH E6(R3) 5.18.6', 'ICH E2A'],
    },
  },
  {
    id: 'ICH_E2BR3',
    name: 'ICH E2B(R3) — Individual Case Safety Reports',
    region: 'ICH',
    authority: 'ICH',
    regulation: 'ICH E2B(R3)',
    domains: ['safety_reporting', 'pharmacovigilance', 'data_integrity'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: false,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC',
      requiredLanguages: ['en'],
      exportFormats: ['xml', 'json'],
      mandatoryAuditFields: ['worldwide_unique_id', 'sender', 'receiver', 'report_type'],
      specificRegulations: ['ICH E2B(R3)', 'ICH M2 EWG'],
    },
  },
  // ── WHO ──
  {
    id: 'WHO_PQ',
    name: 'WHO Prequalification',
    region: 'WHO',
    authority: 'WHO',
    regulation: 'WHO Prequalification Programme',
    domains: ['audit_trail', 'gmp', 'data_integrity'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: false,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action'],
      specificRegulations: ['WHO TRS 986 Annex 2', 'WHO TRS 996 Annex 5'],
    },
  },
  // ── PIC/S ──
  {
    id: 'PICS_GMP',
    name: 'PIC/S GMP Guide',
    region: 'PICS',
    authority: 'PIC/S',
    regulation: 'PIC/S PE 009-16',
    domains: ['gmp', 'data_integrity', 'audit_trail', 'validation'],
    requirements: {
      auditRetentionYears: 15,
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      dataResidencyRequired: false,
      timestampFormat: 'ISO 8601',
      timezoneRule: 'UTC',
      requiredLanguages: ['en'],
      exportFormats: ['csv', 'pdf'],
      mandatoryAuditFields: ['user_id', 'timestamp', 'action', 'reason'],
      specificRegulations: ['PE 009-16 Annex 11', 'PI 041-1 Data Integrity'],
    },
  },
];

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Get all regulatory frameworks applicable to the given regions.
 */
export function getApplicableFrameworks(regions: string[]): RegulatoryFramework[] {
  const regionSet = new Set(regions.map(r => r.toUpperCase()));
  return FRAMEWORKS.filter(f => regionSet.has(f.region.toUpperCase()));
}

/**
 * Get the specific audit trail requirements for a region.
 */
export function getRegionalAuditRequirements(region: string): RegionalAuditRequirements {
  const frameworks = getApplicableFrameworks([region]);

  if (frameworks.length === 0) {
    return {
      retentionYears: 15,
      languages: ['en'],
      timezoneRule: 'UTC',
      eSignatureRequired: true,
      hashAlgorithm: 'SHA-256',
      exportFormats: ['csv', 'json'],
      mandatoryFields: ['user_id', 'timestamp', 'action'],
      dataResidencyRequired: false,
      additionalRequirements: [],
    };
  }

  // Merge requirements across all frameworks for this region (most restrictive wins)
  return {
    retentionYears: Math.max(...frameworks.map(f => f.requirements.auditRetentionYears)),
    languages: [...new Set(frameworks.flatMap(f => f.requirements.requiredLanguages))],
    timezoneRule: frameworks[0].requirements.timezoneRule,
    eSignatureRequired: frameworks.some(f => f.requirements.eSignatureRequired),
    hashAlgorithm: 'SHA-256',
    exportFormats: [...new Set(frameworks.flatMap(f => f.requirements.exportFormats))],
    mandatoryFields: [...new Set(frameworks.flatMap(f => f.requirements.mandatoryAuditFields))],
    dataResidencyRequired: frameworks.some(f => f.requirements.dataResidencyRequired),
    dataResidencyRegion: frameworks.find(f => f.requirements.dataResidencyRegion)?.requirements.dataResidencyRegion,
    additionalRequirements: frameworks.flatMap(f => f.requirements.specificRegulations),
  };
}

/**
 * Validate whether the current audit configuration satisfies all
 * frameworks for the target regions. Returns a gap analysis.
 */
export function validateComplianceForRegions(
  targetRegions: string[],
  auditConfig: {
    enabledRegions?: string[];
    enabledFrameworks?: string[];
    auditRetention?: number;
    eSignatures?: boolean;
    hashAlgorithm?: string;
    dataResidency?: boolean;
    languages?: string[];
  }
): ComplianceGapAnalysis {
  const requiredFrameworks = getApplicableFrameworks(targetRegions);
  const gaps: ComplianceGap[] = [];
  const coveredIds = new Set(auditConfig.enabledFrameworks || []);
  const frameworksCovered: string[] = [];
  const frameworksMissing: string[] = [];

  for (const fw of requiredFrameworks) {
    const isCovered = coveredIds.has(fw.id);

    if (!isCovered) {
      frameworksMissing.push(fw.id);
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        domain: 'audit_trail',
        requirement: `Framework ${fw.id} is not enabled for this organization`,
        severity: 'high',
        remediation: `Enable ${fw.name} via POST /api/compliance/regions/:orgId/enable`,
      });
    } else {
      frameworksCovered.push(fw.id);
    }

    // Check retention
    if ((auditConfig.auditRetention || 0) < fw.requirements.auditRetentionYears) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        domain: 'audit_trail',
        requirement: `Audit retention must be >= ${fw.requirements.auditRetentionYears} years (${fw.requirements.specificRegulations[0]})`,
        severity: 'critical',
        remediation: `Increase audit retention to ${fw.requirements.auditRetentionYears} years`,
      });
    }

    // Check e-signatures
    if (fw.requirements.eSignatureRequired && !auditConfig.eSignatures) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        domain: 'e_signatures',
        requirement: `Electronic signatures required by ${fw.regulation}`,
        severity: 'critical',
        remediation: 'Enable electronic signature workflows',
      });
    }

    // Check data residency
    if (fw.requirements.dataResidencyRequired && !auditConfig.dataResidency) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        domain: 'data_residency',
        requirement: `Data must reside in ${fw.requirements.dataResidencyRegion} per ${fw.requirements.specificRegulations.join(', ')}`,
        severity: 'critical',
        remediation: `Configure data residency for ${fw.requirements.dataResidencyRegion}`,
      });
    }

    // Check languages
    const missingLangs = fw.requirements.requiredLanguages.filter(
      l => !(auditConfig.languages || ['en']).includes(l)
    );
    if (missingLangs.length > 0) {
      gaps.push({
        frameworkId: fw.id,
        frameworkName: fw.name,
        domain: 'audit_trail',
        requirement: `Audit records must support languages: ${fw.requirements.requiredLanguages.join(', ')}`,
        severity: 'medium',
        remediation: `Add language support for: ${missingLangs.join(', ')}`,
      });
    }
  }

  // Calculate compliance score
  const totalChecks = requiredFrameworks.length * 5; // 5 checks per framework
  const failedChecks = gaps.length;
  const score = totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 100) : 100;

  // Recommendations
  const recommendations: string[] = [];
  if (frameworksMissing.length > 0) {
    recommendations.push(`Enable ${frameworksMissing.length} missing framework(s): ${frameworksMissing.join(', ')}`);
  }
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  if (criticalGaps.length > 0) {
    recommendations.push(`Address ${criticalGaps.length} critical compliance gap(s) immediately`);
  }
  if (targetRegions.includes('EU') || targetRegions.includes('UK')) {
    recommendations.push('Ensure GDPR RoPA (Article 30) records are maintained');
    recommendations.push('Verify cross-border data transfer mechanisms are in place (SCCs/BCRs)');
  }
  if (targetRegions.includes('CN')) {
    recommendations.push('Data localization required: all data must reside in mainland China (Cybersecurity Law Art. 37)');
  }
  if (targetRegions.includes('CA')) {
    recommendations.push('Ensure bilingual (English/French) document support per Health Canada requirements');
  }
  if (targetRegions.includes('JP')) {
    recommendations.push('Japanese-language audit records required. Verify bridging study requirements (ICH E5)');
  }

  return {
    compliant: gaps.length === 0,
    score,
    gaps,
    recommendations,
    frameworksCovered,
    frameworksMissing,
  };
}
