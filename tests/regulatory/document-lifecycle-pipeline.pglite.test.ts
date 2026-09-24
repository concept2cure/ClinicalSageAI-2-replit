/**
 * Governed document pipeline — end-to-end over HTTP against PGlite.
 *
 * Proves the ONE pipeline is reachable and governed: a canonical document is
 * created, signed off, and advanced through every gated stage, with the
 * fail-closed gate rejecting illegal jumps and each legal transition appending
 * exactly one hash-chained audit event to the persisted per-document trail.
 *
 * Signing re-verifies (2026-09-24). Every signature here goes through the
 * platform's one ceremony — injected as `reverify`, accepting PASSWORD — and
 * every write needs the regulatory-author grant a viewer does not hold. Before
 * that fix this file signed with no password at all, and its request user had
 * no `id`, so every actor it recorded was the string 'unknown'; both were
 * the defect, asserted as the working behaviour.
 *
 * The heavy facet writes (unified_documents / electronic_signatures /
 * submission_leaf / eCTD package) are the orchestrator's injection seam; here
 * `audit` and `registerGovernedDocument` are captured so the test needs no
 * audit_logs table, while persistence, the gate, and the hash chain are all
 * exercised for real.
 */
import express from 'express';
import request from 'supertest';
import { timingSafeEqual } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../server/db/pglite-harness';
import { createDocumentLifecycleRouter } from '../../server/routes/document-lifecycle';
import { buildLifecycleBindings } from '../../server/services/regulatory/lifecycleBindings';
import type { DocumentAuditEvent } from '../../shared/regulatory/document-lifecycle';
import type { SignerCredentials, SignerReverification } from '../../server/services/part11/reverify-signer';
import { SubmissionError } from '../../server/services/submission-service/submission-service';

const ORG = 1;
const USER = 42;
const PASSWORD = 'correct horse battery staple';

/** How many times the ceremony ran — a refused transition must not run it. */
let reverifyCalls = 0;

/** Stands in for reverifySigner: the password is the only factor it checks. */
async function reverify(_userId: number, creds: SignerCredentials): Promise<SignerReverification> {
  reverifyCalls += 1;
  if (typeof creds.password !== 'string' || creds.password.length === 0) {
    return { ok: false, status: 400, code: 'PASSWORD_REQUIRED', error: 'password is required to sign' };
  }
  const given = Buffer.from(creds.password);
  const expected = Buffer.from(PASSWORD);
  // Constant-time, as the real ceremony's bcrypt compare is.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'invalid credentials' };
  }
  return { ok: true, authenticationMethod: 'password', secondFactorVerified: false };
}

type TestUser = { id: number; organizationId: number; role: string; roles: string[] };
/** An app whose requests carry `user` — the shape authenticateToken builds. */
function appAs(user: TestUser | null): express.Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request & { tenantContext?: unknown }).tenantContext = { organizationId: ORG };
    if (user) (req as express.Request & { user?: unknown }).user = user;
    next();
  });
  a.use(
    '/api/regulatory/documents',
    createDocumentLifecycleRouter({
      db: harness.db as never,
      reverify,
      bindingsFactory: (deps) =>
        buildLifecycleBindings({
          ...deps,
          audit: async (e) => {
            captured.push(e);
          },
          registerGovernedDocument: async () => {},
        }),
    }),
  );
  return a;
}

// An org admin: carries regulatory-author (ORG_ROLE_FUNCTIONAL_GRANTS) and
// signing authority (DEFAULT_SIGNING_ROLES).
const ADMIN: TestUser = { id: USER, organizationId: ORG, role: 'admin', roles: ['admin', 'regulatory-author'] };

let harness: IndPgliteDb;
let app: express.Express;
const captured: DocumentAuditEvent[] = [];

beforeAll(async () => {
  harness = await createIndPgliteDb({ leafSources: true });

  // Captures the org-wide trail + registration; keeps the real signature/leaf/
  // package effects and the real persisted hash chain.
  app = appAs(ADMIN);
});

afterAll(async () => {
  await harness.close();
});

const PLACEMENT = { registryId: 'US_IND', ctdModule: 'M2', sectionCode: '2.5' };

