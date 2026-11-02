/**
 * Fictional FBT-201 CSR demonstration in the existing Project Management flow.
 *
 * This is DATA SEEDING ONLY. There is no separate CSR application, editor or
 * data room. The operator FIRST provisions the separate fictional organization
 * through the existing authorized account flow and signs in as its member.
 * This pack creates its Project Management CSR project, stores synthetic source
 * evidence in the existing Vault/Data Room, and leaves real review/signature
 * ceremonies to the person who performs them in the application.
 *
 * --pack faux is deliberately excluded from --pack all: never seed it into
 * another client's organization by accident.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { demoTitle, makeMultiPagePdfBuffer, must, REPO_ROOT, sha256 } from '../lib.mjs';
import { makeTally } from './biotech-shared.mjs';
import { ensureTasks } from './work-areas.mjs';

const FAUX_ORG_NAME = 'Faux Biotech Therapeutics';
const CLIENT = { name: 'Faux Biotech Therapeutics — fictional demonstration', slug: 'faux-biotech-therapeutics-demo' };
const TITLE = 'FBT-201 Phase 2 Clinical Study Report — SYNTHETIC';
const DOC_ROOT = path.join(REPO_ROOT, 'docs', 'demo', 'faux-biotech-csr');
const title = (name) => demoTitle('faux', name);
const asRows = (payload) => Array.isArray(payload) ? payload
  : Array.isArray(payload?.data) ? payload.data
  : Array.isArray(payload?.clients) ? payload.clients : [];

const tasks = [
  { title: title('FBT-201 · Verify the synthetic source catalog'), moduleType: 'Clinical',
    priority: 'high', status: 'pending', dueInDays: 5,
    description: 'Confirm the actual Data Room source IDs, versions and sha256 receipts. Synthetic data are not clinical evidence or an approved submission.' },
  { title: title('FBT-201 · Reconcile PASI75 and safety outputs'), moduleType: 'Biostatistics',
    priority: 'high', status: 'pending', dueInDays: 8,
    description: 'Reconcile fictional PASI75: 52/80 and 30/80; TEAE 42/80 and 37/80; SAE 3/80 and 2/80. Keep the source run and its data cut with every claim.' },
  { title: title('FBT-201 · Human-review the ICH E3 CSR draft'), moduleType: 'Clinical',
    priority: 'medium', status: 'pending', dueInDays: 14,
    description: 'Use the existing one editor and AnA on this project. A reviewer must assess the source-grounded draft through the actual governed review path; this task is NOT an approval or signature.' },
];

function sourceBytes() {
  const compressed = fs.readFileSync(path.join(DOC_ROOT, 'FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz'));
  const bytes = gunzipSync(compressed);
  const source = JSON.parse(bytes.toString('utf8'));
  if (source.format !== 'concept2cure.csr-source.v1' ||
      source.studyInfo?.protocolNumber !== 'FBT-201-2026' ||
      source.participants?.length !== 160 ||
      source.studyData?.adverseEvents?.length !== 79 ||
      source.studyData?.dispositionBasis !== 'end-of-treatment') {
    throw new Error('The checked-in Faux Biotech revision-2 source is not the intended synthetic CSR data. Nothing was seeded.');
  }
  for (const [arm, completed, response] of [['FBT201', 74, 65], ['PBO', 76, 37.5]]) {
    if (source.studyData.treatmentArms.find(a => a.armId === arm)?.populations?.completed !== completed ||
        source.studyData.efficacy.find(e => e.armId === arm)?.value !== response) {
      throw new Error('Faux Biotech source and current revised statistical totals differ. Nothing was seeded.');
    }
  }
  return { bytes, digest: sha256(bytes) };
}

function checkDemoOrg(identity) {
  // The organization is an existing authorized tenant, NOT a product-specific
  // workspace. Never post fictional clinical documents to a different tenant.
  const named = String(identity.organizationName ?? '').trim().toLowerCase();
  if (!named.startsWith(FAUX_ORG_NAME.toLowerCase())) {
    throw new Error('Faux Biotech seed refused: sign in as a member of the separately created Faux Biotech Therapeutics demonstration organization. Nothing was seeded.');
  }
}

async function ensureClient({ api, run, tally }) {
  let id;
  await run.step('Project Management: fictional client record', async () => {
    const j = must(await api('GET', '/api/clients'), 200, 'list client records');
    const found = asRows(j).find(c => c.slug === CLIENT.slug);
    if (found) { id = Number(found.id); tally.found('client-record'); }
    else {
      const created = must(await api('POST', '/api/clients', CLIENT), [200, 201], 'create fictional client record');
      id = Number(created.client?.id ?? created.data?.id ?? created.id);
      tally.created('client-record');
    }
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Client record did not return a valid identifier.');
    return `client ${id}`;
  });
  return id;
}

async function listProjects(api) {
  const rows = [];
  for (let offset = 0, page = 0; page < 100; page += 1) {
    const data = must(await api('GET', `/api/c2c/projects?limit=200${offset ? `&offset=${offset}` : ''}`), 200, 'list governed projects');
    if (!Array.isArray(data.data) || data.meta?.pendingStore === true || data.meta?.reconciliationRequired === true) {
      throw new Error('The existing Project Management list is unavailable or not reconciled; project creation was not attempted.');
    }
    rows.push(...data.data);
    if (data.meta?.hasMore !== true) return rows;
    if (data.data.length === 0) throw new Error('Project pagination returned no progress; refusing duplicate creation.');
    offset += data.data.length;
  }
  throw new Error('Project pagination exceeded the search limit; refusing duplicate creation.');
}

async function ensureProject({ api, run, tally }, clientWorkspaceId) {
  const name = title(TITLE);
  let result;
  await run.step('Project Management: create/reopen FBT-201 (document type CSR)', async () => {
    let row = (await listProjects(api)).find(p => (p.title ?? p.name) === name);
    if (!row) {
      const j = must(await api('POST', '/api/c2c/projects', {
        name, productName: 'FBT-201',
        programType: 'csr', submissionTypeId: 'ich_csr',
        productType: 'biologic', primaryAgency: 'ICH / Global',
        clientWorkspaceId,
        indication: 'Moderate-to-severe plaque psoriasis (fictional)',
        objective: 'Create a draft ICH E3 clinical study report for the fictional FBT-201 Phase 2 trial, trace each result to the synthetic source, and identify missing evidence before any human review.',
        objectiveSources: [], priority: 'high', teamMembers: [],
      }), 201, 'create FBT-201 CSR project');
      row = j.data;
      tally.created('project');
    } else tally.found('project');
    if (!row?.id) throw new Error('The CSR project had no recorded identifier.');
    const detail = must(await api('GET', `/api/c2c/projects/${row.id}`), 200, 'read FBT-201 project').data ?? {};
    if (detail.client_workspace_id != null && Number(detail.client_workspace_id) !== clientWorkspaceId) {
      throw new Error('An existing FBT-201 demo project belongs to another client record. Nothing was moved or overwritten.');
    }
    if (String(detail.program_type ?? detail.programType ?? '') !== 'csr') {
      throw new Error('An existing FBT-201 project is not the CSR document type. Nothing was overwritten.');
    }
    result = { id: row.id, title: name, programType: 'csr', clientWorkspaceId };
    return `project ${row.id}`;
  });
  run.record('project', result);
  return result;
}

function pdfFromMarkdown(filename, label) {
  const markdown = fs.readFileSync(path.join(DOC_ROOT, filename), 'utf8');
  const paragraphs = markdown.split(/\n\s*\n/).map(p => p.replace(/^#+\s*/gm, '').trim()).filter(Boolean);
  return makeMultiPagePdfBuffer({
    title: title(label),
    subtitle: 'SYNTHETIC — NOT CLINICAL EVIDENCE',
    footer: 'Faux Biotech Therapeutics · Fictional demonstration',
    sections: [{ heading: label, paragraphs }],
  });
}

