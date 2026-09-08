/**
 * VaultSurface — the document management surface (Document vault).
 *
 * Port of the kit's Phase 5 full vault surface
 * (ui_kits/mdx/surfaces/Vault.jsx, mapped to this file by
 * PHASE_5_INSTALL.md): folder rail on the left, DocumentsPanel as the
 * center pane (framework filter pills included), version + audit drawer
 * on the right — replacing the old workbench-tab body this surface
 * originally shipped with.
 *
 * Data: useVault(programId) against GET /api/mdx/vault with fixture
 * fallback per the SampleDataBanner contract; version history for the
 * selected artifact is live (useVaultVersions) with fixture fallback,
 * and its provenance marker derives from the same value that picks the
 * list. Folder selection validates at render — a folder absent from the
 * current data set falls back to 'root' with no state-sync effect.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import type { KitDocument, KitDocFramework, DocStatus } from '../components/DocumentsPanel';
import {
  VAULT_DOC_FRAMEWORKS,
  VAULT_FILES,
  VAULT_VERSIONS,
  vaultFoldersForFiles,
  vaultKpisForFiles,
  type VaultFile,
  type VaultVersion,
} from '../data/vault';
import { useVault, useVaultVersions } from '../hooks/useVault';
import { SampleDataBanner } from '../components/SampleDataBanner';
import { useVaultUpload } from '../../v2/useVaultUpload';
import { ErrorState } from '../../v2/dataConnect';
import type { Program } from '../data/programs';
import { useSampleRows, useSampleValue } from '../lib/useSampleRows';

export interface VaultSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  /** Open a document in the editor — host wires this to the v2 editor route. */
  onOpenEditor?: (docId: string) => void;
}

/** Adapt vault file rows into the DocumentsPanel shape (kit fileToDoc):
 *  name → title, kind → framework tag, status → doc lifecycle. */
const KIND_TO_FRAMEWORK: Record<string, string> = {
  submission: 'k510',
  label: 'k510',
  clinical: 'pma',
  csr: 'pma',
  protocol: 'pma',
  resp: 'agency',
  qms: 'qms',
  template: 'qms',
  cert: 'qms',
};

function toDocStatus(status: VaultFile['status']): DocStatus {
  if (status === 'locked') return 'locked';
  if (status === 'final') return 'ready';
  return status;
}

function fileToDoc(f: VaultFile): KitDocument {
  return {
    id: f.id,
    framework: KIND_TO_FRAMEWORK[f.kind] ?? 'eng',
    type: f.kind,
    title: f.name,
    ver: f.ver,
    status: toDocStatus(f.status),
    completion: f.status === 'locked' || f.status === 'final' ? 100 : f.status === 'review' ? 88 : 64,
    blocker: f.blocker === true,
    owner: f.author,
    reviewers: [],
    lastEdit: f.updated,
    esigRequired: f.esig,
    esigState: f.esig ? 'signed' : 'na',
    signedBy: f.esig ? `${f.author} · ${f.updated}` : null as unknown as string | undefined,
    sections: 1,
    sectionsComplete: 1,
    editor: 'vault-viewer',
  };
}

