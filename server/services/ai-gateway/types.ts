/**
 * AI Gateway — Type Definitions
 *
 * Core types for the centralized AI Gateway.
 * These types are the canonical interface for all AI calls across the platform.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Provider & Routing Enums
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'moonshot'
  | 'bedrock' // Claude on AWS Bedrock — private-cloud (BAA / zero-retention)
  | 'vertex' // Claude / Gemini on Google Vertex AI — private-cloud (regional residency)
  | 'azure' // OpenAI on Azure — private-cloud (enterprise / Microsoft estate)
  | 'local'; // Self-hosted open-weight models via vLLM/LiteLLM — air-gappable

/**
 * Where a provider physically runs inference. This is what determines which
 * compliance guarantees (BAA, zero data retention, data residency) a request
 * can be served under. See server/services/ai-gateway/providers/placement.ts
 * for the per-provider placement registry.
 */
export type SubstrateClass =
  | 'frontier_shared' // Multi-tenant frontier API (OpenAI / Anthropic / Moonshot direct)
  | 'frontier_private' // Frontier model inside your own cloud account (Bedrock / Vertex / Azure)
  | 'self_hosted'; // Open-weight model on infrastructure you control (on-prem / air-gapped)

/** Data-residency requirement a tenant can impose on a request. */
export type DataResidency = 'any' | 'us' | 'eu' | 'apac' | 'on_prem';

/** Retention posture honored for a request's payload at the provider. */
export type RetentionPolicy = 'standard' | 'zero_retention';

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

/**
 * Document content block — lets the model read an attached PDF/text file.
 * `base64` source is GA on current Claude models (no beta header). `file`
 * source references Anthropic's Files API and additionally requires the
 * files-api beta header (set by the provider when a file source is present).
 */
export interface DocumentBlock {
  type: 'document';
  source:
    | { type: 'base64'; media_type: 'application/pdf' | 'text/plain'; data: string }
    | { type: 'file'; file_id: string };
  title?: string;
  context?: string;
  citations?: { enabled: boolean };
}

/** Multi-modal content (text + images + documents) */
export type ContentBlock = TextBlock | ImageBlock | DocumentBlock;

/** Claude tool definition for agentic workflows */
export interface AnaTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Anthropic server-side tool — executed by Anthropic's infrastructure,
 * not by our local tool dispatcher. Distinguished from {@link AnaTool}
 * by the required `type` field (e.g. `"web_search_20250305"`,
 * `"web_fetch_20260209"`, `"code_execution_20260120"`).
 *
 * Tool-specific parameters (max_uses, allowed_domains, user_location, etc.)
 * are keyed by the individual tool spec and passed through as-is.
 */
export interface AnthropicServerTool {
  type: string;
  name: string;
  [key: string]: unknown;
}

/** Either a custom JSON-schema tool or an Anthropic server-side tool. */
export type AnyAnaTool = AnaTool | AnthropicServerTool;

/** Tool use result from Claude */
export interface AnaToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result to send back to Claude */
export interface AnaToolResult {
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
export interface AnaGatewayResponse extends GatewayResponse {
  /** Extended thinking output (if enabled) */
  thinking?: string;
  /** Tool use requests from Claude */
  toolUses?: AnaToolUse[];
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

  /**
   * Sampling seed for reproducible output. Passed through to providers that
   * support it (OpenAI/Moonshot) and recorded in the audit trail regardless,
   * so a generation can be tied to its sampling parameters.
   */
  seed?: number;

  /**
   * Version/identifier of the prompt template used (e.g. a git tag or content
   * hash of the system prompt). Recorded in the audit trail for reproducibility.
   */
  promptVersion?: string;

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

  // ── Placement / Compliance Requirements ──────────────────────────────────

  /**
   * Data-residency requirement for this request. When set to anything other
   * than 'any', the gateway only routes to providers whose placement satisfies
   * it (see providers/placement.ts). Honors EU/APAC residency and on-prem-only
   * tenants. Defaults to 'any' (no residency constraint).
   */
  dataResidency?: DataResidency;

  /**
   * When true, the request may only be served by a provider that contractually
   * does not retain payloads — a private-cloud deployment with a zero-retention
   * agreement (Bedrock/Vertex/Azure) or a self-hosted model. Shared frontier
   * APIs without a ZDR agreement are excluded.
   */
  zeroDataRetention?: boolean;

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

  /**
   * Tools for agentic workflows (Claude only). Accepts either custom
   * JSON-schema tools or Anthropic server tools (web_search, web_fetch,
   * code_execution) — the two shapes are distinguished by the presence of
   * a top-level `type` field on server tools.
   */
  tools?: AnyAnaTool[];

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
  // ── Reproducibility (which params + prompt produced this output) ──────────
  /** Sampling temperature used for the request. */
  temperature?: number;
  /** Sampling seed, when supplied. */
  seed?: number;
  /** SHA-256 of the canonicalized prompt messages (role:content joined). */
  promptHash?: string;
  /** Caller-supplied prompt template version/identifier. */
  promptVersion?: string;
  /** Model ids attempted before the one that served this response (fallback chain). */
  triedModels?: string[];
  // ── Placement / Residency (which substrate + region served this) ──────────
  /** Inference substrate that served this request (shared / private / self-hosted). */
  substrate?: SubstrateClass;
  /** Best-effort region the serving provider ran in (e.g. 'us', 'eu', 'on_prem'). */
  region?: string;
  /** Retention posture honored for this request. */
  retentionPolicy?: RetentionPolicy;
  metadata?: Record<string, unknown>;
}
