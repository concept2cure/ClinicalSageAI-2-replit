/**
 * 22-task-templates.mjs — GA demo seed: org-authored workflow template catalog.
 *
 * Surfaces fed by this module:
 *   1. GET /api/task-management/templates (also mounted at /api/tasks/templates)
 *      → server/routes/taskManagement.routes.ts:1096
 *      → listTemplatesForOrg(organizationId)
 *        (server/services/tasking/task-template-catalog.ts:122)
 *      → SELECT * FROM task_templates
 *          WHERE organization_id = $org AND is_active = true
 *          ORDER BY name
 *        …then the org's rows are merged with BUILTIN_WORKFLOW_TEMPLATES
 *        (server/services/tasking/workflow-templates.ts): a stored row whose
 *        template_id matches a built-in OVERRIDES it, so the picker shows one
 *        entry — the org's, with builtin:false.
 *      Rendered by the "Start workflow" picker,
 *      client/src/concept2cure/v2/surfaces/TaskBoard.tsx:1120 (WorkflowStart).
 *      Until a row exists here the picker falls back to the built-in catalog
 *      only; with zero rows AND no catalog it renders the empty state and the
 *      Create button never enables (TaskBoard.tsx:1236, :1285).
 *   2. POST /api/task-management/tasks/from-template/:templateId
 *      → server/routes/taskManagement.routes.ts:569 — the write half. It reads
 *        the stored row by (template_id, organization_id) and consumes exactly
 *        template.templateId / .name / .tasks / .dependencies, then bumps
 *        usage_count + last_used_at on the stored row.
 *
 * Shape contract (verified against taskDefinitionSchema /
 * templateDependencySchema, taskManagement.routes.ts:60-77, and the built-in
 * catalog entries):
 *   tasks[]        { id, title, description?, moduleType, category?, taskType?,
 *                    priority: low|medium|high|critical, dayOffset: int,
 *                    duration: int > 0, estimatedHours: number > 0 }
 *   dependencies[] { predecessor, successor,
 *                    type?: finish-to-start|start-to-start|finish-to-finish|
 *                           start-to-finish,
 *                    lag?: int }
 * A dependency whose predecessor/successor does not match a tasks[].id is
 * SILENTLY DROPPED by the instantiate route while still counting toward the
 * preview's dependencyCount — so every edge below is keyed to a real task id.
 * spanDays / estimatedHours in the preview are derived from dayOffset+duration
 * and estimatedHours, i.e. the same fields the writer consumes.
 *
 * DDL source: migrations/0000_sweet_joseph.sql:6000-6033 (task_templates) plus
 * indexes at :7586-7589. Drizzle model shared/schema.ts:7271-7325. No later
 * migration alters the table.
 *
 * Idempotency: the ONLY unique key is UNIQUE(template_id) — it is GLOBAL, not
 * per-org. A bare `ON CONFLICT (template_id) DO UPDATE` would therefore let the
 * demo seed overwrite another tenant's row, so this module does a
 * SELECT-before-INSERT on template_id: a row already owned by the demo org is a
 * clean no-op, and a row owned by anyone else is reported and left untouched.
 * The INSERT still carries ON CONFLICT (template_id) DO NOTHING as a
 * concurrency backstop. Consequence worth knowing: claiming the built-in id
 * 'BUILTIN-510K' for the demo org means no other org can ever store that id.
 *
 * Conventions: runs inside the caller's open transaction (no BEGIN/COMMIT),
 * table guarded via to_regclass, org-scoped on organization_id — the exact
 * column the list query filters on. is_active is written explicitly TRUE rather
 * than left to the column default, because the read filters `is_active = true`
 * and the column is nullable: a NULL row is invisible to the picker.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY_MS);

async function tableExists(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return Boolean(r.rows[0]?.t);
}

/** finish-to-start edge, the default the instantiate route assumes. */
const dep = (predecessor, successor, extra) => ({
  predecessor,
  successor,
  type: 'finish-to-start',
  ...extra,
});

