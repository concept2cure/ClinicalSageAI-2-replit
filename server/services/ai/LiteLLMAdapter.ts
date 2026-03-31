import type { AIRequest, AIResponse, ModelConfig } from '../aiProviderRouter';
import crypto from 'crypto';

interface LiteLLMChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export class LiteLLMAdapter {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly modelMap: Record<string, string>;

  constructor() {
    this.enabled = parseBoolean(process.env.LITELLM_ENABLED, false);
    this.baseUrl = (process.env.LITELLM_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    this.apiKey = process.env.LITELLM_API_KEY;
    this.timeoutMs = Number(process.env.LITELLM_TIMEOUT_MS || 45_000);

    let modelMap: Record<string, string> = {};
    try {
      modelMap = process.env.LITELLM_MODEL_MAP_JSON
        ? JSON.parse(process.env.LITELLM_MODEL_MAP_JSON)
        : {};
    } catch {
      modelMap = {};
    }
    this.modelMap = modelMap;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      hasApiKey: Boolean(this.apiKey),
      mappedModels: Object.keys(this.modelMap).length,
    };
  }

  private resolveModel(model: string): string {
    return this.modelMap[model] || model;
  }

  async execute(request: AIRequest, selectedModel: ModelConfig): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.resolveModel(selectedModel.model),
          messages: request.messages,
          max_tokens: request.maxTokens || selectedModel.maxTokens,
          temperature: request.temperature ?? 0.7,
          response_format: request.jsonMode ? { type: 'json_object' } : undefined,
          metadata: {
            organizationId: request.organizationId,
            userId: request.userId,
            projectId: request.projectId,
            taskType: request.taskType,
            requestId: request.metadata?.requestId,
            correlationId: request.metadata?.correlationId,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`LiteLLM error ${response.status}: ${message.slice(0, 300)}`);
      }

      const payload = (await response.json()) as LiteLLMChatResponse;
      const inputTokens = payload.usage?.prompt_tokens || 0;
      const outputTokens = payload.usage?.completion_tokens || 0;
      const totalTokens = payload.usage?.total_tokens || inputTokens + outputTokens;
      const estimatedCost =
        (inputTokens / 1000) * selectedModel.costPer1kInput +
        (outputTokens / 1000) * selectedModel.costPer1kOutput;

      return {
        content: payload.choices?.[0]?.message?.content || '',
        provider: selectedModel.provider,
        model: payload.model || selectedModel.model,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCost,
        },
        latencyMs: Date.now() - startedAt,
        requestId: payload.id || crypto.randomUUID(),
        cached: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
