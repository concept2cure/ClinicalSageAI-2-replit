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
