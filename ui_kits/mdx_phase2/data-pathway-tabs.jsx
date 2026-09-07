/* Data fixtures for the four pathway sub-tabs that all pathway surfaces share:
   Workspace · Audit · Correspondence · Approvals.

   Pathway-specific where the data is pathway-specific (correspondence kinds:
   RTA = 510(k), Day-100 = PMA, NB Q&A = CER), pathway-agnostic where the
   data is the same shape (audit log, approvals).

   All times rendered as ISO 8601; the UI formats them. Hash chain is shown
   in full so users can verify SHA-256 prefixes line up across rows. */

/* ─────────────────────────────────────────────────────────────
   AUDIT TRAIL — 21 CFR Part 11 §11.10(e)
   Kinds: section.edit · section.lock · section.unlock · review.start
          · review.complete · sign · comment · attach · export · access
   ───────────────────────────────────────────────────────────── */

const AUDIT_KIND_META = {
  'section.edit':      { label: 'Edit',      tone: 'neutral' },
  'section.lock':      { label: 'Lock',      tone: 'neutral' },
  'section.unlock':    { label: 'Unlock',    tone: 'warn'    },
  'review.start':      { label: 'Review',    tone: 'neutral' },
  'review.complete':   { label: 'Verified',  tone: 'success' },
  'sign':              { label: 'E-sign',    tone: 'accent'  },
  'comment':           { label: 'Comment',   tone: 'neutral' },
  'attach':            { label: 'Attach',    tone: 'neutral' },
  'export':            { label: 'Export',    tone: 'neutral' },
  'access':            { label: 'Access',    tone: 'neutral' },
};

/* Helper — synthesize hash-chain prefixes that visually link */
function chain(seed, n) {
  const out = [];
  let prev = seed;
  for (let i = 0; i < n; i++) {
    const cur = (prev * 2654435761 + 0x9e3779b9) >>> 0;
    out.push({
      hash: cur.toString(16).padStart(8, '0') + '…' + (cur ^ 0xa5a5a5a5).toString(16).padStart(4, '0'),
      prev: prev.toString(16).padStart(8, '0'),
    });
    prev = cur;
  }
  return out;
}

const K510_AUDIT_HASHES = chain(0x4f3a91c2, 14);
const PMA_AUDIT_HASHES  = chain(0x7b1d2e88, 12);
const CER_AUDIT_HASHES  = chain(0x39c87a05, 11);

