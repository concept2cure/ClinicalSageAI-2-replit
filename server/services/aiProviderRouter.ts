/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    AI PROVIDER ROUTER SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade multi-provider AI routing with intelligent task assignment,
 * automatic fallback chains, cost optimization, and comprehensive audit logging.
 *
 * SUPPORTED PROVIDERS:
 * - OpenAI (GPT-4o, GPT-4-turbo, GPT-3.5-turbo)
 * - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku)
 * - Moonshot/Kimi (moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k)
 * - Azure OpenAI (enterprise compliance)
 *
 * ROUTING STRATEGIES:
 * - Task-based: Route by task type (reasoning, generation, long-context)
 * - Cost-optimized: Route to cheapest capable provider
 * - Latency-optimized: Route to fastest provider
 * - Quality-optimized: Route to highest quality provider
 * - Fallback chain: Automatic retry on failure
 *
 * REGULATORY COMPLIANCE:
 * - 21 CFR Part 11 compliant audit trail
 * - Request/response logging with PII filtering
 * - Provider health monitoring
 * - Cost tracking per organization
 *
 * @author Concept2Cure AI Team
 * @version 2.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { LiteLLMAdapter } from './ai/LiteLLMAdapter';
import { LangfuseService } from './observability/langfuseService';
// Provider execution is delegated to the governed AI gateway — it owns the
// audit trail and selects a *current* model for the chosen provider (the
// router's logical MODEL_CONFIGS otherwise pin retired snapshots).
import { getGateway } from './ai-gateway/gateway.js';
import type {
  TaskType as GatewayTaskType,
  ProviderName as GatewayProviderName,
} from './ai-gateway/types.js';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type AIProvider = 'openai' | 'anthropic' | 'moonshot' | 'azure';

export type TaskType =
  | 'document_analysis' // Claude excels
  | 'structured_output' // OpenAI JSON mode
  | 'long_context' // Kimi 200K context
  | 'code_generation' // Claude excels
  | 'reasoning' // Claude excels
  | 'chat' // Low latency needed
  | 'embedding' // OpenAI embeddings
  | 'safety_critical' // Constitutional AI
  | 'regulatory_review' // Specialized domain
  | 'general'; // Default

export type RoutingStrategy =
  | 'task_based' // Route by task type
  | 'cost_optimized' // Cheapest capable
  | 'latency_optimized' // Fastest response
  | 'quality_optimized' // Highest quality
  | 'round_robin'; // Load balancing

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  maxTokens: number;
  contextWindow: number;
  costPer1kInput: number; // USD
  costPer1kOutput: number; // USD
  avgLatencyMs: number;
  qualityScore: number; // 1-100
  capabilities: TaskType[];
  isAvailable: boolean;
}

export interface AIRequest {
  taskType: TaskType;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  stream?: boolean;
  organizationId?: string;
  userId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  latencyMs: number;
  requestId: string;
  cached: boolean;
}

export interface ProviderHealth {
  provider: AIProvider;
  isHealthy: boolean;
  lastCheck: Date;
  avgLatencyMs: number;
  errorRate: number;
  consecutiveFailures: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  provider: AIProvider;
  model: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost: number;
  success: boolean;
  errorMessage?: string;
  organizationId?: string;
  userId?: string;
  projectId?: string;
  requestHash: string; // For deduplication
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MODEL CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // OpenAI Models
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    avgLatencyMs: 2000,
    qualityScore: 95,
    capabilities: ['structured_output', 'chat', 'general', 'regulatory_review'],
    isAvailable: true,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03,
    avgLatencyMs: 3000,
    qualityScore: 92,
    capabilities: ['structured_output', 'reasoning', 'general'],
    isAvailable: true,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    avgLatencyMs: 800,
    qualityScore: 82,
    capabilities: ['chat', 'general'],
    isAvailable: true,
  },

  // Anthropic Models
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 8192,
    contextWindow: 200000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    avgLatencyMs: 2500,
    qualityScore: 97,
    capabilities: [
      'document_analysis',
      'reasoning',
      'code_generation',
      'safety_critical',
      'regulatory_review',
      'long_context',
    ],
    isAvailable: true,
  },
  'claude-3-opus': {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    maxTokens: 4096,
    contextWindow: 200000,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    avgLatencyMs: 4000,
    qualityScore: 98,
    capabilities: ['document_analysis', 'reasoning', 'safety_critical', 'regulatory_review'],
    isAvailable: true,
  },
  'claude-3-haiku': {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    contextWindow: 200000,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125,
    avgLatencyMs: 600,
    qualityScore: 80,
    capabilities: ['chat', 'general'],
    isAvailable: true,
  },

  // Moonshot/Kimi Models (for long context)
  'moonshot-v1-128k': {
    provider: 'moonshot',
    model: 'moonshot-v1-128k',
    maxTokens: 4096,
    contextWindow: 128000,
    costPer1kInput: 0.008,
    costPer1kOutput: 0.008,
    avgLatencyMs: 3000,
    qualityScore: 85,
    capabilities: ['long_context', 'document_analysis'],
    isAvailable: false, // Enable when API key available
  },
  'moonshot-v1-32k': {
    provider: 'moonshot',
    model: 'moonshot-v1-32k',
    maxTokens: 4096,
    contextWindow: 32000,
    costPer1kInput: 0.004,
    costPer1kOutput: 0.004,
    avgLatencyMs: 2000,
    qualityScore: 83,
    capabilities: ['long_context', 'general'],
    isAvailable: false,
  },
};

