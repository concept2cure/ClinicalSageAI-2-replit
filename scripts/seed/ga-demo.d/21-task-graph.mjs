/**
 * 21-task-graph.mjs — GA demo seed: the task DEPENDENCY GRAPH, plus the
 * archived and e-signed task states that every read model filters on.
 *
 * Runs immediately after 20-tasks-approvals.mjs (the loader sorts the
 * directory lexicographically, so '21-' follows '20-') and builds edges over
 * the ga-demo-utask-NNN rows that module seeds. It also adds four tasks of its
 * own, because three demo states cannot be expressed without them.
 *
 * Surfaces fed by this module:
 *   1. GET /api/task-management/board (server/routes/taskBoard.routes.ts:200)
 *      → reads unified_tasks org-scoped WHERE deleted_at IS NULL, then folds
 *        task_dependencies into dependsOn[] / blocks[] per item. An edge only
 *        renders when BOTH endpoints are the org's own tasks
 *        (taskBoard.routes.ts:218-220).
 *      Renders in client/src/concept2cure/v2/surfaces/TaskBoard.tsx — the
 *      dependency count badge (:560), the critical-path "depends on" line
 *      (:593) and the Dependencies detail section (:803-808).
 *   2. The unblock cascade, server/services/tasking/task-side-effects.ts:104
 *      → SELECT successor_task_id FROM task_dependencies
 *          WHERE predecessor_task_id = $done
 *            AND (is_blocking IS NULL OR is_blocking = true)
 *        then, per blocked successor, the reverse read at :121 gathers the
 *        successor's OTHER blocking predecessors and wakes it only when every
 *        one is 'completed'.
 *   3. GET /api/tasks/tasks/critical-path/:projectId
 *      (server/services/tasking/task-planning.ts:34) — requires
 *      unified_tasks.project_id, which 20-tasks-approvals.mjs does not set;
 *      see the project_id backfill in Part 1 below.
 *
 * DDL sources: migrations/0000_sweet_joseph.sql:5976 (task_dependencies) and
 * :6061 (unified_tasks); db/migrations/20260807_task_graph_org_columns.sql
 * (task_dependencies.organization_id); db/migrations/20260807_unified_tasks_soft_delete.sql
 * (deleted_at, deleted_by).
 *
 * COHERENCE RULE observed throughout: every row here is a state the production
 * write path could actually have produced. Specifically —
 *   · A BLOCKING edge whose predecessor is not 'completed' always has a
 *     successor in status 'blocked'. Creating such an edge is exactly what
 *     blocks the successor (taskManagement.routes.ts), so any other
 *     combination would be a state no code path can reach.
 *   · Edge status stays 'active'. The cascade updates unified_tasks.status and
 *     never writes 'satisfied' back onto the edge, so a seeded 'satisfied' row
 *     would be fiction.
 *   · is_blocking is written explicitly, never left to the default, because
 *     NULL reads as blocking in the cascade.
 *
 * Conventions: runs inside the caller's open transaction (no BEGIN/COMMIT),
 * every table guarded via to_regclass, idempotent (ON CONFLICT on the real
 * unique keys task_id / dependency_id), all rows org-scoped.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);

async function tableExists(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return Boolean(r.rows[0]?.t);
}

/** Guards the columns added by the 20260807 migrations, so this module still
 *  runs (degraded, and it says so) against a database that predates them. */
