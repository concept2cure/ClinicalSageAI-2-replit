/**
 * Wave-3 domain seed — regulatory-change intelligence horizon scan.
 *
 * Five tracked regulatory changes on the BX-204 CGM / device programs (FDA
 * QMSR final rule, EU AI Act, FDA cybersecurity guidance, IEC 62304 Ed 2, ISO
 * 10993-1 revision), each assessed for portfolio impact and resolved to an
 * action document. Read by GET /api/reg-change; the v2 RegChange surface renders
 * the worklist. Grounded in the app's device portfolio — no fabricated data
 * beyond the program codes. to_regclass guarded, org-scoped, idempotent
 * (ON CONFLICT DO NOTHING). The per-device impact list is stored as JSONB.
 */
const CHANGES = [
  {
    id: 'QMSR', seq: 1, src: 'FDA · final rule', kind: 'regulation', when: 'Effective 2 Feb 2026', sev: 'high', live: true,
    title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
    summary: 'FDA replaces the Quality System Regulation with the Quality Management System Regulation, incorporating ISO 13485 by reference. Terminology, records (DHF→Medical Device File), and management-review expectations change.',
    affects: [
      { dev: 'Quality system (all devices)', what: 'QMS docs re-mapped to ISO 13485 clauses; DHF→MDF terminology', sub: 'Org-wide' },
      { dev: 'BX-204 CGM', what: 'Design & Development File terminology in the 510(k) DHF', sub: '510(k) OR-902' },
    ],
    action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan', owner: 'Quality', due: 'Effective now',
  },
  {
    id: 'AIACT', seq: 2, src: 'EU · regulation', kind: 'regulation', when: 'High-risk obligations Aug 2026', sev: 'high', live: true,
    title: 'EU AI Act — high-risk AI system obligations (medical devices)',
    summary: 'AI-enabled devices that are MDR/IVDR Class IIa+ are high-risk AI systems. Adds data-governance, transparency, human-oversight, and post-market-monitoring obligations layered on MDR — with conflicts to harmonize against ISO 14971.',
    affects: [{ dev: 'BX-204 predictive-low algorithm', what: 'AI Act technical documentation + ISO 14971 alignment', sub: 'EU MDR CE' }],
    action: 'AI Act dual-compliance assessment', doc: 'AI Act ↔ MDR harmonization dossier', owner: 'Reg', due: 'Aug 2026',
  },
  {
    id: 'CYBER', seq: 3, src: 'FDA · final guidance', kind: 'guidance', when: 'Jun 2025', sev: 'med', live: true,
    title: 'Cybersecurity in Premarket Submissions — SBOM required',
    summary: 'Connected devices must include a Software Bill of Materials, threat model, and security testing in the premarket submission. Applies to BX-204 (BLE connectivity).',
    affects: [{ dev: 'BX-204 CGM (BLE)', what: 'Add SBOM + threat model + pen-test report to eSTAR §15', sub: '510(k) OR-902' }],
    action: 'Cybersecurity documentation package', doc: 'SBOM + threat model + security testing', owner: 'Software', due: 'Before filing',
  },
  {
    id: '62304', seq: 4, src: 'IEC · standard revision', kind: 'standard', when: 'Ed 2 — transition', sev: 'med', live: false,
    title: 'IEC 62304 Edition 2 — software lifecycle',
    summary: 'Edition 2 broadens scope and revises safety-classification and legacy-software provisions. Affects all software-containing devices once harmonized.',
    affects: [{ dev: 'BX-204 firmware + app', what: 'Re-baseline software safety classification & lifecycle records', sub: '510(k) §15' }],
    action: 'Standard transition gap analysis', doc: 'IEC 62304 Ed 2 transition plan', owner: 'Software', due: 'Monitor',
  },
  {
    id: '10993', seq: 5, src: 'ISO · standard revision', kind: 'standard', when: '10993-1 revision', sev: 'low', live: false,
    title: 'ISO 10993-1 — biological evaluation revision',
    summary: 'Revised risk-based biocompatibility framework. Relevant to extended-wear skin contact (BX-204 14-day) and the open HZ-04 evaluation.',
    affects: [{ dev: 'BX-204 adhesive (14-day skin contact)', what: 'Re-confirm ISO 10993-11 endpoints under revised framework', sub: 'Risk file HZ-04' }],
    action: 'Biocompatibility re-assessment', doc: 'ISO 10993-1 gap memo', owner: 'Reg', due: 'Monitor',
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_reg_changes') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_reg_changes not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const c of CHANGES) {
    const r = await client.query(
      `INSERT INTO c2c_reg_changes (
         id, organization_id, seq, src, kind, when_label, sev, live,
         title, summary, affects, action, doc, owner, due
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        c.id, org.id, c.seq, c.src, c.kind, c.when, c.sev, c.live,
        c.title, c.summary, JSON.stringify(c.affects), c.action, c.doc, c.owner, c.due,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ reg change: ${inserted} regulatory changes seeded`);
}
