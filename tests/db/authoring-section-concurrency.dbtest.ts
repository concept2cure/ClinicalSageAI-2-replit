/**
 * Two authors, one section — against real PostgreSQL.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `PATCH /api/authoring/sections/:id` updated `WHERE id = $1 AND tenant_id = $2`
 * and nothing else, and the editor sent only `{ content }`. So the normal case
 * for a CTD module — a writer and a reviewer working the same §3.2.P.5 — ended
 * with whoever saved second REPLACING THE OTHER'S ENTIRE SECTION. No 409, no
 * warning, no merge, no "this changed while you were editing".
 *
 * The part that makes it a records defect rather than a UX one: the overwrite
 * enters the hash-chained revision ledger as an ordinary authored revision. The
 * chain is intact and the content is wrong, so nothing downstream can tell that
 * a collision happened. Recovery depends on a human noticing their work is gone
 * and thinking to open the History rail.
 *
 * ── Why this cannot be a unit test ───────────────────────────────────────────
 * The guard compares the client's `expectedUpdatedAt` against the row's live
 * `updated_at`, which only means anything if a real UPDATE actually moved it.
 * A mocked pool returns whatever it was told to; it cannot have a timestamp
 * that changed underneath a second caller.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 *   1. a stale save is REFUSED with 409, and the refusal names the situation
 *   2. the refused save changes NOTHING — the first author's text survives
 *   3. a save carrying the current timestamp still succeeds
 *   4. a caller that sends no token keeps the supported unconditional behavior
 *      (the demo fixture and metadata PATCHes still use it; MDX has a different
 *      route and never belonged in this caller list)
 *   5. two requests that pass the initial read before either can acquire the
 *      parent lock produce one commit and one conflict, not two successful saves
 *   6. the observable timestamp advances even when the stored clock is ahead
 *
 * ── Every save carries a reason for change ───────────────────────────────────
 * Since fde9d704e the SERVER refuses a content save without a reason of at
 * least 8 characters (400, `field: 'changeReason'`) — 21 CFR 11.10(e), see
 * server/routes/governed-reason.ts. That rule is orthogonal to the token: it
 * applies whether or not `expectedUpdatedAt` is sent. So every PATCH here sends
 * a valid `changeReason`, exactly as the editor does, and the stale save in
 * particular is refused for its token and nothing else.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = `dbtest-concurrency-${process.pid}-${Date.now().toString(36)}`;
/** A reason that clears the server's 8-character floor (governed-reason.ts). */
const REASON = 'Updated the filter validation statement.';

let owner: Pool;
let orgId: number;
let userId: number;
let docId: string;
let sectionId: string;
let app: express.Express;
/** The router requires a real Bearer token — it verifies it itself, before any
 *  route runs, so a stubbed `req.user` alone is refused with 401. Signed here
 *  with the same rotation-aware secret the server uses, which is the point:
 *  the suite exercises the real auth boundary rather than bypassing it. */
let bearer: string;
/** The project the document is created in: a document belongs to a project (PF-07). */
let programId: string;

/** Observe real PostgreSQL waits, not a timing guess. The second writer can
 * wait on the first queued writer's tuple lock as well as the held parent. */
async function waitForParentWriter(holderPid: number, firstWriterPid = 0): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await owner.query(`SELECT pid FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'
        AND query LIKE '%SELECT status, locked_at FROM authoring_documents%FOR UPDATE%'
        AND pg_blocking_pids(pid) && $1::int[] AND pid <> $2`, [[holderPid, firstWriterPid], firstWriterPid]);
    if (rows.length) return Number(rows[0].pid);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('The ordinary editor request never reached its expected native parent lock wait.');
}

async function savedState() {
  return (await owner.query(`SELECT content, updated_at,
    (SELECT count(*)::int FROM doc_revisions r WHERE r.section_id=s.id AND r.tenant_id=s.tenant_id) AS revisions,
    (SELECT count(*)::int FROM authoring_audit_trail a WHERE a.section_id=s.id AND a.tenant_id=s.tenant_id) AS audits
    FROM authoring_sections s WHERE s.id=$1 AND s.tenant_id=$2`, [sectionId, orgId])).rows[0];
}

