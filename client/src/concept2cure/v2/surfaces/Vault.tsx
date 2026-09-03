import React, { useState, useMemo } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { useVaultUpload } from '../useVaultUpload';
import {
  VAULT_INGEST_DOCUMENT_TYPES,
  type VaultIngestDocumentType,
} from '@shared/constants/domain/vault-taxonomy';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  vaultStatus,
  vaultFileIconKey,
  isVaultDoc,
  flattenDocs,
  type VaultDoc,
  type VaultFolder,
} from '../fixtures/vault-data';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import {
  EDITOR_TARGET_DOC_TYPES,
  clearEditorTarget,
  setEditorTarget,
  type EditorTargetDocType,
} from '../editorTarget';
import { readShellProject } from '../shellProject';
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
/** One Data Room source with its DERIVED pipeline stage (server-computed:
 *  'filed' = checksum matches a vault document in this program). */
interface DataRoomRow {
  id: number;
  title: string;
  kind: string;
  sizeLabel: string;
  addedAt: string;
  stage: 'captured' | 'classified' | 'filed';
  readState: string;
  suggestedFolder: string | null;
  suggestedFolderLabel: string;
  evidenceKind: string | null;
  confidence: string | null;
  needsReview: boolean;
}

interface DataRoomBlock {
  captured: number;
  classified: number;
  filed: number;
  sources: DataRoomRow[];
}

interface VaultDisplayShape {
  program: string;
  spine: string;
  standard: string;
  documentCount: number;
  tree: VaultFolder[];
  pendingStore?: boolean;
  /** Uploads awaiting a person's filing decision (visible queue, not a black hole). */
  unfiledCount?: number;
  /** The capture→classify→file pipeline over the project's data room. */
  dataRoom?: DataRoomBlock;
  /** Branches the server could not serve, with why — rendered, not swallowed:
   *  a vault silently missing "Uploaded files" reads as a vault with no uploads. */
  unavailable?: Array<{ branch: string; reason: string }>;
}

/* Stable empty tree while the live vault is loading / absent — `useLiveData`
   yields a fresh null every render until it resolves, so deriving `tree` from a
   module-level constant keeps the `allDocs` memo reference-stable and loop-safe
   (spec loop-safety note). */
const EMPTY_TREE: VaultFolder[] = [];

/* Current project id — the runtime channel Projects.tsx sets when a project is
   opened (same read as Inconsistency / CmcModule / ProjectHome). The vault is
   project-scoped, so with no project in context there is nothing to load.

   It goes through `readShellProject` (v2/shellProject.ts), the ONE reader for
   window.C2C_PROJECT. This surface used to hand-roll its own copy of that
   read, which is exactly the per-surface drift that module exists to stop. */
function currentProjectId(): string | null {
  const p = readShellProject();
  const id = p && p.id != null ? String(p.id).trim() : '';
  return id || null;
}

/**
 * The governed document family a vault leaf sits under, uppercased, or null.
 *
 * The read-model nests every authored leaf inside `vaultdoc-<c2c_documents.id>`
 * whose `code` is that row's `doc_type` uppercased
 * (server/routes/c2c/project-vault.ts documentFolder). Branches with no
 * governed document above them — the Module 3 artifact branch, the filing
 * cabinet — inherit null, and null is reported as null: a family this cannot
 * see must never be guessed, because naming the wrong one turns a resolvable
 * section into a refusal in the editor.
 *
 * `undefined` means "leaf not in this tree" and is distinct from "found, no
 * family", so a miss can never be read as an unfiled document.
 */
export function vaultDocFamilyCode(
  nodes: readonly (VaultFolder | VaultDoc)[],
  leafId: string,
  inherited: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (isVaultDoc(node)) {
      if (node.id === leafId) return inherited;
      continue;
    }
    const carried = node.id.startsWith('vaultdoc-')
      ? (node.code || '').trim() || null
      : inherited;
    const hit = vaultDocFamilyCode(node.children, leafId, carried);
    if (hit !== undefined) return hit;
  }
  return undefined;
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
          // 'confirmed' = an upload a person filed; it counts as settled the
          // way an approved authored section does.
          ['final', 'approved', 'reviewed', 'confirmed'].includes(d.status),
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

