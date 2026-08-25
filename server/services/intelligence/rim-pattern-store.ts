/**
 * RIM Pattern Store — tenant-scoped persistence for learned RIM patterns.
 *
 * This is the first increment of the RIM (Regulatory Intelligence Model) learning
 * loop: a small, deterministic store that lets the platform PERSIST what it has
 * learned (a "pattern" / "signal" observed during regulatory work) and EXPOSE a
 * deterministic read path back to AnA.
 *
 * Design constraints (governed, 21 CFR Part 11):
 *   - PURE and DETERMINISTIC: no LLM, no network. Given the same call sequence the
 *     store yields the same state. `recordPattern` derives its identity and its
 *     timestamps from its inputs, never from a wall clock, so callers — including
 *     tests — get reproducible results.
 *   - TENANT-SCOPED: every pattern carries an `orgId` and is only ever returned for
 *     that org. There is no cross-org read path.
 *   - PLUGGABLE-TO-DB: the store is expressed as an interface ({@link RimPatternStore})
 *     with an in-memory default implementation. A Drizzle-backed implementation
 *     (keyed by `{ orgId, domain }`, mirroring `shared/schema/rim.ts` conventions)
 *     can be dropped in later without touching callers.
 *
 * A "pattern" here is the durable, aggregated form of the volatile signals the RIM
 * interceptors emit: an observation about regulatory behaviour (a reviewer trigger,
 * a recurring deficiency, a strong/weak-language tendency) that strengthens as it is
 * seen again. `occurrences` counts how often it was observed; `confidence` rises with
 * repetition but is bounded so a single noisy loop can never assert certainty.
 *
 * @module server/services/intelligence/rim-pattern-store
 */

import { persistPattern, loadPersistedPatterns } from './rim-pattern-persistence.js';

/**
 * The class of regulatory signal a pattern aggregates. Mirrors the signal/pattern
 * vocabulary described in the "RIM Intelligence Layer Rules" scoped rule (deficiency,
 * reviewer_trigger, rejection, strong/weak language, data_gap, consistency_issue,
 * formatting, risk_signal). Kept as a string union so the store stays self-describing
 * without coupling to the volatile signal layer.
 */
export type RimSignalType =
  | 'deficiency'
  | 'reviewer_trigger'
  | 'rejection'
  | 'strong_language'
  | 'weak_language'
  | 'data_gap'
  | 'consistency_issue'
  | 'formatting'
  | 'risk_signal';

/** A learned, tenant-scoped RIM pattern. */
export interface RimPattern {
  /** Deterministic identity: stable for a given { orgId, domain, signalType, observation }. */
  id: string;
  /** Owning organization. Patterns are NEVER returned outside their org. */
  orgId: number;
  /** Regulatory domain the pattern was learned in (e.g. 'csr', 'fda_compliance', '510k'). */
  domain: string;
  /** The class of signal this pattern aggregates. */
  signalType: RimSignalType;
  /** Human-readable description of what was observed. */
  observation: string;
  /** Confidence in the pattern, 0–100. Rises with repetition, bounded by CONFIDENCE_MAX. */
  confidence: number;
  /** How many times this pattern has been observed. */
  occurrences: number;
  /** Caller-supplied ISO 8601 timestamp of first observation. */
  firstSeen: string;
  /** Caller-supplied ISO 8601 timestamp of most recent observation. */
  lastSeen: string;
}

/** Input to {@link RimPatternStore.recordPattern}. */
export interface RecordPatternInput {
  orgId: number;
  domain: string;
  signalType: RimSignalType;
  observation: string;
  /**
   * Confidence (0–100) to seed a brand-new pattern with. Clamped into
   * [0, CONFIDENCE_MAX]. Ignored on a repeat observation, which instead bumps the
   * existing confidence by {@link CONFIDENCE_STEP}. Defaults to {@link CONFIDENCE_SEED}.
   */
  confidence?: number;
  /**
   * ISO 8601 observation timestamp. Supplied by the caller (deterministic, testable).
   * Defaults to the current time only when omitted.
   */
  observedAt?: string;
}

