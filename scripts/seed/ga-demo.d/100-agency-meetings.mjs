/**
 * Wave-3 domain seed — agency-meetings worklist.
 *
 * Four regulator interactions across the BX-204 (rezatinib) program and the
 * Aurora CGM device — a granted Pre-IND (Type B), a requested End-of-Phase-2, a
 * held device Pre-Submission (Q-Sub) with minutes + commitments, and a planned
 * EMA Scientific Advice. Read by GET /api/agency-meetings; the v2
 * AgencyMeetings surface renders the meeting list and, per meeting, its briefing
 * book (sections + questions) and minutes (agreements + commitments), held as
 * JSONB. Mirrors the surface fixture — no fabricated data. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const MEETINGS = [
  {
    id: 'm1', type: 'Pre-IND', agency: 'FDA · CDER', cat: 'Type B', program: 'BX-204 · IND', status: 'granted',
    requested: '2026-05-02', granted: '2026-05-20', meets: '2026-07-08', clock: 'WRR due 2026-06-24',
    format: 'Written responses + teleconference', goal: 'Align on the nonclinical package and Phase 1 design before IND.',
    briefingBook: {
      title: 'Pre-IND briefing book · BX-204', state: 'In review', ver: 'v0.8', owner: 'J. Chen',
      sections: [
        { n: '1', label: 'Product & regulatory history', st: 'approved' },
        { n: '2', label: 'Nonclinical pharmacology / toxicology summary', st: 'review' },
        { n: '3', label: 'CMC overview', st: 'review' },
        { n: '4', label: 'Proposed Phase 1 clinical protocol synopsis', st: 'draft' },
        { n: '5', label: 'Specific questions to the Agency', st: 'draft', focus: true },
      ],
      questions: [
        { q: 'Does the Agency agree the 13-week GLP tox package supports the proposed Phase 1 starting dose?', area: 'Nonclinical', pos: 'Supported by MABEL + 10x safety factor.' },
        { q: 'Is the proposed first-in-human dose-escalation scheme (3+3) acceptable?', area: 'Clinical', pos: 'Aligns with precedent in RTK-X inhibitors.' },
        { q: 'Does the Agency concur the comparability protocol is sufficient for the planned process change?', area: 'CMC', pos: 'Pending the S3.2.S.4 reconciliation.' },
      ],
    },
    minutes: null,
  },
  {
    id: 'm2', type: 'End-of-Phase-2', agency: 'FDA · CDER', cat: 'Type B (EOP2)', program: 'BX-204 · NDA', status: 'requested',
    requested: '2026-06-10', granted: null, meets: null, clock: 'FDA grant/deny due 2026-06-31',
    format: 'Face-to-face', goal: 'Agree the Phase 3 pivotal design, endpoints, and the SAP before committing.',
    briefingBook: null, minutes: null,
  },
  {
    id: 'm3', type: 'Pre-Submission (Q-Sub)', agency: 'FDA · CDRH', cat: 'Q-Sub', program: 'Aurora CGM · 510(k)', status: 'held',
    requested: '2026-03-01', granted: '2026-03-18', meets: '2026-04-22', clock: 'Minutes received',
    format: 'Teleconference', goal: 'Confirm predicate strategy and the human-factors validation plan.',
    briefingBook: {
      title: 'Pre-Sub briefing book · Aurora CGM', state: 'Final', ver: 'v1.0', owner: 'M. Webb',
      sections: [
        { n: '1', label: 'Device description & intended use', st: 'approved' },
        { n: '2', label: 'Proposed predicate & SE rationale', st: 'approved' },
        { n: '3', label: 'Human-factors validation plan', st: 'approved' },
        { n: '4', label: 'Specific questions to the Agency', st: 'approved', focus: true },
      ],
      questions: [
        { q: 'Does CDRH agree K221847 is an appropriate primary predicate?', area: 'Predicate', pos: 'Same intended use; iCGM special controls.' },
        { q: 'Is the summative human-factors protocol adequate for the use-related risks?', area: 'Human factors', pos: '15 users/group per IEC 62366-1.' },
      ],
    },
    minutes: {
      received: '2026-04-29',
      agree: [
        'CDRH concurred K221847 is an acceptable primary predicate.',
        'Summative HF protocol acceptable with critical-task list expanded to include sensor insertion.',
      ],
      commitments: [
        { c: 'Expand HF critical-task analysis to cover insertion-site errors.', doc: 'Human-factors validation plan', due: 'Before 510(k)', st: 'open' },
        { c: 'Provide stratified MARD by age band in the clinical performance report.', doc: 'Performance -- clinical', due: 'In submission', st: 'open' },
      ],
    },
  },
  {
    id: 'm4', type: 'Scientific Advice', agency: 'EMA · CHMP/SAWP', cat: 'EMA SA', program: 'BX-204 · MAA', status: 'planned',
    requested: null, granted: null, meets: '2026-09-15 (target)', clock: 'Letter of Intent by 2026-07-20',
    format: 'SAWP discussion', goal: 'Parallel EU view on the pivotal design + confirmatory evidence.',
    briefingBook: null, minutes: null,
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_agency_meetings') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_agency_meetings not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const m of MEETINGS) {
    const r = await client.query(
      `INSERT INTO c2c_agency_meetings (
         id, organization_id, type, agency, cat, program, status,
         requested, granted, meets, clock, format, goal,
         briefing_book, minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14::jsonb, $15::jsonb)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        m.id, org.id, m.type, m.agency, m.cat, m.program, m.status,
        m.requested, m.granted, m.meets, m.clock, m.format, m.goal,
        m.briefingBook === null ? null : JSON.stringify(m.briefingBook),
        m.minutes === null ? null : JSON.stringify(m.minutes),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ agency meetings: ${inserted} meetings seeded`);
}
