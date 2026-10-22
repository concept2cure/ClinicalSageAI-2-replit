/**
 * The composition boundary's refusal reaches the caller of the Module 3 board,
 * of placement and of AnA's three board commands, as the boundary's own answer.
 *
 * getModule3BuildStatus and placeModule3IntoSubmission decide; this pins the
 * mapping each caller makes of their refusal (2026-10-22). Deleting any of
 * these used to leave every test green: the build-state route answered a 500
 * ("Couldn't load… sign in and retry") for a biologic, placement fell through
 * to a generic 409 without the boundary's code, and the commands reported a
 * tool failure. The decisions themselves are pinned in
 * services/cmc/__tests__/composition-boundary-readers.pglite.test.ts and
 * place-module3-into-submission.test.ts.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ status: vi.fn(), place: vi.fn() }));

vi.mock('../../../services/cmc/project-membership', () => ({ projectBelongsToTenant: async () => true }));
vi.mock('../../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: async () => null }));
vi.mock('../../../db', () => ({
  getPool: () => ({ query: async () => ({ rows: [] }), connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) }),
}));
vi.mock('../../../routes/c2c/actions', () => ({ verifyReauth: vi.fn(), recordGovernedAction: vi.fn() }));
vi.mock('../../../middleware/auth', async (orig) => ({
  ...(await orig<object>()),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../services/module3-convergence-service', async (orig) => ({
  ...(await orig<object>()),
  getModule3BuildStatus: (...a: unknown[]) => H.status(...a),
}));
vi.mock('../../../services/cmc/place-module3-into-submission', async (orig) => ({
  ...(await orig<object>()),
  placeModule3IntoSubmission: (...a: unknown[]) => H.place(...a),
}));

import buildStateRouter from '../module3BuildStateRoutes';
import osRouter from '../module3OperatingSystemRoutes';
import { CompositionOutOfScopeError, applicationNotReadable, type CompositionRefusal } from '../../../services/cmc/composition-scope';
import { module3MissingInputs, module3RefreshStale, module3StaleSections } from '../../../services/ana-ri/module3-command-handlers';

const ORG = 101;
const P = '0b6f0f86-6f2d-4c1b-9a2e-0d1c7f5d0a11';
const MAB: CompositionRefusal = {
  code: 'CMC_MODALITY_OUT_OF_SCOPE',
  modality: 'biologic',
  message: "This program's drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.",
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenantId = ORG;
    (req as any).tenantContext = { organizationId: ORG };
    (req as any).user = { id: 9, organizationId: ORG };
    next();
  });
  a.use('/api/cmc/module3-os', buildStateRouter);
  a.use('/api/cmc/module3-os', osRouter);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /build-state/:projectId', () => {
  it('answers the boundary’s refusal 409, with its code and where the program’s Module 3 is authored', async () => {
    H.status.mockRejectedValue(new CompositionOutOfScopeError(MAB));
    const res = await request(app()).get(`/api/cmc/module3-os/build-state/${P}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'CMC_MODALITY_OUT_OF_SCOPE', error: MAB.message });
    expect(res.body.hint).toMatch(/Document editor/);
  });

  it('answers a read the boundary could not make 503, never as a verdict', async () => {
    H.status.mockRejectedValue(new CompositionOutOfScopeError(applicationNotReadable()));
    const res = await request(app()).get(`/api/cmc/module3-os/build-state/${P}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('CMC_APPLICATION_NOT_READABLE');
  });
});

describe('POST /place-into-submission/:projectId', () => {
  it('answers the boundary’s refusal with its code, its words and its hint', async () => {
    const NDA: CompositionRefusal = {
      code: 'CMC_APPLICATION_OUT_OF_SCOPE',
      applicationType: 'nda',
      message: 'This submission files NDA, and Module 3 is composed and placed here only for a US IND.',
    };
    H.place.mockResolvedValue({ placed: false, refusedBy: 'composition-scope', error: NDA.message, refusal: NDA });
    const res = await request(app())
      .post(`/api/cmc/module3-os/place-into-submission/${P}`)
      .send({ submissionId: 10, sequenceId: 20, reason: 'Placing approved Module 3 into the amendment sequence' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'CMC_APPLICATION_OUT_OF_SCOPE', error: NDA.message });
    expect(res.body.hint).toMatch(/Document editor/);
  });
});

describe('AnA’s board commands relay the refusal as their answer', () => {
  const ctx = { organizationId: ORG, userId: 9, activeProjectId: P } as never;
  it.each([
    ['module3_missing_inputs', () => module3MissingInputs(ctx, {})],
    ['module3_stale_sections', () => module3StaleSections(ctx, {})],
    ['module3_refresh_stale', () => module3RefreshStale(ctx, {})],
  ] as const)('%s', async (action, run) => {
    H.status.mockRejectedValue(new CompositionOutOfScopeError(MAB));
    expect(await run()).toEqual({ success: false, action, message: MAB.message });
  });
});
