/**
 * Wave-3 domain seed — regulatory-change intelligence into the REAL store.
 *
 * Five tracked regulatory changes on the BX-204 CGM / device programs (FDA
 * QMSR final rule, EU AI Act, FDA cybersecurity guidance, IEC 62304 Ed 2, ISO
 * 10993-1 revision), each assessed for portfolio impact and resolved to an
 * action document — seeded into the REAL, org-scoped store `reg_change_items`
 * (migration 20260801_reg_change_store.sql), the exact table
 * reg-change-service.ts writes via POST /api/reg-change and GET /api/reg-change
 * reads. No blob (c2c_reg_changes is deprecated). Grounded in the app's device
 * portfolio — no fabricated data beyond the program codes. The per-device
 * impact list is stored as JSONB. to_regclass guarded, org-scoped, idempotent
 * (only seeds when the org has none yet).
 *
 * Rows are inserted in REVERSE worklist order with created_at =
 * clock_timestamp(): the whole ga-demo seed runs in one transaction, so now()
 * would give every row the same timestamp and the service's worklist order
 * (sev high→med→low, then newest first) would tie-break on random UUIDs.
 * clock_timestamp() advances per statement, so the read order reproduces the
 * intended narrative exactly (QMSR, AIACT, CYBER, 62304, 10993).
 */
const CHANGES = [
  {
    src: 'FDA · final rule', kind: 'regulation', when: 'Effective 2 Feb 2026', sev: 'high', live: true,
    title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
    summary: 'FDA replaces the Quality System Regulation with the Quality Management System Regulation, incorporating ISO 13485 by reference. Terminology, records (DHF→Medical Device File), and management-review expectations change.',
    affects: [
      { dev: 'Quality system (all devices)', what: 'QMS docs re-mapped to ISO 13485 clauses; DHF→MDF terminology', sub: 'Org-wide' },
      { dev: 'BX-204 CGM', what: 'Design & Development File terminology in the 510(k) DHF', sub: '510(k) OR-902' },
    ],
    action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan', owner: 'Quality', due: 'Effective now',
  },
  {
    src: 'EU · regulation', kind: 'regulation', when: 'High-risk obligations Aug 2026', sev: 'high', live: true,
    title: 'EU AI Act — high-risk AI system obligations (medical devices)',
    summary: 'AI-enabled devices that are MDR/IVDR Class IIa+ are high-risk AI systems. Adds data-governance, transparency, human-oversight, and post-market-monitoring obligations layered on MDR — with conflicts to harmonize against ISO 14971.',
    affects: [{ dev: 'BX-204 predictive-low algorithm', what: 'AI Act technical documentation + ISO 14971 alignment', sub: 'EU MDR CE' }],
    action: 'AI Act dual-compliance assessment', doc: 'AI Act ↔ MDR harmonization dossier', owner: 'Reg', due: 'Aug 2026',
  },
  {
    src: 'FDA · final guidance', kind: 'guidance', when: 'Jun 2025', sev: 'med', live: true,
    title: 'Cybersecurity in Premarket Submissions — SBOM required',
    summary: 'Connected devices must include a Software Bill of Materials, threat model, and security testing in the premarket submission. Applies to BX-204 (BLE connectivity).',
    affects: [{ dev: 'BX-204 CGM (BLE)', what: 'Add SBOM + threat model + pen-test report to eSTAR §15', sub: '510(k) OR-902' }],
    action: 'Cybersecurity documentation package', doc: 'SBOM + threat model + security testing', owner: 'Software', due: 'Before filing',
  },
  {
    src: 'IEC · standard revision', kind: 'standard', when: 'Ed 2 — transition', sev: 'med', live: false,
    title: 'IEC 62304 Edition 2 — software lifecycle',
    summary: 'Edition 2 broadens scope and revises safety-classification and legacy-software provisions. Affects all software-containing devices once harmonized.',
    affects: [{ dev: 'BX-204 firmware + app', what: 'Re-baseline software safety classification & lifecycle records', sub: '510(k) §15' }],
    action: 'Standard transition gap analysis', doc: 'IEC 62304 Ed 2 transition plan', owner: 'Software', due: 'Monitor',
  },
  {
    src: 'ISO · standard revision', kind: 'standard', when: '10993-1 revision', sev: 'low', live: false,
    title: 'ISO 10993-1 — biological evaluation revision',
    summary: 'Revised risk-based biocompatibility framework. Relevant to extended-wear skin contact (BX-204 14-day) and the open HZ-04 evaluation.',
    affects: [{ dev: 'BX-204 adhesive (14-day skin contact)', what: 'Re-confirm ISO 10993-11 endpoints under revised framework', sub: 'Risk file HZ-04' }],
    action: 'Biocompatibility re-assessment', doc: 'ISO 10993-1 gap memo', owner: 'Reg', due: 'Monitor',
  },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.reg_change_items') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ reg_change_items not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM reg_change_items WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ reg change: already present, skipping');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  let inserted = 0;
  for (const c of [...CHANGES].reverse()) {
    const r = await client.query(
      `INSERT INTO reg_change_items (
         organization_id, title, src, kind, when_label, sev, live,
         summary, affects, action, doc, owner, due, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14,
                 clock_timestamp(), clock_timestamp())`,
      [
        org.id, c.title, c.src, c.kind, c.when, c.sev, c.live,
        c.summary, JSON.stringify(c.affects), c.action, c.doc, c.owner, c.due, userId,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ reg change: ${inserted} regulatory change(s) seeded into reg_change_items`);
}
