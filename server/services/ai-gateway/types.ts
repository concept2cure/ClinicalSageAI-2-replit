/**
 * AI Gateway — Type Definitions
 *
 * Core types for the centralized AI Gateway.
 * These types are the canonical interface for all AI calls across the platform.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Provider & Routing Enums
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderName = 'openai' | 'anthropic' | 'moonshot';

export type TaskType =
  | 'chat'
  | 'document_analysis'
  | 'structured_output'
  | 'regulatory_review'
  | 'code_generation'
  | 'summarization'
  | 'embedding'
  | 'general';

export type RoutingStrategy =
  | 'task_based'      // Route based on task type → provider capabilities
  | 'cost_optimized'  // Cheapest model that meets quality threshold
  | 'latency_optimized' // Fastest responding provider
  | 'quality_optimized' // Highest quality model for the task
  | 'round_robin'     // Distribute evenly across healthy providers
  | 'explicit';       // Use the explicitly specified provider/model

// ─────────────────────────────────────────────────────────────────────────────
// Request & Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayRequest {
  /** Task categorization for routing decisions */
  taskType: TaskType;

  /** Conversation messages (system + user + assistant history) */
  messages: GatewayMessage[];

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Temperature (0-2). Lower = more deterministic */
  temperature?: number;

  /** Request JSON-mode output */
  jsonMode?: boolean;

  /** JSON schema for structured output (requires jsonMode=true) */
  jsonSchema?: Record<string, unknown>;

  /** Request streaming response */
  stream?: boolean;

  /** Explicit provider override (bypasses routing) */
  provider?: ProviderName;

  /** Explicit model override (bypasses routing) */
  model?: string;

  /** Routing strategy override */
  strategy?: RoutingStrategy;

  // ── Traceability Context ────────────────────────────────────────────────

  /** Organization ID for tenant isolation */
  organizationId?: string | number;

  /** User ID for audit trail */
  userId?: string | number;

  /** Project ID for context */
  projectId?: string | number;

  /** Caller module/service identifier */
  callerModule?: string;

  /** Arbitrary metadata for audit log */
  metadata?: Record<string, unknown>;
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface GatewayResponse {
  /** Generated content */
  content: string;

  /** Provider that served the request */
  provider: ProviderName;

  /** Model used */
  model: string;

  /** Token usage and cost */
  usage: GatewayUsage;

  /** End-to-end latency in ms */
  latencyMs: number;

  /** Unique request ID for tracing */
  requestId: string;

  /** Whether response came from cache */
  cached: boolean;

  /** Whether deterministic mode was active */
  deterministic: boolean;

  /** Finish reason from provider */
  finishReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  name: ProviderName;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  id: string;
  provider: ProviderName;
  model: string;
  contextWindow: number;
  qualityScore: number; // 0-100
  costPer1kInput: number;
  costPer1kOutput: number;
  capabilities: TaskType[];
  enabled: boolean;
}

export interface PolicyConfig {
  /** Maximum tokens per request */
  maxTokensPerRequest: number;

  /** Maximum requests per minute per organization */
  maxRequestsPerMinutePerOrg: number;

  /** Maximum requests per minute per user */
  maxRequestsPerMinutePerUser: number;

  /** Blocked content patterns (regex) */
  blockedPatterns: string[];

  /** Required content filters */
  contentFilters: boolean;

  /** PII detection and redaction */
  piiDetection: boolean;
}

export interface GatewayConfig {
  /** Enable deterministic mode (fixed responses for testing) */
  deterministicMode: boolean;

  /** Default routing strategy */
  defaultStrategy: RoutingStrategy;

  /** Provider configurations */
  providers: ProviderConfig[];

  /** Policy configuration */
  policy: PolicyConfig;

  /** Enable audit logging */
  auditEnabled: boolean;

  /** Database connection pool (for audit logging) */
  dbPool?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Health
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderHealth {
  provider: ProviderName;
  healthy: boolean;
  consecutiveFailures: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  avgLatencyMs: number;
  requestCount: number;
  errorRate: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Entry
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id?: string;
  requestId: string;
  timestamp: Date;
  provider: ProviderName;
  model: string;
  taskType: TaskType;
  strategy: RoutingStrategy;
  organizationId?: string | number;
  userId?: string | number;
  projectId?: string | number;
  callerModule?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  cached: boolean;
  deterministic: boolean;
  metadata?: Record<string, unknown>;
}
