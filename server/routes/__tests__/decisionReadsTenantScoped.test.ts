/**
 * Governed decision records were readable across organizations.
 *
 * GET /decisions/:projectId, /decision/:decisionId and
 * /decision-context/:projectId resolved NO tenant at all — no requireTenantId,
 * no organizationId anywhere in the handlers — while every adjacent route in the
 * same file does. Any authenticated caller could read another organization's
 * governed decisions and receipts by supplying a project or decision id.
 *
 * The earlier audit finding of this shape (on /contradiction-scan) was REFUTED
 * because concept2cure_artifacts carries FORCE'd row-level security, so a
 * cross-tenant read returned zero rows regardless of the missing app-layer
 * predicate. That defence does not reach here: decisionStore and receiptStore
 * are `new Map<string, …>()`. There is no database, so there is no RLS.
 *
 * Scoping is strict by design. A record whose organizationId is undefined does
 * not match a numeric one — recordDecision already warns when a decision is
 * stored without tenant context, and an unattributed record must not be handed
 * to a specific tenant.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: { decisions: [] as any[] } }));

vi.mock('../../services/decision-lifecycle-service.js', async (importOriginal) => {
  /* The REAL service, driven through its real recording path, so the filtering
     under test is the shipped implementation rather than a stand-in. */
  const mod = await importOriginal<typeof import('../../services/decision-lifecycle-service')>();
  return mod;
});

import { decisionLifecycleService } from '../../services/decision-lifecycle-service';
import router from '../authoring-actions';

function makeApp(tenantId: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (tenantId != null) (req as unknown as { tenantId: number }).tenantId = tenantId;
    (req as unknown as { userId: number }).userId = 42;
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

/** Record one decision directly through the service, under a given org. */
function record(organizationId: number | undefined, projectId: string) {
  return decisionLifecycleService.recordGovernedActionDecision({
    projectId,
    organizationId,
    kind: 'governed_action',
    governedAction: 'approve-artifact',
    summary: `decision for org ${organizationId ?? 'none'}`,
    rationale: 'test',
    sourceSignals: [],
    createdByType: 'system',
  } as never);
}

beforeEach(() => {
  store.decisions = [];
});

describe('decision reads are tenant-scoped', () => {
  it('does not return another organization’s project decisions', async () => {
    const mine = record(7, 'P-SHARED');
    const theirs = record(9, 'P-SHARED');
    expect(mine?.id).toBeTruthy();
    expect(theirs?.id).toBeTruthy();

    const res = await request(makeApp(7)).get('/api/authoring-actions/decisions/P-SHARED');

    expect(res.status).toBe(200);
    const ids = (res.body.decisions ?? []).map((d: any) => d.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('reports another organization’s decision as not found, not forbidden', async () => {
    const theirs = record(9, 'P-OTHER');

    const res = await request(makeApp(7)).get(
      `/api/authoring-actions/decision/${theirs.id}`,
    );

    // A 403 would confirm the id exists.
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(theirs.id);
  });

  it('scopes decision-context, which returns receipts as well', async () => {
    const mine = record(7, 'P-CTX');
    const theirs = record(9, 'P-CTX');

    const res = await request(makeApp(7)).get(
      '/api/authoring-actions/decision-context/P-CTX',
    );

    // The route returns `items`, each { decision, receipt }.
    const ids = (res.body.items ?? []).map((c: any) => c.decision?.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
  });

  it('excludes records stored without any tenant context', async () => {
    // Fail closed: an unattributed record belongs to no organization, so it is
    // not served to one.
    const unattributed = record(undefined, 'P-UNATTRIBUTED');

    const res = await request(makeApp(7)).get(
      '/api/authoring-actions/decisions/P-UNATTRIBUTED',
    );

    const ids = (res.body.decisions ?? []).map((d: any) => d.id);
    expect(ids).not.toContain(unattributed.id);
  });

  it('refuses all three reads when no tenant context is present', async () => {
    const anon = makeApp(null);
    for (const path of [
      '/api/authoring-actions/decisions/P-1',
      '/api/authoring-actions/decision/D-1',
      '/api/authoring-actions/decision-context/P-1',
    ]) {
      const res = await request(anon).get(path);
      expect(res.status).toBe(401);
    }
  });
});
