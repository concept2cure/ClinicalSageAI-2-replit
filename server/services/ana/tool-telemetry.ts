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
  /** Successful calls that returned ≥1 result (the tool actually delivered). */
  resultfulCalls: number;
  /** Successful calls that returned zero results (working, but unhelpful). */
  emptyCalls: number;
}

/** Result-yield signal derived from a successful handler's payload. */
export type ResultYield = 'results' | 'empty';

// Global (cross-tenant) reliability, plus an optional per-organization breakdown.
// Every outcome updates global; when an org is supplied it also updates that
// org's view, so AnA can adapt per-customer (e.g. a tenant whose HubSpot is
// misconfigured deprioritizes search_crm for THAT tenant only).
const stats = new Map<string, ToolReliability>();
const orgStats = new Map<string, Map<string, ToolReliability>>();

function newEntry(tool: string): ToolReliability {
  return {
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
    resultfulCalls: 0,
    emptyCalls: 0,
  };
}

function entryIn(map: Map<string, ToolReliability>, tool: string): ToolReliability {
  let e = map.get(tool);
  if (!e) {
    e = newEntry(tool);
    map.set(tool, e);
  }
  return e;
}

function orgMap(orgId: string): Map<string, ToolReliability> {
  let m = orgStats.get(orgId);
  if (!m) {
    m = new Map();
    orgStats.set(orgId, m);
  }
  return m;
}

export type ToolOutcome = 'success' | 'degraded' | 'failure';

function applyOutcome(
  e: ToolReliability,
  outcome: ToolOutcome,
  latencyMs: number,
  errorNote?: string,
  resultYield?: ResultYield
): void {
  e.calls++;
  // Running mean keeps this O(1) with no history buffer.
  e.avgLatencyMs = Math.round(e.avgLatencyMs + (latencyMs - e.avgLatencyMs) / e.calls);
  e.lastUsedAt = new Date().toISOString();
  if (outcome === 'success') {
    e.successes++;
    e.consecutiveFailures = 0;
    if (resultYield === 'results') e.resultfulCalls++;
    else if (resultYield === 'empty') e.emptyCalls++;
  } else {
    if (outcome === 'degraded') e.degraded++;
    else e.failures++;
    e.consecutiveFailures++;
    if (errorNote) e.lastError = errorNote.slice(0, 300);
  }
}

/**
 * Record one tool execution outcome. Always updates the global view; when
 * `orgId` is given, also updates that organization's per-tenant view.
 */
export function recordToolOutcome(
  tool: string,
  outcome: ToolOutcome,
  latencyMs: number,
  errorNote?: string,
  orgId?: string | number | null,
  resultYield?: ResultYield
): void {
  applyOutcome(entryIn(stats, tool), outcome, latencyMs, errorNote, resultYield);
  if (orgId !== undefined && orgId !== null && orgId !== '') {
    applyOutcome(entryIn(orgMap(String(orgId)), tool), outcome, latencyMs, errorNote, resultYield);
  }
}

/** Record a schema-contract violation (missing required input fields). */
export function recordContractViolation(tool: string, orgId?: string | number | null): void {
  entryIn(stats, tool).contractViolations++;
  if (orgId !== undefined && orgId !== null && orgId !== '') {
    entryIn(orgMap(String(orgId)), tool).contractViolations++;
  }
}

/**
 * Reliability for every tool called this process lifetime. Global by default;
 * pass an `orgId` for that organization's per-tenant view (empty if none yet).
 */
export function getToolReliability(orgId?: string | number | null): ToolReliability[] {
  const map =
    orgId !== undefined && orgId !== null && orgId !== '' ? orgStats.get(String(orgId)) : stats;
  return map ? Array.from(map.values()).map(e => ({ ...e })) : [];
}

/** Tools currently looking unhealthy (N+ consecutive non-successes), global or per-org. */
export function getUnhealthyTools(
  minConsecutiveFailures = 3,
  orgId?: string | number | null
): ToolReliability[] {
  return getToolReliability(orgId).filter(e => e.consecutiveFailures >= minConsecutiveFailures);
}

/** Organization ids with a per-tenant reliability view. */
export function getTrackedOrgIds(): string[] {
  return Array.from(orgStats.keys());
}

