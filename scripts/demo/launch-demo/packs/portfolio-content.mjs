/**
 * launch-demo/packs/portfolio-content.mjs — the FICTIONAL content of the opt-in
 * CSR portfolio pack (portfolio.mjs): four invented sponsor companies, eight
 * clinical studies, one Clinical Study Report project per lifecycle stage, and
 * the deterministic synthetic study-data sources and ICH E3 narrative text
 * derived from each study's own numbers.
 *
 * Every company, product, study, number and letter here is INVENTED for a
 * product demonstration. None is a real company, a marketed product, a real
 * trial or a real person. The data are SYNTHETIC and are not clinical evidence.
 * Pure data and pure functions only (including the sponsor-workspace placement
 * rules the pack applies before any write): nothing here calls the API.
 */

export const SYNTHETIC = 'SYNTHETIC demonstration data, fictional sponsor; not clinical evidence';

/**
 * The four fictional sponsors. Each is its OWN client workspace (SPONSOR_WORKSPACES), so a sponsor's projects
 * show that sponsor's records and not the organisation's own workspace's. "Varnhollow Oncology" replaced
 * "Corvane Oncology" (2026-11-09): Corvane Biologics is the Lumen pack's fictional CDMO (lumen-qms-content.mjs),
 * and one invented name must not stand for two companies in the same demonstration tenant.
 */
export const COMPANIES = [
  { key: 'varnhollow', name: 'Varnhollow Oncology (fictional)', profile: 'Clinical-stage oncology company developing VNH-310, a fictional humanized IgG1 monoclonal antibody for previously treated non-small cell lung cancer.' },
  { key: 'petrelline', name: 'Petrelline Rare Therapeutics (fictional)', profile: 'Rare-disease biologics company developing PTR-022, a fictional recombinant enzyme replacement therapy for late-onset Pompe disease.' },
  { key: 'quillmont', name: 'Quillmont Immunology (fictional)', profile: 'Immunology company developing QLM-118, a fictional oral small-molecule selective kinase inhibitor for ulcerative colitis.' },
  { key: 'halcyra', name: 'Halcyra Vaccines (fictional)', profile: 'Vaccine company developing HLY-09, a fictional adjuvanted recombinant RSV prefusion F protein vaccine for adults aged 60 and over.' },
];

export const STAGES = {
  a: 'Planning — protocol and SAP in the Vault, CSR shell created',
  b: 'Study conduct — enrolling; study design recorded, CSR shell waiting',
  c: 'Database lock — clinical source in the data room, CSR not yet drafted',
  d: 'Drafting — narrative sections being written in the one editor',
  e: 'In review — all narrative written, reviewer comments open',
  f: 'Drafting complete — comments resolved, awaiting signature',
  g: 'Ready to file — IND sequence 0000 open; filing the CSR to 5.3.5.1 waits for its scientific-review receipt',
  h: 'Information-request scenario (fictional) — rehearsing an agency information request on the HLY-09-101 CSR; the CSR is not placed in IND sequence 0000',
};

/*
 * arms: n randomized (= safety = ITT), completed, responders on the primary
 * (or exploratory) binary endpoint, subjects with >= 1 TEAE, with >= 1 SAE,
 * and subjects whose AE led to discontinuation. No deaths in any study.
 */