/** Filter for {@link RimPatternStore.getPatterns}. `domain` is optional. */
export interface GetPatternsQuery {
  orgId: number;
  domain?: string;
}

/**
 * The pluggable store contract. The in-memory implementation is the default.
 *
 * Both operations are async because both must SEE persisted state first: a
 * sync `getPatterns` that fires hydration and reads the map in the same tick
 * returns `[]` on the first call of every process even when the database
 * holds patterns — dormancy with extra machinery — and a `recordPattern`
 * that upserts before hydration undercounts: a repeat of a persisted
 * observation would seed a fresh occurrences=1 pattern instead of
 * strengthening the one an earlier process learned.
 */
export interface RimPatternStore {
  /**
   * Record an observation. Upserts on { orgId, domain, signalType, observation }:
   * a new pattern is created seeded at its confidence; a matching existing pattern
   * has its `occurrences` incremented, `confidence` bumped (bounded), and `lastSeen`
   * advanced. Returns the resulting pattern.
   */
  recordPattern(input: RecordPatternInput): Promise<RimPattern>;
  /** Return this org's patterns, optionally filtered to one domain. Never cross-org. */
  getPatterns(query: GetPatternsQuery): Promise<RimPattern[]>;
  /** Remove all stored patterns (test/maintenance helper). */
  clear(): void;
}

/** Upper bound on a pattern's confidence — repetition can strengthen but never certify. */
export const CONFIDENCE_MAX = 95;
/** Lower bound on confidence. */
export const CONFIDENCE_MIN = 0;
/** Confidence a brand-new pattern is seeded with when the caller gives none. */
export const CONFIDENCE_SEED = 50;
/** How much each repeat observation bumps confidence (before clamping to CONFIDENCE_MAX). */
export const CONFIDENCE_STEP = 5;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return CONFIDENCE_SEED;
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, value));
}

/**
 * Deterministic identity for a pattern. Two observations with the same org, domain,
 * signal type, and (normalized) observation text collapse onto the same pattern, so
 * recording "the same signal" twice increments rather than duplicates.
 */
