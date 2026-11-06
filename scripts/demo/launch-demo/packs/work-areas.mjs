/**
 * launch-demo/packs/work-areas.mjs — the work areas a demo project is shown in:
 * Tasks, CMC / Module 3, Biostatistics, Plan and Communication's agency inbox.
 *
 * 2026-10-31: a client demo opened each of these on a seeded project and found
 * them empty — "No tasks on the board yet", a Module 3 with no specification,
 * stability study or batch, and a Biostatistics screen with no study design —
 * because no pack wrote to them. Each function here writes through the route
 * the screen itself uses (TaskBoard.tsx, CmcModule.tsx, ProtocolDevCreateDesign.tsx),
 * finds what an earlier run created by its exact name before creating it, and
 * fails the step with the server's answer when the product refuses.
 *
 * Every pack passes its own content; nothing here names a product.
 */
import { must } from '../lib.mjs';

const DAY = 86_400_000;
const isoIn = (days) => new Date(Date.now() + days * DAY).toISOString();
const dateIn = (days) => isoIn(days).slice(0, 10);
// `documents` is the authoring list's key (GET /api/authoring/docs). Unread, the
// Plan step found no started deliverable and started each again on every run
// (2026-11-01: three copies of each on LMN-201).
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.rows) ? j.rows : Array.isArray(j?.data?.rows) ? j.data.rows : Array.isArray(j?.documents) ? j.documents : []);

/* ───────────────────────── Tasks ───────────────────────── */

/** The task board files a task under the project's board row, which names the program it belongs to. */
async function boardProjectId(api, program) {
  const rows = rowsOf(must(await api('GET', '/api/projects'), 200, 'list board projects'));
  const row = rows.find((p) => p.regulatoryProgramId === program.id);
  if (!row) throw new Error(`the task board has no project row for program ${program.id}; no task was created`);
  return Number(row.id);
}

/**
 * tasks: [{ title, moduleType, priority, status, dueInDays, description, assignee?, criticalPath? }]
 * Status is one the create form offers (pending | in-progress | review | blocked), or
 * 'completed': created in progress, then moved to completed through the board's own
 * status route (PATCH /api/tasks/tasks/:id), as a person closing it would.
 * `assignee` is a person's name on the board's roster (GET /api/task-management/assignees);
 * a name the roster does not hold leaves the task with its creator and is noted.
 * A negative `dueInDays` makes an overdue task.
 */
async function rosterIds(api, tasks) {
  if (!tasks.some(t => t.assignee)) return new Map();
  const roster = must(await api('GET', '/api/task-management/assignees'), 200, 'read the task roster');
  return new Map((Array.isArray(roster.data) ? roster.data : []).map(r => [r.name, Number(r.id)]));
}

