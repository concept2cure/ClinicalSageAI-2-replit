/**
 * Governed document pipeline — end-to-end over HTTP against PGlite.
 *
 * Proves the ONE pipeline is reachable and governed: a canonical document is
 * created, signed off, and advanced through every gated stage, with the
 * fail-closed gate rejecting illegal jumps and each legal transition appending
 * exactly one hash-chained audit event to the persisted per-document trail.
 *
 * The heavy facet writes (unified_documents / electronic_signatures /
 * submission_leaf / eCTD package) are the orchestrator's injection seam; here
 * `audit` and `registerGovernedDocument` are captured so the test needs no
 * audit_logs table, while persistence, the gate, and the hash chain are all
 * exercised for real.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../server/db/pglite-harness';
import { createDocumentLifecycleRouter } from '../../server/routes/document-lifecycle';
import { buildLifecycleBindings } from '../../server/services/regulatory/lifecycleBindings';
import type { DocumentAuditEvent } from '../../shared/regulatory/document-lifecycle';

const ORG = 1;
const USER = 42;

let harness: IndPgliteDb;
let app: express.Express;
const captured: DocumentAuditEvent[] = [];

beforeAll(async () => {
  harness = await createIndPgliteDb({ leafSources: true });

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { tenantContext?: unknown; user?: unknown }).tenantContext = { organizationId: ORG };
    (req as express.Request & { user?: unknown }).user = { userId: USER, organizationId: ORG };
    next();
  });
  app.use(
    '/api/regulatory/documents',
    createDocumentLifecycleRouter({
      db: harness.db as never,
      // Capture the org-wide trail + registration; keep the real signature/leaf/
      // package effects and the real persisted hash chain.
      bindingsFactory: (deps) =>
        buildLifecycleBindings({
          ...deps,
          audit: async (e) => {
            captured.push(e);
          },
          registerGovernedDocument: async () => {
            /* captured: promotion to the governed record */
          },
        }),
    }),
  );
});

afterAll(async () => {
  await harness.close();
});

const PLACEMENT = { registryId: 'US_IND', ctdModule: 'M2', sectionCode: '2.5' };

describe('governed document pipeline (HTTP → PGlite)', () => {
  it('runs the spine authoring → approved with gates, signatures and a verified audit chain, and refuses to place while the filing bindings are unwired', async () => {
    // 1. Create — starts at authoring, with content present.
    const create = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: 'IND 12345 — Clinical Overview', documentType: 'US_IND', hasContent: true, contentHash: 'h0' });
    expect(create.status).toBe(201);
    const id: string = create.body.canonicalId;
    expect(id).toMatch(/[0-9a-f-]{36}/);

    // 2. The gate rejects an illegal jump (authoring → approved is not legal).
    const illegal = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved' });
    expect(illegal.status).toBe(409);
    expect(illegal.body.blockedBy).toContain('ILLEGAL_TRANSITION');

    // 3. authoring → in_review (content present).
    expect((await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'in_review' })).status).toBe(200);

    // 4. in_review → approved is blocked until a review sign-off exists.
    const noReview = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved' });
    expect(noReview.status).toBe(409);
    expect(noReview.body.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');

    // 5. Record the review sign-off, then approve (applies the approval signature).
    expect((await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed' })).status).toBe(200);
    expect((await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved' })).status).toBe(200);

    // 6. approved → placed needs a complete dossier placement.
    const noPlacement = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'placed' });
    expect(noPlacement.status).toBe(409);
    expect(noPlacement.body.blockedBy).toContain('PLACEMENT_REQUIRED');
    // 7. placed is REFUSED while the filing bindings are not wired.
    //
    // This step used to return 200. It did so because buildLifecycleBindings
    // supplied fallbacks the route never overrode: a `leaf:<uuid>` that wrote no
    // submission_leaves row, and a package sha256 taken over the string
    // "<docId>:<contentHash>". The pipeline therefore recorded a placement
    // against a leaf that did not exist and a package seal for bytes no file
    // ever had — durably, and attested in this very audit chain.
    //
    // The fallbacks are gone. Until this route injects the real upsertLeaf and
    // assemble services (documented in LIVE_BINDING_TARGETS), the transition is
    // refused, which is the truthful answer. This assertion is what makes that
    // gap visible instead of hiding it behind a green pipeline.
    const placedAttempt = await request(app)
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'placed', placement: PLACEMENT });
    expect(placedAttempt.status).toBe(409);
    expect(String(placedAttempt.body.blockedBy?.join(' '))).toMatch(/PLACEMENT_BINDING_NOT_WIRED/);

    // 8. Final projection: the document rests at `approved`, and the chain over
    //    the transitions that DID happen verifies. A refused transition appends
    //    no audit event.
    const view = await request(app).get(`/api/regulatory/documents/${id}`);
    expect(view.status).toBe(200);
    expect(view.body.stage).toBe('approved');
    expect(view.body.chainValid).toBe(true);
    expect(view.body.audit).toHaveLength(2);
    expect(view.body.audit.map((e: DocumentAuditEvent) => e.to)).toEqual(['in_review', 'approved']);
    // Every persisted event is sealed and linked (append-only, tamper-evident).
    for (let i = 0; i < view.body.audit.length; i++) {
      expect(view.body.audit[i].eventHash).toBeTruthy();
      expect(view.body.audit[i].prevEventHash ?? '').toBe(i === 0 ? '' : view.body.audit[i - 1].eventHash);
    }
    // The org-wide trail saw the same two transitions — and nothing for the
    // refused one.
    expect(captured.map((e) => e.to)).toEqual(['in_review', 'approved']);
  });

  it('scopes reads to the tenant — another org cannot see the document', async () => {
    const otherOrgApp = express();
    otherOrgApp.use(express.json());
    otherOrgApp.use((req, _res, next) => {
      (req as express.Request & { tenantContext?: unknown }).tenantContext = { organizationId: 999 };
      next();
    });
    otherOrgApp.use('/api/regulatory/documents', createDocumentLifecycleRouter({ db: harness.db as never }));

    const create = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: 'Org-1 doc', documentType: 'US_IND', hasContent: true });
    const id: string = create.body.canonicalId;

    expect((await request(otherOrgApp).get(`/api/regulatory/documents/${id}`)).status).toBe(404);
  });

  it('instantiates the type\'s blueprint outline at creation (blueprints reach the document)', async () => {
    // A drug IND carries the CTD outline...
    const ind = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: 'IND outline', documentType: 'US_IND' });
    expect(ind.body.sectionCount).toBeGreaterThan(0);
    const indView = await request(app).get(`/api/regulatory/documents/${ind.body.canonicalId}`);
    const indCodes = indView.body.outline.map((s: { code: string }) => s.code);
    expect(indCodes).toContain('2.5'); // Clinical Overview
    expect(indCodes).toContain('3.2.S'); // Drug Substance

    // ...and a device 510(k) carries its device outline, not the CTD.
    const dev = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: '510(k) outline', documentType: 'US_510K' });
    const devView = await request(app).get(`/api/regulatory/documents/${dev.body.canonicalId}`);
    const devTitles = devView.body.outline.map((s: { title: string }) => s.title);
    expect(devTitles).toContain('Substantial Equivalence');
    expect(devTitles).not.toContain('Drug Substance');
  });
});
