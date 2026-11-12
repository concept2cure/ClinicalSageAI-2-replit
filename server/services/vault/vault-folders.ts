/**
 * A project's Vault folders: the filing binder its filing type selects, the
 * view's other preset folders, and the folders people make (S6, the founder,
 * 2026-11-06: "a Vault user interface, files, folders … just like Veeva").
 *
 * ── What already existed, and what this reaches ─────────────────────────────
 *  - The cabinet (`filingCabinet`, server/routes/c2c/project-vault.ts) drew one
 *    fixed preset per view (shared/constants/domain/vault-taxonomy.ts): an IND,
 *    an NDA and an MAA got the same five module folders, and nothing went below
 *    module level.
 *  - The binder each filing needs was already in the database: the active rule
 *    pack of the project's document class (c2c_rule_packs, resolved by the one
 *    mapping the scaffolder uses, services/c2c/document-class.ts and
 *    rule-pack-lookup.ts). A US IND's pack carries FDA Module 1 and CTD to
 *    section, an MAA's the EU Module 1, a J-NDA's the Japanese one, a 510(k)'s
 *    the eSTAR sections, an EU MDR or IVDR technical file Annex II. So the binder
 *    is that pack's outline, read here; no regulatory structure is written here.
 *  - Folders a person makes: public.document_folders (organization_id, name,
 *    parent_id, path, created_by_id), reached until now only by a legacy
 *    /api/folders route with no client caller and no project. It gains a project
 *    (program_id) and a template parent (parent_key) in
 *    migrations/20261106_document_folders_project_scope.sql.
 *
 * ── Folder ids, as vault.documents.folder_id stores them ────────────────────
 *  - a preset id ('module-3', 'corresp', 'k510', …), as before;
 *  - `bn:<pack key>` for a binder folder ('bn:3.2.S.4', 'bn:M1', 'bn:A');
 *  - `uf:<document_folders.id>` for a folder a person made.
 * A row filed to a module preset (the ingest classifier's proposal, every filing
 * made before the binder) is shown in the binder at its CTD section, or at the
 * module when the binder holds no deeper heading for it. Nothing is rewritten.
 *
 * @module server/services/vault/vault-folders
 */

import type { VaultViewId } from '../../../shared/constants/domain/vault-taxonomy.js';
import { foldersForView } from '../../../shared/constants/domain/vault-taxonomy.js';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code.js';
import { validateSectionCode } from '../../../shared/regulatory/placement-vocabulary.js';
import { resolveDocumentClass, documentAgencyCandidates, describeUnmappedClass } from '../c2c/document-class.js';
import { findActiveRulePack } from '../c2c/rule-pack-lookup.js';
import { cabinetFolderOf } from './vault-filing.service.js';
import { requireGovernedReason } from '../../routes/governed-reason.js';

/** The query surface node-postgres clients, pools and PGlite all satisfy. */
export interface FolderQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export const PERSON_FOLDER_ID = /^uf:([1-9][0-9]{0,9})$/;
export const BINDER_FOLDER_ID = /^bn:(.{1,64})$/;
/** A folder name: what a person types, held to a length a tree can show. */
export const FOLDER_NAME_MAX = 120;

export const personFolderId = (id: number): string => `uf:${id}`;
export const binderFolderId = (key: string): string => `bn:${key}`;

// ─── The binder ───────────────────────────────────────────────────────────────

export interface BinderNode {
  key: string;
  label: string;
  parentKey: string | null;
  order: number;
  mandatory: boolean;
}

export interface ProgramBinder {
  docType: string;
  agency: string;
  version: string;
  /** The pack's own label ("IND × FDA · …"): what the binder is named after. */
  label: string;
  nodes: BinderNode[];
}

/** The binder, or why the project has none, said plainly. */
export type BinderRead = { binder: ProgramBinder; reason?: undefined } | { binder: null; reason: string };

interface PackSection {
  key?: unknown;
  label?: unknown;
  parent_key?: unknown;
  path_order?: unknown;
  mandatory?: unknown;
}

