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
}

export interface ProviderHealth {
  provider: LLMProvider;
  available: boolean;
  circuitState: string;
  lastSuccessTime?: Date;
  lastFailureTime?: Date;
  avgLatencyMs: number;
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
      embedding: 'text-embedding-3-small'
    },
    maxTokens: 4096,
    costPer1kTokens: 0.01 // Approximate
  },
  KIMI: {
    name: 'KIMI',
    displayName: 'Kimi AI (Moonshot)',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    apiKeyEnvVar: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-32k',
    models: {
      chat: 'moonshot-v1-32k',
      embedding: 'text-embedding-3-small'
    },
    maxTokens: 32000,
    costPer1kTokens: 0.008 // Approximate, Kimi is often cheaper
  }
};

// =============================================================================
// Multi-Provider LLM Service
// =============================================================================

export class MultiProviderLLMService {
  private clients: Map<LLMProvider, OpenAI> = new Map();
  private circuitBreakers: Map<LLMProvider, CircuitBreaker> = new Map();
  private promptProtection = getPromptInjectionProtection();
  private pool: Pool;
  
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
          maxRetries: 2
        };
        
        if (config.baseURL) {
          clientConfig.baseURL = config.baseURL;
        }
        
        this.clients.set(provider, new OpenAI(clientConfig));
        
        // Create circuit breaker for this provider
        this.circuitBreakers.set(provider, new CircuitBreaker({
          name: config.displayName,
          failureThreshold: 5,
          resetTimeoutMs: 30000,
          successThreshold: 2,
          requestTimeoutMs: 120000,
          onStateChange: (from, to, reason) => {
            console.log(`[${config.displayName}] Circuit breaker: ${from} → ${to} (${reason})`);
            
            // Log to audit
            this.logProviderEvent('CIRCUIT_BREAKER_OPENED', provider, { from, to, reason })
              .catch(err => console.error('Failed to log circuit breaker event:', err));
          }
        }));
        
        console.log(`[MultiProvider] ${config.displayName} initialized`);
      } else {
        console.warn(`[MultiProvider] ${config.displayName} not available (${config.apiKeyEnvVar} not set)`);
      }
    }
    
    const availableCount = this.clients.size;
    if (availableCount === 0) {
      console.error('[MultiProvider] WARNING: No LLM providers available!');
    } else {
      console.log(`[MultiProvider] ${availableCount} provider(s) available: ${Array.from(this.clients.keys()).join(', ')}`);
    }
  }

  /**
   * Execute a chat completion with automatic failover
   */
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const correlationId = `llm-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    
    // Determine which providers to try
    const providersToTry = this.getProvidersToTry(request.provider);
    
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

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i];
      const client = this.clients.get(provider);
      const breaker = this.circuitBreakers.get(provider);
      const config = PROVIDER_CONFIGS[provider];
      
      if (!client || !breaker) continue;
      
      // Check if circuit breaker allows requests
      if (!breaker.isAllowingRequests()) {
        console.log(`[MultiProvider:${correlationId}] ${config.displayName} circuit is open, skipping`);
        fallbackUsed = true;
        continue;
      }

      try {
        console.log(`[MultiProvider:${correlationId}] Trying ${config.displayName}...`);
        
        const response = await breaker.execute(async () => {
          return client.chat.completions.create({
            model: request.model || config.defaultModel,
            messages: sanitizedMessages,
            temperature: request.temperature ?? 0.1,
            max_tokens: request.maxTokens || config.maxTokens,
            response_format: request.responseFormat === 'json' 
              ? { type: 'json_object' } 
              : undefined
          });
        });

        const latencyMs = Date.now() - startTime;
        const content = response.choices[0]?.message?.content || '';
        
        console.log(
          `[MultiProvider:${correlationId}] ${config.displayName} succeeded in ${latencyMs}ms, ` +
          `${response.usage?.total_tokens || 0} tokens`
        );

        return {
          content,
          provider,
          model: response.model,
          tokensUsed: {
            prompt: response.usage?.prompt_tokens || 0,
            completion: response.usage?.completion_tokens || 0,
            total: response.usage?.total_tokens || 0
          },
          latencyMs,
          fallbackUsed
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        fallbackUsed = true;
        
        console.warn(
          `[MultiProvider:${correlationId}] ${config.displayName} failed: ${lastError.message}`
        );
        
        // Log failure
        await this.logProviderEvent('AGENT_EXECUTION_FAILED', provider, {
          error: lastError.message,
          correlationId
        }).catch(() => {});
        
        // Continue to next provider
      }
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
  private getProvidersToTry(requestedProvider?: LLMProvider): Exclude<LLMProvider, 'AUTO'>[] {
    if (requestedProvider && requestedProvider !== 'AUTO') {
      // Specific provider requested - try only that one
      return this.clients.has(requestedProvider) ? [requestedProvider] : [];
    }
    
    // AUTO mode - try providers in priority order
    return this.providerPriority.filter(p => 
      p !== 'AUTO' && this.clients.has(p)
    ) as Exclude<LLMProvider, 'AUTO'>[];
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
        ...details
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
        avgLatencyMs: metrics.avgResponseTimeMs
      });
    }
    
    return health;
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
