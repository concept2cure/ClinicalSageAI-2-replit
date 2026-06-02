/**
 * useDossierTree — adapter from server section data to the kit's file-tree shape.
 *
 * Slice 1 scope: the Dossier branch only consumes real data, sourced from
 * /api/510k/projects/:ident/document-preview via useK510EstarSections. The
 * sibling branches (Correspondence / Approvals / Audit / Sources) render as
 * empty placeholder folders so the kit's information architecture is
 * preserved without inventing seed data — paying clients will see real
 * counts when each branch's own slice ships.
 *
 * The kit's in-memory DossierStore (design-system/ui_kits/mdx/dossier-store.jsx)
 * is intentionally not ported — its seed rows are demo content per CLAUDE.md's
 * no-seed-data rule. This hook returns the same tree shape that store does,
 * but built live from server data.
 */

import * as React from 'react';
import { useK510EstarSections } from './useK510';
import type { EstarRow } from '../data/k510';
import type { PathwayKind } from '../surfaces/pathway/PathwayPanes';

export interface DossierSectionMeta {
  sectionId: number;
  label: string;
  status: EstarRow['status'];
  blocker: boolean;
}

export type DossierFileKind =
  | 'body'
  | 'meta'
  | 'attachment'
  | 'correspondence'
  | 'approval'
  | 'audit';

export interface DossierDirNode {
  kind: 'dir';
  name: string;
  path: string;
  children: DossierTreeNode[];
  /** Identifies a §N section folder so the body/meta children can link back. */
  sectionFolder?: string;
  /** Sibling branch with no data yet — preview renders a copy hint instead. */
  placeholderEmpty?: boolean;
  emptyHint?: string;
}

export interface DossierFileNode {
  kind: 'file';
  name: string;
  path: string;
  fileKind: DossierFileKind;
  sectionFolder?: string;
  sectionMeta?: DossierSectionMeta;
}

export type DossierTreeNode = DossierDirNode | DossierFileNode;

export interface UseDossierTreeResult {
  tree: DossierDirNode;
  rootPath: string;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const PATHWAY_LABEL: Record<PathwayKind, string> = {
  k510: '510(k)',
  pma: 'PMA',
  cer: 'CER',
};

function programFolderLabel(pathway: PathwayKind, ident: string | null): string {
  const tag = PATHWAY_LABEL[pathway];
  if (!ident) return `${tag} — active program`;
  return `${tag} — ${ident}`;
}

function emptyTree(pathway: PathwayKind, programLabel: string, root: string): DossierDirNode {
  return {
    kind: 'dir',
    name: 'Files',
    path: 'Files',
    children: [
      {
        kind: 'dir',
        name: 'Dossier',
        path: 'Files/Dossier',
        children: [
          {
            kind: 'dir',
            name: programLabel,
            path: root,
            children: [],
          },
        ],
      },
      siblingBranch('Correspondence', 'Files/Correspondence', siblingHint(pathway, 'correspondence')),
      siblingBranch('Approvals', 'Files/Approvals', siblingHint(pathway, 'approvals')),
      siblingBranch('Audit', 'Files/Audit', siblingHint(pathway, 'audit')),
      siblingBranch('Sources', 'Files/Sources', siblingHint(pathway, 'sources')),
    ],
  };
}

function siblingBranch(name: string, path: string, hint: string): DossierDirNode {
  return {
    kind: 'dir',
    name,
    path,
    children: [],
    placeholderEmpty: true,
    emptyHint: hint,
  };
}

function siblingHint(pathway: PathwayKind, kind: 'correspondence' | 'approvals' | 'audit' | 'sources'): string {
  if (kind === 'approvals') {
    return 'Pending e-signatures live in the Approvals tab. They will mirror here when the dossier filesystem ships.';
  }
  if (kind === 'audit') {
    return 'The 21 CFR Part 11 trail will appear here when the Audit pane ships.';
  }
  if (kind === 'correspondence') {
    const tag = pathway === 'k510' ? 'RTA / AI-Hold' : pathway === 'pma' ? 'Day-100' : 'NB Q&A';
    return `${tag} threads will mirror here when the Correspondence pane ships.`;
  }
  return 'Sources are added when you cite a predicate, paper, or signal in a section.';
}

/**
 * Build the kit's tree shape from server eSTAR rows.
 *
 * @param pathway       k510 / pma / cer — currently only k510 sources real
 *                      data; pma / cer return an empty Dossier folder until
 *                      their section endpoints land.
 * @param programIdent  the identifier accepted by /api/510k/projects/:ident
 *                      (numeric id, regulatoryPrograms UUID, or code like
 *                      `BX-204`).
 */
export function useDossierTree(
  pathway: PathwayKind,
  programIdent: string | null,
): UseDossierTreeResult {
  const k510Active = pathway === 'k510';
  const estar = useK510EstarSections(k510Active ? programIdent : null);

  const programLabel = programFolderLabel(pathway, programIdent);
  const rootPath = `Files/Dossier/${programLabel}`;

  const tree = React.useMemo<DossierDirNode>(() => {
    if (!k510Active || !estar.rows) {
      return emptyTree(pathway, programLabel, rootPath);
    }
    const sectionFolders: DossierDirNode[] = estar.rows.map((row) => {
      const folderName = `§${row.id} — ${row.label}`;
      const folderPath = `${rootPath}/${folderName}`;
      const sectionMeta: DossierSectionMeta = {
        sectionId: row.id,
        label: row.label,
        status: row.status,
        blocker: row.blocker,
      };
      const bodyNode: DossierFileNode = {
        kind: 'file',
        name: 'body.md',
        path: `${folderPath}/body.md`,
        fileKind: 'body',
        sectionFolder: folderPath,
        sectionMeta,
      };
      const metaNode: DossierFileNode = {
        kind: 'file',
        name: 'meta.json',
        path: `${folderPath}/meta.json`,
        fileKind: 'meta',
        sectionFolder: folderPath,
        sectionMeta,
      };
      return {
        kind: 'dir',
        name: folderName,
        path: folderPath,
        sectionFolder: folderPath,
        children: [bodyNode, metaNode],
      };
    });

    return {
      kind: 'dir',
      name: 'Files',
      path: 'Files',
      children: [
        {
          kind: 'dir',
          name: 'Dossier',
          path: 'Files/Dossier',
          children: [
            {
              kind: 'dir',
              name: programLabel,
              path: rootPath,
              children: sectionFolders,
            },
          ],
        },
        siblingBranch('Correspondence', 'Files/Correspondence', siblingHint(pathway, 'correspondence')),
        siblingBranch('Approvals', 'Files/Approvals', siblingHint(pathway, 'approvals')),
        siblingBranch('Audit', 'Files/Audit', siblingHint(pathway, 'audit')),
        siblingBranch('Sources', 'Files/Sources', siblingHint(pathway, 'sources')),
      ],
    };
  }, [pathway, programLabel, rootPath, k510Active, estar.rows]);

  return {
    tree,
    rootPath,
    loading: k510Active ? estar.loading : false,
    error: k510Active ? estar.error : null,
    refresh: estar.refresh,
  };
}

/* ─── Tree traversal helpers (exported for the pane) ───────────────── */

export function countLeaves(node: DossierTreeNode): number {
  if (node.kind === 'file') return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function findNode(node: DossierTreeNode, path: string): DossierTreeNode | null {
  if (!node || !path) return null;
  if (node.path === path) return node;
  if (node.kind === 'file') return null;
  for (const child of node.children) {
    const hit = findNode(child, path);
    if (hit) return hit;
  }
  return null;
}
