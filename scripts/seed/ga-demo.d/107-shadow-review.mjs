/**
 * Wave-3 domain seed — shadow-review pre-file reviewer worklist.
 *
 * AnA simulates the reviewer who will read the submission BEFORE it is filed.
 * For each reviewer lens (FDA filing reviewer, EMA D120 assessor, PMDA, MDR/IVDR
 * Notified Body) this seeds the findings a reviewer would raise against the demo
 * org's BX-204 BLA 761123 sequence — the Refuse-to-File / CRL / non-conformity
 * risk items, each with the fix that closes it. Read by GET /api/shadow-review;
 * the v2 ShadowReview surface renders the per-lens finding list. Grounded in the
 * app's BX-204 program — no fabricated data beyond the program/sequence codes.
 * The per-lens findings list is stored as JSONB. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING). Mirrors the surface fixture
 * client/src/concept2cure/v2/fixtures/shadow-review-data.ts.
 */
const LENSES = [
  {
    lens: 'fda_filing', seq: 1,
    findings: [
      {
        dimension: 'crl', severity: 'major', title: 'Single pivotal trial without confirmatory support',
        detail: 'Efficacy rests on one pivotal study (BX204-301). The division may question whether a single trial meets the substantial-evidence standard for a full approval without a second adequate and well-controlled study or strong confirmatory evidence.',
        basis: 'FDA 1998 "Providing Clinical Evidence of Effectiveness" guidance; 21 CFR 314.126.',
        recommendation: 'Pre-empt in §2.5.4: argue statistical persuasiveness (p<0.001), internal consistency across subgroups, and mechanistic support; or confirm accelerated-approval framing.',
        leafRef: '2.5.4',
      },
      {
        dimension: 'crl', severity: 'major', title: 'Immunogenicity strategy may be insufficient for a biologic',
        detail: 'ADA assay validation and the neutralizing-antibody tier are summarized but the sampling schedule does not cover the full dosing interval at steady state.',
        basis: 'FDA Immunogenicity Testing guidance (2019); ICH S6(R1).',
        recommendation: 'Reconcile §2.7.2 ADA sampling with the clinical protocol; state the NAb cut-point basis.',
        leafRef: '2.7.2',
      },
      {
        dimension: 'rtf', severity: 'minor', title: 'Financial disclosure (Form 3454/3455) coverage not evident',
        detail: 'The application should certify/disclose financial interests for all clinical investigators in the pivotal study; the filing does not show a complete 3454/3455 set.',
        basis: '21 CFR Part 54; RTF checklist item.',
        recommendation: 'Attach the complete financial disclosure set under §1.3.4 before dispatch.',
        leafRef: '1.3.4',
      },
      {
        dimension: 'format', severity: 'minor', title: 'Hyperlink integrity in §2.5 cross-references',
        detail: 'Several cross-references in the Clinical Overview point to section numbers rather than eCTD leaf hyperlinks, which slows review navigation.',
        basis: 'FDA eCTD Technical Conformance Guide.',
        recommendation: 'Convert §2.5 cross-refs to bookmarked leaf hyperlinks in the compiled backbone.',
        leafRef: '2.5',
      },
      {
        dimension: 'crl', severity: 'minor', title: 'CMC comparability for the post-change lots reads thin',
        detail: '§3.2.S.4 presents comparability against 3 post-change lots; the acceptance criteria for the higher-order structure assays are not fully justified.',
        basis: 'ICH Q5E; FDA CMC review practice.',
        recommendation: 'Strengthen §3.2.S.4 comparability acceptance-criteria justification.',
        leafRef: '3.2.S.4',
      },
    ],
  },
  {
    lens: 'ema_d120', seq: 2,
    findings: [
      {
        dimension: 'crl', severity: 'major', title: 'Benefit-risk narrative not aligned to the EU SmPC',
        detail: 'The Day-120 assessors will expect §2.5.6 benefit-risk to map directly to the proposed SmPC §4.1/§4.4; the current overview asserts benefit in language stronger than the SmPC supports.',
        basis: 'EMA benefit-risk methodology; SmPC guideline.',
        recommendation: 'Align §2.5.6 wording to the estimand and the proposed SmPC; soften "establishes".',
        leafRef: '2.5.6',
      },
      {
        dimension: 'crl', severity: 'minor', title: 'Paediatric investigation plan status not stated',
        detail: 'The EU procedure expects a clear PIP compliance statement or waiver reference.',
        basis: 'Regulation (EC) No 1901/2006.',
        recommendation: 'State PIP decision number / waiver in §1.',
        leafRef: '1.0',
      },
      {
        dimension: 'format', severity: 'minor', title: 'EU M1 regional forms incomplete',
        detail: 'EU Module 1 application form and product-information annexes are not fully populated for the validation check.',
        basis: 'EU eCTD M1 specification.',
        recommendation: 'Complete EU M1 before validation submission.',
        leafRef: '1.0',
      },
    ],
  },
  {
    lens: 'pmda', seq: 3,
    findings: [
      {
        dimension: 'crl', severity: 'major', title: 'Japanese bridging / ethnic-factor rationale absent',
        detail: 'PMDA will look for an ICH E5 bridging argument or a rationale that the global data are extrapolable to the Japanese population.',
        basis: 'ICH E5(R1); ICH E17.',
        recommendation: 'Add an ethnic-sensitivity assessment and bridging rationale to §2.5.',
        leafRef: '2.5.1',
      },
      {
        dimension: 'format', severity: 'minor', title: 'eCTD-JP multi-byte encoding not confirmed',
        detail: 'PMDA requires UTF-8 with BOM for the JP backbone; the sequence encoding is not stated.',
        basis: 'eCTD-JP notification.',
        recommendation: 'Confirm UTF-8 (BOM) on the JP backbone at compile.',
        leafRef: '—',
      },
    ],
  },
  {
    lens: 'nb_mdr', seq: 4,
    findings: [
      {
        dimension: 'nb', severity: 'major', title: 'GSPR checklist has unlinked evidence',
        detail: 'Several General Safety and Performance Requirements cite evidence that is not linked to a document in the technical file.',
        basis: 'EU MDR 2017/745 Annex I / Annex II.',
        recommendation: 'Link every GSPR line to its evidence location before the completeness check.',
        leafRef: 'GSPR',
      },
      {
        dimension: 'nb', severity: 'minor', title: 'Clinical evaluation report predates the last design change',
        detail: 'The CER date is earlier than the most recent design revision; a Notified Body will question currency.',
        basis: 'MDCG 2020-13; MEDDEV 2.7/1 Rev 4.',
        recommendation: 'Re-issue the CER covering the latest design state.',
        leafRef: 'CER',
      },
    ],
  },
  {
    lens: 'nb_ivdr', seq: 5,
    findings: [
      {
        dimension: 'nb', severity: 'major', title: 'Performance Evaluation Report missing a pillar',
        detail: 'The PER does not fully evidence scientific validity; a Notified Body will raise a non-conformity.',
        basis: 'EU IVDR 2017/746 Annex XIII.',
        recommendation: 'Complete the scientific-validity pillar of the PER.',
        leafRef: 'PER',
      },
      {
        dimension: 'nb', severity: 'minor', title: 'Analytical performance lacks a claimed metric',
        detail: 'Limit of detection is claimed in the IFU but not evidenced in the analytical performance section.',
        basis: 'IVDR Annex I §9.1.',
        recommendation: 'Add the LoD study to the analytical performance evidence.',
        leafRef: 'AP',
      },
    ],
  },
];

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_shadow_review') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_shadow_review not found — run migrations first, skipping');
    return;
  }
  let inserted = 0;
  for (const l of LENSES) {
    const r = await client.query(
      `INSERT INTO c2c_shadow_review (organization_id, lens, seq, findings)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (organization_id, lens) DO NOTHING`,
      [org.id, l.lens, l.seq, JSON.stringify(l.findings)],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`   ✓ shadow review: ${inserted} reviewer lenses seeded`);
}
