/**
 * launch-demo/packs/portfolio.mjs — OPT-IN pack: a portfolio of FICTIONAL
 * sponsor companies with Clinical Study Report projects at every stage of the
 * CSR lifecycle, for a client demonstration.
 *
 *   node scripts/demo/launch-demo/seed.mjs --pack portfolio --email <you>
 *
 * It runs only as `--pack portfolio`; seed.mjs leaves it out of `--pack all`
 * (as it does faux), so a Codespace's automatic `--pack all` is unchanged.
 *
 * WHERE THE COMPANIES LIVE. Each fictional company is its OWN client
 * workspace ("<Company> (fictional demo)", portfolio-content.mjs
 * SPONSOR_WORKSPACES), created through the product's client-workspace API
 * (POST /api/clients, exactly as the Lumen and Faux packs create theirs) and
 * found again by exact name. Until 2026-11-09 the four sponsors were named
 * sponsors inside the organisation's own workspace. Every project is created
 * with its sponsor's clientWorkspaceId explicitly. No workspace is marked the
 * organisation's default and no organisation setting is touched. The own
 * workspace does not stop organisation-wide Quality records reaching the
 * sponsor's projects (KNOWN PRODUCT BEHAVIOUR, below).
 *
 * NEVER MOVED, NEVER REUSED ACROSS WORKSPACES. A project with this pack's exact
 * title found in any workspace other than its sponsor's is refused: that study
 * stops there, nothing is attached to the project, the refusal is recorded in
 * the manifest (`refused`), the other studies continue, and the run ends
 * failed so the operator sees it. A study design titled for the pack but bound
 * to another project is left where it is (the product refuses to move a
 * design, PROGRAM_MISMATCH) and is recorded in `refused` too; that study's
 * other steps go on.
 *
 * ORDER ON A FRESH DATABASE. Run `--pack all` before `--pack portfolio`. These
 * four workspaces, like Lumen's, make "several workspaces, none marked
 * default"; a pack that creates a project without naming a workspace is then
 * refused by intake (AMBIGUOUS_CLIENT_WORKSPACE). Projects that already exist
 * are found by title and are unaffected.
 *
 * WHAT IS CREATED, through the product's own HTTP API as the signed-in user,
 * idempotently by exact "[Demo · Portfolio] …" title: for each study a project
 * through the canonical intake; its protocol (and SAP) PDF in the project's
 * Vault; from database lock on, a synthetic `concept2cure.csr-source.v1` study
 * source in the data room, read back through the source preview; a CSR working
 * document in the ONE editor from the canonical CSR template
 * (component:clinical_study_report), with ICH E3 narrative headings written as
 * saved revisions; reviewer comments; tasks; and the stage's own records.
 * Its Vault files are download-verified in named project folders. A separate
 * ninth project retains a completed INTERNAL reference Word/PDF/data handover;
 * those reference files are unapproved examples, not native CSR exports.
 *
 * NOT EXECUTED, recorded in the manifest with the reason, never faked: the
 * Vault approval and freeze of a study source (two further people), the build
 * from the study's data and AnA drafting (no model provider here), a formal
 * review request (needs a second member; the author cannot review), the
 * freeze and e-signature (signer credential), and the eCTD compile and any
 * agency outcome. Synthetic numbers are not clinical evidence.
 *
 * DEMO STORYLINE (client switcher → the sponsor's workspace → Projects → the
 * project → its documents / Vault / Tasks):
 *  - Varnhollow Oncology (oncology mAb VNH-310).
 *    a) "VNH-310-301 Phase 3 CSR (planning)": protocol and SAP in the Vault, an
 *       empty CSR shell with every ICH E3 heading; tasks for the TLF shells.
 *    e) "VNH-310-201 Phase 2 CSR (in review)": open the CSR — every narrative
 *       heading written; three reviewer comments open, one resolved. "Send for
 *       review" is where a second member would be named.
 *  - Petrelline Rare Therapeutics (enzyme replacement PTR-022).
 *    b) "PTR-022-301 Phase 3 CSR (enrolling)": Biostatistics shows the Phase 3
 *       design; Tasks shows 58 of 96 randomized and an overdue monitoring report.
 *    f) "PTR-022-102 Phase 1/2 CSR (awaiting signature)": all text written,
 *       every comment resolved; the freeze and e-signature wait for the signer.
 *  - Quillmont Immunology (oral small molecule QLM-118).
 *    c) "QLM-118-202 Phase 2b CSR (database locked)": the study source in the
 *       data room; the editor's "Build from the study's data" lists it,
 *       unapproved — approving and freezing it is the next governed act.
 *    g) "QLM-118 IND — Phase 1 CSR ready to file at 5.3.5.1": the CSR is written
 *       and IND sequence 0000 is open in Submission Center. Filing it to the Vault
 *       (and so to its m5.3.5.1 leaf) is refused by the product until a
 *       scientific-review receipt covers the CSR and its approved source
 *       (CSR_SCIENTIFIC_REVIEW_REQUIRED, recorded in the manifest).
 *  - Halcyra Vaccines (adjuvanted RSV vaccine HLY-09).
 *    d) "HLY-09-201 Phase 2 CSR (drafting)": five headings written, efficacy,
 *       safety and conclusions still empty — continue writing in the editor.
 *    h) "HLY-09 IND — Phase 1 CSR, agency information request": a FICTIONAL
 *       information-request REHEARSAL scenario. The agency inbox proposes the
 *       fictional letter's three numbered questions on the HLY-09-101 CSR. The
 *       CSR was NOT filed: it is not placed in IND sequence 0000 (refused as in
 *       g), and nothing in this pack says it was filed or submitted.
 *
 * KNOWN PRODUCT BEHAVIOUR (reported, not hidden by this pack): the first read
 * of any project's data room (GET /api/c2c/projects/:id/sources at offset 0:
 * opening Records > Data Room sources, the editor's sources rail, or a seed
 * pack's read) runs the product's Quality capture, in any client workspace
 * (data-room-search.ts prepareSourceScope → record-source.ts
 * syncQualityProjectSources). It snapshots into that project's data room what
 * server/services/qms/project-evidence-queries.ts returns: suppliers, internal
 * audits and management reviews for the whole organisation, change controls
 * with no program, GMP deviations with no client workspace, and their record
 * relationships. A sponsor's own workspace does not stop it: on the local
 * database (2026-11-09) every portfolio project in its sponsor's workspace
 * holds the same 21 records from other packs as the archived projects in the
 * organisation's own workspace. It is not caused by stage h's letter; this
 * pack makes that read on one project only (stage h, through the shared
 * agency-letter step and its read-back). The coordinator or product owner
 * rules on the capture's scope. The pack changes nothing to mask it and
 * records it with each run's own stage h read (KNOWN_PRODUCT_BEHAVIOUR,
 * manifest knownProductBehaviour).
 *
 * LOCAL LEFTOVERS (this pack corrects what it can through the API): narrative
 * text it wrote earlier that no longer matches the pack (it starts with the
 * SYNTHETIC tag) is corrected once as a saved revision; an earlier task that
 * called the stage-h CSR "filed" is archived and replaced. The first local
 * projects, created in the organisation's own workspace, were archived through
 * the product's archive route (2026-11-09, docs/evidence/DEMO/portfolio/
 * sponsor-workspaces/local-archive.log) and are not touched by this pack.
 */
