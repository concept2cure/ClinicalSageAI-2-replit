/**
 * Concept2Cure Client Portal V2 - Security Context Hook
 *
 * Provides organization-level security context with compliance validation,
 * session management, and authorization utilities.
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  useEffect,
} from 'react';
import { sessionLogger, securityLogger } from '../utils/logger';
import type { UserRole } from '../core/portalTypes';
import type {
  Organization,
  UserProfile,
  OrganizationMembership,
  AuthSession,
  Permission,
  PermissionAction,
  ResourceType,
  AuditLogEntry,
} from '../core/securityTypes';
import type {
  ComplianceConfig,
  ComplianceHealth,
  SoDValidation,
} from '../core/regulatoryCompliance';
import {
  validateSoD,
  hasPermission,
  getArchetypeConfig,
  ROLE_PERMISSION_PRESETS,
  getComplianceCategory,
} from '../core/regulatoryCompliance';

// ─────────────────────────────────────────────────────────────────────────────
// STATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface SecurityState {
  /** Current user profile */
  user: UserProfile | null;
  /** Current organization */
  organization: Organization | null;
  /** User's membership in current organization */
  membership: OrganizationMembership | null;
  /** All user's organization memberships */
  allMemberships: OrganizationMembership[];
  /** Current auth session */
  session: AuthSession | null;
  /** Effective permissions (computed from roles) */
  permissions: Permission[];
  /** Compliance configuration */
  complianceConfig: ComplianceConfig | null;
  /** Compliance health status */
  complianceHealth: ComplianceHealth | null;
  /** Loading states */
  loading: {
    user: boolean;
    organization: boolean;
    session: boolean;
    compliance: boolean;
  };
  /** Error states */
  errors: {
    user: string | null;
    organization: string | null;
    session: string | null;
    compliance: string | null;
  };
}

type SecurityAction =
  | { type: 'SET_USER'; payload: UserProfile | null }
  | { type: 'SET_ORGANIZATION'; payload: Organization | null }
  | { type: 'SET_MEMBERSHIP'; payload: OrganizationMembership | null }
  | { type: 'SET_ALL_MEMBERSHIPS'; payload: OrganizationMembership[] }
  | { type: 'SET_SESSION'; payload: AuthSession | null }
  | { type: 'SET_PERMISSIONS'; payload: Permission[] }
  | { type: 'SET_COMPLIANCE_CONFIG'; payload: ComplianceConfig | null }
  | { type: 'SET_COMPLIANCE_HEALTH'; payload: ComplianceHealth | null }
  | { type: 'SET_LOADING'; payload: Partial<SecurityState['loading']> }
  | { type: 'SET_ERROR'; payload: Partial<SecurityState['errors']> }
  | { type: 'RESET' };

const initialState: SecurityState = {
  user: null,
  organization: null,
  membership: null,
  allMemberships: [],
  session: null,
  permissions: [],
  complianceConfig: null,
  complianceHealth: null,
  loading: {
    user: true,
    organization: true,
    session: true,
    compliance: false,
  },
  errors: {
    user: null,
    organization: null,
    session: null,
    compliance: null,
  },
};

function securityReducer(state: SecurityState, action: SecurityAction): SecurityState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_ORGANIZATION':
      return { ...state, organization: action.payload };
    case 'SET_MEMBERSHIP':
      return { ...state, membership: action.payload };
    case 'SET_ALL_MEMBERSHIPS':
      return { ...state, allMemberships: action.payload };
    case 'SET_SESSION':
      return { ...state, session: action.payload };
    case 'SET_PERMISSIONS':
      return { ...state, permissions: action.payload };
    case 'SET_COMPLIANCE_CONFIG':
      return { ...state, complianceConfig: action.payload };
    case 'SET_COMPLIANCE_HEALTH':
      return { ...state, complianceHealth: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: { ...state.loading, ...action.payload } };
    case 'SET_ERROR':
      return { ...state, errors: { ...state.errors, ...action.payload } };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

