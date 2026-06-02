/**
 * FilesTreePane — full filesystem view of the program.
 *
 * Ported from design-system/ui_kits/mdx/FilesTreePane.jsx. Slice 1: the
 * Dossier branch lists real eSTAR sections from /document-preview; the
 * sibling branches (Correspondence / Approvals / Audit / Sources) render
 * as empty placeholder folders matching the kit's information architecture.
 *
 * Body / attachments previews stub until the dossier filesystem ships;
 * meta.json renders the live section metadata as JSON so users see real
 * data on the leaves that have it.
 *
 * Selection is tracked by path string (not node object reference) so async
 * hydration that rebuilds the tree never drops the selection.
 */

import * as React from 'react';
import { I } from '../../icons';
import type { ApprovalTarget } from './ApprovalsPane';
import {
  useDossierTree,
  countLeaves,
  findNode,
  type DossierDirNode,
  type DossierFileNode,
  type DossierTreeNode,
  type DossierSectionMeta,
} from '../../hooks/useDossierTree';
import type { PathwayKind } from './PathwayPanes';

const PATHWAY_LABEL: Record<PathwayKind, string> = {
  k510: '510(k)',
  pma: 'PMA',
  cer: 'CER',
};

/* ─── Tree row ───────────────────────────────────────────── */

