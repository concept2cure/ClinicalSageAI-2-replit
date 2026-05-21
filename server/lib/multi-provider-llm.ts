/**
 * Multi-Provider LLM Service - Enterprise Edition
 *
 * FDA 21 CFR Part 11 Compliant - Multi-Provider Resilience
 *
 * Supports multiple LLM providers with automatic failover:
 *   Primary: Kimi AI / Moonshot (moonshot-v1-32k)
 *   Secondary: OpenAI (GPT-4-turbo)
 *
 * When the primary provider fails (circuit breaker opens), the system
 * automatically fails over to the secondary provider, ensuring
 * continuous operation even during provider outages.
 *
 * Features:
 * - Provider-specific circuit breakers
 * - Automatic failover between providers
 * - Health-based provider selection
 * - Unified interface for all LLM operations
 * - Provider preference configuration
 * - Cost optimization (can prefer cheaper provider)
 *
 * @module MultiProviderLLM
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 */

import OpenAI from 'openai';
import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';
import { getPromptInjectionProtection } from './prompt-injection-protection';
import { getTamperProofAuditLog, AuditEventType } from './tamper-proof-audit';
import { Pool } from 'pg';

// =============================================================================
// Types
// =============================================================================

export type LLMProvider = 'OPENAI' | 'KIMI' | 'AUTO';

export interface LLMProviderConfig {
  name: LLMProvider;
  displayName: string;
  baseURL?: string;
  apiKeyEnvVar: string;
  defaultModel: string;
  models: {
    chat: string;
    embedding?: string;
  };
  maxTokens: number;
  costPer1kTokens: number; // For cost optimization
}

export interface LLMRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  provider?: LLMProvider;
  workloadClass?: 'INTERACTIVE' | 'BATCH';
  maxCostPer1kTokens?: number;
  preferLowLatency?: boolean;
}

interface ResolvedRoutingPolicy {
  workloadClass: 'INTERACTIVE' | 'BATCH';
  maxCostPer1kTokens?: number;
  preferLowLatency: boolean;
  maxTokensCap?: number;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  latencyMs: number;
  fallbackUsed: boolean;
  routing: {
    workloadClass: 'INTERACTIVE' | 'BATCH';
    preferLowLatency: boolean;
    maxCostPer1kTokens?: number;
    maxTokensCap?: number;
    providersTried: Exclude<LLMProvider, 'AUTO'>[];
  };
}

export interface ProviderHealth {
  provider: LLMProvider;
  available: boolean;
  circuitState: string;
  lastSuccessTime?: Date;
  lastFailureTime?: Date;
  avgLatencyMs: number;
}

export interface RoutingStats {
  totalRequests: number;
  totalFallbacks: number;
  fallbackRatePct: number;
  providerSuccesses: Record<Exclude<LLMProvider, 'AUTO'>, number>;
  providerFailures: Record<Exclude<LLMProvider, 'AUTO'>, number>;
}

// =============================================================================
// Provider Configurations
// =============================================================================

const PROVIDER_CONFIGS: Record<Exclude<LLMProvider, 'AUTO'>, LLMProviderConfig> = {
  OPENAI: {
    name: 'OPENAI',
    displayName: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4-turbo',
    models: {
      chat: 'gpt-4-turbo',
      embedding: 'text-embedding-3-small',
    },
    maxTokens: 4096,
    costPer1kTokens: 0.01, // Approximate
  },
  KIMI: {
    name: 'KIMI',
    displayName: 'Kimi AI (Moonshot)',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    apiKeyEnvVar: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-32k',
    models: {
      chat: 'moonshot-v1-32k',
      embedding: 'text-embedding-3-small',
    },
    maxTokens: 32000,
    costPer1kTokens: 0.008, // Approximate, Kimi is often cheaper
  },
};

// =============================================================================
// Multi-Provider LLM Service
// =============================================================================

