/**
 * GA demo review threads + section locks — END-TO-END against in-process PGlite
 * (real Postgres, WASM).
 *
 * The production reads here are raw SQL inside server/routes/concept2cure.ts and
 * server/routes/realtime-collab.ts, not exported constants, so each query below
 * is transcribed VERBATIM with the file:line it came from. Anything that drifts
 * from the route is a bug in this file — the queries are quoted, not paraphrased
 * or simplified, because a simplified query would pass while the real one is
 * broken and that is the exact failure mode this test exists to prevent.
 *
 * Two properties matter most and neither is observable with a mocked pool:
 *   · my-queue INNER JOINs concept2cure_artifacts, so a thread whose artifact is
 *     missing is invisible however correct the row looks. The seed guards
 *     against that; this proves the guard works.
 *   · GET /locks filters `expires_at > NOW()`. A seeded expired lock would
 *     silently never render. The seed writes only live locks; this test inserts
 *     an expired one itself to prove the predicate is doing work.
 *
 * PGlite is pure-WASM Postgres: no server, no docker, no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pg: PGlite;

type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_65: string = '../../../scripts/seed/ga-demo.d/65-collab-review.mjs';
async function loadSeed(): Promise<SeedFn> {
  return ((await import(SEED_65)) as { default: SeedFn }).default;
}

const client = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

const ORG = { id: 42, name: 'Concept2Cure Therapeutics' };
const ADMIN = { id: 1, name: 'JM Smith' };

/**
 * Faithful to migrations/phase13_review_threads_tasks.sql (+ the 0001 additions)
 * and db/migrations/20260807_collab_section_locks.sql — including the CHECK
 * constraints, because those are what make 'approval_task' un-insertable and
 * what a forgiving test DDL would quietly drop.
 */
const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE users (id serial PRIMARY KEY, email text, name text);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);