async function completeTask(api, id, t, label) {
  const done = must(await api('PATCH', `/api/tasks/tasks/${encodeURIComponent(id)}`, {
    status: 'completed', progress: 100,
    reason: `Demo seed: ${label} work finished, so the board shows done work beside the open work.`,
  }), 200, `complete task "${t.title}"`);
  if (done.success !== true) throw new Error(`Tasking did not confirm "${t.title}" as completed.`);
}
export async function ensureTasks({ api, run, tally }, program, tasks, label) {
  await run.step(`Tasks: ${tasks.length} tasks on ${label}`, async () => {
    // Seed definitions themselves must be unambiguous before ANY write.
    if (tasks.some(t => typeof t.title !== 'string' || !t.title.trim()) ||
        new Set(tasks.map(t => t.title)).size !== tasks.length) {
      throw new Error('The demonstration contains duplicate or unnamed task definitions. No Tasking records were written.');
    }
    const projectId = await boardProjectId(api, program);
    const board = must(await api('GET', '/api/task-management/board'), 200, 'read task board');
    // Task Board already declares whether ALL its contributing stores were
    // readable. A partial/unverified board is not an empty project: treating
    // it as complete would mint duplicate tasks and false "nothing pending"
    // outcomes on repeat demos.
    if (board.success !== true || !Array.isArray(board.data) ||
        board.meta?.partial !== false || !Array.isArray(board.meta.unreadSources) ||
        board.meta.unreadSources.length > 0) {
      throw new Error('The existing Task Board is incomplete or has unread sources. Reconcile the board before demo tasks are created or reused.');
    }
    // A title is an idempotency key only when unique within this project's
    // actual board rows. Never pick an arbitrary duplicate by Map overwrite.
    const withinProject = board.data.filter((t) => String(t.project) === String(projectId));
    const have = new Map();
    for (const row of withinProject) {
      if (typeof row.title !== 'string' || !row.title.trim() || have.has(row.title)) {
        throw new Error('The project Task Board contains malformed or duplicate task titles. Reconcile the task records before demo seeding.');
      }
      have.set(row.title, row);
    }
    let created = 0;
    const newlyCreated = [];
    const people = await rosterIds(api, tasks);
    const unassigned = [...new Set(tasks.filter(t => t.assignee && !people.has(t.assignee)).map(t => t.assignee))];
    if (unassigned.length) run.note(`Tasks on ${label}: ${unassigned.join(', ')} not on this organisation's roster; their tasks stay with the person seeding.`);
    for (const t of tasks) {
      const existing = have.get(t.title);
      if (existing) {
        // A named task is reusable only if it still points to the same governed
        // document. Titles alone never establish source linkage.
        if (t.sourceEntityType === 'authoring_document' &&
            String(existing.sourceDocumentId ?? existing.sourceEntityId ?? '') !== String(t.sourceEntityId)) {
          throw new Error(`Existing task "${t.title}" does not link to its expected authoring document. Reconcile Tasking before retrying.`);
        }
        tally.found('task'); continue;
      }
      const acknowledgement = must(await api('POST', '/api/tasks/tasks', {
        title: t.title,
        description: t.description,
        moduleType: t.moduleType,
        taskType: t.taskType ?? 'deliverable',
        ...(t.category ? { category: t.category } : {}),
        ...(t.moduleSource ? { moduleSource: t.moduleSource } : {}),
        ...(t.sourceEntityType ? { sourceEntityType: t.sourceEntityType } : {}),
        ...(t.sourceEntityId ? { sourceEntityId: t.sourceEntityId } : {}),
        ...(t.moduleData ? { moduleData: t.moduleData } : {}),
        priority: t.priority ?? 'medium',
        status: t.status === 'completed' ? 'in-progress' : (t.status ?? 'pending'),
        ...(people.has(t.assignee) ? { assigneeId: people.get(t.assignee) } : {}),
        ...(t.criticalPath ? { criticalPath: true } : {}),
        projectId,
        dueDate: isoIn(t.dueInDays ?? 14),
        regulatoryImpact: true,
        reason: `Demo seed: plan the ${label} work so the task board shows it.`,
      }), [200, 201], `create task "${t.title}"`);
      // The real POST returns {success:true,data:{taskId,...}} after the
      // transaction. An HTTP 200 without a committed task identity is not
      // proof that a review task exists.
      if (acknowledgement.success !== true ||
          typeof acknowledgement.data?.taskId !== 'string' || !acknowledgement.data.taskId.trim()) {
        throw new Error(`Tasking did not confirm the saved identity for "${t.title}". Recheck the existing board before retrying.`);
      }
      if (t.status === 'completed') await completeTask(api, acknowledgement.data.taskId, t, label);
      newlyCreated.push({ task: t, id: acknowledgement.data.taskId });
      tally.created('task');
      created += 1;
    }
    if (newlyCreated.length) {
      // One post-create board read makes the actual Tasking → editor handoff
      // an observed persisted record, not merely a 200 from task create.
      const settled = must(await api('GET', '/api/task-management/board'), 200, 'reopen saved demo tasks');
      if (settled.success !== true || !Array.isArray(settled.data) ||
          settled.meta?.partial !== false || !Array.isArray(settled.meta.unreadSources) ||
          settled.meta.unreadSources.length > 0) {
        throw new Error('Tasking creation was acknowledged but the complete saved board could not be verified. Inspect real task IDs before retrying.');
      }
      const scoped = settled.data.filter(card => String(card.project) === String(projectId));
      for (const { task, id } of newlyCreated) {
        const matches = scoped.filter(card => card.title === task.title);
        if (matches.length !== 1 || String(matches[0].taskId ?? '') !== id ||
            (task.sourceEntityType === 'authoring_document' &&
              String(matches[0].sourceDocumentId ?? '') !== String(task.sourceEntityId))) {
          throw new Error(`Tasking did not reopen the exact persisted task and authoring-document link for "${task.title}". Inspect Tasking before retrying.`);
        }
      }
    }
    return `${created} created, ${tasks.length - created} already there (board project ${projectId})`;
  });
}

/* ───────────────────────── CMC / Module 3 ───────────────────────── */

