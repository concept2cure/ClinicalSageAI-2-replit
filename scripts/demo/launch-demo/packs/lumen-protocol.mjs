/**
 * launch-demo/packs/lumen-protocol.mjs — LMN-201's protocol in the protocol workspace (2026-11-10, the founder:
 * "everything ready for a sales showcase of the entire platform"). A sweep of the Lumen account found "No protocol in
 * development for LMN-201": Study & Protocol Design and its sixteen tabs were empty.
 *
 * The protocol itself goes through the biotech pack's seeding path (biotech-protocol.mjs ensureProtocol), given this
 * pack's content: the document and its ICH M11 sections, objectives, eligibility, visits, the schedule of
 * assessments, the risk register, milestones, an amendment and a version. Then, through the workspace's own routes:
 *
 *   the RePreve study design bound to it     POST /api/protocol-development/documents/:id/study-design
 *   two deviations, assessed, with CAPA      POST /api/protocol-deviations/deviations, …/assessment, …/capa
 *   a reviewer and a review comment          POST /api/protocol-reviews/documents/:id/reviewers, …/comments
 *
 * RePreve as the public listing describes it (NCT05330182): randomized, double-blind, placebo-controlled, 375
 * planned, sustained clinical cure at week 12. Everything else here is ILLUSTRATIVE and synthetic: visits, criteria,
 * risks, dates, sites, people and deviations are invented for the demonstration. Nothing is Lumen Bioscience's.
 */
import { must } from '../lib.mjs';
import { asArray } from './biotech-shared.mjs';
import { ensureProtocol } from './biotech-protocol.mjs';
import { T } from './lumen-content.mjs';

const STUDY = 'LMN-201-CDI-02';
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SYN = 'Synthetic demonstration content, not actual study data.';
const W12 = 'Week 12 (primary endpoint)';