/* ── Data Room lane — the capture → classify → file pipeline ──
   Every file captured for this project (AnA paperclip, Project Home drop-zone,
   Vault upload) passes through the Data Room: it lands as a source
   ('captured'), the classifier stamps what it is and where it likely belongs
   ('classified'), and it is 'filed' once its exact bytes exist as a vault
   document in this program — a checksum join computed server-side, never a
   stored guess. Four honest states: pending store, failed read (an ERROR, not
   an empty room), empty, and real rows. */
function DataRoomLane({
  block,
  unavailableReason,
}: {
  block?: DataRoomBlock;
  /** The server's `unavailable` reason for the Data room branch, when it
   *  could not be served — rendered as a failure, never as an empty room. */
  unavailableReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (unavailableReason) {
    return (
      <div className="vd-dr" data-testid="vault-data-room">
        <div className="vd-dr-head">
          <span className="vd-dr-title">{I.inbox || I.folder} Data room</span>
        </div>
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} Unavailable — showing nothing because the room could not be
          served, not because it is empty. {unavailableReason}
        </div>
      </div>
    );
  }
  if (!block) {
    return (
      <div className="vd-dr" data-testid="vault-data-room">
        <div className="vd-dr-head">
          <span className="vd-dr-title">{I.inbox || I.folder} Data room</span>
          <span className="vd-dr-meta">No data room information for this project.</span>
        </div>
      </div>
    );
  }
  // Collapsed, the stage strip is the summary; expanding lists the sources.
  const rows = open ? block.sources : [];
  return (
    <div className="vd-dr" data-testid="vault-data-room">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.inbox || I.folder} Data room</span>
        <span className="vd-dr-stages">
          <span className="vd-dr-stage">Captured <b>{block.captured}</b></span>
          <span className="vd-dr-arrow">›</span>
          <span className="vd-dr-stage">Classified <b>{block.classified}</b></span>
          <span className="vd-dr-arrow">›</span>
          <span className="vd-dr-stage">Filed to vault <b>{block.filed}</b></span>
        </span>
        {block.sources.length > 0 && (
          <button className="vd-dr-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide sources' : `Show ${block.sources.length} source${block.sources.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {block.sources.length === 0 && (
        <div className="vd-dr-empty">
          Nothing captured for this project yet. Files attached in AnA chat, dropped on
          Project home, or uploaded here all pass through the data room.
        </div>
      )}
      {rows.length > 0 && (
        <div className="vd-dr-rows">
          {rows.map((s) => (
            <div key={s.id} className="vd-dr-row">
              <span className="vd-dr-kind">{s.kind}</span>
              <span className="vd-dr-name" title={s.title}>{s.title}</span>
              <span className="vd-dr-detail">
                {s.sizeLabel !== '—' ? `${s.sizeLabel} · ` : ''}{s.addedAt} · {s.readState}
              </span>
              {s.stage === 'classified' && s.suggestedFolderLabel ? (
                <span className="vd-dr-suggest" title={s.evidenceKind ? `Looks like: ${s.evidenceKind}` : undefined}>
                  → {s.suggestedFolderLabel}
                </span>
              ) : null}
              <span
                className={
                  'rd-chip tone-' +
                  (s.stage === 'filed' ? 'ok' : s.stage === 'classified' ? 'ai' : 'idle')
                }
              >
                {s.stage === 'filed' ? 'Filed' : s.stage === 'classified' ? 'Classified' : 'Captured'}
              </span>
            </div>
          ))}
        </div>
      )}
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

  /* What the user says the file is; travels with every file in the batch. */
  const [docType, setDocType] = useState<VaultIngestDocumentType>('OTHER');

  const uploadFiles = async (files: FileList | null) => {
    const outcome = await upload(files, { documentType: docType });
    // Re-read the tree so what is shown is what the server stored.
    if (outcome.succeeded.length) setVaultEpoch((n) => n + 1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Filing decisions (confirm / move / unfile) ────────────────────────────
     POST /api/c2c/project-vault/:id/file — the governed, audited commit of a
     placement. The classifier only ever SUGGESTS a folder; this is where a
     person decides. On success the tree is re-read rather than patched
     locally: what the Vault shows is what the Vault stored. */
  const [filing, setFiling] = useState(false);
  const [filingNote, setFilingNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  /**
   * Download one uploaded vault document.
   *
   * The server re-checks the program against the caller's org and the document
   * against the program, then verifies the stored bytes against the hash it
   * recorded before sending them — so a copy that does not match the record is
   * refused rather than served. Both refusals are reported here; a governed
   * store that fails quietly on a download is the worst version of this.
   */
  const [downloading, setDownloading] = useState('');
  /* Reported in the SAME banner the upload path uses, rather than a second
     notification mechanism on one surface. */
  const [downloadNote, setDownloadNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const downloadVaultDoc = async (docId: string, title: string) => {
    if (!projectId || downloading) return;
    setDownloading(docId);
    setDownloadNote(null);
    try {
      const res = await apiRequest(
        'GET',
        `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docId)}/download`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setDownloadNote({
          text:
            `${title} was not downloaded — ` +
            (serverMessage(j) ?? `the vault refused it (HTTP ${res.status})`),
          tone: 'error',
        });
        return;
      }
      const blob = await res.blob();
      const name = res.headers?.get?.('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1];
      const ok = downloadBlob(name || safeFileName(title, 'document'), blob);
      setDownloadNote(
        ok ? null : { text: `${title} was fetched but the browser refused the download.`, tone: 'error' },
      );
    } catch (e) {
      setDownloadNote({
        text: redactInternals(
          e instanceof Error ? e.message : String(e),
          `${title} was not downloaded.`,
        ),
        tone: 'error',
      });
    } finally {
      setDownloading('');
    }
  };

  const fileDocument = async (
    docId: string,
    body: { confirm?: boolean; folderId?: string | null; note?: string },
  ) => {
    if (!projectId || filing) return;
    setFiling(true);
    setFilingNote(null);
    try {
      const res = await apiRequest(
        'POST',
        '/api/c2c/project-vault/' + encodeURIComponent(projectId) + '/file',
        { documentId: docId, ...body },
      );
      // apiRequest does not throw on 401 (an expired token returns, it does not
      // reject), so without this guard a rejected filing fell through to the
      // tone:'ok' branch below and claimed "Recorded in the audit trail" for a
      // write that never landed — a Part 11 claim on a refused request. A
      // refusal is reported as a refusal; the placement on screen stays what the
      // server last stored.
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setFilingNote({
          tone: 'error',
          text:
            'The filing decision was not recorded — ' +
            (serverMessage(j) ?? `the vault refused it (HTTP ${res.status})`) +
            '. The placement here is unchanged.',
        });
        return;
      }
      const payload = (await res.json().catch(() => null)) as
        | { filing?: { folderId: string | null; folderLabel?: string } }
        | null;
      const f = payload?.filing;
      setFilingNote({
        tone: 'ok',
        text: f?.folderId
          ? `Filed to ${f.folderLabel || f.folderId}. Recorded in the audit trail.`
          : 'Moved to Unfiled — awaiting a filing decision.',
      });
      setVaultEpoch((n) => n + 1);
    } catch (e) {
      /* A refusal is reported as a refusal — the placement on screen stays
         what the server last stored, never what the click hoped for. */
      setFilingNote({
        tone: 'error',
        text: redactInternals(
          e instanceof Error ? e.message : String(e),
          'The filing decision was not recorded.',
        ),
      });
    } finally {
      setFiling(false);
    }
  };

  /* Folder options for "Move to…" — derived from the server's cabinet (the
     program's real view taxonomy), never a client-side folder list. */
  const cabinetFolders = useMemo(() => {
    const cab = tree.find((f) => f.id === 'cabinet');
    if (!cab) return [] as Array<{ id: string; label: string }>;
    return cab.children
      .filter((c): c is VaultFolder => !isVaultDoc(c) && (c as VaultFolder).id !== 'cab-unfiled')
      .map((c) => ({ id: c.id.replace(/^cab-/, ''), label: c.label }));
  }, [tree]);
  const [moveTarget, setMoveTarget] = useState('');

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

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     vault.*). Both handlers drive the SAME state the human's own controls
     drive (setQ / setActiveFolder / setExpanded); a folder AnA names is
     resolved against the REAL tree with honest misses, never a guess. */
  useSurfaceActionHandlers('vault', {
    'vault.search': (params) => {
      const query = (params.query ?? '').trim();
      if (!query) return { ok: false, reason: 'No search term given.' };
      if (vaultState.error) return { ok: false, reason: 'The vault could not be read.' };
      // No loading guard: the query is pure view state — it filters whatever
      // the read delivers, so applying it mid-load is correct, not early.
      setQ(query);
      return { ok: true, detail: `Searching the vault for "${query}"` };
    },
    'vault.open-folder': (params) => {
      const wanted = (params.folder ?? '').trim().toLowerCase();
      if (!wanted) return { ok: false, reason: 'No folder named.' };
      // Not-ready, not failed: the bus holds the directive and re-attempts on
      // this surface's ready signal below — the navigate→act gap.
      if (vaultState.loading)
        return { ok: false, reason: 'The vault is still loading.', retry: true };
      if (vaultState.error) return { ok: false, reason: 'The vault could not be read.' };
      /* Walk the real tree collecting every folder with its ancestor chain, so
         opening also un-collapses the path down to it. */
      const found: Array<{ folder: VaultFolder; ancestors: string[] }> = [];
      const walk = (nodes: (VaultDoc | VaultFolder)[], ancestors: string[]) => {
        for (const n of nodes) {
          if (isVaultDoc(n)) continue;
          const f = n as VaultFolder;
          found.push({ folder: f, ancestors });
          if (f.children) walk(f.children, [...ancestors, f.id]);
        }
      };
      walk(tree, []);
      const exact = found.filter((f) => f.folder.label.toLowerCase() === wanted);
      const contains = exact.length
        ? exact
        : found.filter((f) => f.folder.label.toLowerCase().includes(wanted));
      if (contains.length === 0) {
        return { ok: false, reason: `No folder named "${params.folder}" in this vault.` };
      }
      if (contains.length > 1) {
        return {
          ok: false,
          reason: `"${params.folder}" matches ${contains.length} folders — name one exactly.`,
        };
      }
      const target = contains[0];
      setQ('');
      setActiveFolder(target.folder.id);
      setExpanded((e) => {
        const next = { ...e };
        for (const a of target.ancestors) next[a] = true;
        next[target.folder.id] = true;
        return next;
      });
      return { ok: true, detail: `Opened ${target.folder.label}` };
    },
  });
  /* The ready signal for the retry contract above: when the read settles, a
     held not-ready directive gets its one re-attempt. */
  React.useEffect(() => {
    if (!vaultState.loading) notifySurfaceActionReady('vault');
  }, [vaultState.loading]);

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
        (vault?.unfiledCount ? `, ${vault.unfiledCount} upload(s) unfiled` : '') +
        (folder ? `, folder "${folder.label}" open` : '') +
        (searching ? `, filtered to ${shown} by the search "${q.trim()}"` : '') +
        (sel ? `, "${sel.title}" selected` : ''),
      facts: {
        totalDocuments: allDocs.length,
        unfiledUploads: vault?.unfiledCount ?? 0,
        dataRoom: vault?.dataRoom
          ? {
              captured: vault.dataRoom.captured,
              classified: vault.dataRoom.classified,
              filed: vault.dataRoom.filed,
            }
          : vault?.unavailable?.some((u) => u.branch === 'Data room')
            ? 'unavailable — counts unknown, not zero'
            : null,
        unavailableBranches: vault?.unavailable?.map((u) => u.branch) ?? [],
        shownInList: shown,
        searchQuery: searching ? q.trim() : null,
        openFolder: folder ? { id: folder.id, code: folder.code, label: folder.label } : null,
        selected: sel
          ? {
              id: sel.id, number: sel.num, title: sel.title, type: sel.type,
              status: sel.status, version: sel.ver, owner: sel.owner,
              updated: sel.updated, percentComplete: sel.pct,
              blocker: sel.blocker ?? false, flag: sel.flag ?? null,
              filing: sel.filing ?? null,
            }
          : null,
      },
      availableActions: [
        'Open a document to see its detail, version and status',
        'Search the vault by title, number, type or preview text',
        'Browse a folder in the document tree',
        'Upload a file into the vault (multipart ingest, virus-scanned, auto-classified to a suggested dossier folder)',
        'Confirm or move an upload’s suggested filing (governed, audited)',
      ],
    };
  }, [vaultState.loading, vaultState.error, allDocs, results.length, folder, searching, q, sel, vault]);
  usePublishSurfaceContext('vault', anaContext);

  const st = (s: string) => vaultStatus(s);

  /* ── "Open in editor" carries the SELECTED document ───────────────────────
     It used to be `onNav('document-authoring')` and nothing else: the user
     picked a specific section out of the dossier tree, clicked the one control
     that promises to open it, and landed on the editor's default view with the
     selection gone.

     The deep-link channel for exactly this already exists — v2/editorTarget.ts,
     one-shot and TTL-guarded, consumed by DocumentAuthoring on mount, which
     resolves the named section by code then by title and posts an HONEST notice
     when it cannot find it. Nothing new is invented here; this surface becomes
     its second sender.

     What is and is NOT claimed:
       • section code/label — `num` is the rule pack's section key and `title`
         its label (project-vault.ts leafDoc), the exact pair
         `matchEditorTargetSection` matches on. '—' is the read-model's "no such
         column" placeholder, so it is dropped rather than sent as a code.
       • docType — only when the enclosing governed document's doc_type is in
         the channel's vocabulary. A project filed as an IND resolves to null,
         and null means "I hold a section but cannot name a family", which is
         the truth. Guessing a family would make the editor REFUSE the target
         ("this project's governed dossier is X, not Y") — a near-miss that
         reads as a wrong-document error the user cannot act on.
       • programId — sent only when the shell's project id is a string, because
         that is what DocumentAuthoring's own `projectIdForOutline` accepts; a
         numeric id there resolves to null and would fail the equality guard,
         refusing a target that was never wrong.

     A leaf with neither a code nor a title cannot be addressed at all, so the
     channel is CLEARED rather than fed an empty claim — the plain "open the
     editor" navigation it always was. */
  const openDoc = (doc: VaultDoc) => {
    const family = vaultDocFamilyCode(tree, doc.id);
    const normalized = typeof family === 'string' ? family.toLowerCase() : null;
    const docType =
      normalized && (EDITOR_TARGET_DOC_TYPES as readonly string[]).includes(normalized)
        ? (normalized as EditorTargetDocType)
        : null;
    const code = doc.num && doc.num !== '—' ? doc.num : null;
    const label = doc.title && doc.title !== '—' ? doc.title : null;
    const shell = readShellProject();
    if (!code && !label) {
      clearEditorTarget();
    } else {
      setEditorTarget({
        docType,
        code,
        label,
        programId: typeof shell?.id === 'string' ? shell.id : null,
        programTitle: shell?.title ?? null,
      });
    }
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
              {vault && (vault.unfiledCount ?? 0) > 0 ? (
                <> {I.dot} {vault.unfiledCount} unfiled — needs review</>
              ) : null}
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
        {/* What the file IS — the ingest schema's own vocabulary, so the
            picker can never offer a type the server refuses. MODULE_3 is how
            an uploaded CMC document declares itself and gets handled as one
            downstream; the default stays OTHER rather than a guess from the
            filename. */}
        <select
          className="c2c-input"
          aria-label="Document type for uploaded files"
          value={docType}
          onChange={(e) => setDocType(e.target.value as VaultIngestDocumentType)}
          disabled={uploading}
          data-testid="vault-upload-type"
        >
          {VAULT_INGEST_DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
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

      {(uploadNote || downloadNote) && (
        <div
          className="scaf-note"
          role="status"
          style={{
            margin: '0 0 12px',
            color:
              (downloadNote ?? uploadNote)!.tone === 'error' ? 'var(--error)' : undefined,
          }}
        >
          {(downloadNote ?? uploadNote)!.text}
        </div>
      )}

      {/* A branch the server could not serve is said, not silently omitted —
          otherwise "no Uploaded files folder" and "no uploads" look identical. */}
      {vault?.unavailable?.map((u) => (
        <div key={u.branch} className="scaf-note" role="status" style={{ margin: '0 0 12px' }}>
          {u.branch}: {u.reason}
        </div>
      ))}

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
      ) : (
        <>
          <DataRoomLane
            block={vault?.dataRoom}
            unavailableReason={
              vault?.unavailable?.find((u) => u.branch === 'Data room')?.reason ?? null
            }
          />
          {filingNote && (
            <div
              className="scaf-note"
              role="status"
              style={{ margin: '8px 24px 0', color: filingNote.tone === 'error' ? 'var(--error)' : undefined }}
            >
              {filingNote.text}
            </div>
          )}
          {allDocs.length === 0 ? (
            <EmptyState
              icon={I.fileText}
              title="No documents in this project's vault yet"
              hint={
                vault?.pendingStore
                  ? "The governed document store isn't provisioned for this environment yet. Documents built here organize by build type into the CTD / eSTAR / IVDR / TMF spine, each classified and version-tracked."
                  : "Nothing has been filed into this project's vault yet. Upload a file — it is classified and auto-filed to a suggested dossier folder — or start a document build; both organize into the submission spine, version-tracked."
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
                  <span className="vd-crumb-sep" aria-hidden="true">&rsaquo;</span>
                  <span className="vd-crumb cur">
                    {folder.code ? folder.code + ' - ' : ''}
                    {folder.label}
                  </span>
                </>
              )}
              {searching && (
                <>
                  <span className="vd-crumb-sep" aria-hidden="true">&rsaquo;</span>
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

                {sel.src === 'upload' && sel.filing ? (
                  <>
                    {/* ── Dossier filing — the placement lifecycle ──
                        Everything here is a stored column: the classifier's
                        suggestion (with its confidence + rationale), or the
                        person's confirmed decision. Committing a change posts
                        to /file — governed, audited — and the tree re-reads. */}
                    <div className="vd-d-seclbl">Dossier filing</div>
                    <div className="vd-d-filing" data-testid="vault-filing-block">
                      <div className="vd-d-filing-row">
                        <span className="k">Folder</span>
                        <span className="v">
                          {sel.filing.folderId
                            ? sel.filing.folderLabel || sel.filing.folderId
                            : 'Unfiled'}
                        </span>
                      </div>
                      {sel.filing.evidenceKind && (
                        <div className="vd-d-filing-row">
                          <span className="k">Looks like</span>
                          <span className="v">{sel.filing.evidenceKind}</span>
                        </div>
                      )}
                      {sel.filing.ctdSection && (
                        <div className="vd-d-filing-row">
                          <span className="k">CTD section</span>
                          <span className="v mono">{sel.filing.ctdSection}</span>
                        </div>
                      )}
                      {sel.filing.rationale && (
                        <div className="vd-d-filing-why">
                          {sel.filing.placementStatus === 'suggested'
                            ? `Classifier${sel.filing.confidence ? ` (${sel.filing.confidence} confidence)` : ''}: `
                            : ''}
                          {sel.filing.rationale}
                        </div>
                      )}
                      <div className="vd-d-filing-acts">
                        {sel.filing.placementStatus === 'suggested' && sel.docId && (
                          <button
                            className="sp-primary"
                            style={{ padding: '7px 11px' }}
                            disabled={filing}
                            onClick={() => void fileDocument(sel.docId!, { confirm: true })}
                            data-testid="vault-confirm-filing"
                          >
                            {I.check || I.fileText} Confirm filing
                          </button>
                        )}
                        {sel.docId && cabinetFolders.length > 0 && (
                          <span className="vd-d-move">
                            <select
                              className="vd-d-move-sel"
                              value={moveTarget}
                              onChange={(e) => setMoveTarget(e.target.value)}
                              aria-label="Move this document to a dossier folder"
                            >
                              <option value="">Move to…</option>
                              {cabinetFolders.map((f) => (
                                <option key={f.id} value={f.id}>{f.label}</option>
                              ))}
                            </select>
                            <button
                              className="sp-ask"
                              disabled={filing || !moveTarget}
                              onClick={() => {
                                if (moveTarget) {
                                  void fileDocument(sel.docId!, { folderId: moveTarget });
                                  setMoveTarget('');
                                }
                              }}
                            >
                              Move
                            </button>
                          </span>
                        )}
                        {sel.filing.placementStatus === 'confirmed' && sel.docId && (
                          <button
                            className="sp-ask"
                            disabled={filing}
                            onClick={() => void fileDocument(sel.docId!, { folderId: null })}
                          >
                            Unfile
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="vd-d-seclbl">File</div>
                    <div className="vd-d-filing">
                      {sel.sizeLabel && (
                        <div className="vd-d-filing-row">
                          <span className="k">Size</span>
                          <span className="v">{sel.sizeLabel}</span>
                        </div>
                      )}
                      <div className="vd-d-filing-row">
                        <span className="k">Version</span>
                        <span className="v mono">{sel.ver && sel.ver !== '—' ? sel.ver : '—'}</span>
                      </div>
                      {sel.hash && (
                        <div className="vd-d-filing-row">
                          <span className="k">SHA-256</span>
                          <span className="v mono vd-d-hash" title={sel.hash}>
                            {sel.hash.slice(0, 16)}…
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}

                <div className="vd-d-actions">
                  {sel.src !== 'upload' && (
                    <button
                      className="sp-primary"
                      style={{ padding: '8px 12px' }}
                      onClick={() => openDoc(sel)}
                    >
                      {I.penLine || I.fileText} Open in editor
                    </button>
                  )}
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
                  {/* ── "Download" typed a sentence into the chat rail ────────
                      `onAsk('Download ' + sel.title)`. On a document management
                      system, on the control labelled Download, beside a
                      download icon. No file ever left the vault through this
                      surface — while the ingest path had been writing the bytes
                      to disk all along, treating a failed write as FATAL
                      precisely so a content hash never describes bytes nobody
                      holds.

                      Only an uploaded document HAS bytes: the other vault nodes
                      are authored sections and governed artifacts, which are
                      records rather than files. Those say so instead of
                      offering a download that could not produce one. */}
                  {sel.src === 'upload' && sel.docId ? (
                    <button
                      className="sp-ask"
                      onClick={() => void downloadVaultDoc(sel.docId!, sel.title)}
                      disabled={downloading === sel.docId}
                    >
                      {I.download} {downloading === sel.docId ? 'Downloading…' : 'Download'}
                    </button>
                  ) : (
                    <button
                      className="sp-ask"
                      disabled
                      title="This is an authored record rather than an uploaded file, so there is nothing to download. Export it from the surface that owns it."
                    >
                      {I.download} No file to download
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
          )}
        </>
      )}
    </div>
  );
}
