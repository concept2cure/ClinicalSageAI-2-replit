/**
 * Hook for real operational data — replaces mock generators in RoleDashboard.
 * Fetches tasks, blockers, and approval status from the backend.
 */
import { useQuery } from '@tanstack/react-query';

export interface OperationalTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'review' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  moduleType?: string;
  dueDate?: string;
  assigneeName?: string;
  projectId?: number;
  isOverdue?: boolean;
}

export interface OperationalMetric {
  label: string;
  value: number;
  change?: number;
  changeLabel?: string;
  type: 'count' | 'percentage' | 'score';
}

export interface OperationalSummary {
  tasks: OperationalTask[];
  metrics: OperationalMetric[];
  blockers: OperationalTask[];
  pendingApprovals: number;
  overdueCount: number;
}

export function useOperationalData(organizationId?: number) {
  return useQuery<OperationalSummary>({
    queryKey: ['operational-data', organizationId],
    queryFn: async () => {
      // Try to fetch real unified tasks
      let tasks: OperationalTask[] = [];
      let metrics: OperationalMetric[] = [];

      try {
        const tasksRes = await fetch('/api/task-management/tasks?limit=50', {
          credentials: 'include',
        });
        if (tasksRes.ok) {
          const json = await tasksRes.json();
          const rawTasks = json.data || json.tasks || json || [];
          tasks = rawTasks.map((t: any) => ({
            id: t.taskId || t.id || `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            title: t.title || t.name || 'Untitled Task',
            description: t.description,
            status: t.status || 'pending',
            priority: t.priority || 'medium',
            moduleType: t.moduleType,
            dueDate: t.dueDate,
            assigneeName: t.assigneeName,
            projectId: t.projectId,
            isOverdue: t.dueDate ? new Date(t.dueDate) < new Date() && t.status !== 'completed' : false,
          }));
        }
      } catch {
        // Task endpoint unavailable — continue with empty task list
      }

      // Try to fetch artifact counts for metrics
      let artifactCount = 0;
      let draftCount = 0;
      let reviewCount = 0;
      let approvedCount = 0;

      try {
        const artifactsRes = await fetch('/api/concept2cure/projects/all/artifacts-summary', {
          credentials: 'include',
        });
        if (artifactsRes.ok) {
          const json = await artifactsRes.json();
          const summary = json.data || json;
          artifactCount = summary.total || 0;
          draftCount = summary.draft || 0;
          reviewCount = summary.review || 0;
          approvedCount = summary.approved || 0;
        }
      } catch {
        // Best effort
      }

      const blockers = tasks.filter(t => t.status === 'blocked');
      const overdueCount = tasks.filter(t => t.isOverdue).length;
      const pendingApprovals = reviewCount;

      // Compute metrics from real data
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      metrics = [
        { label: 'Active Tasks', value: totalTasks - completedTasks, type: 'count' as const },
        { label: 'Completion Rate', value: completionRate, type: 'percentage' as const },
        { label: 'Blocked Items', value: blockers.length, type: 'count' as const },
        { label: 'Pending Approvals', value: pendingApprovals, type: 'count' as const },
        { label: 'Documents in Draft', value: draftCount, type: 'count' as const },
        { label: 'Overdue Items', value: overdueCount, type: 'count' as const },
      ];

      return { tasks, metrics, blockers, pendingApprovals, overdueCount };
    },
    staleTime: 60_000,
    retry: 1,
  });
}
