import React, { useState, useMemo, useId } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { applySurfaceAction, notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { I } from '../icons';
import { VaultPlaceIntoSubmission } from './VaultPlaceIntoSubmission';
import { VaultEditDetails } from './VaultEditDetails';
import { VaultCatalogRecord } from './VaultCatalogRecord';
import { VaultVersions } from './VaultVersions';
import { APPROVED_STAGES, VAULT_STAGE_CHOICES, stageLabel } from './VaultLifecycle';
import { VaultCoverage, type VaultCoverageShape, type CoverageDocument } from './VaultCoverage';
import {
  ARTIFACTS_BRANCH,
  ArtifactAuditReport,
  ArtifactGovernanceDetail,
  ArtifactVersions,
  GovernedArtifactsLane,
  artifactAskPrompt,
  artifactSelectionFacts,
  fetchGovernedArtifactDocx,
  governedArtifactManifestRows,
  governedArtifactsFacts,
  type GovernedArtifactsBlock,
} from './VaultGovernedArtifacts';
import {
  OrganizationGovernedArtifacts,
  fetchOrganizationArtifactDocx,
  findOrganizationArtifact,
  organizationArtifactAskPrompt,
  organizationArtifactsFacts,
  organizationManifestRows,
  organizationViewContext,
  useOrganizationArtifacts,
  type OrganizationArtifactRow,
} from './VaultOrganizationArtifacts';
import { downloadArtifactManifest } from '../artifactManifest';
import { useLiveData, EmptyState } from '../dataConnect';
import { RecordHistory } from '../RecordHistory';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { useVaultUpload, VAULT_UPLOAD_ACCEPT } from '../useVaultUpload';
import { FileDropZone, type FileDropZoneControls } from '../FileDropZone';
import { VaultUploadStaging, fieldsOf, stageFiles, type StagedFile, type Staging } from './VaultUploadStaging';
import {
  VAULT_CLASSIFICATIONS,
  VAULT_CLASSIFICATION_LABELS,
  VAULT_DOC_KINDS,
  VAULT_INGEST_DOCUMENT_TYPES,
  vaultDocKindLabel,
  vaultIngestTypeLabel,
  type VaultIngestDocumentType,
} from '@shared/constants/domain/vault-taxonomy';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  vaultStatus,
  vaultFileIconKey,
  isVaultDoc,
  flattenDocs,
  type VaultDoc,
  type VaultDocFiling,
  type VaultFolder,
} from '../fixtures/vault-data';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { DataRoomFileBar, RoomPick, useDataRoomFiling, type DataRoomFiling } from './VaultDataRoomFiling';
import { ConfirmSuggestedBar, useConfirmSuggested } from './VaultConfirmSuggested';
import { VaultSeals } from './VaultSeals';
import { VaultViewOnly, useVaultCanWrite } from './VaultViewOnly';
import { VaultLibraryResults, facetCounts, isVaultSearchShape, pendingSearchNote, searchHitToDoc, vaultFilterParams, type VaultFindFilters, type VaultSearchShape } from './VaultLibraryResults';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { VaultFixityCheck } from './VaultFixityCheck';
import { VaultRelationships } from './VaultRelationships';
import { VaultAnnotations } from './VaultAnnotations';
import { DocumentDisposition } from './DocumentDisposition';
import { downloadBlob, safeFileName } from '../download';
import {
  EDITOR_TARGET_DOC_TYPES,
  clearEditorTarget,
  setEditorTarget,
  type EditorTargetDocType,
} from '../editorTarget';
import { readShellProject } from '../shellProject';
import { locateVaultDocument, takeVaultTarget, vaultTargetIsFor, VAULT_TARGET_EVENT, type TakenVaultTarget } from '../vaultTarget';
import { SourceImportDialog, openImportedDocument, sourceImportUnavailableReason } from '../editor/SourceImportDialog';
import { VaultSourceBuildAction } from '../editor/VaultSourceBuildAction';
import '../styles/project-home-v2.css';
import { getSurfaceMeta } from '../registryModel';

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
  /** 'needs_review': the classifier ran and refused to propose a folder. */
  stage: 'captured' | 'needs_review' | 'classified' | 'filed';
  readState: string;
  suggestedFolder: string | null;
  suggestedFolderLabel: string;
  evidenceKind: string | null;
  confidence: string | null;
  needsReview: boolean;
  /** Which Vault version its bytes became, and what replaced it (VR-16). Absent on an older server. */
  filedAs?: { version: string | null; supersededBy: string | null } | null;
}

interface DataRoomBlock {
  captured: number;
  classified: number;
  filed: number;
  /** Absent on a server that predates it. */
  needsReview?: number;
  sources: DataRoomRow[];
  /** The newest-N window the counts cover; truncated = the program has more. */
  window?: { shown: number; truncated: boolean };
}

/** A count over a truncated window is a floor, and reads as one. */
/** The server counts every current source of the project (2026-10-08): exact, never a floor. */
function roomCount(n: number, _block: DataRoomBlock): string {
  return String(n);
}

const ROOM_STAGE: Record<DataRoomRow['stage'], { label: string; tone: string }> = {
  filed: { label: 'Filed', tone: 'ok' },
  classified: { label: 'Classified', tone: 'ai' },
  needs_review: { label: 'Needs review', tone: 'warn' },
  captured: { label: 'Captured', tone: 'idle' },
};

/**
 * A data-room source's stage in words. A filed one names the Vault version its
 * bytes are, and the version that replaced it (VR-16): "Filed as v1.0,
 * superseded by v2.0". A filed file that is no longer current reads as such.
 */
export function roomStageLabel(s: Pick<DataRoomRow, 'stage' | 'filedAs'>): string {
  const base = (ROOM_STAGE[s.stage] ?? ROOM_STAGE.captured).label;
  if (s.stage !== 'filed' || !s.filedAs) return base;
  const as = s.filedAs.version ? ` as v${s.filedAs.version}` : '';
  const replaced = s.filedAs.supersededBy ? `, superseded by v${s.filedAs.supersededBy}` : '';
  return `${base}${as}${replaced}`;
}

/** What the lane's counts cover, and what needs a person. */
function RoomNotes({ block }: { block: DataRoomBlock }) {
  const review = block.needsReview ?? 0;
  const truncated = block.window?.truncated === true;
  if (!review && !truncated) return null;
  return (
    <span className="vd-dr-meta">
      {review > 0 ? `${review} need review — the classifier would not propose a folder. ` : ''}
      {truncated ? `The list shows the newest ${block.window?.shown ?? block.sources.length} of ${block.captured}; search the project's Data Room for the rest.` : ''}
    </span>
  );
}

