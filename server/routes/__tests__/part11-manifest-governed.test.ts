/**
 * §11.50 manifest endpoint — serves GOVERNED signatures (D6).
 *
 * GET /signatures/:signatureId/manifest previously queried columns that never
 * existed on the physical electronic_signatures table (meaning, custom_meaning,
 * timestamp, signer_organization), so it 500'd for EVERY stored signature. D6
 * fixed it to the physical schema so it manifests both document-anchored rows
 * and governed-sign rows (signed_target / binding_basis).
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import part11Router from '../part11-compliance';

/** A governed-sign row as the D6 write path persists it (physical columns). */
const governedRow = {
  id: 12,
  signer_name: 'Quinn A. Lead',
  signer_title: 'Director, Regulatory QA',
  signer_organization: 'Acme Bio',
  meaning: 'approval', // COALESCE(signature_meaning, signature_type) alias
  signed_at: new Date('2026-08-13T10:00:00Z'),
  signed_target: 'ectd-sequence:21',
  binding_basis: 'ectd-sequence-leaf-manifest-sha256',
};

function appWithPool(query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>, user?: any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).dbClient = { query };
    // The route now refuses without a tenant, so the default supplies one —
    // otherwise every case below asserts the 403 instead of what it is about.
    (req as any).user = user ?? { organizationId: 7 };
    next();
  });
  app.use('/', part11Router);
  return app;
}

describe('GET /signatures/:signatureId/manifest — governed signatures (§11.50)', () => {
  it('manifests a governed-sign row: printed name, date/time, meaning, target, basis', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [governedRow] }));
    const res = await request(appWithPool(query)).get('/signatures/12/manifest');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.signerName).toBe('Quinn A. Lead');
    expect(res.body.data.meaningLabel).toBe('Approved');
    expect(res.body.data.signedAt).toBe('2026-08-13T10:00:00.000Z');
    expect(res.body.data.signedTarget).toBe('ectd-sequence:21');
    expect(res.body.data.bindingBasis).toBe('ectd-sequence-leaf-manifest-sha256');
    expect(res.body.data.manifestText).toContain('Quinn A. Lead');
    expect(res.body.data.manifestText).toContain('Meaning: Approved');

    // The query hits the PHYSICAL schema, not the phantom columns.
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/signature_meaning/);
    expect(sql).toMatch(/signed_at/);
    expect(sql).not.toMatch(/custom_meaning/);
  });

  it('tenant-scopes the lookup when the request carries an organization', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [governedRow] }));
    const res = await request(appWithPool(query, { organizationId: 7 })).get('/signatures/12/manifest');
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    // Was `organization_id = $2 OR es.organization_id IS NULL`. The NULL arm let
    // every tenant read any unattributed row — looser than the RLS policy behind
    // it, which excludes NULL for the same reason. Removed.
    expect(sql).toMatch(/es\.organization_id = \$2/);
    expect(sql).not.toMatch(/IS NULL/);
    expect(params).toEqual([12, 7]);
  });

  it('400s on a non-numeric signature id before touching the database', async () => {
    const query = vi.fn();
    const res = await request(appWithPool(query)).get('/signatures/not-a-number/manifest');
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('404s when the signature does not exist (or belongs to another org)', async () => {
    const res = await request(appWithPool(async () => ({ rows: [] }))).get('/signatures/99/manifest');
    expect(res.status).toBe(404);
  });

  it('503s (fail closed) when the store or its D6 columns are unprovisioned', async () => {
    const err: any = new Error('column "signed_target" does not exist');
    err.code = '42703';
    const res = await request(appWithPool(async () => { throw err; })).get('/signatures/12/manifest');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
