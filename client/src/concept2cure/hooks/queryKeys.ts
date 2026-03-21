/**
 * Centralized query key factory for TanStack Query.
 *
 * Every queryKey in the app should reference this file.
 * Consistent keys ensure correct cache invalidation and deduplication.
 *
 * Pattern: `['concept2cure', domain, ...params]`
 */

export const queryKeys = {
  // ── Projects ───────────────────────────────────────────────────────────────
  projects: {
    all: ['concept2cure', 'projects'] as const,
    detail: (id: number | string) => ['concept2cure', 'projects', id] as const,
    artifacts: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'artifacts'] as const,
    artifactsSummary: () =>
      ['concept2cure', 'projects', 'all', 'artifacts-summary'] as const,
  },

  // ── Artifacts ──────────────────────────────────────────────────────────────
  artifacts: {
    all: ['concept2cure', 'artifacts'] as const,
    detail: (id: number | string) => ['concept2cure', 'artifacts', id] as const,
  },

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  auditLogs: {
    all: ['concept2cure', 'audit-logs'] as const,
    list: (params?: { limit?: number }) =>
      ['concept2cure', 'audit-logs', params] as const,
  },

  // ── Reviews ────────────────────────────────────────────────────────────────
  reviews: {
    pending: () => ['concept2cure', 'reviews', 'pending'] as const,
  },

  // ── Chat ───────────────────────────────────────────────────────────────────
  chat: {
    thread: (threadId: string) => ['concept2cure', 'chat', 'thread', threadId] as const,
  },

  // ── IND Workspace ──────────────────────────────────────────────────────────
  ind: {
    sections: (projectId: number | string) =>
      ['concept2cure', 'ind-sections', projectId] as const,
    projectSections: (projectId: number | string) =>
      ['concept2cure', 'project-sections', projectId] as const,
  },

  // ── Precedents ─────────────────────────────────────────────────────────────
  precedents: {
    all: ['concept2cure', 'precedents'] as const,
  },

  // ── Team / Mission Control ─────────────────────────────────────────────────
  team: {
    workload: () => ['concept2cure', 'team', 'workload'] as const,
  },

  // ── Legal ──────────────────────────────────────────────────────────────────
  legal: {
    patents: () => ['concept2cure', 'patents'] as const,
    compliance: () => ['concept2cure', 'compliance'] as const,
  },

  // ── Intelligence Layer ────────────────────────────────────────────────────
  intelligence: {
    dashboard: (projectId: number | string) =>
      ['intelligence', 'dashboard', projectId] as const,
    recommendations: (projectId: number | string) =>
      ['intelligence', 'recommendations', projectId] as const,
    readiness: (projectId: number | string) =>
      ['intelligence', 'readiness', projectId] as const,
    profile: (projectId: number | string) =>
      ['intelligence', 'profile', projectId] as const,
    nextActions: (projectId: number | string) =>
      ['intelligence', 'next-actions', projectId] as const,
    crossModule: (projectId: number | string) =>
      ['intelligence', 'cross-module', projectId] as const,
    feedbackSummary: (projectId: number | string) =>
      ['intelligence', 'feedback-summary', projectId] as const,
  },
} as const;
