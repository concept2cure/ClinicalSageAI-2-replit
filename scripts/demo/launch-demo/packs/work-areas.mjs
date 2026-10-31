/**
 * launch-demo/packs/work-areas.mjs — the work areas a demo project is shown in:
 * Tasks, CMC / Module 3 and Biostatistics.
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
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.rows) ? j.rows : Array.isArray(j?.data?.rows) ? j.data.rows : []);

/* ───────────────────────── Tasks ───────────────────────── */

/** The task board files a task under the project's board row, which names the program it belongs to. */
async function boardProjectId(api, program) {
  const rows = rowsOf(must(await api('GET', '/api/projects'), 200, 'list board projects'));
  const row = rows.find((p) => p.regulatoryProgramId === program.id);
  if (!row) throw new Error(`the task board has no project row for program ${program.id}; no task was created`);
  return Number(row.id);
}

/**
 * tasks: [{ title, moduleType, priority, status, dueInDays, description }]
 * Status is one the create form offers (pending | in-progress | review).
 */
export async function ensureTasks({ api, run, tally }, program, tasks, label) {
  await run.step(`Tasks: ${tasks.length} tasks on ${label}`, async () => {
    const projectId = await boardProjectId(api, program);
    const board = must(await api('GET', '/api/task-management/board'), 200, 'read task board');
    const have = new Set(rowsOf(board).map((t) => t.title));
    let created = 0;
    for (const t of tasks) {
      if (have.has(t.title)) { tally.found('task'); continue; }
      must(await api('POST', '/api/tasks/tasks', {
        title: t.title,
        description: t.description,
        moduleType: t.moduleType,
        taskType: 'deliverable',
        priority: t.priority ?? 'medium',
        status: t.status ?? 'pending',
        projectId,
        dueDate: isoIn(t.dueInDays ?? 14),
        regulatoryImpact: true,
        reason: `Demo seed: plan the ${label} work so the task board shows it.`,
      }), [200, 201], `create task "${t.title}"`);
      tally.created('task');
      created += 1;
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
    if (found) { tally.found('study-design'); return `found ${found.studyId ?? found.id}`; }
    const reason = 'Demo seed: record the study design the protocol states, with its planning assumptions.';
    const saved = must(await api('POST', '/api/study-design/persist', { design: { ...design, programId: program.id, status: 'draft' }, reason }), [200, 201], 'persist study design');
    const studyId = saved.studyId ?? saved.data?.studyId ?? saved.id ?? saved.data?.id;
    if (!studyId) throw new Error(`persist study design answered no study id: ${JSON.stringify(saved).slice(0, 300)}`);
    if (protocolDocumentId) {
      must(await api('POST', `/api/protocol-development/documents/${protocolDocumentId}/study-design`, { studyDesignId: studyId, reason }), [200, 201], 'bind study design to the protocol');
    }
    tally.created('study-design');
    return `created ${studyId}${protocolDocumentId ? `, bound to protocol document ${protocolDocumentId}` : ''}`;
  });
}

export { dateIn };