// Task to preferred models mapping
const TASK_MODEL_PREFERENCES: Record<TaskType, string[]> = {
  document_analysis: ['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4o'],
  structured_output: ['gpt-4o', 'gpt-4-turbo', 'claude-3-5-sonnet'],
  long_context: ['claude-3-5-sonnet', 'moonshot-v1-128k', 'gpt-4o'],
  code_generation: ['claude-3-5-sonnet', 'gpt-4o', 'gpt-4-turbo'],
  reasoning: ['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4o'],
  chat: ['gpt-4o-mini', 'claude-3-haiku', 'gpt-4o'],
  embedding: [], // Handled separately
  safety_critical: ['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4o'],
  regulatory_review: ['claude-3-5-sonnet', 'claude-3-opus', 'gpt-4o'],
  general: ['gpt-4o', 'claude-3-5-sonnet', 'gpt-4o-mini'],
};

// ═══════════════════════════════════════════════════════════════════════════
//                          AI PROVIDER ROUTER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map the router's task taxonomy onto the gateway's. Categories the gateway
 * doesn't model (long_context, reasoning, safety_critical) fall back to
 * 'general'. This only affects gateway audit + its internal fallback ordering,
 * since the router passes an explicit provider override.
 */
function mapToGatewayTaskType(t: TaskType): GatewayTaskType {
  switch (t) {
    case 'document_analysis':
      return 'document_analysis';
    case 'structured_output':
      return 'structured_output';
    case 'code_generation':
      return 'code_generation';
    case 'chat':
      return 'chat';
    case 'embedding':
      return 'embedding';
    case 'regulatory_review':
      return 'regulatory_review';
    default:
      return 'general';
  }
}