const K510_AUDIT = [
  { id: 'a-014', when: '2026-04-29T14:32:18Z', kind: 'sign',            actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'eSTAR §11 — Performance testing', target_id: 11, ip: '10.0.4.21', sig: 'WP-7341', signed: true },
  { id: 'a-013', when: '2026-04-29T14:31:02Z', kind: 'review.complete', actor: 'Priya Shah',     role: 'QA',         target: 'eSTAR §11 — Performance testing', target_id: 11, ip: '10.0.4.88' },
  { id: 'a-012', when: '2026-04-29T11:18:44Z', kind: 'comment',         actor: 'Marcus Wei',     role: 'Biostat',    target: 'eSTAR §11 — Performance testing', target_id: 11, body: 'Adjudicated MARD on §11.4 should reference Table 7, not Table 5.', ip: '10.0.4.51' },
  { id: 'a-011', when: '2026-04-29T10:55:08Z', kind: 'section.edit',    actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'eSTAR §11.4 — Accuracy', target_id: 11, diff: '+412 / −38', ip: '10.0.4.21' },
  { id: 'a-010', when: '2026-04-29T10:42:11Z', kind: 'attach',          actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'eSTAR §11 — Performance testing', target_id: 11, file: 'mard-by-age-band.pdf · 1.4 MB', ip: '10.0.4.21' },
  { id: 'a-009', when: '2026-04-28T17:20:55Z', kind: 'review.start',    actor: 'Priya Shah',     role: 'QA',         target: 'eSTAR §11 — Performance testing', target_id: 11, ip: '10.0.4.88' },
  { id: 'a-008', when: '2026-04-28T16:08:17Z', kind: 'section.lock',    actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'eSTAR §07 — Indications', target_id: 7,  ip: '10.0.4.21' },
  { id: 'a-007', when: '2026-04-28T15:44:02Z', kind: 'sign',            actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'eSTAR §07 — Indications', target_id: 7,  ip: '10.0.4.62', sig: 'WP-7340', signed: true },
  { id: 'a-006', when: '2026-04-28T11:02:30Z', kind: 'export',          actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'Predicate comparison · K221847', file: 'predicate-K221847.pdf · signed export', ip: '10.0.4.21' },
  { id: 'a-005', when: '2026-04-27T16:12:01Z', kind: 'section.edit',    actor: 'Marcus Wei',     role: 'Biostat',    target: 'eSTAR §10 — Software', target_id: 10, diff: '+89 / −12', ip: '10.0.4.51' },
  { id: 'a-004', when: '2026-04-27T14:33:48Z', kind: 'comment',         actor: 'Priya Shah',     role: 'QA',         target: 'eSTAR §10 — Software', target_id: 10, body: 'Cybersecurity reference must cite FDA 2023 guidance, not 2018.', ip: '10.0.4.88' },
  { id: 'a-003', when: '2026-04-27T10:48:22Z', kind: 'section.unlock',  actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'eSTAR §10 — Software', target_id: 10, reason: 'Updating cybersecurity reference', ip: '10.0.4.21' },
  { id: 'a-002', when: '2026-04-26T18:05:11Z', kind: 'access',          actor: 'External — FDA reviewer', role: 'CDRH', target: 'Submission package · K-251401', ip: 'fda-eub.fda.gov' },
  { id: 'a-001', when: '2026-04-26T09:01:00Z', kind: 'review.start',    actor: 'Jordan Chen',    role: 'Reg Lead',   target: 'Pre-submission validation', ip: '10.0.4.21' },
].map((r, i) => ({ ...r, hash: K510_AUDIT_HASHES[i].hash, prev: K510_AUDIT_HASHES[i].prev }));

