/**
 * Wave-3 domain seed — Quality & Assurance (QMS document control + change control).
 *
 * Lights up the whole Quality & Assurance module with LIVE data so a human
 * tester sees real persisted content, not the offline fixtures:
 *
 *   • qms_documents        — the controlled-document register the SOP-register
 *                            tab renders (SOPs, policies, validation protocols,
 *                            the change-control SOP + change-request form).
 *   • qms_training_records — read-and-understood acknowledgments so training
 *                            compliance shows a real (partial) roster number.
 *   • qms_change_controls  — the change-control log the Change-control tab and
 *                            lifecycle flowchart render (one row per lifecycle
 *                            stage so the flowchart shows a realistic spread).
 *   • qms_change_links     — the cross-references tying each change to its
 *                            deviations, CAPAs, validation protocols and SOPs.
 *
 * Read by GET /api/mdx/qms/documents, /training/compliance, /changes,
 * /changes/:id/links. to_regclass guarded, org-scoped, idempotent (only seeds
 * when the org has no change-control rows yet).
 */

// ── Controlled documents (mirror the SOP-register fixtures + the change-control docs) ──
const DOCS = [
  { num: 'QM-001',      title: 'Quality manual',                          type: 'manual',     cat: 'mgmt',       ver: '4.0', status: 'effective',  eff: '2025-09-01', review: '2026-09-01' },
  { num: 'POL-002',     title: 'Data integrity policy',                   type: 'policy',     cat: 'mgmt',       ver: '2.1', status: 'effective',  eff: '2025-11-15', review: '2026-05-15' },
  { num: 'SOP-820-50',  title: 'Supplier controls procedure',             type: 'sop',        cat: 'purchasing', ver: '3.1', status: 'in_review',  eff: '2024-12-01', review: '2026-05-20' },
  { num: 'SOP-820-100', title: 'Corrective and preventive action (CAPA)', type: 'sop',        cat: 'capa',       ver: '5.0', status: 'effective',  eff: '2026-03-30', review: '2027-03-30' },
  { num: 'WI-014',      title: 'Incoming inspection — dimensional check',  type: 'wi',         cat: 'production', ver: '1.2', status: 'draft',      eff: null,         review: null },
  { num: 'VP-7',        title: 'Sterilizer OQ/PQ validation protocol',     type: 'protocol',   cat: 'design',     ver: '1.0', status: 'effective',  eff: '2025-08-10', review: '2026-02-10' },
  { num: 'TC-1',        title: 'New-hire quality system curriculum',        type: 'curriculum', cat: 'training',   ver: '2.0', status: 'effective',  eff: '2026-01-05', review: '2026-07-05' },
  { num: 'SOP-CC-01',   title: 'Change-control procedure',                 type: 'sop',        cat: 'capa',       ver: '2.0', status: 'effective',  eff: '2026-02-01', review: '2027-02-01' },
  { num: 'CC-FORM-01',  title: 'Change-request form',                      type: 'form',       cat: 'capa',       ver: '1.0', status: 'effective',  eff: '2026-02-01', review: null },
];

