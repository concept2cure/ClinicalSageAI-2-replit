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
 *   4. a caller that sends no token keeps the old behaviour (deliberate: the
 *      MDX dossier drawer PATCHes without having read one, and failing those
 *      closed would break saving to fix a race they cannot hit)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-concurrency';

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
  await owner.end().catch(() => {});
});

describe('a second author cannot silently overwrite the first', () => {
  it('creates a document and a section to contend over', async () => {
    const doc = await request(app)
      .post('/api/authoring/docs').set('Authorization', `Bearer ${bearer}`)
      .send({ title: `${PROBE} Module 3`, module: 'M3' });
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
      .send({ content: '<p>Author A: the filter is validated to 0.22 µm.</p>', expectedUpdatedAt: sharedToken });
    expect(first.status, 'the first save should succeed').toBe(200);

    /* Author B saves against the timestamp they loaded — now stale. */
    const second = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({ content: '<p>Author B: REPLACED EVERYTHING.</p>', expectedUpdatedAt: sharedToken });

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
      });
    expect(res.status).toBe(200);

    const after = await owner.query('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
    expect(after.rows[0].content).toContain('reapplied after reloading');
  });

  it('leaves a caller that sends no token exactly as it was', async () => {
    /* Deliberate. Several callers PATCH sections without having read a
       timestamp — the MDX dossier drawer among them — and failing those closed
       would break saving in order to fix a race they cannot hit. They are no
       less safe than yesterday; they are simply not yet opted in. */
    const res = await request(app)
      .patch(`/api/authoring/sections/${sectionId}`).set('Authorization', `Bearer ${bearer}`)
      .send({ content: '<p>Legacy caller with no token.</p>' });
    expect(res.status).toBe(200);
  });
});
