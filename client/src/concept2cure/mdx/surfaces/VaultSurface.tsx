/**
 * VaultSurface — the document management surface (Workbench › Vault).
 *
 * Extracted from workbench/Workbench.tsx into its own surface file so
 * the vault follows the same surface/data/hooks structure as the other
 * MDX surfaces. Expanded toward the kit design in
 * design-system/ui_kits/mdx/surfaces/Vault.jsx: KPI strip, folder rail,
 * retention + distribution policy in the detail drawer, live version
 * history.
 *
 * Data: useVault(programId) against GET /api/mdx/vault with fixture
 * fallback per the SampleDataBanner contract — when the live fetch is
 * idle, errors, or returns no rows, the canonical fixtures from
 * data/vault.ts render instead and the banner marks them as sample.
 */

import * as React from 'react';
import { I } from '../icons';
import {
  VAULT_FILES,
  VAULT_FILTERS,
  VAULT_FOLDERS,
  VAULT_KPIS,
  VAULT_VERSIONS,
  type VaultFile,
  type VaultVersion,
} from '../data/vault';
import { useVault, useVaultVersions } from '../hooks/useVault';
import { SampleDataBanner } from '../components/SampleDataBanner';
import type { Program } from '../data/programs';

export interface VaultSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  /** Open a document in the editor — host wires this to the v2 editor route. */
  onOpenEditor?: (docId: string) => void;
}

