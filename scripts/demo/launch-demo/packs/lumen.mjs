/**
 * launch-demo/packs/lumen.mjs — the LUMEN demonstration pack.
 *
 * Lumen Bioscience's public pipeline as demo projects, under a client workspace
 * marked "demo — not affiliated" (data/seeds/lumen-demo, its README and
 * LMN201_CSR_SANDBOX_RUNBOOK.md). The founder asked for it by name; until
 * 2026-10-31 the kit existed in the repository and nothing seeded it.
 *
 *   Client     Lumen Bioscience (demo — not affiliated)
 *   Projects   LMN-201, LMN-801, LMN-301, LMN-401 (one per program)
 *   LMN-201    program overview and the SYNTHETIC LMN-201-like CSR source in
 *              the Vault, the RePreve study design in Biostatistics, CMC
 *              specifications, stability and batches, tasks, and a FICTIONAL
 *              FDA approval letter in the data room and the agency inbox, whose
 *              postmarketing requirements and commitment the inbox extracts
 *   Others     program overview and tasks
 *
 * Same rules as the other packs: through the product's own API as the
 * signed-in account, idempotent by title, and a refusal fails the step with the
 * server's answer. Content and its provenance are in lumen-content.mjs.
 */
import fs from 'node:fs';
import { connectSigner, makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { asArray, makeTally } from './biotech-shared.mjs';
import { APPROVAL_LETTER, CLIENT, INFORMATION_REQUEST, CSR_SOURCE_FILE, FOOTER, LMN201_CMC, LMN201_DESIGN, PROJECTS, T, TASKS, overviewPdf } from './lumen-content.mjs';
import { ensureAgencyLetter, ensureCmc, ensurePlanDocuments, ensureStudyDesign, ensureTasks } from './work-areas.mjs';
import { ensureLumenQms } from './lumen-qms.mjs';
import { ensureLumenRbm } from './lumen-rbm.mjs';
import { connectApprover, ensureLumenVault } from './lumen-vault.mjs';
import { ensureLumenCsr } from './lumen-csr.mjs';
import { ensureLumenProtocol } from './lumen-protocol.mjs';
import { ensureSubmission } from './biotech-submission.mjs';

const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function ensureClient({ api, run, tally }) {
  let id = null;
  await run.step(`Client workspace: ${CLIENT.name}`, async () => {
    const listed = must(await api('GET', '/api/clients'), 200, 'list client workspaces');
    const found = (Array.isArray(listed.clients) ? listed.clients : rowsOf(listed)).find((c) => c.slug === CLIENT.slug);
    if (found) { id = Number(found.id); tally.found('client-workspace'); return `found ${id}`; }
    const j = must(await api('POST', '/api/clients', { name: CLIENT.name, slug: CLIENT.slug }), [200, 201], 'create client workspace');
    id = Number(j.client?.id ?? j.data?.id ?? j.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`client workspace create answered no id: ${JSON.stringify(j).slice(0, 300)}`);
    tally.created('client-workspace');
    return `created ${id}`;
  });
  run.record('client', { ...CLIENT, id });
  return id;
}

async function listAllProjects(api) {
  const out = [];
  for (let offset = 0, page = 0; page < 100; page += 1) {
    const list = must(await api('GET', `/api/c2c/projects?limit=200${offset ? `&offset=${offset}` : ''}`), 200, 'list projects');
    if (!Array.isArray(list.data) || list.meta?.pendingStore === true || list.meta?.reconciliationRequired === true) {
      throw new Error('The project list is unavailable or requires access reconciliation; no Lumen project was created.');
    }
    out.push(...list.data);
    if (list.meta?.hasMore !== true || !list.data.length) break;
    offset += list.data.length;
  }
  return out;
}

async function ensureProject({ api, run, tally }, spec, clientWorkspaceId, existing) {
  const title = T(spec.name);
  const rec = { code: spec.code, title };
  await run.step(`Projects: ${spec.code}`, async () => {
    let row = existing.find((p) => (p.title ?? p.name) === title) ?? null;
    if (row) tally.found('program');
    else {
      row = must(await api('POST', '/api/c2c/projects', {
        name: title,
        productName: spec.code,
        programType: 'ind',
        submissionTypeId: 'us_ind',
        productType: 'biologic',
        clientWorkspaceId,
        primaryAgency: 'FDA',
        indication: spec.indication,
        priority: spec.priority,
        targetSubmissionDate: inDays(spec.targetInDays),
        teamMembers: [],
      }), 201, `create project ${spec.code}`).data;
      tally.created('program');
    }
    rec.id = row.id;
    return `${row.id}${row.code ? ` (${row.code})` : ''}`;
  });
  return rec;
}

async function ensureOverview({ api, run, tally }, project, spec) {
  const doc = overviewPdf(spec);
  await run.step(`Vault: ${spec.code} program overview`, async () => {
    const search = must(await api('GET', `/api/c2c/project-vault/${project.id}/search?q=${encodeURIComponent(`${spec.code} program overview`)}&limit=50`), 200, 'vault search');
    const hit = (search.data?.results ?? []).find((x) => x.title === doc.title);
    if (hit) { tally.found('vault-document'); return `found ${hit.id}`; }
    const pdf = makeMultiPagePdfBuffer({ title: doc.title, subtitle: doc.subtitle, footer: FOOTER, sections: doc.sections });
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), `${spec.code}-program-overview.pdf`);
    form.append('programId', project.id);
    form.append('documentCode', `${spec.code}-OVERVIEW.pdf`);
    form.append('documentTitle', doc.title);
    form.append('documentType', 'OTHER');
    const j = must(await api('POST', '/api/vault/ingest', form), 201, `vault ingest ${spec.code} overview`);
    if (j.document?.contentHash && j.document.contentHash !== sha256(pdf)) throw new Error('vault ingest: server hash differs from the bytes sent');
    tally.created('vault-document');
    return `ingested ${j.document.id}`;
  });
}

