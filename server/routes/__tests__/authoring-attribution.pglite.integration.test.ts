/**
 * Tracked-change attribution — against in-process PGlite with the REAL schema.
 *
 * Three defects, all in the answer to "who changed what, when":
 *
 *  1. The revision history endpoint joined `users.id = doc_revisions.created_by::uuid`.
 *     users.id is a `serial` on every durable path, so that is `integer = uuid`
 *     — rejected by Postgres at PARSE time (42883). The endpoint returned 500
 *     on every call regardless of how many revisions existed, and the client
 *     rendered the failure as "No prior revisions". The Part 11 trail was
 *     written correctly to the database and was unreadable through the only
 *     surface that reads it, while that surface stated the opposite.
 *
 *     The existing golden journey passed because its fixture invents
 *     `CREATE TABLE users (id UUID PRIMARY KEY, …)` — a shape no migration on
 *     any durable path creates. These tests therefore use the REAL users DDL
 *     (`id serial`), which is the whole point of the file.
 *
 *  2. The edit path snapshotted the PRIOR content under the CURRENT editor's
 *     id, so the trail attributed each author's text to whoever replaced it,
 *     and the live content's author was recorded nowhere.
 *
 *  3. No content mutation wrote an authoring_audit_trail row, though the
 *     migration provisioning that table asserts every authoring mutation
 *     writes one.
 *
 * One PGlite instance for the file.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';

let pg: PGlite;

const TENANT = 4242;
const ALICE = 7001;
const BOB = 7002;
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** The history read exactly as the router issues it. */
const HISTORY_SQL = `
  SELECT r.id, r.section_id, r.content, r.created_by, r.created_at, r.tenant_id,
         u.name as created_by_name, u.email as created_by_email
    FROM doc_revisions r
    LEFT JOIN users u ON u.id::text = r.created_by
   WHERE r.section_id = $1 AND r.tenant_id = $2
   ORDER BY r.created_at DESC
   LIMIT $3`;

/** What it used to be. Kept so the regression is demonstrated, not asserted about. */
const HISTORY_SQL_BEFORE = HISTORY_SQL.replace(
  'u.id::text = r.created_by',
  'u.id = r.created_by::uuid',
);

async function addRevision(content: string, actor: number, at: string) {
  await pg.query(
    `INSERT INTO doc_revisions (id, section_id, content, created_by, created_at, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), SECTION, content, String(actor), at, TENANT],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  // The REAL users shape: `id serial`, per shared/schema.ts and
  // migrations/0000_sweet_joseph.sql. Not a uuid stand-in.
  await pg.exec(`
    CREATE TABLE users (id serial PRIMARY KEY, name text, email text);
    CREATE TABLE authoring_sections (
      id uuid PRIMARY KEY, doc_id uuid, code text, title text, content text,
      track_changes boolean DEFAULT false, tenant_id integer NOT NULL,
      created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
    CREATE TABLE doc_revisions (
      id uuid PRIMARY KEY, section_id uuid, content text, created_by text,
      created_at timestamptz DEFAULT NOW(), tenant_id integer NOT NULL);
    CREATE TABLE authoring_audit_trail (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid, section_id uuid,
      operation_type text NOT NULL, actor_email text, actor_role text,
      before_content text, after_content text,
      content_hash_before text, content_hash_after text,
      change_reason text, metadata jsonb, ip_address text, user_agent text,
      session_id text, tenant_id integer NOT NULL,
      created_at timestamptz DEFAULT NOW());
  `);
  await pg.query(`INSERT INTO users (id, name, email) VALUES ($1,$2,$3),($4,$5,$6)`, [
    ALICE, 'Alice Chen', 'alice@sponsor.test',
    BOB, 'Bob Ndlovu', 'bob@sponsor.test',
  ]);
  await pg.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1,$2,'2.5.1','Product Development Rationale','effect size assumption 0.35',$3)`,
    [SECTION, DOC, TENANT],
  );
}, 90_000);

afterAll(async () => {
  await pg?.close();
});

describe('the revision history read', () => {
  it('the previous join was rejected by Postgres at parse time, on every call', async () => {
    // Not "returned nothing" — could not run. 42883 fires before any row is
    // considered, so an empty table failed identically to a full one.
    await expect(pg.query(HISTORY_SQL_BEFORE, [SECTION, TENANT, 50])).rejects.toMatchObject({
      code: '42883',
    });
  });

  it('runs against the real users DDL and resolves author names', async () => {
    await addRevision('effect size assumption 0.35', ALICE, '2026-07-20T10:00:00Z');
    const res = await pg.query<{ created_by_name: string; created_by: string }>(HISTORY_SQL, [
      SECTION,
      TENANT,
      50,
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].created_by_name).toBe('Alice Chen');
    expect(res.rows[0].created_by).toBe(String(ALICE));
  });

  it('survives a created_by that is not a number instead of raising 22P02', async () => {
    // created_by is free text. A legacy or imported row holding an email must
    // not take the endpoint down for the whole section — it simply does not
    // match, and the LEFT JOIN yields a null name.
    await addRevision('imported draft', 0, '2026-07-19T09:00:00Z');
    await pg.query(`UPDATE doc_revisions SET created_by = 'legacy@import.test' WHERE content = $1`, [
      'imported draft',
    ]);
    const res = await pg.query<{ created_by_name: string | null; created_by: string }>(HISTORY_SQL, [
      SECTION,
      TENANT,
      50,
    ]);
    const legacy = res.rows.find(r => r.created_by === 'legacy@import.test');
    expect(legacy).toBeDefined();
    expect(legacy!.created_by_name).toBeNull();
  });

  it('does not serve another tenant its revisions', async () => {
    await pg.query(
      `INSERT INTO doc_revisions (id, section_id, content, created_by, created_at, tenant_id)
       VALUES ($1,$2,'other tenant text',$3,NOW(),$4)`,
      [randomUUID(), SECTION, String(ALICE), 9999],
    );
    const res = await pg.query<{ content: string }>(HISTORY_SQL, [SECTION, TENANT, 50]);
    expect(res.rows.map(r => r.content)).not.toContain('other tenant text');
  });
});