export class MultiProviderLLMService {
  private clients: Map<LLMProvider, OpenAI> = new Map();
  private circuitBreakers: Map<LLMProvider, CircuitBreaker> = new Map();
  private promptProtection = getPromptInjectionProtection();
  private pool: Pool;
  private routingStats: RoutingStats = {
    totalRequests: 0,
    totalFallbacks: 0,
    providerSuccesses: { OPENAI: 0, KIMI: 0 },
    providerFailures: { OPENAI: 0, KIMI: 0 },
    fallbackRatePct: 0,
  };

  // Provider priority order (first available is used)
  // Kimi AI is PRIMARY, OpenAI is SECONDARY fallback
  private providerPriority: LLMProvider[] = ['KIMI', 'OPENAI'];

  constructor(pool: Pool, options?: { providerPriority?: LLMProvider[] }) {
    this.pool = pool;

    if (options?.providerPriority) {
      this.providerPriority = options.providerPriority.filter(p => p !== 'AUTO');
    }

    // Initialize providers
    this.initializeProviders();
  }

  /**
   * Initialize all available providers
   */
  private initializeProviders(): void {
    for (const [providerName, config] of Object.entries(PROVIDER_CONFIGS)) {
      const provider = providerName as Exclude<LLMProvider, 'AUTO'>;
      const apiKey = process.env[config.apiKeyEnvVar];

      if (apiKey) {
        // Create OpenAI client (Kimi uses OpenAI-compatible API)
        const clientConfig: ConstructorParameters<typeof OpenAI>[0] = {
          apiKey,
          timeout: 120000,
          maxRetries: 2,
        };

        if (config.baseURL) {
          clientConfig.baseURL = config.baseURL;
        }

        this.clients.set(provider, new OpenAI(clientConfig));

        // Create circuit breaker for this provider
        this.circuitBreakers.set(
          provider,
          new CircuitBreaker({
            name: config.displayName,
            failureThreshold: 5,
            resetTimeoutMs: 30000,
            successThreshold: 2,
            requestTimeoutMs: 120000,
            onStateChange: (from, to, reason) => {
              console.log(`[${config.displayName}] Circuit breaker: ${from} → ${to} (${reason})`);

              // Log to audit
              this.logProviderEvent('CIRCUIT_BREAKER_OPENED', provider, { from, to, reason }).catch(
                err => console.error('Failed to log circuit breaker event:', err)
              );
            },
          })
        );

        console.log(`[MultiProvider] ${config.displayName} initialized`);
      } else {
        console.warn(
          `[MultiProvider] ${config.displayName} not available (${config.apiKeyEnvVar} not set)`
        );
      }
    }

    const availableCount = this.clients.size;
    if (availableCount === 0) {
      console.error('[MultiProvider] WARNING: No LLM providers available!');
    } else {
      console.log(
        `[MultiProvider] ${availableCount} provider(s) available: ${Array.from(this.clients.keys()).join(', ')}`
      );
    }
  }

