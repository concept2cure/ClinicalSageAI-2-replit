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

/**
 * What `LITELLM_ENABLED=true` actually switches off.
 *
 * `aiProviderRouter` makes the governed gateway the ELSE branch:
 *
 *     if (this.liteLLMAdapter.isEnabled()) { ...adapter.execute()... }
 *     else                                 { ...executeViaGateway()... }
 *
 * so this one flag diverts EVERY routed AI call away from `gateway.route()`,
 * and with it: policy evaluation, the fail-closed PII/PHI screen, the
 * provider-placement and data-residency check, and the `ai.gateway_audit_log`
 * row. The router still writes its own `ai_provider_audit_log` row, but that
 * one carries no prompt hash, no resolved model and no residency decision — so
 * for a 21 CFR Part 11 estate the call becomes unreconstructable after the fact.
 *
 * None of that is announced. Before 2026-09-10 the adapter read the flag, set a
 * boolean, and said nothing — the only surface reporting it was
 * `getDiagnostics()`, which nothing calls at boot.
 *
 * `.env.example` defaults it false and nothing in helm, terraform or compose
 * sets it, so this is latent. It is latent by luck rather than by design, which
 * is the part below fixes: in production the flag now REFUSES TO BOOT unless a
 * second, explicit acknowledgement is present, exactly as
 * `server/db/rlsEnforcement.ts` does for `RLS_ENFORCE`. A governance control a
 * single unreviewed env var can remove silently is not a control.
 *
 * The acknowledgement is deliberately awkward to set by accident and names what
 * is being given up. It is NOT a blessing of the bypass — routing LiteLLM
 * through the gateway as a provider is the actual fix, tracked as WO-6.
 */
const LITELLM_PRODUCTION_ACK = 'i-accept-ungoverned-ai-calls';
const LITELLM_ACK_VAR = 'LITELLM_UNGOVERNED_ACK';

export class LiteLLMAdapter {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly modelMap: Record<string, string>;

  constructor() {
    this.enabled = parseBoolean(process.env.LITELLM_ENABLED, false);

    if (this.enabled) {
      const isProduction = process.env.NODE_ENV === 'production';
      const acked = (process.env[LITELLM_ACK_VAR] ?? '').trim() === LITELLM_PRODUCTION_ACK;

      if (isProduction && !acked) {
        throw new Error(
          '[litellm] FAIL-CLOSED: REFUSING TO BOOT. LITELLM_ENABLED is true in production, ' +
            'which routes every AI call around the governed gateway — no policy evaluation, ' +
            'no PII/PHI screen, no residency check, and no ai.gateway_audit_log row. ' +
            `Set ${LITELLM_ACK_VAR}=${LITELLM_PRODUCTION_ACK} to proceed anyway, or unset ` +
            'LITELLM_ENABLED. See docs/work-orders/WO-6-ai-gateway-bypass-burndown.md.',
        );
      }

      // Announced in EVERY environment, acknowledged or not. The defect this
      // closes is silence, not the flag: an operator who turns this on in
      // staging and promotes the config should see it in the boot log before
      // they see it in an audit finding.
      console.warn(
        `[litellm] AI GATEWAY BYPASSED — LITELLM_ENABLED=true. Every routed AI call skips ` +
          `policy evaluation, the PII/PHI screen, the residency check and the gateway audit ` +
          `trail. NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}` +
          (isProduction ? ` (production, acknowledged via ${LITELLM_ACK_VAR})` : ''),
      );
    }

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
