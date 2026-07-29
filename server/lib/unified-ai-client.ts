/**
 * Unified AI Client — Drop-in Replacement for Direct OpenAI Calls
 *
 * This module provides a simple interface that routes all AI completions
 * through the centralized AI Gateway, defaulting to Claude as the primary
 * provider. It can be used as a quick migration path for the 85+ files
 * that currently call OpenAI directly.
 *
 * Usage (replacing direct OpenAI calls):
 *
 *   // Before: a module instantiated its own OpenAI client and called
 *   //   `openai.chat.completions.create({ model: 'gpt-4o', messages, max_tokens })`,
 *   //   reading `result.choices[0].message.content` — outside the gateway, so the
 *   //   call escaped the centralized audit trail and provider policy.
 *
 *   // After:
 *   import { ai } from '../lib/unified-ai-client';
 *   const text = await ai.complete(messages, { maxTokens: 2000 });
 *
 *   // Or with full response:
 *   const result = await ai.chat(messages, { maxTokens: 2000 });
 *   const text = result.content;
 */

import { getGateway } from '../services/ai-gateway/gateway';
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayMessage,
  TaskType,
  ProviderName,
  AnaGatewayResponse,
  StreamCallback,
  ExtendedThinkingConfig,
  AnaTool,
} from '../services/ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AICompletionOptions {
  /** Task type for routing (default: 'general') */
  taskType?: TaskType;
  /** Max tokens to generate (default: 4096) */
  maxTokens?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
  /** Force specific provider (default: auto-route to Claude) */
  provider?: ProviderName;
  /** Force specific model */
  model?: string;
  /** Request JSON output */
  jsonMode?: boolean;
  /** JSON schema for structured output */
  jsonSchema?: Record<string, unknown>;
  /** Enable extended thinking */
  thinking?: ExtendedThinkingConfig;
  /** Tools for agentic workflows */
  tools?: AnaTool[];
  /** Streaming callback */
  onStream?: StreamCallback;
  /** Enable prompt caching for system prompts */
  cache?: boolean;
  /** Organization ID for audit */
  organizationId?: string | number;
  /** User ID for audit */
  userId?: string | number;
  /** Project ID for audit */
  projectId?: string | number;
  /** Caller module name for audit */
  callerModule?: string;
}

type MessageInput = GatewayMessage[] | { role: string; content: string }[] | string; // Simple string = single user message

// ─────────────────────────────────────────────────────────────────────────────
// Unified AI Client
// ─────────────────────────────────────────────────────────────────────────────

class UnifiedAIClient {
  async embeddings(params: {
    model?: string;
    input: string;
    dimensions?: number;
  }): Promise<{ embedding: number[] }> {
    const response = await this.chat(params.input, {
      taskType: 'embedding',
      model: params.model,
      maxTokens: params.dimensions,
      temperature: 0,
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        embedding: Array.isArray(parsed) ? parsed.map(value => Number(value) || 0) : [],
      };
    } catch {
      return { embedding: [] };
    }
  }

  /**
   * Complete a prompt and return just the text content.
   * Simplest API — drop-in replacement for `openai.chat.completions.create()`.
   */
  async complete(
    messages: MessageInput | Record<string, any>,
    options?: AICompletionOptions
  ): Promise<string> {
    const response = await this.chat(messages, options);
    return response.content;
  }

