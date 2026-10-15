/**
 * Wave-3 domain seed — governed decision lineage (BX-204 · BLA 761123).
 *
 * Three INVENTED governed artifacts with their workflows and approval steps —
 * unified_documents + workflow_templates/steps + document_workflows +
 * workflow_approvals — tables decisionLineageService.getLineageGraph traverses
 * for GET /api/decision-lineage (server/services/workflow/
 * decision-lineage-view-assembler.ts). Demonstration data, on a database on
 * this machine only (scripts/seed/local-only.mjs).
 *   · §2.5 Clinical Overview — rejected, then pending
 *   · §1.1 Form FDA 356h    — approved
 *   · §3.2.S.4 CMC          — pending review
 *
 * AMENDED 2026-10-15: this header called it "a real decision trail a
 * governed-workflow tenant would accrue", "Part-11 hash-chained" and "e-signed".
 * It also wrote workflow_history and document_audit_logs rows — creations,
 * evidence links, revisions, a lock "with 21 CFR §11.50 signature
 * manifestation attached" — that nobody performed. Those are removed: an audit
 * trail is never demonstration data.
 *
 * Idempotent (skips when the demo artifacts already exist for the org), org-scoped,
 * to_regclass-guarded, fail-safe per artifact.
 */

const ARTIFACTS = [
  {
    title: 'BX-204 · §2.5 Clinical Overview (BLA 761123)', docType: 'ectd', docStatus: 'in_review',
    approvals: [
      { status: 'rejected', by: 'S. Okafor', comments: '§2.5.4 benefit-risk uses "establishes" — soften to match the E9(R1) estimand; reconcile ORR CI wording with §2.7.3.' },
      { status: 'pending', by: 'S. Okafor', comments: 'Approved for lock; awaiting QP electronic signature (§11.50).' },
    ],
  },
  {
    title: 'BX-204 · §1.1 Form FDA 356h (BLA 761123)', docType: 'ectd', docStatus: 'approved',
    approvals: [{ status: 'approved', by: 'S. Okafor', comments: 'Approved and locked (v3.0).' }],
  },
  {
    title: 'BX-204 · §3.2.S.4 Control of drug substance (CMC)', docType: 'cmc', docStatus: 'in_review',
    approvals: [{ status: 'pending', by: 'R. Ivanova', comments: 'Comparability adjudication in progress.' }],
  },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org }) {
  for (const t of ['unified_documents', 'workflow_templates', 'workflow_steps', 'document_workflows', 'workflow_approvals']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping decision-lineage seed`);
      return;
    }
  }

  const existing = await client.query(
    `SELECT id FROM unified_documents WHERE organization_id = $1 AND title = $2 LIMIT 1`,
    [org.id, ARTIFACTS[0].title],
  );
  if (existing.rows.length > 0) {
    console.log('   ✓ decision lineage: already seeded');
    return;
  }

  // One shared governance template + review step the workflows/approvals reference.
  const tpl = await client.query(
    `INSERT INTO workflow_templates (name, module_type, organization_id, created_by, is_active, document_types, default_for_types)
     VALUES ('BLA governed review', 'ectd', $1, 'system', true, ARRAY['ectd','cmc']::text[], ARRAY[]::text[]) RETURNING id`,
    [org.id],
  );
  const templateId = Number(tpl.rows[0].id);
  const step = await client.query(
    `INSERT INTO workflow_steps (template_id, name, "order", approver_type, approver_ids, required_actions)
     VALUES ($1, 'Regulatory Lead review', 1, 'role', ARRAY['regulatory_lead']::text[], ARRAY['review','approve']::text[]) RETURNING id`,
    [templateId],
  );
  const stepId = Number(step.rows[0].id);

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ decision-lineage ${label}: ${e.message ?? e}`); }
  };

  let count = 0;
  for (const a of ARTIFACTS) {
    await guard(a.title, async () => {
      const doc = await client.query(
        `INSERT INTO unified_documents (title, document_type, status, created_by, organization_id)
         VALUES ($1, $2, $3, 'J. Chen', $4) RETURNING id`,
        [a.title, a.docType, a.docStatus, org.id],
      );
      const documentId = Number(doc.rows[0].id);

      const wf = await client.query(
        `INSERT INTO document_workflows (document_id, template_id, status, current_step, started_by, organization_id)
         VALUES ($1, $2, $3, 1, 'J. Chen', $4) RETURNING id`,
        [documentId, templateId, a.docStatus === 'approved' ? 'completed' : 'active', org.id],
      );
      const workflowId = Number(wf.rows[0].id);

      let order = 0;
      for (const ap of a.approvals) {
        await client.query(
          `INSERT INTO workflow_approvals (workflow_id, step_id, step_order, status, assigned_to, assignment_type, required_actions, completed_by, completed_at, comments)
           VALUES ($1, $2, $3, $4, ARRAY[$5]::text[], 'role', ARRAY['review','approve']::text[], $6, $7, $8)`,
          [
            workflowId, stepId, order++, ap.status, ap.by,
            ap.status === 'pending' ? null : ap.by,
            ap.status === 'pending' ? null : new Date(),
            ap.comments,
          ],
        );
      }
      count++;
    });
  }

  console.log(`   ✓ decision lineage: ${count} demonstration artifact(s) with workflows and approvals seeded`);
}