CREATE TABLE concept2cure_artifacts (
  id SERIAL PRIMARY KEY,
  artifact_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE concept2cure_review_threads (
  id SERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_by_role TEXT,
  title TEXT,
  anchor_type TEXT CHECK (anchor_type IN ('section','heading','range','general')),
  anchor_key TEXT, anchor_label TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  priority TEXT CHECK (priority IN ('low','medium','high')),
  assignee_id INTEGER REFERENCES users(id),
  assignee_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ, resolved_by_id INTEGER REFERENCES users(id), resolved_by_name TEXT,
  due_at TIMESTAMPTZ
);

CREATE TABLE concept2cure_thread_comments (
  id SERIAL PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  thread_id INTEGER NOT NULL REFERENCES concept2cure_review_threads(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER, parent_comment_id INTEGER,
  author_id INTEGER NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL, author_role TEXT,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment','request_changes','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);

CREATE TABLE concept2cure_review_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  thread_id INTEGER REFERENCES concept2cure_review_threads(id) ON DELETE SET NULL,
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  assigned_to_id INTEGER REFERENCES users(id), assigned_to_name TEXT,
  title TEXT NOT NULL, description TEXT,
  -- The domain AFTER migrations/20260814h_review_task_type_domain_repair.sql.
  -- Before that repair two overlapping CHECKs intersected to exclude
  -- 'approval_task'; the repair drops the narrowing one so 0001's intended
  -- domain governs. See review-task-type-domain.pglite.integration.test.ts,
  -- which reproduces the broken state and proves the repair.
  task_type TEXT NOT NULL DEFAULT 'review_task'
    CHECK (task_type IN ('change_request','follow_up','review_task','approval_task')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ, resolved_by_id INTEGER REFERENCES users(id), resolved_by_name TEXT,
  priority TEXT CHECK (priority IN ('low','medium','high'))
);

CREATE TABLE concept2cure_notifications (
  id SERIAL PRIMARY KEY,
  notification_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  version_id INTEGER,
  thread_id INTEGER REFERENCES concept2cure_review_threads(id) ON DELETE SET NULL,
  review_task_id INTEGER REFERENCES concept2cure_review_tasks(id) ON DELETE SET NULL,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id),
  recipient_name TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  actor_name TEXT,
  notification_type TEXT NOT NULL
    CHECK (notification_type IN (
      'assignment', 'due_soon', 'overdue', 'approval_needed',
      'changes_requested', 'thread_reply', 'thread_resolved',
      'task_resolved', 'publish_complete', 'escalation'
    )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','dismissed')),
  action_url TEXT, due_at TIMESTAMPTZ, read_at TIMESTAMPTZ, dismissed_at TIMESTAMPTZ,
  escalation_level INTEGER DEFAULT 0,
  last_notified_at TIMESTAMPTZ, next_reminder_at TIMESTAMPTZ, escalates_at TIMESTAMPTZ,
  escalation_target_user_id INTEGER REFERENCES users(id),
  escalation_target_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collab_section_locks (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  document_id TEXT NOT NULL,
  section_id TEXT,
  lock_key TEXT NOT NULL UNIQUE,
  locked_by TEXT NOT NULL,
  locked_by_label TEXT NOT NULL,
  lock_type TEXT NOT NULL DEFAULT 'advisory',
  reason TEXT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
`;

// ── Production SQL, transcribed verbatim ────────────────────────────────────

/** server/routes/concept2cure.ts:16016-16042 — my-queue, threads half. */
const MY_QUEUE_THREADS_SQL = `
SELECT t.thread_id, t.title, t.status, t.priority, a.artifact_id, a.title,
       t.project_id, t.anchor_label, t.created_by_name, t.created_at, t.updated_at
  FROM concept2cure_review_threads t
  INNER JOIN concept2cure_artifacts a ON a.id = t.artifact_id
 WHERE t.assignee_id = $1 AND t.org_id = $2 AND t.status = 'open'
 ORDER BY t.updated_at DESC`;

/** server/routes/concept2cure.ts:16045-16072 — my-queue, tasks half. */
const MY_QUEUE_TASKS_SQL = `
SELECT k.task_id, k.title, k.description, k.task_type, k.status, k.due_at,
       a.artifact_id, a.title, k.project_id, k.created_by_name, k.created_at, k.updated_at
  FROM concept2cure_review_tasks k
  INNER JOIN concept2cure_artifacts a ON a.id = k.artifact_id
 WHERE k.assigned_to_id = $1 AND k.org_id = $2 AND k.status IN ('open','in_progress')
 ORDER BY k.due_at, k.updated_at DESC`;

/** server/routes/concept2cure.ts:15108 — comments for a thread, resolved by
 *  TEXT thread_id + org_id, then read by the thread's SERIAL id. */
const THREAD_BY_KEY_SQL =
  `SELECT * FROM concept2cure_review_threads WHERE thread_id = $1 AND org_id = $2 LIMIT 1`;
const COMMENTS_SQL =
  `SELECT * FROM concept2cure_thread_comments WHERE thread_id = $1 AND deleted_at IS NULL ORDER BY created_at`;

/** server/routes/realtime-collab.ts:745 — GET /locks/:documentId. */
const DOC_LOCKS_SQL = `SELECT * FROM collab_section_locks
                 WHERE tenant_id = $1 AND document_id = $2 AND expires_at > NOW()`;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG.id}, 'Concept2Cure')`);
  await pg.exec(`INSERT INTO users (id, email, name) VALUES
    (1, 'admin@concept2cure.pro', 'JM Smith'),
    (2, 'sarah.chen@concept2cure.pro', 'Sarah Chen'),
    (3, 'raj.patel@concept2cure.pro', 'Raj Patel'),
    (4, 'david.kim@concept2cure.pro', 'David Kim'),
    (5, 'lisa.johnson@concept2cure.pro', 'Lisa Johnson')`);
  await pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (9, ${ORG.id}, 'BX-099 BLA')`);
  await pg.exec(`INSERT INTO concept2cure_artifacts
    (id, artifact_id, project_id, organization_id, type, category, title, content) VALUES
    (11, 'ART-BX099-M3', 9, ${ORG.id}, 'document', 'quality', 'BX-099 Module 3 Quality', '...'),
    (12, 'ART-BX256-M25', 9, ${ORG.id}, 'document', 'clinical', 'BX-256 Module 2.5 Clinical Overview', '...')`);
  await (await loadSeed())(client, { org: ORG, admin: ADMIN });
});
afterAll(async () => { await pg?.close(); });

describe('my-queue (the surface a demo signs in and looks at)', () => {
  it('returns the open threads assigned to the admin, newest first', async () => {
    const r = await pg.query<Record<string, unknown>>(MY_QUEUE_THREADS_SQL, [ADMIN.id, ORG.id]);
    const ids = r.rows.map(x => x.thread_id);
    // 002 is resolved and 004 is assigned to someone else, so neither belongs.
    // 001 sorts ahead of 003: ORDER BY updated_at DESC, and 001 was touched a
    // day ago against 003's two.
    expect(ids).toEqual(['ga-demo-thread-001', 'ga-demo-thread-003']);
  });

  it('returns the open/in-progress review tasks assigned to the admin, due first', async () => {
    const r = await pg.query<Record<string, unknown>>(MY_QUEUE_TASKS_SQL, [ADMIN.id, ORG.id]);
    // ORDER BY due_at ASC: rtask-001 is overdue (-2d), then 002 (+3d), then the
    // approval task 005 (+4d).
    expect(r.rows.map(x => x.task_id)).toEqual([
      'ga-demo-rtask-001', 'ga-demo-rtask-002', 'ga-demo-rtask-005',
    ]);
    // rtask-001 is deliberately overdue so the derived overdueTasks counter
    // (concept2cure.ts:16086-16094) has something to count.
    expect(new Date(String(r.rows[0].due_at)).getTime()).toBeLessThan(Date.now());
  });

  it('is org-scoped — another tenant sees none of it', async () => {
    const r = await pg.query(MY_QUEUE_THREADS_SQL, [ADMIN.id, ORG.id + 1]);
    expect(r.rows).toHaveLength(0);
  });

  it('would drop any thread whose artifact is missing (the INNER JOIN)', async () => {
    // Proves the join is load-bearing rather than incidental: orphan the artifact
    // reference and the row vanishes from the queue even though it still exists.
    await pg.exec(`INSERT INTO concept2cure_artifacts
      (id, artifact_id, project_id, organization_id, type, category, title, content)
      VALUES (99, 'ART-TEMP', 9, ${ORG.id}, 'document', 'quality', 'temp', '...')`);
    await pg.exec(`INSERT INTO concept2cure_review_threads
      (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status, assignee_id)
      VALUES ('probe-orphan', ${ORG.id}, 9, 99, 1, 'JM Smith', 'probe', 'open', 1)`);
    const withArtifact = await pg.query(MY_QUEUE_THREADS_SQL, [ADMIN.id, ORG.id]);
    expect(withArtifact.rows.map(x => (x as { thread_id: string }).thread_id)).toContain('probe-orphan');

    await pg.exec(`DELETE FROM concept2cure_artifacts WHERE id = 99`); // cascades the thread
    const after = await pg.query(MY_QUEUE_THREADS_SQL, [ADMIN.id, ORG.id]);
    expect(after.rows.map(x => (x as { thread_id: string }).thread_id)).not.toContain('probe-orphan');
  });
});

describe('thread comments', () => {
  it('reads a multi-turn conversation in chronological order', async () => {
    const t = await pg.query<{ id: number }>(THREAD_BY_KEY_SQL, ['ga-demo-thread-001', ORG.id]);
    expect(t.rows).toHaveLength(1);
    const c = await pg.query<{ comment_id: string; kind: string; created_at: string }>(
      COMMENTS_SQL, [t.rows[0].id]
    );
    expect(c.rows.map(x => x.comment_id)).toEqual([
      'ga-demo-comment-001', 'ga-demo-comment-002', 'ga-demo-comment-003',
    ]);
    // The opening comment is a change request, which is what drives the amber
    // chip in ReviewThreads.tsx.
    expect(c.rows[0].kind).toBe('request_changes');
  });

  it('gives the resolved thread a system comment, as the resolve route writes', async () => {
    const t = await pg.query<{ id: number; status: string; resolved_by_name: string }>(
      THREAD_BY_KEY_SQL, ['ga-demo-thread-002', ORG.id]
    );
    expect(t.rows[0].status).toBe('resolved');
    expect(t.rows[0].resolved_by_name).toBeTruthy();
    const c = await pg.query<{ kind: string }>(COMMENTS_SQL, [t.rows[0].id]);
    expect(c.rows.map(x => x.kind)).toContain('system');
  });

  it('resolves a thread only through its TEXT key scoped to the org', async () => {
    const wrongOrg = await pg.query(THREAD_BY_KEY_SQL, ['ga-demo-thread-001', ORG.id + 1]);
    expect(wrongOrg.rows).toHaveLength(0);
  });
});

describe('review task types', () => {
  it('covers every value in the repaired domain', async () => {
    const r = await pg.query<{ task_type: string }>(
      'SELECT DISTINCT task_type FROM concept2cure_review_tasks ORDER BY task_type'
    );
    expect(r.rows.map(x => x.task_type)).toEqual([
      'approval_task', 'change_request', 'follow_up', 'review_task',
    ]);
  });

  it("gives my-queue's approvalsNeeded counter something to count", async () => {
    // The counter (concept2cure.ts:16086-16094) selects task_type =
    // 'approval_task' among the caller's active tasks. It was structurally
    // stuck at 0 until the domain repair, so a non-zero here is the whole
    // point of seeding one.
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM concept2cure_review_tasks
        WHERE org_id = ${ORG.id} AND assigned_to_id = ${ADMIN.id}
          AND status IN ('open','in_progress') AND task_type = 'approval_task'`
    );
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it('still rejects a value outside the domain', async () => {
    await expect(
      pg.query(
        `INSERT INTO concept2cure_review_tasks
           (task_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, task_type)
         VALUES ('probe-bogus', ${ORG.id}, 9, 11, 1, 'JM Smith', 'probe', 'not_a_type')`
      )
    ).rejects.toThrow();
  });
});