async function ensureSpecs({ api, tally }, program, specs) {
  const list = rowsOf(must(await api('GET', `/api/cmc/specifications/${program.id}`), 200, 'list specifications'));
  const have = new Set(list.map((s) => s.material_name ?? s.materialName));
  let created = 0;
  for (const s of specs) {
    if (have.has(s.name)) { tally.found('cmc-spec'); continue; }
    must(await api('POST', '/api/cmc/specifications', {
      materialType: s.material,
      materialName: s.name,
      acceptanceCriteria: { release: s.release, shelf: s.shelf ?? s.release },
      testMethods: { method: s.method },
      regulatoryBasis: { ich: s.ich },
      justification: s.justification,
      approvalStatus: 'draft',
      projectId: program.id,
    }), [200, 201], `create specification "${s.name}"`);
    tally.created('cmc-spec');
    created += 1;
  }
  return created;
}

async function ensureStability({ api, tally }, program, studies) {
  const list = rowsOf(must(await api('GET', `/api/cmc/stability-studies?projectId=${encodeURIComponent(program.id)}`), 200, 'list stability studies'));
  let created = 0;
  for (const s of studies) {
    let row = list.find((r) => (r.studyTitle ?? r.study_title) === s.title) ?? null;
    if (row) tally.found('cmc-stability');
    else {
      const start = new Date(Date.now() - s.monthsRunning * 30.44 * DAY);
      const end = new Date(start); end.setMonth(end.getMonth() + s.duration);
      row = must(await api('POST', '/api/cmc/stability-studies', {
        studyTitle: s.title,
        productName: s.product,
        batchNumber: s.batch,
        dosageForm: s.dosageForm,
        strength: s.strength,
        scope: s.scope,
        climaticZone: 'II',
        studyType: s.studyType,
        storageConditions: s.storage,
        duration: s.duration,
        testParameters: s.parameters,
        timePoints: s.timePoints,
        status: 'ACTIVE',
        startDate: start.toISOString(),
        plannedEndDate: end.toISOString(),
        notes: s.notes,
        projectId: program.id,
      }), [200, 201], `create stability study "${s.title}"`).data;
      tally.created('cmc-stability');
      created += 1;
    }
    const recorded = row?.stabilityData?.results ?? row?.stability_data?.results ?? [];
    if (s.results?.length && !(Array.isArray(recorded) && recorded.length)) {
      must(await api('PUT', `/api/cmc/stability-studies/${row.id}`, {
        stabilityData: { results: s.results },
        reason: 'Demo seed: record the pull-point results measured to date.',
      }), 200, `record results for "${s.title}"`);
      tally.created('cmc-stability-results');
    }
  }
  return created;
}

async function ensureBatches({ api, tally }, program, batches) {
  const list = rowsOf(must(await api('GET', `/api/cmc/batch-records/${program.id}`), 200, 'list batch records'));
  const have = new Set(list.map((b) => b.batch_number ?? b.batchNumber));
  let created = 0;
  for (const b of batches) {
    if (have.has(b.number)) { tally.found('cmc-batch'); continue; }
    must(await api('POST', '/api/cmc/batch-records', {
      batchNumber: b.number,
      productName: b.product,
      status: 'in-progress',
      yieldData: { percent: b.yieldPercent },
      deviations: { open: b.openDeviations ?? 0 },
      projectId: program.id,
    }), [200, 201], `create batch "${b.number}"`);
    tally.created('cmc-batch');
    created += 1;
  }
  return created;
}

/** cmc: { specs: [...], stability: [...], batches: [...] } */
export async function ensureCmc(ctx, program, cmc, label) {
  const { run } = ctx;
  await run.step(`CMC / Module 3: specifications on ${label}`, async () => `${await ensureSpecs(ctx, program, cmc.specs)} created of ${cmc.specs.length}`);
  await run.step(`CMC / Module 3: stability programme on ${label}`, async () => `${await ensureStability(ctx, program, cmc.stability)} created of ${cmc.stability.length}`);
  await run.step(`CMC / Module 3: batch records on ${label}`, async () => `${await ensureBatches(ctx, program, cmc.batches)} created of ${cmc.batches.length}`);
}

/* ───────────────────────── Biostatistics ───────────────────────── */

/**
 * Persist the study design and bind it to the protocol document, the two posts
 * the protocol workspace's "Create a study design" makes. Biostatistics lists
 * the design and sizes it from its recorded assumptions.
 */
