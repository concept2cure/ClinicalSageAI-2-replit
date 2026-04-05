/**
 * License & User Intelligence Hooks
 *
 * Fetches organization license info, enabled modules, and full user intelligence
 * from the server. These hooks power license-based feature gating across the UI.
 *
 * @module concept2cure/hooks/useLicense
 * @version 1.0.0
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EnabledModule {
  moduleId: string;
  name: string;
  category: string;
  enabled: boolean;
}

export interface LicenseInfo {
  tier: string;
  industryMode: string;
  enabledModules: EnabledModule[];
  availableModuleIds: string[];
}

export interface WorkQueueItem {
  id: number;
  taskTitle: string;
  taskDescription: string;
  taskType: string;
  priority: number;
  status: string;
  dueDate?: string;
  estimatedMinutes?: number;
  aiConfidence?: number;
  aiReasoning?: string;
  projectId?: number;
}

export interface WorkSession {
  id: number;
  contextType: string;
  contextTitle: string;
  startedAt: string;
  lastActivityAt: string;
  messagesSent: number;
  artifactsCreated: number;
}

export interface ProjectSummary {
  id: number;
  name: string;
  status: string;
  submissionType?: string;
  phase?: string;
  progress?: number;
  lastAccessedAt?: string;
}

export interface UserIntelligence {
  identity: {
    id: number;
    name: string;
    email: string;
    title?: string;
    department?: string;
    role: string;
    greetingName: string;
    expertiseLevel: string;
    communicationStyle: string;
    focusAreas: string[];
    lastLogin?: string;
  };
  organization: {
    id: number;
    name: string;
    tier: string;
    industryMode: string;
    enabledModules: string[];
  };
  projects: ProjectSummary[];
  activeProject?: ProjectSummary;
  currentSession?: WorkSession;
  recentSessions: WorkSession[];
  workQueue: WorkQueueItem[];
  recentActivity: Array<{
    id: number;
    action: string;
    entityType: string;
    entityName: string;
    timestamp: string;
  }>;
  conversationMemory: {
    totalConversations: number;
    totalMessages: number;
    recentTopics: string[];
    frequentTopics: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const licenseQueryKeys = {
  all: ['license'] as const,
  enabled: () => [...licenseQueryKeys.all, 'enabled'] as const,
  catalog: () => [...licenseQueryKeys.all, 'catalog'] as const,
  info: () => [...licenseQueryKeys.all, 'info'] as const,
  check: (moduleId: string) => [...licenseQueryKeys.all, 'check', moduleId] as const,
  intelligence: () => ['user-intelligence'] as const,
  workQueue: (projectId?: string) => ['work-queue', projectId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/module-subscriptions${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `License API error: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS: LICENSE & MODULES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch enabled modules for the current organization.
 * This is the primary hook for feature gating in the UI.
 */
export function useEnabledModules() {
  return useQuery({
    queryKey: licenseQueryKeys.enabled(),
    queryFn: () =>
      apiFetch<{
        tier: string;
        industryMode: string;
        modules: EnabledModule[];
      }>('/enabled'),
    staleTime: 5 * 60 * 1000, // 5 minutes — license changes are infrequent
    retry: 1,
  });
}

/**
 * Fetch full module catalog with availability info.
 */
