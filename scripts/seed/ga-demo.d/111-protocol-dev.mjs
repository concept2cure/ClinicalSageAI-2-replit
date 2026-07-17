/**
 * Wave-3 domain seed — protocol-development authoring hub.
 *
 * The org's single in-development clinical protocol (SELVO-DLBCL-201 /
 * PROT-2041, a Phase II selvotinib study in R/R DLBCL) assembled by the v2
 * ProtocolDev surface: synopsis, objectives & endpoints, eligibility, schedule
 * of assessments, 5x5 risk register, milestones, budget, amendments,
 * deviations/CAPA, reviews and consent. Read by GET /api/protocol-dev; the
 * surface renders the document. Mirrors the codebase fixture (PDEV_DOC) exactly
 * so the live read is a faithful port — no fabricated data. to_regclass guarded,
 * org-scoped, idempotent (ON CONFLICT DO NOTHING). Every nested structure is
 * stored as JSONB.
 */
const DOC = {
  id: 'PROT-2041', seq: 1,
  title: 'A Phase II Study of Selvotinib in Relapsed/Refractory DLBCL',
  shortTitle: 'SELVO-DLBCL-201',
  kind: 'clinical', version: '0.7', status: 'draft',
  sponsor: 'Northfield Cancer Institute (IIT)', pi: 'Dr. Elena Vasquez',
  updated: '2 min ago', completeness: 68, openSection: 's2',
  sections: [
    { id: 's1', num: '1', title: 'Protocol summary / synopsis', status: 'complete', required: true },
    { id: 's2', num: '2', title: 'Background & rationale', status: 'complete', required: true },
    { id: 's3', num: '3', title: 'Objectives & endpoints', status: 'draft', required: true, tab: 'objectives' },
    { id: 's4', num: '4', title: 'Study design', status: 'draft', required: true },
    { id: 's5', num: '5', title: 'Eligibility criteria', status: 'draft', required: true, tab: 'eligibility' },
    { id: 's6', num: '6', title: 'Schedule of assessments', status: 'draft', required: true, tab: 'soa' },
    { id: 's7', num: '7', title: 'Study treatments', status: 'draft', required: true },
    { id: 's8', num: '8', title: 'Safety & adverse events', status: 'not_started', required: true },
    { id: 's9', num: '9', title: 'Statistical considerations', status: 'not_started', required: true },
    { id: 's10', num: '10', title: 'Data handling & monitoring', status: 'not_started', required: true },
    { id: 's11', num: '11', title: 'Ethics & informed consent', status: 'draft', required: true, tab: 'consent' },
    { id: 's12', num: '12', title: 'References', status: 'not_started', required: false },
  ],
  content: {
    s2: [
      { h: '2.1 Disease background', p: 'Diffuse large B-cell lymphoma (DLBCL) is the most common aggressive non-Hodgkin lymphoma. Approximately 30–40% of patients relapse after first-line R-CHOP, and outcomes in the relapsed/refractory (R/R) setting remain poor, with median overall survival under 12 months for patients ineligible for transplant.', prov: { src: 'Literature corpus · 14 sources', conf: 'High', audit: 'AUD-7741' } },
      { h: '2.2 Investigational agent', p: 'Selvotinib is an oral, selective BTK inhibitor with a differentiated kinome profile and reduced off-target activity against TEC and EGFR. Phase I data (n=42) demonstrated a manageable safety profile and an overall response rate of 51% in heavily pretreated B-cell malignancies.', prov: { src: 'IB v3.0 · §6.2', conf: 'High', audit: 'AUD-7742' } },
      { h: '2.3 Rationale for the current study', p: 'The combination of selective BTK inhibition with standard salvage chemotherapy is hypothesized to improve response depth without additive toxicity. This study evaluates selvotinib added to R-GemOx in transplant-ineligible R/R DLBCL.', prov: { src: 'Drafted by AnA from §2.1–2.2 + 3 precedents', conf: 'Medium', audit: 'AUD-7743' } },
    ],
  },
  objectives: [
    { id: 'o1', type: 'primary', text: 'To evaluate the overall response rate (ORR) of selvotinib plus R-GemOx per Lugano 2014 criteria.', endpoint: 'ORR (CR+PR) at end of cycle 4' },
    { id: 'o2', type: 'secondary', text: 'To assess progression-free survival (PFS) and duration of response (DoR).', endpoint: 'PFS, DoR (Kaplan–Meier)' },
    { id: 'o3', type: 'secondary', text: 'To characterize the safety and tolerability of the combination.', endpoint: 'AEs per CTCAE v5.0' },
    { id: 'o4', type: 'exploratory', text: 'To explore ctDNA dynamics as an early predictor of response.', endpoint: 'ctDNA clearance at C2D1' },
  ],
  eligibility: {
    inclusion: [
      { id: 'i1', text: 'Histologically confirmed DLBCL, relapsed or refractory after ≥1 prior line.' },
      { id: 'i2', text: 'Age ≥ 18 years.' },
      { id: 'i3', text: 'ECOG performance status 0–2.' },
      { id: 'i4', text: 'Measurable disease per Lugano 2014.' },
      { id: 'i5', text: 'Adequate hematologic, hepatic and renal function.' },
    ],
    exclusion: [
      { id: 'e1', text: 'Prior exposure to a BTK inhibitor.' },
      { id: 'e2', text: 'Active CNS lymphoma.' },
      { id: 'e3', text: 'Clinically significant cardiovascular disease within 6 months.' },
      { id: 'e4', text: 'Active anticoagulation with warfarin.' },
    ],
  },
  soa: {
    visits: [
      { id: 'scr', label: 'Screening', day: 'D-28→-1', window: '' },
      { id: 'c1d1', label: 'C1D1', day: 'D1', window: '' },
      { id: 'c1d8', label: 'C1D8', day: 'D8', window: '±1' },
      { id: 'c2d1', label: 'C2D1', day: 'D22', window: '±2' },
      { id: 'c4d1', label: 'C4D1', day: 'D64', window: '±2' },
      { id: 'eot', label: 'EOT', day: 'D85', window: '±3' },
      { id: 'fu', label: 'Follow-up', day: 'q90d', window: '±7' },
    ],
    assessments: [
      { id: 'a1', label: 'Informed consent', cat: 'Administrative' },
      { id: 'a2', label: 'Demographics & history', cat: 'Administrative' },
      { id: 'a3', label: 'Physical exam', cat: 'Clinical' },
      { id: 'a4', label: 'Vital signs', cat: 'Clinical' },
      { id: 'a5', label: 'ECOG status', cat: 'Clinical' },
      { id: 'a6', label: 'CBC with differential', cat: 'Laboratory' },
      { id: 'a7', label: 'Comprehensive metabolic', cat: 'Laboratory' },
      { id: 'a8', label: 'CT / PET imaging', cat: 'Imaging' },
      { id: 'a9', label: 'ctDNA (exploratory)', cat: 'Biomarker' },
      { id: 'a10', label: 'Adverse event review', cat: 'Safety' },
      { id: 'a11', label: 'Study drug administration', cat: 'Treatment' },
    ],
    cells: {
      a1: ['scr'], a2: ['scr'], a3: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a4: ['scr', 'c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot'], a5: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a6: ['scr', 'c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot'], a7: ['scr', 'c1d1', 'c2d1', 'c4d1', 'eot'],
      a8: ['scr', 'c4d1', 'eot', 'fu'], a9: ['scr', 'c2d1', 'eot'],
      a10: ['c1d1', 'c1d8', 'c2d1', 'c4d1', 'eot', 'fu'], a11: ['c1d1', 'c1d8', 'c2d1', 'c4d1'],
    },
    issues: [
      { sev: 'warning', text: 'Visit C1D8 has only 4 assessments scheduled — confirm minimal-visit intent.' },
      { sev: 'info', text: 'Follow-up (q90d) imaging cadence aligns with PFS endpoint.' },
    ],
  },
  risks: [
    { id: 'r1', hazard: 'Grade ≥3 neutropenia from combination myelosuppression', cat: 'Safety', l: 4, i: 4, mitigation: 'Protocol-defined dose modification + G-CSF support; weekly CBC in C1.', rl: 3, ri: 3, status: 'open' },
    { id: 'r2', hazard: 'Under-enrollment at single site', cat: 'Operational', l: 4, i: 3, mitigation: 'Activate two satellite sites; pre-screen registry.', rl: 2, ri: 3, status: 'mitigating' },
    { id: 'r3', hazard: 'ctDNA assay vendor delay', cat: 'Operational', l: 3, i: 2, mitigation: 'Exploratory endpoint; samples biobanked for batch analysis.', rl: 2, ri: 1, status: 'open' },
    { id: 'r4', hazard: 'Atrial fibrillation (BTKi class effect)', cat: 'Safety', l: 2, i: 4, mitigation: 'Baseline + on-study ECG; cardiology referral pathway.', rl: 2, ri: 3, status: 'mitigating' },
    { id: 'r5', hazard: 'Protocol deviation in eligibility verification', cat: 'Compliance', l: 3, i: 3, mitigation: 'Central eligibility review before C1D1.', rl: 1, ri: 3, status: 'mitigating' },
    { id: 'r6', hazard: 'Informed-consent version drift across sites', cat: 'Compliance', l: 2, i: 3, mitigation: 'IRB-controlled master ICF; site acknowledgment log.', rl: 1, ri: 2, status: 'closed' },
  ],
  milestones: [
    { id: 'm1', label: 'IRB initial approval', date: '2026-05-12', status: 'done', urgency: 'done' },
    { id: 'm2', label: 'IACUC (correlative tissue) approval', date: '2026-05-20', status: 'done', urgency: 'done' },
    { id: 'm3', label: 'Site initiation visit', date: '2026-06-18', status: 'done', urgency: 'done' },
    { id: 'm4', label: 'First patient in (FPI)', date: '2026-07-05', status: 'active', urgency: 'due_30' },
    { id: 'm5', label: 'Continuing review due', date: '2027-05-01', status: 'planned', urgency: 'due_90' },
    { id: 'm6', label: 'Interim DSMB review', date: '2026-11-15', status: 'planned', urgency: 'upcoming' },
    { id: 'm7', label: 'Last patient in (LPI)', date: '2027-04-30', status: 'planned', urgency: 'upcoming' },
  ],
  budget: {
    params: { enrollment: 40, sponsorPerSubject: 28500, faRate: 0.30 },
    items: [
      { id: 'b1', cat: 'Personnel', label: 'Study coordinator (per subject)', perSubject: 4200 },
      { id: 'b2', cat: 'Personnel', label: 'PI / sub-I effort (per subject)', perSubject: 3100 },
      { id: 'b3', cat: 'Procedures', label: 'CT/PET imaging (×4)', perSubject: 6800 },
      { id: 'b4', cat: 'Procedures', label: 'Laboratory panels', perSubject: 2400 },
      { id: 'b5', cat: 'Pharmacy', label: 'Drug handling & dispensing', perSubject: 1900 },
      { id: 'b6', cat: 'Biomarker', label: 'ctDNA assay (exploratory)', perSubject: 2200 },
      { id: 'b7', cat: 'Overhead', label: 'Regulatory & data management', perSubject: 1500 },
    ],
  },
  amendments: [
    { id: 'am1', num: 'Amendment 1', summary: 'Add satellite sites; broaden creatinine-clearance threshold to ≥45 mL/min.', status: 'irb_review', reconsent: false, path: 'Expedited', changes: [
      { sec: '§5 Eligibility', from: 'CrCl ≥ 60 mL/min', to: 'CrCl ≥ 45 mL/min' },
      { sec: '§1 Synopsis', from: 'Single-site', to: 'Multi-site (3 sites)' },
    ] },
    { id: 'am2', num: 'Amendment 2 (draft)', summary: 'Add mandatory baseline echocardiogram for AF risk monitoring.', status: 'draft', reconsent: true, path: 'Full board', changes: [
      { sec: '§6 SoA', from: 'ECG only', to: 'ECG + baseline echocardiogram' },
    ] },
  ],
  deviations: [
    { id: 'd1', title: 'Out-of-window C2D1 visit (Day 25, +3 over window)', sev: 'minor', cat: 'Visit schedule', reportable: false, status: 'open', capa: [
      { id: 'cap1', action: 'Re-train coordinator on visit-window calculation', status: 'in_progress' },
    ] },
    { id: 'd2', title: 'Eligibility lab drawn 30 days before C1D1 (>28-day screening window)', sev: 'major', cat: 'Eligibility', reportable: true, status: 'capa', capa: [
      { id: 'cap2', action: 'Notify IRB within 5 business days', status: 'completed' },
      { id: 'cap3', action: 'Implement central eligibility pre-check', status: 'in_progress' },
    ] },
  ],
  reviews: [
    { id: 'rv1', reviewer: 'M. Chen (Regulatory)', role: 'Regulatory', status: 'commented', comments: [
      { id: 'rc1', sec: '§3 Objectives', sev: 'major', text: 'Primary endpoint timing (end of C4) should specify the response-confirmation scan window.', resolved: false },
    ] },
    { id: 'rv2', reviewer: 'S. Okafor (Biostatistics)', role: 'Biostatistics', status: 'commented', comments: [
      { id: 'rc2', sec: '§9 Statistics', sev: 'blocking', text: 'Sample-size justification missing — Simon two-stage parameters not stated.', resolved: false },
    ] },
    { id: 'rv3', reviewer: 'L. Park (Safety)', role: 'Safety', status: 'approved', comments: [] },
  ],
  consent: [
    { id: 'ce1', el: 'Statement that the study involves research', present: true },
    { id: 'ce2', el: 'Purpose of the research & expected duration', present: true },
    { id: 'ce3', el: 'Description of procedures', present: true },
    { id: 'ce4', el: 'Reasonably foreseeable risks or discomforts', present: true },
    { id: 'ce5', el: 'Benefits to subject or others', present: true },
    { id: 'ce6', el: 'Alternative procedures or treatments', present: false },
    { id: 'ce7', el: 'Confidentiality of records', present: true },
    { id: 'ce8', el: 'Compensation / treatment for injury (>minimal risk)', present: true },
    { id: 'ce9', el: 'Contacts for questions', present: true },
    { id: 'ce10', el: 'Voluntary participation statement', present: true },
    { id: 'ce11', el: 'Key-information summary at the beginning (2018 Common Rule)', present: false },
  ],
  completenessFindings: [
    { sev: 'critical', text: 'Section 9 (Statistical considerations) is not started — required for finalization.' },
    { sev: 'critical', text: 'Sample-size justification missing (blocking review comment open).' },
    { sev: 'major', text: 'Section 8 (Safety & adverse events) is not started.' },
    { sev: 'major', text: '2 informed-consent required elements absent (alternatives, key-information summary).' },
    { sev: 'minor', text: 'Section 12 (References) incomplete.' },
  ],
};

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_protocol_dev') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_protocol_dev not found — run migrations first, skipping');
    return;
  }
  const r = await client.query(
    `INSERT INTO c2c_protocol_dev (
       id, organization_id, seq, title, short_title, kind, version, status,
       sponsor, pi, updated, completeness, open_section,
       sections, content, objectives, eligibility, soa, risks, milestones,
       budget, amendments, deviations, reviews, consent, completeness_findings
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
       $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, $26::jsonb
     )
     ON CONFLICT (organization_id, id) DO NOTHING`,
    [
      DOC.id, org.id, DOC.seq, DOC.title, DOC.shortTitle, DOC.kind, DOC.version, DOC.status,
      DOC.sponsor, DOC.pi, DOC.updated, DOC.completeness, DOC.openSection,
      JSON.stringify(DOC.sections), JSON.stringify(DOC.content), JSON.stringify(DOC.objectives),
      JSON.stringify(DOC.eligibility), JSON.stringify(DOC.soa), JSON.stringify(DOC.risks),
      JSON.stringify(DOC.milestones), JSON.stringify(DOC.budget), JSON.stringify(DOC.amendments),
      JSON.stringify(DOC.deviations), JSON.stringify(DOC.reviews), JSON.stringify(DOC.consent),
      JSON.stringify(DOC.completenessFindings),
    ],
  );
  console.log(`   ✓ protocol dev: ${r.rowCount ?? 0} protocol document seeded`);
}