/** The runbook's step 2: retain the synthetic CSR source in the LMN-201 Vault as an original. */
async function ensureCsrSource({ api, run, tally }, project) {
  const title = T('LMN-201-like Part B CSR source — SYNTHETIC, NOT CLINICAL EVIDENCE');
  await run.step('Vault: synthetic LMN-201 CSR source (JSON)', async () => {
    const search = must(await api('GET', `/api/c2c/project-vault/${project.id}/search?q=${encodeURIComponent('CSR source')}&limit=50`), 200, 'vault search');
    const hit = (search.data?.results ?? []).find((x) => x.title === title);
    if (hit) { tally.found('vault-document'); return `found ${hit.id}`; }
    const bytes = fs.readFileSync(CSR_SOURCE_FILE);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/json' }), 'lmn201_synthetic_csr_source_v1.json');
    form.append('programId', project.id);
    form.append('documentCode', 'LMN-201-CSR-SOURCE-SYNTHETIC.json');
    form.append('documentTitle', title);
    form.append('documentType', 'OTHER');
    const res = await api('POST', '/api/vault/ingest', form);
    if (res.status !== 201) {
      run.note(`The Vault refused the synthetic CSR source (HTTP ${res.status}: ${String(res.text).slice(0, 200)}). It stays in data/seeds/lumen-demo for upload by hand.`);
      return `not executed — the Vault refused it (HTTP ${res.status})`;
    }
    tally.created('vault-document');
    return `ingested ${res.json.document.id} (sha256 ${sha256(bytes).slice(0, 12)}…)`;
  });
}

