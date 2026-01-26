/**
 * Enterprise API Client
 *
 * Unified, type-safe API client with automatic tenant scoping,
 * error handling, retry logic, and request/response interceptors.
 *
 * @version 2.0.0
 * @module client/src/lib/api
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    field?: string;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    duration: number;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

export interface TenantContext {
  organizationId: string;
  workspaceId?: string;
  userId?: string;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  static fromResponse(response: ApiResponse, status: number): ApiError {
    return new ApiError(
      response.error?.message || 'Unknown error',
      response.error?.code || 'UNKNOWN_ERROR',
      status,
      response.error?.details,
      response.meta?.requestId
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// API CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ApiClient {
  private baseUrl: string;
  private tenant: TenantContext | null = null;
  private authToken: string | null = null;
  private requestInterceptors: Array<(config: ApiRequestConfig) => ApiRequestConfig> = [];
  private responseInterceptors: Array<(response: ApiResponse) => ApiResponse> = [];

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  setTenant(context: TenantContext): void {
    this.tenant = context;
  }

  clearTenant(): void {
    this.tenant = null;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = null;
  }

  addRequestInterceptor(interceptor: (config: ApiRequestConfig) => ApiRequestConfig): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: (response: ApiResponse) => ApiResponse): void {
    this.responseInterceptors.push(interceptor);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE REQUEST METHOD
  // ─────────────────────────────────────────────────────────────────────────────

  async request<T>(endpoint: string, config: ApiRequestConfig = {}): Promise<T> {
    // Apply request interceptors
    let finalConfig = { ...config };
    for (const interceptor of this.requestInterceptors) {
      finalConfig = interceptor(finalConfig);
    }

    const {
      method = 'GET',
      body,
      params,
      headers = {},
      timeout = 30000,
      retry = 2,
      retryDelay = 1000,
      signal,
      skipAuth = false,
    } = finalConfig;

    // Build URL with query params
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    // Build headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': this.generateRequestId(),
      ...headers,
    };

    // Add tenant headers
    if (this.tenant) {
      requestHeaders['X-Organization-ID'] = this.tenant.organizationId;
      if (this.tenant.workspaceId) {
        requestHeaders['X-Workspace-ID'] = this.tenant.workspaceId;
      }
      if (this.tenant.userId) {
        requestHeaders['X-User-ID'] = this.tenant.userId;
      }
    }

    // Add auth token
    if (this.authToken && !skipAuth) {
      requestHeaders['Authorization'] = `Bearer ${this.authToken}`;
    }

    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    // Combine signals if provided
    const combinedSignal = signal
      ? this.combineAbortSignals(signal, abortController.signal)
      : abortController.signal;

    // Execute with retry logic
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
          credentials: 'include',
        });

        clearTimeout(timeoutId);

        // Parse response
        const contentType = response.headers.get('Content-Type');
        let data: ApiResponse<T>;

        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = { success: response.ok, data: text as unknown as T };
        }

        // Apply response interceptors
        for (const interceptor of this.responseInterceptors) {
          data = interceptor(data) as ApiResponse<T>;
        }

        // Handle error responses
        if (!response.ok || !data.success) {
          throw ApiError.fromResponse(data, response.status);
        }

        return data.data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or abort
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          throw error;
        }
        if (lastError.name === 'AbortError') {
          throw new ApiError('Request timeout', 'TIMEOUT', 408);
        }

        // Wait before retry
        if (attempt < retry) {
          await this.delay(retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError || new ApiError('Request failed', 'UNKNOWN', 500);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONVENIENCE METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private combineAbortSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal1.addEventListener('abort', abort);
    signal2.addEventListener('abort', abort);
    return controller.signal;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const api = new ApiClient();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPED API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Program types
export interface Program {
  id: string;
  name: string;
  code: string;
  description?: string;
  programType: 'CER' | '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'DE_NOVO';
  productType: string;
  deviceClass?: string;
  primaryAgency: string;
  targetAgencies?: string[];
  productName: string;
  productCode?: string;
  indication?: string;
  intendedUse?: string;
  status: 'draft' | 'active' | 'in_review' | 'submitted' | 'approved' | 'rejected' | 'archived';
  phase: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  progressPercent: number;
  completedMilestones: number;
  totalMilestones: number;
  targetSubmissionDate?: string;
  actualSubmissionDate?: string;
  approvalDate?: string;
  teamMembers?: TeamMember[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface ProgramStats {
  totalPrograms: number;
  activePrograms: number;
  submittedPrograms: number;
  approvedPrograms: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  upcomingDeadlines: Array<{
    programId: string;
    programName: string;
    deadline: string;
    daysRemaining: number;
  }>;
  recentActivity: number;
  evidenceCount: number;
  pendingReviews: number;
}

export interface Milestone {
  id: string;
  programId: string;
  name: string;
  description?: string;
  category: string;
  targetDate?: string;
  actualDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'at_risk' | 'cancelled';
  progress: number;
  dependsOn?: string[];
  assigneeId?: number;
  assigneeName?: string;
}

// Evidence types
export interface Evidence {
  id: string;
  title: string;
  code: string;
  description?: string;
  evidenceType: string;
  evidenceCategory: string;
  evidenceLevel?: string;
  sourceType: string;
  sourceReference?: string;
  sourceCitation?: string;
  programId?: string;
  documentId?: number;
  qualityScore?: number;
  relevanceScore?: number;
  isVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  authors?: string[];
  journal?: string;
  doi?: string;
  pmid?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceLink {
  id: string;
  evidenceId: string;
  targetType: 'claim' | 'section' | 'requirement' | 'standard' | 'question';
  targetId: string;
  targetPath?: string;
  linkType: 'supports' | 'contradicts' | 'references' | 'supersedes';
  strength: 'strong' | 'moderate' | 'weak';
  rationale?: string;
  isVerified: boolean;
  createdAt: string;
}

export interface EvidenceStats {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byLevel: Record<string, number>;
  averageQualityScore: number;
  averageRelevanceScore: number;
  linkedEvidence: number;
  unlinkedEvidence: number;
}

// Paginated response
export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const programsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    programType?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => api.get<Program[]>('/programs', params),

  get: (id: string) => api.get<Program>(`/programs/${id}`),

  create: (data: Partial<Program>) => api.post<Program>('/programs', data),

  update: (id: string, data: Partial<Program>) => api.patch<Program>(`/programs/${id}`, data),

  delete: (id: string) => api.delete<void>(`/programs/${id}`),

  stats: () => api.get<ProgramStats>('/programs/stats/overview'),

  milestones: {
    list: (programId: string) => api.get<Milestone[]>(`/programs/${programId}/milestones`),
    create: (programId: string, data: Partial<Milestone>) =>
      api.post<Milestone>(`/programs/${programId}/milestones`, data),
    update: (programId: string, milestoneId: string, data: Partial<Milestone>) =>
      api.patch<Milestone>(`/programs/${programId}/milestones/${milestoneId}`, data),
  },

  activity: (programId: string, limit?: number) =>
    api.get<Array<{ id: string; activityType: string; title: string; timestamp: string }>>(
      `/programs/${programId}/activity`,
      { limit }
    ),
};

export const evidenceApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    programId?: string;
    evidenceType?: string;
    evidenceCategory?: string;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => api.get<Evidence[]>('/evidence', params),

  get: (id: string) => api.get<Evidence>(`/evidence/${id}`),

  create: (data: Partial<Evidence>) => api.post<Evidence>('/evidence', data),

  update: (id: string, data: Partial<Evidence>) => api.patch<Evidence>(`/evidence/${id}`, data),

  delete: (id: string) => api.delete<void>(`/evidence/${id}`),

  verify: (id: string, approved: boolean, comments?: string) =>
    api.post<Evidence>(`/evidence/${id}/verify`, { approved, comments }),

  stats: (programId?: string) => api.get<EvidenceStats>('/evidence/stats', { programId }),

  search: (params: {
    q?: string;
    type?: string;
    category?: string;
    level?: string;
    status?: string;
    programId?: string;
    verified?: boolean;
  }) =>
    api.get<{
      items: Evidence[];
      facets: Record<string, Array<{ value: string; count: number }>>;
      total: number;
    }>('/evidence/search', params),

  links: {
    list: (evidenceId: string) => api.get<EvidenceLink[]>(`/evidence/${evidenceId}/links`),
    create: (data: Omit<EvidenceLink, 'id' | 'isVerified' | 'createdAt'>) =>
      api.post<EvidenceLink>('/evidence/links', data),
    delete: (linkId: string) => api.delete<void>(`/evidence/links/${linkId}`),
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// REACT QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export const queryKeys = {
  programs: {
    all: ['programs'] as const,
    list: (params?: Record<string, unknown>) => ['programs', 'list', params] as const,
    detail: (id: string) => ['programs', 'detail', id] as const,
    stats: () => ['programs', 'stats'] as const,
    milestones: (programId: string) => ['programs', programId, 'milestones'] as const,
    activity: (programId: string) => ['programs', programId, 'activity'] as const,
  },
  evidence: {
    all: ['evidence'] as const,
    list: (params?: Record<string, unknown>) => ['evidence', 'list', params] as const,
    detail: (id: string) => ['evidence', 'detail', id] as const,
    stats: (programId?: string) => ['evidence', 'stats', programId] as const,
    links: (evidenceId: string) => ['evidence', evidenceId, 'links'] as const,
    search: (params: Record<string, unknown>) => ['evidence', 'search', params] as const,
  },
};

export default api;
