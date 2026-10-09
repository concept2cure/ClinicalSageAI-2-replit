/**
 * D3: an edit writes content — never the row's tenant, its parent, or its
 * approval (ledger L192).
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) under the
 * production posture that fixture asserts: `app_service`, not superuser, no
 * BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope middleware and the real
 * routers.
 *
 * PATCH /api/pccp/plans/:id, PATCH /api/pccp/modifications/:id and
 * PATCH /api/post-market/documents/:id (and the AnA tool that shares the
 * last one's service function) spread their input into `.set()`. Each found the
 * caller's own row first, so what the body decided was everything else about
 * it: its organization, the program or plan it hangs from, and whether it was
 * approved — status, locked, approvedBy, signatureId — without going through
 * the approve endpoint and its gate. No role is required to PATCH, so any
 * member could do it.
 *
 * RLS refuses the organization move in production posture. It does not refuse
 * the rest: an approval is a same-org write, a parent re-point is a foreign key
 * (checked without RLS), and ai_ml_modifications has no organization column and
 * no policy at all.
 *
 * Every case runs as tenant A against A's own rows. Row state is read through
 * the OWNER pool, which is exempt from RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import pccpRouter from '../../server/routes/pccp';
import postMarketRouter from '../../server/routes/post-market';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(teardownTwoTenantFixture);

const FORGED_SIGNATURE = '00000000-0000-4000-8000-00000000f00d';

// One describe keeps the rows the cases share visibly one contract, as in the
// sibling suites.
// eslint-disable-next-line max-lines-per-function
describe('A PCCP or post-market edit writes content, never tenant, parent or approval (D3, L192)', () => {
  let app: express.Express;
  let progA: string;
  let progB: string;
  /* One row per case. A forged approval LOCKS the row it lands on, and every
     later edit of a locked row answers 409 — so cases sharing a row would let
     one case's leak hide the next case's, which is exactly what a first draft
     of this file did on the unfixed routers. For the same reason the org move
     and the parent re-point are separate requests: RLS refuses the first, and
     a refused UPDATE writes nothing, so sending both together would hide the
     second, which RLS does not refuse. */
  let planToApprove: string;
  let planToRehome: string;
  let planToReparent: string;
  let planWithMod: string;
  let planB: string;
  let modA: string;
  let docToApprove: string;
  let docToRehome: string;
  let docToReparent: string;

  const plan = async (id: string) =>
    (
      await owner.query(
        `SELECT organization_id, program_id::text AS program_id, status, locked, approved_by,
                signature_id::text AS signature_id, title
           FROM ai_ml_pccp_plans WHERE id=$1`,
        [id]
      )
    ).rows[0];
  const doc = async (id: string) =>
    (
      await owner.query(
        `SELECT organization_id, program_id::text AS program_id, status, locked, approved_by, summary
           FROM post_market_documents WHERE id=$1`,
        [id]
      )
    ).rows[0];

  beforeAll(async () => {
    // Mounted as server/bootstrap/register-document-routes.ts mounts them; both
    // routers apply authenticateToken themselves.
    app = express();
    app.use(express.json());
    app.use('/api/pccp', pccpRouter);
    app.use('/api/post-market', postMarketRouter);

    const programs = await owner.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1,$2,$3,'device','samd','FDA','fixture-A'),
              ($4,$5,$6,'device','samd','FDA','fixture-B')
       RETURNING id::text AS id`,
      [ORG_A, `${TAG}-program-A`, 'WO3-A', ORG_B, `${TAG}-program-B`, 'WO3-B']
    );
    [progA, progB] = programs.rows.map(r => r.id);
    const plans = await owner.query(
      `INSERT INTO ai_ml_pccp_plans (organization_id, program_id, code, title)
       VALUES ($1,$2,'PCCP-A1',$3),($1,$2,'PCCP-A2',$4),($1,$2,'PCCP-A3',$5),($1,$2,'PCCP-A4',$6),
              ($7,$8,'PCCP-B',$9)
       RETURNING id::text AS id`,
      [
        ORG_A,
        progA,
        `${TAG}-plan-A1`,
        `${TAG}-plan-A2`,
        `${TAG}-plan-A3`,
        `${TAG}-plan-A4`,
        ORG_B,
        progB,
        `${TAG}-plan-B`,
      ]
    );
    [planToApprove, planToRehome, planToReparent, planWithMod, planB] = plans.rows.map(r => r.id);
    const mod = await owner.query(
      `INSERT INTO ai_ml_modifications
         (plan_id, code, title, modification_type, boundary, rationale, rollback_strategy)
       VALUES ($1,'MOD-1',$2,'retraining','fixture boundary','fixture rationale','fixture rollback')
       RETURNING id::text AS id`,
      [planWithMod, `${TAG}-mod-A`]
    );
    modA = mod.rows[0].id;
    const docs = await owner.query(
      `INSERT INTO post_market_documents (organization_id, program_id, document_type, code, title)
       VALUES ($1,$2,'psur','PM-A1',$3),($1,$2,'psur','PM-A2',$4),($1,$2,'psur','PM-A3',$5)
       RETURNING id::text AS id`,
      [ORG_A, progA, `${TAG}-doc-A1`, `${TAG}-doc-A2`, `${TAG}-doc-A3`]
    );
    [docToApprove, docToRehome, docToReparent] = docs.rows.map(r => r.id);
  });

  it('a plan edit cannot approve or lock the plan, and the content edit still applies', async () => {
    const before = await plan(planToApprove);
    const res = await request(app)
      .patch(`/api/pccp/plans/${planToApprove}`)
      .set(auth(tokenA))
      .send({
        title: `${TAG}-plan-edited`,
        status: 'approved',
        locked: true,
        approvedBy: 'forged-approver',
        signatureId: FORGED_SIGNATURE,
      });
    const after = await plan(planToApprove);
    expect(
      { status: after.status, locked: after.locked, approved_by: after.approved_by, signature_id: after.signature_id },
      'an edit must not approve the plan: that is the approve endpoint and its gate'
    ).toEqual({
      status: before.status,
      locked: before.locked,
      approved_by: before.approved_by,
      signature_id: before.signature_id,
    });
    expect(res.status).toBe(200);
    expect(after.title).toBe(`${TAG}-plan-edited`);
  });

  it('a plan edit cannot move the plan to another org, and the content edit still applies', async () => {
    const res = await request(app)
      .patch(`/api/pccp/plans/${planToRehome}`)
      .set(auth(tokenA))
      .send({ organizationId: ORG_B, title: `${TAG}-plan-rehome` });
    const after = await plan(planToRehome);
    expect(after.organization_id, "tenant A's plan must remain tenant A's").toBe(ORG_A);
    expect(res.status, 'the content edit must go through, not be refused as a whole').toBe(200);
    expect(after.title).toBe(`${TAG}-plan-rehome`);
  });

  it("a plan edit cannot hang the plan from another org's program", async () => {
    const res = await request(app)
      .patch(`/api/pccp/plans/${planToReparent}`)
      .set(auth(tokenA))
      .send({ programId: progB, title: `${TAG}-plan-reparent` });
    const after = await plan(planToReparent);
    expect(after.program_id, "tenant A's plan must not hang from tenant B's program").toBe(progA);
    expect(res.status).toBe(200);
  });

  it("a modification edit cannot move it into another org's plan", async () => {
    const res = await request(app)
      .patch(`/api/pccp/modifications/${modA}`)
      .set(auth(tokenA))
      .send({ planId: planB, title: `${TAG}-mod-edited` });
    const after = (
      await owner.query('SELECT plan_id::text AS plan_id, title FROM ai_ml_modifications WHERE id=$1', [
        modA,
      ])
    ).rows[0];
    expect(after.plan_id, "tenant A's modification must stay in tenant A's plan").toBe(planWithMod);
    expect(res.status).toBe(200);
    expect(after.title).toBe(`${TAG}-mod-edited`);
  });

  it('a post-market document edit cannot approve or lock it, and the content edit still applies', async () => {
    const before = await doc(docToApprove);
    const res = await request(app)
      .patch(`/api/post-market/documents/${docToApprove}`)
      .set(auth(tokenA))
      .send({
        summary: `${TAG}-summary`,
        status: 'approved',
        locked: true,
        approvedBy: 'forged-approver',
      });
    const after = await doc(docToApprove);
    expect(
      { status: after.status, locked: after.locked, approved_by: after.approved_by },
      'an edit must not approve the document: that is the approve endpoint and its gate'
    ).toEqual({ status: before.status, locked: before.locked, approved_by: before.approved_by });
    expect(res.status).toBe(200);
    expect(after.summary).toBe(`${TAG}-summary`);
  });

  it('a post-market document edit cannot move it to another org, and the content edit still applies', async () => {
    const res = await request(app)
      .patch(`/api/post-market/documents/${docToRehome}`)
      .set(auth(tokenA))
      .send({ organizationId: ORG_B, summary: `${TAG}-summary-rehome` });
    const after = await doc(docToRehome);
    expect(after.organization_id, "tenant A's document must remain tenant A's").toBe(ORG_A);
    expect(res.status, 'the content edit must go through, not be refused as a whole').toBe(200);
    expect(after.summary).toBe(`${TAG}-summary-rehome`);
  });

  it("a post-market document edit cannot hang it from another org's program", async () => {
    const res = await request(app)
      .patch(`/api/post-market/documents/${docToReparent}`)
      .set(auth(tokenA))
      .send({ programId: progB, summary: `${TAG}-summary-reparent` });
    const after = await doc(docToReparent);
    expect(after.program_id, "tenant A's document must not hang from tenant B's program").toBe(progA);
    expect(res.status).toBe(200);
  });
});