export async function seed(ctx) {
  const { api, run } = ctx;
  const tally = makeTally(run);
  // The second person (lib.mjs connectSigner: OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD). Two-person steps run only with one.
  const signer = await connectSigner({ baseUrl: ctx.baseUrl, authorEmail: ctx.identity?.email });
  // A third person (OQ_APPROVER_EMAIL / OQ_APPROVER_PASSWORD): the Vault's review route refuses one person in two roles.
  const approver = await connectApprover({ baseUrl: ctx.baseUrl, excludeEmails: [ctx.identity?.email, signer?.email].filter(Boolean) });
  const c = { api, run, tally, signer, approver, identity: ctx.identity, baseUrl: ctx.baseUrl };
  run.note('Lumen Bioscience demonstration built from public information (data/seeds/lumen-demo). Not affiliated with Lumen Bioscience, Inc.; every specification, stability result, batch, planning assumption and task is illustrative.');

  const cast = await castOf(c);
  const clientWorkspaceId = await ensureClient(c);
  const existing = await listAllProjects(api);
  const projects = {};
  for (const spec of PROJECTS) {
    const project = await ensureProject(c, spec, clientWorkspaceId, existing);
    projects[spec.code] = project;
    await ensureOverview(c, project, spec);
    await ensureTasks(c, project, castTasks(TASKS[spec.code] ?? [], cast), spec.code);
    await ensureProjectTeam(c, project, spec.code);
  }
  run.record('projects', projects);

  const lmn201 = projects['LMN-201'];
  await ensureCsrSource(c, lmn201);
  await ensureStudyDesign(c, lmn201, null, LMN201_DESIGN);
  await ensureObjective(c, lmn201, LMN201_DESIGN);
  await ensureCmc(c, lmn201, LMN201_CMC, 'LMN-201');
  // Study & Protocol Design: the RePreve protocol, bound to its design, with deviations and a review (lumen-protocol.mjs).
  await ensureLumenProtocol(c, lmn201);
  await ensurePlanDocuments(c, lmn201, ['Cover Letter', 'Form FDA 1571', "Investigator's Brochure", 'Introductory Statement and General Investigational Plan'], 'LMN-201');
  // The inbox's "extract commitments" (P-81, P-84) on a fictional approval letter.
  run.record('approvalLetter', await ensureAgencyLetter(c, lmn201, APPROVAL_LETTER, 'LMN-201'));
  run.note('The LMN-201 approval letter (BLA 761901) is FICTIONAL: not issued by FDA, LMN-201 is not approved, and no Lumen Bioscience authorization is represented. It is addressed to the demonstration\'s fictional sponsor.');

  // A letter that needs an answer: the inbox's questions and Respond (fictional, like the approval letter).
  run.record('informationRequest', await ensureAgencyLetter(c, lmn201, INFORMATION_REQUEST, 'LMN-201'));
  await ensureIbReview(c, lmn201);
  // Quality: deviations, CAPA, suppliers, nonconformances, audits, change control, management reviews (lumen-qms.mjs).
  await ensureLumenQms(c, { lmn201 }, 'LMN-201');
  // Risk-based monitoring: RACT, KRIs and QTLs over six monthly extracts, signals, the plan and site actions (lumen-rbm.mjs).
  await ensureLumenRbm({ ...ctx, ...c }, lmn201, 'LMN-201');
  // The Vault: each project's synthetic client data room, reviewed, approved and sealed by its people (lumen-vault.mjs).
  const vault = await ensureLumenVault({ ...ctx, ...c }, projects);
  // The headline scenario: LMN-201's Phase 2 CSR, prepared up to its build (lumen-csr.mjs).
  await ensureLumenCsr({ ...ctx, ...c }, lmn201);
  /* Submission Center: sequence 0000 on LMN-201's canonical submission, with its approved Vault documents placed as
     eCTD leaves and the deterministic readiness reads, through the biotech pack's own path (biotech-submission.mjs).
     Without a sequence the CSR's "Place into filing" asked for one first, and with an empty one the Builder showed
     "No leaves in sequence 0000 yet" (showcase sweep, 2026-11-10). Nothing is frozen or dispatched. */
  const leaves = (vault['LMN-201'] ?? []).filter((d) => d.stage === 'approved' && d.filing?.[2])
    .map((d) => ({ id: d.id, key: d.key, sectionCode: d.filing[2], leafTitle: d.title }));
  await ensureSubmission(c, { ...lmn201, productName: lmn201.code }, leaves);
  // Last, so the reports read everything above (Run history, the report canvas).
  await ensureLumenReports(c, lmn201);
  await ensureLumenReportPack(c);

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  run.record('summary', { created: sum(tally.tally.created), found: sum(tally.tally.found) });
  console.info(`  ⇒ lumen pack: created ${sum(tally.tally.created)}, found ${sum(tally.tally.found)}`);
}

