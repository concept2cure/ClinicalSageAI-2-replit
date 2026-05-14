/**
 * AnA streaming client — pure async helper that POSTs a chat body to
 * `/api/ana-ri/stream` and returns the assembled response envelope.
 *
 * Extracted from AnaPersistentPanel.tsx as part of the staged split so
 * the streaming + SSE parsing logic isn't entangled with the panel's
 * state. The function is a pure side-effect-free transform of (body,
 * headers) → (envelope, toolCalls, errorCode); state is owned by the
 * caller.
 *
 * The envelope shape is kept compatible with the legacy non-streaming
 * `/api/ana-ri/chat` JSON shape (`{ success, data: { ... } }`) so the
 * caller's downstream unwrap logic doesn't need branching.
 *
 * Failure modes:
 *
 *   - Network error / non-OK HTTP: returns `{ envelope: null, toolCalls: [],
 *     errorCode }`. The caller is expected to fall back to its own
 *     degraded path (Cortex, etc.).
 *   - Mid-stream `error` event: re-thrown as a regular Error. The caller
 *     catches it and falls back the same way.
 *   - Malformed SSE line: skipped silently (the stream continues).
 *
 * @module client/src/concept2cure/components/chat/anaStreamingClient
 */

import type { AnaToolCallRecord } from '../../hooks/useAnaChatClient';

/** Sub-shape of the assembled envelope `data` field. */
export interface AnaStreamData {
  response: string;
  thread_id: string | null;
  orchestration: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  evidenceUsage?: Record<string, unknown>;
  executedActions?: unknown[];
  executedCommands?: unknown[];
  enrichmentSources?: string[];
  model: string | null;
  provider: string | null;
  usage?: Record<string, unknown>;
}

/** Envelope shape that mirrors the non-streaming chat response. */
export interface AnaStreamEnvelope {
  success: true;
  data: AnaStreamData;
}

export interface StreamAnaResult {
  /** Assembled envelope, or null when the stream wasn't usable. */
  envelope: AnaStreamEnvelope | null;
  /** Tool invocations captured in order. Empty if no tools fired. */
  toolCalls: AnaToolCallRecord[];
  /**
   * Server-supplied error code parsed from the JSON body of a non-OK
   * response (e.g. `quota_exhausted`, `policy_blocked`). null when the
   * server returned no parseable code or when the request succeeded.
   */
  errorCode: string | null;
}

interface StreamAnaArgs {
  /** Stringified JSON body to POST. */
  body: string;
  /** Headers to send (typically Content-Type + Authorization). */
  headers: Record<string, string>;
}

/**
 * Stream an AnA RI chat turn and return the assembled envelope.
 * See module docstring for failure semantics.
 */
export async function streamAnaResponse({
  body,
  headers,
}: StreamAnaArgs): Promise<StreamAnaResult> {
  const toolCalls: AnaToolCallRecord[] = [];
  let envelope: AnaStreamEnvelope | null = null;
  let errorCode: string | null = null;

  try {
    const res = await fetch('/api/ana-ri/stream', {
      method: 'POST',
      headers,
      credentials: 'include',
      body,
    });

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => '');
      try {
        const parsed = JSON.parse(errBody);
        errorCode = parsed?.error?.code || parsed?.code || null;
      } catch {
        // Body wasn't JSON — leave errorCode null.
      }
      console.warn(`[AnA RI stream] ${res.status}: ${errBody.slice(0, 200)}`);
      return { envelope: null, toolCalls, errorCode };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const data: AnaStreamData = {
      response: '',
      thread_id: null,
      orchestration: null,
      evidence: null,
      evidenceUsage: undefined,
      executedActions: undefined,
      model: null,
      provider: null,
    };

    let done = false;
    while (!done) {
      const readResult = await reader.read();
      done = readResult.done;
      if (done) break;
      buffer += decoder.decode(readResult.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr) continue;
        try {
          const ev = JSON.parse(dataStr);
          switch (ev.type) {
            case 'text':
              data.response += ev.content || '';
              break;
            case 'thread_id':
              data.thread_id = ev.thread_id || null;
              break;
            case 'orchestration':
              data.orchestration = ev.orchestration || null;
              break;
            case 'grounding_strip':
              data.evidence = ev.evidence || data.evidence;
              break;
            case 'tool_use': {
              if (ev.name) {
                toolCalls.push({
                  name: ev.name,
                  input: ev.input || {},
                  status: 'running',
                });
              }
              break;
            }
            case 'tool_result': {
              if (ev.name) {
                // Match against the most recent running call with the
                // same name. FIFO-by-name is sufficient because a single
                // AnA turn never invokes the same tool twice concurrently.
                for (let i = toolCalls.length - 1; i >= 0; i--) {
                  const c = toolCalls[i];
                  if (c.name === ev.name && c.status === 'running') {
                    c.result = ev.result;
                    try {
                      const parsed = JSON.parse(ev.result || '');
                      c.status =
                        parsed && typeof parsed === 'object' && 'error' in parsed
                          ? 'error'
                          : 'success';
                    } catch {
                      c.status = 'success';
                    }
                    break;
                  }
                }
              }
              break;
            }
            case 'done':
              data.model = ev.model || null;
              data.provider = ev.provider || null;
              data.usage = ev.usage || null;
              data.executedActions = ev.executedActions;
              data.executedCommands = ev.executedCommands;
              data.enrichmentSources = ev.enrichmentSources;
              if (ev.evidence && !data.evidence) {
                data.evidence = ev.evidence;
              }
              break;
            case 'error':
              throw new Error(ev.error || 'Stream error');
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message === 'Stream error') {
            throw parseErr;
          }
          // Malformed SSE line — skip; the stream continues.
        }
      }
    }

    envelope = { success: true, data };
  } catch (err) {
    console.warn('[AnA RI stream] Network/parse error:', (err as Error)?.message);
    return { envelope: null, toolCalls, errorCode };
  }

  return { envelope, toolCalls, errorCode };
}
