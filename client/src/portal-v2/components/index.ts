/**
 * Concept2Cure Client Portal V2 - All Components Index
 *
 * Central export file for all portal components including
 * admin, security, compliance, and feature components.
 *
 * @version 2.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARDS & FEATURES
// ─────────────────────────────────────────────────────────────────────────────

// Dashboards
export * from './dashboards';

// Feature components
export * from './vault';
export * from './ai-assistant';
export * from './workflows';

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PORTAL
// ─────────────────────────────────────────────────────────────────────────────

// AdminPortalIndex — removed (deleted in dead code purge)

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as AdminDashboard } from './admin/AdminDashboard';
export { default as UserManagement } from './admin/UserManagement';
export { default as RolePermissionManager } from './admin/RolePermissionManager';
export { default as OrganizationManagement } from './admin/OrganizationManagement';
export { default as DelegationOfAuthority } from './admin/DelegationOfAuthority';
export { default as AccessControlMatrix } from './admin/AccessControlMatrix';
export { default as SessionManager } from './admin/SessionManager';
export { default as TrainingManagement } from './admin/TrainingManagement';

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as ElectronicSignature } from './security/ElectronicSignature';
export { default as IPAllowlistManagement } from './security/IPAllowlistManagement';
export { default as SecurityAlertsDashboard } from './security/SecurityAlertsDashboard';

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as SecuritySettings } from './settings/SecuritySettings';

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as ComplianceDashboard } from './compliance/ComplianceDashboard';
export { default as AuditTrailViewer } from './audit/AuditTrailViewer';

// ─────────────────────────────────────────────────────────────────────────────
// MONITORING COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as ActivityMonitor } from './monitoring/ActivityMonitor';

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

export { default as OnboardingWizard } from './onboarding/OnboardingWizard';

// Cortex AI components — removed (deleted in dead code purge)