export async function ensureStudyDesign({ api, run, tally }, program, protocolDocumentId, design) {
  await run.step(`Biostatistics: study design "${design.title}"`, async () => {
    const listed = rowsOf(must(await api('GET', '/api/biostat-bridge/designs'), 200, 'list study designs'));
    const found = listed.find((d) => d.title === design.title);
    const reason = found
      ? 'Demo seed: bring the recorded study design in line with the protocol it belongs to.'
      : 'Demo seed: record the study design the protocol states, with its planning assumptions.';
    // An earlier run's design is updated in place (the persist route upserts by
    // study id), so a corrected design reaches databases already seeded.
    const saved = must(await api('POST', '/api/study-design/persist', { design: { ...design, ...(found ? { id: found.studyId } : {}), programId: program.id, status: 'draft' }, reason }), [200, 201], 'persist study design');
    if (found) { tally.found('study-design'); return `updated ${found.studyId}`; }
    const studyId = saved.studyId ?? saved.data?.studyId ?? saved.id ?? saved.data?.id;
    if (!studyId) throw new Error(`persist study design answered no study id: ${JSON.stringify(saved).slice(0, 300)}`);
    if (protocolDocumentId) {
      must(await api('POST', `/api/protocol-development/documents/${protocolDocumentId}/study-design`, { studyDesignId: studyId, reason }), [200, 201], 'bind study design to the protocol');
    }
    tally.created('study-design');
    return `created ${studyId}${protocolDocumentId ? `, bound to protocol document ${protocolDocumentId}` : ''}`;
  });
}

/* ───────────────────────── Plan ───────────────────────── */

/** Every deliverable of the IND plan of work that names a template, by its title. */
function catalogTemplates(catalog) {
  const out = new Map();
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (o.template?.id && typeof o.title === 'string' && !out.has(o.title)) out.set(o.title, o.template);
    Object.values(o).forEach(walk);
  };
  walk(catalog);
  return out;
}

/**
 * Start Plan deliverables from their templates, the create Plan's "Start"
 * makes (IndDocumentLibrary.tsx createTemplateCopy): the template's title,
 * module and id, in the project. Plan counts a deliverable as started by its
 * template; documents the seed authored under its own titles count for none,
 * so every phase read "0 started" on a seeded project (2026-10-31).
 */
export async function ensurePlanDocuments({ api, run, tally }, program, deliverables, label) {
  await run.step(`Plan: start ${deliverables.length} deliverables on ${label}`, async () => {
    const catalog = must(await api('GET', '/api/authoring/ind-document-catalog'), 200, 'read the IND plan of work');
    const templates = catalogTemplates(catalog.data ?? catalog);
    const docs = rowsOf(must(await api('GET', `/api/authoring/docs?status=all&programId=${encodeURIComponent(program.id)}`), 200, 'list project documents'));
    const started = new Set(docs.map((d) => d.template_id).filter(Boolean));
    let created = 0;
    for (const title of deliverables) {
      const template = templates.get(title);
      if (!template) throw new Error(`the IND plan of work has no templated deliverable "${title}"`);
      if (started.has(template.id)) { tally.found('plan-document'); continue; }
      must(await api('POST', '/api/authoring/docs', { title: template.title, module: template.module, template_id: template.id, client_program_id: program.id }), [200, 201], `start "${title}"`);
      tally.created('plan-document');
      created += 1;
    }
    return `${created} started, ${deliverables.length - created} already started`;
  });
}

/* ───────────────────────── Communication: an agency letter ───────────────────────── */

/**
 * File an agency letter in the project's data room and log it in the
 * project's agency inbox, linked to that file: the two writes Respond's "Add
 * the agency's letter" makes (ProjectRespond.tsx). The letter goes up through
 * the data room's own upload (POST /api/chat/upload, useChatUpload.ts), which
 * reads its text as it records the source; the communication is the inbox's
 * audited write (POST .../agency-communications), linked as `cre_source:<id>`,
 * which the server checks is this project's source (refuseForeignLetterSources).
 *
 * The source is found again by its title (the file name) and the
 * communication by that link, so a second run writes nothing. Then the
 * inbox's own reads (question-proposals, commitment-proposals) must find in
 * the letter what `letter.expect` says, or the step fails: a letter whose
 * text the data room did not read, or that yields other commitments, is not
 * the demonstration it is seeded for.
 *
 *   letter: { fileName, text, communication: { sourceType, communicationType,
 *             sourceChannel, letterClass, urgency, responseRequired },
 *             expect: { commitments: [ref…], questions: n } }
 */