export const STUDIES = [
  {
    key: 'vnh310-301', company: 'varnhollow', stage: 'a', programType: 'csr', productName: 'VNH-310', productType: 'biologic',
    protocolNumber: 'VNH-310-301', phase: '3',
    shortTitle: 'VNH-310-301 Phase 3 CSR (planning)',
    title: 'A Phase 3, randomized, open-label study of VNH-310 plus docetaxel versus docetaxel in previously treated advanced non-small cell lung cancer',
    indication: 'Previously treated advanced non-small cell lung cancer (fictional study)',
    design: 'Phase 3, randomized 1:1, open-label, active-controlled, multicentre',
    comparator: 'Docetaxel 75 mg/m2 every 3 weeks',
    primaryEndpoint: 'Overall survival',
    secondaryEndpoints: ['Progression-free survival by blinded independent central review', 'Objective response rate (RECIST 1.1)'],
    plannedN: 480, plannedArms: [{ armName: 'VNH-310 1200 mg Q3W + docetaxel', n: 240 }, { armName: 'Docetaxel', n: 240 }],
    dates: { protocolFinal: '2026-09-18', plannedFirstPatientIn: '2027-02-15', plannedPrimaryAnalysis: '2029-06-30' },
  },
  {
    key: 'ptr022-301', company: 'petrelline', stage: 'b', programType: 'csr', productName: 'PTR-022', productType: 'biologic',
    protocolNumber: 'PTR-022-301', phase: '3',
    shortTitle: 'PTR-022-301 Phase 3 CSR (enrolling)',
    title: 'A Phase 3, randomized, double-blind, placebo-controlled study of PTR-022 in adults with late-onset Pompe disease',
    indication: 'Late-onset Pompe disease (fictional study)',
    design: 'Phase 3, randomized 2:1, double-blind, placebo-controlled, 52 weeks',
    comparator: 'Placebo',
    primaryEndpoint: 'Change from baseline in 6-minute walk distance at Week 52',
    secondaryEndpoints: ['Change from baseline in upright forced vital capacity (% predicted) at Week 52'],
    plannedN: 96, plannedArms: [{ armName: 'PTR-022 20 mg/kg every other week', n: 64 }, { armName: 'Placebo', n: 32 }],
    enrolled: 58,
    dates: { firstPatientIn: '2025-06-16', enrolmentAsOf: '2026-11-02', plannedLastPatientIn: '2027-03-31' },
  },
  {
    key: 'qlm118-202', company: 'quillmont', stage: 'c', programType: 'csr', productName: 'QLM-118', productType: 'drug',
    protocolNumber: 'QLM-118-202', phase: '2b',
    shortTitle: 'QLM-118-202 Phase 2b CSR (database locked)',
    title: 'A Phase 2b, randomized, double-blind, placebo-controlled, dose-ranging study of oral QLM-118 in moderately to severely active ulcerative colitis',
    indication: 'Moderately to severely active ulcerative colitis (fictional study)',
    design: 'Phase 2b, randomized 1:1:1, double-blind, placebo-controlled, 12-week induction',
    comparator: 'Placebo',
    primaryEndpoint: 'Clinical remission (modified Mayo score) at Week 12',
    arms: [
      { armId: 'QLM15', armName: 'QLM-118 15 mg once daily', n: 70, completed: 62, responders: 16, teae: 33, sae: 2, aeDisc: 3 },
      { armId: 'QLM30', armName: 'QLM-118 30 mg once daily', n: 70, completed: 61, responders: 22, teae: 38, sae: 3, aeDisc: 4 },
      { armId: 'PBO', armName: 'Placebo', n: 70, completed: 58, responders: 7, teae: 29, sae: 2, aeDisc: 4 },
    ],
    aeTerms: [['Headache', 'Nervous system disorders'], ['Nasopharyngitis', 'Infections and infestations'], ['Nausea', 'Gastrointestinal disorders'], ['Anaemia', 'Blood and lymphatic system disorders'], ['Ulcerative colitis flare', 'Gastrointestinal disorders']],
    dates: { firstPatientIn: '2025-03-03', lastPatientOut: '2026-08-21', dataCut: '2026-10-09', databaseLock: '2026-10-15' },
  },
  {
    key: 'hly09-201', company: 'halcyra', stage: 'd', programType: 'csr', productName: 'HLY-09', productType: 'biologic',
    protocolNumber: 'HLY-09-201', phase: '2',
    shortTitle: 'HLY-09-201 Phase 2 CSR (drafting)',
    title: 'A Phase 2, randomized, observer-blind, placebo-controlled study of the immunogenicity and safety of HLY-09 with and without adjuvant in adults aged 60 years and over',
    indication: 'Prevention of RSV lower respiratory tract disease in adults aged 60 and over (fictional study)',
    design: 'Phase 2, randomized 2:2:1, observer-blind, placebo-controlled, single dose, 181-day follow-up',
    comparator: 'Placebo (saline)',
    primaryEndpoint: 'Seroresponse (>= 4-fold rise in RSV-A neutralizing titre) at Day 29',
    arms: [
      { armId: 'ADJ', armName: 'HLY-09 120 mcg adjuvanted', n: 150, completed: 146, responders: 131, teae: 98, sae: 2, aeDisc: 1 },
      { armId: 'UNADJ', armName: 'HLY-09 120 mcg unadjuvanted', n: 150, completed: 147, responders: 104, teae: 71, sae: 1, aeDisc: 1 },
      { armId: 'PBO', armName: 'Placebo', n: 75, completed: 72, responders: 3, teae: 28, sae: 1, aeDisc: 0 },
    ],
    aeTerms: [['Injection site pain', 'General disorders and administration site conditions'], ['Fatigue', 'General disorders and administration site conditions'], ['Myalgia', 'Musculoskeletal and connective tissue disorders'], ['Headache', 'Nervous system disorders']],
    draftedHeadings: ['titlePage', 'synopsis', 'introduction', 'objectives', 'plan', 'subjects'],
    dates: { firstPatientIn: '2025-09-08', lastPatientOut: '2026-06-30', dataCut: '2026-08-07', databaseLock: '2026-08-14' },
  },
  {
    key: 'vnh310-201', company: 'varnhollow', stage: 'e', programType: 'csr', productName: 'VNH-310', productType: 'biologic',
    protocolNumber: 'VNH-310-201', phase: '2',
    shortTitle: 'VNH-310-201 Phase 2 CSR (in review)',
    title: 'A Phase 2, randomized, open-label dose-optimization study of VNH-310 monotherapy in previously treated advanced non-small cell lung cancer',
    indication: 'Previously treated advanced non-small cell lung cancer (fictional study)',
    design: 'Phase 2, randomized 1:1, open-label, two-dose optimization',
    comparator: 'None (two dose levels compared)',
    primaryEndpoint: 'Objective response rate (RECIST 1.1, blinded independent central review)',
    arms: [
      { armId: 'D600', armName: 'VNH-310 600 mg Q3W', n: 45, completed: 30, responders: 13, teae: 41, sae: 9, aeDisc: 3 },
      { armId: 'D1200', armName: 'VNH-310 1200 mg Q3W', n: 45, completed: 28, responders: 17, teae: 43, sae: 12, aeDisc: 5 },
    ],
    aeTerms: [['Fatigue', 'General disorders and administration site conditions'], ['Infusion-related reaction', 'Injury, poisoning and procedural complications'], ['Decreased appetite', 'Metabolism and nutrition disorders'], ['Pneumonitis', 'Respiratory, thoracic and mediastinal disorders'], ['Rash', 'Skin and subcutaneous tissue disorders']],
    dates: { firstPatientIn: '2024-05-13', dataCut: '2026-07-31', databaseLock: '2026-08-28' },
    // The open reviewer comments point at these passages, so the text holds them (the comments ask for them to be improved).
    narrativeAdditions: {
      safety: 'Pneumonitis (fictional): serious pneumonitis was reported in 1 participant at 600 mg and 2 participants at 1200 mg; all three cases were treated with corticosteroids.',
      discussion: 'Dose justification (fictional draft): the 1200 mg dose gave the higher response rate (17/45 vs 13/45) and is proposed for further study, although the 95% confidence intervals of the two arms overlap.',
    },
    comments: [
      { heading: 'efficacy', body: '[Demo] Reviewer note (fictional): state the BICR-confirmed response rate and the investigator-assessed rate side by side, with the 95% CI for each arm.' },
      { heading: 'safety', body: '[Demo] Reviewer note (fictional): the pneumonitis narrative should give time to onset and outcome for each serious case.' },
      { heading: 'discussion', body: '[Demo] Reviewer note (fictional): the dose justification paragraph claims more than the overlapping CIs support; soften to "numerically higher".' },
      { heading: 'synopsis', body: '[Demo] Reviewer note (fictional): add the data cut date to the synopsis header.', resolution: 'Data cut date added to the synopsis (fictional demo).' },
    ],
  },
  {
    key: 'ptr022-102', company: 'petrelline', stage: 'f', programType: 'csr', productName: 'PTR-022', productType: 'biologic',
    protocolNumber: 'PTR-022-102', phase: '1/2',
    shortTitle: 'PTR-022-102 Phase 1/2 CSR (awaiting signature)',
    title: 'A Phase 1/2, open-label, dose-escalation study of the safety, pharmacokinetics and exploratory efficacy of PTR-022 in late-onset Pompe disease',
    indication: 'Late-onset Pompe disease (fictional study)',
    design: 'Phase 1/2, open-label, sequential dose cohorts, 26 weeks',
    comparator: 'None (open-label dose cohorts)',
    randomized: false,
    primaryEndpoint: 'Incidence of treatment-emergent adverse events (safety)',
    efficacyEndpoint: { name: 'Exploratory: >= 30 m improvement in 6-minute walk distance at Week 26', type: 'exploratory' },
    // v2 of this source was refused by the source contract during development (no primary result); it stays in the first local
    // project's data room (archived 2026-11-09). The label stays v3 so the source's title is the same on every database.
    sourceVersion: 'v3',
    arms: [
      { armId: 'C10', armName: 'PTR-022 10 mg/kg every other week', n: 8, completed: 8, responders: 3, teae: 7, sae: 1, aeDisc: 0 },
      { armId: 'C20', armName: 'PTR-022 20 mg/kg every other week', n: 10, completed: 9, responders: 6, teae: 9, sae: 1, aeDisc: 1 },
    ],
    aeTerms: [['Infusion-related reaction', 'Injury, poisoning and procedural complications'], ['Headache', 'Nervous system disorders'], ['Nausea', 'Gastrointestinal disorders']],
    // The resolved reviewer comment says ADA results sit beside the infusion-related reactions, so the text says so.
    narrativeAdditions: { safety: 'Anti-drug antibodies (fictional): 4/8 (10 mg/kg) and 6/10 (20 mg/kg) participants were ADA-positive by Week 26; infusion-related reactions occurred in both ADA-positive and ADA-negative participants.' },
    dates: { firstPatientIn: '2024-11-04', dataCut: '2026-06-30', databaseLock: '2026-07-24' },
    comments: [
      { heading: 'safety', body: '[Demo] Reviewer note (fictional): give the anti-drug antibody results beside the infusion-related reactions.', resolution: 'ADA results added beside the infusion-related reactions (fictional demo).' },
      { heading: 'efficacy', body: '[Demo] Reviewer note (fictional): label the 6MWD responder analysis as exploratory throughout.', resolution: 'Labelled exploratory in every place (fictional demo).' },
    ],
  },
  {
    key: 'qlm118-101', company: 'quillmont', stage: 'g', programType: 'ind', productName: 'QLM-118', productType: 'drug',
    protocolNumber: 'QLM-118-101', phase: '1',
    shortTitle: 'QLM-118 IND — Phase 1 CSR ready to file at 5.3.5.1',
    title: 'A Phase 1, randomized, double-blind, placebo-controlled, single and multiple ascending dose study of QLM-118 in healthy adults',
    indication: 'Moderately to severely active ulcerative colitis (fictional program); healthy-volunteer study',
    design: 'Phase 1, randomized 3:1 within cohort, double-blind, placebo-controlled, SAD and MAD',
    comparator: 'Placebo',
    primaryEndpoint: 'Incidence of treatment-emergent adverse events (safety)',
    efficacyEndpoint: { name: 'Pharmacodynamic: >= 90% pSTAT inhibition 4 h after dosing', type: 'secondary' },
    arms: [
      { armId: 'QLM', armName: 'QLM-118 (all dose cohorts pooled)', n: 48, completed: 47, responders: 41, teae: 19, sae: 0, aeDisc: 1 },
      { armId: 'PBO', armName: 'Placebo (pooled)', n: 16, completed: 16, responders: 0, teae: 5, sae: 0, aeDisc: 0 },
    ],
    aeTerms: [['Headache', 'Nervous system disorders'], ['Nausea', 'Gastrointestinal disorders'], ['Dizziness', 'Nervous system disorders']],
    dates: { firstPatientIn: '2025-01-13', lastPatientOut: '2025-06-20', dataCut: '2025-07-18', databaseLock: '2025-07-25' },
  },
  {
    key: 'hly09-101', company: 'halcyra', stage: 'h', programType: 'ind', productName: 'HLY-09', productType: 'biologic',
    protocolNumber: 'HLY-09-101', phase: '1',
    shortTitle: 'HLY-09 IND — Phase 1 CSR, agency information request',
    title: 'A Phase 1, randomized, observer-blind, placebo-controlled, first-in-human dose-escalation study of HLY-09 in adults aged 60 to 80 years',
    indication: 'Prevention of RSV lower respiratory tract disease in adults aged 60 and over (fictional program)',
    design: 'Phase 1, randomized 2:2:1, observer-blind, placebo-controlled, dose escalation',
    comparator: 'Placebo (saline)',
    primaryEndpoint: 'Incidence of solicited and unsolicited adverse events (safety)',
    efficacyEndpoint: { name: 'Seroresponse (>= 4-fold rise in RSV-A neutralizing titre) at Day 29', type: 'secondary' },
    arms: [
      { armId: 'D60', armName: 'HLY-09 60 mcg adjuvanted', n: 20, completed: 20, responders: 17, teae: 14, sae: 0, aeDisc: 0 },
      { armId: 'D120', armName: 'HLY-09 120 mcg adjuvanted', n: 20, completed: 19, responders: 19, teae: 16, sae: 0, aeDisc: 1 },
      { armId: 'PBO', armName: 'Placebo', n: 10, completed: 10, responders: 0, teae: 4, sae: 0, aeDisc: 0 },
    ],
    aeTerms: [['Injection site pain', 'General disorders and administration site conditions'], ['Fatigue', 'General disorders and administration site conditions'], ['Myalgia', 'Musculoskeletal and connective tissue disorders']],
    dates: { firstPatientIn: '2025-02-10', dataCut: '2026-03-31', databaseLock: '2026-04-24' },
  },
];