const PROTOCOL = {
  name: `Protocol ${STUDY} (RePreve) — LMN-201 for prevention of recurrent C. difficile infection (SYNTHETIC)`,
  synopsis: `A randomized, double-blind, placebo-controlled study of oral LMN-201 with standard-of-care antibiotics in adults with a recent Clostridioides difficile infection. 375 participants planned; primary endpoint sustained clinical cure at Week 12 (public listing NCT05330182). ${SYN}`,
  sections: {
    synopsis: `Randomized, double-blind, placebo-controlled study of oral LMN-201 given with standard-of-care antibiotics. 375 adults with a recent C. difficile infection, randomized to LMN-201 or placebo. Primary endpoint: sustained clinical cure at Week 12. ${SYN}`,
    background: `C. difficile infection recurs in a substantial share of patients after antibiotic treatment. LMN-201 is an orally delivered cocktail of therapeutic proteins intended to neutralise the organism and its toxin in the gut during and after antibiotic treatment. ${SYN}`,
    objectives: `Primary: sustained clinical cure at Week 12 (initial clinical cure and no recurrence through Week 12). Secondary: recurrence by Week 8, time to recurrence, safety and tolerability. The structured objectives are in the Objectives tab. ${SYN}`,
    design: `Multicentre, randomized, double-blind, placebo-controlled, parallel-group. Randomization stratified by number of prior episodes and by the standard-of-care antibiotic. Illustrative for the demonstration.`,
    population: `Adults recently diagnosed with C. difficile infection who are receiving standard-of-care antibiotics (public listing). The structured inclusion and exclusion criteria are in the Eligibility tab and are illustrative.`,
    intervention: `LMN-201 enteric capsules or matching placebo, taken orally during standard-of-care antibiotic treatment and for a period after it. Dose and duration here are illustrative.`,
    assessments: `See the schedule of assessments: stool frequency diary daily through Week 4, clinical cure assessment at end of antibiotics, recurrence assessment at each visit, safety laboratory at Screening, Week 4 and Week 12. ${SYN}`,
    safety: `Adverse events from consent to last contact; serious adverse events reported to the sponsor within 24 hours and reconciled with the safety database before each data cut. An independent data monitoring committee reviews unblinded safety. Illustrative.`,
    statistics: `375 participants planned (public listing). Primary analysis: difference in proportions with sustained clinical cure at Week 12, with a 95% confidence interval, in all randomized participants. The planning assumptions are illustrative; the engine's computation is in the Statistics tab.`,
    ethics: `Conducted under ICH E6(R3) and applicable regulations. A central IRB approves the protocol, the consent form and each amendment before use. ${SYN}`,
  },
  objectives: [
    { objectiveType: 'primary', objective: 'To evaluate whether LMN-201 with standard-of-care antibiotics improves sustained clinical cure compared with placebo', endpoint: 'Sustained clinical cure (initial clinical cure and no recurrence)', timepoint: 'Week 12' },
    { objectiveType: 'secondary', objective: 'To evaluate the effect of LMN-201 on early recurrence', endpoint: 'Recurrence of C. difficile infection', timepoint: 'Week 8' },
    { objectiveType: 'secondary', objective: 'To characterise the time to recurrence', endpoint: 'Time from end of antibiotics to recurrence', timepoint: 'Through Week 12' },
    { objectiveType: 'secondary', objective: 'To characterise the safety and tolerability of LMN-201', endpoint: 'Treatment-emergent adverse events, laboratory values, vital signs', timepoint: 'Through Week 12 and follow-up' },
    { objectiveType: 'exploratory', objective: 'To describe stool toxin clearance (illustrative)', endpoint: 'Toxin B in stool by immunoassay', timepoint: 'Weeks 2, 4 and 12' },
  ],
  inclusion: [
    'Adult aged 18 years or older at the time of signing informed consent',
    'Confirmed C. difficile infection diagnosed within the protocol window before randomization',
    'Receiving, or about to receive, a standard-of-care antibiotic for the current episode',
    'Able to swallow capsules and to complete the stool diary',
    'Signed informed consent on the current IRB-approved form',
  ],
  exclusion: [
    'Fulminant C. difficile infection, toxic megacolon or ileus',
    'Receipt of faecal microbiota transplantation or bezlotoxumab for the current episode',
    'Inflammatory bowel disease with active flare (illustrative)',
    'Known hypersensitivity to a component of the study product',
    'Participation in another interventional study within 30 days',
  ],
  visits: [
    { visitName: 'Screening', timepoint: 'Day −7 to Day −1', procedures: ['Informed consent', 'Eligibility review', 'Stool toxin test', 'Safety laboratory'] },
    { visitName: 'Baseline (Day 1)', timepoint: 'Day 1', procedures: ['Randomization', 'First dose', 'Diary training'] },
    { visitName: 'End of antibiotics', timepoint: 'Day 10 to 14', procedures: ['Clinical cure assessment', 'Diary review', 'AE review'] },
    { visitName: 'Week 4', timepoint: 'Day 28 ± 3', procedures: ['Recurrence assessment', 'Safety laboratory', 'AE review'] },
    { visitName: 'Week 8', timepoint: 'Day 56 ± 5', procedures: ['Recurrence assessment', 'AE review'] },
    { visitName: W12, timepoint: 'Day 84 ± 5', procedures: ['Sustained clinical cure assessment', 'Safety laboratory', 'AE review'] },
    { visitName: 'Safety follow-up', timepoint: 'Day 112 ± 7', procedures: ['AE review', 'Concomitant medication review'] },
  ],
  assessments: [
    { name: 'Informed consent and eligibility', category: 'eligibility', visits: ['Screening'] },
    { name: 'Stool toxin test', category: 'lab', visits: ['Screening', 'Week 4', W12] },
    { name: 'Study product dispensing and accountability', category: 'procedure', visits: ['Baseline (Day 1)', 'End of antibiotics', 'Week 4'] },
    { name: 'Stool frequency diary review', category: 'questionnaire', visits: ['End of antibiotics', 'Week 4', 'Week 8', W12] },
    { name: 'Clinical cure or recurrence assessment', category: 'exam', visits: ['End of antibiotics', 'Week 4', 'Week 8', W12] },
    { name: 'Safety laboratory (haematology, chemistry)', category: 'lab', visits: ['Screening', 'Week 4', W12] },
    { name: 'Vital signs', category: 'vital_signs', visits: ['Screening', 'Baseline (Day 1)', 'Week 4', W12] },
    { name: 'Adverse event review', category: 'other', visits: ['Baseline (Day 1)', 'End of antibiotics', 'Week 4', 'Week 8', W12, 'Safety follow-up'] },
  ],
  risks: [
    { category: 'data_integrity', description: 'Missing Week 12 assessments weaken the primary endpoint', likelihood: 'likely', impact: 'major', mitigation: 'Visit-window reminders at each site; a quality tolerance limit on missing Week 12 assessments, reviewed monthly; triggered visits when a site approaches it.', owner: 'Clinical Operations Lead' },
    { category: 'participant_safety', description: 'Late reporting of serious adverse events from sites', likelihood: 'possible', impact: 'major', mitigation: 'AE reporting-lag key risk indicator per site; SAE reconciliation before each data cut; retraining and a triggered visit on breach.', owner: 'Safety Physician' },
    { category: 'data_integrity', description: 'Incomplete stool diaries make recurrence hard to adjudicate', likelihood: 'possible', impact: 'moderate', mitigation: 'Diary training at Baseline; diary review at every visit; blinded adjudication of recurrence.', owner: 'Data Manager' },
    { category: 'operational', description: 'Temperature excursion of study product in shipment', likelihood: 'possible', impact: 'moderate', mitigation: 'Qualified shipper with data loggers; quarantine and disposition of excursed lots; courier requalification after an excursion.', owner: 'CMC Lead' },
    { category: 'regulatory', description: 'Change to the dissolution method questioned by the agency', likelihood: 'unlikely', impact: 'major', mitigation: 'Method discriminating-power data filed with the response to the information request; stability data trended.', owner: 'Regulatory Affairs Lead' },
    { category: 'operational', description: 'Slow enrolment at sites with competing C. difficile studies', likelihood: 'likely', impact: 'moderate', mitigation: 'Enrolment tracked weekly against plan; additional sites pre-qualified.', owner: 'Clinical Operations Lead' },
  ],
  milestones: [
    { name: 'IRB approval of amendment 2', milestoneType: 'protocol_approval', targetDate: day(-40) },
    { name: 'First participant in, Part B', milestoneType: 'first_subject', targetDate: day(-25) },
    { name: 'Last participant in', milestoneType: 'last_subject', targetDate: day(120) },
    { name: 'Database lock, Week 12', milestoneType: 'database_lock', targetDate: day(240) },
    { name: 'Clinical study report', milestoneType: 'csr', targetDate: day(330) },
  ],
  team: [
    { memberName: 'Dr. Imani Okafor-Lindqvist (fictional)', role: 'principal_investigator', responsibilities: 'Coordinating investigator; medical oversight across sites.' },
    { memberName: 'Dr. Rafael Montague (fictional)', role: 'co_investigator', responsibilities: 'Blinded adjudication of recurrence.' },
    { memberName: 'Yuki Tanaka-Brandt, MSc (fictional)', role: 'biostatistician', responsibilities: 'Sample size, SAP and the primary analysis.' },
    { memberName: 'Dele Abernathy (fictional)', role: 'data_manager', responsibilities: 'eCRF, diary data and database lock.' },
    { memberName: 'Regulatory Affairs Lead (fictional)', role: 'regulatory', responsibilities: 'IND maintenance, amendments and agency correspondence.' },
  ],
  amendment: {
    title: 'Amendment 2 — widen the Week 12 visit window and add a diary reminder call',
    amendmentNumber: '02',
    amendmentType: 'minor',
    rationale: 'Follows the CAPA for missed Week 12 visits at Site 104: the visit window widens from ±3 to ±5 days and a reminder call is added at Week 11. No change to eligibility, dosing or the primary endpoint. Synthetic.',
    affectsConsent: false,
    affectsRisk: true,
    change: { sectionRef: '6. Schedule of Assessments', changeDescription: 'Widen the Week 12 visit window and add a Week 11 reminder call.', previousText: 'Week 12 visit at Day 84 ± 3.', proposedText: 'Week 12 visit at Day 84 ± 5; a reminder call at Week 11.' },
  },
};