export function VaultSurface({ program, onAskAna, onOpenEditor }: VaultSurfaceProps) {
  const [folder, setFolder] = React.useState('root');
  const [selected, setSelected] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  /* The shared ingest path, not a second copy of it — see ../../v2/useVaultUpload. */
  const { uploading, note, clearNote, upload } = useVaultUpload(program?.id ?? null);

  /* THE GATE, and why it is `useSampleRows` and not a truthiness check.
   *
   * This read was `const usingSample = !live.files || live.files.length === 0`,
   * which is not a sample-mode gate at all — it is the `live ?? FIXTURE`
   * pattern `../lib/useSampleRows` exists to eliminate, spelled differently.
   * It fires on exactly the occasions a user cannot detect: an empty tenant, an
   * expired token, a 500, a fetch that has not started.
   *
   * On this surface that mattered more than on most. `VAULT_FILES` carries
   * `hash: 'a91e…4f02'` and `esig: true` on 14 rows; `fileToDoc` above turns
   * `esig` into `esigState: 'signed'` plus a `signedBy` assembled from the
   * fixture's author and date, and the detail pane renders `{sel.hash}` under
   * the literal label SHA-256 — all of it beneath a page subtitle that reads
   * "21 CFR Part 11 audit trail · SHA-256 chained". So a tenant with an empty
   * vault, or one whose token had expired, was shown fourteen invented
   * documents with invented content hashes and invented signatures, in the one
   * surface whose entire claim is that those three things are real.
   *
   * `useSampleRows` returns the fixture only when the user has explicitly
   * turned sample mode on — impossible in a production build — and otherwise
   * returns the live rows or an honest empty. `SampleDataBanner` below still
   * marks the sample case; the banner was never the missing piece. */
  const live = useVault(program?.id ?? null);
  const liveFiles = live.files && live.files.length ? (live.files as VaultFile[]) : null;
  const allFiles = useSampleRows<VaultFile>(liveFiles, VAULT_FILES);
  const usingSample = liveFiles === null && allFiles.length > 0;
  const folders = liveFiles
    ? (live.folders ?? vaultFoldersForFiles(allFiles))
    : vaultFoldersForFiles(allFiles);
  const kpis = liveFiles ? (live.kpis ?? vaultKpisForFiles(allFiles)) : vaultKpisForFiles(allFiles);

  /* Selection validates at render — a folder id absent from the current
     data set (live ↔ sample flip, live program switch) reads as 'root'. */
  const activeFolder = folders.some(f => f.id === folder) ? folder : 'root';

  const filteredFiles = allFiles.filter(f => activeFolder === 'root' || f.folder === activeFolder);
  const docs = filteredFiles.map(fileToDoc);
  const sel = allFiles.find(f => f.id === selected) || filteredFiles[0];

  /* Live version history for the selected artifact. Same boundary: the fixture
     is reachable only through sample mode, and `VAULT_VERSIONS` is Part 11
     version history — the record whose value is that nobody authored it. */
  const liveVersionsQuery = useVaultVersions(liveFiles && sel ? sel.id : null);
  const liveVersions =
    liveFiles && liveVersionsQuery.versions && liveVersionsQuery.versions.length
      ? liveVersionsQuery.versions
      : null;
  const versions: VaultVersion[] = useSampleRows(liveVersions, VAULT_VERSIONS);
  const versionsAreSample = liveVersions === null;

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
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                `Export the full vault manifest as a signed PDF, including SHA-256 chain validation across all ${allFiles.length} artifacts.`,
              )
            }
          >
            {I.download} Export manifest
          </button>
          {/* A REAL upload.
              This button used to call `onAskAna('Upload an artifact to the
              vault. …')` — it opened a chat prompt describing an upload
              instead of performing one, on the surface whose own subtitle two
              lines above promises a SHA-256-chained Part 11 audit trail. There
              was no file input anywhere in the MDX lane, so a device team could
              not put a document into their vault at all. The bytes now go to
              POST /api/vault/ingest, which hashes them, stores them and writes
              the audit row. */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.rtf,.xlsx,.xls,.csv,.md"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const picked = e.target.files;
              e.target.value = '';
              const outcome = await upload(picked);
              /* Re-read from the server rather than splicing the row in
                 locally: what the vault shows has to be what the server
                 actually stored, hash and all. */
              if (outcome.succeeded.length) live.refresh();
            }}
            /* Same reason as the v2 Vault's picker: WCAG 3.3.2 applies to the
               control, not to whether it is painted, and a script can focus a
               display:none file input. This copy was missed when that one was
               labelled, which is why the a11y sweep still reported one 3.3.2
               finding with the defect recorded as fixed. */
            aria-label="Choose documents to upload to the vault"
          />
          <button
            className="btn primary small"
            disabled={uploading || !program?.id}
            title={
              program?.id
                ? 'File a document into this program’s vault'
                : 'Uploading is available once a program is open'
            }
            onClick={() => fileRef.current?.click()}
          >
            {I.upload} {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {/* The outcome of the last upload, success or refusal, in the caller's
          own words. A failed governed write is never silent. */}
      {note &&
        (note.tone === 'error' ? (
          <ErrorState
            variant="inline"
            title="Some documents were not filed"
            message={note.text}
            onDismiss={clearNote}
          />
        ) : (
          <div className="banner-ok" role="status">{note.text}</div>
        ))}

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

      <div className="vault-grid">
        {/* Folder rail */}
        <aside className="vault-rail">
          <div className="vault-rail-lbl">Folders</div>
          {folders.map(f => (
            <button
              key={f.id}
              className="vault-tree-row"
              data-active={activeFolder === f.id}
              onClick={() => setFolder(f.id)}
            >
              <span className="ico">{I.folder}</span>
              <span className="lbl">{f.label}</span>
              <span className="n">{f.count}</span>
            </button>
          ))}
        </aside>

        {/* Documents panel — main */}
        <div className="vault-main">
          <DocumentsPanel
            title={folders.find(f => f.id === activeFolder)?.label || 'All artifacts'}
            subtitle={`${filteredFiles.length} of ${allFiles.length} artifacts shown · click any row to preview · sparkle to ask AnA`}
            docs={docs}
            frameworks={VAULT_DOC_FRAMEWORKS as unknown as KitDocFramework[]}
            onOpenEditor={id => {
              setSelected(id);
              onOpenEditor?.(id);
            }}
            onAskAna={onAskAna}
          />
        </div>

        {/* Detail drawer */}
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
                    `Download ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash}) — confirm distribution policy` +
                      (sel.distribution ? ` (${sel.distribution})` : '') +
                      ` and log access to audit trail.`,
                  )
                }
              >
                {I.download} Download
              </button>
              <button
                className="btn ghost small"
                onClick={() =>
                  onAskAna(`Preview ${sel.name} — surface outline, claims, and any open blockers.`)
                }
              >
                {I.eye} Preview
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

            {/* Audit rows are kit sample copy until the per-artifact audit
                endpoint ships (PHASE_5_INSTALL: useVaultDetail → versions +
                audit) — labeled honestly so live tenants can't mistake
                fixture entries for their real trail. */}
            <div className="drawer-section-lbl">Recent audit · sample</div>
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