export class AIProviderRouter {
  // Provider failover, audit, and current-model selection live in the gateway.
  private readonly gateway = getGateway();
  // Availability flags drive selectModel()'s provider gating; the actual SDK
  // clients live inside the gateway, not here.
  private openaiAvailable = false;
  private anthropicAvailable = false;
  private pool: Pool;
  private providerHealth: Map<AIProvider, ProviderHealth> = new Map();
  private defaultStrategy: RoutingStrategy = 'task_based';
  // Deterministic round-robin cursor — replaces a Math.random() pick so routing
  // is reproducible and auditable. See FORENSIC_CODE_AUDIT_2026-05-29.md (LOW).
  private roundRobinCursor = 0;
  private liteLLMAdapter: LiteLLMAdapter;
  private langfuse: LangfuseService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.liteLLMAdapter = new LiteLLMAdapter();
    this.langfuse = new LangfuseService();
    this.initializeProviders();
    this.initializeHealthTracking();
  }

  /**
   * Detect which providers are configured. The gateway holds the real clients;
   * these flags only gate model selection below.
   */
  private initializeProviders(): void {
    this.openaiAvailable = !!process.env.OPENAI_API_KEY;
    console.log(
      this.openaiAvailable
        ? '✅ OpenAI provider available'
        : '⚠️ OpenAI API key not configured'
    );

    this.anthropicAvailable = !!process.env.ANTHROPIC_API_KEY;
    console.log(
      this.anthropicAvailable
        ? '✅ Anthropic provider available'
        : '⚠️ Anthropic API key not configured'
    );

    // Moonshot (future)
    if (process.env.MOONSHOT_API_KEY) {
      console.log('✅ Moonshot provider configured');
      // Enable moonshot models
      MODEL_CONFIGS['moonshot-v1-128k'].isAvailable = true;
      MODEL_CONFIGS['moonshot-v1-32k'].isAvailable = true;
    }
  }

  /**
   * Initialize health tracking for all providers
   */
  private initializeHealthTracking(): void {
    const providers: AIProvider[] = ['openai', 'anthropic', 'moonshot', 'azure'];
    for (const provider of providers) {
      this.providerHealth.set(provider, {
        provider,
        isHealthy: true,
        lastCheck: new Date(),
        avgLatencyMs: 0,
        errorRate: 0,
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Select the best model for a given request
   */
  private selectModel(
    request: AIRequest,
    strategy: RoutingStrategy = this.defaultStrategy
  ): ModelConfig {
    const { taskType, messages } = request;

    // Calculate input size
    const inputTokenEstimate = messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );

    // Get candidate models for this task
    let candidates = TASK_MODEL_PREFERENCES[taskType] || TASK_MODEL_PREFERENCES.general;

    // Filter to available models
    candidates = candidates.filter(modelName => {
      const config = MODEL_CONFIGS[modelName];
      if (!config || !config.isAvailable) return false;

      // Check context window
      if (inputTokenEstimate > config.contextWindow * 0.8) return false;

      // Check provider health
      const health = this.providerHealth.get(config.provider);
      if (health && !health.isHealthy) return false;

      // Check provider availability
      if (config.provider === 'openai' && !this.openaiAvailable) return false;
      if (config.provider === 'anthropic' && !this.anthropicAvailable) return false;

      return true;
    });

    if (candidates.length === 0) {
      throw new Error(`No available models for task type: ${taskType}`);
    }

    // Apply routing strategy
    let selectedModel: string;

    switch (strategy) {
      case 'cost_optimized':
        selectedModel = candidates.reduce((best, curr) => {
          const bestConfig = MODEL_CONFIGS[best];
          const currConfig = MODEL_CONFIGS[curr];
          const bestCost = bestConfig.costPer1kInput + bestConfig.costPer1kOutput;
          const currCost = currConfig.costPer1kInput + currConfig.costPer1kOutput;
          return currCost < bestCost ? curr : best;
        });
        break;

      case 'latency_optimized':
        selectedModel = candidates.reduce((best, curr) => {
          const bestConfig = MODEL_CONFIGS[best];
          const currConfig = MODEL_CONFIGS[curr];
          return currConfig.avgLatencyMs < bestConfig.avgLatencyMs ? curr : best;
        });
        break;

      case 'quality_optimized':
        selectedModel = candidates.reduce((best, curr) => {
          const bestConfig = MODEL_CONFIGS[best];
          const currConfig = MODEL_CONFIGS[curr];
          return currConfig.qualityScore > bestConfig.qualityScore ? curr : best;
        });
        break;

      case 'round_robin':
        // Deterministic round-robin via a persistent cursor (previously a random
        // pick, which made provider selection non-reproducible in the audit trail).
        selectedModel = candidates[this.roundRobinCursor % candidates.length];
        this.roundRobinCursor = (this.roundRobinCursor + 1) % candidates.length;
        break;

      case 'task_based':
      default:
        // Use the first (preferred) candidate
        selectedModel = candidates[0];
        break;
    }

    return MODEL_CONFIGS[selectedModel];
  }

  /**
   * Execute a request through the governed AI gateway.
   *
   * Replaces the former direct OpenAI/Anthropic/Moonshot SDK calls. The router
   * still chooses the *provider* (via selectModel + its routing strategy); the
   * gateway supplies a current, audited model for that provider — so the
   * router's logical MODEL_CONFIGS no longer pin retired model snapshots
   * (e.g. claude-3-opus-20240229, claude-3-5-sonnet-20241022) that now 404.
   * The gateway also applies model-aware sampling params (Opus 4.7+ safe).
   */
  private async executeViaGateway(
    request: AIRequest,
    modelConfig: ModelConfig
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    const response = await this.gateway.route({
      taskType: mapToGatewayTaskType(request.taskType),
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      maxTokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      jsonMode: request.jsonMode,
      // Honor the router's provider choice; the gateway picks a live model for it.
      provider: modelConfig.provider as GatewayProviderName,
      organizationId: request.organizationId,
      userId: request.userId,
      projectId: request.projectId,
      callerModule: 'aiProviderRouter',
    });

    return {
      content: response.content,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };
  }

  /**
   * Log audit entry to database
   */
  private async logAudit(entry: AuditLogEntry): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO ai_provider_audit_log (
          id, timestamp, provider, model, task_type,
          input_tokens, output_tokens, latency_ms, cost,
          success, error_message, organization_id, user_id,
          project_id, request_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
        [
          entry.id,
          entry.timestamp,
          entry.provider,
          entry.model,
          entry.taskType,
          entry.inputTokens,
          entry.outputTokens,
          entry.latencyMs,
          entry.cost,
          entry.success,
          entry.errorMessage,
          entry.organizationId,
          entry.userId,
          entry.projectId,
          entry.requestHash,
        ]
      );
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Audit log error:', error);
    }
  }

  /**
   * Update provider health metrics
   */
  private updateProviderHealth(provider: AIProvider, success: boolean, latencyMs: number): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    if (success) {
      health.consecutiveFailures = 0;
      health.avgLatencyMs = health.avgLatencyMs * 0.9 + latencyMs * 0.1;
      health.errorRate = Math.max(0, health.errorRate - 0.1);
    } else {
      health.consecutiveFailures++;
      health.errorRate = Math.min(1, health.errorRate + 0.1);

      // Mark unhealthy after 3 consecutive failures
      if (health.consecutiveFailures >= 3) {
        health.isHealthy = false;
        console.warn(`⚠️ Provider ${provider} marked unhealthy`);

        // Schedule health check recovery
        setTimeout(() => {
          health.isHealthy = true;
          health.consecutiveFailures = 0;
          console.log(`✅ Provider ${provider} health check reset`);
        }, 60000); // 1 minute
      }
    }

    health.lastCheck = new Date();
    this.providerHealth.set(provider, health);
  }

  /**
   * Main routing function - executes AI request with intelligent routing
   */
  async route(request: AIRequest, strategy?: RoutingStrategy): Promise<AIResponse> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Select model
    const modelConfig = this.selectModel(request, strategy);

    // Calculate request hash for deduplication/caching
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request.messages))
      .digest('hex')
      .slice(0, 16);

    let result: { content: string; usage: { inputTokens: number; outputTokens: number } };
    let liteLLMResult: AIResponse | null = null;
    let success = true;
    let errorMessage: string | undefined;
    let executedModelConfig = modelConfig;

    try {
      await this.langfuse.emitEvent({
        name: 'ai_request_start',
        traceId: requestId,
        metadata: {
          organizationId: request.organizationId,
          userId: request.userId,
          projectId: request.projectId,
          taskType: request.taskType,
          selectedModel: modelConfig.model,
          selectedProvider: modelConfig.provider,
          strategy: strategy || this.defaultStrategy,
        },
        input: { messagesCount: request.messages.length },
      });

      // Execute against selected provider
      if (this.liteLLMAdapter.isEnabled()) {
        liteLLMResult = await this.liteLLMAdapter.execute(request, modelConfig);
        result = {
          content: liteLLMResult.content,
          usage: {
            inputTokens: liteLLMResult.usage.inputTokens,
            outputTokens: liteLLMResult.usage.outputTokens,
          },
        };
      } else {
        result = await this.executeViaGateway(request, modelConfig);
      }
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update health and try fallback
      this.updateProviderHealth(modelConfig.provider, false, Date.now() - startTime);

      // Attempt fallback to next available model
      const fallbackModels = TASK_MODEL_PREFERENCES[request.taskType].filter(
        m => MODEL_CONFIGS[m].provider !== modelConfig.provider
      );

      if (fallbackModels.length > 0) {
        console.log(`Attempting fallback to ${fallbackModels[0]}`);
        const fallbackConfig = MODEL_CONFIGS[fallbackModels[0]];

        try {
          await this.langfuse.emitEvent({
            name: 'ai_fallback_attempt',
            traceId: requestId,
            metadata: {
              fromProvider: modelConfig.provider,
              toProvider: fallbackConfig.provider,
              fromModel: modelConfig.model,
              toModel: fallbackConfig.model,
              taskType: request.taskType,
            },
          });
          if (this.liteLLMAdapter.isEnabled()) {
            liteLLMResult = await this.liteLLMAdapter.execute(request, fallbackConfig);
            result = {
              content: liteLLMResult.content,
              usage: {
                inputTokens: liteLLMResult.usage.inputTokens,
                outputTokens: liteLLMResult.usage.outputTokens,
              },
            };
          } else {
            result = await this.executeViaGateway(request, fallbackConfig);
          }
          executedModelConfig = fallbackConfig;
          success = true;
          errorMessage = undefined;
        } catch (fallbackError) {
          throw error; // Throw original error
        }
      } else {
        throw error;
      }
    }

    const latencyMs = liteLLMResult?.latencyMs ?? Date.now() - startTime;

    // Update provider health
    this.updateProviderHealth(executedModelConfig.provider, success, latencyMs);

    // Calculate cost
    const estimatedCost =
      liteLLMResult?.usage.estimatedCost ??
      (result.usage.inputTokens / 1000) * executedModelConfig.costPer1kInput +
        (result.usage.outputTokens / 1000) * executedModelConfig.costPer1kOutput;

    // Log audit entry
    await this.logAudit({
      id: requestId,
      timestamp: new Date(),
      provider: executedModelConfig.provider,
      model: executedModelConfig.model,
      taskType: request.taskType,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs,
      cost: estimatedCost,
      success,
      errorMessage,
      organizationId: request.organizationId,
      userId: request.userId,
      projectId: request.projectId,
      requestHash,
    });

    await this.langfuse.emitEvent({
      name: success ? 'ai_request_success' : 'ai_request_failure',
      traceId: requestId,
      metadata: {
        provider: executedModelConfig.provider,
        model: executedModelConfig.model,
        taskType: request.taskType,
        organizationId: request.organizationId,
        userId: request.userId,
        projectId: request.projectId,
      },
      output: {
        latencyMs,
        usage: result.usage,
        estimatedCost,
        success,
        errorMessage,
      },
      level: success ? 'DEFAULT' : 'ERROR',
    });

    return {
      content: result.content,
      provider: executedModelConfig.provider,
      model: executedModelConfig.model,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.inputTokens + result.usage.outputTokens,
        estimatedCost,
      },
      latencyMs,
      requestId,
      cached: false,
    };
  }

  getIntegrationStatus() {
    return {
      litellm: this.liteLLMAdapter.getDiagnostics(),
      langfuse: this.langfuse.diagnostics(),
    };
  }

  /**
   * Get available providers and their health status
   */
  getProviderStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Get cost estimate for a request without executing
   */
  estimateCost(
    request: AIRequest,
    strategy?: RoutingStrategy
  ): {
    model: string;
    provider: AIProvider;
    estimatedInputCost: number;
    estimatedOutputCost: number;
    estimatedTotalCost: number;
  } {
    const modelConfig = this.selectModel(request, strategy);
    const inputTokenEstimate = request.messages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    const outputTokenEstimate = request.maxTokens || 1000;

    return {
      model: modelConfig.model,
      provider: modelConfig.provider,
      estimatedInputCost: (inputTokenEstimate / 1000) * modelConfig.costPer1kInput,
      estimatedOutputCost: (outputTokenEstimate / 1000) * modelConfig.costPer1kOutput,
      estimatedTotalCost:
        (inputTokenEstimate / 1000) * modelConfig.costPer1kInput +
        (outputTokenEstimate / 1000) * modelConfig.costPer1kOutput,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let routerInstance: AIProviderRouter | null = null;

export function getAIRouter(pool: Pool): AIProviderRouter {
  if (!routerInstance) {
    routerInstance = new AIProviderRouter(pool);
  }
  return routerInstance;
}

export { MODEL_CONFIGS, TASK_MODEL_PREFERENCES };
