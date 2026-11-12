/**
 * launch-demo/packs/project-management.mjs — the project-management engines on C2C-101 and LMN-201
 * (P-122 defects, item 4, 2026-11-10; docs/evidence/DESIGN/P-122/defects/4-demo-data/).
 *
 * On the demo database every project-management engine but Sentinel was empty, so the project page's Schedule, the
 * hierarchy roll-up and Projects' "at risk" answer said in words that nothing was there. This writes, through the
 * routes those screens and their engines own, what a regulatory team would have recorded on two INDs in flight:
 *   - CTD section tracking (POST /api/project-sections/initialize), with owners, deadlines and status on the sections
 *     the team is working (PATCH …/:code/assign, /deadline, /status, each a transition the route allows);
 *   - dated milestones (POST /api/project-sections/milestones);
 *   - the IND's twelve milestone tasks, by the generator the Schedule's "Add the 12 IND milestones" calls
 *     (POST /api/concept2cure/projects/:id/tasks/bulk, due between today and the recorded target submission date),
 *     with the progress the team has made (PUT …/tasks/:taskId);
 *   - work projects under each (POST /api/c2c/projects with parentProjectId and workKind) and a task on one;
 *   - on LMN-201, review tasks with due dates on the two documents in review (POST …/artifacts/:id/review-tasks),
 *     which become the work due this week that Projects' "at risk" answer lists.
 *
 * Idempotent: each record is found by its name (a section by its code, a review task by its title) before it is
 * created, a status moves only forward along its path, and the generator runs only on a project with no milestone
 * tasks. A project without a recorded target submission date gets no generated tasks; the step says so.
 *
 * Blockers are not written: the submission operations sweep derives them from documents mapped into a package
 * section, and the mapping route takes the document's integer id, which no read in the product returns. That is
 * recorded in the manifest's notes, never worked around.
 */
import { must } from '../lib.mjs';

const DAY = 86_400_000;
const dateIn = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);

/** A section's status path from not started; the seed walks only the steps after the current one. */
const PATH = {
  data_gathering: ['data_gathering'],
  drafting: ['drafting'],
  internal_review: ['drafting', 'internal_review'],
  approved: ['drafting', 'internal_review', 'approved'],
};

