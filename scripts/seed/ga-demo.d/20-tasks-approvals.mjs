/**
 * 20-tasks-approvals.mjs — GA demo seed: unified tasks + approval workflows.
 *
 * Surfaces fed by this module:
 *   1. GET /api/regulatory/tasks/all (server/routes/unifiedTasks.routes.ts)
 *      → unifiedTaskService.getAllUnifiedTasks (server/services/unifiedTaskService.ts)
 *      → SELECT * FROM unified_tasks WHERE organization_id = $org
 *        ORDER BY priority DESC, due_date DESC LIMIT n
 *   2. GET /api/approval-workflows/pending (server/routes/approval-workflow.ts)
 *      → approvalOrchestrator.getPendingApprovals(userId, orgId)
 *        (server/services/workflow/ApprovalOrchestrator.ts)
 *      → document_workflows (organization_id = $org AND status = 'active')
 *        → workflow_approvals (status = 'pending', assigned_to ∋ userId or '*')
 *        → joins unified_documents.title, workflow_steps.name/description,
 *          users.name (via document_workflows.started_by), and reads the due
 *          date from document_workflows.metadata.due.
 *      The communication module's Approvals surface
 *      (client/src/concept2cure/communication/surfaces/Approvals.tsx) renders
 *      this queue; GET /api/approval-workflows/templates reads
 *      workflow_templates (organization_id, is_active) + workflow_steps.
 *
 * DDL sources: shared/schema.ts (unified_tasks, migrations/0000_sweet_joseph.sql)
 * and shared/schema/unified_workflow.ts (unified_documents, workflow_templates,
 * workflow_steps, document_workflows, workflow_approvals, workflow_history).
 *
 * Conventions: runs inside the caller's open transaction (no BEGIN/COMMIT),
 * every table guarded via to_regclass, idempotent (ON CONFLICT on the
 * unified_tasks.task_id unique key; SELECT-before-INSERT elsewhere), all rows
 * org-scoped on the column the read query filters on.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);
const isoDate = (n) => daysFromNow(n).toISOString().slice(0, 10);

async function tableExists(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return Boolean(r.rows[0]?.t);
}

/** Insert-if-absent keyed on a stable selector; returns the row id. */
async function ensureRow(client, selectSql, selectParams, insertSql, insertParams) {
  const found = await client.query(selectSql, selectParams);
  if (found.rows[0]) return found.rows[0].id;
  const ins = await client.query(insertSql, insertParams);
  return ins.rows[0].id;
}

// Module presentation constants — mirrors MODULE_CONFIG in
// server/services/unifiedTaskService.ts so seeded rows match created rows.
const MODULES = {
  CMC: { icon: 'FlaskConical', color: '#3B82F6', category: 'manufacturing' },
  IND: { icon: 'FileText', color: '#10B981', category: 'regulatory' },
  MedicalDevice: { icon: 'Activity', color: '#78716c', category: 'device' },
  eCTD: { icon: 'BookOpen', color: '#F59E0B', category: 'documentation' },
  Vault: { icon: 'Archive', color: '#EC4899', category: 'storage' },
  ProtocolDesign: { icon: 'Clipboard', color: '#06B6D4', category: 'clinical' },
};

