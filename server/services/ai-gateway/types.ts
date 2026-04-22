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
  | 'document_drafting'
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

// ─────────────────────────────────────────────────────────────────────────────
// Claude-Specific Types
// ─────────────────────────────────────────────────────────────────────────────

/** Image content block for Claude vision */
export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string; // base64 data or URL
  };
}

/** Text content block */
export interface TextBlock {
  type: 'text';
  text: string;
}

/** Multi-modal content (text + images) */
export type ContentBlock = TextBlock | ImageBlock;

/** Claude tool definition for agentic workflows */
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Tool use result from Claude */
export interface ClaudeToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result to send back to Claude */
export interface ClaudeToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

/** Extended thinking configuration */
export interface ExtendedThinkingConfig {
  enabled: boolean;
  budgetTokens: number; // 1024 to 128000
}

/** Prompt caching configuration for Claude */
export interface PromptCacheConfig {
  /** Mark system prompt blocks with cache_control for reuse */
  enabled: boolean;
  /** Cache type — currently only 'ephemeral' supported */
  type: 'ephemeral';
}

/** Streaming callback for real-time token delivery */
export type StreamCallback = (chunk: string, metadata?: {
  type: 'text' | 'thinking' | 'tool_use';
  thinkingContent?: string;
}) => void;

/** Claude-enhanced gateway response with thinking and tool use */
export interface ClaudeEnhancedResponse extends GatewayResponse {
  /** Extended thinking output (if enabled) */
  thinking?: string;
  /** Tool use requests from Claude */
  toolUses?: ClaudeToolUse[];
  /** Whether prompt cache was hit */
  cacheHit?: boolean;
  /** Cache creation/read token counts */
  cacheStats?: {
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Request & Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Multi-modal content blocks (images + text) — Claude only */
  contentBlocks?: ContentBlock[];
  /**
   * Mark this message with a prompt-cache breakpoint (Claude only).
   * When `promptCache.enabled` is set on the request, system messages
   * with `cacheControl: true` will carry `cache_control` markers in the
   * outgoing Anthropic request so the prefix up to and including that
   * block is cached. If no message sets this, the gateway falls back to
   * marking only the final system message.
   */
  cacheControl?: boolean;
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

  // ── Claude-Specific Options ──────────────────────────────────────────────

  /** Enable extended thinking (Claude only) */
  thinking?: ExtendedThinkingConfig;

  /** Tools for agentic workflows (Claude only) */
  tools?: ClaudeTool[];

  /** Tool choice behavior */
  toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };

  /** Prompt caching config (Claude only) */
  promptCache?: PromptCacheConfig;

  /** Streaming callback for real-time delivery */
  onStream?: StreamCallback;

  /** Multi-modal content blocks (images) — used instead of messages for vision */
  imageContent?: ImageBlock[];
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
