/**
 * In-flight concurrency limiter (bounded outbound AI calls)
 *
 * The gateway has retry / circuit-breaker / timeout, but nothing previously
 * capped the number of simultaneously in-flight outbound provider calls. A
 * burst of requests could pile up unbounded concurrent calls — driving cost,
 * latency, and provider rate-limit cascades. This semaphore bounds the number
 * of concurrent outbound calls; excess callers queue (FIFO) until a slot frees
 * up, so every request still completes, just not all at once.
 *
 * Tunable via AI_GATEWAY_MAX_CONCURRENCY (default 20). <= 0 / unset → default.
 */

export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.permits = Math.max(1, maxConcurrent);
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => this.queue.push(resolve));
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

  /** Run `fn` while holding a permit; the permit is always released, even on throw. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
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
