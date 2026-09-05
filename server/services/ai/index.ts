/**
 * AI Services - Unified Entry Point
 *
 * Consolidates all AI-related services into a single module.
 * Part of Q1 2026 consolidation sprint to reduce service count.
 *
 * @module server/services/ai
 * @version 2.0.0
 */

// Re-export OpenAI orchestrator (primary AI service)
export * from './openai-orchestrator';

/* Six OpenAI Assistants re-exports (createAssistant / createThread /
   addMessageToThread / runAssistant / getRunStatus / listMessages) stood here.
   The comment above them said "re-export from ROOT services" — but
   `../openai-service` from server/services/ai/ resolves to the SIBLING,
   server/services/openai-service.ts, which was the ungoverned direct-OpenAI
   client, not the root governed module. The root exports none of those symbols,
   so the mis-stated intent had been silently correct about the path and wrong
   about the governance for as long as it existed.

   That module is deleted (no live caller anywhere: this barrel is reached only
   through server/services/index.ts, which has zero importers). Assistants
   threads/runs are not something the gateway abstracts today, so nothing is
   re-pointed — when that capability is wanted it gets added deliberately,
   through the gateway, rather than inherited from a dead barrel.

   The no-op stubs below are kept as-is: they were already stubs, and removing
   them is a separate question from the governance collision. */
export const waitForRunCompletion: any = async () => undefined;
export const getMessages: any = async () => [];
export const submitToolOutputs: any = async () => undefined;
export const cancelRun: any = async () => undefined;

// Export types for type-safe usage
export interface AICompletionOptions {
  model?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  structuredOutput?: boolean;
  responseSchema?: Record<string, unknown>;
}

export interface AICompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface AIEmbeddingOptions {
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  dimensions?: number;
}

export interface AIEmbeddingResult {
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Service registry for AI capabilities
 * Maps capability names to their implementing services
 */
export const AI_SERVICE_REGISTRY = {
  // Core completion
  completion: 'openai-orchestrator',
  chat: 'openai-service',
  assistant: 'openai-service',

  // Specialized AI
  regulatory: 'regulatoryAIServicePhase3',

  // Knowledge extraction
  factExtraction: 'openai-orchestrator',
  cmcAnalysis: 'openai-orchestrator',
  ectdCoauthor: 'openai-orchestrator',
} as const;

export type AICapability = keyof typeof AI_SERVICE_REGISTRY;

/**
 * Get the recommended service for a given AI capability
 */
export function getServiceForCapability(capability: AICapability): string {
  return AI_SERVICE_REGISTRY[capability];
}

/**
 * Check if a capability is available
 */
export function isCapabilityAvailable(capability: string): capability is AICapability {
  return capability in AI_SERVICE_REGISTRY;
}
