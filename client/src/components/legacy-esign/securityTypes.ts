/**
 * Concept2Cure Client Portal V2 - Enterprise Security Types
 *
 * Comprehensive security, authentication, and compliance types for
 * a regulatory-grade multi-tenant platform (FDA 21 CFR Part 11 compliant).
 *
 * @version 2.0.0
 * @author Concept2Cure Engineering
 */

import type { UserRole, RegulatoryAgency } from './portalTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION & TENANT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Organization business model types */
export type OrganizationBusinessModel =
  | 'BIO_PHARMA_SPONSOR'
  | 'CRO_PARTNER'
  | 'REGULATORY_CONSULTANCY'
  | 'CMO_CDMO'
  | 'ACADEMIC_INSTITUTION'
  | 'GOVERNMENT_AGENCY'
  | 'DEVICE_MANUFACTURER'
  | 'DIAGNOSTIC_COMPANY';

/** Subscription tiers with feature limits */
export type SubscriptionTier = 'starter' | 'professional' | 'enterprise' | 'regulatory_plus';

/** Organization status */
export type OrganizationStatus = 'pending' | 'active' | 'suspended' | 'archived';

/** Full organization entity */
export interface Organization {
  id: string;
  legalName: string;
  displayName: string;
  slug: string;
  domain?: string;
  businessModel: OrganizationBusinessModel;
  headquartersCountry: string;
  regions: string[];
  subscriptionTier: SubscriptionTier;
  status: OrganizationStatus;
  logo?: string;
  primaryContact?: string;
  billingEmail?: string;
  taxId?: string;
  dunsNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  settings: OrganizationSettings;
  limits: OrganizationLimits;
  compliance: ComplianceSettings;
}

/** Organization settings */
export interface OrganizationSettings {
  brandColor: string;
  secondaryColor?: string;
  timezone: string;
  dateFormat: string;
  language: string;
  enableNotifications: boolean;
  enableAuditAlerts: boolean;
  allowGuestAccess: boolean;
  requireMFA: boolean;
  sessionTimeout: number; // minutes
  passwordPolicy: PasswordPolicy;
  ipWhitelist?: string[];
  ssoEnabled: boolean;
  ssoProvider?: SSOProvider;
}

/** Organization resource limits */
export interface OrganizationLimits {
  maxUsers: number;
  maxProjects: number;
  maxStorageGB: number;
  maxApiCallsPerDay: number;
  maxConcurrentSessions: number;
  retentionPeriodDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** User account status */
export type UserStatus = 'pending' | 'active' | 'locked' | 'disabled' | 'expired';

/** User authentication method */
export type AuthMethod = 'password' | 'sso' | 'mfa' | 'certificate';

/** Complete user profile */
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  title?: string;
  department?: string;
  phone?: string;
  avatar?: string;
  status: UserStatus;
  homeOrganizationId: string;
  primaryRole: UserRole;
  authMethods: AuthMethod[];
  mfaEnabled: boolean;
  mfaMethod?: MFAMethod;
  lastLogin?: Date;
  lastPasswordChange?: Date;
  passwordExpiresAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  preferences: UserPreferences;
  certifications?: UserCertification[];
}

/** User preferences */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  dateFormat: string;
  emailNotifications: boolean;
  desktopNotifications: boolean;
  digestFrequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  defaultModule?: string;
  dashboardLayout?: Record<string, unknown>;
}

/** User training certification for 21 CFR Part 11 */
export interface UserCertification {
  id: string;
  name: string;
  issuer: string;
  issuedAt: Date;
  expiresAt?: Date;
  certificateUrl?: string;
  verificationCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERSHIP & ACCESS TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** User membership in an organization */
export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole;
  accessLevel: AccessLevel;
  department?: string;
  title?: string;
  isDefault: boolean;
  isPrimary: boolean;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  expiresAt?: Date;
  status: 'invited' | 'active' | 'suspended' | 'expired';
  permissions: Permission[];
  customPermissions?: string[];
}

/** Access level for organization membership */
export type AccessLevel = 'read_only' | 'read_write' | 'admin' | 'auditor' | 'super_admin';

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Resource types for permission control */
export type ResourceType =
  | 'documents'
  | 'projects'
  | 'submissions'
  | 'workflows'
  | 'reports'
  | 'users'
  | 'organizations'
  | 'settings'
  | 'audit_logs'
  | 'integrations'
  | 'templates'
  | 'ai_assistant';

