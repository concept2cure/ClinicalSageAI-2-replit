import React, { useState, useMemo, useId } from 'react';
import { authService } from '@/services/portal/authService';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';

import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { I } from '../icons';
import { VaultPlaceIntoSubmission } from './VaultPlaceIntoSubmission';
import { VaultEditDetails } from './VaultEditDetails';
import { VaultCatalogRecord } from './VaultCatalogRecord';
import { VaultHoldNotice, type VaultHoldNoticeShape } from './VaultHoldNotice';
import { FolderExportButton } from './VaultFolderExport';
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
import { useLiveData, EmptyState, ProjectBack, type DataReadOwner } from '../dataConnect';
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
  docKindsForView,
  isVaultViewId,
  vaultDocKindLabel,
  vaultIngestTypeLabel,
  type VaultIngestDocumentType,
  type VaultViewId,
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
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { describeReadFailure, readFailureFor, readRefusalOf } from '../../mdx/hooks/useFetchJson';
import { DataRoomFileBar, RoomPick, useDataRoomFiling, type DataRoomFiling } from './VaultDataRoomFiling';
import { ConfirmSuggestedBar, useConfirmSuggested } from './VaultConfirmSuggested';
import { VaultSeals } from './VaultSeals';
import { VaultViewOnly, useVaultCanWrite } from './VaultViewOnly';
import {
  VaultLibraryResults, facetCounts, isSavedViewsShape, isVaultSearchShape, pendingSearchNote, savedViewKey, savedViewState, searchHitToDoc,
  vaultFilterParams, type SavedVaultView, type SavedViewState, type SavedViewsShape, type VaultFindFilters, type VaultSearchShape,
} from './VaultLibraryResults';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { VaultFixityCheck } from './VaultFixityCheck';
import { VaultRelationships } from './VaultRelationships';
import { VaultAnnotations } from './VaultAnnotations';
import { DocumentDisposition } from './DocumentDisposition';
import { downloadBlob, safeFileName } from '../download';
import {
  clearEditorTarget,
  setEditorTarget,
  isEditorFilingDocumentId,
} from '../editorTarget';
import { readShellProject, publishShellProject } from '../shellProject';
import { usePaletteProjects, type PaletteProject } from '../paletteProjects';
import { useDialog } from '../useDialog';
import { VaultFolderEdit, type FolderEditMode } from './VaultFolderEdit';
import { cabinetFolderOptions, indentedLabel, newFolderParentOf, personFolderOf, type CabinetFolder } from './vaultFolders';
import { locateVaultDocument, takeVaultTarget, vaultTargetIsFor, VAULT_TARGET_EVENT, type TakenVaultTarget } from '../vaultTarget';
import { SourceImportDialog, openImportedDocument, sourceImportUnavailableReason, type ImportSource } from '../editor/SourceImportDialog';
import { artifactImportId } from '@shared/authoring/source-import';
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
  /** The active legal holds covering the project or a version in it (MR-08 Stage 5): reference and date. */
  legalHolds?: VaultHoldNoticeShape[];
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
/* Why the vault read failed, said as what happened (S6 V1, 2026-11-05). A 401 is
   an expired session and a 404 a project not in this organization. A 403 is one of
   several answers, told apart by the server's code through the one read
   classifier (`readFailureFor`): the plan does not include the Vault, the Vault is
   not in this release, or the person's role. They used to share "You don't have
   access … Ask an administrator", so a plan without the Vault read as a permission
   the person lacked. None of these is changed by a retry; a failure to answer
   (5xx, network, no status at all) is, and only it offers one. */
type VaultReadFailure = { title: string; hint: string; retryable: boolean; refusal: boolean };
function vaultReadFailure(status: number | undefined, code?: string | null): VaultReadFailure {
  if (status === 401) {
    return { title: 'Couldn\'t load the project vault', hint: 'Your session has expired. Sign in again to load this project’s documents.', retryable: false, refusal: true };
  }
  const kind = readFailureFor(status, code);
  if (kind === 'not-found') {
    return { title: 'Couldn\'t load the project vault', hint: 'This project wasn’t found in your organization. Open a project from Projects.', retryable: false, refusal: true };
  }
  if (kind === 'failed') {
    return {
      title: 'Couldn\'t load the project vault',
      hint: 'The document store didn’t respond, so nothing was read. Try again, or check the service is reachable.',
      retryable: true,
      refusal: false,
    };
  }
  const words = describeReadFailure(kind, 'the project vault');
  return { title: words.title, hint: words.message, retryable: words.retryable, refusal: !words.retryable };
}

function currentProjectId(): string | null {
  const p = readShellProject();
  const id = p && p.id != null ? String(p.id).trim() : '';
  return id || null;
}