/** The pack's sections as binder nodes, in the pack's order. A section with no key is not a folder. */
export function binderNodes(requiredSections: unknown): BinderNode[] {
  if (!Array.isArray(requiredSections)) return [];
  const nodes = (requiredSections as PackSection[])
    .map((s, i) => ({
      key: typeof s.key === 'string' ? s.key.trim() : '',
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : String(s.key ?? ''),
      parentKey: typeof s.parent_key === 'string' && s.parent_key.trim() ? s.parent_key.trim() : null,
      order: typeof s.path_order === 'number' ? s.path_order : i,
      mandatory: s.mandatory === true,
    }))
    .filter((n) => n.key && n.key.length <= 64);
  const keys = new Set(nodes.map((n) => n.key));
  // A parent the pack does not hold makes the section a root, never an orphan dropped from the tree.
  return nodes
    .map((n) => (n.parentKey && !keys.has(n.parentKey) ? { ...n, parentKey: null } : n))
    .sort((a, b) => a.order - b.order);
}

/**
 * The binder the project's filing type and region select: the active rule pack
 * of its document class, through the scaffolder's own resolution (the same
 * agency candidates, never another region's pack).
 */
export async function readProgramBinder(
  q: FolderQueryable,
  programType: string | null,
  primaryAgency: string | null,
): Promise<BinderRead> {
  const klass = resolveDocumentClass(programType, primaryAgency);
  if (!klass) {
    return { binder: null, reason: `${describeUnmappedClass(programType, primaryAgency)} Its folders stop at the module level.` };
  }
  for (const agency of documentAgencyCandidates(klass.docType, klass.agency)) {
    const pack = await findActiveRulePack(q, klass.docType, agency);
    if (!pack) continue;
    const nodes = binderNodes(pack.required_sections);
    if (!nodes.length) continue;
    return { binder: { docType: klass.docType, agency, version: pack.version, label: pack.label, nodes } };
  }
  return {
    binder: null,
    reason:
      `No binder template exists yet for this filing (${programType ?? 'no filing type'}, ${primaryAgency ?? 'no agency'}): ` +
      'no outline is defined for it, so its folders stop at the module level.',
  };
}

/** The pack's module roots ('M1'…'M5') stand in for the view's module presets ('module-1'…). */
const MODULE_ROOT = /^M([1-5])$/;
const presetForRoot = (key: string): string | null => {
  const m = MODULE_ROOT.exec(key);
  return m ? `module-${m[1]}` : null;
};

// ─── Folders a person made ────────────────────────────────────────────────────

export interface PersonFolder {
  id: number;
  folderId: string;
  name: string;
  /** Another person's folder it sits in, or null. */
  parentId: number | null;
  /** The binder or preset folder it sits in (a folder id), or null for the cabinet's top level. */
  parentKey: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The folders people made in this project, oldest first. Program and organization are both bound. */
export async function listPersonFolders(q: FolderQueryable, programId: string, orgId: number): Promise<PersonFolder[]> {
  const { rows } = await q.query(
    `SELECT f.id, f.name, f.parent_id, f.parent_key, f.created_at, f.updated_at,
            COALESCE(u.name, u.email) AS created_by
       FROM public.document_folders f
       LEFT JOIN LATERAL public.actor_name(f.created_by_id) u ON TRUE
      WHERE f.program_id = $1::uuid AND f.organization_id = $2
      ORDER BY f.created_at, f.id`,
    [programId, orgId],
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    folderId: personFolderId(Number(r.id)),
    name: String(r.name),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    parentKey: typeof r.parent_key === 'string' ? r.parent_key : null,
    createdBy: typeof r.created_by === 'string' ? r.created_by : null,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  }));
}

// ─── The index ────────────────────────────────────────────────────────────────