export async function ensureAgencyLetter({ api, run, tally }, program, letter, label) {
  const out = { title: letter.fileName, sourceId: null, eventId: null };
  await run.step(`Communication: data-room source "${letter.fileName}" on ${label}`, async () => {
    const listed = must(await api('GET', `/api/c2c/projects/${encodeURIComponent(program.id)}/sources?limit=200`), 200, 'read the data room');
    const hit = (listed.sources ?? []).find((s) => s.title === letter.fileName);
    if (hit) { out.sourceId = Number(hit.id); tally.found('data-room-source'); return `found ${out.sourceId}`; }
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(letter.text, 'utf8')], { type: 'text/plain' }), letter.fileName);
    form.append('projectId', program.id);
    const up = must(await api('POST', '/api/chat/upload', form), 200, `upload ${letter.fileName} into the data room`);
    if (!Number.isSafeInteger(Number(up.sourceId)) || Number(up.sourceId) <= 0) {
      throw new Error(`the upload recorded no data-room source: ${JSON.stringify(up).slice(0, 300)}`);
    }
    if (up.dataRoom?.readable !== true) {
      throw new Error(`the data room recorded source ${up.sourceId} but did not read its text: ${JSON.stringify(up.dataRoom ?? null).slice(0, 300)}`);
    }
    out.sourceId = Number(up.sourceId);
    tally.created('data-room-source');
    return `uploaded ${out.sourceId} (text read: ${up.dataRoom.processing?.status ?? 'processed'})`;
  });

  const commsPath = `/api/concept2cure/projects/${encodeURIComponent(program.id)}/agency-communications`;
  const ref = `cre_source:${out.sourceId}`;
  await run.step(`Communication: agency inbox entry for "${letter.communication.communicationType}" on ${label}`, async () => {
    const comms = rowsOf(must(await api('GET', commsPath), 200, 'read the agency inbox'));
    const hit = comms.find((c) => (c.linkedArtifactIds ?? []).includes(ref));
    if (hit) { out.eventId = hit.id; tally.found('agency-communication'); return `found ${hit.id}`; }
    const c = letter.communication;
    const j = must(await api('POST', commsPath, {
      sourceType: c.sourceType,
      communicationType: c.communicationType,
      sourceChannel: c.sourceChannel,
      linkedSectionCodes: [],
      linkedArtifactIds: [ref],
      urgency: c.urgency,
      responseRequired: c.responseRequired,
      extractedIssues: [],
      letterClass: c.letterClass,
      visibilityTier: 'shared_client_c2c',
    }), [200, 201], `log ${c.communicationType} in the agency inbox`);
    out.eventId = j.data?.id ?? null;
    if (!out.eventId) throw new Error(`the inbox logged no communication id: ${JSON.stringify(j).slice(0, 300)}`);
    tally.created('agency-communication');
    return `logged ${out.eventId}`;
  });

  await run.step(`Communication: the inbox reads "${letter.fileName}"`, async () => {
    const base = `${commsPath}/${encodeURIComponent(out.eventId)}`;
    const q = must(await api('GET', `${base}/question-proposals`), 200, 'read the letter\'s questions');
    const k = must(await api('GET', `${base}/commitment-proposals`), 200, 'read the letter\'s commitments');
    const unread = [...(q.data?.sources ?? []), ...(k.data?.sources ?? [])].filter((s) => s.state !== 'read');
    if (unread.length) throw new Error(`the inbox could not read the letter: ${JSON.stringify(unread)}`);
    const questions = q.data?.proposals ?? [];
    const refs = (k.data?.proposals ?? []).map((p) => p.ref);
    if (questions.length !== letter.expect.questions || refs.join(',') !== letter.expect.commitments.join(',')) {
      throw new Error(`the inbox found ${questions.length} questions and commitments [${refs.join(', ')}]; expected ${letter.expect.questions} and [${letter.expect.commitments.join(', ')}]`);
    }
    const recorded = (k.data?.proposals ?? []).filter((p) => p.recordedCommitmentId !== null).length;
    out.proposals = { questions: questions.length, commitments: refs, commitmentsRecorded: recorded };
    return `${questions.length} questions, ${refs.length} commitments proposed${refs.length ? ` (${recorded} recorded)` : ''}`;
  });
  return out;
}

export { dateIn };
