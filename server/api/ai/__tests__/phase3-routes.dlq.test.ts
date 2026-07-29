/**
 * Tenant isolation + authorization contract for the Phase 3 AI dead-letter
 * queue (M2), and the dev org-fallback gate (staging escape hatch).
 *
 * Pre-fix:
 *   - GET /ai/dead-letter-queue returned the GLOBAL in-memory queue — any
 *     authenticated user in any tenant could read every other tenant's
 *     failed-AI payloads.
 *   - POST /ai/dead-letter-queue/clear had no role check — any user could
 *     wipe the queue for everyone.
 *   - extractOrgContext assigned req.organizationId = 2 whenever
 *     NODE_ENV !== 'production' — reachable in staging.
 *
 * These tests pin the fixed contract: entries are tagged with organizationId
 * at enqueue, reads are org-scoped (platform admins see all, including
 * legacy untagged entries), clears require an admin/platform role and only
 * touch the caller's visible entries, and the dev fallback needs BOTH
 * NODE_ENV development/test AND DEV_ORG_FALLBACK=true.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The DLQ clear gate re-resolves the caller's org role from the DB (it must not
// trust the possibly-stale in-request role). Stub `db` with a select-chain that
// resolves to a per-test role row so the suite stays DB-free while still
// exercising the authoritative-role path.
const dbState = vi.hoisted(() => ({ orgRoleRows: [] as Array<{ role: string }> }));
vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => dbState.orgRoleRows,
        }),
      }),
    }),
  },
}));

import router from '../phase3-routes.js';
import regulatoryAIPhase3 from '../../../services/regulatoryAIServicePhase3.js';

interface TestUser {
  id?: number;
  organizationId?: number;
  role?: string;
  roles?: string[];
  email?: string;
}

/**
 * App with a stubbed auth layer that sets req.user (JWT-shaped).
 *
 * `dbRole` is the org role the gate re-resolves from the DB. It defaults to the
 * JWT `role` so ordinary cases (admin allowed / member denied) hold; pass an
 * explicit `dbRole` to desync the stale JWT role from the authoritative DB role
 * (the downgraded-admin exploit). Pass `null` to simulate no DB membership row.
 */
function makeApp(
  user?: TestUser,
  reqPatch?: Record<string, unknown>,
  dbRole?: string | null
) {
  // Default the authoritative DB role to the user's JWT role (singular `role`,
  // or an admin/owner found in the `roles` array), so ordinary cases hold.
  const jwtRole =
    user?.role ??
    user?.roles?.find((r) => r === 'admin' || r === 'owner') ??
    user?.roles?.[0];
  const resolved = dbRole === undefined ? jwtRole : dbRole;
  dbState.orgRoleRows = resolved ? [{ role: resolved }] : [];
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (user) req.user = { id: 1, ...user };
    if (reqPatch) Object.assign(req, reqPatch);
    next();
  });
  app.use('/api', router);
  return app;
}

/** Two org-7 entries, one org-8 entry, one legacy untagged entry. */
function seedQueue() {
  const svc = regulatoryAIPhase3 as any;
  return {
    org7a: svc.addToDeadLetterQueue({ operation: 'ner-extract', error: 'boom-7a', organizationId: 7 }),
    org7b: svc.addToDeadLetterQueue({ operation: 'generate-embedding', error: 'boom-7b', organizationId: '7' }),
    org8: svc.addToDeadLetterQueue({ operation: 'consistency-check', error: 'boom-8', organizationId: 8 }),
    legacy: svc.addToDeadLetterQueue({ operation: 'legacy-op', error: 'boom-legacy' }),
  };
}

function allEntries() {
  return (regulatoryAIPhase3 as any).getDeadLetterQueue({ all: true });
}