const PMA_AUDIT = [
  { id: 'pa-012', when: '2026-04-29T15:11:08Z', kind: 'sign',            actor: 'Sara Okafor',    role: 'Clin Ops',   target: 'PMA Module 2.7 — Clinical Summary', target_id: 'M27', ip: '10.0.4.34', sig: 'WP-9221', signed: true },
  { id: 'pa-011', when: '2026-04-29T13:48:33Z', kind: 'review.complete', actor: 'Marcus Wei',     role: 'Biostat',    target: 'PMA Module 5.3.5 — Pivotal trial', target_id: 'M535', ip: '10.0.4.51' },
  { id: 'pa-010', when: '2026-04-29T11:02:17Z', kind: 'section.edit',    actor: 'Sara Okafor',    role: 'Clin Ops',   target: 'PMA Module 2.7.4 — AE summary', target_id: 'M274', diff: '+1,221 / −104', ip: '10.0.4.34' },
  { id: 'pa-009', when: '2026-04-29T09:33:55Z', kind: 'attach',          actor: 'Marcus Wei',     role: 'Biostat',    target: 'PMA Module 5.3.5 — Pivotal trial', file: 'efficacy-by-arm.csv · 84 KB', ip: '10.0.4.51' },
  { id: 'pa-008', when: '2026-04-28T17:55:42Z', kind: 'comment',         actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'PMA Module 2.5 — Clinical Overview', target_id: 'M25', body: 'Need to reconcile primary endpoint analysis with revised SAP v3.', ip: '10.0.4.62' },
  { id: 'pa-007', when: '2026-04-28T15:18:20Z', kind: 'section.lock',    actor: 'Sara Okafor',    role: 'Clin Ops',   target: 'PMA Module 1.1 — Forms', target_id: 'M11', ip: '10.0.4.34' },
  { id: 'pa-006', when: '2026-04-28T11:42:09Z', kind: 'review.start',    actor: 'Priya Shah',     role: 'QA',         target: 'PMA Module 2.7 — Clinical Summary', target_id: 'M27', ip: '10.0.4.88' },
  { id: 'pa-005', when: '2026-04-27T16:30:00Z', kind: 'section.edit',    actor: 'Sara Okafor',    role: 'Clin Ops',   target: 'PMA Module 2.7.3 — Efficacy', target_id: 'M273', diff: '+602 / −18', ip: '10.0.4.34' },
  { id: 'pa-004', when: '2026-04-27T14:08:34Z', kind: 'export',          actor: 'Marcus Wei',     role: 'Biostat',    target: 'Statistical analysis tables', file: 'sap-v3-output.zip · 2.1 MB', ip: '10.0.4.51' },
  { id: 'pa-003', when: '2026-04-27T10:15:11Z', kind: 'section.edit',    actor: 'Sara Okafor',    role: 'Clin Ops',   target: 'PMA Module 5.3.5 — Pivotal trial', target_id: 'M535', diff: '+45 / −80', ip: '10.0.4.34' },
  { id: 'pa-002', when: '2026-04-26T15:44:50Z', kind: 'comment',         actor: 'Marcus Wei',     role: 'Biostat',    target: 'PMA Module 2.7.3 — Efficacy', target_id: 'M273', body: 'PP analysis ready for review.', ip: '10.0.4.51' },
  { id: 'pa-001', when: '2026-04-26T09:00:00Z', kind: 'access',          actor: 'External — FDA reviewer', role: 'CDRH', target: 'PMA submission · P251008', ip: 'fda-eub.fda.gov' },
].map((r, i) => ({ ...r, hash: PMA_AUDIT_HASHES[i].hash, prev: PMA_AUDIT_HASHES[i].prev }));

const CER_AUDIT = [
  { id: 'ca-011', when: '2026-04-29T14:02:11Z', kind: 'review.complete', actor: 'Priya Shah',      role: 'QA',          target: 'CER §6 — Clinical data', target_id: 6, ip: '10.0.4.88' },
  { id: 'ca-010', when: '2026-04-29T11:30:08Z', kind: 'section.edit',    actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'CER §6.4 — Adjudicated cases', target_id: 6, diff: '+312 / −44', ip: '10.0.4.62' },
  { id: 'ca-009', when: '2026-04-29T09:15:45Z', kind: 'comment',         actor: 'Jordan Chen',     role: 'Reg Lead',    target: 'CER §6.2 — Literature review', target_id: 6, body: 'Need at least 250 hits for notified body — current is 412, OK.', ip: '10.0.4.21' },
  { id: 'ca-008', when: '2026-04-28T17:08:02Z', kind: 'attach',          actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'CER §6 — Clinical data', file: 'lead-dislodgement-cases.xlsx · 96 KB', ip: '10.0.4.62' },
  { id: 'ca-007', when: '2026-04-28T14:44:30Z', kind: 'review.start',    actor: 'Priya Shah',      role: 'QA',          target: 'CER §6 — Clinical data', target_id: 6, ip: '10.0.4.88' },
  { id: 'ca-006', when: '2026-04-28T10:22:15Z', kind: 'section.edit',    actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'CER §7 — PMS plan', target_id: 7, diff: '+88 / −12', ip: '10.0.4.62' },
  { id: 'ca-005', when: '2026-04-27T16:50:08Z', kind: 'sign',            actor: 'Jordan Chen',     role: 'Reg Lead',    target: 'CER §3 — State of the art', target_id: 3, ip: '10.0.4.21', sig: 'WP-9412', signed: true },
  { id: 'ca-004', when: '2026-04-27T15:02:42Z', kind: 'comment',         actor: 'Priya Shah',      role: 'QA',          target: 'CER §3 — State of the art', target_id: 3, body: 'Article 61 alignment confirmed against MDCG 2020-13.', ip: '10.0.4.88' },
  { id: 'ca-003', when: '2026-04-27T11:18:03Z', kind: 'section.lock',    actor: 'Dr. Lee Hartman', role: 'Med Affairs', target: 'CER §3 — State of the art', target_id: 3, ip: '10.0.4.62' },
  { id: 'ca-002', when: '2026-04-26T14:30:55Z', kind: 'export',          actor: 'Jordan Chen',     role: 'Reg Lead',    target: 'Literature search results', file: 'pubmed-2020-2026.csv · 4.1 MB', ip: '10.0.4.21' },
  { id: 'ca-001', when: '2026-04-26T09:00:00Z', kind: 'access',          actor: 'External — TÜV SÜD reviewer', role: 'Notified body', target: 'CER · IV-415', ip: 'eurev.tuv-sud.com' },
].map((r, i) => ({ ...r, hash: CER_AUDIT_HASHES[i].hash, prev: CER_AUDIT_HASHES[i].prev }));