/**
 * The project's objective, from the public trial listing the design already cites
 * (LMN201_DESIGN, NCT05330182), through the route the About card writes
 * (PUT /api/charters/by-project/:ref/objectives). Without it the CSR rehearsal's
 * project home said "No objective is recorded for this project yet" and the
 * presenter set it by hand (R1 rehearsal, 2026-11-06). A recorded objective is
 * left as it is: a person may have changed it.
 */
async function ensureObjective({ api, run, tally }, project, design) {
  await run.step(`Objective: ${design.acronym}`, async () => {
    const path = `/api/charters/by-project/${encodeURIComponent(project.id)}/objectives`;
    const read = must(await api('GET', path), 200, 'read the project objective');
    if (read.data?.current) { tally.found('objective'); return 'found'; }
    const primary = design.objectives.find((o) => o.level === 'primary') ?? design.objectives[0];
    must(await api('PUT', path, {
      objective: primary.text,
      successCriteria: `Primary endpoint: ${primary.endpointName}.`,
      sources: [{ kind: 'registry', title: 'ClinicalTrials.gov NCT05330182', url: 'https://clinicaltrials.gov/study/NCT05330182' }],
      reason: 'Demo seed: the objective the public trial listing states.',
    }), 200, 'record the project objective');
    tally.created('objective');
    return 'created';
  });
}

/**
 * The project's team: the reviewer and the approver are given edit access, through the Team drawer's own route
 * (PUT /api/concept2cure/projects/:projectId/sharing/members/:userId). Without it the Team card listed the lead
 * alone and said "16 open items assigned to someone not on this list" (showcase sweep, 2026-11-10), because the
 * tasks above belong to people the project was never shared with. With no second or third person, nothing is shared.
 */
