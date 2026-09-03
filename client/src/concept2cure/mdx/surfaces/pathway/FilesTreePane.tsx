/**
 * FilesTreePane — full filesystem view of a pathway program.
 * Ported from `design-system/ui_kits/mdx/FilesTreePane.jsx`.
 *
 * Every surface (dossier, correspondence, approvals, audit, sources) is a
 * folder under Files/. The Dossier branch is the live in-memory store; the
 * Correspondence / Approvals / Audit branches are synthesised at render time
 * from the caller's resolved `tabs` bundle (usePathwayTabsData) — live rows,
 * or fixtures only in explicit sample mode, so the tree can never show a
 * synthesized Part 11 audit file as if it were real. The kit's example
 * Sources/ placeholder dirs are likewise sample-mode only.
 *
 * Single-pane layout: tree on the left, preview on the right. Selecting a node
 * updates the preview + breadcrumb. "Open in dossier" routes a body.md to the
 * live section via onOpenSection.
 */

import * as React from 'react';
import { I } from '../../icons';
import { useSampleMode } from '../../components/DataGate';
import { DossierStore } from '../../store/dossierStore';
import type { PathwayTabsLive } from '../../hooks/usePathwayTabsData';
import type {
  Approval,
  Correspondence,
  DossierAttachment,
  PathwayKey,
  SectionTarget,
} from '../../types';

const PATHWAY_LABEL_FS: Record<string, string> = { k510: '510(k)', pma: 'PMA', cer: 'CER', ivd: 'IVDR' };

interface TreeNode {
  name: string;
  kind: 'dir' | 'file';
  path: string;
  children?: TreeNode[];
  fileKind?: 'body' | 'meta' | 'attachment' | 'correspondence' | 'approval' | 'audit';
  sectionFolder?: string;
  meta?: DossierAttachment;
  data?: unknown;
  placeholder?: boolean;
}

/* ─── helpers ─────────────────────────────────────────── */
function fmtBytes(n: number | undefined): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