/* ─────────────────────────────────────────────────────────────
   CORRESPONDENCE — agency / NB letters and queries.
   Pathway-specific kinds:
     510(k):  Refuse-to-Accept (RTA) · AI-Hold · Interactive Review
     PMA:     Day-100 · Major Deficiency · Approvable Letter
     CER:     NB Q&A · NB Major NC · NB Minor NC
   ───────────────────────────────────────────────────────────── */

const K510_CORRESP = [
  { id: 'rta-3', kind: 'AI-Hold',           channel: 'CDRH eSTAR',   from: 'CDRH',                    received: '2026-04-29T08:14:00Z', due: '2026-05-13', status: 'open',     ai: true,
    subject: 'AI-Hold · §11.4 accuracy sub-analysis by age band missing',
    summary: 'Reviewer requests stratified MARD by age decile (18–39, 40–64, 65+). Provide §11.4 update + raw CSV with adjudicated comparator.',
    refs:    [{ section: 11, label: '§11 Performance testing' }],
    triage:  { ana: 'Auto-flag · Age stratification', priority: 'high', owner: 'Marcus Wei', tasks: 2 } },
  { id: 'rta-2', kind: 'Interactive Review', channel: 'eCopy',        from: 'CDRH',                    received: '2026-04-26T15:32:00Z', due: '2026-05-03', status: 'open',     ai: false,
    subject: 'Interactive Review · Predicate K221847 software comparison',
    summary: 'Provide side-by-side software architecture diagram comparing subject device to K221847; clarify CGM algorithm classifier difference.',
    refs:    [{ section: 10, label: '§10 Software' }, { section: 5, label: '§5 Predicate comparison' }],
    triage:  { ana: 'Draft response from §10 + §5', priority: 'med', owner: 'Jordan Chen', tasks: 1 } },
  { id: 'rta-1', kind: 'RTA',                channel: 'CDRH eSTAR',   from: 'CDRH',                    received: '2026-04-21T11:08:00Z', due: '2026-04-28', status: 'closed',   ai: false,
    subject: 'RTA · Acceptance review complete · package accepted',
    summary: 'Acceptance review complete. Submission accepted for substantive review. Reviewer assigned: Dr. R. Tanaka.',
    refs:    [],
    triage:  { ana: 'No action', priority: 'low', owner: 'Jordan Chen', tasks: 0 } },
];