interface SecurityContextValue extends SecurityState {
  /** Check if user has permission for resource/action */
  can: (resource: ResourceType, action: PermissionAction) => boolean;
  /** Check if user has any of the specified roles */
  hasRole: (...roles: UserRole[]) => boolean;
  /** Validate SoD before role assignment */
  validateRoleAssignment: (proposedRole: UserRole) => SoDValidation;
  /** Check if electronic signature is required for action */
  requiresSignature: (action: string) => boolean;
  /** Check if MFA is required */
  requiresMFA: () => boolean;
  /** Get session time remaining (minutes) */
  sessionTimeRemaining: () => number;
  /** Check if session is about to expire */
  isSessionExpiring: () => boolean;
  /** Refresh user session */
  refreshSession: () => Promise<void>;
  /** Switch organization */
  switchOrganization: (orgId: string) => Promise<void>;
  /** Log security event */
  logSecurityEvent: (eventType: string, details: Record<string, unknown>) => void;
  /** Get compliance score */
  getComplianceScore: () => number;
  /** Check if training is current */
  isTrainingCurrent: () => boolean;
  /** Check if password needs rotation */
  needsPasswordRotation: () => boolean;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

interface SecurityProviderProps {
  children: React.ReactNode;
  /** Initial organization ID to load */
  initialOrgId?: string;
}

export function SecurityProvider({ children, initialOrgId }: SecurityProviderProps) {
  const [state, dispatch] = useReducer(securityReducer, initialState);

  // Compute permissions when membership changes
  useEffect(() => {
    if (state.membership) {
      const rolePermissions = state.membership.roles.flatMap(
        (role: any) => ROLE_PERMISSION_PRESETS[role] || []
      );

      // Merge role permissions with custom permissions
      const customPermissions = state.membership.customPermissions || [];
      const allPermissions = [...rolePermissions, ...customPermissions];

      // Deduplicate by resource
      const mergedPermissions = allPermissions.reduce<Permission[]>((acc, perm) => {
        const existing = acc.find(p => p.resource === perm.resource);
        if (existing) {
          existing.actions = [...new Set([...existing.actions, ...perm.actions])];
          if (perm.conditions) {
            existing.conditions = [...(existing.conditions || []), ...perm.conditions];
          }
        } else {
          acc.push({ ...perm });
        }
        return acc;
      }, []);

      dispatch({ type: 'SET_PERMISSIONS', payload: mergedPermissions });
    } else {
      dispatch({ type: 'SET_PERMISSIONS', payload: [] });
    }
  }, [state.membership]);

  // Load compliance config when organization changes
  useEffect(() => {
    if (state.organization) {
      const archetypeConfig = getArchetypeConfig(state.organization.businessModel);
      dispatch({ type: 'SET_COMPLIANCE_CONFIG', payload: archetypeConfig.compliance });
    } else {
      dispatch({ type: 'SET_COMPLIANCE_CONFIG', payload: null });
    }
  }, [state.organization]);

  // Check if user has permission
  const can = useCallback(
    (resource: ResourceType, action: PermissionAction): boolean => {
      if (!state.user || !state.membership) return false;
      if (state.membership.status !== 'ACTIVE') return false;
      return hasPermission(state.permissions, resource, action);
    },
    [state.user, state.membership, state.permissions]
  );

  // Check if user has role
  const hasRole = useCallback(
    (...roles: UserRole[]): boolean => {
      if (!state.membership) return false;
      return roles.some(role => state.membership!.roles.includes(role));
    },
    [state.membership]
  );

  // Validate SoD for role assignment
  const validateRoleAssignment = useCallback(
    (proposedRole: UserRole): SoDValidation => {
      if (!state.membership) {
        return { isCompliant: true, conflicts: [], waiverRequired: false, waiverApprovers: [] };
      }
      return validateSoD(state.membership.roles, proposedRole);
    },
    [state.membership]
  );

  // Check if action requires signature
  const requiresSignature = useCallback(
    (action: string): boolean => {
      if (!state.complianceConfig?.electronicSignatures.enabled) return false;
      return state.complianceConfig.electronicSignatures.requiredForActions.includes(
        action as never
      );
    },
    [state.complianceConfig]
  );

  // Check if MFA is required
  const requiresMFA = useCallback((): boolean => {
    if (!state.complianceConfig) return false;
    return state.complianceConfig.accessControl.mfaRequired;
  }, [state.complianceConfig]);

  // Get session time remaining
  const sessionTimeRemaining = useCallback((): number => {
    if (!state.session) return 0;
    const now = new Date();
    const expires = new Date(state.session.expiresAt);
    const remaining = Math.max(0, (expires.getTime() - now.getTime()) / 1000 / 60);
    return Math.round(remaining);
  }, [state.session]);

  // Check if session is expiring soon
  const isSessionExpiring = useCallback((): boolean => {
    const remaining = sessionTimeRemaining();
    return remaining > 0 && remaining <= 5;
  }, [sessionTimeRemaining]);

  // Refresh session (placeholder for API call)
  const refreshSession = useCallback(async (): Promise<void> => {
    // TODO: Implement API call to refresh session
    sessionLogger.debug('Refreshing session...');
  }, []);

  // Switch organization
  const switchOrganization = useCallback(
    async (orgId: string): Promise<void> => {
      dispatch({ type: 'SET_LOADING', payload: { organization: true } });
      try {
        // TODO: Implement API call to switch organization
        const membership = state.allMemberships.find(m => m.organizationId === orgId);
        if (membership) {
          dispatch({ type: 'SET_MEMBERSHIP', payload: membership });
          // Load organization details
        }
      } catch (error) {
        dispatch({
          type: 'SET_ERROR',
          payload: { organization: 'Failed to switch organization' },
        });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: { organization: false } });
      }
    },
    [state.allMemberships]
  );

  // Log security event
  const logSecurityEvent = useCallback(
    (eventType: string, details: Record<string, unknown>): void => {
      const event: Partial<AuditLogEntry> = {
        timestamp: new Date().toISOString(),
        eventType: eventType as AuditLogEntry['eventType'],
        userId: state.user?.id || 'unknown',
        organizationId: state.organization?.id || 'unknown',
        metadata: {
          ...details,
          sessionId: state.session?.id,
          ipAddress: state.session?.ipAddress,
          userAgent: state.session?.userAgent,
        },
      };
      // TODO: Send to audit service
      securityLogger.audit('Security event', event as Record<string, unknown>);
    },
    [state.user, state.organization, state.session]
  );

  // Get compliance score
  const getComplianceScore = useCallback((): number => {
    return state.complianceHealth?.overallScore || 0;
  }, [state.complianceHealth]);

  // Check training currency
  const isTrainingCurrent = useCallback((): boolean => {
    if (!state.user || !state.complianceConfig?.training.required) return true;

    const lastTraining = state.user.trainingCompletedAt;
    if (!lastTraining) return false;

    const refreshDays = state.complianceConfig.training.refreshIntervalDays;
    const expiryDate = new Date(lastTraining);
    expiryDate.setDate(expiryDate.getDate() + refreshDays);

    return new Date() < expiryDate;
  }, [state.user, state.complianceConfig]);

  // Check password rotation need
  const needsPasswordRotation = useCallback((): boolean => {
    if (!state.user || !state.complianceConfig) return false;

    const lastChange = state.user.passwordLastChangedAt;
    if (!lastChange) return true;

    const expirationDays = state.complianceConfig.accessControl.passwordPolicy.expirationDays;
    const expiryDate = new Date(lastChange);
    expiryDate.setDate(expiryDate.getDate() + expirationDays);

    return new Date() >= expiryDate;
  }, [state.user, state.complianceConfig]);

  const value = useMemo<SecurityContextValue>(
    () => ({
      ...state,
      can,
      hasRole,
      validateRoleAssignment,
      requiresSignature,
      requiresMFA,
      sessionTimeRemaining,
      isSessionExpiring,
      refreshSession,
      switchOrganization,
      logSecurityEvent,
      getComplianceScore,
      isTrainingCurrent,
      needsPasswordRotation,
    }),
    [
      state,
      can,
      hasRole,
      validateRoleAssignment,
      requiresSignature,
      requiresMFA,
      sessionTimeRemaining,
      isSessionExpiring,
      refreshSession,
      switchOrganization,
      logSecurityEvent,
      getComplianceScore,
      isTrainingCurrent,
      needsPasswordRotation,
    ]
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useSecurityContext(): SecurityContextValue {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurityContext must be used within a SecurityProvider');
  }
  return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZATION HOOK
// ─────────────────────────────────────────────────────────────────────────────

interface UseAuthorizationOptions {
  resource: ResourceType;
  action: PermissionAction;
  fallback?: React.ReactNode;
}

export function useAuthorization({ resource, action }: UseAuthorizationOptions) {
  const { can, hasRole, user, membership } = useSecurityContext();

  return useMemo(
    () => ({
      isAuthorized: can(resource, action),
      isAdmin: hasRole('admin'),
      isAuthenticated: !!user,
      isActive: membership?.status === 'ACTIVE',
    }),
    [can, hasRole, user, membership, resource, action]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  children: React.ReactNode;
  resource?: ResourceType;
  action?: PermissionAction;
  roles?: UserRole[];
  fallback?: React.ReactNode;
  requireMFA?: boolean;
  requireTraining?: boolean;
}

export function ProtectedRoute({
  children,
  resource,
  action,
  roles,
  fallback,
  requireMFA,
  requireTraining,
}: ProtectedRouteProps) {
  const { user, membership, session, can, hasRole, requiresMFA, isTrainingCurrent } =
    useSecurityContext();

  // Check authentication
  if (!user || !session) {
    return fallback || <div>Please sign in to continue.</div>;
  }

  // Check membership status
  if (!membership || membership.status !== 'ACTIVE') {
    return fallback || <div>Your account is not active in this organization.</div>;
  }

  // Check MFA requirement
  if (requireMFA && requiresMFA() && !session.mfaVerified) {
    return fallback || <div>Multi-factor authentication required.</div>;
  }

  // Check training requirement
  if (requireTraining && !isTrainingCurrent()) {
    return fallback || <div>Training certification required.</div>;
  }

  // Check role requirement
  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return fallback || <div>You do not have the required role for this page.</div>;
  }

  // Check permission requirement
  if (resource && action && !can(resource, action)) {
    return fallback || <div>You do not have permission to access this resource.</div>;
  }

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MONITOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface SessionMonitorProps {
  onExpiring?: () => void;
  onExpired?: () => void;
  warningMinutes?: number;
}

export function SessionMonitor({ onExpiring, onExpired, warningMinutes = 5 }: SessionMonitorProps) {
  const { session, sessionTimeRemaining, refreshSession } = useSecurityContext();
  const [showWarning, setShowWarning] = React.useState(false);

  useEffect(() => {
    if (!session) return;

    const checkSession = () => {
      const remaining = sessionTimeRemaining();

      if (remaining <= 0) {
        onExpired?.();
        return;
      }

      if (remaining <= warningMinutes && !showWarning) {
        setShowWarning(true);
        onExpiring?.();
      }
    };

    const interval = setInterval(checkSession, 30000); // Check every 30 seconds
    checkSession(); // Initial check

    return () => clearInterval(interval);
  }, [session, sessionTimeRemaining, warningMinutes, onExpiring, onExpired, showWarning]);

  if (!showWarning) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-lg z-50">
      <h4 className="font-medium text-amber-900">Session Expiring Soon</h4>
      <p className="text-sm text-amber-700 mt-1">
        Your session will expire in {sessionTimeRemaining()} minutes.
      </p>
      <button
        onClick={() => {
          refreshSession();
          setShowWarning(false);
        }}
        className="mt-2 px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700"
      >
        Extend Session
      </button>
    </div>
  );
}
