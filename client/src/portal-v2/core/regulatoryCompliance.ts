/**
 * TrialSage Client Portal V2 - Regulatory Compliance Engine
 *
 * 21 CFR Part 11, EU Annex 11, GCP, and ALCOA+ compliant
 * configuration and validation systems.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6 GCP
 */

import type { UserRole } from './portalTypes';
import type {
  OrganizationBusinessModel,
  SubscriptionTier,
  ComplianceFramework,
  Permission,
  PermissionAction,
  ResourceType,
} from './securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE FRAMEWORK CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Compliance requirement levels */
export type ComplianceLevel = 'essential' | 'standard' | 'strict' | 'maximum';

/** Data integrity principle (ALCOA+) */
export type ALCOAPrinciple =
  | 'Attributable'
  | 'Legible'
  | 'Contemporaneous'
  | 'Original'
  | 'Accurate'
  | 'Complete'
  | 'Consistent'
  | 'Enduring'
  | 'Available';

/** Compliance configuration for an organization */
export interface ComplianceConfig {
  frameworks: ComplianceFramework[];
  level: ComplianceLevel;
  electronicSignatures: ElectronicSignatureConfig;
  auditTrail: AuditTrailConfig;
  dataIntegrity: DataIntegrityConfig;
  accessControl: AccessControlConfig;
  training: TrainingConfig;
  validation: ValidationConfig;
}

/** Electronic signature configuration per 21 CFR 11.200 */
export interface ElectronicSignatureConfig {
  enabled: boolean;
  requireTwoFactorAuth: boolean;
  requireMeaningDeclaration: boolean;
  requireBiometric: boolean;
  allowDigitalCertificate: boolean;
  signatureValidityHours: number;
  hashAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  requiredForActions: SignatureRequiredAction[];
}

/** Actions requiring electronic signature */
export type SignatureRequiredAction =
  | 'protocol_approval'
  | 'protocol_amendment'
  | 'database_lock'
  | 'database_unlock'
  | 'sae_report'
  | 'final_report'
  | 'document_approval'
  | 'document_release'
  | 'user_creation'
  | 'role_change'
  | 'security_override'
  | 'data_correction'
  | 'audit_export';

/** Audit trail configuration per 21 CFR 11.10(e) */
export interface AuditTrailConfig {
  enabled: boolean;
  immutable: boolean;
  hashChainEnabled: boolean;
  fieldLevelTracking: boolean;
  retentionYears: number;
  encryptionRequired: boolean;
  includeMetadata: ('ip' | 'device' | 'location' | 'session')[];
  realTimeMonitoring: boolean;
  anomalyDetection: boolean;
}

/** Data integrity configuration (ALCOA+) */
export interface DataIntegrityConfig {
  alcoaPrinciples: ALCOAPrinciple[];
  timestampSource: 'server' | 'atomic' | 'blockchain';
  checksumValidation: boolean;
  versionControl: boolean;
  changeControlRequired: boolean;
  reasonForChangeRequired: boolean;
}

/** Access control configuration */
export interface AccessControlConfig {
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  mfaRequired: boolean;
  mfaMethods: ('totp' | 'sms' | 'email' | 'hardware_key' | 'biometric')[];
  ipWhitelistEnabled: boolean;
  geoFencingEnabled: boolean;
  deviceAttestationRequired: boolean;
  passwordPolicy: PasswordPolicyConfig;
  lockoutPolicy: LockoutPolicyConfig;
}

/** Password policy per 21 CFR 11.300 */
export interface PasswordPolicyConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventReuse: number;
  expirationDays: number;
  complexityScore: number;
}

/** Account lockout policy */
export interface LockoutPolicyConfig {
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  incrementalLockout: boolean;
  notifySecurityTeam: boolean;
}

/** Training requirements per GCP */
export interface TrainingConfig {
  required: boolean;
  refreshIntervalDays: number;
  requiredCourses: string[];
  competencyAssessmentRequired: boolean;
  documentationRequired: boolean;
}

