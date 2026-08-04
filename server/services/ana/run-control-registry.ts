/**
 * AnA run control registry — pause / resume / interject / cancel for an
 * in-flight streaming turn.
 *
 * The live AnA chat runs a bounded multi-round agentic loop over SSE. Today the
 * only control is a client-side `fetch` abort that does not even stop the
 * server. This registry gives the human real mid-run control: it holds a tiny
 * control record per active run (keyed by an opaque `runId` the stream emits to
 * the client), which the stream's round-boundary checkpoint consults to pause
 * between rounds, splice in a steering "interjection", or cancel outright.
 *
 * Scope note (deliberate, documented): the registry is **process-local
 * in-memory**. The control request and the SSE stream must reach the same
 * server instance, so a multi-instance deployment needs sticky routing (or a
 * shared store / the duplex socket path) for control to bind to the right run.
 * For single-instance and sticky deployments it is fully correct. Records are
 * self-expiring so a crashed/abandoned stream can never leak a control entry.
 *
 * Pure data structure with no I/O — unit-tested without a server.
 *
 * @module server/services/ana/run-control-registry
 */

export type RunStatus = 'running' | 'paused' | 'cancelled';

/**
 * A human control action taken against an in-flight run, recorded on the
 * assistant turn so redirections are themselves part of the auditable decision
 * lineage ("decisions the human made"). Surfaced in the document dossier.
 */
export interface HumanControlEvent {
  action: 'pause' | 'resume' | 'interject' | 'cancel';
  /** The steering text for an interjection. */
  message?: string;
  /** The upcoming round number at which the control was applied. */
  round: number;
  /** ISO-8601 timestamp. */
  at: string;
}

export interface RunControlSnapshot {
  status: RunStatus;
  /** Interjections queued by the human but not yet consumed by the loop. */
  pendingInterjections: number;
}

interface RunControlRecord {
  status: RunStatus;
  pendingInterjections: string[];
  updatedAt: number;
}

/** Interjection text length cap — a steer, not a new document. */
export const MAX_INTERJECTION_CHARS = 2_000;
/** Idle TTL: a run untouched for this long is reaped (crash/abandon safety). */
const RUN_TTL_MS = 30 * 60 * 1000;

class RunControlRegistry {
  private runs = new Map<string, RunControlRecord>();

  private now(): number {
    return Date.now();
  }

  /** Drop records older than the TTL — called opportunistically on every op. */
  private reap(): void {
    const cutoff = this.now() - RUN_TTL_MS;
    for (const [id, rec] of this.runs) {
      if (rec.updatedAt < cutoff) this.runs.delete(id);
    }
  }

  /** Begin tracking a run. Idempotent; re-registering resets it to running. */
  register(runId: string): void {
    if (!runId) return;
    this.reap();
    this.runs.set(runId, {
      status: 'running',
      pendingInterjections: [],
      updatedAt: this.now(),
    });
  }

  /** Stop tracking a run (call in the stream's finally). */
  deregister(runId: string): void {
    this.runs.delete(runId);
  }

  has(runId: string): boolean {
    return this.runs.has(runId);
  }

  getStatus(runId: string): RunStatus | null {
    return this.runs.get(runId)?.status ?? null;
  }

  isCancelled(runId: string): boolean {
    return this.runs.get(runId)?.status === 'cancelled';
  }

  snapshot(runId: string): RunControlSnapshot | null {
    const rec = this.runs.get(runId);
    if (!rec) return null;
    return { status: rec.status, pendingInterjections: rec.pendingInterjections.length };
  }

  /** Pause between rounds. No-op if cancelled. Returns false if the run is unknown. */
  requestPause(runId: string): boolean {
    const rec = this.runs.get(runId);
    if (!rec || rec.status === 'cancelled') return false;
    rec.status = 'paused';
    rec.updatedAt = this.now();
    return true;
  }

  /** Resume a paused run. No-op if cancelled. Returns false if the run is unknown. */
  requestResume(runId: string): boolean {
    const rec = this.runs.get(runId);
    if (!rec || rec.status === 'cancelled') return false;
    rec.status = 'running';
    rec.updatedAt = this.now();
    return true;
  }

  /** Cancel a run — terminal; the loop stops at the next round boundary. */
  requestCancel(runId: string): boolean {
    const rec = this.runs.get(runId);
    if (!rec) return false;
    rec.status = 'cancelled';
    rec.updatedAt = this.now();
    return true;
  }

  /**
   * Queue a steering interjection. Trimmed + capped; empty text is rejected.
   * Interjecting also resumes a paused run so the loop picks the steer up on the
   * next round. Returns false if the run is unknown/cancelled or text is empty.
   */
  requestInterject(runId: string, message: string): boolean {
    const rec = this.runs.get(runId);
    if (!rec || rec.status === 'cancelled') return false;
    const trimmed = (message ?? '').trim();
    if (!trimmed) return false;
    rec.pendingInterjections.push(trimmed.slice(0, MAX_INTERJECTION_CHARS));
    if (rec.status === 'paused') rec.status = 'running';
    rec.updatedAt = this.now();
    return true;
  }

  /** Drain queued interjections (consumed by the loop at a round boundary). */
  consumeInterjections(runId: string): string[] {
    const rec = this.runs.get(runId);
    if (!rec || rec.pendingInterjections.length === 0) return [];
    const out = rec.pendingInterjections;
    rec.pendingInterjections = [];
    rec.updatedAt = this.now();
    return out;
  }

  /** Test-only: forget all runs. */
  _resetForTest(): void {
    this.runs.clear();
  }
}

/** Process-wide singleton (see scope note in the module docstring). */
export const runControlRegistry = new RunControlRegistry();
