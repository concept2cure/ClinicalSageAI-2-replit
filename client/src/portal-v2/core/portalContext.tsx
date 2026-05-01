/**
 * Concept2Cure Client Portal V2 - Context Provider
 *
 * Central context for portal state management including user experience,
 * notifications, and active workspace configuration.
 *
 * @version 2.0.0
 */

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/services/portal/authService';
import { getExperienceConfig, hasPermission, type Permission } from './portalPolicy';
import { getModuleConfig, getRolePreset, type RoleModulePreset } from './moduleRegistry';
import type {
  ExperienceConfig,
  RegulatoryAgency,
  UserRole,
  ModuleId,
  Notification,
  ProjectSummary,
  TaskSummary,
  PortalUser,
} from './portalTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Extended experience config with role for convenience */
interface ExtendedExperienceConfig extends ExperienceConfig {
  role: UserRole;
}

interface PortalContextValue {
  // User & Role
  user: PortalUser | null;
  currentRole: UserRole;
  agencies: RegulatoryAgency[];
  rolePreset: RoleModulePreset;

  // Experience Configuration
  experience: ExtendedExperienceConfig;

  // Active State
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;
  activeProject: ProjectSummary | null;
  setActiveProject: (project: ProjectSummary | null) => void;

  // Permissions
  can: (permission: Permission) => boolean;
  canAccessModule: (moduleId: ModuleId) => boolean;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Tasks
  pendingTasks: TaskSummary[];
  urgentTaskCount: number;

  // UI State
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Quick Actions
  recentModules: ModuleId[];
  addRecentModule: (module: ModuleId) => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface PortalProviderProps {
  children: React.ReactNode;
  initialModule?: ModuleId;
}

export const PortalProvider = ({ children, initialModule = 'dashboard' }: PortalProviderProps) => {
  const { user: authUser } = useAuth();

  // User context
  const isAnaRiIdentity = useMemo(() => {
    if (!authUser) return false;
    const email = (authUser.email || '').toLowerCase();
    const roles = (authUser.roles || []).map(role => role.toLowerCase());
    return roles.includes('ana_ri') || roles.includes('ana-ri') || email.includes('ana-ri');
  }, [authUser]);

  const currentRole = (isAnaRiIdentity ? 'admin' : authUser?.roles?.[0] as UserRole) || 'viewer';
  const agencies: RegulatoryAgency[] = useMemo(() => [], []); // TODO: Load from user profile
  const rolePreset = useMemo(() => getRolePreset(currentRole), [currentRole]);

  // Build portal user from auth user
  const user: PortalUser | null = useMemo(() => {
    if (!authUser) return null;
    return {
      id: authUser.id?.toString() || '',
      name: authUser.displayName || authUser.email || 'User',
      email: authUser.email || '',
      role: currentRole,
      organizations: [],
    };
  }, [authUser, currentRole]);

  // Experience configuration with role
  const experience: ExtendedExperienceConfig = useMemo(
    () => ({
      ...getExperienceConfig(currentRole, agencies),
      role: currentRole,
    }),
    [currentRole, agencies]
  );

  // Active state
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);

  // Notifications state (mock for now)
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Tasks state (mock for now)
  const [pendingTasks] = useState<TaskSummary[]>([]);
  const urgentTaskCount = useMemo(
    () => pendingTasks.filter(t => t.priority === 'critical' || t.priority === 'high').length,
    [pendingTasks]
  );

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Recent modules for quick access
  const [recentModules, setRecentModules] = useState<ModuleId[]>([]);

  const addRecentModule = useCallback((module: ModuleId) => {
    setRecentModules(prev => {
      const filtered = prev.filter(m => m !== module);
      return [module, ...filtered].slice(0, 5);
    });
  }, []);

  // Permission helpers
  const can = useCallback(
    (permission: Permission) => hasPermission(currentRole, permission),
    [currentRole]
  );

  const canAccessModule = useCallback(
    (moduleId: ModuleId) => {
      const config = getModuleConfig(moduleId);
      return config ? config.requiredRoles.includes(currentRole) : false;
    },
    [currentRole]
  );

  // Handle module change and track recent
  const handleSetActiveModule = useCallback(
    (module: ModuleId) => {
      if (canAccessModule(module)) {
        setActiveModule(module);
        addRecentModule(module);
      }
    },
    [canAccessModule, addRecentModule]
  );

  const value: PortalContextValue = {
    user,
    currentRole,
    agencies,
    rolePreset,
    experience,
    activeModule,
    setActiveModule: handleSetActiveModule,
    activeProject,
    setActiveProject,
    can,
    canAccessModule,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    pendingTasks,
    urgentTaskCount,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
    commandPaletteOpen,
    setCommandPaletteOpen,
    recentModules,
    addRecentModule,
  };

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main portal context hook
 */
export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
};

/**
 * Permission check hook
 */
export const usePermission = (permission: Permission) => {
  const { can } = usePortal();
  return can(permission);
};

/**
 * Module access hook - provides access checking functions
 */
export const useModuleAccess = () => {
  const { canAccessModule, experience } = usePortal();
  return {
    hasAccess: canAccessModule,
    isModuleEnabled: (moduleId: ModuleId) => experience.modules.includes(moduleId),
  };
};

/**
 * Module access hook for a specific module
 */
export const useModuleAccessFor = (moduleId: ModuleId) => {
  const { canAccessModule, experience } = usePortal();
  return {
    hasAccess: canAccessModule(moduleId),
    isEnabled: experience.modules.includes(moduleId),
  };
};

/**
 * Active module hook
 */
export const useActiveModule = () => {
  const { activeModule, setActiveModule } = usePortal();
  const config = useMemo(() => getModuleConfig(activeModule), [activeModule]);
  return { activeModule, setActiveModule, config };
};

/**
 * Notifications hook
 */
export const useNotifications = () => {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } =
    usePortal();
  return {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    // Aliases for convenience
    markAsRead: markNotificationRead,
    markAllAsRead: markAllNotificationsRead,
  };
};

/**
 * Tasks hook
 */
export const useTasks = () => {
  const { pendingTasks, urgentTaskCount } = usePortal();
  return { pendingTasks, urgentTaskCount };
};