/** Actions for permission control */
export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'publish'
  | 'archive'
  | 'export'
  | 'import'
  | 'share'
  | 'admin';

/** Permission definition */
export interface Permission {
  resource: ResourceType;
  actions: PermissionAction[];
  conditions?: PermissionCondition[];
}

/** Conditional permission rules */
export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'not_in' | 'contains' | 'starts_with';
  value: string | string[] | number | boolean;
}

/** Role-based permission preset */
export interface RolePermissionPreset {
  role: UserRole;
  name: string;
  description: string;
  permissions: Permission[];
  inheritsFrom?: UserRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** MFA method types */
export type MFAMethod = 'totp' | 'sms' | 'email' | 'hardware_key' | 'push';

/** SSO provider types */
export type SSOProvider = 'okta' | 'azure_ad' | 'google' | 'ping_identity' | 'onelogin' | 'saml';

/** Authentication session */
export interface AuthSession {
  id: string;
  userId: string;
  organizationId: string;
  token: string;
  refreshToken?: string;
  deviceId?: string;
  deviceInfo?: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  location?: GeoLocation;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  mfaVerified: boolean;
}

/** Device information */
export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  os: string;
  browser: string;
  browserVersion: string;
  fingerprint?: string;
  isTrusted: boolean;
}

/** Geographic location */
export interface GeoLocation {
  country: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/** Login credentials */
export interface LoginCredentials {
  email: string;
  password: string;
  organizationSlug?: string;
  mfaCode?: string;
  deviceId?: string;
  rememberDevice?: boolean;
}

/** Login response */
export interface LoginResponse {
  success: boolean;
  user?: UserProfile;
  session?: AuthSession;
  organizations?: Organization[];
  requiresMFA?: boolean;
  mfaMethod?: MFAMethod;
  error?: AuthError;
}

/** Authentication error */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  remainingAttempts?: number;
  lockoutUntil?: Date;
}

/** Authentication error codes */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_DISABLED'
  | 'PASSWORD_EXPIRED'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'SESSION_EXPIRED'
  | 'ORGANIZATION_SUSPENDED'
  | 'IP_BLOCKED'
  | 'DEVICE_NOT_TRUSTED'
  | 'SSO_ERROR';

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD & SECURITY POLICY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Password policy configuration */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventReuse: number; // Number of previous passwords to check
  expirationDays: number;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
}

/** Password strength levels */
export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | 'excellent';

