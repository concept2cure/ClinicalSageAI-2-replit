/**
 * Vault surface (full) — Phase 5 · doc-first.
 *
 * Replaces the dead Workbench > Vault tab body. Files are documents;
 * we treat them as such. Folder tree on the left, documents panel center
 * (re-uses DocumentsPanel), version+audit drawer on the right.
 */

(() => {

const { I, DocumentsPanel } = window;
const { VAULT_FOLDERS, VAULT_FILES, VAULT_VERSIONS, VAULT_KPIS, VAULT_DOC_FRAMEWORKS } = window;

/* Adapt vault file rows into the DocumentsPanel shape so the same component
   renders them — name → title, type pill → framework, kind → DHF ref slot. */
function fileToDoc(f) {
  return {
    id: f.id,
    framework: f.kind === 'submission' ? 'k510' :
               f.kind === 'risk' || f.kind === 'engineering' ? 'eng' :
               f.kind === 'labeling' ? 'k510' :
               f.kind === 'clinical' ? 'pma' :
               f.kind === 'capa' ? 'eng' :
               f.kind === 'qms' ? 'qms' :
               f.kind === 'agency' ? 'agency' : 'eng',
    type: f.kind,
    title: f.name,
    ver: f.ver,
    status: f.status,
    completion: f.status === 'locked' ? 100 : f.status === 'review' ? 88 : 64,
    blocker: false,
    owner: f.author,
    reviewers: [],
    lastEdit: f.updated,
    esigRequired: f.esig,
    esigState: f.esig ? 'signed' : 'na',
    signedBy: f.esig ? `${f.author} · ${f.updated}` : null,
    sections: 1,
    sectionsComplete: 1,
    editor: 'vault-viewer',
  };
}

function VaultSurface({ onAskAna, onOpenEditor }) {
  const [folder, setFolder] = React.useState('root');
  const [selected, setSelected] = React.useState('f1');

  const filteredFiles = VAULT_FILES.filter(f =>
    folder === 'root' || f.folder === folder
  );
  const docs = filteredFiles.map(fileToDoc);
  const sel = VAULT_FILES.find(f => f.id === selected) || filteredFiles[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Document vault</h1>
          <div className="page-sub">
            Every program artifact, every version, every signature.
            21 CFR Part 11 audit trail · SHA-256 chained · 7-year minimum retention.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Export the full vault manifest as a signed PDF, including SHA-256 chain validation across all 247 artifacts.')}>
            {I.download} Export manifest
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Upload an artifact to the vault. Confirm program, section, document type, version, and e-signature requirement, then file it with hash + audit entry.')}>
            {I.upload} Upload
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {VAULT_KPIS.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">{k.metric}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="vault-grid">
        {/* Folder rail */}
        <aside className="vault-rail">
          <div className="vault-rail-lbl">Folders</div>
          {VAULT_FOLDERS.map(f => (
            <button
              key={f.id}
              className="vault-tree-row"
              data-active={folder === f.id}
              onClick={() => setFolder(f.id)}
            >
              <span className="ico">{I.folder}</span>
              <span className="lbl">{f.label}</span>
              <span className="n">{f.count}</span>
            </button>
          ))}
        </aside>

        {/* Documents panel - main */}
        <div className="vault-main">
          <DocumentsPanel
            title={`${VAULT_FOLDERS.find(f => f.id === folder)?.label || 'All artifacts'}`}
            subtitle={`${filteredFiles.length} of ${VAULT_FILES.length} artifacts shown · click any row to preview · sparkle to ask AnA`}
            docs={docs}
            frameworks={VAULT_DOC_FRAMEWORKS}
            onOpenEditor={(id) => { setSelected(id); onOpenEditor && onOpenEditor(id); }}
            onAskAna={onAskAna}
          />
        </div>

        {/* Detail drawer */}
        {sel && (
          <aside className="vault-drawer">
            <div className="drawer-head">
              <div className="drawer-eyebrow">{sel.prog} · {sel.kind}</div>
              <div className="drawer-title">{sel.name}</div>
            </div>
            <div className="drawer-meta">
              <div><div className="k">Version</div><div className="v mono">{sel.ver}</div></div>
              <div><div className="k">Size</div><div className="v mono">{sel.size}</div></div>
              <div><div className="k">Status</div><div className="v"><span className={`status-pill ${sel.status}`}>{sel.status}</span></div></div>
              <div><div className="k">Linked</div><div className="v">{sel.linked} artifacts</div></div>
              <div><div className="k">Author</div><div className="v">{sel.author}</div></div>
              <div><div className="k">Retention</div><div className="v">{sel.retention}</div></div>
              <div><div className="k">Distribution</div><div className="v">{sel.distribution}</div></div>
              <div><div className="k">SHA-256</div><div className="v mono tiny">{sel.hash}</div></div>
            </div>

            <div className="drawer-actions">
              <button className="btn primary small" onClick={() => onAskAna(`Download ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash}) — confirm distribution policy and log access to audit trail.`)}>
                {I.download} Download
              </button>
              <button className="btn ghost small" onClick={() => onAskAna(`Preview ${sel.name} — surface outline, claims, and any open blockers.`)}>
                {I.eye} Preview
              </button>
            </div>

            <div className="drawer-section-lbl">Version history</div>
            {VAULT_VERSIONS.map((v, i) => (
              <div key={i} className="version-row" data-status={v.status}>
                <span className="mono version-v">{v.v}</span>
                <div className="version-body">
                  <div className="version-meta">{v.when} · {v.author}</div>
                  <div className="version-note">{v.note}</div>
                </div>
              </div>
            ))}

            <div className="drawer-section-lbl">Recent audit</div>
            <div className="audit-row"><span className="mono">A-9924812</span><span>Signed · {sel.author} · {sel.updated}</span></div>
            <div className="audit-row"><span className="mono">A-9924809</span><span>SHA-256 verified · system · 2m ago</span></div>
            <div className="audit-row"><span className="mono">A-9924801</span><span>Uploaded · {sel.author} · 6d ago</span></div>
          </aside>
        )}
      </div>
    </>
  );
}

window.VaultSurface = VaultSurface;

})();
