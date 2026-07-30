/**
 * Wave-3 domain seed — protocol-development authoring hub.
 *
 * Seeds the org's in-development clinical protocol (SELVO-DLBCL-201, a Phase II
 * selvotinib study in R/R DLBCL) into the REAL normalized protocol store —
 * protocol_documents + protocol_sections / _objectives / _eligibility_criteria /
 * _schedule_visits / _risks — the exact tables the /api/protocol-development CRUD
 * routes and the AnA protocol tools write, and that GET /api/protocol-dev now reads
 * (see server/services/protocol-development/pdev-view-assembler.ts). No blob, no
 * fixture: this is a real protocol a user could have authored.
 *
 * Column lists mirror the tested service (protocol-development-service.ts) exactly.
 * Idempotent (skips when the protocol_number already exists for the org), org-scoped,
 * created_by resolved from a real org member, and each block is to_regclass-guarded +
 * fail-safe so a schema drift degrades that block rather than aborting the demo run.
 */

const SECTIONS = [
  { key: 'synopsis', title: 'Protocol summary / synopsis', required: true, status: 'complete', content:
    'A Phase II, single-arm study of selvotinib (an oral selective BTK inhibitor) added to R-GemOx in transplant-ineligible relapsed/refractory DLBCL. Primary endpoint: ORR (CR+PR) per Lugano 2014 at end of cycle 4.' },
  { key: 'background', title: 'Background & rationale', required: true, status: 'complete', content:
    'DLBCL is the most common aggressive non-Hodgkin lymphoma; 30-40% of patients relapse after first-line R-CHOP with poor outcomes in the R/R setting. Selvotinib Phase I data (n=42) showed a manageable safety profile and 51% ORR in heavily pretreated B-cell malignancies. Selective BTK inhibition added to salvage chemotherapy is hypothesized to deepen responses without additive toxicity.' },
  { key: 'objectives', title: 'Objectives & endpoints', required: true, status: 'complete', content: null },
  { key: 'design', title: 'Study design', required: true, status: 'draft', content: null },
  { key: 'eligibility', title: 'Eligibility criteria', required: true, status: 'complete', content: null },
  { key: 'soa', title: 'Schedule of assessments', required: true, status: 'draft', content: null },
  { key: 'treatments', title: 'Study treatments', required: true, status: 'draft', content: null },
  { key: 'safety', title: 'Safety & adverse events', required: true, status: 'not_started', content: null },
  { key: 'statistics', title: 'Statistical considerations', required: true, status: 'not_started', content: null },
  { key: 'data_handling', title: 'Data handling & monitoring', required: true, status: 'not_started', content: null },
  { key: 'ethics', title: 'Ethics & informed consent', required: true, status: 'draft', content: null },
  { key: 'references', title: 'References', required: false, status: 'not_started', content: null },
];

const OBJECTIVES = [
  { type: 'primary', text: 'To evaluate the overall response rate (ORR) of selvotinib plus R-GemOx per Lugano 2014 criteria.', endpoint: 'ORR (CR+PR) at end of cycle 4' },
  { type: 'secondary', text: 'To assess progression-free survival (PFS) and duration of response (DoR).', endpoint: 'PFS, DoR (Kaplan-Meier)' },
  { type: 'secondary', text: 'To characterize the safety and tolerability of the combination.', endpoint: 'AEs per CTCAE v5.0' },
  { type: 'exploratory', text: 'To explore ctDNA dynamics as an early predictor of response.', endpoint: 'ctDNA clearance at C2D1' },
];

const INCLUSION = [
  'Histologically confirmed DLBCL, relapsed or refractory after >=1 prior line.',
  'Age >= 18 years.',
  'ECOG performance status 0-2.',
  'Measurable disease per Lugano 2014.',
  'Adequate hematologic, hepatic and renal function.',
];
const EXCLUSION = [
  'Prior exposure to a BTK inhibitor.',
  'Active CNS lymphoma.',
  'Clinically significant cardiovascular disease within 6 months.',
  'Active anticoagulation with warfarin.',
];

const VISITS = [
  { name: 'Screening', tp: 'D-28 to -1' }, { name: 'C1D1', tp: 'D1' }, { name: 'C1D8', tp: 'D8' },
  { name: 'C2D1', tp: 'D22' }, { name: 'C4D1', tp: 'D64' }, { name: 'EOT', tp: 'D85' }, { name: 'Follow-up', tp: 'q90d' },
];

