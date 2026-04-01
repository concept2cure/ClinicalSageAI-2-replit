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
    collaborators: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'collaborators'] as const,
    teamMembers: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'team-members'] as const,
    artifacts: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'artifacts'] as const,
    artifactsSummary: () =>
      ['concept2cure', 'projects', 'all', 'artifacts-summary'] as const,
    /** Vault tab: project-scoped files and artifacts */
    vaultArtifacts: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'vault-artifacts'] as const,
    /** Overview tab: project artifact pipeline stats */
    overviewArtifacts: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'overview-artifacts'] as const,
    /** Connected apps for a project */
    apps: (projectId: number | string) =>
      ['concept2cure', 'projects', projectId, 'apps'] as const,
  },

  // ── Artifacts ──────────────────────────────────────────────────────────────
  artifacts: {
    all: ['concept2cure', 'artifacts'] as const,
    detail: (id: number | string) => ['concept2cure', 'artifacts', id] as const,
    /** Global artifacts browser */
    global: ['concept2cure', 'artifacts', 'global'] as const,
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

  // ── Comments ──────────────────────────────────────────────────────────────
  comments: {
    document: (documentId: number | string) =>
      ['concept2cure', 'comments', 'document', documentId] as const,
    addressWithAI: (commentId: string) =>
      ['concept2cure', 'comments', 'address-ai', commentId] as const,
  },

  // ── Claim Validation (zero-hallucination) ────────────────────────────────
  claimValidation: {
    validate: (projectId: string, artifactId?: string) =>
      ['concept2cure', 'claim-validation', projectId, artifactId] as const,
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
    status: (projectId: number | string) =>
      ['concept2cure', 'ind', 'status', projectId] as const,
  },

  // ── Device Submissions ────────────────────────────────────────────────────
  device: {
    status: (deviceType: string, projectId: number | string) =>
      ['concept2cure', 'device', 'status', deviceType, projectId] as const,
  },

  // ── Submission Readiness ──────────────────────────────────────────────────
  submission: {
    projectArtifacts: (projectId: number | string) =>
      ['concept2cure', 'project-artifacts', projectId] as const,
  },

  // ── Precedents ─────────────────────────────────────────────────────────────
  precedents: {
    all: ['concept2cure', 'precedents'] as const,
  },

  // ── Templates ──────────────────────────────────────────────────────────────
  templates: {
    all: ['concept2cure', 'templates'] as const,
    list: (params?: {
      submissionType?: string;
      packageId?: string;
      projectGoal?: string;
    }) => ['concept2cure', 'templates', params] as const,
    detail: (templateId: string) => ['concept2cure', 'templates', templateId] as const,
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

  // ── Control Plane ─────────────────────────────────────────────────────────
  controlPlane: {
    apiKeys: () => ['concept2cure', 'control-plane', 'api-keys'] as const,
    usage: () => ['concept2cure', 'control-plane', 'usage'] as const,
    health: () => ['concept2cure', 'control-plane', 'health'] as const,
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: {
    profile: () => ['concept2cure', 'settings', 'profile'] as const,
    notifications: () => ['concept2cure', 'settings', 'notifications'] as const,
  },

  // ── Decision Lineage ─────────────────────────────────────────────────────
  decisionLineage: {
    graph: (entityType: string, entityId: number, organizationId?: number) =>
      ['concept2cure', 'decision-lineage', entityType, entityId, organizationId] as const,
    chainVerification: () => ['concept2cure', 'decision-lineage', 'chain'] as const,
  },

  // ── Proof ────────────────────────────────────────────────────────────────
  proof: {
    certificate: (workflowRunId: string) =>
      ['concept2cure', 'proof', 'certificate', workflowRunId] as const,
  },

  // ── Biologics ────────────────────────────────────────────────────────────
  biologics: {
    pathway: (params: Record<string, string>) =>
      ['concept2cure', 'biologics', 'pathway', params] as const,
    expedited: (agency: string, params: Record<string, string>) =>
      ['concept2cure', 'biologics', 'expedited', agency, params] as const,
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  reports: {
    catalog: () => ['concept2cure', 'reports', 'catalog'] as const,
    list: () => ['concept2cure', 'reports', 'list'] as const,
  },

  // ── CMC ───────────────────────────────────────────────────────────────────
  cmc: {
    data: (projectId: number | string) =>
      ['concept2cure', 'cmc', projectId] as const,
  },

  // ── Branding ─────────────────────────────────────────────────────────────
  branding: {
    settings: () => ['concept2cure', 'branding', 'settings'] as const,
    templates: () => ['concept2cure', 'branding', 'templates'] as const,
  },

  // ── IVDR ──────────────────────────────────────────────────────────────────
  ivdr: {
    packReadiness: (projectId: number | string, packType: string) =>
      ['concept2cure', 'ivdr', 'pack-readiness', projectId, packType] as const,
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

  // ── AnA Intelligence (CLAUDE.md Memory Compression Model) ─────────────
  anaIntelligence: {
    /** Company context (Global.md) */
    companyContext: ['concept2cure', 'ana-intelligence', 'company-context'] as const,
    /** Project context (Local.md) */
    projectContext: (projectId: number | string) =>
      ['concept2cure', 'ana-intelligence', 'project-context', projectId] as const,
    /** User preferences (User.md) */
    userContext: ['concept2cure', 'ana-intelligence', 'user-context'] as const,
    /** AnA capabilities for a project */
    capabilities: (projectId?: number | string) =>
      ['concept2cure', 'ana-intelligence', 'capabilities', projectId] as const,
    /** Project memory entries (database-backed) */
    projectMemory: (projectId: number | string) =>
      ['concept2cure', 'ana-intelligence', 'project-memory', projectId] as const,
    /** Client memory entries */
    clientMemory: ['concept2cure', 'ana-intelligence', 'client-memory'] as const,
    /** AnA wisdom / outcome stats */
    wisdom: (projectId?: number | string) =>
      ['concept2cure', 'ana-intelligence', 'wisdom', projectId] as const,
    /** Objectives */
    objectives: (projectId?: number | string) =>
      ['concept2cure', 'ana-intelligence', 'objectives', projectId] as const,
    /** Uploaded documents for intelligence */
    documents: (scope: 'company' | 'project', scopeId?: number | string) =>
      ['concept2cure', 'ana-intelligence', 'documents', scope, scopeId] as const,
  },
} as const;