// ── Change-control log (mirror the Change-control surface fixtures) ──
const CHANGES = [
  {
    num: 'CC-2026-014', title: 'Sterile filter supplier change (0.22 µm)', type: 'supplier', klass: 'critical', risk: 'high', status: 'under_assessment',
    reason: 'Single-source supply risk on the primary sterilising filter.',
    desc: 'Qualify a second-source 0.22 µm sterilising-grade filter for the aseptic fill line.',
    target: '2026-09-15',
    links: [
      { type: 'deviation',  ref: 'DEV-2026-041', label: 'Filter integrity test excursion', rel: 'triggered_by' },
      { type: 'validation', ref: 'VP-7',         label: 'Sterilising-filtration validation', rel: 'requires', doc: 'VP-7' },
      { type: 'supplier',   ref: 'SUP-118',      label: 'Second-source filter vendor',      rel: 'impacts' },
    ],
  },
  {
    num: 'CC-2026-012', title: 'Bioreactor scale-up 2,000 → 5,000 L', type: 'process', klass: 'major', risk: 'high', status: 'in_implementation',
    reason: 'Commercial demand exceeds current batch output.',
    desc: 'Scale the drug-substance process from 2,000 L to 5,000 L at the commercial site.',
    target: '2026-07-05',
    links: [
      { type: 'validation', ref: 'VP-22',    label: 'Process performance qualification', rel: 'requires' },
      { type: 'capa',       ref: 'CAPA-88',  label: 'Yield trend below target',          rel: 'addresses' },
    ],
  },
  {
    num: 'CC-2026-009', title: 'Update SOP-820-50 supplier controls', type: 'document', klass: 'minor', risk: 'low', status: 'verification',
    reason: 'Internal audit finding A-2026-03.',
    desc: 'Revise the supplier-controls procedure to add the risk-based re-qualification cadence.',
    target: '2026-06-20',
    links: [
      { type: 'sop',  ref: 'SOP-820-50', label: 'Supplier controls procedure', rel: 'impacts', doc: 'SOP-820-50' },
      { type: 'capa', ref: 'CAPA-79',    label: 'Audit finding A-2026-03',     rel: 'addresses' },
    ],
  },
  {
    num: 'CC-2026-006', title: 'Migrate LIMS to validated cloud instance', type: 'computer_system', klass: 'major', risk: 'medium', status: 'approved',
    reason: 'End-of-life on the on-premise LIMS server.',
    desc: 'Move the laboratory information system to the validated cloud environment.',
    target: '2026-10-01',
    links: [
      { type: 'validation', ref: 'VP-31', label: 'CSV — LIMS cloud qualification', rel: 'requires' },
    ],
  },
  {
    num: 'CC-2026-002', title: 'Tighten aggregation release limit (SE-HPLC)', type: 'specification', klass: 'minor', risk: 'low', status: 'closed',
    reason: 'Process capability supports a tighter limit.',
    desc: 'Reduce the drug-substance aggregation release limit from ≤2.0% to ≤1.5%.',
    target: '2026-04-10',
    effectiveness: 'Three post-change lots met ≤1.5% with margin; no related OOS. Change effective.',
    links: [
      { type: 'document', ref: 'SPEC-DS-01', label: 'Drug-substance specification', rel: 'impacts' },
    ],
  },
  {
    num: 'CC-2026-001', title: 'New incoming-inspection gauge (WI-014)', type: 'equipment', klass: 'minor', risk: 'low', status: 'proposed',
    reason: 'Improve measurement repeatability at incoming inspection.',
    desc: 'Introduce a calibrated digital gauge for the dimensional incoming check.',
    target: '2026-08-30',
    links: [],
  },
];

/** Lifecycle stamps per status (segregation of duties: approver ≠ proposer). */
function lifecycleColumns(status, proposer, reviewer) {
  const c = { assessed_by: null, approved_by: null, approved_at: null, implemented_at: null, verified_by: null, verified_at: null, closed_at: null };
  const approved = () => { c.assessed_by = reviewer; c.approved_by = reviewer; c.approved_at = 'now()'; };
  switch (status) {
    case 'under_assessment': c.assessed_by = reviewer; break;
    case 'approved': approved(); break;
    case 'in_implementation': approved(); break;
    case 'verification': approved(); c.implemented_at = 'now()'; break;
    case 'closed': approved(); c.implemented_at = 'now()'; c.verified_by = reviewer; c.verified_at = 'now()'; c.closed_at = 'now()'; break;
    default: break; // proposed / rejected / cancelled
  }
  return c;
}

