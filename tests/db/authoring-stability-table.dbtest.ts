/**
 * The BP-W1-1 wave gate, executable — a Module 3.2.P.8.3 stability table that
 * survives a round trip and lands in Word as a REAL table.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * BIOPHARMA_WORK_ORDER.md names one check above every other in Wave 1, and
 * writes it out twice — once in BP-W1-1 and again in the appendix under "The
 * gate that matters most. Wave 1 is not complete until this passes":
 *
 *     Author a Module 3.2.P.8.3 stability table — 3 storage conditions × 5
 *     timepoints, with assay, degradants and appearance rows. Save. Hard
 *     reload. Export to Word. The table must be a real table in the resulting
 *     .docx.
 *
 * The editor work landed, and the gate itself had never been run end to end.
 * It is a four-system claim — editor serialization, the sections store, the
 * block converter, and the docx writer — and only the whole chain can witness
 * it. Each link has its own unit tests; none of them can tell you that a table
 * authored in the product arrives as a table in the filed document.
 *
 * ── Why the assertions are on the OOXML, not on a byte count ─────────────────
 * `<w:tbl>` is the only thing that makes a Word table a table. A converter that
 * flattened the grid to tab-separated paragraphs would still return a valid
 * .docx of a plausible size, still open in Word, and still be wrong — a
 * reviewer would see the numbers and be unable to sort, filter or read them as
 * a grid, and an eCTD reviewer reads Module 3 almost entirely as tables.
 *
 * So the counts are exact and derived from the fixture rather than guessed:
 * 3 conditions × 3 parameters = 9 body rows, + 1 header = 10 `<w:tr>`; each row
 * is 2 label columns + 5 timepoints = 7 cells, so 70 `<w:tc>`. A converter that
 * loses the header, transposes the grid, or drops a condition cannot hit those
 * three numbers at once.
 *
 * The degree sign and the "% RH" are probed deliberately: `40°C / 75% RH` is
 * the accelerated condition, it is the one non-ASCII cell in the table, and a
 * broken encoding path shows up there first.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

/**
 * Marks every row this suite creates, so cleanup never touches anything else.
 *
 * UNIQUE PER RUN, and it has to be. The title was a fixed string, and the
 * teardown below is written to survive the Part 11 ledger refusing its DELETE —
 * it catches the append-only error and marks the row "(retired)" instead. That
 * is the right behaviour for an immutable ledger, but it means the documents
 * are never actually removed: doc_revisions_append_only() blocks the cascade,
 * so `DELETE FROM authoring_documents WHERE title LIKE 'dbtest-w11%'` fails for
 * the owner too. Every run therefore left its document behind, and the next run
 * POSTed the same title and got 409 Conflict — this suite passed once per
 * database and failed every time after, which is invisible in CI (a fresh
 * database each run) and immediate for anyone running it twice locally.
 *
 * A per-run suffix cannot collide with a row no one is allowed to delete. The
 * cleanup still matches on the prefix, so it only ever sees its own rows.
 */
const PROBE_TITLE = `dbtest-w11 Module 3 stability ${process.pid}-${Date.now().toString(36)}`;

const CONDITIONS = ['25°C / 60% RH', '30°C / 65% RH', '40°C / 75% RH'];
const TIMEPOINTS = ['0 M', '3 M', '6 M', '9 M', '12 M'];
const PARAMETERS: Array<[string, string[]]> = [
  ['Assay (% label claim)', ['99.8', '99.5', '99.1', '98.7', '98.4']],
  ['Total degradants (%)', ['0.12', '0.18', '0.24', '0.31', '0.38']],
  ['Appearance', ['Conforms', 'Conforms', 'Conforms', 'Conforms', 'Conforms']],
];

