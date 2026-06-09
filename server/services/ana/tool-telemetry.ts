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
