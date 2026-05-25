/**
 * VaultSurface — Phase 5 doc-first.
 *
 * Replaces the dead Workbench > Vault tab body. Folder rail on the
 * left, DocumentsPanel center, version + audit drawer on the right.
 * Every artifact: SHA-256 hashed, 21 CFR Part 11 chained, retention-
 * policy aware.
 *
 * Cross-program surface. Port basis:
 * design-system/ui_kits/mdx/surfaces/Vault.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  VAULT_DOC_FRAMEWORKS,
  VAULT_FILES,
  VAULT_FOLDERS,
  VAULT_KPIS,
  VAULT_VERSIONS,
} from '../data/vault';
import { useVault } from '../hooks/useVault';
import { SampleDataBanner } from '../components/SampleDataBanner';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface VaultSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

type VaultFile = (typeof VAULT_FILES)[number];

/* Adapt a vault file row into the DocumentsPanel shape. The framework
 * mapping mirrors the kit logic line-by-line so a vault row renders
 * with the same chip palette every other surface uses. */
function fileToDoc(f: VaultFile): KitDocument {
  const framework =
    f.kind === 'submission'
      ? 'k510'
      : f.kind === 'risk' || f.kind === 'engineering'
      ? 'eng'
      : f.kind === 'labeling'
      ? 'k510'
      : f.kind === 'clinical'
      ? 'pma'
      : f.kind === 'capa'
      ? 'eng'
      : f.kind === 'qms'
      ? 'qms'
      : f.kind === 'agency'
      ? 'agency'
      : 'eng';
  return {
    id: f.id,
    framework,
    type: f.kind,
    title: f.name,
    ver: f.ver,
    status: f.status as KitDocument['status'],
    completion:
      f.status === 'locked' ? 100 : f.status === 'review' ? 88 : 64,
    blocker: false,
    owner: f.author,
    reviewers: [],
    lastEdit: f.updated,
    esigRequired: f.esig,
    esigState: f.esig ? 'signed' : 'na',
    signedBy: f.esig ? `${f.author} · ${f.updated}` : undefined,
    sections: 1,
    sectionsComplete: 1,
    editor: 'vault-viewer',
  };
}

export function VaultSurface({ onAskAna, onOpenEditor }: VaultSurfaceProps) {
  const live = useVault();
  const folders = live.folders ?? VAULT_FOLDERS;
  const files = live.files ?? VAULT_FILES;
  const versions = live.versions ?? VAULT_VERSIONS;
  const kpis = live.kpis ?? VAULT_KPIS;
  const frameworks = VAULT_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const [folder, setFolder] = React.useState<string>('root');
  const [selected, setSelected] = React.useState<string>(files[0]?.id ?? '');

  const filteredFiles = files.filter(
    (f) => folder === 'root' || f.folder === folder,
  );
  const docs = filteredFiles.map(fileToDoc);
  const sel = files.find((f) => f.id === selected) ?? filteredFiles[0];
  const folderLabel =
    folders.find((f) => f.id === folder)?.label ?? 'All artifacts';

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Document vault</h1>
          <div className="page-sub">
            Every program artifact, every version, every signature. 21 CFR
            Part 11 audit trail · SHA-256 chained · 7-year minimum retention.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                `Export the full vault manifest as a signed PDF, including SHA-256 chain validation across all ${files.length} artifacts.`,
              )
            }
            type="button"
          >
            {I.download} Export manifest
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Upload an artifact to the vault. Confirm program, section, document type, version, and e-signature requirement, then file it with hash + audit entry.',
              )
            }
            type="button"
          >
            {I.upload} Upload
          </button>
        </div>
      </div>

      <SampleDataBanner show={live.files === null} loading={live.loading} label="documents" />

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <div className="vault-grid">
        <aside className="vault-rail">
          <div className="vault-rail-lbl">Folders</div>
          {folders.map((f) => (
            <button
              key={f.id}
              className="vault-tree-row"
              data-active={folder === f.id || undefined}
              onClick={() => setFolder(f.id)}
              type="button"
            >
              <span className="ico">{I.folder}</span>
              <span className="lbl">{f.label}</span>
              <span className="n">{f.count}</span>
            </button>
          ))}
        </aside>

        <div className="vault-main">
          <DocumentsPanel
            title={folderLabel}
            subtitle={`${filteredFiles.length} of ${files.length} artifacts shown · click any row to preview · sparkle to ask AnA`}
            docs={docs}
            frameworks={frameworks}
            onOpenEditor={(id) => {
              setSelected(id);
              onOpenEditor?.(id);
            }}
            onAskAna={(text) => onAskAna(text)}
          />
        </div>

        {sel && (
          <aside className="vault-drawer">
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
              <div>
                <div className="k">Retention</div>
                <div className="v">{sel.retention}</div>
              </div>
              <div>
                <div className="k">Distribution</div>
                <div className="v">{sel.distribution}</div>
              </div>
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
                    `Download ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash}) — confirm distribution policy and log access to audit trail.`,
                  )
                }
                type="button"
              >
                {I.download} Download
              </button>
              <button
                className="btn ghost small"
                onClick={() =>
                  onAskAna(
                    `Preview ${sel.name} — surface outline, claims, and any open blockers.`,
                  )
                }
                type="button"
              >
                {I.eye} Preview
              </button>
            </div>

            <div className="drawer-section-lbl">Version history</div>
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

            <div className="drawer-section-lbl">Recent audit</div>
            <div className="audit-row">
              <span className="mono">A-9924812</span>
              <span>
                Signed · {sel.author} · {sel.updated}
              </span>
            </div>
            <div className="audit-row">
              <span className="mono">A-9924809</span>
              <span>SHA-256 verified · system · 2m ago</span>
            </div>
            <div className="audit-row">
              <span className="mono">A-9924801</span>
              <span>Uploaded · {sel.author} · 6d ago</span>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