import { connectSigner, demoTitle, makeMultiPagePdfBuffer, must } from '../lib.mjs';
import { asArray, makeTally, NOT_EXECUTED_NO_SIGNER } from './biotech-shared.mjs';
import { canonicalSubmissionFor } from './biotech-submission.mjs';
import { ensureAgencyLetter, ensureStudyDesign, ensureTasks } from './work-areas.mjs';
import { ensurePortfolioFolders, ensurePortfolioVaultFile } from './portfolio-vault.mjs';
import { ensureInternalHandover, HANDOVER_FILE_LABELS, HANDOVER_TASK_TITLE } from './portfolio-handover.mjs';
import {
  ALL_HEADINGS, COMPANIES, HALCYRA_IR_LETTER, HEADING_PATTERNS, INTERNAL_HANDOVER, KNOWN_PRODUCT_BEHAVIOUR, SPONSOR_WORKSPACES, STAGES, STUDIES, SYNTHETIC,
  buildCsrSource, companyOf, designOwnedElsewhere, existingProjectFor, matchSponsorWorkspace, narrative, protocolSections,
  sapSections, stageTasks, studyDesignFor, workspaceIdOf, workspaceOf,
} from './portfolio-content.mjs';

export { KNOWN_PRODUCT_BEHAVIOUR, designOwnedElsewhere, existingProjectFor, matchSponsorWorkspace };

export const PACK = 'portfolio';
const T = (name) => demoTitle(PACK, name);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CSR_TEMPLATE_ENTRY = 'component:clinical_study_report';
const NO_SECOND_MEMBER = 'not executed — a formal review request needs a second organisation member as reviewer; the server refuses the author as their own reviewer (REVIEWER_IS_AUTHOR)';
const NO_MODEL = 'not executed — the build from the study\'s data needs an approved, frozen source, and AnA drafting needs a model provider (none is configured)';
const NO_SOURCE_APPROVAL = 'not executed — Vault approval of the study source needs two further people (reviewer and approver, not the uploader) with signing credentials; the study data cannot be frozen until then';
const NO_COMPILE = 'not executed — the eCTD compile, validation and dispatch are the person\'s governed actions in Submission Center; no agency acknowledgement is invented';

/* ───────── pure helpers (tested) ───────── */

export const projectTitle = (study) => `${companyOf(study).name} · ${study.shortTitle} — SYNTHETIC`;
export const csrDocTitle = (study) => `${study.protocolNumber} Clinical Study Report (ICH E3) — ${companyOf(study).name}`;
export const sourceVersion = (study) => study.sourceVersion ?? 'v2';
export const sourceLabel = (study) => `${study.protocolNumber} clinical study source · synthetic ${sourceVersion(study)}`;
export const sourceBytes = (study) => Buffer.from(`${JSON.stringify(buildCsrSource(study), null, 2)}\n`, 'utf8');
export const headingsFor = (study) => ({ a: [], b: [], c: [] }[study.stage] ?? study.draftedHeadings ?? ALL_HEADINGS);
export const needsSource = (study) => !['a', 'b'].includes(study.stage);

/** Every record title this pack would create, for the uniqueness test. */
export function plannedTitles() {
  const out = [];
  for (const s of STUDIES) {
    out.push(T(projectTitle(s)), T(csrDocTitle(s)), T(`${s.protocolNumber} protocol · synthetic`));
    if (['a', 'c'].includes(s.stage)) out.push(T(`${s.protocolNumber} statistical analysis plan · synthetic`));
    if (needsSource(s)) out.push(T(sourceLabel(s)));
    for (const t of stageTasks(s)) out.push(T(t.title));
  }
  out.push(T(projectTitle(INTERNAL_HANDOVER)), ...HANDOVER_FILE_LABELS.map(T), HANDOVER_TASK_TITLE);
  return out;
}

