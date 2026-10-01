import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as nodeCrypto from 'node:crypto';
import { createMockRequest, createMockResponse } from '../setup';

const mockGenerateDocxBuffer = vi.fn(async () => Buffer.from('docx-bytes'));
const mockGeneratePptxBuffer = vi.fn(async () => Buffer.from('pptx-bytes'));

vi.mock('../../server/services/docxGenerator', () => ({
  generateDocxBuffer: mockGenerateDocxBuffer,
}));

vi.mock('../../server/services/pptxGenerator', () => ({
  generatePptxBuffer: mockGeneratePptxBuffer,
}));

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })),
    })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    })),
  },
  pool: { query: vi.fn() },
}));

// D5 (a05ba7eb0): an export is recorded before it is delivered, as an
// EXPORT_GENERATED audit row carrying the SHA-256 of the delivered bytes, and
// is not delivered when that row does not persist. The mocked db above cannot
// persist a row, so the audit writer reports a persisted one here. The refusal
// branch is proven in server/routes/c2c/__tests__/exports-recorded.test.ts.
const mockLogAction = vi.hoisted(() => vi.fn());
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => mockLogAction(...a) },
}));

const sha256 = (b: Buffer) => nodeCrypto.createHash('sha256').update(b).digest('hex');

// What authMiddleware + tenantContextMiddleware leave on the request; both are
// mocked to pass-through below. The export record is attributed to them.
const PRINCIPAL = { organizationId: 4242, userId: 17 };
function withPrincipal(req: any) {
  return Object.assign(req, PRINCIPAL);
}

/** The file was recorded, then delivered: the row names the exact bytes sent. */
function expectRecordedThenDelivered(res: any, bytes: Buffer) {
  expect(mockLogAction).toHaveBeenCalledWith(
    expect.objectContaining({
      ...PRINCIPAL,
      action: 'EXPORT_GENERATED',
      details: expect.objectContaining({ sha256: sha256(bytes) }),
    })
  );
  expect(res.setHeader).toHaveBeenCalledWith('X-Export-Sha256', sha256(bytes));
  expect(res.send).toHaveBeenCalledWith(bytes);
  expect(mockLogAction.mock.invocationCallOrder[0]).toBeLessThan(
    res.send.mock.invocationCallOrder[0]
  );
}

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: any, _res: any, next: any) => next(),
  requireOrganizationContext: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

// The export family moved to its own router (L53, slice 7).
import exportRouter from '../../server/routes/c2c/exports';

function getRouteHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = exportRouter.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method]
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('Concept2Cure export governance gates', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalReviewGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
    process.env.NODE_ENV = 'test';
    delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalReviewGate === undefined) {
      delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
    } else {
      process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = originalReviewGate;
    }
  });

  it('blocks DOCX export when strict review gate is enabled and approval is missing', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      body: {
        title: 'Regulatory Memo',
        content: 'Draft content',
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'HUMAN_REVIEW_REQUIRED' }),
      })
    );
    expect(mockGenerateDocxBuffer).not.toHaveBeenCalled();
  });

  it('allows DOCX export in non-strict mode and injects governance headers + review notice', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({
      body: {
        title: 'Regulatory Memo',
        content: 'Draft content',
      },
    }) as any;
    withPrincipal(req);
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    expect(mockGenerateDocxBuffer).toHaveBeenCalledTimes(1);
    const [, mergedContent] = mockGenerateDocxBuffer.mock.calls[0];
    expect(mergedContent).toContain('DRAFT — NOT AGENCY-VALIDATED');

    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-AI-Generated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Required', 'true');
    expectRecordedThenDelivered(res, Buffer.from('docx-bytes'));
  });

  it('rejects a fabricated approval state without complete reviewer attribution', async () => {
    const req = createMockRequest({
      body: {
        title: 'Regulatory Memo',
        content: 'Draft content',
        governance: {
          aiGenerated: false,
          humanReviewApproved: true,
          reviewerName: 'Dr. Jane Doe',
        },
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'INCOMPLETE_HUMAN_REVIEW' }),
      })
    );
    expect(mockGenerateDocxBuffer).not.toHaveBeenCalled();
  });

  it('labels a human-authored export as draft and not agency-validated', async () => {
    const req = createMockRequest({
      body: {
        title: 'Human-authored Regulatory Memo',
        content: 'Human-authored draft content',
        governance: { aiGenerated: false, humanReviewApproved: false },
      },
    }) as any;
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-docx', 'post');
    await handler(req, res);

    const [, mergedContent] = mockGenerateDocxBuffer.mock.calls[0];
    expect(mergedContent).toContain('DRAFT — NOT AGENCY-VALIDATED');
    expect(mergedContent).toContain('Human-authored draft content');
  });

  it('allows PPTX export in strict mode when approved and includes reviewer headers', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      body: {
        title: 'Briefing Deck',
        content: 'Slide 1\n---\nSlide 2',
        governance: {
          aiGenerated: true,
          humanReviewApproved: true,
          reviewerName: 'Dr. Jane Doe',
          reviewerRole: 'Regulatory Affairs Lead',
          reviewTimestamp: '2026-03-24T12:00:00.000Z',
        },
      },
    }) as any;
    withPrincipal(req);
    const res = createMockResponse();

    const handler = getRouteHandler('/artifacts/export-pptx', 'post');
    await handler(req, res);

    expect(mockGeneratePptxBuffer).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Reviewer', 'Dr.%20Jane%20Doe');
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Concept2Cure-Review-Timestamp',
      '2026-03-24T12:00:00.000Z'
    );
    expectRecordedThenDelivered(res, Buffer.from('pptx-bytes'));
  });
});

