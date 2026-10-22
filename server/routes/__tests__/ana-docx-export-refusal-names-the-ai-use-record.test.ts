/**
 * POST /api/ana/citations/:artifactId/export.docx: the LEDGER_UNAVAILABLE
 * refusal names every part of the ledger whose read can stop the export.
 *
 * Since 2026-10-15 the DOCX export refuses when the AI-use record — the
 * proposals, the citation runs or the authoring plan — could not be read, as
 * it already did for the audit log and the signatures. The route's refusal
 * still said the document "cannot substantiate its audit history or
 * signatures", so a proposals read that failed was reported to the user as an
 * audit or signature problem. It now says its provenance ledger (audit
 * history, signatures or AI-use record) could not be read.
 *
 * Real router, real exporter and collector; the proposals read is failed at
 * the process-wide `pg` stub.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));

import anaFeaturesRouter from '../ana-features';

const artifactRow = {
  id: 11, artifact_id: 'art-1', organization_id: 7, project_id: 3, title: 'Module 2.5', ctd_section: '2.5',
  type: 'section', category: 'clinical', status: 'draft', version: 2, content_hash: 'h',
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', published_at: null, locked_at: null,
  citations: null, citation_run_id: null, citations_at: null, org_name: 'Probe Org', org_uuid: null, project_name: 'P',
};

(mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
  const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
  if (/FROM ana_submission_chat_proposals/i.test(text)) {
    return Promise.reject(Object.assign(new Error('permission denied for table ana_submission_chat_proposals'), { code: '42501' }));
  }
  if (/SELECT content\s+FROM concept2cure_artifacts/i.test(text)) return Promise.resolve({ rows: [{ content: 'body' }], rowCount: 1 });
  if (/FROM concept2cure_artifacts a/i.test(text)) return Promise.resolve({ rows: [artifactRow], rowCount: 1 });
  return Promise.resolve({ rows: [], rowCount: 0 });
});
const originalQuery = mockPool.query;
afterAll(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _s: Response, n: NextFunction) => {
    Object.assign(req, { user: { id: 3, organizationId: 7 }, tenantContext: { organizationId: 7 } });
    n();
  });
  a.use('/api/ana', anaFeaturesRouter);
  return a;
}

describe('export.docx refused for an unread AI-use record', () => {
  it('says the AI-use record is among what could not be read, not only audit history or signatures', async () => {
    const res = await request(app()).post('/api/ana/citations/art-1/export.docx').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('LEDGER_UNAVAILABLE');
    expect(res.body.message, 'the refusal did not name the AI-use record').toMatch(
      /provenance ledger \(audit history, signatures or AI-use record\) could not be read/,
    );
    expect(res.body.message).not.toMatch(/cannot substantiate its audit history or signatures/);
    expect(JSON.stringify(res.body)).not.toMatch(/permission denied|ana_submission_chat_proposals/);
  });
});