beforeEach(() => {
  (regulatoryAIPhase3 as any).clearDeadLetterQueue(undefined, { all: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Backing service — org tagging at enqueue
// ─────────────────────────────────────────────────────────────────────────────

describe('regulatoryAIServicePhase3 dead-letter queue (service)', () => {
  it('tags entries with a normalized numeric organizationId at enqueue', () => {
    const svc = regulatoryAIPhase3 as any;
    expect(svc.addToDeadLetterQueue({ operation: 'x', organizationId: 7 }).organizationId).toBe(7);
    expect(svc.addToDeadLetterQueue({ operation: 'x', organizationId: '8' }).organizationId).toBe(8);
    expect(svc.addToDeadLetterQueue({ operation: 'x' }).organizationId).toBeNull();
    expect(svc.addToDeadLetterQueue({ operation: 'x', organizationId: 'not-a-number' }).organizationId).toBeNull();
  });

  it('is fail-closed: reads without an explicit scope return nothing', () => {
    seedQueue();
    expect((regulatoryAIPhase3 as any).getDeadLetterQueue()).toEqual([]);
    expect((regulatoryAIPhase3 as any).getDeadLetterQueue({})).toEqual([]);
  });

  it('scopes reads by organizationId and excludes untagged entries from tenant views', () => {
    seedQueue();
    const svc = regulatoryAIPhase3 as any;
    const org7 = svc.getDeadLetterQueue({ organizationId: 7 });
    expect(org7).toHaveLength(2);
    expect(org7.every((e: any) => e.organizationId === 7)).toBe(true);
    expect(svc.getDeadLetterQueue({ all: true })).toHaveLength(4);
  });

  it('bounds the stored payload snapshot', () => {
    const entry = (regulatoryAIPhase3 as any).addToDeadLetterQueue({
      operation: 'x',
      organizationId: 7,
      payload: 'a'.repeat(10_000),
    });
    expect(entry.payload.length).toBeLessThan(5_000);
    expect(entry.payload).toContain('[truncated]');
  });

  it('evicts oldest entries beyond the retention cap', () => {
    const svc = regulatoryAIPhase3 as any;
    for (let i = 0; i < 505; i++) {
      svc.addToDeadLetterQueue({ operation: `op-${i}`, organizationId: 7 });
    }
    const entries = svc.getDeadLetterQueue({ all: true });
    expect(entries).toHaveLength(500);
    expect(entries[0].operation).toBe('op-5'); // op-0..op-4 evicted
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai/dead-letter-queue — org-scoped reads
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/ai/dead-letter-queue', () => {
  it('returns only the caller org entries (backward-compatible {count, items} shape)', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'member' })).get(
      '/api/ai/dead-letter-queue'
    );
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.every((e: any) => e.organizationId === 7)).toBe(true);
    const errors = res.body.items.map((e: any) => e.error);
    expect(errors).not.toContain('boom-8');
    expect(errors).not.toContain('boom-legacy');
  });

  it('does not leak org 7 entries to an org 8 caller', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 8, role: 'member' })).get(
      '/api/ai/dead-letter-queue'
    );
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.items[0].error).toBe('boom-8');
  });

  it('hides legacy untagged entries from tenant admins (org admin is not platform)', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'admin' })).get(
      '/api/ai/dead-letter-queue'
    );
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: any) => e.error)).not.toContain('boom-legacy');
  });

  it('shows platform admins everything, including legacy untagged entries', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 99, role: 'super_admin' })).get(
      '/api/ai/dead-letter-queue'
    );
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(4);
    expect(res.body.items.map((e: any) => e.error)).toContain('boom-legacy');
  });

  it('scopes the /ai/status dead-letter summary to the caller org', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 8, role: 'member' })).get('/api/ai/status');
    expect(res.status).toBe(200);
    expect(res.body.dead_letter_queue.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/dead-letter-queue/clear — admin-gated, org-scoped
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/ai/dead-letter-queue/clear', () => {
  it('rejects non-admin members with 403 and leaves the queue intact', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'member' }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_004');
    expect(allEntries()).toHaveLength(4);
  });

  it('rejects unauthenticated callers with 401 (org context present, no user)', async () => {
    seedQueue();
    // No req.user — org context comes from validateTenantContext-style patch.
    const res = await request(makeApp(undefined, { organizationId: 7 }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_003');
    expect(allEntries()).toHaveLength(4);
  });

  it('lets an org admin clear ONLY their own org entries', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'admin' }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, cleared: 2, message: 'Cleared all items' });
    const remaining = allEntries();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((e: any) => e.error).sort()).toEqual(['boom-8', 'boom-legacy']);
  });

  it('denies a downgraded admin whose JWT still says admin but whose DB role is now member (P1)', async () => {
    seedQueue();
    // Stale JWT still carries role: 'admin' (an /api/ai authenticateToken pass
    // would overwrite req.user with it); the authoritative DB role is 'member'.
    const res = await request(makeApp({ organizationId: 7, role: 'admin' }, undefined, 'member'))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(403);
    expect(allEntries()).toHaveLength(4); // queue untouched
  });

  it('fails closed when the DB role cannot be resolved (no membership row)', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'admin' }, undefined, null))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(403);
    expect(allEntries()).toHaveLength(4);
  });

  it('resolves indices against the caller-visible queue, not the global one', async () => {
    seedQueue();
    // Org 7's visible queue is [org7a, org7b]; index 1 must clear org7b —
    // never org 8's entry, which sits at global index 2.
    const res = await request(makeApp({ organizationId: 7, roles: ['manager', 'admin'] }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({ indices: [1] });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(1);
    const errors = allEntries().map((e: any) => e.error);
    expect(errors).toContain('boom-7a');
    expect(errors).not.toContain('boom-7b');
    expect(errors).toContain('boom-8');
    expect(errors).toContain('boom-legacy');
  });

  it('ignores out-of-range indices instead of touching other tenants', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'admin' }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({ indices: [5, 6] });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(0);
    expect(allEntries()).toHaveLength(4);
  });

  it('rejects malformed indices with 400', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 7, role: 'admin' }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({ indices: ['0', -1] });
    expect(res.status).toBe(400);
    expect(allEntries()).toHaveLength(4);
  });

  it('lets a platform admin clear everything, including untagged entries', async () => {
    seedQueue();
    const res = await request(makeApp({ organizationId: 99, role: 'platform_admin' }))
      .post('/api/ai/dead-letter-queue/clear')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(4);
    expect(allEntries()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failed operations are enqueued tagged with the caller's org
// ─────────────────────────────────────────────────────────────────────────────

describe('failure enqueue tagging', () => {
  it('dead-letters a failed NER call under the caller organizationId', async () => {
    vi.spyOn(regulatoryAIPhase3 as any, 'getFeatureFlags').mockReturnValue({
      ENABLE_AI_INTELLIGENCE: true,
    });
    vi.spyOn(regulatoryAIPhase3 as any, 'extractNamedEntities').mockRejectedValue(
      new Error('model exploded')
    );

    const res = await request(makeApp({ organizationId: 7, role: 'member' }))
      .post('/api/ai/ner-extract')
      .send({ componentText: 'some component text' });

    expect(res.status).toBe(500);
    const entries = allEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      operation: 'ner-extract',
      error: 'model exploded',
      organizationId: 7,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dev org fallback (staging escape hatch)
// ─────────────────────────────────────────────────────────────────────────────

describe('extractOrgContext dev fallback gating', () => {
  it('denies JWT-less requests when DEV_ORG_FALLBACK is not set (even under NODE_ENV=test)', async () => {
    const res = await request(makeApp()).get('/api/ai/dead-letter-queue');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Organization context required');
  });

  it('denies JWT-less requests in staging even with DEV_ORG_FALLBACK=true', async () => {
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('DEV_ORG_FALLBACK', 'true');
    const res = await request(makeApp()).get('/api/ai/dead-letter-queue');
    expect(res.status).toBe(403);
  });

  it('denies JWT-less requests in production even with DEV_ORG_FALLBACK=true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_ORG_FALLBACK', 'true');
    const res = await request(makeApp()).get('/api/ai/dead-letter-queue');
    expect(res.status).toBe(403);
  });

  it('allows the fallback only with NODE_ENV development/test AND explicit opt-in', async () => {
    vi.stubEnv('DEV_ORG_FALLBACK', 'true'); // NODE_ENV=test via tests/setup
    (regulatoryAIPhase3 as any).addToDeadLetterQueue({
      operation: 'dev-op',
      error: 'boom-dev',
      organizationId: 2, // the fallback org
    });
    const res = await request(makeApp()).get('/api/ai/dead-letter-queue');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.items[0].error).toBe('boom-dev');
  });
});