export interface ProgramFolderIndex {
  view: VaultViewId;
  binder: ProgramBinder | null;
  /** Why there is no binder, when there is none. */
  binderMissing: string | null;
  person: PersonFolder[];
  /** The view's presets the binder does not replace, in the view's order. */
  presets: Array<{ id: string; label: string }>;
  /** Whether a document may be filed to `folderId` in this project. */
  has(folderId: string): boolean;
  /** The folder's name as the tree shows it ('' for no folder this project has). */
  label(folderId: string | null): string;
  /** The folder the tree shows a row in, or null when the row is unfiled. */
  treeFolderOf(row: { folder_id?: unknown; placement_status?: unknown; ctd_section?: unknown }): string | null;
  /** The CTD section a filing to `folderId` records, when the folder is a CTD-numbered binder heading. */
  ctdSectionOf(folderId: string): string | null;
}

export function buildFolderIndex(view: VaultViewId, read: BinderRead, person: PersonFolder[]): ProgramFolderIndex {
  const binder = read.binder;
  const nodes = new Map((binder?.nodes ?? []).map((n) => [n.key, n] as const));
  /* Each binder heading's module root, so a module preset's row finds its heading only inside its module. */
  const rootOf = (key: string): string => {
    let k = key;
    for (let guard = 0; guard < 64; guard += 1) {
      const p = nodes.get(k)?.parentKey;
      if (!p) return k;
      k = p;
    }
    return k;
  };
  const replaced = new Map<string, string>();
  for (const n of binder?.nodes ?? []) {
    if (n.parentKey) continue;
    const preset = presetForRoot(n.key);
    if (preset) replaced.set(preset, n.key);
  }
  const presets = foldersForView(view)
    .filter((f) => !replaced.has(f.id))
    .map((f) => ({ id: f.id, label: f.label }));
  const presetLabel = new Map(foldersForView(view).map((f) => [f.id, f.label] as const));
  const personById = new Map(person.map((f) => [f.folderId, f] as const));

  const has = (folderId: string): boolean => {
    if (presetLabel.has(folderId)) return true;
    const bn = BINDER_FOLDER_ID.exec(folderId);
    if (bn) return nodes.has(bn[1]);
    return personById.has(folderId);
  };
  const label = (folderId: string | null): string => {
    if (!folderId) return '';
    const bn = BINDER_FOLDER_ID.exec(folderId);
    if (bn) {
      const n = nodes.get(bn[1]);
      return n ? (MODULE_ROOT.test(n.key) ? n.label : `${n.key} ${n.label}`) : '';
    }
    const pf = personById.get(folderId);
    if (pf) return pf.name;
    return presetLabel.get(folderId) ?? '';
  };
  const ctdSectionOf = (folderId: string): string | null => {
    const bn = BINDER_FOLDER_ID.exec(folderId);
    if (!bn || !nodes.has(bn[1]) || MODULE_ROOT.test(bn[1])) return null;
    return validateSectionCode(bn[1], 'ctd').ok ? bn[1] : null;
  };
  const treeFolderOf: ProgramFolderIndex['treeFolderOf'] = (row) => {
    const folder = cabinetFolderOf(row);
    if (!folder) return null;
    const root = replaced.get(folder);
    if (!root) return folder;
    // A module preset's row sits at its CTD heading in the binder, or at the module.
    const code = normalizeCtdCode(typeof row.ctd_section === 'string' ? row.ctd_section : null);
    for (let c = code; c; c = c.includes('.') ? c.slice(0, c.lastIndexOf('.')) : null) {
      if (nodes.has(c) && rootOf(c) === root) return binderFolderId(c);
    }
    return binderFolderId(root);
  };
  return { view, binder, binderMissing: read.reason ?? null, person, presets, has, label, treeFolderOf, ctdSectionOf };
}

