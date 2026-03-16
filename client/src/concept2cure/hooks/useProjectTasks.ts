/**
 * @fileoverview Project Task Management Hook
 * @module concept2cure/hooks/useProjectTasks
 *
 * Provides CRUD operations for regulatory project tasks with
 * submission-aware milestone generation and health scoring.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface ProjectTask {
  id: number;
  projectId: number;
  name: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  moduleType?: string;
  dueDate?: string;
  assigneeId?: number;
  parentTaskId?: number;
  estimatedHours?: number;
  actualHours?: number;
  completedAt?: string;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  total: number;
  completed: number;
  overdue: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  healthScore: number;
  completionRate: number;
}

export interface SubmissionMilestone {
  name: string;
  category: string;
  order: number;
}

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useProjectTasks(projectId: string | number | null) {
  const queryClient = useQueryClient();
  const pid = projectId ? String(projectId) : null;

  const tasksQuery = useQuery({
    queryKey: ['project-tasks', pid],
    queryFn: async (): Promise<ProjectTask[]> => {
      if (!pid) return [];
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks`, {
        headers: getAuthHeaders(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || 'Failed to fetch tasks');
      return payload?.data ?? [];
    },
    enabled: !!pid,
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['project-tasks-summary', pid],
    queryFn: async (): Promise<TaskSummary> => {
      if (!pid) return { total: 0, completed: 0, overdue: 0, byStatus: {}, byPriority: {}, healthScore: 100, completionRate: 0 };
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks/summary`, {
        headers: getAuthHeaders(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || 'Failed to fetch summary');
      return payload?.data ?? { total: 0, completed: 0, overdue: 0, byStatus: {}, byPriority: {}, healthScore: 100, completionRate: 0 };
    },
    enabled: !!pid,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-tasks', pid] });
    queryClient.invalidateQueries({ queryKey: ['project-tasks-summary', pid] });
  };

  const createTask = useMutation({
    mutationFn: async (data: Partial<ProjectTask>) => {
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || 'Failed to create task');
      return payload?.data;
    },
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: number; updates: Partial<ProjectTask> }) => {
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(updates),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || 'Failed to update task');
      return payload?.data;
    },
    onSuccess: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: number) => {
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete task');
    },
    onSuccess: invalidate,
  });

  const generateMilestones = useMutation({
    mutationFn: async ({ submissionType, targetDate }: { submissionType: string; targetDate?: string }) => {
      const res = await fetch(`/api/concept2cure/projects/${pid}/tasks/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ submissionType, targetDate }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message || 'Failed to generate milestones');
      return payload?.data;
    },
    onSuccess: invalidate,
  });

  return {
    tasks: tasksQuery.data || [],
    isLoadingTasks: tasksQuery.isLoading,
    summary: summaryQuery.data || null,
    isLoadingSummary: summaryQuery.isLoading,
    createTask: createTask.mutateAsync,
    updateTask: updateTask.mutateAsync,
    deleteTask: deleteTask.mutateAsync,
    generateMilestones: generateMilestones.mutateAsync,
    isCreating: createTask.isPending,
    isGenerating: generateMilestones.isPending,
    refetch: invalidate,
  };
}

export function useSubmissionMilestones(submissionType?: string) {
  return useQuery({
    queryKey: ['submission-milestones', submissionType],
    queryFn: async (): Promise<SubmissionMilestone[]> => {
      if (!submissionType) return [];
      const res = await fetch(`/api/concept2cure/submission-milestones/${submissionType}`);
      const payload = await res.json().catch(() => ({}));
      return payload?.data ?? [];
    },
    enabled: !!submissionType,
  });
}