export const companyOf = (study) => COMPANIES.find((c) => c.key === study.company);

/**
 * One client workspace per fictional sponsor, created through the product's client-workspace API
 * (POST /api/clients, as the Lumen and Faux packs create theirs) and found again by exact name. The name says
 * "(fictional demo)"; the slug is the workspace's URL key. None is ever marked the organisation's default.
 */
export const SPONSOR_WORKSPACES = [
  { key: 'varnhollow', name: 'Varnhollow Oncology (fictional demo)', slug: 'varnhollow-oncology-portfolio-demo' },
  { key: 'petrelline', name: 'Petrelline Rare Therapeutics (fictional demo)', slug: 'petrelline-rare-therapeutics-portfolio-demo' },
  { key: 'quillmont', name: 'Quillmont Immunology (fictional demo)', slug: 'quillmont-immunology-portfolio-demo' },
  { key: 'halcyra', name: 'Halcyra Vaccines (fictional demo)', slug: 'halcyra-vaccines-portfolio-demo' },
];

/** The sponsor workspace a study's project is created in: its own company's, never another's. */
export const workspaceOf = (study) => SPONSOR_WORKSPACES.find((w) => w.key === study.company);

/* ── where a project may live: pure placement rules the pack applies before any write (portfolio.mjs) ── */

