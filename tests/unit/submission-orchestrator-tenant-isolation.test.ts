/**
 * Submission-Package Orchestrator — tenant isolation contract tests
 *
 * Locks in the Move 1 (P0) tenant-scope hardening of
 * server/services/submission-package-orchestrator.ts and its HTTP surface
 * at server/routes/submission-orchestrator.ts:
 *
 *   Service layer:
 *     1. runOrchestrator throws on missing / zero / negative organizationId
 *        before touching the DB (no orphaned dark rows under Path B).
 *     2. Two orgs running runOrchestrator in parallel cannot see each
 *        other's runs through getRun (per-row org filter is real).
 *     3. getRun returns null when the runId exists but belongs to a
 *        different org (collapsed not-found semantics — caller cannot
 *        distinguish missing from cross-tenant).
 *     4. getRunAudit returns [] on org mismatch — same collapse-on-leak
 *        rationale as getRun.
 *     5. regenerateAffected throws when
 *        previousRun.organizationId !== inputs.organizationId — a
 *        forged / stale previousRun cannot drive a regeneration under
 *        a different tenant.
 *     9. hashInputs() handles undefined optional fields without crashing.
 *        Exercised indirectly through runOrchestrator with every
 *        optional input omitted, since hashInputs is module-private.
 *
 *   Route layer:
 *     6. POST /runs returns 401 when there is no req.user at all
 *        (unauthenticated).
 *     7. POST /runs returns 403 when req.user exists but the JWT does
 *        not carry an organizationId / tenantContext (authenticated
 *        but unscoped).
 *     8. GET /runs/:runId returns 404 when the run belongs to a
 *        different org (collapses to not-found at the HTTP edge so a
 *        caller cannot use the status code to enumerate cross-tenant
 *        runIds).
 *
 * Mocking strategy mirrors tests/unit/csr-jobs-routes.test.ts:
 *   - Hoisted vi.fn for pool.query so both module specifiers
 *     ('../../server/db' and '../../server/db.js') share the same
 *     captured-state object.
 *   - Mock auditService and the heavy AI client transitively pulled
 *     in by csr-builder so the service imports resolve cleanly.
 *   - Per-request auth-injection middleware on the supertest harness
 *     drives the requireTenant branches (401 / 403 / 200).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════
// HOISTED MOCK STATE
// ═══════════════════════════════════════════════════════════════════════════
//
// Simulates the submission_orchestrator_runs + submission_orchestrator_steps
// tables in-memory so getRun / getRunAudit return the right rows for the
// (runId, organizationId) WHERE clause without standing up Postgres.

const hoisted = vi.hoisted(() => {
  interface RunRow {
    run_id: string;
    organization_id: number;
    submission_id: string;
    /** Path-to-GA §C.4 (Path B): nullable canonical FK back to submissions(id). */
    submission_id_fk: number | null;
    application_number: string;
    region: string;
    submission_type: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    steps: string; // JSON-encoded — matches the persistRun INSERT shape
  }
  interface StepRow {
    run_id: string;
    organization_id: number;
    /** Mirror of the parent run's submission_id_fk. */
    submission_id_fk: number | null;
    step_key: string;
    event_type: string;
    status: string;
    input_hash: string;
    output_hash: string | null;
    output_ref: string | null;
    error: string | null;
    occurred_at: string;
  }

  const runs: RunRow[] = [];
  const steps: StepRow[] = [];

  // Pattern-match against the SQL the orchestrator emits. We don't run a
  // full SQL engine — just enough to (a) INSERT/UPSERT runs, (b) INSERT
  // step events, (c) SELECT by (run_id, organization_id) for both reads.
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const s = String(sql);

    // persistRun: INSERT ... ON CONFLICT (run_id) DO UPDATE
    // Param order (post 20260629_orchestrator_submission_id_fk.sql):
    //   $1 run_id, $2 organization_id, $3 submission_id, $4 submission_id_fk,
    //   $5 application_number, $6 region, $7 submission_type, $8 started_at,
    //   $9 completed_at, $10 status, $11 steps
    if (/INSERT\s+INTO\s+submission_orchestrator_runs/i.test(s)) {
      const [
        run_id,
        organization_id,
        submission_id,
        submission_id_fk,
        application_number,
        region,
        submission_type,
        started_at,
        completed_at,
        status,
        stepsJson,
      ] = params as [
        string, number, string, number | null, string, string, string, string, string | null, string, string,
      ];
      const existing = runs.find(r => r.run_id === run_id);
      if (existing) {
        // ON CONFLICT DO UPDATE — only completed_at / status / steps. The
        // production SQL also COALESCEs submission_id_fk so a NULL on
        // resume can't clear a previously-populated FK; mirror that here.
        existing.completed_at = completed_at;
        existing.status = status;
        existing.steps = stepsJson;
        if (submission_id_fk != null) existing.submission_id_fk = submission_id_fk;
      } else {
        runs.push({
          run_id,
          organization_id,
          submission_id,
          submission_id_fk,
          application_number,
          region,
          submission_type,
          started_at,
          completed_at,
          status,
          steps: stepsJson,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // persistStepEvent: append-only INSERT
    // Param order (post 20260629_orchestrator_submission_id_fk.sql):
    //   $1 run_id, $2 organization_id, $3 submission_id_fk, $4 step_key,
    //   $5 event_type, $6 status, $7 input_hash, $8 output_hash,
    //   $9 output_ref, $10 error
    if (/INSERT\s+INTO\s+submission_orchestrator_steps/i.test(s)) {
      const [
        run_id,
        organization_id,
        submission_id_fk,
        step_key,
        event_type,
        status,
        input_hash,
        output_hash,
        output_ref,
        error,
      ] = params as [
        string, number, number | null, string, string, string, string, string | null, string | null, string | null,
      ];
      steps.push({
        run_id,
        organization_id,
        submission_id_fk,
        step_key,
        event_type,
        status,
        input_hash,
        output_hash,
        output_ref,
        error,
        occurred_at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }

    // submissions lookup used by loadSubmissionFkBySubmissionIdText.
    // Recognized by `FROM submissions` with the tenant-scoped WHERE shape.
    if (/SELECT\s+id\s+FROM\s+submissions\b/i.test(s)) {
      // Resolve from the hoisted submissionsFixtures map populated by tests.
      const [candidate, orgId] = params as [number, number];
      const match = submissionsFixtures.find(
        r => r.id === candidate && r.organization_id === orgId
      );
      return { rows: match ? [{ id: match.id }] : [], rowCount: match ? 1 : 0 };
    }

    // getRun: SELECT ... FROM submission_orchestrator_runs WHERE run_id = $1 AND organization_id = $2
    if (/SELECT[\s\S]*FROM\s+submission_orchestrator_runs/i.test(s)) {
      const [runId, orgId] = params as [string, number];
      const rows = runs
        .filter(r => r.run_id === runId && r.organization_id === orgId)
        .map(r => ({ ...r }));
      return { rows, rowCount: rows.length };
    }

    // getRunAudit: SELECT ... FROM submission_orchestrator_steps WHERE run_id = $1 AND organization_id = $2
    if (/SELECT[\s\S]*FROM\s+submission_orchestrator_steps/i.test(s)) {
      const [runId, orgId] = params as [string, number];
      const rows = steps
        .filter(r => r.run_id === runId && r.organization_id === orgId)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        .map(r => ({ ...r }));
      return { rows, rowCount: rows.length };
    }

    // Anything else: empty resultset. Audit / unrelated probes land here.
    return { rows: [], rowCount: 0 };
  });

  // Fixture rows for loadSubmissionFkBySubmissionIdText. Tests populate
  // this directly to model "submission id=42 belongs to org 100".
  const submissionsFixtures: Array<{ id: number; organization_id: number }> = [];

  return {
    runs,
    steps,
    submissionsFixtures,
    query,
    reset() {
      runs.length = 0;
      steps.length = 0;
      submissionsFixtures.length = 0;
      query.mockClear();
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// MOCK server/db — both specifiers (with and without .js suffix) share the
// same hoisted.query so it doesn't matter which import path resolves first.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('../../server/db.js', () => {
  const pool = { query: (...args: unknown[]) => hoisted.query(...(args as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/db', () => {
  const pool = { query: (...args: unknown[]) => hoisted.query(...(args as [string, unknown[]?])) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});

// ═══════════════════════════════════════════════════════════════════════════
// MOCK auditService — the route's audit hook is best-effort, but the import
// graph still has to resolve.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));
vi.mock('../../server/services/auditService.js', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

// ═══════════════════════════════════════════════════════════════════════════
// MOCK heavy AI clients — m2-summary-builders / csr-builder / etc. transitively
// import these. We don't need their behavior, just resolvable specifiers.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('../../server/lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
}));
vi.mock('../../server/lib/unified-ai-client', () => ({
  ai: { complete: vi.fn(async () => '') },
}));

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS (after mocks)
// ═══════════════════════════════════════════════════════════════════════════

import {
  runOrchestrator,
  getRun,
  getRunAudit,
  regenerateAffected,
  loadSubmissionFkBySubmissionIdText,
  type OrchestratorInputs,
  type OrchestratorRun,
} from '../../server/services/submission-package-orchestrator';
import submissionOrchestratorRouter from '../../server/routes/submission-orchestrator';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function baseInputs(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return {
    organizationId: 1,
    submissionId: 'sub-1',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [],
    nonclinicalStudies: [],
    clinicalStudyData: [],
    csrInputs: [],
    skipValidation: true,
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST APP — supertest harness with per-request auth injection
// ═══════════════════════════════════════════════════════════════════════════

interface AuthCtx {
  organizationId?: number | null;
  userId?: number | null;
  // When true, set req.user WITHOUT an organizationId field — drives the 403
  // "Organization context required" branch (authenticated-but-unscoped).
  userWithoutOrg?: boolean;
  // When true, leave req.user entirely unset — drives the 401 branch.
  unauthenticated?: boolean;
}

function makeApp(ctx: AuthCtx = { organizationId: 100, userId: 7 }) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    if (ctx.unauthenticated) {
      // Neither req.user nor req.tenantContext is set → 401.
    } else if (ctx.userWithoutOrg) {
      // Authenticated but no org → 403.
      r.user = { id: ctx.userId ?? 7 };
    } else {
      if (ctx.organizationId != null) {
        r.tenantContext = { organizationId: ctx.organizationId };
      }
      if (ctx.userId != null) {
        r.user = {
          id: ctx.userId,
          organizationId: ctx.organizationId ?? undefined,
        };
      }
    }
    next();
  });
  app.use('/api/submission-orchestrator', submissionOrchestratorRouter);
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  hoisted.reset();
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 1 — runOrchestrator tenant-scope gate
// ═══════════════════════════════════════════════════════════════════════════

describe('runOrchestrator tenant-scope gate (Case 1)', () => {
  it('throws when organizationId is missing (undefined)', async () => {
    const inputs = baseInputs() as Partial<OrchestratorInputs> as OrchestratorInputs;
    delete (inputs as { organizationId?: number }).organizationId;
    await expect(runOrchestrator(inputs)).rejects.toThrow(
      /organizationId is required and must be a positive integer/,
    );
    // No persistRun INSERT should have fired — the gate is before any DB call.
    const inserts = hoisted.query.mock.calls.filter(c =>
      /INSERT\s+INTO\s+submission_orchestrator_runs/i.test(String(c[0])),
    );
    expect(inserts.length).toBe(0);
  });

  it('throws when organizationId is zero', async () => {
    await expect(runOrchestrator(baseInputs({ organizationId: 0 }))).rejects.toThrow(
      /must be a positive integer/,
    );
  });

  it('throws when organizationId is negative', async () => {
    await expect(runOrchestrator(baseInputs({ organizationId: -5 }))).rejects.toThrow(
      /must be a positive integer/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2 — Two orgs in parallel cannot see each other's runs
// CASE 3 — getRun returns null on org mismatch
// ═══════════════════════════════════════════════════════════════════════════

describe('getRun tenant isolation (Cases 2 + 3)', () => {
  it('two orgs running runOrchestrator in parallel cannot see each other via getRun', async () => {
    const [resA, resB] = await Promise.all([
      runOrchestrator(baseInputs({ organizationId: 100, submissionId: 'sub-A' })),
      runOrchestrator(baseInputs({ organizationId: 200, submissionId: 'sub-B' })),
    ]);

    expect(resA.run.runId).toBeDefined();
    expect(resB.run.runId).toBeDefined();
    expect(resA.run.runId).not.toBe(resB.run.runId);

    // Org 100 sees its own run.
    const own100 = await getRun(resA.run.runId, 100);
    expect(own100).not.toBeNull();
    expect(own100?.organizationId).toBe(100);
    expect(own100?.submissionId).toBe('sub-A');

    // Org 200 sees its own run.
    const own200 = await getRun(resB.run.runId, 200);
    expect(own200).not.toBeNull();
    expect(own200?.organizationId).toBe(200);
    expect(own200?.submissionId).toBe('sub-B');

    // Cross-org probes: A's runId under org 200 → null. B's runId under
    // org 100 → null. The (run_id, organization_id) WHERE clause is real.
    expect(await getRun(resA.run.runId, 200)).toBeNull();
    expect(await getRun(resB.run.runId, 100)).toBeNull();
  });

  it('getRun returns null when the runId exists but belongs to a different org (Case 3 — collapse with not-found)', async () => {
    const { run } = await runOrchestrator(baseInputs({ organizationId: 100 }));
    // Cross-tenant probe with a known-good runId. Indistinguishable from
    // "no such runId" — that's the §11.10(e) leak-prevention contract.
    const crossTenant = await getRun(run.runId, 999);
    expect(crossTenant).toBeNull();
    // And a truly-missing runId under the legitimate org also returns null,
    // proving collapse-with-not-found.
    const notFound = await getRun('does-not-exist-uuid', 100);
    expect(notFound).toBeNull();
  });

  it('getRun returns null for non-positive organizationId without throwing (defensive gate)', async () => {
    const { run } = await runOrchestrator(baseInputs({ organizationId: 100 }));
    expect(await getRun(run.runId, 0)).toBeNull();
    expect(await getRun(run.runId, -1)).toBeNull();
    // NaN / non-finite also collapses to null.
    expect(await getRun(run.runId, Number.NaN)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 4 — getRunAudit returns [] on org mismatch
// ═══════════════════════════════════════════════════════════════════════════

describe('getRunAudit tenant isolation (Case 4)', () => {
  it('returns an empty array on org mismatch — same collapse-on-leak as getRun', async () => {
    const { run } = await runOrchestrator(baseInputs({ organizationId: 100 }));
    // Legitimate read returns events (every step emitted at least one row).
    const own = await getRunAudit(run.runId, 100);
    expect(Array.isArray(own)).toBe(true);
    expect(own.length).toBeGreaterThan(0);

    // Cross-tenant probe collapses to [].
    const crossTenant = await getRunAudit(run.runId, 999);
    expect(crossTenant).toEqual([]);

    // Non-positive orgId → [] (defensive gate, does not throw).
    expect(await getRunAudit(run.runId, 0)).toEqual([]);
    expect(await getRunAudit(run.runId, -7)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 5 — regenerateAffected refuses cross-tenant previousRun
// ═══════════════════════════════════════════════════════════════════════════

describe('regenerateAffected tenant-mismatch guard (Case 5)', () => {
  it('throws when previousRun.organizationId !== inputs.organizationId', async () => {
    // Fabricate a previousRun owned by org 100.
    const previousRun: OrchestratorRun = {
      runId: 'forged-or-stale-run-1',
      organizationId: 100,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [],
    };
    // Caller passes inputs scoped to a DIFFERENT org — must throw, NOT splice.
    await expect(
      regenerateAffected(previousRun, baseInputs({ organizationId: 200 })),
    ).rejects.toThrow(/tenant mismatch/);
  });

  it('also throws when inputs.organizationId is missing / non-positive even if previousRun has one', async () => {
    const previousRun: OrchestratorRun = {
      runId: 'forged-or-stale-run-2',
      organizationId: 100,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [],
    };
    // The inputs.organizationId gate runs FIRST.
    const badInputs = baseInputs() as Partial<OrchestratorInputs> as OrchestratorInputs;
    delete (badInputs as { organizationId?: number }).organizationId;
    await expect(regenerateAffected(previousRun, badInputs)).rejects.toThrow(
      /inputs\.organizationId is required/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 6 — POST /runs returns 401 unauthenticated
// CASE 7 — POST /runs returns 403 when authenticated but no org in JWT
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/submission-orchestrator/runs auth gates (Cases 6 + 7)', () => {
  const validBody = {
    submissionId: 'sub-http-1',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
  };

  it('returns 401 when there is no req.user (unauthenticated) — Case 6', async () => {
    const res = await request(makeApp({ unauthenticated: true }))
      .post('/api/submission-orchestrator/runs')
      .send(validBody);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
    // The orchestrator must NOT have been invoked.
    const inserts = hoisted.query.mock.calls.filter(c =>
      /INSERT\s+INTO\s+submission_orchestrator_runs/i.test(String(c[0])),
    );
    expect(inserts.length).toBe(0);
  });

  it('returns 403 when authenticated but no organizationId in JWT — Case 7', async () => {
    const res = await request(makeApp({ userWithoutOrg: true, userId: 7 }))
      .post('/api/submission-orchestrator/runs')
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Organization context required' });
    const inserts = hoisted.query.mock.calls.filter(c =>
      /INSERT\s+INTO\s+submission_orchestrator_runs/i.test(String(c[0])),
    );
    expect(inserts.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 8 — GET /runs/:runId returns 404 on cross-tenant probe
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/submission-orchestrator/runs/:runId cross-tenant (Case 8)', () => {
  it('returns 404 when the run belongs to a different org (collapses with not-found)', async () => {
    // Create a run owned by org 100.
    const { run } = await runOrchestrator(baseInputs({ organizationId: 100 }));

    // Org 200 probes for that runId. Must collapse to 404 — not 403, not 200.
    const res = await request(makeApp({ organizationId: 200, userId: 7 }))
      .get(`/api/submission-orchestrator/runs/${run.runId}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'run_not_found' });

    // And a wholly-fabricated runId under the legitimate org also returns 404,
    // proving the response shape is identical between the two cases.
    const resMissing = await request(makeApp({ organizationId: 100, userId: 7 }))
      .get('/api/submission-orchestrator/runs/00000000-0000-4000-8000-000000000000');
    expect(resMissing.status).toBe(404);
    expect(resMissing.body).toEqual({ error: 'run_not_found' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 9 — hashInputs handles undefined optional fields without throwing
// ═══════════════════════════════════════════════════════════════════════════
//
// hashInputs is module-private. We exercise the
// JSON.stringify(undefined) === undefined edge case by running
// runOrchestrator with every optional input omitted. Internally, the
// orchestrator calls hashInputs with (inputs.drugSubstanceName ?? '', ...)
// but the m24 / m25 / m27 / package.assemble steps ALSO hash large
// optional payloads — and the undefined → '' coercion in hashInputs
// itself must not throw when any caller forgets to provide a default.

describe('hashInputs undefined-field robustness (Case 9)', () => {
  it('runOrchestrator with every optional input omitted completes without throwing', async () => {
    // baseInputs() leaves drugSubstanceName / drugProductName / indication
    // undefined. With empty arrays for all source data, every downstream
    // step ends in `skipped`, but hashInputs still has to compute the
    // step inputHash for each one — including ones whose primary input
    // is `undefined`.
    const result = await runOrchestrator(baseInputs());
    expect(result.run.runId).toBeDefined();
    // Every step that was hashed produced a 64-char sha256 hex string —
    // proves the Hash.update path saw a real string, not `undefined`.
    for (const step of result.run.steps) {
      // skipped/pending steps before reaching the hash branch may have ''.
      if (step.inputHash) {
        expect(step.inputHash).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('does not throw even when called via the route layer with a minimal body', async () => {
    // Body has only the required fields — every optional (drugSubstanceName,
    // drugProductName, indication) is absent. The route splices in
    // organizationId from the JWT and the orchestrator hashes through
    // all undefined fields.
    const res = await request(makeApp({ organizationId: 100, userId: 7 }))
      .post('/api/submission-orchestrator/runs')
      .send({
        submissionId: 'sub-undef-fields',
        applicationNumber: 'IND123456',
        region: 'US',
        submissionType: 'IND',
        // cmcSources / nonclinicalStudies / clinicalStudyData / csrInputs
        // all default to [] via the Zod schema's .default([]) — we deliberately
        // omit them to exercise that path too.
      });
    expect(res.status).toBe(200);
    expect(res.body.runId).toBeDefined();
    expect(res.body.status).toMatch(/complete|partial|failed/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATH-TO-GA §C.4 — submissionFk dual-write + round-trip (Path B)
// ═══════════════════════════════════════════════════════════════════════════
//
// These cases lock in the Move-1-pattern hardening from
// migrations/20260629_orchestrator_submission_id_fk.sql:
//   - persistRun dual-writes both submission_id (legacy TEXT) and
//     submission_id_fk (canonical FK) when the caller supplies submissionFk.
//   - persistStepEvent mirrors the FK onto every audit row.
//   - getRun projects the FK back onto OrchestratorRun.submissionFk.
//   - Back-compat: callers that omit submissionFk leave the column NULL on
//     both tables and continue to round-trip cleanly.
//   - loadSubmissionFkBySubmissionIdText: integer-coercible TEXT resolves
//     when the submissions row is owned by the supplied org; refuses to
//     guess on non-numeric TEXT; returns null on cross-tenant.

describe('Path-to-GA §C.4 — submissionFk threading through persist/getRun', () => {
  it('persistRun dual-writes submission_id_fk when caller supplies OrchestratorInputs.submissionFk', async () => {
    const inputs = baseInputs({ organizationId: 100, submissionFk: 42 });
    const { run } = await runOrchestrator(inputs);

    // The in-memory shape carries the FK.
    expect(run.submissionFk).toBe(42);

    // The persisted RunRow carries the FK (the mock captures the INSERT
    // params at the column position the production SQL emits).
    const persisted = hoisted.runs.find(r => r.run_id === run.runId);
    expect(persisted).toBeDefined();
    expect(persisted!.submission_id_fk).toBe(42);

    // Every step audit row written during the run mirrors the same FK.
    const stepRows = hoisted.steps.filter(s => s.run_id === run.runId);
    expect(stepRows.length).toBeGreaterThan(0);
    for (const row of stepRows) {
      expect(row.submission_id_fk).toBe(42);
    }
  });

  it('getRun round-trips submissionFk back onto OrchestratorRun', async () => {
    const { run } = await runOrchestrator(baseInputs({ organizationId: 100, submissionFk: 77 }));
    const fetched = await getRun(run.runId, 100);
    expect(fetched).not.toBeNull();
    expect(fetched!.submissionFk).toBe(77);
  });

  it('back-compat: persistRun leaves submission_id_fk NULL when caller omits submissionFk', async () => {
    const inputs = baseInputs({ organizationId: 100 });
    // Defensive: ensure no FK leaks through the fixture default.
    delete (inputs as { submissionFk?: number }).submissionFk;

    const { run } = await runOrchestrator(inputs);
    expect(run.submissionFk).toBeUndefined();

    const persisted = hoisted.runs.find(r => r.run_id === run.runId);
    expect(persisted).toBeDefined();
    expect(persisted!.submission_id_fk).toBeNull();

    // Step audit rows also have NULL — the FK is not invented on the steps
    // table either (mirrors the parent run's NULL FK).
    const stepRows = hoisted.steps.filter(s => s.run_id === run.runId);
    expect(stepRows.length).toBeGreaterThan(0);
    for (const row of stepRows) {
      expect(row.submission_id_fk).toBeNull();
    }

    // getRun projects the absent FK back as null (NOT undefined) — the
    // explicit null lets resume / regenerate callers tell "we know the FK
    // is unresolved" apart from "we forgot to read this column."
    const fetched = await getRun(run.runId, 100);
    expect(fetched).not.toBeNull();
    expect(fetched!.submissionFk).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATH-TO-GA §C.4 — loadSubmissionFkBySubmissionIdText
// ═══════════════════════════════════════════════════════════════════════════

describe('loadSubmissionFkBySubmissionIdText (Path-to-GA §C.4 helper)', () => {
  it('resolves integer-coercible TEXT to an FK owned by the same org', async () => {
    hoisted.submissionsFixtures.push({ id: 42, organization_id: 100 });
    expect(await loadSubmissionFkBySubmissionIdText('42', 100)).toBe(42);
  });

  it('returns null on cross-tenant lookup (submissions row exists but belongs to a different org)', async () => {
    hoisted.submissionsFixtures.push({ id: 42, organization_id: 100 });
    // Org 200 cannot resolve org 100's submission_id=42 — same Risk #3
    // defense as the design doc spells out.
    expect(await loadSubmissionFkBySubmissionIdText('42', 200)).toBeNull();
  });

  it('returns null on non-numeric TEXT (does NOT guess at GUID / business-domain codes)', async () => {
    expect(await loadSubmissionFkBySubmissionIdText('SUB-2026-001', 100)).toBeNull();
    expect(await loadSubmissionFkBySubmissionIdText('a3f6c9b1-2026-4f2e-9a0a-1234567890ab', 100)).toBeNull();
  });

  it('returns null on whitespace / empty TEXT', async () => {
    expect(await loadSubmissionFkBySubmissionIdText('', 100)).toBeNull();
    expect(await loadSubmissionFkBySubmissionIdText('   ', 100)).toBeNull();
  });

  it('returns null on missing / non-positive organizationId — defensive tenant gate', async () => {
    hoisted.submissionsFixtures.push({ id: 42, organization_id: 100 });
    expect(await loadSubmissionFkBySubmissionIdText('42', 0)).toBeNull();
    expect(await loadSubmissionFkBySubmissionIdText('42', -1)).toBeNull();
    expect(await loadSubmissionFkBySubmissionIdText('42', Number.NaN)).toBeNull();
  });

  it('returns null when the submissions row does not exist (the integer is well-formed but unmatched)', async () => {
    // No fixture matching id=999 for org=100 → null even though the TEXT
    // is a valid positive integer.
    expect(await loadSubmissionFkBySubmissionIdText('999', 100)).toBeNull();
  });
});
