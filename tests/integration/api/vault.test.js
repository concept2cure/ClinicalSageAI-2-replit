import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';

// Mock dependencies
jest.mock('pg', () => {
  const mPool = {
    connect: jest.fn().mockImplementation(() => ({
      query: jest.fn().mockImplementation((text, params) => {
        if (text.includes('SELECT * FROM vault_documents')) {
          return {
            rows: [
              { id: 1, name: 'Test Document 1', path: '/test/path1', type: 'pdf' },
              { id: 2, name: 'Test Document 2', path: '/test/path2', type: 'docx' }
            ]
          };
        }
        if (text.includes('INSERT INTO vault_documents')) {
          return { rows: [{ id: 3, name: params[0], path: params[1], type: params[2] }] };
        }
        return { rows: [] };
      }),
      release: jest.fn()
    }),
    query: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

// Get directory paths
const testFilePath = fileURLToPath(import.meta.url);
const testDir = dirname(testFilePath);
const serverDir = join(testDir, '../../server');

// Import API routes
let vaultApiModule;

// Setup test app
let app;

beforeAll(async () => {
  const module = await import(join(serverDir, 'routes/vaultApi.js'));
  vaultApiModule = module.default;

  app = express();
  app.use(express.json());
  app.use('/api/vault', vaultApiModule);
});

afterAll(() => {
  jest.resetAllMocks();
});

describe('VAULT API Endpoints', () => {
  it('GET /api/vault/documents - should return list of documents', async () => {
    const res = await request(app).get('/api/vault/documents');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('name', 'Test Document 1');
    expect(res.body[1]).toHaveProperty('type', 'docx');
  });

  it('POST /api/vault/documents - should create a new document', async () => {
    const res = await request(app)
      .post('/api/vault/documents')
      .send({
        name: 'New Document',
        path: '/test/new-doc',
        type: 'pdf'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 3);
    expect(res.body).toHaveProperty('name', 'New Document');
  });

  it('GET /api/vault/folders - should return list of folders', async () => {
    const res = await request(app).get('/api/vault/folders');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/vault/search - should return search results', async () => {
    const res = await request(app)
      .get('/api/vault/search')
      .query({ query: 'test' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/vault/documents/:id - should return a specific document', async () => {
    const res = await request(app).get('/api/vault/documents/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 1);
  });

  it('POST /api/vault/validate - should validate document structure', async () => {
    const res = await request(app)
      .post('/api/vault/validate')
      .send({
        document: {
          name: 'Test Document',
          path: '/test/path',
          type: 'pdf',
          sections: [
            { title: 'Introduction', content: 'Test content' }
          ]
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
  });
});

describe('VAULT API with Tenant Context Headers', () => {
  it('should include tenant context in requests', async () => {
    const res = await request(app)
      .get('/api/vault/documents')
      .set('X-Organization-ID', 'org123')
      .set('X-Client-Workspace-ID', 'ws456')
      .set('X-Module', 'ectd');

    expect(res.status).toBe(200);
    // In a real test, we would verify that the tenant context was correctly
    // extracted and used in the query - here we're just checking the endpoint works
  });

  it('should handle missing tenant context gracefully', async () => {
    const res = await request(app).get('/api/vault/documents');

    expect(res.status).toBe(200);
    // The endpoint should still work without tenant context headers
  });

  it('should handle partial tenant context correctly', async () => {
    const res = await request(app)
      .get('/api/vault/documents')
      .set('X-Organization-ID', 'org123')
      // Missing other tenant context headers

    expect(res.status).toBe(200);
    // The endpoint should work with partial tenant context
  });
});

describe('VAULT API Error Handling', () => {
  it('should handle database errors gracefully', async () => {
    // Mock a database error for this test
    jest.spyOn(Pool.prototype, 'connect').mockImplementationOnce(() => {
      throw new Error('Database connection error');
    });

    const res = await request(app).get('/api/vault/documents');

    // Endpoint should return an error status but not crash
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should validate document input on POST requests', async () => {
    const res = await request(app)
      .post('/api/vault/documents')
      .send({
        // Missing required fields
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should handle document not found errors', async () => {
    const res = await request(app).get('/api/vault/documents/999');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
