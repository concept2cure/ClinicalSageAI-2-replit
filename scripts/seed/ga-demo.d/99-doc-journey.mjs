/**
 * Wave-3 domain seed — document-journey lifecycle worklist.
 *
 * One document's full journey — §2.5 Clinical Overview on the BX-204 (rezatinib)
 * BLA — across nine stages from ideation to submission. Read by
 * GET /api/doc-journey; the v2 DocJourney surface renders the stage rail plus,
 * per stage, the content snapshot (brief / outline / doc / redline / qc /
 * assemble / submit) held as JSONB. Grounded in the app's BX-204 program — no
 * fabricated identities. to_regclass guarded, org-scoped, idempotent
 * (ON CONFLICT DO NOTHING).
 */
const STAGES = [
  {
    id: 'ideate', ord: 0, label: 'Ideation', ic: 'sparkles', when: 'May 28', who: 'AnA + J. Chen', ver: '—', done: true, active: false, sub: 'Need identified', kind: 'brief',
    snap: {
      mode: 'brief', title: 'Document brief', lines: [
        ['Document', 'Clinical Overview (CTD Module 2.5)'],
        ['Program', 'BX-204 (rezatinib) — BLA, accelerated approval'],
        ['Purpose', 'Integrated benefit-risk summary across the clinical program; the reviewer’s entry point to Module 5.'],
        ['Trigger', 'AnA flagged §2.5 as a required, not-started leaf gating the BLA content plan.'],
        ['Owner', 'A. Müller (Clinical) · reviewed by D. Okafor (VP RA)'],
      ],
    },
  },
  {
    id: 'outline', ord: 1, label: 'Outline', ic: 'list', when: 'May 29', who: 'AnA', ver: 'v0.1', done: true, active: false, sub: 'CTD §2.5 template (ICH M4E)', kind: 'outline',
    snap: {
      mode: 'outline', title: '2.5  Clinical overview — section skeleton', items: [
        '2.5.1  Product development rationale',
        '2.5.2  Overview of biopharmaceutics',
        '2.5.3  Overview of clinical pharmacology',
        '2.5.4  Overview of efficacy',
        '2.5.5  Overview of safety',
        '2.5.6  Benefits and risks conclusions',
      ], note: 'Template: ICH M4E(R2). Evidence linked: CSR-201, ISS, ISE, locked ADaM.',
    },
  },
  {
    id: 'draft', ord: 2, label: 'AnA draft', ic: 'penLine', when: 'May 30', who: 'AnA', ver: 'v0.2', done: true, active: false, sub: 'Drafted from clinical + safety files', kind: 'draft',
    snap: {
      mode: 'doc', wm: 'DRAFT v0.2', heading: '2.5.4  Overview of efficacy', body: [
        'In the pivotal study, the objective response rate was approximately 42%, supporting a meaningful clinical benefit in the intended population. [AnA draft — verify against locked CSR-201]',
        'Responses were durable, with a median duration of response exceeding six months.',
      ], prov: 'Drafted by AnA from §2.5.1–§2.5.5 + CSR-201. Model-assisted; unverified.',
    },
  },
  {
    id: 'revise', ord: 3, label: 'Author revision', ic: 'edit', when: 'Jun 4', who: 'A. Müller', ver: 'v0.4', done: true, active: false, sub: 'Human edits · tracked', kind: 'revise',
    snap: {
      mode: 'doc', wm: 'DRAFT v0.4', heading: '2.5.4  Overview of efficacy', body: [
        'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6; n=214), supporting durable clinical benefit.',
        'The median duration of response was 8.3 months (95% CI 6.1–11.2).',
      ], prov: 'Edited by A. Müller — figures reconciled to the locked CSR-201 primary analysis.',
    },
  },
  {
    id: 'review', ord: 4, label: 'Internal review', ic: 'messageSquare', when: 'Jun 9', who: 'Clinical · Biostat · Reg', ver: 'v0.9', done: true, active: false, sub: '3 reviewers · 7 comments resolved', kind: 'review',
    snap: {
      mode: 'redline', heading: '2.5.4  Overview of efficacy', redline: [
        { t: 'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6; n=214), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026), ', k: 'add' },
        { t: 'supporting durable clinical benefit.', k: 'keep' },
      ], comment: { by: 'Biostatistics', body: 'Add the data-lock provenance for the ORR claim.', status: 'resolved' },
    },
  },
  {
    id: 'qc', ord: 5, label: 'QC / preflight', ic: 'shieldCheck', when: 'Jun 12', who: 'AnA', ver: 'v0.9', done: true, active: false, sub: 'Consistency + citations validated', kind: 'qc',
    snap: {
      mode: 'qc', heading: '2.5.4 — preflight', checks: [
        ['Claim → evidence link', 'ok', 'ORR traces to locked ADaM ADRS'],
        ['Cross-document consistency', 'ok', 'ORR matches §2.7.3 + USPI §14'],
        ['Citation integrity', 'ok', '12 of 12 references resolve'],
        ['Open redlines', 'ok', '0 unresolved'],
        ['Confidence gutter', 'warn', '§2.5.5 safety para below 80% — flagged'],
      ],
    },
  },
  {
    id: 'approve', ord: 6, label: 'Approval · e-sign', ic: 'checkCircle', when: 'Jun 14', who: 'D. Okafor (VP RA)', ver: 'v1.0', done: true, active: false, sub: '21 CFR §11 e-signature', kind: 'approve',
    snap: {
      mode: 'doc', seal: 'APPROVED v1.0', heading: '2.5.4  Overview of efficacy', body: [
        { sub: '2.5.4.1  Pivotal efficacy — study BX204-201' },
        'The efficacy of BX-204 was established in BX204-201, a multicenter, single-arm, open-label trial in 214 adult patients with advanced RTK-X–overexpressing solid tumors who had received at least one prior line of systemic therapy. The primary endpoint was objective response rate (ORR) by blinded independent central review (BICR) per RECIST v1.1.',
        'In the primary analysis (ADaM ADRS; data lock 18 April 2026), the confirmed ORR was 42.1% (95% CI: 35.8, 48.6). Responses were durable: the median duration of response (DoR) was 8.3 months (95% CI: 6.1, 11.2), with 61% of responders maintaining response at six months. Results were consistent across pre-specified subgroups, including prior lines of therapy and tumor histology.',
        { sub: '2.5.4.2  Supportive efficacy' },
        'Supportive evidence from the dose-finding study BX204-102 (n=88) demonstrated concordant activity at the recommended Phase 2 dose, with an ORR of 39.8% (95% CI: 29.5, 50.8). The consistency of effect across studies, endpoints, and review methods supports the robustness of the efficacy conclusion under the accelerated-approval framework (21 CFR 601.41).',
      ], refs: [
        'BX204-201 Clinical Study Report, §11 (locked 18 Apr 2026).',
        'Integrated Summary of Efficacy (ISE), Module 2.7.3.',
        'FDA Guidance for Industry: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics (2018).',
      ], prov: 'E-signed by D. Okafor (VP Regulatory Affairs) · 14 Jun 2026 16:04 EDT · 21 CFR §11 · audit AUD-2.5-0091',
    },
  },
  {
    id: 'assemble', ord: 7, label: 'Assemble', ic: 'layers', when: 'Jun 16', who: 'AnA', ver: 'v1.0', done: true, active: false, sub: 'eCTD leaf m2.5 · operator "new"', kind: 'assemble',
    snap: {
      mode: 'assemble', heading: 'eCTD assembly', lines: [
        ['Leaf', 'm2/25-clin-over/clinical-overview.pdf'],
        ['Module', '2.5 Clinical Overview'],
        ['Operator', 'new'],
        ['Sequence', '0000 (original BLA)'],
        ['Format', 'PDF/A-1b · bookmarks + hyperlinks validated'],
        ['STF', 'not applicable (Module 2 summary)'],
      ], note: 'Placed into the dossier. eCTD validation: 0 errors, 0 warnings.',
    },
  },
  {
    id: 'submit', ord: 8, label: 'Submission', ic: 'rocket', when: 'Jun 18', who: 'Reg ops', ver: 'v1.0', done: false, active: true, sub: 'BLA 761xyz · sequence 0000 · FDA ESG', kind: 'submit',
    snap: {
      mode: 'submit', heading: 'Transmission', lines: [
        ['Submission', 'BLA 761xyz — original'],
        ['Sequence', '0000'],
        ['Gateway', 'FDA ESG (AS2) — secure'],
        ['Status', 'In transit · awaiting ACK1 receipt'],
        ['Center', 'CBER'],
      ], note: '§2.5 is part of the assembled sequence now transmitting. ACK1 (receipt) → ACK2 (validation) → ACK3 (Center) will post here.',
    },
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_doc_journeys') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_doc_journeys not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const s of STAGES) {
    const r = await client.query(
      `INSERT INTO c2c_doc_journeys (
         id, organization_id, ord, label, ic, when_label, who, ver, done, active, sub, kind, snap
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (organization_id, id) DO NOTHING`,
      [
        s.id, org.id, s.ord, s.label, s.ic, s.when, s.who, s.ver, s.done, s.active, s.sub, s.kind,
        JSON.stringify(s.snap),
      ],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ doc journey: ${inserted} lifecycle stages seeded`);
}