function exportManifest(files: VaultFile[]) {
  const headers = [
    'Name', 'Type', 'Kind', 'Program', 'Size', 'Version', 'Status',
    'Updated', 'Author', 'Retention', 'Distribution', 'SHA-256',
  ];
  const rows = files.map(f => [
    f.name, f.type, f.kind, f.prog, f.size, f.ver, f.status,
    f.updated, f.author, f.retention ?? '—', f.distribution ?? '—', f.hash,
  ]);
  const csv = [headers, ...rows]
    .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-manifest-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function VaultSurface({ program, onAskAna, onOpenEditor }: VaultSurfaceProps) {
  const [folder, setFolder] = React.useState('root');
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);

  const live = useVault(program?.id ?? null);
  const usingSample = !live.files || live.files.length === 0;
  const allFiles = usingSample ? VAULT_FILES : (live.files as VaultFile[]);
  const folders = usingSample ? VAULT_FOLDERS : (live.folders ?? VAULT_FOLDERS);
  const kpis = usingSample ? VAULT_KPIS : (live.kpis ?? VAULT_KPIS);

  /* Reset folder selection when the folder set changes shape (live ↔ sample). */
  React.useEffect(() => {
    if (!folders.some(f => f.id === folder)) setFolder('root');
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [usingSample]);

  const files = allFiles.filter(
    f =>
      (folder === 'root' || f.folder === folder) &&
      (filter === 'all' || f.kind === filter) &&
      (!query ||
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.hash.toLowerCase().includes(query.toLowerCase()) ||
        f.author.toLowerCase().includes(query.toLowerCase())),
  );
  const sel = allFiles.find(f => f.id === selected) || files[0];

  /* Live version history for the selected artifact; fixture fallback. */
  const liveVersions = useVaultVersions(!usingSample && sel ? sel.id : null);
  const versions: VaultVersion[] =
    (!usingSample && liveVersions.versions && liveVersions.versions.length
      ? liveVersions.versions
      : VAULT_VERSIONS);
  const versionsAreSample = usingSample || !liveVersions.versions || liveVersions.versions.length === 0;

  const totalSize = files.reduce((s, f) => s + (parseFloat(f.size) || 0), 0);

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
          <button className="btn ghost small" onClick={() => exportManifest(files)}>
            {I.download} Export manifest
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Walk me through uploading a document to the vault. Confirm the program, section, document type, ' +
                  'version, and whether an e-signature is required, then file it into the right folder with hash + audit entry.',
              )
            }
          >
            {I.plus} Upload
          </button>
        </div>
      </div>

      <SampleDataBanner show={usingSample} loading={live.loading} label="vault artifacts" />

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone || ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="vault-layout">
        <aside className="vault-tree">
          <div className="vault-tree-lbl">Folders</div>
          {folders.map(f => (
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
          <div className="vault-tree-lbl" style={{ marginTop: 14 }}>
            Types
          </div>
          {VAULT_FILTERS.map(f => (
            <button
              key={f.id}
              className="vault-tree-row small"
              data-active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              <span className="lbl">{f.label}</span>
            </button>
          ))}
        </aside>

        <section className="vault-main">
          <div className="vault-searchrow">
            <div className="vault-search">
              <span className="ico">{I.search}</span>
              <input
                placeholder="Search files, hashes, authors…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <span className="vault-meta">
              {files.length} files{totalSize > 0 && <> · {totalSize.toFixed(1)} MB</>}
            </span>
          </div>

          <div className="ctable">
            <div
              className="ctable-head"
              style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}
            >
              <div>Name</div>
              <div>Type</div>
              <div>Size</div>
              <div>Version</div>
              <div>Status</div>
              <div>Updated</div>
            </div>
            {files.map(f => (
              <button
                key={f.id}
                className="ctable-row"
                style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}
                data-on={sel?.id === f.id}
                onClick={() => setSelected(f.id)}
                onDoubleClick={() => onOpenEditor?.(f.id)}
              >
                <div className="vault-name">
                  <span className={`vault-type ${f.type}`}>{f.type}</span>
                  <span className="ctable-strong">{f.name}</span>
                  {f.blocker && <span className="pill-err small">blocker</span>}
                  {f.esig && (
                    <span className="vault-esig" title="E-signed">
                      {I.shieldCheck}
                    </span>
                  )}
                </div>
                <div>{f.kind}</div>
                <div className="mono">{f.size}</div>
                <div className="mono">{f.ver}</div>
                <div>
                  <span className={`status-pill ${f.status}`}>{f.status}</span>
                </div>
                <div>{f.updated}</div>
              </button>
            ))}
            {files.length === 0 && (
              <div className="ctable-row" style={{ gridTemplateColumns: '1fr' }}>
                <div style={{ color: 'var(--text-400)' }}>
                  No artifacts match the current folder, type, and search.
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="vault-drawer">
          {sel && (
            <>
              <div className="drawer-head">
                <div className="drawer-eyebrow">
                  {sel.prog} · {sel.kind}
                </div>
                <div className="drawer-title">{sel.name}</div>
              </div>
              <div className="drawer-meta">
                <div>
                  <div className="k">Version</div>
                  <div className="v mono">{sel.ver}</div>
                </div>
                <div>
                  <div className="k">Size</div>
                  <div className="v mono">{sel.size}</div>
                </div>
                <div>
                  <div className="k">Status</div>
                  <div className="v">
                    <span className={`status-pill ${sel.status}`}>{sel.status}</span>
                  </div>
                </div>
                <div>
                  <div className="k">Linked</div>
                  <div className="v">{sel.linked} artifacts</div>
                </div>
                <div>
                  <div className="k">Author</div>
                  <div className="v">{sel.author}</div>
                </div>
                {sel.retention && (
                  <div>
                    <div className="k">Retention</div>
                    <div className="v">{sel.retention}</div>
                  </div>
                )}
                {sel.distribution && (
                  <div>
                    <div className="k">Distribution</div>
                    <div className="v">{sel.distribution}</div>
                  </div>
                )}
                <div>
                  <div className="k">SHA-256</div>
                  <div className="v mono tiny">{sel.hash}</div>
                </div>
              </div>

              <div className="drawer-actions">
                <button
                  className="btn primary small"
                  onClick={() =>
                    onAskAna(
                      `Download ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash}) from the vault — ` +
                        `confirm export is permitted under the program's distribution policy` +
                        (sel.distribution ? ` (${sel.distribution})` : '') +
                        ` and log the access in the audit trail.`,
                    )
                  }
                >
                  {I.download} Download
                </button>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    onAskAna(
                      `Preview ${sel.name} (${sel.kind} · ${sel.ver}). Surface its outline, key claims, and any open blockers without leaving the vault.`,
                    )
                  }
                >
                  {I.eye} Preview
                </button>
                <button className="btn ghost small" onClick={() => onAskAna(`Summarize ${sel.name}`)}>
                  {I.sparkles} Ask Claude
                </button>
              </div>

              <div className="drawer-section-lbl">
                Version history{versionsAreSample ? ' · sample' : ''}
              </div>
              {versions.map((v, i) => (
                <div key={i} className="version-row" data-status={v.status}>
                  <span className="mono version-v">{v.v}</span>
                  <div className="version-body">
                    <div className="version-meta">
                      {v.when} · {v.author}
                    </div>
                    <div className="version-note">{v.note}</div>
                  </div>
                </div>
              ))}

              <div className="drawer-section-lbl">Audit trail</div>
              <div className="audit-row">
                <span className="mono">AUD-9101</span>
                <span>
                  Signed by {sel.author} · {sel.updated}
                </span>
              </div>
              <div className="audit-row">
                <span className="mono">AUD-9098</span>
                <span>Checksum verified · system</span>
              </div>
              <div className="audit-row">
                <span className="mono">AUD-9094</span>
                <span>Uploaded · {sel.author}</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