/** A project row's client workspace id (list rows and the detail read both carry it), or null. */
export const workspaceIdOf = (row) => {
  const raw = row?.client_workspace_id ?? row?.clientWorkspaceId ?? null;
  return raw == null || raw === '' ? null : Number(raw);
};

/**
 * What to do with the projects already titled `title` (the list excludes archived ones): create one, reuse the one
 * in the sponsor's workspace, or REFUSE one found anywhere else. A project is never moved between workspaces and a
 * project in another workspace is never reused. Duplicates are refused before anything is decided.
 */
export function existingProjectFor(projects, title, workspaceId) {
  const same = (projects ?? []).filter((p) => (p.title ?? p.name) === title);
  if (same.length > 1) throw new Error(`more than one project is titled "${title}"; reconcile before seeding`);
  if (!same.length) return { action: 'create' };
  const found = workspaceIdOf(same[0]);
  if (found === workspaceId) return { action: 'reuse', id: same[0].id };
  return {
    action: 'refuse', id: same[0].id, foundWorkspaceId: found, expectedWorkspaceId: workspaceId,
    reason: `refused — project ${same[0].id} has this pack's title but is in client workspace ${found ?? '(none)'}, not its sponsor's workspace ${workspaceId}. It was not moved and not reused; nothing was attached to it. Archive it through Project settings (or rename it) and run the pack again.`,
  };
}

/**
 * The sponsor's client workspace among the organisation's client workspaces (GET /api/clients), by exact name, or
 * null when there is none. Refused rather than adopted: two with the name, one in another organisation or not active,
 * or the slug held by a workspace of another name (POST would answer 409 on the slug).
 */
export function matchSponsorWorkspace(rows, spec, organizationId) {
  const all = Array.isArray(rows) ? rows : [];
  const named = all.filter((c) => c.name === spec.name);
  if (named.length > 1) throw new Error(`more than one client workspace is named "${spec.name}"; reconcile before seeding. Nothing was written.`);
  if (!named.length) {
    const slugHolder = all.find((c) => c.slug === spec.slug);
    if (slugHolder) throw new Error(`the slug "${spec.slug}" is held by client workspace ${slugHolder.id} ("${slugHolder.name}"), not "${spec.name}"; it was not adopted. Nothing was written.`);
    return null;
  }
  const row = named[0];
  if (String(row.organizationId ?? '') !== String(organizationId)) throw new Error(`client workspace ${row.id} "${spec.name}" belongs to another organisation; it was not adopted.`);
  if (String(row.status ?? 'active').toLowerCase() !== 'active') throw new Error(`client workspace ${row.id} "${spec.name}" is not active (${row.status}); it was not reopened or adopted.`);
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`client workspace "${spec.name}" has no valid id.`);
  return id;
}

/** A study design with this title bound to ANOTHER project, or null. The product never moves a design between projects. */
export function designOwnedElsewhere(designs, title, projectId) {
  const other = (designs ?? []).find((d) => d.title === title && String(d.programId ?? d.program_id ?? '') !== String(projectId));
  return other ? { studyId: other.studyId ?? other.study_id ?? null, programId: other.programId ?? other.program_id ?? null } : null;
}

/* ───────────────── synthetic study-data source (concept2cure.csr-source.v1) ───────────────── */

const pct = (r, n) => Math.round((1000 * r) / n) / 10;
const fmtPct = (r, n) => `${r}/${n} (${pct(r, n).toFixed(1)}%)`;