/** Test hook. */
export function resetToolTelemetry(): void {
  stats.clear();
  orgStats.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence (opt-in) — lets learned reliability survive restarts.
//
// The store is pluggable so this module stays fs/DB-free and unit-testable; a
// reference file backend + boot wiring live in tool-telemetry-persistence.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
  /** v1 = global only; v2 adds the per-org breakdown. Both load. */
  version: 1 | 2;
  savedAt: string;
  /** Global (cross-tenant) reliability. */
  tools: ToolReliability[];
  /** Per-organization reliability (v2+). */
  byOrg?: Record<string, ToolReliability[]>;
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

/** Current state as a serializable snapshot (global + per-org). */
export function snapshotTelemetry(): TelemetrySnapshot {
  const byOrg: Record<string, ToolReliability[]> = {};
  for (const [orgId, m] of orgStats) {
    byOrg[orgId] = Array.from(m.values()).map(e => ({ ...e }));
  }
  return { version: 2, savedAt: new Date().toISOString(), tools: getToolReliability(), byOrg };
}

/** Seed a target map with snapshot rows for tools not already tracked. */
function seedMap(target: Map<string, ToolReliability>, rows: ToolReliability[] | undefined): number {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const t of rows) {
    if (t && t.tool && !target.has(t.tool)) {
      target.set(t.tool, { ...t });
      n++;
    }
  }
  return n;
}

/**
 * Load a prior snapshot and seed tools not already tracked this process. Live
 * in-process counts always win (we never clobber what's happening right now);
 * persistence only re-establishes history for tools not yet seen since boot.
 * Accepts v1 (global only) and v2 (global + per-org). Returns tools seeded.
 */
export async function hydrateTelemetry(): Promise<number> {
  if (!backend) return 0;
  const snap = await backend.load();
  if (!snap || !Array.isArray(snap.tools)) return 0;
  let seeded = seedMap(stats, snap.tools);
  if (snap.byOrg && typeof snap.byOrg === 'object') {
    for (const [orgId, rows] of Object.entries(snap.byOrg)) {
      seeded += seedMap(orgMap(orgId), rows);
    }
  }
  return seeded;
}

/** Persist the current snapshot (no-op when no backend is installed). */
export async function persistTelemetry(): Promise<void> {
  if (!backend) return;
  await backend.save(snapshotTelemetry());
}

// Common count/array fields handlers use to report how much they returned.
const COUNT_FIELDS = ['resultCount', 'matched', 'total', 'totalCount'] as const;
const ARRAY_FIELDS = [
  'results', 'studies', 'trials', 'articles', 'documents', 'recalls', 'labels',
  'approvals', 'messages', 'records', 'passages',
] as const;

/** Derive a result-yield signal from a successful payload, or undefined if N/A. */
function detectYield(parsed: any): ResultYield | undefined {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  for (const f of COUNT_FIELDS) {
    if (typeof parsed[f] === 'number') return parsed[f] > 0 ? 'results' : 'empty';
  }
  for (const f of ARRAY_FIELDS) {
    if (Array.isArray(parsed[f])) return parsed[f].length > 0 ? 'results' : 'empty';
  }
  return undefined;
}

/**
 * Classify a handler's string result: a top-level truthy `error` field means
 * the integration degraded (handlers never throw for graceful fallbacks).
 * Non-JSON results are treated as success — many handlers return plain text.
 * On success, also derive a result-yield signal (did the tool actually deliver?).
 */
export function classifyResult(result: string): {
  outcome: ToolOutcome;
  note?: string;
  resultYield?: ResultYield;
} {
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
      return { outcome: 'degraded', note: String(parsed.error) };
    }
    return { outcome: 'success', resultYield: detectYield(parsed) };
  } catch {
    // Plain-text result — success, yield not applicable.
    return { outcome: 'success' };
  }
}

/**
 * Tools that work but rarely deliver — succeed yet return empty most of the time
 * (≥ minCalls yielding calls, emptyRate ≥ threshold). Working-but-unhelpful.
 */
export function getLowYieldTools(
  minYieldingCalls = 4,
  emptyRateThreshold = 0.75,
  orgId?: string | number | null
): Array<ToolReliability & { emptyRate: number }> {
  return getToolReliability(orgId)
    .map(e => {
      const yielding = e.resultfulCalls + e.emptyCalls;
      return { ...e, emptyRate: yielding > 0 ? e.emptyCalls / yielding : 0, _yielding: yielding };
    })
    .filter(e => e._yielding >= minYieldingCalls && e.emptyRate >= emptyRateThreshold)
    .map(({ _yielding, ...rest }) => rest);
}