/** System validation configuration */
export interface ValidationConfig {
  iqOqPqRequired: boolean;
  csvRequired: boolean;
  changeControlRequired: boolean;
  periodicReviewDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEGREGATION OF DUTIES (SoD)
// ─────────────────────────────────────────────────────────────────────────────

/** Conflicting role pair */
export interface RoleConflict {
  roleA: UserRole;
  roleB: UserRole;
  reason: string;
  severity: 'critical' | 'high' | 'medium';
  waiverAllowed: boolean;
  waiverApprover?: UserRole;
}

/** SoD conflict matrix - roles that cannot be combined */
export const SOD_CONFLICT_MATRIX: RoleConflict[] = [
  {
    roleA: 'admin',
    roleB: 'quality_assurance',
    reason: 'System administrator cannot perform QA audits on their own changes',
    severity: 'critical',
    waiverAllowed: false,
  },
  {
    roleA: 'medical_writer',
    roleB: 'quality_assurance',
    reason: 'Document author cannot perform QA review on their own documents',
    severity: 'high',
    waiverAllowed: true,
    waiverApprover: 'admin',
  },
  {
    roleA: 'clinical_ops',
    roleB: 'biostatistician',
    reason: 'Clinical operations cannot perform independent statistical analysis',
    severity: 'medium',
    waiverAllowed: true,
    waiverApprover: 'regulatory_lead',
  },
  {
    roleA: 'regulatory_lead',
    roleB: 'external_partner',
    reason: 'Internal regulatory lead cannot also be external partner',
    severity: 'critical',
    waiverAllowed: false,
  },
  {
    roleA: 'safety_officer',
    roleB: 'clinical_ops',
    reason: 'Safety officer should be independent of clinical operations',
    severity: 'high',
    waiverAllowed: true,
    waiverApprover: 'admin',
  },
];

/** SoD validation result */
export interface SoDValidation {
  isCompliant: boolean;
  conflicts: RoleConflict[];
  waiverRequired: boolean;
  waiverApprovers: UserRole[];
}

/** Validate SoD compliance for role assignment */
export function validateSoD(currentRoles: UserRole[], proposedRole: UserRole): SoDValidation {
  const allRoles = [...currentRoles, proposedRole];
  const conflicts: RoleConflict[] = [];

  for (const conflict of SOD_CONFLICT_MATRIX) {
    if (allRoles.includes(conflict.roleA) && allRoles.includes(conflict.roleB)) {
      conflicts.push(conflict);
    }
  }

  const waiverApprovers = [
    ...new Set(conflicts.filter(c => c.waiverAllowed).map(c => c.waiverApprover!)),
  ];

  return {
    isCompliant: conflicts.length === 0,
    conflicts,
    waiverRequired: conflicts.some(c => c.waiverAllowed),
    waiverApprovers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT ARCHETYPE CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Tenant configuration based on business model */
export interface TenantArchetypeConfig {
  businessModel: OrganizationBusinessModel;
  name: string;
  description: string;
  compliance: ComplianceConfig;
  features: TenantFeatures;
  ui: TenantUIConfig;
  defaultRoles: UserRole[];
  maxUsers: number;
  pricing: TenantPricing;
}

/** Feature flags for tenant */
export interface TenantFeatures {
  electronicSignatures: boolean;
  advancedAudit: boolean;
  multiStudy: boolean;
  crossFunctionalTeams: boolean;
  aiAssistant: boolean;
  regulatoryIntelligence: boolean;
  customWorkflows: boolean;
  apiAccess: boolean;
  ssoIntegration: boolean;
  whiteLabeling: boolean;
  dedicatedSupport: boolean;
}

/** UI configuration for tenant */
export interface TenantUIConfig {
  density: 'compact' | 'medium' | 'spacious';
  showAuditHashes: boolean;
  showComplianceBadges: boolean;
  showRegulatoryIndicators: boolean;
  dashboardWidgets: string[];
  theme: 'professional' | 'clinical' | 'modern';
}

/** Pricing configuration */
export interface TenantPricing {
  baseMonthly: number;
  perUserMonthly: number;
  storagePerGBMonthly: number;
  annualDiscount: number;
}

/** Big Pharma archetype configuration */
export const BIG_PHARMA_CONFIG: TenantArchetypeConfig = {
  businessModel: 'BIO_PHARMA_SPONSOR',
  name: 'Enterprise Pharma',
  description: 'Full 21 CFR Part 11 + SOX compliance for large pharmaceutical companies',
  compliance: {
    frameworks: ['FDA_21_CFR_PART_11', 'EU_ANNEX_11', 'GAMP_5', 'SOC_2', 'ICH_E6_GCP'],
    level: 'maximum',
    electronicSignatures: {
      enabled: true,
      requireTwoFactorAuth: true,
      requireMeaningDeclaration: true,
      requireBiometric: true,
      allowDigitalCertificate: true,
      signatureValidityHours: 24,
      hashAlgorithm: 'SHA-256',
      requiredForActions: [
        'protocol_approval',
        'protocol_amendment',
        'database_lock',
        'sae_report',
        'final_report',
        'document_approval',
        'document_release',
        'security_override',
      ],
    },
    auditTrail: {
      enabled: true,
      immutable: true,
      hashChainEnabled: true,
      fieldLevelTracking: true,
      retentionYears: 25,
      encryptionRequired: true,
      includeMetadata: ['ip', 'device', 'location', 'session'],
      realTimeMonitoring: true,
      anomalyDetection: true,
    },
    dataIntegrity: {
      alcoaPrinciples: [
        'Attributable',
        'Legible',
        'Contemporaneous',
        'Original',
        'Accurate',
        'Complete',
        'Consistent',
        'Enduring',
        'Available',
      ],
      timestampSource: 'atomic',
      checksumValidation: true,
      versionControl: true,
      changeControlRequired: true,
      reasonForChangeRequired: true,
    },
    accessControl: {
      sessionTimeoutMinutes: 15,
      maxConcurrentSessions: 3,
      mfaRequired: true,
      mfaMethods: ['totp', 'hardware_key'],
      ipWhitelistEnabled: true,
      geoFencingEnabled: true,
      deviceAttestationRequired: true,
      passwordPolicy: {
        minLength: 14,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 24,
        expirationDays: 90,
        complexityScore: 4,
      },
      lockoutPolicy: {
        maxFailedAttempts: 3,
        lockoutDurationMinutes: 30,
        incrementalLockout: true,
        notifySecurityTeam: true,
      },
    },
    training: {
      required: true,
      refreshIntervalDays: 365,
      requiredCourses: ['21_CFR_Part_11', 'GCP', 'Data_Integrity', 'System_Training'],
      competencyAssessmentRequired: true,
      documentationRequired: true,
    },
    validation: {
      iqOqPqRequired: true,
      csvRequired: true,
      changeControlRequired: true,
      periodicReviewDays: 365,
    },
  },
  features: {
    electronicSignatures: true,
    advancedAudit: true,
    multiStudy: true,
    crossFunctionalTeams: true,
    aiAssistant: true,
    regulatoryIntelligence: true,
    customWorkflows: true,
    apiAccess: true,
    ssoIntegration: true,
    whiteLabeling: true,
    dedicatedSupport: true,
  },
  ui: {
    density: 'medium',
    showAuditHashes: true,
    showComplianceBadges: true,
    showRegulatoryIndicators: true,
    dashboardWidgets: [
      'compliance_health',
      'audit_summary',
      'pending_signatures',
      'training_status',
      'security_alerts',
    ],
    theme: 'professional',
  },
  defaultRoles: ['admin', 'regulatory_lead', 'clinical_ops', 'medical_writer', 'quality_assurance'],
  maxUsers: 500,
  pricing: {
    baseMonthly: 5000,
    perUserMonthly: 75,
    storagePerGBMonthly: 0.5,
    annualDiscount: 0.15,
  },
};

/** Virtual Biotech archetype configuration */
export const VIRTUAL_BIOTECH_CONFIG: TenantArchetypeConfig = {
  businessModel: 'BIO_PHARMA_SPONSOR',
  name: 'Emerging Biotech',
  description: 'Streamlined compliance for agile biotechnology companies',
  compliance: {
    frameworks: ['FDA_21_CFR_PART_11', 'ICH_E6_GCP'],
    level: 'standard',
    electronicSignatures: {
      enabled: true,
      requireTwoFactorAuth: true,
      requireMeaningDeclaration: true,
      requireBiometric: false,
      allowDigitalCertificate: true,
      signatureValidityHours: 72,
      hashAlgorithm: 'SHA-256',
      requiredForActions: ['protocol_approval', 'document_approval', 'database_lock'],
    },
    auditTrail: {
      enabled: true,
      immutable: true,
      hashChainEnabled: true,
      fieldLevelTracking: false,
      retentionYears: 15,
      encryptionRequired: true,
      includeMetadata: ['ip', 'session'],
      realTimeMonitoring: false,
      anomalyDetection: false,
    },
    dataIntegrity: {
      alcoaPrinciples: ['Attributable', 'Legible', 'Contemporaneous', 'Original', 'Accurate'],
      timestampSource: 'server',
      checksumValidation: true,
      versionControl: true,
      changeControlRequired: false,
      reasonForChangeRequired: true,
    },
    accessControl: {
      sessionTimeoutMinutes: 60,
      maxConcurrentSessions: 5,
      mfaRequired: true,
      mfaMethods: ['totp', 'email'],
      ipWhitelistEnabled: false,
      geoFencingEnabled: false,
      deviceAttestationRequired: false,
      passwordPolicy: {
        minLength: 12,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 12,
        expirationDays: 180,
        complexityScore: 3,
      },
      lockoutPolicy: {
        maxFailedAttempts: 5,
        lockoutDurationMinutes: 15,
        incrementalLockout: false,
        notifySecurityTeam: false,
      },
    },
    training: {
      required: true,
      refreshIntervalDays: 730,
      requiredCourses: ['System_Training', 'GCP_Basics'],
      competencyAssessmentRequired: false,
      documentationRequired: true,
    },
    validation: {
      iqOqPqRequired: false,
      csvRequired: false,
      changeControlRequired: false,
      periodicReviewDays: 730,
    },
  },
  features: {
    electronicSignatures: true,
    advancedAudit: false,
    multiStudy: true,
    crossFunctionalTeams: true,
    aiAssistant: true,
    regulatoryIntelligence: true,
    customWorkflows: false,
    apiAccess: true,
    ssoIntegration: false,
    whiteLabeling: false,
    dedicatedSupport: false,
  },
  ui: {
    density: 'spacious',
    showAuditHashes: false,
    showComplianceBadges: true,
    showRegulatoryIndicators: true,
    dashboardWidgets: ['milestone_tracker', 'burn_rate', 'enrollment_velocity', 'pending_actions'],
    theme: 'modern',
  },
  defaultRoles: ['admin', 'regulatory_lead', 'project_manager'],
  maxUsers: 50,
  pricing: {
    baseMonthly: 1500,
    perUserMonthly: 45,
    storagePerGBMonthly: 0.3,
    annualDiscount: 0.1,
  },
};

/** CRO archetype configuration */
export const CRO_CONFIG: TenantArchetypeConfig = {
  businessModel: 'CRO_PARTNER',
  name: 'Contract Research Organization',
  description: 'Multi-sponsor isolation with fleet management capabilities',
  compliance: {
    frameworks: ['FDA_21_CFR_PART_11', 'EU_ANNEX_11', 'ICH_E6_GCP', 'GDPR'],
    level: 'strict',
    electronicSignatures: {
      enabled: true,
      requireTwoFactorAuth: true,
      requireMeaningDeclaration: true,
      requireBiometric: false,
      allowDigitalCertificate: true,
      signatureValidityHours: 48,
      hashAlgorithm: 'SHA-256',
      requiredForActions: [
        'protocol_approval',
        'document_approval',
        'database_lock',
        'sae_report',
        'data_correction',
      ],
    },
    auditTrail: {
      enabled: true,
      immutable: true,
      hashChainEnabled: true,
      fieldLevelTracking: true,
      retentionYears: 20,
      encryptionRequired: true,
      includeMetadata: ['ip', 'device', 'session'],
      realTimeMonitoring: true,
      anomalyDetection: true,
    },
    dataIntegrity: {
      alcoaPrinciples: [
        'Attributable',
        'Legible',
        'Contemporaneous',
        'Original',
        'Accurate',
        'Complete',
        'Consistent',
      ],
      timestampSource: 'server',
      checksumValidation: true,
      versionControl: true,
      changeControlRequired: true,
      reasonForChangeRequired: true,
    },
    accessControl: {
      sessionTimeoutMinutes: 30,
      maxConcurrentSessions: 3,
      mfaRequired: true,
      mfaMethods: ['totp', 'hardware_key', 'email'],
      ipWhitelistEnabled: true,
      geoFencingEnabled: true,
      deviceAttestationRequired: false,
      passwordPolicy: {
        minLength: 12,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 18,
        expirationDays: 120,
        complexityScore: 3,
      },
      lockoutPolicy: {
        maxFailedAttempts: 5,
        lockoutDurationMinutes: 20,
        incrementalLockout: true,
        notifySecurityTeam: true,
      },
    },
    training: {
      required: true,
      refreshIntervalDays: 365,
      requiredCourses: ['21_CFR_Part_11', 'GCP', 'Sponsor_Blinding', 'System_Training'],
      competencyAssessmentRequired: true,
      documentationRequired: true,
    },
    validation: {
      iqOqPqRequired: true,
      csvRequired: true,
      changeControlRequired: true,
      periodicReviewDays: 365,
    },
  },
  features: {
    electronicSignatures: true,
    advancedAudit: true,
    multiStudy: true,
    crossFunctionalTeams: true,
    aiAssistant: true,
    regulatoryIntelligence: true,
    customWorkflows: true,
    apiAccess: true,
    ssoIntegration: true,
    whiteLabeling: true,
    dedicatedSupport: true,
  },
  ui: {
    density: 'compact',
    showAuditHashes: true,
    showComplianceBadges: true,
    showRegulatoryIndicators: true,
    dashboardWidgets: [
      'fleet_overview',
      'sponsor_isolation',
      'resource_allocation',
      'compliance_health',
      'pending_signatures',
    ],
    theme: 'clinical',
  },
  defaultRoles: [
    'admin',
    'regulatory_lead',
    'clinical_ops',
    'project_manager',
    'quality_assurance',
  ],
  maxUsers: 200,
  pricing: {
    baseMonthly: 3000,
    perUserMonthly: 55,
    storagePerGBMonthly: 0.4,
    annualDiscount: 0.12,
  },
};

/** Academic/Research Institution configuration */
export const ACADEMIC_CONFIG: TenantArchetypeConfig = {
  businessModel: 'ACADEMIC_INSTITUTION',
  name: 'Academic Research',
  description: 'Research-focused compliance for academic institutions',
  compliance: {
    frameworks: ['ICH_E6_GCP', 'HIPAA'],
    level: 'standard',
    electronicSignatures: {
      enabled: true,
      requireTwoFactorAuth: false,
      requireMeaningDeclaration: true,
      requireBiometric: false,
      allowDigitalCertificate: true,
      signatureValidityHours: 168,
      hashAlgorithm: 'SHA-256',
      requiredForActions: ['protocol_approval', 'document_approval'],
    },
    auditTrail: {
      enabled: true,
      immutable: true,
      hashChainEnabled: false,
      fieldLevelTracking: false,
      retentionYears: 10,
      encryptionRequired: true,
      includeMetadata: ['ip', 'session'],
      realTimeMonitoring: false,
      anomalyDetection: false,
    },
    dataIntegrity: {
      alcoaPrinciples: ['Attributable', 'Legible', 'Contemporaneous', 'Original', 'Accurate'],
      timestampSource: 'server',
      checksumValidation: false,
      versionControl: true,
      changeControlRequired: false,
      reasonForChangeRequired: false,
    },
    accessControl: {
      sessionTimeoutMinutes: 120,
      maxConcurrentSessions: 10,
      mfaRequired: false,
      mfaMethods: ['totp', 'email'],
      ipWhitelistEnabled: false,
      geoFencingEnabled: false,
      deviceAttestationRequired: false,
      passwordPolicy: {
        minLength: 10,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
        preventReuse: 6,
        expirationDays: 365,
        complexityScore: 2,
      },
      lockoutPolicy: {
        maxFailedAttempts: 10,
        lockoutDurationMinutes: 10,
        incrementalLockout: false,
        notifySecurityTeam: false,
      },
    },
    training: {
      required: true,
      refreshIntervalDays: 730,
      requiredCourses: ['GCP_Basics', 'Research_Ethics'],
      competencyAssessmentRequired: false,
      documentationRequired: false,
    },
    validation: {
      iqOqPqRequired: false,
      csvRequired: false,
      changeControlRequired: false,
      periodicReviewDays: 1095,
    },
  },
  features: {
    electronicSignatures: true,
    advancedAudit: false,
    multiStudy: true,
    crossFunctionalTeams: true,
    aiAssistant: true,
    regulatoryIntelligence: false,
    customWorkflows: false,
    apiAccess: false,
    ssoIntegration: true,
    whiteLabeling: false,
    dedicatedSupport: false,
  },
  ui: {
    density: 'spacious',
    showAuditHashes: false,
    showComplianceBadges: false,
    showRegulatoryIndicators: false,
    dashboardWidgets: ['study_progress', 'publications', 'grants', 'team_activity'],
    theme: 'modern',
  },
  defaultRoles: ['admin', 'clinical_ops', 'biostatistician', 'viewer'],
  maxUsers: 100,
  pricing: {
    baseMonthly: 500,
    perUserMonthly: 20,
    storagePerGBMonthly: 0.2,
    annualDiscount: 0.2,
  },
};

/** Get archetype config by business model */
export function getArchetypeConfig(
  businessModel: OrganizationBusinessModel
): TenantArchetypeConfig {
  switch (businessModel) {
    case 'BIO_PHARMA_SPONSOR':
      return BIG_PHARMA_CONFIG;
    case 'CRO_PARTNER':
      return CRO_CONFIG;
    case 'ACADEMIC_INSTITUTION':
      return ACADEMIC_CONFIG;
    case 'REGULATORY_CONSULTANCY':
      return { ...VIRTUAL_BIOTECH_CONFIG, businessModel: 'REGULATORY_CONSULTANCY' };
    case 'CMO_CDMO':
      return { ...CRO_CONFIG, businessModel: 'CMO_CDMO', name: 'Contract Manufacturing' };
    case 'DEVICE_MANUFACTURER':
      return { ...BIG_PHARMA_CONFIG, businessModel: 'DEVICE_MANUFACTURER', name: 'Medical Device' };
    case 'DIAGNOSTIC_COMPANY':
      return {
        ...VIRTUAL_BIOTECH_CONFIG,
        businessModel: 'DIAGNOSTIC_COMPANY',
        name: 'Diagnostics',
      };
    case 'GOVERNMENT_AGENCY':
      return { ...ACADEMIC_CONFIG, businessModel: 'GOVERNMENT_AGENCY', name: 'Government' };
    default:
      return VIRTUAL_BIOTECH_CONFIG;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION PRESETS BY ROLE
// ─────────────────────────────────────────────────────────────────────────────

/** Default permissions by role */
export const ROLE_PERMISSION_PRESETS: Record<UserRole, Permission[]> = {
  admin: [
    { resource: 'users', actions: ['create', 'read', 'update', 'delete', 'admin'] },
    { resource: 'organizations', actions: ['read', 'update', 'admin'] },
    {
      resource: 'documents',
      actions: ['create', 'read', 'update', 'delete', 'approve', 'publish', 'archive', 'export'],
    },
    { resource: 'projects', actions: ['create', 'read', 'update', 'delete', 'admin'] },
    { resource: 'submissions', actions: ['create', 'read', 'update', 'delete', 'approve'] },
    { resource: 'workflows', actions: ['create', 'read', 'update', 'delete', 'admin'] },
    { resource: 'settings', actions: ['read', 'update', 'admin'] },
    { resource: 'audit_logs', actions: ['read', 'export'] },
    { resource: 'integrations', actions: ['create', 'read', 'update', 'delete', 'admin'] },
    { resource: 'templates', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'ai_assistant', actions: ['read', 'admin'] },
    { resource: 'reports', actions: ['create', 'read', 'export'] },
  ],
  regulatory_lead: [
    {
      resource: 'documents',
      actions: ['create', 'read', 'update', 'approve', 'publish', 'export'],
    },
    { resource: 'projects', actions: ['create', 'read', 'update'] },
    { resource: 'submissions', actions: ['create', 'read', 'update', 'approve'] },
    { resource: 'workflows', actions: ['create', 'read', 'update'] },
    { resource: 'templates', actions: ['create', 'read', 'update'] },
    { resource: 'ai_assistant', actions: ['read'] },
    { resource: 'reports', actions: ['create', 'read', 'export'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  clinical_ops: [
    { resource: 'documents', actions: ['create', 'read', 'update'] },
    { resource: 'projects', actions: ['read', 'update'] },
    { resource: 'workflows', actions: ['read', 'update'] },
    { resource: 'ai_assistant', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
  medical_writer: [
    { resource: 'documents', actions: ['create', 'read', 'update'] },
    { resource: 'templates', actions: ['read'] },
    { resource: 'ai_assistant', actions: ['read'] },
  ],
  biostatistician: [
    { resource: 'documents', actions: ['read'] },
    { resource: 'reports', actions: ['create', 'read', 'export'] },
    { resource: 'ai_assistant', actions: ['read'] },
  ],
  quality_assurance: [
    { resource: 'documents', actions: ['read', 'approve'] },
    { resource: 'audit_logs', actions: ['read', 'export'] },
    { resource: 'reports', actions: ['read', 'export'] },
  ],
  legal_counsel: [
    { resource: 'documents', actions: ['read', 'approve'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  executive: [
    { resource: 'documents', actions: ['read'] },
    { resource: 'projects', actions: ['read'] },
    { resource: 'reports', actions: ['read', 'export'] },
    { resource: 'audit_logs', actions: ['read'] },
  ],
  cmc_specialist: [
    { resource: 'documents', actions: ['create', 'read', 'update'] },
    { resource: 'templates', actions: ['read'] },
  ],
  safety_officer: [
    { resource: 'documents', actions: ['read', 'approve'] },
    { resource: 'reports', actions: ['create', 'read'] },
  ],
  project_manager: [
    { resource: 'projects', actions: ['create', 'read', 'update'] },
    { resource: 'workflows', actions: ['create', 'read', 'update'] },
    { resource: 'documents', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
  viewer: [
    { resource: 'documents', actions: ['read'] },
    { resource: 'projects', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
  external_partner: [
    {
      resource: 'documents',
      actions: ['read'],
      conditions: [{ field: 'sharedWith', operator: 'contains', value: 'external' }],
    },
    {
      resource: 'projects',
      actions: ['read'],
      conditions: [{ field: 'visibility', operator: 'eq', value: 'partner' }],
    },
  ],
};

/** Check if user has permission for action */
export function hasPermission(
  userPermissions: Permission[],
  resource: ResourceType,
  action: PermissionAction
): boolean {
  const resourcePermission = userPermissions.find(p => p.resource === resource);
  if (!resourcePermission) return false;
  return (
    resourcePermission.actions.includes(action) || resourcePermission.actions.includes('admin')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE HEALTH CALCULATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Compliance health score category */
export type ComplianceHealthCategory = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

/** Compliance health metrics */
export interface ComplianceHealth {
  overallScore: number;
  category: ComplianceHealthCategory;
  metrics: {
    signatureIntegrity: number;
    auditCompleteness: number;
    trainingCurrency: number;
    passwordCompliance: number;
    sodCompliance: number;
    dataIntegrity: number;
  };
  findings: ComplianceFinding[];
  recommendations: string[];
}

/** Compliance finding */
export interface ComplianceFinding {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  category: string;
  description: string;
  remediation: string;
  dueDate?: Date;
}

/** Calculate compliance health category from score */
export function getComplianceCategory(score: number): ComplianceHealthCategory {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'fair';
  if (score >= 50) return 'poor';
  return 'critical';
}

/** Display configuration for compliance categories */
export const COMPLIANCE_CATEGORY_CONFIG: Record<
  ComplianceHealthCategory,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  excellent: { label: 'Excellent', color: '#059669', bgColor: '#ecfdf5', icon: 'ShieldCheck' },
  good: { label: 'Good', color: '#0d6efd', bgColor: '#eff6ff', icon: 'Shield' },
  fair: { label: 'Fair', color: '#ca8a04', bgColor: '#fefce8', icon: 'ShieldAlert' },
  poor: { label: 'Poor', color: '#ea580c', bgColor: '#fff7ed', icon: 'ShieldX' },
  critical: { label: 'Critical', color: '#dc2626', bgColor: '#fef2f2', icon: 'ShieldOff' },
};
