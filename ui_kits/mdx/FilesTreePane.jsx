/* global React, I, PATHWAY_TABS_DATA */
/* ─────────────────────────────────────────────────────────────────
   FilesTreePane — full filesystem view of the program.

   Mental model: every surface (dossier, correspondence, approvals,
   audit, sources) is a folder under Files/. The user can browse it
   like a real file tree — even though most non-dossier branches are
   synthesised at render time from PATHWAY_TABS_DATA.

   Tree:
     Files/
       Dossier/<program>/§N — <label>/
         body.md
         meta.json
         attachments/<file>
       Correspondence/
         <date> — <subject>.md
       Approvals/
         <id> — <label>.json
       Audit/
         audit-trail.ndjson  (synth, read-only)
       Sources/   (placeholder — predicates, literature, signals)

   Single-pane layout: tree on the left, preview on the right.
   Selecting a node updates the preview and the path breadcrumb.
   "Open in dossier" appears for any file under Dossier/<program>/§N.
   ───────────────────────────────────────────────────────────────── */

const { useState: fsUseState, useMemo: fsUseMemo, useEffect: fsUseEffect } = React;

const PATHWAY_LABEL_FS = { k510: '510(k)', pma: 'PMA', cer: 'CER' };

/* ─── helpers ─────────────────────────────────────────── */
function fmtBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/* Build the tree as a nested object: { name, kind, children?, leaf data } */
function buildTree(pathway) {
  const data = PATHWAY_TABS_DATA[pathway];
  const root = window.DossierStore?.rootFor(pathway) || `Files/Dossier/${pathway}`;
  const programLabel = root.replace(/^Files\/Dossier\//, '');

  /* — Dossier branch (live FS) — */
  const dossierChildren = [];
  if (window.DossierStore) {
    const sectionFolders = window.DossierStore.listDir(root);
    sectionFolders.forEach((sf) => {
      if (!sf.isDir) return;
      const folderPath = sf.path;
      const inside = window.DossierStore.listDir(folderPath);
      const kids = [];
      inside.forEach((entry) => {
        if (entry.name === 'attachments') {
          const atts = window.DossierStore.fs.get(entry.path)?.files || [];
          kids.push({
            name: 'attachments',
            kind: 'dir',
            path: entry.path,
            children: atts.map((a) => ({
              name: a.name,
              kind: 'file',
              fileKind: 'attachment',
              path: `${entry.path}/${a.name}`,
              meta: a,
            })),
          });
        } else if (entry.name === 'body.md') {
          kids.push({
            name: 'body.md',
            kind: 'file',
            fileKind: 'body',
            path: entry.path,
            sectionFolder: folderPath,
          });
        } else if (entry.name === 'meta.json') {
          kids.push({
            name: 'meta.json',
            kind: 'file',
            fileKind: 'meta',
            path: entry.path,
            sectionFolder: folderPath,
          });
        }
      });
      dossierChildren.push({
        name: sf.name,
        kind: 'dir',
        path: folderPath,
        children: kids,
        sectionFolder: folderPath,
      });
    });
  }

  /* — Correspondence branch (synth) — */
  const corrChildren = (data.correspondence || []).map((c) => {
    const date = c.received ? new Date(c.received) : null;
    const datePart = date ? date.toISOString().slice(0, 10) : 'undated';
    const fname = `${datePart} — ${slug(c.subject)}.md`;
    return {
      name: fname,
      kind: 'file',
      fileKind: 'correspondence',
      path: `Files/Correspondence/${fname}`,
      data: c,
    };
  });

  /* — Approvals branch (synth) — */
  const apprChildren = (data.approvals || []).map((a) => {
    const fname = `${a.id} — ${slug(a.target)}.json`;
    return {
      name: fname,
      kind: 'file',
      fileKind: 'approval',
      path: `Files/Approvals/${fname}`,
      data: a,
    };
  });

  /* — Audit branch (synth, single ndjson) — */
  const auditChildren = [{
    name: 'audit-trail.ndjson',
    kind: 'file',
    fileKind: 'audit',
    path: `Files/Audit/audit-trail.ndjson`,
    data: data.audit || [],
  }];

  /* — Sources placeholder — */
  const sourcesChildren = [
    { name: 'predicates/', kind: 'dir', path: 'Files/Sources/predicates', children: [], placeholder: true },
    { name: 'literature/', kind: 'dir', path: 'Files/Sources/literature', children: [], placeholder: true },
    { name: 'signals/',    kind: 'dir', path: 'Files/Sources/signals',    children: [], placeholder: true },
  ];

  return {
    name: 'Files',
    kind: 'dir',
    path: 'Files',
    children: [
      {
        name: 'Dossier',
        kind: 'dir',
        path: 'Files/Dossier',
        children: [{
          name: programLabel,
          kind: 'dir',
          path: root,
          children: dossierChildren,
        }],
      },
      { name: 'Correspondence', kind: 'dir', path: 'Files/Correspondence', children: corrChildren },
      { name: 'Approvals',      kind: 'dir', path: 'Files/Approvals',      children: apprChildren },
      { name: 'Audit',          kind: 'dir', path: 'Files/Audit',          children: auditChildren },
      { name: 'Sources',        kind: 'dir', path: 'Files/Sources',        children: sourcesChildren },
    ],
  };
}

/* Flatten tree for counting */
function countLeaves(node) {
  if (node.kind === 'file') return 1;
  return (node.children || []).reduce((s, c) => s + countLeaves(c), 0);
}

/* Resolve a node by its path string. Selection is tracked by PATH (stable
   across async data hydration), not by node object reference (which is
   replaced every time the tree rebuilds). Returns the matching node or null. */
function findNode(node, path) {
  if (!node || !path) return null;
  if (node.path === path) return node;
  for (const c of node.children || []) {
    const hit = findNode(c, path);
    if (hit) return hit;
  }
  return null;
}

/* ─── Tree row ───────────────────────────────────────────── */
function TreeRow({ node, depth, selectedPath, onSelect, expanded, onToggle, defaultOpen }) {
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

  /* file */
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

function fileIcon(node) {
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

/* ─── Previews ───────────────────────────────────────────── */
function PreviewBody({ node, onOpenSection }) {
  const body = window.DossierStore?.fs.get(node.path)?.body || '';
  const sectionMeta = window.DossierStore?.fs.get(`${node.sectionFolder}/meta.json`)?.meta || {};
  return (
    <div className="ftp-preview ftp-preview-body">
      <div className="ftp-preview-actions">
        <button
          className="ftp-action ftp-action-primary"
          onClick={() => onOpenSection({ id: sectionMeta.sectionId, label: sectionMeta.label })}
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

function PreviewMeta({ node }) {
  const meta = window.DossierStore?.fs.get(node.path)?.meta || {};
  return (
    <div className="ftp-preview ftp-preview-json">
      <pre className="ftp-json">{JSON.stringify(meta, null, 2)}</pre>
    </div>
  );
}

function PreviewAttachment({ node }) {
  const m = node.meta || {};
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

function PreviewCorrespondence({ node }) {
  const c = node.data;
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

function PreviewApproval({ node }) {
  const a = node.data;
  const obj = {
    id: a.id, target: a.target, target_kind: a.target_kind,
    stage: a.stage, status: a.status,
    requested: a.requested, requested_by: a.requested_by, due: a.due,
    signer: a.signer, role: a.role,
    meaning: a.meaning, signed_at: a.signed_at,
  };
  return (
    <div className="ftp-preview ftp-preview-json">
      <pre className="ftp-json">{JSON.stringify(obj, null, 2)}</pre>
    </div>
  );
}

function PreviewAudit({ node }) {
  const events = node.data || [];
  const lines = events.slice(0, 200).map((e) => JSON.stringify({
    ts: e.when, kind: e.kind, who: e.actor, role: e.role, target: e.target,
    section: e.target_id, signed: e.signed || undefined, hash: (e.hash || '').slice(0, 12),
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

function PreviewDir({ node }) {
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
function FilesTreePane({ pathway, onOpenSection }) {
  /* storeVersion bumps on every DossierStore write/hydration. Including it in
     the tree's deps means the tree always reflects current store data —
     async hydration just rebuilds the tree in place, no remount. */
  const [storeVersion, setStoreVersion] = fsUseState(0);
  fsUseEffect(() => {
    if (!window.DossierStore?.subscribeAll) return;
    return window.DossierStore.subscribeAll(() => setStoreVersion((n) => n + 1));
  }, []);

  const tree = fsUseMemo(() => buildTree(pathway), [pathway, storeVersion]);
  const root = window.DossierStore?.rootFor(pathway) || '';

  // Default expansion: Files → Dossier → <program> open. Others collapsed.
  const defaultOpen = fsUseMemo(() => ({
    'Files': true,
    'Files/Dossier': true,
    [root]: true,
  }), [root]);

  // Expand state is keyed by path STRING — survives tree rebuilds/hydration.
  const [expanded, setExpanded] = fsUseState({});
  const toggle = (path) => setExpanded((e) => ({ ...e, [path]: !(e[path] ?? defaultOpen[path] ?? false) }));

  // Selection is tracked by PATH STRING, not node object — so an async data
  // hydration that rebuilds the tree does NOT drop the selection. Default to
  // the Files root. Reset only when the pathway changes, never on hydration.
  const [selectedPath, setSelectedPath] = fsUseState('Files');
  fsUseEffect(() => { setSelectedPath('Files'); }, [pathway]);

  // Resolve the live node from the current tree by path; fall back to the
  // root if the previously-selected path no longer exists post-hydration.
  const selected = findNode(tree, selectedPath) || tree;
  const onSelect = (node) => setSelectedPath(node.path);

  const segs = (selected.path || '').split('/').filter(Boolean);

  return (
    <div className="ftp-pane">
      {/* Top bar — breadcrumb + summary */}
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
            {I.folder} {countLeaves(tree)} files · {PATHWAY_LABEL_FS[pathway]} program
          </span>
        </div>
      </div>

      <div className="ftp-grid">
        {/* Tree */}
        <aside className="ftp-tree" aria-label="File tree">
          <TreeRow
            node={tree}
            depth={0}
            selectedPath={selected.path}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={toggle}
            defaultOpen={defaultOpen}
          />
        </aside>

        {/* Preview */}
        <section className="ftp-content" aria-label="File preview">
          {selected.kind === 'dir' && <PreviewDir node={selected}/>}
          {selected.kind === 'file' && selected.fileKind === 'body' && (
            <PreviewBody node={selected} pathway={pathway} onOpenSection={onOpenSection}/>
          )}
          {selected.kind === 'file' && selected.fileKind === 'meta' && <PreviewMeta node={selected}/>}
          {selected.kind === 'file' && selected.fileKind === 'attachment' && <PreviewAttachment node={selected}/>}
          {selected.kind === 'file' && selected.fileKind === 'correspondence' && <PreviewCorrespondence node={selected}/>}
          {selected.kind === 'file' && selected.fileKind === 'approval' && <PreviewApproval node={selected}/>}
          {selected.kind === 'file' && selected.fileKind === 'audit' && <PreviewAudit node={selected}/>}
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { FilesTreePane });
