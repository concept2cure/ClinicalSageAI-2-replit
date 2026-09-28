/**
 * The derived figures GET /api/regulatory/dashboard/unified adds to
 * unifiedTaskService.getUnifiedDashboardMetrics: a readiness score, the
 * critical alerts, and the next milestones. Deterministic functions of the
 * metrics object alone — no reads, no model.
 *
 * Moved verbatim out of unifiedTasks.routes.ts (repo line gate); the route is
 * their only caller.
 *
 * @module server/services/tasking/unified-dashboard-readiness
 */

export function calculateReadinessScore(metrics: any): number {
  let score = 0;
  const weights = {
    progress: 0.4,
    overdue: 0.2,
    approvals: 0.2,
    priority: 0.2,
  };

  // Progress component - ensure type safety
  const progressValues = Object.values(metrics.moduleProgress || {}) as number[];
  const avgProgress = progressValues.length > 0
    ? progressValues.reduce((sum, p) => sum + (typeof p === 'number' ? p : 0), 0) / progressValues.length
    : 0;
  score += (avgProgress / 100) * weights.progress * 100;

  // Overdue penalty
  const overduePenalty = Math.min(metrics.overdueTasks * 5, 20);
  score -= overduePenalty * weights.overdue;

  // Approval readiness
  const approvalReadiness = metrics.approvalRequired === 0 ? 100 : Math.max(0, 100 - metrics.approvalRequired * 10);
  score += approvalReadiness * weights.approvals;

  // Priority task completion
  const priorityCompletion = metrics.highPriorityTasks === 0 ? 100 : Math.max(0, 100 - metrics.highPriorityTasks * 5);
  score += priorityCompletion * weights.priority;

  return Math.max(0, Math.min(100, score));
}

export function getCriticalAlerts(metrics: any): string[] {
  const alerts: string[] = [];

  if (metrics.overdueTasks > 0) {
    alerts.push(`${metrics.overdueTasks} tasks are overdue and require immediate attention`);
  }

  if (metrics.highPriorityTasks > 5) {
    alerts.push(`${metrics.highPriorityTasks} high-priority tasks pending completion`);
  }

  if (metrics.approvalRequired > 3) {
    alerts.push(`${metrics.approvalRequired} tasks awaiting approval`);
  }

  for (const [module, progress] of Object.entries(metrics.moduleProgress)) {
    if ((progress as number) < 25) {
      alerts.push(`${module} module is at ${Math.round(progress as number)}% - significant work needed`);
    }
  }

  return alerts;
}

export function getNextMilestones(metrics: any): any[] {
  const milestones: any[] = [];

  for (const [module, progress] of Object.entries(metrics.moduleProgress)) {
    const moduleConfig = metrics.moduleConfig[module];
    if (!moduleConfig) continue;

    if ((progress as number) < 100) {
      milestones.push({
        module,
        name: `Complete ${moduleConfig.name}`,
        progress: Math.round(progress as number),
        color: moduleConfig.color,
        icon: moduleConfig.icon,
        remainingTasks: Math.round((100 - (progress as number)) / 10),
      });
    }
  }

  return milestones.sort((a, b) => b.progress - a.progress);
}
