/**
 * useAnaChat — streaming-chat controller for the Claude Design AnA RI shell.
 *
 * Wires the composer + chat view to POST /api/ana-ri/stream with the SSE
 * contract defined in server/routes/ana-ri/stream.ts.
 *
 * Events handled:
 *   status       — progress phases during orchestration / context assembly
 *   thread_id    — captured for continuity across turns
 *   orchestration — metadata (noop at this layer)
 *   text         — token chunk appended to the streaming message
 *   done         — captures latencyMs + provider (fallback detection)
 *   post_done    — cleaned response + executedActions chips
 *   warning      — degraded-mode signal (noop for now)
 *   grounding_strip — evidence verdict (noop for now)
 *   error        — surface via console + last-message flag
 *
 * @module client/src/concept2cure/components/ana/useAnaChat
 */

import { useCallback, useRef, useState } from 'react';

import { getAuthHeaders } from '@/utils/authToken';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';

/** Shape of an action chip produced by the server's guidance/command executors. */
export interface AnaChatAction {
  label: string;
  actionType?: string;
  artifactId?: string;
  sectionCode?: string;
  executed?: boolean;
  error?: string;
}

export interface AnaChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** True while tokens are still arriving for this message. */
  streaming?: boolean;
  /**
   * Progress phase label shown while streaming before the first token arrives
   * (e.g. "Planning response…", "Loading project memory…", "Generating…").
   * Cleared once the first text chunk lands.
   */
  statusPhase?: string;
  /** Action chips produced by the server's guidance / command executors. */
  executedActions?: AnaChatAction[];
  /** Round-trip latency from the server's `done` event. */
  latencyMs?: number;
  /** True if the response came from a fallback provider (non-Anthropic). */
  fallback?: boolean;
  /** True if the user explicitly stopped the stream. */
  stopped?: boolean;
  /**
   * Intent lens AnA detected for this turn (audit / risk / strategy /
   * improve / compare / auto). Rendered as a small meta chip.
   */
  detectedLens?: string;
  /**
   * Document-action suggestions from the orchestrator. Tapping one sends
   * a follow-up message that triggers the action's generator.
   */
  suggestedActions?: string[];
  /**
   * Extended-thinking tokens streamed separately from the answer. Shown
   * in a collapsible "Reasoning" section for high-risk turns.
   */
  thinking?: string;
  /**
   * Evidence grounding summary from the server's validateEvidence pipeline.
   * Surfaced as a small chip (e.g. "✓ 8 sources · 12 grounded claims").
   */
  evidence?: {
    validated: boolean;
    sourceCount: number;
    groundedClaims: number;
    weakClaims: number;
    missingSupport: number;
  };
  /** Degraded-mode signals from server `warning` events (thread persistence etc.). */
  warnings?: string[];
  /** Timestamp (ms) when this turn was kicked off. Used for relative time chips. */
  sentAt?: number;
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
  /**
   * Authoring context pack — section/artifact/dossier identity. When present,
   * the hook unpacks this into `project_context`, `document_context`, and
   * `authoring_context` on the request body so the server-side orchestrator
   * grounds AnA on the right project, document, and section instead of
   * guessing from the message text. Mirrors the AnaPersistentPanel contract.
   */
  authoringContext?: AuthoringContextPack | null;
  /**
   * Extra per-surface context object forwarded under `module_context` for
   * surface-specific server-side handling (e.g. eCTD coauthor pane state).
   */
  moduleContext?: Record<string, unknown> | null;
}

export interface UseAnaChatReturn {
  messages: AnaChatMessage[];
  isStreaming: boolean;
  /** Send a user message and stream the assistant reply. */
  send: (text: string) => Promise<void>;
  /** Abort the current stream. */
  stop: () => void;
  /** Reset the conversation (new thread). */
  reset: () => void;
  /** Hydrate the panel with an existing thread's messages. */
  loadThread: (threadId: string) => Promise<void>;
  /** Current thread id (from server once the first message is persisted). */
  threadId: string | null;
  /** True while loadThread is fetching messages. */
  isLoadingThread: boolean;
}

