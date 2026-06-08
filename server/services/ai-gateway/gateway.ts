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

import { randomUUID, createHash } from 'crypto';
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
  AnaGatewayResponse,
  AnaToolUse,
  StreamCallback,
  ContentBlock,
} from './types';
import { GatewayAuditLogger } from './audit';
import { GatewayPolicyEngine } from './policy';
import { CLOUD_MODELS } from './providers/cloud-models';
import {
  createBedrockClient,
  createVertexClient,
  createAzureClient,
  createLocalClient,
} from './providers/clients';
import {
  resolvePlacement,
  isPlacementCompliant,
} from './providers/placement';
import {
  getOrgPlacementResolver,
  mergeOrgPolicyDefaults,
} from './providers/org-placement';
import { createScopedLogger } from '../../utils/logger.js';
const log = createScopedLogger('ai-gateway');

// ─────────────────────────────────────────────────────────────────────────────
// Default Model Registry
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODELS: ModelConfig[] = [
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
    // Enabled at registry level — buildModelRegistry() gates on API key presence
    enabled: true,
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
    // Enabled at registry level — buildModelRegistry() gates on API key presence
    enabled: true,
  },
  {
    // Internal id kept stable for alias continuity; the `model` field is the
    // actual ID sent to Anthropic and tracks the current flagship release.
    id: 'claude-opus-4',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
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
    // Opus 4 legacy — dated snapshot from May 2025. Kept enabled as an
    // intra-provider fallback if 4.7 is not yet GA for the tenant's tier
    // or is temporarily unavailable (rate limit, overloaded). Same
    // capabilities as 4.7, marginally lower quality score so the
    // fallback chain prefers 4.7 when both are reachable.
    id: 'claude-opus-4-legacy',
    provider: 'anthropic',
    model: 'claude-opus-4-20250514',
    contextWindow: 200000,
    qualityScore: 95,
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
    // Internal id kept stable for alias continuity; model field tracks
    // the current Sonnet release.
    id: 'claude-sonnet-4',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
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
    // Sonnet 4 legacy — dated snapshot from May 2025. Same role as
    // opus-4-legacy: intra-provider fallback when 4.6 is unavailable.
    id: 'claude-sonnet-4-legacy',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    contextWindow: 200000,
    qualityScore: 93,
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
    id: 'kimi-k2-0711',
    provider: 'moonshot',
    model: 'kimi-k2-0711-preview',
    contextWindow: 131072,
    qualityScore: 88,
    costPer1kInput: 0.0006,
    costPer1kOutput: 0.0018,
    capabilities: ['chat', 'document_analysis', 'general', 'structured_output', 'code_generation'],
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
    enabled: true,
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
    enabled: true,
  },
  // Private-cloud (Bedrock/Vertex/Azure) + self-hosted (local) substrates.
  // Always present in the static registry so the approved-models drift gate can
  // pin them; enabled at runtime only when their provider env is configured.
  ...CLOUD_MODELS,
];