async function ensureSource({ api, run, tally }, project, spec) {
  await run.step(`Project Data Room: ${spec.label}`, async () => {
    const name = title(spec.label);
    const content = spec.bytes();
    const digest = sha256(content);
    const search = must(await api('GET',
      `/api/c2c/project-vault/${project.id}/search?q=${encodeURIComponent(spec.label)}&limit=50`), 200, 'search existing source');
    const existing = (search.data?.results ?? []).find(doc => doc.title === name);
    if (existing) {
      if (existing.current === false || existing.contentHash !== digest) {
        throw new Error(`A source titled "${name}" exists but its current SHA-256 does not match revision 2. Reconcile it in Vault; this seed will not overwrite governed data.`);
      }
      tally.found('source-document');
      run.record(`source.${spec.key}`, { id: existing.id, title: name, sha256: digest, action: 'found-and-hash-checked' });
      return `found ${existing.id} (digest verified)`;
    }

    const form = new FormData();
    form.append('file', new Blob([content], { type: spec.mime }), spec.fileName);
    form.append('programId', project.id);
    form.append('documentCode', spec.code);
    form.append('documentTitle', name);
    form.append('documentType', 'OTHER');
    const result = must(await api('POST', '/api/vault/ingest', form), 201, `ingest ${spec.label}`);
    if (!result.document?.id || result.document?.contentHash !== digest) {
      throw new Error('The Data Room ingestion returned no document or a different content hash; the source is not qualified.');
    }
    tally.created('source-document');
    run.record(`source.${spec.key}`, { id: result.document.id, title: name, sha256: digest, action: 'uploaded', approval: 'not-assumed' });
    return `uploaded ${result.document.id} (digest verified)`;
  });
}