async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(false))
        AND table_name = $1 AND column_name = $2
      LIMIT 1`,
    [table, column],
  );
  return r.rows.length > 0;
}

// Mirrors MODULE_CONFIG in server/services/unifiedTaskService.ts, as
// 20-tasks-approvals.mjs does, so seeded rows match created rows.
const MODULES = {
  MedicalDevice: { icon: 'Activity', color: '#78716c', category: 'device' },
  CMC: { icon: 'FlaskConical', color: '#3B82F6', category: 'manufacturing' },
  eCTD: { icon: 'BookOpen', color: '#F59E0B', category: 'documentation' },
};

export default async function seed(client, { org, admin }) {
  if (!(await tableExists(client, 'unified_tasks'))) {
    console.log('   ⚠ task-graph: unified_tasks not found — skipping');
    return;
  }

  const TEAM_EMAILS = {
    david: 'david.kim@concept2cure.pro',
    lisa: 'lisa.johnson@concept2cure.pro',
    emily: 'emily.watson@concept2cure.pro',
  };
  const INITIALS = { david: 'D. Kim', lisa: 'L. Johnson', emily: 'E. Watson' };
  const usersRes = await client.query(
    `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
    [Object.values(TEAM_EMAILS)],
  );
  const idByEmail = new Map(usersRes.rows.map((r) => [r.email, r.id]));
  const adminName = admin.name || 'JM Smith';
  const member = (key) => {
    const id = idByEmail.get(TEAM_EMAILS[key]);
    return id ? { id, name: INITIALS[key] } : { id: admin.id, name: adminName };
  };

  const hasSoftDelete = await columnExists(client, 'unified_tasks', 'deleted_at');

  // ════════════════════════════════════════════════════════════════════════
  // Part 1 — the four tasks the graph needs that module 20 does not provide
  // ════════════════════════════════════════════════════════════════════════
  //
  // 013 exists so ga-demo-utask-007 ("summative usability report", already
  //     seeded 'blocked') has a SECOND blocking predecessor. A fan-in is the
  //     only shape that exercises the cascade's reverse-edge read: completing
  //     one predecessor must NOT wake the successor while the other is open.
  //     It also reconciles 007's description, which says it is blocked pending
  //     the vendor participant dataset — that is this task.
  // 014/015 are archived, so `deleted_at IS NULL` in every read model is
  //     filtering something rather than matching every row vacuously.
  // 016 is the completed, approval-gated, e-signed task: the only row in the
  //     demo set that shows a §11.50 manifestation at rest.
  const EXTRA_TASKS = [
    {
      taskId: 'ga-demo-utask-013', module: 'MedicalDevice',
      title: 'Obtain BX-204 summative usability participant dataset from vendor',
      description:
        'Chase the final de-identified participant dataset and moderator notes from the usability vendor. The summative report cannot be concluded until this arrives; escalated to the vendor program manager.',
      taskType: 'action', who: member('david'),
      status: 'in-progress', priority: 'high', progress: 50,
      start: -14, due: 2, estimatedHours: 4,
      riskLevel: 'high', regulatoryImpact: true,
      tags: ['BX-204', 'human-factors', 'vendor'],
    },
    {
      taskId: 'ga-demo-utask-014', module: 'CMC',
      title: 'Draft BX-099 Module 3 content-lock checklist (superseded)',
      description:
        'Superseded by the consolidated content-lock checklist issued with the sequence 0003 plan. Archived rather than deleted so the audit trail retains it.',
      taskType: 'action', who: member('lisa'),
      status: 'cancelled', priority: 'low', progress: 20,
      start: -30, due: -12, estimatedHours: 5,
      tags: ['BX-099', 'module-3', 'superseded'],
      archivedDaysAgo: 9,
    },
    {
      taskId: 'ga-demo-utask-015', module: 'eCTD',
      title: 'Validate BX-099 sequence 0002 against eCTD 3.2.2 criteria',
      description:
        'Closed out when sequence 0002 was withdrawn before gateway submission and replaced by sequence 0003. Archived with the withdrawal rationale on the record.',
      taskType: 'review', who: member('emily'),
      status: 'cancelled', priority: 'medium', progress: 70,
      start: -40, due: -22, estimatedHours: 6,
      tags: ['BX-099', 'ectd', 'withdrawn'],
      archivedDaysAgo: 21,
    },
    {
      taskId: 'ga-demo-utask-016', module: 'CMC',
      title: 'Approve BX-099 drug product stability protocol amendment 2',
      description:
        'Amendment 2 extends the 25 °C/60 % RH station set to 36 months and adds the in-use stability arm requested at the pre-BLA meeting. Approved and signed.',
      taskType: 'review', who: member('lisa'),
      status: 'completed', priority: 'high', progress: 100,
      start: -21, due: -6, completedAt: -6, estimatedHours: 8,
      regulatoryImpact: true,
      approvalRequired: true, approvalStatus: 'approved',
      tags: ['BX-099', 'stability', 'amendment'],
      // Shape is server/services/tasking/task-signoff.ts SignoffManifestation,
      // written into approval_history by taskManagement.routes.ts:364. Meaning
      // is drawn from TASK_SIGNATURE_MEANINGS (part11/pin-verification.ts:99).
      approvalHistory: [
        {
          signedById: null, // filled in below with the real user id
          signedByName: null,
          meaning: 'APPROVED',
          reason:
            'Stability protocol amendment 2 reviewed against ICH Q1A(R2); station set and in-use arm agreed at the pre-BLA meeting.',
          signedAtDaysAgo: 6,
          method: 'pin',
        },
      ],
    },
  ];

  let taskRows = 0;
  for (const t of EXTRA_TASKS) {
    const mod = MODULES[t.module];
    let history = null;
    if (t.approvalHistory) {
      history = JSON.stringify(
        t.approvalHistory.map((h) => ({
          signedById: t.who.id,
          signedByName: t.who.name,
          meaning: h.meaning,
          reason: h.reason,
          signedAt: daysFromNow(-h.signedAtDaysAgo).toISOString(),
          method: h.method,
        })),
      );
    }
    const res = await client.query(
      `INSERT INTO unified_tasks (
         task_id, organization_id, module_type, module_icon, module_color,
         title, description, category, task_type,
         assignee_id, assignee_name, assigned_by, assigned_at,
         status, priority, progress, completion_percentage,
         start_date, due_date, completed_at, estimated_hours,
         approval_required, approval_status, approval_history,
         risk_level, regulatory_impact, tags, metadata, created_by_id
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24::json,
         $25, $26, $27::text[], $28::json, $29
       )
       ON CONFLICT (task_id) DO NOTHING
       RETURNING task_id`,
      [
        t.taskId, org.id, t.module, mod.icon, mod.color,
        t.title, t.description, mod.category, t.taskType,
        t.who.id, t.who.name, admin.id, daysFromNow(t.start ?? 0),
        t.status, t.priority, t.progress, t.progress,
        daysFromNow(t.start ?? 0), daysFromNow(t.due ?? 0),
        t.completedAt !== undefined ? daysFromNow(t.completedAt) : null,
        t.estimatedHours ?? null,
        t.approvalRequired ?? false, t.approvalStatus ?? null, history,
        t.riskLevel ?? null, t.regulatoryImpact ?? false,
        t.tags, JSON.stringify({ seed: 'ga-demo' }), admin.id,
      ],
    );
    if (res.rows[0]) taskRows++;
  }

  // Archive the two superseded rows. Done as a follow-up UPDATE rather than in
  // the INSERT so the module still degrades cleanly on a database that predates
  // 20260807_unified_tasks_soft_delete.sql — there the rows simply stay live.
  let archived = 0;
  if (hasSoftDelete) {
    for (const t of EXTRA_TASKS.filter((x) => x.archivedDaysAgo !== undefined)) {
      const res = await client.query(
        `UPDATE unified_tasks
            SET deleted_at = $1, deleted_by = $2
          WHERE task_id = $3 AND organization_id = $4 AND deleted_at IS NULL
          RETURNING task_id`,
        [daysFromNow(-t.archivedDaysAgo), admin.id, t.taskId, org.id],
      );
      if (res.rows[0]) archived++;
    }
  }

  // Give the demo tasks a project anchor. calculateCriticalPath pre-filters on
  // unified_tasks.project_id (task-planning.ts) and 20-tasks-approvals.mjs sets
  // none, so without this the critical-path endpoint returns an empty DAG for
  // every project. Scoped to this org's own ga-demo rows and only where the
  // column is still NULL, so it neither reaches another tenant nor overwrites a
  // real anchor, and re-running is a no-op.
  let anchored = 0;
  const projectRes = await client.query(
    `SELECT id FROM projects WHERE organization_id = $1 ORDER BY id LIMIT 1`,
    [org.id],
  );
  const demoProjectId = projectRes.rows[0]?.id ?? null;
  if (demoProjectId) {
    const res = await client.query(
      `UPDATE unified_tasks
          SET project_id = $1
        WHERE organization_id = $2
          AND project_id IS NULL
          AND task_id LIKE 'ga-demo-utask-%'`,
      [demoProjectId, org.id],
    );
    anchored = res.rowCount ?? 0;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Part 2 — the dependency edges
  // ════════════════════════════════════════════════════════════════════════
  if (!(await tableExists(client, 'task_dependencies'))) {
    console.log(
      `   ✓ task-graph: ${taskRows} tasks (${archived} archived) — task_dependencies absent, edges skipped`,
    );
    return;
  }
  const depHasOrg = await columnExists(client, 'task_dependencies', 'organization_id');

  // predecessor → successor. `blocking: true` is only ever paired with a
  // successor already in status 'blocked' (see COHERENCE RULE in the header).
  const EDGES = [
    {
      id: 'ga-demo-dep-001',
      from: 'ga-demo-utask-008', // dFMEA update for the predictive low alert
      to: 'ga-demo-utask-007', // summative usability report  (status 'blocked')
      type: 'finish-to-start', blocking: true, critical: true,
      risk: 'high', impact: 8.5,
      why: 'IEC 62366-1: the use-related risk analysis has to be current before the summative evaluation can conclude against it.',
    },
    {
      id: 'ga-demo-dep-002',
      from: 'ga-demo-utask-013', // vendor participant dataset
      to: 'ga-demo-utask-007', // summative usability report  (status 'blocked')
      type: 'finish-to-start', blocking: true, critical: true,
      risk: 'high', impact: 9,
      why: 'The report cannot be written without the participant dataset. Second blocking predecessor: completing either one alone leaves 007 blocked.',
    },
    {
      id: 'ga-demo-dep-003',
      from: 'ga-demo-utask-009', // archive superseded IB v3.1   (completed)
      to: 'ga-demo-utask-010', // migrate legacy stability reports (pending)
      type: 'finish-to-start', blocking: true, critical: false,
      risk: 'low', impact: 2,
      why: 'Predecessor is complete and the successor is open — the state the cascade leaves behind after it wakes a blocked task.',
    },
    {
      id: 'ga-demo-dep-004',
      from: 'ga-demo-utask-005', // Module 2.5 clinical overview draft
      to: 'ga-demo-utask-003', // pre-IND briefing package
      type: 'start-to-start', blocking: false, critical: false,
      risk: 'medium', impact: 5,
      why: 'Informational: the briefing package reuses the overview narrative, but drafting proceeds in parallel. Non-blocking, so the cascade ignores it.',
    },
    {
      id: 'ga-demo-dep-005',
      from: 'ga-demo-utask-011', // protocol revision after FDA feedback
      to: 'ga-demo-utask-003', // pre-IND briefing package
      type: 'finish-to-start', blocking: false, critical: true,
      risk: 'medium', impact: 6.5,
      why: 'On the critical path but deliberately not a gate — the package ships with the protocol marked in revision if it has to.',
    },
    {
      id: 'ga-demo-dep-006',
      from: 'ga-demo-utask-001', // drug substance specification justification
      to: 'ga-demo-utask-006', // sequence 0003 technical validation
      type: 'finish-to-start', blocking: false, critical: false,
      risk: 'medium', impact: 4,
      why: 'Content lock precedes technical validation in practice; kept advisory so validation can start on the assembled sequence.',
    },
    {
      id: 'ga-demo-dep-007',
      from: 'ga-demo-utask-002', // HCP assay validation review
      to: 'ga-demo-utask-001', // specification justification
      type: 'finish-to-finish', blocking: false, critical: false,
      risk: 'low', impact: 3,
      why: 'Finish-to-finish: the justification cannot be signed off ahead of the assay review it cites.',
    },
  ];

  // Only write an edge when BOTH endpoints exist in this org. The board read
  // drops half-resident edges anyway (taskBoard.routes.ts:218-220), and the
  // FKs to unified_tasks.task_id would abort the whole seed transaction.
  const idsRes = await client.query(
    `SELECT task_id FROM unified_tasks WHERE organization_id = $1 AND task_id = ANY($2::text[])`,
    [org.id, [...new Set(EDGES.flatMap((e) => [e.from, e.to]))]],
  );
  const present = new Set(idsRes.rows.map((r) => r.task_id));

  let edgeRows = 0;
  let skipped = 0;
  for (const e of EDGES) {
    if (!present.has(e.from) || !present.has(e.to)) {
      skipped++;
      continue;
    }
    const cols = [
      'dependency_id', 'predecessor_task_id', 'successor_task_id',
      'dependency_type', 'lag_time', 'status', 'is_critical', 'is_blocking',
      'impact_score', 'risk_level', 'metadata',
    ];
    const vals = [
      e.id, e.from, e.to,
      e.type, 0, 'active', e.critical, e.blocking,
      e.impact, e.risk, JSON.stringify({ seed: 'ga-demo', rationale: e.why }),
    ];
    if (depHasOrg) {
      cols.push('organization_id');
      vals.push(org.id);
    }
    const placeholders = vals
      .map((_, i) => (cols[i] === 'metadata' ? `$${i + 1}::json` : `$${i + 1}`))
      .join(', ');
    const res = await client.query(
      `INSERT INTO task_dependencies (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (dependency_id) DO NOTHING
       RETURNING dependency_id`,
      vals,
    );
    if (res.rows[0]) edgeRows++;
  }

  console.log(
    `   ✓ task-graph: ${taskRows} tasks, ${edgeRows} dependency edges` +
      `${skipped ? `, ${skipped} skipped (endpoint absent)` : ''}` +
      `${archived ? `, ${archived} archived` : ''}` +
      `${anchored ? `, ${anchored} anchored to project ${demoProjectId}` : ''}`,
  );
  console.log(
    '   ✓ task-graph: ga-demo-utask-007 has TWO blocking predecessors — ' +
      'completing either alone leaves it blocked (cascade reverse-edge read)',
  );
}