/** Password validation result */
export interface PasswordValidation {
  isValid: boolean;
  strength: PasswordStrength;
  score: number;
  errors: string[];
  suggestions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE & AUDIT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Compliance framework types */
export type ComplianceFramework =
  | 'FDA_21_CFR_PART_11'
  | 'EU_ANNEX_11'
  | 'GAMP_5'
  | 'SOC_2'
  | 'HIPAA'
  | 'GDPR'
  | 'ICH_E6_GCP';

/** Compliance settings for organization */
export interface ComplianceSettings {
  frameworks: ComplianceFramework[];
  electronicSignatureEnabled: boolean;
  auditTrailEnabled: boolean;
  dataRetentionDays: number;
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  backupFrequency: 'hourly' | 'daily' | 'weekly';
  disasterRecoveryRPO: number; // hours
  disasterRecoveryRTO: number; // hours
}

/** Audit event types */
export type AuditEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_LOCKED'
  | 'USER_UNLOCKED'
  | 'ROLE_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'DOCUMENT_CREATED'
  | 'DOCUMENT_UPDATED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_SIGNED'
  | 'DOCUMENT_VIEWED'
  | 'DOCUMENT_EXPORTED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'SUBMISSION_CREATED'
  | 'SUBMISSION_SUBMITTED'
  | 'SETTINGS_CHANGED'
  | 'ORGANIZATION_UPDATED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'SESSION_TERMINATED'
  | 'SECURITY_ALERT';

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: UserRole;
  organizationId: string;
  organizationName?: string;
  resourceType?: ResourceType;
  resourceId?: string;
  resourceName?: string;
  action: string;
  description: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  location?: GeoLocation;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/** Audit log filter options */
export interface AuditLogFilter {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  userIds?: string[];
  resourceTypes?: ResourceType[];
  severity?: ('info' | 'warning' | 'error' | 'critical')[];
  searchQuery?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ELECTRONIC SIGNATURE TYPES (21 CFR Part 11)
// ─────────────────────────────────────────────────────────────────────────────

/** Electronic signature type */
export type SignatureType = 'approval' | 'review' | 'authorship' | 'witness';

/** Electronic signature status */
export type SignatureStatus = 'pending' | 'signed' | 'declined' | 'expired' | 'revoked';

/** Electronic signature record */
export interface ElectronicSignature {
  id: string;
  documentId: string;
  documentVersion: string;
  signatureType: SignatureType;
  signerId: string;
  signerName: string;
  signerEmail: string;
  signerRole: UserRole;
  signerTitle?: string;
  organizationId: string;
  meaning: string; // What the signature means (e.g., "Approved for release")
  status: SignatureStatus;
  signedAt?: Date;
  expiresAt?: Date;
  ipAddress?: string;
  deviceInfo?: string;
  certificateId?: string;
  hash: string; // Document hash at time of signature
  metadata?: Record<string, unknown>;
}

/** Signature request */
export interface SignatureRequest {
  documentId: string;
  documentVersion: string;
  signatureType: SignatureType;
  requesterId: string;
  signerIds: string[];
  meaning: string;
  message?: string;
  dueDate?: Date;
  reminderFrequency?: 'daily' | 'weekly' | 'none';
  requireReason: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Onboarding step status */
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

/** Onboarding step definition */
export interface OnboardingStep {
  id: string;
  order: number;
  title: string;
  description: string;
  icon: string;
  status: OnboardingStepStatus;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: string;
  validationRules?: OnboardingValidation[];
}

/** Onboarding validation rule */
export interface OnboardingValidation {
  field: string;
  rule: 'required' | 'email' | 'url' | 'regex' | 'custom';
  value?: string;
  message: string;
}

/** Organization onboarding state */
export interface OrganizationOnboarding {
  organizationId: string;
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  isComplete: boolean;
  completedAt?: Date;
  startedAt: Date;
  lastActivityAt: Date;
  assignedTo?: string;
}

/** Client onboarding data collection */
export interface ClientOnboardingData {
  // Step 1: Organization Details
  organizationType: OrganizationBusinessModel;
  legalName: string;
  displayName: string;
  country: string;
  regions: string[];
  industry?: string;

  // Step 2: Contact Information
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  billingContactEmail?: string;
  technicalContactEmail?: string;

  // Step 3: Regulatory Context
  targetAgencies: RegulatoryAgency[];
  productTypes: string[];
  currentPhases: string[];
  annualSubmissions?: number;

  // Step 4: Security & Compliance
  requiredFrameworks: ComplianceFramework[];
  requireMFA: boolean;
  ssoRequired: boolean;
  ssoProvider?: SSOProvider;
  ipRestrictions?: string[];

  // Step 5: Team Setup
  initialUsers: OnboardingUser[];
  departments?: string[];