// Task → preferred provider order
// Anthropic Claude is primary; OpenAI is automatic fallback when Claude is unavailable
const TASK_PROVIDER_PREFERENCES: Record<TaskType, ProviderName[]> = {
  chat: ['anthropic', 'openai', 'moonshot'],
  document_analysis: ['anthropic', 'openai', 'moonshot'],
  document_drafting: ['anthropic', 'openai', 'moonshot'],
  structured_output: ['anthropic', 'openai', 'moonshot'],
  regulatory_review: ['anthropic', 'openai', 'moonshot'],
  code_generation: ['anthropic', 'openai', 'moonshot'],
  summarization: ['anthropic', 'openai', 'moonshot'],
  embedding: ['anthropic', 'openai'],
  general: ['anthropic', 'openai', 'moonshot'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Mode Responses
// ─────────────────────────────────────────────────────────────────────────────

const DETERMINISTIC_RESPONSES: Record<TaskType, string> = {
  chat:
    '## AnA Response (Demo Mode)\n\n' +
    "I'm AnA — your Audit & Narrative Assistant. I'm currently running in **demo mode** because no AI provider API key is configured.\n\n" +
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
  structured_output:
    '{"result": "demo_mode", "status": "success", "message": "Deterministic mode active. Set ANTHROPIC_API_KEY to enable live AI.", "data": {}}',
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
    "**AnA (Demo Mode):** I'm running without an AI provider. " +
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
  // Private-cloud + self-hosted substrate clients.
  private bedrockClient: any = null;
  private vertexClient: any = null;
  private azureClient: any = null;
  private localClient: any = null;

  private roundRobinIndex = 0;

  constructor(config?: Partial<GatewayConfig>) {
    this.config = this.buildConfig(config);
    this.models = this.buildModelRegistry();
    this.providerHealth = new Map();
    this.auditLogger = new GatewayAuditLogger(this.config.dbPool);
    this.policyEngine = new GatewayPolicyEngine(this.config.policy);

    this.initProviderHealth();
    this.initProviderClients();

    log.debug(
      `[AI Gateway] Initialized — providers: ${this.getEnabledProviders().join(', ')}, strategy: ${this.config.defaultStrategy}, deterministic: ${this.config.deterministicMode}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-request retry with exponential backoff + jitter
  // ─────────────────────────────────────────────────────────────────────────

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 1,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        // Don't retry on non-transient errors
        const status = err?.status || err?.statusCode;
        if (status === 400 || status === 401 || status === 403) throw err;

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          const jitter = delay * 0.3 * Math.random(); // 0-30% jitter
          await new Promise(r => setTimeout(r, delay + jitter));
        }
      }
    }
    throw lastError;
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

    // Apply the org's default placement policy (residency / zero-retention) when
    // the request doesn't specify it. Explicit request values always win; if no
    // policy or the lookup fails, behavior is unchanged (explicit-only).
    request = await this.applyOrgPlacementDefaults(request);

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
      // Fail closed in production: serving demo-mode ("[KNOWN]"/placeholder)
      // regulatory text from a keyless prod deploy would silently present
      // fabricated content as a real AI response. Demo fallback is for dev only;
      // an explicit deterministicMode (handled above) remains a deliberate opt-in.
      // See FORENSIC_CODE_AUDIT_2026-05-29.md (LOW: keyless-prod demo mode).
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          '[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. ' +
            'Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly.'
        );
      }
      log.warn(
        '[AI Gateway] No providers available — falling back to demo mode. Set ANTHROPIC_API_KEY in .env to enable live AI.'
      );
      return this.buildDeterministicResponse(request, requestId, startTime);
    }

    // Execute with fallback. Track tried MODELS (not just providers) so
    // the fallback chain can exhaust Anthropic's quality ladder
    // (Opus 4.7 → Opus 4 → Sonnet 4.6 → Sonnet 4 → Haiku 4.5) before
    // crossing to a different provider. Previously a single Anthropic
    // failure jumped straight to OpenAI, which wasted the intra-Anthropic
    // fallback surface.
    let lastError: Error | null = null;
    const triedModels: string[] = [];

    // Try primary model (with per-request retry: 2 attempts, 1s base delay)
    try {
      const response = await this.retryWithBackoff(
        () => this.executeProvider(selectedModel, request, requestId, startTime), 1, 1000
      );
      this.recordSuccess(selectedModel.provider, response.latencyMs);
      await this.logAudit(request, response, strategy, true, undefined, triedModels);
      return response;
    } catch (error: any) {
      lastError = error;
      triedModels.push(selectedModel.id);
      this.recordFailure(selectedModel.provider, error);
      log.warn(
        `[AI Gateway] ${selectedModel.provider}/${selectedModel.model} failed: ${error.message}`
      );
    }

    // Try fallback models — same provider first (quality-desc), then cross-provider.
    const fallbacks = this.getFallbackModels(
      request,
      triedModels,
      selectedModel.provider,
    );
    for (const fallback of fallbacks) {
      try {
        log.debug(`[AI Gateway] Falling back to ${fallback.provider}/${fallback.model}`);
        const response = await this.retryWithBackoff(
          () => this.executeProvider(fallback, request, requestId, startTime), 1, 1000
        );
        this.recordSuccess(fallback.provider, response.latencyMs);
        await this.logAudit(request, response, strategy, true, undefined, triedModels);
        return response;
      } catch (error: any) {
        lastError = error;
        triedModels.push(fallback.id);
        this.recordFailure(fallback.provider, error);
        log.warn(
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
    await this.logAudit(request, errorResponse, strategy, false, lastError?.message, triedModels);

    throw new GatewayAllProvidersFailedError(
      `All models failed. Tried: ${triedModels.join(', ')}. Last error: ${lastError?.message}`
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
    log.debug(`[AI Gateway] Deterministic mode: ${enabled}`);
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
      case 'azure':
      case 'local':
        // OpenAI-compatible substrates share one execution path; the client is
        // resolved per provider inside executeOpenAI.
        return this.executeOpenAI(modelConfig, request, requestId, startTime);
      case 'anthropic':
      case 'bedrock':
      case 'vertex':
        // Anthropic-family substrates (first-party + Bedrock + Vertex) share the
        // proven Claude path; the client is resolved per provider.
        return this.executeAnthropic(modelConfig, request, requestId, startTime);
      case 'moonshot':
        return this.executeMoonshot(modelConfig, request, requestId, startTime);
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
  }

  /**
   * Resolve the Anthropic-family SDK client for a provider. First-party,
   * Bedrock, and Vertex all expose the same messages.create() surface, so the
   * gateway can run them through the single executeAnthropic path.
   */
  private anthropicFamilyClient(provider: ProviderName): any {
    switch (provider) {
      case 'bedrock':
        return this.bedrockClient;
      case 'vertex':
        return this.vertexClient;
      default:
        return this.anthropicClient;
    }
  }

  /** Resolve the OpenAI-compatible SDK client for a provider. */
  private openaiFamilyClient(provider: ProviderName): any {
    switch (provider) {
      case 'azure':
        return this.azureClient;
      case 'local':
        return this.localClient;
      default:
        return this.openaiClient;
    }
  }

  private async executeOpenAI(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<GatewayResponse> {
    // Resolve the OpenAI-compatible client for this provider (openai / azure / local).
    const client = this.openaiFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials/endpoint for ${modelConfig.provider})`
      );
    }

    const params: any = {
      model: modelConfig.model,
      messages: request.messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens || 2000,
      temperature: request.temperature ?? 0.7,
    };

    // Pass the sampling seed through for reproducible output where supported.
    if (request.seed !== undefined) {
      params.seed = request.seed;
    }

    if (request.jsonMode) {
      // Strict json_schema is a frontier/Azure feature; self-hosted
      // OpenAI-compatible servers generally support only json_object.
      const supportsStrictSchema = modelConfig.provider !== 'local';
      if (request.jsonSchema && supportsStrictSchema) {
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
      client.chat.completions.create(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelConfig.provider} API call timed out after 120s`)), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure(modelConfig.provider, error);
      }
      throw error;
    });
    const choice = completion.choices?.[0];

    return {
      content: choice?.message?.content || '',
      provider: modelConfig.provider,
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

  /**
   * Opus 4.7 and later removed the sampling parameters (temperature/top_p/top_k)
   * and the manual extended-thinking shape (thinking.type "enabled" with
   * budget_tokens) — sending any of them now returns a 400. Matches
   * claude-opus-4-7 / claude-opus-4-8 and provider-prefixed variants
   * (anthropic.claude-opus-4-7), but NOT the dated 4.0 snapshot
   * claude-opus-4-20250514, which still accepts the legacy surface.
   */
  private isReasoningOnlyModel(model: string): boolean {
    const m = /claude-opus-4-(\d{1,2})(?!\d)/.exec(model);
    return m ? Number(m[1]) >= 7 : false;
  }

  /**
   * Apply Anthropic sampling + thinking params in a model-aware way.
   *
   * Reasoning-only models (Opus 4.7/4.8 family) reject sampling params and
   * manual thinking — they use adaptive thinking with no sampling controls.
   * Summarized display keeps reasoning visible for the streaming path. Older
   * Claude models (Sonnet 4.6, Haiku 4.5, the dated 4.0 snapshots) keep the
   * legacy temperature + budget_tokens surface.
   */
  private applyAnthropicSamplingParams(
    params: any,
    modelConfig: ModelConfig,
    request: GatewayRequest
  ): void {
    if (this.isReasoningOnlyModel(modelConfig.model)) {
      if (request.thinking?.enabled) {
        params.thinking = { type: 'adaptive', display: 'summarized' };
      }
      return;
    }
    if (request.thinking?.enabled) {
      // Manual extended thinking requires temperature=1 and no top_p/top_k.
      params.thinking = {
        type: 'enabled',
        budget_tokens: request.thinking.budgetTokens || 10000,
      };
      params.temperature = 1;
    } else {
      params.temperature = request.temperature ?? 0.7;
    }
  }

  private async executeAnthropic(
    modelConfig: ModelConfig,
    request: GatewayRequest,
    requestId: string,
    startTime: number
  ): Promise<AnaGatewayResponse> {
    // Resolve the Anthropic-family client (first-party / Bedrock / Vertex).
    const client = this.anthropicFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials for ${modelConfig.provider})`
      );
    }

    // If streaming requested, delegate to streaming method
    if (request.stream && request.onStream) {
      return this.executeAnthropicStream(modelConfig, request, requestId, startTime);
    }

    // Convert messages — Anthropic needs system separate
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const cacheEnabled = !!request.promptCache?.enabled;
    const cacheType = request.promptCache?.type;

    // Build messages with multi-modal support (vision) + optional prompt-cache
    // breakpoints on individual user/assistant turns.
    const messages = nonSystemMessages.map(m => {
      const shouldCache = cacheEnabled && m.cacheControl === true;
      // If message has contentBlocks (images + text), use structured content
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        const blocks = m.contentBlocks.map(block => {
          if (block.type === 'image') {
            return { type: 'image' as const, source: block.source } as any;
          }
          if (block.type === 'document') {
            return {
              type: 'document' as const,
              source: block.source,
              ...(block.title ? { title: block.title } : {}),
              ...(block.context ? { context: block.context } : {}),
              ...(block.citations ? { citations: block.citations } : {}),
            } as any;
          }
          return { type: 'text' as const, text: block.text } as any;
        });
        if (shouldCache && blocks.length > 0) {
          blocks[blocks.length - 1].cache_control = { type: cacheType };
        }
        return { role: m.role, content: blocks };
      }
      // Also handle request-level imageContent (convenience API)
      if (m.role === 'user' && request.imageContent && request.imageContent.length > 0) {
        const content: any[] = request.imageContent.map(img => ({
          type: 'image' as const,
          source: img.source,
        }));
        content.push({ type: 'text' as const, text: m.content });
        if (shouldCache) {
          content[content.length - 1].cache_control = { type: cacheType };
        }
        return { role: m.role, content };
      }
      if (shouldCache) {
        return {
          role: m.role,
          content: [
            {
              type: 'text' as const,
              text: m.content,
              cache_control: { type: cacheType },
            },
          ],
        };
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
        const cacheType = request.promptCache.type;
        const flagged = systemMessages.some(m => m.cacheControl === true);
        // Honor explicit per-message cacheControl flags when present;
        // otherwise apply cache_control to the last system message.
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...((flagged ? m.cacheControl === true : i === systemMessages.length - 1)
            ? { cache_control: { type: cacheType } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    // Sampling + extended thinking (model-aware: Opus 4.7+ rejects temperature
    // and manual budget_tokens thinking; older models keep the legacy surface).
    this.applyAnthropicSamplingParams(params, modelConfig, request);

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

    const usesFilesApiDoc = (request.messages || []).some(m =>
      m.contentBlocks?.some(b => b.type === 'document' && b.source.type === 'file')
    );
    const reqOptions = usesFilesApiDoc
      ? { headers: { 'anthropic-beta': 'files-api-2025-04-14' } }
      : undefined;

    const response = await Promise.race([
      client.messages.create(params, reqOptions),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelConfig.provider} API call timed out after 120s`)), 120_000)
      ),
    ]).catch((error: Error) => {
      if (error.message.includes('timed out')) {
        this.recordFailure(modelConfig.provider, error);
      }
      throw error;
    });

    // Extract text, thinking, and tool use blocks
    let content = '';
    let thinking = '';
    const toolUses: AnaToolUse[] = [];

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
      provider: modelConfig.provider,
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
  ): Promise<AnaGatewayResponse> {
    const client = this.anthropicFamilyClient(modelConfig.provider);
    if (!client) {
      throw new Error(
        `${modelConfig.provider} client not initialized (missing credentials for ${modelConfig.provider})`
      );
    }

    const onStream = request.onStream!;
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');

    const streamCacheEnabled = !!request.promptCache?.enabled;
    const streamCacheType = request.promptCache?.type;

    const messages = nonSystemMessages.map(m => {
      const shouldCache = streamCacheEnabled && m.cacheControl === true;
      if (m.contentBlocks && m.contentBlocks.length > 0) {
        const blocks: any[] = m.contentBlocks.map(block => {
          if (block.type === 'image') {
            return { type: 'image' as const, source: block.source };
          }
          if (block.type === 'document') {
            return {
              type: 'document' as const,
              source: block.source,
              ...(block.title ? { title: block.title } : {}),
              ...(block.context ? { context: block.context } : {}),
              ...(block.citations ? { citations: block.citations } : {}),
            };
          }
          return { type: 'text' as const, text: block.text };
        });
        if (shouldCache && blocks.length > 0) {
          blocks[blocks.length - 1].cache_control = { type: streamCacheType };
        }
        return { role: m.role, content: blocks };
      }
      if (shouldCache) {
        return {
          role: m.role,
          content: [
            {
              type: 'text' as const,
              text: m.content,
              cache_control: { type: streamCacheType },
            },
          ],
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
        const cacheType = request.promptCache.type;
        const flagged = systemMessages.some(m => m.cacheControl === true);
        params.system = systemMessages.map((m, i) => ({
          type: 'text',
          text: m.content,
          ...((flagged ? m.cacheControl === true : i === systemMessages.length - 1)
            ? { cache_control: { type: cacheType } }
            : {}),
        }));
      } else {
        params.system = systemMessages.map(m => m.content).join('\n\n');
      }
    }

    // Sampling + extended thinking (model-aware: Opus 4.7+ rejects temperature
    // and manual budget_tokens thinking; older models keep the legacy surface).
    this.applyAnthropicSamplingParams(params, modelConfig, request);

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
    const streamUsesFilesApiDoc = (request.messages || []).some(m =>
      m.contentBlocks?.some(b => b.type === 'document' && b.source.type === 'file')
    );
    const stream = await client.messages.create(
      params,
      streamUsesFilesApiDoc ? { headers: { 'anthropic-beta': 'files-api-2025-04-14' } } : undefined
    );

    let content = '';
    let thinking = '';
    const toolUses: AnaToolUse[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationInputTokens = 0;
    let cacheReadInputTokens = 0;
    let stopReason = 'unknown';

    // Per-chunk watchdog — detect stalled streams (no data for 30s)
    let lastChunkTime = Date.now();
    const chunkTimeoutMs = 30_000;
    let streamStalled = false;
    const chunkWatchdog = setInterval(() => {
      if (Date.now() - lastChunkTime > chunkTimeoutMs) {
        streamStalled = true;
        clearInterval(chunkWatchdog);
        log.warn(
          `[AI Gateway] Stream stalled — no chunk received for ${chunkTimeoutMs / 1000}s. ` +
          `Accumulated ${content.length} chars so far. Aborting stream.`
        );
        // If the stream object has a controller/abort method, try to close it
        try {
          if (stream && typeof (stream as any).controller?.abort === 'function') {
            (stream as any).controller.abort();
          }
        } catch { /* best-effort abort */ }
      }
    }, 5_000);

    try {
      for await (const event of stream as AsyncIterable<any>) {
        // Update watchdog timestamp on every event
        lastChunkTime = Date.now();

        // Break out if watchdog flagged a stall (race between interval and iterator)
        if (streamStalled) break;

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
          // Prompt cache usage (Anthropic emits these on the message_start
          // event alongside input_tokens). They stay 0 when caching is off.
          cacheCreationInputTokens =
            event.message?.usage?.cache_creation_input_tokens || 0;
          cacheReadInputTokens = event.message?.usage?.cache_read_input_tokens || 0;
        }
      }
    } catch (streamErr: any) {
      log.error('[AI Gateway] Stream interrupted:', streamErr?.message);
      // Return whatever content was accumulated so far (partial response)
      if (!content) throw streamErr; // Re-throw if nothing was captured
    } finally {
      clearInterval(chunkWatchdog);
    }

    // If stream stalled but we have partial content, mark finish reason accordingly
    if (streamStalled && content) {
      stopReason = 'chunk_timeout';
      log.warn(`[AI Gateway] Returning partial response (${content.length} chars) after stream stall`);
    }

    const streamCacheStats =
      cacheCreationInputTokens > 0 || cacheReadInputTokens > 0
        ? {
            cacheCreationInputTokens,
            cacheReadInputTokens,
          }
        : undefined;

    return {
      content,
      thinking: thinking || undefined,
      toolUses: toolUses.length > 0 ? toolUses : undefined,
      provider: modelConfig.provider,
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
      cacheHit: streamCacheStats ? cacheReadInputTokens > 0 : undefined,
      cacheStats: streamCacheStats,
    } as AnaGatewayResponse;
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

    // Pass the sampling seed through for reproducible output where supported.
    if (request.seed !== undefined) {
      params.seed = request.seed;
    }

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
          (!request.model || m.model === request.model || m.id === request.model) &&
          this.meetsPlacementRequirements(m.provider, request)
      );
      if (explicit && this.isProviderHealthy(explicit.provider)) return explicit;
      // Even if unhealthy, honor explicit if it's the only option
      if (explicit) return explicit;
    }

    const eligible = this.models.filter(
      m =>
        m.enabled &&
        m.capabilities.includes(request.taskType) &&
        this.meetsPlacementRequirements(m.provider, request) &&
        this.isProviderHealthy(m.provider)
    );

    if (eligible.length === 0) {
      // Relax health check (but never relax placement: residency/ZDR are hard
      // compliance constraints, not preferences).
      const relaxed = this.models.filter(
        m =>
          m.enabled &&
          m.capabilities.includes(request.taskType) &&
          this.meetsPlacementRequirements(m.provider, request)
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

  /**
   * Build the fallback chain, exhausting the primary provider's quality
   * ladder before crossing to a different provider. This means if Opus 4.7
   * fails, the chain is:
   *
   *   Opus 4 legacy (same provider, lower quality)
   *   → Sonnet 4.6 (same provider, lower quality)
   *   → Sonnet 4 legacy (same provider, lower quality)
   *   → Haiku 4.5 (same provider, lowest Anthropic quality)
   *   → [cross-provider fallbacks in quality order]
   *
   * The same-provider-first ordering reflects operator preference — when
   * the primary provider is reachable at all, staying within it preserves
   * prompt-cache hits, tool-schema consistency, and telemetry continuity.
   */
  private getFallbackModels(
    request: GatewayRequest,
    triedModels: string[],
    primaryProvider: ProviderName,
  ): ModelConfig[] {
    const eligible = this.models.filter(
      m =>
        m.enabled &&
        m.capabilities.includes(request.taskType) &&
        !triedModels.includes(m.id) &&
        // Residency / ZDR are hard constraints — never fall back across them.
        this.meetsPlacementRequirements(m.provider, request),
    );
    const samePriority = eligible.filter(m => m.provider === primaryProvider);
    const otherProviders = eligible.filter(m => m.provider !== primaryProvider);
    // Within each bucket, sort by quality descending.
    const sortByQuality = (list: ModelConfig[]) =>
      [...list].sort((a, b) => b.qualityScore - a.qualityScore);
    return [...sortByQuality(samePriority), ...sortByQuality(otherProviders)];
  }

  /**
   * True when a provider's placement satisfies the request's residency / ZDR
   * requirements. Returns true when the request declares no constraints, so
   * existing callers are unaffected.
   */
  private meetsPlacementRequirements(
    provider: ProviderName,
    request: GatewayRequest,
  ): boolean {
    const needsZdr = request.zeroDataRetention === true;
    const residency =
      request.dataResidency && request.dataResidency !== 'any'
        ? request.dataResidency
        : null;
    if (!needsZdr && !residency) return true;
    return isPlacementCompliant(resolvePlacement(provider), {
      zeroDataRetention: needsZdr,
      residency,
    });
  }

  /**
   * Fill in residency / zero-retention from the org's placement policy when the
   * request didn't specify them. Explicit request values always win. Never
   * throws — a failed lookup leaves the request unchanged (explicit-only).
   */
  private async applyOrgPlacementDefaults(request: GatewayRequest): Promise<GatewayRequest> {
    if (request.organizationId === undefined || request.organizationId === null) return request;
    // Both already pinned — nothing for a default to fill.
    if (request.dataResidency !== undefined && request.zeroDataRetention !== undefined) {
      return request;
    }
    try {
      const policy = await getOrgPlacementResolver().resolve(request.organizationId);
      if (!policy) return request;
      const merged = mergeOrgPolicyDefaults(
        { dataResidency: request.dataResidency, zeroDataRetention: request.zeroDataRetention },
        policy,
      );
      return { ...request, ...merged };
    } catch {
      return request; // never let policy resolution break a request
    }
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
      log.warn(
        `[AI Gateway] Provider ${provider} marked unhealthy after ${health.consecutiveFailures} failures — recovery in ${backoffMs / 1000}s`
      );

      const jitter = backoffMs * 0.2 * Math.random(); // 0-20% jitter on health recovery
      setTimeout(() => {
        // Only recover if no new successes have already reset it
        if (!health.healthy) {
          health.healthy = true;
          health.consecutiveFailures = 0;
          log.debug(
            `[AI Gateway] Provider ${provider} auto-recovered after ${Math.round((backoffMs + jitter) / 1000)}s backoff`
          );
        }
      }, backoffMs + jitter);
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
    error?: string,
    triedModels?: string[]
  ): Promise<void> {
    if (!this.config.auditEnabled) return;

    try {
      const promptVersion =
        request.promptVersion ??
        (typeof request.metadata?.promptVersion === 'string'
          ? (request.metadata.promptVersion as string)
          : undefined);

      // Resolve the substrate/region/retention the serving provider ran under,
      // so the audit ledger records *where* regulated data was processed — the
      // evidence a residency- or BAA-constrained tenant asks for.
      const placement = resolvePlacement(response.provider);

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
        // Reproducibility: which params + prompt produced this output.
        temperature: request.temperature ?? 0.7,
        seed: request.seed,
        promptHash: this.hashPrompt(request.messages),
        promptVersion,
        triedModels: triedModels && triedModels.length > 0 ? triedModels : undefined,
        // Placement / residency evidence.
        substrate: placement.substrate,
        region:
          request.dataResidency && request.dataResidency !== 'any'
            ? request.dataResidency
            : placement.regions[0],
        retentionPolicy: placement.zeroDataRetention ? 'zero_retention' : 'standard',
        metadata: request.metadata,
      });
    } catch (auditError: any) {
      log.error(`[AI Gateway] Audit log failed: ${auditError.message}`);
    }
  }

  /** SHA-256 of the canonicalized prompt messages, for reproducibility audit. */
  private hashPrompt(messages: GatewayMessage[]): string {
    const canonical = messages.map(m => `${m.role}:${m.content}`).join('\n');
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  private buildConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const moonshotKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;

    // Private-cloud + self-hosted substrates. Each is opt-in: a deployment only
    // turns one on when it has the credentials/infra and a tenant that needs it.
    const bedrockEnabled = process.env.AI_BEDROCK_ENABLED === 'true';
    const vertexEnabled = process.env.AI_VERTEX_ENABLED === 'true';
    const azureEnabled = !!(
      process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT
    );
    const localBaseUrl = process.env.LOCAL_AI_BASE_URL || process.env.LITELLM_BASE_URL;
    const localEnabled = process.env.AI_LOCAL_ENABLED === 'true' && !!localBaseUrl;

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
          defaultModel: 'claude-sonnet-4-6',
          models: [],
        },
        {
          name: 'moonshot',
          enabled: !!moonshotKey,
          apiKey: moonshotKey,
          baseUrl: 'https://api.moonshot.ai/v1',
          defaultModel: 'kimi-k2-0711-preview',
          models: [],
        },
        {
          name: 'bedrock',
          enabled: bedrockEnabled,
          defaultModel: 'anthropic.claude-opus-4-7',
          models: [],
        },
        {
          name: 'vertex',
          enabled: vertexEnabled,
          defaultModel: 'claude-opus-4-7',
          models: [],
        },
        {
          name: 'azure',
          enabled: azureEnabled,
          apiKey: process.env.AZURE_OPENAI_API_KEY,
          baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
          defaultModel: 'gpt-4o',
          models: [],
        },
        {
          name: 'local',
          enabled: localEnabled,
          baseUrl: localBaseUrl,
          defaultModel: 'local-default',
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
        log.debug('  ✅ OpenAI provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ OpenAI provider init failed: ${e.message}`);
      }
    }

    // Anthropic
    const anthropicConfig = this.config.providers.find(p => p.name === 'anthropic');
    if (anthropicConfig?.enabled && anthropicConfig.apiKey) {
      try {
        this.anthropicClient = new Anthropic({ apiKey: anthropicConfig.apiKey });
        log.debug('  ✅ Anthropic provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ Anthropic provider init failed: ${e.message}`);
      }
    }

    // Moonshot (OpenAI-compatible)
    const moonshotConfig = this.config.providers.find(p => p.name === 'moonshot');
    if (moonshotConfig?.enabled && moonshotConfig.apiKey) {
      try {
        this.moonshotClient = new OpenAI({
          apiKey: moonshotConfig.apiKey,
          baseURL: moonshotConfig.baseUrl || 'https://api.moonshot.ai/v1',
        });
        log.debug('  ✅ Moonshot/Kimi provider ready');
      } catch (e: any) {
        log.warn(`  ⚠️ Moonshot provider init failed: ${e.message}`);
      }
    }

    // ── Private-cloud + self-hosted substrates ───────────────────────────────
    // Each factory returns null (with a logged hint) when its optional SDK or
    // credentials are absent, so an enabled-but-unconfigured provider degrades
    // to "unhealthy" rather than crashing the gateway.

    if (this.config.providers.find(p => p.name === 'bedrock')?.enabled) {
      this.bedrockClient = createBedrockClient();
      if (this.bedrockClient) log.debug('  ✅ Bedrock (Claude, private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'vertex')?.enabled) {
      this.vertexClient = createVertexClient();
      if (this.vertexClient) log.debug('  ✅ Vertex (Claude, private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'azure')?.enabled) {
      this.azureClient = createAzureClient();
      if (this.azureClient) log.debug('  ✅ Azure OpenAI (private-cloud) provider ready');
    }

    if (this.config.providers.find(p => p.name === 'local')?.enabled) {
      this.localClient = createLocalClient();
      if (this.localClient) log.debug('  ✅ Local / self-hosted provider ready');
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
