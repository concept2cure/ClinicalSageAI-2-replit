/**
 * User Context - Enterprise User State Management
 *
 * Provides comprehensive user state including:
 * - User profile and authentication status
 * - Role and permission information
 * - Organization and project context
 * - Module access based on role
 *
 * This context is used across ALL modules to ensure consistent
 * user experience and proper access control.
 *
 * @module contexts/UserContext
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { useAuth } from '@/portal-v2/services/authService';
import { useTenant } from '@/contexts/TenantContext';

// Types
export type UserRole =
  | 'admin'
  | 'regulatory_lead'
  | 'clinical_ops'
  | 'medical_writer'
  | 'biostatistician'
  | 'quality_assurance'
  | 'legal_counsel'
  | 'executive'
  | 'cmc_specialist'
  | 'safety_officer'
  | 'project_manager'
  | 'viewer'
  | 'external_partner';

export interface UserProject {
  id: string;
  name: string;
  type: '510k' | 'ind' | 'cer' | 'nda' | 'pma' | 'other';
  status: 'active' | 'draft' | 'submitted' | 'approved' | 'archived';
  role: string; // User's role on this project
  lastAccessed?: string;
}

export interface UserPermission {
  module: string;
  actions: ('view' | 'create' | 'edit' | 'delete' | 'approve' | 'submit')[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  roles: UserRole[];
  organizationId: string;
  organizationName: string;
  department?: string;
  title?: string;
  phone?: string;
  mfaEnabled: boolean;
  lastLogin?: string;
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
    language: string;
    timezone: string;
  };
}

interface UserContextType {
  // User profile
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Roles & Permissions
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (module: string, action: string) => boolean;
  permissions: UserPermission[];
  isAdmin: boolean;

  // Projects
  projects: UserProject[];
  currentProject: UserProject | null;
  setCurrentProject: (project: UserProject | null) => void;

  // Module Access
  canAccessModule: (moduleId: string) => boolean;
  availableModules: string[];

  // Actions
  refreshProfile: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserProfile['preferences']>) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Module access by role
const ROLE_MODULE_ACCESS: Record<UserRole, string[]> = {
  admin: ['*'], // All modules
  regulatory_lead: [
    'dashboard',
    'vault',
    'cer',
    '510k',
    'ind',
    'ectd',
    'submissions',
    'analytics',
    'compliance',
    'users',
    'projects',
  ],
  clinical_ops: ['dashboard', 'vault', 'protocols', 'csr', 'analytics', 'projects'],
  medical_writer: ['dashboard', 'vault', 'cer', 'coauthor', 'templates', 'projects'],
  biostatistician: ['dashboard', 'vault', 'analytics', 'csr', 'protocols', 'projects'],
  quality_assurance: ['dashboard', 'vault', 'cer', 'compliance', 'audit', 'projects'],
  legal_counsel: ['dashboard', 'vault', 'compliance', 'contracts', 'projects'],
  executive: ['dashboard', 'analytics', 'reports', 'projects'],
  cmc_specialist: ['dashboard', 'vault', 'cmc', 'stability', 'manufacturing', 'projects'],
  safety_officer: ['dashboard', 'vault', 'safety', 'pharmacovigilance', 'projects'],
  project_manager: ['dashboard', 'vault', 'projects', 'timeline', 'resources', 'analytics'],
  viewer: ['dashboard', 'vault', 'projects'],
  external_partner: ['dashboard', 'vault', 'projects'],
};

// Permission definitions by role
const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  admin: [{ module: '*', actions: ['view', 'create', 'edit', 'delete', 'approve', 'submit'] }],
  regulatory_lead: [
    { module: 'documents', actions: ['view', 'create', 'edit', 'approve', 'submit'] },
    { module: 'submissions', actions: ['view', 'create', 'edit', 'approve', 'submit'] },
    { module: 'users', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view', 'create', 'edit', 'approve'] },
  ],
  clinical_ops: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'protocols', actions: ['view', 'create', 'edit', 'approve'] },
    { module: 'projects', actions: ['view', 'edit'] },
  ],
  medical_writer: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'templates', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view'] },
  ],
  biostatistician: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'analytics', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view'] },
  ],
  quality_assurance: [
    { module: 'documents', actions: ['view', 'approve'] },
    { module: 'audit', actions: ['view', 'create'] },
    { module: 'compliance', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view'] },
  ],
  legal_counsel: [
    { module: 'documents', actions: ['view', 'approve'] },
    { module: 'contracts', actions: ['view', 'create', 'edit', 'approve'] },
    { module: 'projects', actions: ['view'] },
  ],
  executive: [
    { module: 'documents', actions: ['view'] },
    { module: 'analytics', actions: ['view'] },
    { module: 'reports', actions: ['view'] },
    { module: 'projects', actions: ['view', 'approve'] },
  ],
  cmc_specialist: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'cmc', actions: ['view', 'create', 'edit', 'approve'] },
    { module: 'stability', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view', 'edit'] },
  ],
  safety_officer: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'safety', actions: ['view', 'create', 'edit', 'approve'] },
    { module: 'projects', actions: ['view'] },
  ],
  project_manager: [
    { module: 'documents', actions: ['view', 'create', 'edit'] },
    { module: 'projects', actions: ['view', 'create', 'edit'] },
    { module: 'timeline', actions: ['view', 'create', 'edit'] },
    { module: 'resources', actions: ['view', 'create', 'edit'] },
  ],
  viewer: [
    { module: 'documents', actions: ['view'] },
    { module: 'projects', actions: ['view'] },
  ],
  external_partner: [
    { module: 'documents', actions: ['view'] },
    { module: 'projects', actions: ['view'] },
  ],
};

export function UserProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentOrganization, currentClientWorkspace } = useTenant();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [currentProject, setCurrentProject] = useState<UserProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Compute derived values
  const primaryRole: UserRole = (profile?.role as UserRole) || 'viewer';
  const allRoles: UserRole[] = (profile?.roles as UserRole[]) || [primaryRole];
  const isAdmin = allRoles.includes('admin');

  // Get permissions for user
  const permissions: UserPermission[] = allRoles.flatMap(role => ROLE_PERMISSIONS[role] || []);

  // Get available modules
  const availableModules: string[] = isAdmin
    ? ['*']
    : [...new Set(allRoles.flatMap(role => ROLE_MODULE_ACCESS[role] || []))];

  // Check if user has a specific role
  const hasRole = useCallback(
    (role: UserRole | UserRole[]): boolean => {
      if (isAdmin) return true;
      const rolesToCheck = Array.isArray(role) ? role : [role];
      return rolesToCheck.some(r => allRoles.includes(r));
    },
    [allRoles, isAdmin]
  );

  // Check if user has a specific permission
  const hasPermission = useCallback(
    (module: string, action: string): boolean => {
      if (isAdmin) return true;
      return permissions.some(
        p => (p.module === '*' || p.module === module) && p.actions.includes(action as any)
      );
    },
    [permissions, isAdmin]
  );

  // Check if user can access a module
  const canAccessModule = useCallback(
    (moduleId: string): boolean => {
      if (isAdmin || availableModules.includes('*')) return true;
      return availableModules.includes(moduleId);
    },
    [availableModules, isAdmin]
  );

  // Fetch user profile
  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProjects([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Build profile from auth user and tenant context
      const primaryRole = (user.roles?.[0] as UserRole) || 'viewer';
      const userProfile: UserProfile = {
        id: user.id?.toString() || '1',
        email: user.email || '',
        name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
        role: primaryRole,
        roles: (user.roles as UserRole[]) || [primaryRole],
        organizationId: user.organizationId || currentOrganization?.id?.toString() || '',
        organizationName: user.organizationName || currentOrganization?.name || 'Organization',
        mfaEnabled: user.mfaEnabled || false,
        lastLogin: user.lastLoginAt?.toString(),
        preferences: {
          theme: 'light',
          notifications: true,
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      setProfile(userProfile);

      // Fetch user's projects
      try {
        const projectsResponse = await fetch(`/api/projects?userId=${userProfile.id}`);
        if (projectsResponse.ok) {
          const projectsData = await projectsResponse.json();
          setProjects(projectsData.projects || projectsData || []);
        }
      } catch (err) {
        // Use mock projects for development
        setProjects([
          { id: '1', name: 'CardioFlow 510(k)', type: '510k', status: 'active', role: 'lead' },
          { id: '2', name: 'Pembrolizumab IND', type: 'ind', status: 'draft', role: 'contributor' },
          { id: '3', name: 'OncoPlex CER', type: 'cer', status: 'active', role: 'reviewer' },
        ]);
      }

      // Restore last selected project from localStorage
      const savedProjectId = localStorage.getItem('currentProjectId');
      if (savedProjectId) {
        const savedProject = projects.find(p => p.id === savedProjectId);
        if (savedProject) setCurrentProject(savedProject);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, [user, currentOrganization]);

  // Update user preferences
  const updatePreferences = useCallback(
    async (prefs: Partial<UserProfile['preferences']>) => {
      if (!profile) return;

      try {
        // Update local state
        setProfile({
          ...profile,
          preferences: { ...profile.preferences, ...prefs } as UserProfile['preferences'],
        });

        // Persist to server
        await fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
      } catch (error) {
      }
    },
    [profile]
  );

  // Handle project change
  const handleSetCurrentProject = useCallback((project: UserProject | null) => {
    setCurrentProject(project);
    try {
      if (project) {
        localStorage.setItem('currentProjectId', project.id);
      } else {
        localStorage.removeItem('currentProjectId');
      }
    } catch { /* private browsing */ }
  }, []);

  // Initial load
  useEffect(() => {
    if (!authLoading) {
      refreshProfile();
    }
  }, [authLoading, user, currentOrganization, refreshProfile]);

  const contextValue: UserContextType = {
    profile,
    isLoading: isLoading || authLoading,
    isAuthenticated: !!profile && isAuthenticated,
    hasRole,
    hasPermission,
    permissions,
    isAdmin,
    projects,
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    canAccessModule,
    availableModules,
    refreshProfile,
    updatePreferences,
  };

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export default UserContext;
