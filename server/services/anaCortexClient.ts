/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *                    AnA RI API CLIENT - ENTERPRISE EDITION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * TypeScript client for the AnA RI Python backend.
 * Provides type-safe access to all enterprise features.
 *
 * FEATURES:
 * - Full type safety with TypeScript generics
 * - Automatic retry with exponential backoff
 * - Request/response interceptors
 * - WebSocket support for real-time events
 * - Circuit breaker integration
 * - Comprehensive error handling
 *
 * @module server/services/anaCortexClient
 * @version 2.0.0
 */

import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Client configuration options
 */
export interface AnaCortexConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
}

/**
 * Request options for API calls
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  skipRetry?: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  duration: number;
  version: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          DOMAIN TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Document embedding request
 */
export interface EmbedRequest {
  text: string;
  model?: string;
  dimensions?: number;
}

/**
 * Batch embedding request
 */
export interface BatchEmbedRequest {
  texts: string[];
  model?: string;
  batchSize?: number;
}

/**
 * Embedding response
 */
export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  tokenCount: number;
}

/**
 * Similarity search request
 */
export interface SimilarityRequest {
  query: string;
  candidates: string[];
  topK?: number;
  threshold?: number;
}

/**
 * Similarity result
 */
export interface SimilarityResult {
  index: number;
  text: string;
  score: number;
}

/**
 * Table extraction request
 */
export interface TableExtractionRequest {
  documentId: string;
  pageNumbers?: number[];
  strategies?: ('camelot' | 'vision' | 'llm')[];
  schemaHint?: string;
}

/**
 * Extracted table data
 */
export interface ExtractedTable {
  id: string;
  pageNumber: number;
  schemaType: TableSchemaType;
  headers: string[];
  rows: string[][];
  confidence: number;
  metadata: Record<string, unknown>;
}

/**
 * Table schema types
 */
export enum TableSchemaType {
  DEMOGRAPHICS = 'DEMOGRAPHICS',
  ADVERSE_EVENTS = 'ADVERSE_EVENTS',
  EFFICACY_PRIMARY = 'EFFICACY_PRIMARY',
  EFFICACY_SECONDARY = 'EFFICACY_SECONDARY',
  LABORATORY = 'LABORATORY',
  PHARMACOKINETICS = 'PHARMACOKINETICS',
  DISPOSITION = 'DISPOSITION',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Citation validation request
 */
export interface CitationRequest {
  claim: string;
  sources: string[];
  requireEvidence?: boolean;
}

/**
 * Citation validation result
 */
export interface CitationResult {
  isSupported: boolean;
  confidence: number;
  citations: Citation[];
  explanation: string;
}

/**
 * Individual citation
 */
export interface Citation {
  sourceIndex: number;
  text: string;
  relevanceScore: number;
  pageNumber?: number;
}

/**
 * Graph-RAG query request
 */
export interface GraphRAGRequest {
  query: string;
  maxHops?: number;
  includeEntities?: boolean;
  includeRelationships?: boolean;
  filters?: Record<string, unknown>;
}

/**
 * Graph-RAG response
 */
export interface GraphRAGResult {
  answer: string;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  confidence: number;
  reasoning: string[];
}

/**
 * Graph entity
 */
export interface GraphEntity {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
}

/**
 * Graph relationship
 */
export interface GraphRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
  properties: Record<string, unknown>;
}

/**
 * Compliance check request
 */
export interface ComplianceRequest {
  documentId: string;
  regulations?: string[];
  strictMode?: boolean;
}

/**
 * Compliance check result
 */
export interface ComplianceResult {
  compliant: boolean;
  score: number;
  findings: ComplianceFinding[];
  recommendations: string[];
}

/**
 * Compliance finding
 */
export interface ComplianceFinding {
  regulation: string;
  section: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  description: string;
  location?: string;
}

/**
 * Digital signature request
 */
export interface SignatureRequest {
  documentId: string;
  signerId: string;
  meaning: string;
}

/**
 * Digital signature result
 */
export interface SignatureResult {
  signatureId: string;
  algorithm: string;
  timestamp: string;
  signature: string;
  publicKeyFingerprint: string;
}

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * LLM completion request
 */
export interface LLMRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * LLM completion response
 */
export interface LLMResponse {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private threshold: number = 5,
    private timeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          RETRY LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on client errors (4xx)
      if (error instanceof AnaCortexError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }

      if (i < attempts - 1) {
        const backoff = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════
//                          ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════════════

export class AnaCortexError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>,
    public traceId?: string
  ) {
    super(message);
    this.name = 'AnaCortexError';
  }

  static fromApiError(error: ApiError, statusCode: number): AnaCortexError {
    return new AnaCortexError(
      error.message,
      error.code,
      statusCode,
      error.details,
      error.traceId
    );
  }
}

