/**
 * Cortex Prime Client Service
 *
 * Enterprise-grade client for the Cortex Prime AI backend.
 * Provides typed access to semantic search, regulatory intuition,
 * predictions, and the unified knowledge graph.
 *
 * Features:
 * - Full TypeScript type safety aligned with backend
 * - Comprehensive error handling with typed error codes
 * - Request retry logic with exponential backoff
 * - Response validation and transformation
 * - Request/response logging for debugging
 * - Singleton pattern with lazy initialization
 *
 * @version 2.1.0
 * @module portal-v2/services/cortexClient
 * @see server/services/cortexPrimeService.ts
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error codes for Cortex API operations
 * Aligned with backend error responses
 */
export const CORTEX_ERROR_CODES = {
  // Client errors
  INVALID_REQUEST: 'CORTEX_400',
  UNAUTHORIZED: 'CORTEX_401',
  FORBIDDEN: 'CORTEX_403',
  NOT_FOUND: 'CORTEX_404',
  CONFLICT: 'CORTEX_409',
  VALIDATION_FAILED: 'CORTEX_422',

  // Server errors
  SERVICE_ERROR: 'CORTEX_500',
  SERVICE_UNAVAILABLE: 'CORTEX_503',
  TIMEOUT: 'CORTEX_504',

  // Cortex-specific errors
  EMBEDDING_FAILED: 'CORTEX_EMB_001',
  SEARCH_FAILED: 'CORTEX_SEARCH_001',
  GRAPH_TRAVERSAL_FAILED: 'CORTEX_GRAPH_001',
  PREDICTION_FAILED: 'CORTEX_PRED_001',
  SIGNAL_EXTRACTION_FAILED: 'CORTEX_SIG_001',

  // Network errors
  NETWORK_ERROR: 'CORTEX_NET_001',
  PARSE_ERROR: 'CORTEX_PARSE_001',
} as const;

export type CortexErrorCode = (typeof CORTEX_ERROR_CODES)[keyof typeof CORTEX_ERROR_CODES];

/**
 * Structured error for Cortex API operations
 */
export class CortexError extends Error {
  public readonly code: CortexErrorCode;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;
  public readonly timestamp: Date;
  // Using standard property instead of override for broader compatibility
  public errorCause?: Error;

