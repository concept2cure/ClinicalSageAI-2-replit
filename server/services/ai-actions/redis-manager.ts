/**
 * Shared Redis Connection Manager
 *
 * Single Redis connection pool shared across all subsystems:
 * - Rate limiter
 * - Action idempotency cache
 * - Distributed locks
 * - Action queue (Bull)
 * - Health probes
 *
 * Provides graceful fallback to in-memory when Redis is unavailable.
 */

import Redis from 'ioredis';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('redis-manager');

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

let client: Redis | null = null;
let subscriberClient: Redis | null = null;
let available = false;
let connectionAttempted = false;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL || process.env.REDIS_TLS_URL || null;
}

function createRedisClient(name: string): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;

  const instance = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    enableReadyCheck: true,
    connectTimeout: 5000,
    lazyConnect: true,
    // Connection name for monitoring
    connectionName: `csai-${name}-${process.pid}`,
  });

  instance.on('error', (err) => {
    logger.error(`Redis ${name} error`, { error: err.message });
    available = false;
  });

  instance.on('connect', () => {
    available = true;
    logger.info(`Redis ${name} connected`);
  });

  instance.on('close', () => {
    available = false;
  });

  return instance;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the shared Redis connection.
 * Call once during server startup. Safe to call multiple times.
 */
export async function initializeRedis(): Promise<boolean> {
  if (connectionAttempted) return available;
  connectionAttempted = true;

  const url = getRedisUrl();
  if (!url) {
    logger.warn('REDIS_URL not configured — all HA features will use in-memory fallback');
    return false;
  }

  try {
    client = createRedisClient('main');
    if (!client) return false;

    await client.connect();
    await client.ping();
    available = true;
    logger.info('Redis shared connection established');
    return true;
  } catch (err: any) {
    logger.error('Failed to connect to Redis', { error: err.message });
    available = false;
    return false;
  }
}

/**
 * Get the shared Redis client. Returns null if unavailable.
 */
export function getRedisClient(): Redis | null {
  return available ? client : null;
}

/**
 * Get a dedicated subscriber client (for Bull queues and pub/sub).
 * Bull requires a separate connection for subscribing.
 */
export function getSubscriberClient(): Redis | null {
  if (!available) return null;
  if (!subscriberClient) {
    subscriberClient = createRedisClient('subscriber');
    if (subscriberClient) {
      subscriberClient.connect().catch((err) => {
        logger.error('Subscriber client connect failed', { error: err.message });
      });
    }
  }
  return subscriberClient;
}

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return available;
}

/**
 * Get Redis connection info for health checks.
 */
export async function getRedisHealth(): Promise<{
  available: boolean;
  latencyMs: number | null;
  info: Record<string, string> | null;
}> {
  if (!available || !client) {
    return { available: false, latencyMs: null, info: null };
  }

  try {
    const start = Date.now();
    await client.ping();
    const latencyMs = Date.now() - start;

    const memoryRaw = await client.info('memory');
    const usedMemory = memoryRaw.match(/used_memory_human:(\S+)/)?.[1] || 'unknown';
    const connectedClients = (await client.info('clients')).match(/connected_clients:(\d+)/)?.[1] || 'unknown';

    return {
      available: true,
      latencyMs,
      info: { usedMemory, connectedClients },
    };
  } catch {
    return { available: false, latencyMs: null, info: null };
  }
}

/**
 * Close all Redis connections gracefully.
 */
export async function closeRedis(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (client) {
    promises.push(
      client.quit().then(() => { client = null; }).catch(() => { client?.disconnect(); client = null; })
    );
  }

  if (subscriberClient) {
    promises.push(
      subscriberClient.quit().then(() => { subscriberClient = null; }).catch(() => { subscriberClient?.disconnect(); subscriberClient = null; })
    );
  }

  await Promise.allSettled(promises);
  available = false;
  connectionAttempted = false;
  logger.info('Redis connections closed');
}