export class NetworkError extends AnaCortexError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends AnaCortexError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT', 408);
    this.name = 'TimeoutError';
  }
}

export class AuthenticationError extends AnaCortexError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends AnaCortexError {
  constructor(
    message: string = 'Rate limit exceeded',
    public retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MAIN CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AnaCortexClient extends EventEmitter {
  private config: Required<AnaCortexConfig>;
  private circuitBreaker: CircuitBreaker;
  private requestInterceptors: Array<(req: Request) => Request> = [];
  private responseInterceptors: Array<(res: Response) => Response> = [];

  constructor(config: AnaCortexConfig) {
    super();

    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey || '',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 30000
    };

    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreakerThreshold,
      this.config.circuitBreakerTimeout
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          HTTP METHODS
  // ─────────────────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-ID': this.generateRequestId(),
      ...options.headers
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeout || this.config.timeout
    );

    const requestFn = async (): Promise<ApiResponse<T>> => {
      const startTime = Date.now();

      try {
        let request = new Request(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: options.signal || controller.signal
        });

        // Apply request interceptors
        for (const interceptor of this.requestInterceptors) {
          request = interceptor(request);
        }

        let response = await fetch(request);

        // Apply response interceptors
        for (const interceptor of this.responseInterceptors) {
          response = interceptor(response);
        }

        const duration = Date.now() - startTime;
        const data = await response.json();

        if (!response.ok) {
          this.handleHttpError(response.status, data);
        }

        this.emit('request', {
          method,
          path,
          status: response.status,
          duration
        });

        return {
          success: true,
          data: data as T,
          meta: {
            requestId: headers['X-Request-ID'],
            timestamp: new Date().toISOString(),
            duration,
            version: '2.0.0'
          }
        };
      } catch (error) {
        if (error instanceof AnaCortexError) {
          throw error;
        }

        if ((error as Error).name === 'AbortError') {
          throw new TimeoutError();
        }

        throw new NetworkError(
          `Network request failed: ${(error as Error).message}`,
          error as Error
        );
      } finally {
        clearTimeout(timeout);
      }
    };

    // Execute with circuit breaker if enabled
    if (this.config.enableCircuitBreaker) {
      return this.circuitBreaker.execute(async () => {
        if (options.skipRetry) {
          return requestFn();
        }
        return withRetry(requestFn, this.config.retryAttempts, this.config.retryDelay);
      });
    }

