/**
 * useAnaChatClient — Canonical AnA runtime adapter
 *
 * Replaces the direct fetch + fallback chain that was embedded inside
 * ClaudeAna. Provides a single hook that:
 *
 * 1. Sends messages through the canonical /api/ana-ri/stream endpoint
 * 2. Falls back to /api/ana-ri/chat only when streaming fails (with fallback marker)
 * 3. Uses centralized auth from authToken.ts (no direct localStorage)
 * 4. Parses SSE events into typed callbacks
 * 5. Returns structured metadata (evidence, queue, orchestration)
 *
 * @module client/src/concept2cure/hooks/useAnaChatClient
 */

import { useCallback, useRef, useState } from 'react';
import { getAuthHeaders } from '@/utils/authToken';
import { apiRequest } from '@/lib/queryClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnaChatRequest {
  message: string;
  thread_id?: string | null;
  intent_lens?: string;
  user_role?: string;
  project_id?: number | string;
  project_context?: Record<string, unknown>;
  document_context?: Record<string, unknown>;
  submission_type?: string;
  conversation_history?: Array<{ role: string; content: string }>;
  authoring_context?: Record<string, unknown>;
  file_ids?: number[];
  useFirecrawl?: boolean;
  idempotency_key?: string;
}

export interface AnaStreamEvent {
  type: 'text' | 'thread_id' | 'orchestration' | 'grounding_strip' | 'warning' | 'done' | 'error';
  content?: string;
  thread_id?: string;
  orchestration?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  model?: string;
  provider?: string;
  usage?: Record<string, unknown>;
  executedActions?: unknown[];
  executedCommands?: unknown[];
  enrichmentSources?: string[];
  queueMeta?: {
    thread_id: string | null;
    handoff_ready: boolean;
    turn_status: string;
    can_process_next: boolean;
    blocked_reason: string | null;
  };
  error?: string;
  message?: string;
}

export interface AnaChatResult {
  response: string;
  thread_id: string | null;
  orchestration: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  usage: Record<string, unknown> | null;
  executedActions: unknown[];
  executedCommands: unknown[];
  enrichmentSources: string[];
  queueMeta: AnaStreamEvent['queueMeta'] | null;
  /** Whether this result came from the fallback (non-streaming) path */
  fallback: boolean;
  fallbackReason: string | null;
}

export interface UseAnaChatClientReturn {
  /** Send a message to AnA */
  sendMessage: (request: AnaChatRequest) => Promise<AnaChatResult>;
  /** Abort the current request */
  abort: () => void;
  /** Whether a request is in progress */
  isStreaming: boolean;
  /** Stream event callback ref — set to get real-time events */
  onStreamEvent: { current: ((event: AnaStreamEvent) => void) | null };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAnaChatClient(): UseAnaChatClientReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onStreamEvent = useRef<((event: AnaStreamEvent) => void) | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendViaStream = useCallback(async (request: AnaChatRequest): Promise<AnaChatResult> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const headers = getAuthHeaders();
    const response = await fetch('/api/ana-ri/stream', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: 'include',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Stream failed: ${response.status} ${text}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const result: AnaChatResult = {
      response: '',
      thread_id: null,
      orchestration: null,
      evidence: null,
      model: null,
      provider: null,
      usage: null,
      executedActions: [],
      executedCommands: [],
      enrichmentSources: [],
      queueMeta: null,
      fallback: false,
      fallbackReason: null,
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let done = false;
    while (!done) {
      const readResult = await reader.read();
      done = readResult.done;
      if (done) break;
      const value = readResult.value;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const event: AnaStreamEvent = JSON.parse(data);
          onStreamEvent.current?.(event);

          switch (event.type) {
            case 'text':
              result.response += event.content || '';
              break;
            case 'thread_id':
              result.thread_id = event.thread_id || null;
              break;
            case 'orchestration':
              result.orchestration = event.orchestration || null;
              break;
            case 'grounding_strip':
              result.evidence = event.evidence || null;
              break;
            case 'done':
              result.model = event.model || null;
              result.provider = event.provider || null;
              result.usage = event.usage || null;
              result.executedActions = event.executedActions || [];
              result.executedCommands = event.executedCommands || [];
              result.enrichmentSources = event.enrichmentSources || [];
              result.queueMeta = event.queueMeta || null;
              // Done event may also carry evidence
              if (event.evidence && !result.evidence) {
                result.evidence = event.evidence;
              }
              break;
            case 'error':
              throw new Error(event.error || 'Stream error');
          }
        } catch (parseError) {
          // Malformed SSE line — skip
          if (parseError instanceof Error && parseError.message === 'Stream error') {
            throw parseError;
          }
        }
      }
    }

    return result;
  }, []);

  const sendViaChat = useCallback(async (request: AnaChatRequest): Promise<AnaChatResult> => {
    const response = await apiRequest('POST', '/api/ana-ri/chat', request);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Chat failed: ${response.status} ${text}`);
    }

    const json = await response.json();
    const data = json.data || json;

    return {
      response: data.response || '',
      thread_id: data.thread_id || null,
      orchestration: data.orchestration || null,
      evidence: data.evidence || null,
      model: data.model || null,
      provider: data.provider || null,
      usage: data.usage || null,
      executedActions: data.executedActions || [],
      executedCommands: data.executedCommands || [],
      enrichmentSources: data.enrichmentSources || [],
      queueMeta: data.queueMeta || null,
      fallback: true,
      fallbackReason: 'stream_unavailable',
    };
  }, []);

  const sendMessage = useCallback(
    async (request: AnaChatRequest): Promise<AnaChatResult> => {
      setIsStreaming(true);
      try {
        // Primary: streaming path (full capabilities)
        return await sendViaStream(request);
      } catch (streamError) {
        // If aborted, don't fallback
        if (streamError instanceof Error && streamError.name === 'AbortError') {
          throw streamError;
        }

        console.warn('[AnaChatClient] Stream failed, falling back to chat:', streamError);

        // Fallback: non-streaming path (with fallback marker)
        try {
          return await sendViaChat(request);
        } catch (chatError) {
          console.error('[AnaChatClient] Both paths failed:', chatError);
          throw chatError;
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [sendViaStream, sendViaChat]
  );

  return { sendMessage, abort, isStreaming, onStreamEvent };
}