/** The project's folder index, read on the caller's client (a transaction's, when it writes). */
export async function readProgramFolderIndex(
  q: FolderQueryable,
  programId: string,
  orgId: number,
  view: VaultViewId,
  program?: { program_type?: unknown; primary_agency?: unknown },
): Promise<ProgramFolderIndex> {
  let row = program;
  if (!row) {
    const r = await q.query(
      `SELECT program_type, primary_agency FROM regulatory_programs
        WHERE id = $1::uuid AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [programId, orgId],
    );
    row = (r.rows[0] as typeof program) ?? {};
  }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  /* Asked first, rather than caught: on a caller's transaction a failed read
     aborts everything after it. A store this environment has not provisioned
     gives no binder (said so) and no person's folders. */
  const stores = (await q.query(
    `SELECT to_regclass('public.c2c_rule_packs') IS NOT NULL AS packs,
            EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'document_folders'
                       AND column_name = 'parent_key') AS folders`,
  )).rows[0] as { packs?: boolean; folders?: boolean } | undefined;
  const binder: BinderRead = stores?.packs
    ? await readProgramBinder(q, text(row.program_type), text(row.primary_agency))
    : { binder: null, reason: 'The filing outlines (rule packs) are not provisioned in this environment, so the folders stop at the module level.' };
  const person = stores?.folders ? await listPersonFolders(q, programId, orgId) : [];
  return buildFolderIndex(view, binder, person);
}

// ─── Making and renaming a folder ─────────────────────────────────────────────

export type FolderWriteResult =
  | { ok: true; folder: { folderId: string; name: string; parentFolderId: string | null; label: string } }
  | { ok: false; status: number; code: string; message: string };

interface FolderWriteBase {
  programId: string;
  organizationId: number;
  /** The person who acts, or on whose behalf an agent acts. */
  userId: number | null;
  /** Why: recorded verbatim in the audit row. */
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  /** An agent's provenance (actorKind, tool, model, thread, turn), written into the audit row. */
  agent?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refuse = (status: number, code: string, message: string): FolderWriteResult => ({ ok: false, status, code, message });

/** A folder name a person typed, or the refusal that says what is wrong with it. */
export function folderNameRefusal(raw: unknown): { name: string } | { refusal: FolderWriteResult } {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) return { refusal: refuse(400, 'FOLDER_NAME_REQUIRED', 'Name the folder. Nothing was saved.') };
  if (name.length > FOLDER_NAME_MAX) {
    return { refusal: refuse(400, 'FOLDER_NAME_TOO_LONG', `A folder name is at most ${FOLDER_NAME_MAX} characters. Nothing was saved.`) };
  }
  if (/[\\/]/.test(name)) {
    return { refusal: refuse(400, 'FOLDER_NAME_INVALID', 'A folder name cannot contain / or \\. Nothing was saved.') };
  }
  return { name };
}

/**
 * The reason for a folder change, held to the governed floor here (21 CFR 11.10(e)). The Vault's form applied the
 * floor and this service only refused an empty string, so a direct call could record "x" as a reason for change.
 */
export function folderReasonRefusal(raw: unknown): { reason: string } | { refusal: FolderWriteResult } {
  const verdict = requireGovernedReason(raw);
  return verdict.ok ? { reason: verdict.reason } : { refusal: refuse(400, 'REASON_REQUIRED', `${verdict.error} Nothing was saved.`) };
}

type Tx = FolderQueryable & { release(): void };

/** One transaction: the write authority, the change and its chained audit row, together or not at all. */
async function inFolderTransaction(
  base: FolderWriteBase,
  work: (client: Tx, index: ProgramFolderIndex) => Promise<FolderWriteResult>,
): Promise<FolderWriteResult> {
  if (!UUID_RE.test(base.programId)) return refuse(404, 'NOT_FOUND', 'No such project.');
  const stated = folderReasonRefusal(base.reason);
  if ('refusal' in stated) return stated.refusal;
  const { pool } = await import('../../db.js');
  const { requireCurrentVaultProgramWrite } = await import('./vault-write-authority.js');
  const { ProgramReadAccessError } = await import('../c2c/current-program-access.js');
  const { resolveVaultView } = await import('./vault-filing.service.js');
  const client = (await pool.connect()) as unknown as Tx;
  try {
    await client.query('BEGIN');
    const identity = { organizationId: base.organizationId, userId: base.userId ?? undefined, programId: base.programId };
    await requireCurrentVaultProgramWrite(client as never, identity);
    const view = await resolveVaultView(base.programId, base.organizationId, client as never);
    const index = await readProgramFolderIndex(client, base.programId, base.organizationId, view);
    const result = await work(client, index);
    if (!result.ok) {
      await client.query('ROLLBACK');
      return result;
    }
    await requireCurrentVaultProgramWrite(client as never, identity);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof ProgramReadAccessError) return refuse(err.status, err.code, err.message);
    if ((err as { code?: string })?.code === '23505') {
      return refuse(409, 'FOLDER_EXISTS', 'A folder of that name is already there. Nothing was saved.');
    }
    throw err;
  } finally {
    client.release();
  }
}

type FolderAuditAction = 'vault.folder.create' | 'vault.folder.rename' | 'vault.folder.move' | 'vault.folder.remove';

/**
 * A folder change in a sentence, from the facts the row already carries. The ledger shows it as the event; without
 * it the row read "Folder renamed" against the target `vault_folder:uf:9`, which names no folder (walked 2026-11-11).
 */
function describeFolderChange(action: FolderAuditAction, d: Record<string, unknown>): string {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const part = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const place = (label: unknown) => text(label) ?? 'the top of the cabinet';
  const name = text(d.name) ?? 'a folder';
  if (action === 'vault.folder.create') return `Folder made: ${name}, ${text(d.parentLabel) ? `in ${text(d.parentLabel)}` : 'at the top of the cabinet'}`;
  if (action === 'vault.folder.rename') return `Folder renamed: ${text(part(d.from).name) ?? 'a folder'} -> ${text(part(d.to).name) ?? 'a new name'}`;
  if (action === 'vault.folder.move') return `Folder moved: ${name}, from ${place(part(d.from).parentLabel)} to ${place(part(d.to).parentLabel)}`;
  return `Folder removed: ${name}, from ${place(d.parentLabel)}`;
}

/** The chained audit row of a folder change: who, what, and the person's reason on the row's own column. */
export function folderAuditEntry(base: FolderWriteBase, action: FolderAuditAction, folderId: string, details: Record<string, unknown>) {
  const reason = base.reason.trim();
  return {
    tenantId: base.organizationId,
    userId: base.userId ?? undefined,
    action,
    resourceType: 'vault_folder',
    resourceId: folderId,
    ipAddress: base.ipAddress,
    userAgent: base.userAgent,
    // On the row's own column, where the history and the audit export read it (as vault-metadata-edit.service.ts
    // does), and in the details, which the chain's hash covers.
    reason,
    // The agent's provenance first, so the write's own facts below are never overwritten by it.
    details: { ...(base.agent ?? {}), programId: base.programId, ...details, description: describeFolderChange(action, details), reason },
  };
}

async function audit(
  client: FolderQueryable, base: FolderWriteBase, action: FolderAuditAction, folderId: string, details: Record<string, unknown>,
): Promise<void> {
  const { writeChainedAuditRow } = await import('../auditService.js');
  await writeChainedAuditRow(client as never, folderAuditEntry(base, action, folderId, details));
}

/**
 * Make a folder in the project's Vault, under `parentFolderId`: a binder or
 * preset folder, another person's folder, or (null) the cabinet's top level.
 */
export async function createProgramFolder(
  args: FolderWriteBase & { name: unknown; parentFolderId: string | null },
): Promise<FolderWriteResult> {
  const named = folderNameRefusal(args.name);
  if ('refusal' in named) return named.refusal;
  return inFolderTransaction(args, async (client, index) => {
    const parent = args.parentFolderId?.trim() || null;
    if (parent && !index.has(parent)) {
      return refuse(404, 'PARENT_NOT_FOUND', `There is no folder '${parent}' in this project's Vault to make it in. Nothing was saved.`);
    }
    const parentPerson = parent ? PERSON_FOLDER_ID.exec(parent) : null;
    const parentId = parentPerson ? Number(parentPerson[1]) : null;
    const parentKey = parent && !parentPerson ? parent : null;
    const path = parent ? `${index.label(parent)} / ${named.name}` : named.name;
    const ins = await client.query(
      `INSERT INTO public.document_folders (organization_id, program_id, name, parent_id, parent_key, path, created_by_id)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
       RETURNING id`,
      [args.organizationId, args.programId, named.name, parentId, parentKey, path, args.userId],
    );
    const folderId = personFolderId(Number((ins.rows[0] as { id: number }).id));
    await audit(client, args, 'vault.folder.create', folderId, {
      name: named.name,
      parentFolderId: parent,
      parentLabel: parent ? index.label(parent) : null,
    });
    return { ok: true, folder: { folderId, name: named.name, parentFolderId: parent, label: named.name } };
  });
}

