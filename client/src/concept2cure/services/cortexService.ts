/**
 * Concept2Cure Cortex Service
 *
 * Unified connectivity layer for Lumen Cortex and Project Cortex backends.
 * Provides typed access to:
 * - AI chat/reasoning (Lumen Cortex)
 * - Semantic search (Knowledge Graph)
 * - Regulatory intelligence (Project Cortex Data Farmers)
 * - Document analysis and extraction
 * - Submission predictions and risk assessment
 *
 * @module concept2cure/services/cortexService
 * @version 3.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CortexMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokenUsage?: TokenUsage;
    artifacts?: CortexArtifact[];
    citations?: CortexCitation[];
    confidence?: number;
  };
}

export interface CortexArtifact {
  id: string;
  type: 'document' | 'table' | 'checklist' | 'template' | 'code' | 'diagram';
  title: string;
  content: string;
  format?: 'markdown' | 'json' | 'html' | 'xml';
  metadata?: Record<string, unknown>;
}

export interface CortexCitation {
  id: string;
  source: string;
  title: string;
  url?: string;
  excerpt?: string;
  confidence: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CortexThread {
  id: string;
  title?: string;
  projectId?: string;
  submissionType?: string;
  messages: CortexMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CortexSearchResult {
  id: string;
  type: string;
  content: string;
  score: number;
  source: {
    type: string;
    id?: string;
    name?: string;
    url?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface RegulatorySignal {
  id: string;
  type: 'guidance' | 'warning' | 'approval' | 'rejection' | 'enforcement';
  agency: 'FDA' | 'EMA' | 'PMDA' | 'Health_Canada' | 'TGA' | 'MHRA';
  title: string;
  summary: string;
  date: Date;
  impact: 'critical' | 'high' | 'medium' | 'low';
  relevantSubmissions: string[];
  sourceUrl?: string;
}

export interface SubmissionPrediction {
  id: string;
  submissionId: string;
  type: 'approval' | 'timeline' | 'deficiency' | 'risk';
  prediction: string;
  confidence: number;
  factors: PredictionFactor[];
  recommendations: PredictionRecommendation[];
  createdAt: Date;
}

export interface PredictionFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface PredictionRecommendation {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  rationale: string;
  deadline?: Date;
}

export interface CortexHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    search: boolean;
    chat: boolean;
    embedding: boolean;
    graph: boolean;
  };
  latencyMs: number;
  timestamp: Date;
}

export interface CortexStats {
  atomCount: number;
  edgeCount: number;
  threadCount: number;
  signalCount: number;
  lastUpdated: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CORTEX_CONFIG = {
  baseUrl: '/api/cortex',
  chatEndpoint: '/chat',
  searchEndpoint: '/search',
  advisoryEndpoint: '/advisory',
  healthEndpoint: '/health',
  statsEndpoint: '/stats',
  timeoutMs: 60000,
  maxRetries: 3,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

export class CortexServiceError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'CortexServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = statusCode ? statusCode >= 500 || statusCode === 429 : false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORTEX SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class CortexService {
  private static instance: CortexService;
  private abortController: AbortController | null = null;

  private constructor() {}

  public static getInstance(): CortexService {
    if (!CortexService.instance) {
      CortexService.instance = new CortexService();
    }
    return CortexService.instance;
  }

  private unwrapPayload<T>(payload: any): T {
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return payload.data as T;
    }
    return payload as T;
  }

  private getErrorMessage(payload: any, fallback: string): string {
    return payload?.error?.message || payload?.error || fallback;
  }

  private getAuthHeaders(): Record<string, string> {
    const token =
      sessionStorage.getItem('trialsage_access_token') ||
      localStorage.getItem('trialsage_access_token');

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private withAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
    return {
      ...headers,
      ...this.getAuthHeaders(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HEALTH & STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check Cortex system health
   */
  async getHealth(): Promise<CortexHealth> {
    try {
      const response = await fetch(`${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.healthEndpoint}`, {
        headers: this.withAuthHeaders(),
      });
      if (!response.ok) {
        return {
          status: 'unhealthy',
          services: { search: false, chat: false, embedding: false, graph: false },
          latencyMs: 0,
          timestamp: new Date(),
        };
      }
      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        return {
          status: 'unhealthy',
          services: { search: false, chat: false, embedding: false, graph: false },
          latencyMs: 0,
          timestamp: new Date(),
        };
      }
      const data = this.unwrapPayload<any>(payload);
      return {
        status: 'healthy',
        services: {
          search: true,
          chat: true,
          embedding: true,
          graph: data.modules?.includes('lumen') ?? true,
        },
        latencyMs: data.latencyMs ?? 0,
        timestamp: new Date(data.timestamp ?? Date.now()),
      };
    } catch {
      return {
        status: 'unhealthy',
        services: { search: false, chat: false, embedding: false, graph: false },
        latencyMs: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get Cortex statistics
   */
  async getStats(): Promise<CortexStats> {
    const response = await fetch(`${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.statsEndpoint}`, {
      headers: this.withAuthHeaders(),
    });
    if (!response.ok) {
      throw new CortexServiceError('Failed to fetch stats', 'STATS_ERROR', response.status);
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      throw new CortexServiceError(
        this.getErrorMessage(payload, 'Failed to fetch stats'),
        'STATS_ERROR',
        response.status
      );
    }
    const data = this.unwrapPayload<any>(payload);
    return {
      atomCount: data.statistics?.atomCount ?? 0,
      edgeCount: data.statistics?.edgeCount ?? 0,
      threadCount: data.statistics?.threadCount ?? 0,
      signalCount: data.statistics?.signalCount ?? 0,
      lastUpdated: new Date(data.statistics?.lastUpdated ?? Date.now()),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHAT / CONVERSATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send a message to Lumen Cortex and get AI response
   */
  async sendMessage(params: {
    message: string;
    threadId?: string;
    projectId?: string;
    submissionType?: string;
    systemPrompt?: string;
    stream?: boolean;
  }): Promise<{
    response: string;
    threadId: string;
    artifacts?: CortexArtifact[];
    citations?: CortexCitation[];
    tokenUsage?: TokenUsage;
  }> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.chatEndpoint}`, {
        method: 'POST',
        headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: params.message,
          thread_id: params.threadId,
          project_id: params.projectId,
          submission_type: params.submissionType,
          system_prompt: params.systemPrompt,
          stream: params.stream ?? false,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new CortexServiceError(
          this.getErrorMessage(error, 'Chat request failed'),
          'CHAT_ERROR',
          response.status
        );
      }

      const payload = await response.json().catch(() => ({}));
      if (payload?.success === false) {
        throw new CortexServiceError(
          this.getErrorMessage(payload, 'Chat request failed'),
          'CHAT_ERROR',
          response.status
        );
      }
      const data = this.unwrapPayload<any>(payload);

      return {
        response: data.answer || data.response || '',
        threadId: data.thread_id || params.threadId || crypto.randomUUID(),
        artifacts: this.parseArtifacts(data.answer || data.response || ''),
        citations: data.citations,
        tokenUsage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel ongoing chat request
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Stream chat response with callbacks
   */
  async streamMessage(params: {
    message: string;
    threadId?: string;
    projectId?: string;
    submissionType?: string;
    systemPrompt?: string;
    onChunk: (chunk: string) => void;
    onComplete: (response: { threadId: string; artifacts?: CortexArtifact[] }) => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.chatEndpoint}`, {
        method: 'POST',
        headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: params.message,
          thread_id: params.threadId,
          project_id: params.projectId,
          submission_type: params.submissionType,
          system_prompt: params.systemPrompt,
          stream: true,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new CortexServiceError('Stream request failed', 'STREAM_ERROR', response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new CortexServiceError('No response body', 'STREAM_ERROR');
      }

      const decoder = new TextDecoder();
      let fullResponse = '';
      let threadId = params.threadId || crypto.randomUUID();

      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;

        const chunk = decoder.decode(result.value, { stream: true });
        fullResponse += chunk;
        params.onChunk(chunk);
      }

      params.onComplete({
        threadId,
        artifacts: this.parseArtifacts(fullResponse),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled
      }
      params.onError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      this.abortController = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SEARCH / KNOWLEDGE GRAPH
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Semantic search across knowledge base
   */
  async search(params: {
    query: string;
    types?: string[];
    limit?: number;
    minScore?: number;
    filters?: Record<string, unknown>;
  }): Promise<CortexSearchResult[]> {
    const response = await fetch(`${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.searchEndpoint}`, {
      method: 'POST',
      headers: this.withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        query: params.query,
        atom_types: params.types,
        limit: params.limit ?? 20,
        min_similarity: params.minScore ?? 0.5,
        ...params.filters,
      }),
    });

    if (!response.ok) {
      throw new CortexServiceError('Search failed', 'SEARCH_ERROR', response.status);
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      throw new CortexServiceError(
        this.getErrorMessage(payload, 'Search failed'),
        'SEARCH_ERROR',
        response.status
      );
    }
    const data = this.unwrapPayload<any>(payload);
    return (data.results || []).map((r: any) => ({
      id: r.atomId || r.id,
      type: r.atomType || r.type,
      content: r.content,
      score: r.similarityScore || r.score || 0,
      source: {
        type: r.sourceInfo?.type || 'unknown',
        id: r.sourceInfo?.id,
        name: r.sourceInfo?.name,
        url: r.sourceInfo?.url,
      },
      metadata: r.metadata,
    }));
  }

  /**
   * Get related items from knowledge graph
   */
  async getRelated(params: {
    atomId: string;
    edgeTypes?: string[];
    depth?: number;
    limit?: number;
  }): Promise<CortexSearchResult[]> {
    const response = await fetch(
      `${CORTEX_CONFIG.baseUrl}/management/graph/neighbors/${params.atomId}?` +
        new URLSearchParams({
          depth: String(params.depth ?? 1),
          limit: String(params.limit ?? 10),
          ...(params.edgeTypes ? { edge_types: params.edgeTypes.join(',') } : {}),
        }),
      {
        headers: this.withAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new CortexServiceError('Graph traversal failed', 'GRAPH_ERROR', response.status);
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      throw new CortexServiceError(
        this.getErrorMessage(payload, 'Graph traversal failed'),
        'GRAPH_ERROR',
        response.status
      );
    }
    const data = this.unwrapPayload<any>(payload);
    return (data.neighbors || []).map((n: any) => ({
      id: n.atomId || n.id,
      type: n.atomType || n.type,
      content: n.content,
      score: n.strength || 1,
      source: { type: 'graph', id: n.edgeType },
      metadata: n.metadata,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REGULATORY INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get regulatory signals and alerts
   */
  async getSignals(params?: {
    agency?: string;
    type?: string;
    submissionType?: string;
    limit?: number;
    since?: Date;
  }): Promise<RegulatorySignal[]> {
    const queryParams = new URLSearchParams();
    if (params?.agency) queryParams.set('agency', params.agency);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.submissionType) queryParams.set('submission_type', params.submissionType);
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.since) queryParams.set('since', params.since.toISOString());

    const response = await fetch(`${CORTEX_CONFIG.baseUrl}/advisory/signals?${queryParams}`, {
      headers: this.withAuthHeaders(),
    });

    if (!response.ok) {
      // Return empty array if endpoint not available
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      return [];
    }
    const data = this.unwrapPayload<any>(payload);
    return (data.signals || []).map((s: any) => ({
      id: s.id,
      type: s.signalType || s.type,
      agency: s.agencyCode || s.agency,
      title: s.title || s.extractedContent?.title || 'Regulatory Signal',
      summary: s.summary || s.extractedContent?.summary || '',
      date: new Date(s.createdAt || Date.now()),
      impact: s.urgencyLevel || 'medium',
      relevantSubmissions: s.relevantSubmissions || [],
      sourceUrl: s.sourceDocument,
    }));
  }

  /**
   * Get submission predictions
   */
  async getPredictions(submissionId: string): Promise<SubmissionPrediction[]> {
    const response = await fetch(`${CORTEX_CONFIG.baseUrl}/advisory/predictions/${submissionId}`, {
      headers: this.withAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      return [];
    }
    const data = this.unwrapPayload<any>(payload);
    return (data.predictions || []).map((p: any) => ({
      id: p.id,
      submissionId: p.submissionId,
      type: p.predictionType || p.type,
      prediction: p.predictedOutcome || p.prediction,
      confidence: p.confidence || 0,
      factors: (p.riskFactors || []).map((f: any) => ({
        name: f.factor || f.name,
        impact: f.severity === 'critical' || f.severity === 'high' ? 'negative' : 'neutral',
        weight: f.weight || 0.5,
        description: f.description || '',
      })),
      recommendations: (p.recommendations || []).map((r: any) => ({
        action: r.action,
        priority: r.priority || 'medium',
        rationale: r.rationale || '',
        deadline: r.timeline ? new Date(r.timeline) : undefined,
      })),
      createdAt: new Date(p.createdAt || Date.now()),
    }));
  }

  /**
   * Get full advisory analysis for a project
   */
  async getAdvisory(projectId: string): Promise<{
    signals: RegulatorySignal[];
    predictions: SubmissionPrediction[];
    recommendations: PredictionRecommendation[];
    riskScore: number;
  }> {
    const response = await fetch(
      `${CORTEX_CONFIG.baseUrl}${CORTEX_CONFIG.advisoryEndpoint}/${projectId}`,
      {
        headers: this.withAuthHeaders(),
      }
    );

    if (!response.ok) {
      return {
        signals: [],
        predictions: [],
        recommendations: [],
        riskScore: 0,
      };
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      return {
        signals: [],
        predictions: [],
        recommendations: [],
        riskScore: 0,
      };
    }
    const data = this.unwrapPayload<any>(payload);
    return {
      signals: data.signals || [],
      predictions: data.predictions || [],
      recommendations: data.recommendations || [],
      riskScore: data.riskScore ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // THREADS / CONVERSATION HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * List conversation threads
   */
  async getThreads(params?: {
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<CortexThread[]> {
    const queryParams = new URLSearchParams();
    if (params?.projectId) queryParams.set('project_id', params.projectId);
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.offset) queryParams.set('offset', String(params.offset));

    const response = await fetch(`${CORTEX_CONFIG.baseUrl}/threads?${queryParams}`, {
      headers: this.withAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      return [];
    }
    const data = this.unwrapPayload<any>(payload);
    return (data.threads || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId || t.programId,
      submissionType: t.threadType || t.submissionType,
      messages: [],
      createdAt: new Date(t.createdAt || Date.now()),
      updatedAt: new Date(t.updatedAt || Date.now()),
      metadata: t.metadata,
    }));
  }

  /**
   * Get thread with messages
   */
  async getThread(threadId: string): Promise<CortexThread | null> {
    const response = await fetch(`${CORTEX_CONFIG.baseUrl}/threads/${threadId}`, {
      headers: this.withAuthHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      return null;
    }
    const data = this.unwrapPayload<any>(payload);
    return {
      id: data.id,
      title: data.title,
      projectId: data.projectId || data.programId,
      submissionType: data.threadType,
      messages: (data.messages || data.traces || []).map((m: any) => ({
        id: m.id,
        role: m.traceType === 'user_message' ? 'user' : 'assistant',
        content: m.input?.message || m.output?.response || m.content || '',
        timestamp: new Date(m.createdAt || Date.now()),
        metadata: {
          model: m.agentId,
          tokenUsage: m.tokenUsage,
        },
      })),
      createdAt: new Date(data.createdAt || Date.now()),
      updatedAt: new Date(data.updatedAt || Date.now()),
      metadata: data.metadata,
    };
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    const response = await fetch(`${CORTEX_CONFIG.baseUrl}/threads/${threadId}`, {
      method: 'DELETE',
      headers: this.withAuthHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      throw new CortexServiceError('Failed to delete thread', 'DELETE_ERROR', response.status);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse artifacts from AI response
   */
  private parseArtifacts(content: string): CortexArtifact[] {
    const artifacts: CortexArtifact[] = [];

    // Parse code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [, language, code] = match;
      if (code.trim()) {
        artifacts.push({
          id: crypto.randomUUID(),
          type: 'code',
          title: `Code (${language || 'text'})`,
          content: code.trim(),
          format: 'markdown',
          metadata: { language },
        });
      }
    }

    // Parse document sections (indicated by specific markers)
    const docSectionRegex = /<!-- ARTIFACT:(\w+) -->\n([\s\S]*?)<!-- \/ARTIFACT -->/g;
    while ((match = docSectionRegex.exec(content)) !== null) {
      const [, type, docContent] = match;
      artifacts.push({
        id: crypto.randomUUID(),
        type: type as CortexArtifact['type'],
        title: `Generated ${type}`,
        content: docContent.trim(),
        format: 'markdown',
      });
    }

    return artifacts;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const cortexService = CortexService.getInstance();

// ═══════════════════════════════════════════════════════════════════════════════
// REACT QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const cortexQueryKeys = {
  all: ['cortex'] as const,
  health: () => [...cortexQueryKeys.all, 'health'] as const,
  stats: () => [...cortexQueryKeys.all, 'stats'] as const,
  search: (query: string) => [...cortexQueryKeys.all, 'search', query] as const,
  threads: (projectId?: string) => [...cortexQueryKeys.all, 'threads', projectId] as const,
  thread: (id: string) => [...cortexQueryKeys.all, 'thread', id] as const,
  signals: (filters?: object) => [...cortexQueryKeys.all, 'signals', filters] as const,
  predictions: (submissionId: string) =>
    [...cortexQueryKeys.all, 'predictions', submissionId] as const,
  advisory: (projectId: string) => [...cortexQueryKeys.all, 'advisory', projectId] as const,
} as const;
