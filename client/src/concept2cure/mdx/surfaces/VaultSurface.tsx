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
 * Data: useVault(programId) against GET /api/mdx/vault — live rows or an
 * honest empty; version history for the selected artifact is live
 * (useVaultVersions), and its provenance marker derives from the same value
 * that picks the list. Folder selection validates at render — a folder absent from the
 * current data set falls back to 'root' with no state-sync effect.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import type { KitDocument, KitDocFramework, DocStatus } from '../components/DocumentsPanel';
import {
  VAULT_DOC_FRAMEWORKS,
  vaultFoldersForFiles,
  vaultKpisForFiles,
  vaultKpisNotRead,
  type VaultFile,
  type VaultVersion,
} from '../data/vault';
import { UUID_RE, useVault, useVaultAuditTrail, useVaultVersions } from '../hooks/useVault';
import { useVaultUpload, VAULT_UPLOAD_ACCEPT } from '../../v2/useVaultUpload';
import { ErrorState } from '../../v2/dataConnect';
import { downloadVaultFile } from '../../v2/editor/vaultPdfViewer';
import { downloadBlob, safeFileName } from '../../v2/download';
import { redactInternals } from '@/lib/queryClient';
import type { Program } from '../data/programs';

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

const NO_FILES: VaultFile[] = [];
const NO_VERSIONS: VaultVersion[] = [];

export function toDocStatus(status: VaultFile['status']): DocStatus {
  if (status === 'locked') return 'locked';
  if (status === 'final') return 'ready';
  return status;
}

/** How far through authoring a document is — or NULL when nobody has assessed
 *  that. An uploaded file has no sections and no authoring workflow, so every
 *  number here would be invented. It used to get 64 (the else-branch of a
 *  ternary written for authored documents), which read on screen as a document
 *  two-thirds written. Advancing the ingest pipeline's status would have made
 *  it 100 instead — a worse lie, because it asserts a completion nobody
 *  assessed. The repo's own precedent is `assessed: false` in
 *  readinessEvaluator.ts, for exactly this. */
export function completionOf(status: VaultFile['status']): number | null {
  if (status === 'uploaded') return null;
  if (status === 'locked' || status === 'final') return 100;
  /* 'review' used to be 88 and 'draft' 64. Neither was measured: a vault row
     carries a status, not a section count, so the only completion it can
     state is the one a locked or final status implies. Anything short of that
     is unassessed — the same reasoning the comment above gives for uploads. */
  return null;
}

function fileToDoc(f: VaultFile): KitDocument {
  return {
    id: f.id,
    framework: KIND_TO_FRAMEWORK[f.kind] ?? 'eng',
    type: f.kind,
    title: f.name,
    ver: f.ver,
    status: toDocStatus(f.status),
    completion: completionOf(f.status),
    blocker: f.blocker === true,
    owner: f.author,
    reviewers: [],
    lastEdit: f.updated,
    esigRequired: f.esig,
    /* No signature state is asserted. This used to read `esig ? 'signed'`
       with `signedBy: author · updated` — a signature manifestation (21 CFR
       11.50) built from the creator's name and the last-edit time. The vault
       list exposes only a boolean `metadata.eSig`: no signer, no time, no
       meaning. A signature is shown from the signature record, or not at all. */
    esigState: undefined,
    signedBy: undefined,
    /* A vault row has no sections; "1/1" claimed a complete one. */
    sections: 0,
    sectionsComplete: 0,
    editor: 'vault-viewer',
  };
}