/** The canonical intake's body for a study's project. It always names the sponsor's workspace; there is no default. */
export function projectIntakeBody(study, workspaceId) {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
    throw new Error(`no client workspace for ${study.protocolNumber}: a portfolio project is created only in its sponsor's workspace`);
  }
  const ind = study.programType === 'ind';
  return {
    name: T(projectTitle(study)), productName: study.productName,
    programType: ind ? 'ind' : 'csr', submissionTypeId: ind ? 'us_ind' : 'ich_csr',
    productType: study.productType, primaryAgency: 'FDA',
    clientWorkspaceId: workspaceId,
    indication: study.indication,
    objective: objectiveFor(study), objectiveSources: [],
    priority: ['e', 'f', 'h'].includes(study.stage) ? 'high' : 'medium', teamMembers: [],
  };
}

export function objectiveFor(study) {
  const c = companyOf(study);
  if (study.internalHandover) return `Complete a SYNTHETIC internal demonstration handover for ${c.name}: save and verify unapproved reference Word/PDF files, synthetic study data and a hash inventory, then complete the internal delivery task. Keep the project active so the examples can be opened during presentation; later archival is optional. No clinical approval, signature, regulatory submission or agency acceptance is represented.`;
  return [
    `FICTIONAL demonstration project (${SYNTHETIC}). Sponsor: ${c.name}.`,
    `Goal: author, review, sign and file the ICH E3 Clinical Study Report for study ${study.protocolNumber} (Phase ${study.phase}): ${study.title}.`,
    `Design: ${study.design}. Primary endpoint: ${study.primaryEndpoint}.`,
    `CSR lifecycle stage shown: ${STAGES[study.stage]}.`,
  ].join(' ');
}

/* ───────── API steps ───────── */

/** Each sponsor's own client workspace: found by exact name, else created through POST /api/clients (as Lumen and Faux do). */
async function ensureSponsorWorkspaces({ api, run, tally, identity }) {
  const out = new Map(), recorded = [];
  for (const spec of SPONSOR_WORKSPACES) {
    await run.step(`Client workspace: ${spec.name}`, async () => {
      const listed = must(await api('GET', '/api/clients'), 200, 'list client workspaces');
      if (!Array.isArray(listed.clients)) throw new Error('the client workspace catalog was unavailable; no workspace was created.');
      let id = matchSponsorWorkspace(listed.clients, spec, identity.organizationId);
      const created = id === null;
      if (created) {
        const j = must(await api('POST', '/api/clients', { name: spec.name, slug: spec.slug }), [200, 201], `create client workspace ${spec.name}`);
        const saved = j.client ?? j.data ?? j;
        const confirmed = saved.name === spec.name && saved.slug === spec.slug && String(saved.organizationId ?? '') === String(identity.organizationId);
        if (!confirmed) throw new Error(`the new workspace's receipt did not confirm "${spec.name}" in organisation ${identity.organizationId}; no project was created.`);
        id = Number(saved.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`client workspace create answered no id: ${JSON.stringify(j).slice(0, 300)}`);
        tally.created('client-workspace');
      } else tally.found('client-workspace');
      out.set(spec.key, id);
      recorded.push({ key: spec.key, id, name: spec.name, slug: spec.slug, created });
      return `${created ? 'created' : 'found'} ${id}`;
    });
  }
  run.record('clientWorkspaces', recorded);
  return out;
}

async function listProjects(api) {
  const rows = [];
  for (let offset = 0, page = 0; page < 100; page += 1) {
    const data = must(await api('GET', `/api/c2c/projects?limit=200&includeArchived=true${offset ? `&offset=${offset}` : ''}`), 200, 'list projects');
    if (!Array.isArray(data.data)) throw new Error('the project list is unavailable; no project was created');
    rows.push(...data.data);
    if (data.meta?.hasMore !== true) return rows;
    if (data.data.length === 0) throw new Error('project pagination made no progress; refusing duplicate creation');
    offset += data.data.length;
  }
  throw new Error('project pagination exceeded 100 pages; refusing duplicate creation');
}

async function ensureProject({ api, run, tally }, projects, study, workspaceId) {
  const name = T(projectTitle(study));
  return run.step(`Project (${study.stage}) ${projectTitle(study)} — workspace ${workspaceId}`, async () => {
    const decision = existingProjectFor(projects, name, workspaceId);
    // A project with this study's title in another workspace: the study stops (seedStudy records it), the others go on.
    if (decision.action === 'refuse') {
      const { id: projectId, foundWorkspaceId, expectedWorkspaceId, reason } = decision;
      throw Object.assign(new Error(reason), { refusal: { title: name, projectId, foundWorkspaceId, expectedWorkspaceId, reason } });
    }
    let id = decision.id ?? null;
    let submissionId = null;
    if (decision.action === 'create') {
      const j = must(await api('POST', '/api/c2c/projects', projectIntakeBody(study, workspaceId)), 201, `create project ${study.protocolNumber}`);
      id = j.data?.id;
      submissionId = j.meta?.submissionId ?? null;
      tally.created('project');
    } else tally.found('project');
    if (!id) throw new Error('project creation returned no id');
    const detail = must(await api('GET', `/api/c2c/projects/${id}`), 200, `read project ${id}`);
    if (workspaceIdOf(detail) !== workspaceId) throw new Error(`project ${id} is not in client workspace ${workspaceId}; nothing was attached`);
    if (detail.program_type !== study.programType) throw new Error(`project ${id} is not a ${study.programType} project; nothing was attached`);
    if (detail.status === 'archived' && !study.internalHandover) throw new Error(`Archived portfolio study ${id} is not changed by the seed; it was not reopened or modified.`);
    return { id, title: name, programType: study.programType, productName: study.productName, submissionId, clientWorkspaceId: workspaceId,
      readOnly: detail.status === 'archived' };
  });
}