export default async function seed(client, { org, admin }) {
  const haveDocs = await client.query(`SELECT to_regclass('public.qms_documents') AS c`);
  const haveChanges = await client.query(`SELECT to_regclass('public.qms_change_controls') AS c`);
  if (!haveDocs.rows[0]?.c || !haveChanges.rows[0]?.c) {
    console.log('   ⚠ qms_documents / qms_change_controls not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM qms_change_controls WHERE organization_id = $1 LIMIT 1`, [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ QMS quality: already present, skipping');
    return;
  }

  // A reviewer distinct from the admin (for segregation-of-duties realism); fall
  // back to the admin when the org has a single user.
  const reviewerRow = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 AND user_id <> $2 ORDER BY user_id LIMIT 1`,
    [org.id, admin.id],
  );
  const reviewer = reviewerRow.rows[0]?.user_id ?? admin.id;
  // Full roster (for training denominators).
  const roster = (await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id`, [org.id],
  )).rows.map((r) => r.user_id);

  // 1) Controlled documents — capture id by doc_number for change links.
  const docId = {};
  for (const d of DOCS) {
    // Effective documents carry an approver (distinct from the author) and an
    // approval timestamp; drafts/in-review do not. Both are resolved here so the
    // INSERT never reuses a parameter across a column value and an expression.
    const approver = d.status === 'effective' ? reviewer : null;
    const approvedAt = d.status === 'effective' ? `${d.eff}T00:00:00Z` : null;
    const r = await client.query(
      `INSERT INTO qms_documents
         (organization_id, doc_number, title, doc_type, category, version, status,
          effective_date, next_review_date, author_id, approver_id, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [org.id, d.num, d.title, d.type, d.cat, d.ver, d.status, d.eff, d.review, admin.id, approver, approvedAt],
    );
    docId[d.num] = r.rows[0].id;
  }

  // 2) Read-and-understood training — most of the roster acks each effective,
  //    trainable doc (leave one member short so compliance is a realistic <100%).
  const trainable = DOCS.filter((d) => d.status === 'effective'
    && ['sop', 'wi', 'manual', 'policy', 'protocol', 'curriculum'].includes(d.type));
  const trainedRoster = roster.length > 1 ? roster.slice(0, roster.length - 1) : roster;
  let acks = 0;
  for (const d of trainable) {
    for (const uid of trainedRoster) {
      const r = await client.query(
        `INSERT INTO qms_training_records
           (organization_id, user_id, document_id, document_version, acknowledgment_method)
         VALUES ($1,$2,$3,$4,'electronic_signature')`,
        [org.id, uid, docId[d.num], d.ver],
      );
      acks += r.rowCount ?? 0;
    }
  }

  // 3) Change-control register + 4) cross-references.
  let changeCount = 0, linkCount = 0;
  for (const c of CHANGES) {
    const lc = lifecycleColumns(c.status, admin.id, reviewer);
    const ins = await client.query(
      `INSERT INTO qms_change_controls
         (organization_id, change_number, title, description, change_type, classification,
          risk_level, status, reason, target_implementation_date, proposed_by,
          assessed_by, approved_by, approved_at, implemented_at, verified_by, verified_at,
          closed_at, effectiveness_review, qms_document_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $12, $13, ${lc.approved_at ? 'now()' : 'NULL'}, ${lc.implemented_at ? 'now()' : 'NULL'},
               $14, ${lc.verified_at ? 'now()' : 'NULL'}, ${lc.closed_at ? 'now()' : 'NULL'}, $15, $16)
       RETURNING id`,
      [
        org.id, c.num, c.title, c.desc, c.type, c.klass, c.risk, c.status, c.reason, c.target,
        admin.id, lc.assessed_by, lc.approved_by, lc.verified_by, c.effectiveness ?? null,
        c.num === 'CC-2026-009' ? docId['SOP-CC-01'] ?? null : null,
      ],
    );
    const changeId = ins.rows[0].id;
    changeCount += 1;
    for (const l of c.links) {
      const r = await client.query(
        `INSERT INTO qms_change_links
           (organization_id, change_id, link_type, linked_ref, linked_label, linked_id, relationship, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org.id, changeId, l.type, l.ref, l.label, l.doc ? docId[l.doc] ?? null : null, l.rel, admin.id],
      );
      linkCount += r.rowCount ?? 0;
    }
  }

  console.log(`   ✓ QMS quality: ${DOCS.length} controlled docs, ${acks} training acks, ${changeCount} changes, ${linkCount} links seeded`);
}