async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/authoring.router')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, userId, organizationId: orgId, role: 'admin', email: `${PROBE}@example.test` };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/authoring', router);
  return a;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE} tenant`, `${PROBE}-tenant`],
  );
  orgId = Number(org.rows[0].id);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}@example.test`, `${PROBE} actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  /* The membership row. `AUTH_009` — "Organization membership revoked or not
     found" — is checked against `organization_users` on every authoring write,
     so a signed token naming an organization is not by itself authorization to
     write into it. That is the correct posture (a revoked member's unexpired
     token must stop working), and it means the fixture has to be a real
     member rather than merely claim to be one. */
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role)
       VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
    [orgId, userId],
  );

  /* A document is created in a project of its organization (PF-07): POST
     /api/authoring/docs refuses one that names none, 400 PROJECT_REQUIRED.
     Upserted on (organization_id, code), so a re-run reuses it. */
  const program = await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4)
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
     RETURNING id`,
    [orgId, `${PROBE} program`, 'DBTEST-CONCURRENCY', `${PROBE} product`],
  );
  programId = String(program.rows[0].id);

  /* Signed with the SAME secret the router verifies against.
     `server/utils/jwtVerify.ts` resolves `JWT_SECRET_<suffix> ?? JWT_SECRET`
     at CALL time, and maps NODE_ENV through ENV_SUFFIX_MAP where 'test' →
     'DEV' (not 'TEST'). Two things went wrong reading that from the
     environment: the suffix derived from NODE_ENV directly picks the wrong
     variable, and the db-test process does not necessarily have `.env` loaded
     at all — every request came back 401 "Invalid authentication token".
     So the secret is SET here rather than discovered. Because the router reads
     it at call time, assigning before the dynamic import in `buildApp()` is
     enough, and the suite no longer depends on which secrets the surrounding
     environment happens to carry. */
  const suffix =
    ({ production: 'PROD', staging: 'STAGING', development: 'DEV', test: 'DEV' } as Record<string, string>)[
      process.env.NODE_ENV ?? 'development'
    ] ?? 'DEV';
  const secret = `${PROBE}-jwt-secret-not-a-real-key`;
  process.env[`JWT_SECRET_${suffix}`] = secret;
  process.env.JWT_SECRET = secret;

  const jwt = (await import('jsonwebtoken')).default;
  bearer = jwt.sign(
    {
      userId: String(userId),
      id: String(userId),
      organizationId: String(orgId),
      role: 'admin',
      /* PLURAL. `requireAny` reads `req.user.roles` — an array the router
         builds from the token's own `roles` claim — not the singular `role`.
         With only `role` set, authentication succeeded and every write came
         back 403 "Requires one of: ADMIN, RA_CMC, QA". */
      roles: ['ADMIN', 'RA_CMC', 'QA'],
      email: `${PROBE}@example.test`,
      type: 'access',
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );

  app = await buildApp();
});

afterAll(async () => {
  await owner
    .query('DELETE FROM authoring_sections WHERE code LIKE $1', [`${PROBE}%`])
    .catch(() => {});
  await owner.query('DELETE FROM authoring_documents WHERE title LIKE $1', [`${PROBE}%`]).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE organization_id = $1 AND code = $2', [orgId, 'DBTEST-CONCURRENCY']).catch(() => {});
  await owner.end().catch(() => {});
});