  constructor(
    message: string,
    code: CortexErrorCode,
    options?: {
      statusCode?: number;
      details?: Record<string, unknown>;
      requestId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'CortexError';
    // Store cause for error chaining
    if (options?.cause) {
      this.errorCause = options.cause;
    }
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.timestamp = new Date();
  }

  /**
   * Check if error is retryable
   */
  get isRetryable(): boolean {
    return (
      this.code === CORTEX_ERROR_CODES.SERVICE_UNAVAILABLE ||
      this.code === CORTEX_ERROR_CODES.TIMEOUT ||
      this.code === CORTEX_ERROR_CODES.NETWORK_ERROR
    );
  }

  /**
   * Serialize error for logging/reporting
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      requestId: this.requestId,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// Aligned with server/services/cortexPrimeService.ts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Knowledge atom - fundamental unit of Cortex intelligence
 * @see CortexAtom in server/services/cortexPrimeService.ts
 */
export interface CortexAtom {
  id: string;
  orgId: string | null;
  atomType: string;
  content: string;
  structuredData?: Record<string, unknown>;
  embedding1536?: number[];
  embedding3072?: number[];
  sourceType?: string;
  sourceId?: string;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Edge connecting two atoms in the knowledge graph
 */
export interface CortexEdge {
  id: string;
  sourceAtomId: string;
  targetAtomId: string;
  edgeType: string;
  strength: number;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
}

/**
 * AI agent configuration
 */
export interface CortexAgent {
  id: string;
  agentName: string;
  agentType: string;
  description?: string;
  capabilities: string[];
  modelConfig: Record<string, unknown>;
  promptTemplate?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation thread for context management
 */
export interface CortexThread {
  id: string;
  orgId: string;
  userId?: string;
  threadType: string;
  title?: string;
  contextAtomIds: string[];
  programId?: string;
  submissionId?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Trace (memory) of an interaction
 */
export interface CortexTrace {
  id: string;
  threadId: string;
  agentId?: string;
  traceType: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

/**
 * Search result with relevance scoring
 */
export interface CortexSearchResult {
  atomId: string;
  atomType: string;
  content: string;
  similarityScore: number;
  relevanceScore: number;
  sourceInfo: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Graph traversal result
 */
export interface TraversalResult {
  atomId: string;
  atomType: string;
  content: string;
  depth: number;
  path: string[];
  edgeTypesTraversed: string[];
  cumulativeStrength: number;
}

/**
 * Regulatory signal extracted from documents
 */
export interface RegulatorySignal {
  id: string;
  orgId: string;
  signalType:
    | 'guidance_update'
    | 'warning_letter'
    | 'approval_trend'
    | 'rejection_pattern'
    | 'requirement_change'
    | 'enforcement_action';
  sourceDocument: string;
  agencyCode: 'FDA' | 'EMA' | 'PMDA' | 'Health_Canada' | 'TGA' | 'MHRA' | 'NMPA';
  extractedContent: Record<string, unknown>;
  confidence: number;
  therapeuticArea?: string;
  submissionType?: string;
  sentimentScore?: number;
  urgencyLevel?: 'critical' | 'high' | 'medium' | 'low';
  isActive: boolean;
  createdAt: Date;
}

/**
 * Prediction for submission outcome
 */
export interface IntuitionPrediction {
  id: string;
  orgId: string;
  submissionId: string;
  predictionType:
    | 'approval_likelihood'
    | 'review_timeline'
    | 'deficiency_risk'
    | 'complete_response_risk';
  predictedOutcome: string;
  confidence: number;
  supportingSignals: string[];
  riskFactors: Array<{
    factor: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    mitigation?: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    rationale: string;
    timeline?: string;
  }>;
  validatedAt?: Date;
  actualOutcome?: string;
  createdAt: Date;
}

/**
 * Uncertainty estimate for epistemic intelligence
 */
export interface UncertaintyEstimate {
  id: string;
  orgId: string;
  contextType: string;
  contextId: string;
  totalUncertainty: number;
  aleatoricUncertainty: number;
  epistemicUncertainty: number;
  modelUncertainty: number;
  dataUncertainty: number;
  uncertaintyDecomposition: Record<string, number>;
  recommendedActions: Array<{
    action: string;
    expectedReduction: number;
    effort: 'low' | 'medium' | 'high';
  }>;
  createdAt: Date;
}

/**
 * Causal effect from causal inference
 */
export interface CausalEffect {
  id: string;
  graphId: string;
  causeVariable: string;
  effectVariable: string;
  effectSize: number;
  confidenceInterval: [number, number];
  pValue: number;
  mechanism?: string;
  moderators: Array<{
    variable: string;
    effect: number;
  }>;
  mediators: Array<{
    variable: string;
    proportion: number;
  }>;
  isSignificant: boolean;
  createdAt: Date;
}

/**
 * Advisory analysis result for a project
 */
export interface AdvisoryResult {
  projectId: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  predictions: IntuitionPrediction[];
  signals: RegulatorySignal[];
  recommendations: Array<{
    category:
      | 'documentation'
      | 'clinical'
      | 'manufacturing'
      | 'safety'
      | 'regulatory_strategy'
      | 'timeline';
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    rationale: string;
    deadline?: string;
    assignedTo?: string;
  }>;
  patterns: Array<{
    patternId: string;
    patternName: string;
    patternType: 'rejection' | 'approval' | 'delay' | 'deficiency';
    matchScore: number;
    outcome: string;
    historicalFrequency: number;
  }>;
  uncertaintyAnalysis?: UncertaintyEstimate;
  generatedAt: Date;
}

/**
 * Health check response
 */
export interface CortexHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  checkedAt: Date;
  components: {
    database: 'up' | 'down' | 'degraded';
    embedding: 'up' | 'down' | 'degraded';
    llm: 'up' | 'down' | 'degraded';
  };
  tables: Record<string, number>;
  indexes: Record<string, string>;
  latestEvolution?: Record<string, unknown>;
  uptime: number;
}

/**
 * Cortex statistics
 */
export interface CortexStats {
  atomCount: number;
  edgeCount: number;
  threadCount: number;
  traceCount: number;
  signalCount: number;
  predictionCount: number;
  agentCount: number;
  atomsByType: Record<string, number>;
  edgesByType: Record<string, number>;
  lastActivityAt: Date;
}

/**
 * Graph statistics
 */
export interface GraphStats {
  totalAtoms: number;
  totalEdges: number;
  activeAtoms: number;
  activeEdges: number;
  atomsByType: Record<string, number>;
  edgesByType: Record<string, number>;
  avgEdgesPerAtom: number;
  graphDensity: number;
  largestComponent: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search options for semantic search
 */
export interface SearchOptions {
  /** Filter by atom types */
  atomTypes?: string[];
  /** Filter by therapeutic area */
  therapeuticArea?: string;
  /** Filter by submission type (IND, NDA, BLA, 510k, etc.) */
  submissionType?: string;
  /** Maximum results to return (1-100) */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
  /** Include pattern matching in results */
  includePatterns?: boolean;
  /** Include predictions in results */
  includePredictions?: boolean;
  /** Include uncertainty estimates */
  includeUncertainty?: boolean;
}

/**
 * Thread creation options
 */
export interface CreateThreadOptions {
  threadType?: 'conversation' | 'analysis' | 'review' | 'collaboration';
  title?: string;
  contextAtomIds?: string[];
  programId?: string;
  submissionId?: string;
  metadata?: Record<string, unknown>;
  expiresInHours?: number;
}

/**
 * Atom creation options
 */
export interface CreateAtomOptions {
  atomType: string;
  content: string;
  structuredData?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  generateEmbedding?: boolean;
}

/**
 * Traversal options for graph exploration
 */
export interface TraversalOptions {
  edgeTypes?: string[];
  maxDepth?: number;
  minStrength?: number;
  includeInactive?: boolean;
  sortBy?: 'depth' | 'strength' | 'relevance';
}

/**
 * Prediction request options
 */
export interface PredictionOptions {
  predictionType?: IntuitionPrediction['predictionType'];
  includeSignals?: boolean;
  includePatterns?: boolean;
  confidenceThreshold?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface CortexClientConfig {
  baseUrl: string;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  enableLogging: boolean;
}

const DEFAULT_CONFIG: CortexClientConfig = {
  baseUrl: '/api/cortex',
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  enableLogging: process.env.NODE_ENV === 'development',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cortex Prime API Client
 *
 * Enterprise-grade client for interacting with the Cortex Prime AI backend.
 * Provides comprehensive error handling, retry logic, and type safety.
 *
 * @example
 * ```typescript
 * // Using the singleton instance
 * const results = await cortexClient.search('FDA guidance on gene therapy');
 *
 * // Or create a custom instance
 * const client = new CortexClient({ baseUrl: '/api/v2/cortex' });
 * ```
 */
export class CortexClient {
  private readonly config: CortexClientConfig;
  private requestId = 0;

  constructor(config: Partial<CortexClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a unique request ID for tracing
   */
  private getRequestId(): string {
    return `cortex-${Date.now()}-${++this.requestId}`;
  }

  /**
   * Log request/response for debugging
   */
  private log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (!this.config.enableLogging) return;

    const timestamp = new Date().toISOString();
    const prefix = `[Cortex ${timestamp}]`;

    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`, data);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`, data);
        break;
      default:
        console.log(`${prefix} ${message}`, data);
    }
  }

  /**
   * Map HTTP status to CortexError
   */
  private mapStatusToError(
    status: number,
    message: string,
    requestId: string,
    details?: Record<string, unknown>
  ): CortexError {
    const errorMap: Record<number, CortexErrorCode> = {
      400: CORTEX_ERROR_CODES.INVALID_REQUEST,
      401: CORTEX_ERROR_CODES.UNAUTHORIZED,
      403: CORTEX_ERROR_CODES.FORBIDDEN,
      404: CORTEX_ERROR_CODES.NOT_FOUND,
      409: CORTEX_ERROR_CODES.CONFLICT,
      422: CORTEX_ERROR_CODES.VALIDATION_FAILED,
      500: CORTEX_ERROR_CODES.SERVICE_ERROR,
      503: CORTEX_ERROR_CODES.SERVICE_UNAVAILABLE,
      504: CORTEX_ERROR_CODES.TIMEOUT,
    };

    return new CortexError(message, errorMap[status] || CORTEX_ERROR_CODES.SERVICE_ERROR, {
      statusCode: status,
      requestId,
      details,
    });
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    method: ApiRequestMethod,
    endpoint: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const requestId = this.getRequestId();
    const url = `${this.config.baseUrl}${endpoint}`;

    this.log('info', `${method} ${url}`, { requestId, body });

    try {
      const response = await apiRequest(method, url, body);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        if (response.status === 204) {
          return undefined as T;
        }
        const text = await response.text();
        throw this.mapStatusToError(response.status, text || 'Invalid response format', requestId);
      }

      const data = await response.json();

      // Check for error responses
      if (!response.ok) {
        const error = this.mapStatusToError(
          response.status,
          data.error || data.message || 'Request failed',
          requestId,
          data.details
        );

        // Retry on certain errors
        if (error.isRetryable && retryCount < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
          this.log('warn', `Retrying request in ${delay}ms (attempt ${retryCount + 1})`, {
            requestId,
          });
          await this.sleep(delay);
          return this.executeWithRetry<T>(method, endpoint, body, retryCount + 1);
        }

        throw error;
      }

      this.log('info', `Response received`, { requestId, status: response.status });
      return data;
    } catch (error) {
      if (error instanceof CortexError) {
        throw error;
      }

      // Network or parsing errors
      const cortexError = new CortexError(
        error instanceof Error ? error.message : 'Unknown error',
        CORTEX_ERROR_CODES.NETWORK_ERROR,
        {
          requestId,
          cause: error instanceof Error ? error : undefined,
        }
      );

      // Retry network errors
      if (cortexError.isRetryable && retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
        this.log('warn', `Network error, retrying in ${delay}ms`, { requestId, error });
        await this.sleep(delay);
        return this.executeWithRetry<T>(method, endpoint, body, retryCount + 1);
      }

      this.log('error', 'Request failed', { requestId, error: cortexError.toJSON() });
      throw cortexError;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Transform date strings in response to Date objects
   */
  private transformDates<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;

    const dateFields = [
      'createdAt',
      'updatedAt',
      'checkedAt',
      'startedAt',
      'completedAt',
      'expiresAt',
      'validatedAt',
      'generatedAt',
      'lastActivityAt',
    ];

    const result = { ...obj } as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      if (dateFields.includes(key) && typeof result[key] === 'string') {
        result[key] = new Date(result[key] as string);
      }
    }
    return result as T;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HEALTH & STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check Cortex Prime health status
   *
   * @example
   * ```typescript
   * const health = await cortexClient.getHealth();
   * if (health.status === 'healthy') {
   *   console.log('All systems operational');
   * }
   * ```
   */
  async getHealth(): Promise<CortexHealth> {
    const data = await this.executeWithRetry<CortexHealth>('GET', '/health');
    return this.transformDates(data);
  }

  /**
   * Get Cortex statistics
   *
   * @example
   * ```typescript
   * const stats = await cortexClient.getStats();
   * console.log(`${stats.atomCount} atoms in knowledge base`);
   * ```
   */
  async getStats(): Promise<CortexStats> {
    const data = await this.executeWithRetry<{ statistics: CortexStats }>('GET', '/stats');
    return this.transformDates(data.statistics);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SEARCH & QUERY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Semantic search across the knowledge base
   *
   * @param query - Natural language search query
   * @param options - Search filtering and configuration options
   * @returns Array of search results with relevance scores
   *
   * @example
   * ```typescript
   * // Basic search
   * const results = await cortexClient.search('FDA 510(k) requirements');
   *
   * // Filtered search
   * const results = await cortexClient.search('breakthrough therapy', {
   *   atomTypes: ['regulatory_guidance', 'fda_document'],
   *   therapeuticArea: 'oncology',
   *   limit: 20,
   *   minSimilarity: 0.7
   * });
   * ```
   */
  async search(query: string, options?: SearchOptions): Promise<CortexSearchResult[]> {
    if (!query || query.trim().length < 2) {
      throw new CortexError(
        'Search query must be at least 2 characters',
        CORTEX_ERROR_CODES.VALIDATION_FAILED
      );
    }

    const data = await this.executeWithRetry<{ results: CortexSearchResult[] }>('POST', '/search', {
      query: query.trim(),
      ...options,
    });
    return data.results || [];
  }

  /**
   * Advanced query with optional embedding input
   *
   * @param params - Query parameters including optional pre-computed embedding
   * @returns Search results
   *
   * @example
   * ```typescript
   * // Query with pre-computed embedding
   * const embedding = await cortexClient.embed('my query text');
   * const results = await cortexClient.query({
   *   queryEmbedding: embedding,
   *   atomTypes: ['clinical_study'],
   *   limit: 10
   * });
   * ```
   */
  async query(params: {
    query?: string;
    queryEmbedding?: number[];
    atomTypes?: string[];
    limit?: number;
    minSimilarity?: number;
  }): Promise<CortexSearchResult[]> {
    if (!params.query && !params.queryEmbedding) {
      throw new CortexError(
        'Either query or queryEmbedding must be provided',
        CORTEX_ERROR_CODES.VALIDATION_FAILED
      );
    }

    const data = await this.executeWithRetry<{ results: CortexSearchResult[] }>(
      'POST',
      '/query/search',
      params
    );
    return data.results || [];
  }

  /**
   * Generate embedding vector for text
   *
   * @param text - Text to embed
   * @param model - Embedding model to use (default: 1536 dimensions)
   * @returns Embedding vector
   *
   * @example
   * ```typescript
   * const embedding = await cortexClient.embed('regulatory submission strategy');
   * console.log(`Generated ${embedding.length}-dimensional embedding`);
   * ```
   */
  async embed(text: string, model: '1536' | '3072' = '1536'): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new CortexError('Text to embed cannot be empty', CORTEX_ERROR_CODES.VALIDATION_FAILED);
    }

    const data = await this.executeWithRetry<{ embedding: number[] }>('POST', '/query/embed', {
      text: text.trim(),
      model,
    });
    return data.embedding || [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATOM OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new knowledge atom
   *
   * @param options - Atom creation options
   * @returns Created atom
   *
   * @example
   * ```typescript
   * const atom = await cortexClient.createAtom({
   *   atomType: 'regulatory_insight',
   *   content: 'FDA emphasizes real-world evidence in recent guidance',
   *   structuredData: { source: 'FDA Guidance 2024' },
   *   metadata: { confidence: 0.95 }
   * });
   * ```
   */
  async createAtom(options: CreateAtomOptions): Promise<CortexAtom> {
    if (!options.atomType || !options.content) {
      throw new CortexError(
        'atomType and content are required',
        CORTEX_ERROR_CODES.VALIDATION_FAILED
      );
    }

    const data = await this.executeWithRetry<{ atom: CortexAtom }>('POST', '/atoms', options);
    return this.transformDates(data.atom);
  }

  /**
   * Get atom by ID
   *
   * @param atomId - UUID of the atom
   * @returns Atom or null if not found
   *
   * @example
   * ```typescript
   * const atom = await cortexClient.getAtom('uuid-here');
   * if (atom) {
   *   console.log(`Found: ${atom.atomType} - ${atom.content.substring(0, 50)}`);
   * }
   * ```
   */
  async getAtom(atomId: string): Promise<CortexAtom | null> {
    try {
      const data = await this.executeWithRetry<{ atom: CortexAtom }>('GET', `/atoms/${atomId}`);
      return this.transformDates(data.atom);
    } catch (error) {
      if (error instanceof CortexError && error.code === CORTEX_ERROR_CODES.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update an existing atom
   *
   * @param atomId - UUID of the atom to update
   * @param updates - Fields to update
   * @returns Updated atom
   *
   * @example
   * ```typescript
   * const updated = await cortexClient.updateAtom('uuid', {
   *   content: 'Updated insight with new information',
   *   metadata: { lastReviewed: new Date().toISOString() }
   * });
   * ```
   */
  async updateAtom(atomId: string, updates: Partial<CortexAtom>): Promise<CortexAtom> {
    const data = await this.executeWithRetry<{ atom: CortexAtom }>(
      'PATCH',
      `/atoms/${atomId}`,
      updates
    );
    return this.transformDates(data.atom);
  }

  /**
   * Deactivate an atom (soft delete)
   *
   * @param atomId - UUID of the atom
   * @returns Success status
   */
  async deactivateAtom(atomId: string): Promise<{ success: boolean }> {
    return this.executeWithRetry('DELETE', `/atoms/${atomId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create an edge between two atoms
   *
   * @param edge - Edge definition
   * @returns Created edge
   *
   * @example
   * ```typescript
   * const edge = await cortexClient.createEdge({
   *   sourceAtomId: 'atom-uuid-1',
   *   targetAtomId: 'atom-uuid-2',
   *   edgeType: 'supports',
   *   strength: 0.85,
   *   evidence: { citation: 'FDA Guidance Doc 2024' }
   * });
   * ```
   */
  async createEdge(edge: {
    sourceAtomId: string;
    targetAtomId: string;
    edgeType: string;
    strength?: number;
    evidence?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<CortexEdge> {
    const data = await this.executeWithRetry<{ edge: CortexEdge }>('POST', '/edges', edge);
    return this.transformDates(data.edge);
  }

  /**
   * Get edges connected to an atom
   *
   * @param atomId - UUID of the atom
   * @param direction - Filter by edge direction
   * @returns Array of edges
   */
  async getAtomEdges(
    atomId: string,
    direction?: 'incoming' | 'outgoing' | 'both'
  ): Promise<CortexEdge[]> {
    const params = direction ? `?direction=${direction}` : '';
    const data = await this.executeWithRetry<{ edges: CortexEdge[] }>(
      'GET',
      `/atoms/${atomId}/edges${params}`
    );
    return (data.edges || []).map(e => this.transformDates(e));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // THREAD OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new conversation thread
   *
   * @param options - Thread creation options
   * @returns Created thread
   *
   * @example
   * ```typescript
   * const thread = await cortexClient.createThread({
   *   title: 'IND-2024-001 Submission Review',
   *   threadType: 'review',
   *   submissionId: 'submission-uuid',
   *   contextAtomIds: ['atom-1', 'atom-2']
   * });
   * ```
   */
  async createThread(options: CreateThreadOptions): Promise<CortexThread> {
    const data = await this.executeWithRetry<{ thread: CortexThread }>('POST', '/threads', options);
    return this.transformDates(data.thread);
  }

  /**
   * Get thread by ID
   *
   * @param threadId - UUID of the thread
   * @returns Thread or null if not found
   */
  async getThread(threadId: string): Promise<CortexThread | null> {
    try {
      const data = await this.executeWithRetry<{ thread: CortexThread }>(
        'GET',
        `/threads/${threadId}`
      );
      return this.transformDates(data.thread);
    } catch (error) {
      if (error instanceof CortexError && error.code === CORTEX_ERROR_CODES.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get thread traces (interaction history)
   *
   * @param threadId - UUID of the thread
   * @returns Array of traces
   */
  async getThreadTraces(threadId: string): Promise<CortexTrace[]> {
    const data = await this.executeWithRetry<{ traces: CortexTrace[] }>(
      'GET',
      `/threads/${threadId}/traces`
    );
    return (data.traces || []).map(t => this.transformDates(t));
  }

  /**
   * Assemble context from thread for LLM consumption
   *
   * @param threadId - UUID of the thread
   * @param maxTokens - Maximum tokens for context window
   * @returns Assembled context object
   *
   * @example
   * ```typescript
   * const context = await cortexClient.assembleContext('thread-uuid', 4000);
   * // Use context.systemPrompt and context.relevantKnowledge in LLM call
   * ```
   */
  async assembleContext(
    threadId: string,
    maxTokens = 8000
  ): Promise<{
    threadId: string;
    title?: string;
    systemPrompt: string;
    conversationHistory: Array<{ role: string; content: string }>;
    relevantKnowledge: Array<{ atomId: string; content: string; relevance: number }>;
    totalTokens: number;
  }> {
    return this.executeWithRetry('POST', `/threads/${threadId}/context`, { maxTokens });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TRACE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a trace (record of interaction)
   *
   * @param trace - Trace data
   * @returns Created trace
   *
   * @example
   * ```typescript
   * const trace = await cortexClient.createTrace({
   *   threadId: 'thread-uuid',
   *   traceType: 'analysis',
   *   input: { query: 'What are the key risks?' },
   *   reasoning: { approach: 'pattern_matching' }
   * });
   * ```
   */
  async createTrace(trace: {
    threadId: string;
    agentId?: string;
    traceType?: string;
    input: Record<string, unknown>;
    reasoning?: Record<string, unknown>;
  }): Promise<CortexTrace> {
    const data = await this.executeWithRetry<{ trace: CortexTrace }>('POST', '/traces', trace);
    return this.transformDates(data.trace);
  }

  /**
   * Complete a trace with output
   *
   * @param traceId - UUID of the trace
   * @param output - Output data from the operation
   * @param status - Final status
   * @param tokenUsage - Token usage statistics
   * @returns Updated trace
   */
  async completeTrace(
    traceId: string,
    output: Record<string, unknown>,
    status: 'completed' | 'failed' = 'completed',
    tokenUsage?: CortexTrace['tokenUsage']
  ): Promise<CortexTrace> {
    const data = await this.executeWithRetry<{ trace: CortexTrace }>('PUT', `/traces/${traceId}`, {
      output,
      status,
      tokenUsage,
    });
    return this.transformDates(data.trace);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVISORY & PREDICTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get full advisory analysis for a project
   *
   * @param projectId - UUID of the project
   * @returns Complete advisory analysis with predictions, signals, and recommendations
   *
   * @example
   * ```typescript
   * const advisory = await cortexClient.getAdvisory('project-uuid');
   * console.log(`Overall risk: ${advisory.overallRisk}`);
   * console.log(`${advisory.recommendations.length} recommendations`);
   * ```
   */
  async getAdvisory(projectId: string): Promise<AdvisoryResult> {
    const data = await this.executeWithRetry<AdvisoryResult>('GET', `/advisory/${projectId}`);
    return this.transformDates(data);
  }

  /**
   * Generate prediction for a submission
   *
   * @param submissionId - UUID of the submission
   * @param options - Prediction options
   * @returns Prediction with confidence and recommendations
   *
   * @example
   * ```typescript
   * const prediction = await cortexClient.getPrediction('submission-uuid', {
   *   predictionType: 'approval_likelihood',
   *   includeSignals: true
   * });
   * console.log(`Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
   * ```
   */
  async getPrediction(
    submissionId: string,
    options?: PredictionOptions
  ): Promise<IntuitionPrediction> {
    const data = await this.executeWithRetry<{ prediction: IntuitionPrediction }>(
      'POST',
      '/advisory/predict',
      { submissionId, ...options }
    );
    return this.transformDates(data.prediction);
  }

  /**
   * Get regulatory signals for a submission type
   *
   * @param submissionType - Type of submission (IND, NDA, 510k, etc.)
   * @param therapeuticArea - Optional therapeutic area filter
   * @returns Array of relevant regulatory signals
   *
   * @example
   * ```typescript
   * const signals = await cortexClient.getSignals('510k', 'cardiovascular');
   * const criticalSignals = signals.filter(s => s.urgencyLevel === 'critical');
   * ```
   */
  async getSignals(submissionType: string, therapeuticArea?: string): Promise<RegulatorySignal[]> {
    const params = new URLSearchParams({ submissionType });
    if (therapeuticArea) params.append('therapeuticArea', therapeuticArea);

    const data = await this.executeWithRetry<{ signals: RegulatorySignal[] }>(
      'GET',
      `/advisory/signals?${params}`
    );
    return (data.signals || []).map(s => this.transformDates(s));
  }

  /**
   * Match submission against historical rejection patterns
   *
   * @param submissionContent - Structured submission data to match
   * @returns Matched patterns with scores
   *
   * @example
   * ```typescript
   * const patterns = await cortexClient.matchPatterns({
   *   deviceType: 'Class II',
   *   indicationsForUse: 'cardiac monitoring',
   *   predicateDevice: '510(k) K123456'
   * });
   *
   * const highRiskPatterns = patterns.filter(p => p.matchScore > 0.7);
   * ```
   */
  async matchPatterns(
    submissionContent: Record<string, unknown>
  ): Promise<AdvisoryResult['patterns']> {
    const data = await this.executeWithRetry<{ patterns: AdvisoryResult['patterns'] }>(
      'POST',
      '/advisory/patterns',
      { submissionContent }
    );
    return data.patterns || [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GRAPH OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Traverse the knowledge graph from a starting atom
   *
   * @param startAtomId - UUID of the starting atom
   * @param options - Traversal options
   * @returns Connected atoms with path information
   *
   * @example
   * ```typescript
   * const related = await cortexClient.traverse('atom-uuid', {
   *   edgeTypes: ['supports', 'references'],
   *   maxDepth: 3,
   *   minStrength: 0.5
   * });
   *
   * // Build a visualization
   * const nodes = related.map(r => ({ id: r.atomId, depth: r.depth }));
   * ```
   */
  async traverse(startAtomId: string, options?: TraversalOptions): Promise<TraversalResult[]> {
    const data = await this.executeWithRetry<{ results: TraversalResult[] }>('POST', '/traverse', {
      startAtomId,
      ...options,
    });
    return data.results || [];
  }

  /**
   * Get graph statistics
   *
   * @returns Comprehensive graph statistics
   *
   * @example
   * ```typescript
   * const stats = await cortexClient.getGraphStats();
   * console.log(`Graph has ${stats.totalAtoms} atoms and ${stats.totalEdges} edges`);
   * console.log(`Density: ${(stats.graphDensity * 100).toFixed(2)}%`);
   * ```
   */
  async getGraphStats(): Promise<GraphStats> {
    return this.executeWithRetry('GET', '/management/graph/stats');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UNCERTAINTY & CAUSAL INFERENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Estimate uncertainty for a given context
   *
   * @param contextType - Type of context (submission, prediction, etc.)
   * @param contextId - UUID of the context
   * @param inputData - Data to analyze for uncertainty
   * @returns Uncertainty decomposition and recommended actions
   *
   * @example
   * ```typescript
   * const uncertainty = await cortexClient.estimateUncertainty(
   *   'submission',
   *   'submission-uuid',
   *   { clinicalData: {...}, regulatoryHistory: {...} }
   * );
   *
   * if (uncertainty.epistemicUncertainty > 0.3) {
   *   console.log('Need more data to reduce uncertainty');
   * }
   * ```
   */
  async estimateUncertainty(
    contextType: string,
    contextId: string,
    inputData: Record<string, unknown>
  ): Promise<UncertaintyEstimate> {
    const data = await this.executeWithRetry<{ estimate: UncertaintyEstimate }>(
      'POST',
      '/epistemic/uncertainty',
      { contextType, contextId, inputData }
    );
    return this.transformDates(data.estimate);
  }

  /**
   * Estimate causal effect between variables
   *
   * @param graphId - UUID of the causal graph
   * @param causeVariable - Name of the cause variable
   * @param effectVariable - Name of the effect variable
   * @returns Causal effect estimate with confidence intervals
   */
  async estimateCausalEffect(
    graphId: string,
    causeVariable: string,
    effectVariable: string
  ): Promise<CausalEffect> {
    const data = await this.executeWithRetry<{ effect: CausalEffect }>('POST', '/causal/effect', {
      graphId,
      causeVariable,
      effectVariable,
    });
    return this.transformDates(data.effect);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Singleton Cortex client instance
 *
 * Pre-configured client for standard use throughout the application.
 * Import this instance for most use cases.
 *
 * @example
 * ```typescript
 * import { cortexClient } from '@/portal-v2/services/cortexClient';
 *
 * // Use directly
 * const results = await cortexClient.search('query');
 *
 * // Or destructure methods
 * const { search, getAdvisory, getPrediction } = cortexClient;
 * ```
 */
export const cortexClient = new CortexClient();

export default cortexClient;