const PMA_CORRESP = [
  { id: 'd100-2', kind: 'Day-100',          channel: 'CDRH letter',  from: 'CDRH',                    received: '2026-04-28T16:11:00Z', due: '2026-05-28', status: 'open',     ai: true,
    subject: 'Day-100 · Pivotal trial · primary endpoint analysis revision',
    summary: '5 deficiencies. PE re-analysis using SAP v3, MARD by age band, AE adjudication committee composition, biocompatibility extractables, software cybersecurity.',
    refs:    [{ section: 'M27',  label: 'Module 2.7 — Clinical Summary' }, { section: 'M535', label: 'Module 5.3.5 — Pivotal trial' }],
    triage:  { ana: 'Decompose into 5 work items', priority: 'high', owner: 'Sara Okafor', tasks: 5 } },
  { id: 'd100-1', kind: 'Major Deficiency', channel: 'CDRH letter',  from: 'CDRH',                    received: '2026-04-22T14:50:00Z', due: '2026-05-06', status: 'in_review', ai: false,
    subject: 'Major Deficiency · Sterilization VP-modeling',
    summary: 'Sterilization validation using ISO 11135 acceptable; provide additional VHP residual data for accessories ≤ 0.1 ppm.',
    refs:    [{ section: 'M323', label: 'Module 3.2.S — Sterilization' }],
    triage:  { ana: 'Pull supplier CoA', priority: 'med', owner: 'Priya Shah', tasks: 2 } },
];

const CER_CORRESP = [
  { id: 'nbq-3', kind: 'NB Major NC',       channel: 'TEAM-NB portal', from: 'TÜV SÜD',                 received: '2026-04-29T07:02:00Z', due: '2026-05-29', status: 'open',     ai: true,
    subject: 'Major NC · State of the art evidence — gap in 2024 literature',
    summary: 'NC raised: state-of-the-art summary references 2018 Cochrane review only; need 2023–2024 evidence per MDCG 2020-13. Revise §3 with refreshed corpus.',
    refs:    [{ section: 3, label: '§3 State of the art' }],
    triage:  { ana: 'Refresh PubMed query 2023–2025', priority: 'high', owner: 'Dr. Lee Hartman', tasks: 1 } },
  { id: 'nbq-2', kind: 'NB Q&A',            channel: 'TEAM-NB portal', from: 'TÜV SÜD',                 received: '2026-04-25T11:15:00Z', due: '2026-05-09', status: 'in_review', ai: false,
    subject: 'NB Q&A · Adjudicated lead-dislodgement cases — clarify denominator',
    summary: 'Reviewer requests denominator clarification for §6.4 lead-dislodgement rate. Confirm whether denominator is enrolled or implanted population.',
    refs:    [{ section: 6, label: '§6 Clinical data' }],
    triage:  { ana: 'Cross-check SAP', priority: 'med', owner: 'Marcus Wei', tasks: 1 } },
  { id: 'nbq-1', kind: 'NB Minor NC',       channel: 'TEAM-NB portal', from: 'TÜV SÜD',                 received: '2026-04-19T09:30:00Z', due: '2026-04-26', status: 'closed',   ai: false,
    subject: 'Minor NC · PMS plan reporting cadence',
    summary: 'Closed. PMS plan updated to quarterly summary + annual periodic safety update.',
    refs:    [{ section: 7, label: '§7 PMS plan' }],
    triage:  { ana: 'Closed', priority: 'low', owner: 'Jordan Chen', tasks: 0 } },
];

/* ─────────────────────────────────────────────────────────────
   APPROVALS — workflow tasks awaiting Part 11 e-sign.
   Pathway-agnostic shape; each row references an artifact +
   the approval workflow stage (review · qa · medical · regulatory).
   ───────────────────────────────────────────────────────────── */