async function ensureProjectTeam({ api, run, tally, signer, approver }, project, code) {
  await run.step(`Team: ${code} is shared with the reviewer and the approver`, async () => {
    const people = [signer, approver].filter(Boolean)
      .map((person) => Number(person.userId ?? person.session?.user?.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!people.length) return 'not executed: no second or third person (OQ_SIGNER_* / OQ_APPROVER_*)';
    const team = must(await api('GET', `/api/c2c/projects/${project.id}/team`), 200, 'read the project team');
    if (!Number.isSafeInteger(team.project_id)) throw new Error(`${code}: the team read named no project`);
    const base = `/api/concept2cure/projects/${team.project_id}/sharing`;
    const query = `?programId=${encodeURIComponent(project.id)}`;
    const sharing = must(await api('GET', base + query), 200, 'read the project sharing').data;
    const out = [];
    for (const userId of people) {
      if ((sharing?.members ?? []).some((member) => Number(member.userId) === userId)) { tally.found('project-member'); out.push(`#${userId} found`); continue; }
      must(await api('PUT', `${base}/members/${userId}${query}`, { role: 'edit' }), 200, `share ${code} with user ${userId}`);
      tally.created('project-member');
      out.push(`#${userId} can edit`);
    }
    return out.join('; ');
  });
}

/** Nothing this pack creates has a delete route the seed may use; say so rather than reach for SQL. */
export async function purge({ run }) {
  await run.step('Purge: Lumen demo records', async () => {
    run.note('The Lumen projects, Vault documents, data-room letter, agency communication, study design and CMC records have no delete or archive route the seed uses; archive the projects from Project settings. Nothing was removed.');
    return 'nothing removed — see notes';
  });
}

/**
 * LMN-201's Investigator's Brochure (a Plan deliverable started above) sent to the second person for review, so the
 * project's Review step and that person's review list are not empty (2026-11-06, the founder: "full story in data").
 * The reviewer is the second signer: the server refuses the author as their own reviewer (REVIEWER_IS_AUTHOR), so
 * without one nothing is requested and the step says so. Through the editor's own route.
 */
async function ensureIbReview({ api, run, tally, signer }, program) {
  await run.step("Review: LMN-201 Investigator's Brochure sent for review", async () => {
    if (!signer) return 'not executed: no second signer (OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD)';
    const docs = asArray(must(await api('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(program.id)}`), 200, 'list LMN-201 documents'), 'documents', 'data', 'rows');
    const ib = docs.find((d) => /Investigator.s Brochure/.test(d.title ?? ''));
    if (!ib) throw new Error("LMN-201 has no Investigator's Brochure document to send for review");
    const reviewer = { id: Number(signer.session.user.id), name: signer.session.user.displayName ?? signer.email, email: signer.email };
    const reviews = asArray(must(await api('GET', `/api/authoring/documents/${ib.id}/reviews`), 200, 'read IB reviews'), 'reviews', 'data');
    if (reviews.some((r) => r.reviewer_email === reviewer.email)) { tally.found('authoring-review-request'); return `already with ${reviewer.email}`; }
    const j = must(await api('POST', `/api/authoring/documents/${ib.id}/request-review`, {
      reviewers: [reviewer], route: { reviewDueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) },
      reason: "Demo seed: send the LMN-201 Investigator's Brochure update for scientific review",
    }), [200, 201], 'request review of the IB');
    if (!(j.reviews ?? []).some((r) => r.reviewer_email === reviewer.email)) throw new Error(`request-review: ${reviewer.email} was not recorded as reviewer`);
    tally.created('authoring-review-request');
    return `sent to ${reviewer.email}`;
  });
}

/** Reports run for LMN-201, from the governed record, so Reporting's Run history is not empty (2026-11-06). */
const LMN201_REPORTS = ['readiness.executive_digest', 'ha.commitment_register', 'usa_fda.ind_safety_readiness', 'etmf.completeness_pack'];

/**
 * Each report in LMN201_REPORTS run once at the project's scope, through the route Reporting's "Run" uses
 * (POST /api/report-os/runs, Insights.tsx requestRun). A report already run for this project is left as it is.
 * A run the engine reports as partial is a real answer about the record, not a failure.
 */
async function ensureLumenReports({ api, run, tally, identity }, program) {
  await run.step(`Reporting: ${LMN201_REPORTS.length} reports run for LMN-201`, async () => {
    const runs = asArray(must(await api('GET', '/api/report-os/runs?limit=100'), 200, 'list report runs'), 'data');
    const out = [];
    for (const reportTypeId of LMN201_REPORTS) {
      const prior = runs.find((r) => r.reportTypeId === reportTypeId && r.scopeType === 'project');
      if (prior) { tally.found('report-run'); out.push(`${reportTypeId}: found #${prior.id}`); continue; }
      const j = must(await api('POST', '/api/report-os/runs', {
        organizationId: Number(identity?.organizationId) || 0, scopeType: 'project', programId: program.id, reportTypeId,
      }), 201, `run ${reportTypeId}`);
      const r = j.data?.run;
      if (!Number.isSafeInteger(r?.id)) throw new Error(`run ${reportTypeId}: no run id returned`);
      tally.created('report-run');
      out.push(`${reportTypeId}: #${r.id} ${r.status}`);
    }
    return out.join('; ');
  });
}

/**
 * Reporting's other two tabs for LMN-201 (showcase sweep, 2026-11-10: Schedules and Bundles were empty). A bundle of
 * the four runs above, and two schedules, through the routes the Reporting screen calls (POST /api/report-os/bundles,
 * POST /api/insights/subscriptions). The schedules deliver inside the platform only: no recipients, no e-mail.
 * A plan that does not include scheduled reports is refused by the server (403), and the step says so.
 */
const LMN201_BUNDLE = {
  name: '[Demo · Lumen] LMN-201 monthly governance pack',
  description: 'DEMO. The four computed reports the LMN-201 team reads each month: executive digest, commitment register, IND safety readiness and eTMF completeness.',
};
const LMN201_SCHEDULES = [
  { reportTypeId: 'readiness.executive_digest', schedule: { cadence: 'weekly', dayOfWeek: 1, hour: 8, minute: 0, timeZone: 'America/Los_Angeles' } },
  { reportTypeId: 'etmf.completeness_pack', schedule: { cadence: 'monthly', dayOfMonth: 1, hour: 8, minute: 0, timeZone: 'America/Los_Angeles' } },
];

async function ensureLumenReportPack({ api, run, tally }) {
  const runs = asArray(must(await api('GET', '/api/report-os/runs?limit=100'), 200, 'list report runs'), 'data')
    .filter((r) => LMN201_REPORTS.includes(r.reportTypeId) && r.scopeType === 'project');
  const runOf = (reportTypeId) => runs.find((r) => r.reportTypeId === reportTypeId);
  await run.step('Reporting: the LMN-201 monthly governance pack (bundle)', async () => {
    const bundles = asArray(must(await api('GET', '/api/report-os/bundles'), 200, 'list report bundles'), 'data');
    if (bundles.some((b) => b.name === LMN201_BUNDLE.name)) { tally.found('report-bundle'); return 'found'; }
    const runIds = LMN201_REPORTS.map((t) => runOf(t)?.id).filter(Number.isSafeInteger);
    if (runIds.length === 0) { run.note('Reporting: no LMN-201 report run exists, so no bundle was made.'); return 'not executed — no runs'; }
    must(await api('POST', '/api/report-os/bundles', { ...LMN201_BUNDLE, runIds }), 201, 'bundle the LMN-201 reports');
    tally.created('report-bundle');
    return `created from ${runIds.length} runs`;
  });
  await run.step(`Reporting: ${LMN201_SCHEDULES.length} schedules for LMN-201 (in the platform, no e-mail)`, async () => {
    const existing = asArray(must(await api('GET', '/api/insights/subscriptions'), 200, 'list report schedules'), 'data');
    const out = [];
    for (const s of LMN201_SCHEDULES) {
      const prior = runOf(s.reportTypeId);
      if (!prior) { out.push(`${s.reportTypeId}: not executed — no run to take its scope from`); continue; }
      const scope = { scopeType: prior.scopeType, scopeId: String(prior.scopeId) };
      if (existing.some((e) => e.reportTypeId === s.reportTypeId && e.scopeType === scope.scopeType && String(e.scopeId) === scope.scopeId)) {
        tally.found('report-schedule'); out.push(`${s.reportTypeId}: found`); continue;
      }
      const res = await api('POST', '/api/insights/subscriptions', { reportTypeId: s.reportTypeId, ...scope, channel: 'platform', format: 'in_app', schedule: s.schedule });
      if (res.status === 403) {
        run.note(`Reporting: the schedule for ${s.reportTypeId} was refused (403): ${String(res.text ?? '').slice(0, 200)}`);
        out.push(`${s.reportTypeId}: not executed — refused (403)`); continue;
      }
      must(res, 201, `schedule ${s.reportTypeId}`);
      tally.created('report-schedule');
      out.push(`${s.reportTypeId}: ${s.schedule.cadence}`);
    }
    return out.join('; ');
  });
}

/**
 * The story's people (lumen-content.mjs TASKS) by role. In an organisation that holds a persona by name (the
 * Codespace's development organisation), the task is theirs. Elsewhere, such as the Lumen organisation of the
 * founder, Brian Finrow and Carl (2026-11-06), each persona's work goes to the member in that role: the author is the
 * person seeding, the reviewer is the second signer, the approver is a third member. Read from the board's roster.
 */
const PERSONA_ROLE = {
  'Ana Author': 'author', 'Rhea Reviewer': 'reviewer', 'Mo Monitor': 'reviewer', 'Quinn Quality': 'reviewer',
  'Ava Approver': 'approver', 'Sam Statistician': 'approver', 'Cal CMC': 'approver',
};

async function castOf({ api, signer, identity }) {
  const roster = asArray(must(await api('GET', '/api/task-management/assignees'), 200, 'read the task roster'), 'data');
  const nameOf = (id) => roster.find((r) => String(r.id) === String(id))?.name ?? null;
  const author = nameOf(identity?.userId);
  const reviewer = signer ? nameOf(signer.userId ?? signer.session?.user?.id) : null;
  const approver = roster.find((r) => r.name !== author && r.name !== reviewer)?.name ?? null;
  return { names: new Set(roster.map((r) => r.name)), byRole: { author, reviewer: reviewer ?? author, approver: approver ?? reviewer ?? author } };
}

const castTasks = (tasks, cast) => tasks.map((t) => (!t.assignee || cast.names.has(t.assignee)
  ? t : { ...t, assignee: cast.byRole[PERSONA_ROLE[t.assignee] ?? 'author'] ?? t.assignee }));
