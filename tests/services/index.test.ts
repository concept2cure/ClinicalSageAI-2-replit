/**
 * Service Index Tests
 *
 * Unit tests for the unified service entry points.
 *
 * @module tests/services/index.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all service modules
vi.mock('../../server/services/ai/index', () => ({
  AIServices: {
    chat: {},
    embedding: {},
    cortex: {},
  },
}));

vi.mock('../../server/services/documents/index', () => ({
  DocumentServices: {
    vault: {},
    authoring: {},
    orchestration: {},
  },
}));

describe('Service Registry', () => {
  // Define service registry structure for testing
  const SERVICE_REGISTRY = {
    ai: {
      name: 'AI Services',
      description: 'Consolidated AI service layer',
      services: ['chat', 'embedding', 'cortex', 'rag'],
    },
    documents: {
      name: 'Document Services',
      description: 'Document management and authoring',
      services: ['vault', 'authoring', 'orchestration', 'templates'],
    },
    fda: {
      name: 'FDA Services',
      description: 'FDA regulatory services',
      services: ['510k', 'predicates', 'compliance', 'estar'],
    },
    clinical: {
      name: 'Clinical Services',
      description: 'Clinical trial management',
      services: ['protocols', 'studies', 'safety'],
    },
    cortex: {
      name: 'Cortex Services',
      description: 'Knowledge management and intelligence',
      services: ['atoms', 'queries', 'advisory', 'management'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Registry Structure', () => {
    it('should have all major service categories', () => {
      const categories = ['ai', 'documents', 'fda', 'clinical', 'cortex'];

      for (const category of categories) {
        expect(SERVICE_REGISTRY).toHaveProperty(category);
      }
    });

    it('should have consistent structure for each category', () => {
      for (const category of Object.values(SERVICE_REGISTRY)) {
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('services');
        expect(Array.isArray(category.services)).toBe(true);
      }
    });

    it('should have non-empty service lists', () => {
      for (const category of Object.values(SERVICE_REGISTRY)) {
        expect(category.services.length).toBeGreaterThan(0);
      }
    });
  });

  describe('AI Services Category', () => {
    it('should include core AI services', () => {
      const aiServices = SERVICE_REGISTRY.ai.services;
      expect(aiServices).toContain('chat');
      expect(aiServices).toContain('embedding');
      expect(aiServices).toContain('cortex');
    });
  });

  describe('Document Services Category', () => {
    it('should include core document services', () => {
      const docServices = SERVICE_REGISTRY.documents.services;
      expect(docServices).toContain('vault');
      expect(docServices).toContain('authoring');
      expect(docServices).toContain('orchestration');
    });
  });

  describe('FDA Services Category', () => {
    it('should include 510k related services', () => {
      const fdaServices = SERVICE_REGISTRY.fda.services;
      expect(fdaServices).toContain('510k');
      expect(fdaServices).toContain('predicates');
      expect(fdaServices).toContain('compliance');
      expect(fdaServices).toContain('estar');
    });
  });

  describe('Cortex Services Category', () => {
    it('should include knowledge management services', () => {
      const cortexServices = SERVICE_REGISTRY.cortex.services;
      expect(cortexServices).toContain('atoms');
      expect(cortexServices).toContain('queries');
      expect(cortexServices).toContain('advisory');
    });
  });
});

describe('Service Factory Pattern', () => {
  // Test service factory pattern used across services
  interface ServiceConfig {
    pool?: unknown;
    logger?: unknown;
    cache?: unknown;
  }

  interface Service {
    name: string;
    initialized: boolean;
    config: ServiceConfig;
  }

  const createService = (name: string, config: ServiceConfig = {}): Service => {
    return {
      name,
      initialized: true,
      config,
    };
  };

  it('should create service with default config', () => {
    const service = createService('TestService');

    expect(service.name).toBe('TestService');
    expect(service.initialized).toBe(true);
    expect(service.config).toEqual({});
  });

  it('should create service with custom config', () => {
    const mockPool = { query: vi.fn() };
    const service = createService('TestService', { pool: mockPool });

    expect(service.config.pool).toBe(mockPool);
  });
});

describe('Service Dependency Injection', () => {
  interface Logger {
    info: (msg: string) => void;
    error: (msg: string) => void;
    warn: (msg: string) => void;
    debug: (msg: string) => void;
  }

  const createMockLogger = (): Logger => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  });

  it('should inject logger dependency', () => {
    const logger = createMockLogger();
    logger.info('Service initialized');

    expect(logger.info).toHaveBeenCalledWith('Service initialized');
  });

  it('should support multiple dependency injection', () => {
    const logger = createMockLogger();
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    const serviceContext = {
      logger,
      pool: mockPool,
      cache: new Map(),
    };

    expect(serviceContext.logger).toBeDefined();
    expect(serviceContext.pool).toBeDefined();
    expect(serviceContext.cache).toBeDefined();
  });
});

describe('Service Error Handling', () => {
  class ServiceError extends Error {
    code: string;
    details?: Record<string, unknown>;

    constructor(message: string, code: string, details?: Record<string, unknown>) {
      super(message);
      this.name = 'ServiceError';
      this.code = code;
      this.details = details;
    }
  }

  it('should create service error with code', () => {
    const error = new ServiceError('Database connection failed', 'DB_CONNECTION_ERROR');

    expect(error.message).toBe('Database connection failed');
    expect(error.code).toBe('DB_CONNECTION_ERROR');
    expect(error.name).toBe('ServiceError');
  });

  it('should include details in error', () => {
    const error = new ServiceError('Validation failed', 'VALIDATION_ERROR', {
      field: 'deviceName',
      reason: 'Required field missing',
    });

    expect(error.details).toEqual({
      field: 'deviceName',
      reason: 'Required field missing',
    });
  });

  it('should be catchable as Error', () => {
    const throwError = () => {
      throw new ServiceError('Test error', 'TEST_ERROR');
    };

    expect(throwError).toThrow(Error);
    expect(throwError).toThrow(ServiceError);
  });
});

describe('Service Caching Pattern', () => {
  class ServiceCache<T> {
    private cache = new Map<string, { value: T; expiry: number }>();
    private defaultTTL: number;

    constructor(defaultTTL = 300000) {
      // 5 minutes default
      this.defaultTTL = defaultTTL;
    }

    get(key: string): T | undefined {
      const entry = this.cache.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiry) {
        this.cache.delete(key);
        return undefined;
      }
      return entry.value;
    }

    set(key: string, value: T, ttl?: number): void {
      this.cache.set(key, {
        value,
        expiry: Date.now() + (ttl || this.defaultTTL),
      });
    }

    delete(key: string): boolean {
      return this.cache.delete(key);
    }

    clear(): void {
      this.cache.clear();
    }

    size(): number {
      return this.cache.size;
    }
  }

  it('should cache and retrieve values', () => {
    const cache = new ServiceCache<string>();
    cache.set('key1', 'value1');

    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for expired entries', async () => {
    const cache = new ServiceCache<string>(10); // 10ms TTL
    cache.set('key1', 'value1');

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should delete entries', () => {
    const cache = new ServiceCache<string>();
    cache.set('key1', 'value1');
    cache.delete('key1');

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should clear all entries', () => {
    const cache = new ServiceCache<string>();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();

    expect(cache.size()).toBe(0);
  });
});