const pdf = (study, label, sections) => () => makeMultiPagePdfBuffer({
  title: T(label), subtitle: 'FICTIONAL - SYNTHETIC - NOT CLINICAL EVIDENCE',
  footer: `${companyOf(study).name} - fictional demonstration`, sections,
});

async function previewSource({ api, run }, project, source) {
  return run.step('Study data: the editor\'s source preview reads the synthetic source', async () => {
    const j = must(await api('POST', '/api/submission-orchestrator/csr/source-preview', {
      programId: project.id, documentId: source.id, expectedSha256: source.sha256,
    }), 200, 'preview the clinical source');
    const tables = Array.isArray(j.tables) ? j.tables.length : Object.keys(j.tables ?? {}).length;
    return { approved: j.approved === true, tables };
  });
}

async function canonicalCsrTemplate({ api, run }) {
  return run.step('Editor: the canonical CSR template', async () => {
    const s = must(await api('GET', '/api/authoring/templates?search=Clinical%20Study%20Report'), 200, 'read the template catalog');
    const m = (Array.isArray(s.templates) ? s.templates : []).filter((t) => t.entryId === CSR_TEMPLATE_ENTRY);
    if (m.length !== 1 || !UUID_RE.test(String(m[0].id ?? '')) || !(Number(m[0].section_count) > 0)) {
      throw new Error('the one canonical CSR template is unavailable or duplicated. No demo records were written.');
    }
    return { id: String(m[0].id), name: m[0].name ?? m[0].title ?? null, sectionCount: Number(m[0].section_count) };
  });
}

/** The one CSR working document titled for this study, or null; refuses duplicates and a non-canonical template. */
async function findCsrDocument(api, project, title, template) {
  const list = `/api/authoring/docs?status=all&programId=${encodeURIComponent(project.id)}`;
  const rows = (must(await api('GET', list), 200, 'list project documents').documents ?? []).filter((d) => d.title === title);
  if (rows.length > 1) throw new Error(`more than one document is titled "${title}"; nothing was created`);
  if (!rows[0]?.id) return null;
  if (String(rows[0].template_id ?? '') !== template.id) throw new Error(`document ${rows[0].id} is not on the canonical CSR template; nothing was replaced`);
  return String(rows[0].id);
}

async function ensureCsrDocument({ api, run, tally }, project, study, template) {
  return run.step(`Editor: CSR working document for ${study.protocolNumber}`, async () => {
    const title = T(csrDocTitle(study));
    let id = await findCsrDocument(api, project, title, template);
    if (id) tally.found('authoring-document');
    else {
      const j = must(await api('POST', '/api/authoring/docs', { title, template_id: template.id, client_program_id: project.id }), 201, 'create the CSR working document');
      id = String(j.document?.id ?? '');
      if (!UUID_RE.test(id)) throw new Error('document creation returned no UUID');
      tally.created('authoring-document');
    }
    const detail = must(await api('GET', `/api/authoring/docs/${id}?programId=${encodeURIComponent(project.id)}`), 200, 'open the CSR document');
    if (String(detail.document?.template_id ?? '') !== template.id) throw new Error('the CSR document lost its canonical template');
    return { id, title, status: detail.document?.status ?? null, canEdit: detail.access?.edit?.allowed === true };
  });
}

