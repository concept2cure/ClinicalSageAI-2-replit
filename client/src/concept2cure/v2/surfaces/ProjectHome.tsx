import React, { useState, useRef, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, ErrorState, useLiveData, hasKeys, type DataState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { applySurfaceAction, notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { DOSSIER_READINESS_LABEL, DOSSIER_READINESS_MEANS, dossierReadinessValue } from '../dossierReadiness';
import { PJ_LIFECYCLE, PJ_STAGE_TOOLS, Ring, pjInitials } from '../fixtures/project-home-data';
import { useChatUpload, readyAttachmentLabel, CHAT_UPLOAD_ACCEPT } from '../../hooks/useChatUpload';
import { updateShellProject } from '../shellProject';
import { ProjectRecords } from './ProjectRecords';
import { ConversationFilesAdopt } from './ConversationFilesAdopt';
import { DocumentDisposition } from './DocumentDisposition';
import { useProjectThreads } from './projectThreads';
import { ProjectFilesPanel } from '../editor/ProjectFilesPanel';
import { StatusPill, rowsOf, updatedWords, useDocumentList, type BuiltDocument, type ListRead } from '../editor/CanvasDocumentList';
import { clearEditorTarget, setEditorTarget } from '../editorTarget';
import type { ReviewItem } from '../fixtures/review-data';
import { reviewStanding, type ReviewStandingGroup } from './reviewStanding';
import { openReviewDocument } from './Review';
import { C2CToast, useToast } from '../toast';
import { DEVICE_FLAGS } from '@shared/constants/domain/device-classification';
import { DEVICE_FAMILY_PRODUCT_TYPES } from '@shared/constants/domain/product-types';
import { useProgramMarkets } from './programSequence';
import { ProjectMarkets, ProjectStatusLine } from './ProjectMarkets';
import '../styles/project-home-v2.css';

/* ── Window globals — cross-surface project selection handoff ──
   window.C2C_PROJECT is written by the Projects surface (openProj / New-project
   wizard) and carries the SELECTED project's identity: { id, title, code, ws,
   status, product? }. `id` is the C2C regulatory_programs UUID (from the live
   /api/c2c/projects list) — the id-space the /api/c2c/projects/:id read-model is
   keyed on. It is NOT a numeric projects.id, so the numeric project-home
   read-model (/api/project-home/:projectId) is deliberately NOT called from here
   (parseInt of a UUID would load a different project in the same org). */
declare global {
  interface Window {
    /* Typed by its owner, `../shellProject` (ShellProject), not re-declared as
       a string map here.

       This read `Record<string, string>`, which was harmless while nothing else
       typed the global — but a `declare global` block MERGES, so when
       shellProject.ts became the channel's owner and assigned a real
       `ShellProject`, TypeScript intersected the two into
       `Record<string, string> & ShellProject` and rejected every write: a
       ShellProject has no string index signature. That broke the typecheck for
       the whole repository from a file neither end of the assignment mentions,
       which is the specific cost of declaring another module's global. */
    C2C_PROJECT?: import('../shellProject').ShellProject;
    C2C_CONVO?: Record<string, string>;
    /** cre_evidence_sources ids the user pinned in the data room as AnA context. */
    C2C_SOURCE_PINS?: string[];
    C2C?: Record<string, (...args: unknown[]) => void>;
    __C2C_SEGMENT?: string;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   Real backend rows — the org-scoped, UUID-keyed project read-models this
   surface anchors to (server/routes/c2c/projects.ts). Every field is projected
   from a verified column; nullable columns are `| null` and rendered null-safe.
   Slices with no reachable UUID-keyed backend (the CTD pyramid,
   memory/instructions/intelligence, agency meetings, eTMF, grants) are
   rendered as an honest EmptyState rather than a fabricated fixture. The
   project's files, conversations, dispatch readiness and submissions are read
   by the project's UUID (slices 23 and 24 of ONE_ANA_ONE_CANVAS.md). The
   program's tasks and approvals (the Review tab, and Tasks on Author) are
   read by the program UUID from a route the server resolves to the program's
   anchored projects row — see ProjectWorkPanel.
   ════════════════════════════════════════════════════════════════════════ */

/** GET /api/c2c/projects/:id — regulatory_programs metadata (bare object). */
interface ProgramRow {
  id: string;
  code: string | null;
  name: string | null;
  program_type: string | null;
  status: string | null;
  phase: string | null;
  priority: string | null;
  description: string | null;
  product_name: string | null;
  indication: string | null;
  /** organizations.name — the sponsor of record in this data model. */
  sponsor_name?: string | null;
  /** Agency-assigned IND / NDA / BLA / MAA number; null until assigned, never invented. */
  application_number?: string | null;
  intended_use: string | null;
  primary_agency: string | null;
  target_submission_date: string | null;
  /** The share of this program's governed sections that are approved or
   *  locked — the figure its card in the Projects list reports. Null when the
   *  server could not measure it. (This read `progress_percent` until
   *  2026-09-24: a column written once as 0 and never updated.) */
  readiness?: number | null;
  /** The device taxonomy intake stores for a device / IVD program
   *  (regulatory_programs columns + the metadata-held fields the read lifts).
   *  Every one is null for a drug program, and absent on a server that predates
   *  them — the block renders only from what is present. */
  product_type?: string | null;
  device_class?: string | null;
  regulatory_path?: string | null;
  product_code?: string | null;
  predicate_devices?: Array<{ kNumber?: string | null }> | null;
  review_panel?: string | null;
  regulation_number?: string | null;
  device_flags?: string[] | null;
}

/** regulatory_path values as a reader says them. */
const REGULATORY_PATH_LABEL: Record<string, string> = {
  '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', hde: 'HDE', ide: 'IDE', exempt: '510(k)-exempt',
};
const DEVICE_FLAG_LABEL: Record<string, string> = Object.fromEntries(DEVICE_FLAGS.map((f) => [f.id, f.label]));
const isDeviceProgram = (productType: string | null | undefined): boolean =>
  (DEVICE_FAMILY_PRODUCT_TYPES as readonly string[]).includes(String(productType ?? '').toLowerCase());

/** GET /api/c2c/projects/:id/team → { team: [...] } (project_members ∪ users). */
interface TeamRow {
  user_id: number | null;
  role: string | null;
  name: string | null;
  email: string | null;
}

/** GET /api/c2c/projects/:id/activity → { activity: [...] } (audit_logs). */
interface ActivityRow {
  id: string | number;
  action: string | null;
  resource_type: string | null;
  actor_id: number | null;
  /** COALESCE(users.name, users.email) for actor_id; null for system rows. */
  actor_name: string | null;
  occurred_at: string | null;
}

/** GET /api/c2c/projects/:id/workstreams → { workstreams: [...] } (section rollup). */
interface WorkstreamRow {
  module: string | null;
  total: number | string;
  todo: number | string;
  completion_pct: number | null;
  last_updated: string | null;
}

/** Format a real ISO timestamp for display (never fabricated — null passes through). */
function fmtWhen(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Small four-state wrapper mirroring the Nonclinical/Biostatistics reference:
   loading → error → empty → real. Never renders a fixture. */
function Anchored<T>(props: {
  state: DataState<T>;
  loadingText: string;
  errorTitle: string;
  errorHint: string;
  emptyTitle: string;
  emptyHint?: string;
  isEmpty?: (d: T) => boolean;
  /** The empty state as one line, where a panel above other content would
   *  otherwise push it below the fold. */
  compactEmpty?: boolean;
  render: (d: T) => React.ReactNode;
}) {
  const { state } = props;
  if (state.loading) {
    /* Every Anchored<T> panel on this surface waits through here, so one
       missing live region silenced all of them while their error and empty
       twins below go through EmptyState, which announces. */
    return <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>{props.loadingText}</div>;
  }
  if (state.error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={props.errorTitle} hint={props.errorHint} />;
  }
  if (!state.data || (props.isEmpty ? props.isEmpty(state.data) : false)) {
    if (props.compactEmpty) return <p className="pj-desc" role="status">{[props.emptyTitle, props.emptyHint].filter(Boolean).join(' ')}</p>;
    return <EmptyState icon={I.fileText} title={props.emptyTitle} hint={props.emptyHint} />;
  }
  return <>{props.render(state.data)}</>;
}

/* ════ Lifecycle (canonical stage catalog — not data) ════
   The tracker is navigation over the stage catalog, not a progress meter.
   Every stage before the open tab used to be marked `done` — filled node,
   filled connector — from the tab's POSITION alone. `stage` defaults to
   'author', so Plan and Evidence rendered as completed on every project,
   including with no project loaded at all, and opening Submit "completed"
   Review. Nothing this surface reads records per-stage completion, so the one
   state stated is the one that is true: which stage is open. */

/* A nav of five buttons, the open one marked aria-current="step". It was a
   role="tablist" over plain buttons carrying aria-selected, which is not valid
   on a button, so a screen reader was told of no open stage at all (design
   review 2026-10-08, a11y lens, WCAG 4.1.2). The stage bodies are not tab
   panels: each stage renders below the conversations, so a nav is what it is. */
function StageTracker({ stage, setStage }: { stage: string; setStage: (s: string) => void }) {
  return (
    <nav className="pj-lc" aria-label="Project lifecycle">
      {PJ_LIFECYCLE.map((s) => {
        const status = s.id === stage ? 'active' : undefined;
        return (
          <button key={s.id} type="button" className="pj-lc-stage" data-status={status} aria-current={stage === s.id ? 'step' : undefined}
            onClick={() => setStage(s.id)} title={s.blurb}>
            <span className="pj-lc-node"><span className="pj-lc-ic">{I[s.icon] || I.grid}</span></span>
            <span className="pj-lc-l">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ════ Evidence: the project's files ════════════════════════════════════════
   ONE_ANA_ONE_CANVAS.md slice 23. The Evidence stage said "The document vault
   opens in its own workspace" and showed nothing, so a person on their
   project had to leave it to see its files. It now shows them, through the
   one files panel the editor already uses beside a document: the same read of
   GET /api/c2c/project-vault/:id, the same search, the same audited download
   and PDF viewer, and the same honest states (a failed read is an error with a
   retry, not an empty vault). Filing, uploads and version history stay in the
   Vault, which the header opens. */
function ProjectEvidence({ pid, name, onNav, available }: {
  pid: string; name: string | null; onNav: (id: string) => void; available: (id: string) => boolean;
}) {
  const [toast, fireToast] = useToast();
  return (
    <section className="pj-sec pj-evidence" aria-labelledby="pj-evidence-h">
      <div className="pj-sec-h">
        <h2 id="pj-evidence-h">Project files</h2>
        {available('vault') && (
          <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('vault')}>
            Open in Vault {I.right}
          </button>
        )}
      </div>
      <ProjectFilesPanel programId={pid} programName={name} fireToast={fireToast} />
      <C2CToast msg={toast} />
    </section>
  );
}

/* ════ Submit: one row per market (FILING_SPINE.md F9) ════════════════════
   The project's markets, each with its own server verdict, are read once by
   useProgramMarkets (programSequence.ts) and shown by ProjectMarkets in the
   Submit tab and by ProjectStatusLine under the project header. Slice 24's
   one-verdict-per-project panels were generalised into ProjectMarkets.tsx. */

/** What this stage does not do in this release: one line of words and no
 *  button (FILING_SPINE.md §2). It replaced a "Not in this release" panel that
 *  stood where a stage's tools would be. */
function ComingLater({ stage, device = false }: { stage: string; device?: boolean }) {
  const meta = PJ_LIFECYCLE.find((s) => s.id === stage);
  /* A device project's line does not promise IND or variation tracking. */
  const words = (device && meta?.laterDevice) || meta?.later;
  if (!words) return null;
  return (
    <p className="pj-desc pj-later" data-testid="pj-coming-later">
      <b>Coming later:</b> {words}
    </p>
  );
}

function StagePanel({ stage, onNav, available }: { stage: string; onNav: (id: string) => void; available: (id: string) => boolean }) {
  const meta = PJ_LIFECYCLE.find(s => s.id === stage) ?? { label: '', blurb: '' };
  /* A tool outside the launch scope is not offered: a card that opens a "not
     in this release" panel is not a thing this project can do. A stage left
     with no tool says what comes later instead. */
  const tools = (PJ_STAGE_TOOLS[stage] || []).filter(t => available(t.id));
  return (
    <section className="pj-sec">
      <div className="pj-sec-h"><h2>{meta.label}</h2><span className="sec-sub">{meta.blurb}</span></div>
      {tools.length > 0 && (
        <div className="pj-tools">
          {tools.map(t => (
            <button key={t.id} className="pj-tool" onClick={() => onNav(t.id)}>
              <span className="pj-tool-ico">{I[t.icon] || I.grid}</span>
              <span className="pj-tool-b"><span className="pj-tool-t">{t.label}</span><span className="pj-tool-d">{t.desc}</span></span>
              <span className="pj-tool-go">{I.right}</span>
            </button>
          ))}
        </div>
      )}
      <ComingLater stage={stage} />
    </section>
  );
}

/* ════ Data room ════════════════════════════════════════════════════════════
   The project's sources — every client document this project's documentation is
   written from, as canonical `cre_evidence_sources` identities
   (GET /api/c2c/projects/:id/sources).

   Uploads go through the shared `useChatUpload` hook, the same path AnA's
   composer uses, so a file dropped here and a file attached in chat produce ONE
   identity rather than two records of the same document. */

/** The most sources "Write from these sources" hands to one turn. */
const HANDOFF_LIMIT = 10;

interface SourceRow {
  id: number;
  title: string | null;
  checksum: string | null;
  ingestionStatus: string | null;
  extractionStatus: string | null;
  createdAt: string | null;
  mimeType: string | null;
  fileSize: number | null;
  artifactId: string | null;
  origin: string | null;
  extractionMethod: string | null;
  /** False once a re-upload superseded it. Absent on a server that predates it. */
  isCurrent?: boolean;
  dataEligible?: boolean;
  originalFileAvailable?: boolean;
  disposition?: import('@shared/document-data-disposition').DocumentDispositionChoice | null;
  /** Recorded citations of this source. Absent on a server that predates it. */
  usage?: { sections: number; documents: number; changedSections: number } | null;
  /** Where a search matched in the text read from the file (ts_headline). Null outside a search. */
  snippet?: string | null;
  /** What the catalog found the source IS, by rule (S3). Absent on a server that predates it. */
  catalog?: SourceCatalog | null;
}

/** The deterministic catalog facts of a source; a null field was not found, never guessed. */
interface SourceCatalog {
  studyRef: number | null;
  trialRegistryIdentifier: string | null;
  protocolNumber: string | null;
  documentDate: string | null;
  dataCutDate: string | null;
  dataset: {
    format: string | null;
    tableCount: number;
    tables: Array<{ name: string; standard: string | null; domain: string | null; rowCount: number; columnCount: number }>;
  } | null;
}

/** One page of the project's Data Room, as GET /:id/sources answers it. */
interface SourcesPage {
  sources: SourceRow[];
  window?: { shown: number; truncated: boolean };
  /** Every source matching the read; currentTotal counts each re-uploaded file once. */
  total?: number;
  currentTotal?: number;
}

/** How many sources one page of the Data Room shows. */
const SOURCES_PAGE = 200;

/** The Data Room read: a full-text search over what was read from each file, and its page. */
function sourcesUrl(pid: string, term: string, offset: number): string {
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.toString();
  return `/api/c2c/projects/${pid}/sources${qs ? `?${qs}` : ''}`;
}

/** A section drafted from a source that has since changed. */
interface ChangedUsageRow {
  citationId: string;
  sectionId: string;
  sectionCode: string | null;
  sectionTitle: string | null;
  documentTitle: string | null;
  sourceId: number;
  sourceTitle: string | null;
  citedAt: string | null;
}

/**
 * "Used in" — the back-reference, from recorded citations only.
 *
 * A source nothing was written from says so. That is the state a reviewer most
 * wants to see, and collapsing it into the same silence as a cited source would
 * hide it. Nothing here is inferred from filenames or text similarity: a usage
 * exists because a section recorded a citation of this source.
 *
 * Returns null when the server sent no `usage` field at all — an older server is
 * not the same as "cited nowhere", and guessing would be the fabrication this
 * surface exists to avoid.
 */
function usedIn(s: SourceRow): { label: string; tone: 'ok' | 'warn' | 'muted'; title: string } | null {
  if (!s.usage) return null;
  const { sections, documents, changedSections } = s.usage;
  if (sections === 0) {
    return {
      label: 'Not cited yet',
      tone: 'muted',
      title: 'No section records a citation of this source',
    };
  }
  const where = `Used in ${sections} section${sections === 1 ? '' : 's'}`;
  const docs = documents > 0 ? ` · ${documents} document${documents === 1 ? '' : 's'}` : '';
  if (changedSections > 0) {
    return {
      label: `${where}${docs} · ${changedSections} written against older content`,
      tone: 'warn',
      title:
        'This source changed after those sections cited it. They were drafted from the earlier content — review them; nothing is rewritten automatically.',
    };
  }
  return { label: `${where}${docs}`, tone: 'ok', title: 'Sections that recorded a citation of this source' };
}

function prettyBytes(n: number | null): string | null {
  if (!n || n <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Short, human label for a mime type — "PDF", "Word", "Excel", "Image". */
function kindLabel(mime: string | null): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('word') || m.includes('officedocument.wordprocessing')) return 'Word';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'Sheet';
  if (m.startsWith('image/')) return 'Image';
  if (m.startsWith('text/')) return 'Text';
  return 'File';
}

/**
 * Whether this source's text is actually available to draft from.
 *
 * Reported from the source's own `extraction_status`, never inferred. A
 * document whose text could not be read is shown as such: it is still stored
 * and still has an identity, but a section drafted "from" it would not be
 * grounded in anything, and hiding that would be the worst kind of quiet
 * failure on a regulatory surface.
 */
function readState(s: SourceRow): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (s.disposition === 'remove_data') return { label: 'Data withdrawn', tone: 'warn' };
  if (s.disposition === 'supersede') return { label: 'Replaced by newer data', tone: 'muted' };
  if (s.disposition === 'keep_data') return { label: 'Data retained · original unavailable', tone: 'muted' };
  if (s.extractionStatus === 'extracted') {
    return { label: s.extractionMethod?.includes('ocr') ? 'Read via OCR' : 'Read', tone: 'ok' };
  }
  if (s.extractionStatus === 'failed') return { label: 'Text not readable', tone: 'warn' };
  return { label: 'Not processed yet', tone: 'muted' };
}

function sourceCanGround(s: SourceRow): boolean {
  return s.extractionStatus === 'extracted' && s.isCurrent !== false && s.dataEligible !== false;
}

function sourcePinTitle(s: SourceRow): string {
  if (s.dataEligible === false || s.isCurrent === false) return 'This source is excluded from active data use';
  if (s.originalFileAvailable === false) return 'Use the retained extracted text as context for AnA; the original file is unavailable';
  return s.extractionStatus === 'extracted'
    ? 'Use this source as context for AnA'
    : 'This source has no readable text, so it cannot ground a draft';
}

/**
 * What the catalog found a source is: protocol, registry id, data cut-off, and
 * for a table or define.xml its CDISC standard, domain and size. Facts only;
 * a fact not found is left out, never filled in.
 */
function catalogFacts(c: SourceCatalog | null | undefined): string[] {
  if (!c) return [];
  const facts: string[] = [];
  if (c.protocolNumber) facts.push(`Protocol ${c.protocolNumber}`);
  if (c.trialRegistryIdentifier) facts.push(c.trialRegistryIdentifier);
  if (c.dataCutDate) facts.push(`data cut-off ${c.dataCutDate}`);
  else if (c.documentDate) facts.push(`dated ${c.documentDate}`);
  const t = c.dataset?.tables[0];
  if (t) {
    const kind = t.standard ? `${t.standard}${t.domain ? ` ${t.domain}` : ''}` : 'table';
    facts.push(c.dataset!.format === 'define-xml'
      ? `define.xml · ${c.dataset!.tableCount} dataset${c.dataset!.tableCount === 1 ? '' : 's'}`
      : `${kind} · ${t.columnCount} columns · ${t.rowCount} rows`);
  }
  return facts;
}

function SourceCatalogLine({ catalog }: { catalog?: SourceCatalog | null }) {
  const facts = catalogFacts(catalog);
  if (facts.length === 0) return null;
  return (
    <span className="sec-sub" style={{ display: 'block', fontSize: 11.5 }} data-testid="source-catalog">
      {facts.join(' · ')}
    </span>
  );
}

/** Where a search matched in the text read from the file; nothing outside a search. */
function SourceSnippet({ show, text }: { show: boolean; text?: string | null }) {
  if (!show || !text) return null;
  return (
    <span className="sec-sub" style={{ display: 'block', fontSize: 11.5 }}>
      &hellip;{text.replace(/<\/?b>/g, '')}&hellip;
    </span>
  );
}

function DataRoom({ pid, onNav, onAsk }: { pid: string | null; onNav: (id: string) => void; onAsk: (q: string) => void }) {
  const available = useSurfaceAvailable();
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState('');
  // The search the server runs: settled after the person stops typing, and a
  // new search starts from the first page.
  const [term, setTerm] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setTerm(q.trim()); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  // Sources the user has pinned as context for the next AnA turn. Handed over
  // via window.C2C_SOURCE_PINS, matching the window.C2C_PROJECT / C2C_CONVO
  // convention this surface already uses for cross-surface handoff.
  const [pinned, setPinned] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const state = useLiveData<SourcesPage>(
    pid ? sourcesUrl(pid, term, offset) : null,
    [pid, reloadKey, term, offset],
    hasKeys<SourcesPage>('sources'),
  );

  // Sections in this project drafted from a source that has since changed. Read
  // separately because it answers a different question from the source list, and
  // an older server that does not serve it simply yields nothing rather than a
  // fabricated all-clear.
  const changed = useLiveData<{ changes: ChangedUsageRow[]; count: number }>(
    pid ? `/api/c2c/projects/${pid}/source-changes` : null,
    [pid, reloadKey],
  );
  const changes = changed.data?.changes ?? [];

  // Same upload path as AnA's composer — one file, one identity.
  const { attachments, addFiles, uploading, statusMessage } = useChatUpload({ projectId: pid });

  // Refresh the list once the last upload settles, so a dropped file appears
  // as a real source row rather than only as a transient chip.
  const settled = attachments.length > 0 && attachments.every(a => a.status !== 'uploading');
  useEffect(() => {
    if (settled) setReloadKey(k => k + 1);
  }, [settled]);

  const sources = state.data?.sources ?? [];
  // A refreshed lifecycle decision must retire local and cross-surface pins.
  // A retained-data pin resolves the recorded extraction when its original
  // file is unavailable; withdrawn and replaced data cannot ground a draft.
  useEffect(() => {
    if (state.loading || state.error || !state.data) return;
    const eligible = new Set(state.data.sources.filter(sourceCanGround).map(s => s.id));
    setPinned(prev => prev.every(id => eligible.has(id)) ? prev : prev.filter(id => eligible.has(id)));
    if (window.C2C_SOURCE_PINS) window.C2C_SOURCE_PINS = window.C2C_SOURCE_PINS.filter(id => eligible.has(Number(id)));
  }, [state.data, state.loading, state.error]);
  // The server searched title and text; the list is its answer, not a filter of this page.
  const rows = sources;
  /* One file re-uploaded is one source: its retired revision is listed but not
     counted. The server counts the whole room (currentTotal), not this page. */
  const current = sources.filter(s => s.isCurrent !== false && s.dataEligible !== false);
  const total = state.data?.currentTotal ?? current.length;
  const readable = current.filter(s => s.extractionStatus === 'extracted').length;
  const truncated = state.data?.window?.truncated === true;
  const searching = term.length > 0;
  const matched = state.data?.total ?? sources.length;
  /* Sources whose text can ground a draft, newest first as the route lists
     them. "Write from these sources" hands over at most HANDOFF_LIMIT: the
     stream inlines every pinned file into one turn and limits only each
     file's size, so a whole data room would make a turn the model request
     cannot carry. When the list is cut, here or by the server's window, the
     words say "newest" rather than claiming the data room's readable set. */
  const groundable = sources.filter(sourceCanGround).map(s => s.id);
  const handed = groundable.slice(0, HANDOFF_LIMIT);
  const handedWords = `the ${handed.length}${truncated || groundable.length > handed.length ? ' newest' : ''} readable source${handed.length === 1 ? '' : 's'}`;
  /* Hand a set of sources to AnA. It resolves each source back to the upload
     its bytes live in and grounds the turn on exactly those documents, not on
     whatever its own retrieval would have picked. */
  const handOff = (ids: number[], words: string) => {
    window.C2C_SOURCE_PINS = ids.map(String);
    onAsk(words);
  };

  return (
    <section className="pj-sec">
      <div className="pj-sec-h">
        <h2>Data room</h2>
        <span className="sec-sub">
          {/* A failed read must not read as "no sources". Someone who just
              dropped a file in here would take an empty list as data loss. */}
          {state.error
            ? "couldn't load this project's sources — the list below is incomplete"
            : searching
              ? `${matched} source${matched === 1 ? '' : 's'} match \u201c${term}\u201d in their title or text`
              : total > 0
                ? `${total} source${total === 1 ? '' : 's'} · ${readable} readable on this page${truncated || offset > 0 ? ` (showing ${offset + 1}\u2013${offset + sources.length})` : ''} — what this project's documents are written from`
                : "the sources this project's documents are written from"}
        </span>
      </div>

      {/* Drop zone — the whole panel accepts a drag, and clicking opens the picker. */}
      <div
        className="pj-dropzone"
        data-dragging={dragging || undefined}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        aria-label="Add sources to this project"
      >
        <span aria-hidden="true">{I.paperclip}</span>
        <span className="pj-dropzone-t">
          <b>Add sources</b> — drop files here or click to browse. They&rsquo;re read on upload and
          become available to AnA for this project.
        </span>
        <input
          ref={fileRef}
          type="file"
          aria-label="Attach files to this project"
          accept={CHAT_UPLOAD_ACCEPT}
          multiple
          hidden
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* ── Sections drafted from content that has since changed ──────────────
          Reported, never repaired. A source moving does not tell us how the
          section written from it should now read, and silently regenerating
          regulated text is not something this surface should do. The point is
          that the affected sections are findable at all: before this they left
          no trace anywhere. */}
      {changes.length > 0 && (
        <div
          className="sp-tone-warn"
          role="status"
          style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: '10px 12px', marginBottom: 12, fontSize: 12.5,
          }}
        >
          <b>
            {changes.length} section{changes.length === 1 ? '' : 's'} in this project{' '}
            {changes.length === 1 ? 'was' : 'were'} drafted from a source that has since changed.
          </b>
          <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
            {changes.slice(0, 6).map((c) => (
              <span key={c.citationId}>
                {c.documentTitle || 'Untitled document'}
                {c.sectionCode ? ` · ${c.sectionCode}` : ''}
                {' — cited '}
                {c.sourceTitle || `source ${c.sourceId}`}
                {fmtWhen(c.citedAt) ? ` ${fmtWhen(c.citedAt)}` : ''}
              </span>
            ))}
            {changes.length > 6 && <span>…and {changes.length - 6} more.</span>}
          </div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Nothing has been rewritten. Open each section to decide whether the newer content
            changes what it says.
          </div>
        </div>
      )}

      {/* Live upload state, and the screen-reader announcement the hook maintains. */}
      <div aria-live="polite" className="sr-only">{statusMessage}</div>
      {attachments.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attachments.map(a => (
            <span
              key={a.id}
              className={a.status === 'error' ? 'sp-tone-warn' : undefined}
              style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '2px 10px' }}
            >
              {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
              {a.status === 'ready' ? ` · ${readyAttachmentLabel(a.extractionMethod, a.extractionWords)}` : ''}
              {a.status === 'error' && a.error ? ` · ${a.error}` : ''}
            </span>
          ))}
        </div>
      )}

      {(total > 0 || searching) && (
        <div style={{ marginBottom: 8 }}>
          <input
            className="pj-input"
            placeholder="Search titles and text…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sources by title or text"
            style={{ width: '100%', maxWidth: 320, fontSize: 13, padding: '5px 10px' }}
          />
        </div>
      )}

      <Anchored
        state={state}
        loadingText="Loading the data room…"
        errorTitle="Couldn't load this project's sources"
        errorHint="The sources read didn't respond. Sign in and retry, or check the service is reachable."
        emptyTitle="No sources in this project yet"
        emptyHint="Add the documents this project's submission will be written from — protocols, CSRs, prior correspondence. Every file is read on upload and becomes a traceable source."
        isEmpty={(d) => (d.sources ?? []).length === 0}
        render={() =>
          rows.length === 0 ? (
            <div className="scaf-note" style={{ padding: '10px' }}>
              No source matches &ldquo;{term}&rdquo; in its title or text.
            </div>
          ) : (
            <div className="pj-srcs">
              {rows.map((s) => {
                const rs = readState(s);
                const use = usedIn(s);
                const size = prettyBytes(s.fileSize);
                return (
                  <div
                    key={s.id}
                    className="pj-src"
                    style={{ flexWrap: 'wrap' }}
                  >
                    {/* Pin as context. Only a source whose text was actually
                        read can ground a draft, so an unreadable one cannot be
                        pinned — offering it would promise grounding the
                        document cannot provide. */}
                    <input
                      type="checkbox"
                      checked={pinned.includes(s.id)}
                      disabled={!sourceCanGround(s)}
                      onChange={(e) =>
                        setPinned((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                      aria-label={`Use ${s.title || `source ${s.id}`} as context`}
                      title={sourcePinTitle(s)}
                    />
                    <span aria-hidden="true">{I.fileText}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title || `Source ${s.id}`}
                      </span>
                      <span className="sec-sub" style={{ fontSize: 11.5 }}>
                        {kindLabel(s.mimeType)}
                        {size ? ` · ${size}` : ''}
                        {fmtWhen(s.createdAt) ? ` · added ${fmtWhen(s.createdAt)}` : ''}
                      </span>
                      <SourceCatalogLine catalog={s.catalog} />
                      <SourceSnippet show={searching} text={s.snippet} />
                      {/* Where this source is actually used. Reported from
                          recorded citations; omitted entirely when the server
                          sent no usage field rather than shown as zero. */}
                      {use && (
                        <span
                          className={use.tone === 'ok' ? 'sp-tone-ok' : use.tone === 'warn' ? 'sp-tone-warn' : undefined}
                          style={{ display: 'block', fontSize: 11.5, opacity: use.tone === 'muted' ? 0.7 : 1 }}
                          title={use.title}
                        >
                          {use.label}
                        </span>
                      )}
                    </span>
                    <span
                      className={rs.tone === 'ok' ? 'sp-tone-ok' : rs.tone === 'warn' ? 'sp-tone-warn' : undefined}
                      style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
                      title="Reported by the source's own extraction status"
                    >
                      {rs.label}
                    </span>
                    {pid && (!s.disposition || s.disposition === 'keep_data') && <div style={{ flexBasis: '100%' }}><DocumentDisposition
                      key={`${s.id}-${reloadKey}`} projectId={pid} targetType="captured_source" targetId={String(s.id)}
                      title={s.title || `Source ${s.id}`} existingChoice={s.disposition} onChanged={() => setReloadKey(k => k + 1)}
                    /></div>}
                  </div>
                );
              })}
            </div>
          )
        }
      />

      {/* Pages of the room: every source is reachable, not only the newest 200. */}
      {(offset > 0 || truncated) && (
        <div className="cm-pushbar" style={{ marginTop: 8 }}>
          {offset > 0 && (
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setOffset(o => Math.max(0, o - SOURCES_PAGE))}>
              Newer sources
            </button>
          )}
          {truncated && (
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setOffset(o => o + SOURCES_PAGE)}>
              Older sources
            </button>
          )}
        </div>
      )}

      {/* The caller's chat files with no project yet (PF-07): one audited adopt
          brings a file into this Data Room, and the list reloads. */}
      {pid && <ConversationFilesAdopt pid={pid} onAdopted={() => setReloadKey((k) => k + 1)} />}

      <div className="cm-pushbar" style={{ marginTop: 12 }}>
        {available('source-tracer') && (
          <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('source-tracer')}>
            Trace a claim to its source {I.right}
          </button>
        )}
        {/* "Write from these sources" opened the editor with no document and
            no sources (FILING_SPINE.md §6 row 4). It is now the same handoff
            as "Draft with N pinned": the readable sources go to AnA as the
            context of the next turn, in the one conversation. With sources
            pinned, the pinned set is the one handed over. A data room with
            nothing readable offers neither. */}
        {pinned.length === 0 && groundable.length > 0 && (
          <button
            className="btn ghost"
            style={{ fontSize: 12, padding: '4px 12px' }}
            disabled={uploading}
            title={`Ask AnA to draft from ${handedWords} in this data room`}
            onClick={() => handOff(
              handed,
              `Use ${handedWords} in this project's data room as the context for drafting.`,
            )}
          >
            {I.sparkles} Write from these sources
          </button>
        )}
        {pinned.length > 0 && (
          <button
            className="btn"
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => handOff(
              pinned,
              `Use the ${pinned.length} source${pinned.length === 1 ? '' : 's'} I pinned in the data room as the context for this project.`,
            )}
          >
            {I.sparkles} Draft with {pinned.length} pinned source{pinned.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </section>
  );
}

/** A program the server could not anchor to a projects row answers its work
 *  read 404 (PROGRAM_UNANCHORED). The program itself was already read by
 *  /api/c2c/projects/:id, so here 404 means "no record", not "no program". */
const isUnanchored = (s: DataState<unknown>): boolean => !s.loading && s.status === 404;

/** Real ISO date → display with year (work spans years); null stays null. */
function fmtDue(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The program-header status chip was hardcoded `tone-ok`, so a program whose
 * recorded status was blocked, at_risk or on_hold wore a GREEN pill — a health
 * verdict drawn without consulting the value it was tied to. A director scanning
 * the top of the page for at-a-glance health read green-next-to-"blocked" as
 * good news. `status` is a free-text column, so this maps the values that
 * carry a verdict and defaults everything else to NEUTRAL: an unknown status
 * must never read as healthy.
 */
const PROGRAM_STATUS_TONE: Record<string, string> = {
  active: 'tone-ok',
  on_track: 'tone-ok',
  completed: 'tone-ok',
  at_risk: 'tone-warn',
  blocked: 'tone-warn',
  slipped: 'tone-warn',
  on_hold: 'tone-warn',
  suspended: 'tone-warn',
  cancelled: 'tone-warn',
  inactive: 'tone-idle',
  archived: 'tone-idle',
};
/** Same defect one chip over: "priority: low" wore a warn tone. */
const PRIORITY_TONE: Record<string, string> = {
  critical: 'tone-warn',
  high: 'tone-warn',
};

/* ════ Tasks & approvals — the 'review' step's screen ═══════════════════════
   The program's outstanding work from every store that tracks it, read from
   the REAL unified work view (GET /api/concept2cure/projects/:id/unified-work,
   server/services/unified-work/unified-work-view.ts): schedule tasks, review
   threads and approval blockers, agency correspondence, tracked filings and
   the task board. Asked by the program's UUID, resolved to its anchored
   projects row on the server, 404 for a program with none. Each row names the store it lives in; changing it
   happens where it lives (the task board, the review screen). */

/** GET …/unified-work → items[] (UnifiedWorkItem subset). */
interface WorkItemRow {
  id: string;
  source: 'schedule' | 'review' | 'correspondence' | 'filing' | 'board' | string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done' | string;
  priority: string | null;
  dueAt: string | null;
  ownerName: string | null;
  blocking: boolean;
}
interface WorkViewRow {
  items: WorkItemRow[];
  /** `partial`: a store could not be read, so every count is a floor. */
  summary?: { total?: number; blocking?: number; done?: number; partial?: boolean } | null;
}

const WORK_SOURCE_LABEL: Record<string, string> = {
  schedule: 'Schedule',
  review: 'Review thread',
  correspondence: 'Agency correspondence',
  filing: 'Tracked filing',
  board: 'Task board',
};
const WORK_STATUS_TONE: Record<string, string> = { done: 'tone-ok', blocked: 'tone-warn' };
const WORK_SHOWN = 10;

function ProjectWorkPanel({ pid, title, onNav }: { pid: string | null; title: string; onNav: (id: string) => void }) {
  const available = useSurfaceAvailable();
  const ident = pid ? encodeURIComponent(pid) : null;
  const state = useLiveData<WorkViewRow>(
    ident ? `/api/concept2cure/projects/${ident}/unified-work` : null,
    [ident],
    hasKeys<WorkViewRow>('items'),
  );
  return (
    <section className="pj-sec" aria-label={title}>
      <div className="pj-sec-h">
        <h2>{title}</h2>
        <span className="sec-sub">tasks, review threads and approvals on this program</span>
      </div>
      {!ident ? null : isUnanchored(state) ? (
        <EmptyState
          icon={I.checkCircle}
          title="This program has no task record"
          hint="Tasks, review threads and approvals are kept on the program's project record, and this program has none, so there is nothing to list for it here."
        />
      ) : (
        <Anchored
          state={state}
          loadingText="Loading this program's tasks and approvals…"
          errorTitle="Couldn't load this program's tasks and approvals"
          errorHint="The work view didn't respond. Sign in and retry, or check the service is reachable."
          emptyTitle="No tasks or approvals on this program"
          emptyHint="Tasks, review threads, approval blockers and agency correspondence recorded on this program appear here."
          isEmpty={(d) => (d.items ?? []).length === 0}
          render={(d) => {
            const items = d.items ?? [];
            const open = items.filter((w) => w.status !== 'done');
            const shown = open.slice(0, WORK_SHOWN);
            const done = items.length - open.length;
            return (
              <>
                <div className="pj-files" data-testid="pj-work">
                  {shown.map((w) => {
                    const due = fmtDue(w.dueAt);
                    return (
                      <div key={w.id} className="pj-file" style={{ cursor: 'default' }}>
                        <div className="pj-file-top">
                          <span className="pj-file-badge">{WORK_SOURCE_LABEL[w.source] ?? w.source}</span>
                          <span className={`rd-chip ${WORK_STATUS_TONE[w.status] ?? 'tone-idle'}`}>
                            {String(w.status || 'open').replace(/_/g, ' ')}
                          </span>
                          {w.blocking && <span className="sp-tone-warn" style={{ fontSize: 11 }}>blocking</span>}
                        </div>
                        <div className="pj-file-n">{w.title}</div>
                        <div className="pj-file-m">
                          {[w.ownerName, w.priority ? `priority ${w.priority}` : null, due ? `due ${due}` : 'no due date']
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="sec-sub" style={{ fontSize: 11.5, marginTop: 8 }}>
                  {open.length > WORK_SHOWN ? `+${open.length - WORK_SHOWN} more open · ` : ''}
                  {done > 0 ? `${done} done · ` : ''}
                  {items.length} item{items.length === 1 ? '' : 's'} total
                </div>
                {d.summary?.partial && (
                  <div className="sp-tone-warn" role="status" style={{ fontSize: 12, marginTop: 6 }}>
                    One of the stores this list reads could not be read, so it may be incomplete and every count is a minimum.
                  </div>
                )}
              </>
            );
          }}
        />
      )}
      {/* The board these rows live on, by its own id. This sent people to
          the `task-board` alias, which the project no longer names
          (FILING_SPINE.md §5, F7); `tasks` is the surface the alias resolved
          to, so the door opens the same board. Shown only when that board is
          in this release. */}
      {available('tasks') && (
        <div style={{ marginTop: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('tasks')}>Open task board {I.right}</button>
        </div>
      )}
    </section>
  );
}

/* ════ Review: this filing's reviews ═══════════════════════════════════════
   FILING_SPINE.md F7, §6 row 3. The Review tab listed the program's tasks and
   sent people to the `task-board` alias; nothing on it named a document. It
   now reads the review board for this program
   (GET /api/review/board?scope=all&programId=<uuid>,
   server/routes/review-board-routes.ts — the route filters by program), the
   same read model the Review surface shows, and groups the documents by what
   they need from the person. A row opens THAT document through the Review
   surface's own `openReviewDocument` (editor target by id and program).
   Verdicts and signatures stay where they are recorded: the review board and
   the editor. A failed read is an error with a retry, never an empty list. */

/** The queue cap asked of the board. The route takes at most 100. */
const PROJECT_REVIEWS_LIMIT = 100;

function projectReviewsUrl(pid: string): string {
  return `/api/review/board?scope=all&programId=${encodeURIComponent(pid)}&limit=${PROJECT_REVIEWS_LIMIT}`;
}

/** GET /api/review/board → data (the part this tab reads). */
interface ProjectReviewBoard { queue: ReviewItem[] }

type ReviewGroupId = 'mine' | ReviewStandingGroup;
const REVIEW_GROUPS: Array<{ id: ReviewGroupId; title: string }> = [
  { id: 'mine', title: 'Waiting on you' },
  { id: 'in-review', title: 'In review' },
  { id: 'changes', title: 'Changes requested' },
  { id: 'declined', title: 'Declined' },
  { id: 'sign-off', title: 'Reviewers approved, awaiting sign-off' },
  { id: 'approved', title: 'Approved' },
];

/** What the document needs from the person first; otherwise where it stands. */
function reviewGroupOf(r: ReviewItem): ReviewGroupId {
  if (r.awaitingMyReview || r.atMySignOff) return 'mine';
  return reviewStanding(r).group;
}

/** Still out for review: waiting on the person, in review, or reviewers
 *  approved and sign-off pending. The header line counts these (F9), by the
 *  same grouping the Review tab shows, so the two cannot disagree. */
const OUT_FOR_REVIEW: ReadonlySet<ReviewGroupId> = new Set<ReviewGroupId>(['mine', 'in-review', 'sign-off']);
const isOutForReview = (r: ReviewItem): boolean => OUT_FOR_REVIEW.has(reviewGroupOf(r));

function reviewOwnership(r: ReviewItem): string | null {
  if (r.awaitingMyReview) return 'Awaiting your review';
  if (r.atMySignOff) return 'At your sign-off';
  if (r.requestedByMe) return 'Requested by you';
  return null;
}

function ProjectReviewRow({ item, onOpen }: { item: ReviewItem; onOpen: (item: ReviewItem) => void }) {
  const who = [item.reviewer, item.role].filter(Boolean).join(' · ');
  const ownership = reviewOwnership(item);
  const standing = reviewStanding(item);
  return (
    <li className="cdl-row" data-doc-id={item.id} data-testid="pj-review-row">
      <div className="cdl-row-main">
        <span className="cdl-row-t">{item.doc}</span>
        <span className="cdl-row-meta">
          <span className="cdl-pill" data-status={standing.tone}>{standing.words}</span>
          {ownership && <span>{ownership}</span>}
          {who && <span>{who}</span>}
          {item.comments > 0 && <span>{item.comments === 1 ? '1 open comment' : `${item.comments} open comments`}</span>}
        </span>
      </div>
      <div className="cdl-row-actions">
        <button type="button" className="btn primary" onClick={() => onOpen(item)} aria-label={`Open document: ${item.doc}`}>
          {I.penLine} Open document
        </button>
      </div>
    </li>
  );
}

function ProjectReviewsBody({ state, onRetry, onOpen }: {
  state: DataState<ProjectReviewBoard>; onRetry: () => void; onOpen: (item: ReviewItem) => void;
}) {
  if (state.loading) return <div role="status" aria-busy="true" className="cdl-note">Reading this project’s reviews…</div>;
  if (state.error || !state.data) {
    return (
      <ErrorState
        title="Couldn’t read this project’s reviews"
        message={`${state.error ?? 'The review board could not be read.'} This is a failed read, not an empty list.`}
        retry={onRetry}
        testId="pj-reviews-error"
      />
    );
  }
  const queue = state.data.queue ?? [];
  if (queue.length === 0) {
    return (
      <p className="cdl-empty" data-testid="pj-reviews-empty">
        Nothing in this project is out for review. Send a document for review from the editor, and it is listed here.
      </p>
    );
  }
  return (
    <>
      {REVIEW_GROUPS.map((g) => {
        const rows = queue.filter((r) => reviewGroupOf(r) === g.id);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="pj-rv-group">
            <h3 className="pj-rv-h">{g.title} <span className="pj-rv-n">{rows.length}</span></h3>
            <ul className="cdl-list" aria-label={g.title}>
              {rows.map((r) => <ProjectReviewRow key={r.id} item={r} onOpen={onOpen} />)}
            </ul>
          </div>
        );
      })}
      {queue.length >= PROJECT_REVIEWS_LIMIT && (
        <p className="cdl-note">This list stops at {PROJECT_REVIEWS_LIMIT} documents, so there may be more.</p>
      )}
    </>
  );
}

/** The board is read once, by ProjectHome (useProjectReviews), and shared
 *  with the header line, which counts the documents in review (F9). */
function useProjectReviews(pid: string | null): { state: DataState<ProjectReviewBoard>; retry: () => void } {
  const [epoch, setEpoch] = useState(0);
  const url = pid ? projectReviewsUrl(pid) : null;
  const state = useLiveData<ProjectReviewBoard>(url, [url, epoch], hasKeys<ProjectReviewBoard>('queue'));
  return { state, retry: () => setEpoch((e) => e + 1) };
}

function ProjectReviews({ state, onRetry, onNav, available }: {
  state: DataState<ProjectReviewBoard>; onRetry: () => void; onNav: (id: string) => void; available: (id: string) => boolean;
}) {
  const openDocument = (item: ReviewItem) => openReviewDocument(item, onNav);
  return (
    <section className="pj-sec" aria-labelledby="pj-reviews-h">
      <div className="pj-sec-h">
        <h2 id="pj-reviews-h">Reviews</h2>
        <span className="sec-sub">documents in this project sent for review</span>
        {/* The full board, which starts on the open program (Review.tsx,
            onlyProgram). Not offered when it is not in this release. */}
        {available('review') && (
          <span className="pj-sec-acts">
            <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('review')}>
              Open the review board {I.right}
            </button>
          </span>
        )}
      </div>
      <ProjectReviewsBody state={state} onRetry={onRetry} onOpen={openDocument} />
    </section>
  );
}

/* ════ Inline conversation composer ════
   An ENTRY POINT to the one conversation, not a conversation of its own.

   It used to be both, and that was the defect. `send()` appended a local echo
   of what you typed plus a canned assistant line — "Open the full thread and
   I'll work that against this project's governed dossier" — written in AnA's
   voice, under a header reading "AnA · co-author", beside the shell's real AnA
   rail (`project-home` is registered without `ownsConversation`, so the shell
   draws its rail here and both composers are on screen at once). Two composers,
   and the one you are looking at answers you with a string literal. The file's
   own comment called it a "mock ACTION … flagged for the actions pass" and it
   shipped anyway.

   Nothing here answers now. Typing and pressing ⏎ does exactly what the "Open
   full thread" button does: seeds `window.C2C_CONVO` and navigates, so the
   question is answered by the real streaming assistant in the surface built to
   show it. The one remaining message is the standing intro — framing, not a
   reply, and it says nothing about what has been done. */

function StartConversation({ productName, onNav }: { productName: string; onNav: (id: string) => void }) {
  const [draft, setDraft] = useState('');

  /* docs/design/ONE_ANA_ONE_CANVAS.md §2.3: a project's page starts a
     conversation in the project, as Claude's project page does. It is not a
     conversation of its own. It drew one: a header "AnA · co-author", an
     "Open full thread" link and a message in AnA's voice that no model wrote,
     a second place on the page that looked like talking to AnA. Now it says
     what it does, and a question typed here starts a new conversation in
     this project, where AnA answers it. */
  const start = () => {
    const text = draft.trim();
    if (!text) return;
    window.C2C_CONVO = { id: 'new', seed: text };
    onNav('conversation-thread');
  };

  return (
    <section className="pj-convo" aria-labelledby="pj-start-h">
      <div className="pj-start-h">
        <h2 id="pj-start-h">Start a conversation in {productName}</h2>
        <span className="sec-sub">AnA works with this project&apos;s sources, documents and submissions.</span>
      </div>
      <div className="pj-composer">
        <textarea
          rows={2}
          aria-labelledby="pj-start-h"
          placeholder={'Ask AnA to draft, reconcile or review…'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); } }}
        />
        <div className="pj-composer-row">
          <span className="sp" />
          <button className="pj-comp-send" aria-label="Start the conversation" disabled={!draft.trim()} onClick={start}>{I.arrowUp}</button>
        </div>
      </div>
    </section>
  );
}

/* ════ Author workspace — real anchored slices + honest empties ════ */

/* ════ Conversations held on this project ═══════════════════════════════════
   The program's own AnA threads. Threads carry the program they were started
   in (chat_threads.program_id, bound when the stream mints the thread, only to
   a program of its organization), so this lists exactly the conversations
   held on this project, newest first, and opens one back into the thread
   surface. It sits above the tabs with the start box (FILING_SPINE.md §2,
   "Before the tabs"): a conversation belongs to the project, not to one stage
   of it. A screenful at a time, with every older one reachable
   (projectThreads.ts; QA 2026-10-08, j5: the newest 8 were all a project
   with more could open). */
function ProjectConversations({ pid, onNav }: { pid: string; onNav: (id: string) => void }) {
  const threads = useProjectThreads(pid);
  const resumeThread = (id: string) => {
    window.C2C_CONVO = { id };
    onNav('conversation-thread');
  };
  return (
    <section className="pj-sec" aria-labelledby="pj-threads-h">
      <div className="pj-sec-h"><h2 id="pj-threads-h">Conversations</h2><span className="sec-sub">yours on this project, to resume</span></div>
      <Anchored
        state={threads.state}
        loadingText="Loading conversations…"
        errorTitle="Couldn't load conversations"
        errorHint="The conversation store didn't respond. Sign in and retry, or check that the service is reachable."
        /* The server lists the caller's own conversations only, so the empty
           says whose list it is. */
        emptyTitle="You have no conversations on this project yet."
        emptyHint="Start one in the box above; it is kept on this project and listed here."
        compactEmpty
        isEmpty={(d) => (d.threads ?? []).length === 0}
        render={() => (
          <>
            <div className="pj-files" data-testid="pj-threads">
              {threads.shown.map((t) => (
                <button key={t.id} className="pj-file" style={{ width: '100%', textAlign: 'left' }} onClick={() => resumeThread(t.id)} title="Resume this conversation">
                  <div className="pj-file-n">{(t.title || 'Untitled conversation').slice(0, 120)}</div>
                  <div className="pj-file-m">{[fmtWhen(t.updated_at || t.created_at), 'Resume'].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
            {threads.olderError && (
              <div className="sp-tone-warn" role="status" style={{ fontSize: 12, marginTop: 6 }}>{threads.olderError}</div>
            )}
            {threads.hasOlder && (
              <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px', marginTop: 8 }} disabled={threads.loadingOlder} onClick={threads.showOlder}>
                {threads.loadingOlder ? 'Loading older conversations…' : 'Show older conversations'}
              </button>
            )}
          </>
        )}
      />
    </section>
  );
}

/* ════ My work on this project ═════════════════════════════════════════════
   ONE_ANA_ONE_CANVAS.md slice 24. The program's tasks and approvals are
   listed just above it (ProjectWorkPanel, read by the program UUID through
   the server's anchor). My work, the signed-in person's own queue, is not
   filtered to this project yet; this says so in one line and links to it.
   This section said "Tasks & submission readiness aren't wired"; the dispatch
   readiness is on the Submit stage now.

   "Open My work" opens what the nav's My work opens: the task board on the
   signed-in person's own tasks, asked of the board through the same validated
   action bus (tasking.filter, mine), not the board on everyone's. */
function MyWorkLine({ onNav, available }: { onNav: (id: string) => void; available: (id: string) => boolean }) {
  const openMyWork = () => {
    const res = resolveSurfaceAction('tasking.filter', { mine: 'true' });
    if (res.ok) applySurfaceAction(res.directive, () => onNav('tasks'));
    else onNav('tasks');
  };
  return (
    <section className="pj-sec" aria-labelledby="pj-mywork-h">
      <div className="pj-sec-h">
        <h2 id="pj-mywork-h">My work</h2>
        {available('tasks') && (
          <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={openMyWork}>
            Open My work {I.right}
          </button>
        )}
      </div>
      <p className="pj-desc">Your work is not filtered to this project yet. My work lists it for every project.</p>
    </section>
  );
}

/* ════ Author: the project's documents ═══════════════════════════════════════
   FILING_SPINE.md F3. Every document of this project in the authoring store,
   GET /api/authoring/docs?programId=<uuid>, read and shown with the canvas
   list's own pieces (editor/CanvasDocumentList.tsx: useDocumentList, rowsOf,
   StatusPill, updatedWords). It replaces two things:
     · "Recent drafts", which listed governed sections filtered on a status
       that editor work never moves (projects.ts /drafts, status != 'todo')
       and opened the editor without the draft;
     · the "Every capability, scoped to this project" Workspace grid, which
       launched organisation-level apps from inside the project.
   A row opens THAT document: the editor target names it by id and program,
   and the editor opens it or says why it could not. A failed read is an error
   with a retry, never an empty list. */

/** Every document of the project in the authoring store, whoever built it. */
function projectDocumentsUrl(pid: string | null): string | null {
  return pid ? `/api/authoring/docs?programId=${encodeURIComponent(pid)}` : null;
}

/** `M2`, `m2` or `2` → 2: the CTD module a document or a section rollup names.
 *  Anything else (a 510(k) letter, a CSR section number) names no module. */
function ctdModule(v: string | null | undefined): number | null {
  const m = /^m?([1-5])$/i.exec(String(v ?? '').trim());
  return m ? Number(m[1]) : null;
}

/* ProjectDocumentRow and ProjectDocumentsBody restate CanvasDocumentList's
   private DocumentRow and ListBody (editor/CanvasDocumentList.tsx), without
   its per-row "Download working copy" and its return-focus to Open. That is
   a second copy of one list. The fix is in that file, which this slice does
   not own: export a scope-agnostic row and body (empty sentence, download and
   focus as options) and render them here; then these two are deleted. */
function ProjectDocumentRow({ doc, onOpen }: { doc: BuiltDocument; onOpen: (doc: BuiltDocument) => void }) {
  const n = ctdModule(doc.module);
  const module = n ? `Module ${n}` : doc.module;
  return (
    <li className="cdl-row" data-doc-id={doc.id} data-testid="pj-doc-row">
      <div className="cdl-row-main">
        <span className="cdl-row-t">{doc.title}</span>
        <span className="cdl-row-meta">
          <StatusPill status={doc.status} />
          {module && <span>{module}</span>}
          <span>Updated <time dateTime={doc.updatedAt ?? undefined}>{updatedWords(doc.updatedAt)}</time></span>
          {doc.source === 'ana' && <span>Built by AnA</span>}
        </span>
      </div>
      <div className="cdl-row-actions">
        <button type="button" className="btn primary" onClick={() => onOpen(doc)} aria-label={`Open ${doc.title}`}>
          {I.penLine} Open
        </button>
      </div>
    </li>
  );
}

function ProjectDocumentsBody({ read, onRetry, onOpen }: {
  read: ListRead; onRetry: () => void; onOpen: (doc: BuiltDocument) => void;
}) {
  const rows = rowsOf(read);
  if (read.state === 'error' && !rows) {
    return (
      <ErrorState
        title="Couldn’t list this project’s documents"
        message={`${read.message} This is a failed read, not an empty list.`}
        retry={onRetry}
        testId="pj-docs-error"
      />
    );
  }
  if (!rows) return <div role="status" aria-busy="true" className="cdl-note">Reading this project’s documents…</div>;
  if (rows.length === 0) {
    return <p className="cdl-empty" data-testid="pj-docs-empty">No documents in this project yet. Ask AnA in the box above to draft one.</p>;
  }
  return (
    <>
      {read.state === 'error' && (
        <div className="cdl-note" role="status" data-tone="err">
          Couldn’t refresh the list. This is the list read earlier.{' '}
          <button type="button" className="btn ghost" onClick={onRetry}>Retry</button>
        </div>
      )}
      <ul className="cdl-list" aria-label="This project’s documents" data-testid="pj-documents">
        {rows.map((doc) => <ProjectDocumentRow key={doc.id} doc={doc} onOpen={onOpen} />)}
      </ul>
    </>
  );
}

function ProjectDocuments({ read, onRetry, onOpen, onNav, available }: {
  read: ListRead; onRetry: () => void; onOpen: (doc: BuiltDocument) => void;
  onNav: (id: string) => void; available: (id: string) => boolean;
}) {
  /* The editor's own view, with no document named: any pending target is
     dropped so an older one cannot ride along (editorTarget.ts). */
  const openAuthoring = () => {
    clearEditorTarget();
    onNav('document-authoring');
  };
  return (
    <section className="pj-sec" aria-labelledby="pj-docs-h">
      <div className="pj-sec-h">
        <h2 id="pj-docs-h">Documents</h2>
        <span className="pj-sec-acts">
          {/* Protocols have no program key (protocol_documents, PF-14), so
              the door says they are the organisation's, not this project's. */}
          {available('protocol-dev') && (
            <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('protocol-dev')}>
              Protocols (organisation-wide) {I.right}
            </button>
          )}
          {available('document-authoring') && (
            <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={openAuthoring}>
              Open in Authoring {I.right}
            </button>
          )}
        </span>
      </div>
      <ProjectDocumentsBody read={read} onRetry={onRetry} onOpen={onOpen} />
    </section>
  );
}

/** One CTD module's section rollup, and the project's newest document in
 *  that module, which the row opens by id. The rollup counts governed
 *  sections (c2c_document_sections) and the document is an authoring
 *  document: two stores, so the figure is named as the module's sections and
 *  the document is named in words under it, never as the figure's owner.
 *  When the module holds several documents the row says how many and which
 *  one it opens. A module with no document of this project, or a list that
 *  could not be read, is a row with nothing to click: it opened the editor's
 *  list, which is not the module (FILING_SPINE.md §6 row 4). */
function ModuleRow({ w, match, onOpen }: {
  w: WorkstreamRow; match: { doc: BuiltDocument; count: number; n: number } | null; onOpen: (doc: BuiltDocument) => void;
}) {
  const done = Number(w.completion_pct ?? 0);
  const total = Number(w.total);
  const name = String(w.module ?? '—').toUpperCase();
  const sections = total ? `${total} section${total === 1 ? '' : 's'}` : '';
  const label = `${name}${sections ? ` · ${sections}` : ''}`;
  const body = (
    <>
      <span className="pj-lmod-t">{label}</span>
      <span className="pj-lmod-track"><span className="pj-lmod-fill" data-risk={done < 50 || undefined} style={{ width: done + '%' }} /></span>
      <span className="pj-lmod-pct">{done}%</span>
    </>
  );
  if (!match) return <div className="pj-lmod" data-none data-risk={done < 50 || undefined}>{body}</div>;
  const { doc, count, n } = match;
  const which = count > 1 ? `, the newest of ${count} Module ${n} documents` : '';
  return (
    <div className="pj-lmodrow">
      <button type="button" className="pj-lmod" data-risk={done < 50 || undefined} onClick={() => onOpen(doc)}
        aria-label={`${name} sections${sections ? ` (${sections})` : ''}: ${done}% complete. Open ${doc.title}${which}`}>
        {body}
      </button>
      <span className="pj-lmod-doc" data-testid="pj-lmod-doc">Opens {doc.title}{which}</span>
    </div>
  );
}

function AuthorWorkspace({
  pid, completion, onNav, teamState, activityState, wsState, docs, onRetryDocs, onOpenDoc,
}: {
  /** regulatory_programs UUID — scopes the records to this project. */
  pid: string | null;
  /** Dossier readiness percent from the program row, or null when unknown. */
  completion: number | null;
  onNav: (id: string) => void;
  teamState: DataState<{ team: TeamRow[] }>;
  activityState: DataState<{ activity: ActivityRow[] }>;
  wsState: DataState<{ workstreams: WorkstreamRow[] }>;
  /** GET /api/authoring/docs?programId= — the project's documents. */
  docs: ListRead;
  onRetryDocs: () => void;
  onOpenDoc: (doc: BuiltDocument) => void;
}) {
  const available = useSurfaceAvailable();
  const docRows = rowsOf(docs) ?? [];
  /* The newest document of this project in a CTD module (the list is newest
     first), and how many the module holds. */
  const docForModule = (module: string | null): { doc: BuiltDocument; count: number; n: number } | null => {
    const n = ctdModule(module);
    if (n == null) return null;
    const inModule = docRows.filter((d) => ctdModule(d.module) === n);
    return inModule.length ? { doc: inModule[0], count: inModule.length, n } : null;
  };
  return (
    <div className="pj-grid">
      <div className="pj-main">
        <ProjectDocuments read={docs} onRetry={onRetryDocs} onOpen={onOpenDoc} onNav={onNav} available={available} />

        {/* Module completion — REAL: per-CTD-module section rollup */}
        <section className="pj-sec">
          <div className="pj-sec-h"><h2>Module completion</h2><span className="sec-sub">section status by CTD module</span></div>
          <Anchored
            state={wsState}
            loadingText="Loading module completion…"
            errorTitle="Couldn't load module completion"
            errorHint="The project workstream rollup didn't respond. Sign in and retry, or check the service is reachable."
            emptyTitle="No document sections yet"
            emptyHint="Once this project has governed document sections, per-module completion appears here."
            isEmpty={(d) => (d.workstreams ?? []).length === 0}
            render={(d) => (
              <div className="pj-mods">
                {(d.workstreams ?? []).map((w, i) => <ModuleRow key={`${w.module ?? ''}-${i}`} w={w} match={docForModule(w.module)} onOpen={onOpenDoc} />)}
              </div>
            )}
          />
        </section>

        {/* Tasks — the program's outstanding work, the same panel the Review
            stage shows (one read, one component). It said "aren't wired" for
            every program until the work view took the program's UUID. */}
        <ProjectWorkPanel pid={pid} title="Tasks" onNav={onNav} />

        <MyWorkLine onNav={onNav} available={available} />

        {/* Records in this project — REAL: GET /:id/records, every store read
            by its project key (PF-17). A store it cannot read says so. */}
        {pid && (
          <section className="pj-sec" aria-label="Records in this project">
            <div className="pj-sec-h"><h2>Records in this project</h2></div>
            <ProjectRecords pid={pid} />
          </section>
        )}

        {/* Team & activity — REAL: project_members + audit_logs */}
        <section className="pj-sec">
          <div className="pj-sec-h"><h2>Team &amp; activity</h2></div>
          <Anchored
            state={teamState}
            loadingText="Loading team…"
            errorTitle="Couldn't load the project team"
            errorHint="The project members read didn't respond. Sign in and retry, or check the service is reachable."
            emptyTitle="No project members yet"
            emptyHint="Members added to this project (with their role) appear here."
            isEmpty={(d) => (d.team ?? []).length === 0}
            render={(d) => (
              <div className="pj-team">
                {(d.team ?? []).map((g, i) => {
                  const nm = g.name || g.email || 'Member';
                  return (
                    <span key={i} className="pj-team-m"><span className="pj-team-av">{pjInitials(nm)}</span>{nm}{g.role && <span className="rd-chip tone-idle">{g.role}</span>}</span>
                  );
                })}
              </div>
            )}
          />
          <div style={{ marginTop: 12 }}>
            <Anchored
              state={activityState}
              loadingText="Loading activity…"
              errorTitle="Couldn't load project activity"
              errorHint="The project audit read didn't respond. Sign in and retry, or check the service is reachable."
              emptyTitle="No recorded activity yet"
              emptyHint="Audited actions on this project appear here as they happen."
              isEmpty={(d) => (d.activity ?? []).length === 0}
              render={(d) => (
                <div className="pj-acts">
                  {(d.activity ?? []).map((a, i) => (
                    <div key={i} className="pj-act">
                      <span className="pj-act-w">{a.actor_name ?? (a.actor_id != null ? 'User ' + a.actor_id : 'System')}</span>
                      <span className="pj-act-t">{String(a.action ?? '').replace(/_/g, ' ')}{a.resource_type ? ' · ' + a.resource_type : ''}</span>
                      <span className="pj-act-n">{fmtWhen(a.occurred_at) ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>
        </section>
      </div>

      <aside className="pj-side">
        {/* Dossier readiness — a status figure, so it lives with the other
            status cards in the aside rather than between the conversation and
            the work (the constitution's no-KPI-hero rule for project landing).
            Always present, under the name the Projects card uses: the one
            readiness the server computes for a program, or "not measured". It
            used to be left out when unmeasured, so the page said nothing while
            the card said "not measured" (QA 2026-10-08, j1). No ring is drawn
            for no figure — an empty ring reads as 0%. */}
        <section className="pj-card">
          <div className="pj-card-h">
            <h3>{DOSSIER_READINESS_LABEL}</h3>
            <span className="sec-sub">{dossierReadinessValue(completion)}</span>
          </div>
          {completion != null ? (
            <div className="pj-map" title={DOSSIER_READINESS_MEANS}>
              <div className="pj-map-ring"><Ring value={completion} size={104} stroke={9} /><div className="pj-map-ring-l">Dossier<br />readiness</div></div>
            </div>
          ) : (
            <p className="pj-card-note">
              {DOSSIER_READINESS_MEANS} There are no governed sections to measure on this program yet, or the
              figure could not be read.
            </p>
          )}
        </section>
        {/* Memory / instructions / intelligence — served only by the numeric
            project-home read-model (project_intelligence_profiles), not reachable
            from this UUID-scoped surface. Honest empty, never a fabricated body. */}
        <section className="pj-card">
          <div className="pj-card-h"><h3>Memory</h3></div>
          <EmptyState
            icon={I.penLine}
            title="No project memory yet"
            hint="AnA's persisted regulatory-strategy memory, open blockers, and decisions-on-record for this project will appear here once enriched."
          />
        </section>

        <section className="pj-card">
          <div className="pj-card-h"><h3>Instructions</h3></div>
          <EmptyState
            icon={I.penLine}
            title="No custom instructions yet"
            hint="Authoring instructions saved on this project's intelligence profile will appear here."
          />
        </section>

      </aside>
    </div>
  );
}

/* ════ ProjectHome — the full workspace surface ════ */

export function ProjectHome({ onNav, onAsk }: SurfaceViewProps) {
  // Other v2 surfaces treat onAsk as optional; keep that contract so ProjectHome
  // renders standalone (and in tests) without a host wired up.
  const ask = onAsk || (() => {});
  const available = useSurfaceAvailable();
  const sel = window.C2C_PROJECT ?? null;

  // Selected-project identity handed off from the Projects surface. Its `id` is
  // the C2C regulatory_programs UUID, which keys the /api/c2c/projects/:id
  // read-models. 'new' (wizard transient) has no persisted record → no fetch.
  //
  // The `typeof === 'string'` test is the id-SPACE guard this file's header
  // asks for, and it only became expressible once the global stopped being
  // declared here as `Record<string, string>` and started carrying its owner's
  // real `ShellProject` type — whose `id` is `string | number`.
  //
  // A NUMBER here is a `projects.id`, not a `regulatory_programs` UUID: a
  // different id-space, and one this surface's read-models are not keyed on.
  // Coercing it with `String(...)` would compile and then fetch
  // /api/c2c/projects/42 — a well-formed request for a DIFFERENT project in the
  // same organization, returning a real, plausible, wrong program with no error
  // anywhere. That is the mirror of the hazard the header already warns about
  // ("parseInt of a UUID would load a different project in the same org"), and
  // it is why this resolves to null instead: no project is a state the surface
  // renders honestly, whereas the wrong project is not.
  const pid = typeof sel?.id === 'string' && sel.id !== 'new' ? sel.id : null;

  // REAL, org-scoped, UUID-keyed reads (server/routes/c2c/projects.ts).
  const progState = useLiveData<ProgramRow>(pid ? `/api/c2c/projects/${pid}` : null);
  const teamState = useLiveData<{ team: TeamRow[] }>(pid ? `/api/c2c/projects/${pid}/team` : null);
  const activityState = useLiveData<{ activity: ActivityRow[] }>(pid ? `/api/c2c/projects/${pid}/activity` : null);
  const wsState = useLiveData<{ workstreams: WorkstreamRow[] }>(pid ? `/api/c2c/projects/${pid}/workstreams` : null);
  /* The project's documents (FILING_SPINE.md F3), read once for the Author
     list, its module rows and what AnA is told. */
  const { read: docsRead, reload: reloadDocs } = useDocumentList(projectDocumentsUrl(pid));
  /* The project's markets and its review board, each read once and shared by
     the header line and the Submit and Review tabs (FILING_SPINE.md F9). */
  const markets = useProgramMarkets(pid);
  const reviews = useProjectReviews(pid);

  const [stage, setStage] = useState('author');

  const prog = progState.data;

  // Header identity: sel is the live selection handoff; prog enriches it with
  // real regulatory_programs columns. Every value is null-safe — a chip is only
  // rendered when its column is present (never fabricated).
  // No placeholder name. This fell back to the word 'Project', which the
  // header then rendered as the project's name — "PROJECT Project" above an
  // H1 "Project" — with no project selected at all.
  const title = sel?.title || prog?.name || null;
  /* A document row opens THAT document: the editor target carries its id and
     this program, so the editor opens it or states why it could not. */
  const openDocument = (doc: BuiltDocument) => {
    setEditorTarget({ docType: null, docId: doc.id, programId: pid, programTitle: title });
    onNav('document-authoring');
  };
  const productName = sel?.product || prog?.product_name || (title ? title.split(' ')[0] : 'this project');
  const desc = prog?.description ?? null;
  const clientType = sel?.ws ?? null;
  const submissionType = sel?.code || prog?.code || prog?.program_type || null;
  const region = prog?.primary_agency ?? null;
  const indication = prog?.indication ?? null;
  // Program identity facts (WO-9 Click 1). Read from the row only — never from
  // the navigation handoff, never derived from the title — so what the screen
  // says is what the database holds. Absence is stated, never filled in.
  const sponsorName = prog?.sponsor_name ?? null;
  const applicationNumber = prog?.application_number ?? null;
  const applicationNumberLabel = (() => {
    const t = (prog?.program_type ?? '').toUpperCase();
    return t === 'IND' ? 'IND number' : t === 'NDA' ? 'NDA number' : t === 'BLA' ? 'BLA number' : t === 'MAA' ? 'MAA number' : 'Application number';
  })();
  const status = sel?.status || prog?.status || null;
  const priority = prog?.priority ?? null;
  const phase = prog?.phase ?? null;
  const completion = typeof prog?.readiness === 'number' ? prog.readiness : null;
  /* The device taxonomy, read from the row only. A device / IVD program shows
     its class, path, product code, regulation, panel, predicate and flags —
     each field stated as absent when the row lacks it; a drug program shows
     the drug facts and no device block. */
  const deviceProgram = isDeviceProgram(prog?.product_type);
  /* A device or diagnostic filing: the program's product type, or a
     selection made from the MDX workspace (the old Workspace grid's medtech
     segment). Only a project that is read and is neither is an eCTD filing. */
  const deviceFiling = deviceProgram || clientType === 'MDX';
  const ectdFiling = !!prog && !deviceFiling;
  const predicateKs = (prog?.predicate_devices ?? [])
    .map((p) => String(p?.kNumber ?? '').trim())
    .filter(Boolean);
  const deviceFlags = prog?.device_flags ?? null;

  /* Tell the shell what this program IS, so its segment label can follow the
     program's product type rather than the stored preference. A no-op when
     nothing changes, so it may run on every load of the read model. */
  useEffect(() => {
    const productType = prog?.product_type;
    if (pid && productType) updateShellProject({ productType });
  }, [pid, prog?.product_type]);


  const noProject = !pid;

  /* What AnA can see of this screen.
     Project home is where "what should I do next?" is most likely to be asked
     and least answerable from a screen name — the whole page is one programme's
     state. Five reads back it, each able to fail alone, so each publishes its
     own state rather than one merged verdict.

     NO PROJECT SELECTED is published as itself. Every panel below is empty in
     that case, and reporting that as "this programme has no team, no drafts and
     no activity" would describe a customer's programme from a missing handoff. */
  const anaContext = useMemo(() => {
    if (noProject) {
      return {
        summary:
          'Project home has no project selected, so none of the panels on screen are populated. This is a ' +
          'missing selection, not an empty programme.',
        availableActions: ['Open a project from All projects to load its governed workspace'],
      };
    }
    if (progState.error) {
      return {
        summary:
          'This project record could not be read, so the workspace below is empty because of a failure, ' +
          'not because the programme has nothing in it.',
        facts: { projectId: pid, stage },
        availableActions: ['Return to All projects and try again'],
      };
    }
    if (progState.loading) {
      return { summary: 'The project record is still loading; nothing on screen is final yet.', facts: { projectId: pid, stage } };
    }
    const team = teamState.data?.team;
    const activity = activityState.data?.activity;
    const workstreams = wsState.data?.workstreams;
    const documents = rowsOf(docsRead);
    return {
      summary:
        `Project home for ${title ? `"${title}"` : 'an untitled project'}${submissionType ? ` (${submissionType})` : ''}: ` +
        [status && `status ${status}`, phase && `phase ${phase}`, priority && `priority ${priority}`,
         region && `primary agency ${region}`, indication && `indication ${indication}`,
         `${DOSSIER_READINESS_LABEL.toLowerCase()} ${dossierReadinessValue(completion)}`].filter(Boolean).join(', ') +
        `. The "${stage}" stage is open.`,
      facts: {
        projectId: pid,
        openStage: stage,
        program: {
          title, product: productName, code: submissionType, description: desc,
          clientType, primaryAgency: region, indication, status, priority, phase,
          progressPercent: completion,
          targetSubmissionDate: prog?.target_submission_date ?? null,
        },
        team: teamState.loading || teamState.error || !Array.isArray(team)
          ? null
          : team.slice(0, 12).map((t) => ({ name: t.name, role: t.role })),
        teamUnavailable: teamState.error ? 'the team read failed' : null,
        workstreams: wsState.loading || wsState.error || !Array.isArray(workstreams)
          ? null
          : workstreams.map((w) => ({
              module: w.module, total: w.total, todo: w.todo,
              completionPercent: w.completion_pct, lastUpdated: w.last_updated,
            })),
        workstreamsUnavailable: wsState.error ? 'the workstream rollup read failed' : null,
        documents: documents
          ? documents.slice(0, 10).map((d) => ({
              id: d.id, title: d.title, status: d.status, module: d.module, updated: d.updatedAt,
            }))
          : null,
        documentsUnavailable: docsRead.state === 'error' && !documents ? 'the documents read failed' : null,
        recentActivity: activityState.loading || activityState.error || !Array.isArray(activity)
          ? null
          : activity.slice(0, 10).map((a) => ({
              action: a.action, resourceType: a.resource_type, occurredAt: a.occurred_at,
            })),
        activityUnavailable: activityState.error ? 'the activity read failed' : null,
      },
      availableActions: [
        'Move through the programme lifecycle stages',
        'Open one of this project’s documents in the editor',
        'Open this project’s documents in the Vault surface, or its filings in the Submission Center',
        'Read the per-module completion rollup and the recent audited activity',
      ],
    };
  }, [noProject, pid, stage, progState.loading, progState.error, prog, title, productName, desc, clientType,
      submissionType, region, indication, status, priority, phase, completion,
      teamState.loading, teamState.error, teamState.data,
      activityState.loading, activityState.error, activityState.data,
      wsState.loading, wsState.error, wsState.data,
      docsRead]);
  usePublishSurfaceContext('project-home', anaContext);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     project-home.*, identity-resolved). The one action drives the SAME state
     the StageTracker's own buttons drive (setStage). Stage is pure view state:
     it selects which panels render over whatever the five reads deliver, so —
     same reasoning as vault.search — applying it mid-load is correct, not
     early, and there is no loading refusal and no retry.

     The start box sits above the tabs, outside the stage switch (FILING_SPINE.md
     F2), so switching stage no longer unmounts a half-typed message. 'plan' and
     'lifecycle' name tabs that were removed; they still resolve, to the tab
     that holds their work (its `aliases` in PJ_LIFECYCLE), and the answer
     says so. */
  useSurfaceActionHandlers('project-home', {
    'project-home.set-stage': (params) => {
      if (noProject)
        return { ok: false, reason: 'No project is selected — open one from All projects.' };
      const asked = (params.stage ?? '').trim();
      const meta = PJ_LIFECYCLE.find((s) => s.id === asked || s.aliases?.includes(asked));
      if (!meta) return { ok: false, reason: `No lifecycle stage named "${params.stage}".` };
      setStage(meta.id);
      return {
        ok: true,
        detail: meta.id === asked
          ? `Opened the ${meta.id} stage`
          : `Opened the ${meta.id} stage: "${asked}" has no tab of its own; its work is on ${meta.label}`,
      };
    },
  });
  /* Ready signal — harmless even though set-stage never answers retry: a
     directive stashed across the navigate→mount gap is re-attempted by the
     registration itself, and this keeps the surface on the uniform contract. */
  useEffect(() => {
    if (!progState.loading) notifySurfaceActionReady('project-home');
  }, [progState.loading]);

  return (
    <div className="page-inner pj">
      <button className="pj-back" onClick={() => onNav('projects')}>{I.left} All projects</button>

      {title && (
        <div className="pj-crumb">
          <span className="pj-crumb-i" data-cur><span className="pj-crumb-k">Project</span>{title}</span>
        </div>
      )}

      <div className="pj-top">
        <div className="pj-top-l">
          {/* The surface's own name when there is no project name to show —
              a label for the screen, not a name posing as a project's. */}
          <h1 className="pj-title">{title ?? 'Project home'}</h1>
          {progState.loading && <div role="status" className="pj-desc" style={{ color: 'var(--text-400)' }}>Loading project…</div>}
          {desc && <div className="pj-desc">{desc}</div>}
          <div className="pj-tags">
            {clientType && <span className="rd-chip tone-ai">{clientType}</span>}
            {submissionType && <span className="rd-chip tone-idle">{submissionType}</span>}
            {region && <span className="rd-chip tone-idle">{region}</span>}
            {indication && <span className="rd-chip tone-idle">{indication}</span>}
            {status && <span className={`rd-chip ${PROGRAM_STATUS_TONE[status] ?? 'tone-idle'}`}>{status}</span>}
            {priority && <span className={`rd-chip ${PRIORITY_TONE[priority] ?? 'tone-idle'}`}>priority: {priority}</span>}
            {phase && <span className="rd-chip tone-idle">{phase}</span>}
          </div>
          {prog && (
            <section className="pj-facts" aria-label="Program identity">
              <dl className="pj-fact"><dt>Sponsor</dt><dd>{sponsorName ?? <span className="pj-fact-none">not recorded</span>}</dd></dl>
              <dl className="pj-fact"><dt>Product</dt><dd>{prog.product_name ?? <span className="pj-fact-none">not recorded</span>}</dd></dl>
              <dl className="pj-fact"><dt>Indication</dt><dd>{indication ?? <span className="pj-fact-none">not recorded</span>}</dd></dl>
              {deviceProgram ? (
                <>
                  <dl className="pj-fact"><dt>Device class</dt><dd>{prog.device_class ? `Class ${prog.device_class}` : <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Regulatory path</dt><dd>{prog.regulatory_path ? (REGULATORY_PATH_LABEL[prog.regulatory_path] ?? prog.regulatory_path) : <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Product code</dt><dd>{prog.product_code ?? <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Regulation</dt><dd>{prog.regulation_number ? `21 CFR ${prog.regulation_number}` : <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Review panel</dt><dd>{prog.review_panel ?? <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Predicate</dt><dd>{predicateKs.length ? predicateKs.join(', ') : <span className="pj-fact-none">not recorded</span>}</dd></dl>
                  <dl className="pj-fact"><dt>Device flags</dt><dd>{
                    deviceFlags == null
                      ? <span className="pj-fact-none">not recorded</span>
                      : deviceFlags.length === 0
                        ? <span className="pj-fact-none">none declared</span>
                        : deviceFlags.map((f) => DEVICE_FLAG_LABEL[f] ?? f).join(' · ')
                  }</dd></dl>
                </>
              ) : (
                <dl className="pj-fact"><dt>{applicationNumberLabel}</dt><dd>{applicationNumber ?? <span className="pj-fact-none">not assigned</span>}</dd></dl>
              )}
            </section>
          )}
        </div>
        {/* ── The ⋯ button called "Project settings" is gone ─────────────────
            Its handler was `onNav('projects')`: it did not open settings, it
            threw the user out of the project workspace they were in and back
            to the all-projects list — the exact opposite of what its tooltip
            promised, and a duplicate of the "All projects" control two rows
            above it.

            It is removed rather than relabelled or rewired because there is
            nothing behind it: `shared/constants/ui-surface-registry.ts` has no
            project-settings surface, and `server/routes/c2c/projects.ts`
            exposes no PATCH/PUT for a regulatory program at all (only POST /,
            POST /:id/evidence and DELETE /:id/evidence/:evId). A project's
            settings cannot be edited anywhere in the product today, so any
            destination this button reached would be a second lie in place of
            the first. When a settings surface and its governed write exist,
            this is where the control belongs. */}
      </div>

      {/* Where the filing stands (FILING_SPINE.md F9): each market's verdict
          and the documents in review, from the reads the tabs show. */}
      {pid && !progState.error && (
        <ProjectStatusLine markets={markets} reviews={{ ...reviews, cap: PROJECT_REVIEWS_LIMIT, inReview: isOutForReview }} />
      )}

      {/* Before the tabs (FILING_SPINE.md §2): the start box and the
          conversations held on this project. They are outside the stage
          switch, so a half-typed message survives a change of tab; they sat
          inside Author, and leaving Author unmounted the message. Shown, as
          before, once the project record has not failed. */}
      {pid && !progState.error && (
        <div className="pj-start">
          <StartConversation productName={productName} onNav={onNav} />
          <ProjectConversations pid={pid} onNav={onNav} />
        </div>
      )}

      {/* A lifecycle belongs to a project. With none selected the tabs
          switched nothing — the body below is "No project selected" whichever
          is open — and AnA's set-stage already refuses in this state, so the
          human's controls do not offer what hers cannot. */}
      {!noProject && (
        <>
          <StageTracker stage={stage} setStage={setStage} />
          <div className="pj-stageband">
            <div className="pj-stageband-l">
              <span className="pj-stageband-stage">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { label: '' }).label}</span>
              <span className="pj-stageband-blurb">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { blurb: '' }).blurb}</span>
            </div>
          </div>
        </>
      )}

      {noProject ? (
        <EmptyState
          icon={I.folder}
          title="No project selected"
          hint="Open a project from All projects to load its governed workspace — documents, module completion, team and activity."
        />
      ) : progState.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load this project"
          hint="The project record didn't respond (it may not exist for your organization, or the service is unreachable). Return to All projects and try again."
        />
      ) : (
        <>
          {/* Evidence — the project's files, then its data room: every way a
              source comes into the project (FILING_SPINE.md F3). The data
              room sat under Author. */}
          {stage === 'evidence' && pid && (
            <div className="pj-stagebody">
              <ProjectEvidence pid={pid} name={title} onNav={onNav} available={available} />
              <DataRoom pid={pid} onNav={onNav} onAsk={ask} />
            </div>
          )}

          {/* Submit — one row per market, each with its own server verdict
              (F9), then what Plan and Lifecycle promised, named as coming
              later (F2). */}
          {stage === 'submit' && pid && (
            <div className="pj-stagebody">
              <ProjectMarkets markets={markets} onNav={onNav} available={available} ectdFiling={ectdFiling} />
              <ComingLater stage="submit" device={deviceFiling} />
            </div>
          )}

          {/* Review — this filing's reviews, each opening its document (F7),
              then the program's tasks and approvals from the unified work
              view, asked by the program UUID (see ProjectWorkPanel). */}
          {stage === 'review' && (
            <div className="pj-stagebody">
              {pid && <ProjectReviews state={reviews.state} onRetry={reviews.retry} onNav={onNav} available={available} />}
              <ProjectWorkPanel pid={pid} title="Tasks and approvals" onNav={onNav} />
            </div>
          )}

          {stage === 'respond' && <StagePanel stage="respond" onNav={onNav} available={available} />}

          {/* Author — the project's documents, each opened by id, then module
              completion, the person's work, records and the team. */}
          {stage === 'author' && (
            <AuthorWorkspace
              pid={pid}
              completion={completion}
              onNav={onNav}
              teamState={teamState}
              activityState={activityState}
              wsState={wsState}
              docs={docsRead}
              onRetryDocs={reloadDocs}
              onOpenDoc={openDocument}
            />
          )}
        </>
      )}
    </div>
  );
}
