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
 * WHERE THE COMPANIES LIVE. No client workspace is created. Each fictional
 * company is the NAMED SPONSOR of its projects (project title and objective,
 * the protocol PDF, the study-data source's `sponsor`, and the CSR synopsis),
 * inside the organisation's own client workspace: the one whose name is the
 * organisation's name. Every project passes that clientWorkspaceId explicitly,
 * so this pack neither depends on nor changes how a workspace is chosen for
 * any other pack (AMBIGUOUS_CLIENT_WORKSPACE), and no organisation setting is
 * touched.
 *
 * WHAT IS CREATED, through the product's own HTTP API as the signed-in user,
 * idempotently by exact "[Demo · Portfolio] …" title: for each study a project
 * through the canonical intake; its protocol (and SAP) PDF in the project's
 * Vault; from database lock on, a synthetic `concept2cure.csr-source.v1` study
 * source in the data room, read back through the source preview; a CSR working
 * document in the ONE editor from the canonical CSR template
 * (component:clinical_study_report), with ICH E3 narrative headings written as
 * saved revisions; reviewer comments; tasks; and the stage's own records.
 *
 * NOT EXECUTED, recorded in the manifest with the reason, never faked: the
 * Vault approval and freeze of a study source (two further people), the build
 * from the study's data and AnA drafting (no model provider here), a formal
 * review request (needs a second member; the author cannot review), the
 * freeze and e-signature (signer credential), and the eCTD compile and any
 * agency outcome. Synthetic numbers are not clinical evidence.
 *
 * DEMO STORYLINE (Projects → the project → its documents / Vault / Tasks):
 *  - Corvane Oncology (oncology mAb CRV-310).
 *    a) "CRV-310-301 Phase 3 CSR (planning)": protocol and SAP in the Vault, an
 *       empty CSR shell with every ICH E3 heading; tasks for the TLF shells.
 *    e) "CRV-310-201 Phase 2 CSR (in review)": open the CSR — every narrative
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
 * KNOWN PRODUCT BEHAVIOUR (reported as a defect, not hidden by this pack):
 * uploading stage h's letter to the project's data room triggers the product's
 * quality-evidence capture (server/services/qms/project-evidence.ts), which on
 * the local database attached 21 quality records from OTHER demo packs (Lumen
 * GMP deviations, audits, management reviews and suppliers, a C2C-101 and an
 * MDX NP-100 change control) to the Halcyra project's Records > Data Room
 * sources. The pack changes nothing to mask it; before a client demo, do not
 * open stage h's Records until the product owner has ruled on the capture. It
 * is also recorded in the manifest (knownProductBehaviour).
 *
 * LOCAL LEFTOVERS (this pack corrects what it can through the API): narrative
 * text it wrote earlier that no longer matches the pack (it starts with the
 * SYNTHETIC tag) is corrected once as a saved revision; an earlier task that
 * called the stage-h CSR "filed" is archived and replaced. Not correctable
 * here: project h's objective, written at creation, still names the old stage
 * label ("Post-filing scenario"), and the stored stage-h letter keeps its old
 * line "submitted in Module 5.3.5.1" (the inbox entry is found by type and is
 * not re-uploaded, to avoid re-triggering the capture above). A fresh database
 * gets the corrected wording for both.
 */
import { connectSigner, demoTitle, makeMultiPagePdfBuffer, must, sha256 } from '../lib.mjs';
import { asArray, makeTally, NOT_EXECUTED_NO_SIGNER } from './biotech-shared.mjs';
import { ensureAgencyLetter, ensureStudyDesign, ensureTasks } from './work-areas.mjs';
import {
  ALL_HEADINGS, COMPANIES, HALCYRA_IR_LETTER, HEADING_PATTERNS, STAGES, STUDIES, SYNTHETIC,
  buildCsrSource, companyOf, narrative, protocolSections, sapSections, stageTasks, studyDesignFor,
} from './portfolio-content.mjs';

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
  return out;
}

export function objectiveFor(study) {
  const c = companyOf(study);
  return [
    `FICTIONAL demonstration project (${SYNTHETIC}). Sponsor: ${c.name}.`,
    `Goal: author, review, sign and file the ICH E3 Clinical Study Report for study ${study.protocolNumber} (Phase ${study.phase}): ${study.title}.`,
    `Design: ${study.design}. Primary endpoint: ${study.primaryEndpoint}.`,
    `CSR lifecycle stage shown: ${STAGES[study.stage]}.`,
  ].join(' ');
}

/* ───────── API steps ───────── */