const html = (text) => `<p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
const plain = (content) => String(content ?? '').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const isEmpty = (s) => !plain(s.content);
/** Text this seed wrote (it starts with the SYNTHETIC tag) and that is no longer the pack's current text: the seed corrects it once. */
export const isStaleSeedText = (content, expected) => {
  const now = plain(content);
  return now.startsWith(`[${SYNTHETIC}.]`) && now !== plain(expected);
};

/** Map each narrative key to the first canonical-template section (by order) whose title matches. */
export function mapHeadings(sections) {
  const ordered = [...sections].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
  const out = {};
  for (const [key, re] of Object.entries(HEADING_PATTERNS)) {
    const hit = ordered.find((s) => re.test(String(s.title ?? '')) && !Object.values(out).some((o) => o.id === s.id));
    if (hit) out[key] = { id: hit.id, code: hit.code, title: hit.title, empty: isEmpty(hit), content: hit.content ?? '' };
  }
  return out;
}

async function writeNarrative({ api, run, tally }, doc, study) {
  return run.step(`Editor: write ${headingsFor(study).length} ICH E3 narrative headings (saved revisions)`, async () => {
    const sections = must(await api('GET', `/api/authoring/docs/${doc.id}/sections`), 200, 'read CSR sections').sections ?? [];
    const map = mapHeadings(sections);
    const text = narrative(study);
    const missing = headingsFor(study).filter((k) => !map[k]);
    if (missing.length === headingsFor(study).length && missing.length) throw new Error(`no canonical CSR heading matched ${missing.join(', ')}; sections: ${sections.slice(0, 12).map((s) => s.title).join(' | ')}`);
    let written = 0;
    for (const key of headingsFor(study)) {
      const s = map[key];
      if (!s) continue;
      const stale = !s.empty && isStaleSeedText(s.content, text[key]);
      if (!s.empty && !stale) { tally.found('csr-section-text'); continue; }
      const changeReason = stale
        ? `Demo seed correction: the fictional ${key} narrative for ${study.protocolNumber} now matches the study design and the resolved review comments (synthetic).`
        : `Demo seed: write the fictional ${key} narrative for ${study.protocolNumber} (synthetic).`;
      must(await api('PATCH', `/api/authoring/sections/${s.id}`, { content: html(text[key]), changeReason }), 200, `write ${key}`);
      tally.created(stale ? 'csr-section-text-corrected' : 'csr-section-text');
      written += 1;
    }
    return { sectionMap: map, written, missing };
  });
}

async function ensureComments({ api, run, tally }, doc, study, map) {
  return run.step(`Editor: ${study.comments.length} reviewer comments`, async () => {
    const rows = asArray(must(await api('GET', `/api/authoring/documents/${doc.id}/comments`), 200, 'read comments'), 'comments', 'data');
    const out = [];
    for (const c of study.comments) {
      const section = map[c.heading];
      if (!section) throw new Error(`comment target heading "${c.heading}" is not on the CSR template`);
      let row = rows.find((r) => String(r.body ?? r.comment ?? '') === c.body) ?? null;
      if (row) tally.found('authoring-comment');
      else {
        const j = must(await api('POST', `/api/authoring/sections/${section.id}/comment`, { body: c.body, doc_id: doc.id }), [200, 201], `comment on ${c.heading}`);
        row = j.comment ?? null;
        if (!row?.id) throw new Error('comment creation returned no id');
        tally.created('authoring-comment');
      }
      if (c.resolution && row.status !== 'resolved') {
        const j = must(await api('PATCH', `/api/authoring/comments/${row.id}`, { status: 'resolved', resolution_note: c.resolution }), 200, `resolve comment ${row.id}`);
        row = j.comment ?? { ...row, status: 'resolved' };
        tally.created('authoring-comment-resolution');
      }
      out.push({ id: row.id, heading: c.heading, status: row.status ?? 'open' });
    }
    return out;
  });
}

/** Stage g/h: file the CSR to the Vault and place it as the m5.3.5.1 leaf of IND sequence 0000. Refusals are recorded, not hidden. */
async function placeAt5351({ api, run, tally }, project, doc, notExecuted) {
  return run.step('Submission Center: CSR at m5.3.5.1 in IND sequence 0000', async () => {
    try {
      let subId = project.submissionId;
      if (!subId) {
        // By the server's spine rule: the submission anchored to THIS project, never another project's of the same title.
        const list = asArray(must(await api('GET', '/api/submissions'), 200, 'list submissions'), 'data');
        subId = canonicalSubmissionFor(list, project)?.id ?? null;
      }
      if (!subId) throw new Error('the IND project has no submission spine');
      const seqs = asArray(must(await api('GET', `/api/submissions/${subId}/sequences`), 200, 'list sequences'), 'data');
      let seq = seqs.find((s) => String(s.sequenceNumber ?? s.sequence_number) === '0000') ?? null;
      if (seq) tally.found('sequence');
      else {
        seq = must(await api('POST', `/api/submissions/${subId}/sequences`, { region: 'fda', sequenceNumber: '0000', type: 'original' }), 201, 'create sequence 0000');
        tally.created('sequence');
      }
      const leaves = asArray(must(await api('GET', `/api/submissions/sequences/${seq.id}/leaves`), 200, 'list leaves'), 'data', 'leaves');
      const have = leaves.find((l) => (l.sectionCode ?? l.section_code) === 'm5.3.5.1' && l.title === doc.title);
      if (have) { tally.found('leaf'); return { submissionId: subId, sequenceId: seq.id, leafId: have.id, vaultDocumentId: have.documentUuid ?? have.document_uuid ?? null, action: 'found' }; }
      const filed = must(await api('POST', `/api/authoring/docs/${doc.id}/file-to-vault`, { format: 'pdf' }), 201, 'file the CSR to the Vault');
      const vaultDocumentId = filed.data?.vaultDocumentId;
      if (!vaultDocumentId) throw new Error('file-to-vault returned no Vault document id');
      tally.created('vault-filing');
      must(await api('PUT', `/api/submissions/sequences/${seq.id}/leaves`, {
        sectionCode: 'm5.3.5.1', title: doc.title, documentTable: 'vault_documents', documentUuid: vaultDocumentId,
        lifecycleOp: 'new', reason: 'Demo seed: place the fictional CSR at 5.3.5.1 (synthetic)',
      }), 200, 'place the m5.3.5.1 leaf');
      tally.created('leaf');
      return { submissionId: subId, sequenceId: seq.id, vaultDocumentId, sha256: filed.data?.sha256 ?? null, action: 'placed' };
    } catch (err) {
      notExecuted.push({ project: project.title, step: 'CSR placement at m5.3.5.1', reason: `not executed — the server refused: ${err.message}` });
      return { action: 'not executed', reason: err.message };
    }
  });
}

/** Stage f, only when a signer is supplied: the signer freezes and e-signs. A refusal is recorded with the server's words. */
async function signerCeremony({ api, run, tally }, signer, doc, study, notExecuted) {
  return run.step(`Signature: freeze and e-sign ${study.protocolNumber}`, async () => {
    if (!signer) {
      notExecuted.push({ project: doc.title, step: 'CSR freeze and e-signature', reason: NOT_EXECUTED_NO_SIGNER });
      return NOT_EXECUTED_NO_SIGNER;
    }
    try {
      const f = await api('GET', `/api/authoring/docs/${doc.id}/frozen`);
      if (f.status !== 200) {
        must(await signer.api('POST', `/api/authoring/docs/${doc.id}/freeze`, { reason: `Fictional CSR ${study.protocolNumber}: comments resolved; frozen as v1.0 (demo seed).`, version: '1.0', meaning: 'REVIEWER', password: signer.password }), 200, 'freeze the CSR');
        tally.created('authoring-freeze');
      } else tally.found('authoring-freeze');
      const sigs = must(await api('GET', `/api/authoring/docs/${doc.id}/signatures`), 200, 'read signatures').signatures ?? [];
      if (!sigs.some((s) => s.signer_email === signer.email)) {
        must(await signer.api('POST', `/api/authoring/docs/${doc.id}/e-sign`, { password: signer.password, meaning: 'REVIEWER', intent: `Reviewed fictional CSR ${study.protocolNumber} v1.0 (demo seed, second signer).` }), 200, 'e-sign the CSR');
        tally.created('authoring-signature');
      } else tally.found('authoring-signature');
      return 'frozen and signed by the second signer';
    } catch (err) {
      notExecuted.push({ project: doc.title, step: 'CSR freeze and e-signature', reason: `not executed — the server refused: ${err.message}` });
      return `not executed — ${err.message}`;
    }
  });
}

/**
 * The letter's inbox entry is the idempotency key: the shared helper looks the
 * data-room source up by title, and the data room stored an earlier non-ASCII
 * file name mis-decoded, so on a re-run it re-uploads the same bytes (the server
 * answers with the same source id) and counts it as created. An existing entry
 * of this communication type is found here instead, and its questions re-read.
 */
async function ensureLetterOnce(c, project, study) {
  const commsPath = `/api/concept2cure/projects/${encodeURIComponent(project.id)}/agency-communications`;
  const rows = asArray(must(await c.api('GET', commsPath), 200, 'read the agency inbox'), 'data', 'rows');
  const hit = rows.find((r) => r.communicationType === HALCYRA_IR_LETTER.communication.communicationType);
  if (!hit) return ensureAgencyLetter(c, project, HALCYRA_IR_LETTER, study.protocolNumber);
  return c.run.step(`Communication: agency inbox entry on ${study.protocolNumber}`, async () => {
    const q = must(await c.api('GET', `${commsPath}/${encodeURIComponent(hit.id)}/question-proposals`), 200, 'read the letter\'s questions');
    const questions = (q.data?.proposals ?? []).length;
    if (questions !== HALCYRA_IR_LETTER.expect.questions) throw new Error(`the inbox proposes ${questions} questions; expected ${HALCYRA_IR_LETTER.expect.questions}`);
    c.tally.found('agency-communication');
    return { eventId: hit.id, linkedArtifactIds: hit.linkedArtifactIds ?? [], proposals: { questions }, action: 'found' };
  });
}

/** A task an earlier run created as completed, whose work the product refused, is archived (with its reason) so the honest task replaces it. */
async function reconcileClaims({ api, run, tally }, project, tasks) {
  const wanted = tasks.filter((t) => t.status !== 'completed');
  if (!wanted.length) return;
  await run.step(`Tasks: no completed claim the product refused on ${project.title.slice(0, 60)}`, async () => {
    const rows = asArray(must(await api('GET', '/api/projects'), 200, 'list board projects'), 'data', 'rows');
    const boardId = rows.find((p) => p.regulatoryProgramId === project.id)?.id;
    const board = asArray(must(await api('GET', '/api/task-management/board'), 200, 'read task board'), 'data');
    let moved = 0;
    for (const t of wanted) {
      const row = board.find((r) => String(r.project) === String(boardId) && r.title === t.title);
      // An earlier run's task that called the stage-h CSR "filed" (it never was) is also replaced by the honest one.
      const staleFiledClaim = /filed CSR/i.test(String(row?.description ?? ''));
      if (!row || (String(row.status) !== 'completed' && !staleFiledClaim)) continue;
      must(await api('DELETE', `/api/task-management/tasks/${encodeURIComponent(row.taskId)}`, { reason: 'Demo seed correction: an earlier run marked this complete, but the product refused the work; replaced by an honest task.' }), [200, 204], `archive the stale task "${t.title}"`);
      tally.created('task-claim-archived');
      moved += 1;
    }
    return `${moved} corrected`;
  });
}

/** Stage b: the design is persisted for THIS project, unless a design of the same title is bound to another project. */
async function ensureStageBDesign(c, project, study, refused) {
  const title = T(`${study.protocolNumber} — Phase 3 study design (fictional)`);
  const designs = asArray(must(await c.api('GET', '/api/biostat-bridge/designs'), 200, 'list study designs'), 'data', 'designs');
  const elsewhere = designOwnedElsewhere(designs, title, project.id);
  if (elsewhere) {
    const reason = `refused — study design ${elsewhere.studyId} "${title}" is bound to project ${elsewhere.programId}, not ${project.id}. The product does not move a design between projects (PROGRAM_MISMATCH) and the pack does not ask it to; Biostatistics shows no design for this project until that one is renamed or a person records a new one.`;
    refused.push({ title: project.title, projectId: project.id, step: 'study design', reason });
    console.info(`  • Biostatistics: study design "${title}" … ${reason}`);
    return { title, action: 'refused', boundTo: elsewhere };
  }
  await ensureStudyDesign(c, project, null, studyDesignFor(study, title));
  return { title, action: 'ensured' };
}

/**
 * Stage h: what the data room lists after the letter. Like every first-page read of any project's data room, this read
 * runs the product's Quality capture (KNOWN_PRODUCT_BEHAVIOUR); the pack writes nothing itself here.
 */
async function readDataRoom({ api, run }, project) {
  return run.step('Data room: sources on the stage h project after the letter (a first-page read; the product runs its Quality capture on it)', async () => {
    const j = must(await api('GET', `/api/c2c/projects/${encodeURIComponent(project.id)}/sources?limit=200`), 200, 'read the data room');
    const rows = Array.isArray(j.sources) ? j.sources : [];
    const others = rows.filter((r) => r.title !== HALCYRA_IR_LETTER.fileName).map((r) => r.title);
    return { total: rows.length, otherThanLetter: others.length, titles: others.slice(0, 40) };
  });
}

async function seedStudy(c, study, { projects, workspaces, template, notExecuted, refused }) {
  const { run } = c;
  const workspace = workspaceOf(study);
  const workspaceId = workspaces.get(workspace.key);
  const rec = { stage: study.stage, stageLabel: STAGES[study.stage], company: companyOf(study).name, protocolNumber: study.protocolNumber,
    clientWorkspace: { id: workspaceId ?? null, name: workspace.name } };
  let project;
  try {
    project = await ensureProject(c, projects, study, workspaceId);
  } catch (err) {
    if (!err.refusal) throw err;
    refused.push({ ...err.refusal, step: 'project' });
    console.info(`  refused · ${err.refusal.title}: ${err.refusal.reason}`);
    Object.assign(rec, { projectId: null, title: err.refusal.title, refused: err.refusal });
    run.record(`project.${study.stage}.${study.key}`, rec);
    return rec;
  }
  Object.assign(rec, { projectId: project.id, title: project.title, programType: project.programType });
  rec.folders = await ensurePortfolioFolders(c, project, { hasSource: needsSource(study) });
  rec.protocol = await ensurePortfolioVaultFile(c, project, {
    folderId: rec.folders.documents,
    label: `${study.protocolNumber} protocol · synthetic`, fileName: `${study.protocolNumber.toLowerCase()}-protocol-synthetic.pdf`,
    mime: 'application/pdf', code: `${study.protocolNumber}-PROTOCOL-SYNTHETIC.pdf`, documentType: 'PROTOCOL',
    bytes: pdf(study, `${study.protocolNumber} protocol (fictional)`, protocolSections(study)),
  });
  if (['a', 'c'].includes(study.stage)) {
    rec.sap = await ensurePortfolioVaultFile(c, project, {
      folderId: rec.folders.documents,
      label: `${study.protocolNumber} statistical analysis plan · synthetic`, fileName: `${study.protocolNumber.toLowerCase()}-sap-synthetic.pdf`,
      mime: 'application/pdf', code: `${study.protocolNumber}-SAP-SYNTHETIC.pdf`, documentType: 'SAP',
      bytes: pdf(study, `${study.protocolNumber} statistical analysis plan (fictional)`, sapSections(study)),
    });
  }
  if (needsSource(study)) {
    rec.source = await ensurePortfolioVaultFile(c, project, {
      folderId: rec.folders.data,
      label: sourceLabel(study), fileName: `${study.protocolNumber.toLowerCase()}-csr-source-synthetic-${sourceVersion(study)}.json`,
      mime: 'application/json', code: `${study.protocolNumber}-CSR-SOURCE-${sourceVersion(study)}.json`, documentType: 'OTHER',
      bytes: () => sourceBytes(study),
    });
    rec.sourcePreview = await previewSource(c, project, rec.source);
    notExecuted.push({ project: project.title, step: 'study-source approval and freeze', reason: NO_SOURCE_APPROVAL });
    notExecuted.push({ project: project.title, step: 'build from the study\'s data / AnA drafting', reason: NO_MODEL });
  }
  if (study.stage === 'b') {
    rec.studyDesign = await ensureStageBDesign(c, project, study, refused);
    notExecuted.push({ project: project.title, step: 'enrolment register', reason: 'not executed — no enrolment register has a mounted writer; enrolment is shown through the project\'s tasks' });
  }
  const doc = await ensureCsrDocument(c, project, study, template);
  rec.csrDocument = doc;
  if (headingsFor(study).length) {
    const w = await writeNarrative(c, doc, study);
    rec.narrative = { headings: headingsFor(study), written: w.written, missing: w.missing, sections: Object.fromEntries(Object.entries(w.sectionMap).map(([k, v]) => [k, v.code])) };
    if (study.comments?.length) rec.comments = await ensureComments(c, doc, study, w.sectionMap);
  }
  if (study.stage === 'e') notExecuted.push({ project: project.title, step: 'formal review request', reason: c.signer ? 'not attempted by the seed — the review route is named in the editor' : NO_SECOND_MEMBER });
  if (study.stage === 'f') rec.signature = await signerCeremony(c, c.signer, doc, study, notExecuted);
  if (['g', 'h'].includes(study.stage)) {
    rec.placement = await placeAt5351(c, project, doc, notExecuted);
    notExecuted.push({ project: project.title, step: 'eCTD compile and dispatch', reason: NO_COMPILE });
  }
  if (study.stage === 'h') {
    rec.agencyLetter = await ensureLetterOnce(c, project, study);
    rec.dataRoom = await readDataRoom(c, project);
    notExecuted.push({ project: project.title, step: 'approval of the response to the information request', reason: NOT_EXECUTED_NO_SIGNER });
  }
  const tasks = stageTasks(study).map((t) => {
    const task = { ...t, title: T(t.title) };
    return study.stage === 'e' && t.title.endsWith('Medical review of the CSR draft')
      ? { ...task, moduleType: 'Authoring', taskType: 'review', category: 'review', sourceEntityType: 'authoring_document', sourceEntityId: doc.id,
        moduleData: { authoringDocId: doc.id, programId: project.id, raisedFrom: 'demo-project' } }
      : task;
  });
  await reconcileClaims(c, project, tasks);
  await ensureTasks(c, project, tasks, study.protocolNumber);
  run.record(`project.${study.stage}.${study.key}`, rec);
  return rec;
}

export async function seed(ctx) {
  const tally = makeTally(ctx.run);
  const signer = await connectSigner({ baseUrl: ctx.baseUrl, authorEmail: ctx.identity.email }).catch((err) => {
    ctx.run.note(`Signer sign-in failed: ${err.message}`);
    return null;
  });
  const c = { ...ctx, tally, signer };
  ctx.run.note(`FICTIONAL CSR portfolio: ${COMPANIES.length} invented sponsor companies, each its own client workspace ("(fictional demo)"), ${STUDIES.length} CSR projects at stages a–h. ${SYNTHETIC}. No workspace is marked the organisation's default and no organisation setting is changed.`);
  ctx.run.note('The separate ninth example is a completed INTERNAL demonstration handover: its unapproved reference files are downloaded and hash-verified before the delivery task is completed. Fresh examples stay active for presentation; existing archived examples are validated without reopening. It is not a native CSR export or a clinical approval.');
  ctx.run.record('companies', COMPANIES);
  const template = await canonicalCsrTemplate(c);
  const workspaces = await ensureSponsorWorkspaces(c);
  const projects = await listProjects(ctx.api);
  const notExecuted = [];
  const refused = [];
  const seeded = [];
  for (const study of STUDIES) seeded.push(await seedStudy(c, study, { projects, workspaces, template, notExecuted, refused }));
  const handoverProject = await ensureProject(c, projects, INTERNAL_HANDOVER, workspaces.get(INTERNAL_HANDOVER.company));
  const handover = await ensureInternalHandover(c, handoverProject);
  ctx.run.record('internalHandover', handover);
  const h = seeded.find((r) => r.stage === 'h');
  ctx.run.record('knownProductBehaviour', [{
    ...KNOWN_PRODUCT_BEHAVIOUR,
    observedThisRun: h?.dataRoom ? { project: 'stage h (Halcyra HLY-09-101)', ...h.dataRoom } : 'not read (stage h did not run)',
  }]);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const byWorkspace = SPONSOR_WORKSPACES.map((w) => ({ key: w.key, id: workspaces.get(w.key) ?? null, name: w.name,
    projects: [...seeded.filter((r) => r.clientWorkspace.name === w.name).map((r) => ({ stage: r.stage, id: r.projectId, title: r.title })),
      ...(w.key === INTERNAL_HANDOVER.company ? [{ stage: 'internal-handover', id: handoverProject.id, title: handoverProject.title }] : [])] }));
  ctx.run.record('notExecuted', notExecuted);
  ctx.run.record('refused', refused);
  ctx.run.record('summary', {
    created: sum(tally.tally.created), found: sum(tally.tally.found), notExecuted: notExecuted.length, refused: refused.length, workspaces: byWorkspace,
    projects: seeded.map((r) => ({ stage: r.stage, id: r.projectId, title: r.title, clientWorkspaceId: r.clientWorkspace.id, csrDocumentId: r.csrDocument?.id ?? null })),
    internalHandover: { projectId: handoverProject.id, deliveryComplete: handover.deliveryComplete, projectStatus: handover.projectStatus,
      archived: handover.archived, folderId: handover.folderId, files: handover.files.length },
  });
  console.info(`  summary: created ${sum(tally.tally.created)}, found ${sum(tally.tally.found)}, not executed ${notExecuted.length}, refused ${refused.length}`);
  for (const w of byWorkspace) console.info(`  workspace ${w.id} · ${w.name}: ${w.projects.map((r) => `${r.stage} ${r.id ?? 'REFUSED'}`).join(', ')}`);
  for (const n of notExecuted) console.info(`  not executed · ${n.project} · ${n.step}: ${n.reason}`);
  for (const r of refused) console.info(`  refused · ${r.title} · ${r.step}: ${r.reason}`);
  if (refused.some((r) => r.step === 'project')) {
    throw new Error(`${refused.filter((r) => r.step === 'project').length} portfolio project(s) refused: found by title outside their sponsor's workspace and not moved (manifest: refused). The other studies were seeded.`);
  }
}

export async function purge({ run }) {
  await run.step('Purge: CSR portfolio demo', async () => {
    run.note('No destructive purge of governed projects, Vault documents, comments or tasks is authorized by this pack; archive through the existing Project Management and Vault lifecycle controls.');
    return 'no records deleted';
  });
}
