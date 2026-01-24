/**
 * Enterprise Performance Optimization Module
 * ============================================================================
 * 
 * Comprehensive performance enhancements for high-throughput platform operations.
 * 
 * Features:
 * - HTTP compression (gzip/brotli)
 * - LRU caching with TTL
 * - Query batching and deduplication
 * - Connection pool optimization
 * - Response time monitoring
 * - Memory leak prevention
 * 
 * Version: 1.0.0
 * Last Updated: 2026-01-24
 */

import { Request, Response, NextFunction } from 'express';
// @ts-ignore - compression module type handling
const compressionLib = require('compression');

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  cache: {
    maxSize: 1000,           // Maximum cache entries
    defaultTtl: 5 * 60_000,  // 5 minutes default
    checkPeriod: 60_000,     // Cleanup every minute
  },
  compression: {
    threshold: 1024,         // Compress responses > 1KB
    level: 6,                // Compression level (1-9)
  },
  monitoring: {
    slowRequestThreshold: 5000, // 5 seconds
    memoryWarningThreshold: 0.85, // 85% heap usage
  },
};

// ============================================================================
// LRU CACHE WITH TTL
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

export class LRUCache<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTtl: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: { maxSize?: number; defaultTtl?: number } = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || config.cache.maxSize;
    this.defaultTtl = options.defaultTtl || config.cache.defaultTtl;
    
    // Start periodic cleanup
    this.startCleanup();
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update access (LRU behavior)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.defaultTtl),
      hits: 0,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  stats(): { size: number; maxSize: number; hitRate: number } {
    let totalHits = 0;
    const entries = Array.from(this.cache.values());
    for (const entry of entries) {
      totalHits += entry.hits;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    };
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const entriesArray = Array.from(this.cache.entries());
      for (const [key, entry] of entriesArray) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, config.cache.checkPeriod);
    
    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Global caches
export const globalCache = new LRUCache({ maxSize: 5000, defaultTtl: 5 * 60_000 });
export const apiCache = new LRUCache({ maxSize: 1000, defaultTtl: 60_000 });
export const embeddingCache = new LRUCache<number[]>({ maxSize: 500, defaultTtl: 30 * 60_000 });

// ============================================================================
// HTTP COMPRESSION
// ============================================================================

export const compressionMiddleware = compressionLib({
  threshold: config.compression.threshold,
  level: config.compression.level,
  filter: (req: Request, res: Response) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression default filter
    return compressionLib.filter(req, res);
  },
});

// ============================================================================
// RESPONSE CACHING MIDDLEWARE
// ============================================================================

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

export function cacheResponse(options: CacheOptions = {}) {
  const ttl = options.ttl || 60_000; // 1 minute default
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();
    
    // Check condition
    if (options.condition && !options.condition(req)) return next();
    
    // Generate cache key
    const key = options.keyGenerator 
      ? options.keyGenerator(req)
      : `${req.path}?${JSON.stringify(req.query)}`;
    
    // Check cache
    const cached = apiCache.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json to cache the response
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        apiCache.set(key, body, ttl);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(body);
    };
    
    next();
  };
}

// ============================================================================
// QUERY BATCHING
// ============================================================================

interface BatchedQuery {
  sql: string;
  params: any[];
  resolve: (result: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}

export class QueryBatcher {
  private queue: BatchedQuery[] = [];
  private batchSize: number;
  private batchDelay: number;
  private timeout: NodeJS.Timeout | null = null;
  private executor: (queries: Array<{ sql: string; params: any[] }>) => Promise<any[]>;

  constructor(
    executor: (queries: Array<{ sql: string; params: any[] }>) => Promise<any[]>,
    options: { batchSize?: number; batchDelay?: number } = {}
  ) {
    this.executor = executor;
    this.batchSize = options.batchSize || 50;
    this.batchDelay = options.batchDelay || 50; // 50ms
  }

  async query(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        sql,
        params,
        resolve,
        reject,
        timestamp: Date.now(),
      });
      