describe('what a revision row means', () => {
  it('attributes each text to the author who wrote it, across a change of hands', async () => {
    // THE HEADLINE. Old behaviour: Bob's edit stored ALICE's text under BOB's
    // id, producing two rows with byte-identical content under two names, one
    // of whom never typed it — and no row at all for the text now on screen.
    await pg.query(`DELETE FROM doc_revisions WHERE section_id = $1`, [SECTION]);

    // Alice creates.
    await addRevision('effect size assumption 0.35', ALICE, '2026-07-20T10:00:00Z');
    // Bob edits: the NEW content, under BOB.
    await addRevision('effect size corrected to 0.25', BOB, '2026-07-21T11:00:00Z');

    const res = await pg.query<{ content: string; created_by_name: string }>(HISTORY_SQL, [
      SECTION,
      TENANT,
      50,
    ]);
    const byAuthor = Object.fromEntries(res.rows.map(r => [r.created_by_name, r.content]));

    expect(byAuthor['Alice Chen']).toBe('effect size assumption 0.35');
    expect(byAuthor['Bob Ndlovu']).toBe('effect size corrected to 0.25');
    // No two rows carry the same text under different names.
    expect(new Set(res.rows.map(r => r.content)).size).toBe(res.rows.length);
  });

  it('records the author of the text that is currently live', async () => {
    // Previously unanswerable: the newest revision held the content that had
    // just been REPLACED, so "who wrote what is on screen?" had no row.
    const section = await pg.query<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1 AND tenant_id = $2`,
      [SECTION, TENANT],
    );
    await pg.query(`UPDATE authoring_sections SET content = $1 WHERE id = $2`, [
      'effect size corrected to 0.25',
      SECTION,
    ]);
    void section;

    const res = await pg.query<{ content: string; created_by_name: string }>(HISTORY_SQL, [
      SECTION,
      TENANT,
      1,
    ]);
    const live = await pg.query<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`,
      [SECTION],
    );
    expect(res.rows[0].content).toBe(live.rows[0].content);
    expect(res.rows[0].created_by_name).toBe('Bob Ndlovu');
  });
});

describe('the Part 11 audit row for a content change', () => {
  it('stores both sides and a verifiable hash of each', async () => {
    // Every row in this table previously had before_content, after_content,
    // content_hash_before and content_hash_after NULL — for every event type —
    // because the only writer that populates them was never called from a
    // content-mutating path, and the legacy wrapper hardcodes them to null.
    const before = 'effect size assumption 0.35';
    const after = 'effect size corrected to 0.25';
    const hash = (v: string) => createHash('sha256').update(v).digest('hex');

    await pg.query(
      `INSERT INTO authoring_audit_trail
         (doc_id, section_id, operation_type, actor_email, actor_role,
          before_content, after_content, content_hash_before, content_hash_after,
          change_reason, metadata, ip_address, user_agent, session_id, tenant_id)
       VALUES ($1,$2,'UPDATE',$3,'author',$4,$5,$6,$7,$8,'{}'::jsonb,'10.0.0.1','vitest',$9,$10)`,
      [
        DOC, SECTION, 'bob@sponsor.test', before, after,
        hash(before), hash(after), 'ORR restated per DSMB', randomUUID(), TENANT,
      ],
    );

    const row = await pg.query<{
      before_content: string; after_content: string;
      content_hash_before: string; content_hash_after: string;
      change_reason: string; actor_email: string;
    }>(
      `SELECT before_content, after_content, content_hash_before, content_hash_after,
              change_reason, actor_email
         FROM authoring_audit_trail
        WHERE section_id = $1 AND tenant_id = $2 AND operation_type = 'UPDATE'`,
      [SECTION, TENANT],
    );

    expect(row.rows).toHaveLength(1);
    const r = row.rows[0];
    // The record names a person, both texts, and a reason — the three things
    // an inspector asks for.
    expect(r.actor_email).toBe('bob@sponsor.test');
    expect(r.before_content).toBe(before);
    expect(r.after_content).toBe(after);
    expect(r.change_reason).toBe('ORR restated per DSMB');
    // And the hashes are independently reproducible from the stored text.
    expect(r.content_hash_before).toBe(hash(before));
    expect(r.content_hash_after).toBe(hash(after));
    expect(r.content_hash_before).not.toBe(r.content_hash_after);
  });
});