  /**
   * Complete a prompt and return the full gateway response.
   *
   * Supports two calling conventions:
   * 1. ai.chat(messages, options)           — preferred
   * 2. ai.chat({ messages, model, ... })    — OpenAI-compatible (legacy migration)
   */
  async chat(
    messages: MessageInput | Record<string, any>,
    options?: AICompletionOptions
  ): Promise<AnaGatewayResponse> {
    // Handle OpenAI-compatible single-object argument: ai.chat({ model, messages, temperature, ... })
    if (
      messages &&
      !Array.isArray(messages) &&
      typeof messages === 'object' &&
      'messages' in messages
    ) {
      const obj = messages as Record<string, any>;
      const extractedMessages = obj.messages as MessageInput;
      const extractedOptions: AICompletionOptions = {
        ...options,
        model: obj.model ?? options?.model,
        temperature: obj.temperature ?? options?.temperature,
        maxTokens: obj.max_tokens ?? obj.maxTokens ?? options?.maxTokens,
        jsonMode: obj.response_format?.type === 'json_object' || obj.jsonMode || options?.jsonMode,
        jsonSchema: obj.jsonSchema ?? options?.jsonSchema,
        tools: obj.tools ?? options?.tools,
        onStream: obj.onStream ?? options?.onStream,
        provider: obj.provider ?? options?.provider,
        callerModule: obj.callerModule ?? options?.callerModule,
        taskType: obj.taskType ?? options?.taskType,
        cache: obj.cache ?? options?.cache,
        organizationId: obj.organizationId ?? options?.organizationId,
        userId: obj.userId ?? options?.userId,
        projectId: obj.projectId ?? options?.projectId,
      };
      return this.chat(extractedMessages, extractedOptions);
    }

    const gateway = getGateway();
    const normalizedMessages = this.normalizeMessages(messages as MessageInput);

    const request: GatewayRequest = {
      taskType: options?.taskType || 'general',
      messages: normalizedMessages,
      maxTokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      provider: options?.provider,
      model: options?.model,
      jsonMode: options?.jsonMode,
      jsonSchema: options?.jsonSchema,
      thinking: options?.thinking,
      tools: options?.tools,
      stream: !!options?.onStream,
      onStream: options?.onStream,
      promptCache: options?.cache ? { enabled: true, type: 'ephemeral' } : undefined,
      organizationId: options?.organizationId,
      userId: options?.userId,
      projectId: options?.projectId,
      callerModule: options?.callerModule,
    };

    return (await gateway.route(request)) as AnaGatewayResponse;
  }

  /**
   * Structured output — returns parsed JSON.
   */
  async structured<T = unknown>(
    messages: MessageInput,
    schema?: Record<string, unknown>,
    options?: AICompletionOptions
  ): Promise<T> {
    const response = await this.chat(messages, {
      ...options,
      jsonMode: true,
      jsonSchema: schema,
      temperature: options?.temperature ?? 0.1,
      taskType: options?.taskType || 'structured_output',
    });

    try {
      return JSON.parse(response.content) as T;
    } catch {
      throw new Error(`Failed to parse AI response as JSON: ${response.content.slice(0, 200)}`);
    }
  }

  /**
   * Document drafting — uses Opus with extended thinking and tool use.
   */
  async draft(
    systemPrompt: string,
    userPrompt: string,
    options?: AICompletionOptions
  ): Promise<AnaGatewayResponse> {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        taskType: 'document_drafting',
        model: 'claude-opus-4-7',
        maxTokens: 8192,
        cache: true,
        thinking: { enabled: true, budgetTokens: 10000 },
        ...options,
      }
    );
  }

  /**
   * Regulatory review — uses Opus with compliance tools.
   */
  async review(
    systemPrompt: string,
    content: string,
    options?: AICompletionOptions
  ): Promise<AnaGatewayResponse> {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: content },
      ],
      {
        taskType: 'regulatory_review',
        model: 'claude-opus-4-7',
        maxTokens: 8192,
        cache: true,
        ...options,
      }
    );
  }

  /**
   * Quick completion — uses Sonnet for speed.
   */
  async quick(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.complete(prompt, {
      model: 'claude-sonnet-4-6',
      maxTokens: 2048,
      ...options,
    });
  }

  /**
   * Fast/cheap completion — uses Haiku.
   */
  async fast(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.complete(prompt, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
      ...options,
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private normalizeMessages(input: MessageInput): GatewayMessage[] {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }
    return input.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

/** Global unified AI client — routes through Claude by default */
export const ai = new UnifiedAIClient();

/**
 * Drop-in helper for migrating `openai.chat.completions.create()` calls.
 *
 * Usage:
 *   // Before:
 *   const result = await openai.chat.completions.create({ model: 'gpt-4o', messages, max_tokens: 2000 });
 *   const text = result.choices[0].message.content;
 *
 *   // After:
 *   const text = await aiComplete({ messages, max_tokens: 2000 });
 */
export async function aiComplete(params: {
  model?: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}): Promise<string> {
  return ai.complete(params.messages, {
    maxTokens: params.max_tokens,
    temperature: params.temperature,
    jsonMode: params.response_format?.type === 'json_object',
  });
}

export default ai;
