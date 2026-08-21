import React, { useState, useMemo } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { useVaultUpload } from '../useVaultUpload';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  vaultStatus,
  vaultFileIconKey,
  isVaultDoc,
  flattenDocs,
  type VaultDoc,
  type VaultFolder,
} from '../fixtures/vault-data';
import '../styles/project-home-v2.css';

/* ── GET /api/c2c/project-vault/:id display contract ──
   Real, org-scoped read-model (server/routes/c2c/project-vault.ts, mounted at
   /api/c2c/project-vault behind authenticateToken). Mapped SERVER-SIDE straight
   into this surface's VaultFolder/VaultDoc tree from real tables —
   regulatory_programs, c2c_documents, c2c_rule_packs, c2c_document_sections,
   users. `useLiveData` unwraps the `{ success, data }` envelope, so the payload
   is this object directly (not `.data.data`). `pendingStore` is the honest
   "document store not provisioned in this env" signal (empty tree).

   HONESTY: every VaultDoc field is projected from a real column ('—' where a
   column is absent — never fabricated). The fixture-only cross-cutting DMS
   folders (Agency correspondence, Templates, Working drafts, Sources & evidence,
   Audit) and the previously client-synthesized corpus-indexing / chunk counts
   have NO backing store and are intentionally NOT part of this contract. */
interface VaultDisplayShape {
  program: string;
  spine: string;
  standard: string;
  documentCount: number;
  tree: VaultFolder[];
  pendingStore?: boolean;
}

/* Stable empty tree while the live vault is loading / absent — `useLiveData`
   yields a fresh null every render until it resolves, so deriving `tree` from a
   module-level constant keeps the `allDocs` memo reference-stable and loop-safe
   (spec loop-safety note). */
const EMPTY_TREE: VaultFolder[] = [];

/* Current project id — the runtime channel Projects.tsx sets when a project is
   opened (same read as Inconsistency / CmcModule / ProjectHome). The vault is
   project-scoped, so with no project in context there is nothing to load. */
function currentProjectId(): string | null {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: string | number } }).C2C_PROJECT;
    const id = p && p.id != null ? String(p.id).trim() : '';
    return id || null;
  } catch (_e) {
    return null;
  }
}

/* ── File icon resolver (maps key to I[key]) ── */

function fileIcon(doc: VaultDoc): React.ReactNode {
  const key = vaultFileIconKey(doc);
  return (I as any)[key] || I.fileText || I.file;
}

/* ── VaultTree — recursive folder nav ── */

