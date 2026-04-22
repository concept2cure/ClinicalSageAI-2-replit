/**
 * useAnaChat — streaming-chat controller for the Claude Design AnA RI shell.
 *
 * Hidden implementation layer beneath the bundle-faithful UI. Wires the
 * composer + chat view to POST /api/ana-ri/stream with the SSE contract
 * defined in server/routes/ana-ri/stream.ts.
 *
 * Events the server emits (handled here):
 *   status       — ephemeral context-assembly progress
 *   thread_id    — captured for continuity across turns
 *   orchestration — metadata (noop at this layer)
 *   text         — token chunk appended to the streaming message
 *   done         — main response complete
 *   post_done    — cleaned response + executed actions
 *   warning      — degraded-mode signal (noop for now)
 *   grounding_strip — evidence verdict (noop for now)
 *   error        — surface via console + last-message flag
 *
 * The bundle's chat UX intentionally exposes only copy / retry / thumbs-up /
 * thumbs-down. No stop button, no latency chip, no edit-in-place, no action
 * chips. This hook therefore omits public surface for those — it's a plain
 * send-and-stream controller.
 *
 * @module client/src/concept2cure/components/claude-ana/useAnaChat
 */

import { useCallback, useRef, useState } from 'react';

import { getAuthHeaders } from '@/utils/authToken';

export interface AnaChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** True while tokens are still arriving for this message. */
  streaming?: boolean;
}

export interface UseAnaChatOptions {
  /** Project id for server-side context assembly (intelligence prefix etc.). */
  projectId?: string | number | null;
  /** Screen name passed into the route-context block. */
  screenName?: string | null;
  /** Project name (for context.project). */
  projectName?: string | null;
  /** User role (for role inference / context). */
  userRole?: string | null;
  /** Submission type (IND, NDA, 510K...). */
  submissionType?: string | null;
  /** Optional thread id to resume. */
  initialThreadId?: string | null;
}

export interface UseAnaChatReturn {
  messages: AnaChatMessage[];
  isStreaming: boolean;
  /** Send a user message and stream the assistant reply. */
  send: (text: string) => Promise<void>;
  /** Reset the conversation (new thread). */
  reset: () => void;
  /** Current thread id (from server once the first message is persisted). */
  threadId: string | null;
}

export function useAnaChat(options: UseAnaChatOptions): UseAnaChatReturn {
  const [messages, setMessages] = useState<AnaChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const threadIdRef = useRef<string | null>(options.initialThreadId || null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    threadIdRef.current = null;
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isStreaming) return;

      const userMsg: AnaChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages(prev => [...prev, userMsg]);
      setIsStreaming(true);

      const abortCtl = new AbortController();
      abortRef.current = abortCtl;

      const body = JSON.stringify({
        message: text,
        thread_id: threadIdRef.current || undefined,
        project_id: options.projectId || undefined,
        submission_type: options.submissionType || undefined,
        context: {
          screen: options.screenName,
          project: options.projectName,
          projectId: options.projectId,
          productType: options.submissionType,
          userRole: options.userRole,
          screenName: options.screenName,
        },
        conversation_history: messages.slice(-10).map(m => ({
          role: m.role,
          content: m.text,
        })),
      });

      let placeholderInserted = false;
      let streamedText = '';

      try {
        const res = await fetch('/api/ana-ri/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body,
          signal: abortCtl.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
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
            const payload = line.slice(6).trim();
            if (!payload) continue;

            let event: any;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event.type === 'thread_id' && event.thread_id) {
              threadIdRef.current = event.thread_id;
            } else if (event.type === 'text') {
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedText += chunk;
              if (!placeholderInserted) {
                placeholderInserted = true;
                setMessages(prev => [
                  ...prev,
                  {
                    id: assistantId,
                    role: 'assistant',
                    text: streamedText,
                    streaming: true,
                  },
                ]);
              } else {
                const next = streamedText;
                setMessages(prev =>
                  prev.map(m => (m.id === assistantId ? { ...m, text: next } : m))
                );
              }
            } else if (event.type === 'post_done') {
              // Replace with cleaned response when the server provides one.
              const cleaned: string | undefined = event.cleanedResponse;
              if (typeof cleaned === 'string' && cleaned.trim().length > 0) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId ? { ...m, text: cleaned, streaming: false } : m
                  )
                );
              } else {
                setMessages(prev =>
                  prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
                );
              }
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Stream error');
            }
            // status / orchestration / warning / grounding_strip / done → noop for this shell
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User aborted — leave whatever tokens rendered as-is.
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
          );
        } else {
          console.warn('[useAnaChat] stream failed:', err?.message);
          if (!placeholderInserted) {
            setMessages(prev => [
              ...prev,
              {
                id: assistantId,
                role: 'assistant',
                text:
                  'Sorry — AnA is unreachable right now. Please try again.',
                streaming: false,
              },
            ]);
          } else {
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
            );
          }
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, messages, options.projectId, options.screenName, options.projectName, options.userRole, options.submissionType]
  );

  return {
    messages,
    isStreaming,
    send,
    reset,
    threadId: threadIdRef.current,
  };
}