/** The original evidence stays in the project's Data Room; no fabricated approval. */
export async function seed(ctx) {
  checkDemoOrg(ctx.identity);
  const source = sourceBytes(); // fail before any write on a wrong revision
  const tally = makeTally(ctx.run);
  const c = { ...ctx, tally };
  ctx.run.note('The fictional client and FBT-201 project use the platform\'s existing Project Management, Data Room, Tasking and single editor. No CSR application, parallel workflow, study approval, signature or clinical trial is created.');
  ctx.run.record('sourceRevision', { revision: 2, sha256: source.digest, synthetic: true, clinicalVerification: 'not-established' });

  const clientWorkspaceId = await ensureClient(c);
  const project = await ensureProject(c, clientWorkspaceId);
  await ensureSource(c, project, {
    key: 'csr-source-v2', label: 'FBT-201 clinical source JSON · synthetic v2',
    fileName: 'fbt201-csr-source-synthetic-v2.json', mime: 'application/json',
    code: 'FBT-201-CSR-SOURCE-v2.json', bytes: () => source.bytes,
  });
  for (const [key, filename, label] of [
    ['protocol', 'PROTOCOL_FBT-201-2026_v2.md', 'FBT-201 study protocol · synthetic v2'],
    ['sap', 'SAP_FBT-201-2026_v1.md', 'FBT-201 statistical analysis plan · synthetic v1'],
  ]) {
    await ensureSource(c, project, {
      key, label, fileName: `fbt201-${key}-synthetic.pdf`, mime: 'application/pdf',
      code: `FBT-201-${key.toUpperCase()}-SYNTHETIC.pdf`,
      bytes: () => pdfFromMarkdown(filename, label),
    });
  }
  await ensureTasks(c, project, tasks, 'FBT-201');
  const sum = counts => Object.values(counts).reduce((a, b) => a + b, 0);
  ctx.run.record('summary', { created: sum(tally.tally.created), found: sum(tally.tally.found) });
  ctx.run.note('CSR source is uploaded, not reviewed or approved. Authorized source selection/preview/freeze, real AnA drafting, editor save/reopen and reviewer actions must be completed in the existing UI.');
}

export async function purge({ run }) {
  await run.step('Purge: Faux Biotech synthetic demo', async () => {
    run.note('No destructive purge of the governed project, sources or task records is authorized by this pack; archive through existing Project Management/Vault lifecycle controls.');
    return 'no records deleted';
  });
}
