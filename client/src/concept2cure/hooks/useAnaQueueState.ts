/**
 * useAnaQueueState — Proper queue state machine for AnA conversation turns
 *
 * Replaces the `isThinking` boolean that was used in Ana.
 * Provides a real state machine with the following states:
 *
 * - idle: Ready to accept a new message
 * - queued: Message submitted, waiting for processing
 * - streaming: AI is streaming a response
 * - post_processing: Response complete, executing commands/actions
 * - blocked: Turn failed or persistence failed
 * - completed: Turn finished successfully
 *
 * Salvaged from PR #309's queue concept, with proper guards.
 *
 * @module client/src/concept2cure/hooks/useAnaQueueState
 */

import { useCallback, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueueStatus =
  | 'idle'
  | 'queued'
  | 'streaming'
  | 'post_processing'
  | 'blocked'
  | 'completed';

export interface QueueState {
  status: QueueStatus;
  turnId: string | null;
  threadId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  blockedReason: string | null;
  /** Whether the user can submit a new message */
  canSubmit: boolean;
}

export interface UseAnaQueueStateReturn {
  state: QueueState;
  /** Start a new turn — transitions from idle to queued */
  startTurn: () => string;
  /** Mark that streaming has begun */
  markStreaming: (threadId?: string | null) => void;
  /** Mark that streaming is done, now in post-processing */
  markPostProcessing: () => void;
  /** Complete the turn successfully */
  completeTurn: () => void;
  /** Block the turn due to an error */
  blockTurn: (reason: string) => void;
  /** Reset to idle (after user acknowledges blocked state or timeout) */
  reset: () => void;
  /** Duration of current/last turn in ms */
  turnDurationMs: number | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function generateTurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const INITIAL_STATE: QueueState = {
  status: 'idle',
  turnId: null,
  threadId: null,
  startedAt: null,
  completedAt: null,
  blockedReason: null,
  canSubmit: true,
};

export function useAnaQueueState(): UseAnaQueueStateReturn {
  const [state, setState] = useState<QueueState>(INITIAL_STATE);
  const turnIdRef = useRef<string | null>(null);

  const startTurn = useCallback((): string => {
    const turnId = generateTurnId();
    turnIdRef.current = turnId;
    setState({
      status: 'queued',
      turnId,
      threadId: null,
      startedAt: Date.now(),
      completedAt: null,
      blockedReason: null,
      canSubmit: false,
    });
    return turnId;
  }, []);

  const markStreaming = useCallback((threadId?: string | null) => {
    setState(prev => {
      if (prev.status !== 'queued') return prev;
      return {
        ...prev,
        status: 'streaming',
        threadId: threadId ?? prev.threadId,
      };
    });
  }, []);

  const markPostProcessing = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'streaming') return prev;
      return {
        ...prev,
        status: 'post_processing',
      };
    });
  }, []);

  const completeTurn = useCallback(() => {
    setState(prev => ({
      ...prev,
      status: 'completed',
      completedAt: Date.now(),
      canSubmit: true,
    }));
    // Auto-transition to idle after a short delay
    setTimeout(() => {
      setState(prev => {
        if (prev.status !== 'completed') return prev;
        return { ...INITIAL_STATE };
      });
    }, 100);
  }, []);

  const blockTurn = useCallback((reason: string) => {
    setState(prev => ({
      ...prev,
      status: 'blocked',
      completedAt: Date.now(),
      blockedReason: reason,
      canSubmit: true, // Allow retry on block
    }));
  }, []);

  const reset = useCallback(() => {
    turnIdRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const turnDurationMs = state.startedAt
    ? (state.completedAt || Date.now()) - state.startedAt
    : null;

  return {
    state,
    startTurn,
    markStreaming,
    markPostProcessing,
    completeTurn,
    blockTurn,
    reset,
    turnDurationMs,
  };
}
