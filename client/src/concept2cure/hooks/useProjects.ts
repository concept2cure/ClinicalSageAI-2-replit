/**
 * @fileoverview Concept2Cure Projects API Hook
 * @module concept2cure/hooks/useProjects
 * @version 2.0.0
 *
 * @description
 * Handles project CRUD operations with database persistence.
 * Falls back to localStorage for offline/demo mode.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Audit trail maintained server-side
 * - Data persistence with automatic backup to localStorage
 *
 * @see {@link https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application}
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Project, Conversation, SubmissionType } from '../types';
import { queryKeys } from './queryKeys';
import { apiRequest } from '@/lib/queryClient';

/** Storage key for localStorage fallback */
const STORAGE_KEY = 'concept2cure_projects';

/** Feature flag to enable API-first approach with fallback */
const USE_API = true;
const ENABLE_LOCAL_PROJECT_FALLBACK =
  (import.meta as any).env?.VITE_ENABLE_LOCAL_PROJECT_FALLBACK === 'true';
type WorkbenchMode =
  | 'project-home'
  | 'regulatory-workspace'
  | 'documents'
  | 'review'
  | 'submissions'
  | 'section-workspace'
  | 'report-engine';

export type ProjectCollaboratorPermission = 'can_use' | 'can_edit';

export interface ProjectCollaborator {
  userId: number;
  permission: ProjectCollaboratorPermission;
  name?: string | null;
  email?: string | null;
}

export interface ProjectTeamMember {
  userId: number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

function withRequiredOwnership(project: Project): Project {
  return {
    ...project,
    targetAgency: project.targetAgency ?? undefined,
    ownership: {
      chatHistory: project.ownership?.chatHistory ?? project.conversations ?? [],
      documentInventory: project.ownership?.documentInventory ?? project.knowledge?.documents ?? [],
      vaultLinkedFilesEvidence: project.ownership?.vaultLinkedFilesEvidence ?? [],
      projectInstructions:
        project.ownership?.projectInstructions ?? project.customInstructions ?? '',
      ownershipTeam: project.ownership?.ownershipTeam ?? [],
      reusableSnippetsKnowledge: project.ownership?.reusableSnippetsKnowledge ?? [],
      reports: project.ownership?.reports ?? [],
      reviewState: project.ownership?.reviewState ?? 'draft',
      approvals: project.ownership?.approvals ?? project.signatures ?? [],
      readinessState: project.ownership?.readinessState ?? 'not_started',
      activityHistory: project.ownership?.activityHistory ?? project.auditTrail ?? [],
      currentWorkbenchContext: project.ownership?.currentWorkbenchContext ?? '',
    },
  };
}

/**
 * Retrieves projects from localStorage
 * @returns Array of projects with properly typed dates
 * @private
 */
function getStoredProjects(): Project[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const projects = JSON.parse(stored);
      return projects.map((p: any) =>
        withRequiredOwnership({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          conversations:
            p.conversations?.map((c: any) => ({
              ...c,
              createdAt: new Date(c.createdAt),
              updatedAt: new Date(c.updatedAt),
              messages:
                c.messages?.map((m: any) => ({
                  ...m,
                  timestamp: new Date(m.timestamp),
                })) || [],
            })) || [],
        })
      );
    }
  } catch (e) {
    console.error('[useProjects] Failed to parse stored projects:', e);
  }
  return [];
}

/**
 * Persists projects to localStorage
 * @param projects - Array of projects to save
 * @throws {Error} If localStorage quota is exceeded
 * @private
 */
function saveStoredProjects(projects: Project[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('[useProjects] Failed to save projects:', e);
    // If quota exceeded, try to clear old data and retry once
    if (typeof e === 'object' && e && 'code' in e && (e as { code?: number }).code === 22) {
      console.warn('[useProjects] Storage quota exceeded, attempting cleanup');
      // Keep only the 10 most recent projects
      const trimmed = projects.slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  }
}

/**
 * Normalizes API response to ensure pinned and targetAgency fields are present.
 * The API may return these as top-level fields; this guarantees consistent defaults.
 */
function normalizeProjectResponse(project: Project): Project {
  return {
    ...project,
    pinned: project.pinned ?? false,
    targetAgency: project.targetAgency ?? null,
  };
}

/**
 * Fetches projects from the API
 * @returns Promise resolving to array of projects
 * @throws {Error} If API request fails
 * @private
 */
async function fetchProjectsFromAPI(): Promise<Project[]> {
  const response = await apiRequest('GET', '/api/concept2cure/projects');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message || payload?.error || `Failed to fetch projects: ${response.status}`
    );
  }
  return (payload?.data ?? payload).map((project: Project) =>
    normalizeProjectResponse(withRequiredOwnership(project))
  );
}