/** Rename a folder a person made. A binder or preset folder is the filing's structure and keeps its name. */
export async function renameProgramFolder(
  args: FolderWriteBase & { folderId: string; name: unknown },
): Promise<FolderWriteResult> {
  const named = folderNameRefusal(args.name);
  if ('refusal' in named) return named.refusal;
  const m = PERSON_FOLDER_ID.exec(args.folderId ?? '');
  if (!m) {
    return refuse(409, 'FOLDER_NOT_RENAMEABLE',
      'This folder is part of the filing’s binder, so its name is the regulation’s and cannot be changed. Folders you make can be renamed.');
  }
  return inFolderTransaction(args, async (client) => {
    const cur = await client.query(
      `SELECT id, name, parent_id, parent_key FROM public.document_folders
        WHERE id = $1 AND program_id = $2::uuid AND organization_id = $3
        FOR UPDATE`,
      [Number(m[1]), args.programId, args.organizationId],
    );
    const before = cur.rows[0] as { name: string; parent_id: number | null; parent_key: string | null } | undefined;
    if (!before) return refuse(404, 'FOLDER_NOT_FOUND', 'There is no such folder in this project’s Vault. Nothing was saved.');
    const parentFolderId = before.parent_id != null ? personFolderId(before.parent_id) : before.parent_key;
    if (before.name === named.name) {
      return { ok: true, folder: { folderId: args.folderId, name: named.name, parentFolderId, label: named.name } };
    }
    await client.query(
      `UPDATE public.document_folders SET name = $1, updated_at = NOW()
        WHERE id = $2 AND program_id = $3::uuid AND organization_id = $4`,
      [named.name, Number(m[1]), args.programId, args.organizationId],
    );
    await audit(client, args, 'vault.folder.rename', args.folderId, { from: { name: before.name }, to: { name: named.name } });
    return { ok: true, folder: { folderId: args.folderId, name: named.name, parentFolderId, label: named.name } };
  });
}