describe('governed document pipeline (HTTP → PGlite)', () => {
  it('runs the spine authoring → approved with gates, re-verified signatures and a verified audit chain, and refuses to place without a sequence', async () => {
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
    const review = await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD });
    expect(review.status).toBe(200);
    expect(review.body.signature.actor).toBe(String(USER));
    expect((await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved', password: PASSWORD })).status).toBe(200);

    // 6. approved → placed needs a complete dossier placement.
    const noPlacement = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'placed' });
    expect(noPlacement.status).toBe(409);
    expect(noPlacement.body.blockedBy).toContain('PLACEMENT_REQUIRED');
    // 7. placed is REFUSED without a submission sequence to file into.
    //
    // History, because this step has changed twice. It used to return 200. It did so because buildLifecycleBindings
    // supplied fallbacks the route never overrode: a `leaf:<uuid>` that wrote no
    // submission_leaves row, and a package sha256 taken over the string
    // "<docId>:<contentHash>". The pipeline therefore recorded a placement
    // against a leaf that did not exist and a package seal for bytes no file
    // ever had — durably, and attested in this very audit chain.
    //
    // The fallbacks were removed and the refusal read PLACEMENT_BINDING_NOT_WIRED.
    // The route has injected the real upsertLeaf binding since 2026-09-19 — but
    // only when a user id resolved, and this file's request user had none, so it
    // went on testing the unwired path. With the actor now required the binding
    // is always wired, and a placement naming no sequence is refused BY the
    // binding: the orchestrator's gate cannot know which sequence to file into.
    const placedAttempt = await request(app)
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'placed', placement: PLACEMENT });
    expect(placedAttempt.status).toBe(409);
    expect(String(placedAttempt.body.blockedBy?.join(' '))).toMatch(/PLACEMENT_SEQUENCE_REQUIRED/);

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

describe('signing re-verifies, and writes are role-gated (2026-09-24)', () => {
  async function inReview(): Promise<string> {
    const create = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: 'Signing case', documentType: 'US_IND', hasContent: true, contentHash: 'h1' });
    expect(create.status).toBe(201);
    const id: string = create.body.canonicalId;
    expect((await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'in_review' })).status).toBe(200);
    return id;
  }

  it('refuses a sign-off with no password, and with a wrong one', async () => {
    const id = await inReview();
    const none = await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed' });
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('PASSWORD_REQUIRED');
    const wrong = await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: 'guess' });
    expect(wrong.status).toBe(401);
    // Neither recorded anything: approval is still blocked for want of a review.
    const approve = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved', password: PASSWORD });
    expect(approve.status).toBe(409);
    expect(approve.body.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
  });

  it('records the server role, never the one in the request body', async () => {
    const id = await inReview();
    const res = await request(app)
      .post(`/api/regulatory/documents/${id}/sign`)
      .send({ meaning: 'reviewed', password: PASSWORD, role: 'qualified-person' });
    expect(res.status).toBe(200);
    expect(res.body.signature.role).toBe('admin');
  });

  it('approving signs: no password, no approval — and the stage does not move', async () => {
    const id = await inReview();
    expect((await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD })).status).toBe(200);
    const res = await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved' });
    expect(res.status).toBe(400);
    const view = await request(app).get(`/api/regulatory/documents/${id}`);
    expect(view.body.stage).toBe('in_review');
  });

  it('a signatureRef in the body is never cited: the approval carries a server-minted reference', async () => {
    const id = await inReview();
    expect((await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD })).status).toBe(200);
    const res = await request(app)
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'approved', password: PASSWORD, signatureRef: 'forged-ref' });
    expect(res.status).toBe(200);
    const view = await request(app).get(`/api/regulatory/documents/${id}`);
    const approved = view.body.audit.find((e: DocumentAuditEvent) => e.to === 'approved');
    expect(approved.signatureRef).toMatch(/^csig:/);
    expect(JSON.stringify(view.body.audit)).not.toContain('forged-ref');
  });

  it('a role without signing authority cannot sign, even re-verified', async () => {
    const id = await inReview();
    const member = appAs({ id: 43, organizationId: ORG, role: 'member', roles: ['member', 'regulatory-author'] });
    const res = await request(member).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ESIGNATURE_NO_AUTHORITY');
  });

  it('a viewer can create, sign and advance nothing', async () => {
    const id = await inReview();
    const viewer = appAs({ id: 44, organizationId: ORG, role: 'viewer', roles: ['viewer'] });
    expect((await request(viewer).post('/api/regulatory/documents').send({ title: 'x', documentType: 'US_IND' })).status).toBe(403);
    expect((await request(viewer).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD })).status).toBe(403);
    expect((await request(viewer).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved', password: PASSWORD })).status).toBe(403);
    expect((await request(viewer).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'placed', placement: PLACEMENT })).status).toBe(403);
  });

  it('no user, no write: the actor is the authenticated user or nothing — never "unknown"', async () => {
    const id = await inReview();
    const anon = appAs(null);
    expect((await request(anon).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD })).status).toBe(401);
    expect((await request(anon).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved', password: PASSWORD })).status).toBe(401);
  });

  it('an illegal jump is refused by the gate and costs the signer no credential check', async () => {
    // A wrong password counts against the account's lockout (F-27); asking for
    // one on a transition the gate refuses would let a bad request burn it.
    const create = await request(app)
      .post('/api/regulatory/documents')
      .send({ title: 'Illegal jump', documentType: 'US_IND', hasContent: true });
    const id: string = create.body.canonicalId;
    reverifyCalls = 0;
    const res = await request(app)
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'approved', password: 'a wrong guess' });
    expect(res.status).toBe(409);
    expect(res.body.blockedBy).toContain('ILLEGAL_TRANSITION');
    expect(reverifyCalls).toBe(0);
  });
});

