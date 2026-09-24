/**
 * /readyz reports whether the vault store answers.
 *
 * The vault holds a filing's source documents, and every upload writes its
 * bytes before a row is recorded (vault-ingest.service.ts refuses otherwise).
 * /readyz checked the database, the schema, AnA and Redis, but not the store.
 * A task whose role could not reach its bucket, or whose storage/ volume was
 * not writable, reported ready and then refused every upload. D1's evidence is
 * a readiness JSON, so it has to say this.
 *
 * The body names only the provider. /readyz answers before authentication and
 * must not publish a bucket name.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const probe = vi.hoisted(() => ({
  select: (): { name: string; isAvailable: () => Promise<boolean> } => ({ name: 's3', isAvailable: async () => true }),
}));
vi.mock('../../services/storage', () => ({
  getStorageProvider: () => probe.select(),
}));

import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { setSchemaReadiness } from '../readiness-state';
import { setAnaReadiness } from '../ana-readiness-state';

const okPool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never;

function appWithHealth() {
  const app = express();
  mountFastPathHealthEndpoints(app, okPool);
  return app;
}

beforeEach(() => {
  // Every other dependency healthy, so the store is the only variable.
  setSchemaReadiness('ready');
  setAnaReadiness('ready', 'test fixture: AnA provider pinned healthy');
  probe.select = () => ({ name: 's3', isAvailable: async () => true });
});

describe('/readyz and the vault store', () => {
  it('is ready, and says the store is ok, when the store answers', async () => {
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.storage).toBe('ok');
  });

  it('is not ready when the store does not answer', async () => {
    probe.select = () => ({ name: 's3', isAvailable: async () => false });
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.failed).toContain('storage');
    expect(res.body.storageDetail).toMatch(/s3/);
    expect(JSON.stringify(res.body)).not.toMatch(/bucket/i);
  });

  it('is not ready when the probe throws', async () => {
    probe.select = () => ({
      name: 's3',
      isAvailable: async () => {
        throw new Error('AccessDenied: c2c-prod-vault');
      },
    });
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.storage).toBe('down');
    expect(JSON.stringify(res.body), 'the bucket name must not reach an unauthenticated response').not.toMatch(/c2c-prod-vault/);
  });

  it('is not ready when no store can be selected', async () => {
    probe.select = () => {
      throw new Error("STORAGE_PROVIDER 'gcs' is not a storage provider this server implements");
    };
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.storage).toBe('down');
  });

  it('is not ready, and does not hang, when the store never answers', async () => {
    probe.select = () => ({ name: 's3', isAvailable: () => new Promise<boolean>(() => {}) });
    const started = Date.now();
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.storage).toBe('down');
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);
});
