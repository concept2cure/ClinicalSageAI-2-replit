/**
 * Wave-3 domain seed — labeling / prescribing-information worklist into the REAL store.
 *
 * The BX-204 (rezatinib) USPI under PLLR / 21 CFR 201.57 as a per-section
 * worklist, seeded into the REAL, org-scoped `labeling_pi_sections` store
 * (migration 20260801_labeling_pi_store.sql) — the exact table
 * labeling-pi-service.ts writes via POST /api/labeling-pi, and that GET
 * /api/labeling-pi now reads. No blob: each section carries its authoring
 * status, whether FDA proposed an edit (flag), the rendered label text
 * (content JSONB) and the end-of-cycle negotiation redline (negotiation JSONB).
 * Document order is derived from the section number on read — no stored seq.
 * to_regclass guarded, org-scoped, idempotent (upsert target's partial unique
 * index; skips when the org already has live sections), created_by resolved
 * from a real org member.
 */
const CONTENT = {
  HL: { heading: 'Highlights of prescribing information', body: [
    'These highlights do not include all the information needed to use BX-204 safely and effectively. See full prescribing information for BX-204.',
    'BX-204 (rezatinib) injection, for intravenous use. Initial U.S. Approval: 2026',
  ], hl: true },
  BW: { heading: 'Boxed warning -- severe infusion-related reactions', body: [
    'Severe, life-threatening infusion-related reactions have occurred. Premedicate and monitor. Interrupt or discontinue for severe reactions. (5.1)',
  ], warn: true },
  '1': { heading: '1  Indications and usage', body: [
    'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors who have received at least one prior line of systemic therapy.',
    'This indication is approved under accelerated approval based on overall response rate and duration of response. Continued approval may be contingent upon verification and description of clinical benefit in a confirmatory trial.',
  ] },
  '8': { heading: '8  Use in specific populations', body: [
    '8.1 Pregnancy -- Based on its mechanism of action, BX-204 can cause fetal harm. Advise pregnant women of the potential risk to a fetus.',
    '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established.',
  ] },
};

const NEGOTIATION = {
  '1': { round: 'Labeling round 2', cycle: 'FDA -- day 312 of review',
    sponsor: 'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors.',
    agency: 'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors who have received at least one prior line of systemic therapy.',
    rationale: 'FDA proposes restricting the indicated population to second-line+ to align with the pivotal trial enrollment (BX204-201). Accepting narrows the indication; countering requires first-line efficacy data.' },
  BW: { round: 'Labeling round 2', cycle: 'FDA -- day 312 of review',
    sponsor: '(no boxed warning proposed)',
    agency: 'BOXED WARNING: Severe, life-threatening infusion-related reactions have occurred...',
    rationale: 'FDA proposes adding a Boxed Warning based on 4 Grade >=3 infusion reactions in the safety database. AnA assessment: defensible to counter to a §5.1 Warning given the manageable, premedication-responsive profile -- but precedent in this class favors the boxed warning.' },
  '8': { round: 'Labeling round 1', cycle: 'FDA -- day 286 of review',
    sponsor: '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established. A pediatric study is planned under the iPSP.',
    agency: '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established.',
    rationale: 'FDA proposes removing the forward-looking iPSP sentence from labeling (belongs in the PMR, not the PI). Low-stakes -- accept.' },
};

/* USPI -- PLLR / 21 CFR 201.57 full prescribing information (BX-204 worklist) */
const SECTIONS = [
  { n: 'HL', label: 'Highlights of prescribing information', st: 'review' },
  { n: 'BW', label: 'Boxed warning', st: 'negotiation', flag: 'agency' },
  { n: '1', label: 'Indications and usage', st: 'negotiation', flag: 'agency' },
  { n: '2', label: 'Dosage and administration', st: 'review' },
  { n: '3', label: 'Dosage forms and strengths', st: 'approved' },
  { n: '4', label: 'Contraindications', st: 'approved' },
  { n: '5', label: 'Warnings and precautions', st: 'review' },
  { n: '6', label: 'Adverse reactions', st: 'review' },
  { n: '7', label: 'Drug interactions', st: 'draft' },
  { n: '8', label: 'Use in specific populations', st: 'negotiation', flag: 'agency' },
  { n: '9', label: 'Drug abuse and dependence', st: 'na' },
  { n: '10', label: 'Overdosage', st: 'draft' },
  { n: '11', label: 'Description', st: 'approved' },
  { n: '12', label: 'Clinical pharmacology', st: 'review' },
  { n: '13', label: 'Nonclinical toxicology', st: 'draft' },
  { n: '14', label: 'Clinical studies', st: 'review' },
  { n: '16', label: 'How supplied / storage and handling', st: 'approved' },
  { n: '17', label: 'Patient counseling information', st: 'draft' },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.labeling_pi_sections') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ labeling_pi_sections not found — run migrations first, skipping');
    return;
  }
  const existing = await client.query(
    `SELECT 1 FROM labeling_pi_sections WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (existing.rowCount) {
    console.log('   ✓ labeling pi: already seeded');
    return;
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id ?? null;

  let inserted = 0;
  for (const s of SECTIONS) {
    const content = CONTENT[s.n] ?? null;
    const negotiation = NEGOTIATION[s.n] ?? null;
    const r = await client.query(
      `INSERT INTO labeling_pi_sections (
         organization_id, section_no, label, status, flag, program, content, negotiation, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       ON CONFLICT (organization_id, section_no) WHERE deleted_at IS NULL DO NOTHING`,
      [
        org.id, s.n, s.label, s.st, s.flag ?? null, 'BX-204 (rezatinib)',
        content === null ? null : JSON.stringify(content),
        negotiation === null ? null : JSON.stringify(negotiation),
        userId,
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ labeling pi: ${inserted} label section(s) seeded into labeling_pi_sections`);
}
