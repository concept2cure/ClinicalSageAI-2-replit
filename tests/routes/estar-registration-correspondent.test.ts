/**
 * GET/PUT /api/510k/estar/registration — the correspondent and Declaration
 * of Conformity facts (WO-8 Phase 3).
 *
 * The official eSTAR's Correspondent Information section and DoC page are
 * filled from the org's estar_registrations row, so the registration write
 * must ACCEPT the five facts (and their clearing to null) and the read must
 * hand them back. Without the schema entries zod strips the keys silently and
 * the upsert never sees them — the exact regression these tests pin.
 *
 * declarationCompanyName is one of the five because a Declaration of Conformity
 * is signed by ONE legal entity: its name has to reach the same row its address
 * does, or the form states a name and an address belonging to two companies.
 *
 * The service is mocked: what is asserted is the route's contract (what
 * reaches the upsert, what the body carries back), not persistence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({}) }));
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

const { mockUpsert, mockGet } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockGet: vi.fn(),
}));
vi.mock('../../server/services/pathway-engines/estar/estar-registration-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertEstarRegistration: mockUpsert,
  getEstarRegistration: mockGet,
}));

import estarRoutes from '../../server/routes/510k-estar-routes';

function getHandler(routePath: string, method: 'get' | 'put') {
  const layer = estarRoutes.stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq(body: any = {}) {
  const req = createMockRequest({ body }) as any;
  req.userRole = 'editor';
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  req.tenantContext = { organizationId: 2 };
  req.user = { id: 9, organizationId: 2, role: 'editor' };
  return req;
}

const STORED = {
  id: 'reg-1',
  organizationId: 2,
  fdaEsgAccount: true,
  cdrhPortalAccount: false,
  organizationIdentity: false,
  mdufaFeeAccount: false,
  esgAccountId: null,
  cdrhPortalEmail: null,
  duns: null,
  fei: null,
  mdufaOrgId: null,
  mdufaFeeTier: null,
  variants: ['device', 'ivd'],
  notes: null,
  correspondentCompanyName: 'Regulatory Partners LLC',
  correspondentContactEmail: 'corr@partners.example',
  correspondentTelephone: '+1 555 0199',
  declarationCompanyName: 'Declaring Entity GmbH',
  declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
  createdAt: new Date('2026-09-03T00:00:00Z'),
  updatedAt: new Date('2026-09-03T00:00:00Z'),
  createdBy: 9,
};

describe('PUT /api/510k/estar/registration — correspondent and declaration facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue(STORED);
  });

  it('the five facts reach the audited upsert exactly as sent, and come back on `registration`', async () => {
    const body = {
      correspondentCompanyName: 'Regulatory Partners LLC',
      correspondentContactEmail: 'corr@partners.example',
      correspondentTelephone: '+1 555 0199',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
    };
    const res = createMockResponse() as any;

    await getHandler('/registration', 'put')(makeReq(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toEqual(body);
    expect(mockUpsert.mock.calls[0][1]).toEqual({ organizationId: 2, userId: 9 });
    const payload = res.json.mock.calls[0][0];
    expect(payload.registered).toBe(true);
    expect(payload.registration).toMatchObject(body);
  });

  it('null CLEARS a fact (it is forwarded as null, not dropped)', async () => {
    const res = createMockResponse() as any;

    await getHandler('/registration', 'put')(
      makeReq({ correspondentTelephone: null, declarationCompanyName: null, declarationCompanyAddress: null }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert.mock.calls[0][0]).toEqual({
      correspondentTelephone: null,
      declarationCompanyName: null,
      declarationCompanyAddress: null,
    });
  });

  it('the declaration name and address travel together, so the DoC names one legal entity', async () => {
    const res = createMockResponse() as any;
    const body = {
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
    };

    await getHandler('/registration', 'put')(makeReq(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert.mock.calls[0][0]).toEqual(body);
    expect(res.json.mock.calls[0][0].registration).toMatchObject(body);
  });

  it.each<[string, number]>([
    ['correspondentCompanyName', 257],
    ['correspondentContactEmail', 257],
    ['correspondentTelephone', 65],
    ['declarationCompanyName', 257],
    ['declarationCompanyAddress', 1001],
  ])('%s over its column width is refused 400 and nothing is written', async (key, length) => {
    const res = createMockResponse() as any;

    await getHandler('/registration', 'put')(makeReq({ [key]: 'x'.repeat(length) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('Invalid request payload');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('the widths are the column widths, not smaller: the maximum length is accepted', async () => {
    const res = createMockResponse() as any;
    const body = {
      correspondentCompanyName: 'a'.repeat(256),
      correspondentTelephone: '1'.repeat(64),
      declarationCompanyName: 'c'.repeat(256),
      declarationCompanyAddress: 'b'.repeat(1000),
    };

    await getHandler('/registration', 'put')(makeReq(body), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpsert.mock.calls[0][0]).toEqual(body);
  });
});

describe('GET /api/510k/estar/registration — the stored facts come back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the five facts on `registration` when the org has a row', async () => {
    mockGet.mockResolvedValue(STORED);
    const res = createMockResponse() as any;

    await getHandler('/registration', 'get')(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.registered).toBe(true);
    expect(payload.registration).toMatchObject({
      correspondentCompanyName: 'Regulatory Partners LLC',
      correspondentContactEmail: 'corr@partners.example',
      correspondentTelephone: '+1 555 0199',
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
    });
  });

  it('an org that never registered gets registered:false and a null registration — nothing invented', async () => {
    mockGet.mockResolvedValue(null);
    const res = createMockResponse() as any;

    await getHandler('/registration', 'get')(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual({
      registered: false,
      registration: null,
      clientRegistration: { clientId: '2', satisfied: [] },
    });
  });
});
