/**
 * The Vault cabinet's folders as the surface lists them (S6, 2026-11-06).
 *
 * The server draws the cabinet (GET /api/c2c/project-vault/:id): the binder
 * the project's filing type and region select, the view's other preset
 * folders, and the folders people made, each `cab-<folder id>`. These helpers
 * read that tree; they never build a folder list of their own, so "Move to…",
 * the upload picker and New folder offer exactly the folders the server will
 * accept.
 */
import { isVaultDoc, type VaultDoc, type VaultFolder } from '../fixtures/vault-data';

/** What the server adds to a cabinet folder (server/routes/c2c/project-vault.ts VaultFolder). */
export type CabinetFolder = VaultFolder & {
  kind?: 'binder' | 'preset' | 'person' | 'queue';
  required?: boolean;
  madeBy?: string | null;
  binder?: { docType: string; agency: string; version: string; label: string };
  note?: string;
};

export interface CabinetFolderOption {
  /** The folder id the server files to ('bn:3.2.S.4', 'uf:12', 'corresp'). */
  id: string;
  /** Its name, with its section number when it has one. */
  label: string;
  depth: number;
  kind: CabinetFolder['kind'];
}

/** The review queues are places a document waits, never a place to file it. */
const QUEUES = new Set(['cab-unfiled', 'cab-other-view']);

/** Every folder of the cabinet a document may be filed to, in tree order, with its depth. */
export function cabinetFolderOptions(cabinet: VaultFolder | null | undefined): CabinetFolderOption[] {
  const out: CabinetFolderOption[] = [];
  const walk = (nodes: Array<VaultFolder | VaultDoc>, depth: number) => {
    for (const n of nodes) {
      if (isVaultDoc(n)) continue;
      const f = n as CabinetFolder;
      if (QUEUES.has(f.id) || !f.id.startsWith('cab-')) continue;
      out.push({ id: f.id.slice(4), label: f.code ? `${f.code} ${f.label}` : f.label, depth, kind: f.kind });
      walk(f.children, depth + 1);
    }
  };
  if (cabinet) walk(cabinet.children, 0);
  return out;
}

/** An option's text in a native select: indented by depth, since a select cannot nest. */
export function indentedLabel(o: Pick<CabinetFolderOption, 'label' | 'depth'>): string {
  return `${'  '.repeat(Math.min(o.depth, 8))}${o.label}`;
}

/** The folder id a person made, from a tree id ('cab-uf:12' → 'uf:12'), or null. */
export function personFolderOf(treeId: string | null | undefined): string | null {
  const m = /^cab-(uf:[1-9][0-9]*)$/.exec(treeId ?? '');
  return m ? m[1] : null;
}

/** The folder a new folder is made in, from the folder open in the tree: a cabinet folder, or the top. */
export function newFolderParentOf(treeId: string | null | undefined): string {
  if (!treeId || !treeId.startsWith('cab-') || QUEUES.has(treeId)) return '';
  return treeId.slice(4);
}

/** A plan task (the project's pyramid, GET /api/v1/pyramids/by-project/:id) as a Vault folder lists it. */
export interface FolderPlanTask {
  id: string;
  name: string;
  status: string;
  /** The task's CTD bindings that fall in the folder. */
  codes: string[];
}

/**
 * The plan tasks that feed a binder folder: those whose document bindings fall at or below its
 * CTD heading ('cab-bn:3.2.S' takes 3.2.S and 3.2.S.4). A module root ('cab-bn:M3') takes every
 * binding of module 3. A folder that is not a binder heading has none.
 */
export function planTasksForFolder(
  treeId: string | null | undefined,
  tasks: ReadonlyArray<{ id: string; name: string; ctd?: string[] }>,
  statuses: Readonly<Record<string, string>> = {},
): FolderPlanTask[] {
  const m = /^cab-bn:(.+)$/.exec(treeId ?? '');
  if (!m) return [];
  const key = m[1];
  const root = /^M([1-5])$/.exec(key);
  const within = (c: string) => (root ? c === root[1] || c.startsWith(`${root[1]}.`) : c === key || c.startsWith(`${key}.`));
  return tasks
    .map((t) => ({ id: t.id, name: t.name, status: statuses[t.id] ?? 'todo', codes: (t.ctd ?? []).filter(within) }))
    .filter((t) => t.codes.length > 0);
}

/** The nearest binder heading a CTD code opens: itself, else its closest ancestor the tree holds. */
export function binderFolderFor(code: string, has: (treeId: string) => boolean): string | null {
  for (let c = code.trim(); c; c = c.includes('.') ? c.slice(0, c.lastIndexOf('.')) : '') {
    if (has(`cab-bn:${c}`)) return `cab-bn:${c}`;
  }
  const mod = /^([1-5])/.exec(code.trim());
  return mod && has(`cab-bn:M${mod[1]}`) ? `cab-bn:M${mod[1]}` : null;
}

/**
 * The folder vault.open-folder names: an exact binder heading ('bn:<code>', its own heading or the nearest above it),
 * an exact tree id, or else by name (exact first, then contained). Exact ids never fall back to a name match.
 */
export function openFolderMatches<F extends { folder: { id: string; label: string } }>(found: F[], exactId: string, wanted: string): F[] {
  if (exactId) {
    const id = exactId.startsWith('bn:') ? binderFolderFor(exactId.slice(3), (t) => found.some((f) => f.folder.id === t)) : `cab-${exactId}`;
    return id ? found.filter((f) => f.folder.id === id) : [];
  }
  const exact = found.filter((f) => f.folder.label.toLowerCase() === wanted);
  return exact.length ? exact : found.filter((f) => f.folder.label.toLowerCase().includes(wanted));
}
