/**
 * useClaudeStream — React hook for Claude streaming responses (SSE)
 *
 * Handles Server-Sent Events from /api/claude/draft/stream and /api/chat/stream
 * with support for text, thinking, and tool_use events.
 *
 * Usage:
 *   const { streamingContent, thinking, isStreaming, error, startStream } = useClaudeStream();
 *
 *   const handleDraft = () => {
 *     startStream('/api/claude/draft/stream', {
 *       framework: 'fda_510k',
 *       sectionType: 'Device Description',
 *       instructions: 'Draft a device description for...',
 *     });
 *   };
 */

import { useState, useCallback, useRef } from 'react';

export interface StreamMetadata {
  model?: string;
  provider?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  cacheHit?: boolean;
  latencyMs?: number;
  toolsUsed?: string[];
}

export interface UseClaudeStreamReturn {
  /** Accumulated text content */
  streamingContent: string;
  /** Extended thinking output */
  thinking: string;
  /** Whether streaming is in progress */
  isStreaming: boolean;
  /** Error message if streaming failed */
  error: string | null;
  /** Response metadata (available after stream completes) */
  metadata: StreamMetadata | null;
  /** Start streaming from an endpoint */
  startStream: (url: string, body: Record<string, unknown>) => void;
  /** Abort the current stream */
  abort: () => void;
  /** Reset state for a new stream */
  reset: () => void;
}

export function useClaudeStream(): UseClaudeStreamReturn {
  const [streamingContent, setStreamingContent] = useState('');
  const [thinking, setThinking] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<StreamMetadata | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStreamingContent('');
    setThinking('');
    setIsStreaming(false);
    setError(null);
    setMetadata(null);
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      // Reset state
      setStreamingContent('');
      setThinking('');
      setError(null);
      setMetadata(null);
      setIsStreaming(true);

      // Create abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Get auth headers
      const organizationId =
        localStorage.getItem('organizationId') ||
        localStorage.getItem('currentOrganizationId') ||
        '1';
      const authToken =
        localStorage.getItem('token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('auth_token');

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-organization-id': organizationId,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Stream request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream available');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'text') {
                setStreamingContent(prev => prev + (event.content || ''));
              } else if (event.type === 'thinking') {
                setThinking(prev => prev + (event.thinking || event.thinkingContent || ''));
              } else if (event.type === 'done') {
                setMetadata({
                  model: event.model,
                  provider: event.provider,
                  usage: event.usage,
                  cacheHit: event.cacheHit,
                  latencyMs: event.latencyMs,
                  toolsUsed: event.toolsUsed,
                });
              } else if (event.type === 'error') {
                setError(event.error || 'Stream error');
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Stream failed');
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    []
  );

  return {
    streamingContent,
    thinking,
    isStreaming,
    error,
    metadata,
    startStream,
    abort,
    reset,
  };
}

export default useClaudeStream;
