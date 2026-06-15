import Redis from 'ioredis';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('integration-idempotency-store');

export interface IdempotencyEntry {
  status: number;
  body: Record<string, unknown>;
  expiresAt: number;
}

/**
 * Cap for the in-memory fallback map. The fallback exists for availability
 * when Redis is unavailable, but it MUST NOT grow without bound — under load
 * an unbounded Map is a memory-exhaustion vector. When the cap is reached we
 * evict the oldest insertion (the Map preserves insertion order), giving a
 * simple FIFO/LRU-ish bound. Expired entries are also pruned lazily on read.
 */
const MEMORY_FALLBACK_MAX_ENTRIES = 10_000;

export class IntegrationIdempotencyStore {
  private redis: Redis | null = null;
  private memory = new Map<string, IdempotencyEntry>();
  private initialized = false;

  /**
   * True when this process is NOT backed by a shared Redis and is therefore
   * relying on per-process memory. In that mode cross-instance idempotency is
   * NOT guaranteed (a duplicate request hitting a different node will not be
   * de-duplicated). Callers should surface this (e.g. a response header or a
   * metric) rather than silently assume cross-instance idempotency holds.
   */
  private degraded = false;
  /** Throttle the repeated "serving from memory" warning to once/minute. */
  private lastDegradedWarnAt = 0;

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) {
      this.degraded = true;
      logger.warn(
        'Integration idempotency running in DEGRADED memory-only mode: REDIS_URL not configured. ' +
          'Cross-instance idempotency is NOT guaranteed under multi-node deployment ' +
          '(duplicate requests routed to a different instance may be processed twice).',
      );
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      this.redis.on('error', (error) => {
        if (!this.degraded) {
          this.degraded = true;
          logger.error(
            'Integration idempotency store lost Redis; DEGRADING to per-process memory fallback. ' +
              'Cross-instance idempotency is NOT guaranteed while degraded.',
            { error: error?.message },
          );
        }
      });

      this.redis.on('ready', () => {
        if (this.degraded) {
          logger.info('Integration idempotency store reconnected to Redis; cross-instance idempotency restored');
        }
        this.degraded = false;
      });

      this.redis.connect().catch((error) => {
        this.degraded = true;
        logger.error(
          'Integration idempotency store failed to connect to Redis; DEGRADING to per-process memory fallback. ' +
            'Cross-instance idempotency is NOT guaranteed while degraded.',
          { error: error?.message },
        );
      });
    } catch (error: any) {
      this.degraded = true;
      logger.error(
        'Failed to initialize Redis idempotency store; DEGRADING to per-process memory fallback. ' +
          'Cross-instance idempotency is NOT guaranteed while degraded.',
        { error: error?.message },
      );
      this.redis = null;
    }
  }

  /**
   * Whether the store is currently NOT backed by a shared Redis. When true,
   * idempotency is only enforced within this process — callers handling
   * idempotency-critical operations should surface this (header/metric) so the
   * degraded guarantee is observable rather than silent.
   */
  isDegraded(): boolean {
    this.initialize();
    return this.degraded;
  }

  /** Mark that we just served idempotency from the in-memory fallback. */
  private noteMemoryUse(): void {
    this.degraded = true;
    const now = Date.now();
    if (now - this.lastDegradedWarnAt > 60_000) {
      this.lastDegradedWarnAt = now;
      logger.warn(
        'Integration idempotency served from per-process memory fallback; cross-instance idempotency NOT guaranteed',
        { memoryEntries: this.memory.size },
      );
    }
  }

  /** Insert into the bounded memory fallback, evicting the oldest if at cap. */
  private memorySet(key: string, value: IdempotencyEntry): void {
    // Refresh insertion order on overwrite so the entry is treated as recent.
    if (this.memory.has(key)) {
      this.memory.delete(key);
    } else if (this.memory.size >= MEMORY_FALLBACK_MAX_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) {
        this.memory.delete(oldest);
      }
    }
    this.memory.set(key, value);
  }

  async get(key: string): Promise<IdempotencyEntry | null> {
    this.initialize();

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as IdempotencyEntry;
        if (parsed.expiresAt <= Date.now()) {
          await this.redis.del(key).catch(() => {});
          return null;
        }
        return parsed;
      } catch (error: any) {
        logger.warn('Redis get failed; using memory fallback', { error: error?.message });
        this.noteMemoryUse();
      }
    }

    const cached = this.memory.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return cached;
  }

  async set(key: string, value: IdempotencyEntry, ttlMs: number): Promise<void> {
    this.initialize();

    if (this.redis) {
      try {
        const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch (error: any) {
        logger.warn('Redis set failed; using memory fallback', { error: error?.message });
        this.noteMemoryUse();
      }
    }

    this.memorySet(key, value);
  }
}

export const integrationIdempotencyStore = new IntegrationIdempotencyStore();