  /**
   * Execute a chat completion with automatic failover
   */
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const correlationId = `llm-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const routingPolicy = this.resolveRoutingPolicy(request);

    // Determine which providers to try
    const providersToTry = this.getProvidersToTry(request, routingPolicy);

    if (providersToTry.length === 0) {
      throw new LLMProviderError(
        'No LLM providers available. Please configure OPENAI_API_KEY or KIMI_API_KEY.',
        'NO_PROVIDERS'
      );
    }

    // Sanitize user messages for prompt injection
    const sanitizedMessages = this.sanitizeMessages(request.messages, correlationId);

    let lastError: Error | null = null;
    let fallbackUsed = false;
    const providersTried: Exclude<LLMProvider, 'AUTO'>[] = [];
    this.routingStats.totalRequests += 1;

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i];
      const client = this.clients.get(provider);
      const breaker = this.circuitBreakers.get(provider);
      const config = PROVIDER_CONFIGS[provider];

      if (!client || !breaker) continue;
      providersTried.push(provider);

      // Check if circuit breaker allows requests
      if (!breaker.isAllowingRequests()) {
        console.log(
          `[MultiProvider:${correlationId}] ${config.displayName} circuit is open, skipping`
        );
        fallbackUsed = true;
        continue;
      }

      try {
        console.log(`[MultiProvider:${correlationId}] Trying ${config.displayName}...`);

        const response = await breaker.execute(async () => {
          const requestedMaxTokens = request.maxTokens || config.maxTokens;
          const effectiveMaxTokens = routingPolicy.maxTokensCap
            ? Math.min(requestedMaxTokens, routingPolicy.maxTokensCap)
            : requestedMaxTokens;

          return client.chat.completions.create({
            model: request.model || config.defaultModel,
            messages: sanitizedMessages,
            temperature: request.temperature ?? 0.1,
            max_tokens: effectiveMaxTokens,
            response_format:
              request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
          });
        });

        const latencyMs = Date.now() - startTime;
        const content = response.choices[0]?.message?.content || '';

        console.log(
          `[MultiProvider:${correlationId}] ${config.displayName} succeeded in ${latencyMs}ms, ` +
            `${response.usage?.total_tokens || 0} tokens`
        );
        this.routingStats.providerSuccesses[provider] += 1;
        if (fallbackUsed) {
          this.routingStats.totalFallbacks += 1;
        }

        return {
          content,
          provider,
          model: response.model,
          tokensUsed: {
            prompt: response.usage?.prompt_tokens || 0,
            completion: response.usage?.completion_tokens || 0,
            total: response.usage?.total_tokens || 0,
          },
          latencyMs,
          fallbackUsed,
          routing: {
            workloadClass: routingPolicy.workloadClass,
            preferLowLatency: routingPolicy.preferLowLatency,
            maxCostPer1kTokens: routingPolicy.maxCostPer1kTokens,
            maxTokensCap: routingPolicy.maxTokensCap,
            providersTried,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        fallbackUsed = true;
        this.routingStats.providerFailures[provider] += 1;

        console.warn(
          `[MultiProvider:${correlationId}] ${config.displayName} failed: ${lastError.message}`
        );

        // Log failure
        await this.logProviderEvent('AGENT_EXECUTION_FAILED', provider, {
          error: lastError.message,
          correlationId,
        }).catch(() => {});

        // Continue to next provider
      }
    }

    if (fallbackUsed) {
      this.routingStats.totalFallbacks += 1;
    }

    // All providers failed
    throw new LLMProviderError(
      `All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
      'ALL_PROVIDERS_FAILED',
      lastError || undefined
    );
  }

  /**
   * Get list of providers to try based on request and availability
   */
  private getProvidersToTry(
    request: LLMRequest,
    routingPolicy?: ResolvedRoutingPolicy
  ): Exclude<LLMProvider, 'AUTO'>[] {
    const requestedProvider = request.provider;

    if (requestedProvider && requestedProvider !== 'AUTO') {
      // Specific provider requested - try only that one
      return this.clients.has(requestedProvider) ? [requestedProvider] : [];
    }

    // AUTO mode - rank providers using request policy + health + configured priority
    const availableProviders = this.providerPriority.filter(
      p => p !== 'AUTO' && this.clients.has(p)
    ) as Exclude<LLMProvider, 'AUTO'>[];

    const resolvedPolicy = routingPolicy || this.resolveRoutingPolicy(request);
    const ranked = this.rankProviders(availableProviders, resolvedPolicy);
    if (ranked.length > 0) {
      console.log(
        `[MultiProvider] Routed AUTO request (${resolvedPolicy.workloadClass}) to ` +
          `${ranked.join(' → ')}`
      );
    }
    return ranked;
  }

  /**
   * Rank providers using request-level policy (cost/latency) and breaker health.
   * Lower score is better.
   */
  private rankProviders(
    providers: Exclude<LLMProvider, 'AUTO'>[],
    policy: ResolvedRoutingPolicy
  ): Exclude<LLMProvider, 'AUTO'>[] {
    const { preferLowLatency, maxCostPer1kTokens } = policy;

    const scored = providers
      .map(provider => {
        const config = PROVIDER_CONFIGS[provider];
        const breaker = this.circuitBreakers.get(provider);
        const metrics = breaker?.getMetrics();
        const avgLatencyMs = metrics?.avgResponseTimeMs || 0;
        const isHealthy = breaker?.isAllowingRequests() ?? false;

        // Base score from configured priority position
        const priorityIndex = this.providerPriority.indexOf(provider);
        let score = priorityIndex < 0 ? 100 : priorityIndex * 10;

        // Encourage healthy providers and penalize unhealthy/open circuits
        score += isHealthy ? 0 : 500;

        // Optional hard cost cap - heavily penalize providers above budget
        if (typeof maxCostPer1kTokens === 'number' && config.costPer1kTokens > maxCostPer1kTokens) {
          score += 250;
        }

        // Latency vs cost preference weight
        if (preferLowLatency) {
          score += Math.min(avgLatencyMs / 100, 100);
          score += config.costPer1kTokens * 20;
        } else {
          score += config.costPer1kTokens * 200;
          score += Math.min(avgLatencyMs / 250, 100);
        }

        return { provider, score };
      })
      .sort((a, b) => a.score - b.score);

    return scored.map(item => item.provider);
  }

  /**
   * Resolve routing policy from request first, then environment defaults.
   */
  private resolveRoutingPolicy(request: LLMRequest): ResolvedRoutingPolicy {
    const envWorkload = process.env.LLM_ROUTING_DEFAULT_WORKLOAD_CLASS;
    const envMaxCostRaw = process.env.LLM_ROUTING_MAX_COST_PER_1K_TOKENS;
    const envPreferLowLatencyRaw = process.env.LLM_ROUTING_PREFER_LOW_LATENCY;
    const envInteractiveCapRaw = process.env.LLM_ROUTING_INTERACTIVE_MAX_TOKENS;
    const envBatchCapRaw = process.env.LLM_ROUTING_BATCH_MAX_TOKENS;

    const workloadClass =
      request.workloadClass ||
      (envWorkload === 'BATCH' || envWorkload === 'INTERACTIVE' ? envWorkload : 'INTERACTIVE');

    let maxCostPer1kTokens = request.maxCostPer1kTokens;
    if (typeof maxCostPer1kTokens !== 'number' && envMaxCostRaw) {
      const parsed = Number(envMaxCostRaw);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxCostPer1kTokens = parsed;
      }
    }

    let preferLowLatency = request.preferLowLatency;
    if (typeof preferLowLatency !== 'boolean' && envPreferLowLatencyRaw) {
      preferLowLatency = envPreferLowLatencyRaw.toLowerCase() === 'true';
    }
    if (typeof preferLowLatency !== 'boolean') {
      preferLowLatency = workloadClass !== 'BATCH';
    }

    const selectedCapRaw = workloadClass === 'BATCH' ? envBatchCapRaw : envInteractiveCapRaw;
    let maxTokensCap: number | undefined;
    if (selectedCapRaw) {
      const parsed = Number(selectedCapRaw);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxTokensCap = parsed;
      }
    }

    return {
      workloadClass,
      maxCostPer1kTokens,
      preferLowLatency,
      maxTokensCap,
    };
  }

  /**
   * Sanitize messages for prompt injection
   */
  private sanitizeMessages(
    messages: LLMRequest['messages'],
    correlationId: string
  ): LLMRequest['messages'] {
    return messages.map(msg => {
      if (msg.role === 'user') {
        const result = this.promptProtection.analyze(msg.content);

        if (result.detected.length > 0) {
          console.warn(
            `[MultiProvider:${correlationId}] Prompt injection patterns detected, ` +
              `risk score: ${result.riskScore}`
          );
        }

        if (result.blocked) {
          throw new LLMProviderError(
            'User input contains potentially malicious content',
            'PROMPT_INJECTION_BLOCKED'
          );
        }

        return { ...msg, content: result.sanitized };
      }
      return msg;
    });
  }

  /**
   * Log provider event to audit log
   */
  private async logProviderEvent(
    eventType: AuditEventType,
    provider: LLMProvider,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const auditLog = getTamperProofAuditLog(this.pool);
      await auditLog.log(eventType, `LLM Provider event: ${provider}`, {
        provider,
        ...details,
      });
    } catch (error) {
      console.error('Failed to log provider event:', error);
    }
  }

  // ==========================================================================
  // Health & Status
  // ==========================================================================

  /**
   * Get health status of all providers
   */
  getProviderHealth(): ProviderHealth[] {
    const health: ProviderHealth[] = [];

    for (const [provider, breaker] of this.circuitBreakers) {
      const metrics = breaker.getMetrics();

      health.push({
        provider,
        available: this.clients.has(provider),
        circuitState: metrics.state,
        lastSuccessTime: metrics.lastSuccessTime || undefined,
        lastFailureTime: metrics.lastFailureTime || undefined,
        avgLatencyMs: metrics.avgResponseTimeMs,
      });
    }

    return health;
  }

  /**
   * Get aggregate routing stats for observability.
   */
  getRoutingStats(): RoutingStats {
    const fallbackRatePct =
      this.routingStats.totalRequests > 0
        ? Number(
            ((this.routingStats.totalFallbacks / this.routingStats.totalRequests) * 100).toFixed(2)
          )
        : 0;

    return {
      totalRequests: this.routingStats.totalRequests,
      totalFallbacks: this.routingStats.totalFallbacks,
      fallbackRatePct,
      providerSuccesses: { ...this.routingStats.providerSuccesses },
      providerFailures: { ...this.routingStats.providerFailures },
    };
  }

  /**
   * Reset routing stats counters (useful for periodic reporting windows).
   */
  resetRoutingStats(): void {
    this.routingStats = {
      totalRequests: 0,
      totalFallbacks: 0,
      providerSuccesses: { OPENAI: 0, KIMI: 0 },
      providerFailures: { OPENAI: 0, KIMI: 0 },
      fallbackRatePct: 0,
    };
  }

  /**
   * Check if any provider is available
   */
  isAvailable(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Get the currently preferred (healthiest) provider
   */
  getPreferredProvider(): LLMProvider | null {
    for (const provider of this.providerPriority) {
      if (provider === 'AUTO') continue;

      const breaker = this.circuitBreakers.get(provider);
      if (breaker?.isAllowingRequests()) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Force a specific provider's circuit breaker to reset
   */
  resetProviderCircuit(provider: Exclude<LLMProvider, 'AUTO'>): void {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      breaker.forceClose('Manual reset');
    }
  }

  /**
   * Set provider priority order
   */
  setProviderPriority(priority: LLMProvider[]): void {
    this.providerPriority = priority.filter(p => p !== 'AUTO');
    console.log(`[MultiProvider] Provider priority updated: ${this.providerPriority.join(' → ')}`);
  }
}

// =============================================================================
// Error Classes
// =============================================================================

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_PROVIDERS'
      | 'ALL_PROVIDERS_FAILED'
      | 'PROVIDER_UNAVAILABLE'
      | 'PROMPT_INJECTION_BLOCKED'
      | 'TIMEOUT',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

// =============================================================================
// Global Instance
// =============================================================================

let multiProviderInstance: MultiProviderLLMService | null = null;

export function getMultiProviderLLM(pool: Pool): MultiProviderLLMService {
  if (!multiProviderInstance) {
    multiProviderInstance = new MultiProviderLLMService(pool);
  }
  return multiProviderInstance;
}

export function resetMultiProviderLLM(): void {
  multiProviderInstance = null;
}
