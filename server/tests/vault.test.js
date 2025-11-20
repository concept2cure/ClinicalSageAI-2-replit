// server/tests/vault.test.js
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const express = require('express');
const vaultRoutes = require('../routes/vault');

const fixturesDir = path.join(__dirname, 'fixtures');

describe('Vault API Endpoints', () => {
  let app;

  beforeAll(() => {
    // 1) Point VAULT_BASE_PATH at our fixtures directory
    process.env.VAULT_BASE_PATH = fixturesDir;

    // 2) Create a minimal folder structure:
    //    fixtures/
    //      M1/
    //        module-1.pdf
    //      M2/
    //        module-2.pdf
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    ['M1', 'M2'].forEach(mod => {
      const folder = path.join(fixturesDir, mod);
      fs.mkdirSync(folder, { recursive: true });
      const fileName = `${mod.toLowerCase()}.pdf`.replace(
        mod.toLowerCase(),
        `module-${mod.slice(1)}`
      );
      fs.writeFileSync(path.join(folder, fileName), 'dummy content');
    });

    // 3) Spin up an Express app using your vault routes
    app = express();
    app.use(express.json());
    app.use('/api/vault', vaultRoutes);
  });

  afterAll(() => {
    // Clean up fixtures
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  });

  test('GET /api/vault/folders returns list of modules', async () => {
    const res = await request(app).get('/api/vault/folders');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should contain folder IDs "M1" and "M2"
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'M1', name: 'M1', isFolder: true }),
        expect.objectContaining({ id: 'M2', name: 'M2', isFolder: true }),
      ])
    );
  });

  test('GET /api/vault/folders/:id/contents returns files in module', async () => {
    const res = await request(app).get('/api/vault/folders/M1/contents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'module-1.pdf',
          name: 'module-1.pdf',
          isFolder: false,
        }),
      ])
    );
  });

  test('GET /api/vault/files/:id/download serves a file (200) or 404', async () => {
    // Existing fixture:
    const validId = 'module-1.pdf';
    const ok = await request(app).get(`/api/vault/files/${validId}/download`);
    expect(ok.status).toBe(200);

    // Non‐existent:
    const missing = await request(app).get('/api/vault/files/does-not-exist/download');
    expect(missing.status).toBe(404);
  });

  test('POST /api/vault/compile returns a ZIP stream', async () => {
    const res = await request(app)
      .post('/api/vault/compile')
      .send({ fileIds: ['module-1.pdf', 'module-2.pdf'] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);
  });

  test('POST /api/vault/validate rejects an invalid ZIP', async () => {
    const badBase64 = Buffer.from('not a zip').toString('base64');
    const res = await request(app).post('/api/vault/validate').send({ zipBlob: badBase64 });
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('Tenant context headers are processed correctly', async () => {
    const res = await request(app)
      .get('/api/vault/folders')
      .set('X-Organization-ID', 'test-org')
      .set('X-Client-Workspace-ID', 'test-workspace')
      .set('X-Module', 'ectd');

    expect(res.status).toBe(200);
    // In a real implementation, we might check for tenant-specific data
  });
});
