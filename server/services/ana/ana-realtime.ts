/**
 * @fileoverview ANA real-time duplex chat transport (text only — no voice).
 * @module server/services/ana/ana-realtime
 *
 * A persistent, interruptible conversation channel for ANA over the existing
 * socket.io server. Unlike the request/response HTTP chat, a session stays open:
 * the client streams a message, ANA streams tokens + tool progress back, and a
 * NEW message (or an explicit cancel) barges in on any in-flight response — the
 * defining property of full-duplex. Text only; no audio.
 *
 * Reuses the platform end to end: JWT auth + tenant scoping (mirroring
 * socketServer.ts), intent-based tool selection, and the governed agentic loop —
 * so tool execution, governance, and audit are identical to the HTTP path. The
 * session orchestration is transport-agnostic and runner-injected, so it
 * unit-tests without sockets or a model.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';

import { createScopedLogger } from '../../utils/logger.js';
import { verifyJwtWithRotation } from '../../utils/jwtVerify.js';
import type { GatewayRequest } from '../ai-gateway/types.js';
import { getAllEnabledTools } from './AnaToolDefinitions.js';
import { selectToolsForTurn, type ToolSelectionContext } from './tool-selection.js';
import { executeAgenticLoop } from './AnaToolExecutor.js';

const log = createScopedLogger('ana-realtime');

export type RealtimeEmit = (event: string, payload: Record<string, unknown>) => void;

export interface TurnInput {
  turnId: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  organizationId: number;
  userId: number;
  projectId?: number | null;
  /** Tools the user pinned in the picker — always offered. */
  selectedTools?: string[];
  /** Situational context for tool selection (project/document/surface). */
  context?: ToolSelectionContext;
}

export interface TurnResult {
  text: string;
}

export type RunTurn = (input: TurnInput, signal: AbortSignal, emit: RealtimeEmit) => Promise<TurnResult>;

/**
 * Orchestrates one socket's duplex conversation. A new message barges in on any
 * in-flight turn (cancel + start); an explicit cancel stops the current turn;
 * disconnect disposes. The output of a superseded/cancelled turn is suppressed,
 * so the user only ever sees the live response.
 */
export class AnaRealtimeSession {
  private current: AbortController | null = null;

  constructor(
    private readonly emit: RealtimeEmit,
    private readonly runTurn: RunTurn,
  ) {}

  get busy(): boolean {
    return this.current !== null;
  }

  async handleMessage(input: TurnInput): Promise<void> {
    // Barge-in: a new message supersedes any in-flight turn.
    this.cancel('superseded');
    const controller = new AbortController();
    this.current = controller;
    this.emit('ana:thinking', { turnId: input.turnId });
    try {
      const result = await this.runTurn(input, controller.signal, this.emit);
      if (!controller.signal.aborted) {
        this.emit('ana:done', { turnId: input.turnId, text: result.text });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.emit('ana:error', { turnId: input.turnId, error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      if (this.current === controller) this.current = null;
    }
  }

  /** Interrupt the in-flight turn (barge-in / stop button). */
  cancel(reason: string): void {
    const c = this.current;
    if (c) {
      this.current = null;
      c.abort();
      this.emit('ana:cancelled', { reason });
    }
  }

  /** Tear down on disconnect — abort silently (no client to notify). */
  dispose(): void {
    const c = this.current;
    if (c) {
      this.current = null;
      c.abort();
    }
  }
}

/**
 * Production turn runner: intent-selected tools + the governed agentic loop,
 * streaming tokens and tool progress. Output is suppressed once the turn is
 * aborted so a barged-in turn goes quiet immediately.
 */
export const runAgenticTurn: RunTurn = async (input, signal, emit) => {
  const tools = selectToolsForTurn(getAllEnabledTools(), input.message, {
    pinned: input.selectedTools,
    context: input.context,
  });

  const request: GatewayRequest = {
    taskType: 'chat',
    messages: [
      ...(input.history ?? []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.message },
    ],
    maxTokens: 4096,
    temperature: 0.6,
    stream: true,
    callerModule: 'ana-realtime',
    organizationId: input.organizationId,
    userId: input.userId,
    tools,
    toolChoice: 'auto',
    onStream: (chunk: string) => {
      if (!signal.aborted && chunk) emit('ana:token', { turnId: input.turnId, chunk });
    },
  };

  const response = await executeAgenticLoop(request, {
    maxRounds: 5,
    signal,
    toolContext: {
      organizationId: input.organizationId,
      userId: input.userId,
      projectId: input.projectId ?? null,
    },
    onToolExecution: toolName => {
      if (!signal.aborted) emit('ana:tool', { turnId: input.turnId, tool: toolName });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (response as any)?.content ?? (response as any)?.text ?? (response as any)?.message ?? '';
  return { text: typeof raw === 'string' ? raw : String(raw ?? '') };
};

interface AuthedSocket extends Socket {
  orgId?: string;
  authUserId?: string;
}

/**
 * Attach the ANA real-time duplex namespace (`/ana`) to the socket.io server.
 * Text-only. Clients send `ana:message`, receive `ana:thinking` → `ana:token` /
 * `ana:tool` → `ana:done`, and interrupt with `ana:cancel` (barge-in). Each
 * socket is JWT-authenticated and tenant-scoped.
 */
export function registerAnaRealtime(io: SocketIOServer, runTurn: RunTurn = runAgenticTurn): void {
  const ns = io.of('/ana');

  ns.use((socket: AuthedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Missing bearer token'));
      const decoded = verifyJwtWithRotation(token as string) as { organizationId?: unknown; userId?: unknown };
      if (!decoded?.organizationId || !decoded?.userId) return next(new Error('Invalid token claims'));
      socket.orgId = String(decoded.organizationId);
      socket.authUserId = String(decoded.userId);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  ns.on('connection', (socket: AuthedSocket) => {
    const organizationId = Number(socket.orgId);
    const userId = Number(socket.authUserId);
    if (!Number.isFinite(organizationId) || !Number.isFinite(userId)) {
      socket.disconnect(true);
      return;
    }

    const emit: RealtimeEmit = (event, payload) => socket.emit(event, payload);
    const session = new AnaRealtimeSession(emit, runTurn);

    socket.on('ana:message', (data: {
      turnId?: string;
      message?: string;
      projectId?: number;
      history?: Array<{ role?: string; content?: string }>;
      selectedTools?: string[];
      context?: ToolSelectionContext;
    }) => {
      const message = typeof data?.message === 'string' ? data.message.trim() : '';
      if (!message) {
        socket.emit('ana:error', { error: 'message is required' });
        return;
      }
      void session.handleMessage({
        turnId: typeof data?.turnId === 'string' && data.turnId ? data.turnId : `t_${Date.now()}`,
        message,
        history: Array.isArray(data?.history)
          ? data.history
              .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
              .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))
          : undefined,
        organizationId,
        userId,
        projectId: typeof data?.projectId === 'number' ? data.projectId : null,
        selectedTools: Array.isArray(data?.selectedTools)
          ? data.selectedTools.filter((t): t is string => typeof t === 'string')
          : undefined,
        context: data?.context && typeof data.context === 'object' ? data.context : undefined,
      });
    });

    socket.on('ana:cancel', () => session.cancel('user_cancel'));
    socket.on('disconnect', () => session.dispose());
    socket.on('error', (err: Error) => log.warn(`ana-realtime socket error: ${err?.message}`));
  });

  log.debug('ANA real-time duplex namespace (/ana) registered');
}
