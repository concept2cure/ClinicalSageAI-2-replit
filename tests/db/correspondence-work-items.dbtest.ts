/**
 * An agency letter's issues all become work items — and so do the next letter's.
 *
 * Launch row D2. `POST /api/regulatory-correspondence/correspondence/intake`
 * (Projects → program-journey's API scope; AnA's `correspondence.ingest`) parses
 * a letter into issues and, for each one, writes a work item to
 * `c2c_project_work_items` through `createCanonicalTasksForIssue`
 * (server/services/regulatory-correspondence/operating-layer.ts).
 *
 * Every correspondence work item carries `source_id 0` — the issue id is a
 * string and rides in `source_ref`, which migrations/20260730_work_item_source_ref.sql
 * added for exactly this. Eleven days later
 * db/migrations/20260810_c2c_work_items_source_uniqueness.sql made
 * `(org_id, source_type, source_id)` UNIQUE without `source_ref`, which put
 * every correspondence item in an organisation back on ONE key. So the second
 * issue — in the same letter or any later one — raised 23505, and the intake
 * answered 500 after the letter, its first issue and that issue's work item had
 * been written. A deficiency letter nearly always raises more than one issue.
 *
 * ── Posture: production's ──────────────────────────────────────────────────
 *   - The REAL router with its own authMiddleware, which establishes the tenant
 *     scope as it does in production; the token is signed with the secret the
 *     verifier resolves.
 *   - server/db connects as a NON-SUPERUSER, NOBYPASSRLS runtime role minted by
 *     the real scripts/db/provision-app-role.mjs, with RLS_ENFORCE=on.
 *   - The schema is whatever the database was provisioned with; the fix is an
 *     in-place amendment of the creating migration, so a database migrated with
 *     the fix carries the widened key and one migrated without it does not.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbcwi": organisation 91860, emails `dbcwi-…`. Only those rows go.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';

const TAG = 'dbcwi';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const ORG = 91860;
const BASE = '/api/regulatory-correspondence';
const RUNTIME_PASSWORD = 'dbcwi-correspondence-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbcwi_rt_${RUN}` });

/** Raises four categories under the governed heuristic parser (see its own suite). */
const MULTI_ISSUE_LETTER =
  'Refuse to file due to missing stability data and adverse event reporting gaps in eCTD format';
const SECOND_LETTER = 'Deficiency: missing CMC stability data for the drug product';

let owner: Pool;
let app: express.Express;
let serverPool: { end: () => Promise<void> } | null = null;
let userId: number;
let token: string;
let projectId: number;
let submissionId: string;