/**
 * Creates a new project via API
 * @param project - Project data (without generated fields)
 * @returns Promise resolving to the created project
 * @throws {Error} If API request fails
 * @private
 */
async function createProjectAPI(
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project> {
  const response = await apiRequest('POST', '/api/concept2cure/projects', project);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message || payload?.error || `Failed to create project: ${response.status}`
    );
  }
  return normalizeProjectResponse(withRequiredOwnership(payload?.data ?? payload));
}

/**
 * Updates an existing project via API
 * @param project - Full project object with updates
 * @returns Promise resolving to the updated project
 * @throws {Error} If API request fails
 * @private
 */
async function updateProjectAPI(project: Project): Promise<Project> {
  const response = await apiRequest('PUT', `/api/concept2cure/projects/${project.id}`, project);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message || payload?.error || `Failed to update project: ${response.status}`
    );
  }
  return normalizeProjectResponse(withRequiredOwnership(payload?.data ?? payload));
}

/**
 * Deletes a project via API
 * @param projectId - ID of the project to delete
 * @throws {Error} If API request fails
 * @private
 */
async function deleteProjectAPI(projectId: string): Promise<void> {
  const response = await apiRequest('DELETE', `/api/concept2cure/projects/${projectId}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message || payload?.error || `Failed to delete project: ${response.status}`
    );
  }
}

async function patchOwnershipPreferencesAPI(
  projectId: string,
  preferences: {
    projectInstructions?: string;
    reusableSnippetsKnowledge?: string[];
    currentWorkbenchContext?: WorkbenchMode;
  }
): Promise<Project> {
  const response = await fetch(
    `/api/concept2cure/projects/${projectId}/ownership-preferences`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(preferences),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Failed to update ownership preferences: ${response.status}`
    );
  }
  return normalizeProjectResponse(withRequiredOwnership(payload?.data ?? payload));
}

/**
 * Updates project ownership preferences via API.
 * @param projectId - ID of the project to patch
 * @param preferences - Ownership preference updates
 * @returns Promise resolving to updated project
 * @throws {Error} If API request fails
 * @private
 */
async function patchOwnershipPreferencesAPI(
  projectId: string,
  preferences: {
    projectInstructions?: string;
    reusableSnippetsKnowledge?: string[];
    currentWorkbenchContext?: WorkbenchMode;
  }
): Promise<Project> {
  const response = await apiRequest(
    'PATCH',
    `/api/concept2cure/projects/${projectId}/ownership-preferences`,
    preferences
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Failed to update ownership preferences: ${response.status}`
    );
  }
  return normalizeProjectResponse(withRequiredOwnership(payload?.data ?? payload));
}

async function fetchProjectCollaboratorsAPI(projectId: string): Promise<ProjectCollaborator[]> {
  const response = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/collaborators`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Failed to fetch project collaborators: ${response.status}`
    );
  }
  return ((payload?.data ?? payload)?.collaborators ?? []) as ProjectCollaborator[];
}

async function updateProjectCollaboratorsAPI(
  projectId: string,
  collaborators: ProjectCollaborator[]
): Promise<ProjectCollaborator[]> {
  const response = await apiRequest('PUT', `/api/concept2cure/projects/${projectId}/collaborators`, {
    collaborators: collaborators.map(c => ({
      userId: c.userId,
      permission: c.permission,
    })),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Failed to update project collaborators: ${response.status}`
    );
  }
  return ((payload?.data ?? payload)?.collaborators ?? []) as ProjectCollaborator[];
}

