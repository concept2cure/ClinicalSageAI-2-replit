/**
 * §11.50 discovery for governed-action signatures.
 *
 * `electronic_signatures` has two writers. Document signing fills
 * `document_id`; `persistGovernedActionSignature` — the path that records a
 * submission TRANSMITTED to an agency, a sequence frozen, a release dispatched
 * — fills `signed_target` and leaves `document_id` null.
 *
 * Every HTTP read was anchored on a document. `GET /signatures/:documentId`
 * filters `document_id = $1`, so it returned nothing for those rows, and
 * `GET /signatures/:signatureId/manifest` needs an integer id that only that
 * list could have handed you. The manifestations for the platform's most
 * consequential signed actions were written and then unreachable — while
 * §11.50(b) requires the manifestation to be included in any human-readable
 * form of the record.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import part11Router from '../part11-compliance';

/** A governed-transmit row as persistGovernedActionSignature writes it. */
const governedRow = {
  id: 31,
  document_id: null,
  version_id: null,
  signed_target: 'submission-transmittal:884',
  signature_type: 'governed-action',
  signature_purpose: 'release',
  signer_id: 42,
  signer_name: 'Quinn A. Lead',
  signer_title: 'Director, Regulatory QA',
  signer_email: 'q.lead@example.test',
  signature_meaning: 'release',
  signature_hash: 'sha256:abc',
  binding_basis: 'transmitted-bundle-sha256',
  second_factor_verified: true,
  is_valid: true,
  signed_at: new Date('2026-09-01T09:30:00Z'),
  ip_address: '203.0.113.7',
};

function appWithPool(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
  user?: unknown,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).dbClient = { query };
    (req as any).user = user ?? { organizationId: 7 };
    next();
  });
  app.use('/', part11Router);
  return app;
}

describe('GET /signatures/by-target', () => {
  it('finds the signature the governed-action path anchored to a target', async () => {
    const query = vi.fn(async () => ({ rows: [governedRow] }));
    const res = await request(appWithPool(query)).get(
      '/signatures/by-target?target=submission-transmittal%3A884',
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].signed_target).toBe('submission-transmittal:884');
    // The row carries no document_id — which is exactly why the by-document
    // read could never see it.
    expect(res.body.data[0].document_id).toBeNull();
    expect(res.body.data[0].signature_meaning).toBe('release');
    expect(res.body.data[0].binding_basis).toBe('transmitted-bundle-sha256');
  });

  it('scopes to the caller organization, and filters on the target', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await request(appWithPool(query)).get('/signatures/by-target?target=ectd-sequence%3A21');

    const call = query.mock.calls[0] as unknown as [string, unknown[]];
    const sql = call[0];
    const params = call[1];
    expect(sql).toMatch(/signed_target = \$1/);
    expect(sql).toMatch(/organization_id = \$2/);
    expect(params).toEqual(['ectd-sequence:21', 7]);
  });

  /* The literal path is registered before /signatures/:documentId. Express
     matches in order, so the param route would otherwise swallow it and read
     document_id = 'by-target'. */
  it('is not swallowed by the by-document route', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await request(appWithPool(query)).get('/signatures/by-target?target=x');

    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/signed_target = \$1/);
    expect(sql).not.toMatch(/WHERE document_id/);
  });

  it('403s without tenant context — never an unscoped read of signatures', async () => {
    const query = vi.fn(async () => ({ rows: [governedRow] }));
    const res = await request(appWithPool(query, {})).get('/signatures/by-target?target=x');

    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400s when no target is given, rather than listing everything', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const res = await request(appWithPool(query)).get('/signatures/by-target');

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  /* An unprovisioned store must not read as "this action was never signed". */
  it('fails closed on an unprovisioned store instead of returning an empty set', async () => {
    const query = vi.fn(async () => {
      throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
    });
    const res = await request(appWithPool(query)).get('/signatures/by-target?target=x');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('SIGNATURE_STORE_UNPROVISIONED');
  });

  it('does not hand the caller the exception text on a failed read', async () => {
    const query = vi.fn(async () => {
      throw new Error('column "signed_target" does not exist');
    });
    const res = await request(appWithPool(query)).get('/signatures/by-target?target=x');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/signed_target" does not exist/);
  });
});