/** Deviations on the protocol: reported, assessed, and corrected. Site numbers and participants are invented. */
const DEVIATIONS = [
  {
    deviationNumber: 'LMN201-PD-014', category: 'procedure', discoveredDate: day(-18),
    description: `Site 104: participant 104-007 attended the Week 12 visit 4 days outside the window, so the primary endpoint assessment was late. ${SYN}`,
    rootCause: 'The site scheduled from the end-of-antibiotics date instead of Day 1.',
    assessment: { severity: 'major', affectsSafety: false, rationale: 'The primary endpoint assessment was outside its window; no safety impact.' },
    capa: [
      { action: 'Retrain Site 104 staff on visit-window calculation from Day 1', owner: 'Clinical Operations Lead', dueDate: day(-5), status: 'completed' },
      { action: 'Add a Week 11 reminder call for every participant (amendment 2)', owner: 'Clinical Operations Lead', dueDate: day(14), status: 'in_progress' },
    ],
  },
  {
    deviationNumber: 'LMN201-PD-015', category: 'safety', discoveredDate: day(-9),
    description: `Site 107: two serious adverse events were reported to the sponsor more than 24 hours after the site became aware. ${SYN}`,
    rootCause: 'The study coordinator was new and had not completed SAE reporting training.',
    assessment: { severity: 'major', affectsSafety: true, rationale: 'Late SAE reports delay safety oversight.' },
    capa: [
      { action: 'Complete SAE reporting training for the Site 107 coordinator', owner: 'Site 107 Investigator', dueDate: day(7), status: 'open' },
    ],
  },
];

