/**
 * AI Gateway — unified entry-point for all LLM calls.
 *
 * Wraps the OpenAI SDK so every caller gets:
 *   - consistent error handling
 *   - caller-module audit trail
 *   - a single place to swap providers later
 */
import OpenAI from 'openai';

export type TaskType =
  | 'document_analysis'
  | 'document_drafting'
  | 'regulatory_review';

export interface RouteOptions {
  taskType: TaskType;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  callerModule?: string;
}

export interface RouteResult {
  content: string;
  model: string;
  callerModule?: string;
}

export interface StructuredOutputOptions {
  taskType: TaskType;
  maxTokens?: number;
  temperature?: number;
  callerModule?: string;
}

class AIGateway {
  private openai: OpenAI | null;

  constructor() {
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  /** Send a chat-completion request through the gateway. */
  async route(opts: RouteOptions): Promise<RouteResult> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const model = this.modelForTask(opts.taskType);

    const response = await this.openai.chat.completions.create({
      model,
      messages: opts.messages as any,
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.3,
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      model,
      callerModule: opts.callerModule,
    };
  }

  /**
   * Ask the model to return JSON that conforms to `schema`.
   * Falls back to a strongly-worded system prompt + JSON.parse.
   */
  async structuredOutput<T>(
    prompt: string,
    schema: Record<string, unknown>,
    opts: StructuredOutputOptions,
  ): Promise<T> {
    const result = await this.route({
      ...opts,
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory-science AI. Return ONLY valid JSON matching the schema below. No markdown fences, no commentary.\n\nSchema:\n' +
            JSON.stringify(schema, null, 2),
        },
        { role: 'user', content: prompt },
      ],
    });

    // Strip any accidental markdown fences
    const cleaned = result.content
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    return JSON.parse(cleaned) as T;
  }

  /** Map task type → model name (easy to reconfigure). */
  private modelForTask(task: TaskType): string {
    switch (task) {
      case 'document_drafting':
        return 'gpt-4o';
      case 'regulatory_review':
        return 'gpt-4o';
      case 'document_analysis':
      default:
        return 'gpt-4o';
    }
  }
}

let _instance: AIGateway | null = null;

export function getGateway(): AIGateway {
  if (!_instance) {
    _instance = new AIGateway();
  }
  return _instance;
}
