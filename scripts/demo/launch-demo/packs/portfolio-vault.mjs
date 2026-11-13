/** Project-linked folders and verified files for the existing portfolio seed.
 * Uses the same governed folder, filing, ingest and download APIs as the Vault.
 * A changed file or an unexpected confirmed filing belongs to its editor: stop.
 */
import { demoTitle, must, sha256 } from '../lib.mjs';

const T = (label) => demoTitle('portfolio', label);
const vaultPath = (project) => `/api/c2c/project-vault/${project.id}`;

async function folderTree(api, project) {
  const j = must(await api('GET', vaultPath(project)), 200, 'read project folders');
  const d = j.data ?? j;
  if (d.pendingStore === true || !Array.isArray(d.tree) || d.uploadsWindow?.truncated === true) {
    throw new Error('The project Vault is pending or incomplete; no folders were changed.');
  }
  const all = [];
  const walk = (nodes, parent = null) => {
    for (const node of nodes) {
      if (!Array.isArray(node.children)) continue;
      if (node.kind === 'person') all.push({ id: node.id.replace(/^cab-/, ''), name: node.label, parent });
      walk(node.children, node.id === 'cabinet' ? null : node.id.replace(/^cab-/, ''));
    }
  };
  walk(d.tree);
  return all;
}

async function ensureFolder({ api, tally }, project, rows, name, parentFolderId) {
  const named = rows.filter((r) => r.name === name);
  if (named.length > 1) throw new Error(`Ambiguous project folder "${name}"; reconcile before seeding.`);
  if (named.length) {
    if (named[0].parent !== parentFolderId) throw new Error(`Folder "${name}" is under another parent; it was not moved or adopted.`);
    tally.found('vault-folder');
    return named[0].id;
  }
  if (project.readOnly) throw new Error(`Archived project is missing folder "${name}"; it was not reopened or changed.`);
  const j = must(await api('POST', `${vaultPath(project)}/folders`, {
    name, parentFolderId,
    reason: 'Demo seed: organize synthetic internal reference files in this project only.',
  }), 200, `make project folder ${name}`);
  if (!/^uf:\d+$/.test(j.folder?.folderId ?? '') || j.folder.name !== name || (j.folder.parentFolderId ?? null) !== parentFolderId) {
    throw new Error(`The Vault did not confirm the expected project folder "${name}".`);
  }
  rows.push({ id: j.folder.folderId, name, parent: parentFolderId });
  tally.created('vault-folder');
  return j.folder.folderId;
}

/** Only populated children are made. The parent is a visible project folder. */
export async function ensurePortfolioFolders(ctx, project, { hasSource = false, handover = false } = {}) {
  return ctx.run.step('Vault: named synthetic project folders', async () => {
    const rows = await folderTree(ctx.api, project);
    const parent = await ensureFolder(ctx, project, rows, T('Synthetic study records'), null);
    if (handover) {
      const delivery = await ensureFolder(ctx, project, rows, 'Completed internal handover · SYNTHETIC', parent);
      return { parent, delivery };
    }
    const documents = await ensureFolder(ctx, project, rows, 'Protocol and analysis · SYNTHETIC', parent);
    const data = hasSource ? await ensureFolder(ctx, project, rows, 'Study data · SYNTHETIC', parent) : undefined;
    return { parent, documents, ...(data ? { data } : {}) };
  });
}

async function candidates(api, project, label, title) {
  const matches = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const j = must(await api('GET', `${vaultPath(project)}/search?q=${encodeURIComponent(label)}&limit=50${offset ? `&offset=${offset}` : ''}`), 200, 'search project files');
    const d = j.data;
    if (!Array.isArray(d?.results) || !Number.isSafeInteger(d.total)) throw new Error('The project Vault search is incomplete; no file was uploaded.');
    matches.push(...d.results.filter((r) => r.title === title));
    offset += d.results.length;
    if (offset >= d.total) return matches;
    if (!d.results.length) throw new Error('The project Vault search made no pagination progress.');
  }
  throw new Error('The project Vault search exceeded 100 pages.');
}