/** Deterministic pseudo-random sequence so the source bytes (and their SHA-256) never change between runs. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const seedOf = (text) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

export function primaryEndpointName(study) {
  return study.efficacyEndpoint?.name ?? study.primaryEndpoint;
}

/** Build the synthetic study-data source for a completed study. Every count reconciles with study.arms. */
export function buildCsrSource(study) {
  const company = companyOf(study);
  const rand = lcg(seedOf(study.key));
  const participants = [];
  const disposition = [];
  const demographics = [];
  const adverseEvents = [];
  for (const arm of study.arms) {
    for (let i = 0; i < arm.n; i += 1) {
      const subjectId = `${study.protocolNumber}-${arm.armId}-${String(i + 1).padStart(3, '0')}`;
      const completed = i < arm.completed;
      participants.push({ subjectId, armId: arm.armId, randomized: true, safety: true, itt: true, completed });
      disposition.push({ subjectId, armId: arm.armId, status: completed ? 'completed' : 'discontinued' });
      const older = study.key.startsWith('hly09');
      demographics.push({ subjectId, armId: arm.armId, age: older ? 60 + Math.floor(rand() * 20) : 22 + Math.floor(rand() * 48), sex: rand() < 0.52 ? 'F' : 'M' });
    }
    // Subjects with an AE: the last `aeDisc` discontinued subjects (AE led to
    // discontinuation), then completed subjects from the first, until `teae`.
    const ids = participants.filter((p) => p.armId === arm.armId).map((p) => p.subjectId);
    const withAe = [...ids.slice(arm.n - arm.aeDisc), ...ids.slice(0, arm.teae - arm.aeDisc)];
    withAe.forEach((subjectId, j) => {
      const [pt, soc] = study.aeTerms[j % study.aeTerms.length];
      const serious = j >= arm.aeDisc ? j - arm.aeDisc < arm.sae : false;
      const discontinued = j < arm.aeDisc;
      adverseEvents.push({
        subjectId, armId: arm.armId, pt, soc,
        severity: serious || discontinued ? 'severe' : (j % 3 === 0 ? 'moderate' : 'mild'),
        serious, related: j % 2 === 0 ? 'related' : 'unrelated',
        outcome: serious ? 'recovering' : 'recovered', ledToDiscontinuation: discontinued,
      });
    });
  }
  const endpointName = primaryEndpointName(study);
  return {
    format: 'concept2cure.csr-source.v1',
    dataCutDate: study.dates.dataCut,
    studyInfo: {
      title: `${study.protocolNumber}: ${study.title} (${SYNTHETIC})`,
      protocolNumber: study.protocolNumber,
      phase: study.phase,
      indication: study.indication,
      sponsor: `${company.name} — ${SYNTHETIC}`,
      investigationalProduct: `${study.productName} (fictional)`,
      studyDesign: study.design,
      primaryEndpoint: study.primaryEndpoint,
      comparator: study.comparator,
      sampleSize: study.arms.reduce((a, b) => a + b.n, 0),
      targetAgencies: ['FDA'],
    },
    participants,
    completeDomains: { disposition: true, demographics: true, efficacy: true, adverseEvents: true },
    studyData: {
      studyId: study.protocolNumber,
      protocolNumber: study.protocolNumber,
      treatmentArms: study.arms.map((a) => ({ armId: a.armId, armName: a.armName, randomized: a.n, populations: { safety: a.n, itt: a.n, completed: a.completed } })),
      disposition,
      demographics,
      efficacy: [
        // A safety-primary study records its primary result as the TEAE incidence
        // (the source contract requires the primary result to match studyInfo).
        ...(study.efficacyEndpoint ? study.arms.map((a) => ({
          endpointName: study.primaryEndpoint, endpointType: 'primary', armId: a.armId,
          value: pct(a.teae, a.n), display: fmtPct(a.teae, a.n),
          method: 'Descriptive synthetic proportion', population: 'Safety',
        })) : []),
        ...study.arms.map((a) => ({
          endpointName, endpointType: study.efficacyEndpoint?.type ?? 'primary', armId: a.armId,
          value: pct(a.responders, a.n), display: fmtPct(a.responders, a.n),
          method: 'Descriptive synthetic proportion', population: 'ITT',
        })),
      ],
      adverseEvents,
      dispositionCategories: ['completed', 'discontinued'],
      aeDiscontinuationBasis: 'event',
      dispositionBasis: 'end-of-study',
    },
  };
}

/** The counts a reader of the source would compute, per arm: what the tests and the narrative both use. */
export function sourceCounts(source) {
  const byArm = {};
  for (const a of source.studyData.treatmentArms) byArm[a.armId] = { n: 0, completed: 0, teae: new Set(), sae: new Set(), aeDisc: new Set() };
  for (const p of source.participants) { byArm[p.armId].n += 1; if (p.completed) byArm[p.armId].completed += 1; }
  for (const e of source.studyData.adverseEvents) {
    byArm[e.armId].teae.add(e.subjectId);
    if (e.serious) byArm[e.armId].sae.add(e.subjectId);
    if (e.ledToDiscontinuation) byArm[e.armId].aeDisc.add(e.subjectId);
  }
  return Object.fromEntries(Object.entries(byArm).map(([k, v]) => [k, { n: v.n, completed: v.completed, teae: v.teae.size, sae: v.sae.size, aeDisc: v.aeDisc.size }]));
}

/* ───────────────── ICH E3 narrative text (human-written stand-in, saved as revisions) ───────────────── */

/** Which canonical-template heading each narrative key is written into, matched on the section title. */
export const HEADING_PATTERNS = {
  titlePage: /title page/i,
  synopsis: /synopsis/i,
  introduction: /introduction/i,
  objectives: /study objectives|^\s*[\d.]*\s*objectives/i,
  plan: /investigational plan/i,
  subjects: /study (patients|subjects|participants)/i,
  efficacy: /efficacy evaluation/i,
  safety: /safety evaluation/i,
  discussion: /discussion and overall conclusions|overall conclusions/i,
  // ICH E3 headings 5 and 6; written only where the template carries them (mapHeadings skips an absent heading).
  ethics: /^\s*[\d.]*\s*ethics\b/i,
  investigators: /investigators and study administrative structure/i,
};
export const ALL_HEADINGS = Object.keys(HEADING_PATTERNS);