export function VaultSurface({ program, onAskAna, onOpenEditor }: VaultSurfaceProps) {
  const [folder, setFolder] = React.useState('root');
  const [selected, setSelected] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  /* The shared ingest path, not a second copy of it — see ../../v2/useVaultUpload. */
  const { uploading, note, clearNote, upload } = useVaultUpload(program?.id ?? null);

  /* Live rows or nothing.
   *
   * This read was once `const usingSample = !live.files || live.files.length
   * === 0`, the `live ?? FIXTURE` pattern spelled differently: it fired on
   * exactly the occasions a user cannot detect — an empty tenant, an expired
   * token, a 500, a fetch that has not started — and showed `VAULT_FILES`,
   * fourteen invented documents with invented SHA-256 hashes and `esig: true`
   * signatures, under a subtitle reading "21 CFR Part 11 audit trail · SHA-256
   * chained". The fixtures were deleted first, then the sample mode that could
   * still reach them (2026-10-14). */
  const live = useVault(program?.id ?? null);
  const liveFiles = live.files && live.files.length ? (live.files as VaultFile[]) : null;
  /* Live or nothing. VAULT_FILES and VAULT_VERSIONS are deleted — see the
     note in data/vault.ts. */
  const allFiles: VaultFile[] = liveFiles ?? NO_FILES;
  /* Slice 0 (map row `device-vault`): `live.loading` had no reader, so the
     KPI strip, the folder rail and the panel counted NO_FILES while the list
     was in flight and after it failed: "Artifacts in vault 0", "0.0 MB",
     "0 of 0 artifacts shown", beside the error banner. A count is stated for
     a list that answered, and 0 only for one that answered empty. */
  const answered = live.files !== null;
  const notRead = live.error ? 'Could not be read' : live.loading ? 'Loading…' : 'Not read yet';
  const folders = liveFiles
    ? (live.folders ?? vaultFoldersForFiles(allFiles))
    : vaultFoldersForFiles(allFiles);
  const kpis = liveFiles
    ? (live.kpis ?? vaultKpisForFiles(allFiles))
    : answered
      ? vaultKpisForFiles(allFiles)
      : vaultKpisNotRead(notRead);

  /* Selection validates at render — a folder id absent from the current
     data set (live ↔ sample flip, live program switch) reads as 'root'. */
  const activeFolder = folders.some(f => f.id === folder) ? folder : 'root';

  const filteredFiles = allFiles.filter(f => activeFolder === 'root' || f.folder === activeFolder);
  const docs = filteredFiles.map(fileToDoc);
  const sel = allFiles.find(f => f.id === selected) || filteredFiles[0];
  /* Slice 0 (map row `device-vault`): /api/mdx/vault/:id/versions and /audit
     read concept2cure_artifacts only, so an uploaded file is a 404 on both and
     the drawer said its history "could not be loaded". It is not asked. */
  const selIsUpload = sel?.source === 'upload';

  /* Live version history for the selected artifact. Same boundary: the fixture
     is reachable only through sample mode, and `VAULT_VERSIONS` is Part 11
     version history — the record whose value is that nobody authored it. */
  const liveVersionsQuery = useVaultVersions(liveFiles && sel && !selIsUpload ? sel.id : null);
  const liveVersions =
    liveFiles && liveVersionsQuery.versions && liveVersionsQuery.versions.length
      ? liveVersionsQuery.versions
      : null;
  const versions: VaultVersion[] = liveVersions ?? NO_VERSIONS;
  /* The selected artifact's own audit trail, from audit_logs by record id,
     under the Vault's own route (production refuses /api/mdx/audit). */
  const selAudit = useVaultAuditTrail(liveFiles && sel && !selIsUpload ? sel.id : null);

  /* Slice 0 (map row `device-vault`): Download only sent AnA a prompt ("…
     and log access to audit trail") and no file came back. An uploaded file of
     the open project now goes through the project vault's audited route, by
     the shared helper every Vault file view uses (v2/editor/vaultPdfViewer):
     the server records the download and checks the bytes against their hash
     before serving them. The list is filtered to that project only when its id
     is a uuid, so only then is the project known to hold the file. */
  const projectUuid = program?.id && UUID_RE.test(program.id) ? program.id : null;
  const [downloading, setDownloading] = React.useState(false);
  const [downloadNote, setDownloadNote] = React.useState<{ id: string; text: string } | null>(null);
  const downloadSelected = async (f: VaultFile) => {
    if (!projectUuid || !f.documentId || downloading) return;
    setDownloading(true);
    setDownloadNote(null);
    const failed = (why: string) =>
      setDownloadNote({ id: f.id, text: `${f.name} was not downloaded — ${why.replace(/\.$/, '')}.` });
    try {
      const file = await downloadVaultFile(projectUuid, f.documentId, { title: f.name, hash: f.hash });
      if (file.kind === 'refused') return failed(file.message);
      const pdfName = safeFileName(f.name, 'document');
      const name = file.kind === 'download' ? file.name : /\.pdf$/i.test(pdfName) ? pdfName : `${pdfName}.pdf`;
      if (!downloadBlob(name, file.blob)) failed('the browser refused the download');
    } catch (e) {
      failed(redactInternals(e instanceof Error ? e.message : '', 'the vault did not serve it'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Document vault</h1>
          {/* Slice 0 (map row `device-vault`): this read "Every program artifact,
              every version, every signature. 21 CFR Part 11 audit trail · SHA-256
              chained · 7-year minimum retention". The page does not read or
              verify a chain, and it stated a 7-year minimum while the platform
              default is 25 years (ADR-0014 §6) and organization-set. It shows
              neither, so the claim comes off. Per-document versions and audit
              are read here for authored documents only (see `selIsUpload`). */}
          <div className="page-sub">
            Documents in the vault. Authored documents show their versions and audit trail here.
          </div>
        </div>
        <div className="page-actions">
          {/* Slice 0 (map row `device-vault`): an *Export manifest* button stood
              here. It only sent AnA a request for "the full vault manifest as a
              signed PDF"; no AnA tool or route builds one, so it is removed. A
              project's export manifest is on the founder's list (map section 5.9). */}
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
          accept={VAULT_UPLOAD_ACCEPT}
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
                ? 'File a document into this project’s vault'
                : 'Uploading is available once a project is open'
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

      {live.error && !liveFiles && (
        <ErrorState
          title="Could not load the vault"
          message={live.error}
          retry={live.refresh}
          testId="vault-error"
        />
      )}

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
              <span className="n">{answered ? f.count : '—'}</span>
            </button>
          ))}
        </aside>

        {/* Documents panel — main */}
        <div className="vault-main">
          {/* Until the list answers, the panel names the read's state and
              offers no framework filter, whose counts would all be 0. */}
          <DocumentsPanel
            title={folders.find(f => f.id === activeFolder)?.label || 'All artifacts'}
            subtitle={
              answered
                ? `${filteredFiles.length} of ${allFiles.length} artifacts shown · click any row to preview · sparkle to ask AnA`
                : live.error
                  ? 'The vault list could not be read'
                  : notRead
            }
            docs={docs}
            frameworks={answered ? (VAULT_DOC_FRAMEWORKS as unknown as KitDocFramework[]) : undefined}
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
              {/* Slice 0 (map row `device-vault`): read "Linked 0 artifacts"
                  for every file from a literal 0. Shown once a read supplies
                  the count (VaultFile.linked). */}
              {sel.linked !== null && (
                <div>
                  <div className="k">Linked</div>
                  <div className="v">{sel.linked} artifacts</div>
                </div>
              )}
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
              {/* Slice 0: a real download where the governed route can serve
                  it; elsewhere (an authored artifact has no stored file, and
                  with no project open the holding project is not known) the
                  button says what it does. Its prompt no longer claims AnA
                  logs an access it cannot record. */}
              {projectUuid && sel.documentId ? (
                <button
                  className="btn primary small"
                  disabled={downloading}
                  onClick={() => void downloadSelected(sel)}
                >
                  {I.download} {downloading ? 'Downloading…' : 'Download'}
                </button>
              ) : (
                <button
                  className="btn primary small"
                  onClick={() =>
                    onAskAna(
                      `Tell me about ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash})` +
                        (sel.distribution ? `, including its distribution policy (${sel.distribution})` : '') +
                        '.',
                    )
                  }
                >
                  {I.sparkles} Ask AnA about this file
                </button>
              )}
              <button
                className="btn ghost small"
                onClick={() =>
                  onAskAna(`Preview ${sel.name} — surface outline, claims, and any open blockers.`)
                }
              >
                {I.eye} Preview
              </button>
            </div>

            {downloadNote && downloadNote.id === sel.id && (
              <ErrorState
                variant="inline"
                title="Download failed"
                message={downloadNote.text}
                onDismiss={() => setDownloadNote(null)}
                testId="vault-download-error"
              />
            )}

            <div className="drawer-section-lbl">
              Version history
            </div>
            {selIsUpload ? (
              <div className="version-note" data-testid="vault-versions-upload">
                This page does not show versions of uploaded files. The project’s Vault lists each version.
              </div>
            ) : versions.length === 0 && (
              <div className="version-note">
                {liveVersionsQuery.error
                  ? 'Version history could not be loaded.'
                  : liveVersionsQuery.loading
                    ? 'Loading version history…'
                    : 'No versions recorded for this artifact.'}
              </div>
            )}
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

            {/* This block used to be three hardcoded rows under "Recent audit
                · sample" — A-9924812 "Signed · {author} · {updated}", a SHA-256
                verification "2m ago", an upload "6d ago" — interpolated with the
                REAL artifact's author and date, on every live artifact. A
                signature event and a hash verification nobody performed, on the
                surface subtitled "21 CFR Part 11 audit trail". The rows now come
                from audit_logs for this record id, or the block says why not. */}
            <div className="drawer-section-lbl">Recent audit</div>
            {selIsUpload ? (
              <div className="version-note" data-testid="vault-audit-upload">
                This page does not show the audit trail of uploaded files. The project’s Vault shows each
                document’s history.
              </div>
            ) : selAudit.error ? (
              <div className="version-note" data-testid="vault-audit-error">
                The audit trail for this artifact could not be loaded.
              </div>
            ) : selAudit.loading || selAudit.events === null ? (
              <div className="version-note">Loading audit trail…</div>
            ) : selAudit.events.length === 0 ? (
              <div className="version-note" data-testid="vault-audit-empty">
                No audit events recorded for this artifact.
              </div>
            ) : (
              selAudit.events.map((e) => (
                <div key={e.id} className="audit-row">
                  <span className="mono">{e.id}</span>
                  <span>
                    {e.action} · {e.actorName || e.actor} · {e.when}
                  </span>
                </div>
              ))
            )}
          </aside>
        )}
      </div>
    </>
  );
}
