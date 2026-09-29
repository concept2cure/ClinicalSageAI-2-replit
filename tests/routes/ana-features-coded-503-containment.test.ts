/**
 * The two coded 503s in server/routes/ana-features.ts answer with a static
 * sentence, never the caught error's text (D6 / IAM-18, P1-17 paydown).
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * POST /api/ana/authoring-plan returned `{ error: err.message, code:
 * 'MIGRATION_PENDING' }`, and the two throwers of that code say
 * 'authoring_plans table not migrated yet' (authoring-plan-generator.ts) and
 * 'therapeutic_area column not migrated yet' (therapeutic-area-context.ts) — a
 * relation and a column name, the class of disclosure ci:server-error-leaks
 * exists to end. POST /api/ana/submission-chat did the same for
 * AI_PROVIDER_UNAVAILABLE; its thrower's text is static today, but the body
 * echoed whatever was thrown, so a later provider error would have reached the
 * browser. Both keep status 503 and the machine-readable code — this is NOT a
 * serverError() swap, which would turn a 503 into a 500 and drop the code — and
 * the detail goes to the file's logger.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  generateAuthoringPlan: vi.fn(),
  handleSubmissionChat: vi.fn(),
  logged: [] as Array<{ scope: string; message: string; context: unknown }>,
}));

vi.mock('../../server/middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 7, userId: 7, email: 'author@example.test', role: 'admin', organizationId: 3 };
    req.userId = 7;
    next();
  },
}));
vi.mock('../../server/middleware/tenantContext', () => ({
  requireOrganizationContext: (req: any, _res: any, next: any) => {
    req.tenantContext = { organizationId: 3 };
    next();
  },
  requireTenantContext: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/db/currentTenant', () => ({
  currentTenantOrgUuid: async () => '4d3f0c1a-2b6e-4f7a-9c8d-1e2f3a4b5c6d',
  isTenantUuid: (v: unknown) => typeof v === 'string',
}));
vi.mock('../../server/services/ana/authoring-plan-generator', () => ({
  generateAuthoringPlan: (...a: unknown[]) => h.generateAuthoringPlan(...a),
}));
vi.mock('../../server/services/ana/submission-chat-handler', () => ({
  handleSubmissionChat: (...a: unknown[]) => h.handleSubmissionChat(...a),
}));
// The file's own logger, observed: the detail must land HERE, not in the body.
vi.mock('../../server/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/logger')>();
  return {
    ...actual,
    createScopedLogger: (scope: string) => {
      const real = actual.createScopedLogger(scope);
      return {
        ...real,
        error: (message: string, context?: unknown) => {
          h.logged.push({ scope, message, context });
          return real.error(message, context);
        },
      };
    },
  };
});

function coded(message: string, code: string) {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

async function app() {
  const router = (await import('../../server/routes/ana-features')).default;
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-p1-17');
    next();
  });
  a.use('/api/ana', router);
  return a;
}

beforeEach(() => {
  h.generateAuthoringPlan.mockReset();
  h.handleSubmissionChat.mockReset();
  h.logged.length = 0;
});

describe('POST /api/ana/authoring-plan — MIGRATION_PENDING', () => {
  for (const thrown of [
    'authoring_plans table not migrated yet',
    'therapeutic_area column not migrated yet',
  ]) {
    it(`503 keeps the code and says nothing of "${thrown}"`, async () => {
      h.generateAuthoringPlan.mockRejectedValue(coded(thrown, 'MIGRATION_PENDING'));

      const res = await request(await app())
        .post('/api/ana/authoring-plan')
        .send({ projectId: 12, ctdSection: '2.7.3', submissionType: 'NDA' });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('MIGRATION_PENDING');
      expect(res.body.error).toBe('This feature is not yet provisioned in this deployment.');
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(thrown);
      expect(body).not.toMatch(/authoring_plans|therapeutic_area|not migrated/i);

      // The operator still learns which store is missing.
      const entry = h.logged.find((l) => l.scope === 'ana-features' && JSON.stringify(l.context).includes(thrown));
      expect(entry, 'the detail was not logged').toBeDefined();
    });
  }

  it('the 400 for INVALID_REQUEST from the generator still carries the domain message (4xx is out of scope)', async () => {
    h.generateAuthoringPlan.mockRejectedValue(coded('ctdSection 9.9 is not a CTD section', 'INVALID_REQUEST'));
    const res = await request(await app())
      .post('/api/ana/authoring-plan')
      .send({ projectId: 12, ctdSection: '9.9' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ctdSection 9.9 is not a CTD section', code: 'INVALID_REQUEST' });
  });
});

describe('POST /api/ana/submission-chat — AI_PROVIDER_UNAVAILABLE', () => {
  it('503 keeps the code and does not echo the thrown text', async () => {
    const thrown = 'AI provider unavailable: upstream gateway 10.0.4.21:8443 refused';
    h.handleSubmissionChat.mockRejectedValue(coded(thrown, 'AI_PROVIDER_UNAVAILABLE'));

    const res = await request(await app())
      .post('/api/ana/submission-chat')
      .send({ threadId: 't-1', artifactId: 'art-1', question: 'What is missing from 2.7.3?' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(res.body.error).toBe('The AI provider is unavailable.');
    expect(JSON.stringify(res.body)).not.toMatch(/10\.0\.4\.21|upstream|gateway/i);
    const entry = h.logged.find((l) => l.scope === 'ana-features' && JSON.stringify(l.context).includes(thrown));
    expect(entry, 'the detail was not logged').toBeDefined();
  });

  it('the 404 for ARTIFACT_NOT_FOUND still carries the domain message (4xx is out of scope)', async () => {
    h.handleSubmissionChat.mockRejectedValue(coded('Artifact art-9 not found', 'ARTIFACT_NOT_FOUND'));
    const res = await request(await app())
      .post('/api/ana/submission-chat')
      .send({ threadId: 't-1', artifactId: 'art-9', question: 'Where is it?' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Artifact art-9 not found', code: 'ARTIFACT_NOT_FOUND' });
  });
});
