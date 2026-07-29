/**
 * @fileoverview Tasking Service
 * @module concept2cure/services/taskingService
 * @version 1.0.0
 *
 * @description
 * Live service for the cross-program tasking workstream — a global view of
 * every task across every module (CMC, IND, MedicalDevice, eCTD, Vault,
 * ProtocolDesign), grouped into a Kanban board by status. Complements the
 * project-scoped useProjectTasks hook (which drives the MDX project workbench):
 * this surface is org-scoped, not project-scoped.
 *
 * Binds to server/routes/unifiedTasks.routes.ts, mounted at /api/regulatory/tasks
 * (server/bootstrap/register-core-routes.ts):
 *   GET    /api/regulatory/tasks/all          list every task (org/project/status/module/assignee filters)
 *   GET    /api/regulatory/tasks/:id          single task detail
 *   POST   /api/regulatory/tasks/unified      create a task
 *   PATCH  /api/regulatory/tasks/:id/status   update task status
 *   POST   /api/regulatory/tasks/:id/link     link / depend two tasks
 *
 * Scoping: the /all route does not enforce tenant context server-side — it
 * filters by the organizationId query param. So this service resolves the
 * current org id client-side (localStorage 'organizationId' /
 * 'currentOrganizationId', default '1') the same way useSubmissionSections does,
 * and always sends it. An optional projectId narrows the board to one program.
 *
 * The route wraps results in { success, tasks, ... } / { success, task, ... }.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — mirror the unified_tasks columns returned raw by the routes. Columns
// can vary, so consumers pick defensively; these capture the recognised shape.
// ═══════════════════════════════════════════════════════════════════════════════

export type TaskStatus =
  | 'pending'
  | 'in-progress'
  | 'review'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type TaskModuleType =
  | 'CMC'
  | 'IND'
  | 'MedicalDevice'
  | 'eCTD'
  | 'Vault'
  | 'ProtocolDesign';

export type TaskLinkType = 'dependency' | 'reference' | 'parent-child' | 'related';

export type TaskDependencyType =
  | 'finish-to-start'
  | 'start-to-start'
  | 'finish-to-finish'
  | 'start-to-finish';

export interface Task {
  id: number;
  taskId: string;
  organizationId: number;
  projectId: number | null;
  moduleType: string;
  moduleIcon: string | null;
  title: string;
  description: string | null;
  category: string | null;
  taskType: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  status: TaskStatus | string;
  priority: TaskPriority | string;
  progress: number | null;
  completionPercentage: number | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface TaskFilter {
  /** Canonical project id (numeric) to narrow the board to one program. */
  projectId?: number;
  status?: TaskStatus;
  moduleType?: TaskModuleType;
  assigneeId?: number;
  limit?: number;
  offset?: number;
}

export interface TaskCreate {
  moduleType: TaskModuleType;
  title: string;
  description?: string;
  category?: string;
  taskType?: string;
  assigneeId?: number;
  assigneeName?: string;
  priority?: TaskPriority;
  dueDate?: string;
  estimatedHours?: number;
  projectId?: number;
}

export interface TaskLink {
  targetTaskId: string;
  linkType: TaskLinkType;
  dependencyType?: TaskDependencyType;
  isBlocking?: boolean;
  impactDescription?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class TaskingService {
  private baseUrl = '/api/regulatory/tasks';

  /** Resolve the current org id client-side, mirroring useSubmissionSections. */
  private orgId(): string {
    try {
      return (
        localStorage.getItem('organizationId') ||
        localStorage.getItem('currentOrganizationId') ||
        '1'
      );
    } catch {
      return '1';
    }
  }

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false || payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Tasking request failed');
    }
    return payload as T;
  }

  /** List every task across modules. Org-scoped; optional project / status /
   *  module / assignee filters. */
  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    const params = new URLSearchParams();
    params.set('organizationId', this.orgId());
    if (filter.projectId != null) params.set('projectId', String(filter.projectId));
    if (filter.status) params.set('status', filter.status);
    if (filter.moduleType) params.set('moduleType', filter.moduleType);
    if (filter.assigneeId != null) params.set('assigneeId', String(filter.assigneeId));
    params.set('limit', String(filter.limit ?? 200));
    if (filter.offset != null) params.set('offset', String(filter.offset));
    const payload = await this.request<{ tasks?: Task[] }>(
      'GET',
      `${this.baseUrl}/all?${params.toString()}`,
    );
    return Array.isArray(payload?.tasks) ? payload.tasks : [];
  }

  /** Single task detail. The route accepts the taskId string or numeric id. */
  async getTask(id: string): Promise<Task | null> {
    const payload = await this.request<{ task?: Task }>('GET', `${this.baseUrl}/${id}`);
    return payload?.task ?? null;
  }

  /** Create a task. organizationId is required by the route schema. */
  async createTask(data: TaskCreate): Promise<Task> {
    const orgId = Number(this.orgId());
    const payload = await this.request<{ task: Task }>('POST', `${this.baseUrl}/unified`, {
      ...data,
      organizationId: Number.isFinite(orgId) ? orgId : 1,
    });
    return payload.task;
  }

  /** Move a task to a new status. */
  async updateStatus(id: string, status: TaskStatus, userId?: number): Promise<Task> {
    const payload = await this.request<{ task: Task }>('PATCH', `${this.baseUrl}/${id}/status`, {
      status,
      userId,
    });
    return payload.task;
  }

  /** Link two tasks (dependency / reference / parent-child / related). */
  async linkTask(sourceTaskId: string, link: TaskLink): Promise<unknown> {
    const payload = await this.request<{ link: unknown }>(
      'POST',
      `${this.baseUrl}/${sourceTaskId}/link`,
      link,
    );
    return payload.link;
  }
}

const taskingService = new TaskingService();
export default taskingService;