async function organisationWorkspace({ api, run, identity }) {
  return run.step('Client workspace: the organisation\'s own (no workspace created)', async () => {
    const j = must(await api('GET', '/api/clients?purpose=project-intake'), 200, 'list client workspaces');
    const rows = (Array.isArray(j.clients) ? j.clients : []).filter((c) =>
      c.name === identity.organizationName && String(c.status ?? 'active').toLowerCase() === 'active');
    if (rows.length !== 1) throw new Error(`expected exactly one active client workspace named "${identity.organizationName}", found ${rows.length}. Nothing was written.`);
    const id = Number(rows[0].id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('the organisation workspace has no valid id. Nothing was written.');
    run.record('clientWorkspace', { id, name: rows[0].name, created: false });
    return id;
  });
}

async function listProjects(api) {
  const rows = [];
  for (let offset = 0, page = 0; page < 100; page += 1) {
    const data = must(await api('GET', `/api/c2c/projects?limit=200${offset ? `&offset=${offset}` : ''}`), 200, 'list projects');
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
  return run.step(`Project (${study.stage}) ${projectTitle(study)}`, async () => {
    const same = projects.filter((p) => (p.title ?? p.name) === name);
    if (same.length > 1) throw new Error(`more than one project is titled "${name}"; reconcile before seeding`);
    let id = same[0]?.id ?? null;
    let submissionId = null;
    if (!id) {
      const ind = study.programType === 'ind';
      const j = must(await api('POST', '/api/c2c/projects', {
        name, productName: study.productName,
        programType: ind ? 'ind' : 'csr', submissionTypeId: ind ? 'us_ind' : 'ich_csr',
        productType: study.productType, primaryAgency: 'FDA',
        clientWorkspaceId: workspaceId,
        indication: study.indication,
        objective: objectiveFor(study), objectiveSources: [],
        priority: ['e', 'f', 'h'].includes(study.stage) ? 'high' : 'medium', teamMembers: [],
      }), 201, `create project ${study.protocolNumber}`);
      id = j.data?.id;
      submissionId = j.meta?.submissionId ?? null;
      tally.created('project');
    } else tally.found('project');
    if (!id) throw new Error('project creation returned no id');
    const detail = must(await api('GET', `/api/c2c/projects/${id}`), 200, `read project ${id}`);
    if (Number(detail.client_workspace_id) !== workspaceId) throw new Error(`project ${id} is not in client workspace ${workspaceId}; nothing was attached`);
    if (detail.program_type !== study.programType) throw new Error(`project ${id} is not a ${study.programType} project; nothing was attached`);
    return { id, title: name, programType: study.programType, productName: study.productName, submissionId };
  });
}

async function vaultCandidates(api, programId, query, exactTitle) {
  const matches = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const r = must(await api('GET', `/api/c2c/project-vault/${programId}/search?q=${encodeURIComponent(query)}&limit=50${offset ? `&offset=${offset}` : ''}`), 200, 'search the project Vault');
    const d = r.data;
    if (!Array.isArray(d?.results) || !Number.isSafeInteger(d.total)) throw new Error('the project Vault search was incomplete; no upload was attempted');
    matches.push(...d.results.filter((e) => e.title === exactTitle));
    offset += d.results.length;
    if (offset >= d.total || d.results.length === 0) return matches;
  }
  throw new Error('project Vault search exceeded 100 pages');
}

async function ensureVaultFile({ api, run, tally }, project, spec) {
  return run.step(`Vault: ${spec.label}`, async () => {
    const name = T(spec.label);
    const bytes = spec.bytes();
    const digest = sha256(bytes);
    const found = await vaultCandidates(api, project.id, spec.label, name);
    if (found.length > 1) throw new Error(`the Vault holds ${found.length} current documents titled "${name}"; reconcile before seeding`);
    if (found[0]) {
      tally.found('vault-document');
      return { id: found[0].id, sha256: found[0].contentHash, sameBytes: found[0].contentHash === digest, action: 'found' };
    }
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: spec.mime }), spec.fileName);
    form.append('programId', project.id);
    form.append('documentCode', spec.code);
    form.append('documentTitle', name);
    form.append('documentType', spec.documentType);
    const res = must(await api('POST', '/api/vault/ingest', form), 201, `ingest ${spec.label}`);
    if (!res.document?.id || res.document.contentHash !== digest) throw new Error('the Vault returned no document or another content hash');
    tally.created('vault-document');
    return { id: res.document.id, sha256: digest, sameBytes: true, action: 'uploaded', approval: 'not assumed' };
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
        const list = asArray(must(await api('GET', '/api/submissions'), 200, 'list submissions'), 'data');
        subId = list.find((s) => s.title === project.title)?.id ?? null;
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

async function seedStudy(c, study, { projects, workspaceId, template, notExecuted }) {
  const { run } = c;
  const rec = { stage: study.stage, stageLabel: STAGES[study.stage], company: companyOf(study).name, protocolNumber: study.protocolNumber };
  const project = await ensureProject(c, projects, study, workspaceId);
  Object.assign(rec, { projectId: project.id, title: project.title, programType: project.programType });
  rec.protocol = await ensureVaultFile(c, project, {
    label: `${study.protocolNumber} protocol · synthetic`, fileName: `${study.protocolNumber.toLowerCase()}-protocol-synthetic.pdf`,
    mime: 'application/pdf', code: `${study.protocolNumber}-PROTOCOL-SYNTHETIC.pdf`, documentType: 'PROTOCOL',
    bytes: pdf(study, `${study.protocolNumber} protocol (fictional)`, protocolSections(study)),
  });
  if (['a', 'c'].includes(study.stage)) {
    rec.sap = await ensureVaultFile(c, project, {
      label: `${study.protocolNumber} statistical analysis plan · synthetic`, fileName: `${study.protocolNumber.toLowerCase()}-sap-synthetic.pdf`,
      mime: 'application/pdf', code: `${study.protocolNumber}-SAP-SYNTHETIC.pdf`, documentType: 'SAP',
      bytes: pdf(study, `${study.protocolNumber} statistical analysis plan (fictional)`, sapSections(study)),
    });
  }
  if (needsSource(study)) {
    rec.source = await ensureVaultFile(c, project, {
      label: sourceLabel(study), fileName: `${study.protocolNumber.toLowerCase()}-csr-source-synthetic-${sourceVersion(study)}.json`,
      mime: 'application/json', code: `${study.protocolNumber}-CSR-SOURCE-${sourceVersion(study)}.json`, documentType: 'OTHER',
      bytes: () => sourceBytes(study),
    });
    rec.sourcePreview = await previewSource(c, project, rec.source);
    notExecuted.push({ project: project.title, step: 'study-source approval and freeze', reason: NO_SOURCE_APPROVAL });
    notExecuted.push({ project: project.title, step: 'build from the study\'s data / AnA drafting', reason: NO_MODEL });
  }
  if (study.stage === 'b') {
    await ensureStudyDesign(c, project, null, studyDesignFor(study, T(`${study.protocolNumber} — Phase 3 study design (fictional)`)));
    rec.studyDesign = T(`${study.protocolNumber} — Phase 3 study design (fictional)`);
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
  ctx.run.note(`FICTIONAL CSR portfolio: ${COMPANIES.length} invented sponsor companies, ${STUDIES.length} CSR projects at stages a–h. ${SYNTHETIC}. The companies are named sponsors inside the organisation's own client workspace; no client workspace or organisation setting is created or changed.`);
  ctx.run.record('companies', COMPANIES);
  ctx.run.record('knownProductBehaviour', [
    {
      where: 'stage h project (Halcyra HLY-09-101), Records > Data Room sources',
      what: 'Uploading the fictional letter to the data room triggered the product\'s quality-evidence capture (server/services/qms/project-evidence.ts); on the local database it attached 21 quality records from other demo packs (Lumen deviations, audits, reviews, suppliers; a C2C-101 and an MDX NP-100 change control) to the project.',
      action: 'Reported to the product owner as a defect. Not hidden by the pack. Do not open stage h\'s Records in a client demo until it is ruled on.',
    },
    {
      where: 'stage h, local database only',
      what: 'Project h\'s objective still names the old stage label ("Post-filing scenario"), and the stored letter keeps the line "submitted in Module 5.3.5.1". No project-objective update route was used and the letter is not re-uploaded; a fresh database gets the corrected wording.',
      action: 'Known leftover; the CSR is not filed and the task and stage label say so.',
    },
  ]);
  const template = await canonicalCsrTemplate(c);
  const workspaceId = await organisationWorkspace(c);
  const projects = await listProjects(ctx.api);
  const notExecuted = [];
  const seeded = [];
  for (const study of STUDIES) seeded.push(await seedStudy(c, study, { projects, workspaceId, template, notExecuted }));
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  ctx.run.record('notExecuted', notExecuted);
  ctx.run.record('summary', {
    created: sum(tally.tally.created), found: sum(tally.tally.found), notExecuted: notExecuted.length,
    projects: seeded.map((r) => ({ stage: r.stage, id: r.projectId, title: r.title, csrDocumentId: r.csrDocument?.id ?? null })),
  });
  console.info(`  summary: created ${sum(tally.tally.created)}, found ${sum(tally.tally.found)}, not executed ${notExecuted.length}`);
  for (const n of notExecuted) console.info(`  not executed · ${n.project} · ${n.step}: ${n.reason}`);
}

export async function purge({ run }) {
  await run.step('Purge: CSR portfolio demo', async () => {
    run.note('No destructive purge of governed projects, Vault documents, comments or tasks is authorized by this pack; archive through the existing Project Management and Vault lifecycle controls.');
    return 'no records deleted';
  });
}