async function fetchProjectTeamMembersAPI(projectId: string): Promise<ProjectTeamMember[]> {
  const response = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/team`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error?.message || payload?.error || `Failed to fetch team members: ${response.status}`
    );
  }
  const members = (payload?.data ?? payload ?? []) as any[];
  return members.map(member => ({
    userId: Number(member.userId ?? member.id),
    name: member.name ?? member.displayName ?? null,
    email: member.email ?? null,
    role: member.role ?? member.projectRole ?? null,
  }));
}

/**
 * React Query hook for managing Concept2Cure projects
 *
 * @description
 * Provides CRUD operations for regulatory submission projects with:
 * - API-first approach with automatic localStorage fallback
 * - Optimistic updates for better UX
 * - Automatic cache invalidation
 * - Rate limit handling
 *
 * @example
 * ```tsx
 * const { projects, createProject, isCreating } = useProjects();
 *
 * const handleCreate = async () => {
 *   const project = await createProject({
 *     name: 'My Device',
 *     submissionType: '510K',
 *   });
 * };
 * ```
 *
 * @returns {Object} Project operations and state
 */
export function useProjects() {
  const queryClient = useQueryClient();

  /**
   * Fetches all projects with API-first approach
   * Falls back to localStorage if API is unavailable
   */
  const projectsQuery = useQuery({
    queryKey: [...queryKeys.projects.all],
    queryFn: async () => {
      if (USE_API) {
        try {
          const projects = await fetchProjectsFromAPI();
          // Sync to localStorage as backup
          saveStoredProjects(projects);
          return projects;
        } catch (e) {
          if (ENABLE_LOCAL_PROJECT_FALLBACK) {
            console.warn('API fetch failed, using localStorage fallback:', e);
            return getStoredProjects();
          }
          throw e;
        }
      }
      return getStoredProjects();
    },
    staleTime: 1000 * 60, // 1 minute
  });

  // Create project mutation
  const createProject = useMutation({
    mutationFn: async (data: {
      name: string;
      submissionType: SubmissionType | string;
      description?: string;
      pinned?: boolean;
      targetAgency?: string;
      customInstructions?: string;
      registryId?: string;
      applicationFamily?: string;
      applicationType?: string;
      agency?: string;
      dossierStandard?: string;
      [key: string]: unknown;
    }) => {
      if (USE_API) {
        try {
          const result = await createProjectAPI(data);
          return result;
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API create failed, using localStorage fallback:', e);
        }
      }

      // Fallback to localStorage
      const normalizedSubmissionType = String(data.submissionType).toUpperCase() as SubmissionType;
      const newProject: Project = withRequiredOwnership({
        id: `proj_${Date.now()}`,
        name: data.name,
        submissionType: normalizedSubmissionType,
        description: data.description,
        conversations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const projects = getStoredProjects();
      projects.unshift(newProject);
      saveStoredProjects(projects);
      return newProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  // Update project mutation
  const updateProject = useMutation({
    mutationFn: async (project: Project) => {
      const updatedProject = withRequiredOwnership({ ...project, updatedAt: new Date() });

      if (USE_API) {
        try {
          return await updateProjectAPI(updatedProject);
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API update failed, using localStorage fallback:', e);
        }
      }

      // Fallback to localStorage
      const projects = getStoredProjects();
      const index = projects.findIndex(p => p.id === project.id);
      if (index !== -1) {
        projects[index] = updatedProject;
        saveStoredProjects(projects);
      }
      return updatedProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  // Delete project mutation
  const deleteProject = useMutation({
    mutationFn: async (projectId: string) => {
      if (USE_API) {
        try {
          await deleteProjectAPI(projectId);
          return;
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API delete failed, using localStorage fallback:', e);
        }
      }

      // Fallback to localStorage
      const projects = getStoredProjects();
      const filtered = projects.filter(p => p.id !== projectId);
      saveStoredProjects(filtered);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  const updateOwnershipPreferences = useMutation({
    mutationFn: async ({
      projectId,
      preferences,
    }: {
      projectId: string;
      preferences: {
        projectInstructions?: string;
        reusableSnippetsKnowledge?: string[];
        currentWorkbenchContext?: WorkbenchMode;
      };
    }) => {
      if (USE_API) {
        try {
          return await patchOwnershipPreferencesAPI(projectId, preferences);
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API ownership preference update failed, using localStorage fallback:', e);
        }
      }

      const projects = getStoredProjects();
      const index = projects.findIndex(p => p.id === projectId);
      if (index === -1) throw new Error('Project not found');
      const project = withRequiredOwnership(projects[index]);
      const merged = withRequiredOwnership({
        ...project,
        customInstructions: preferences.projectInstructions ?? project.customInstructions,
        ownership: {
          ...project.ownership,
          projectInstructions:
            preferences.projectInstructions ?? project.ownership?.projectInstructions ?? '',
          reusableSnippetsKnowledge:
            preferences.reusableSnippetsKnowledge ??
            project.ownership?.reusableSnippetsKnowledge ??
            [],
          currentWorkbenchContext:
            preferences.currentWorkbenchContext ??
            project.ownership?.currentWorkbenchContext ??
            'project-home',
        },
      });
      projects[index] = merged;
      saveStoredProjects(projects);
      return merged;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  // Add conversation to project
  const addConversation = useMutation({
    mutationFn: async ({ projectId, title }: { projectId: string; title?: string }) => {
      // Try API first
      if (USE_API) {
        try {
          const response = await apiRequest(
            'POST',
            `/api/concept2cure/projects/${projectId}/conversations`,
            { title }
          );
          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (payload?.success === false) {
              throw new Error(
                payload?.error?.message || payload?.error || 'Failed to create conversation'
              );
            }
            return payload?.data ?? payload;
          }
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API conversation create failed, using localStorage fallback:', e);
        }
      }

      // Fallback to localStorage
      const projects = getStoredProjects();
      const project = projects.find(p => p.id === projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      const newConversation: Conversation = {
        id: `conv_${Date.now()}`,
        projectId,
        title: title || `Conversation ${project.conversations.length + 1}`,
        messages: [],
        artifacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      project.conversations.push(newConversation);
      project.updatedAt = new Date();
      saveStoredProjects(projects);

      return newConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  // Update conversation (add messages, update title)
  const updateConversation = useMutation({
    mutationFn: async ({
      projectId,
      conversation,
    }: {
      projectId: string;
      conversation: Conversation;
    }) => {
      // For now, use localStorage for conversation updates (API would need full sync)
      const projects = getStoredProjects();
      const project = projects.find(p => p.id === projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      const convIndex = project.conversations.findIndex(c => c.id === conversation.id);
      if (convIndex === -1) {
        throw new Error('Conversation not found');
      }

      project.conversations[convIndex] = {
        ...conversation,
        updatedAt: new Date(),
      };
      project.updatedAt = new Date();
      saveStoredProjects(projects);

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
    },
  });

  return {
    projects: projectsQuery.data || [],
    isLoading: projectsQuery.isLoading,
    error: projectsQuery.error,
    createProject: createProject.mutateAsync,
    updateProject: updateProject.mutateAsync,
    deleteProject: deleteProject.mutateAsync,
    addConversation: addConversation.mutateAsync,
    updateConversation: updateConversation.mutateAsync,
    isCreating: createProject.isPending,
    isUpdating: updateProject.isPending,
    isDeleting: deleteProject.isPending,
    updateOwnershipPreferences: updateOwnershipPreferences.mutateAsync,
    isUpdatingOwnershipPreferences: updateOwnershipPreferences.isPending,
  };
}

// Hook for single project
export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.projects.detail(projectId!)],
    queryFn: async () => {
      if (!projectId) return null;

      // Try API first
      if (USE_API) {
        try {
          const response = await apiRequest('GET', `/api/concept2cure/projects/${projectId}`);
          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (payload?.success === false) {
              throw new Error(
                payload?.error?.message || payload?.error || 'Failed to fetch project'
              );
            }
            return withRequiredOwnership(payload?.data ?? payload);
          }
        } catch (e) {
          if (!ENABLE_LOCAL_PROJECT_FALLBACK) throw e;
          console.warn('API project fetch failed, using localStorage fallback:', e);
        }
      }

      const projects = getStoredProjects();
      const project = projects.find(p => p.id === projectId) || null;
      return project ? withRequiredOwnership(project) : null;
    },
    enabled: !!projectId,
  });
}

export function useProjectCollaborators(projectId: string | null) {
  const queryClient = useQueryClient();

  const collaboratorsQuery = useQuery({
    queryKey: [...queryKeys.projects.collaborators(projectId || 'none')],
    queryFn: async () => {
      if (!projectId) return [];
      return fetchProjectCollaboratorsAPI(projectId);
    },
    enabled: !!projectId,
    staleTime: 1000 * 30,
  });

  const updateCollaborators = useMutation({
    mutationFn: async (collaborators: ProjectCollaborator[]) => {
      if (!projectId) throw new Error('Project ID is required');
      return updateProjectCollaboratorsAPI(projectId, collaborators);
    },
    onSuccess: () => {
      if (!projectId) return;
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.collaborators(projectId)] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.all] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId)] });
    },
  });

  return {
    collaborators: collaboratorsQuery.data || [],
    isLoading: collaboratorsQuery.isLoading,
    error: collaboratorsQuery.error,
    refetch: collaboratorsQuery.refetch,
    updateCollaborators: updateCollaborators.mutateAsync,
    isUpdating: updateCollaborators.isPending,
  };
}

export function useProjectTeamMembers(projectId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.projects.teamMembers(projectId || 'none')],
    queryFn: async () => {
      if (!projectId) return [];
      return fetchProjectTeamMembersAPI(projectId);
    },
    enabled: !!projectId,
    staleTime: 1000 * 60,
  });
}