async function cleanup() {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    // audit_logs is append-only; the probe's own rows are removed with the
    // DELETE trigger off for this transaction only (see c2c-project-persistence).
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id = $1`, [ORG]).catch(() => {});
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  // Everything the intake writes, children first. The timeline and the project
  // memory rows are the intake's own narrative (addTimelineEventDB).
  for (const sql of [
    `DELETE FROM c2c_project_work_items WHERE org_id = $1`,
    `DELETE FROM c2c_blockers WHERE org_id = $1`,
    `DELETE FROM c2c_correspondence_issues WHERE correspondence_id IN (SELECT id FROM c2c_correspondence WHERE organization_id = $1)`,
    `DELETE FROM c2c_communication_timeline_events WHERE organization_id = $1`,
    `DELETE FROM project_memory_entries WHERE organization_id = $1`,
    `DELETE FROM project_intelligence_profiles WHERE organization_id = $1`,
    `DELETE FROM c2c_correspondence WHERE organization_id = $1`,
    `DELETE FROM c2c_submissions WHERE organization_id = $1`,
    `DELETE FROM projects WHERE organization_id = $1`,
    `DELETE FROM client_workspaces WHERE organization_id = $1`,
    `DELETE FROM organization_users WHERE organization_id = $1`,
  ]) {
    await owner.query(sql, [ORG]);
  }
  await owner.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
  await owner.query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
}

const workItems = async () =>
  (
    await owner.query(
      `SELECT source_type, source_id, source_ref, title FROM c2c_project_work_items
        WHERE org_id = $1 AND source_type = 'correspondence' ORDER BY id`,
      [ORG],
    )
  ).rows as Array<{ source_type: string; source_id: number; source_ref: string | null; title: string }>;

const intake = (subject: string, parsedText: string) =>
  request(app)
    .post(`${BASE}/correspondence/intake`)
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId, submissionId, subject, parsedText, communicationType: 'deficiency_letter' });

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();

  for (let attempt = 1; ; attempt++) {
    try {
      const p = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (p.skipped) throw new Error('[dbcwi] provisionAppServiceRole skipped');
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';

  await owner.query(`INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $3, 'active')`, [
    ORG, `${TAG} sponsor`, `${TAG}-sponsor-${RUN}`,
  ]);
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, $2, 'not-a-real-password', $3) RETURNING id`,
    [`${TAG}-ra-${RUN}@example.invalid`, `${TAG} regulatory lead`, ORG],
  );
  userId = Number(u.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, userId]);
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
    [ORG, `${TAG} workspace`, `${TAG}-ws-${RUN}`],
  );
  const p = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type) VALUES ($1, $2, $3, 'nda') RETURNING id`,
    [ORG, ws.rows[0].id, `${TAG} NDA program`],
  );
  projectId = Number(p.rows[0].id);
  const s = await owner.query(
    `INSERT INTO c2c_submissions (organization_id, project_id, submission_type, regulator, lifecycle_state)
     VALUES ($1, $2, 'NDA', 'FDA', 'under_review') RETURNING id`,
    [ORG, projectId],
  );
  submissionId = String(s.rows[0].id);

  const router = (await import('../../server/routes/regulatory-correspondence')).default;
  const db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };

  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign(
    { type: 'access', userId, organizationId: String(ORG), role: 'admin', email: `${TAG}-ra-${RUN}@example.invalid`, name: `${TAG} regulatory lead` },
    activeJwtSecret(),
    { expiresIn: '15m' },
  );
  const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
  invalidateOrgMembershipCache();

  app = express();
  app.use(express.json());
  app.use(BASE, router);
}, 180_000);

afterAll(async () => {
  if (serverPool) await serverPool.end().catch(() => {});
  if (owner) {
    await owner.query(`GRANT INSERT ON c2c_correspondence_issues TO ${runtimeRole}`).catch(() => {});
    await owner.query(`GRANT INSERT ON c2c_project_work_items TO ${runtimeRole}`).catch(() => {});
    await cleanup().catch((e) => console.warn('[dbcwi] cleanup left rows:', e?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        const m = (err as Error).message;
        if (/does not exist/.test(m)) break;
        if (attempt >= 5 || !/tuple concurrently updated/.test(m)) break;
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

describe('an agency letter becomes one work item per issue', () => {
  it('a letter raising several issues is recorded whole: 201, one work item for each', async () => {
    const res = await intake('Refuse-to-file letter', MULTI_ISSUE_LETTER);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const issueIds = (res.body.issues as Array<{ id: string }>).map((i) => i.id);
    expect(issueIds.length).toBeGreaterThanOrEqual(2);

    const rows = await workItems();
    expect(rows.map((r) => r.source_ref).sort()).toEqual([...issueIds].sort());
  });

  it("the organisation's next letter is recorded too", async () => {
    const before = (await workItems()).length;
    const res = await intake('Deficiency letter', SECOND_LETTER);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const issueIds = (res.body.issues as Array<{ id: string }>).map((i) => i.id);
    expect(issueIds.length).toBeGreaterThanOrEqual(1);

    const rows = await workItems();
    expect(rows.length).toBe(before + issueIds.length);
    for (const id of issueIds) expect(rows.map((r) => r.source_ref)).toContain(id);
  });
});

describe('the key still deduplicates what it was added to deduplicate', () => {
  it('two work items for the same integer-keyed source in one organisation are refused', async () => {
    // upsertProjectWorkItem's sources (review threads, tasks, blockers) are keyed
    // by an integer source_id and carry no source_ref. Widening the key must not
    // let two of those through: NULL source_ref is one value here, not many.
    const insert = (wi: string) =>
      owner.query(
        `INSERT INTO c2c_project_work_items (work_item_id, org_id, project_id, source_type, source_id, title, status)
         VALUES ($1, $2, $3, 'review_task', 424242, 'dbcwi integer-keyed', 'open')`,
        [wi, ORG, projectId],
      );
    await insert(`${TAG}-int-a-${RUN}`);
    await expect(insert(`${TAG}-int-b-${RUN}`)).rejects.toMatchObject({ code: '23505' });
  });

  it('the same correspondence issue cannot be written twice', async () => {
    const [first] = await workItems();
    await expect(
      owner.query(
        `INSERT INTO c2c_project_work_items (work_item_id, org_id, project_id, source_type, source_id, source_ref, title, status)
         VALUES ($1, $2, $3, 'correspondence', 0, $4, 'dbcwi duplicate', 'open')`,
        [`${TAG}-dup-${RUN}`, ORG, projectId, first.source_ref],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('an intake that cannot be stored whole leaves nothing behind', () => {
  it('a failure on a later issue rolls back the letter and every earlier write', async () => {
    // The intake writes the letter, then for each issue its row, any blocker and
    // its work item, then the timeline event. Until 2026-09-30 each was its own
    // statement: a failure on issue 2 left the letter holding issue 1 alone, and
    // the user's retry recorded the letter a second time.
    const subject = `${TAG} partial-write probe ${RUN}`;
    await owner.query(`REVOKE INSERT ON c2c_project_work_items FROM ${runtimeRole}`);
    try {
      const res = await intake(subject, MULTI_ISSUE_LETTER);
      expect(res.status).toBe(500);
    } finally {
      await owner.query(`GRANT INSERT ON c2c_project_work_items TO ${runtimeRole}`);
    }
    const left = await owner.query(
      `SELECT
         (SELECT count(*) FROM c2c_correspondence WHERE organization_id = $1 AND subject = $2)::int AS letters,
         (SELECT count(*) FROM c2c_correspondence_issues i JOIN c2c_correspondence c ON c.id = i.correspondence_id
           WHERE c.organization_id = $1 AND c.subject = $2)::int AS issues,
         (SELECT count(*) FROM c2c_communication_timeline_events WHERE organization_id = $1 AND summary = $2)::int AS events`,
      [ORG, subject],
    );
    expect(left.rows[0]).toEqual({ letters: 0, issues: 0, events: 0 });
  });

  it('the same letter, sent again once the store is writable, is recorded once and whole', async () => {
    const subject = `${TAG} partial-write probe ${RUN}`;
    const res = await intake(subject, MULTI_ISSUE_LETTER);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const letters = await owner.query(
      `SELECT id FROM c2c_correspondence WHERE organization_id = $1 AND subject = $2`,
      [ORG, subject],
    );
    expect(letters.rows).toHaveLength(1);
    const issues = await owner.query(
      `SELECT count(*)::int AS n FROM c2c_correspondence_issues WHERE correspondence_id = $1`,
      [letters.rows[0].id],
    );
    expect(issues.rows[0].n).toBe((res.body.issues as unknown[]).length);
  });
});

describe('a failed intake says so without shipping the database error', () => {
  it('answers 500 with no PostgreSQL text in the body', async () => {
    await owner.query(`REVOKE INSERT ON c2c_correspondence_issues FROM ${runtimeRole}`);
    try {
      const res = await intake('Letter that cannot be stored', SECOND_LETTER);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/permission denied|c2c_correspondence_issues|duplicate key|constraint/i);
    } finally {
      await owner.query(`GRANT INSERT ON c2c_correspondence_issues TO ${runtimeRole}`);
    }
  });
});