describe('a second author cannot silently overwrite the first', () => {
  it('creates a document and a section to contend over', async () => {
    const doc = await request(app)
      .post('/api/authoring/docs').set('Authorization', `Bearer ${bearer}`)
      .send({ title: `${PROBE} Module 3`, module: 'M3', client_program_id: programId });
    expect([200, 201]).toContain(doc.status);
    docId = String(doc.body?.doc?.id ?? doc.body?.document?.id ?? doc.body?.id);
    expect(docId, 'no document id returned').toBeTruthy();

    /* Sections are created at POST /sections with the document in the BODY —
       there is no nested /docs/:id/sections route, and asking for one is a
       plain 404. */
    const sec = await request(app)
      .post('/api/authoring/sections').set('Authorization', `Bearer ${bearer}`)
      .send({ doc_id: docId, code: `${PROBE}-3.2.P.5`, title: 'Control of Drug Product' });
    expect([200, 201]).toContain(sec.status);
    sectionId = String(sec.body?.section?.id ?? sec.body?.id);
    expect(sectionId, 'no section id returned').toBeTruthy();
  });

  it('refuses a save whose token is stale, and overwrites nothing', async () => {
    /* Both authors open the section and see the same timestamp. */
    const opened = await owner.query(
      'SELECT updated_at FROM authoring_sections WHERE id = $1',
      [sectionId],
    );
    const sharedToken = new Date(opened.rows[0].updated_at).toISOString();

    /* Author A saves first and moves the row. */
    const first = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({
        content: '<p>Author A: the filter is validated to 0.22 µm.</p>',
        expectedUpdatedAt: sharedToken,
        changeReason: REASON,
      });
    expect(first.status, 'the first save should succeed').toBe(200);

    /* Author B saves against the timestamp they loaded — now stale. A valid
       reason, so the token is the only thing wrong with this request. */
    const second = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({
        content: '<p>Author B: REPLACED EVERYTHING.</p>',
        expectedUpdatedAt: sharedToken,
        changeReason: REASON,
      });

    expect(second.status, 'a stale save was accepted — the first author was overwritten').toBe(409);
    expect(String(second.body?.error?.code)).toBe('SECTION_CHANGED');
    /* The refusal explains the situation rather than naming a status. */
    expect(String(second.body?.error?.message)).toMatch(/changed by someone else/i);
    /* And it discloses no schema object, query or route. */
    expect(JSON.stringify(second.body)).not.toMatch(/authoring_sections|SELECT|UPDATE |\/api\//i);

    /* The decisive assertion: A's text is still the record. */
    const after = await owner.query('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
    expect(after.rows[0].content).toContain('Author A');
    expect(after.rows[0].content).not.toContain('REPLACED EVERYTHING');
  });

  it('accepts a save that carries the current token', async () => {
    const fresh = await owner.query(
      'SELECT updated_at FROM authoring_sections WHERE id = $1',
      [sectionId],
    );
    const res = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({
        content: '<p>Author B: reapplied after reloading.</p>',
        expectedUpdatedAt: new Date(fresh.rows[0].updated_at).toISOString(),
        changeReason: REASON,
      });
    expect(res.status).toBe(200);

    const after = await owner.query('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
    expect(after.rows[0].content).toContain('reapplied after reloading');
  });

});

describe('ordinary saves preserve concurrent edits and version ordering', () => {
  it('commits one overlapping save and refuses the other after both passed their pre-read', async () => {
    const before = await savedState();
    const sharedToken = new Date(before.updated_at).toISOString();
    const holder = await owner.connect();
    const pending: Array<Promise<request.Response>> = [];
    try {
      await holder.query('BEGIN');
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query('SELECT id FROM authoring_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [docId, orgId]);
      const bodies = ['<p>The first overlapping author saved this assertion.</p>', '<p>The second overlapping author saved this assertion.</p>'];
      const save = (content: string) => request(app).patch(`/api/authoring/sections/${sectionId}`)
        .set('Authorization', `Bearer ${bearer}`).send({ content, expectedUpdatedAt: sharedToken, changeReason: REASON }).then(response => response);
      pending.push(save(bodies[0]));
      const firstPid = await waitForParentWriter(holderPid);
      pending.push(save(bodies[1]));
      const secondPid = await waitForParentWriter(holderPid, firstPid);
      expect(secondPid).not.toBe(firstPid);

      // Both ordinary PATCHes have passed the initial read and are waiting on
      // separate native connections. Only now allow either mutation to proceed.
      await holder.query('COMMIT');
      const results = await Promise.all(pending);
      expect(results.map(result => result.status).sort()).toEqual([200, 409]);
      const winner = results.findIndex(result => result.status === 200);
      const loser = results[1 - winner];
      expect(loser.body).toMatchObject({ success: false, error: { code: 'SECTION_CHANGED' },
        currentUpdatedAt: results[winner].body.section.updated_at });
      const after = await savedState();
      expect(after.content).toBe(bodies[winner]);
      expect(after.revisions).toBe(before.revisions + 1);
      expect(after.audits).toBe(before.audits + 1);
      const audit = (await owner.query(`SELECT before_content,after_content FROM authoring_audit_trail
        WHERE section_id=$1 AND tenant_id=$2 AND operation_type='UPDATE'
        ORDER BY created_at DESC LIMIT 1`, [sectionId, orgId])).rows[0];
      expect(audit).toEqual({ before_content: before.content, after_content: bodies[winner] });
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
      await Promise.allSettled(pending);
    }
  });

  it('advances the observable millisecond version when transaction time is behind the stored version', async () => {
    // Isolated QA fault injection: represent clock rollback without sleeping
    // or changing the machine clock. No governed content/history is rewritten.
    const seeded = await owner.query(`UPDATE authoring_sections
      SET updated_at=date_trunc('milliseconds',clock_timestamp()) + interval '1 minute'
      WHERE id=$1 AND tenant_id=$2 RETURNING updated_at`, [sectionId, orgId]);
    let token = new Date(seeded.rows[0].updated_at).toISOString();
    for (let attempt = 0; attempt < 2; attempt++) {
      const saved = await request(app).patch(`/api/authoring/sections/${sectionId}`)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ content: `<p>Clock rollback QA assertion ${attempt}.</p>`, expectedUpdatedAt: token, changeReason: REASON });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      const next = saved.body.section.updated_at;
      expect(new Date(next).getTime()).toBeGreaterThan(new Date(token).getTime());
      token = next;
    }
  });

  it('leaves a caller that sends no token exactly as it was', async () => {
    /* Deliberate compatibility: the existing demo writer omits a token, as do
       metadata callers. Such a save carries no stale-editor guarantee. */
    const res = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({ content: '<p>Legacy caller with no token.</p>', changeReason: REASON });
    expect(res.status).toBe(200);

    const after = await owner.query('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
    expect(after.rows[0].content).toContain('Legacy caller with no token');
  });
});