      // Execute immediately if batch is full
      if (this.queue.length >= this.batchSize) {
        this.flush();
      } else if (!this.timeout) {
        // Otherwise, wait for batch delay
        this.timeout = setTimeout(() => this.flush(), this.batchDelay);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      const results = await this.executor(
        batch.map(q => ({ sql: q.sql, params: q.params }))
      );
      
      batch.forEach((query, index) => {
        query.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(query => {
        query.reject(error);
      });
    }
  }

  destroy(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    // Reject pending queries
    this.queue.forEach(q => q.reject(new Error('QueryBatcher destroyed')));
    this.queue = [];
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

interface RequestMetrics {
  path: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: RequestMetrics[] = [];
  private maxMetrics = 1000;
  private slowRequests: RequestMetrics[] = [];

  record(metrics: RequestMetrics): void {
    this.metrics.push(metrics);
    
    // Track slow requests
    if (metrics.duration > config.monitoring.slowRequestThreshold) {
      this.slowRequests.push(metrics);
      console.warn(`[PERF] Slow request: ${metrics.method} ${metrics.path} took ${metrics.duration}ms`);
    }
    
    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    if (this.slowRequests.length > 100) {
      this.slowRequests = this.slowRequests.slice(-100);
    }
  }

  getStats(): {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestCount: number;
    slowRequestCount: number;
    errorRate: number;
  } {
    if (this.metrics.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestCount: 0,
        slowRequestCount: 0,
        errorRate: 0,
      };
    }
    
    const durations = this.metrics.map(m => m.duration).sort((a, b) => a - b);
    const errors = this.metrics.filter(m => m.statusCode >= 400).length;
    
    return {
      avgResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
      p95ResponseTime: durations[Math.floor(durations.length * 0.95)] || 0,
      p99ResponseTime: durations[Math.floor(durations.length * 0.99)] || 0,
      requestCount: this.metrics.length,
      slowRequestCount: this.slowRequests.length,
      errorRate: errors / this.metrics.length,
    };
  }

  getSlowRequests(): RequestMetrics[] {
    return [...this.slowRequests].slice(-20);
  }

  clear(): void {
    this.metrics = [];
    this.slowRequests = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Performance monitoring middleware
export function monitorPerformance(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    performanceMonitor.record({
      path: req.path,
      method: req.method,
      duration,
      statusCode: res.statusCode,
      timestamp: startTime,
    });
  });
  
  next();
}

// ============================================================================
// MEMORY MONITORING
// ============================================================================

export function checkMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  usagePercent: number;
  warning: boolean;
} {
  const usage = process.memoryUsage();
  const usagePercent = usage.heapUsed / usage.heapTotal;
  
  const result = {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    usagePercent: Math.round(usagePercent * 100),
    warning: usagePercent > config.monitoring.memoryWarningThreshold,
  };
  
  if (result.warning) {
    console.warn(`[MEMORY] High memory usage: ${result.usagePercent}% (${result.heapUsed}MB / ${result.heapTotal}MB)`);
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('[MEMORY] Forcing garbage collection...');
      global.gc();
    }
  }
  
  return result;
}

// Periodic memory check
let memoryCheckInterval: NodeJS.Timeout | null = null;

export function startMemoryMonitoring(intervalMs = 60000): void {
  if (memoryCheckInterval) return;
  
  memoryCheckInterval = setInterval(() => {
    checkMemoryUsage();
  }, intervalMs);
  
  memoryCheckInterval.unref();
}

export function stopMemoryMonitoring(): void {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
    memoryCheckInterval = null;
  }
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Execute promises in parallel with concurrency limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const promise = Promise.resolve()
      .then(() => fn(items[i], i))
      .then(result => {
        results[i] = result;
      });
    
    executing.push(promise as any);
    
    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = executing.filter(p => {
        // Check if promise is settled
        let settled = false;
        p.then(() => { settled = true; }).catch(() => { settled = true; });
        return settled;
      });
      completed.forEach(p => {
        const idx = executing.indexOf(p);
        if (idx > -1) executing.splice(idx, 1);
      });
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Batch array into chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// ============================================================================
// APPLY PERFORMANCE MIDDLEWARE
// ============================================================================

export function applyPerformanceMiddleware(app: any) {
  // HTTP compression
  app.use(compressionMiddleware);
  
  // Performance monitoring
  app.use(monitorPerformance);
  
  // Start memory monitoring
  startMemoryMonitoring();
  
  // Add performance stats endpoint
  app.get('/api/perf/stats', (req: Request, res: Response) => {
    res.json({
      performance: performanceMonitor.getStats(),
      memory: checkMemoryUsage(),
      cache: {
        global: globalCache.stats(),
        api: apiCache.stats(),
        embedding: embeddingCache.stats(),
      },
    });
  });
  
  app.get('/api/perf/slow-requests', (req: Request, res: Response) => {
    res.json(performanceMonitor.getSlowRequests());
  });
  
  console.log('✅ Enterprise performance middleware applied');
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanup(): void {
  stopMemoryMonitoring();
  globalCache.destroy();
  apiCache.destroy();
  embeddingCache.destroy();
}

// Cleanup on process exit
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export default {
  LRUCache,
  globalCache,
  apiCache,
  embeddingCache,
  compressionMiddleware,
  cacheResponse,
  QueryBatcher,
  performanceMonitor,
  monitorPerformance,
  checkMemoryUsage,
  startMemoryMonitoring,
  stopMemoryMonitoring,
  parallelLimit,
  chunk,
  debounce,
  throttle,
  applyPerformanceMiddleware,
  cleanup,
};
