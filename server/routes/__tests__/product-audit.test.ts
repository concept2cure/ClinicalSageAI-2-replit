
import { vi } from 'vitest';

// Auth middleware imports `../config/environment.js` which is a `.ts` file
// in v2. Node ESM strict mode rejects the .js extension. Mock the
// middleware so the import chain doesn't touch the .js → .ts resolution.
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

// requireOrganizationContext (server/middleware/tenantContext.ts:140) checks
// `req.tenantContext?.organizationId`. Stub it as a passthrough so the test's
// own inline auth middleware (which sets req.user.organizationId) reaches
// the route handler without the 403 short-circuit.
vi.mock('../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
  requireClientWorkspaceContext: (_req: any, _res: any, next: any) => next(),
  requireTenantMiddleware: (_req: any, _res: any, next: any) => next(),
  validateTenantAccessMiddleware: (_req: any, _res: any, next: any) => next(),
  tenantContext: (_req: any, _res: any, next: any) => next(),
}));

// In-memory feature-store backed by a Drizzle chain mock. The product-audit
// route uses createFeatureStore('product_audit') which chains
// db.select()/insert()/update()/...where()/orderBy()/limit(). Mock each
// chain step so the route's query path resolves to deterministic data.
const memStore: Array<{ id: number; organizationId: number; category: string; subcategory: string; title: string; content: any; updatedAt: Date }> = [];
let memId = 1;

const selectChain: any = {
  from: () => selectChain,
  where: () => selectChain,
  orderBy: () => Promise.resolve(memStore.slice()),
  limit: () => Promise.resolve(memStore.slice(0, 1)),
  then: (resolve: any) => resolve(memStore.slice()),
};

const insertChain: any = {
  values: (vals: any) => {
    const row = { id: memId++, ...vals, updatedAt: new Date() };
    memStore.push(row);
    return { returning: () => Promise.resolve([row]) };
  },
};

const updateChain: any = {
  set: (vals: any) => ({
    where: () => {
      if (memStore[0]) Object.assign(memStore[0], vals);
      return {
        returning: () => Promise.resolve(memStore[0] ? [memStore[0]] : []),
      };
    },
  }),
};

vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return {
    db: {
      select: () => selectChain,
      insert: () => insertChain,
      update: () => updateChain,
      delete: () => ({ where: () => Promise.resolve() }),
    },
    pool,
    getPool: () => pool,
    getDb: () => ({}),
  };
});


import request from 'supertest';
import express from 'express';
import productAuditRoutes from '../product-audit';

describe('Product Audit API', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = { id: 1, email: 'test@example.com', organizationId: 100 };
      req.organizationId = 100;
      next();
    });
    
    app.use('/api/product-audit', productAuditRoutes);
  });

  describe('GET /api/product-audit/responses', () => {
    it('should return empty responses for new organization', async () => {
      const res = await request(app).get('/api/product-audit/responses');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.organizationId).toBe(100);
      expect(res.body.data.responses).toEqual({});
      expect(res.body.data.auditor).toBeDefined();
    });
  });

  describe('POST /api/product-audit/responses', () => {
    it('should save audit responses successfully', async () => {
      const testResponses = {
        '1.1': {
          questionId: '1.1',
          status: 'yes' as const,
          notes: 'Verified compliance',
          severity: 'verified' as const,
          updatedAt: new Date().toISOString()
        },
        '2.3': {
          questionId: '2.3',
          status: 'partial' as const,
          notes: 'Needs additional documentation',
          severity: 'p1' as const,
          updatedAt: new Date().toISOString()
        }
      };

      const res = await request(app)
        .post('/api/product-audit/responses')
        .send({
          responses: testResponses,
          auditor: 'test-auditor@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(100);
      expect(res.body.data.responses['1.1']).toEqual(testResponses['1.1']);
      expect(res.body.data.responses['2.3']).toEqual(testResponses['2.3']);
      expect(res.body.data.auditor).toBe('test-auditor@example.com');
      expect(res.body.message).toBe('Audit responses saved successfully');
    });

    it('should merge new responses with existing ones', async () => {
      // First save
      const firstResponses = {
        '1.1': {
          questionId: '1.1',
          status: 'yes' as const,
          notes: 'First save',
          severity: 'verified' as const,
          updatedAt: new Date().toISOString()
        }
      };

      await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: firstResponses });

      // Second save with different response
      const secondResponses = {
        '2.3': {
          questionId: '2.3',
          status: 'no' as const,
          notes: 'Second save',
          severity: 'p0' as const,
          updatedAt: new Date().toISOString()
        }
      };

      const res = await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: secondResponses });

      expect(res.status).toBe(200);
      expect(res.body.data.responses['1.1']).toEqual(firstResponses['1.1']);
      expect(res.body.data.responses['2.3']).toEqual(secondResponses['2.3']);
    });

    it('should reject invalid status values', async () => {
      const invalidResponses = {
        '1.1': {
          questionId: '1.1',
          status: 'invalid_status',
          notes: 'Test',
          severity: 'p1',
          updatedAt: new Date().toISOString()
        }
      };

      const res = await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: invalidResponses });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid request data');
      expect(res.body.details).toBeDefined();
    });

    it('should reject invalid severity values', async () => {
      const invalidResponses = {
        '1.1': {
          questionId: '1.1',
          status: 'yes',
          notes: 'Test',
          severity: 'invalid_severity',
          updatedAt: new Date().toISOString()
        }
      };

      const res = await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: invalidResponses });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid request data');
    });

    it('should accept null values for status and severity', async () => {
      const nullResponses = {
        '1.1': {
          questionId: '1.1',
          status: null,
          notes: 'Not yet evaluated',
          severity: null,
          updatedAt: new Date().toISOString()
        }
      };

      const res = await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: nullResponses });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responses['1.1'].status).toBeNull();
      expect(res.body.data.responses['1.1'].severity).toBeNull();
    });
  });

  describe('GET after POST', () => {
    it('should retrieve previously saved responses', async () => {
      const testResponses = {
        '1.1': {
          questionId: '1.1',
          status: 'yes' as const,
          notes: 'Saved response',
          severity: 'verified' as const,
          updatedAt: new Date().toISOString()
        }
      };

      // Save responses
      await request(app)
        .post('/api/product-audit/responses')
        .send({ responses: testResponses, auditor: 'auditor@test.com' });

      // Retrieve responses
      const res = await request(app).get('/api/product-audit/responses');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responses['1.1']).toEqual(testResponses['1.1']);
      expect(res.body.data.auditor).toBe('auditor@test.com');
    });
  });
});