interface VaultDisplayShape {
  program: string;
  spine: string;
  standard: string;
  /** Documents, counted by the server: authored documents (one each, however
   *  many sections), the project's governed artifacts, and the programme's
   *  uploads — not the leaves of the tree, and not the capped uploads page. */
  documentCount: number;
  /** What documentCount is made of; a branch that could not be read is null. */
  documentCounts?: { authored: number; artifacts: number | null; uploads: number | null };
  tree: VaultFolder[];
  /** The "Governed artifacts" branch's counts (fold F3 slice A). Absent when
   *  the branch could not be read, which `unavailable` says, or from an older server. */
  artifacts?: GovernedArtifactsBlock;
  pendingStore?: boolean;
  /** Uploads awaiting a person's filing decision (visible queue, not a black hole).
   *  Counted over the whole programme by the server, NOT over `uploadsWindow` —
   *  a queue derived from the page below would shrink as the backlog grew. */
  unfiledCount?: number;
  /** Suggested filings no person has confirmed, program-wide (VR-11b). Absent on an older server. */
  awaitingConfirmationCount?: number;
  /** How much of the filing cabinet the tree actually carries. The server caps
   *  that read (the vault is unbounded), so rendering the page without saying
   *  so would state a partial cabinet as the whole one. */
  uploadsWindow?: { shown: number; total: number; truncated: boolean };
  /** The capture→classify→file pipeline over the project's data room. */
  dataRoom?: DataRoomBlock;
  /** Required sections against confirmed filings, from the server (VR-15). */
  coverage?: VaultCoverageShape;
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
/* Why the vault read failed, said as what happened. A 401/403/404 is an answer
   from the server — expired session, access refused, project not in this
   organization — and a retry cannot change it; anything else (5xx, network,
   no status at all) is a failure to answer, which a retry can. */
function vaultReadFailure(status: number | undefined): { hint: string; retryable: boolean } {
  switch (status) {
    case 401:
      return { hint: 'Your session has expired. Sign in again to load this project’s documents.', retryable: false };
    case 403:
      return {
        hint: 'You don’t have access to this project’s documents. Ask an administrator in your organization to grant it.',
        retryable: false,
      };
    case 404:
      return { hint: 'This project wasn’t found in your organization. Open a project from Projects.', retryable: false };
    default:
      return {
        hint: 'The document store didn’t respond, so nothing was read. Try again, or check the service is reachable.',
        retryable: true,
      };
  }
}

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
 * governed document above them — the governed-artifacts branch, the filing
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

/**
 * The one leaf of the tree a name picks out, for vault.focus-document: the
 * title exactly (case and spacing aside), else the section code exactly, else
 * the one title that contains it. More than one is a miss to be named, never a
 * guess. `folder` is the leaf's own folder; `ancestors`, the folders above it.
 */
export function findNamedVaultDocument(
  nodes: readonly (VaultFolder | VaultDoc)[],
  name: string,
):
  | { kind: 'one'; doc: VaultDoc; folder: VaultFolder; ancestors: string[] }
  | { kind: 'many'; count: number }
  | { kind: 'none' } {
  const leaves: Array<{ doc: VaultDoc; folder: VaultFolder; ancestors: string[] }> = [];
  const walk = (folder: VaultFolder, ancestors: string[]) => {
    for (const child of folder.children) {
      if (isVaultDoc(child)) leaves.push({ doc: child, folder, ancestors });
      else walk(child as VaultFolder, [...ancestors, folder.id]);
    }
  };
  for (const n of nodes) if (!isVaultDoc(n)) walk(n as VaultFolder, []);
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const want = norm(name);
  const exact = leaves.filter((l) => norm(l.doc.title) === want);
  const byCode = exact.length ? exact : leaves.filter((l) => l.doc.num && l.doc.num !== '—' && norm(l.doc.num) === want);
  const pool = byCode.length ? byCode : leaves.filter((l) => norm(l.doc.title).includes(want));
  const distinct = [...new Map(pool.map((l) => [l.doc.id, l])).values()];
  if (distinct.length === 1) return { kind: 'one', ...distinct[0] };
  return distinct.length > 1 ? { kind: 'many', count: distinct.length } : { kind: 'none' };
}

/* ── File icon resolver (maps key to I[key]) ── */

function fileIcon(doc: VaultDoc): React.ReactNode {
  const key = vaultFileIconKey(doc);
  return (I as any)[key] || I.fileText;
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

/**
 * An upload's review stage beside its filing status (VR-13), where the server
 * said it: tree leaves carry it, search hits do not, and a hit is never
 * labelled "Not reviewed" for a stage nobody read.
 */
function reviewText(d: VaultDoc): string {
  return d.src === 'upload' && d.lifecycleStage !== undefined ? ` · ${stageLabel(d.lifecycleStage)}` : '';
}

/** The review stage's chip tone: approved reads as settled, in review as pending, the rest as idle. */
function stageTone(stage: string | null | undefined): string {
  if (APPROVED_STAGES.includes(stage ?? '')) return 'ok';
  return stage === 'in_review' ? 'ai' : 'idle';
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The header's document count, named by its parts.
 *
 * QA 2026-10-08 (j1): a program the wizard had just created read "1 document"
 * above lanes saying "0 uploaded files" and "Captured 0". The one was the IND
 * build the wizard scaffolds — an authored document, every section not started
 * — and a bare "1 document" reads as a file someone put here. The read names
 * its parts (`documentCounts`), so the header states them: authored documents,
 * governed artifacts when there are any, and uploads when that branch was read.
 * A branch that could not be read (null) is left out rather than shown as 0;
 * the read's `unavailable` list says why. Without the parts (the pending-store
 * answer), the total stands as it was.
 */
export function vaultCountLabel(v: Pick<VaultDisplayShape, 'documentCount' | 'documentCounts'>): string {
  const parts = v.documentCounts;
  if (!parts) return plural(v.documentCount, 'document', 'documents');
  return [
    plural(parts.authored, 'authored document', 'authored documents'),
    parts.artifacts ? plural(parts.artifacts, 'governed artifact', 'governed artifacts') : null,
    parts.uploads == null ? null : plural(parts.uploads, 'uploaded file', 'uploaded files'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Whether a document counts as settled in its folder's count. An upload is
 * settled when its version is approved (VR-13; FD4's strict default): a
 * confirmed filing says where it belongs, not that anyone approved it. An
 * authored section keeps its own status.
 */
export function isSettled(d: VaultDoc): boolean {
  if (d.src === 'upload') return APPROVED_STAGES.includes(d.lifecycleStage ?? '');
  return ['final', 'approved', 'reviewed'].includes(d.status);
}

/**
 * Who made a filing decision, and when: "Fern Filer, 2026-10-29 05:00 UTC"
 * (Part 11 review F4). A suggestion names nobody, so it gets no line; a filing
 * with no person recorded says so rather than leaving the reader to assume
 * one. Nothing from a server that predates the fields.
 */
export function filingDecisionLine(f: VaultDocFiling): string | null {
  if (f.placedAt === undefined || f.placementStatus === 'suggested') return null;
  if (!f.placedByRecorded && !f.placedAt) return f.placementStatus === 'confirmed' ? 'Not recorded' : null;
  const who = f.placedBy ?? (f.placedByRecorded ? 'Recorded; name not available' : 'Not recorded');
  return f.placedAt ? `${who}, ${f.placedAt.slice(0, 10)} ${f.placedAt.slice(11, 16)} UTC` : who;
}

function VaultTree({ nodes, depth, activeFolder, onPick, expanded, toggle }: VaultTreeProps) {
  return (
    <div>
      {nodes.map((n) => {
        if (isVaultDoc(n)) return null;
        const folder = n as VaultFolder;
        const docs = flattenDocs(folder.children);
        const isOpen = expanded[folder.id] !== false;
        const ready = docs.filter(isSettled).length;
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
                {I.chevRight}
              </span>
              <span className="vd-fico">
                {isOpen ? I.folderOpen : I.folder}
              </span>
              <span className="vd-flabel">
                {folder.code ? <b>{folder.code}</b> : null} {folder.label}
              </span>
              {/* Named, because a bare fraction beside the coverage panel's
                  "Required sections: 0 of 36 have a confirmed document" read as
                  a second, contradicting total (QA 2026-10-08, j1). This counts
                  the folder's own items that are settled; coverage counts
                  required CTD headings with a confirmed filing. */}
              <span
                className="vd-fcount"
                title={`${ready} of ${docs.length} settled — approved, final or reviewed`}
                aria-label={`${ready} of ${docs.length} settled — approved, final or reviewed`}
              >
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

/* ── Document history — this document's own audit trail (VR-01) ──
   Rendered by the shared RecordHistory (moved there 2026-10-15, when the
   Submission Center's Builder needed the same view of a sequence). */
function DocumentHistory({ projectId, documentUuid }: { projectId: string; documentUuid: string }) {
  const path =
    '/api/c2c/project-vault/' + encodeURIComponent(projectId) +
    '/documents/' + encodeURIComponent(documentUuid) + '/history';
  return <RecordHistory path={path} subject="document" testId="vault-document-history" reasonTestId="vault-history-reason" />;
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
  filing,
}: {
  block?: DataRoomBlock;
  /** The server's `unavailable` reason for the Data room branch, when it
   *  could not be served — rendered as a failure, never as an empty room. */
  unavailableReason?: string | null;
  /** Selection and "File into Vault" (VR-11). */
  filing: DataRoomFiling;
}) {
  const [open, setOpen] = useState(false);
  if (unavailableReason) {
    return (
      <div className="vd-dr" data-testid="vault-data-room">
        <div className="vd-dr-head">
          <span className="vd-dr-title">{I.inbox} Data room</span>
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
          <span className="vd-dr-title">{I.inbox} Data room</span>
          <span className="vd-dr-meta">No data room information for this project.</span>
        </div>
      </div>
    );
  }
  // Collapsed, the stage strip is the summary; expanding lists the sources.
  const rows = open ? block.sources : [];
  const unfiledIds = block.sources.filter((s) => s.stage !== 'filed').map((s) => s.id);
  const titleOf = (id: number) => block.sources.find((s) => s.id === id)?.title ?? `Source ${id}`;
  return (
    <div className="vd-dr" data-testid="vault-data-room">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.inbox} Data room</span>
        <span className="vd-dr-stages">
          <span className="vd-dr-stage">Captured <b>{roomCount(block.captured, block)}</b></span>
          <span className="vd-dr-arrow">›</span>
          <span className="vd-dr-stage">Classified <b>{roomCount(block.classified, block)}</b></span>
          <span className="vd-dr-arrow">›</span>
          <span className="vd-dr-stage">Filed to vault <b>{roomCount(block.filed, block)}</b></span>
        </span>
        <RoomNotes block={block} />
        {block.sources.length > 0 && (
          <button className="vd-dr-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide sources' : `Show ${block.sources.length} source${block.sources.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {block.sources.length === 0 && (
        <div className="vd-dr-empty">
          Nothing captured for this project yet. Files attached in AnA chat or dropped on
          the project’s Evidence step pass through the data room; files uploaded on this page go straight to
          the filing cabinet and are listed under Uploaded files.
        </div>
      )}
      {(open && unfiledIds.length > 0) || filing.outcome || filing.error ? (
        <DataRoomFileBar filing={filing} unfiledIds={unfiledIds} titleOf={titleOf} />
      ) : null}
      {rows.length > 0 && (
        <div className="vd-dr-rows">
          {rows.map((s) => (
            <div key={s.id} className="vd-dr-row">
              <RoomPick id={s.id} title={s.title} filed={s.stage === 'filed'} filing={filing} />
              <span className="vd-dr-kind">{s.kind}</span>
              <span className="vd-dr-name" title={s.title}>{s.title}</span>
              <span className="vd-dr-detail">
                {s.sizeLabel !== '—' ? `${s.sizeLabel} · ` : ''}{s.addedAt} · {s.readState}
              </span>
              {s.stage === 'classified' && s.suggestedFolderLabel ? (
                <span className="vd-dr-suggest" title={s.evidenceKind ? `Looks like: ${vaultDocKindLabel(s.evidenceKind)}` : undefined}>
                  → {s.suggestedFolderLabel}
                </span>
              ) : null}
              <span className={'rd-chip tone-' + (ROOM_STAGE[s.stage] ?? ROOM_STAGE.captured).tone}>
                {roomStageLabel(s)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Uploaded files lane — every vault.documents row the read carried ──
   The tree browses ONE folder at a time and opens on its first node, the
   governed CTD spine. The filing cabinet — where every upload and every
   document filed through the API lives — is the LAST node, so its leaves
   rendered nowhere on the page until a person found and clicked the branch.
   OQ-VAULT-09 opened the surface after filing a document and did not find its
   title (VSR-001 §8 F-11); OQ-VAULT-04 had already shown the read model
   carried it. A reviewer reads "not on the page" as "not in the vault".

   This lane is a projection of the SAME read (the cabinet branch of
   GET /api/c2c/project-vault/:id), not a second store or a second request:
   what it lists is exactly what the tree holds, flattened, with the cabinet
   folder each row sits in — which is its filing decision. The count is the
   server's programme-wide total, never the rows shown, so a capped window
   cannot understate the cabinet. A row opens its folder and selects it. */
const UPLOADS_LANE_ROWS = 8;

function UploadsLane({
  cabinet,
  window: win,
  status,
  onOpen,
}: {
  /** The read model's filing-cabinet branch. Absent when the read carried
   *  none, which the server reports under `unavailable` (rendered above). */
  cabinet: VaultFolder | null;
  window?: { shown: number; total: number; truncated: boolean };
  status: (s: string) => { tone: string; label: string };
  /** Open the cabinet folder a row sits in and, when given, select the row. */
  onOpen: (folderId: string, docId: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!cabinet) return null;
  const rows: Array<{ doc: VaultDoc; folder: VaultFolder }> = [];
  for (const child of cabinet.children) {
    if (isVaultDoc(child)) {
      rows.push({ doc: child as VaultDoc, folder: cabinet });
      continue;
    }
    const folder = child as VaultFolder;
    for (const doc of flattenDocs(folder.children)) rows.push({ doc, folder });
  }
  const total = win?.total ?? rows.length;
  const visible = showAll ? rows : rows.slice(0, UPLOADS_LANE_ROWS);
  return (
    <div className="vd-dr" data-testid="vault-uploads-lane">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.folder} Uploaded files</span>
        <span className="vd-dr-meta">
          {total} uploaded file{total === 1 ? '' : 's'} in this project
          {win?.truncated ? ` · ${win.shown} in this window` : ''}
        </span>
        <button className="vd-dr-toggle" onClick={() => onOpen(cabinet.id, null)}>
          Open filing cabinet
        </button>
      </div>
      {rows.length === 0 && (
        <div className="vd-dr-empty">
          No files uploaded to this project yet. A file uploaded here, or filed through the
          API, is listed here and in the filing cabinet.
        </div>
      )}
      {visible.length > 0 && (
        <div className="vd-dr-rows">
          {visible.map(({ doc, folder }) => (
            <div key={doc.id} className="vd-dr-row">
              <span className="vd-dr-kind">{doc.type}</span>
              {/* The title is the point of this lane. `.vd-dr-name` caps at 32%
                  of its container, which inside a shrink-wrapped button is a
                  few characters — so the cap moves to the button, a flex item
                  of the row, and the name fills it. The cap is `.vd-dr-open`,
                  not an inline style, so a narrow screen can lift it: at
                  390 px the row's fixed parts left the name 0 px wide. */}
              <button
                type="button"
                className="vd-crumb vd-dr-open"
                title={doc.preview || doc.title}
                onClick={() => onOpen(folder.id, doc.id)}
              >
                <span className="vd-dr-name" style={{ maxWidth: 'none' }}>
                  {doc.title}
                </span>
              </button>
              <span className="vd-dr-detail">
                {doc.sizeLabel ? `${doc.sizeLabel} · ` : ''}
                {doc.updated}
                {doc.owner && doc.owner !== '—' ? ` · ${doc.owner}` : ''}
              </span>
              <span className="vd-dr-suggest">→ {folder.label}</span>
              <span className={'rd-chip tone-' + status(doc.status).tone}>
                {status(doc.status).label}
              </span>
            </div>
          ))}
        </div>
      )}
      {rows.length > visible.length && (
        <button className="vd-dr-toggle" onClick={() => setShowAll(true)}>
          Show all {rows.length} in this window
        </button>
      )}
    </div>
  );
}

/* GET /api/c2c/project-vault/:id/search — the find view's contract is VaultSearchShape
   (VaultLibraryResults.tsx), the one guard every reader of that route uses. */

/** The empty line under a verified read, worded for what was asked. */
function noMatchText(searching: boolean, hasText: boolean, filtering: boolean): string {
  if (!searching) return ' in this folder';
  if (!hasText) return ' match these filters';
  return filtering ? ' match your search and filters' : ' match your search';
}

type FilterOption = { value: string; label: string; covers?: readonly string[] };

/**
 * One filter: "Any", or a single value of the dimension. With counts from a
 * verified read, each value says how many documents choosing it selects, under
 * the other filters and the text (the server counts without this dimension's own
 * filter). Without them, no number is shown: an absent count is not zero.
 */
function FindFilterSelect({ label, value, options, onChange, counts }: {
  label: string; value: string; options: readonly FilterOption[]; onChange: (value: string) => void;
  counts?: Map<string, number> | null;
}) {
  const countOf = (o: FilterOption) => (o.covers ?? [o.value]).reduce((n, v) => n + (counts?.get(v) ?? 0), 0);
  return (
    <label className="vd-filter">
      <span className="vd-filter-l">{label}</span>
      <select className="c2c-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map((o) => <option key={o.value} value={o.value}>{counts ? `${o.label} (${countOf(o)})` : o.label}</option>)}
      </select>
    </label>
  );
}

const TYPE_OPTIONS: FilterOption[] = VAULT_INGEST_DOCUMENT_TYPES.map((t) => ({ value: t, label: vaultIngestTypeLabel(t) }));
const FILING_OPTIONS: FilterOption[] = (['unfiled', 'suggested', 'confirmed'] as const).map((s) => ({ value: s, label: vaultStatus(s).label }));
const CLASSIFICATION_OPTIONS: FilterOption[] = VAULT_CLASSIFICATIONS.map((c) => ({ value: c, label: VAULT_CLASSIFICATION_LABELS[c] }));
const KIND_OPTIONS: FilterOption[] = VAULT_DOC_KINDS.map((k) => ({ value: k.value, label: k.one }));
const STAGE_OPTIONS: FilterOption[] = VAULT_STAGE_CHOICES.map((c) => ({ value: c.value, label: c.label, covers: c.stages }));

/**
 * The find view's metadata filters (VR-18): type, filing status,
 * classification, evidence kind, review stage and CTD section, each sent to the
 * same server search as the text. A CTD section is applied on Enter or when the
 * field is left, and only once it reads as a section code; until then the row
 * says it is not applied, rather than filtering by something else.
 */
function VaultFindFilterRow({ value, onChange, onClear, facets }: {
  value: VaultFindFilters; onChange: (next: VaultFindFilters) => void; onClear: () => void;
  /** The verified read's facet counts, or null when there are none to show. */
  facets?: unknown;
}) {
  const counts = (key: keyof VaultFindFilters) => (facets ? facetCounts(facets, key) : null);
  const [ctd, setCtd] = useState(value.ctdSection?.[0] ?? '');
  const [ctdRefused, setCtdRefused] = useState<string | null>(null);
  const set = (key: keyof VaultFindFilters, values: readonly string[] | null) => {
    const next = { ...value };
    if (values && values.length) next[key] = [...values];
    else delete next[key];
    onChange(next);
  };
  const one = (key: keyof VaultFindFilters) => value[key]?.[0] ?? '';
  const stageValue = VAULT_STAGE_CHOICES.find((c) => c.stages[0] === value.lifecycleStage?.[0])?.value ?? '';
  const commitCtd = () => {
    const text = ctd.trim();
    const code = normalizeCtdCode(text);
    setCtdRefused(text && !code ? text : null);
    if (code) setCtd(code);
    if ((value.ctdSection?.[0] ?? null) !== code) set('ctdSection', code ? [code] : null);
  };
  const active = Object.keys(value).length > 0;
  return (
    <div className="vd-filters" role="group" aria-label="Filter documents">
      <FindFilterSelect label="Type" value={one('documentType')} options={TYPE_OPTIONS} counts={counts('documentType')} onChange={(v) => set('documentType', v ? [v] : null)} />
      <FindFilterSelect label="Filing" value={one('placementStatus')} options={FILING_OPTIONS} counts={counts('placementStatus')} onChange={(v) => set('placementStatus', v ? [v] : null)} />
      <FindFilterSelect label="Classification" value={one('classification')} options={CLASSIFICATION_OPTIONS} counts={counts('classification')} onChange={(v) => set('classification', v ? [v] : null)} />
      <FindFilterSelect label="Evidence kind" value={one('evidenceKind')} options={KIND_OPTIONS} counts={counts('evidenceKind')} onChange={(v) => set('evidenceKind', v ? [v] : null)} />
      <FindFilterSelect
        label="Review"
        value={stageValue}
        options={STAGE_OPTIONS}
        counts={counts('lifecycleStage')}
        onChange={(v) => set('lifecycleStage', VAULT_STAGE_CHOICES.find((c) => c.value === v)?.stages ?? null)}
      />
      <label className="vd-filter">
        <span className="vd-filter-l">CTD section</span>
        <input
          className="c2c-input"
          value={ctd}
          placeholder="e.g. 3.2.P"
          aria-describedby={ctdRefused ? 'vd-filter-ctd-note' : undefined}
          onChange={(e) => setCtd(e.target.value)}
          onBlur={commitCtd}
          onKeyDown={(e) => { if (e.key === 'Enter') commitCtd(); }}
        />
      </label>
      {active && (
        <button type="button" className="vd-crumb" onClick={onClear}>
          Clear filters
        </button>
      )}
      {ctdRefused && (
        <span id="vd-filter-ctd-note" className="vd-filter-note" role="status">
          &ldquo;{ctdRefused}&rdquo; is not a CTD section code (for example 3.2.P or 2.7.3), so it is not applied.
        </span>
      )}
    </div>
  );
}

/* ── Vault surface ──
   Document management aligned to the real dossier structure. The folder tree IS
   the project's live eCTD / eSTAR / IVDR / TMF spine (segment- and
   build-type-aware), served by GET /api/c2c/project-vault/:id straight from the
   governed document store. Real data → honest empty → honest error; no fixture. */

/** The Vault shows one program's documents; with none open there is no vault
 *  to operate, and "no documents" or "no such folder" would misstate why. */
/**
 * The governed-artifact leaf of the tree whose registry id is `artifactId`, for
 * vault.focus-document by id (the Live Drive hand-off). One id is one leaf.
 */
export function findVaultArtifactLeaf(
  nodes: readonly (VaultFolder | VaultDoc)[],
  artifactId: string,
): { kind: 'one'; doc: VaultDoc; folder: VaultFolder; ancestors: string[] } | { kind: 'none' } {
  const walk = (folder: VaultFolder, ancestors: string[]): { doc: VaultDoc; folder: VaultFolder; ancestors: string[] } | null => {
    for (const child of folder.children) {
      if (isVaultDoc(child)) {
        if (child.artifact?.artifactId === artifactId) return { doc: child, folder, ancestors };
      } else {
        const hit = walk(child as VaultFolder, [...ancestors, folder.id]);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const n of nodes) {
    if (isVaultDoc(n)) continue;
    const hit = walk(n as VaultFolder, []);
    if (hit) return { kind: 'one', ...hit };
  }
  return { kind: 'none' };
}

const NO_PROGRAM_OPEN = 'No project is open, so there is no vault here yet — open a project first.';

/** Keep the recorded refusal with the action rather than only in a hover hint. */
function VaultSourceWorkButton({ source, onPull }: { source: VaultDoc; onPull: (source: VaultDoc) => void }) {
  const reasonId = useId();
  const unavailable = sourceImportUnavailableReason({ ...source, isCurrent: source.earlierVersion ? false : undefined });
  return <div className="source-work-action">
    <button type="button" className="sp-primary" disabled={Boolean(unavailable)} title={unavailable ?? undefined}
      aria-describedby={unavailable ? reasonId : undefined} onClick={() => onPull(source)}>{I.penLine} Work on document</button>
    {unavailable && <p className="sec-sub" id={reasonId}>{unavailable}</p>}
  </div>;
}

/* The Vault for the project open now. The body is keyed by the project, so a
   switch remounts it with no data: the read hook keeps the last payload while a
   new path loads, and the previous project's documents must not stand in for the
   new project's while it loads. */
export function Vault(props: SurfaceViewProps) {
  return <VaultForProject key={currentProjectId() ?? ''} {...props} />;
}

function VaultForProject({ onAsk, onNav }: SurfaceViewProps) {
  const available = useSurfaceAvailable();
  const projectId = currentProjectId();
  const [pullDoc, setPullDoc] = useState<VaultDoc | null>(null);
  const vaultPath = projectId
    ? '/api/c2c/project-vault/' + encodeURIComponent(projectId)
    : null;
  /* Bumped after an upload so the tree is re-read from the server rather than
     patched locally: what the Vault shows is what the Vault stored. */
  const [vaultEpoch, setVaultEpoch] = useState(0);
  const vaultState = useLiveData<VaultDisplayShape>(vaultPath, [vaultPath, vaultEpoch]);
  // The placeholder shows only before there is data to show. A re-read after a change keeps the
  // body mounted, so a confirmation held in it (a save, a post, a decision) stays on screen.
  const vault = vaultState.data;
  /* The payload on screen when an upload settles: the document it recorded is
     in the re-read that follows, not in this one (see `pendingTarget`). */
  const latestVault = React.useRef(vault);
  latestVault.current = vault;
  /* The data room's "File into Vault" (VR-11): held here so its answer
     survives the re-read that follows a filing. */
  const roomFiling = useDataRoomFiling(projectId ?? null, () => setVaultEpoch((n) => n + 1));
  /* Confirm N suggested (VR-11b): held here for the same reason. */
  const confirmSuggested = useConfirmSuggested(projectId ?? null, () => setVaultEpoch((n) => n + 1));
  const canWrite = useVaultCanWrite();

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

  /* A file refused because a different file is recorded at that name (409
     VERSION_CONTENT_CONFLICT) is offered as the next version of that document
     (VR-09), rather than left at a dead end. The document is the tree's leaf
     with that code, which is its current version. */
  const [checkInOffers, setCheckInOffers] = useState<Array<{ file: File; doc: VaultDoc }>>([]);
  /* Files chosen or dropped wait here, one row each, until the person sends
     them (VaultUploadStaging.tsx, gap 7.1): each row's title, type, version,
     classification and filing go with its own file. */
  const [staging, setStaging] = useState<Staging | null>(null);
  /* The header's drop zone, so Coverage's "upload here" opens the same picker. */
  const uploadControls = React.useRef<FileDropZoneControls | null>(null);
  /* Closing the upload list returns focus to the button that opened it (a11y review, 2026-10-22). */
  const addFilesButton = React.useRef<HTMLButtonElement | null>(null);
  const patchStaged = (key: string, patch: Partial<StagedFile>) =>
    setStaging((st) => st && { ...st, rows: st.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const uploadStaged = async () => {
    if (!staging) return;
    const pending = staging.rows.filter((r) => !r.status || r.status.state === 'refused');
    const outcome = await upload(pending.map((r) => r.file), {
      documentType: docType,
      fields: pending.map(fieldsOf),
      onFileStatus: (index, status) => patchStaged(pending[index].key, { status }),
    });
    setCheckInOffers(
      outcome.conflicts.flatMap(({ name, file }) => {
        const doc = allDocs.find((d) => d.src === 'upload' && d.docId && d.documentCode === name);
        return doc ? [{ file, doc }] : [];
      }),
    );
    // Open what was recorded (the batch's first document), as "Open in Vault" opens a filed one.
    openRecorded(outcome.recorded[0]);
    // Re-read the tree so what is shown is what the server stored.
    if (outcome.succeeded.length) setVaultEpoch((n) => n + 1);
  };
  /** Add `file` as the next version of `doc`: the server numbers it and keeps the code and filing. */
  const uploadNewVersion = async (file: File, doc: VaultDoc, currentId?: string) => {
    if (!doc.docId) return;
    const recordedType = doc.details?.documentType;
    const outcome = await upload([file], {
      documentType: (VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).includes(recordedType ?? '')
        ? (recordedType as VaultIngestDocumentType)
        : docType,
      newVersionOf: { documentId: currentId ?? doc.docId, title: doc.details?.documentTitle || doc.title },
    });
    // The offer stays until the version is recorded: a dropped connection must not lose the file.
    if (outcome.succeeded.includes(file.name)) {
      setCheckInOffers((offers) => offers.filter((o) => o.file !== file));
      // The row on screen is the version this one replaced: open the document at the new one.
      openRecorded(outcome.recorded[0]);
      setVaultEpoch((n) => n + 1);
    }
  };
  /** Open `documentId` once the re-read that follows an upload holds it. */
  const openRecorded = (documentId: string | undefined) => {
    if (documentId) setPendingTarget({ kind: 'uploaded', documentId, after: latestVault.current });
  };

  /* ── Filing decisions (confirm / move / unfile) ────────────────────────────
     POST /api/c2c/project-vault/:id/file — the governed, audited commit of a
     placement. The classifier only ever SUGGESTS a folder; this is where a
     person decides. On success the tree is re-read rather than patched
     locally: what the Vault shows is what the Vault stored. */
  const [filing, setFiling] = useState(false);
  const [filingNote, setFilingNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  /* §11.10(e): the placement write is audited already; this is the reason the
     person gives for it, sent as the route's `note` and recorded as the
     placement rationale. Optional — a filing is not a signature — but when
     given it travels with the decision rather than being lost. */
  const [filingReason, setFilingReason] = useState('');
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
  /* `programId`: a library hit downloads through the project that holds it. */
  const downloadVaultDoc = async (docId: string, title: string, programId: string | null = projectId) => {
    if (!programId || downloading) return;
    setDownloading(docId);
    setDownloadNote(null);
    try {
      const res = await apiRequest(
        'GET',
        `/api/c2c/project-vault/${encodeURIComponent(programId)}/documents/${encodeURIComponent(docId)}/download`,
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

  /* A governed artifact's DOCX (fold F3 slice B): the Artifacts center's
     governed export, recorded before it is delivered. A refusal is said in the
     same banner as an upload's, with its reason. */
  const downloadArtifact = async (doc: VaultDoc) => {
    if (!doc.artifact || downloading) return;
    setDownloading(doc.id);
    setDownloadNote(null);
    try {
      const out = await fetchGovernedArtifactDocx(doc);
      if (!out.ok) {
        setDownloadNote({ text: out.text, tone: 'error' });
        return;
      }
      const saved = downloadBlob(out.name, out.blob);
      setDownloadNote(saved ? null : { text: `${doc.title} was fetched but the browser refused the download.`, tone: 'error' });
    } finally {
      setDownloading('');
    }
  };

  /* The governed artifacts across the projects the caller can open (fold F3
     slice C): the Artifacts center's gallery, folded in. Shown with no project
     open; read only when a person opens it while a project is. */
  const [orgOpen, setOrgOpen] = useState(false);
  const orgActive = !projectId || orgOpen;
  const orgRead = useOrganizationArtifacts(orgActive);
  const [orgFocusId, setOrgFocusId] = useState<string | null>(null);
  const downloadOrganizationArtifact = async (row: OrganizationArtifactRow) => {
    if (downloading) return;
    setDownloading(row.id);
    setDownloadNote(null);
    try {
      const out = await fetchOrganizationArtifactDocx(row);
      if (!out.ok) {
        setDownloadNote({ text: out.text, tone: 'error' });
        return;
      }
      const saved = downloadBlob(out.name, out.blob);
      setDownloadNote(saved ? null : { text: `${row.name} was fetched but the browser refused the download.`, tone: 'error' });
    } finally {
      setDownloading('');
    }
  };
  const exportOrganizationManifest = () => {
    const saved = downloadArtifactManifest('governed-artifacts-across-projects.csv', organizationManifestRows(orgRead.rows));
    if (!saved) setDownloadNote({ text: 'The manifest was built but the browser refused the download.', tone: 'error' });
  };

  const fileDocument = async (
    docId: string,
    body: { confirm?: boolean; folderId?: string | null; ctdSection?: string; note?: string },
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
      setFilingReason('');
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

  /* The read model's filing-cabinet branch: every upload and every document
     filed through the API. One lookup, shared by the uploads lane and the
     "Move to…" folder list below. */
  const cabinet = useMemo(
    () => (tree.find((f) => f.id === 'cabinet') as VaultFolder | undefined) ?? null,
    [tree],
  );
  /* Folder options for "Move to…" — derived from the server's cabinet (the
     program's real view taxonomy), never a client-side folder list. */
  const cabinetFolders = useMemo(() => {
    if (!cabinet) return [] as Array<{ id: string; label: string }>;
    return cabinet.children
      .filter((c): c is VaultFolder => !isVaultDoc(c) && (c as VaultFolder).id !== 'cab-unfiled')
      .map((c) => ({ id: c.id.replace(/^cab-/, ''), label: c.label }));
  }, [cabinet]);
  /* An upload may name only a folder of this program's own view: the cabinet's
     "filed under another view" group is listed for review, and ingest refuses it. */
  const uploadFolders = useMemo(() => cabinetFolders.filter((f) => f.id !== 'other-view'), [cabinetFolders]);
  const [moveTarget, setMoveTarget] = useState('');
  /* The uploaded documents a person may file at a missing section (VR-15). */
  const coverageDocuments = useMemo<CoverageDocument[]>(() => {
    const out: CoverageDocument[] = [];
    const walk = (nodes: (VaultDoc | VaultFolder)[]) => {
      for (const n of nodes) {
        if (isVaultDoc(n)) {
          if (n.docId) out.push({ docId: n.docId, title: n.title });
        } else if ((n as VaultFolder).children) walk((n as VaultFolder).children);
      }
    };
    if (cabinet) walk(cabinet.children);
    return out;
  }, [cabinet]);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  /* The find view's metadata filters (VR-18), sent to the same search as the
     text. Bumping filterReset remounts the filter row, so its CTD draft clears
     with them. */
  const [findFilters, setFindFilters] = useState<VaultFindFilters>({});
  const [filterReset, setFilterReset] = useState(0);
  /** Leave the find view for the tree: the text and the filters go together. */
  const leaveFind = () => { setQ(''); setFindFilters({}); setFilterReset((n) => n + 1); };
  const [selId, setSel] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: e[id] === false ? true : false }));
  /* From the uploads lane: browse the cabinet folder the row sits in (with the
     cabinet un-collapsed down to it) and select the row — the same state the
     tree's own controls drive, so the list, breadcrumb and detail pane agree. */
  const openUpload = (folderId: string, docId: string | null) => {
    leaveFind();
    setActiveFolder(folderId);
    setExpanded((e) => ({ ...e, cabinet: true, [folderId]: true }));
    if (docId) setSel(docId);
  };
  /* From the governed-artifacts lane: browse the branch in the tree. */
  const openArtifacts = () => {
    leaveFind();
    setActiveFolder('artifacts');
    setExpanded((e) => ({ ...e, artifacts: true }));
  };
  /* The branch's CSV manifest (slice B): the shared builder the Artifacts
     center uses, over the rows the tree lists. */
  const exportArtifactManifest = () => {
    const branch = tree.find((f) => f.id === 'artifacts');
    if (!branch) return;
    const project = vault?.program || 'project';
    const saved = downloadArtifactManifest(
      `${safeFileName(project, 'project')}-governed-artifacts.csv`,
      governedArtifactManifestRows(branch, project),
    );
    if (!saved) setDownloadNote({ text: 'The manifest was built but the browser refused the download.', tone: 'error' });
  };
  /* "Open in Vault" after File to Vault names the document it filed
     (vaultTarget.ts): open on that row, where "Place into filing…" is,
     instead of the first node. A document this tree does not hold, or one
     filed under another project, is said, not silently ignored.
     An upload opens the document the server recorded the same way, once the
     re-read it asked for has landed: `after` is the payload on screen when it
     settled, which cannot hold that document, so it is not looked for there. */
  const [pendingTarget, setPendingTarget] = useState<
    TakenVaultTarget | { kind: 'uploaded'; documentId: string; after: VaultDisplayShape | null } | null
  >(() => takeVaultTarget(projectId));
  // A target published while this Vault is already on screen (a notice opened from the tray).
  React.useEffect(() => {
    const take = () => {
      if (!vaultTargetIsFor(projectId ?? null)) return;
      const taken = takeVaultTarget(projectId);
      if (taken?.kind === 'here') setPendingTarget(taken);
    };
    window.addEventListener(VAULT_TARGET_EVENT, take);
    return () => window.removeEventListener(VAULT_TARGET_EVENT, take);
  }, [projectId]);
  const [missingTarget, setMissingTarget] = useState<{ documentId: string; act: 'filed' | 'uploaded' } | null>(null);
  const [otherProjectTarget] = useState(() => pendingTarget?.kind === 'other-project');
  React.useEffect(() => {
    if (!pendingTarget || !vault) return;
    if (pendingTarget.kind === 'uploaded' && pendingTarget.after === vault) return;
    if (pendingTarget.kind !== 'other-project') {
      const at = locateVaultDocument(tree, pendingTarget.documentId);
      if (at) {
        setQ('');
        setFindFilters({});
        setFilterReset((n) => n + 1);
        setActiveFolder(at.folderId);
        setExpanded((e) => ({ ...e, cabinet: true, [at.folderId]: true }));
        setSel(at.rowId);
      } else {
        setMissingTarget({ documentId: pendingTarget.documentId, act: pendingTarget.kind === 'uploaded' ? 'uploaded' : 'filed' });
      }
    }
    setPendingTarget(null);
  }, [pendingTarget, vault, tree]);
  // Derived, so a re-read that now holds the document retires the note.
  const targetMissing = missingTarget !== null && locateVaultDocument(tree, missingTarget.documentId) === null;

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

  /* Artifact ids given one re-read by vault.focus-document, while it waits for it. */
  const rereadFor = React.useRef(new Set<string>());
  /* vault.focus-document with no project open: the organization view's row,
     by id or by name, as the Artifacts center's focus-artifact did. */
  const focusOrganizationArtifact = (wantedId: string, wanted: string) => {
    if (orgRead.loading)
      return { ok: false as const, reason: 'The governed artifacts across your projects are still loading.', retry: true };
    if (orgRead.error)
      return { ok: false as const, reason: 'The governed artifacts across your projects could not be read.' };
    const found = findOrganizationArtifact(orgRead.rows, wantedId ? { artifactId: wantedId } : { name: wanted });
    if (found.kind === 'none' && wantedId) {
      if (!rereadFor.current.has(wantedId)) {
        rereadFor.current.add(wantedId);
        orgRead.reload();
        return { ok: false as const, reason: 'Reading the governed artifacts again for that artifact.', retry: true };
      }
      rereadFor.current.delete(wantedId);
      return { ok: false as const, reason: `No governed artifact ${wantedId} in the projects you can open.` };
    }
    if (wantedId) rereadFor.current.delete(wantedId);
    if (found.kind === 'none') return { ok: false as const, reason: `No governed artifact named "${wanted}" in the projects you can open.` };
    if (found.kind === 'many') {
      return { ok: false as const, reason: `"${wanted}" matches ${found.count} governed artifacts across your projects — name one exactly.` };
    }
    setOrgFocusId(found.row.id);
    return { ok: true as const, detail: `Focused “${found.row.name}” (${found.row.prog}) in governed artifacts across your projects` };
  };

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     vault.*). Both handlers drive the SAME state the human's own controls
     drive (setQ / setActiveFolder / setExpanded); a folder AnA names is
     resolved against the REAL tree with honest misses, never a guess. */
  useSurfaceActionHandlers('vault', {
    'vault.search': (params) => {
      const query = (params.query ?? '').trim();
      if (!query) return { ok: false, reason: 'No search term given.' };
      if (!projectId) return { ok: false, reason: NO_PROGRAM_OPEN };
      if (vaultState.error) return { ok: false, reason: 'The vault could not be read.' };
      /* Held until the read settles, then refused on an empty vault. The query
         is view state, and it used to be applied mid-load on the grounds that
         it filters whatever arrives. But an empty vault renders its empty
         state and no search box at all, so the query went nowhere visible
         while AnA was told "Searching the vault" and said so — a search the
         person could not see, over documents that do not exist. */
      if (vaultState.loading)
        return { ok: false, reason: 'The vault is still loading.', retry: true };
      if (allDocs.length === 0)
        return { ok: false, reason: 'This vault has no documents yet, so there is nothing to search.' };
      setQ(query);
      return { ok: true, detail: `Searching the vault for "${query}"` };
    },
    'vault.open-folder': (params) => {
      const wanted = (params.folder ?? '').trim().toLowerCase();
      if (!wanted) return { ok: false, reason: 'No folder named.' };
      if (!projectId) return { ok: false, reason: NO_PROGRAM_OPEN };
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
      leaveFind();
      setActiveFolder(target.folder.id);
      setExpanded((e) => {
        const next = { ...e };
        for (const a of target.ancestors) next[a] = true;
        next[target.folder.id] = true;
        return next;
      });
      return { ok: true, detail: `Opened ${target.folder.label}` };
    },
    /* Selects a document, the state a person's click on its row drives (slice
       B: the Vault's counterpart of artifacts-center.focus-artifact). By title
       or section code, or, since slice C, by a governed artifact's id: the Live
       Drive hand-off (V2App followWork) names the artifact AnA just saved.
       With no project open it focuses the row in the organization view. An id
       the tree does not hold yet (saved after the tree was read) gets one
       re-read before it is a miss. */
    'vault.focus-document': (params) => {
      const wantedId = (params.artifactId ?? '').trim();
      const wanted = (params.document ?? '').trim();
      if (!wantedId && !wanted) return { ok: false, reason: 'No document named.' };
      if (!projectId) return focusOrganizationArtifact(wantedId, wanted);
      if (vaultState.loading)
        return { ok: false, reason: 'The vault is still loading.', retry: true };
      if (vaultState.error) return { ok: false, reason: 'The vault could not be read.' };
      const found = wantedId ? findVaultArtifactLeaf(tree, wantedId) : findNamedVaultDocument(tree, wanted);
      if (found.kind === 'none' && wantedId) {
        if (!rereadFor.current.has(wantedId)) {
          rereadFor.current.add(wantedId);
          setVaultEpoch((n) => n + 1);
          return { ok: false, reason: 'Reading the vault again for that artifact.', retry: true };
        }
        rereadFor.current.delete(wantedId);
        return { ok: false, reason: `The artifact ${wantedId} is not in this project’s Vault: it belongs to another project, or it is archived.` };
      }
      if (wantedId) rereadFor.current.delete(wantedId);
      if (found.kind === 'none') return { ok: false, reason: `No document named "${params.document}" in this vault.` };
      if (found.kind === 'many') {
        return { ok: false, reason: `"${params.document}" matches ${found.count} documents — name one exactly.` };
      }
      leaveFind();
      setActiveFolder(found.folder.id);
      setExpanded((e) => {
        const next = { ...e };
        for (const a of found.ancestors) next[a] = true;
        next[found.folder.id] = true;
        return next;
      });
      setSel(found.doc.id);
      return { ok: true, detail: `Selected “${found.doc.title}” in ${found.folder.label}` };
    },
  });
  /* The ready signal for the retry contract above: when the read settles, a
     held not-ready directive gets its one re-attempt. */
  React.useEffect(() => {
    if (!vaultState.loading && !orgRead.loading) notifySurfaceActionReady('vault');
  }, [vaultState.loading, orgRead.loading]);

  // No live selection yet → fall back to the first folder / first doc so the
  // surface shows something without seeding local state from the async tree.
  const folder = findFolder(tree, activeFolder) || tree[0] || null;
  const folderDocs = folder ? flattenDocs(folder.children) : [];
  const filterParams = vaultFilterParams(findFilters);
  const filtering = filterParams !== '';
  /* Finding is the text, the filters, or both. Filters alone browse what they
     select (the server's 'browse' mode); an empty box with no filter is the
     tree, never "everything". */
  const searching = q.trim().length > 0 || filtering;

  /* SEARCH RUNS ON THE SERVER.
     This was `allDocs.filter(d => (title + preview + num + type).includes(q))` —
     a substring match over the rows the tree happened to deliver, which cannot
     match document CONTENT and misses anything the read did not carry. On a
     document management system that is the difference between "not found" and
     "not there", and a reviewer reads the first as the second.
     GET /:id/search is ranked full text over title, file name and extracted
     body. The tree stays the browse view; this is the find view. */
  const trimmedQ = q.trim();
  /* Current versions only unless asked (VR-09): an earlier version is the same
     document, and listing it beside its successor reads as two. */
  const [includeEarlier, setIncludeEarlier] = useState(false);
  /* Library search: accessible projects' Vaults. While it is on,
     the project search does not run; VaultLibraryResults reads the library. */
  const [allProjects, setAllProjects] = useState(false);
  const libraryMode = searching && allProjects;
  const searchPath =
    projectId && searching && !allProjects ? '/api/c2c/project-vault/' + encodeURIComponent(projectId) +
      '/search?q=' + encodeURIComponent(trimmedQ) + '&limit=100' +
      (includeEarlier ? '&includeSuperseded=true' : '') + filterParams + '&facets=true' : null;
  /** What is narrowing the list, in words, for AnA: "filtered to N by …" and "the search for …". */
  const findLabel = trimmedQ ? `the search "${trimmedQ}"${filtering ? ' and the filters' : ''}` : 'the filters';
  const findSubject = trimmedQ ? `"${trimmedQ}"${filtering ? ' with the filters' : ''}` : 'the filters';
  const searchState = useLiveData<VaultSearchShape>(searchPath, [searchPath], isVaultSearchShape);
  const verifiedSearch = !searchState.loading && !searchState.error && searchState.data !== null;
  const searchUnavailable = searching && !libraryMode && !searchState.loading && !verifiedSearch;

  const results = searching
    ? (verifiedSearch ? searchState.data?.results ?? [] : []).map(searchHitToDoc)
    : folderDocs;
  /* The vault document currently being filed into a submission, if any. The
     tree id is `up-<uuid>`; the uuid is what a leaf names. */
  const [filingIntoSubmission, setFilingIntoSubmission] = React.useState<
    {
      documentUuid: string; documentTitle: string; mimeType?: string | null;
      /** The document's filing, so the dialog can pre-fill a confirmed section. */
      filing?: { ctdSection: string | null; placementStatus: string } | null;
    } | null
  >(null);

  /* The tree's record of a document wins over a search hit for the same one:
     it carries the filing block (Confirm, Move, Place into filing) that a
     hit does not, and keeps the hit's matching excerpt. A document only the
     search found is shown as its hit. */
  const pick = (id: string | undefined): VaultDoc | undefined => {
    if (id === undefined) return undefined;
    const leaf = allDocs.find((d) => d.id === id);
    const hit = searching ? results.find((d) => d.id === id) : undefined;
    if (searching && !hit) return undefined;
    if (!leaf) return hit;
    // While searching, the excerpt that matched is what the reader needs to see.
    return hit?.preview ? { ...leaf, preview: hit.preview } : leaf;
  };
  const sel = pick(selId ?? undefined) || pick(results[0]?.id) || (searching ? null : allDocs[0]) || null;

  /* What AnA can see of this screen.
     Until now she knew the user was on "vault" and nothing else — not which
     folder was open, which document was selected, or that a search was
     narrowing the list — so "what is blocking this?" had to be answered by the
     user restating their own screen.

     A FAILED read publishes the failure, never counts. `allDocs` is [] both
     when the vault is genuinely empty and when the read threw, and a summary
     saying "0 documents" over an outage would make AnA confidently wrong about
     a customer's repository. Loading says loading for the same reason. */
  // Memoized on the read's own fields (the wrapper is new each render), so the context below changes only when they do.
  const { rows: orgRows, loading: orgLoading, error: orgError, meta: orgMeta } = orgRead;
  const organizationArtifacts = useMemo(
    () => organizationArtifactsFacts({ rows: orgRows, loading: orgLoading, error: orgError, meta: orgMeta }, orgActive),
    [orgRows, orgLoading, orgError, orgMeta, orgActive],
  );
  const orgFocused = orgFocusId ? orgRead.rows.find((r) => r.id === orgFocusId) ?? null : null;
  const anaContext = useMemo(() => {
    /* No project open: no tree, and the organization view is what is on screen
       (fold F3 slice C). Its failure is published as a failure, never as zero. */
    if (!projectId) return organizationViewContext({ loading: orgLoading, error: orgError }, organizationArtifacts, orgFocused);
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
    if (libraryMode) {
      return {
        summary: `An accessible-project search for ${findSubject} is open. Its separate library panel must be read before describing matches; this context does not verify its result count.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, requestedSearchScope: 'accessible-projects' },
      };
    }
    if (searching && searchState.loading) {
      return {
        summary: `The vault search is still loading for ${findSubject}; no match count or selection is verified.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, searchState: 'loading' },
      };
    }
    if (searchUnavailable) {
      return {
        summary: `The vault search for ${findSubject} could not be verified; this is a failed read, not a result of zero matches.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, searchState: 'unavailable' },
        availableActions: ['Retry the vault search'],
      };
    }
    const shown = results.length;
    return {
      summary:
        `Document vault: ${vault?.documentCount ?? 0} document(s)` +
        (vault?.unfiledCount ? `, ${vault.unfiledCount} upload(s) unfiled` : '') +
        (folder ? `, folder "${folder.label}" open` : '') +
        (searching ? `, filtered to ${shown} by ${findLabel}` : '') +
        (sel ? `, "${sel.title}" selected` : ''),
      facts: {
        // The server's count of documents. allDocs is the tree's leaves: each
        // section of an authored document, and only the uploads on the page.
        totalDocuments: vault?.documentCount ?? 0,
        documentCounts: vault?.documentCounts ?? null,
        unfiledUploads: vault?.unfiledCount ?? 0,
        // Filed to a suggested folder that no person has confirmed (VR-11b); null from an older server.
        awaitingConfirmation: vault?.awaitingConfirmationCount ?? null,
        // Required sections against confirmed filings (VR-15), as the server
        // counted them, or why there is no figure. Not a readiness figure.
        vaultCoverage: vault?.coverage ?? null,
        dataRoom: vault?.dataRoom
          ? {
              captured: vault.dataRoom.captured,
              classified: vault.dataRoom.classified,
              filed: vault.dataRoom.filed,
              needsReview: vault.dataRoom.needsReview ?? null,
              // The counts are exact; when true, only the list is the newest sources.
              listTruncated: vault.dataRoom.window?.truncated === true,
            }
          : vault?.unavailable?.some((u) => u.branch === 'Data room')
            ? 'unavailable — counts unknown, not zero'
            : null,
        // The project's governed artifacts (fold F3 slice A), or that they could not be read.
        governedArtifacts: governedArtifactsFacts(vault?.artifacts, vault?.unavailable),
        // Across the projects the caller can open, when a person opened that view (slice C).
        organizationArtifacts,
        unavailableBranches: vault?.unavailable?.map((u) => u.branch) ?? [],
        shownInList: shown,
        searchQuery: trimmedQ || null,
        filters: filtering ? findFilters : null,
        openFolder: folder ? { id: folder.id, code: folder.code, label: folder.label } : null,
        selected: sel
          ? {
              id: sel.id, number: sel.num, title: sel.title, type: sel.type,
              status: sel.status, version: sel.ver, owner: sel.owner,
              updated: sel.updated,
              // An upload has no authoring completion. The server sends null;
              // a 0 from one that has not caught up is still not a figure.
              percentComplete: sel.src === 'upload' ? null : sel.pct,
              blocker: sel.blocker ?? false, flag: sel.flag ?? null,
              filing: sel.filing ?? null,
              // A governed artifact's state, as the registry records it.
              artifact: artifactSelectionFacts(sel),
            }
          : null,
      },
      availableActions: [
        'Open a document to see its detail, version and status',
        'Search the vault by title, file name and document text',
        'Filter the vault by type, filing status, classification, evidence kind, review stage or CTD section',
        'Browse a folder in the document tree',
        'Upload files into the vault, each with its own type, classification and folder (virus-scanned; a file given no folder is classified to a suggested one)',
        'Confirm or move an upload’s suggested filing (governed, audited)',
        'Read a governed artifact’s kind, origin, signature on the current version and human review',
        'Read a governed artifact’s versions and, on request, its audit report (reading the report is recorded in its provenance)',
        'Download a governed artifact as DOCX (recorded; it needs a recorded human review or signature on the current version)',
        'Export the governed artifacts’ manifest as CSV (their governance, not the files)',
        'Select a named document in the tree, so its detail is shown',
      ],
    };
  }, [vaultState.loading, vaultState.error, libraryMode, searchState.loading, searchUnavailable, results.length, folder, searching, trimmedQ, findLabel, findSubject, filtering, findFilters, sel, vault, projectId, orgLoading, orgError, organizationArtifacts, orgFocused]);
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
  /* A governed artifact opens in the editor the way the Artifacts center opens
     one (slice B): the authoring.open-document directive, by title. The editor
     resolves the title against its own list with honest misses; a title the
     registry cannot address still lands on the editor, never on a guess. */
  const openArtifactInEditor = (doc: Pick<VaultDoc, 'title'>) => {
    const res = resolveSurfaceAction('authoring.open-document', { title: doc.title });
    if (res.ok) applySurfaceAction(res.directive, (t) => onNav && onNav(t));
    else onNav && onNav('document-authoring');
  };

  const organizationView = (
    <OrganizationGovernedArtifacts
      read={orgRead}
      open={orgActive}
      onToggle={projectId ? () => setOrgOpen((o) => !o) : undefined}
      focusId={orgFocusId}
      downloadingId={downloading}
      onDownload={(row) => void downloadOrganizationArtifact(row)}
      onOpenInEditor={(row) => openArtifactInEditor({ title: row.name })}
      onAsk={(row) => onAsk(organizationArtifactAskPrompt(row))}
      onExportManifest={exportOrganizationManifest}
    />
  );

  return (
    <div className="vd-wrap">
      <div className="vd-top">
        <div>
          <div className="sp-eyebrow">Documents {I.dot} project vault</div>
          <h1 className="vd-title">{getSurfaceMeta('vault').label}</h1>
          <div className="vd-sub">
            <span className="vd-sub-x">
              {vault && vault.spine ? <>{vault.spine} {I.dot} </> : null}
              {vault ? (
                <>
                  {vaultCountLabel(vault)}
                </>
              ) : null}
              {vault && (vault.unfiledCount ?? 0) > 0 ? (
                <> {I.dot} {vault.unfiledCount} unfiled — needs review</>
              ) : null}
              {vault && (vault.awaitingConfirmationCount ?? 0) > 0 ? (
                <> {I.dot} {vault.awaitingConfirmationCount} awaiting confirmation</>
              ) : null}
            </span>
          </div>
        </div>
        {/* Only with a project open: without one it led to Project home's "No
            project selected", beside the panel's own "Go to Projects". */}
        {projectId && (
          <button
            className="sp-ask"
            onClick={() => onNav && onNav('project-home')}
            title="Open this project in Project management"
          >
            {I.folder} Open project
          </button>
        )}
        {/* Offered only where the eTMF can be opened: outside this release it
            led to the locked panel (FILING_SPINE.md F16). */}
        {available('etmf') && (
          <button
            className="sp-ask"
            onClick={() => onNav && onNav('etmf')}
            title="TMF inspection-readiness — completeness, timeliness & QC"
          >
            {I.shieldCheck} Inspection readiness
          </button>
        )}
        {/* Uploading is an ingest, which admits the writing roles only (VaultViewOnly). */}
        {canWrite ? (
          <>
        {/* What the file IS — the ingest schema's own vocabulary, so the
            picker can never offer a type the server refuses. MODULE_3 is how
            an uploaded CMC document declares itself and gets handled as one
            downstream; the default stays OTHER rather than a guess from the
            filename.
            Options are NAMED by vaultIngestTypeLabel, the label map kept
            beside the enum: the wire token ("OTHER", "MODULE 3") is not a
            reader's vocabulary. The width is the content's, not the row's —
            `.c2c-input` is `width:100%`, which in this wrapping header pushed
            the picker onto a line of its own with the buttons below it. */}
        <select
          className="c2c-input"
          aria-label="Document type for files added next"
          value={docType}
          onChange={(e) => setDocType(e.target.value as VaultIngestDocumentType)}
          disabled={uploading}
          data-testid="vault-upload-type"
          title="Document type for files added next; each file's own row can change it"
          style={{ width: 'auto', maxWidth: 260 }}
        >
          {VAULT_INGEST_DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {vaultIngestTypeLabel(t)}
            </option>
          ))}
        </select>
        {/* The one drop zone (FileDropZone.tsx, shared with the Data Room):
            files or a folder, chosen or dropped here. The pickers accept
            exactly what POST /api/vault/ingest accepts; what was gathered goes
            to the staging rows below, which list anything not uploaded. */}
        <FileDropZone
          className="vd-upload-zone"
          accept={VAULT_UPLOAD_ACCEPT}
          directory
          activation="controls"
          disabled={!projectId}
          label="Add documents to the Vault"
          testId="vault-upload-zone"
          controlsRef={uploadControls}
          onFiles={(picked) => setStaging((st) => stageFiles(picked, docType, st ?? undefined))}
        >
          {({ chooseFiles, chooseFolder }) => (
            <>
              <button
                ref={addFilesButton}
                className="sp-primary"
                disabled={!projectId}
                onClick={chooseFiles}
                title={
                  projectId
                    ? 'Choose files to file into this project’s Vault'
                    : 'Open a project first — a Vault document is filed against a project.'
                }
                data-testid="vault-upload-button"
              >
                {I.upload} Add files
              </button>
              <button className="sp-ask" disabled={!projectId} onClick={chooseFolder} data-testid="vault-upload-folder-button">
                {I.folder} Add a folder
              </button>
              <span className="vd-upload-zone-t">or drop files or a folder here</span>
            </>
          )}
        </FileDropZone>
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
          </>
        ) : null}
      </div>

      {staging && canWrite ? (
        <VaultUploadStaging
          staging={staging}
          folders={uploadFolders}
          uploading={uploading}
          onChange={patchStaged}
          onRemove={(key) => setStaging((st) => st && { ...st, rows: st.rows.filter((r) => r.key !== key) })}
          onUpload={() => void uploadStaged()}
          onDone={() => { setStaging(null); setTimeout(() => addFilesButton.current?.focus(), 0); }}
        />
      ) : null}
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
      {targetMissing && missingTarget && (
        <div className="scaf-note" role="status" style={{ margin: '0 0 12px' }} data-testid="vault-target-missing">
          The document you just {missingTarget.act} is not in this list. Search for it by title.
        </div>
      )}
      {otherProjectTarget && (
        <div className="scaf-note" role="status" style={{ margin: '0 0 12px' }} data-testid="vault-target-other-project">
          The document you just filed belongs to another project. Open that project to see it in its Vault.
        </div>
      )}
      {checkInOffers.map(({ file, doc }) => (
        <div key={`${file.name}-${doc.docId}`} className="scaf-note" role="status" style={{ margin: '0 0 12px' }}>
          {file.name} was not uploaded: a different file is already recorded under this name as “{doc.title}”
          ({doc.ver}). Added as a new version, it is numbered by the server, keeps the document's filing, and the
          earlier versions stay in the Vault.{' '}
          <button className="sp-ask" disabled={uploading} onClick={() => void uploadNewVersion(file, doc)}>
            Upload as a new version of {doc.title}
          </button>
        </div>
      ))}

      {filingIntoSubmission && (
        <VaultPlaceIntoSubmission
          documentUuid={filingIntoSubmission.documentUuid}
          documentTitle={filingIntoSubmission.documentTitle}
          mimeType={filingIntoSubmission.mimeType}
          projectId={projectId ?? null}
          filing={filingIntoSubmission.filing ?? null}
          onNav={onNav}
          /* A placement changes the version's "placed in" line, which reads the
             versions list: re-read it, or the line stays "not placed" until reload. */
          onPlaced={() => setVaultEpoch((n) => n + 1)}
          onClose={() => setFilingIntoSubmission(null)}
        />
      )}

      {/* The filing cabinet is a WINDOW onto the vault, not the vault. Said
          plainly for the same reason the unavailable branches below are: a
          reviewer who believes a partial cabinet is the whole one concludes a
          document is absent, and in a regulated vault "absent" is a finding.
          The unfiled count beside the title is programme-wide, so it stays
          correct here and is not re-stated. */}
      {vault?.uploadsWindow?.truncated ? (
        <div className="scaf-note" role="status" style={{ margin: '0 0 12px' }}>
          Uploaded files: showing the {vault.uploadsWindow.shown.toLocaleString()} most
          recently updated of {vault.uploadsWindow.total.toLocaleString()} documents in
          this project. Search to reach the rest.
        </div>
      ) : null}

      {/* A branch the server could not serve is said, not silently omitted —
          otherwise "no Uploaded files folder" and "no uploads" look identical. */}
      {vault?.unavailable?.map((u) => (
        <div key={u.branch} className="scaf-note" role="status" style={{ margin: '0 0 12px' }}>
          {u.branch}: {u.reason}
        </div>
      ))}

      <div className="vd-coexist">
        {/* It promised import with approval from Veeva Vault, SharePoint and
            OneDrive, and its button only typed that request to AnA: no route
            imports from a connector into the Vault (decision record
            2026-10-08). What exists is AnA's search of connected
            repositories, so that is what it offers. */}
        <span className="vd-coexist-txt">
          {I.link || I.plug} AnA can search your connected repositories (<b>Veeva Vault</b>,{' '}
          <b>SharePoint</b>, <b>OneDrive</b>) in place. Importing from them into the
          Vault comes in a later release; upload files here meanwhile.
        </span>
        <button
          className="vd-coexist-cta"
          onClick={() => onAsk('Search my connected repositories for documents relevant to this project.')}
        >
          Search connected sources
        </button>
      </div>

      {/* The state panels sit on the header's 24px gutter. As bare children of
          `.vd-wrap` they ran edge to edge, flush against the nav rail and out
          of line with everything above them. */}
      {!projectId ? (
        <>
          <div style={{ padding: '16px 24px' }}>
            <EmptyState
              icon={I.folder}
              title="Open a project to see its vault"
              hint="The Vault shows the governed document tree of the project you have open: its CTD, eSTAR, IVDR or TMF spine. The governed artifacts of every project you can open are listed below."
              action={onNav ? { label: 'Go to Projects', onAct: () => onNav('projects') } : undefined}
            />
          </div>
          {organizationView}
        </>
      ) : vaultState.loading && !vault ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 24px' }}>
          Loading the project vault…
        </div>
      ) : vaultState.error ? (
        <div style={{ padding: '16px 24px' }}>
          {/* A refusal is said as a refusal. Every failure used to read "the
              governed document store didn't respond" — false for a 403, where
              it answered and said no, and for a 404, where the open project is
              not in this organization. Only a failure retry can fix offers one. */}
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the project vault"
            hint={vaultReadFailure(vaultState.status).hint}
            retry={vaultReadFailure(vaultState.status).retryable ? () => setVaultEpoch((n) => n + 1) : undefined}
          />
        </div>
      ) : (
        <>
          <DataRoomLane
            block={vault?.dataRoom}
            filing={roomFiling}
            unavailableReason={
              vault?.unavailable?.find((u) => u.branch === 'Data room')?.reason ?? null
            }
          />
          <VaultCoverage
            coverage={vault?.coverage}
            documents={coverageDocuments}
            onUpload={() => uploadControls.current?.chooseFiles()}
            onFileHere={(docId, target) =>
              void fileDocument(docId, { ...target, note: `Filed at ${target.ctdSection} from Vault coverage.` })
            }
            busy={filing}
          />
          {/* The Vault's seals (VR-19): an e-signed record of every current
              document as it stood, and its verification. */}
          {projectId ? <VaultSeals projectId={projectId} /> : null}
          {/* The lane is a BROWSE aid — every upload in the programme. While a
              search is running it would sit above the results listing files the
              search excluded, contradicting the very list the person asked for,
              so it steps aside until the search is cleared. */}
          {!searching && (
            <UploadsLane
              cabinet={cabinet}
              window={vault?.uploadsWindow}
              status={st}
              onOpen={openUpload}
            />
          )}
          {/* The project's governed artifacts (fold F3 slice A): a breakdown of
              the tree's branch, not a second list. Steps aside while a search
              runs, like the uploads lane. */}
          {!searching && (
            <GovernedArtifactsLane
              block={vault?.artifacts}
              unavailableReason={vault?.unavailable?.find((u) => u.branch === ARTIFACTS_BRANCH)?.reason ?? null}
              onOpen={openArtifacts}
              onExportManifest={exportArtifactManifest}
            />
          )}
          {!searching && organizationView}
          {/* Fixity (plan critique 15): re-prove every stored version on demand. */}
          {!searching && vault ? <VaultFixityCheck projectId={projectId ?? null} /> : null}
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
            <div style={{ padding: '16px 24px' }}>
              <EmptyState
                icon={I.fileText}
                title="No documents in this project's vault yet"
                hint={
                  vault?.pendingStore
                    ? "The governed document store isn't provisioned for this environment yet. Documents built here organize by build type into the CTD / eSTAR / IVDR / TMF spine, each classified."
                    : "Nothing has been filed into this project's vault yet. Add files — each one is recorded in the folder you choose for it, or classified and filed to a suggested folder for you to confirm — or start a document build; both organize into the submission spine. A changed file uploaded under an existing document's name is offered as a new version of that document."
                }
              />
            </div>
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
                leaveFind();
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
                  leaveFind();
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
                  <span className="vd-crumb cur">
                    {trimmedQ ? <>Search &quot;{q}&quot;{filtering ? ', filtered' : ''}</> : 'Filtered'}
                    {!libraryMode && verifiedSearch && searchState.data && searchState.data.total > results.length
                      ? ` — ${results.length} of ${searchState.data.total}`
                      : ''}
                  </span>
                </>
              )}
              {/* THE SEARCH BOX.
                  There was none. `q` existed and was driven only by AnA's
                  vault.search action, so the assistant could search this surface
                  and the person looking at it could not. Both now drive the same
                  state, which was the original design intent. */}
              <label className="vd-search">
                <span className="sr-only">Search this vault</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search titles and document text"
                  aria-label="Search this vault"
                />
              </label>
              <label className="vd-search">
                <input
                  type="checkbox"
                  checked={includeEarlier}
                  onChange={(e) => setIncludeEarlier(e.target.checked)}
                />{' '}
                Include earlier versions
              </label>
              <label className="vd-search">
                <input
                  type="checkbox"
                  checked={allProjects}
                  onChange={(e) => setAllProjects(e.target.checked)}
                />{' '}
                Accessible projects
              </label>
            </div>
            <VaultFindFilterRow
              key={filterReset}
              value={findFilters}
              onChange={setFindFilters}
              onClear={() => { setFindFilters({}); setFilterReset((n) => n + 1); }}
              facets={!libraryMode && verifiedSearch ? searchState.data?.facets ?? null : null}
            />
            {searchUnavailable && (
              /* An error is not an empty result. Without this the screen reads
                 "no documents match your search", which is a different and
                 believable claim. */
              <div className="scaf-note" role="alert" style={{ margin: '8px 0 0', color: 'var(--error)' }}>
                The vault search could not be verified — this is not a result of zero matches.
                {' '}{redactInternals(searchState.error ?? '', 'The search did not complete.')}
              </div>
            )}
            {searching && !libraryMode && verifiedSearch && pendingSearchNote(searchState.data?.pendingCount) && (
              <div className="scaf-note" role="status" style={{ margin: '8px 0 0' }} data-testid="vault-search-pending">
                {pendingSearchNote(searchState.data?.pendingCount)}
              </div>
            )}
            {searching && !libraryMode && searchState.loading && (
              <div className="scaf-note" role="status" style={{ margin: '8px 0 0' }}>
                Searching…
              </div>
            )}
            {!searching ? <ConfirmSuggestedBar docs={folderDocs} state={confirmSuggested} /> : null}
            {libraryMode ? (
              <VaultLibraryResults
                query={trimmedQ}
                filterParams={filterParams}
                includeEarlier={includeEarlier}
                currentProjectId={projectId ?? null}
                onDownload={(docId, title, programId) => void downloadVaultDoc(docId, title, programId)}
                downloadingId={downloading}
              />
            ) : (<>
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
                  <span className="vd-col-type" title={`${d.type}${reviewText(d)}`}>
                    {d.type}
                    {(d.versionCount ?? 1) > 1 ? ` · ${d.ver}, ${d.versionCount} versions` : ''}
                    {d.earlierVersion ? ` · ${d.ver}, earlier version` : ''}
                    {reviewText(d)}
                  </span>
                  <span className="vd-col-owner">{d.owner}</span>
                  <span className="vd-col-mod">{d.updated}</span>
                  <span className="vd-col-status">
                    <span className={'rd-chip tone-' + st(d.status).tone}>
                      {st(d.status).label}
                    </span>
                  </span>
                </button>
              ))}
              {results.length === 0 && (!searching || verifiedSearch) && (
                <div className="vd-empty">
                  No documents
                  {noMatchText(searching, Boolean(trimmedQ), filtering)}.
                </div>
              )}
            </div>
            </>)}
          </section>

          <aside className="vd-detail">
            {sel && (
              <>
                <div className="vd-d-hdr">
                  <span className={'rd-chip tone-' + st(sel.status).tone}>
                    {st(sel.status).label}
                  </span>
                  {sel.ver && sel.ver !== '—' && (
                    <span className="vd-d-ver">
                      {sel.ver}
                      {(sel.versionCount ?? 1) > 1 ? ` · ${sel.versionCount} versions` : ''}
                      {sel.earlierVersion ? ' · earlier version' : ''}
                    </span>
                  )}
                  {sel.src === 'upload' && sel.lifecycleStage !== undefined && (
                    <span
                      className={'rd-chip tone-' + stageTone(sel.lifecycleStage)}
                      title="Review and approval, apart from filing"
                      aria-label={`Review and approval: ${stageLabel(sel.lifecycleStage)}`}
                    >
                      {stageLabel(sel.lifecycleStage)}
                    </span>
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

                {sel.src === 'upload' && sel.docId && projectId && (!sel.disposition || sel.disposition === 'keep_data') && <DocumentDisposition
                  key={`disposition-${sel.docId}`} projectId={projectId} targetType="vault_document" targetId={sel.docId}
                  title={sel.title} existingChoice={sel.disposition} onChanged={() => setVaultEpoch(n => n + 1)}
                />}
                {sel.originalFileAvailable === false && <p className="sec-sub" role="status">Original file unavailable. Retained extracted data and its lineage remain accessible.</p>}

                {sel.src === 'upload' && sel.filing ? (
                  <>
                    {/* ── Dossier filing — the placement lifecycle ──
                        Everything here is a stored column: the classifier's
                        suggestion (with its confidence + rationale), or the
                        person's confirmed decision. Committing a change posts
                        to /file — governed, audited — and the tree re-reads. */}
                    {/* ── Into a submission ──
                        Dossier filing (below) decides where the document sits in
                        the ROOM. This decides whether it goes in a FILING, which
                        is a different question and used to have no answer at all:
                        a customer could upload a CSR and then not put it in the
                        NDA. The vault copy is filed as itself — no snapshot. */}
                    <div className="vd-d-seclbl">Submission</div>
                    <div className="vd-d-filing">
                      <div className="vd-d-filing-row">
                        <span className="k">Filing</span>
                        <span className="v">
                          File into an eCTD sequence. The leaf points at the vault copy, so
                          what is assembled is what is stored here.
                        </span>
                      </div>
                      {sel.docId && (
                        <div className="vd-d-filing-acts">
                          <button
                            className="sp-primary"
                            style={{ padding: '7px 11px' }}
                            onClick={() =>
                              setFilingIntoSubmission({
                                // `docId` is vault.documents.id — the bare uuid the
                                // download and filing actions already use. The tree id
                                // beside it is `up-<uuid>`, and a leaf carrying that
                                // prefix is refused server-side as a malformed uuid.
                                documentUuid: sel.docId!,
                                documentTitle: sel.title || sel.num || 'Vault document',
                                mimeType: sel.mimeType,
                                filing: sel.filing
                                  ? { ctdSection: sel.filing.ctdSection ?? null, placementStatus: sel.filing.placementStatus ?? 'unfiled' }
                                  : null,
                              })
                            }
                            data-testid="vault-place-into-submission"
                          >
                            {I.folder} Place into filing…
                          </button>
                        </div>
                      )}
                    </div>

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
                      {filingDecisionLine(sel.filing) && (
                        <div className="vd-d-filing-row" data-testid="vault-filing-decided">
                          <span className="k">{sel.filing.placementStatus === 'unfiled' ? 'Unfiled by' : 'Filed by'}</span>
                          <span className="v">{filingDecisionLine(sel.filing)}</span>
                        </div>
                      )}
                      {sel.filing.evidenceKind && (
                        <div className="vd-d-filing-row">
                          <span className="k">Looks like</span>
                          <span className="v">{vaultDocKindLabel(sel.filing.evidenceKind)}</span>
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
                          {/* "Classifier" only for the classifier's own proposal, which
                              always carries its confidence. A suggestion AnA made has
                              none, and its rationale already names her — labelling it
                              "Classifier" would misattribute it all over again. */}
                          {sel.filing.placementStatus === 'suggested' && sel.filing.confidence
                            ? `Classifier (${sel.filing.confidence} confidence): `
                            : ''}
                          {sel.filing.rationale}
                        </div>
                      )}
                      {!canWrite ? <VaultViewOnly act="file, move or unfile it" testId="vault-filing-view-only" /> : null}
                      {canWrite ? <div className="vd-d-filing-acts">
                        {sel.docId && (sel.filing.placementStatus === 'suggested' || cabinetFolders.length > 0) && (
                          <input
                            className="vd-d-filing-reason"
                            value={filingReason}
                            onChange={(e) => setFilingReason(e.target.value)}
                            placeholder="Reason (optional, recorded with the placement)"
                            aria-label="Reason for this filing decision"
                            disabled={filing}
                            data-testid="vault-filing-reason"
                          />
                        )}
                        {sel.filing.placementStatus === 'suggested' && sel.docId && (
                          <button
                            className="sp-primary"
                            style={{ padding: '7px 11px' }}
                            disabled={filing}
                            onClick={() => void fileDocument(sel.docId!, { confirm: true, ...(filingReason.trim() ? { note: filingReason.trim() } : {}) })}
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
                                  void fileDocument(sel.docId!, { folderId: moveTarget, ...(filingReason.trim() ? { note: filingReason.trim() } : {}) });
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
                      </div> : null}
                    </div>

                    {projectId && sel.docId && sel.details ? (
                      /* Keyed by the document alone. A sibling DocumentHistory below
                         is keyed `${docId}-${vaultEpoch}`: the same string twice in one
                         fragment is a duplicate key, and React then leaves the Details
                         block it mounted for the previous document in the DOM. Keyed
                         by the epoch too, the block also remounts on every re-read, and
                         the confirmation of a save is lost in the same render. */
                      <VaultEditDetails
                        key={`details-${sel.docId}`}
                        projectId={projectId}
                        documentId={sel.docId}
                        details={sel.details}
                        onSaved={() => setVaultEpoch((n) => n + 1)}
                      />
                    ) : null}

                    {projectId && sel.docId ? (
                      /* AnA's description of this version and a person's decision on it
                         (S4). Keyed by the document alone, for the reason above. */
                      <VaultCatalogRecord
                        key={`catalog-${sel.docId}`}
                        projectId={projectId}
                        documentId={sel.docId}
                        onSaved={() => setVaultEpoch((n) => n + 1)}
                      />
                    ) : null}

                    <div className="vd-d-seclbl">File</div>
                    <div className="vd-d-filing">
                      {sel.sizeLabel && (
                        <div className="vd-d-filing-row">
                          <span className="k">Size</span>
                          <span className="v">{sel.sizeLabel}</span>
                        </div>
                      )}
                      {sel.hash && (
                        <div className="vd-d-filing-row">
                          <span className="k">SHA-256</span>
                          <span className="v mono vd-d-hash" title={sel.hash}>
                            {sel.hash.slice(0, 16)}…
                          </span>
                        </div>
                      )}
                    </div>
                    {projectId && sel.docId ? (
                      <VaultVersions
                        key={`versions-${sel.docId}-${vaultEpoch}`}
                        projectId={projectId}
                        documentId={sel.docId}
                        title={sel.title}
                        onDownload={(docId, title) => void downloadVaultDoc(docId, title)}
                        downloadingId={downloading}
                        onUploadNewVersion={(file, currentId) => void uploadNewVersion(file, sel, currentId)}
                        uploading={uploading}
                        onLifecycleChanged={() => setVaultEpoch((n) => n + 1)}
                        onOpenSection={(docId, code) => openImportedDocument(docId, projectId, onNav, code ?? undefined)}
                      />
                    ) : null}
                    {projectId && sel.docId ? (
                      <VaultAnnotations
                        key={`annotations-${sel.docId}`}
                        projectId={projectId}
                        documentId={sel.docId}
                        refreshKey={vaultEpoch}
                        onChanged={() => setVaultEpoch((n) => n + 1)}
                      />
                    ) : null}
                    {projectId && sel.docId ? (
                      <VaultRelationships
                        key={`relationships-${sel.docId}`}
                        projectId={projectId}
                        documentId={sel.docId}
                        onChanged={() => setVaultEpoch((n) => n + 1)}
                      />
                    ) : null}
                    {projectId && sel.docId ? (
                      <DocumentHistory key={`${sel.docId}-${vaultEpoch}`} projectId={projectId} documentUuid={sel.docId} />
                    ) : null}
                  </>
                ) : sel.src === 'upload' && sel.docId && projectId ? (
                  /* A search hit the tree does not list: an earlier version, or a
                     document outside the loaded window. Its versions and history
                     are read as for any upload; the filing is the current version's. */
                  <>
                    {sel.earlierVersion && (
                      <div className="vd-d-idx">
                        An earlier version. The tree lists the current one, which carries the document's filing.
                      </div>
                    )}
                    <VaultVersions
                      key={`versions-${sel.docId}-${vaultEpoch}`}
                      projectId={projectId}
                      documentId={sel.docId}
                      title={sel.title}
                      onDownload={(docId, title) => void downloadVaultDoc(docId, title)}
                      downloadingId={downloading}
                      onUploadNewVersion={(file, currentId) => void uploadNewVersion(file, sel, currentId)}
                      uploading={uploading}
                      onLifecycleChanged={() => setVaultEpoch((n) => n + 1)}
                        onOpenSection={(docId, code) => openImportedDocument(docId, projectId, onNav, code ?? undefined)}
                    />
                    <VaultAnnotations
                      key={`annotations-${sel.docId}`}
                      projectId={projectId}
                      documentId={sel.docId}
                      refreshKey={vaultEpoch}
                      onChanged={() => setVaultEpoch((n) => n + 1)}
                    />
                    <VaultRelationships
                      key={`relationships-${sel.docId}`}
                      projectId={projectId}
                      documentId={sel.docId}
                      onChanged={() => setVaultEpoch((n) => n + 1)}
                    />
                    <DocumentHistory key={`${sel.docId}-${vaultEpoch}`} projectId={projectId} documentUuid={sel.docId} />
                  </>
                ) : sel.src === 'artifact' && sel.artifact ? (
                  /* A governed artifact: its governance as the registry records
                     it, its versions, and its audit report on request (slice B:
                     the reads c2c/artifacts.ts serves under the project). */
                  <>
                    <ArtifactGovernanceDetail doc={sel} />
                    {projectId ? (
                      <ArtifactVersions key={`artifact-versions-${sel.artifact.artifactId}-${vaultEpoch}`} projectId={projectId} doc={sel} />
                    ) : null}
                    {projectId ? (
                      <ArtifactAuditReport key={`artifact-audit-${sel.artifact.artifactId}`} projectId={projectId} doc={sel} />
                    ) : null}
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

                    {/* An authored section: the read model returns each section's
                        CURRENT version only, not a history list. Show the real
                        current version honestly — don't synthesize a "history".
                        (Uploaded documents list every version: VaultVersions.) */}
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
                  <VaultSourceBuildAction source={sel} programId={projectId} onNav={onNav} />
                  {sel.src === 'upload' && sel.docId && projectId && <VaultSourceWorkButton source={sel} onPull={setPullDoc} />}
                  {sel.src !== 'upload' && (
                    <button
                      className="sp-primary"
                      style={{ padding: '8px 12px' }}
                      onClick={() => (sel.src === 'artifact' ? openArtifactInEditor(sel) : openDoc(sel))}
                    >
                      {I.penLine || I.fileText} Open in editor
                    </button>
                  )}
                  <button
                    className="sp-ask"
                    onClick={() =>
                      onAsk(
                        sel.src === 'artifact' && sel.artifact
                          ? artifactAskPrompt(sel)
                          : 'Summarize ' + sel.title + ' and list the claims that still need evidence.',
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

                      Only an uploaded document HAS bytes. A governed artifact
                      is a record whose governed export renders its stored
                      content (slice B, below). An authored section says so
                      instead of offering a download that could not produce one. */}
                  {sel.src === 'upload' && sel.docId ? (
                    <button
                      className="sp-ask"
                      onClick={() => void downloadVaultDoc(sel.docId!, sel.title)}
                      disabled={downloading === sel.docId || sel.originalFileAvailable === false}
                      title={sel.originalFileAvailable === false ? 'The original file is unavailable after the recorded retention decision' : undefined}
                    >
                      {I.download} {downloading === sel.docId ? 'Downloading…' : 'Download'}
                    </button>
                  ) : sel.src === 'artifact' && sel.artifact ? (
                    /* The governed export (slice B): rendered from the stored
                       content, recorded before it is delivered, and refused
                       without a recorded review or signature on the current
                       version. A refusal says why, in the banner above. */
                    <button
                      className="sp-ask"
                      onClick={() => void downloadArtifact(sel)}
                      disabled={downloading === sel.id}
                      title="The governed DOCX of the current version. Downloading it is recorded, and it needs a recorded human review or signature on that version."
                    >
                      {I.download} {downloading === sel.id ? 'Downloading…' : 'Download DOCX'}
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
      {projectId && pullDoc?.docId && <SourceImportDialog programId={projectId}
        source={{ kind: 'vault', documentId: pullDoc.docId }} title={pullDoc.title}
        onClose={() => setPullDoc(null)} onOpenDocument={docId => openImportedDocument(docId, projectId, onNav)} />}
    </div>
  );
}
