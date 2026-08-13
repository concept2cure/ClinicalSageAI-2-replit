/**
 * IND forms — POST /:formId/artifact project-identity resolution.
 *
 * Pins the id-space unblock for "Save to dossier": window.C2C_PROJECT.id is a
 * regulatory_programs UUID, and this route used to demand a numeric projectId,
 * so the panel could never persist a governed record for a program-spine
 * project. Now:
 *   • projectId (numeric) — unchanged governed path: org-scoped project check,
 *     concept2cure_artifacts insert, 201.
 *   • projectIdent (program UUID or code) — resolved org-scoped against
 *     regulatory_programs; the artifact registry's projects.id FK has no
 *     mapping for the program spine, so the route uses the eSTAR /build
 *     audited-unplaced degradation: the built field map is content-hashed and
 *     audit-logged (the audit row IS the record — REQUIRED, fail-closed), and
 *     the 200 response says `governed:false, audited:true, artifactId:null`
 *     with the unplaced reason. No artifact row is fabricated.
 *   • an unresolvable ident is a 404 that leaks nothing; an audit failure is a
 *     500 — never a response claiming `audited: true` over nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockSelectRows, mockInsertReturning, auditLog } = vi.hoisted(() => ({
  mockSelectRows: vi.fn<[], unknown[]>(() => []),
  mockInsertReturning: vi.fn(async () => [{ id: 5 }]),
  auditLog: vi.fn(async () => {}),
}));

// Fake drizzle db, built inside vi.hoisted per the 510k-device-routes idiom.
const { fakeDb } = vi.hoisted(() => ({
  fakeDb: {
    select: vi.fn(),
    insert: vi.fn(),
  } as any,
}));
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/middleware/auth', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/services/auditService', () => ({ default: { logAction: auditLog } }));
vi.mock('../../server/services/provenance/artifact-provenance', () => ({
  recordArtifactProvenanceDrizzle: vi.fn(async () => {}),
}));

fakeDb.select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({ limit: vi.fn(async () => mockSelectRows()) })),
  })),
}));
fakeDb.insert = vi.fn(() => ({
  values: vi.fn(() => ({ returning: mockInsertReturning })),
}));

import indFormsRoutes from '../../server/routes/ind-forms.routes';

function artifactHandler() {
  const layer = (indFormsRoutes as any).stack.find(
    (l: any) => l.route?.path === '/:formId/artifact' && l.route?.methods?.post,
  );
  if (!layer) throw new Error('Missing route POST /:formId/artifact');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

function makeReq(body: Record<string, unknown>) {
  const req = createMockRequest({ params: { formId: 'FDA_1571' }, body }) as any;
  req.user = { id: 3, organizationId: 2 };
  req.tenantContext = { organizationId: 2 };
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertReturning.mockResolvedValue([{ id: 5 }]);
});

describe('POST /:formId/artifact — numeric legacy path (unchanged)', () => {
  it('persists a governed artifact for a numeric projectId', async () => {
    mockSelectRows.mockReturnValue([{ id: 7 }]); // the org-scoped projects row
    const req = makeReq({ projectId: 7, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ formId: 'FDA_1571', projectId: 7 });
    expect(String(payload.artifactId)).toMatch(/^artifact_indform_1571_/);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
  });

  it('a numeric projectIdent string takes the same governed path', async () => {
    mockSelectRows.mockReturnValue([{ id: 7 }]);
    const req = makeReq({ projectIdent: '7', sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
  });
});

describe('POST /:formId/artifact — program-spine ident (audited-unplaced degradation)', () => {
  it('resolves the program org-scoped, audit-logs the content hash, and says the registry placement is pending', async () => {
    mockSelectRows.mockReturnValue([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }]);
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      governed: false,
      audited: true,
      artifactId: null,
      projectId: null,
      programId: UUID,
      formId: 'FDA_1571',
    });
    expect(String(payload.artifact_registry)).toContain('unplaced');
    expect(String(payload.contentHash)).toMatch(/^[0-9a-f]{64}$/);
    // The audit row carries the same content hash — it IS the persisted record.
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ind_form.artifact.unplaced',
        organizationId: 2,
        metadata: expect.objectContaining({
          programId: UUID,
          contentHash: payload.contentHash,
          artifactRegistry: 'unplaced_pending_document_identity_contract',
        }),
      }),
    );
    // NOTHING was inserted into the artifact registry — no fabricated row.
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it('404s an ident that resolves to nothing in the caller org', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the audit write fails — never claims audited:true over nothing', async () => {
    mockSelectRows.mockReturnValue([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }]);
    auditLog.mockRejectedValueOnce(new Error('audit store down'));
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain('"audited":true');
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it('400s when neither projectId nor projectIdent is supplied', async () => {
    const req = makeReq({ sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toContain('projectIdent');
  });
});