export default async function seed(client, { org, admin }) {
  // ── Resolve demo team (seeded earlier in this transaction by the parent
  //    script); fall back to the admin when a member is absent. ──────────────
  const TEAM_EMAILS = {
    sarah: 'sarah.chen@concept2cure.pro',
    raj: 'raj.patel@concept2cure.pro',
    emily: 'emily.watson@concept2cure.pro',
    david: 'david.kim@concept2cure.pro',
    lisa: 'lisa.johnson@concept2cure.pro',
    michael: 'michael.brown@concept2cure.pro',
  };
  const INITIALS = {
    sarah: 'S. Chen',
    raj: 'R. Patel',
    emily: 'E. Watson',
    david: 'D. Kim',
    lisa: 'L. Johnson',
    michael: 'M. Brown',
  };
  const usersRes = await client.query(
    `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
    [Object.values(TEAM_EMAILS)],
  );
  const idByEmail = new Map(usersRes.rows.map((r) => [r.email, r.id]));
  const adminName = admin.name || 'JM Smith';
  /** @returns {{id:number,name:string}} assignee ref with initials-style name */
  const member = (key) => {
    const id = idByEmail.get(TEAM_EMAILS[key]);
    return id ? { id, name: INITIALS[key] } : { id: admin.id, name: adminName };
  };

  // ════════════════════════════════════════════════════════════════════════
  // Part 1 — unified_tasks (GET /api/regulatory/tasks/all)
  // ════════════════════════════════════════════════════════════════════════
  if (!(await tableExists(client, 'unified_tasks'))) {
    console.log('   ⚠ unified_tasks not found — skipping');
  } else {
    const tasks = [
      {
        taskId: 'ga-demo-utask-001', module: 'CMC',
        title: 'Finalize BX-099 drug substance specification justification (3.2.S.4.5)',
        description: 'Consolidate batch analysis data and justify the proposed acceptance criteria for host cell protein and aggregate limits ahead of the Module 3 content lock.',
        taskType: 'deliverable', who: member('lisa'),
        status: 'in-progress', priority: 'high', progress: 60,
        start: -6, due: 10, estimatedHours: 24,
        riskLevel: 'medium', regulatoryImpact: true,
        tags: ['BX-099', 'module-3', 'specifications'], program: 'BX-099',
      },
      {
        taskId: 'ga-demo-utask-002', module: 'CMC',
        title: 'Review BX-099 host cell protein assay validation report',
        description: 'Confirm the validation package supports the analytical procedure referenced in 3.2.S.4.3 before QA sign-off.',
        taskType: 'review', who: member('david'),
        status: 'review', priority: 'medium', progress: 85,
        start: -8, due: 5, estimatedHours: 8,
        approvalRequired: true, approvalStatus: 'pending',
        tags: ['BX-099', 'analytical', 'validation'], program: 'BX-099',
      },
      {
        taskId: 'ga-demo-utask-003', module: 'IND',
        title: 'Assemble BX-256 pre-IND briefing package',
        description: 'Compile the meeting request letter, question list, and supporting nonclinical and CMC summaries for the FDA pre-IND meeting.',
        taskType: 'deliverable', who: member('sarah'),
        status: 'in-progress', priority: 'critical', progress: 40,
        start: -12, due: 7, estimatedHours: 40,
        criticalPath: true, regulatoryImpact: true, riskLevel: 'medium',
        tags: ['BX-256', 'pre-IND', 'FDA'], program: 'BX-256',
      },
      {
        taskId: 'ga-demo-utask-004', module: 'IND',
        title: 'Compile BX-301 genotoxicity study reports for Module 4',
        description: 'Collect the final signed reports for the Ames, in vitro micronucleus, and in vivo comet studies and confirm the SEND dataset references.',
        taskType: 'action', who: member('emily'),
        status: 'pending', priority: 'medium', progress: 0,
        due: 21, estimatedHours: 12,
        tags: ['BX-301', 'module-4', 'nonclinical'], program: 'BX-301',
      },
      {
        taskId: 'ga-demo-utask-005', module: 'eCTD',
        title: 'Author BX-256 Module 2.5 Clinical Overview first draft',
        description: 'Draft the integrated benefit-risk narrative from the Phase 1 readout and the nonclinical overview, per ICH M4E(R2) structure.',
        taskType: 'deliverable', who: member('emily'),
        status: 'in-progress', priority: 'high', progress: 45,
        start: -10, due: 14, estimatedHours: 60,
        regulatoryImpact: true,
        tags: ['BX-256', 'module-2', 'clinical-overview'], program: 'BX-256',
      },
      {
        taskId: 'ga-demo-utask-006', module: 'eCTD',
        title: 'Validate BX-099 sequence 0003 against eCTD 3.2.2 criteria',
        description: 'Run technical validation on the assembled sequence and clear any high-severity findings before gateway submission.',
        taskType: 'review', who: { id: admin.id, name: adminName },
        status: 'pending', priority: 'medium', progress: 0,
        due: 9, estimatedHours: 6,
        tags: ['BX-099', 'ectd', 'validation'], program: 'BX-099',
      },
      {
        taskId: 'ga-demo-utask-007', module: 'MedicalDevice',
        title: 'Complete BX-204 CGM summative usability report',
        description: 'Summative human factors report is blocked pending the final participant dataset from the usability vendor; escalated to the vendor program manager.',
        taskType: 'deliverable', who: member('david'),
        status: 'blocked', priority: 'high', progress: 30,
        start: -20, due: -3, estimatedHours: 32,
        riskLevel: 'high',
        tags: ['BX-204', 'human-factors', 'usability'], program: 'BX-204',
      },
      {
        taskId: 'ga-demo-utask-008', module: 'MedicalDevice',
        title: 'Update BX-204 dFMEA for predictive low glucose alert',
        description: 'Extend the design FMEA with the predictive-low alert hazard analysis identified in change assessment CH-118 and reconcile risk controls with the cleared risk file.',
        taskType: 'action', who: { id: admin.id, name: adminName },
        status: 'in-progress', priority: 'critical', progress: 55,
        start: -5, due: 6, estimatedHours: 16,
        criticalPath: true, riskLevel: 'high', regulatoryImpact: true,
        sourceEntityType: 'change_assessment', sourceEntityId: 'CH-118',
        tags: ['BX-204', 'risk-management', 'dfmea'], program: 'BX-204',
      },
      {
        taskId: 'ga-demo-utask-009', module: 'Vault',
        title: 'Archive superseded BX-301 Investigator Brochure v3.1',
        description: 'Move the superseded IB into the archive workspace with retention metadata and a complete audit trail entry.',
        taskType: 'action', who: member('michael'),
        status: 'completed', priority: 'low', progress: 100, completionPercentage: 100,
        start: -10, due: -2, completedAt: -2, estimatedHours: 3,
        tags: ['BX-301', 'vault', 'archive'], program: 'BX-301',
      },
      {
        taskId: 'ga-demo-utask-010', module: 'Vault',
        title: 'Migrate BX-420 legacy stability reports into controlled vault',
        description: 'Ingest the legacy stability study reports with document-type metadata so they are retrievable from the controlled workspace.',
        taskType: 'action', who: member('michael'),
        status: 'pending', priority: 'low', progress: 0,
        due: 30, estimatedHours: 10,
        tags: ['BX-420', 'stability', 'migration'], program: 'BX-420',
      },
      {
        taskId: 'ga-demo-utask-011', module: 'ProtocolDesign',
        title: 'Incorporate FDA feedback into BX-256 Phase 1 dose-escalation protocol',
        description: 'Address the agency comments on the starting dose justification and the dose-limiting toxicity definitions; route the revision for approval.',
        taskType: 'deliverable', who: member('raj'),
        status: 'review', priority: 'high', progress: 90,
        start: -15, due: 4, estimatedHours: 20,
        approvalRequired: true, approvalStatus: 'pending', regulatoryImpact: true,
        tags: ['BX-256', 'protocol', 'phase-1'], program: 'BX-256',
      },
      {
        taskId: 'ga-demo-utask-012', module: 'ProtocolDesign',
        title: 'Draft BX-420 pediatric cohort statistical analysis outline',
        description: 'Outline the estimand framework and interim analysis plan for the pediatric cohort in support of the PIP commitments.',
        taskType: 'action', who: member('michael'),
        status: 'completed', priority: 'medium', progress: 100, completionPercentage: 100,
        start: -18, due: -5, completedAt: -5, estimatedHours: 14,
        tags: ['BX-420', 'biostatistics', 'pediatric'], program: 'BX-420',
      },
    ];

    for (const t of tasks) {
      const mod = MODULES[t.module];
      await client.query(
        `INSERT INTO unified_tasks (
           task_id, organization_id, module_type, module_icon, module_color,
           source_entity_type, source_entity_id,
           title, description, category, task_type,
           assignee_id, assignee_name, assigned_by, assigned_at,
           status, priority, progress, completion_percentage,
           start_date, due_date, completed_at, estimated_hours,
           approval_required, approval_status,
           risk_level, critical_path, regulatory_impact,
           tags, metadata, created_by_id
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25,
           $26, $27, $28,
           $29::text[], $30::json, $31
         )
         ON CONFLICT (task_id) DO NOTHING`,
        [
          t.taskId, org.id, t.module, mod.icon, mod.color,
          t.sourceEntityType ?? null, t.sourceEntityId ?? null,
          t.title, t.description, mod.category, t.taskType,
          t.who.id, t.who.name, admin.id, daysFromNow(t.start ?? 0),
          t.status, t.priority, t.progress ?? 0, t.completionPercentage ?? t.progress ?? 0,
          t.start != null ? daysFromNow(t.start) : null,
          t.due != null ? daysFromNow(t.due) : null,
          t.completedAt != null ? daysFromNow(t.completedAt) : null,
          t.estimatedHours ?? null,
          t.approvalRequired ?? false, t.approvalStatus ?? null,
          t.riskLevel ?? null, t.criticalPath ?? false, t.regulatoryImpact ?? false,
          t.tags, JSON.stringify({ program: t.program, seed: 'ga-demo' }), admin.id,
        ],
      );
    }
    console.log(`   ✓ tasks+approvals: ${tasks.length} unified tasks seeded`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Part 2 — approval workflows (GET /api/approval-workflows/pending)
  // Tables: unified_documents, workflow_templates, workflow_steps,
  //         document_workflows, workflow_approvals (+ workflow_history).
  // ════════════════════════════════════════════════════════════════════════
  const WORKFLOW_TABLES = [
    'unified_documents',
    'workflow_templates',
    'workflow_steps',
    'document_workflows',
    'workflow_approvals',
  ];
  const missing = [];
  for (const table of WORKFLOW_TABLES) {
    if (!(await tableExists(client, table))) missing.push(table);
  }
  if (missing.length > 0) {
    for (const table of missing) console.log(`   ⚠ ${table} not found — skipping`);
    console.log('   ⚠ approval workflow seed skipped (unified_workflow tables absent)');
    return;
  }

  const adminUid = String(admin.id);
  const uid = (key) => String(member(key).id);

  // ── Templates + steps (read by GET /api/approval-workflows/templates) ────
  const ensureTemplate = (name, description, moduleType, documentTypes) =>
    ensureRow(
      client,
      `SELECT id FROM workflow_templates WHERE organization_id = $1 AND name = $2 LIMIT 1`,
      [org.id, name],
      `INSERT INTO workflow_templates (name, description, module_type, organization_id, created_by, is_active, document_types)
         VALUES ($1, $2, $3, $4, $5, true, $6::text[]) RETURNING id`,
      [name, description, moduleType, org.id, adminUid, documentTypes],
    );

  const ensureStep = (templateId, order, name, description, approverIds) =>
    ensureRow(
      client,
      `SELECT id FROM workflow_steps WHERE template_id = $1 AND "order" = $2 LIMIT 1`,
      [templateId, order],
      `INSERT INTO workflow_steps (template_id, name, description, "order", approver_type, approver_ids, required_actions)
         VALUES ($1, $2, $3, $4, 'user', $5::text[], ARRAY['review']::text[]) RETURNING id`,
      [templateId, name, description, order, approverIds],
    );

  const tplEctd = await ensureTemplate(
    'eCTD document review',
    'Two-stage review for submission-bound documents: QA review followed by regulatory approval with e-signature.',
    'ectd', ['ectd_section', 'clinical_overview', 'investigator_brochure'],
  );
  const tplCmc = await ensureTemplate(
    'CMC change control review',
    'Quality review followed by CMC leadership approval for specification and manufacturing changes.',
    'cmc', ['specification', 'change_control'],
  );
  const tplDevice = await ensureTemplate(
    'Device labeling review',
    'Human factors review followed by regulatory approval for device labeling and IFU revisions.',
    '510k', ['device_labeling', 'ifu'],
  );

  const stEctdQa = await ensureStep(tplEctd, 1, 'QA review', 'Verify formatting, cross-references, and source-data traceability.', [uid('david')]);
  const stEctdReg = await ensureStep(tplEctd, 2, 'Regulatory approval', 'Confirm submission readiness and sign per 21 CFR Part 11.', [adminUid, '*']);
  const stCmcQual = await ensureStep(tplCmc, 1, 'Quality review', 'Assess the change against the validated state and current specifications.', [adminUid, '*']);
  const stCmcLead = await ensureStep(tplCmc, 2, 'CMC leadership approval', 'Approve the change for inclusion in the next regulatory submission.', [uid('lisa')]);
  const stDevHf = await ensureStep(tplDevice, 1, 'Human factors review', 'Confirm labeling changes are covered by the usability evaluation.', [adminUid, '*']);
  const stDevReg = await ensureStep(tplDevice, 2, 'Regulatory approval', 'Approve the labeling revision for release.', [uid('sarah')]);
  const stepCount = 6;

  // ── Documents the workflows run on ────────────────────────────────────────
  const ensureDocument = (title, documentType, status) =>
    ensureRow(
      client,
      `SELECT id FROM unified_documents WHERE organization_id = $1 AND title = $2 LIMIT 1`,
      [org.id, title],
      `INSERT INTO unified_documents (title, document_type, status, created_by, organization_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::json) RETURNING id`,
      [title, documentType, status, adminUid, org.id, JSON.stringify({ seed: 'ga-demo' })],
    );

  const docSpec = await ensureDocument('BX-099 Module 3.2.S drug substance specification update', 'specification', 'in_review');
  const docOverview = await ensureDocument('BX-256 Module 2.5 Clinical Overview v0.9', 'clinical_overview', 'in_review');
  const docIfu = await ensureDocument('BX-204 CGM instructions for use, revision C', 'device_labeling', 'in_review');
  const docIb = await ensureDocument('BX-301 Investigator Brochure v4.0', 'investigator_brochure', 'approved');
  const docPip = await ensureDocument('BX-420 pediatric investigation plan modification request', 'ectd_section', 'rejected');

  // ── Workflow instances (the ~5 approval workflow rows) ────────────────────
  // The pending read resolves the requester name via users.name from
  // started_by, and the due date from metadata.due.
  const ensureWorkflow = (documentId, templateId, w) =>
    ensureRow(
      client,
      `SELECT id FROM document_workflows WHERE organization_id = $1 AND document_id = $2 LIMIT 1`,
      [org.id, documentId],
      `INSERT INTO document_workflows (document_id, template_id, status, current_step, started_by, started_at,
           completed_by, completed_at, rejected_by, rejected_at, organization_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::json) RETURNING id`,
      [
        documentId, templateId, w.status, w.currentStep, w.startedBy, daysFromNow(w.startedDays),
        w.completedBy ?? null, w.completedDays != null ? daysFromNow(w.completedDays) : null,
        w.rejectedBy ?? null, w.rejectedDays != null ? daysFromNow(w.rejectedDays) : null,
        org.id, JSON.stringify(w.metadata),
      ],
    );

  const wfSpec = await ensureWorkflow(docSpec, tplCmc, {
    status: 'active', currentStep: 1, startedBy: uid('sarah'), startedDays: -4,
    metadata: { due: isoDate(6), program: 'BX-099', seed: 'ga-demo' },
  });
  const wfOverview = await ensureWorkflow(docOverview, tplEctd, {
    status: 'active', currentStep: 2, startedBy: uid('emily'), startedDays: -9,
    metadata: { due: isoDate(3), program: 'BX-256', seed: 'ga-demo' },
  });
  const wfIfu = await ensureWorkflow(docIfu, tplDevice, {
    status: 'active', currentStep: 1, startedBy: uid('david'), startedDays: -1,
    metadata: { due: isoDate(12), program: 'BX-204', seed: 'ga-demo' },
  });
  const wfIb = await ensureWorkflow(docIb, tplEctd, {
    status: 'completed', currentStep: 2, startedBy: uid('emily'), startedDays: -30,
    completedBy: adminUid, completedDays: -21,
    metadata: { program: 'BX-301', seed: 'ga-demo' },
  });
  const wfPip = await ensureWorkflow(docPip, tplEctd, {
    status: 'rejected', currentStep: 1, startedBy: uid('raj'), startedDays: -14,
    rejectedBy: uid('sarah'), rejectedDays: -8,
    metadata: { due: isoDate(-6), program: 'BX-420', seed: 'ga-demo' },
  });

  // ── Step approvals per workflow ───────────────────────────────────────────
  // Pending steps for the three active workflows are assigned to the demo
  // admin and to '*' so any signed-in demo reviewer sees a populated queue.
  const ensureApproval = (workflowId, stepId, stepOrder, a) =>
    ensureRow(
      client,
      `SELECT id FROM workflow_approvals WHERE workflow_id = $1 AND step_order = $2 LIMIT 1`,
      [workflowId, stepOrder],
      `INSERT INTO workflow_approvals (workflow_id, step_id, step_order, status, assigned_to, assignment_type,
           required_actions, completed_by, completed_at, comments)
         VALUES ($1, $2, $3, $4, $5::text[], 'user', ARRAY['review']::text[], $6, $7, $8) RETURNING id`,
      [
        workflowId, stepId, stepOrder, a.status, a.assignedTo,
        a.completedBy ?? null, a.completedDays != null ? daysFromNow(a.completedDays) : null,
        a.comments ?? null,
      ],
    );

  const approvals = [
    // BX-099 specification change — waiting on quality review (step 1 of 2).
    [wfSpec, stCmcQual, 1, { status: 'pending', assignedTo: [adminUid, '*'] }],
    [wfSpec, stCmcLead, 2, { status: 'pending', assignedTo: [uid('lisa')] }],
    // BX-256 Clinical Overview — QA done, waiting on regulatory approval.
    [wfOverview, stEctdQa, 1, {
      status: 'approved', assignedTo: [uid('david')], completedBy: uid('david'), completedDays: -2,
      comments: 'QA review complete. Formatting and cross-references verified against the submission checklist.',
    }],
    [wfOverview, stEctdReg, 2, { status: 'pending', assignedTo: [adminUid, '*'] }],
    // BX-204 IFU revision C — waiting on human factors review (step 1 of 2).
    [wfIfu, stDevHf, 1, { status: 'pending', assignedTo: [adminUid, '*'] }],
    [wfIfu, stDevReg, 2, { status: 'pending', assignedTo: [uid('sarah')] }],
    // BX-301 IB v4.0 — fully approved (completed workflow).
    [wfIb, stEctdQa, 1, {
      status: 'approved', assignedTo: [uid('david')], completedBy: uid('david'), completedDays: -24,
      comments: 'No findings. Safety updates traced to the annual DSUR.',
    }],
    [wfIb, stEctdReg, 2, {
      status: 'approved', assignedTo: [adminUid], completedBy: adminUid, completedDays: -21,
      comments: 'Approved for distribution to active sites.',
    }],
    // BX-420 PIP modification — rejected at QA review.
    [wfPip, stEctdQa, 1, {
      status: 'rejected', assignedTo: [uid('sarah')], completedBy: uid('sarah'), completedDays: -8,
      comments: 'Rejected: the proposed deferral timeline conflicts with the agreed PDCO milestone plan. Revise section 4 and resubmit.',
    }],
    [wfPip, stEctdReg, 2, { status: 'pending', assignedTo: [adminUid] }],
  ];
  for (const [workflowId, stepId, stepOrder, a] of approvals) {
    await ensureApproval(workflowId, stepId, stepOrder, a);
  }

  console.log(`   ✓ tasks+approvals: 3 workflow templates + ${stepCount} steps seeded`);
  console.log(`   ✓ tasks+approvals: 5 approval workflows (5 documents, ${approvals.length} step approvals) seeded`);

  // ── Workflow history (audit trail shown on the workflow status view) ─────
  if (await tableExists(client, 'workflow_history')) {
    const ensureHistory = async (workflowId, action, performedBy, days, details) => {
      const found = await client.query(
        `SELECT id FROM workflow_history WHERE workflow_id = $1 AND action = $2 LIMIT 1`,
        [workflowId, action],
      );
      if (found.rows[0]) return;
      await client.query(
        `INSERT INTO workflow_history (workflow_id, action, performed_by, created_at, details)
           VALUES ($1, $2, $3, $4, $5::json)`,
        [workflowId, action, performedBy, daysFromNow(days), JSON.stringify(details)],
      );
    };

    await ensureHistory(wfSpec, 'workflow_started', uid('sarah'), -4, { templateId: tplCmc, totalSteps: 2 });
    await ensureHistory(wfOverview, 'workflow_started', uid('emily'), -9, { templateId: tplEctd, totalSteps: 2 });
    await ensureHistory(wfOverview, 'step_approved', uid('david'), -2, { stepOrder: 1 });
    await ensureHistory(wfIfu, 'workflow_started', uid('david'), -1, { templateId: tplDevice, totalSteps: 2 });
    await ensureHistory(wfIb, 'workflow_started', uid('emily'), -30, { templateId: tplEctd, totalSteps: 2 });
    await ensureHistory(wfIb, 'workflow_completed', adminUid, -21, { totalSteps: 2 });
    await ensureHistory(wfPip, 'workflow_started', uid('raj'), -14, { templateId: tplEctd, totalSteps: 2 });
    await ensureHistory(wfPip, 'workflow_rejected', uid('sarah'), -8, { rejectedAtStep: 1 });
    console.log('   ✓ tasks+approvals: workflow history seeded');
  } else {
    console.log('   ⚠ workflow_history not found — skipping');
  }
}