/** Editor HTML exactly as the block editor serialises an authored table. */
const STABILITY_HTML = (() => {
  const head = `<tr><th>Storage condition</th><th>Parameter</th>${TIMEPOINTS.map((t) => `<th>${t}</th>`).join('')}</tr>`;
  const body = CONDITIONS.map((c) =>
    PARAMETERS.map(
      ([p, vals]) =>
        `<tr><td>${c}</td><td>${p}</td>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`,
    ).join(''),
  ).join('');
  return `<h2>3.2.P.8.3 Stability Data</h2><table>${head}${body}</table>`;
})();

const EXPECTED_ROWS = 1 + CONDITIONS.length * PARAMETERS.length; // 10
const EXPECTED_CELLS = EXPECTED_ROWS * (2 + TIMEPOINTS.length); // 70

let owner: Pool;
let orgId: number;
let userId: number;
let app: express.Express;
let docId: string;
let auth: string;

/**
 * A REAL signed token, not a stubbed req.user.
 *
 * authoring.router.ts carries its own §11 JWT gate ahead of every handler, so a
 * request-shaping middleware alone answers 401 — which is correct of it and is
 * why the sibling export suites sign too. The claims carry the org and user
 * this suite provisioned, so the token authenticates against real rows rather
 * than asserting a tenant the database has never heard of.
 */
async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET_DEV || process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: String(userId),
    id: String(userId),
    sub: String(userId),
    email: 'dbtest-w11@c2c.test',
    organizationId: String(orgId),
    role: 'admin',
    roles: ['admin'],
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret);
  return `Bearer ${token}`;
}

/**
 * The authoring router behind a stub supplying exactly what the real auth
 * middleware populates. Authentication is not under test; the table is.
 */
async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/authoring.router')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use(express.json({ limit: '4mb' }));
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, role: 'admin', email: 'dbtest-w11@c2c.test' };
    req.headers['x-user-email'] = 'dbtest-w11@c2c.test';
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/authoring', router);
  return a;
}

/**
 * Retire the probe rows WITHOUT fighting Part 11.
 *
 * The obvious cleanup — delete the sections, then the document — fails, and the
 * failure is the system working:
 *
 *   doc_revisions is an append-only ledger: DELETE refused
 *   History is corrected by appending a new revision, not by editing one.
 *
 * Deleting a section cascades into `doc_revisions`, and a database trigger
 * refuses it. That is §11.10(e) enforced where it cannot be talked around, and
 * a test suite is not entitled to an exemption from it — if this file could
 * erase revision history, so could anything else holding the owner connection.
 *
 * So the suite retires its document by marking it, and leaves the ledger
 * intact. The rows live under a `dbtest-w11` tenant that nothing else reads, so
 * they are inert; what matters is that the guarantee stays unbroken. Deletion
 * is still ATTEMPTED for the document row, and a refusal is tolerated rather
 * than swallowed silently — if it ever starts succeeding, that is worth
 * knowing, because it would mean the ledger stopped being append-only.
 */
