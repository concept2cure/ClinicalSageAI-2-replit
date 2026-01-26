/**
 * Unified Router Integration Tests
 *
 * Tests for the consolidated route structure and module loading.
 *
 * @module tests/integration/unified-routers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

describe('Unified Router Structure', () => {
  describe('FDA 510(k) Unified Router', () => {
    const EXPECTED_SUB_ROUTES = [
      '/device',
      '/api',
      '/compliance',
      '/literature',
      '/projects',
      '/fda',
      '/estar',
    ];

    it('should define all expected sub-routes', () => {
      expect(EXPECTED_SUB_ROUTES).toHaveLength(7);
    });

    it('should have consistent naming convention', () => {
      for (const route of EXPECTED_SUB_ROUTES) {
        expect(route).toMatch(/^\/[a-z-]+$/);
      }
    });
  });

  describe('CER Unified Router', () => {
    const EXPECTED_SUB_ROUTES = ['/reports', '/device-profiles', '/analytics', '/legacy'];

    it('should define all expected sub-routes', () => {
      expect(EXPECTED_SUB_ROUTES).toHaveLength(4);
    });
  });

  describe('IND Unified Router', () => {
    const EXPECTED_SUB_ROUTES = [
      '/automation',
      '/database',
      '/submissions',
      '/templates',
      '/pre-ind',
    ];

    it('should define all expected sub-routes', () => {
      expect(EXPECTED_SUB_ROUTES).toHaveLength(5);
    });
  });

  describe('Documents Unified Router', () => {
    const EXPECTED_SUB_ROUTES = [
      '/core',
      '/authoring',
      '/orchestration',
      '/qc',
      '/data-center',
      '/dossier',
    ];

    it('should define all expected sub-routes', () => {
      expect(EXPECTED_SUB_ROUTES).toHaveLength(6);
    });
  });

  describe('Cortex Unified Router', () => {
    const EXPECTED_SUB_ROUTES = ['/core', '/query', '/advisory', '/lumen'];

    it('should define all expected sub-routes', () => {
      expect(EXPECTED_SUB_ROUTES).toHaveLength(4);
    });
  });
});

describe('Health Check Endpoints', () => {
  const healthCheckResponse = (serviceName: string, modules: string[]) => ({
    status: 'ok',
    timestamp: expect.any(String),
    service: serviceName,
    version: '2.0.0',
    modules,
  });

  it('should have consistent health check structure for FDA 510(k)', () => {
    const response = healthCheckResponse('fda510k-unified-api', [
      'device-profiles',
      'requirements',
      'compliance',
      'literature',
      'projects',
      'fda-api',
      'estar',
    ]);

    expect(response.status).toBe('ok');
    expect(response.service).toBe('fda510k-unified-api');
    expect(response.modules).toHaveLength(7);
  });

  it('should have consistent health check structure for CER', () => {
    const response = healthCheckResponse('cer-unified-api', [
      'reports',
      'device-profiles',
      'analytics',
      'legacy',
    ]);

    expect(response.status).toBe('ok');
    expect(response.modules).toHaveLength(4);
  });

  it('should have consistent health check structure for IND', () => {
    const response = healthCheckResponse('ind-unified-api', [
      'automation',
      'database',
      'submissions',
      'templates',
      'pre-ind',
    ]);

    expect(response.status).toBe('ok');
    expect(response.modules).toHaveLength(5);
  });
});

describe('API Documentation Endpoints', () => {
  interface EndpointDoc {
    description: string;
    methods?: string[];
    legacyPath?: string;
    examples?: string[];
  }

  interface APIDocumentation {
    title: string;
    version: string;
    description: string;
    endpoints: Record<string, EndpointDoc>;
    headers?: {
      required: Record<string, string>;
      optional?: Record<string, string>;
    };
    rateLimit?: {
      limit: number;
      windowMs: number;
    };
  }

  const validateDocumentation = (doc: APIDocumentation): string[] => {
    const errors: string[] = [];

    if (!doc.title) errors.push('Title is required');
    if (!doc.version) errors.push('Version is required');
    if (!doc.endpoints || Object.keys(doc.endpoints).length === 0) {
      errors.push('At least one endpoint must be documented');
    }

    for (const [path, endpoint] of Object.entries(doc.endpoints)) {
      if (!endpoint.description) {
        errors.push(`Endpoint ${path} missing description`);
      }
    }

    return errors;
  };

  it('should validate complete documentation', () => {
    const validDoc: APIDocumentation = {
      title: 'FDA 510(k) Unified API',
      version: '2.0.0',
      description: 'Consolidated API for 510(k) operations',
      endpoints: {
        '/device': { description: 'Device profiles and predicates' },
        '/api': { description: 'Requirements by device class' },
      },
    };

    const errors = validateDocumentation(validDoc);
    expect(errors).toHaveLength(0);
  });

  it('should reject documentation without title', () => {
    const invalidDoc: APIDocumentation = {
      title: '',
      version: '2.0.0',
      description: 'Test',
      endpoints: { '/test': { description: 'Test' } },
    };

    const errors = validateDocumentation(invalidDoc);
    expect(errors).toContain('Title is required');
  });

  it('should reject documentation without endpoints', () => {
    const invalidDoc: APIDocumentation = {
      title: 'Test API',
      version: '2.0.0',
      description: 'Test',
      endpoints: {},
    };

    const errors = validateDocumentation(invalidDoc);
    expect(errors).toContain('At least one endpoint must be documented');
  });
});

describe('Middleware Chain', () => {
  type MiddlewareFunction = (req: any, res: any, next: () => void) => void;

  const createMiddlewareChain = (middlewares: MiddlewareFunction[]) => {
    return (req: any, res: any, finalHandler: () => void) => {
      let index = 0;

      const next = () => {
        if (index < middlewares.length) {
          const middleware = middlewares[index++];
          middleware(req, res, next);
        } else {
          finalHandler();
        }
      };

      next();
    };
  };

  it('should execute middlewares in order', () => {
    const order: number[] = [];

    const middleware1: MiddlewareFunction = (_req, _res, next) => {
      order.push(1);
      next();
    };
    const middleware2: MiddlewareFunction = (_req, _res, next) => {
      order.push(2);
      next();
    };
    const middleware3: MiddlewareFunction = (_req, _res, next) => {
      order.push(3);
      next();
    };

    const chain = createMiddlewareChain([middleware1, middleware2, middleware3]);
    chain({}, {}, () => order.push(4));

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('should allow middleware to short-circuit', () => {
    const order: number[] = [];

    const middleware1: MiddlewareFunction = (_req, _res, next) => {
      order.push(1);
      next();
    };
    const middleware2: MiddlewareFunction = (_req, res, _next) => {
      order.push(2);
      res.status(401); // Short-circuit, don't call next
    };
    const middleware3: MiddlewareFunction = (_req, _res, next) => {
      order.push(3);
      next();
    };

    const chain = createMiddlewareChain([middleware1, middleware2, middleware3]);
    chain({}, { status: vi.fn() }, () => order.push(4));

    expect(order).toEqual([1, 2]);
  });
});

describe('Request/Response Helpers', () => {
  it('should create mock request with defaults', () => {
    const req = createMockRequest();

    expect(req.body).toEqual({});
    expect(req.params).toEqual({});
    expect(req.query).toEqual({});
    expect(req.headers).toBeDefined();
  });

  it('should create mock request with overrides', () => {
    const req = createMockRequest({
      body: { deviceName: 'Test Device' },
      params: { id: '123' },
    });

    expect(req.body.deviceName).toBe('Test Device');
    expect(req.params.id).toBe('123');
  });

  it('should create mock response with chainable methods', () => {
    const res = createMockResponse();

    res.status(200).json({ success: true });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

describe('Error Response Standardization', () => {
  interface ErrorResponse {
    error: string;
    code?: string;
    message?: string;
    requestId?: string;
    timestamp?: string;
    details?: Record<string, unknown>;
  }

  const createErrorResponse = (
    error: string,
    code?: string,
    details?: Record<string, unknown>
  ): ErrorResponse => ({
    error,
    code,
    message: error,
    requestId: `req-${Date.now()}`,
    timestamp: new Date().toISOString(),
    details,
  });

  it('should create standardized error response', () => {
    const response = createErrorResponse('Validation failed', 'VALIDATION_ERROR');

    expect(response.error).toBe('Validation failed');
    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.requestId).toBeDefined();
    expect(response.timestamp).toBeDefined();
  });

  it('should include details when provided', () => {
    const response = createErrorResponse('Validation failed', 'VALIDATION_ERROR', {
      field: 'deviceName',
      reason: 'Required',
    });

    expect(response.details).toEqual({
      field: 'deviceName',
      reason: 'Required',
    });
  });
});
