import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
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
  const vaultState = useLiveData<VaultDisplayShape>(vaultPath);
  const vault = vaultState.data;

  /* Live document tree — real VaultFolder/VaultDoc from the read-model. Stable
     EMPTY_TREE reference while loading/absent so the memo below is loop-safe. */
  const tree: VaultFolder[] = vault?.tree ?? EMPTY_TREE;
  const allDocs = useMemo(() => flattenDocs(tree), [tree]);

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

  const st = (s: string) => vaultStatus(s);

  const openDoc = () => {
    onNav && onNav('document-authoring');
  };

  return (
    <div className="vd-wrap">
      <div className="vd-top">
        <div>
          <div className="sp-eyebrow">Documents {I.dot} /api/c2c/project-vault</div>
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
        <button
          className="sp-primary"
          onClick={() =>
            onAsk(
              'Upload documents to the vault and index them for semantic search.',
            )
          }
        >
          {I.upload || I.plus} Upload
        </button>
      </div>

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
