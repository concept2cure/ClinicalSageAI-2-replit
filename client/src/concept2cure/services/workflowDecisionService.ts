/** Optional workflow-decision adapter; not imported by read-only program tabs. */
import programTabsService, { type WorkflowDecisionResult } from './programTabsService';

/** Preserve the existing authenticated transport and rejection payload. */
export function rejectWorkflow(approvalId: number | string, comments: string): Promise<WorkflowDecisionResult> {
  return programTabsService.request<WorkflowDecisionResult>(
    'POST',
    `/api/approval-workflows/${encodeURIComponent(String(approvalId))}/reject`,
    { comments },
  );
}