/* ── Download of a rendered file is tenant-scoped (IAM-07 / P0-6) ──────────── */

describe('GET /documents/download/:filename serves only the caller’s own tenant prefix', () => {
  // The defect: the route resolved `generated_documents/<name>` — one flat
  // directory for every tenant, names predictable (`<Title>_<type>_<YYYYMMDD>.docx`)
  // — with no ownership check. Files are now written under
  // `generated_documents/org-<id>/` and the route resolves only inside the
  // caller's prefix; a file elsewhere is indistinguishable from a missing one.
  const ROOT = path.resolve('generated_documents');
  const ORG_A = 990001;
  const ORG_B = 990002;
  const NAME = `p06-${nodeCrypto.randomBytes(4).toString('hex')}.docx`;
  const FLAT_ONLY = `p06-flat-${nodeCrypto.randomBytes(4).toString('hex')}.docx`;
  const A_BYTES = 'tenant-a-bytes';

  beforeAll(async () => {
    await fs.mkdir(path.join(ROOT, `org-${ORG_A}`), { recursive: true });
    await fs.writeFile(path.join(ROOT, `org-${ORG_A}`, NAME), A_BYTES);
    // A legacy file with the SAME name at the flat location, and one that only
    // exists flat: neither may be served to anyone.
    await fs.writeFile(path.join(ROOT, NAME), 'legacy-flat-bytes');
    await fs.writeFile(path.join(ROOT, FLAT_ONLY), 'legacy-flat-only-bytes');
  });

  afterAll(async () => {
    await fs.rm(path.join(ROOT, `org-${ORG_A}`), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, `org-${ORG_B}`), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, NAME), { force: true });
    await fs.rm(path.join(ROOT, FLAT_ONLY), { force: true });
  });

  function appAs(orgId: number | null) {
    const app = express();
    app.use((req, _res, next) => {
      // What authenticateToken + tenantContextMiddleware leave behind; both are
      // mocked to pass-through above, so the tenant is set here per case.
      if (orgId !== null) (req as any).organizationId = orgId;
      (req as any).userId = 1;
      (req as any).userRole = 'user';
      (req as any).userEmail = 'p06@example.test';
      next();
    });
    app.use('/api/concept2cure', exportRouter);
    return app;
  }

  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('answers 404 to org B for a file org A generated, without naming the path', async () => {
    const res = await request(appAs(ORG_B)).get(`/api/concept2cure/documents/download/${NAME}`);

    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(`org-${ORG_A}`);
    expect(body).not.toContain(ROOT);
    expect(body).not.toContain(A_BYTES);
    expect(res.text).not.toContain(A_BYTES);
    expect(res.text).not.toContain('legacy-flat');
  });

  it('still serves the owning organization (positive control)', async () => {
    const res = await request(appAs(ORG_A))
      .get(`/api/concept2cure/documents/download/${NAME}`)
      .buffer(true)
      .parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${NAME}"`);
    expect((res.body as Buffer).toString('utf8')).toBe(A_BYTES);
  });

  it('never serves a legacy flat file, even to a tenant that would have owned it', async () => {
    // Legacy flat files have no owner recorded anywhere, so they are unreachable
    // by design rather than attributed to whoever asks first.
    const res = await request(appAs(ORG_A)).get(
      `/api/concept2cure/documents/download/${FLAT_ONLY}`
    );
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('legacy-flat');
  });

  it('refuses when no tenant context is attached rather than falling back to a shared directory', async () => {
    const res = await request(appAs(null)).get(`/api/concept2cure/documents/download/${NAME}`);
    expect([403, 404]).toContain(res.status);
    expect(res.text).not.toContain(A_BYTES);
  });

  it('rejects a filename carrying separators before it reaches the filesystem', async () => {
    // Express does not split a param on %2F, so this arrives as `../../.env`.
    const res = await request(appAs(ORG_A)).get(
      '/api/concept2cure/documents/download/..%2F..%2Fpackage.json'
    );
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('"name"');
  });
});
