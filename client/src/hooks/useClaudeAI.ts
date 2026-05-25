/**
 * useClaudeAI — React hook for Claude Intelligence API
 *
 * Provides easy access to all Claude endpoints:
 * - Document drafting (with streaming)
 * - Compliance review
 * - Gap analysis
 * - Vision (image analysis)
 * - Quick completion
 * - Agentic tool-use workflows
 *
 * Usage:
 *   const claude = useClaudeAI();
 *
 *   // Quick completion
 *   const result = await claude.quick('Summarize the 510(k) requirements');
 *
 *   // Draft with streaming
 *   claude.draft({
 *     framework: 'fda_510k',
 *     sectionType: 'Device Description',
 *     instructions: '...',
 *   });
 */

import { useState, useCallback } from 'react';
import { apiRequest } from '../lib/queryClient';
import { useClaudeStream } from './useClaudeStream';
import type { StreamMetadata } from './useClaudeStream';

export interface ClaudeResponse {
  content: string;
  thinking?: string;
  toolsUsed?: string[];
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  cacheHit?: boolean;
  latencyMs: number;
}

export interface DraftRequest {
  framework: string;
  sectionType: string;
  instructions: string;
  existingContent?: string;
  projectContext?: {
    deviceName?: string;
    deviceType?: string;
    indication?: string;
    predicateDevice?: string;
    classification?: string;
  };
  enableThinking?: boolean;
  enableTools?: boolean;
}

export function useClaudeAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useClaudeStream();

  // Helper for POST requests
  const post = useCallback(async (endpoint: string, body: Record<string, unknown>): Promise<any> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest('POST', `/api/claude/${endpoint}`, body);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Request failed');
      return data.data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Draft a regulatory document section (non-streaming) */
  const draft = useCallback(
    // DraftRequest is a typed JSON body; widen to the request-body record shape.
    (req: DraftRequest) => post('draft', req as unknown as Record<string, unknown>),
    [post]
  );

  /** Draft with streaming — use stream.streamingContent for real-time text */
  const draftStream = useCallback(
    (req: DraftRequest) => {
      // DraftRequest is a typed JSON body; widen to the request-body record shape.
      stream.startStream('/api/claude/draft/stream', req as unknown as Record<string, unknown>);
    },
    [stream]
  );

  /** Compliance review */
  const review = useCallback(
    (content: string, framework: string, enableThinking = true) =>
      post('review', { content, framework, enableThinking }),
    [post]
  );

  /** Gap analysis */
  const gapAnalysis = useCallback(
    (documentContent: string, framework: string, targetSections: string[]) =>
      post('gap-analysis', { documentContent, framework, targetSections }),
    [post]
  );

  /** Vision — analyze an image */
  const analyzeImage = useCallback(
    (imageData: string, mediaType: string, instructions: string, framework?: string) =>
      post('vision', { imageData, mediaType, instructions, framework }),
    [post]
  );

  /** Quick completion (Sonnet, fast) */
  const quick = useCallback(
    async (prompt: string, framework?: string): Promise<string> => {
      const result = await post('quick', { prompt, framework });
      return result.content;
    },
    [post]
  );

  /** Agentic tool-use workflow */
  const agent = useCallback(
    (prompt: string, options?: { framework?: string; systemPrompt?: string; maxRounds?: number }) =>
      post('agent', { prompt, ...options }),
    [post]
  );

  /** Batch draft multiple sections */
  const batch = useCallback(
    (requests: DraftRequest[], concurrency = 3) =>
      post('batch', { requests, concurrency }),
    [post]
  );

  return {
    // Non-streaming operations
    draft,
    review,
    gapAnalysis,
    analyzeImage,
    quick,
    agent,
    batch,

    // Streaming operations
    draftStream,
    stream, // Full stream state (streamingContent, thinking, isStreaming, etc.)

    // State
    isLoading,
    error,
  };
}

export default useClaudeAI;