interface TreeRowProps {
  node: DossierTreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (node: DossierTreeNode) => void;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  defaultOpen: Record<string, boolean>;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
  expanded,
  onToggle,
  defaultOpen,
}: TreeRowProps) {
  const isSelected = selectedPath === node.path;
  const isOpen = expanded[node.path] ?? defaultOpen[node.path] ?? false;

  if (node.kind === 'dir') {
    const count = node.children.length;
    return (
      <>
        <button
          type="button"
          className={`ftp-row ftp-row-dir ${isSelected ? 'sel' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            onToggle(node.path);
            onSelect(node);
          }}
        >
          <span className="ftp-twirl">{isOpen ? I.down : I.chevronRight}</span>
          <span className="ftp-icon">{I.folder}</span>
          <span className="ftp-name">{node.name}</span>
          {count > 0 && <span className="ftp-count">{count}</span>}
        </button>
        {isOpen &&
          node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              defaultOpen={defaultOpen}
            />
          ))}
      </>
    );
  }

  return (
    <button
      type="button"
      className={`ftp-row ftp-row-file ${isSelected ? 'sel' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 + 12 }}
      onClick={() => onSelect(node)}
    >
      <span className="ftp-icon ftp-icon-file">{fileIcon(node)}</span>
      <span className="ftp-name">{node.name}</span>
    </button>
  );
}

function fileIcon(node: DossierFileNode): React.ReactNode {
  if (node.fileKind === 'body') return I.fileText;
  if (node.fileKind === 'meta') return I.file;
  if (node.fileKind === 'attachment') return I.file;
  if (node.fileKind === 'correspondence') return I.fileText;
  if (node.fileKind === 'approval') return I.shieldCheck;
  if (node.fileKind === 'audit') return I.shieldCheck;
  return I.file;
}

/* ─── Previews ───────────────────────────────────────────── */

function PreviewBody({
  node,
  onOpenSection,
}: {
  node: DossierFileNode;
  onOpenSection?: (target: ApprovalTarget) => void;
}) {
  const meta = node.sectionMeta;
  return (
    <div className="ftp-preview ftp-preview-body">
      <div className="ftp-preview-actions">
        <button
          type="button"
          className="ftp-action ftp-action-primary"
          disabled={!meta}
          onClick={() => meta && onOpenSection?.({ id: meta.sectionId, label: meta.label })}
        >
          {I.arrowRight} Open in dossier
        </button>
        <span className="ftp-preview-meta">
          <span>section §{meta?.sectionId ?? '—'}</span>
          <span>·</span>
          <span>status {meta?.status ?? '—'}</span>
          {meta?.blocker && (
            <>
              <span>·</span>
              <span>blocker</span>
            </>
          )}
        </span>
      </div>
      <pre className="ftp-md">
        {`Document body preview will arrive when the dossier filesystem ships.\n\nOpen this section in the dossier editor to read or edit its content.`}
      </pre>
    </div>
  );
}

function PreviewMeta({ node }: { node: DossierFileNode }) {
  const meta: DossierSectionMeta | Record<string, never> = node.sectionMeta ?? {};
  return (
    <div className="ftp-preview ftp-preview-json">
      <pre className="ftp-json">{JSON.stringify(meta, null, 2)}</pre>
    </div>
  );
}

function PreviewDir({ node }: { node: DossierDirNode }) {
  const kids = node.children;
  if (node.placeholderEmpty) {
    return (
      <div className="ftp-preview ftp-preview-empty">
        <div className="ftp-empty-title">{node.name}</div>
        <div className="ftp-empty-sub">{node.emptyHint ?? 'No files yet.'}</div>
      </div>
    );
  }
  return (
    <div className="ftp-preview ftp-preview-dir">
      <div className="ftp-dir-head">
        <span className="ftp-icon">{I.folder}</span>
        <span className="ftp-dir-name">{node.path}</span>
        <span className="ftp-dir-count">
          {kids.length} {kids.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="ftp-dir-list">
        {kids.length === 0 && <div className="ftp-dir-empty">Empty</div>}
        {kids.map((child) => (
          <div key={child.path} className="ftp-dir-row">
            <span className="ftp-icon">
              {child.kind === 'dir' ? I.folder : fileIcon(child)}
            </span>
            <span className="ftp-dir-row-name">{child.name}</span>
            {child.kind === 'dir' && (
              <span className="ftp-dir-row-sub">{child.children.length} items</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main pane ───────────────────────────────────────────── */

export interface FilesTreePaneProps {
  pathway: PathwayKind;
  programIdent: string | null;
  onOpenSection?: (target: ApprovalTarget) => void;
}

export function FilesTreePane({ pathway, programIdent, onOpenSection }: FilesTreePaneProps) {
  const { tree, rootPath, loading, error } = useDossierTree(pathway, programIdent);

  const defaultOpen = React.useMemo<Record<string, boolean>>(
    () => ({
      Files: true,
      'Files/Dossier': true,
      [rootPath]: true,
    }),
    [rootPath],
  );

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const toggle = (path: string) =>
    setExpanded((prev) => ({
      ...prev,
      [path]: !(prev[path] ?? defaultOpen[path] ?? false),
    }));

  const [selectedPath, setSelectedPath] = React.useState<string>('Files');
  React.useEffect(() => {
    setSelectedPath('Files');
  }, [pathway]);

  const selected = findNode(tree, selectedPath) ?? tree;
  const onSelect = (node: DossierTreeNode) => setSelectedPath(node.path);

  const segs = selected.path.split('/').filter(Boolean);

  return (
    <div className="ftp-pane">
      <div className="ftp-bar">
        <div className="ftp-crumbs">
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="ftp-sep">/</span>}
              <span className={`ftp-crumb ${i === segs.length - 1 ? 'last' : ''}`}>{s}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="ftp-bar-r">
          <span className="ftp-bar-sub">
            {I.folder} {countLeaves(tree)} files · {PATHWAY_LABEL[pathway]} program
          </span>
        </div>
      </div>

      <div className="ftp-grid">
        <aside className="ftp-tree" aria-label="File tree">
          {loading && tree.children.length === 0 ? (
            <div className="ftp-dir-empty">Loading sections…</div>
          ) : error ? (
            <div className="ftp-dir-empty">Could not load sections.</div>
          ) : (
            <TreeRow
              node={tree}
              depth={0}
              selectedPath={selected.path}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={toggle}
              defaultOpen={defaultOpen}
            />
          )}
        </aside>

        <section className="ftp-content" aria-label="File preview">
          {selected.kind === 'dir' && <PreviewDir node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'body' && (
            <PreviewBody node={selected} onOpenSection={onOpenSection} />
          )}
          {selected.kind === 'file' && selected.fileKind === 'meta' && (
            <PreviewMeta node={selected} />
          )}
        </section>
      </div>
    </div>
  );
}