function verifyMetadata(row, expectedHash, project) {
  if (!row.id || row.contentHash !== expectedHash) throw new Error('Existing project file hash differs from the synthetic reference; edited bytes were preserved.');
  const programId = row.programId ?? row.program_id;
  if (programId != null && String(programId) !== String(project.id)) throw new Error('The file belongs to another project; nothing was attached or changed.');
}

/** Existing proposed/unfiled placement can be confirmed; another confirmed filing is never overwritten. */
async function ensurePlacement({ api, tally }, project, row, folderId, expectedHash) {
  if (row.folderId === folderId && row.placementStatus === 'confirmed') return row;
  if (row.placementStatus === 'confirmed') throw new Error('Existing file has an unexpected confirmed folder placement; it was not moved.');
  if (project.readOnly) throw new Error('Archived project file has missing or unconfirmed filing; it was not changed.');
  const j = must(await api('POST', `${vaultPath(project)}/file`, {
    documentId: row.id, folderId, confirm: true,
    note: 'Demo seed: confirm this unchanged synthetic reference file in its named project folder.',
  }), 200, 'confirm project file placement');
  if (j.success !== true || j.filing?.folderId !== folderId || j.filing?.placementStatus !== 'confirmed') {
    throw new Error('The Vault did not confirm the requested file placement.');
  }
  tally.created('vault-filing');
  const found = await candidates(api, project, row.title, row.title);
  if (found.length !== 1 || found[0].id !== row.id) throw new Error('Filed project document could not be read back unambiguously.');
  verifyMetadata(found[0], expectedHash, project);
  if (found[0].folderId !== folderId || found[0].placementStatus !== 'confirmed') throw new Error('The requested project folder membership was not recorded.');
  return found[0];
}

/** Verify actual stored bytes on both a fresh upload and every repeat run. */
export async function ensurePortfolioVaultFile(ctx, project, spec) {
  const { api, tally, run } = ctx;
  return run.step(`Vault: ${spec.label}`, async () => {
    if (!spec.folderId) throw new Error('A portfolio file must name its project folder.');
    const bytes = Buffer.from(await spec.bytes());
    const digest = sha256(bytes);
    const title = T(spec.label);
    const found = await candidates(api, project, spec.label, title);
    if (found.length > 1) throw new Error(`Ambiguous project file "${title}"; reconcile before seeding.`);
    let row = found[0];
    let action = 'found';
    if (row) {
      verifyMetadata(row, digest, project);
      tally.found('vault-document');
    } else {
      if (project.readOnly) throw new Error(`Archived project is missing file "${title}"; it was not changed.`);
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: spec.mime }), spec.fileName);
      form.append('programId', project.id);
      form.append('folderId', spec.folderId);
      form.append('documentCode', spec.code);
      form.append('documentTitle', title);
      form.append('documentType', spec.documentType);
      const j = must(await api('POST', '/api/vault/ingest', form), [200, 201], `ingest ${spec.label}`);
      if (!j.document?.id || j.document.contentHash !== digest) throw new Error('The Vault returned no document or a different content hash.');
      const persisted = await candidates(api, project, spec.label, title);
      if (persisted.length !== 1 || persisted[0].id !== j.document.id) throw new Error('Uploaded project file could not be read back unambiguously.');
      row = persisted[0];
      verifyMetadata(row, digest, project);
      tally.created('vault-document');
      action = 'uploaded';
    }
    row = await ensurePlacement(ctx, project, row, spec.folderId, digest);
    const downloaded = await api('GET', `${vaultPath(project)}/documents/${encodeURIComponent(row.id)}/download`, undefined, { binary: true });
    must(downloaded, 200, 'download the project reference file');
    if (!Buffer.isBuffer(downloaded.bytes) || sha256(downloaded.bytes) !== digest) throw new Error('Downloaded project file bytes do not match the expected SHA-256.');
    return { id: row.id, title, folderId: spec.folderId, sha256: digest, byteLength: bytes.length,
      sameBytes: true, downloadVerified: true, action, approval: 'unapproved synthetic reference' };
  });
}
