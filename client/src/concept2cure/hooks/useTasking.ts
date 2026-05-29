/**
 * @fileoverview Tasking React Hooks
 * @module concept2cure/hooks/useTasking
 * @version 1.0.0
 *
 * @description
 * React-query hooks for the cross-program tasking workstream. Mirrors useRisk /
 * useLabeling: structured query keys, query hooks for reads, mutation hooks that
 * invalidate the right keys. Binds to taskingService, which calls the live
 * /api/regulatory/tasks/* routes. No mocks.
 *
 * Scoping: tasks are org-scoped (cross-program), not project-scoped — the
 * service resolves the org id client-side. An optional numeric projectId filter
 * narrows the board to one program; the shell maps the canonical project id
 * (useProjects) to that numeric id where the API uses one.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import taskingService, {
  type Task,
  type TaskFilter,
  type TaskCreate,
  type TaskStatus,
  type TaskLink,
} from '../services/taskingService';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const taskingQueryKeys = {
  all: ['tasking'] as const,
  tasks: () => [...taskingQueryKeys.all, 'tasks'] as const,
  taskList: (filter: TaskFilter) => [...taskingQueryKeys.tasks(), 'list', filter] as const,
  task: (id: string) => [...taskingQueryKeys.tasks(), id] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** List every task across modules, org-scoped. Optional project / status /
 *  module / assignee filters drive the Kanban columns. */
export function useTasks(filter: TaskFilter = {}) {
  return useQuery<Task[]>({
    queryKey: taskingQueryKeys.taskList(filter),
    queryFn: () => taskingService.listTasks(filter),
    staleTime: 60 * 1000,
  });
}

/** Single task detail. */
export function useTask(id: string | null) {
  return useQuery<Task | null>({
    queryKey: taskingQueryKeys.task(id ?? ''),
    queryFn: () => (id ? taskingService.getTask(id) : null),
    enabled: id != null && id.length > 0,
    staleTime: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, TaskCreate>({
    mutationFn: (data) => taskingService.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskingQueryKeys.tasks() });
    },
  });
}

/** Update a task's status (the board's column-to-column move). */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation<Task, Error, { id: string; status: TaskStatus; userId?: number }>({
    mutationFn: ({ id, status, userId }) => taskingService.updateStatus(id, status, userId),
    onSuccess: (_task, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskingQueryKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: taskingQueryKeys.task(id) });
    },
  });
}

/** Link / depend two tasks. */
export function useLinkTask() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { sourceTaskId: string; link: TaskLink }>({
    mutationFn: ({ sourceTaskId, link }) => taskingService.linkTask(sourceTaskId, link),
    onSuccess: (_data, { sourceTaskId }) => {
      queryClient.invalidateQueries({ queryKey: taskingQueryKeys.tasks() });
      queryClient.invalidateQueries({ queryKey: taskingQueryKeys.task(sourceTaskId) });
    },
  });
}
