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

// Re-export from root services that should be accessed via this module
export {
  createAssistant,
  createThread,
  addMessageToThread,
  runAssistant,
  getRunStatus,
  listMessages,
} from '../openai-service';
// Legacy surfaces (waitForRunCompletion / getMessages / submitToolOutputs /
// cancelRun) were removed from openai-service. Keep no-op stubs here so
// downstream callers compile until they get updated.
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