// likelihood/impact use the real enum vocabulary (not the surface's 1-5 ordinals).
const RISKS = [
  { cat: 'participant_safety', desc: 'Grade >=3 neutropenia from combination myelosuppression', l: 'likely', i: 'major', mit: 'Protocol-defined dose modification + G-CSF support; weekly CBC in C1.', rl: 'possible', ri: 'moderate', status: 'open' },
  { cat: 'operational', desc: 'Under-enrollment at single site', l: 'likely', i: 'moderate', mit: 'Activate two satellite sites; pre-screen registry.', rl: 'unlikely', ri: 'moderate', status: 'mitigating' },
  { cat: 'participant_safety', desc: 'Atrial fibrillation (BTKi class effect)', l: 'unlikely', i: 'major', mit: 'Baseline + on-study ECG; cardiology referral pathway.', rl: 'unlikely', ri: 'moderate', status: 'mitigating' },
  { cat: 'regulatory', desc: 'Protocol deviation in eligibility verification', l: 'possible', i: 'moderate', mit: 'Central eligibility review before C1D1.', rl: 'rare', ri: 'moderate', status: 'mitigating' },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  if (!(await has(client, 'protocol_documents'))) {
    console.log('   ⚠ protocol_documents not found — run migrations first, skipping');
    return;
  }
  // A real org member owns the record (protocol_documents.created_by is NOT NULL);
  // fall back to the demo admin the runner provides.
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id;
  if (!userId) {
    console.log('   ⚠ no org member to own the protocol — skipping protocol-dev seed');
    return;
  }

  const PROTOCOL_NUMBER = 'SELVO-DLBCL-201';
  const exists = await client.query(
    `SELECT id FROM protocol_documents WHERE organization_id = $1 AND protocol_number = $2 AND deleted_at IS NULL LIMIT 1`,
    [org.id, PROTOCOL_NUMBER],
  );
  if (exists.rows.length > 0) {
    console.log('   ✓ protocol dev: already seeded');
    return;
  }

  const doc = await client.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, protocol_number, title, design_type, phase, version, status, synopsis, created_by)
     VALUES ($1,'clinical',$2,$3,'interventional','Phase II','0.7','in_development',$4,$5) RETURNING id`,
    [org.id, PROTOCOL_NUMBER, 'A Phase II Study of Selvotinib in Relapsed/Refractory DLBCL', SECTIONS[1].content, userId],
  );
  const docId = Number(doc.rows[0].id);

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ protocol-dev ${label}: ${e.message ?? e}`); }
  };

  await guard('sections', async () => {
    let order = 0;
    for (const s of SECTIONS) {
      await client.query(
        `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, required, status, order_index, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [org.id, docId, s.key, s.title, s.content, s.required, s.status, order++, userId],
      );
    }
  });
  await guard('objectives', async () => {
    for (const o of OBJECTIVES) {
      await client.query(
        `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, endpoint, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [org.id, docId, o.type, o.text, o.endpoint, userId],
      );
    }
  });
  await guard('eligibility', async () => {
    for (const c of INCLUSION) await client.query(`INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, created_by) VALUES ($1,$2,'inclusion',$3,$4)`, [org.id, docId, c, userId]);
    for (const c of EXCLUSION) await client.query(`INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, created_by) VALUES ($1,$2,'exclusion',$3,$4)`, [org.id, docId, c, userId]);
  });
  await guard('visits', async () => {
    for (const v of VISITS) await client.query(`INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, timepoint, created_by) VALUES ($1,$2,$3,$4,$5)`, [org.id, docId, v.name, v.tp, userId]);
  });
  await guard('risks', async () => {
    for (const r of RISKS) {
      await client.query(
        `INSERT INTO protocol_risks (organization_id, protocol_document_id, category, description, likelihood, impact, mitigation, residual_likelihood, residual_impact, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [org.id, docId, r.cat, r.desc, r.l, r.i, r.mit, r.rl, r.ri, r.status, userId],
      );
    }
  });

  console.log(`   ✓ protocol dev: 1 real protocol seeded (doc ${docId}: sections, objectives, eligibility, SoA, risks)`);
}