/* owner: the index of a person on the organisation's roster, in id order. */
const PROJECTS = [
  {
    label: 'C2C-101',
    prefix: '[Demo · Biotech] C2C-101',
    sections: [
      { code: 'm1.14.4.1', owner: 1, deadlineInDays: 35, status: 'internal_review' },
      { code: 'm2.4', owner: 2, deadlineInDays: 50, status: 'drafting' },
      { code: 'm2.6.6', owner: 2, deadlineInDays: -3, status: 'drafting' },
      { code: 'm2.3', owner: 3, deadlineInDays: 75, status: 'drafting' },
      { code: 'm3.2.S.4', owner: 3, deadlineInDays: 30, status: 'data_gathering' },
      { code: 'm1.1.1', owner: 0, deadlineInDays: 60, status: 'drafting' },
      { code: 'm1.20', owner: 0, deadlineInDays: 90 },
      { code: 'm1.2', owner: 0, deadlineInDays: 150 },
    ],
    milestones: [
      { name: 'Pre-IND meeting with FDA held', inDays: 45, linked: ['m1.2'] },
      { name: 'Nonclinical summaries locked', inDays: 70, linked: ['m2.4', 'm2.6.6'] },
      { name: 'Module 3 quality data locked', inDays: 100, linked: ['m2.3', 'm3.2.S.4'] },
    ],
    progress: { 'Pre-IND Meeting Request': 'done', 'Pre-IND Briefing Document': 'in_progress' },
    workProjects: [
      { name: 'C2C-101 drug substance and drug product (CMC)', workKind: 'cmc',
        tasks: [{ name: 'Drug substance release specification agreed with QC', status: 'blocked', priority: 'high', inDays: 21, moduleType: 'cmc' }] },
      { name: 'C2C-101 Phase 1 statistical analysis plan', workKind: 'biostatistics',
        tasks: [{ name: 'Draft the SAD/MAD statistical analysis plan', status: 'in_progress', priority: 'medium', inDays: 40, moduleType: 'clinical' }] },
    ],
    reviewTasks: [],
  },
  {
    label: 'LMN-201',
    prefix: '[Demo · Lumen] LMN-201',
    sections: [
      { code: 'm1.14.4.1', owner: 1, deadlineInDays: 20, status: 'internal_review' },
      { code: 'm2.6.2', owner: 2, deadlineInDays: 25, status: 'drafting' },
      { code: 'm2.3', owner: 3, deadlineInDays: -5, status: 'drafting' },
      { code: 'm3.2.P.5', owner: 3, deadlineInDays: 40, status: 'data_gathering' },
      { code: 'm1.1.1', owner: 0, deadlineInDays: 45, status: 'drafting' },
      { code: 'm1.20', owner: 0, deadlineInDays: 60 },
    ],
    milestones: [
      { name: 'Pre-IND written responses received', inDays: -10, linked: ['m1.2'] },
      { name: 'RePreve protocol final', inDays: 30, linked: ['m1.20'] },
      { name: 'Investigator\'s Brochure approved', inDays: 21, linked: ['m1.14.4.1'] },
    ],
    progress: {
      'Pre-IND Meeting Request': 'done', 'Pre-IND Briefing Document': 'done', 'Pre-IND Meeting': 'done',
      'Module 1 Administrative': 'in_progress', 'Module 3 Quality (CMC)': 'blocked',
    },
    workProjects: [
      { name: 'LMN-201 drug product manufacturing (CMC)', workKind: 'cmc',
        tasks: [{ name: 'Capsule fill batch record for the clinical lot', status: 'in_progress', priority: 'high', inDays: 14, moduleType: 'cmc' }] },
      { name: 'LMN-201 RePreve risk-based monitoring', workKind: 'rbm', tasks: [] },
    ],
    reviewTasks: [
      { artifact: '[Demo · Lumen] Endpoint justification: sustained clinical cure at week 12 (synthetic)',
        title: 'Confirm the week-12 cure definition matches the protocol', assignee: 1, dueInDays: 3, priority: 'high' },
      { artifact: '[Demo · Lumen] Evidence memo: delivery of LMN-201 proteins to the terminal ileum, CDI01 (synthetic)',
        title: 'Check the ileal delivery figures against the CDI01 study report', assignee: 2, dueInDays: -2, priority: 'medium' },
    ],
  },
];

/* ───────────────────────── Finding the projects ───────────────────────── */

/** The demo program whose name starts with `prefix`, read from the Projects list. */
async function findProgram(api, prefix) {
  for (let offset = 0, page = 0; page < 50; page += 1) {
    const list = must(await api('GET', `/api/c2c/projects?limit=200${offset ? `&offset=${offset}` : ''}`), 200, 'list programs');
    if (!Array.isArray(list.data) || list.meta?.pendingStore === true) throw new Error('The project list is unavailable; nothing was written.');
    const row = list.data.find((p) => String(p.title ?? p.name ?? '').startsWith(prefix));
    if (row) return row;
    if (list.meta?.hasMore !== true || !list.data.length) break;
    offset += list.data.length;
  }
  throw new Error(`${prefix}: no such demo program. Run its pack first; nothing was written for it.`);
}

/** The program's integer project row, as the task board names it. */
async function projectRowId(api, program) {
  const row = rowsOf(must(await api('GET', '/api/projects'), 200, 'list board projects')).find((p) => p.regulatoryProgramId === program.id);
  if (!row) throw new Error(`program ${program.id} has no project row; nothing was written for it`);
  return Number(row.id);
}