const NOT_A_PERSONS_FOLDER = (act: string) => refuse(409, 'FOLDER_NOT_CHANGEABLE',
  `This folder is part of the filing’s binder, so it cannot be ${act}. Folders you make can be.`);

/** The folder's row under lock, in this project and organization, or undefined. */
async function lockPersonFolder(client: FolderQueryable, id: number, programId: string, orgId: number) {
  const cur = await client.query(
    `SELECT id, name, parent_id, parent_key FROM public.document_folders
      WHERE id = $1 AND program_id = $2::uuid AND organization_id = $3
      FOR UPDATE`,
    [id, programId, orgId],
  );
  return cur.rows[0] as { id: number; name: string; parent_id: number | null; parent_key: string | null } | undefined;
}

/** Why a folder cannot be moved under `parent`, or null: the parent must exist, and never be the folder or one inside it. */
function moveTargetRefusal(index: ProgramFolderIndex, folderId: string, parent: string | null): FolderWriteResult | null {
  if (!parent) return null;
  if (!index.has(parent)) {
    return refuse(404, 'PARENT_NOT_FOUND', `There is no folder '${parent}' in this project's Vault to move it into. Nothing was saved.`);
  }
  const parentOf = new Map(index.person.map((f) => [f.folderId, f.parentId != null ? personFolderId(f.parentId) : null] as const));
  for (let p: string | null = parent, guard = 0; p && guard < 64; p = parentOf.get(p) ?? null, guard += 1) {
    if (p === folderId) return refuse(409, 'FOLDER_INSIDE_ITSELF', 'A folder cannot be moved into itself or a folder inside it. Nothing was saved.');
  }
  return null;
}

