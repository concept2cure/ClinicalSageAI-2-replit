/**
 * Source Tracer route — recorded lineage, honest failure modes.
 *
 * The endpoint serves recorded canonical-source citations via
 * source-usage.service. These tests drive the real handler and pin:
 *   - the response shape the surface renders (per-section, per-source state);
 *   - 401 with no tenant context (never an org-wide default);
 *   - 400 on a non-UUID documentId (authoring doc ids are UUIDs; Postgres must
 *     never see the cast);
 *   - 503 fail-closed when the citation store is not provisioned — a missing
 *     table must never read as an empty library;
 *   - and that the route passes the caller's org to the service untouched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockListCitedSections } = vi.hoisted(() => ({ mockListCitedSections: vi.fn() }));
vi.mock('../../server/services/clinical-regulatory-evidence/source-usage.service.js', () => ({
  listCitedSections: mockListCitedSections,
}));

import createSourceTracerRoutes from '../../server/routes/source-tracer-routes';

function getHandler() {
  const router = createSourceTracerRoutes();
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === '/sections' && l.route?.methods?.get,
  );
  if (!layer) throw new Error('Missing GET /sections');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const ORG = 91;
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function authedReq(query: Record<string, string> = {}) {
  const r = createMockRequest({ query });
  (r as any).user = { organizationId: ORG };
  return r;
}

function citedSection() {
  return {
    sectionId: 'sec-1',
    sectionCode: 'P.1',
    sectionTitle: 'Composition',
    documentId: DOC,
    documentTitle: 'CTD 3.2.P',
    module: 'M3',
    documentStatus: 'draft',
    sources: [
      {
        citationId: 'cite-1',
        sectionId: 'sec-1',
        citedAt: '2026-07-20T00:00:00.000Z',
        citedBy: 'user-1',
        citationText: null,
        citedChecksum: 'sha-1',
        state: 'current',
        source: {
          id: 5, title: 'protocol.pdf', checksum: 'sha-1', sourceType: 'client_document',
          ingestionStatus: 'ingested', extractionStatus: 'extracted',
          mimeType: 'application/pdf', fileUploadId: 'file_1', updatedAt: null,
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/source-tracer/sections', () => {
  it('shapes recorded citations for the surface, state passed through untouched', async () => {
    mockListCitedSections.mockResolvedValue([citedSection()]);
    const res = createMockResponse();
    await getHandler()(authedReq(), res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    const sec = body.data.sections[0];
    expect(sec).toMatchObject({ id: 'sec-1', doc: 'CTD 3.2.P', sec: 'P.1', status: 'draft' });
    expect(sec.sources[0]).toMatchObject({
      citationId: 'cite-1',
      state: 'current',
      sourceTitle: 'protocol.pdf',
      citedChecksum: 'sha-1',
      currentChecksum: 'sha-1',
    });
    // The org came from authenticated context, not the request body.
    expect(mockListCitedSections).toHaveBeenCalledWith(ORG, { documentId: null });
  });

  it('keeps an unresolved citation in the payload with null source fields', async () => {
    const section = citedSection();
    section.sources = [{ ...section.sources[0], state: 'unresolved', source: null } as any];
    mockListCitedSections.mockResolvedValue([section]);
    const res = createMockResponse();
    await getHandler()(authedReq(), res);

    const src = (res.json as any).mock.calls[0][0].data.sections[0].sources[0];
    expect(src.state).toBe('unresolved');
    expect(src.sourceId).toBeNull();
    expect(src.sourceTitle).toBeNull();
  });

  it('refuses without authenticated tenant context', async () => {
    const res = createMockResponse();
    await getHandler()(createMockRequest({}), res);
    expect((res.status as any).mock.calls[0][0]).toBe(401);
    expect(mockListCitedSections).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID documentId before it reaches Postgres', async () => {
    const res = createMockResponse();
    await getHandler()(authedReq({ documentId: '42; DROP TABLE' }), res);
    expect((res.status as any).mock.calls[0][0]).toBe(400);
    expect(mockListCitedSections).not.toHaveBeenCalled();
  });

  it('passes a valid documentId filter through', async () => {
    mockListCitedSections.mockResolvedValue([]);
    const res = createMockResponse();
    await getHandler()(authedReq({ documentId: DOC }), res);
    expect(mockListCitedSections).toHaveBeenCalledWith(ORG, { documentId: DOC });
  });

  it('fails closed with 503 when the citation store is not provisioned', async () => {
    // A missing table must never render as an empty library — 503 tells the
    // surface (and its tests) the read failed, not that nothing is recorded.
    mockListCitedSections.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = createMockResponse();
    await getHandler()(authedReq(), res);
    expect((res.status as any).mock.calls[0][0]).toBe(503);
    expect((res.json as any).mock.calls[0][0].error).toBe('CITATION_STORE_MISSING');
  });

  it('returns 500 with an honest message on any other failure', async () => {
    mockListCitedSections.mockRejectedValue(new Error('boom'));
    const res = createMockResponse();
    await getHandler()(authedReq(), res);
    expect((res.status as any).mock.calls[0][0]).toBe(500);
  });
});