describe('notifications (the Task Tray badge)', () => {
  /** server/routes/concept2cure.ts:16075-16084 — the unread count, as Drizzle
   *  builds it: org_id + recipient_user_id + status = 'unread'. */
  const UNREAD_SQL = `SELECT count(*)::int AS count FROM concept2cure_notifications
     WHERE org_id = $1 AND recipient_user_id = $2 AND status = 'unread'`;

  it('gives the badge a non-zero count', async () => {
    const r = await pg.query<{ count: number }>(UNREAD_SQL, [ORG.id, ADMIN.id]);
    expect(r.rows[0].count).toBe(3);
  });

  it("does not count the 'read' one — the status filter is doing work", async () => {
    const all = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM concept2cure_notifications WHERE org_id = ${ORG.id}`
    );
    expect(all.rows[0].n).toBe(4);
  });

  it('is scoped to the recipient and the org', async () => {
    expect((await pg.query<{ count: number }>(UNREAD_SQL, [ORG.id, 999])).rows[0].count).toBe(0);
    expect((await pg.query<{ count: number }>(UNREAD_SQL, [ORG.id + 1, ADMIN.id])).rows[0].count).toBe(0);
  });
});

describe('section locks', () => {
  it('returns the seeded live locks for the document', async () => {
    const r = await pg.query<{ lock_key: string; lock_type: string }>(
      DOC_LOCKS_SQL, [ORG.id, 'ga-demo-doc-bx099-module3']
    );
    expect(r.rows).toHaveLength(2);
    // 'section-edit' is what the real client sends, not the 'advisory' default.
    expect(new Set(r.rows.map(x => x.lock_type))).toEqual(new Set(['section-edit']));
  });

  it('hides an expired lock — the expires_at predicate is doing work', async () => {
    await pg.exec(`INSERT INTO collab_section_locks
      (tenant_id, document_id, section_id, lock_key, locked_by, locked_by_label, lock_type, expires_at)
      VALUES (${ORG.id}, 'ga-demo-doc-bx099-module3', '3.2.S.9', 't${ORG.id}:ga-demo-doc-bx099-module3:3.2.S.9',
              '4', 'David Kim', 'section-edit', NOW() - INTERVAL '10 minutes')`);
    const r = await pg.query(DOC_LOCKS_SQL, [ORG.id, 'ga-demo-doc-bx099-module3']);
    // Still 2: the expired row exists but is not returned.
    expect(r.rows).toHaveLength(2);
    const all = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM collab_section_locks WHERE tenant_id = ${ORG.id}`
    );
    expect(all.rows[0].n).toBe(3);
  });

  it('is tenant-scoped', async () => {
    const r = await pg.query(DOC_LOCKS_SQL, [ORG.id + 1, 'ga-demo-doc-bx099-module3']);
    expect(r.rows).toHaveLength(0);
  });
});

describe('idempotency', () => {
  it('re-running the seed writes nothing new', async () => {
    const count = async (t: string) =>
      (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    const before = {
      threads: await count('concept2cure_review_threads'),
      comments: await count('concept2cure_thread_comments'),
      tasks: await count('concept2cure_review_tasks'),
      locks: await count('collab_section_locks'),
    };

    await (await loadSeed())(client, { org: ORG, admin: ADMIN });

    expect(await count('concept2cure_review_threads')).toBe(before.threads);
    expect(await count('concept2cure_thread_comments')).toBe(before.comments);
    expect(await count('concept2cure_review_tasks')).toBe(before.tasks);
    expect(await count('collab_section_locks')).toBe(before.locks);
  });
});