export function rimPatternId(
  orgId: number,
  domain: string,
  signalType: RimSignalType,
  observation: string,
): string {
  const norm = observation.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${orgId}::${domain}::${signalType}::${norm}`;
}

/**
 * In-memory {@link RimPatternStore} backed by database persistence
 * (rim-pattern-persistence.ts): the map is a per-process cache hydrated once
 * per org from rim_learned_patterns, and every write persists the touched
 * pattern (plus its append-only observation event) back. Both public
 * operations await hydration first — see the interface docstring for why a
 * sync read/unhydrated write here is not a smaller bug but the whole
 * subsystem's dormancy.
 */
export class InMemoryRimPatternStore implements RimPatternStore {
  private readonly patterns = new Map<string, RimPattern>();
  /** Track which orgIds have been loaded from persistence (once per org). */
  private readonly loadedOrgs = new Set<number>();
  /** Track which orgIds have a pending persistence load (avoid double-loading). */
  private readonly loadingOrgs = new Map<number, Promise<void>>();

  /**
   * Attempt to load persisted patterns for an org into the in-memory store.
   * Only loads once per org per process lifetime. Non-blocking: returns a promise
   * that resolves when loading is complete but callers may ignore it.
   */
  private ensureLoaded(orgId: number): Promise<void> {
    if (this.loadedOrgs.has(orgId)) return Promise.resolve();
    const existing = this.loadingOrgs.get(orgId);
    if (existing) return existing;

    const loading = loadPersistedPatterns(String(orgId))
      .then((persisted) => {
        // Only hydrate if in-memory is still empty for this org.
        const hasAny = Array.from(this.patterns.values()).some((p) => p.orgId === orgId);
        if (!hasAny && persisted.length > 0) {
          for (const p of persisted) {
            this.patterns.set(p.id, p);
          }
        }
        this.loadedOrgs.add(orgId);
        this.loadingOrgs.delete(orgId);
      })
      .catch(() => {
        // Persistence load failure is non-fatal.
        this.loadedOrgs.add(orgId);
        this.loadingOrgs.delete(orgId);
      });

    this.loadingOrgs.set(orgId, loading);
    return loading;
  }

  async recordPattern(input: RecordPatternInput): Promise<RimPattern> {
    const orgId = input.orgId;
    const domain = input.domain.trim();
    const observation = input.observation.trim();
    const signalType = input.signalType;

    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw new Error('recordPattern: orgId must be a positive integer');
    }
    if (domain.length === 0) {
      throw new Error('recordPattern: domain is required');
    }
    if (observation.length === 0) {
      throw new Error('recordPattern: observation is required');
    }

    // Hydrate BEFORE upserting. Recording against un-hydrated state both
    // undercounts (a repeat of a persisted observation would seed occurrences
    // back to 1) and corrupts persistence: persistOrg writes the org's FULL
    // in-memory set, so a write from a fresh process that had not yet loaded
    // would overwrite every previously persisted pattern with just this one.
    await this.ensureLoaded(orgId);

    const observedAt = input.observedAt ?? new Date().toISOString();
    const id = rimPatternId(orgId, domain, signalType, observation);
    const existing = this.patterns.get(id);

    if (existing) {
      const updated: RimPattern = {
        ...existing,
        occurrences: existing.occurrences + 1,
        confidence: clampConfidence(existing.confidence + CONFIDENCE_STEP),
        lastSeen: observedAt,
      };
      this.patterns.set(id, updated);

      // Fire-and-forget persistence of the touched pattern (+ its observation event).
      void persistPattern(updated).catch(() => {});

      return updated;
    }

    const created: RimPattern = {
      id,
      orgId,
      domain,
      signalType,
      observation,
      confidence: clampConfidence(input.confidence ?? CONFIDENCE_SEED),
      occurrences: 1,
      firstSeen: observedAt,
      lastSeen: observedAt,
    };
    this.patterns.set(id, created);

    // Fire-and-forget persistence of the touched pattern (+ its observation event).
    void persistPattern(created).catch(() => {});

    return created;
  }

  async getPatterns(query: GetPatternsQuery): Promise<RimPattern[]> {
    // A read that races its own hydration returns [] on the first call of
    // every process — the exact dormancy this store exists to end. Await it.
    await this.ensureLoaded(query.orgId);
    return this.snapshotOrg(query.orgId, query.domain);
  }

  /** Synchronous snapshot of the in-memory map (no hydration). */
  private snapshotOrg(orgId: number, domain?: string): RimPattern[] {
    const out: RimPattern[] = [];
    for (const pattern of this.patterns.values()) {
      if (pattern.orgId !== orgId) continue;
      if (domain !== undefined && pattern.domain !== domain) continue;
      out.push({ ...pattern });
    }
    // Deterministic ordering: strongest, most-observed patterns first, then id.
    out.sort(
      (a, b) =>
        b.confidence - a.confidence ||
        b.occurrences - a.occurrences ||
        a.id.localeCompare(b.id),
    );
    return out;
  }

  clear(): void {
    this.patterns.clear();
  }
}

/**
 * Process-wide default store. A single shared instance so the read path
 * (recall_rim_patterns) sees what the write path recorded within a process.
 * Swap-in point for a DB-backed store: replace this binding.
 */
export const rimPatternStore: RimPatternStore = new InMemoryRimPatternStore();

/**
 * Record a learned pattern into the default store. Thin, non-throwing wrapper
 * intended for fire-and-forget callers (e.g. RIM interceptors): a malformed
 * observation is dropped (resolves null) rather than thrown or rejected into a
 * primary pipeline.
 */
export async function recordPattern(input: RecordPatternInput): Promise<RimPattern | null> {
  try {
    return await rimPatternStore.recordPattern(input);
  } catch {
    return null;
  }
}

/** Read this org's learned patterns from the default store (optionally one domain). */
export async function getPatterns(query: GetPatternsQuery): Promise<RimPattern[]> {
  return rimPatternStore.getPatterns(query);
}
