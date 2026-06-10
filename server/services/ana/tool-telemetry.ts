/**
 * Tool-execution telemetry — AnA's execution self-awareness.
 *
 * In-memory, per-tool outcome accounting recorded at the handler-registration
 * seam (every dispatch path flows through the registered handler, so coverage
 * is total). Tracks success/degraded/failure counts, consecutive failures,
 * running latency, last error, and input-contract violations (model called a
 * tool without its schema-required fields — report-only, never blocking).
 *
 * Surfaced through describe_capabilities so AnA can see what is ACTUALLY
 * working in this process right now — e.g. stop offering a tool whose
 * integration has failed five times running, and tell the user why.
 *
 * Process-lifetime by design: no schema/migration risk; resets on deploy,
 * which is the correct scope for "is this working right now".
 *
 * @module server/services/ana/tool-telemetry
 */

export interface ToolReliability {
  tool: string;
  calls: number;
  successes: number;
  /** Handler resolved but reported a top-level `error` (integration degraded). */
  degraded: number;
  /** Handler threw. */
  failures: number;
  consecutiveFailures: number;
  avgLatencyMs: number;
  lastError: string | null;
  lastUsedAt: string | null;
  /** Calls missing schema-required fields (report-only). */
  contractViolations: number;
}

const stats = new Map<string, ToolReliability>();

function entry(tool: string): ToolReliability {
  let e = stats.get(tool);
  if (!e) {
    e = {
      tool,
      calls: 0,
      successes: 0,
      degraded: 0,
      failures: 0,
      consecutiveFailures: 0,
      avgLatencyMs: 0,
      lastError: null,
      lastUsedAt: null,
      contractViolations: 0,
    };
    stats.set(tool, e);
  }
  return e;
}

export type ToolOutcome = 'success' | 'degraded' | 'failure';

/** Record one tool execution outcome. */
export function recordToolOutcome(
  tool: string,
  outcome: ToolOutcome,
  latencyMs: number,
  errorNote?: string
): void {
  const e = entry(tool);
  e.calls++;
  // Running mean keeps this O(1) with no history buffer.
  e.avgLatencyMs = Math.round(e.avgLatencyMs + (latencyMs - e.avgLatencyMs) / e.calls);
  e.lastUsedAt = new Date().toISOString();

  if (outcome === 'success') {
    e.successes++;
    e.consecutiveFailures = 0;
  } else if (outcome === 'degraded') {
    e.degraded++;
    e.consecutiveFailures++;
    if (errorNote) e.lastError = errorNote.slice(0, 300);
  } else {
    e.failures++;
    e.consecutiveFailures++;
    if (errorNote) e.lastError = errorNote.slice(0, 300);
  }
}

/** Record a schema-contract violation (missing required input fields). */
export function recordContractViolation(tool: string): void {
  entry(tool).contractViolations++;
}

/** Snapshot of every tool that has been called this process lifetime. */
export function getToolReliability(): ToolReliability[] {
  return Array.from(stats.values()).map(e => ({ ...e }));
}

/** Tools currently looking unhealthy (N+ consecutive non-successes). */
export function getUnhealthyTools(minConsecutiveFailures = 3): ToolReliability[] {
  return getToolReliability().filter(e => e.consecutiveFailures >= minConsecutiveFailures);
}

/** Test hook. */
export function resetToolTelemetry(): void {
  stats.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence (opt-in) — lets learned reliability survive restarts.
//
// The store is pluggable so this module stays fs/DB-free and unit-testable; a
// reference file backend + boot wiring live in tool-telemetry-persistence.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
  version: 1;
  savedAt: string;
  tools: ToolReliability[];
}

export interface TelemetryBackend {
  load(): Promise<TelemetrySnapshot | null>;
  save(snapshot: TelemetrySnapshot): Promise<void>;
}

let backend: TelemetryBackend | null = null;

/** Install (or clear, with null) the persistence backend. */
export function setTelemetryBackend(b: TelemetryBackend | null): void {
  backend = b;
}

export function isTelemetryPersistenceEnabled(): boolean {
  return backend !== null;
}

/** Current state as a serializable snapshot. */
export function snapshotTelemetry(): TelemetrySnapshot {
  return { version: 1, savedAt: new Date().toISOString(), tools: getToolReliability() };
}

/**
 * Load a prior snapshot and seed tools not already tracked this process. Live
 * in-process counts always win (we never clobber what's happening right now);
 * persistence only re-establishes history for tools not yet seen since boot.
 * Returns the number of tools seeded.
 */
export async function hydrateTelemetry(): Promise<number> {
  if (!backend) return 0;
  const snap = await backend.load();
  if (!snap || !Array.isArray(snap.tools)) return 0;
  let seeded = 0;
  for (const t of snap.tools) {
    if (t && t.tool && !stats.has(t.tool)) {
      stats.set(t.tool, { ...t });
      seeded++;
    }
  }
  return seeded;
}

/** Persist the current snapshot (no-op when no backend is installed). */
export async function persistTelemetry(): Promise<void> {
  if (!backend) return;
  await backend.save(snapshotTelemetry());
}

/**
 * Classify a handler's string result: a top-level truthy `error` field means
 * the integration degraded (handlers never throw for graceful fallbacks).
 * Non-JSON results are treated as success — many handlers return plain text.
 */
export function classifyResult(result: string): { outcome: ToolOutcome; note?: string } {
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
      return { outcome: 'degraded', note: String(parsed.error) };
    }
  } catch {
    // Plain-text result — fine.
  }
  return { outcome: 'success' };
}
