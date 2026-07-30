/**
 * Wave-3 domain seed — shadow-review pre-file reviewer worklist into the REAL store.
 *
 * AnA simulates the reviewer who will read the submission BEFORE it is filed. For
 * each reviewer lens (FDA filing reviewer, EMA D120 assessor, PMDA, MDR/IVDR Notified
 * Body) this seeds a COMPLETE shadow-review run + its severity-scored findings against
 * the demo org's BX-204 BLA sequence — the exact tables runShadowReview persists
 * (shadow_review_runs + shadow_review_findings), and that GET /api/shadow-review now
 * reads (see server/services/shadow-review/shadow-review-view-assembler.ts). No blob,
 * no fixture: each run is the persisted output a real reviewer pass produces.
 *
 * Column lists mirror shadow-review-service.ts exactly; RTF/CRL scores are computed
 * with the same deterministic aggregateRisk the service uses. Idempotent (skips when a
 * run already exists for the org), org-scoped, created_by resolved from a real org
 * member, and each block is to_regclass-guarded + fail-safe.
 */

// Reviewer lens → the eCTD region the run is scored against.
const LENS_REGION = { fda_filing: 'fda', ema_d120: 'eu', pmda: 'jp', nb_mdr: 'eu', nb_ivdr: 'eu' };

const LENSES = [
  {
    lens: 'fda_filing',
    findings: [
      { dimension: 'crl', severity: 'major', title: 'Single pivotal trial without confirmatory support',
        detail: 'Efficacy rests on one pivotal study (BX204-301). The division may question whether a single trial meets the substantial-evidence standard for a full approval without a second adequate and well-controlled study or strong confirmatory evidence.',
        basis: 'FDA 1998 "Providing Clinical Evidence of Effectiveness" guidance; 21 CFR 314.126.',
        recommendation: 'Pre-empt in §2.5.4: argue statistical persuasiveness (p<0.001), internal consistency across subgroups, and mechanistic support; or confirm accelerated-approval framing.',
        leafRef: '2.5.4' },
      { dimension: 'crl', severity: 'major', title: 'Immunogenicity strategy may be insufficient for a biologic',
        detail: 'ADA assay validation and the neutralizing-antibody tier are summarized but the sampling schedule does not cover the full dosing interval at steady state.',
        basis: 'FDA Immunogenicity Testing guidance (2019); ICH S6(R1).',
        recommendation: 'Reconcile §2.7.2 ADA sampling with the clinical protocol; state the NAb cut-point basis.',
        leafRef: '2.7.2' },
      { dimension: 'rtf', severity: 'minor', title: 'Financial disclosure (Form 3454/3455) coverage not evident',
        detail: 'The application should certify/disclose financial interests for all clinical investigators in the pivotal study; the filing does not show a complete 3454/3455 set.',
        basis: '21 CFR Part 54; RTF checklist item.',
        recommendation: 'Attach the complete financial disclosure set under §1.3.4 before dispatch.',
        leafRef: '1.3.4' },
      { dimension: 'format', severity: 'minor', title: 'Hyperlink integrity in §2.5 cross-references',
        detail: 'Several cross-references in the Clinical Overview point to section numbers rather than eCTD leaf hyperlinks, which slows review navigation.',
        basis: 'FDA eCTD Technical Conformance Guide.',
        recommendation: 'Convert §2.5 cross-refs to bookmarked leaf hyperlinks in the compiled backbone.',
        leafRef: '2.5' },
      { dimension: 'crl', severity: 'minor', title: 'CMC comparability for the post-change lots reads thin',
        detail: '§3.2.S.4 presents comparability against 3 post-change lots; the acceptance criteria for the higher-order structure assays are not fully justified.',
        basis: 'ICH Q5E; FDA CMC review practice.',
        recommendation: 'Strengthen §3.2.S.4 comparability acceptance-criteria justification.',
        leafRef: '3.2.S.4' },
    ],
  },
  {
    lens: 'ema_d120',
    findings: [
      { dimension: 'crl', severity: 'major', title: 'Benefit-risk narrative not aligned to the EU SmPC',
        detail: 'The Day-120 assessors will expect §2.5.6 benefit-risk to map directly to the proposed SmPC §4.1/§4.4; the current overview asserts benefit in language stronger than the SmPC supports.',
        basis: 'EMA benefit-risk methodology; SmPC guideline.',
        recommendation: 'Align §2.5.6 wording to the estimand and the proposed SmPC; soften "establishes".',
        leafRef: '2.5.6' },
      { dimension: 'crl', severity: 'minor', title: 'Paediatric investigation plan status not stated',
        detail: 'The EU procedure expects a clear PIP compliance statement or waiver reference.',
        basis: 'Regulation (EC) No 1901/2006.',
        recommendation: 'State PIP decision number / waiver in §1.',
        leafRef: '1.0' },
      { dimension: 'format', severity: 'minor', title: 'EU M1 regional forms incomplete',
        detail: 'EU Module 1 application form and product-information annexes are not fully populated for the validation check.',
        basis: 'EU eCTD M1 specification.',
        recommendation: 'Complete EU M1 before validation submission.',
        leafRef: '1.0' },
    ],
  },
  {
    lens: 'pmda',
    findings: [
      { dimension: 'crl', severity: 'major', title: 'Japanese bridging / ethnic-factor rationale absent',
        detail: 'PMDA will look for an ICH E5 bridging argument or a rationale that the global data are extrapolable to the Japanese population.',
        basis: 'ICH E5(R1); ICH E17.',
        recommendation: 'Add an ethnic-sensitivity assessment and bridging rationale to §2.5.',
        leafRef: '2.5.1' },
      { dimension: 'format', severity: 'minor', title: 'eCTD-JP multi-byte encoding not confirmed',
        detail: 'PMDA requires UTF-8 with BOM for the JP backbone; the sequence encoding is not stated.',
        basis: 'eCTD-JP notification.',
        recommendation: 'Confirm UTF-8 (BOM) on the JP backbone at compile.',
        leafRef: '—' },
    ],
  },
  {
    lens: 'nb_mdr',
    findings: [
      { dimension: 'nb', severity: 'major', title: 'GSPR checklist has unlinked evidence',
        detail: 'Several General Safety and Performance Requirements cite evidence that is not linked to a document in the technical file.',
        basis: 'EU MDR 2017/745 Annex I / Annex II.',
        recommendation: 'Link every GSPR line to its evidence location before the completeness check.',
        leafRef: 'GSPR' },
      { dimension: 'nb', severity: 'minor', title: 'Clinical evaluation report predates the last design change',
        detail: 'The CER date is earlier than the most recent design revision; a Notified Body will question currency.',
        basis: 'MDCG 2020-13; MEDDEV 2.7/1 Rev 4.',
        recommendation: 'Re-issue the CER covering the latest design state.',
        leafRef: 'CER' },
    ],
  },
  {
    lens: 'nb_ivdr',
    findings: [
      { dimension: 'nb', severity: 'major', title: 'Performance Evaluation Report missing a pillar',
        detail: 'The PER does not fully evidence scientific validity; a Notified Body will raise a non-conformity.',
        basis: 'EU IVDR 2017/746 Annex XIII.',
        recommendation: 'Complete the scientific-validity pillar of the PER.',
        leafRef: 'PER' },
      { dimension: 'nb', severity: 'minor', title: 'Analytical performance lacks a claimed metric',
        detail: 'Limit of detection is claimed in the IFU but not evidenced in the analytical performance section.',
        basis: 'IVDR Annex I §9.1.',
        recommendation: 'Add the LoD study to the analytical performance evidence.',
        leafRef: 'AP' },
    ],
  },
];