function slug(s: string | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/* Build the tree as a nested object. `data` is the caller's resolved
   Audit / Correspondence / Approvals bundle (already sample-gated);
   `sampleOn` additionally gates the kit's example Sources/ placeholders. */
function buildTree(pathway: PathwayKey, data: PathwayTabsLive, sampleOn: boolean): TreeNode {
  const root = DossierStore.rootFor(pathway) || `Files/Dossier/${pathway}`;
  const programLabel = root.replace(/^Files\/Dossier\//, '');

  /* — Dossier branch (live FS) — */
  const dossierChildren: TreeNode[] = [];
  const sectionFolders = DossierStore.listDir(root);
  sectionFolders.forEach((sf) => {
    if (!sf.isDir) return;
    const folderPath = sf.path;
    const inside = DossierStore.listDir(folderPath);
    const kids: TreeNode[] = [];
    inside.forEach((entry) => {
      if (entry.name === 'attachments') {
        const atts = DossierStore.fs.get(entry.path)?.files || [];
        kids.push({
          name: 'attachments',
          kind: 'dir',
          path: entry.path,
          children: atts.map((a) => ({
            name: a.name,
            kind: 'file' as const,
            fileKind: 'attachment' as const,
            path: `${entry.path}/${a.name}`,
            meta: a,
          })),
        });
      } else if (entry.name === 'body.md') {
        kids.push({ name: 'body.md', kind: 'file', fileKind: 'body', path: entry.path, sectionFolder: folderPath });
      } else if (entry.name === 'meta.json') {
        kids.push({ name: 'meta.json', kind: 'file', fileKind: 'meta', path: entry.path, sectionFolder: folderPath });
      }
    });
    dossierChildren.push({ name: sf.name, kind: 'dir', path: folderPath, children: kids, sectionFolder: folderPath });
  });

  /* — Correspondence branch (synth) — */
  const corrChildren: TreeNode[] = (data.correspondence || []).map((c) => {
    const date = c.received ? new Date(c.received) : null;
    const datePart = date ? date.toISOString().slice(0, 10) : 'undated';
    const fname = `${datePart} — ${slug(c.subject)}.md`;
    return { name: fname, kind: 'file', fileKind: 'correspondence', path: `Files/Correspondence/${fname}`, data: c };
  });

  /* — Approvals branch — live rows only; the fabricated signed set is gone. */
  const apprChildren: TreeNode[] = (data.approvals || []).map((a) => {
    const fname = `${a.id} — ${slug(a.target)}.json`;
    return { name: fname, kind: 'file', fileKind: 'approval', path: `Files/Approvals/${fname}`, data: a };
  });

  /* — Audit branch (single ndjson) — live events only, and materialised only
     when there are some; an empty tenant gets an honestly empty Audit/ dir
     rather than a zero-event file claiming a hash chain exists. */
  const auditChildren: TreeNode[] = (data.audit || []).length ? [{
    name: 'audit-trail.ndjson',
    kind: 'file',
    fileKind: 'audit',
    path: 'Files/Audit/audit-trail.ndjson',
    data: data.audit,
  }] : [];

  /* — Sources — the kit's example placeholder dirs appear only in explicit
     sample mode; a live workspace shows an empty Sources/ dir until cited. */
  const sourcesChildren: TreeNode[] = sampleOn ? [
    { name: 'predicates/', kind: 'dir', path: 'Files/Sources/predicates', children: [], placeholder: true },
    { name: 'literature/', kind: 'dir', path: 'Files/Sources/literature', children: [], placeholder: true },
    { name: 'signals/',    kind: 'dir', path: 'Files/Sources/signals',    children: [], placeholder: true },
  ] : [];

  return {
    name: 'Files',
    kind: 'dir',
    path: 'Files',
    children: [
      {
        name: 'Dossier',
        kind: 'dir',
        path: 'Files/Dossier',
        children: [{ name: programLabel, kind: 'dir', path: root, children: dossierChildren }],
      },
      { name: 'Correspondence', kind: 'dir', path: 'Files/Correspondence', children: corrChildren },
      { name: 'Approvals',      kind: 'dir', path: 'Files/Approvals',      children: apprChildren },
      { name: 'Audit',          kind: 'dir', path: 'Files/Audit',          children: auditChildren },
      { name: 'Sources',        kind: 'dir', path: 'Files/Sources',        children: sourcesChildren },
    ],
  };
}

function countLeaves(node: TreeNode): number {
  if (node.kind === 'file') return 1;
  return (node.children || []).reduce((s, c) => s + countLeaves(c), 0);
}

function fileIcon(node: TreeNode): React.ReactNode {
  if (node.fileKind === 'body') return I.fileText;
  if (node.fileKind === 'meta') return I.file;
  if (node.fileKind === 'attachment') {
    const k = node.meta?.kind;
    if (k === 'pdf') return I.fileText;
    return I.file;
  }
  if (node.fileKind === 'correspondence') return I.fileText;
  if (node.fileKind === 'approval') return I.shieldCheck;
  if (node.fileKind === 'audit') return I.shieldCheck;
  return I.file;
}

/* ─── Tree row ───────────────────────────────────────────── */
interface TreeRowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | undefined;
  onSelect: (n: TreeNode) => void;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  defaultOpen: Record<string, boolean>;
}

function TreeRow({ node, depth, selectedPath, onSelect, expanded, onToggle, defaultOpen }: TreeRowProps) {
  const isSelected = selectedPath === node.path;
  const isOpen = expanded[node.path] ?? defaultOpen[node.path] ?? false;
  const isDir = node.kind === 'dir';

  if (isDir) {
    const count = (node.children || []).length;
    return (
      <>
        <button
          type="button"
          className={`ftp-row ftp-row-dir ${isSelected ? 'sel' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => { onToggle(node.path); onSelect(node); }}
        >
          <span className="ftp-twirl">{isOpen ? I.down : I.chevronRight}</span>
          <span className="ftp-icon">{I.folder}</span>
          <span className="ftp-name">{node.name}</span>
          {count > 0 && <span className="ftp-count">{count}</span>}
        </button>
        {isOpen && (node.children || []).map((c) => (
          <TreeRow
            key={c.path}
            node={c}
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

/* ─── Previews ───────────────────────────────────────────── */
function PreviewBody({ node, onOpenSection }: { node: TreeNode; onOpenSection: (t: SectionTarget) => void }) {
  const body = DossierStore.fs.get(node.path)?.body || '';
  const sectionMeta = DossierStore.fs.get(`${node.sectionFolder}/meta.json`)?.meta || {};
  return (
    <div className="ftp-preview ftp-preview-body">
      <div className="ftp-preview-actions">
        <button
          className="ftp-action ftp-action-primary"
          onClick={() => onOpenSection({ id: sectionMeta.sectionId ?? '', label: sectionMeta.label ?? '' })}
        >
          {I.arrowRight} Open in dossier
        </button>
        <span className="ftp-preview-meta">
          <span>{body.split('\n').length} lines</span>
          <span>·</span>
          <span>{(body.length / 1024).toFixed(1)} KB</span>
          <span>·</span>
          <span>edited {fmtDateShort(sectionMeta.lastEdited)} by {sectionMeta.lastEditor || '—'}</span>
        </span>
      </div>
      <pre className="ftp-md">{body}</pre>
    </div>
  );
}

function PreviewMeta({ node }: { node: TreeNode }) {
  const meta = DossierStore.fs.get(node.path)?.meta || {};
  return (
    <div className="ftp-preview ftp-preview-json">
      <pre className="ftp-json">{JSON.stringify(meta, null, 2)}</pre>
    </div>
  );
}

function PreviewAttachment({ node }: { node: TreeNode }) {
  const m = node.meta || ({} as DossierAttachment);
  return (
    <div className="ftp-preview ftp-preview-attach">
      <div className="ftp-attach-card">
        <div className="ftp-attach-icon">{fileIcon(node)}</div>
        <div className="ftp-attach-body">
          <div className="ftp-attach-name">{m.name}</div>
          <div className="ftp-attach-grid">
            <div><span className="lbl">Kind</span><span className="val">{m.kind || '—'}</span></div>
            <div><span className="lbl">Size</span><span className="val">{fmtBytes(m.size)}</span></div>
            <div><span className="lbl">Uploaded by</span><span className="val">{m.who || '—'}</span></div>
            <div><span className="lbl">When</span><span className="val">{fmtDateShort(m.when)}</span></div>
          </div>
        </div>
      </div>
      <div className="ftp-attach-note">
        Binary content not previewable. {I.download} <a className="ftp-link" href="#" onClick={(e) => e.preventDefault()}>Download original</a>
      </div>
    </div>
  );
}

function PreviewCorrespondence({ node }: { node: TreeNode }) {
  const c = node.data as Correspondence;
  const direction = c.from === 'us' ? 'Outgoing' : 'Incoming';
  return (
    <div className="ftp-preview ftp-preview-md">
      <div className="ftp-md-head">
        <div className="ftp-md-h1">{c.subject}</div>
        <div className="ftp-md-meta">
          <span className={`ftp-pill ${c.status === 'open' ? 'open' : 'closed'}`}>{c.status}</span>
          <span>{direction}</span>
          <span>·</span>
          <span>{fmtDateShort(c.received)}</span>
          {c.from && <><span>·</span><span>From {c.from}</span></>}
          {c.to && <><span>·</span><span>To {c.to}</span></>}
        </div>
      </div>
      <pre className="ftp-md">{c.body || c.summary || c.preview || '(no body)'}</pre>
    </div>
  );
}

function PreviewApproval({ node }: { node: TreeNode }) {
  const a = node.data as Approval;
  const obj = {
    id: a.id, label: a.label ?? a.target, status: a.status,
    requested: a.requested, due: a.due,
    requestor: a.requestor ?? a.requested_by, signer: a.signer,
    signers: a.signers, refs: a.refs,
  };
  return (
    <div className="ftp-preview ftp-preview-json">
      <pre className="ftp-json">{JSON.stringify(obj, null, 2)}</pre>
    </div>
  );
}

function PreviewAudit({ node }: { node: TreeNode }) {
  const events = (node.data as Array<{ when: string; kind: string; actor?: string; target?: string; hash?: string }>) || [];
  const lines = events.slice(0, 200).map((e) => JSON.stringify({
    ts: e.when, kind: e.kind, who: e.actor, summary: e.target, hash: e.hash?.slice(0, 12),
  }));
  return (
    <div className="ftp-preview ftp-preview-ndjson">
      <div className="ftp-ndjson-head">
        {events.length} events · SHA-256 chained · append-only
        {events.length > 200 && <span className="ftp-trunc"> · showing first 200</span>}
      </div>
      <pre className="ftp-json">{lines.join('\n')}</pre>
    </div>
  );
}

function PreviewDir({ node }: { node: TreeNode }) {
  const kids = node.children || [];
  if (node.placeholder) {
    return (
      <div className="ftp-preview ftp-preview-empty">
        <div className="ftp-empty-title">{node.name}</div>
        <div className="ftp-empty-sub">No files yet. Sources are added when you cite a predicate, paper, or signal in a section.</div>
      </div>
    );
  }
  return (
    <div className="ftp-preview ftp-preview-dir">
      <div className="ftp-dir-head">
        <span className="ftp-icon">{I.folder}</span>
        <span className="ftp-dir-name">{node.path}</span>
        <span className="ftp-dir-count">{kids.length} {kids.length === 1 ? 'item' : 'items'}</span>
      </div>
      <div className="ftp-dir-list">
        {kids.length === 0 && <div className="ftp-dir-empty">Empty</div>}
        {kids.map((k) => (
          <div key={k.path} className="ftp-dir-row">
            <span className="ftp-icon">{k.kind === 'dir' ? I.folder : fileIcon(k)}</span>
            <span className="ftp-dir-row-name">{k.name}</span>
            {k.kind === 'dir' && <span className="ftp-dir-row-sub">{(k.children || []).length} items</span>}
            {k.kind === 'file' && k.fileKind === 'attachment' && <span className="ftp-dir-row-sub">{fmtBytes(k.meta?.size)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main pane ───────────────────────────────────────────── */
export interface FilesTreePaneProps {
  pathway: PathwayKey;
  /** Resolved Audit / Correspondence / Approvals rows from usePathwayTabsData
   *  — live backend rows, or fixtures only in explicit sample mode. */
  tabs: PathwayTabsLive;
  onOpenSection: (t: SectionTarget) => void;
}

export function FilesTreePane({ pathway, tabs, onOpenSection }: FilesTreePaneProps) {
  const sampleOn = useSampleMode();
  const tree = React.useMemo(
    () => buildTree(pathway, tabs, sampleOn),
    /* The bundle object is rebuilt per render; its member arrays are stable. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathway, tabs.audit, tabs.correspondence, tabs.approvals, sampleOn],
  );
  const root = DossierStore.rootFor(pathway) || '';

  const defaultOpen = React.useMemo<Record<string, boolean>>(() => ({
    Files: true,
    'Files/Dossier': true,
    [root]: true,
  }), [root]);

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const toggle = (path: string) => setExpanded((e) => ({ ...e, [path]: !(e[path] ?? defaultOpen[path] ?? false) }));

  const [selected, setSelected] = React.useState<TreeNode>(tree);
  React.useEffect(() => { setSelected(tree); }, [pathway]); // eslint-disable-line react-hooks/exhaustive-deps

  const segs = (selected.path || '').split('/').filter(Boolean);

  /* Subscribe to store changes so edits/attachments live-update. */
  const [, force] = React.useState(0);
  React.useEffect(() => DossierStore.subscribeAll(() => force((n) => n + 1)), []);

  return (
    <div className="ftp-pane">
      <div className="ftp-bar">
        <div className="ftp-crumbs">
          {segs.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="ftp-sep" aria-hidden="true">/</span>}
              <span className={`ftp-crumb ${i === segs.length - 1 ? 'last' : ''}`}>{s}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="ftp-bar-r">
          <span className="ftp-bar-sub">
            {I.folder} {countLeaves(tree)} files · {PATHWAY_LABEL_FS[pathway]} program
          </span>
        </div>
      </div>

      <div className="ftp-grid">
        <aside className="ftp-tree" aria-label="File tree">
          <TreeRow
            node={tree}
            depth={0}
            selectedPath={selected.path}
            onSelect={setSelected}
            expanded={expanded}
            onToggle={toggle}
            defaultOpen={defaultOpen}
          />
        </aside>

        <section className="ftp-content" aria-label="File preview">
          {selected.kind === 'dir' && <PreviewDir node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'body' && (
            <PreviewBody node={selected} onOpenSection={onOpenSection} />
          )}
          {selected.kind === 'file' && selected.fileKind === 'meta' && <PreviewMeta node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'attachment' && <PreviewAttachment node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'correspondence' && <PreviewCorrespondence node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'approval' && <PreviewApproval node={selected} />}
          {selected.kind === 'file' && selected.fileKind === 'audit' && <PreviewAudit node={selected} />}
        </section>
      </div>
    </div>
  );
}