const REVIEW_COMMENT = 'Section 9: state how missing Week 12 assessments are handled in the primary analysis, now that the visit window is ±5 days.';

const reason = (what) => `Launch demo seed: ${what} for ${STUDY}.`;
const find = (rows, name) => rows.find((r) => r.title === T(name)) ?? null;
const SPEC = { PROTOCOL, STUDY, T, find, phase: 'Phase 2/3', therapeuticArea: 'Infectious disease — C. difficile infection' };

/** The protocol as the workspace reads it (GET /api/protocol-dev): its design, deviations and reviews. */
async function readView(api, id) {
  const docs = must(await api('GET', '/api/protocol-dev'), 200, 'read the protocol workspace').data ?? [];
  const mine = docs.find((d) => String(d.id) === String(id));
  if (!mine) throw new Error(`the protocol workspace does not list protocol #${id}`);
  return mine;
}

async function bindDesign({ api, run, tally }, program, rec) {
  await run.step('Protocol development: the RePreve study design bound to the protocol', async () => {
    const view = await readView(api, rec.id);
    if (view.studyDesign?.studyId) { tally.found('protocol-design-binding'); return `bound already (${view.studyDesign.studyId})`; }
    const designs = asArray(must(await api('GET', `/api/biostat-bridge/designs?program_id=${encodeURIComponent(program.id)}`), 200, 'list the project\'s study designs'), 'data');
    if (designs.length !== 1) return `not executed: the project has ${designs.length} study designs, and one is bound by a person when there is a choice`;
    must(await api('POST', `/api/protocol-development/documents/${rec.id}/study-design`, {
      studyDesignId: designs[0].studyId, reason: reason('bind the RePreve study design, so its statistics and checks show on the protocol'),
    }), [200, 201], 'bind the study design');
    tally.created('protocol-design-binding');
    return `bound ${designs[0].studyId}`;
  });
}

async function addDeviation(api, rec, d) {
  const made = must(await api('POST', '/api/protocol-deviations/deviations', {
    protocolDocumentId: rec.id, description: d.description, category: d.category, rootCause: d.rootCause,
    deviationNumber: d.deviationNumber, discoveredDate: d.discoveredDate, reason: reason(`report deviation ${d.deviationNumber}`),
  }), 201, `report ${d.deviationNumber}`);
  const id = Number(made.id ?? made.deviationId);
  if (!Number.isSafeInteger(id)) throw new Error(`${d.deviationNumber} was not recorded: ${JSON.stringify(made).slice(0, 200)}`);
  must(await api('POST', `/api/protocol-deviations/deviations/${id}/assessment`, { ...d.assessment, reason: reason(`assess ${d.deviationNumber}`) }), [200, 201], `assess ${d.deviationNumber}`);
  for (const c of d.capa) {
    const capa = must(await api('POST', `/api/protocol-deviations/deviations/${id}/capa`, { action: c.action, owner: c.owner, dueDate: c.dueDate, reason: reason('add a corrective action') }), [200, 201], 'add a CAPA action');
    if (c.status !== 'open') {
      must(await api('PATCH', `/api/protocol-deviations/capa/${capa.capaId}/status`, { status: c.status, reason: reason('record the corrective action\'s progress') }), [200, 201], 'set the CAPA status');
    }
  }
}

async function ensureDeviations({ api, run, tally }, rec) {
  await run.step(`Protocol development: ${DEVIATIONS.length} deviations, assessed, with CAPA`, async () => {
    const have = asArray(must(await api('GET', `/api/protocol-deviations/deviations?protocolDocumentId=${rec.id}`), 200, 'list the protocol\'s deviations'), 'deviations', 'rows', 'data');
    let added = 0;
    for (const d of DEVIATIONS) {
      if (have.some((x) => (x.deviation_number ?? x.deviationNumber) === d.deviationNumber)) { tally.found('protocol-deviation'); continue; }
      await addDeviation(api, rec, d);
      tally.created('protocol-deviation');
      added += 1;
    }
    return `${added} reported, ${DEVIATIONS.length - added} already there`;
  });
}