/** Move a folder a person made under another folder of the project, or (null) to the cabinet's top level. Its documents and subfolders go with it. */
export async function moveProgramFolder(
  args: FolderWriteBase & { folderId: string; parentFolderId: string | null },
): Promise<FolderWriteResult> {
  const m = PERSON_FOLDER_ID.exec(args.folderId ?? '');
  if (!m) return NOT_A_PERSONS_FOLDER('moved');
  return inFolderTransaction(args, async (client, index) => {
    const before = await lockPersonFolder(client, Number(m[1]), args.programId, args.organizationId);
    if (!before) return refuse(404, 'FOLDER_NOT_FOUND', 'There is no such folder in this project’s Vault. Nothing was saved.');
    const parent = args.parentFolderId?.trim() || null;
    const refusal = moveTargetRefusal(index, args.folderId, parent);
    if (refusal) return refusal;
    const parentPerson = parent ? PERSON_FOLDER_ID.exec(parent) : null;
    const from = before.parent_id != null ? personFolderId(before.parent_id) : before.parent_key;
    if (from === parent) return { ok: true, folder: { folderId: args.folderId, name: before.name, parentFolderId: parent, label: before.name } };
    await client.query(
      `UPDATE public.document_folders SET parent_id = $1, parent_key = $2, path = $3, updated_at = NOW()
        WHERE id = $4 AND program_id = $5::uuid AND organization_id = $6`,
      [parentPerson ? Number(parentPerson[1]) : null, parent && !parentPerson ? parent : null,
        parent ? `${index.label(parent)} / ${before.name}` : before.name, before.id, args.programId, args.organizationId],
    );
    await audit(client, args, 'vault.folder.move', args.folderId, {
      name: before.name,
      from: { parentFolderId: from, parentLabel: from ? index.label(from) : null },
      to: { parentFolderId: parent, parentLabel: parent ? index.label(parent) : null },
    });
    return { ok: true, folder: { folderId: args.folderId, name: before.name, parentFolderId: parent, label: before.name } };
  });
}

/**
 * Whether this session's row security lets it read the project's Vault documents. An "empty" count taken by a
 * session that cannot see the documents is not evidence the folder is empty, so a removal asks first (found live,
 * 2026-11-10: a count with no person in the database scope read 0 for a folder holding a file). Where the database
 * has no such policy function, the rows are not hidden by it.
 */
async function canSeeProgramDocuments(client: FolderQueryable, programId: string): Promise<boolean> {
  const has = (await client.query(`SELECT to_regprocedure('core.can_access_program(uuid)') IS NOT NULL AS has`)).rows[0] as { has?: boolean };
  if (!has?.has) return true;
  const ok = (await client.query(`SELECT core.can_access_program($1::uuid) AS ok`, [programId])).rows[0] as { ok?: boolean };
  return ok?.ok === true;
}

/**
 * Remove a folder a person made. Only an empty one: a folder holding a document
 * (any version, filed or suggested) or another folder is refused, so nothing is
 * ever orphaned or hidden by a removal. The audit row keeps its name and place.
 */