/** The program's recorded target submission date (YYYY-MM-DD), or null. */
async function targetSubmissionDate(api, program) {
  const detail = must(await api('GET', `/api/c2c/projects/${program.id}`), 200, 'read program');
  const d = detail.data ?? detail;
  const raw = String(d.target_submission_date ?? d.targetSubmissionDate ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

/** The organisation's people, in id order: the roster the task board assigns from. */
async function roster(api) {
  const r = must(await api('GET', '/api/task-management/assignees'), 200, 'read the roster');
  return rowsOf(r).map((p) => ({ id: Number(p.id), name: p.name })).sort((a, b) => a.id - b.id);
}

/* ───────────────────────── Section tracking and milestones ───────────────────────── */

async function ensureSectionsTracked(api, projectId) {
  const res = await api('POST', '/api/project-sections/initialize', { project_id: projectId });
  if (res.status === 409) return 0;
  return Number(must(res, 200, 'initialize section tracking').sectionsInitialized ?? 0);
}

async function moveSection(api, projectId, current, spec) {
  const path = PATH[spec.status] ?? [];
  const from = current.status === 'not_started' ? 0 : path.indexOf(current.status) + 1;
  if (from === 0 && current.status !== 'not_started') return 0;
  for (const next of path.slice(from)) {
    must(await api('PATCH', `/api/project-sections/${encodeURIComponent(spec.code)}/status`, {
      project_id: projectId, new_status: next, reason: 'Demo seed: the team\'s progress on this section.',
    }), 200, `move ${spec.code} to ${next}`);
  }
  return path.length - from;
}

/** Owner, deadline and status on each worked section; only what differs is written. */
async function ensureSectionWork(api, projectId, specs, people) {
  const listed = must(await api('GET', `/api/project-sections?project_id=${projectId}`), 200, 'list sections');
  const byCode = new Map((listed.sections ?? []).map((s) => [s.section_code, s]));
  let writes = 0;
  for (const spec of specs) {
    const current = byCode.get(spec.code);
    if (!current) throw new Error(`section ${spec.code} is not tracked on project ${projectId}`);
    const owner = people[spec.owner % people.length];
    if (owner && Number(current.assigned_to) !== owner.id) {
      must(await api('PATCH', `/api/project-sections/${encodeURIComponent(spec.code)}/assign`, { project_id: projectId, assigned_to: owner.id }), 200, `assign ${spec.code}`);
      writes += 1;
    }
    /* Dated once: a re-run on a later day does not move a deadline the team already has. */
    if (!current.deadline) {
      const deadline = dateIn(spec.deadlineInDays);
      must(await api('PATCH', `/api/project-sections/${encodeURIComponent(spec.code)}/deadline`, { project_id: projectId, deadline }), 200, `date ${spec.code}`);
      writes += 1;
    }
    if (spec.status) writes += await moveSection(api, projectId, current, spec);
  }
  return writes;
}

async function ensureMilestones(api, projectId, milestones) {
  const listed = must(await api('GET', `/api/project-sections/milestones?project_id=${projectId}`), 200, 'list milestones');
  const have = new Set((listed.milestones ?? []).map((m) => m.name));
  let created = 0;
  for (const m of milestones.filter((x) => !have.has(x.name))) {
    must(await api('POST', '/api/project-sections/milestones', {
      project_id: projectId, name: m.name, target_date: dateIn(m.inDays), linked_sections: m.linked,
    }), 200, `record milestone "${m.name}"`);
    created += 1;
  }
  return created;
}

/* ───────────────────────── Milestone tasks and work projects ───────────────────────── */

const tasksOf = async (api, projectId) =>
  rowsOf(must(await api('GET', `/api/concept2cure/projects/${projectId}/tasks`), 200, `list tasks of project ${projectId}`));

/** The IND's milestone tasks, by the generator, once; then the team's progress on them. */
async function ensureMilestoneTasks(api, projectId, targetDate, progress) {
  let tasks = await tasksOf(api, projectId);
  let generated = 0;
  if (!tasks.some((t) => t.metadata?.autoGenerated && String(t.metadata?.submissionType).toUpperCase() === 'IND')) {
    if (!targetDate) return { generated: 0, moved: 0, note: 'no target submission date is recorded, so no milestone tasks were generated' };
    generated = must(await api('POST', `/api/concept2cure/projects/${projectId}/tasks/bulk`, { submissionType: 'IND', targetDate }), 200, 'add the IND milestones').data?.length ?? 0;
    tasks = await tasksOf(api, projectId);
  }
  let moved = 0;
  for (const [name, status] of Object.entries(progress)) {
    const task = tasks.find((t) => t.name === name && t.metadata?.autoGenerated);
    if (!task || task.status === status) continue;
    must(await api('PUT', `/api/concept2cure/projects/${projectId}/tasks/${task.id}`, { status }), 200, `move "${name}" to ${status}`);
    moved += 1;
  }
  return { generated, moved };
}

async function ensureWorkProject(api, parentId, wp) {
  const res = must(await api('POST', '/api/c2c/projects', { parentProjectId: parentId, name: wp.name, workKind: wp.workKind }), [200, 201], `add work project "${wp.name}"`);
  const id = Number(res.data?.projectId);
  if (!Number.isSafeInteger(id)) throw new Error(`work project "${wp.name}" was not given an id`);
  const have = new Set((await tasksOf(api, id)).map((t) => t.name));
  let created = 0;
  for (const t of wp.tasks.filter((x) => !have.has(x.name))) {
    must(await api('POST', `/api/concept2cure/projects/${id}/tasks`, {
      name: t.name, status: t.status, priority: t.priority, moduleType: t.moduleType, dueDate: dateIn(t.inDays),
    }), [200, 201], `add task "${t.name}"`);
    created += 1;
  }
  return { id, created: res.meta?.created === true, tasksCreated: created };
}

/* ───────────────────────── Review work due this week ───────────────────────── */

/** A review task with a due date on a document in review: the work Projects' "at risk" answer lists as due. */
async function ensureReviewTask(api, projectId, artifacts, spec, people) {
  const artifact = artifacts.find((a) => a.title === spec.artifact);
  if (!artifact) throw new Error(`"${spec.artifact}" is not a document of project ${projectId}`);
  const base = `/api/concept2cure/projects/${projectId}/artifacts/${encodeURIComponent(artifact.id)}/review-tasks`;
  const listed = must(await api('GET', base), 200, `list review tasks on "${spec.artifact}"`);
  if ((listed.data?.tasks ?? []).some((t) => t.title === spec.title)) return false;
  const assignee = people[spec.assignee % people.length];
  must(await api('POST', base, {
    title: spec.title, taskType: 'review_task', priority: spec.priority, dueAt: new Date(Date.now() + spec.dueInDays * DAY).toISOString(),
    ...(assignee ? { assignedToId: assignee.id } : {}),
  }), [200, 201], `add review task "${spec.title}"`);
  return true;
}

/* ───────────────────────── The pack ───────────────────────── */

async function seedProject(ctx, spec, people) {
  const { api, run } = ctx;
  const program = await findProgram(api, spec.prefix);
  const projectId = await projectRowId(api, program);
  const record = { programId: program.id, projectId };
  run.record(spec.label, record);
  await run.step(`Schedule: CTD sections tracked on ${spec.label}, with owners, deadlines and status`, async () => {
    const initialized = await ensureSectionsTracked(api, projectId);
    const writes = await ensureSectionWork(api, projectId, spec.sections, people);
    return `${initialized} sections newly tracked, ${writes} changes on ${spec.sections.length} worked sections`;
  });
  await run.step(`Schedule: milestones on ${spec.label}`, async () => `${await ensureMilestones(api, projectId, spec.milestones)} created of ${spec.milestones.length}`);
  await run.step(`Schedule: the IND's milestone tasks on ${spec.label}`, async () => {
    const out = await ensureMilestoneTasks(api, projectId, await targetSubmissionDate(api, program), spec.progress);
    if (out.note) run.note(`${spec.label}: ${out.note}`);
    return out.note ?? `${out.generated} generated, ${out.moved} moved`;
  });
  record.workProjects = [];
  for (const wp of spec.workProjects) {
    await run.step(`Roll-up: work project "${wp.name}"`, async () => {
      const out = await ensureWorkProject(api, projectId, wp);
      record.workProjects.push(out.id);
      return `${out.created ? 'created' : 'found'}, ${out.tasksCreated} tasks created`;
    });
  }
  if (!spec.reviewTasks.length) return;
  await run.step(`At risk: review work due on ${spec.label}`, async () => {
    const artifacts = rowsOf(must(await api('GET', `/api/concept2cure/projects/${projectId}/artifacts`), 200, 'list documents'));
    let created = 0;
    for (const t of spec.reviewTasks) created += (await ensureReviewTask(api, projectId, artifacts, t, people)) ? 1 : 0;
    return `${created} created of ${spec.reviewTasks.length}`;
  });
}

export async function seed(ctx) {
  const people = await roster(ctx.api);
  if (!people.length) throw new Error('The organisation has no one on its roster to own sections; nothing was written.');
  for (const spec of PROJECTS) await seedProject(ctx, spec, people);
  ctx.run.note('Blockers: not written. The submission operations sweep derives them from documents mapped into a '
    + 'package section, and POST /api/submission-ops/artifact-section-map takes the document\'s integer id, which no '
    + 'read in the product returns (the document lists return its string id).');
}

export async function purge({ run }) {
  run.note('project-management: nothing is purged by this pack. Its records belong to the demo projects (their '
    + 'section tracking, milestones, tasks and work projects) and are removed with them.');
}