  // Step 6: Subscription
  subscriptionTier: SubscriptionTier;
  billingCycle: 'monthly' | 'annual';
  paymentMethod?: string;
}

/** User to be created during onboarding */
export interface OnboardingUser {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department?: string;
  title?: string;
  sendInvite: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY EVENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Security alert severity */
export type SecurityAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Security alert type */
export type SecurityAlertType =
  | 'BRUTE_FORCE_ATTEMPT'
  | 'SUSPICIOUS_LOGIN'
  | 'UNUSUAL_LOCATION'
  | 'MULTIPLE_FAILED_MFA'
  | 'PERMISSION_ESCALATION'
  | 'DATA_EXPORT_SPIKE'
  | 'API_ABUSE'
  | 'SESSION_HIJACK_ATTEMPT'
  | 'COMPLIANCE_VIOLATION'
  | 'POLICY_VIOLATION';

/** Security alert */
export interface SecurityAlert {
  id: string;
  type: SecurityAlertType;
  severity: SecurityAlertSeverity;
  title: string;
  description: string;
  userId?: string;
  organizationId: string;
  timestamp: Date;
  ipAddress?: string;
  location?: GeoLocation;
  isResolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// API KEY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** API key scope */
export type APIKeyScope = 'read' | 'write' | 'admin' | 'integration';

/** API key */
export interface APIKey {
  id: string;
  name: string;
  keyHash: string; // Never store plaintext
  keyPrefix: string; // First 8 chars for identification
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  scopes: APIKeyScope[];
  allowedIPs?: string[];
  rateLimit?: number;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Invitation status */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** User invitation */
export interface UserInvitation {
  id: string;
  email: string;
  organizationId: string;
  role: UserRole;
  department?: string;
  invitedBy: string;
  invitedAt: Date;
  expiresAt: Date;
  status: InvitationStatus;
  acceptedAt?: Date;
  customMessage?: string;
  permissions?: Permission[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Organization type display config */
export const ORGANIZATION_TYPE_CONFIG: Record<
  OrganizationBusinessModel,
  { label: string; description: string; icon: string; color: string }
> = {
  BIO_PHARMA_SPONSOR: {
    label: 'Bio/Pharma Sponsor',
    description: 'Pharmaceutical or biotechnology company sponsoring trials',
    icon: 'Building2',
    color: '#0d6efd',
  },
  CRO_PARTNER: {
    label: 'CRO Partner',
    description: 'Contract Research Organization',
    icon: 'Handshake',
    color: '#059669',
  },
  REGULATORY_CONSULTANCY: {
    label: 'Regulatory Consultancy',
    description: 'Regulatory affairs consulting firm',
    icon: 'Scale',
    color: '#7c3aed',
  },
  CMO_CDMO: {
    label: 'CMO/CDMO',
    description: 'Contract manufacturing organization',
    icon: 'Factory',
    color: '#dc2626',
  },
  ACADEMIC_INSTITUTION: {
    label: 'Academic Institution',
    description: 'University or research hospital',
    icon: 'GraduationCap',
    color: '#ca8a04',
  },
  GOVERNMENT_AGENCY: {
    label: 'Government Agency',
    description: 'Regulatory body or government entity',
    icon: 'Landmark',
    color: '#4b5563',
  },
  DEVICE_MANUFACTURER: {
    label: 'Device Manufacturer',
    description: 'Medical device company',
    icon: 'Cpu',
    color: '#0891b2',
  },
  DIAGNOSTIC_COMPANY: {
    label: 'Diagnostics Company',
    description: 'IVD or diagnostic company',
    icon: 'Microscope',
    color: '#be123c',
  },
};

/** Subscription tier display config */
export const SUBSCRIPTION_TIER_CONFIG: Record<
  SubscriptionTier,
  {
    label: string;
    description: string;
    color: string;
    features: string[];
    limits: Partial<OrganizationLimits>;
  }
> = {
  starter: {
    label: 'Starter',
    description: 'For small teams getting started',
    color: '#6b7280',
    features: ['5 users', '10 projects', '10 GB storage', 'Email support'],
    limits: { maxUsers: 5, maxProjects: 10, maxStorageGB: 10 },
  },
  professional: {
    label: 'Professional',
    description: 'For growing regulatory teams',
    color: '#0d6efd',
    features: ['25 users', '50 projects', '100 GB storage', 'Priority support', 'API access'],
    limits: { maxUsers: 25, maxProjects: 50, maxStorageGB: 100 },
  },
  enterprise: {
    label: 'Enterprise',
    description: 'For large organizations',
    color: '#7c3aed',
    features: [
      'Unlimited users',
      'Unlimited projects',
      '1 TB storage',
      'Dedicated support',
      'SSO',
      'Custom integrations',
    ],
    limits: { maxUsers: 500, maxProjects: 1000, maxStorageGB: 1000 },
  },
  regulatory_plus: {
    label: 'Regulatory Plus',
    description: 'Full compliance suite with advanced features',
    color: '#dc2626',
    features: [
      'Everything in Enterprise',
      'Dedicated CSM',
      'Custom compliance',
      'On-premise option',
      'SLA guarantee',
    ],
    limits: { maxUsers: -1, maxProjects: -1, maxStorageGB: -1 }, // -1 = unlimited
  },
};

/** Access level display config */
export const ACCESS_LEVEL_CONFIG: Record<
  AccessLevel,
  { label: string; description: string; color: string }
> = {
  read_only: {
    label: 'Read Only',
    description: 'Can view documents and data',
    color: '#6b7280',
  },
  read_write: {
    label: 'Read & Write',
    description: 'Can create and edit content',
    color: '#0d6efd',
  },
  admin: {
    label: 'Administrator',
    description: 'Full access including user management',
    color: '#7c3aed',
  },
  auditor: {
    label: 'Auditor',
    description: 'Read-only with audit log access',
    color: '#ca8a04',
  },
  super_admin: {
    label: 'Super Admin',
    description: 'Platform-wide administrative access',
    color: '#dc2626',
  },
};

/** Audit event type display config */
export const AUDIT_EVENT_CONFIG: Record<
  AuditEventType,
  { label: string; category: string; severity: 'info' | 'warning' | 'error' | 'critical' }
> = {
  LOGIN: { label: 'User Login', category: 'Authentication', severity: 'info' },
  LOGOUT: { label: 'User Logout', category: 'Authentication', severity: 'info' },
  LOGIN_FAILED: { label: 'Failed Login', category: 'Authentication', severity: 'warning' },
  PASSWORD_CHANGE: { label: 'Password Changed', category: 'Security', severity: 'info' },
  PASSWORD_RESET: { label: 'Password Reset', category: 'Security', severity: 'warning' },
  MFA_ENABLED: { label: 'MFA Enabled', category: 'Security', severity: 'info' },
  MFA_DISABLED: { label: 'MFA Disabled', category: 'Security', severity: 'warning' },
  USER_CREATED: { label: 'User Created', category: 'User Management', severity: 'info' },
  USER_UPDATED: { label: 'User Updated', category: 'User Management', severity: 'info' },
  USER_DELETED: { label: 'User Deleted', category: 'User Management', severity: 'warning' },
  USER_LOCKED: { label: 'User Locked', category: 'Security', severity: 'warning' },
  USER_UNLOCKED: { label: 'User Unlocked', category: 'Security', severity: 'info' },
  ROLE_CHANGED: { label: 'Role Changed', category: 'User Management', severity: 'warning' },
  PERMISSION_GRANTED: { label: 'Permission Granted', category: 'Security', severity: 'info' },
  PERMISSION_REVOKED: { label: 'Permission Revoked', category: 'Security', severity: 'warning' },
  DOCUMENT_CREATED: { label: 'Document Created', category: 'Documents', severity: 'info' },
  DOCUMENT_UPDATED: { label: 'Document Updated', category: 'Documents', severity: 'info' },
  DOCUMENT_DELETED: { label: 'Document Deleted', category: 'Documents', severity: 'warning' },
  DOCUMENT_APPROVED: { label: 'Document Approved', category: 'Documents', severity: 'info' },
  DOCUMENT_SIGNED: { label: 'Document Signed', category: 'Compliance', severity: 'info' },
  DOCUMENT_VIEWED: { label: 'Document Viewed', category: 'Documents', severity: 'info' },
  DOCUMENT_EXPORTED: { label: 'Document Exported', category: 'Documents', severity: 'info' },
  PROJECT_CREATED: { label: 'Project Created', category: 'Projects', severity: 'info' },
  PROJECT_UPDATED: { label: 'Project Updated', category: 'Projects', severity: 'info' },
  SUBMISSION_CREATED: { label: 'Submission Created', category: 'Submissions', severity: 'info' },
  SUBMISSION_SUBMITTED: { label: 'Submission Filed', category: 'Submissions', severity: 'info' },
  SETTINGS_CHANGED: { label: 'Settings Changed', category: 'Administration', severity: 'warning' },
  ORGANIZATION_UPDATED: {
    label: 'Organization Updated',
    category: 'Administration',
    severity: 'warning',
  },
  API_KEY_CREATED: { label: 'API Key Created', category: 'Security', severity: 'warning' },
  API_KEY_REVOKED: { label: 'API Key Revoked', category: 'Security', severity: 'warning' },
  SESSION_TERMINATED: { label: 'Session Terminated', category: 'Security', severity: 'info' },
  SECURITY_ALERT: { label: 'Security Alert', category: 'Security', severity: 'critical' },
};