const TEMPLATES = [
  // ══════════════════════════════════════════════════════════════════════════
  // 1. OVERRIDE of the built-in 510(k) catalog entry.
  //    templateId is deliberately identical to BUILTIN-510K
  //    (server/services/tasking/workflow-templates.ts:87) so the merge in
  //    listTemplatesForOrg drops the built-in and the picker shows this one
  //    instead, labelled builtin:false. The content is visibly the org's: the
  //    built-in is a generic 4-task / 3-dependency skeleton, this is the
  //    7-task BX-204 CGM playbook with cybersecurity and summative human
  //    factors folded in. is_default marks it as the picker's preselection
  //    (TaskBoard.tsx:1147).
  // ══════════════════════════════════════════════════════════════════════════
  {
    templateId: 'BUILTIN-510K',
    name: '510(k) submission workflow (Concept2Cure device playbook)',
    description:
      "Concept2Cure's house version of the Traditional 510(k) workflow, as run for the BX-204 CGM program: adds the design-history-file freeze, premarket cybersecurity documentation and the summative human factors gate that the generic catalog workflow leaves out.",
    category: 'Submission',
    submissionType: '510k',
    milestone: 'Traditional 510(k)',
    isDefault: true,
    version: 4,
    usageCount: 12,
    lastUsedDays: -18,
    defaultDuration: 25,
    avgCompletionTime: 31.5,
    successRate: 83.3,
    bestPractices:
      'Lock the predicate before any bench testing starts — a predicate change after the SE matrix is written invalidates the performance test plan. Book the summative usability sessions on day 6; the report is the single most common cause of a content-lock slip on this program.',
    regulatoryRequirements: [
      '21 CFR 807 Subpart E',
      '21 CFR 820.30 design controls',
      'FDA eSTAR template',
      'FDA premarket cybersecurity guidance',
      'IEC 62366-1 usability engineering',
      'ISO 10993-1 biological evaluation',
    ],
    riskFactors: [
      'Predicate withdrawn or subject to a Class I recall mid-preparation',
      'Bench performance gap against the predicate on MARD',
      'SBOM incomplete for the companion mobile application',
      'Summative usability findings landing after the content lock',
    ],
    milestones: [
      'Predicate strategy locked',
      'Design history file frozen',
      'Pre-submission feedback incorporated',
      'eSTAR validated and dispatched',
    ],
    tags: ['BX-204', '510k', 'device', 'concept2cure-playbook'],
    tasks: [
      {
        id: 't1',
        title: 'Predicate and reference-device strategy for the BX-204 CGM sensor',
        description:
          'Confirm the primary predicate is current (no Class I recall, not withdrawn) and record the reference devices supporting the performance claims.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'deliverable',
        priority: 'critical',
        dayOffset: 0,
        duration: 6,
        estimatedHours: 24,
      },
      {
        id: 't2',
        title: 'Substantial-equivalence comparison matrix (intended use, technology, performance)',
        description:
          'Build the SE table against the locked predicate and flag every difference that needs performance data rather than argument.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'deliverable',
        priority: 'high',
        dayOffset: 4,
        duration: 5,
        estimatedHours: 20,
      },
      {
        id: 't3',
        title: 'Bench performance and biocompatibility summaries (MARD, ISO 10993 battery)',
        description:
          'Summarize accuracy, sensor life and biological evaluation results in the format the eSTAR performance sections consume.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'deliverable',
        priority: 'high',
        dayOffset: 3,
        duration: 10,
        estimatedHours: 36,
      },
      {
        id: 't4',
        title: 'Summative human factors validation report (IEC 62366-1)',
        description:
          'Run and report the summative usability study covering the sensor insertion and the predictive-low alert response tasks.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'deliverable',
        priority: 'high',
        dayOffset: 6,
        duration: 9,
        estimatedHours: 32,
      },
      {
        id: 't5',
        title: 'Premarket cybersecurity documentation and SBOM for the companion app',
        description:
          'Assemble the threat model, security architecture views and the software bill of materials for the paired mobile application.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'deliverable',
        priority: 'medium',
        dayOffset: 8,
        duration: 6,
        estimatedHours: 18,
      },
      {
        id: 't6',
        title: 'Labeling and IFU revision reconciled against the SE argument',
        description:
          'Update the IFU and carton labeling so every claim traces to a performance summary or the predicate comparison.',
        moduleType: 'Regulatory',
        category: 'regulatory',
        taskType: 'review',
        priority: 'medium',
        dayOffset: 12,
        duration: 5,
        estimatedHours: 16,
      },
      {
        id: 't7',
        title: 'Assemble and validate the eSTAR package, then governed dispatch (e-signature)',
        description:
          'Run the eSTAR completeness check, clear findings, and dispatch under a Part 11 signature.',
        moduleType: 'MedicalDevice',
        category: 'device',
        taskType: 'milestone',
        priority: 'critical',
        dayOffset: 22,
        duration: 3,
        estimatedHours: 12,
      },
    ],
    dependencies: [
      dep('t1', 't2'),
      dep('t1', 't3'),
      dep('t2', 't4'),
      dep('t2', 't6'),
      dep('t3', 't7'),
      dep('t4', 't7'),
      dep('t5', 't7'),
      dep('t6', 't7'),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 2. IND expedited safety reporting — org-only id, no built-in equivalent.
  // ══════════════════════════════════════════════════════════════════════════
  {
    templateId: 'C2C-IND-SAFETY-REPORT',
    name: 'IND safety report (7-day / 15-day expedited)',
    description:
      'Expedited IND safety reporting under 21 CFR 312.32: case intake and SUSAR triage, causality assessment against the reference safety information, Form FDA 3500A completion, and dispatch to FDA with investigator notification.',
    category: 'Safety',
    submissionType: 'IND',
    milestone: 'Post-IND',
    isDefault: false,
    version: 2,
    usageCount: 31,
    lastUsedDays: -3,
    defaultDuration: 9,
    avgCompletionTime: 8.2,
    successRate: 96.8,
    bestPractices:
      'Start the site follow-up query in parallel with the medical review — waiting for the causality call before querying the site is what turns a 15-day report into a late one. The clock starts at initial receipt of the minimum criteria, not at the point the case is complete.',
    regulatoryRequirements: [
      '21 CFR 312.32(c)(1)(i) — 15-day written report',
      '21 CFR 312.32(c)(2) — 7-day fatal/life-threatening notification',
      'ICH E2A',
      'Form FDA 3500A',
    ],
    riskFactors: [
      'Day-zero disputed between site receipt and sponsor receipt',
      'Reference safety information out of date in the current Investigator Brochure',
      'Follow-up information from the site arriving after dispatch',
    ],
    milestones: ['Case triaged', 'Causality assessed', 'Report dispatched'],
    tags: ['pharmacovigilance', 'IND', 'expedited', '312.32'],
    tasks: [
      {
        id: 's1',
        title: 'Intake and triage the case against the SUSAR criteria (serious, unexpected, suspected)',
        description:
          'Confirm the four minimum criteria, record day zero, and decide 7-day versus 15-day reporting.',
        moduleType: 'Safety',
        category: 'pharmacovigilance',
        taskType: 'action',
        priority: 'critical',
        dayOffset: 0,
        duration: 1,
        estimatedHours: 4,
      },
      {
        id: 's2',
        title: 'Medical review and causality assessment against the reference safety information',
        description:
          'Assess expectedness against the current Investigator Brochure RSI and record the sponsor causality call with its rationale.',
        moduleType: 'Clinical',
        category: 'clinical',
        taskType: 'review',
        priority: 'critical',
        dayOffset: 1,
        duration: 2,
        estimatedHours: 8,
      },
      {
        id: 's3',
        title: 'Query the site for follow-up information and source verification',
        description:
          'Issue the follow-up query for concomitant medications, medical history and outcome, and track the response.',
        moduleType: 'Safety',
        category: 'pharmacovigilance',
        taskType: 'action',
        priority: 'high',
        dayOffset: 1,
        duration: 4,
        estimatedHours: 6,
      },
      {
        id: 's4',
        title: 'Draft the IND safety report narrative and complete Form FDA 3500A',
        description:
          'Write the case narrative, complete the MedWatch form, and reconcile the coded terms with the safety database.',
        moduleType: 'Safety',
        category: 'pharmacovigilance',
        taskType: 'deliverable',
        priority: 'high',
        dayOffset: 3,
        duration: 3,
        estimatedHours: 10,
      },
      {
        id: 's5',
        title: 'Medical monitor sign-off on the report and the distribution list',
        description:
          'Governed review and signature before dispatch; confirms the investigator distribution list is complete.',
        moduleType: 'Safety',
        category: 'pharmacovigilance',
        taskType: 'review',
        priority: 'critical',
        dayOffset: 6,
        duration: 2,
        estimatedHours: 4,
      },
      {
        id: 's6',
        title: 'Dispatch to FDA and notify all participating investigators (21 CFR 312.32(c))',
        description:
          'Submit the report to the IND and issue the investigator notification, capturing both acknowledgements.',
        moduleType: 'Regulatory',
        category: 'regulatory',
        taskType: 'milestone',
        priority: 'critical',
        dayOffset: 8,
        duration: 1,
        estimatedHours: 3,
      },
    ],
    dependencies: [
      dep('s1', 's2'),
      // Site follow-up runs alongside the medical review rather than after it.
      dep('s1', 's3', { type: 'start-to-start' }),
      dep('s2', 's4'),
      dep('s3', 's4', { lag: 1 }),
      dep('s4', 's5'),
      dep('s5', 's6'),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 3. CMC post-approval change — org-only id, no built-in equivalent.
  // ══════════════════════════════════════════════════════════════════════════
  {
    templateId: 'C2C-CMC-POST-APPROVAL-CHANGE',
    name: 'CMC post-approval change filing (PAS / CBE-30)',
    description:
      'Take a post-approval manufacturing change from impact assessment through comparability data, regional reportability determination and the governed supplement dispatch.',
    category: 'Lifecycle',
    submissionType: 'PAS',
    milestone: 'Post-approval',
    isDefault: false,
    version: 1,
    usageCount: 7,
    lastUsedDays: -41,
    defaultDuration: 35,
    avgCompletionTime: 47.0,
    successRate: 71.4,
    bestPractices:
      'Make the reportability call before the supplement is authored, not after: a change that turns out to be CBE-30 rather than a prior-approval supplement changes both the content and the implementation date, and reworking an authored 3.2.S section is the expensive way to find that out.',
    regulatoryRequirements: [
      '21 CFR 314.70 — supplements and other changes',
      'ICH Q12 post-approval change management',
      'EU Variations Regulation (EC) No 1234/2008',
    ],
    riskFactors: [
      'Stability data not mature enough at the intended filing date',
      'Change falls outside the approved comparability protocol',
      'Regional reportability differs between FDA and EMA, splitting the filing',
    ],
    milestones: ['Impact assessed', 'Comparability demonstrated', 'Supplement dispatched'],
    tags: ['CMC', 'post-approval', 'variation', 'ICH-Q12'],
    tasks: [
      {
        id: 'c1',
        title: 'Assess the change against the approved comparability protocol and the validated state',
        description:
          'Determine whether the change is covered by the established conditions and record the quality impact assessment.',
        moduleType: 'CMC',
        category: 'manufacturing',
        taskType: 'review',
        priority: 'high',
        dayOffset: 0,
        duration: 7,
        estimatedHours: 24,
      },
      {
        id: 'c2',
        title: 'Generate comparability and stability data for the changed process',
        description:
          'Execute the comparability testing and pull the supporting stability time points for the changed material.',
        moduleType: 'CMC',
        category: 'manufacturing',
        taskType: 'deliverable',
        priority: 'critical',
        dayOffset: 5,
        duration: 20,
        estimatedHours: 80,
      },
      {
        id: 'c3',
        title: 'Determine regional reportability (FDA PAS vs CBE-30, EU variation category)',
        description:
          'Classify the change per region and confirm the implementation date each classification permits.',
        moduleType: 'Regulatory',
        category: 'regulatory',
        taskType: 'action',
        priority: 'high',
        dayOffset: 7,
        duration: 5,
        estimatedHours: 16,
      },
      {
        id: 'c4',
        title: 'Author the supplement narrative and the updated 3.2.S / 3.2.P sections',
        description:
          'Draft the change description, justification and the revised Module 3 sections against the comparability results.',
        moduleType: 'eCTD',
        category: 'documentation',
        taskType: 'deliverable',
        priority: 'high',
        dayOffset: 20,
        duration: 10,
        estimatedHours: 40,
      },
      {
        id: 'c5',
        title: 'QA release and governed dispatch of the supplement (e-signature)',
        description:
          'Quality release of the filing package followed by Part 11 signed dispatch to the agency.',
        moduleType: 'Regulatory',
        category: 'regulatory',
        taskType: 'milestone',
        priority: 'critical',
        dayOffset: 33,
        duration: 2,
        estimatedHours: 8,
      },
    ],
    dependencies: [
      dep('c1', 'c2'),
      dep('c1', 'c3'),
      dep('c2', 'c4'),
      dep('c3', 'c4'),
      dep('c4', 'c5'),
    ],
  },
];

export default async function seed(client, { org, admin }) {
  if (!(await tableExists(client, 'task_templates'))) {
    console.log('   ⚠ task_templates not found — skipping');
    return;
  }

  let inserted = 0;
  let present = 0;
  let foreign = 0;

  for (const t of TEMPLATES) {
    // UNIQUE(template_id) is global, so check ownership before writing: a row
    // belonging to another organization must never be overwritten by a demo
    // seed, and one already owned by this org is a clean re-run no-op.
    const existing = await client.query(
      `SELECT organization_id FROM task_templates WHERE template_id = $1 LIMIT 1`,
      [t.templateId],
    );
    if (existing.rows[0]) {
      if (Number(existing.rows[0].organization_id) === Number(org.id)) {
        present++;
      } else {
        foreign++;
        console.log(
          `   ⚠ task-templates: ${t.templateId} is owned by organization ` +
            `${existing.rows[0].organization_id} — left untouched`,
        );
      }
      continue;
    }

    await client.query(
      `INSERT INTO task_templates (
         template_id, organization_id,
         name, description, category, submission_type, milestone,
         is_active, is_default, version,
         tasks, dependencies, milestones,
         default_duration, best_practices, regulatory_requirements, risk_factors,
         usage_count, last_used_at, avg_completion_time, success_rate,
         tags, metadata, created_by_id
       ) VALUES (
         $1, $2,
         $3, $4, $5, $6, $7,
         true, $8, $9,
         $10::json, $11::json, $12::json,
         $13, $14, $15::json, $16::json,
         $17, $18, $19, $20,
         $21::text[], $22::json, $23
       )
       ON CONFLICT (template_id) DO NOTHING`,
      [
        t.templateId, org.id,
        t.name, t.description, t.category, t.submissionType, t.milestone,
        t.isDefault, t.version,
        JSON.stringify(t.tasks), JSON.stringify(t.dependencies), JSON.stringify(t.milestones),
        t.defaultDuration, t.bestPractices,
        JSON.stringify(t.regulatoryRequirements), JSON.stringify(t.riskFactors),
        t.usageCount, t.lastUsedDays != null ? daysFromNow(t.lastUsedDays) : null,
        t.avgCompletionTime ?? null, t.successRate ?? null,
        t.tags, JSON.stringify({ seed: 'ga-demo' }), admin.id,
      ],
    );
    inserted++;
  }

  const detail = [
    `${inserted} inserted`,
    present ? `${present} already present` : null,
    foreign ? `${foreign} owned by another org` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`   ✓ task-templates: ${TEMPLATES.length} workflow templates (${detail})`);
  console.log(
    '   ✓ task-templates: BUILTIN-510K overridden by the org playbook ' +
      '(the built-in catalog entry drops out of GET /templates)',
  );
}