export async function removeProgramFolder(args: FolderWriteBase & { folderId: string }): Promise<FolderWriteResult> {
  const m = PERSON_FOLDER_ID.exec(args.folderId ?? '');
  if (!m) return NOT_A_PERSONS_FOLDER('removed');
  return inFolderTransaction(args, async (client, index) => {
    const before = await lockPersonFolder(client, Number(m[1]), args.programId, args.organizationId);
    if (!before) return refuse(404, 'FOLDER_NOT_FOUND', 'There is no such folder in this project’s Vault. Nothing was removed.');
    if (!(await canSeeProgramDocuments(client, args.programId))) {
      return refuse(409, 'FOLDER_CONTENTS_UNVERIFIED',
        'The folder’s contents could not be read for this session, so it cannot be shown to be empty. Nothing was removed.');
    }
    // tenant-isolation-safe: both counts are bound to this program and organization.
    const held = (await client.query(
      `SELECT (SELECT COUNT(*)::int FROM vault.documents d
                WHERE d.folder_id = $1 AND d.program_id = $2::uuid AND d.organization_id = $3 AND d.deleted_at IS NULL) AS documents,
              (SELECT COUNT(*)::int FROM public.document_folders f
                WHERE f.parent_id = $4 AND f.program_id = $2::uuid AND f.organization_id = $3) AS folders`,
      [args.folderId, args.programId, args.organizationId, before.id],
    )).rows[0] as { documents: number; folders: number };
    if (held.documents > 0 || held.folders > 0) {
      const what = [held.documents ? `${held.documents} document${held.documents === 1 ? '' : 's'}` : null,
        held.folders ? `${held.folders} folder${held.folders === 1 ? '' : 's'}` : null].filter(Boolean).join(' and ');
      return refuse(409, 'FOLDER_NOT_EMPTY', `“${before.name}” holds ${what}. Move them out first; nothing was removed.`);
    }
    await client.query(
      `DELETE FROM public.document_folders WHERE id = $1 AND program_id = $2::uuid AND organization_id = $3`,
      [before.id, args.programId, args.organizationId],
    );
    const parent = before.parent_id != null ? personFolderId(before.parent_id) : before.parent_key;
    await audit(client, args, 'vault.folder.remove', args.folderId, {
      name: before.name, parentFolderId: parent, parentLabel: parent ? index.label(parent) : null,
    });
    return { ok: true, folder: { folderId: args.folderId, name: before.name, parentFolderId: parent, label: before.name } };
  });
}

/** The project's folders as AnA is given them: every folder a document may be filed to, by id, in tree order. */
export function folderChoices(index: ProgramFolderIndex): {
  binder: { label: string; version: string } | null;
  binderMissing: string | null;
  folders: Array<{ id: string; label: string; kind: 'binder' | 'preset' | 'person' }>;
} {
  const folders: Array<{ id: string; label: string; kind: 'binder' | 'preset' | 'person' }> = [];
  for (const n of index.binder?.nodes ?? []) folders.push({ id: binderFolderId(n.key), label: index.label(binderFolderId(n.key)), kind: 'binder' });
  for (const p of index.presets) folders.push({ id: p.id, label: p.label, kind: 'preset' });
  for (const f of index.person) {
    const parent = f.parentId != null ? personFolderId(f.parentId) : f.parentKey;
    folders.push({ id: f.folderId, label: parent ? `${f.name} (in ${index.label(parent) || parent})` : f.name, kind: 'person' });
  }
  return {
    binder: index.binder ? { label: index.binder.label, version: index.binder.version } : null,
    binderMissing: index.binderMissing,
    folders,
  };
}

/** The project's folders for AnA, read on the actor's executor, or why they could not be read (never an empty list on a failure). */
export async function projectFolderChoices(q: FolderQueryable, programId: string, orgId: number) {
  try {
    const { resolveVaultView } = await import('./vault-filing.service.js');
    const view = await resolveVaultView(programId, orgId, q as never);
    return folderChoices(await readProgramFolderIndex(q, programId, orgId, view));
  } catch {
    return { error: "The project's folders could not be read, so none are listed here. That is a failed read, not an empty Vault." };
  }
}