async function cleanupProbeRows(): Promise<void> {
  await owner
    .query('DELETE FROM authoring_documents WHERE title LIKE $1', [`${PROBE_TITLE}%`])
    .catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/append-only/i.test(msg)) throw err;
      // Expected: the Part 11 ledger holds. Mark the document instead.
      await owner.query(
        `UPDATE authoring_documents SET title = $1 WHERE title LIKE $2`,
        [`${PROBE_TITLE} (retired)`, `${PROBE_TITLE}%`],
      );
    });
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['dbtest-w11 tenant', 'dbtest-w11-tenant'],
  );
  orgId = Number(org.rows[0].id);

  // Columns match the provisioned schema, not the Drizzle barrel: `users` here
  // is (email, name, password_hash), which is what the sibling W0-1 suite uses.
  const usr = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['dbtest-w11@c2c.test', 'dbtest-w11 actor', 'not-a-real-hash'],
  );
  userId = Number(usr.rows[0].id);

  /* Membership, not just identity. The router re-checks organization_users
     (AUTH_009) after verifying the token, so a signed JWT whose org claim has
     no membership row answers 403 — correctly. Provisioning the row here is
     what makes the actor a real member of a real tenant rather than an
     assertion the database has never seen. */
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role)
       VALUES ($1, $2, 'admin')
     ON CONFLICT DO NOTHING`,
    [orgId, userId],
  );

  await cleanupProbeRows();
  app = await buildApp();
  auth = await bearer();
}, 60_000);

afterAll(async () => {
  await cleanupProbeRows().catch(() => undefined);
  await owner?.end().catch(() => undefined);
});

describe('BP-W1-1 wave gate — a stability table reaches Word as a table', () => {
  it('authors the table into a governed section', async () => {
    const doc = await request(app)
      .post('/api/authoring/docs')
      .set('Authorization', auth)
      .send({ title: PROBE_TITLE, module: 'M3', product_code: 'C2C-101' });
    expect(doc.status).toBe(201);
    docId = doc.body?.document?.id ?? doc.body?.id;
    expect(docId, 'document id').toBeTruthy();

    const sec = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', auth)
      .send({ doc_id: docId, code: '3.2.P.8.3', title: 'Stability Data', content: STABILITY_HTML });
    expect(sec.status).toBe(201);
  });

  it('survives the hard reload — the grid is re-read from the store, not from memory', async () => {
    const back = await request(app)
      .get(`/api/authoring/docs/${docId}/sections`)
      .set('Authorization', auth);
    expect(back.status).toBe(200);

    const rows = back.body?.sections ?? back.body?.data ?? back.body;
    const section = (Array.isArray(rows) ? rows : []).find((r: any) => r.code === '3.2.P.8.3');
    expect(section, 'the section is retrievable after save').toBeTruthy();

    // Every condition and every timepoint, not merely "some table markup".
    expect(String(section.content)).toContain('<table');
    for (const c of CONDITIONS) expect(String(section.content)).toContain(c);
    for (const t of TIMEPOINTS) expect(String(section.content)).toContain(t);
    expect(String(section.content)).toContain('Total degradants');
  });

  it('exports to Word as a REAL table — <w:tbl>, 10 rows, 70 cells', async () => {
    // Freeze first. The export route refuses an editable document with 409:
    // exporting one would present it as a 21 CFR Part 11 filing artifact, with
    // a signature manifest attributed to content that has no immutable snapshot
    // behind it. This suite predates that guard and used to export straight
    // from the editable state, so it began failing on a correct fail-closed
    // change rather than on anything about Word tables. Freezing is what a real
    // caller does before exporting, so the test now exercises the real path.
    const frozen = await request(app)
      .post(`/api/authoring/docs/${docId}/freeze`)
      .set('Authorization', auth)
      .send({ reason: 'dbtest: sealing the record so it can be exported' });
    expect(frozen.status, `freeze: ${JSON.stringify(frozen.body)}`).toBe(200);

    const res = await request(app)
      .post(`/api/authoring/docs/${docId}/export`)
      .set('Authorization', auth)
      .send({ format: 'docx' })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    const buf = res.body as Buffer;
    // "PK\x03\x04" — real ZIP bytes, not an error page wearing a docx type.
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');

    // The claim the gate exists to make. A flattened grid would pass every
    // check above and fail here.
    expect((xml.match(/<w:tbl>/g) || []).length, 'a real Word table').toBeGreaterThanOrEqual(1);
    expect((xml.match(/<w:tr[ >]/g) || []).length, 'header + 9 body rows').toBe(EXPECTED_ROWS);
    expect((xml.match(/<w:tc>/g) || []).length, '10 rows x 7 columns').toBe(EXPECTED_CELLS);

    // Content, not just structure — including the one non-ASCII cell, where a
    // broken encoding path shows up first.
    expect(xml).toContain('40°C / 75% RH');
    expect(xml).toContain('Total degradants');
    expect(xml).toContain('0.38');
    expect(xml).toContain('3.2.P.8.3');
  }, 60_000);
});