/**
 * The leaf writer's own refusals are refusals, not server errors.
 *
 * upsertLeaf refuses a frozen or dispatched sequence (and a missing one) with a
 * typed SubmissionError. The route caught only the binding's LeafBindingRefusal,
 * so the writer's refusal fell through to a 500 — while the route's own comment
 * said a refusal is "a 409 … never a 500". Found by the 2026-09-24
 * re-verification.
 */
describe('the writer\'s refusals keep their status', () => {
  function appWithWriter(refusal: SubmissionError): express.Express {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as express.Request & { tenantContext?: unknown }).tenantContext = { organizationId: ORG };
      (req as express.Request & { user?: unknown }).user = ADMIN;
      next();
    });
    a.use('/api/regulatory/documents', createDocumentLifecycleRouter({
      db: harness.db as never,
      reverify,
      bindingsFactory: (deps) => buildLifecycleBindings({
        ...deps,
        audit: async () => {},
        registerGovernedDocument: async () => {},
        upsertLeaf: async () => { throw refusal; },
      }),
    }));
    return a;
  }

  async function approvedDoc(): Promise<string> {
    const id = (await request(app).post('/api/regulatory/documents')
      .send({ title: 'Writer refusal', documentType: 'US_IND', hasContent: true })).body.canonicalId;
    await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'in_review' });
    await request(app).post(`/api/regulatory/documents/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD });
    expect((await request(app).post(`/api/regulatory/documents/${id}/advance`).send({ to: 'approved', password: PASSWORD })).status).toBe(200);
    return id;
  }

  it('a frozen sequence is a 409 in the orchestrator\'s shape, not a 500', async () => {
    const id = await approvedDoc();
    const res = await request(appWithWriter(new SubmissionError('INVALID_STATE', 'Sequence is frozen; its leaves are immutable.')))
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'placed', placement: { ...PLACEMENT, sequenceId: 9 } });
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(String(res.body.blockedBy?.join(' '))).toMatch(/INVALID_STATE: Sequence is frozen; its leaves are immutable/);
  });

  it('a sequence that does not exist is a 404', async () => {
    const id = await approvedDoc();
    const res = await request(appWithWriter(new SubmissionError('NOT_FOUND', 'Sequence not found for this organization.')))
      .post(`/api/regulatory/documents/${id}/advance`)
      .send({ to: 'placed', placement: { ...PLACEMENT, sequenceId: 9 } });
    expect(res.status).toBe(404);
  });
});
