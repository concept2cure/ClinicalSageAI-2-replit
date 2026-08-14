/**
 * 65-collab-review.mjs — GA demo seed: review threads, thread comments,
 * review tasks, and durable section locks.
 *
 * NUMBERING: this is '65-' and not '24-' on purpose. Every review row FKs to
 * concept2cure_artifacts(id) and projects(id), and the module that seeds those
 * is 60-mdx-aggregates.mjs. The loader sorts the directory lexicographically,
 * so '65-' runs after '60-' and the FK targets exist. Placing it in the 20s
 * would have made it a permanent no-op on a fresh database.
 *
 * Surfaces fed by this module:
 *   1. GET /api/concept2cure/reviews/my-queue (server/routes/concept2cure.ts:16010)
 *      → threads INNER JOIN concept2cure_artifacts ON a.id = t.artifact_id
 *        WHERE t.assignee_id = $user AND t.org_id = $org AND t.status = 'open'
 *        ORDER BY t.updated_at DESC
 *      → tasks  INNER JOIN artifacts, assigned_to_id = $user, org_id = $org,
 *        status IN ('open','in_progress') ORDER BY due_at, updated_at DESC
 *      Renders in client/src/concept2cure/v2/surfaces/ReviewThreads.tsx:83 and
 *      the top-bar tray client/src/concept2cure/v2/TaskTray.tsx:99.
 *      Because it INNER JOINs artifacts, a thread whose artifact is missing is
 *      invisible — which is why this module resolves a real artifact first and
 *      skips cleanly rather than writing orphans.
 *   2. GET /api/concept2cure/review-threads/:threadId/comments (:15108)
 *      → resolves the thread by TEXT thread_id + org_id, then selects comments
 *        by the thread's SERIAL id WHERE deleted_at IS NULL ORDER BY created_at.
 *   3. GET /api/realtime-collab/locks/:documentId (server/routes/realtime-collab.ts:745)
 *      → SELECT * FROM collab_section_locks
 *          WHERE tenant_id = $1 AND document_id = $2 AND expires_at > NOW()
 *      Renders in client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:76.
 *
 * DDL sources: migrations/phase13_review_threads_tasks.sql (the three
 * concept2cure_review_* tables) with migrations/0001_phase13_full.sql adding
 * threads.due_at and tasks.priority; db/migrations/20260807_collab_section_locks.sql.
 *
 * TWO TRAPS THIS MODULE OBSERVES, both found by reading the DDL rather than
 * the ORM model:
 *   · review_tasks.task_type carries TWO overlapping CHECK constraints. The
 *     phase13 inline one allows only change_request | follow_up | review_task;
 *     0001 adds a second that also lists approval_task. Both apply, so
 *     'approval_task' is NOT insertable and is never used here.
 *   · Locks are seeded LIVE only. GET /locks filters `expires_at > NOW()`, and
 *     the same handler fires an opportunistic reaper that DELETEs anything more
 *     than an hour past expiry (realtime-collab.ts:752). A seeded "historical"
 *     lock would be invisible and then silently vacuumed. The expiry predicate
 *     is proven in the test instead, where an expired row can be observed.
 *
 * Conventions: runs inside the caller's open transaction (no BEGIN/COMMIT),
 * every table guarded via to_regclass, idempotent (ON CONFLICT on the real
 * single-column unique keys thread_id / comment_id / task_id / lock_key),
 * all rows org-scoped on the column the production read filters on (org_id for
 * the review tables, tenant_id for the locks).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);
const minutesFromNow = (n) => new Date(Date.now() + n * MIN_MS);

async function tableExists(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return Boolean(r.rows[0]?.t);
}

export default async function seed(client, { org, admin }) {
  const TEAM_EMAILS = {
    sarah: 'sarah.chen@concept2cure.pro',
    raj: 'raj.patel@concept2cure.pro',
    david: 'david.kim@concept2cure.pro',
    lisa: 'lisa.johnson@concept2cure.pro',
  };
  const NAMES = {
    sarah: 'Sarah Chen',
    raj: 'Raj Patel',
    david: 'David Kim',
    lisa: 'Lisa Johnson',
  };
  const ROLES = {
    sarah: 'regulatory_lead',
    raj: 'biostatistician',
    david: 'quality',
    lisa: 'cmc_lead',
  };
  const usersRes = await client.query(
    `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
    [Object.values(TEAM_EMAILS)],
  );
  const idByEmail = new Map(usersRes.rows.map((r) => [r.email, r.id]));
  const adminName = admin.name || 'JM Smith';
  const person = (key) => {
    const id = idByEmail.get(TEAM_EMAILS[key]);
    return id
      ? { id, name: NAMES[key], role: ROLES[key] }
      : { id: admin.id, name: adminName, role: 'admin' };
  };
  const ADMIN = { id: admin.id, name: adminName, role: 'admin' };

  // ════════════════════════════════════════════════════════════════════════
  // Part 1 — review threads, comments and tasks
  // ════════════════════════════════════════════════════════════════════════
  let threadCount = 0;
  let commentCount = 0;
  let taskCount = 0;
  // Hoisted: Part 2 needs the thread serial ids and the anchor artifact/project
  // that Part 1 resolves. Empty when the review tables are absent, which is
  // exactly the condition under which Part 2 must not write anything either.
  const threadKeyToSerial = new Map();
  let primaryArtifactId = null;
  let primaryProjectId = null;

  const haveThreads = await tableExists(client, 'concept2cure_review_threads');
  const haveArtifacts = await tableExists(client, 'concept2cure_artifacts');

  if (!haveThreads || !haveArtifacts) {
    console.log('   ⚠ collab-review: review-thread tables not found — skipping threads');
  } else {
    // The my-queue read INNER JOINs artifacts, so a thread is only ever visible
    // when its artifact_id points at a real row. Take the org's own artifacts;
    // if 60-mdx-aggregates.mjs has not run, there is nothing to hang a review on
    // and we say so rather than writing invisible rows.
    const artRes = await client.query(
      `SELECT id, artifact_id, project_id, title
         FROM concept2cure_artifacts
        WHERE organization_id = $1
        ORDER BY id
        LIMIT 2`,
      [org.id],
    );
    if (artRes.rows.length === 0) {
      console.log('   ⚠ collab-review: no artifacts for this org — threads skipped');
    } else {
      const primary = artRes.rows[0];
      const secondary = artRes.rows[1] ?? primary;
      primaryArtifactId = primary.id;
      primaryProjectId = primary.project_id;

      // Realistic regulatory review traffic: a reviewer challenges an
      // evidentiary claim, the author answers, the thread either resolves or
      // stays open. Two are assigned to the admin so my-queue is non-empty for
      // the account a demo actually signs in as.
      const THREADS = [
        {
          threadId: 'ga-demo-thread-001',
          artifact: primary,
          title: 'Acceptance criterion for host cell protein is not justified by the batch data',
          anchorType: 'section', anchorKey: '3.2.S.4.5', anchorLabel: '3.2.S.4.5 Justification of Specification',
          status: 'open', priority: 'high',
          author: person('david'), assignee: ADMIN,
          createdDaysAgo: 6, updatedDaysAgo: 1,
          comments: [
            {
              id: 'ga-demo-comment-001', kind: 'request_changes', who: person('david'), daysAgo: 6,
              body: 'The proposed NMT 100 ng/mg limit is presented as justified by the batch history, but the tabulated data only covers five clinical batches and two of those are pre-change. Either widen the dataset or state the limit as provisional pending process validation. As written I do not think this survives a Module 3 information request.',
            },
            {
              id: 'ga-demo-comment-002', kind: 'comment', who: person('lisa'), daysAgo: 3,
              body: 'Agreed on the dataset. We have three further post-change batches released since this draft; I will add them and re-run the tolerance interval. If the upper bound still sits below 60 ng/mg I would rather keep the limit and add the justification than soften it.',
            },
            {
              id: 'ga-demo-comment-003', kind: 'comment', who: ADMIN, daysAgo: 1,
              body: 'Please also cross-reference the assay validation report once the review below closes — the limit and the method have to be justified together, not in separate sections.',
            },
          ],
        },
        {
          threadId: 'ga-demo-thread-002',
          artifact: primary,
          title: 'Assay validation report reference is stale',
          anchorType: 'section', anchorKey: '3.2.S.4.3', anchorLabel: '3.2.S.4.3 Validation of Analytical Procedures',
          status: 'resolved', priority: 'medium',
          author: person('lisa'), assignee: person('david'),
          createdDaysAgo: 14, updatedDaysAgo: 8, resolvedDaysAgo: 8,
          resolver: person('david'),
          comments: [
            {
              id: 'ga-demo-comment-004', kind: 'comment', who: person('lisa'), daysAgo: 14,
              body: 'This section still cites HCP-VAL-002 rev 1. Rev 2 superseded it in March after the intermediate precision re-run. Please update the citation and the summary table.',
            },
            {
              id: 'ga-demo-comment-005', kind: 'comment', who: person('david'), daysAgo: 8,
              body: 'Updated to rev 2 and refreshed the precision summary. The reported %RSD moves from 8.4 to 7.1, which does not change any downstream conclusion.',
            },
            {
              id: 'ga-demo-comment-006', kind: 'system', who: person('david'), daysAgo: 8,
              body: 'Thread resolved by David Kim',
            },
          ],
        },
        {
          threadId: 'ga-demo-thread-003',
          artifact: secondary,
          title: 'Starting dose justification does not address the agency comment on scaling',
          anchorType: 'heading', anchorKey: 'dose-rationale', anchorLabel: 'Dose Rationale',
          status: 'open', priority: 'high',
          author: person('sarah'), assignee: ADMIN,
          createdDaysAgo: 4, updatedDaysAgo: 2, dueInDays: 3,
          comments: [
            {
              id: 'ga-demo-comment-007', kind: 'request_changes', who: person('sarah'), daysAgo: 4,
              body: 'FDA asked specifically why body-surface-area scaling was used rather than allometric exponent scaling given the target. The current paragraph restates the MABEL calculation without answering the question that was asked.',
            },
            {
              id: 'ga-demo-comment-008', kind: 'comment', who: person('raj'), daysAgo: 2,
              body: 'I can supply both scalings side by side with the resulting HED. They differ by roughly a factor of two, so we should say plainly which one we adopted and why, rather than presenting one and hoping it is not queried again.',
            },
          ],
        },
        {
          threadId: 'ga-demo-thread-004',
          artifact: secondary,
          title: 'Dose-limiting toxicity window is inconsistent between the synopsis and section 6',
          anchorType: 'general', anchorKey: null, anchorLabel: null,
          status: 'open', priority: 'low',
          author: person('raj'), assignee: person('sarah'),
          createdDaysAgo: 9, updatedDaysAgo: 9,
          comments: [
            {
              id: 'ga-demo-comment-009', kind: 'comment', who: person('raj'), daysAgo: 9,
              body: 'Synopsis says 21 days, section 6.3 says 28 days. Whichever is right, the two have to agree before this goes out.',
            },
          ],
        },
      ];

      for (const t of THREADS) {
        const ins = await client.query(
          `INSERT INTO concept2cure_review_threads (
             thread_id, org_id, project_id, artifact_id,
             created_by_id, created_by_name, created_by_role,
             title, anchor_type, anchor_key, anchor_label,
             status, priority, assignee_id, assignee_name,
             created_at, updated_at, resolved_at, resolved_by_id, resolved_by_name
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15,
             $16, $17, $18, $19, $20
           )
           ON CONFLICT (thread_id) DO NOTHING
           RETURNING id`,
          [
            t.threadId, org.id, t.artifact.project_id, t.artifact.id,
            t.author.id, t.author.name, t.author.role,
            t.title, t.anchorType, t.anchorKey, t.anchorLabel,
            t.status, t.priority, t.assignee.id, t.assignee.name,
            daysFromNow(-t.createdDaysAgo), daysFromNow(-t.updatedDaysAgo),
            t.resolvedDaysAgo !== undefined ? daysFromNow(-t.resolvedDaysAgo) : null,
            t.resolver?.id ?? null, t.resolver?.name ?? null,
          ],
        );
        // On a re-run the INSERT writes nothing, so recover the serial id the
        // comments FK needs.
        let serialId = ins.rows[0]?.id;
        if (serialId === undefined) {
          const found = await client.query(
            `SELECT id FROM concept2cure_review_threads WHERE thread_id = $1 AND org_id = $2`,
            [t.threadId, org.id],
          );
          serialId = found.rows[0]?.id;
        } else {
          threadCount++;
        }
        if (serialId === undefined) continue;
        threadKeyToSerial.set(t.threadId, serialId);

        for (const c of t.comments) {
          const cIns = await client.query(
            `INSERT INTO concept2cure_thread_comments (
               comment_id, org_id, thread_id, artifact_id,
               author_id, author_name, author_role, body, kind,
               created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (comment_id) DO NOTHING
             RETURNING id`,
            [
              c.id, org.id, serialId, t.artifact.id,
              c.who.id, c.who.name, c.who.role, c.body, c.kind,
              daysFromNow(-c.daysAgo), daysFromNow(-c.daysAgo),
            ],
          );
          if (cIns.rows[0]) commentCount++;
        }
      }

      // Review tasks. task_type is restricted to change_request | follow_up |
      // review_task by the intersection of the two CHECK constraints — see the
      // header. Two are assigned to the admin so the my-queue task list is
      // non-empty, one of them overdue so the derived overdueTasks counter
      // (concept2cure.ts:16086-16094) is exercised rather than always zero.
      if (await tableExists(client, 'concept2cure_review_tasks')) {
        const threadSerials = await client.query(
          `SELECT thread_id, id FROM concept2cure_review_threads
            WHERE org_id = $1 AND thread_id = ANY($2::text[])`,
          [org.id, ['ga-demo-thread-001', 'ga-demo-thread-003']],
        );
        const serialByKey = new Map(threadSerials.rows.map((r) => [r.thread_id, r.id]));

        const TASKS = [
          {
            taskId: 'ga-demo-rtask-001',
            artifact: primary, threadKey: 'ga-demo-thread-001',
            title: 'Re-run HCP tolerance interval with the three post-change batches',
            description:
              'Extend the batch dataset to eight releases and recompute the upper tolerance bound so the NMT 100 ng/mg limit is defensible on the post-change process alone.',
            taskType: 'change_request', status: 'in_progress',
            creator: person('david'), assignee: ADMIN,
            createdDaysAgo: 6, dueInDays: -2, // overdue
          },
          {
            taskId: 'ga-demo-rtask-002',
            artifact: secondary, threadKey: 'ga-demo-thread-003',
            title: 'Tabulate BSA and allometric HED side by side for the dose rationale',
            description:
              'Present both scalings with the resulting human equivalent dose and state which was adopted, so the agency comment is answered directly rather than restated.',
            taskType: 'change_request', status: 'open',
            creator: person('sarah'), assignee: ADMIN,
            createdDaysAgo: 4, dueInDays: 3,
          },
          {
            taskId: 'ga-demo-rtask-003',
            artifact: primary, threadKey: null,
            title: 'Reconcile the DLT observation window across the synopsis and section 6',
            description:
              'Confirm 21 vs 28 days with the medical monitor and apply the agreed window consistently through the protocol.',
            taskType: 'follow_up', status: 'open',
            creator: person('raj'), assignee: person('sarah'),
            createdDaysAgo: 9, dueInDays: 6,
          },
          {
            taskId: 'ga-demo-rtask-004',
            artifact: secondary, threadKey: null,
            title: 'Second-reviewer read of the revised clinical overview',
            description:
              'Independent read of Module 2.5 once the dose rationale and DLT window changes have landed.',
            taskType: 'review_task', status: 'resolved',
            creator: ADMIN, assignee: person('lisa'),
            createdDaysAgo: 20, dueInDays: -10, resolvedDaysAgo: 11,
          },
        ];

        for (const k of TASKS) {
          const res = await client.query(
            `INSERT INTO concept2cure_review_tasks (
               task_id, org_id, project_id, artifact_id, thread_id,
               created_by_id, created_by_name, assigned_to_id, assigned_to_name,
               title, description, task_type, status,
               due_at, created_at, updated_at, resolved_at, resolved_by_id, resolved_by_name
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9,
               $10, $11, $12, $13,
               $14, $15, $16, $17, $18, $19
             )
             ON CONFLICT (task_id) DO NOTHING
             RETURNING id`,
            [
              k.taskId, org.id, k.artifact.project_id, k.artifact.id,
              k.threadKey ? (serialByKey.get(k.threadKey) ?? null) : null,
              k.creator.id, k.creator.name, k.assignee.id, k.assignee.name,
              k.title, k.description, k.taskType, k.status,
              daysFromNow(k.dueInDays), daysFromNow(-k.createdDaysAgo),
              daysFromNow(-(k.resolvedDaysAgo ?? k.createdDaysAgo)),
              k.resolvedDaysAgo !== undefined ? daysFromNow(-k.resolvedDaysAgo) : null,
              k.resolvedDaysAgo !== undefined ? k.assignee.id : null,
              k.resolvedDaysAgo !== undefined ? k.assignee.name : null,
            ],
          );
          if (res.rows[0]) taskCount++;
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Part 2 — review notifications (the Task Tray badge)
  // ════════════════════════════════════════════════════════════════════════
  // my-queue's third read (concept2cure.ts:16075-16084) counts unread
  // notifications for the signed-in user, and that count is the badge on the
  // top-bar tray. Nothing seeded this table, so the badge was always 0 and the
  // status filter matched every row vacuously. One row is deliberately 'read'
  // so the filter is provably doing work.
  let notifCount = 0;
  if (!(await tableExists(client, 'concept2cure_notifications'))) {
    console.log('   ⚠ collab-review: concept2cure_notifications not found — skipping');
  } else if (threadKeyToSerial.size > 0) {
    const NOTIFS = [
      {
        id: 'ga-demo-notif-001', type: 'changes_requested', severity: 'warning', status: 'unread',
        threadKey: 'ga-demo-thread-001', actor: person('david'), daysAgo: 6,
        title: 'Changes requested on 3.2.S.4.5',
        body: 'David Kim requested changes to the host cell protein acceptance criterion justification.',
      },
      {
        id: 'ga-demo-notif-002', type: 'assignment', severity: 'info', status: 'unread',
        threadKey: 'ga-demo-thread-003', actor: person('sarah'), daysAgo: 4,
        title: 'You were assigned a review thread',
        body: 'Sarah Chen assigned you "Starting dose justification does not address the agency comment on scaling".',
      },
      {
        id: 'ga-demo-notif-003', type: 'overdue', severity: 'critical', status: 'unread',
        threadKey: 'ga-demo-thread-001', actor: null, daysAgo: 1,
        title: 'Review task is overdue',
        body: 'Re-run HCP tolerance interval with the three post-change batches passed its due date.',
      },
      {
        id: 'ga-demo-notif-004', type: 'thread_resolved', severity: 'info', status: 'read',
        threadKey: null, actor: person('david'), daysAgo: 8,
        title: 'Thread resolved',
        body: 'David Kim resolved "Assay validation report reference is stale".',
      },
    ];
    for (const n of NOTIFS) {
      const res = await client.query(
        `INSERT INTO concept2cure_notifications (
           notification_id, org_id, project_id, artifact_id, thread_id,
           recipient_user_id, recipient_name, actor_user_id, actor_name,
           notification_type, title, body, severity, status,
           created_at, updated_at, read_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (notification_id) DO NOTHING
         RETURNING id`,
        [
          n.id, org.id, primaryProjectId, primaryArtifactId,
          n.threadKey ? (threadKeyToSerial.get(n.threadKey) ?? null) : null,
          ADMIN.id, ADMIN.name, n.actor?.id ?? null, n.actor?.name ?? null,
          n.type, n.title, n.body, n.severity, n.status,
          daysFromNow(-n.daysAgo), daysFromNow(-n.daysAgo),
          n.status === 'read' ? daysFromNow(-n.daysAgo) : null,
        ],
      );
      if (res.rows[0]) notifCount++;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Part 3 — durable section locks
  // ════════════════════════════════════════════════════════════════════════
  let lockCount = 0;
  if (!(await tableExists(client, 'collab_section_locks'))) {
    console.log('   ⚠ collab-review: collab_section_locks not found — skipping locks');
  } else {
    // lock_key format is t<tenantId>:<documentId>[:<sectionId>], matching what
    // realtime-collab.ts builds. lock_type is 'section-edit' because that is
    // what the real client sends (AuthoringCollab.tsx), not the 'advisory'
    // column default.
    //
    // Both are LIVE. An expired row would be invisible to GET /locks and then
    // deleted by the reaper on first read — see the header.
    const DOC = 'ga-demo-doc-bx099-module3';
    const LOCKS = [
      {
        sectionId: '3.2.S.4.5',
        by: person('lisa'),
        reason: 'Revising the acceptance criterion justification against review thread ga-demo-thread-001.',
        expiresInMinutes: 22,
      },
      {
        sectionId: '3.2.S.4.3',
        by: person('david'),
        reason: 'Refreshing the analytical procedure validation summary.',
        expiresInMinutes: 8,
      },
    ];
    for (const l of LOCKS) {
      const lockKey = `t${org.id}:${DOC}:${l.sectionId}`;
      const res = await client.query(
        `INSERT INTO collab_section_locks (
           tenant_id, document_id, section_id, lock_key,
           locked_by, locked_by_label, lock_type, reason, locked_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (lock_key) DO NOTHING
         RETURNING id`,
        [
          org.id, DOC, l.sectionId, lockKey,
          String(l.by.id), l.by.name, 'section-edit', l.reason,
          minutesFromNow(-5), minutesFromNow(l.expiresInMinutes),
        ],
      );
      if (res.rows[0]) lockCount++;
    }
  }

  console.log(
    `   ✓ collab-review: ${threadCount} threads, ${commentCount} comments, ` +
      `${taskCount} review tasks, ${notifCount} notifications, ${lockCount} live section locks`,
  );
}