interface VaultTreeProps {
  nodes: (VaultDoc | VaultFolder)[];
  depth: number;
  activeFolder: string | null;
  onPick: (id: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
}

function VaultTree({ nodes, depth, activeFolder, onPick, expanded, toggle }: VaultTreeProps) {
  return (
    <div>
      {nodes.map((n) => {
        if (isVaultDoc(n)) return null;
        const folder = n as VaultFolder;
        const docs = flattenDocs(folder.children);
        const isOpen = expanded[folder.id] !== false;
        const ready = docs.filter((d) =>
          ['final', 'approved', 'reviewed'].includes(d.status),
        ).length;
        return (
          <div key={folder.id}>
            <button
              className="vd-folder"
              data-on={activeFolder === folder.id || undefined}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => {
                onPick(folder.id);
                toggle(folder.id);
              }}
            >
              <span className="vd-caret" data-open={isOpen || undefined}>
                {I.chevronRight || '›'}
              </span>
              <span className="vd-fico">
                {isOpen ? I.folderOpen || I.folder : I.folder}
              </span>
              <span className="vd-flabel">
                {folder.code ? <b>{folder.code}</b> : null} {folder.label}
              </span>
              <span className="vd-fcount">
                {ready}/{docs.length}
              </span>
            </button>
            {isOpen &&
              folder.children &&
              folder.children.some((c) => !isVaultDoc(c)) && (
                <VaultTree
                  nodes={folder.children}
                  depth={depth + 1}
                  activeFolder={activeFolder}
                  onPick={onPick}
                  expanded={expanded}
                  toggle={toggle}
                />
              )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Vault (DMS) surface ──
   Document management aligned to the real dossier structure. The folder tree IS
   the project's live eCTD / eSTAR / IVDR / TMF spine (segment- and
   build-type-aware), served by GET /api/c2c/project-vault/:id straight from the
   governed document store. Real data → honest empty → honest error; no fixture. */

export function Vault({ onAsk, onNav }: SurfaceViewProps) {
  const projectId = currentProjectId();
  const vaultPath = projectId
    ? '/api/c2c/project-vault/' + encodeURIComponent(projectId)
    : null;
  /* Bumped after an upload so the tree is re-read from the server rather than
     patched locally: what the Vault shows is what the Vault stored. */
  const [vaultEpoch, setVaultEpoch] = useState(0);
  const vaultState = useLiveData<VaultDisplayShape>(vaultPath, [vaultPath, vaultEpoch]);
  const vault = vaultState.data;

  /* Live document tree — real VaultFolder/VaultDoc from the read-model. Stable
     EMPTY_TREE reference while loading/absent so the memo below is loop-safe. */
  const tree: VaultFolder[] = vault?.tree ?? EMPTY_TREE;
  const allDocs = useMemo(() => flattenDocs(tree), [tree]);

  /* ── A real file picker behind "Upload" (MDX UAT item A6) ──────────────────
     The button was styled with an upload icon and handed the user a chat
     prompt: "Upload documents to the vault and index them…". There was no file
     input on this surface at all, so the one thing an upload affordance
     promises — choose a file from your machine — could not be done anywhere in
     the product. The conversational route stays (it is the entry point for
     "import from Veeva", which is a different act), but it is no longer the
     only one.

     Posts to POST /api/vault/ingest, the real ingest path: multipart, magic-byte
     + ClamAV verified, tenant-scoped storage, one vault.documents row per file.
     Nothing is faked here — the row appears in the tree because the server
     wrote it, and a refusal is reported as a refusal. */
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  /* Moved to ../useVaultUpload and shared with the MDX Document vault, which
     had no upload control at all (its button opened a chat prompt). Copying
     these forty lines into that surface would have produced a second copy of a
     governed write path — the SHA-256, the audit row and the tenant check all
     live behind this one endpoint, and two callers drifting is how a lane ends
     up filing documents differently from the lane beside it. Behaviour here is
     unchanged: sequential uploads, per-file outcomes, a refusal reported as a
     refusal, and a refresh only when the server actually stored something. */
  const { uploading, note: uploadNote, upload } = useVaultUpload(
    projectId ? String(projectId) : null,
  );

  const uploadFiles = async (files: FileList | null) => {
    const outcome = await upload(files);
    // Re-read the tree so what is shown is what the server stored.
    if (outcome.succeeded.length) setVaultEpoch((n) => n + 1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [selId, setSel] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: e[id] === false ? true : false }));

  const findFolder = (
    nodes: (VaultDoc | VaultFolder)[],
    id: string | null,
  ): VaultFolder | null => {
    if (!id) return null;
    for (const n of nodes) {
      if (!isVaultDoc(n)) {
        const folder = n as VaultFolder;
        if (folder.id === id) return folder;
        if (folder.children) {
          const r = findFolder(
            folder.children.filter((c) => !isVaultDoc(c)),
            id,
          );
          if (r) return r;
        }
      }
    }
    return null;
  };

  // No live selection yet → fall back to the first folder / first doc so the
  // surface shows something without seeding local state from the async tree.
  const folder = findFolder(tree, activeFolder) || tree[0] || null;
  const folderDocs = folder ? flattenDocs(folder.children) : [];
  const searching = q.trim().length > 0;
  const results = searching
    ? allDocs.filter((d) =>
        (d.title + ' ' + (d.preview || '') + ' ' + (d.num || '') + ' ' + (d.type || ''))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : folderDocs;
  const sel =
    allDocs.find((d) => d.id === selId) || results[0] || allDocs[0] || null;

  /* What AnA can see of this screen.
     Until now she knew the user was on "vault" and nothing else — not which
     folder was open, which document was selected, or that a search was
     narrowing the list — so "what is blocking this?" had to be answered by the
     user restating their own screen.

     A FAILED read publishes the failure, never counts. `allDocs` is [] both
     when the vault is genuinely empty and when the read threw, and a summary
     saying "0 documents" over an outage would make AnA confidently wrong about
     a customer's repository. Loading says loading for the same reason. */
  const anaContext = useMemo(() => {
    if (vaultState.loading) {
      return { summary: 'The document vault is still loading; nothing on screen is final yet.' };
    }
    if (vaultState.error) {
      return {
        summary:
          'The document vault could not be read, so this screen is showing no documents because of a failure, not because there are none.',
        availableActions: ['Retry the vault read'],
      };
    }
    const shown = results.length;
    return {
      summary:
        `Document vault: ${allDocs.length} document(s) in the tree` +
        (folder ? `, folder "${folder.label}" open` : '') +
        (searching ? `, filtered to ${shown} by the search "${q.trim()}"` : '') +
        (sel ? `, "${sel.title}" selected` : ''),
      facts: {
        totalDocuments: allDocs.length,
        shownInList: shown,
        searchQuery: searching ? q.trim() : null,
        openFolder: folder ? { id: folder.id, code: folder.code, label: folder.label } : null,
        selected: sel
          ? {
              id: sel.id, number: sel.num, title: sel.title, type: sel.type,
              status: sel.status, version: sel.ver, owner: sel.owner,
              updated: sel.updated, percentComplete: sel.pct,
              blocker: sel.blocker ?? false, flag: sel.flag ?? null,
            }
          : null,
      },
      availableActions: [
        'Open a document to see its detail, version and status',
        'Search the vault by title, number, type or preview text',
        'Browse a folder in the document tree',
        'Upload a file into the vault (multipart ingest, virus-scanned, one row per file)',
      ],
    };
  }, [vaultState.loading, vaultState.error, allDocs, results.length, folder, searching, q, sel]);
  usePublishSurfaceContext('vault', anaContext);

  const st = (s: string) => vaultStatus(s);

  const openDoc = () => {
    onNav && onNav('document-authoring');
  };

  return (
    <div className="vd-wrap">
      <div className="vd-top">
        <div>
          <div className="sp-eyebrow">Documents {I.dot} project vault</div>
          <h1 className="vd-title">Vault (DMS)</h1>
          <div className="vd-sub">
            <span className="vd-sub-x">
              {vault && vault.spine ? <>{vault.spine} {I.dot} </> : null}
              {allDocs.length} document{allDocs.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button
          className="sp-ask"
          onClick={() => onNav && onNav('project-home')}
          title="Open this project in Project management"
        >
          {I.folder} Open project
        </button>
        <button
          className="sp-ask"
          onClick={() => onNav && onNav('etmf')}
          title="TMF inspection-readiness — completeness, timeliness & QC"
        >
          {I.shieldCheck} Inspection readiness
        </button>
        {/* The picker itself. Accepts exactly what POST /api/vault/ingest
            accepts, so the OS dialog does not offer files the server will
            refuse. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.rtf,.xlsx,.xls,.csv,.md"
          style={{ display: 'none' }}
          onChange={(e) => void uploadFiles(e.target.files)}
          /* Labelled even though it is visually hidden and driven by the button
             beside it: WCAG 3.3.2 applies to the control, not to whether it is
             painted, and assistive technology can still reach a file input that
             a script focuses. */
          aria-label="Choose documents to upload to the Vault"
          data-testid="vault-upload-input"
        />
        <button
          className="sp-primary"
          disabled={uploading || !projectId}
          onClick={() => fileInputRef.current?.click()}
          title={
            projectId
              ? 'Choose files to file into this project’s Vault'
              : 'Open a project first — a Vault document is filed against a program.'
          }
          data-testid="vault-upload-button"
        >
          {I.upload || I.plus} {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {/* The conversational route is kept, but as what it is: a second way
            in, not the thing the upload icon promises. */}
        <button
          className="sp-ask"
          onClick={() =>
            onAsk(
              'Upload documents to the vault and index them for semantic search.',
            )
          }
          title="Describe an import to AnA instead — e.g. bulk import from another system"
        >
          {I.sparkles || I.plus} Ask AnA to import
        </button>
      </div>

      {uploadNote && (
        <div
          className="scaf-note"
          role="status"
          style={{ margin: '0 0 12px', color: uploadNote.tone === 'error' ? 'var(--error)' : undefined }}
        >
          {uploadNote.text}
        </div>
      )}

      <div className="vd-coexist">
        <span className="vd-coexist-txt">
          {I.link || I.plug} Works alongside <b>Veeva Vault</b>,{' '}
          <b>SharePoint</b> &amp; <b>OneDrive</b> — search in place, import
          with approval (detect, classify, approve), export everything. No
          rip-and-replace.
        </span>
        <button
          className="vd-coexist-cta"
          onClick={() =>
            onAsk(
              'Import documents from Veeva Vault into this project — run detect, classify to the dossier structure, and stage for approval.',
            )
          }
        >
          Import from a connected source
        </button>
      </div>

      {!projectId ? (
        <EmptyState
          icon={I.folder}
          title="Open a project to see its vault"
          hint="The Vault (DMS) shows the governed document tree for the project you have open. Open a project from Projects or Project management to load its CTD / eSTAR / IVDR / TMF spine."
        />
      ) : vaultState.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>
          Loading the project vault…
        </div>
      ) : vaultState.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the project vault"
          hint="The governed document store didn't respond. This is the project's real CTD / eSTAR / IVDR / TMF document tree — sign in and retry, or check the service is reachable."
        />
      ) : allDocs.length === 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No documents in this project's vault yet"
          hint={
            vault?.pendingStore
              ? "The governed document store isn't provisioned for this environment yet. Documents built here organize by build type into the CTD / eSTAR / IVDR / TMF spine, each classified and version-tracked."
              : "Nothing has been filed into this project's vault yet. As documents are created they organize by build type into the submission spine, each classified and version-tracked."
          }
        />
      ) : (
        <div className="vd-grid">
          <aside className="vd-tree">
            <div className="vd-tree-lbl">Document structure</div>
            <VaultTree
              nodes={tree}
              depth={0}
              activeFolder={activeFolder}
              onPick={(id) => {
                setActiveFolder(id);
                setQ('');
              }}
              expanded={expanded}
              toggle={toggle}
            />
          </aside>

          <section className="vd-list">
            <div className="vd-breadcrumb">
              <button
                className="vd-crumb"
                onClick={() => {
                  setActiveFolder(tree[0] ? tree[0].id : null);
                  setQ('');
                }}
              >
                {I.folder} {(vault && vault.program) || 'Vault'}
              </button>
              {!searching && folder && (
                <>
                  <span className="vd-crumb-sep">&rsaquo;</span>
                  <span className="vd-crumb cur">
                    {folder.code ? folder.code + ' - ' : ''}
                    {folder.label}
                  </span>
                </>
              )}
              {searching && (
                <>
                  <span className="vd-crumb-sep">&rsaquo;</span>
                  <span className="vd-crumb cur">Search &quot;{q}&quot;</span>
                </>
              )}
            </div>
            <div className="vd-cols">
              <span className="vd-col-name">Name</span>
              <span className="vd-col-type">Type</span>
              <span className="vd-col-owner">Owner</span>
              <span className="vd-col-mod">Modified</span>
              <span className="vd-col-status">Status</span>
            </div>
            <div className="vd-rows">
              {results.map((d) => (
                <button
                  key={d.id}
                  className="vd-row"
                  data-on={selId === d.id || undefined}
                  onClick={() => setSel(d.id)}
                >
                  <span className="vd-col-name">
                    <span className="vd-row-ic">{fileIcon(d)}</span>
                    <span className="vd-row-t">
                      {d.num && d.num !== '—' ? (
                        <span className="vd-num">{d.num}</span>
                      ) : null}
                      {d.title}
                    </span>
                    {d.blocker && (
                      <span className="vd-blk" title="Blocks filing">
                        {I.alertTriangle}
                      </span>
                    )}
                  </span>
                  <span className="vd-col-type">{d.type}</span>
                  <span className="vd-col-owner">{d.owner}</span>
                  <span className="vd-col-mod">{d.updated}</span>
                  <span className="vd-col-status">
                    <span className={'rd-chip tone-' + st(d.status).tone}>
                      {st(d.status).label}
                    </span>
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="vd-empty">
                  No documents
                  {searching ? ' match your search' : ' in this folder'}.
                </div>
              )}
            </div>
          </section>

          <aside className="vd-detail">
            {sel && (
              <>
                <div className="vd-d-hdr">
                  <span className={'rd-chip tone-' + st(sel.status).tone}>
                    {st(sel.status).label}
                  </span>
                  {sel.ver && sel.ver !== '—' && (
                    <span className="vd-d-ver">{sel.ver}</span>
                  )}
                </div>
                <div className="vd-d-title">
                  {sel.num && sel.num !== '—' ? sel.num + ' - ' : ''}
                  {sel.title}
                </div>
                <div className="vd-d-meta">
                  {sel.type} - {sel.owner} - updated {sel.updated}
                </div>
                {sel.preview && (
                  <div className="vd-d-preview">{sel.preview}</div>
                )}
                {sel.flag && (
                  <div className="tl-warn-row">
                    {I.alertTriangle} {sel.flag}
                  </div>
                )}

                {/* Corpus indexing / chunk counts are NOT part of the
                    project-vault read model — there is no backing store for
                    per-document embedding status (server/routes/c2c/project-vault.ts
                    omits it deliberately). Honest note instead of a synthesized
                    "Indexed — N chunks — semantic-search ready" claim. */}
                <div className="vd-d-seclbl">Corpus indexing</div>
                <div className="vd-d-idx">
                  <span className="vd-idx-dot" />
                  <span>Indexing status isn't reported for this document yet.</span>
                </div>

                {/* No version-history endpoint backs this surface: the read model
                    returns each section's CURRENT version only, not a history
                    list. Show the real current version honestly — don't
                    synthesize a "history". */}
                <div className="vd-d-seclbl">Version</div>
                <div className="vd-vers">
                  <div className="vd-ver">
                    <span className="vd-ver-v">
                      {sel.ver && sel.ver !== '—' ? sel.ver : '—'}
                    </span>
                    <span className="vd-ver-m">
                      {sel.updated}
                      {sel.owner && sel.owner !== '—' ? ' - ' + sel.owner : ''} - current version
                    </span>
                  </div>
                </div>

                {/* Linked-evidence relationships (datasets / precedents / RIM
                    matches) have no backing store in this read model. Honest
                    empty, not a fabricated list. FOLLOW-UP: wire an
                    evidence-links endpoint before restoring this panel. */}
                <div className="vd-d-seclbl">Linked evidence</div>
                <div className="vd-ev">
                  <div className="vd-ev-row" style={{ opacity: 0.7 }}>
                    No linked evidence recorded for this document yet.
                  </div>
                </div>

                <div className="vd-d-actions">
                  <button
                    className="sp-primary"
                    style={{ padding: '8px 12px' }}
                    onClick={openDoc}
                  >
                    {I.penLine || I.fileText} Open in editor
                  </button>
                  <button
                    className="sp-ask"
                    onClick={() =>
                      onAsk(
                        'Summarize ' +
                          sel.title +
                          ' and list the claims that still need evidence.',
                      )
                    }
                  >
                    {I.sparkles} Ask AnA
                  </button>
                  <button
                    className="sp-ask"
                    onClick={() => onAsk('Download ' + sel.title)}
                  >
                    {I.download} Download
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
