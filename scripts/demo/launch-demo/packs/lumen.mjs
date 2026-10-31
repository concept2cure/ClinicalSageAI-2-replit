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
 *              specifications, stability and batches, and tasks
 *   Others     program overview and tasks
 *
 * Same rules as the other packs: through the product's own API as the
 * signed-in account, idempotent by title, and a refusal fails the step with the
 * server's answer. Content and its provenance are in lumen-content.mjs.
 */
import fs from 'node:fs';
import { makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { makeTally } from './biotech-shared.mjs';
import { CLIENT, CSR_SOURCE_FILE, FOOTER, LMN201_CMC, LMN201_DESIGN, PROJECTS, T, TASKS, overviewPdf } from './lumen-content.mjs';
import { ensureCmc, ensureStudyDesign, ensureTasks } from './work-areas.mjs';

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
  const c = { api, run, tally };
  run.note('Lumen Bioscience demonstration built from public information (data/seeds/lumen-demo). Not affiliated with Lumen Bioscience, Inc.; every specification, stability result, batch, planning assumption and task is illustrative.');

  const clientWorkspaceId = await ensureClient(c);
  const existing = await listAllProjects(api);
  const projects = {};
  for (const spec of PROJECTS) {
    const project = await ensureProject(c, spec, clientWorkspaceId, existing);
    projects[spec.code] = project;
    await ensureOverview(c, project, spec);
    await ensureTasks(c, project, TASKS[spec.code] ?? [], spec.code);
  }
  run.record('projects', projects);

  const lmn201 = projects['LMN-201'];
  await ensureCsrSource(c, lmn201);
  await ensureStudyDesign(c, lmn201, null, LMN201_DESIGN);
  await ensureCmc(c, lmn201, LMN201_CMC, 'LMN-201');

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  run.record('summary', { created: sum(tally.tally.created), found: sum(tally.tally.found) });
  console.info(`  ⇒ lumen pack: created ${sum(tally.tally.created)}, found ${sum(tally.tally.found)}`);
}

/** Nothing this pack creates has a delete route the seed may use; say so rather than reach for SQL. */
export async function purge({ run }) {
  await run.step('Purge: Lumen demo records', async () => {
    run.note('The Lumen projects, Vault documents, study design and CMC records have no delete or archive route the seed uses; archive the projects from Project settings. Nothing was removed.');
    return 'nothing removed — see notes';
  });
}
