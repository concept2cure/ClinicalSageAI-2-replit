import Redis from 'ioredis';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('integration-idempotency-store');

export interface IdempotencyEntry {
  status: number;
  body: Record<string, unknown>;
  expiresAt: number;
}

export class IntegrationIdempotencyStore {
  private redis: Redis | null = null;
  private memory = new Map<string, IdempotencyEntry>();
  private initialized = false;

  private initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) {
      logger.info('Redis URL not configured for integration idempotency; using memory fallback');
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      this.redis.on('error', (error) => {
        logger.warn('Redis idempotency store error; falling back to memory', {
          error: error?.message,
        });
      });

      this.redis.connect().catch((error) => {
        logger.warn('Redis connect failed for idempotency store; using memory fallback', {
          error: error?.message,
        });
      });
    } catch (error: any) {
      logger.warn('Failed to initialize Redis idempotency store; using memory fallback', {
        error: error?.message,
      });
      this.redis = null;
    }
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
      }
    }

    this.memory.set(key, value);
  }
}

export const integrationIdempotencyStore = new IntegrationIdempotencyStore();