const K510_APPROVALS = [
  { id: 'ap-k-04', stage: 'regulatory', target: 'Submission package · K-251401', target_kind: 'Submission', requested: '2026-04-29T14:32:00Z', requested_by: 'Jordan Chen', signer: 'You',           role: 'Reg Lead',     status: 'pending',  due: '2026-05-02', meaning: 'Approve submission for FDA filing' },
  { id: 'ap-k-03', stage: 'medical',    target: 'eSTAR §11 — Performance testing', target_id: 11, target_kind: 'Section', requested: '2026-04-29T11:18:00Z', requested_by: 'Priya Shah', signer: 'Dr. Lee Hartman', role: 'Med Affairs',  status: 'pending',  due: '2026-05-01', meaning: 'Verify clinical accuracy claims' },
  { id: 'ap-k-02', stage: 'qa',         target: 'eSTAR §10 — Software', target_id: 10, target_kind: 'Section', requested: '2026-04-28T16:30:00Z', requested_by: 'Marcus Wei', signer: 'Priya Shah',  role: 'QA',           status: 'signed',   signed_at: '2026-04-29T09:14:00Z', meaning: 'QA review complete' },
  { id: 'ap-k-01', stage: 'review',     target: 'eSTAR §07 — Indications', target_id: 7,  target_kind: 'Section', requested: '2026-04-27T15:00:00Z', requested_by: 'Jordan Chen', signer: 'Dr. Lee Hartman', role: 'Med Affairs', status: 'signed',   signed_at: '2026-04-28T15:44:00Z', meaning: 'Indications align with intended use' },
];

const PMA_APPROVALS = [
  { id: 'ap-p-03', stage: 'regulatory', target: 'PMA Module 2.7 — Clinical Summary', target_id: 'M27', target_kind: 'Section', requested: '2026-04-29T15:11:00Z', requested_by: 'Sara Okafor', signer: 'You',         role: 'Reg Lead',  status: 'pending', due: '2026-05-03', meaning: 'Approve clinical summary for filing' },
  { id: 'ap-p-02', stage: 'medical',    target: 'PMA Module 2.5 — Clinical Overview', target_id: 'M25', target_kind: 'Section', requested: '2026-04-29T13:48:00Z', requested_by: 'Marcus Wei',  signer: 'Dr. Lee Hartman', role: 'Med Affairs', status: 'pending', due: '2026-05-04', meaning: 'Endorse clinical overview' },
  { id: 'ap-p-01', stage: 'qa',         target: 'PMA Module 5.3.5 — Pivotal trial', target_id: 'M535', target_kind: 'Section', requested: '2026-04-28T17:55:00Z', requested_by: 'Sara Okafor', signer: 'Priya Shah',  role: 'QA',        status: 'signed',  signed_at: '2026-04-29T11:08:00Z', meaning: 'QA review complete' },
];

const CER_APPROVALS = [
  { id: 'ap-c-03', stage: 'regulatory', target: 'CER package · IV-415',                target_kind: 'Submission', requested: '2026-04-29T14:02:00Z', requested_by: 'Dr. Lee Hartman', signer: 'You',           role: 'Reg Lead',     status: 'pending', due: '2026-05-06', meaning: 'Approve CER for NB submission' },
  { id: 'ap-c-02', stage: 'medical',    target: 'CER §6 — Clinical data', target_id: 6, target_kind: 'Section',    requested: '2026-04-29T11:30:00Z', requested_by: 'Priya Shah',      signer: 'Dr. Lee Hartman', role: 'Med Affairs',  status: 'pending', due: '2026-05-04', meaning: 'Endorse clinical data summary' },
  { id: 'ap-c-01', stage: 'qa',         target: 'CER §3 — State of the art', target_id: 3, target_kind: 'Section', requested: '2026-04-27T15:02:00Z', requested_by: 'Dr. Lee Hartman', signer: 'Priya Shah',      role: 'QA',           status: 'signed',  signed_at: '2026-04-27T16:50:00Z', meaning: 'QA review complete' },
];

/* Per-pathway bundle so surfaces can index by pathway */
const PATHWAY_TABS_DATA = {
  k510: { audit: K510_AUDIT, correspondence: K510_CORRESP, approvals: K510_APPROVALS, corrLabel: 'RTA / AI-Hold' },
  pma:  { audit: PMA_AUDIT,  correspondence: PMA_CORRESP,  approvals: PMA_APPROVALS,  corrLabel: 'Day-100' },
  cer:  { audit: CER_AUDIT,  correspondence: CER_CORRESP,  approvals: CER_APPROVALS,  corrLabel: 'NB Q&A' },
};

Object.assign(window, { AUDIT_KIND_META, PATHWAY_TABS_DATA });
