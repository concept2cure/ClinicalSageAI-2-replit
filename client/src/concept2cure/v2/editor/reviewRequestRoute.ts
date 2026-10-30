/**
 * What Send for review (SendForReviewDialog.tsx) reads and receives of the
 * review route its request writes (RR5 of docs/design/REVIEW_ROUTING_2026-10-23.md):
 *
 *   - useRouteRefusals: the route's one member validator, asked of every member
 *     before anything is sent (GET /api/authoring/documents/:id/route-candidates),
 *     and the time zone each due date is the end of a day in;
 *   - routeTasksOf / routeTaskOutcomes: the tasks the server wrote on the route,
 *     with the request, from its answer (`route.tasks`).
 *
 * Moved out of the dialog to keep it under the file-length limit; nothing here
 * writes.
 */
import { useLiveData } from '../dataConnect';
import { isRouteCandidates, type RouteCandidatesShape } from '../reviewRoute/routeCandidates';
import type { AssignOutcome, Assignee } from './AssignReviewDialog';

/** One reviewer's task on the route, as the server wrote it (RR5: `route.tasks`). */
export interface RouteTaskReceipt { userId: string; taskId: string; dueDate: string | null }

/** What became of one reviewer's task (the dialog's ReviewTaskOutcome). */
interface TaskOutcome { reviewerId: string; reviewer: string; outcome: AssignOutcome }

/** The route tasks the server's answer names (RR5), or none when it names none. */
export function routeTasksOf(json: unknown): RouteTaskReceipt[] {
  const tasks = (json as { route?: { tasks?: unknown } } | null)?.route?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.flatMap((t: { userId?: unknown; taskId?: unknown; dueDate?: unknown }) =>
    typeof t?.taskId === 'string' && t.taskId && Number.isSafeInteger(Number(t.userId))
      ? [{ userId: String(t.userId), taskId: t.taskId, dueDate: typeof t.dueDate === 'string' ? t.dueDate : null }]
      : []);
}

/**
 * What became of each asked reviewer's task: the task the server wrote on the
 * route, on the request's own transaction (RR5). A reviewer the answer names no
 * task for is reported as unconfirmed, never as having one.
 */
export function routeTaskOutcomes(asked: Assignee[], routeTasks: RouteTaskReceipt[]): TaskOutcome[] {
  return asked.map((a) => {
    const task = routeTasks.find((t) => t.userId === a.id);
    const outcome: AssignOutcome = task
      ? { ok: true, taskId: task.taskId, assigneeName: a.label ?? a.name }
      : { ok: false, unconfirmed: true, message: 'The answer did not name this reviewer’s task on the review route. Check the document’s tasks.' };
    return { reviewerId: a.id, reviewer: a.label ?? a.name, outcome };
  });
}

/**
 * The route's one member validator, asked of every member before anything is
 * sent (GET …/route-candidates): the reason each member would be refused as a
 * reviewer, and the time zone the due date is the end of a day in. An unread
 * answer refuses no one here (the server still decides) and says so.
 */
export function useRouteRefusals(docId: string) {
  const read = useLiveData<RouteCandidatesShape>(`/api/authoring/documents/${encodeURIComponent(docId)}/route-candidates`, [docId], isRouteCandidates);
  const data = read.loading ? null : read.data;
  const refusals: Record<string, string> = {};
  for (const c of data?.candidates ?? []) if (c.reviewer) refusals[String(c.id)] = c.reviewer.message;
  return { loading: read.loading, unread: !read.loading && data === null, refusals, timeZone: data?.timeZone ?? null };
}