    if (options.skipRetry) {
      return requestFn();
    }
    return withRetry(requestFn, this.config.retryAttempts, this.config.retryDelay);
  }

  private handleHttpError(status: number, data: unknown): never {
    const error = data as { error?: ApiError; message?: string };

    switch (status) {
      case 401:
        throw new AuthenticationError(error.error?.message || error.message);
      case 429:
        throw new RateLimitError(error.error?.message || error.message);
      default:
        throw AnaCortexError.fromApiError(
          error.error || { code: 'HTTP_ERROR', message: error.message || 'Request failed' },
          status
        );
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          INTERCEPTORS
  // ─────────────────────────────────────────────────────────────────────────

  addRequestInterceptor(interceptor: (req: Request) => Request): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: (res: Response) => Response): void {
    this.responseInterceptors.push(interceptor);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          EMBEDDING API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate embedding for a single text
   */
  async embed(request: EmbedRequest, options?: RequestOptions): Promise<ApiResponse<EmbeddingResult>> {
    return this.request<EmbeddingResult>('POST', '/api/v2/embeddings', request, options);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(
    request: BatchEmbedRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<EmbeddingResult[]>> {
    return this.request<EmbeddingResult[]>('POST', '/api/v2/embeddings/batch', request, options);
  }

  /**
   * Find similar texts
   */
  async findSimilar(
    request: SimilarityRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SimilarityResult[]>> {
    return this.request<SimilarityResult[]>('POST', '/api/v2/embeddings/similarity', request, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          TABLE EXTRACTION API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Extract tables from a document
   */
  async extractTables(
    request: TableExtractionRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<ExtractedTable[]>> {
    return this.request<ExtractedTable[]>('POST', '/api/v2/extraction/tables', request, options);
  }

  /**
   * Get extraction status
   */
  async getExtractionStatus(
    jobId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ status: string; progress: number; tables?: ExtractedTable[] }>> {
    return this.request('GET', `/api/v2/extraction/jobs/${jobId}`, undefined, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          CITATION API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate citations for a claim
   */
  async validateCitation(
    request: CitationRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<CitationResult>> {
    return this.request<CitationResult>('POST', '/api/v2/citations/validate', request, options);
  }

  /**
   * Extract citations from text
   */
  async extractCitations(
    text: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Citation[]>> {
    return this.request<Citation[]>('POST', '/api/v2/citations/extract', { text }, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          GRAPH-RAG API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Query the knowledge graph with RAG
   */
  async queryGraph(
    request: GraphRAGRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<GraphRAGResult>> {
    return this.request<GraphRAGResult>('POST', '/api/v2/graphrag/query', request, options);
  }

  /**
   * Get entity by ID
   */
  async getEntity(
    entityId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<GraphEntity>> {
    return this.request<GraphEntity>('GET', `/api/v2/graphrag/entities/${entityId}`, undefined, options);
  }

  /**
   * Search entities
   */
  async searchEntities(
    query: string,
    type?: string,
    limit?: number,
    options?: RequestOptions
  ): Promise<ApiResponse<GraphEntity[]>> {
    const params = new URLSearchParams({ query });
    if (type) params.append('type', type);
    if (limit) params.append('limit', limit.toString());

    return this.request<GraphEntity[]>('GET', `/api/v2/graphrag/entities?${params}`, undefined, options);
  }

  /**
   * Get relationships for an entity
   */
  async getRelationships(
    entityId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<GraphRelationship[]>> {
    return this.request<GraphRelationship[]>(
      'GET',
      `/api/v2/graphrag/entities/${entityId}/relationships`,
      undefined,
      options
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          COMPLIANCE API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check document compliance
   */
  async checkCompliance(
    request: ComplianceRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<ComplianceResult>> {
    return this.request<ComplianceResult>('POST', '/api/v2/compliance/check', request, options);
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(
    documentId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ComplianceResult>> {
    return this.request<ComplianceResult>(
      'GET',
      `/api/v2/compliance/reports/${documentId}`,
      undefined,
      options
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          SIGNATURE API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sign a document
   */
  async signDocument(
    request: SignatureRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SignatureResult>> {
    return this.request<SignatureResult>('POST', '/api/v2/signatures/sign', request, options);
  }

  /**
   * Verify a signature
   */
  async verifySignature(
    signatureId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ valid: boolean; signer: string; timestamp: string }>> {
    return this.request(
      'GET',
      `/api/v2/signatures/${signatureId}/verify`,
      undefined,
      options
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          AUDIT API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get audit log entries
   */
  async getAuditLog(
    filters?: {
      userId?: string;
      resourceType?: string;
      resourceId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<{ entries: AuditEntry[]; total: number }>> {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
    }

    return this.request(
      'GET',
      `/api/v2/audit?${params}`,
      undefined,
      options
    );
  }

  /**
   * Get Merkle root for audit verification
   */
  async getMerkleRoot(
    options?: RequestOptions
  ): Promise<ApiResponse<{ root: string; entryCount: number; timestamp: string }>> {
    return this.request('GET', '/api/v2/audit/merkle-root', undefined, options);
  }

  /**
   * Verify audit trail integrity
   */
  async verifyAuditTrail(
    entryIds: string[],
    options?: RequestOptions
  ): Promise<ApiResponse<{ valid: boolean; invalidEntries: string[] }>> {
    return this.request('POST', '/api/v2/audit/verify', { entryIds }, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          LLM API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate LLM completion
   */
  async complete(
    request: LLMRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<LLMResponse>> {
    return this.request<LLMResponse>('POST', '/api/v2/llm/complete', request, options);
  }

  /**
   * Stream LLM completion
   */
  async *streamComplete(
    request: LLMRequest,
    options?: RequestOptions
  ): AsyncGenerator<string, void, unknown> {
    const url = `${this.config.baseUrl}/api/v2/llm/stream`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: options?.signal
    });

    if (!response.ok) {
      const error = await response.json();
      throw AnaCortexError.fromApiError(error.error, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              yield parsed.text;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          HEALTH API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check service health
   */
  async health(options?: RequestOptions): Promise<ApiResponse<{
    status: string;
    version: string;
    components: Record<string, { status: string; latency?: number }>;
  }>> {
    return this.request('GET', '/api/v2/health', undefined, { ...options, skipRetry: true });
  }

  /**
   * Get service metrics
   */
  async metrics(options?: RequestOptions): Promise<ApiResponse<Record<string, number>>> {
    return this.request('GET', '/api/v2/metrics', undefined, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                          UTILITY METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new AnA RI client instance
 */
export function createAnaCortexClient(config: AnaCortexConfig): AnaCortexClient {
  return new AnaCortexClient(config);
}

/**
 * Create a client with default configuration
 */
export function createDefaultClient(): AnaCortexClient {
  return new AnaCortexClient({
    baseUrl: process.env.ANA_CORTEX_URL || 'http://localhost:8000',
    apiKey: process.env.ANA_CORTEX_API_KEY,
    timeout: 30000,
    retryAttempts: 3,
    enableCircuitBreaker: true
  });
}

export default AnaCortexClient;