async function ensureReview({ api, run, tally, signer }, rec) {
  await run.step('Protocol development: a reviewer and a review comment', async () => {
    const view = await readView(api, rec.id);
    if ((view.reviews ?? []).length || (view.reviewComments ?? []).length) { tally.found('protocol-review'); return 'already there'; }
    const name = signer?.session?.user?.displayName ?? signer?.session?.user?.name ?? signer?.email ?? 'Scientific reviewer (fictional)';
    const userId = Number(signer?.userId ?? signer?.session?.user?.id);
    const assigned = must(await api('POST', `/api/protocol-reviews/documents/${rec.id}/reviewers`, {
      reviewerName: name, ...(Number.isSafeInteger(userId) && userId > 0 ? { reviewerUserId: userId } : {}),
      role: 'statistical', dueDate: day(10), reason: reason('ask for a statistical review of amendment 2'),
    }), [200, 201], 'assign the reviewer');
    must(await (signer?.api ?? api)('POST', `/api/protocol-reviews/documents/${rec.id}/comments`, {
      comment: REVIEW_COMMENT, sectionRef: '9. Statistics', severity: 'major',
      ...(assigned.assignmentId ? { assignmentId: Number(assigned.assignmentId) } : {}), reason: reason('leave a review comment'),
    }), [200, 201], 'leave the review comment');
    tally.created('protocol-review');
    return `${name} assigned; 1 comment`;
  });
}

/** program: { id } of LMN-201. ctx: { api, run, tally, identity, signer? }. */
/**
 * Correction, 2026-11-10. For about an hour the shared protocol seed (biotech-protocol.mjs ensureComponents) wrote
 * the psoriasis study's eligibility criteria onto this protocol: its criteria line read the biotech content, not the
 * calling pack's. The seed is fixed. A copy already seeded that way cannot be repaired, because the protocol
 * workspace has no route that removes a criterion. So that copy is renamed "SET ASIDE" through the cover-page route
 * (PATCH /api/protocol-development/documents/:id), and the protocol is seeded again under its own title. Nothing is
 * deleted, and the set-aside copy says what it is. With no such copy this does nothing.
 */
const SET_ASIDE = `SET ASIDE, do not use: an earlier seed copy of protocol ${STUDY} with another study's eligibility criteria (SYNTHETIC)`;

async function setAsideMisseededCopy({ api, run, tally }) {
  await run.step('Protocol development: a copy seeded with another study\'s eligibility criteria is set aside', async () => {
    const list = asArray(must(await api('GET', '/api/protocol-development/documents?kind=clinical'), 200, 'list protocol documents'), 'data', 'documents');
    const doc = find(list, PROTOCOL.name);
    if (!doc) return 'none';
    const view = must(await api('GET', `/api/protocol-development/documents/${doc.id}`), 200, 'read protocol document');
    const own = new Set([...PROTOCOL.inclusion, ...PROTOCOL.exclusion]);
    const foreign = asArray(view, 'eligibility', 'eligibilityCriteria').filter((c) => !own.has(c.criterion));
    if (!foreign.length) return 'none';
    must(await api('PATCH', `/api/protocol-development/documents/${doc.id}`, {
      title: T(SET_ASIDE), protocolNumber: `${STUDY}-SET-ASIDE`,
      reason: `Demo seed correction: this copy holds ${foreign.length} eligibility criteria from another demo study, and a criterion cannot be removed. It is set aside and the protocol is seeded again.`,
    }), [200, 201], 'set the mis-seeded protocol copy aside');
    tally.created('protocol-set-aside');
    run.note(`Protocol #${doc.id} was seeded with ${foreign.length} eligibility criteria from another demo study (a seed defect, fixed 2026-11-10). It is renamed "SET ASIDE" and a correct copy is seeded; the product has no route to remove it.`);
    return `#${doc.id} set aside (${foreign.length} foreign criteria)`;
  });
}

export async function ensureLumenProtocol(ctx, program) {
  await setAsideMisseededCopy(ctx);
  const rec = await ensureProtocol(ctx, program, SPEC);
  await bindDesign(ctx, program, rec);
  await ensureDeviations(ctx, rec);
  await ensureReview(ctx, rec);
  return rec;
}
