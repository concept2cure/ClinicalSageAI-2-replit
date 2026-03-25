/**
 * AI Gateway — Core Implementation
 *
 * Centralizes ALL LLM calls behind a single interface with:
 * - Multi-provider support (OpenAI, Claude, Kimi)
 * - Task-based routing
 * - Automatic fallback on failure
 * - Provider health tracking
 * - Audit logging
 * - Policy enforcement
 * - Deterministic mode for testing
 */

import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayConfig,
  GatewayMessage,
  ProviderName,
  TaskType,
  RoutingStrategy,
  ModelConfig,
  ProviderHealth,
  GatewayUsage,
  ClaudeEnhancedResponse,
  ClaudeToolUse,
  StreamCallback,
  ContentBlock,
} from './types';
import { GatewayAuditLogger } from './audit';
import { GatewayPolicyEngine } from './policy';

// ─────────────────────────────────────────────────────────────────────────────
// Default Model Registry
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    contextWindow: 128000,
    qualityScore: 95,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    capabilities: [
      'chat',
      'document_analysis',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    // Platform uses Anthropic Claude exclusively — OpenAI disabled
    enabled: false,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    contextWindow: 128000,
    qualityScore: 82,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    capabilities: ['chat', 'general', 'summarization'],
    // Platform uses Anthropic Claude exclusively — OpenAI disabled
    enabled: false,
  },
  {
    id: 'claude-opus-4',
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    contextWindow: 200000,
    qualityScore: 99,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    id: 'claude-sonnet-4',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    contextWindow: 200000,
    qualityScore: 97,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: [
      'chat',
      'document_analysis',
      'document_drafting',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  {
    id: 'claude-haiku-4',
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    contextWindow: 200000,
    qualityScore: 85,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.004,
    capabilities: ['chat', 'general', 'summarization', 'structured_output'],
    enabled: true,
  },
  {
    id: 'moonshot-v1-128k',
    provider: 'moonshot',
    model: 'moonshot-v1-128k',
    contextWindow: 128000,
    qualityScore: 85,
    costPer1kInput: 0.0008,
    costPer1kOutput: 0.0008,
    capabilities: ['chat', 'document_analysis', 'general'],
    // Disabled — platform uses Anthropic Claude exclusively
    enabled: false, // Enable via KIMI_API_KEY or MOONSHOT_API_KEY
  },
  {
    id: 'moonshot-v1-32k',
    provider: 'moonshot',
    model: 'moonshot-v1-32k',
    contextWindow: 32000,
    qualityScore: 83,
    costPer1kInput: 0.0004,
    costPer1kOutput: 0.0004,
    capabilities: ['chat', 'general'],
    enabled: false,
  },
];

// Task → preferred provider order
// Platform uses Anthropic Claude exclusively for all tasks
const TASK_PROVIDER_PREFERENCES: Record<TaskType, ProviderName[]> = {
  chat: ['anthropic'],
  document_analysis: ['anthropic'],
  document_drafting: ['anthropic'],
  structured_output: ['anthropic'],
  regulatory_review: ['anthropic'],
  code_generation: ['anthropic'],
  summarization: ['anthropic'],
  embedding: ['anthropic'],
  general: ['anthropic'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Mode Responses
// ─────────────────────────────────────────────────────────────────────────────

const DETERMINISTIC_RESPONSES: Record<TaskType, string> = {
  chat:
    '## AnA Response (Demo Mode)\n\n' +
    'I\'m AnA — your Audit & Narrative Assistant. I\'m currently running in **demo mode** because no AI provider API key is configured.\n\n' +
    'When connected to Claude, I can:\n' +
    '- **[KNOWN]** Analyze your regulatory documents against ICH, FDA, and EMA requirements\n' +
    '- **[KNOWN]** Detect contradictions, assumption drift, and cross-section inconsistencies\n' +
    '- **[KNOWN]** Guide you through governed promotion (draft → review → approved → locked → submission-ready)\n' +
    '- **[INFERRED]** Suggest corrections based on body-specific expectations\n\n' +
    'To enable live AI responses, set `ANTHROPIC_API_KEY` in your `.env` file.\n\n' +
    '*Evidence discipline: Every claim is tagged [KNOWN], [INFERRED], or [MISSING].*',
  document_analysis:
    '## Document Analysis (Demo Mode)\n\n' +
    '**[KNOWN]** The document structure follows eCTD Module format.\n\n' +
    '**Findings:**\n' +
    '- **[KNOWN]** Section headers present and correctly numbered\n' +
    '- **[INFERRED]** Content completeness appears adequate for initial review\n' +
    '- **[MISSING]** Cross-references to supporting data not verified (requires live AI)\n\n' +
    '**Recommendation:** Enable live AI mode for full regulatory analysis with body-specific gap detection.',
  document_drafting:
    '## Document Draft (Demo Mode)\n\n' +
    '**[KNOWN]** This is a placeholder draft generated in demo mode.\n\n' +
    'When connected to Claude, AnA generates regulatory-grade document drafts with:\n' +
    '- Body-specific language (FDA/EMA/PMDA)\n' +
    '- Evidence-backed claims with citation tracking\n' +
    '- Governed content that flows through the approval pipeline\n\n' +
    'Set `ANTHROPIC_API_KEY` in `.env` to enable real document drafting.',
  structured_output: '{"result": "demo_mode", "status": "success", "message": "Deterministic mode active. Set ANTHROPIC_API_KEY to enable live AI.", "data": {}}',
  regulatory_review:
    '## Regulatory Review (Demo Mode)\n\n' +
    '**[KNOWN]** AnA is operating in demo mode — no live AI analysis performed.\n\n' +
    '**When connected, AnA provides:**\n' +
    '- **Compliance check** against 21 CFR Part 11, ICH E6(R2), EU MDR, ISO 14155\n' +
    '- **Gap detection** with body-specific expectations (FDA, EMA, PMDA, MHRA)\n' +
    '- **Risk ranking** with severity classification (critical → major → minor)\n' +
    '- **Correction drafts** with governed execution paths\n' +
    '- **Contradiction detection** with overlay-aware authority escalation\n\n' +
    '**[MISSING]** Live regulatory analysis requires `ANTHROPIC_API_KEY` in `.env`.',
  code_generation:
    '// Demo mode — set ANTHROPIC_API_KEY for live code generation\nfunction demoMode() {\n  return { status: "demo", message: "AI provider not configured" };\n}',
  summarization:
    '**Summary (Demo Mode):** [KNOWN] This content relates to regulatory submissions. ' +
    '[INFERRED] The document appears to follow standard eCTD formatting. ' +
    '[MISSING] Detailed analysis requires live AI — set ANTHROPIC_API_KEY in .env.',
  embedding: '[]',
  general:
    '**AnA (Demo Mode):** I\'m running without an AI provider. ' +
    'Set `ANTHROPIC_API_KEY` in your `.env` file to enable full regulatory intelligence. ' +
    'All governance features (promotion, contradictions, readiness) work independently of the AI provider.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Class
// ─────────────────────────────────────────────────────────────────────────────

export class AIGateway {
  private config: GatewayConfig;
  private models: ModelConfig[];
  private providerHealth: Map<ProviderName, ProviderHealth>;
  private auditLogger: GatewayAuditLogger;
  private policyEngine: GatewayPolicyEngine;

  // Provider SDK instances (lazy-initialized)
  private openaiClient: any = null;
  private anthropicClient: any = null;
  private moonshotClient: any = null;

  private roundRobinIndex = 0;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = this.buildConfig(config);
    this.models = this.buildModelRegistry();
    this.providerHealth = new Map();
    this.auditLogger = new GatewayAuditLogger(this.config.dbPool);
    this.policyEngine = new GatewayPolicyEngine(this.config.policy);

    this.initProviderHealth();
    this.initProviderClients();

    console.log(
      `[AI Gateway] Initialized — providers: ${this.getEnabledProviders().join(', ')}, strategy: ${this.config.defaultStrategy}, deterministic: ${this.config.deterministicMode}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Route an AI request through the gateway.
   * This is the ONLY method external code should call.
   */
  async route(request: GatewayRequest): Promise<GatewayResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const strategy = request.strategy || this.config.defaultStrategy;

    // Policy check
    const policyResult = this.policyEngine.evaluate(request);
    if (!policyResult.allowed) {
      throw new GatewayPolicyError(policyResult.reason || 'Request blocked by policy');
    }

    // Deterministic mode
    if (this.config.deterministicMode) {
      return this.buildDeterministicResponse(request, requestId, startTime);
    }

    // Select model — fall back to deterministic if no providers available
    const selectedModel = this.selectModel(request, strategy);
    if (!selectedModel) {
      console.warn('[AI Gateway] No providers available — falling back to demo mode. Set ANTHROPIC_API_KEY in .env to enable live AI.');
      return this.buildDeterministicResponse(request, requestId, startTime);
    }

    // Execute with fallback
    let lastError: Error | null = null;
    const triedProviders: ProviderName[] = [];

    // Try primary model
    try {
      const response = await this.executeProvider(selectedModel, request, requestId, startTime);
      this.recordSuccess(selectedModel.provider, response.latencyMs);
      await this.logAudit(request, response, strategy, true);
      return response;
    } catch (error: any) {
      lastError = error;
      triedProviders.push(selectedModel.provider);
      this.recordFailure(selectedModel.provider, error);
      console.warn(
        `[AI Gateway] ${selectedModel.provider}/${selectedModel.model} failed: ${error.message}`
      );
    }

    // Try fallback providers
    const fallbacks = this.getFallbackModels(request.taskType, triedProviders);
    for (const fallback of fallbacks) {
      try {
        console.log(`[AI Gateway] Falling back to ${fallback.provider}/${fallback.model}`);
        const response = await this.executeProvider(fallback, request, requestId, startTime);
        this.recordSuccess(fallback.provider, response.latencyMs);
        await this.logAudit(request, response, strategy, true);
        return response;
      } catch (error: any) {
        lastError = error;
        triedProviders.push(fallback.provider);
        this.recordFailure(fallback.provider, error);
        console.warn(
          `[AI Gateway] Fallback ${fallback.provider}/${fallback.model} failed: ${error.message}`
        );
      }
    }

    // All providers failed — log and throw
    const errorResponse: GatewayResponse = {
      content: '',
      provider: selectedModel.provider,
      model: selectedModel.model,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: 'error',
    };
    await this.logAudit(request, errorResponse, strategy, false, lastError?.message);

    throw new GatewayAllProvidersFailedError(
      `All providers failed. Tried: ${triedProviders.join(', ')}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Simple completion helper — wraps a single user message.
   */
  async complete(prompt: string, options?: Partial<GatewayRequest>): Promise<string> {
    const response = await this.route({
      taskType: options?.taskType || 'general',
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
    return response.content;
  }

  /**
   * Chat completion helper — wraps system + user messages.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: Partial<GatewayRequest>
  ): Promise<GatewayResponse> {
    return this.route({
      taskType: 'chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      ...options,
    });
  }

  /**
   * Structured output helper — wraps call with JSON mode.
   */
  async structuredOutput<T = unknown>(
    prompt: string,
    schema?: Record<string, unknown>,
    options?: Partial<GatewayRequest>
  ): Promise<T> {
    const response = await this.route({
      taskType: 'structured_output',
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      jsonSchema: schema,
      temperature: 0.1,
      ...options,
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new Error(
        `AI Gateway: Failed to parse structured output as JSON: ${response.content.slice(0, 200)}`
      );
    }
  }

  /**
   * Get health status of all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Get enabled providers.
   */
  getEnabledProviders(): ProviderName[] {
    return this.config.providers.filter(p => p.enabled).map(p => p.name);
  }

  /**
   * Check if gateway is in deterministic mode.
   */
  isDeterministic(): boolean {
    return this.config.deterministicMode;
  }

  /**
   * Toggle deterministic mode at runtime.
   */
  setDeterministicMode(enabled: boolean): void {
    this.config.deterministicMode = enabled;
    console.log(`[AI Gateway] Deterministic mode: ${enabled}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider Execution
  // ─────────────────────────────────────────────────────────────────────────

  private async executeProvider(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    switch (modelConfig.provider) {
      case 'openai':
        return this.executeOpenAI(modelConfig, request, requestId, startTime);
      case 'anthropic':
        return this.executeAnthropic(modelConfig, request, requestId, startTime);
      case 'moonshot':
        return this.executeMoonshot(modelConfig, request, requestId, startTime);
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
  }

  private async executeOpenAI(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized (missing OPENAI_API_KEY)');
    }

    const params: any = {
      model: modelConfig.model,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
    };

    if (request.jsonMode) {
      if (request.jsonSchema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: request.jsonSchema,
          },
        };
      } else {
        params.response_format = { type: 'json_object' };
      }
    }

    const completion = await Promise.race([
      this.openaiClient.chat.completions.create(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API call timed out after 120s')), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure('openai', error);
      }
      throw error;
    });
    const choice = completion.choices?.[0];

    return {
      content: choice?.message?.content || '',
      provider: 'openai',
      model: modelConfig.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCostUsd: this.estimateCost(
          modelConfig,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  private async executeAnthropic(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<ClaudeEnhancedResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized (missing ANTHROPIC_API_KEY)');
    }

    // If streaming requested, delegate to streaming method
    if (request.stream && request.onStream) {
      return this.executeAnthropicStream(modelConfig, request, requestId, startTime);
    }

    // Convert messages — Anthropic needs system separate
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    // Build messages with multi-modal support (vision)
    const messages = nonSystemMessages.map(m => {
      // If message has contentBlocks (images + text), use structured content
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        return {
          role: m.role,
          content: m.contentBlocks.map(block => {
            if (block.type === 'image') {
              return {
                type: 'image' as const,
                source: block.source,
              };
            }
            return { type: 'text' as const, text: block.text };
          }),
        };
      }
      // Also handle request-level imageContent (convenience API)
      if (m.role === 'user' && request.imageContent && request.imageContent.length > 0) {
        const content: any[] = request.imageContent.map(img => ({
          type: 'image' as const,
          source: img.source,
        }));
        content.push({ type: 'text' as const, text: m.content });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });

    const params: any = {
      model: modelConfig.model,
      max_tokens: request.maxTokens || 4096,
      messages,
    };

    // System prompt with optional prompt caching
    if (systemMessages.length > 0) {
      if (request.promptCache?.enabled) {
        // Use structured system blocks with cache_control
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...(i === systemMessages.length - 1
            ? { cache_control: { type: request.promptCache!.type } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    // Extended thinking — requires temperature unset or 1
    if (request.thinking?.enabled) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: request.thinking.budgetTokens || 10000,
      };
      // Extended thinking requires temperature=1 and no top_p/top_k
      params.temperature = 1;
    } else {
      params.temperature = request.temperature ?? 0.7;
    }

    // Tool use
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      if (request.toolChoice) {
        params.tool_choice =
          typeof request.toolChoice === 'string'
            ? { type: request.toolChoice }
            : request.toolChoice;
      }
    }

    const response = await Promise.race([
      this.anthropicClient.messages.create(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Anthropic API call timed out after 120s')), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure('anthropic', error);
      }
      throw error;
    });

    // Extract text, thinking, and tool use blocks
    let content = '';
    let thinking = '';
    const toolUses: ClaudeToolUse[] = [];

    for (const block of response.content || []) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'thinking') {
        thinking += (block as any).thinking || '';
      } else if (block.type === 'tool_use') {
        toolUses.push({
          id: (block as any).id,
          name: (block as any).name,
          input: (block as any).input,
        });
      }
    }

    // Calculate cache stats if prompt caching was used
    const cacheStats =
      response.usage?.cache_creation_input_tokens !== undefined
        ? {
            cacheCreationInputTokens: response.usage.cache_creation_input_tokens || 0,
            cacheReadInputTokens: response.usage.cache_read_input_tokens || 0,
          }
        : undefined;

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: 'anthropic',
      model: modelConfig.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelConfig, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      cacheHit: cacheStats ? cacheStats.cacheReadInputTokens > 0 : undefined,
      cacheStats,
      deterministic: false,
      finishReason: response.stop_reason || 'unknown',
    };
  }

  /**
   * Streaming execution for Anthropic/Claude — delivers tokens in real-time via callback.
   */
  private async executeAnthropicStream(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<ClaudeEnhancedResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized (missing ANTHROPIC_API_KEY)');
    }

    const onStream = request.onStream!;
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const messages = nonSystemMessages.map(m => {
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        return {
          role: m.role,
          content: m.contentBlocks.map(block =>
            block.type === 'image'
              ? { type: 'image' as const, source: block.source }
              : { type: 'text' as const, text: block.text }
          ),
        };
      }
      return { role: m.role, content: m.content };
    });

    const params: any = {
      model: modelConfig.model,
      max_tokens: request.maxTokens || 4096,
      messages,
      stream: true,
    };

    if (systemMessages.length > 0) {
      if (request.promptCache?.enabled) {
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...(i === systemMessages.length - 1
            ? { cache_control: { type: request.promptCache!.type } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    if (request.thinking?.enabled) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: request.thinking.budgetTokens || 10000,
      };
      params.temperature = 1;
    } else {
      params.temperature = request.temperature ?? 0.7;
    }

    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools;
      if (request.toolChoice) {
        params.tool_choice =
          typeof request.toolChoice === 'string'
            ? { type: request.toolChoice }
            : request.toolChoice;
      }
    }

    // Use the Anthropic SDK streaming API
    const stream = await this.anthropicClient.messages.create(params);

    let content = '';
    let thinking = '';
    const toolUses: ClaudeToolUse[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'unknown';

    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          content += event.delta.text;
          onStream(event.delta.text, { type: 'text' });
        } else if (event.delta?.type === 'thinking_delta') {
          thinking += event.delta.thinking;
          onStream('', { type: 'thinking', thinkingContent: event.delta.thinking });
        } else if (event.delta?.type === 'input_json_delta') {
          // Tool input streaming — accumulate
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block?.type === 'tool_use') {
          toolUses.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          });
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason || stopReason;
        outputTokens = event.usage?.output_tokens || outputTokens;
      } else if (event.type === 'message_start') {
        inputTokens = event.message?.usage?.input_tokens || 0;
      }
    }

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: 'anthropic',
      model: modelConfig.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelConfig, inputTokens, outputTokens),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: stopReason,
    };
  }

  private async executeMoonshot(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    if (!this.moonshotClient) {
      throw new Error('Moonshot client not initialized (missing KIMI_API_KEY or MOONSHOT_API_KEY)');
    }

    const params: any = {
      model: modelConfig.model,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
    };

    if (request.jsonMode) {
      params.response_format = { type: 'json_object' };
    }

    const completion = await Promise.race([
      this.moonshotClient.chat.completions.create(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Moonshot API call timed out after 120s')), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure('moonshot', error);
      }
      throw error;
    });
    const choice = completion.choices?.[0];

    return {
      content: choice?.message?.content || '',
      provider: 'moonshot',
      model: modelConfig.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        estimatedCostUsd: this.estimateCost(
          modelConfig,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        ),
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: false,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Model Selection & Routing
  // ─────────────────────────────────────────────────────────────────────────

  private selectModel(request: GatewayRequest, strategy: RoutingStrategy): ModelConfig | null {
    // Explicit provider/model override
    if (request.provider || request.model) {
      const explicit = this.models.find(
        m =>
          m.enabled &&
          (!request.provider || m.provider === request.provider) &&
          (!request.model || m.model === request.model || m.id === request.model)
      );
      if (explicit && this.isProviderHealthy(explicit.provider)) return explicit;
      // Even if unhealthy, honor explicit if it's the only option
      if (explicit) return explicit;
    }

    const eligible = this.models.filter(
      m =>
        m.enabled && m.capabilities.includes(request.taskType) && this.isProviderHealthy(m.provider)
    );

    if (eligible.length === 0) {
      // Relax health check
      const relaxed = this.models.filter(
        m => m.enabled && m.capabilities.includes(request.taskType)
      );
      return relaxed[0] || null;
    }

    switch (strategy) {
      case 'quality_optimized':
        return eligible.sort((a, b) => b.qualityScore - a.qualityScore)[0];

      case 'cost_optimized':
        return eligible.sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0];

      case 'latency_optimized': {
        // Sort by provider avg latency
        return eligible.sort((a, b) => {
          const latA = this.providerHealth.get(a.provider)?.avgLatencyMs || 0;
          const latB = this.providerHealth.get(b.provider)?.avgLatencyMs || 0;
          return latA - latB;
        })[0];
      }

      case 'round_robin': {
        const idx = this.roundRobinIndex % eligible.length;
        this.roundRobinIndex++;
        return eligible[idx];
      }

      case 'task_based':
      default: {
        // Use task preference order
        const preferred = TASK_PROVIDER_PREFERENCES[request.taskType] || [
          'openai',
          'anthropic',
          'moonshot',
        ];
        for (const providerName of preferred) {
          const model = eligible.find(m => m.provider === providerName);
          if (model) return model;
        }
        return eligible[0];
      }
    }
  }

  private getFallbackModels(taskType: TaskType, triedProviders: ProviderName[]): ModelConfig[] {
    return this.models
      .filter(
        m => m.enabled && m.capabilities.includes(taskType) && !triedProviders.includes(m.provider)
      )
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deterministic Mode
  // ─────────────────────────────────────────────────────────────────────────

  private buildDeterministicResponse(
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): GatewayResponse {
    const content = DETERMINISTIC_RESPONSES[request.taskType] || DETERMINISTIC_RESPONSES.general;
    return {
      content,
      provider: 'anthropic',
      model: 'demo-mode',
      usage: {
        inputTokens: 0,
        outputTokens: content.split(' ').length,
        totalTokens: content.split(' ').length,
        estimatedCostUsd: 0,
      },
      latencyMs: Date.now() - startTime,
      requestId,
      cached: false,
      deterministic: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider Health
  // ─────────────────────────────────────────────────────────────────────────

  private initProviderHealth(): void {
    for (const provider of this.config.providers) {
      if (provider.enabled) {
        this.providerHealth.set(provider.name, {
          provider: provider.name,
          healthy: true,
          consecutiveFailures: 0,
          avgLatencyMs: 0,
          requestCount: 0,
          errorRate: 0,
        });
      }
    }
  }

  private isProviderHealthy(provider: ProviderName): boolean {
    const health = this.providerHealth.get(provider);
    if (!health) return false;
    return health.healthy;
  }

  private recordSuccess(provider: ProviderName, latencyMs: number): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    health.requestCount++;
    health.healthy = true;

    // Exponential moving average for latency
    health.avgLatencyMs =
      health.avgLatencyMs === 0 ? latencyMs : health.avgLatencyMs * 0.8 + latencyMs * 0.2;

    health.errorRate = Math.max(0, health.errorRate * 0.95);
  }

  private recordFailure(provider: ProviderName, error: Error): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures++;
    health.lastFailure = new Date();
    health.requestCount++;
    health.errorRate = Math.min(1, health.errorRate + 0.1);

    // Mark unhealthy after 3 consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.healthy = false;
      // Exponential backoff: 60s, 120s, 240s, max 5min
      const backoffRound = Math.floor(health.consecutiveFailures / 3) - 1;
      const backoffMs = Math.min(300_000, 60_000 * Math.pow(2, backoffRound));
      console.warn(
        `[AI Gateway] Provider ${provider} marked unhealthy after ${health.consecutiveFailures} failures — recovery in ${backoffMs / 1000}s`
      );

      setTimeout(() => {
        // Only recover if no new successes have already reset it
        if (!health.healthy) {
          health.healthy = true;
          health.consecutiveFailures = 0;
          console.log(
            `[AI Gateway] Provider ${provider} auto-recovered after ${backoffMs / 1000}s backoff`
          );
        }
      }, backoffMs);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cost Estimation
  // ─────────────────────────────────────────────────────────────────────────

  private estimateCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audit Logging
  // ─────────────────────────────────────────────────────────────────────────

  private async logAudit(
    request: GatewayRequest,
    response: GatewayResponse,
    strategy: RoutingStrategy,
    success: boolean,
    error?: string
  ): Promise<void> {
    if (!this.config.auditEnabled) return;

    try {
      await this.auditLogger.log({
        requestId: response.requestId,
        timestamp: new Date(),
        provider: response.provider,
        model: response.model,
        taskType: request.taskType,
        strategy,
        organizationId: request.organizationId,
        userId: request.userId,
        projectId: request.projectId,
        callerModule: request.callerModule,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
        latencyMs: response.latencyMs,
        success,
        error,
        cached: response.cached,
        deterministic: response.deterministic,
        metadata: request.metadata,
      });
    } catch (auditError: any) {
      console.error(`[AI Gateway] Audit log failed: ${auditError.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  private buildConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const moonshotKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;

    return {
      deterministicMode:
        process.env.AI_GATEWAY_DETERMINISTIC === 'true' ||
        process.env.DETERMINISTIC_MODE === 'true' ||
        false,
      defaultStrategy: (process.env.AI_GATEWAY_STRATEGY as RoutingStrategy) || 'task_based',
      providers: [
        {
          name: 'openai',
          enabled: !!openaiKey,
          apiKey: openaiKey,
          defaultModel: 'gpt-4o',
          models: [],
        },
        {
          name: 'anthropic',
          enabled: !!anthropicKey,
          apiKey: anthropicKey,
          defaultModel: 'claude-sonnet-4-20250514',
          models: [],
        },
        {
          name: 'moonshot',
          enabled: !!moonshotKey,
          apiKey: moonshotKey,
          baseUrl: 'https://api.moonshot.cn/v1',
          defaultModel: 'moonshot-v1-32k',
          models: [],
        },
      ],
      policy: {
        maxTokensPerRequest: 16000,
        maxRequestsPerMinutePerOrg: 100,
        maxRequestsPerMinutePerUser: 30,
        blockedPatterns: [],
        contentFilters: true,
        piiDetection: true,
      },
      auditEnabled: true,
      ...overrides,
    };
  }

  private buildModelRegistry(): ModelConfig[] {
    const enabledProviders = new Set(this.config.providers.filter(p => p.enabled).map(p => p.name));

    return DEFAULT_MODELS.map(m => ({
      ...m,
      enabled: m.enabled && enabledProviders.has(m.provider),
    }));
  }

  private initProviderClients(): void {
    // OpenAI
    const openaiConfig = this.config.providers.find(p => p.name === 'openai');
    if (openaiConfig?.enabled && openaiConfig.apiKey) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiConfig.apiKey });
        console.log('  ✅ OpenAI provider ready');
      } catch (e: any) {
        console.warn(`  ⚠️ OpenAI provider init failed: ${e.message}`);
      }
    }

    // Anthropic
    const anthropicConfig = this.config.providers.find(p => p.name === 'anthropic');
    if (anthropicConfig?.enabled && anthropicConfig.apiKey) {
      try {
        this.anthropicClient = new Anthropic({ apiKey: anthropicConfig.apiKey });
        console.log('  ✅ Anthropic provider ready');
      } catch (e: any) {
        console.warn(`  ⚠️ Anthropic provider init failed: ${e.message}`);
      }
    }

    // Moonshot (OpenAI-compatible)
    const moonshotConfig = this.config.providers.find(p => p.name === 'moonshot');
    if (moonshotConfig?.enabled && moonshotConfig.apiKey) {
      try {
        this.moonshotClient = new OpenAI({
          apiKey: moonshotConfig.apiKey,
          baseURL: moonshotConfig.baseUrl || 'https://api.moonshot.cn/v1',
        });
        console.log('  ✅ Moonshot/Kimi provider ready');
      } catch (e: any) {
        console.warn(`  ⚠️ Moonshot provider init failed: ${e.message}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export class GatewayPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayPolicyError';
  }
}

export class GatewayNoProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayNoProviderError';
  }
}

export class GatewayAllProvidersFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayAllProvidersFailedError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let gatewayInstance: AIGateway | null = null;

/**
 * Get (or create) the singleton AI Gateway instance.
 */
export function getGateway(config?: Partial<GatewayConfig>): AIGateway {
  if (!gatewayInstance) {
    gatewayInstance = new AIGateway(config);
  }
  return gatewayInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetGateway(): void {
  gatewayInstance = null;
}