export function narrative(study) {
  const company = companyOf(study);
  const total = study.arms.reduce((a, b) => a + b.n, 0);
  const done = study.arms.reduce((a, b) => a + b.completed, 0);
  const arms = study.arms.map((a) => `${a.armName} (n = ${a.n})`).join(', ');
  const ep = primaryEndpointName(study);
  const eff = study.arms.map((a) => `${a.armName}: ${fmtPct(a.responders, a.n)}`).join('; ');
  const teae = study.arms.map((a) => `${a.armName}: ${fmtPct(a.teae, a.n)}`).join('; ');
  const sae = study.arms.map((a) => `${a.armName}: ${fmtPct(a.sae, a.n)}`).join('; ');
  const disc = study.arms.map((a) => `${a.armName}: ${a.aeDisc}`).join('; ');
  const tag = `[${SYNTHETIC}.]`;
  const randomized = study.randomized !== false;
  const entered = randomized ? 'randomized' : 'enrolled';
  const add = (key, text) => (study.narrativeAdditions?.[key] ? `${text} ${study.narrativeAdditions[key]}` : text);
  const sets = randomized
    ? `Randomization was centralized; the analysis populations were the ITT set (all randomized, analysed as randomized) and the safety set (all treated, analysed as treated). In this synthetic study every randomized participant was treated, so both sets have ${total} participants.`
    : `Participants were not randomized: they were enrolled and assigned to sequential dose cohorts. The analysis populations were the full analysis set (all enrolled and dosed participants) and the safety set (all treated, analysed as treated). In this synthetic study every enrolled participant was dosed, so both sets have ${total} participants.`;
  const signatureLine = { f: 'The report is awaiting signature: no signature has been applied.', g: 'No signatures have been applied, and the report has not been placed in any submission sequence.', h: 'No signatures have been applied, and the report has not been placed in any submission sequence.' }[study.stage] ?? 'No signatures have been applied.';
  return {
    titlePage: `${tag} Clinical Study Report (ICH E3). Study title: ${study.title}. Protocol number: ${study.protocolNumber}. Test product: ${study.productName} (fictional). Indication: ${study.indication}. Phase: ${study.phase}. Sponsor: ${company.name}. SYNTHETIC — not clinical evidence. ${signatureLine}`,
    ethics: `${tag} The protocol and informed consent form would be reviewed by an Independent Ethics Committee or Institutional Review Board before any participant is enrolled, and the study would be conducted in accordance with ICH E6 Good Clinical Practice. This is a fictional study: no ethics committee, site or participant exists.`,
    investigators: `${tag} Sponsor: ${company.name}. Investigators, sites and the study's administrative structure are fictional placeholders for this demonstration; no real person or institution is named.`,
    synopsis: `${tag} Sponsor: ${company.name}. Study ${study.protocolNumber}: ${study.title}. Design: ${study.design}. Treatment groups: ${arms}. Primary endpoint: ${study.primaryEndpoint}. First participant in ${study.dates.firstPatientIn}; data cut ${study.dates.dataCut}; database lock ${study.dates.databaseLock}. ${total} participants were ${entered} and ${done} completed the study.`,
    introduction: `${tag} ${company.profile} This report describes study ${study.protocolNumber} in ${study.indication}. The study was conducted under the sponsor's fictional investigational programme for ${study.productName}.`,
    objectives: `${tag} Primary objective: to evaluate ${study.primaryEndpoint.toLowerCase()} of ${study.productName}. ${study.efficacyEndpoint ? `Secondary or exploratory objective: ${study.efficacyEndpoint.name}.` : 'Secondary objectives are listed in the protocol.'}`,
    plan: `${tag} Overall design: ${study.design}. Comparator: ${study.comparator}. ${sets}`,
    subjects: `${tag} ${total} participants were ${randomized ? 'randomized across' : 'enrolled into'} ${study.arms.length} ${randomized ? 'groups' : 'sequential dose cohorts'}: ${arms}. ${done} completed and ${total - done} discontinued. Completion by group: ${study.arms.map((a) => `${a.armName} ${a.completed}/${a.n}`).join('; ')}.`,
    efficacy: `${tag} ${ep} (${randomized ? 'ITT' : 'full analysis set'}, descriptive): ${eff}. Inferential statistics belong to the frozen tables (ICH E3 section 14) and are not restated in this narrative.`,
    safety: add('safety', `${tag} Participants with at least one treatment-emergent adverse event: ${teae}. Participants with a serious adverse event: ${sae}. Participants whose adverse event led to discontinuation: ${disc}. No deaths were reported. The most frequent events were ${study.aeTerms.slice(0, 3).map(([pt]) => pt.toLowerCase()).join(', ')}.`),
    discussion: add('discussion', `${tag} In this fictional study, ${ep.toLowerCase()} was ${eff}. The safety profile was consistent with the fictional programme's earlier studies. These are synthetic demonstration numbers and support no clinical conclusion.`),
  };
}

/* ───────────────── tasks per stage (Tasks board) ───────────────── */

