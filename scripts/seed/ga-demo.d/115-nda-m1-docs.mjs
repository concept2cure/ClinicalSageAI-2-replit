/**
 * Wave-3 domain seed — NDA/BLA Module-1 administrative worklist (BX-204 · NDA 212345).
 *
 * The Module 1 admin document set matching the v2 NdaCockpit fixture, so the
 * "Module 1 admin" list renders (and appends) off real org data. Read by
 * GET /api/nda-cockpit/m1, appended by POST /api/nda-cockpit/m1. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING). `seq` fixes order.
 */
const M1_DOCS = [
  { id: '356h', label: 'Form FDA 356h — Application to Market a New Drug', st: 'complete', blocker: false, note: null },
  { id: 'cover', label: 'Cover letter & comprehensive table of contents', st: 'complete', blocker: false, note: null },
  { id: '1571', label: 'Form FDA 3674 — Certification of compliance (CT.gov)', st: 'complete', blocker: false, note: null },
  { id: 'fin', label: 'Financial disclosure (Forms 3454 / 3455)', st: 'review', blocker: true, note: '2 of 41 investigators outstanding' },
  { id: 'pdufa', label: 'PDUFA user fee — cover sheet & payment', st: 'complete', blocker: false, note: null },
  { id: 'ipsp', label: 'Pediatric: agreed iPSP / PREA assessment', st: 'draft', blocker: false, note: null },
  { id: 'patent', label: 'Patent & exclusivity (Form 3542 / 3542a)', st: 'draft', blocker: false, note: null },
  { id: 'debar', label: 'Debarment certification (FDC Act §306(k)(1))', st: 'complete', blocker: false, note: null },
  { id: 'field', label: 'Field copy certification', st: 'complete', blocker: false, note: null },
  { id: 'label', label: 'Proposed prescribing information (PLR/PLLR · SPL)', st: 'review', blocker: false, note: null },
  { id: 'rems', label: 'REMS — proposed (if required)', st: 'na', blocker: false, note: 'Not required — risk managed by labeling' },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_nda_m1_docs') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_nda_m1_docs not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (let i = 0; i < M1_DOCS.length; i++) {
    const d = M1_DOCS[i];
    const r = await client.query(
      `INSERT INTO c2c_nda_m1_docs (organization_id, id, label, st, blocker, note, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [org.id, d.id, d.label, d.st, d.blocker, d.note, i],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ NDA cockpit: ${inserted} Module-1 admin document rows seeded`);
}