export function useAnaChat(options: UseAnaChatOptions): UseAnaChatReturn {
  const [messages, setMessages] = useState<AnaChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const threadIdRef = useRef<string | null>(options.initialThreadId || null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    threadIdRef.current = null;
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    if (!threadId) return;
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsLoadingThread(true);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=100`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
          credentials: 'include',
        }
      );
      if (!res.ok) {
        console.warn('[useAnaChat] loadThread non-ok:', res.status);
        return;
      }
      const body = (await res.json()) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const rows = Array.isArray(body.messages) ? body.messages : [];
      const hydrated: AnaChatMessage[] = rows
        .filter(
          m =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.length > 0
        )
        .map((m, idx) => ({
          id: `t-${threadId}-${idx}`,
          role: m.role as 'user' | 'assistant',
          text: m.content as string,
        }));
      threadIdRef.current = threadId;
      setMessages(hydrated);
    } catch (err: any) {
      console.warn('[useAnaChat] loadThread failed:', err?.message);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isStreaming) return;

      const sentAt = Date.now();
      const userMsg: AnaChatMessage = {
        id: `u-${sentAt}`,
        role: 'user',
        text,
        sentAt,
      };
      const assistantId = `a-${sentAt}`;

      // Insert placeholder immediately so the user sees a progress indicator
      // before the first token arrives (status phases fill in the label).
      setMessages(prev => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          streaming: true,
          statusPhase: 'Planning response…',
          sentAt,
        },
      ]);
      setIsStreaming(true);

      const abortCtl = new AbortController();
      abortRef.current = abortCtl;

      // Capture done-event fields before post_done arrives
      let capturedLatencyMs: number | undefined;
      let capturedProvider: string | undefined;
      let streamedThinking = '';

      // Unpack the AuthoringContextPack into the three typed slots the server
      // orchestrator reads (`project_context`, `document_context`,
      // `authoring_context`). Without this, the server has the orchestrator
      // wired to consume rich context but the client never sends any —
      // so AnA falls back to detecting project / submission type from the
      // user's message text alone.
      const ac = options.authoringContext ?? null;
      const submissionTypeForContext = ac?.submissionType ?? options.submissionType ?? undefined;
      const projectContext =
        ac || options.projectName || submissionTypeForContext
          ? {
              productName: options.projectName ?? undefined,
              submissionType: submissionTypeForContext,
              targetAgency: ac?.regulatorBody ?? undefined,
            }
          : undefined;
      const documentContext = ac
        ? {
            section: ac.sectionCode,
            module: ac.moduleCode,
          }
        : undefined;
      const authoringContextOut = ac
        ? {
            projectId: String(ac.projectId),
            workflowStage: ac.workflowStage,
            artifactId: ac.artifactId,
            artifactVersionId: ac.artifactVersionId,
            artifactStatus: ac.artifactStatus,
            sectionCode: ac.sectionCode,
            moduleCode: ac.moduleCode,
            sectionTitle: ac.sectionTitle,
            regulatorBody: ac.regulatorBody,
            domainTrack: ac.domainTrack,
            submissionType: ac.submissionType,
          }
        : undefined;

      const body = JSON.stringify({
        message: text,
        thread_id: threadIdRef.current || undefined,
        project_id: options.projectId || ac?.projectId || undefined,
        submission_type: submissionTypeForContext,
        user_role: options.userRole || undefined,
        project_context: projectContext,
        document_context: documentContext,
        authoring_context: authoringContextOut,
        module_context: options.moduleContext ?? undefined,
        context: {
          screen: options.screenName,
          project: options.projectName,
          projectId: options.projectId,
          productType: submissionTypeForContext,
          userRole: options.userRole,
          screenName: options.screenName,
          // Surface artifact + section identity in the legacy context block too,
          // so any handler that still reads `body.context.*` keeps working.
          activeProject: options.projectName ?? undefined,
          artifactId: ac?.artifactId,
          artifactTitle: ac?.sectionTitle,
          sectionCode: ac?.sectionCode,
          module: ac?.moduleCode,
          artifactStatus: ac?.artifactStatus,
        },
        conversation_history: messages.slice(-10).map(m => ({
          role: m.role,
          content: m.text,
        })),
      });

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
            } else if (event.type === 'orchestration') {
              // Capture detected intent lens + suggested follow-up actions
              // so the UI can show "Audit"/"Risk" chips and next-action pills.
              const o = event.orchestration || {};
              const lens: string | undefined = o?.detectedIntent?.lens;
              const actions: string[] | undefined = Array.isArray(o?.suggestedActions)
                ? o.suggestedActions.filter((s: any) => typeof s === 'string')
                : undefined;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        detectedLens: lens && lens !== 'auto' ? lens : m.detectedLens,
                        suggestedActions: actions && actions.length > 0 ? actions : m.suggestedActions,
                      }
                    : m
                )
              );
            } else if (event.type === 'status') {
              // Update the progress label on the placeholder while no tokens
              // have arrived yet (statusPhase is cleared on first text chunk).
              const phase: string = event.message || event.phase || '';
              if (phase) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId && m.text === ''
                      ? { ...m, statusPhase: phase }
                      : m
                  )
                );
              }
            } else if (event.type === 'text') {
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedText += chunk;
              const next = streamedText;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, text: next, statusPhase: undefined }
                    : m
                )
              );
            } else if (event.type === 'thinking') {
              // Extended-thinking delta — accumulate separately from answer
              // text. Also clear the statusPhase since AnA has begun working.
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedThinking += chunk;
              const thinkingNow = streamedThinking;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, thinking: thinkingNow, statusPhase: undefined }
                    : m
                )
              );
            } else if (event.type === 'done') {
              capturedLatencyMs = typeof event.latencyMs === 'number' ? event.latencyMs : undefined;
              capturedProvider = typeof event.provider === 'string' ? event.provider : undefined;
            } else if (event.type === 'post_done') {
              const cleaned: string | undefined = event.cleanedResponse;
              const actions: AnaChatAction[] | undefined = Array.isArray(event.executedActions)
                ? (event.executedActions as AnaChatAction[])
                : undefined;
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantId) return m;
                  return {
                    ...m,
                    text:
                      typeof cleaned === 'string' && cleaned.trim().length > 0
                        ? cleaned
                        : m.text,
                    streaming: false,
                    statusPhase: undefined,
                    executedActions: actions,
                    latencyMs: capturedLatencyMs,
                    fallback:
                      capturedProvider !== undefined
                        ? capturedProvider !== 'anthropic'
                        : undefined,
                  };
                })
              );
            } else if (event.type === 'grounding_strip') {
              // Evidence verdict — store as a compact summary for chip rendering.
              const ev = event.evidence || {};
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        evidence: {
                          validated: Boolean(ev.validated),
                          sourceCount: typeof ev.source_count === 'number' ? ev.source_count : 0,
                          groundedClaims:
                            typeof ev.grounded_claim_count === 'number' ? ev.grounded_claim_count : 0,
                          weakClaims:
                            typeof ev.weak_or_ungrounded_claim_count === 'number'
                              ? ev.weak_or_ungrounded_claim_count
                              : 0,
                          missingSupport:
                            typeof ev.missing_support_count === 'number' ? ev.missing_support_count : 0,
                        },
                      }
                    : m
                )
              );
            } else if (event.type === 'warning') {
              const msg: string = event.message || '';
              if (msg) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, warnings: [...(m.warnings || []), msg] }
                      : m
                  )
                );
              }
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Stream error');
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User stopped — mark stopped and seal whatever tokens rendered.
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, streaming: false, statusPhase: undefined, stopped: true }
                : m
            )
          );
        } else {
          console.warn('[useAnaChat] stream failed:', err?.message);
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantId) return m;
              return {
                ...m,
                text:
                  m.text.length > 0
                    ? m.text
                    : 'Sorry — AnA is unreachable right now. Please try again.',
                streaming: false,
                statusPhase: undefined,
              };
            })
          );
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isStreaming,
      messages,
      options.projectId,
      options.screenName,
      options.projectName,
      options.userRole,
      options.submissionType,
      options.authoringContext,
      options.moduleContext,
    ]
  );

  return {
    messages,
    isStreaming,
    send,
    stop,
    reset,
    loadThread,
    threadId: threadIdRef.current,
    isLoadingThread,
  };
}
