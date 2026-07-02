/**
 * Per-host admission control for outbound integration traffic.
 *
 * A shared, in-process token-bucket / queue that bounds (a) the number of
 * concurrent in-flight requests to a given host and (b) the minimum spacing
 * between successive request *starts* to that host. This keeps AnA a good
 * citizen of rate-limited public APIs (NCBI E-utilities, openFDA, …) without
 * each client reinventing a limiter.
 *
 * Design contract (safety-first):
 *  - Purely additive: callers that never opt in are unaffected.
 *  - Degrades to pass-through if misconfigured — a non-positive/NaN concurrency
 *    means "unlimited", a non-positive/NaN interval means "no spacing"; when
 *    both are inert the request runs immediately with zero bookkeeping.
 *  - Never deadlocks: exactly one queued waiter is released per completion, the
 *    active count is released in a `finally`, and spacing only ever *delays*.
 *
 * This module is intentionally framework-free and holds no I/O of its own; it
 * wraps an arbitrary `() => Promise<T>` (in practice, one fetch attempt loop).
 *
 * @module server/services/integrations/host-throttle
 */

export interface HostLimits {
  /**
   * Max concurrent in-flight requests to this host. `<= 0` / non-finite →
   * unlimited (no concurrency gate).
   */
  concurrency: number;
  /**
   * Minimum milliseconds between successive request *starts* to this host.
   * `<= 0` / non-finite → no spacing.
   */
  minIntervalMs: number;
}

/**
 * Generous default applied to any host without a specific profile. Chosen so it
 * does not change the behavior of current callers (no spacing, comfortable
 * concurrency), while still capping pathological fan-out.
 */
export const DEFAULT_LIMITS: HostLimits = { concurrency: 8, minIntervalMs: 0 };

/**
 * Per-host defaults tuned to be friendly to the public APIs AnA depends on.
 * NCBI E-utilities allows ~3 req/s without an API key; openFDA is generous but
 * benefits from modest spacing. These are conservative starting points and can
 * be overridden at runtime via {@link HostThrottle.configure}.
 */
export const HOST_DEFAULTS: Readonly<Record<string, HostLimits>> = Object.freeze({
  'eutils.ncbi.nlm.nih.gov': { concurrency: 3, minIntervalMs: 350 },
  'api.fda.gov': { concurrency: 4, minIntervalMs: 250 },
  'clinicaltrials.gov': { concurrency: 5, minIntervalMs: 0 },
  'www.ebi.ac.uk': { concurrency: 4, minIntervalMs: 0 },
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Coerce raw limits into a safe shape; invalid values collapse to "inert". */
function sanitize(limits: HostLimits): HostLimits {
  const concurrency = Number.isFinite(limits.concurrency) && limits.concurrency > 0
    ? Math.floor(limits.concurrency)
    : 0;
  const minIntervalMs = Number.isFinite(limits.minIntervalMs) && limits.minIntervalMs > 0
    ? limits.minIntervalMs
    : 0;
  return { concurrency, minIntervalMs };
}

interface HostState {
  active: number;
  queue: Array<() => void>;
  /** Timestamp (ms) at/after which the next request to this host may start. */
  nextStart: number;
}

/** Extract the lowercased host from a URL; '' if it cannot be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

export class HostThrottle {
  private readonly state = new Map<string, HostState>();
  private readonly overrides = new Map<string, HostLimits>();

  /** Override the limits for a host (used by ops config and tests). */
  configure(host: string, limits: HostLimits): void {
    this.overrides.set(host.toLowerCase(), limits);
  }

  /** Resolve the effective (sanitized) limits for a host. */
  limitsFor(host: string): HostLimits {
    const key = host.toLowerCase();
    const raw = this.overrides.get(key) ?? HOST_DEFAULTS[key] ?? DEFAULT_LIMITS;
    return sanitize(raw);
  }

  private getState(host: string): HostState {
    let st = this.state.get(host);
    if (!st) {
      st = { active: 0, queue: [], nextStart: 0 };
      this.state.set(host, st);
    }
    return st;
  }

  private async acquire(host: string, limits: HostLimits): Promise<void> {
    const st = this.getState(host);

    // Concurrency gate: wait for a free slot when at capacity.
    if (limits.concurrency > 0 && st.active >= limits.concurrency) {
      await new Promise<void>(resolve => st.queue.push(resolve));
    }
    st.active++;

    // Spacing gate: reserve a start slot now (so concurrent acquirers are
    // spaced deterministically), then sleep until it arrives.
    if (limits.minIntervalMs > 0) {
      const now = Date.now();
      const scheduled = Math.max(now, st.nextStart);
      st.nextStart = scheduled + limits.minIntervalMs;
      const wait = scheduled - now;
      if (wait > 0) await sleep(wait);
    }
  }

  private release(host: string): void {
    const st = this.getState(host);
    st.active = Math.max(0, st.active - 1);
    const next = st.queue.shift();
    if (next) next();
  }

  /**
   * Run `fn` under this host's admission control. When the host's limits are
   * inert (unlimited + unspaced) `fn` runs immediately with no bookkeeping.
   */
  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const limits = this.limitsFor(host);
    if (limits.concurrency <= 0 && limits.minIntervalMs <= 0) {
      return fn();
    }
    await this.acquire(host, limits);
    try {
      return await fn();
    } finally {
      this.release(host);
    }
  }

  /** Snapshot of live in-flight counts (diagnostics / tests). */
  activeFor(host: string): number {
    return this.state.get(host.toLowerCase())?.active ?? 0;
  }
}

/** Process-wide shared throttle used by the integration HTTP layer. */
export const hostThrottle = new HostThrottle();