/** Recorded filing facts follow their folder, never a display title or parsed ID. */
type VaultFilingReference = { family: string | null; filingDocumentId?: unknown };
function vaultDocFilingReference(
  nodes: readonly (VaultFolder | VaultDoc)[], leafId: string,
  inherited: VaultFilingReference = { family: null },
): VaultFilingReference | undefined {
  for (const node of nodes) {
    if (isVaultDoc(node)) {
      if (node.id === leafId) return inherited;
      continue;
    }
    const explicit = Object.prototype.hasOwnProperty.call(node, 'filingDocumentId');
    const carried = explicit || node.id.startsWith('vaultdoc-')
      ? { family: typeof node.code === 'string' ? node.code.trim() || null : null,
        ...(explicit ? { filingDocumentId: node.filingDocumentId } : {}) } : inherited;
    const hit = vaultDocFilingReference(node.children, leafId, carried);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Compatibility reader for the existing family-only callers. */
export function vaultDocFamilyCode(
  nodes: readonly (VaultFolder | VaultDoc)[], leafId: string, inherited: string | null = null,
): string | null | undefined {
  return vaultDocFilingReference(nodes, leafId, { family: inherited })?.family;
}

function vaultEditorSection(doc: VaultDoc): { code: string | null; label: string | null } | null {
  if (doc.filingSectionKey === null) return { code: null, label: null };
  const explicit = Object.prototype.hasOwnProperty.call(doc, 'filingSectionKey');
  if (explicit && (typeof doc.filingSectionKey !== 'string' || !doc.filingSectionKey.trim())) return null;
  const code = explicit ? doc.filingSectionKey! : doc.num && doc.num !== '—' ? doc.num : null;
  const label = doc.title && doc.title !== '—' ? doc.title : null;
  return code || label ? { code, label } : null;
}

function vaultEditorReference(tree: VaultFolder[], doc: VaultDoc, programId: string, programTitle?: string): Parameters<typeof setEditorTarget>[0] | null {
  const filing = vaultDocFilingReference(tree, doc.id);
  const section = vaultEditorSection(doc);
  if (!filing || !section) return null;
  const docType = filing.family?.toLowerCase() ?? null;
  const explicit = Object.prototype.hasOwnProperty.call(filing, 'filingDocumentId');
  if (explicit && (!isEditorFilingDocumentId(filing.filingDocumentId) || !docType)) return null;
  if (doc.filingSectionKey === null && !explicit) return null;
  return { docType, ...section, programId, programTitle: programTitle ?? null,
    ...(isEditorFilingDocumentId(filing.filingDocumentId) ? { filingDocumentId: filing.filingDocumentId } : {}) };
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

/** The header line's parts, in order: the filing spine, the count, then what needs a person. */
export function vaultHeaderParts(v: (VaultDisplayShape & { spine?: string | null; unfiledCount?: number; awaitingConfirmationCount?: number }) | null | undefined): string[] {
  if (!v) return [];
  return [
    v.spine || null,
    vaultCountLabel(v),
    (v.unfiledCount ?? 0) > 0 ? `${v.unfiledCount} unfiled — needs review` : null,
    (v.awaitingConfirmationCount ?? 0) > 0 ? `${v.awaitingConfirmationCount} awaiting confirmation` : null,
  ].filter((x): x is string => Boolean(x));
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
  const headingId = useId();
  /* A section of the Uploads view (D6 §C.4 step 11): heading, the stage counts
     as its count, the toggle as its action. */
  const head = (sub?: React.ReactNode, acts?: React.ReactNode) => (
    <div className="pj-sec-h">
      <h2 id={headingId}>Data room</h2>
      {sub ? <span className="sec-sub">{sub}</span> : null}
      {acts ? <div className="pj-sec-acts">{acts}</div> : null}
    </div>
  );
  /* What the pipeline is, kept at the foot of the section and closed. */
  const how = (
    <details className="pj-more">
      <summary>How files reach the Vault</summary>
      <p>
        Files attached in AnA chat or dropped on the project’s Evidence step pass through the data room;
        files uploaded on this page go straight to the filing cabinet and are listed under Uploaded files.
      </p>
    </details>
  );
  if (unavailableReason) {
    return (
      <section className="pj-sec" data-testid="vault-data-room" aria-labelledby={headingId}>
        {head()}
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} Unavailable — showing nothing because the room could not be
          served, not because it is empty. {unavailableReason}
        </div>
      </section>
    );
  }
  if (!block) {
    return (
      <section className="pj-sec" data-testid="vault-data-room" aria-labelledby={headingId}>
        {head('No data room information for this project.')}
      </section>
    );
  }
  // Collapsed, the stage strip is the summary; expanding lists the sources.
  const rows = open ? block.sources : [];
  const unfiledIds = block.sources.filter((s) => s.stage !== 'filed').map((s) => s.id);
  const titleOf = (id: number) => block.sources.find((s) => s.id === id)?.title ?? `Source ${id}`;
  return (
    <section className="pj-sec" data-testid="vault-data-room" aria-labelledby={headingId}>
      {head(
        <span className="vd-dr-stages">
          <span className="vd-dr-stage">Captured <b>{roomCount(block.captured, block)}</b></span>
          <span className="vd-dr-arrow" aria-hidden="true">›</span>
          <span className="vd-dr-stage">Classified <b>{roomCount(block.classified, block)}</b></span>
          <span className="vd-dr-arrow" aria-hidden="true">›</span>
          <span className="vd-dr-stage">Filed to vault <b>{roomCount(block.filed, block)}</b></span>
        </span>,
        block.sources.length > 0 ? (
          <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide sources' : `Show ${block.sources.length} source${block.sources.length === 1 ? '' : 's'}`}
          </button>
        ) : null,
      )}
      <RoomNotes block={block} />
      {block.sources.length === 0 && (
        <div className="vd-dr-empty">Nothing captured for this project yet.</div>
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
      {how}
    </section>
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
  const headingId = useId();
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
    <section className="pj-sec" data-testid="vault-uploads-lane" aria-labelledby={headingId}>
      <div className="pj-sec-h">
        <h2 id={headingId}>Uploaded files</h2>
        <span className="sec-sub">
          {total} uploaded file{total === 1 ? '' : 's'} in this project
          {win?.truncated ? ` · ${win.shown} in this window` : ''}
        </span>
        <div className="pj-sec-acts">
          <button type="button" className="btn ghost small" onClick={() => onOpen(cabinet.id, null)}>
            Open filing cabinet
          </button>
        </div>
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
                className="vd-dr-open"
                title={doc.preview || doc.title}
                onClick={() => onOpen(folder.id, doc.id)}
              >
                <span className="vd-dr-name">{doc.title}</span>
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
        <button type="button" className="btn ghost small vd-dr-more" onClick={() => setShowAll(true)}>
          Show all {rows.length} in this window
        </button>
      )}
    </section>
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
    <label className="vd-facet">
      <span className="vd-facet-l">{label}</span>
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

/** The views whose filings are CTD-numbered, so a document there carries a CTD section (S6 V9). */
export const CTD_NUMBERED_VIEWS: ReadonlySet<VaultViewId> = new Set<VaultViewId>(['pharma', 'biotech']);

/**
 * The evidence kinds a project's view files (docKindsForView), with any value the filters already hold, a saved view's,
 * so a filter that narrows the list is never out of sight (S6 V9). With no view, as across projects, every kind.
 */
export function kindOptionsFor(view: VaultViewId | null, held: readonly string[] = []): FilterOption[] {
  if (!view) return KIND_OPTIONS;
  const own = new Set(docKindsForView(view).map((k) => k.value));
  return KIND_OPTIONS.filter((o) => own.has(o.value as never) || held.includes(o.value));
}
const STAGE_OPTIONS: FilterOption[] = VAULT_STAGE_CHOICES.map((c) => ({ value: c.value, label: c.label, covers: c.stages }));

/** The dimensions a select shows one value of, with the words for their values. */
const SINGLE_VALUE_SELECTS: ReadonlyArray<[keyof VaultFindFilters, string, readonly FilterOption[] | null]> = [
  ['documentType', 'Type', TYPE_OPTIONS], ['placementStatus', 'Filing', FILING_OPTIONS],
  ['classification', 'Classification', CLASSIFICATION_OPTIONS], ['evidenceKind', 'Evidence kind', KIND_OPTIONS],
  ['ctdSection', 'CTD section', null],
];

/**
 * What the filters hold that the selects cannot show: a folder, several values
 * in one dimension, or a review set that no choice names. A saved view can hold
 * any of these, and a filter that narrows the list is never out of sight.
 */
export function hiddenFindFilters(value: VaultFindFilters, folderLabel: (id: string) => string): Array<{ key: keyof VaultFindFilters; text: string }> {
  const out: Array<{ key: keyof VaultFindFilters; text: string }> = [];
  if (value.folderId?.length) out.push({ key: 'folderId', text: `Folder: ${value.folderId.map(folderLabel).join(', ')}` });
  for (const [key, label, options] of SINGLE_VALUE_SELECTS) {
    const values = value[key] ?? [];
    const words = values.map((v) => options?.find((o) => o.value === v)?.label ?? v);
    if (values.length > 1) out.push({ key, text: `${label}: ${words.join(', ')}` });
  }
  const stages = value.lifecycleStage ?? [];
  const named = VAULT_STAGE_CHOICES.some((c) => c.stages.length === stages.length && c.stages.every((s) => stages.includes(s)));
  if (stages.length > 0 && !named) out.push({ key: 'lifecycleStage', text: `Review: ${stages.map(stageLabel).join(', ')}` });
  return out;
}

/**
 * The find view's metadata filters (VR-18): type, filing status,
 * classification, evidence kind, review stage and CTD section, each sent to the
 * same server search as the text. A CTD section is applied on Enter or when the
 * field is left, and only once it reads as a section code; until then the row
 * says it is not applied, rather than filtering by something else.
 */
function VaultFindFilterRow({ value, onChange, onClear, facets, folderLabel = (id) => id, view = null }: {
  value: VaultFindFilters; onChange: (next: VaultFindFilters) => void; onClear: () => void;
  /** The verified read's facet counts, or null when there are none to show. */
  facets?: unknown;
  /** A cabinet folder's words, for a folder the filters hold. */
  folderLabel?: (id: string) => string;
  /** The open project's view, which selects the vocabulary offered (S6 V9); null across projects. */
  view?: VaultViewId | null;
}) {
  const hidden = hiddenFindFilters(value, folderLabel);
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
  const kindOptions = kindOptionsFor(view, value.evidenceKind);
  // A filing that is not CTD-numbered is offered no CTD section, unless one is already filtered on.
  const offersCtd = !view || CTD_NUMBERED_VIEWS.has(view) || Boolean(value.ctdSection?.length);
  return (
    <div className="vd-facets" role="group" aria-label="Filter documents">
      <FindFilterSelect label="Type" value={one('documentType')} options={TYPE_OPTIONS} counts={counts('documentType')} onChange={(v) => set('documentType', v ? [v] : null)} />
      <FindFilterSelect label="Filing" value={one('placementStatus')} options={FILING_OPTIONS} counts={counts('placementStatus')} onChange={(v) => set('placementStatus', v ? [v] : null)} />
      <FindFilterSelect label="Classification" value={one('classification')} options={CLASSIFICATION_OPTIONS} counts={counts('classification')} onChange={(v) => set('classification', v ? [v] : null)} />
      <FindFilterSelect label="Evidence kind" value={one('evidenceKind')} options={kindOptions} counts={counts('evidenceKind')} onChange={(v) => set('evidenceKind', v ? [v] : null)} />
      <FindFilterSelect
        label="Review"
        value={stageValue}
        options={STAGE_OPTIONS}
        counts={counts('lifecycleStage')}
        onChange={(v) => set('lifecycleStage', VAULT_STAGE_CHOICES.find((c) => c.value === v)?.stages ?? null)}
      />
      {offersCtd && (
        <label className="vd-facet">
          <span className="vd-facet-l">CTD section</span>
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
      )}
      {active && (
        <button type="button" className="btn ghost small" onClick={onClear}>
          Clear filters
        </button>
      )}
      {hidden.length > 0 && <span className="vd-find-note">Also filtering by:</span>}
      {hidden.map((h) => (
        <button key={h.key} type="button" className="btn ghost small" aria-label={`Remove the filter ${h.text}`} onClick={() => set(h.key, null)}>
          {h.text} &times;
        </button>
      ))}
      {ctdRefused && (
        <span id="vd-filter-ctd-note" className="vd-find-note" role="status">
          &ldquo;{ctdRefused}&rdquo; is not a CTD section code (for example 3.2.P or 2.7.3), so it is not applied.
        </span>
      )}
    </div>
  );
}

/* ── Saved views (D2, P-46; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md §3.9) ──
   A view is a search remembered: the text, the filters, earlier versions, and
   this project or the accessible ones. Applying one sets the find view's state
   and the existing search runs it under the reader's current access; nothing
   here runs a view or keeps its results. The list is read only while the
   control is open, and a failed read is said, never shown as no views. */

const SAVED_VIEWS_PATH = '/api/c2c/project-vault/saved-views';
const FORMER_MEMBER = 'a former member';

/** One saved-view change. A refusal comes back as the server's own sentence. */
async function sendViewChange(
  method: 'POST' | 'PATCH' | 'DELETE', url: string, body: unknown, failed: string,
): Promise<{ data: SavedVaultView | null } | { error: string }> {
  try {
    const res = await apiRequest(method, url, body);
    const json = (await res.json().catch(() => null)) as { data?: SavedVaultView } | null;
    if (!res.ok) return { error: redactInternals(serverMessage(json), failed) };
    return { data: json?.data ?? null };
  } catch (e) {
    return { error: redactInternals(e instanceof ApiRequestError ? serverMessage(e.payload) : null, failed) };
  }
}

function savedViewOptionText(v: SavedVaultView): string {
  const label = v.applies ? v.label : `${v.label} (no longer applies)`;
  const scope = v.programId === null ? ' · all projects' : '';
  if (!v.mine) return `${label}${scope} · by ${v.createdBy.name ?? FORMER_MEMBER}`;
  return `${label}${scope}${v.visibility === 'org_public' ? ' · shared' : ''}`;
}

/** Why "Update view" cannot run now, or null when it can. */
function updateViewBlocker(v: SavedVaultView, applied: SavedVaultView | null, current: SavedViewState): string | null {
  const library = v.programId === null;
  if (library !== current.library) {
    return library
      ? 'This view searches accessible projects; save a new view to search this project.'
      : 'This view searches one project; save a new view to search accessible projects.';
  }
  if (!applied || applied.id !== v.id) return 'Apply this view and change the search to update it.';
  if (savedViewKey(current) === savedViewKey(savedViewState(applied))) return 'The search has not changed since this view was applied.';
  return null;
}

/** Who shared an organisation view someone else made, and who renamed it. */
function sharedByNote(v: SavedVaultView | null): string | null {
  if (!v || v.mine) return null;
  const renamed = v.updatedBy && v.updatedBy.userId !== v.createdBy.userId
    ? ` Renamed by ${v.updatedBy.name ?? FORMER_MEMBER}.` : '';
  return `Shared by ${v.createdBy.name ?? FORMER_MEMBER}.${renamed}`;
}

function SavedViewOptions({ views, loading }: { views: SavedVaultView[] | null; loading: boolean }) {
  if (!views) return <option value="">{loading ? 'Loading saved views…' : 'Saved views could not be loaded'}</option>;
  if (views.length === 0) return <option value="" disabled>No saved views yet.</option>;
  const mine = views.filter((v) => v.mine);
  const others = views.filter((v) => !v.mine);
  const option = (v: SavedVaultView) => <option key={v.id} value={String(v.id)}>{savedViewOptionText(v)}</option>;
  return (
    <>
      <option value="">Choose a view</option>
      {mine.length > 0 && <optgroup label="Mine">{mine.map(option)}</optgroup>}
      {others.length > 0 && <optgroup label="Organisation">{others.map(option)}</optgroup>}
    </>
  );
}

/** Save the current search: a name, and who sees it. No dialog; nothing changes until Save. */
function SaveViewForm({ defaultName, canWrite, busy, onSave, onCancel }: {
  defaultName: string; canWrite: boolean; busy: boolean;
  onSave: (label: string, visibility: SavedVaultView['visibility']) => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState(defaultName.slice(0, 120));
  const [visibility, setVisibility] = useState<SavedVaultView['visibility']>('private');
  const name = useId();
  const reasonId = useId();
  return (
    <div className="vd-facets" role="group" aria-label="Save current search">
      <label className="vd-facet">
        <span className="vd-facet-l">Name</span>
        <input className="c2c-input" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="vd-facet">
        <input type="radio" name={name} checked={visibility === 'private'} onChange={() => setVisibility('private')} /> Only me
      </label>
      <label className="vd-facet">
        <input
          type="radio" name={name} checked={visibility === 'org_public'} disabled={!canWrite} aria-describedby={reasonId}
          onChange={() => setVisibility('org_public')}
        /> Everyone in the organisation
      </label>
      <span id={reasonId} className="vd-find-note">
        {canWrite ? 'Everyone in the organisation sees this view\'s name.' : 'Your role can save views for yourself only.'}
      </span>
      <button type="button" className="btn ghost small" disabled={busy || !label.trim()} onClick={() => onSave(label.trim(), visibility)}>Save</button>
      <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function RenameViewForm({ view, busy, onRename, onCancel }: {
  view: SavedVaultView; busy: boolean; onRename: (label: string) => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState(view.label);
  return (
    <div className="vd-facets" role="group" aria-label="Rename view">
      <label className="vd-facet">
        <span className="vd-facet-l">New name</span>
        <input className="c2c-input" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="button" className="btn ghost small" disabled={busy || !label.trim()} onClick={() => onRename(label.trim())}>Save name</button>
      <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function DeleteViewConfirm({ view, busy, onDelete, onCancel }: {
  view: SavedVaultView; busy: boolean; onDelete: () => void; onCancel: () => void;
}) {
  const question = view.visibility === 'org_public'
    ? `Delete “${view.label}” for everyone in the organisation? Documents are not affected.`
    : `Delete your view “${view.label}”? Documents are not affected.`;
  return (
    <div className="vd-facets" role="group" aria-label="Delete view">
      <span className="vd-find-note">{question}</span>
      <button type="button" className="btn ghost small" disabled={busy} onClick={onDelete}>Delete view</button>
      <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** What the selected view lets this reader do: only the acts its flags allow are offered. */
function SavedViewActs({ view, applied, current, busy, onMode, onShare, onUpdate }: {
  view: SavedVaultView; applied: SavedVaultView | null; current: SavedViewState; busy: boolean;
  onMode: (mode: 'rename' | 'delete') => void; onShare: () => void; onUpdate: () => void;
}) {
  const blockerId = useId();
  const blocker = view.canEdit ? updateViewBlocker(view, applied, current) : null;
  return (
    <>
      {view.canRename && <button type="button" className="btn ghost small" disabled={busy} onClick={() => onMode('rename')}>Rename</button>}
      {view.canShare && (
        <button type="button" className="btn ghost small" disabled={busy} onClick={onShare}>
          {view.visibility === 'private' ? 'Share with organisation' : 'Make personal'}
        </button>
      )}
      {view.canEdit && (
        <button type="button" className="btn ghost small" disabled={busy || blocker !== null} aria-describedby={blocker ? blockerId : undefined} onClick={onUpdate}>
          Update view
        </button>
      )}
      {blocker && <span id={blockerId} className="vd-find-note">{blocker}</span>}
      {view.canDelete && <button type="button" className="btn ghost small" disabled={busy} onClick={() => onMode('delete')}>Delete</button>}
    </>
  );
}

type ViewMode = 'idle' | 'save' | 'rename' | 'delete';
type ViewNote = { text: string; tone: 'status' | 'alert' };

/** The list, and one change at a time against it; each success re-reads the list. */
function useSavedViews(projectId: string) {
  const [epoch, setEpoch] = useState(0);
  const path = `/api/c2c/project-vault/${encodeURIComponent(projectId)}/saved-views`;
  const read = useLiveData<SavedViewsShape>(path, [path, epoch], isSavedViewsShape);
  const failed = Boolean(read.error) || (!read.loading && !read.data);
  const [mode, setMode] = useState<ViewMode>('idle');
  const [note, setNote] = useState<ViewNote | null>(null);
  const [busy, setBusy] = useState(false);
  const change = async (method: 'POST' | 'PATCH' | 'DELETE', url: string, body: unknown, failedText: string, done: (v: SavedVaultView | null) => string) => {
    setBusy(true);
    setNote(null);
    const r = await sendViewChange(method, url, body, failedText);
    setBusy(false);
    if ('error' in r) return setNote({ text: r.error, tone: 'alert' });
    setEpoch((n) => n + 1);
    setMode('idle');
    setNote({ text: done(r.data), tone: 'status' });
  };
  return {
    views: failed ? null : read.data?.views ?? null, loading: read.loading, failed,
    retry: () => setEpoch((n) => n + 1), mode, setMode, note, setNote, busy, change,
  };
}

function VaultSavedViews({ projectId, canWrite, current, searching, defaultName, applied, onApply, onChanged, onDeleted }: {
  projectId: string; canWrite: boolean; current: SavedViewState; searching: boolean; defaultName: string;
  applied: SavedVaultView | null;
  onApply: (v: SavedVaultView) => void;
  /** A view saved or changed; `adopt` when it is new and so is now the applied one. */
  onChanged: (v: SavedVaultView, adopt: boolean) => void;
  onDeleted: (id: number) => void;
}) {
  const sv = useSavedViews(projectId);
  const [selectedId, setSelectedId] = useState<number | null>(applied?.id ?? null);
  const selected = sv.views?.find((v) => v.id === selectedId) ?? null;
  const saveReasonId = useId();
  const one = (id: number) => `${SAVED_VIEWS_PATH}/${id}`;
  const keep = (v: SavedVaultView | null, adopt = false) => { if (v) onChanged(v, adopt); };
  const apply = () => {
    if (!selected) return;
    sv.setMode('idle');
    if (selected.applies) { sv.setNote(null); onApply(selected); return; }
    const why = redactInternals(selected.refusal?.message, 'the search would refuse what it holds.');
    sv.setNote({ text: `“${selected.label}” no longer applies: ${why} Nothing was changed.`, tone: 'status' });
  };
  const save = (label: string, visibility: SavedVaultView['visibility']) => void sv.change('POST', SAVED_VIEWS_PATH,
    { label, visibility, programId: current.library ? null : projectId, q: current.q, filters: current.filters, includeSuperseded: current.includeSuperseded },
    'The view was not saved. Nothing was changed.', (v) => { if (v) setSelectedId(v.id); keep(v, true); return `Saved “${label}”.`; });
  const rename = (view: SavedVaultView, label: string) => void sv.change('PATCH', one(view.id), { label },
    'The view was not renamed. Nothing was changed.', (v) => { keep(v); return `Renamed to “${label}”.`; });
  const share = (view: SavedVaultView) => {
    const visibility = view.visibility === 'private' ? 'org_public' : 'private';
    void sv.change('PATCH', one(view.id), { visibility }, 'Who sees the view was not changed.', (v) => {
      keep(v);
      return visibility === 'org_public' ? `“${view.label}” is now shared with the organisation.` : `“${view.label}” is now yours only.`;
    });
  };
  const update = (view: SavedVaultView) => void sv.change('PATCH', one(view.id),
    { q: current.q, filters: current.filters, includeSuperseded: current.includeSuperseded },
    'The view was not updated. Nothing was changed.', (v) => { keep(v); return `Updated “${view.label}”.`; });
  const remove = (view: SavedVaultView) => void sv.change('DELETE', one(view.id), undefined,
    'The view was not deleted. Nothing was changed.', () => { onDeleted(view.id); setSelectedId(null); return `Deleted “${view.label}”.`; });
  const sharedNote = sharedByNote(selected);
  return (
    <div id="vd-saved-views" role="group" aria-label="Saved views">
      <div className="vd-facets">
        <label className="vd-facet">
          <span className="vd-facet-l">Saved view</span>
          <select
            className="c2c-input" value={selected ? String(selected.id) : ''} disabled={!sv.views?.length}
            onChange={(e) => { setSelectedId(Number(e.target.value) || null); sv.setMode('idle'); sv.setNote(null); }}
          >
            <SavedViewOptions views={sv.views} loading={sv.loading} />
          </select>
        </label>
        <button type="button" className="btn ghost small" disabled={!selected || sv.busy} onClick={apply}>Apply</button>
        {selected && (
          <SavedViewActs
            view={selected} applied={applied} current={current} busy={sv.busy}
            onMode={(m) => { sv.setNote(null); sv.setMode(m); }} onShare={() => share(selected)} onUpdate={() => update(selected)}
          />
        )}
        <button
          type="button" className="btn ghost small" disabled={!searching || !sv.views || sv.busy}
          aria-describedby={searching ? undefined : saveReasonId}
          onClick={() => { sv.setNote(null); sv.setMode('save'); }}
        >
          Save current search…
        </button>
        {!searching && <span id={saveReasonId} className="vd-find-note">Type a search or choose a filter, then save it as a view.</span>}
        {sharedNote && <span className="vd-find-note">{sharedNote}</span>}
      </div>
      <SavedViewPanels sv={sv} selected={selected} defaultName={defaultName} canWrite={canWrite} onSave={save} onRename={rename} onDelete={remove} />
    </div>
  );
}

/** Under the row: a failed read, the one open form, and what the last act did. */
function SavedViewPanels({ sv, selected, defaultName, canWrite, onSave, onRename, onDelete }: {
  sv: ReturnType<typeof useSavedViews>; selected: SavedVaultView | null; defaultName: string; canWrite: boolean;
  onSave: (label: string, visibility: SavedVaultView['visibility']) => void;
  onRename: (view: SavedVaultView, label: string) => void;
  onDelete: (view: SavedVaultView) => void;
}) {
  const close = () => sv.setMode('idle');
  return (
    <>
      {sv.failed && (
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} Saved views could not be loaded. This is not an empty list.{' '}
          <button type="button" className="btn ghost small" onClick={sv.retry}>Try again</button>
        </div>
      )}
      {sv.mode === 'save' && <SaveViewForm defaultName={defaultName} canWrite={canWrite} busy={sv.busy} onSave={onSave} onCancel={close} />}
      {sv.mode === 'rename' && selected && <RenameViewForm view={selected} busy={sv.busy} onRename={(l) => onRename(selected, l)} onCancel={close} />}
      {sv.mode === 'delete' && selected && <DeleteViewConfirm view={selected} busy={sv.busy} onDelete={() => onDelete(selected)} onCancel={close} />}
      {sv.note && <div className="vd-find-note" role={sv.note.tone}>{sv.note.text}</div>}
    </>
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

/* ── The work area's views (D6 §C.3–C.4 step 5) ──
   One Vault, its library first. What a DMS keeps beside the library (what came
   in, what is required, the governed artifacts, the seals and fixity) is a view
   of the same work area, one tab away, never a band above the library. Every
   view stays mounted and the inactive ones are `hidden`: a fixity result, a
   seal's verdict or a staged upload is not lost by looking at another view, and
   the reads each panel makes on mount are the ones it always made. */
type VaultView = 'library' | 'uploads' | 'required' | 'artifacts' | 'seals';
const VAULT_VIEWS: ReadonlyArray<{ id: VaultView; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'required', label: 'Required documents' },
  { id: 'artifacts', label: 'Governed artifacts' },
  { id: 'seals', label: 'Seals & fixity' },
];

/* AnA's entry on this page (D5 §WA.4.2 rule 4). The third is the connected-
   repositories search the retired `.vd-coexist` band offered, prompt verbatim. */
const VAULT_STARTERS = [
  { label: 'What is missing for this filing?', prompt: 'Which required documents for this filing are missing or unconfirmed in the Vault?' },
  { label: 'Which documents are not yet effective?', prompt: 'Which documents in this Vault are not yet effective, and what does each need?' },
  { label: 'Search my connected repositories', prompt: 'Search my connected repositories for documents relevant to this project.' },
] as const;

/** The prompt the header's "Ask AnA to import" carried; now the Uploads view's action. */
const IMPORT_ASK = 'Upload documents to the vault and index them for semantic search.';

/* The record docks beside the list at 1280px and wider, and is the D0 drawer
   below; the structure tree is a drawer below 1024px (D6 §C.3). Where the
   browser has no matchMedia (a test DOM), the wide layout holds. */
const RECORD_AS_DRAWER = '(max-width: 1279px)';
const TREE_AS_DRAWER = '(max-width: 1023px)';
function useViewportMatch(query: string): boolean {
  const read = () => typeof window !== 'undefined' && !!window.matchMedia?.(query)?.matches;
  const [on, setOn] = useState(read);
  React.useEffect(() => {
    const mql = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
    if (!mql?.addEventListener) return undefined;
    const sync = () => setOn(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/** The D0 drawer (`.de-bd` > `.de`): focus held inside, Escape closes, focus returns to the opener.
    A dialog opened from it keeps the keys while it is on screen: one drawn inside it (a review
    route's form) takes Escape alone, and one the page draws over it (Place into filing, Work on
    document) suspends this drawer's hold on focus until it closes, or Tab would pull focus out of
    that dialog into this one behind it. */
function VaultDrawer({ label, className, onClose, suspended = false, children }: {
  label: string; className: string; onClose: () => void; suspended?: boolean; children: React.ReactNode;
}) {
  const panel = useDialog(() => {
    if (panel.current?.querySelector('[role="dialog"]')) return;
    onClose();
  }, !suspended);
  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className={`de ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

/** Keep the recorded refusal with the action rather than only in a hover hint. */
function VaultSourceWorkButton({ source, onPull }: { source: VaultDoc; onPull: (source: VaultDoc) => void }) {
  const reasonId = useId();
  const unavailable = sourceImportUnavailableReason({ ...source, isCurrent: source.earlierVersion ? false : undefined });
  return <div className="source-work-action">
    <button type="button" className="btn ghost small" disabled={Boolean(unavailable)} title={unavailable ?? undefined}
      aria-describedby={unavailable ? reasonId : undefined} onClick={() => onPull(source)}>{I.penLine} Work on document</button>
    {unavailable && <p className="sec-sub" id={reasonId}>{unavailable}</p>}
  </div>;
}

/* Local files, private metadata and read state belong to this project and
   canonical account session. Replacement remounts the existing body; ordinary
   bearer refresh keeps the same session and preserves the person's work. */
/**
 * The Vault with no project open lists the projects whose Vaults the person can open (2026-11-06, by the founder:
 * Vault "should be accessible all the time, not just from within the project, but on the left rail"). It read "Open
 * a project to see its vault" and sent the person to Projects. The list is the one the ⌘K palette and Projects read
 * (GET /api/c2c/projects); a row opens that project and its Vault, as the rail's Vault does inside a project.
 */
function ProjectVaults({ onNav }: { onNav?: (id: string) => void }) {
  const read = usePaletteProjects(true);
  const open = (p: PaletteProject) => {
    publishShellProject({ id: p.id, title: p.title, ...(p.code ? { code: p.code } : {}), ...(p.ws ? { ws: p.ws } : {}), ...(p.status ? { status: p.status } : {}) });
    onNav?.('vault');
  };
  if (read.state !== 'ready') {
    return read.state === 'failed'
      ? <p role="alert" className="scaf-note">Your projects could not be read, so their Vaults are not listed. Open one from Projects.</p>
      : <p role="status" className="scaf-note">Reading your projects…</p>;
  }
  if (read.projects.length === 0) {
    return <p className="scaf-note">You have no projects yet. A Vault belongs to a project: create one with New project in Projects.</p>;
  }
  return (
    <section className="pj-sec vd-org" aria-labelledby="vault-project-list-h" data-testid="vault-project-list">
      <div className="pj-sec-h">
        <h2 id="vault-project-list-h">Your projects' Vaults</h2>
        <span className="sec-sub">{read.projects.length === 1 ? '1 project' : `${read.projects.length} projects`}</span>
      </div>
      <div className="ctable">
        {read.projects.map((p) => (
          <div key={p.id} className="ct-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <span className="ct-strong">{p.title}</span>
            <button type="button" className="btn ghost small" onClick={() => open(p)} aria-label={`Open the Vault of ${p.title}`}>
              Open its Vault
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Vault(props: SurfaceViewProps) {
  const session = useAuthoringReadSession(authService.getUser());
  return <VaultForProject key={JSON.stringify([currentProjectId() ?? '', session.actor, session.key])} {...props} session={session} />;
}

function VaultForProject({ onAsk, onNav, session }: SurfaceViewProps & { session: ReturnType<typeof useAuthoringReadSession> }) {
  const available = useSurfaceAvailable();
  const projectId = currentProjectId();
  const [workingSource, setWorkingSource] = useState<{ source: ImportSource; title: string } | null>(null);
  const ownerKey = JSON.stringify([projectId, session.actor, session.key]);
  const currentOwner = React.useRef(ownerKey);
  currentOwner.current = ownerKey;
  const readOwner = useMemo<DataReadOwner>(() => ({ key: ownerKey,
    current: () => currentOwner.current === ownerKey && session.sameRevision() && currentProjectId() === projectId,
  }), [ownerKey, projectId, session]);
  const vaultPath = projectId
    ? '/api/c2c/project-vault/' + encodeURIComponent(projectId)
    : null;
  /* Bumped after an upload so the tree is re-read from the server rather than
     patched locally: what the Vault shows is what the Vault stored. */
  const [vaultEpoch, setVaultEpoch] = useState(0);
  const vaultState = useLiveData<VaultDisplayShape>(vaultPath, [vaultPath, vaultEpoch], undefined, readOwner);
  // The placeholder shows only before there is data to show. A re-read after a change keeps the
  // body mounted, so a confirmation held in it (a save, a post, a decision) stays on screen.
  const vault = vaultState.data;
  // The project's view, which selects the vocabulary its upload and filters offer (S6 V9).
  const vaultView = isVaultViewId(vault?.standard) ? vault.standard : null;
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
  /* The view on screen (D6 §C.4 step 5); the library first. */
  const [view, setView] = useState<VaultView>('library');
  const viewIds = useId();
  /* Below 1280px the record is a drawer opened from a row; below 1024px the
     structure tree is one too (D6 §C.3). */
  const recordAsDrawer = useViewportMatch(RECORD_AS_DRAWER);
  const treeAsDrawer = useViewportMatch(TREE_AS_DRAWER);
  const [recordOpen, setRecordOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

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
    // A new attempt starts its selected rows afresh; later refusals belong to this attempt.
    const keys = new Set(pending.map((r) => r.key));
    setStaging((st) => st && { ...st, rows: st.rows.map((r) => keys.has(r.key) ? { ...r, status: null } : r) });
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
  /* Inside a project, its sponsor's projects only (F1, S6 V4): a CRO's sponsors never mix in one list. */
  const orgRead = useOrganizationArtifacts(orgActive, projectId);
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
     project's binder, its presets and the folders people made, at every depth),
     never a client-side folder list (vaultFolders.ts). The review queues are
     not places to file to. */
  const cabinetFolders = useMemo(() => cabinetFolderOptions(cabinet), [cabinet]);
  /* An upload may name any folder the server accepts: the same list. */
  const uploadFolders = cabinetFolders;
  /* New folder and Rename folder (S6): the form open, or none. */
  const [folderEdit, setFolderEdit] = useState<FolderEditMode | null>(null);
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
  /* Saved views (P-46): the control is read only while open, and the view last
     applied is held so the breadcrumb can say when the search has moved off it. */
  const [viewsOpen, setViewsOpen] = useState(false);
  const [appliedView, setAppliedView] = useState<SavedVaultView | null>(null);
  /** Leave the find view for the tree: the text, the filters and the applied view go together. */
  const leaveFind = () => { setQ(''); setFindFilters({}); setFilterReset((n) => n + 1); setAppliedView(null); };
  const [selId, setSel] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: e[id] === false ? true : false }));
  /* From the uploads lane: browse the cabinet folder the row sits in (with the
     cabinet un-collapsed down to it) and select the row — the same state the
     tree's own controls drive, so the list, breadcrumb and detail pane agree. */
  const openUpload = (folderId: string, docId: string | null) => {
    leaveFind();
    setView('library');
    setActiveFolder(folderId);
    setExpanded((e) => ({ ...e, cabinet: true, [folderId]: true }));
    if (docId) {
      setSel(docId);
      setRecordOpen(true);
    }
  };
  /* From the governed-artifacts lane: browse the branch in the tree. */
  const openArtifacts = () => {
    leaveFind();
    setView('library');
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
        setAppliedView(null);
        setActiveFolder(at.folderId);
        setExpanded((e) => ({ ...e, cabinet: true, [at.folderId]: true }));
        setSel(at.rowId);
        /* A document named from another screen opens on its record. One just
           uploaded is selected for the Library, and the Uploads view keeps its
           receipts on screen. */
        if (pendingTarget.kind !== 'uploaded') {
          setView('library');
          setRecordOpen(true);
        }
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
      // The search box and its results are the Library's (D6 §C.4 step 5).
      setView('library');
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
      setView('library');
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
      setView('library');
      setActiveFolder(found.folder.id);
      setExpanded((e) => {
        const next = { ...e };
        for (const a of found.ancestors) next[a] = true;
        next[found.folder.id] = true;
        return next;
      });
      setSel(found.doc.id);
      // The record is what was asked for: below 1280px it is a drawer, opened here.
      setRecordOpen(true);
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
  /* The find view's state as a saved view holds it, and whether it has moved
     off the view last applied (one comparison, savedViewKey). */
  const findState: SavedViewState = { q: trimmedQ, filters: findFilters, includeSuperseded: includeEarlier, library: allProjects };
  const viewChanged = appliedView !== null && savedViewKey(findState) !== savedViewKey(savedViewState(appliedView));
  const folderHeld = (findFilters.folderId?.length ?? 0) > 0;
  /** Apply a saved view: the whole of it, or (when it no longer applies) nothing. */
  const applySavedView = (v: SavedVaultView) => {
    setAllProjects(v.programId === null);
    setQ(v.q);
    setFindFilters(v.filters);
    setIncludeEarlier(v.includeSuperseded);
    setFilterReset((n) => n + 1);
    setAppliedView(v);
  };
  const searchState = useLiveData<VaultSearchShape>(searchPath, [searchPath], isVaultSearchShape);
  const verifiedSearch = !searchState.loading && !searchState.error && searchState.data !== null;
  const searchUnavailable = searching && !libraryMode && !searchState.loading && !verifiedSearch;
  /* A refused search is said as its refusal (S6 V1), not as an unverified result. */
  const searchRefusal = searchUnavailable ? readRefusalOf(searchState) : null;

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
  const savedViewFact = useMemo(() => (appliedView
    ? { label: appliedView.label, visibility: appliedView.visibility, scope: appliedView.programId ? 'project' : 'library', changed: viewChanged }
    : null), [appliedView, viewChanged]);
  const anaContext = useMemo(() => {
    /* No project open: no tree, and the organization view is what is on screen
       (fold F3 slice C). Its failure is published as a failure, never as zero. */
    if (!projectId) return organizationViewContext({ loading: orgLoading, error: orgError }, organizationArtifacts, orgFocused);
    if (vaultState.loading) {
      return { summary: 'The document vault is still loading; nothing on screen is final yet.' };
    }
    if (vaultState.error) {
      const failure = vaultReadFailure(vaultState.status, vaultState.code);
      /* A refusal is told to AnA as the refusal it is, with no retry to offer. */
      if (failure.refusal) {
        return { summary: `The document vault was not read. ${failure.hint} The screen shows no documents for that reason, not because there are none.` };
      }
      return {
        summary:
          'The document vault could not be read, so this screen is showing no documents because of a failure, not because there are none.',
        availableActions: ['Retry the vault read'],
      };
    }
    if (libraryMode) {
      return {
        summary: `An accessible-project search for ${findSubject} is open. Its separate library panel must be read before describing matches; this context does not verify its result count.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, savedView: savedViewFact, requestedSearchScope: 'accessible-projects' },
      };
    }
    if (searching && searchState.loading) {
      return {
        summary: `The vault search is still loading for ${findSubject}; no match count or selection is verified.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, savedView: savedViewFact, searchState: 'loading' },
      };
    }
    if (searchUnavailable) {
      return {
        summary: `The vault search for ${findSubject} could not be verified; this is a failed read, not a result of zero matches.`,
        facts: { searchQuery: trimmedQ || null, filters: filtering ? findFilters : null, savedView: savedViewFact, searchState: 'unavailable' },
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
        // The saved view last applied (P-46), and whether the search has moved off it.
        savedView: savedViewFact,
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
  }, [vaultState.loading, vaultState.error, vaultState.status, vaultState.code, libraryMode, searchState.loading, searchUnavailable, results.length, folder, searching, trimmedQ, findLabel, findSubject, filtering, findFilters, savedViewFact, sel, vault, projectId, orgLoading, orgError, organizationArtifacts, orgFocused]);
  usePublishSurfaceContext('vault', anaContext);

  const st = (s: string) => vaultStatus(s);

  /* The common editor verifies this exact recorded filing and working copy. */
  const openDoc = (doc: VaultDoc) => {
    const shell = readShellProject();
    const target = projectId ? vaultEditorReference(tree, doc, projectId, shell?.title) : null;
    if (!readOwner.current() || !target) {
      clearEditorTarget();
      setDownloadNote({ tone: 'error', text: 'The recorded filing identity could not be verified in the current project and account. Reopen the document from its project.' });
      return;
    }
    setEditorTarget(target);
    onNav('document-authoring');
  };
  const openArtifactInEditor = (source: { artifactId: unknown; version: unknown; title: string }) => {
    clearEditorTarget();
    if (!projectId) {
      setDownloadNote({ tone: 'error', text: 'Open the artifact’s project before creating an editable working copy.' });
      return;
    }
    if (!readOwner.current() || !artifactImportId(source.artifactId, source.version)) {
      setDownloadNote({ tone: 'error', text: 'The recorded source identity and version could not be verified in the current project and account.' });
      return;
    }
    setDownloadNote(null);
    setWorkingSource({ source: { kind: 'artifact', artifactId: source.artifactId as string, version: source.version as number }, title: source.title });
  };

  const organizationView = (
    <OrganizationGovernedArtifacts
      read={orgRead}
      open={orgActive}
      onToggle={projectId ? () => setOrgOpen((o) => !o) : undefined}
      focusId={orgFocusId}
      downloadingId={downloading}
      onDownload={(row) => void downloadOrganizationArtifact(row)}
      onOpenInEditor={(row) => openArtifactInEditor({ title: row.name, artifactId: row.id, version: row.sourceVersion })}
      onAsk={(row) => onAsk(organizationArtifactAskPrompt(row))}
      onExportManifest={exportOrganizationManifest}
    />
  );

  /* ── The work area (D6 §C.3–C.4; D5 §WA) ─────────────────────────────────
     One page: the back link, the header with its one primary ("Add files"),
     AnA's starters, the notes that qualify every view, then the views as tabs
     with the library first. The drop zone is the whole page, so a file dropped
     anywhere on it is staged in the Uploads view. */

  /** "Add files" and "Upload a folder" open the picker on the view where what is chosen is staged. */
  const addFiles = () => { setView('uploads'); uploadControls.current?.chooseFiles(); };
  const addFolder = () => { setView('uploads'); uploadControls.current?.chooseFolder(); };
  /** New folder: made in the cabinet folder open in the tree, or at its top. */
  const newFolder = () => { setView('library'); leaveFind(); setFolderEdit({ kind: 'create', parentId: newFolderParentOf(activeFolder) }); };
  const folderMade = (folderId: string) => {
    /* The folder it was made in is opened, so the new folder shows beneath it. */
    const parent = folderEdit?.kind === 'create' && folderEdit.parentId ? `cab-${folderEdit.parentId}` : null;
    setExpanded((e) => ({ ...e, cabinet: true, ...(parent ? { [parent]: true } : {}) }));
    setFolderEdit(null);
    setVaultEpoch((n) => n + 1);
    setView('library');
    setActiveFolder(`cab-${folderId}`);
    leaveFind();
  };
  const headerParts = vaultHeaderParts(vault);
  /* The tab's count is the server's programme-wide uploads count, never the window shown. */
  const uploadCount = vault?.documentCounts?.uploads ?? vault?.uploadsWindow?.total ?? null;
  const viewLabel = (v: { id: VaultView; label: string }) =>
    v.id === 'uploads' && uploadCount != null ? `${v.label} · ${uploadCount}` : v.label;
  /* Arrow keys, Home and End move between the views (D5 §WA.6 9); one tab stop. */
  const onViewKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const order = VAULT_VIEWS.map((v) => v.id);
    const at = order.indexOf(view);
    const next =
      e.key === 'ArrowRight' ? order[(at + 1) % order.length]
        : e.key === 'ArrowLeft' ? order[(at - 1 + order.length) % order.length]
          : e.key === 'Home' ? order[0]
            : e.key === 'End' ? order[order.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    setView(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
  };
  const panelProps = (id: VaultView) => ({
    role: 'tabpanel' as const,
    id: `${viewIds}-panel-${id}`,
    'aria-labelledby': `${viewIds}-tab-${id}`,
    hidden: view !== id,
    className: 'vd-view',
    'data-view': id,
  });
  /** Pick a row: it is the record's document; below 1280px the record opens as a drawer. */
  const pickRow = (id: string) => {
    setSel(id);
    setRecordOpen(true);
  };
  /** The tree's root: the first folder, the find view left. */
  const goRoot = () => {
    setActiveFolder(tree[0] ? tree[0].id : null);
    leaveFind();
  };

  const treeNav = (
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
  );
  /* The project's line (program, filing type, spine) is the tree's caption,
     and its root: it opens the first folder, as the old breadcrumb's root did. */
  const treeCaption = (
    <button type="button" className="vd-tree-root" onClick={goRoot} title="Open the first folder">
      {I.folder} {(vault && vault.program) || 'Vault'}
    </button>
  );

  /* ── The record: the D0 inspector (`.de`), docked at ≥1280px, a drawer below ──
     Its header names the document, its filing and review state and version; its
     actions follow; every part after that is a disclosure, the first open. */
  const recordHead = sel ? (
    <div className="de-h">
      <div className="vd-d-head-b">
        <div className="vd-d-title">
          {sel.num && sel.num !== '—' ? `${sel.num} · ` : ''}
          {sel.title}
        </div>
        <div className="vd-d-hdr">
          <span className={'rd-chip tone-' + st(sel.status).tone}>{st(sel.status).label}</span>
          {sel.src === 'upload' && sel.lifecycleStage !== undefined && (
            <span
              className={'rd-chip tone-' + stageTone(sel.lifecycleStage)}
              title="Review and approval, apart from filing"
              aria-label={`Review and approval: ${stageLabel(sel.lifecycleStage)}`}
            >
              {stageLabel(sel.lifecycleStage)}
            </span>
          )}
          {sel.ver && sel.ver !== '—' && (
            <span className="vd-d-ver">
              {sel.ver}
              {(sel.versionCount ?? 1) > 1 ? ` · ${sel.versionCount} versions` : ''}
              {sel.earlierVersion ? ' · earlier version' : ''}
            </span>
          )}
        </div>
        <div className="vd-d-meta">
          {[sel.type, sel.owner && sel.owner !== '—' ? sel.owner : null, `updated ${sel.updated}`].filter(Boolean).join(' · ')}
        </div>
      </div>
      {recordAsDrawer ? (
        <button type="button" className="de-x" aria-label="Close the record" onClick={() => setRecordOpen(false)}>
          {I.close}
        </button>
      ) : null}
    </div>
  ) : null;

  /** One part of the record as a disclosure: its existing heading is the summary. */
  const part = (title: string, open: boolean, body: React.ReactNode, testId?: string) => (
    <details className="pj-more vd-sec" open={open} data-testid={testId}>
      <summary>{title}</summary>
      {body}
    </details>
  );

  const recordActions = sel ? (
    <div className="vd-d-actions">
      {sel.src === 'upload' && sel.docId && projectId && <VaultSourceWorkButton source={sel} onPull={doc => { if (readOwner.current() && doc.docId) setWorkingSource({ source: { kind: 'vault', documentId: doc.docId }, title: doc.title }); }} />}
      {sel.src !== 'upload' && (
        <button
          type="button"
          className="btn ghost small"
          onClick={() => (sel.src === 'artifact' ? openArtifactInEditor({ title: sel.title, artifactId: sel.artifact?.artifactId, version: sel.artifact?.version }) : openDoc(sel))}
        >
          {I.penLine || I.fileText} {sel.src === 'artifact' ? 'Work on document' : 'Open in editor'}
        </button>
      )}
      {/* Into a submission. Dossier filing decides where the document sits in
          the ROOM; this decides whether it goes in a FILING. The vault copy is
          filed as itself, no snapshot: the leaf points at it. */}
      {sel.src === 'upload' && sel.filing && sel.docId && (
        <button
          type="button"
          className="btn ghost small"
          title="File into an eCTD sequence. The leaf points at the vault copy, so what is assembled is what is stored here."
          onClick={() =>
            setFilingIntoSubmission({
              // `docId` is vault.documents.id — the bare uuid the download and
              // filing actions already use. The tree id beside it is
              // `up-<uuid>`, and a leaf carrying that prefix is refused
              // server-side as a malformed uuid.
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
      )}
      {/* "Download" once typed a sentence into the chat. Only an uploaded
          document HAS bytes; a governed artifact's governed export renders its
          stored content; an authored section says there is nothing to download. */}
      {sel.src === 'upload' && sel.docId ? (
        <button
          type="button"
          className="btn ghost small"
          onClick={() => void downloadVaultDoc(sel.docId!, sel.title)}
          disabled={downloading === sel.docId || sel.originalFileAvailable === false}
          title={sel.originalFileAvailable === false ? 'The original file is unavailable after the recorded retention decision' : undefined}
        >
          {I.download} {downloading === sel.docId ? 'Downloading…' : 'Download'}
        </button>
      ) : sel.src === 'artifact' && sel.artifact ? (
        /* The governed export: rendered from the stored content, recorded
           before it is delivered, and refused without a recorded review or
           signature on the current version. A refusal says why, in the notes. */
        <button
          type="button"
          className="btn ghost small"
          onClick={() => void downloadArtifact(sel)}
          disabled={downloading === sel.id}
          title="The governed DOCX of the current version. Downloading it is recorded, and it needs a recorded human review or signature on that version."
        >
          {I.download} {downloading === sel.id ? 'Downloading…' : 'Download DOCX'}
        </button>
      ) : (
        <button
          type="button"
          className="btn ghost small"
          disabled
          title="This is an authored record rather than an uploaded file, so there is nothing to download. Export it from the surface that owns it."
        >
          {I.download} No file to download
        </button>
      )}
      <button
        type="button"
        className="btn ghost small"
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
      <VaultSourceBuildAction source={sel} programId={projectId} onNav={onNav} />
    </div>
  ) : null;

  const dossierFiling = sel && sel.src === 'upload' && sel.filing ? (
    /* The placement lifecycle. Everything here is a stored column: the
       classifier's suggestion (with its confidence and rationale), or the
       person's confirmed decision. A change posts to /file — governed,
       audited — and the tree re-reads. */
    <div className="vd-d-filing" data-testid="vault-filing-block">
      <div className="vd-d-filing-row">
        <span className="k">Folder</span>
        <span className="v">{sel.filing.folderId ? sel.filing.folderLabel || sel.filing.folderId : 'Unfiled'}</span>
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
          {/* "Classifier" only for the classifier's own proposal, which always
              carries its confidence. A suggestion AnA made has none, and its
              rationale already names her. */}
          {sel.filing.placementStatus === 'suggested' && sel.filing.confidence
            ? `Classifier (${sel.filing.confidence} confidence): `
            : ''}
          {sel.filing.rationale}
        </div>
      )}
      {!canWrite ? <VaultViewOnly act="file, move or unfile it" testId="vault-filing-view-only" /> : null}
      {canWrite ? (
        <div className="vd-d-filing-acts">
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
              type="button"
              className="btn ghost small"
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
                  <option key={f.id} value={f.id}>{indentedLabel(f)}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn ghost small"
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
              type="button"
              className="btn ghost small"
              disabled={filing}
              onClick={() => void fileDocument(sel.docId!, { folderId: null })}
            >
              Unfile
            </button>
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  /* The Versions disclosure is VaultVersions' own: the current version's next step stands above it (B8). */
  const versionsOf = (d: VaultDoc, open = false) =>
    projectId && d.docId ? (
      <VaultVersions
        open={open}
        key={`versions-${d.docId}-${vaultEpoch}`}
        projectId={projectId}
        documentId={d.docId}
        title={d.title}
        onDownload={(docId, title) => void downloadVaultDoc(docId, title)}
        downloadingId={downloading}
        onUploadNewVersion={(file, currentId) => void uploadNewVersion(file, d, currentId)}
        uploading={uploading}
        onLifecycleChanged={() => setVaultEpoch((n) => n + 1)}
        onOpenSection={(docId, code) => openImportedDocument(docId, projectId, onNav, code ?? undefined)}
      />
    ) : null;
  const annotationsOf = (d: VaultDoc) =>
    projectId && d.docId ? (
      <VaultAnnotations
        key={`annotations-${d.docId}`}
        projectId={projectId}
        documentId={d.docId}
        refreshKey={vaultEpoch}
        onChanged={() => setVaultEpoch((n) => n + 1)}
      />
    ) : null;
  const relationshipsOf = (d: VaultDoc) =>
    projectId && d.docId ? (
      <VaultRelationships
        key={`relationships-${d.docId}`}
        projectId={projectId}
        documentId={d.docId}
        onChanged={() => setVaultEpoch((n) => n + 1)}
      />
    ) : null;
  const historyOf = (d: VaultDoc) =>
    projectId && d.docId ? (
      <DocumentHistory key={`${d.docId}-${vaultEpoch}`} projectId={projectId} documentUuid={d.docId} />
    ) : null;

  /* The record's parts for the document's kind, in their existing order; the first is open. */
  const recordParts = !sel ? null : sel.src === 'upload' && sel.filing ? (
    <>
      {part('Dossier filing', true, dossierFiling)}
      {projectId && sel.docId && sel.details
        ? part('Details', false, (
          /* Keyed by the document alone: keyed by the epoch too, it would
             remount on every re-read and lose the confirmation of a save. */
          <VaultEditDetails
            key={`details-${sel.docId}`}
            projectId={projectId}
            documentId={sel.docId}
            details={sel.details}
            onSaved={() => setVaultEpoch((n) => n + 1)}
          />
        ))
        : null}
      {projectId && sel.docId
        ? part('Catalog record', false, (
          /* AnA's description of this version and a person's decision on it (S4). */
          <VaultCatalogRecord
            key={`catalog-${sel.docId}`}
            projectId={projectId}
            documentId={sel.docId}
            onSaved={() => setVaultEpoch((n) => n + 1)}
          />
        ))
        : null}
      {part('File', false, (
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
      ))}
      {projectId && sel.docId ? versionsOf(sel) : null}
      {projectId && sel.docId ? part('Review annotations', false, annotationsOf(sel)) : null}
      {projectId && sel.docId ? part('Related documents', false, relationshipsOf(sel)) : null}
      {projectId && sel.docId ? part('History', false, historyOf(sel)) : null}
    </>
  ) : sel.src === 'upload' && sel.docId && projectId ? (
    /* A search hit the tree does not list: an earlier version, or a document
       outside the loaded window. Its versions and history are read as for any
       upload; the filing is the current version's. */
    <>
      {sel.earlierVersion && (
        <div className="vd-d-idx">
          An earlier version. The tree lists the current one, which carries the document&apos;s filing.
        </div>
      )}
      {versionsOf(sel, true)}
      {part('Review annotations', false, annotationsOf(sel))}
      {part('Related documents', false, relationshipsOf(sel))}
      {part('History', false, historyOf(sel))}
    </>
  ) : sel.src === 'artifact' && sel.artifact ? (
    /* A governed artifact: its governance as the registry records it, its
       versions, and its audit report on request. */
    <>
      {part('Governed artifact', true, <ArtifactGovernanceDetail doc={sel} />)}
      {projectId
        ? part('Versions', false, (
          <ArtifactVersions key={`artifact-versions-${sel.artifact.artifactId}-${vaultEpoch}`} projectId={projectId} doc={sel} />
        ))
        : null}
      {projectId
        ? part('Audit report', false, (
          <ArtifactAuditReport key={`artifact-audit-${sel.artifact.artifactId}`} projectId={projectId} doc={sel} />
        ))
        : null}
    </>
  ) : (
    /* An authored section: the read model returns each section's CURRENT
       version only, not a history list, so that is what is shown. Corpus
       indexing and linked evidence have no backing store in this read model:
       each says so rather than showing a synthesized claim. */
    <>
      {part('Version', true, (
        <div className="vd-vers">
          <div className="vd-ver">
            <span className="vd-ver-v">{sel.ver && sel.ver !== '—' ? sel.ver : '—'}</span>
            <span className="vd-ver-m">
              {[sel.updated, sel.owner && sel.owner !== '—' ? sel.owner : null, 'current version'].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
      ))}
      {part('Corpus indexing', false, (
        <div className="vd-d-idx">
          <span className="vd-idx-dot" aria-hidden="true" />
          <span>Indexing status isn&apos;t reported for this document yet.</span>
        </div>
      ))}
      {part('Linked evidence', false, (
        <div className="vd-d-idx">No linked evidence recorded for this document yet.</div>
      ))}
    </>
  );

  /* The whole record of the selected document, docked or in the drawer (one of
     the two at a time). Keyed by the document, so each opens fresh. */
  const recordView = sel ? (
    <React.Fragment key={sel.id}>
      {recordHead}
      <div className="de-body">
        {sel.preview && <div className="vd-d-preview">{sel.preview}</div>}
        {sel.flag && (
          <div className="tl-warn-row">
            {I.alertTriangle} {sel.flag}
          </div>
        )}
        {sel.src === 'upload' && sel.docId && (
          <VaultHoldNotice holds={vault?.legalHolds} documentId={sel.docId}
            unreadable={vault?.unavailable?.some((u) => u.branch === 'legalHolds')} />
        )}
        {sel.src === 'upload' && sel.docId && projectId && (!sel.disposition || sel.disposition === 'keep_data') && <DocumentDisposition
          key={`disposition-${sel.docId}`} projectId={projectId} targetType="vault_document" targetId={sel.docId}
          title={sel.title} existingChoice={sel.disposition} onChanged={() => setVaultEpoch(n => n + 1)}
        />}
        {sel.originalFileAvailable === false && <p className="sec-sub" role="status">Original file unavailable. Retained extracted data and its lineage remain accessible.</p>}
        {recordActions}
        {recordParts}
      </div>
    </React.Fragment>
  ) : null;

  /* ── The views ── */
  const libraryView = allDocs.length === 0 ? (
    <EmptyState
      icon={I.fileText}
      title="No documents in this project's vault yet"
      hint={
        vault?.pendingStore
          ? "The governed document store isn't provisioned for this environment yet. Documents built here organize by build type into the CTD / eSTAR / IVDR / TMF spine, each classified."
          : "Nothing has been filed into this project's vault yet. Add files — each one is recorded in the folder you choose for it, or classified and filed to a suggested folder for you to confirm — or start a document build; both organize into the submission spine. A changed file uploaded under an existing document's name is offered as a new version of that document."
      }
    />
  ) : (
    <div className={recordAsDrawer ? 'vd-grid' : 'vd-grid wa-split'}>
      <div className="vd-browse" data-tree={treeAsDrawer ? 'drawer' : undefined}>
        {!treeAsDrawer && (
          <aside className="vd-tree" aria-label="Document structure">
            {treeCaption}
            {treeNav}
          </aside>
        )}

        <section className="vd-list" aria-label="Documents">
          {/* One row: the search, saved views and the two scopes. THE SEARCH
              BOX: `q` is driven by this field and by AnA's vault.search, the
              same state. */}
          <div className="vd-find">
            {treeAsDrawer && (
              <button type="button" className="btn ghost small" aria-expanded={treeOpen} onClick={() => setTreeOpen(true)}>
                {I.folder} Structure
              </button>
            )}
            <label className="vd-find-q">
              <span className="vd-find-ic" aria-hidden="true">{I.search}</span>
              <span className="sr-only">Search this vault</span>
              <input
                type="search"
                className="c2c-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles and document text"
                aria-label="Search this vault"
              />
            </label>
            {projectId && (
              <button
                type="button"
                className="btn ghost small"
                aria-expanded={viewsOpen}
                aria-controls={viewsOpen ? 'vd-saved-views' : undefined}
                onClick={() => setViewsOpen((open) => !open)}
              >
                Saved views
              </button>
            )}
            <label className="vd-toggle">
              <input type="checkbox" checked={includeEarlier} onChange={(e) => setIncludeEarlier(e.target.checked)} />
              Earlier versions
            </label>
            <label className="vd-toggle">
              <input
                type="checkbox"
                checked={allProjects}
                disabled={folderHeld}
                aria-describedby={folderHeld ? 'vd-folder-held' : undefined}
                onChange={(e) => setAllProjects(e.target.checked)}
              />
              All my projects
            </label>
          </div>
          {folderHeld && (
            <p id="vd-folder-held" className="vd-find-note">
              A folder is one project&rsquo;s cabinet. Remove the folder filter to search all your projects.
            </p>
          )}
          {viewsOpen && projectId && (
            <VaultSavedViews
              projectId={projectId}
              canWrite={canWrite}
              current={findState}
              searching={searching}
              defaultName={trimmedQ ? (filtering ? `${trimmedQ}, filtered` : trimmedQ) : 'Filtered documents'}
              applied={appliedView}
              onApply={applySavedView}
              onChanged={(v, adopt) => { if (adopt || appliedView?.id === v.id) setAppliedView(v); }}
              onDeleted={(id) => { if (appliedView?.id === id) setAppliedView(null); }}
            />
          )}
          <VaultFindFilterRow
            key={filterReset}
            value={findFilters}
            onChange={setFindFilters}
            onClear={() => { setFindFilters({}); setFilterReset((n) => n + 1); }}
            facets={!libraryMode && verifiedSearch ? searchState.data?.facets ?? null : null}
            folderLabel={(id) => (findFolder(tree, `cab-${id}`) ?? findFolder(tree, id))?.label ?? `the folder ${id}`}
            view={libraryMode ? null : vaultView}
          />
          {/* Where the list is: the folder, or what is narrowing it. */}
          <div className="vd-breadcrumb">
            {!searching && folder && (
              <span className="vd-here">
                {folder.code ? <b>{folder.code}</b> : null} {folder.label}
                {(folder as CabinetFolder).kind === 'person' && (folder as CabinetFolder).madeBy
                  ? <>{' '}<span className="vd-sub-part">· made by {(folder as CabinetFolder).madeBy}</span></> : null}
              </span>
            )}
            {!searching && folder && canWrite && projectId && personFolderOf(folder.id) ? (
              <button type="button" className="sp-ask" data-testid="vault-rename-folder"
                onClick={() => setFolderEdit({ kind: 'rename', folderId: personFolderOf(folder.id)!, name: folder.label })}>
                Rename
              </button>
            ) : null}
            {searching && (
              <span className="vd-here">
                {appliedView ? <>View &ldquo;{appliedView.label}&rdquo;{viewChanged ? ' (changed)' : ''} · </> : null}
                {trimmedQ ? <>Search &quot;{q}&quot;{filtering ? ', filtered' : ''}</> : 'Filtered'}
                {!libraryMode && verifiedSearch && searchState.data && searchState.data.total > results.length
                  ? ` — ${results.length} of ${searchState.data.total}`
                  : ''}
              </span>
            )}
          </div>
          {searchUnavailable && (
            /* An error is not an empty result. Without this the screen reads
               "no documents match your search", which is a different and
               believable claim. */
            <div className="scaf-note" role="alert" data-tone="error">
              {searchRefusal
                ? describeReadFailure(searchRefusal, 'the vault').message
                : <>The vault search could not be verified — this is not a result of zero matches.
                  {' '}{redactInternals(searchState.error ?? '', 'The search did not complete.')}</>}
            </div>
          )}
          {searching && !libraryMode && verifiedSearch && pendingSearchNote(searchState.data?.pendingCount) && (
            <div className="scaf-note" role="status" data-testid="vault-search-pending">
              {pendingSearchNote(searchState.data?.pendingCount)}
            </div>
          )}
          {searching && !libraryMode && searchState.loading && (
            <div className="scaf-note" role="status">
              Searching…
            </div>
          )}
          {!searching && folder && folder.id.startsWith('cab') && (cabinet as CabinetFolder | null)?.note ? (
            /* Said plainly: this filing or region has no binder template yet. */
            <div className="scaf-note" role="status" data-testid="vault-binder-note">{(cabinet as CabinetFolder).note}</div>
          ) : null}
          {folderEdit && projectId ? (
            <VaultFolderEdit
              key={folderEdit.kind === 'rename' ? folderEdit.folderId : `new-${folderEdit.parentId}`}
              projectId={projectId}
              mode={folderEdit}
              folders={cabinetFolders}
              onDone={folderMade}
              onCancel={() => setFolderEdit(null)}
            />
          ) : null}
          {!searching ? <ConfirmSuggestedBar docs={folderDocs} state={confirmSuggested} /> : null}
          {!searching && projectId && folder ? (
            <FolderExportButton projectId={projectId} treeFolderId={folder.id} label={folder.label}
              documentCount={folderDocs.filter((d) => d.src === 'upload' && d.docId).length} />
          ) : null}
          {libraryMode ? (
            <VaultLibraryResults
              query={trimmedQ}
              filterParams={filterParams}
              includeEarlier={includeEarlier}
              currentProjectId={projectId ?? null}
              onDownload={(docId, title, programId) => void downloadVaultDoc(docId, title, programId)}
              downloadingId={downloading}
            />
          ) : (
            <div className="vd-rows">
              {results.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="vd-row"
                  data-on={selId === d.id || undefined}
                  aria-current={selId === d.id ? 'true' : undefined}
                  onClick={() => pickRow(d.id)}
                >
                  <span className="vd-col-name">
                    <span className="vd-row-ic">{fileIcon(d)}</span>
                    <span className="vd-row-t">
                      {d.num && d.num !== '—' ? <span className="vd-num">{d.num}</span> : null}
                      {d.title}
                    </span>
                    {d.blocker && (
                      <span className="vd-blk" title="Blocks filing">
                        {I.alertTriangle}
                      </span>
                    )}
                  </span>
                  <span className="vd-col-status">
                    <span className={'rd-chip tone-' + st(d.status).tone}>{st(d.status).label}</span>
                  </span>
                  {/* Type, versions and review stage, then owner and date: the
                      fields the five columns carried, on one quiet line. */}
                  <span className="vd-row-s" title={`${d.type}${reviewText(d)}`}>
                    {d.type}
                    {(d.versionCount ?? 1) > 1 ? ` · ${d.ver}, ${d.versionCount} versions` : ''}
                    {d.earlierVersion ? ` · ${d.ver}, earlier version` : ''}
                    {reviewText(d)}
                    {d.owner && d.owner !== '—' ? ` · ${d.owner}` : ''}
                    {/* A search hit carries no relative time (searchHitToDoc): no separator for nothing (J2, 2026-11-06). */}
                    {d.updated ? ` · ${d.updated}` : ''}
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
          )}
        </section>
      </div>

      {!recordAsDrawer && (
        <aside className="vd-detail de" data-docked="" aria-label="Document record">
          {recordView ?? (
            <div className="de-body">
              <p className="vd-d-idx">Pick a document to see its record.</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );

  /* Uploading is an ingest, which admits the writing roles only (VaultViewOnly). */
  const uploadBlock = canWrite ? (
    <div className="vd-upload">
      <div className="vd-upload-bar">
        {/* What the file IS — the ingest schema's own vocabulary, named by
            vaultIngestTypeLabel, so the picker never offers a type the
            server refuses or a wire token for a label. The default stays
            Other rather than a guess from the filename; each staged row
            can change its own. */}
        <label className="vd-upload-type">
          <span className="vd-upload-type-l">Type for files added next</span>
          <select
            className="c2c-input"
            value={docType}
            onChange={(e) => setDocType(e.target.value as VaultIngestDocumentType)}
            disabled={uploading}
            data-testid="vault-upload-type"
            title="Document type for files added next; each file's own row can change it"
          >
            {VAULT_INGEST_DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {vaultIngestTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        {!staging && (
          <p className="vd-upload-hint">
            Drop files or a folder anywhere on this page, or use Add files.{' '}
            {/* The conversational route: a second way in (an import from
                another system), not the thing the upload button promises. */}
            <button
              type="button"
              className="btn ghost small"
              onClick={() => onAsk(IMPORT_ASK)}
              title="Describe an import to AnA instead — for example, a bulk import from another system"
            >
              {I.sparkles} Ask AnA to import
            </button>
          </p>
        )}
      </div>
      {staging ? (
        <VaultUploadStaging
          staging={staging}
          folders={uploadFolders}
          view={vaultView}
          uploading={uploading}
          onChange={patchStaged}
          onRemove={(key) => setStaging((st) => st && { ...st, rows: st.rows.filter((r) => r.key !== key) })}
          onUpload={() => void uploadStaged()}
          onDone={() => { setStaging(null); setTimeout(() => addFilesButton.current?.focus(), 0); }}
        />
      ) : null}
      {checkInOffers.map(({ file, doc }) => (
        <div key={`${file.name}-${doc.docId}`} className="scaf-note" role="status">
          {file.name} was not uploaded: a different file is already recorded under this name as “{doc.title}”
          ({doc.ver}). Added as a new version, it is numbered by the server, keeps the document's filing, and the
          earlier versions stay in the Vault.{' '}
          <button type="button" className="btn ghost small" disabled={uploading} onClick={() => void uploadNewVersion(file, doc)}>
            Upload as a new version of {doc.title}
          </button>
        </div>
      ))}
    </div>
  ) : null;

  const uploadsView = (
    <>
      {uploadBlock}
      <DataRoomLane
        block={vault?.dataRoom}
        filing={roomFiling}
        unavailableReason={vault?.unavailable?.find((u) => u.branch === 'Data room')?.reason ?? null}
      />
      {/* Every upload in the programme, a projection of the same read. */}
      <UploadsLane cabinet={cabinet} window={vault?.uploadsWindow} status={st} onOpen={openUpload} />
    </>
  );

  const requiredView = (
    <VaultCoverage
      coverage={vault?.coverage}
      documents={coverageDocuments}
      onUpload={() => uploadControls.current?.chooseFiles()}
      onFileHere={(docId, target) =>
        void fileDocument(docId, { ...target, note: `Filed at ${target.ctdSection} from Vault coverage.` })
      }
      busy={filing}
      defaultOpen
      onShowOutline={() => setView('library')}
    />
  );

  const artifactsView = (
    <>
      {/* The project's governed artifacts: a breakdown of the tree's branch, not a second list. */}
      <GovernedArtifactsLane
        block={vault?.artifacts}
        unavailableReason={vault?.unavailable?.find((u) => u.branch === ARTIFACTS_BRANCH)?.reason ?? null}
        onOpen={openArtifacts}
        onExportManifest={exportArtifactManifest}
      />
      {organizationView}
    </>
  );

  const sealsView = (
    <>
      {/* The Vault's seals (VR-19): an e-signed record of every current
          document as it stood, and its verification. */}
      {projectId ? <VaultSeals projectId={projectId} /> : null}
      {/* Fixity: re-prove every stored version on demand. */}
      {vault ? <VaultFixityCheck projectId={projectId ?? null} /> : null}
    </>
  );

  const viewBodies: Record<VaultView, React.ReactNode> = {
    library: libraryView,
    uploads: uploadsView,
    required: requiredView,
    artifacts: artifactsView,
    seals: sealsView,
  };

  const page = (
    <div className="page-inner vd-wrap" data-work-area="vault">
      {/* Back to the project (D5 §WA.4.2 rule 2); it replaces "Open project". */}
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">{getSurfaceMeta('vault').label}</h1>
          {headerParts.length > 0 ? (
            <p className="ph-sub">
              {/* Each part keeps its separator: the line wrapped on both sides
                  of a dot and left it alone on a line (UI walk, 2026-10-31). */}
              {headerParts.map((piece, i) => (
                <React.Fragment key={piece}>
                  {i > 0 ? ' ' : null}
                  <span className="vd-sub-part">{i > 0 ? <>{I.dot} </> : null}{piece}</span>
                </React.Fragment>
              ))}
            </p>
          ) : null}
        </div>
        <div className="ph-acts">
          {/* Offered only where the eTMF can be opened: outside this release it
              led to the locked panel (FILING_SPINE.md F16). */}
          {available('etmf') && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => onNav && onNav('etmf')}
              title="TMF inspection-readiness — completeness, timeliness & QC"
            >
              {I.shieldCheck} Inspection readiness
            </button>
          )}
          {canWrite ? (
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={!projectId || !cabinet}
                onClick={newFolder}
                title={projectId ? 'Make a folder in this project’s Vault, in the folder open on the left' : 'Open a project first.'}
                data-testid="vault-new-folder-button"
              >
                {I.folder} New folder
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!projectId}
                onClick={addFolder}
                title="Choose a folder of files on your computer to upload into this project’s Vault"
                data-testid="vault-upload-folder-button"
              >
                {I.upload} Upload a folder
              </button>
              <button
                ref={addFilesButton}
                type="button"
                className="btn primary"
                disabled={!projectId}
                onClick={addFiles}
                title={
                  projectId
                    ? 'Choose files to file into this project’s Vault'
                    : 'Open a project first — a Vault document is filed against a project.'
                }
                data-testid="vault-upload-button"
              >
                {I.upload} Add files
              </button>
            </>
          ) : null}
        </div>
      </header>
      <div className="sp-starters" data-layout="row" role="group" aria-label="Ask AnA">
        {VAULT_STARTERS.map((s) => (
          <button key={s.label} type="button" className="sp-starter" onClick={() => onAsk(s.prompt)}>
            <span className="sk" aria-hidden="true">{I.sparkles}</span><span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* What qualifies every view: a transfer's outcome, a document that is
          not where it was looked for, a filing decision's outcome, a cabinet
          shown as a window, and each branch the server could not serve — said,
          never silently omitted, because "no Uploaded files" and "no uploads"
          would otherwise look identical. */}
      <div className="vd-notes">
        {(uploadNote || downloadNote) && (
          <div className="scaf-note" role="status" data-tone={(downloadNote ?? uploadNote)!.tone === 'error' ? 'error' : undefined}>
            {(downloadNote ?? uploadNote)!.text}
          </div>
        )}
        {targetMissing && missingTarget && (
          <div className="scaf-note" role="status" data-testid="vault-target-missing">
            The document you just {missingTarget.act} is not in this list. Search for it by title.
          </div>
        )}
        {otherProjectTarget && (
          <div className="scaf-note" role="status" data-testid="vault-target-other-project">
            The document you just filed belongs to another project. Open that project to see it in its Vault.
          </div>
        )}
        {filingNote && (
          <div className="scaf-note" role="status" data-tone={filingNote.tone === 'error' ? 'error' : undefined}>
            {filingNote.text}
          </div>
        )}
        {/* The filing cabinet is a WINDOW onto the vault, not the vault: a
            reviewer who believes a partial cabinet is the whole one concludes a
            document is absent, and in a regulated vault "absent" is a finding. */}
        {vault?.uploadsWindow?.truncated ? (
          <div className="scaf-note" role="status">
            Uploaded files: showing the {vault.uploadsWindow.shown.toLocaleString()} most
            recently updated of {vault.uploadsWindow.total.toLocaleString()} documents in
            this project. Search to reach the rest.
          </div>
        ) : null}
        {vault?.unavailable?.map((u) => (
          <div key={u.branch} className="scaf-note" role="status">
            {u.branch}: {u.reason}
          </div>
        ))}
      </div>

      {!projectId ? (
        <>
          <EmptyState
            icon={I.folder}
            title="Choose a project's Vault"
            hint="Each project keeps its own governed document tree: its CTD, eSTAR, IVDR or TMF spine. Open one below. The governed artifacts of every project you can open are listed after them."
          />
          <ProjectVaults onNav={onNav} />
          {organizationView}
        </>
      ) : vaultState.loading && !vault ? (
        <div role="status" className="vd-loading">
          Loading the project vault…
        </div>
      ) : vaultState.error ? (
        /* A refusal is said as a refusal: a 403 answered and said no, a 404 is
           a project not in this organization. Only a failure retry can fix
           offers one. */
        <>
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title={vaultReadFailure(vaultState.status, vaultState.code).title}
            hint={vaultReadFailure(vaultState.status, vaultState.code).hint}
            retry={vaultReadFailure(vaultState.status, vaultState.code).retryable ? () => setVaultEpoch((n) => n + 1) : undefined}
          />
          {/* "Add files" stays in the header when the read fails, as it always did:
              what it stages is listed here, since the views are not drawn. */}
          {staging || checkInOffers.length > 0 ? uploadBlock : null}
        </>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Vault views" onKeyDown={onViewKey}>
            {VAULT_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                className="tab"
                id={`${viewIds}-tab-${v.id}`}
                aria-selected={view === v.id}
                aria-controls={`${viewIds}-panel-${v.id}`}
                tabIndex={view === v.id ? 0 : -1}
                data-view={v.id}
                onClick={() => setView(v.id)}
              >
                {viewLabel(v)}
              </button>
            ))}
          </div>
          {VAULT_VIEWS.map((v) => (
            <div key={v.id} {...panelProps(v.id)}>
              {viewBodies[v.id]}
            </div>
          ))}
        </>
      )}

      {/* Drawers: the structure tree below 1024px, the record below 1280px.
          Escape closes either, and focus returns to what opened it. */}
      {projectId && view === 'library' && treeAsDrawer && treeOpen ? (
        <VaultDrawer label="Document structure" className="vd-tree-drawer" onClose={() => setTreeOpen(false)}>
          <div className="de-h">
            <div className="de-h-t">Structure</div>
            <button type="button" className="de-x" aria-label="Close the structure" onClick={() => setTreeOpen(false)}>
              {I.close}
            </button>
          </div>
          <div className="de-body">
            {treeCaption}
            {treeNav}
          </div>
        </VaultDrawer>
      ) : null}
      {projectId && view === 'library' && recordAsDrawer && recordOpen && sel ? (
        <VaultDrawer
          label={`Record: ${sel.title}`}
          className="vd-detail"
          onClose={() => setRecordOpen(false)}
          suspended={Boolean(filingIntoSubmission) || Boolean(projectId && workingSource)}
        >
          {recordView}
        </VaultDrawer>
      ) : null}

      {/* Place into filing is its own drawer, over whichever view is on screen. */}
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
      {projectId && workingSource && <SourceImportDialog programId={projectId}
        source={workingSource.source} title={workingSource.title}
        onClose={() => setWorkingSource(null)} onOpenDocument={(docId, code) => { if (readOwner.current()) openImportedDocument(docId, projectId, onNav, code); }} />}
    </div>
  );

  /* Uploading is an ingest, which admits the writing roles only (VaultViewOnly):
     for them the whole page is the one drop zone (FileDropZone.tsx, shared with
     the Data Room). The pickers accept exactly what POST /api/vault/ingest
     accepts; what is gathered goes to the staging rows of the Uploads view. */
  if (!canWrite) return page;
  return (
    <FileDropZone
      className="vd-drop"
      accept={VAULT_UPLOAD_ACCEPT}
      directory
      activation="controls"
      disabled={!projectId}
      label="Vault: drop files or a folder here to add them"
      testId="vault-upload-zone"
      controlsRef={uploadControls}
      onFiles={(picked) => {
        setView('uploads');
        setStaging((st) => stageFiles(picked, docType, st ?? undefined));
      }}
    >
      {() => page}
    </FileDropZone>
  );
}