export function stageTasks(study) {
  const p = study.protocolNumber;
  const t = (name, extra) => ({ title: `${p} · ${name}`, moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 14, ...extra,
    description: `${extra.description} ${SYNTHETIC}.` });
  const byStage = {
    a: [
      t('Agree the CSR shell and TLF shells with biostatistics', { status: 'in-progress', dueInDays: 21, description: 'Map ICH E3 headings to the planned TLF shells in the SAP.' }),
      t('Confirm protocol v1.0 and SAP v1.0 are filed in the Vault', { status: 'completed', dueInDays: -3, description: 'Protocol and SAP are in the project Vault (unapproved demo copies).' }),
      t('Plan the CSR writing timeline against the primary analysis', { dueInDays: 45, priority: 'low', description: 'Primary analysis planned for 2029; book medical-writing capacity.' }),
    ],
    b: [
      t(`Enrolment: ${study.enrolled} of ${study.plannedN} randomized`, { status: 'in-progress', priority: 'high', dueInDays: 30, description: `Enrolment status as of ${study.dates?.enrolmentAsOf}: ${study.enrolled} of ${study.plannedN} planned participants randomized.` }),
      t('Site 014 monitoring visit report overdue', { status: 'blocked', priority: 'high', dueInDays: -5, description: 'The interim monitoring visit report for a fictional site is past due.' }),
      t('Draft CSR sections 9.1 to 9.4 from the protocol', { dueInDays: 60, priority: 'low', description: 'Start the investigational-plan narrative while enrolment continues.' }),
    ],
    c: [
      t('Database lock', { status: 'completed', priority: 'high', dueInDays: -25, description: `Database locked ${study.dates?.databaseLock}.` }),
      t('Approve and freeze the clinical source in the Vault', { status: 'blocked', priority: 'high', dueInDays: 3, description: 'Needs the Vault review and approval by two further people (not the uploader) before the study data can be frozen.' }),
      t('Build the CSR tables from the frozen study data', { dueInDays: 10, description: 'Runs in the editor once the source is frozen.' }),
    ],
    d: [
      t('Write CSR synopsis and sections 1 to 10', { status: 'completed', dueInDays: -4, description: 'Synopsis, introduction, objectives, investigational plan and study participants are drafted.' }),
      t('Write efficacy, safety and conclusions sections', { status: 'in-progress', priority: 'high', dueInDays: 7, description: 'Efficacy, safety and discussion headings still to write.' }),
      t('Quality-check the drafted text against the source', { dueInDays: 12, description: 'Every number in the narrative must match the study-data source.' }),
    ],
    e: [
      t('Medical review of the CSR draft', { status: 'review', priority: 'high', dueInDays: 4, description: 'Three reviewer comments are open in the editor.' }),
      t('Resolve reviewer comments', { status: 'in-progress', dueInDays: 6, description: 'Answer or resolve each open comment in the one editor.' }),
      t('Send the CSR for formal review', { status: 'blocked', dueInDays: 8, description: 'Needs a second organisation member as reviewer; the author cannot review their own document.' }),
    ],
    f: [
      t('Close all reviewer comments', { status: 'completed', dueInDays: -6, description: 'Every comment is resolved.' }),
      t('Author signature (freeze) on the CSR', { status: 'blocked', priority: 'high', dueInDays: 2, description: 'Needs the signer\'s password and signing authority; not performed by the seed.' }),
      t('Medical monitor e-signature on the CSR', { dueInDays: 5, priority: 'high', description: 'A second person, not the author, signs.' }),
    ],
    g: [
      t('Place the CSR at 5.3.5.1 in IND sequence 0000', { status: 'blocked', priority: 'high', dueInDays: 3, description: 'Filing the CSR to the Vault is refused until a scientific-review receipt covers the saved CSR and its approved source versions (CSR_SCIENTIFIC_REVIEW_REQUIRED).' }),
      t('Compile and validate the sequence', { dueInDays: 5, priority: 'high', description: 'Run the eCTD compile and agency validator in Submission Center.' }),
      t('Prepare the cover letter for the sequence', { dueInDays: 9, description: 'Module 1 cover letter naming the CSR.' }),
    ],
    h: [
      t('Answer the agency information request on the CSR', { status: 'in-progress', priority: 'high', dueInDays: 21, description: 'Fictional scenario: rehearse answers to three numbered questions on the HLY-09-101 CSR in the agency inbox. The CSR has not been placed at 5.3.5.1 in IND sequence 0000 in this workspace.' }),
      t('Re-run the reactogenicity listings for the response', { dueInDays: 10, description: 'Subject-level solicited reaction listings by severity.' }),
      t('Confirm the CSR leaf at 5.3.5.1', { status: 'blocked', dueInDays: 7, description: 'The seed could not place the CSR leaf: filing is refused until a scientific-review receipt covers the CSR (CSR_SCIENTIFIC_REVIEW_REQUIRED). The letter is a fictional scenario.' }),
    ],
  };
  return byStage[study.stage];
}

/* ───────────────── study design for the enrolling study (Biostatistics) ───────────────── */