// Deterministic RTF/CRL aggregation — mirror of aggregateRisk in shadow-review-service.ts.
const SEVERITY_WEIGHT = { critical: 1, major: 0.6, minor: 0.25, info: 0 };
function scoreDims(findings, dims) {
  const relevant = findings.filter((f) => dims.includes(f.dimension));
  if (relevant.length === 0) return 0;
  if (relevant.some((f) => f.severity === 'critical')) return 1;
  const sum = relevant.reduce((acc, f) => acc + (SEVERITY_WEIGHT[f.severity] ?? 0), 0);
  return Math.min(1, Number((sum / (relevant.length + 1) + 0.15 * Math.min(relevant.length, 3)).toFixed(3)));
}
function summarize(lens, findings) {
  const crit = findings.filter((f) => f.severity === 'critical').length;
  const major = findings.filter((f) => f.severity === 'major').length;
  if (crit > 0) return `${crit} blocking and ${major} substantive finding(s) — resolve before dispatch.`;
  if (major > 0) return `Fileable with ${major} substantive point(s) a reviewer would raise.`;
  return 'No blocking findings on the connected sequence.';
}

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['submissions', 'ectd_sequences', 'shadow_review_runs', 'shadow_review_findings']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping shadow-review seed`);
      return;
    }
  }
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id;
  if (!userId) {
    console.log('   ⚠ no org member to own the shadow review — skipping');
    return;
  }

  const already = await client.query(
    `SELECT id FROM shadow_review_runs WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [org.id],
  );
  if (already.rows.length > 0) {
    console.log('   ✓ shadow review: already seeded');
    return;
  }

  // The assembled BLA sequence the reviewer lenses are run over.
  const sub = await client.query(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, status, lifecycle_stage, organization_id, created_by)
     VALUES ('BX-204 BLA', 'BX-204', 'bla', 'biotech', 'fda', 'active', 'original', $1, $2) RETURNING id`,
    [org.id, userId],
  );
  const submissionId = Number(sub.rows[0].id);
  const seq = await client.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'original', 'validated', $2, $3) RETURNING id`,
    [submissionId, org.id, userId],
  );
  const sequenceId = Number(seq.rows[0].id);

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ shadow-review ${label}: ${e.message ?? e}`); }
  };

  let runs = 0;
  for (const l of LENSES) {
    await guard(`lens ${l.lens}`, async () => {
      const rtf = scoreDims(l.findings, ['rtf', 'format']);
      const crl = scoreDims(l.findings, ['crl', 'nb']);
      const run = await client.query(
        `INSERT INTO shadow_review_runs (sequence_id, region, lens, model, prompt_version, status, rtf_risk_score, crl_risk_score, summary, organization_id, created_by)
         VALUES ($1, $2, $3, 'seed', 'shadow-review@v1.0', 'complete', $4, $5, $6, $7, $8) RETURNING id`,
        [sequenceId, LENS_REGION[l.lens] ?? 'fda', l.lens, rtf, crl, summarize(l.lens, l.findings), org.id, userId],
      );
      const runId = Number(run.rows[0].id);
      for (const f of l.findings) {
        await client.query(
          `INSERT INTO shadow_review_findings (run_id, dimension, severity, title, detail, basis, recommendation, leaf_ref, status, organization_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10)`,
          [runId, f.dimension, f.severity, f.title, f.detail, f.basis, f.recommendation, f.leafRef, org.id, userId],
        );
      }
      runs++;
    });
  }

  console.log(`   ✓ shadow review: ${runs} reviewer lens run(s) seeded into the real store (submission ${submissionId})`);
}
