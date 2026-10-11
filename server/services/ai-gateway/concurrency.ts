/**
 * In-flight concurrency limiter (bounded outbound AI calls)
 *
 * The gateway has retry / circuit-breaker / timeout, but nothing previously
 * capped the number of simultaneously in-flight outbound provider calls. A
 * burst of requests could pile up unbounded concurrent calls — driving cost,
 * latency, and provider rate-limit cascades. This semaphore bounds the number
 * of concurrent outbound calls; excess callers queue (FIFO) until a slot frees
 * up. An abort removes waiting work and prevents its dispatch; work already
 * running retains its permit until it settles.
 *
 * Tunable via AI_GATEWAY_MAX_CONCURRENCY (default 20). <= 0 / unset → default.
 */

export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.permits = Math.max(1, maxConcurrent);
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        const index = this.queue.indexOf(grant);
        if (index !== -1) this.queue.splice(index, 1);
        signal?.removeEventListener('abort', onAbort);
        reject(signal?.reason);
      };
      this.queue.push(grant);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the permit directly to the next waiter (keeps the count balanced).
      next();
    } else {
      this.permits++;
    }
  }

  /** Cancel waiting work; dispatched work keeps its permit until it settles. */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      // A stop may land after a permit handoff but before this continuation.
      signal?.throwIfAborted();
      return await fn();
    } finally {
      this.release();
    }
  }
}

export function resolveMaxConcurrency(): number {
  const raw = Number.parseInt(process.env.AI_GATEWAY_MAX_CONCURRENCY ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}