export function studyDesignFor(study, title) {
  return {
    title,
    acronym: study.protocolNumber,
    phase: study.phase,
    indication: study.indication,
    productType: study.productType,
    targetRegions: ['US'],
    objectives: [{ level: 'primary', order: 1, text: `To evaluate the efficacy of ${study.productName} compared with ${study.comparator.toLowerCase()} on ${study.primaryEndpoint.toLowerCase()} (fictional).`, endpointName: study.primaryEndpoint }],
    endpoints: [
      { role: 'primary', name: study.primaryEndpoint, type: 'continuous', definition: 'Change from baseline in metres walked in six minutes, Week 52 (fictional).', timepoint: 'Week 52' },
      { role: 'key_secondary', name: study.secondaryEndpoints[0], type: 'continuous', definition: 'Change from baseline in upright FVC % predicted (fictional).', timepoint: 'Week 52' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel', controlType: 'placebo', controlJustification: 'Placebo control with open-label extension after Week 52 (fictional).' },
    population: {
      targetDescription: 'Adults with late-onset Pompe disease able to walk 75 to 500 m in six minutes (fictional).',
      analysisPopulations: [
        { kind: 'ITT', definition: 'All randomized participants, analysed as randomized.', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'All participants who received at least one dose.' },
      ],
      eligibility: [],
    },
    arms: study.plannedArms.map((a, i) => ({ name: a.armName, interventions: [{ name: a.armName, role: i === 0 ? 'investigational' : 'placebo', route: 'intravenous', regimen: 'Every other week for 52 weeks' }] })),
    randomization: { ratio: [2, 1], allocationMethod: 'stratified', stratificationFactors: ['Baseline 6MWD (< 300 m, >= 300 m)'], blinding: 'double' },
    statisticalPlan: {
      alpha: 0.025, power: 0.85, plannedSampleSize: study.plannedN, dropoutRate: 0.1,
      plannedAnalyses: [{ endpointName: study.primaryEndpoint, method: 'MMRM' }],
      multiplicity: { method: 'fixed_sequence', alphaAllocation: [{ endpointName: study.primaryEndpoint, alpha: 0.025 }] },
      missingDataStrategy: 'MMRM under missing at random; tipping-point sensitivity analysis',
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.65 },
    },
  };
}

/* ───────────────── protocol / SAP PDF text (Vault, planning and later stages) ───────────────── */

export function protocolSections(study) {
  const company = companyOf(study);
  const arms = (study.arms ?? study.plannedArms).map((a) => `${a.armName}: n = ${a.n}`);
  return [
    { heading: 'Sponsor and study', paragraphs: [`Sponsor: ${company.name}. ${company.profile}`, `Protocol ${study.protocolNumber}, Phase ${study.phase}. ${study.title}.`] },
    { heading: 'Design and population', paragraphs: [`Design: ${study.design}. Comparator: ${study.comparator}.`, `Indication: ${study.indication}.`, ...arms] },
    { heading: 'Endpoints', paragraphs: [`Primary: ${study.primaryEndpoint}.`, ...(study.secondaryEndpoints ?? (study.efficacyEndpoint ? [study.efficacyEndpoint.name] : [])).map((e) => `Secondary: ${e}.`)] },
    { heading: 'Status', paragraphs: ['FICTIONAL DEMONSTRATION DOCUMENT. SYNTHETIC; not a real protocol, not clinical evidence, not approved.'] },
  ];
}

export function sapSections(study) {
  return [
    { heading: 'Analysis sets', paragraphs: ['ITT: all randomized participants, analysed as randomized. Safety: all participants who received study treatment.'] },
    { heading: 'Primary analysis', paragraphs: [`${study.primaryEndpoint}: ${study.phase === '3' ? 'stratified log-rank test and Cox model (OS) or MMRM (continuous), two-sided alpha 0.05' : 'descriptive proportions with exact 95% confidence intervals'}.`] },
    { heading: 'Status', paragraphs: ['FICTIONAL DEMONSTRATION DOCUMENT. SYNTHETIC; not a real SAP, not approved.'] },
  ];
}

/* ───────────────── the agency information request for stage h (fictional) ───────────────── */

export const HALCYRA_IR_LETTER = {
  // ASCII only: the upload's file name becomes the data-room title, and a non-ASCII name is stored mis-decoded.
  fileName: '[Demo - Portfolio] FDA information request (fictional) - IND HLY-09 - CSR HLY-09-101.txt',
  communication: {
    sourceType: 'uploaded_official_correspondence',
    communicationType: 'FDA information request (fictional demo) on CSR HLY-09-101, IND HLY-09',
    sourceChannel: 'Demo seed: fictional letter',
    letterClass: 'information_request',
    urgency: 'high',
    responseRequired: true,
  },
  expect: { commitments: [], questions: 3 },
  text: `DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.

Food and Drug Administration
Silver Spring MD 20993

IND HLY-09 (fictional)
INFORMATION REQUEST

Halcyra Vaccines (fictional demonstration sponsor)
Attention: Regulatory Affairs

Dear Regulatory Affairs:

Please refer to your Investigational New Drug Application (IND) for HLY-09, an
adjuvanted recombinant RSV prefusion F protein vaccine, and to the clinical study
report for study HLY-09-101 (rehearsal scenario: in this workspace the report has not
been placed in any IND sequence).

We are reviewing the clinical study report and have the following requests for information:

1. Provide subject-level listings of solicited local and systemic reactions by
   maximum severity and day of onset for each dose cohort.

2. Clarify whether the seroresponse definition used in the report matches the
   protocol definition, and state the assay lower limit of quantitation used.

3. Provide the narrative for the participant in the 120 mcg cohort who discontinued
   because of an adverse event, including time to onset and outcome.

Please submit your response as an amendment to this IND.

If you have any questions, call the Regulatory Project Manager for this application.

Sincerely,
{See appended electronic signature page}

DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.
`,
};

/* ───────────────── known product behaviour (reported, not hidden) ───────────────── */

/**
 * The product's Quality capture as read in the server (2026-11-09). portfolio.mjs records it in the manifest
 * (knownProductBehaviour) with this run's stage h read; the pack changes nothing to mask it.
 */
export const KNOWN_PRODUCT_BEHAVIOUR = Object.freeze({
  where: 'Records > Data Room sources of every project, in any client workspace (each sponsor\'s own workspace included), from the first time anyone reads that project\'s data room',
  trigger: 'the first page of a project\'s data room, GET /api/c2c/projects/:id/sources at offset 0: opening Records > Data Room sources, the editor\'s sources rail, or a seed pack\'s read. This pack makes that read on one project, stage h (the shared agency-letter step and its read-back); the capture is the same on every project whoever reads it first.',
  cause: 'server/services/clinical-regulatory-evidence/data-room-search.ts prepareSourceScope calls record-source.ts syncQualityProjectSources, which snapshots into the project\'s data room what server/services/qms/project-evidence-queries.ts returns: suppliers, internal audits and management reviews for the whole organisation; change controls with no program; GMP deviations and quality plans with no client workspace; and their record relationships.',
  ownWorkspace: 'A sponsor\'s own client workspace does not stop it. On the local database (2026-11-09) every portfolio project in its sponsor\'s workspace holds the same 21 records from other packs (Lumen suppliers, internal audits, management reviews and GMP deviations; change controls for C2C-101 and MDX NP-100 with no program; four record relationships) as the archived projects in the organisation\'s own workspace (docs/evidence/DEMO/portfolio/sponsor-workspaces/README.md).',
  action: 'Reported to the coordinator and the product owner, who rule on the capture\'s scope in project-evidence-queries.ts. The pack changes nothing to mask it; observedThisRun is stage h\'s data room as this run read it back.',
});