export function useModuleCatalog() {
  return useQuery({
    queryKey: licenseQueryKeys.catalog(),
    queryFn: () =>
      apiFetch<{
        catalog: Array<
          EnabledModule & {
            isAvailable: boolean;
            requiredTier: string;
          }
        >;
      }>('/catalog'),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch organization license info with quota usage.
 */
export function useLicenseInfo() {
  return useQuery({
    queryKey: licenseQueryKeys.info(),
    queryFn: () => apiFetch<Record<string, unknown>>('/license'),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Check access to a specific module.
 */
export function useModuleAccess(moduleId: string) {
  return useQuery({
    queryKey: licenseQueryKeys.check(moduleId),
    queryFn: () => apiFetch<{ allowed: boolean; reason?: string }>(`/check/${moduleId}`),
    enabled: !!moduleId,
    staleTime: 5 * 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS: USER INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch complete user intelligence for the current user.
 * Powers personalized greetings, work continuity, and context-aware UI.
 */
export function useUserIntelligence() {
  return useQuery({
    queryKey: licenseQueryKeys.intelligence(),
    queryFn: () => apiFetch<UserIntelligence>('/user-intelligence'),
    staleTime: 2 * 60 * 1000, // 2 minutes — sessions change frequently
    retry: 1,
  });
}

/**
 * Fetch AI-recommended work queue items.
 */
export function useWorkQueue(projectId?: string) {
  return useQuery({
    queryKey: licenseQueryKeys.workQueue(projectId),
    queryFn: () =>
      apiFetch<{ queue: WorkQueueItem[] }>(
        `/work-queue${projectId ? `?projectId=${projectId}` : ''}`
      ),
    staleTime: 3 * 60 * 1000,
  });
}

/**
 * Touch/update user's current work session.
 */
export function useTouchWorkSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      projectId?: number;
      contextType?: string;
      contextReference?: string;
      contextTitle?: string;
    }) =>
      apiFetch<{ session: WorkSession }>('/work-session', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: licenseQueryKeys.intelligence() });
    },
  });
}

/**
 * Update work queue item status.
 */
export function useUpdateWorkQueueStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; status: string }) =>
      apiFetch<{ item: WorkQueueItem }>(`/work-queue/${params.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: params.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-queue'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED HOOKS: MODULE GATING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Layout mode → module ID mapping.
 * Maps each UI layout mode to the module that must be enabled to access it.
 */
// 7 canonical layout modes — all map to core. WorkspaceView sub-routing doesn't need license gating.
const LAYOUT_MODULE_MAP: Record<string, string> = {
  chats: 'core',
  projects: 'core',
  'project-home': 'core',
  'project-workspace': 'core',
  'communication-center': 'core',
  apps: 'core',
  settings: 'core',
};

/**
 * Returns a function that checks if a layout mode is accessible
 * based on the current license, and the filtered list of available modes.
 */
export function useLicenseGating() {
  const { data: enabledData, isLoading } = useEnabledModules();

  const enabledModuleIds = useMemo(() => {
    if (!enabledData?.modules) return new Set<string>();
    return new Set(enabledData.modules.filter(m => m.enabled).map(m => m.moduleId));
  }, [enabledData]);

  const tier = enabledData?.tier || 'free';
  const industryMode = enabledData?.industryMode || 'biotech';

  const canAccessLayoutMode = useCallback(
    (modeId: string): boolean => {
      const requiredModule = LAYOUT_MODULE_MAP[modeId];
      if (!requiredModule || requiredModule === 'core') return true; // core always accessible
      return enabledModuleIds.has(requiredModule);
    },
    [enabledModuleIds]
  );

  const canAccessModule = useCallback(
    (moduleId: string): boolean => {
      if (!moduleId) return false;
      return enabledModuleIds.has(moduleId);
    },
    [enabledModuleIds]
  );

  return {
    isLoading,
    tier,
    industryMode,
    enabledModuleIds,
    canAccessLayoutMode,
    canAccessModule,
  };
}

/**
 * Combined hook: provides user intelligence + license gating in one call.
 * Primary integration point for ZenApp.
 */
export function usePlatformContext() {
  const license = useLicenseGating();
  const { data: intelligence, isLoading: intelligenceLoading } = useUserIntelligence();

  const greeting = useMemo(() => {
    if (!intelligence?.identity) return null;
    const { greetingName, title, department } = intelligence.identity;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return {
      text: `${timeGreeting}, ${greetingName}`,
      subtitle: [title, department].filter(Boolean).join(' · '),
      name: greetingName,
    };
  }, [intelligence]);

  const lastWorkSummary = useMemo(() => {
    if (!intelligence?.recentSessions?.length) return null;
    const last = intelligence.recentSessions[0];
    return {
      contextTitle: last.contextTitle,
      contextType: last.contextType,
      lastActivityAt: last.lastActivityAt,
    };
  }, [intelligence]);

  const nextTask = useMemo(() => {
    if (!intelligence?.workQueue?.length) return null;
    return intelligence.workQueue[0];
  }, [intelligence]);

  return {
    ...license,
    intelligence,
    intelligenceLoading,
    greeting,
    lastWorkSummary,
    nextTask,
  };
}
