import React, { useState, useRef, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData, hasKeys, liveMutateOrNull, type DataState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { getSegmentModules, getSurfaceMeta } from '../registryModel';
import { PJ_LIFECYCLE, PJ_STAGE_TOOLS, Ring, pjInitials, fileTone } from '../fixtures/project-home-data';
import { useChatUpload, attachmentReadLabel as readLabel } from '../../hooks/useChatUpload';
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
   Slices with no reachable UUID-keyed backend (tasks, readiness, the CTD
   pyramid, memory/instructions/intelligence, conversations, the vault tree,
   agency meetings, eTMF, grants, submissions) are rendered as an honest
   EmptyState rather than a fabricated fixture. The schedule-of-events panel
   (plan stage) is live for numeric-keyed projects and renders the same honest
   id-space empty for UUID programs — see SchedulePanel.
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
  intended_use: string | null;
  primary_agency: string | null;
  target_submission_date: string | null;
  progress_percent: number | null;
}

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

/** GET /api/c2c/projects/:id/drafts → { drafts: [...] } (recent c2c_document_sections). */
interface DraftRow {
  id: string;
  section_key: string | null;
  label: string | null;
  status: string | null;
  version: string | number | null;
  updated_at: string | null;
  doc_type: string | null;
  document_title: string | null;
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
  render: (d: T) => React.ReactNode;
}) {
  const { state } = props;
  if (state.loading) {
    return <div className="scaf-note" style={{ padding: '16px 10px' }}>{props.loadingText}</div>;
  }
  if (state.error) {
    return <EmptyState tone="error" icon={I.alertTriangle} title={props.errorTitle} hint={props.errorHint} />;
  }
  if (!state.data || (props.isEmpty ? props.isEmpty(state.data) : false)) {
    return <EmptyState icon={I.fileText} title={props.emptyTitle} hint={props.emptyHint} />;
  }
  return <>{props.render(state.data)}</>;
}

/* ════ Lifecycle (canonical stage catalog — not data) ════ */

function StageTracker({ stage, setStage }: { stage: string; setStage: (s: string) => void }) {
  const curIdx = PJ_LIFECYCLE.findIndex(s => s.id === stage);
  return (
    <div className="pj-lc" role="tablist" aria-label="Project lifecycle">
      {PJ_LIFECYCLE.map((s, i) => {
        const status = i < curIdx ? 'done' : (i === curIdx ? 'active' : 'upcoming');
        return (
          <button key={s.id} className="pj-lc-stage" data-status={status} aria-selected={stage === s.id || undefined}
            onClick={() => setStage(s.id)} title={s.blurb}>
            <span className="pj-lc-node"><span className="pj-lc-ic">{I[s.icon] || I.grid}</span></span>
            <span className="pj-lc-l">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StagePanel({ stage, onNav }: { stage: string; onNav: (id: string) => void }) {
  const meta = PJ_LIFECYCLE.find(s => s.id === stage) ?? { label: '', blurb: '' };
  const tools = PJ_STAGE_TOOLS[stage] || [];
  return (
    <section className="pj-sec">
      <div className="pj-sec-h"><h2>{meta.label}</h2><span className="sec-sub">{meta.blurb}</span></div>
      <div className="pj-tools">
        {tools.map(t => (
          <button key={t.id} className="pj-tool" onClick={() => onNav(t.id)}>
            <span className="pj-tool-ico">{I[t.icon] || I.grid}</span>
            <span className="pj-tool-b"><span className="pj-tool-t">{t.label}</span><span className="pj-tool-d">{t.desc}</span></span>
            <span className="pj-tool-go">{I.right}</span>
          </button>
        ))}
      </div>
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
  /** Recorded citations of this source. Absent on a server that predates it. */
  usage?: { sections: number; documents: number; changedSections: number } | null;
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
  if (s.extractionStatus === 'extracted') {
    return { label: s.extractionMethod?.includes('ocr') ? 'Read via OCR' : 'Read', tone: 'ok' };
  }
  if (s.extractionStatus === 'failed') return { label: 'Text not readable', tone: 'warn' };
  return { label: 'Not processed yet', tone: 'muted' };
}

function DataRoom({ pid, onNav, onAsk }: { pid: string | null; onNav: (id: string) => void; onAsk: (q: string) => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState('');
  // Sources the user has pinned as context for the next AnA turn. Handed over
  // via window.C2C_SOURCE_PINS, matching the window.C2C_PROJECT / C2C_CONVO
  // convention this surface already uses for cross-surface handoff.
  const [pinned, setPinned] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const state = useLiveData<{ sources: SourceRow[] }>(
    pid ? `/api/c2c/projects/${pid}/sources` : null,
    [pid, reloadKey],
    hasKeys<{ sources: SourceRow[] }>('sources'),
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
  const rows = sources.filter(s =>
    q.trim() ? (s.title || '').toLowerCase().includes(q.trim().toLowerCase()) : true,
  );
  const total = sources.length;
  const readable = sources.filter(s => s.extractionStatus === 'extracted').length;

  return (
    <section className="pj-sec">
      <div className="pj-sec-h">
        <h2>Data room</h2>
        <span className="sec-sub">
          {/* A failed read must not read as "no sources". Someone who just
              dropped a file in here would take an empty list as data loss. */}
          {state.error
            ? "couldn't load this project's sources — the list below is incomplete"
            : total > 0
              ? `${total} source${total === 1 ? '' : 's'} · ${readable} readable — what this project's documents are written from`
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
        style={{
          border: '1px dashed var(--border,#d0d5dd)', borderRadius: 10, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          background: dragging ? 'var(--accent-muted,#eef2ff)' : 'transparent', marginBottom: 12,
        }}
      >
        <span aria-hidden="true">{I.paperclip}</span>
        <span style={{ fontSize: 13 }}>
          <b>Add sources</b> — drop files here or click to browse. They&rsquo;re read on upload and
          become available to AnA for this project.
        </span>
        <input
          ref={fileRef}
          type="file"
          aria-label="Attach files to this project"
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
            border: '1px solid var(--border,#d0d5dd)', borderRadius: 10,
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
              style={{ fontSize: 12, border: '1px solid var(--border,#d0d5dd)', borderRadius: 999, padding: '2px 10px' }}
            >
              {a.status === 'uploading' ? `Uploading ${a.name}…` : a.name}
              {a.status === 'ready' && readLabel(a.extractionMethod, a.extractionWords)
                ? ` · ${readLabel(a.extractionMethod, a.extractionWords)}`
                : ''}
              {a.status === 'error' && a.error ? ` · ${a.error}` : ''}
            </span>
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{ marginBottom: 8 }}>
          <input
            className="pj-input"
            placeholder="Search sources…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sources"
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
              No source matches &ldquo;{q}&rdquo;.
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
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderBottom: '1px solid var(--border-subtle,#eaecf0)',
                    }}
                  >
                    {/* Pin as context. Only a source whose text was actually
                        read can ground a draft, so an unreadable one cannot be
                        pinned — offering it would promise grounding the
                        document cannot provide. */}
                    <input
                      type="checkbox"
                      checked={pinned.includes(s.id)}
                      disabled={s.extractionStatus !== 'extracted'}
                      onChange={(e) =>
                        setPinned((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                      aria-label={`Use ${s.title || `source ${s.id}`} as context`}
                      title={
                        s.extractionStatus === 'extracted'
                          ? 'Use this source as context for AnA'
                          : 'This source has no readable text, so it cannot ground a draft'
                      }
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
                  </div>
                );
              })}
            </div>
          )
        }
      />

      <div className="cm-pushbar" style={{ marginTop: 12 }}>
        <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('source-tracer')}>
          Trace a claim to its source {I.right}
        </button>
        <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('document-authoring')} disabled={uploading}>
          Write from these sources {I.right}
        </button>
        {pinned.length > 0 && (
          <button
            className="btn"
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => {
              // Hand the chosen set to AnA. It resolves each source back to the
              // upload its bytes live in and grounds the turn on exactly those
              // documents — not on whatever its own retrieval would have picked.
              window.C2C_SOURCE_PINS = pinned.map(String);
              onAsk(
                `Use the ${pinned.length} source${pinned.length === 1 ? '' : 's'} I pinned in the data room as the context for this project.`,
              );
            }}
          >
            {I.sparkles} Draft with {pinned.length} pinned source{pinned.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </section>
  );
}

/* ════ Schedule of events — the 'plan' step's screen ════════════════════════
   AnA's regulatory-aware milestone schedule, read from the REAL store
   (GET /api/concept2cure/projects/:id/schedule-of-events — plan header in
   project_schedule_of_events, milestones reusing project_workflow_stages).

   IDENTITY: that store is keyed by the NUMERIC projects.id, while this
   surface's window.C2C_PROJECT.id is normally a regulatory_programs UUID (see
   the header comment). The panel therefore fetches ONLY when the open ident is
   numeric-keyed ('12' / 'proj_12' — the SubmissionTwin idiom), and renders the
   honest id-space empty for UUID programs instead of sending a doomed request
   or borrowing another project's schedule. Milestone STATUS is displayed as
   stored; nothing here invents progress, dates, or health. */

/** GET …/schedule-of-events → milestones[] (ScheduleMilestoneView subset). */
interface ScheduleMilestoneRow {
  id: number;
  key: string;
  title: string;
  status: string; // not_started | in_progress | at_risk | slipped | blocked | completed
  targetDate: string | null;
  isCritical: boolean;
  regulatoryBasis: string | null;
  ownerRole: string | null;
  slipDays: number | null;
}

/** GET …/schedule-of-events → plan (SchedulePlanView subset); null = none generated. */
interface SchedulePlanRow {
  regulatoryFramework: string | null;
  version: number;
  targetDate: string | null;
  confidence: string | null;
}

interface ScheduleViewRow {
  plan: SchedulePlanRow | null;
  milestones: ScheduleMilestoneRow[];
  health?: { overallStatus?: string; summary?: string } | null;
}

/** The numeric-keyed ident space the schedule store resolves ('12' / 'proj_12'). */
const SCHED_IDENT_RE = /^(?:proj_)?\d+$/;
const SCHED_SHOWN = 8;

/** Real ISO date → display with year (schedules span years); null stays null. */
function fmtDue(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const SCHED_STATUS_TONE: Record<string, string> = {
  completed: 'tone-ok',
  at_risk: 'tone-warn',
  slipped: 'tone-warn',
  blocked: 'tone-warn',
};

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

function SchedulePanel({ pid, onAsk }: { pid: string | null; onAsk: (q: string) => void }) {
  const ident = pid && SCHED_IDENT_RE.test(pid) ? pid : null;
  const [reloadKey, setReloadKey] = useState(0);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const state = useLiveData<ScheduleViewRow>(
    ident ? `/api/concept2cure/projects/${ident}/schedule-of-events` : null,
    [ident, reloadKey],
    hasKeys<ScheduleViewRow>('plan', 'milestones'),
  );

  const askGenerate = () =>
    onAsk(
      'Generate a schedule of events for this project — the regulatory milestone plan for its pathway, with dates toward our target submission.',
    );

  // Real POST /projects/:id/schedule-of-events/generate (routes/
  // project-schedule-of-events.ts) — offered only in the numeric id-space where
  // that endpoint actually resolves this project.
  const generate = async () => {
    if (!ident || genBusy) return;
    setGenBusy(true);
    setGenError(null);
    const res = await liveMutateOrNull<ScheduleViewRow>(
      'POST',
      `/api/concept2cure/projects/${ident}/schedule-of-events/generate`,
      {},
    );
    setGenBusy(false);
    if (res.error) {
      setGenError(res.error);
    } else {
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <section className="pj-sec">
      <div className="pj-sec-h">
        <h2>Schedule</h2>
        <span className="sec-sub">
          {state.data?.plan
            ? [
                state.data.plan.regulatoryFramework,
                `v${state.data.plan.version}`,
                fmtDue(state.data.plan.targetDate) ? `target ${fmtDue(state.data.plan.targetDate)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : "AnA's regulatory milestone plan for this project"}
        </span>
      </div>

      {!ident ? (
        /* UUID program — the schedule store is keyed by the numeric project
           record, which this workspace doesn't resolve (same identity gap as
           tasks & readiness). Stated honestly; no phantom generate action. */
        <EmptyState
          icon={I.calendar}
          title="Schedule isn't wired to this workspace yet"
          hint="AnA's schedule of events is keyed to the numeric project record, which this workspace doesn't resolve yet — so no milestones can be shown or generated from here."
        />
      ) : (
        <Anchored
          state={state}
          loadingText="Loading the schedule of events…"
          errorTitle="Couldn't load the schedule"
          errorHint="The schedule-of-events read didn't respond. Sign in and retry, or check the service is reachable."
          emptyTitle="No schedule generated"
          emptyHint="Ask AnA to generate one — a regulatory milestone plan grounded in this project's pathway — or generate it from the pathway template below."
          isEmpty={(d) => !d.plan && (d.milestones ?? []).length === 0}
          render={(d) => {
            const milestones = d.milestones ?? [];
            const open = milestones.filter((m) => m.status !== 'completed');
            const completed = milestones.length - open.length;
            const shown = open.slice(0, SCHED_SHOWN);
            return (
              <>
                {d.health?.summary && (
                  <div className="scaf-note" style={{ padding: '4px 0 10px', fontSize: 12.5 }}>{d.health.summary}</div>
                )}
                <div className="pj-sched" style={{ display: 'grid', gap: 0 }}>
                  {shown.map((m) => {
                    const due = fmtDue(m.targetDate);
                    return (
                      <div
                        key={m.key || m.id}
                        style={{
                          display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 2px',
                          borderBottom: '1px solid var(--border-subtle,#eaecf0)',
                        }}
                      >
                        <span className={`rd-chip ${SCHED_STATUS_TONE[m.status] ?? 'tone-idle'}`} style={{ whiteSpace: 'nowrap' }}>
                          {String(m.status || 'not_started').replace(/_/g, ' ')}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                            {m.title}
                            {m.isCritical && <span className="sp-tone-warn" style={{ fontSize: 11, marginLeft: 6 }}>critical path</span>}
                          </span>
                          <span className="sec-sub" style={{ fontSize: 11.5 }}>
                            {[m.regulatoryBasis, m.ownerRole].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="sec-sub" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {due ?? 'no due date'}
                          {m.slipDays != null && m.slipDays > 0 && (
                            <span className="sp-tone-warn"> · {m.slipDays}d late</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="sec-sub" style={{ fontSize: 11.5, marginTop: 8 }}>
                  {open.length > SCHED_SHOWN ? `+${open.length - SCHED_SHOWN} more upcoming · ` : ''}
                  {completed > 0 ? `${completed} completed · ` : ''}
                  {milestones.length} milestone{milestones.length === 1 ? '' : 's'} total
                </div>
              </>
            );
          }}
        />
      )}

      {/* Empty-state affordances — both real: the composer prompt reaches the
          generate_schedule_of_events AnA tool, and the button calls the real
          POST generate endpoint. Rendered only in the numeric id-space where
          they can actually act on THIS project. */}
      {ident && !state.loading && !state.error && state.data && !state.data.plan
        && (state.data.milestones ?? []).length === 0 && (
        <div className="cm-pushbar" style={{ marginTop: 10 }}>
          <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={askGenerate}>
            {I.sparkles} Ask AnA to generate one
          </button>
          <button className="btn" style={{ fontSize: 12, padding: '4px 12px' }} disabled={genBusy} onClick={generate}>
            {genBusy ? 'Generating…' : 'Generate schedule'}
          </button>
        </div>
      )}
      {genError && (
        <div className="sp-tone-warn" role="status" style={{ fontSize: 12, marginTop: 6 }}>
          Couldn&rsquo;t generate the schedule: {genError}
        </div>
      )}
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

function ConversationComposer({ productName, onNav }: { productName: string; onNav: (id: string) => void }) {
  const [draft, setDraft] = useState('');

  const intro =
    "I'm your co-author on " + productName + ", bound to this project's governed dossier. " +
    "Ask me to draft, reconcile, or review a section and I'll open the full thread with " +
    'every step grounded to its source.';

  const openThread = () => {
    window.C2C_CONVO = { id: 'new', seed: draft.trim() || '' };
    onNav('conversation-thread');
  };

  return (
    <div className="pj-convo">
      <div className="pj-convo-h">
        <span className="pj-convo-mark">{I.sparkles}</span>
        <div className="pj-convo-id"><span className="pj-convo-t">AnA · co-author</span><span className="pj-convo-ctx">{productName} · governed dossier</span></div>
        <button className="pj-convo-open" onClick={openThread}>Open full thread {I.arrowRight}</button>
      </div>
      <div className="pj-convo-scroll">
        <div className="pj-msg ana"><span className="pj-msg-av">{I.sparkles}</span><div className="pj-msg-b">{intro}</div></div>
      </div>
      <div className="pj-composer">
        <textarea rows={2} aria-label="Message AnA about this project" placeholder={'Message AnA about ' + productName + '…'} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); openThread(); } }} />
        <div className="pj-composer-row">
          <span className="sp" />
          <button className="pj-comp-send" aria-label="Send message to AnA" disabled={!draft.trim()} onClick={openThread}>{I.arrowUp}</button>
        </div>
      </div>
    </div>
  );
}

/* ════ Author workspace — real anchored slices + honest empties ════ */

function AuthorWorkspace({
  seg, pid, onNav, onAsk, teamState, activityState, wsState, draftsState,
}: {
  seg: string;
  /** regulatory_programs UUID — scopes the data room to this project. */
  pid: string | null;
  onNav: (id: string) => void;
  onAsk: (q: string) => void;
  teamState: DataState<{ team: TeamRow[] }>;
  activityState: DataState<{ activity: ActivityRow[] }>;
  wsState: DataState<{ workstreams: WorkstreamRow[] }>;
  draftsState: DataState<{ drafts: DraftRow[] }>;
}) {
  return (
    <div className="pj-grid">
      <div className="pj-main">
        {/* Workspace tools — canonical registry navigation (not data) */}
        <section className="pj-sec">
          <div className="pj-sec-h"><h2>Workspace</h2><span className="sec-sub">Every capability, scoped to this project</span></div>
          {getSegmentModules(seg).map((grp: { label: string; items: string[] }) => (
            <div key={grp.label} className="pj-toolgrp">
              <div className="pj-toolgrp-l">{grp.label}</div>
              <div className="pj-tools">
                {grp.items.map(id => {
                  const m = getSurfaceMeta(id);
                  return (
                    <button key={id} className="pj-tool" title={(m as { notes?: string }).notes || m.label} onClick={() => onNav(id)}>
                      <span className="pj-tool-ico">{I[(m as { icon?: string }).icon || ''] || I.grid}</span>
                      <span className="pj-tool-b"><span className="pj-tool-t">{m.label}</span><span className="pj-tool-d">{String((m as { notes?: string }).notes || '').split('. ')[0]}</span></span>
                      <span className="pj-tool-go">{I.right}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* Conversations — no reachable UUID-keyed backend on this surface */}
        <section className="pj-sec">
          <div className="pj-sec-h"><h2>Conversations</h2></div>
          <EmptyState
            icon={I.messageSquare}
            title="No project conversations yet"
            hint="Governed AnA threads for this project will appear here once started. Use the co-author composer above to open the full conversation thread."
          />
        </section>

        {/* Linked modules — REAL: per-CTD-module section rollup */}
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
                {(d.workstreams ?? []).map((w, i) => {
                  const done = Number(w.completion_pct ?? 0);
                  const label = String(w.module ?? '—').toUpperCase();
                  return (
                    <button key={i} className="pj-lmod" data-risk={done < 50 || undefined} onClick={() => onNav('dossier-map')}>
                      <span className="pj-lmod-t">{label}{Number(w.total) ? ` · ${Number(w.total)} section${Number(w.total) === 1 ? '' : 's'}` : ''}</span>
                      <span className="pj-lmod-track"><span className="pj-lmod-fill" data-risk={done < 50 || undefined} style={{ width: done + '%' }} /></span>
                      <span className="pj-lmod-pct">{done}%</span>
                    </button>
                  );
                })}
              </div>
            )}
          />
        </section>

        {/* Data room — REAL: the project's canonical client-document sources.
            Sits directly above the documentation sections it feeds. */}
        <DataRoom pid={pid} onNav={onNav} onAsk={onAsk} />

        {/* Tasks & readiness — project_tasks / readiness engine are keyed by the
            NUMERIC projects.id, not reachable from this UUID-scoped surface. */}
        <section className="pj-sec">
          <div className="pj-sec-h"><h2>Tasks &amp; readiness</h2></div>
          <EmptyState
            icon={I.checkCircle}
            title="Tasks &amp; submission readiness aren't wired to this workspace yet"
            hint={<>Project tasks and the readiness engine are keyed to the numeric project record, which this workspace doesn't resolve yet. Open the task board to see and manage this org's tasks.</>}
          />
          <div style={{ marginTop: 8 }}>
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('task-board')}>Open task board {I.right}</button>
          </div>
        </section>

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
                      <span className="pj-act-w">{a.actor_id != null ? 'User ' + a.actor_id : 'System'}</span>
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

        {/* Recent drafts — REAL: most-recently-updated governed document sections.
            (The prior 'Files' card fabricated an uploaded-document list; this shows
            the project's real drafted sections instead.) */}
        <section className="pj-card">
          <div className="pj-card-h"><h3>Recent drafts</h3>
            {/* Upload is a flagged mock ACTION — no upload endpoint is wired on
                this surface, so the picker below intentionally does not fabricate
                a persisted/processing row. Uploading lives in the document
                workspace. */}
            <button className="pj-edit" title="Add document (opens the document workspace)" onClick={() => onNav('document-authoring')}>{I.plus}</button>
          </div>
          <Anchored
            state={draftsState}
            loadingText="Loading recent drafts…"
            errorTitle="Couldn't load recent drafts"
            errorHint="The project sections read didn't respond. Sign in and retry, or check the service is reachable."
            emptyTitle="No drafted sections yet"
            emptyHint="Governed document sections drafted on this project will appear here, newest first."
            isEmpty={(d) => (d.drafts ?? []).length === 0}
            render={(d) => (
              <div className="pj-files">
                {(d.drafts ?? []).map((f) => {
                  const nm = f.label || f.document_title || f.section_key || 'Section';
                  return (
                    <button key={f.id} className="pj-file" style={{ width: '100%', textAlign: 'left' }} onClick={() => onNav('document-authoring')}>
                      <div className="pj-file-top">
                        <span className="pj-file-badge">{String(f.doc_type || 'doc').toUpperCase()}</span>
                        <span className="pj-file-status" data-s={fileTone(f.status || '')}>{f.status || 'draft'}</span>
                      </div>
                      <div className="pj-file-n">{nm}</div>
                      <div className="pj-file-m">{[f.section_key, f.version != null ? 'v' + f.version : null, fmtWhen(f.updated_at)].filter(Boolean).join(' · ')}</div>
                    </button>
                  );
                })}
              </div>
            )}
          />
        </section>
      </aside>
    </div>
  );
}

/* ════ ProjectHome — the full workspace surface ════ */

export function ProjectHome({ onNav, onAsk, segment }: SurfaceViewProps) {
  // Other v2 surfaces treat onAsk as optional; keep that contract so ProjectHome
  // renders standalone (and in tests) without a host wired up.
  const ask = onAsk || (() => {});
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
  const draftsState = useLiveData<{ drafts: DraftRow[] }>(pid ? `/api/c2c/projects/${pid}/drafts` : null);

  const [stage, setStage] = useState('author');

  const prog = progState.data;

  // Header identity: sel is the live selection handoff; prog enriches it with
  // real regulatory_programs columns. Every value is null-safe — a chip is only
  // rendered when its column is present (never fabricated).
  const title = sel?.title || prog?.name || 'Project';
  const productName = sel?.product || prog?.product_name || String(title).split(' ')[0];
  const desc = prog?.description ?? null;
  const clientType = sel?.ws ?? null;
  const submissionType = sel?.code || prog?.code || prog?.program_type || null;
  const region = prog?.primary_agency ?? null;
  const indication = prog?.indication ?? null;
  const status = sel?.status || prog?.status || null;
  const priority = prog?.priority ?? null;
  const phase = prog?.phase ?? null;
  const completion = prog?.progress_percent ?? null;

  const seg = sel
    ? ({ MDX: 'medtech', Biotech: 'biotech', Pharma: 'pharma', CRO: 'cro' }[sel.ws ?? ''] ?? 'biotech')
    : (segment || 'biotech');

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
    const drafts = draftsState.data?.drafts;
    return {
      summary:
        `Project home for "${title}"${submissionType ? ` (${submissionType})` : ''}: ` +
        [status && `status ${status}`, phase && `phase ${phase}`, priority && `priority ${priority}`,
         region && `primary agency ${region}`, indication && `indication ${indication}`,
         completion != null && `${completion}% complete`].filter(Boolean).join(', ') +
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
        recentDrafts: draftsState.loading || draftsState.error || !Array.isArray(drafts)
          ? null
          : drafts.slice(0, 10).map((d) => ({
              id: d.id, section: d.section_key, label: d.label, status: d.status,
              version: d.version, documentTitle: d.document_title,
              docType: d.doc_type, updated: d.updated_at,
            })),
        draftsUnavailable: draftsState.error ? 'the drafts read failed' : null,
        recentActivity: activityState.loading || activityState.error || !Array.isArray(activity)
          ? null
          : activity.slice(0, 10).map((a) => ({
              action: a.action, resourceType: a.resource_type, occurredAt: a.occurred_at,
            })),
        activityUnavailable: activityState.error ? 'the activity read failed' : null,
      },
      availableActions: [
        'Move through the programme lifecycle stages',
        'Open a recent draft section in the document editor',
        'Open this project’s documents in the Vault surface, or its filings in the Submission Center',
        'Read the per-module completion rollup and the recent audited activity',
      ],
    };
  }, [noProject, pid, stage, progState.loading, progState.error, prog, title, productName, desc, clientType,
      submissionType, region, indication, status, priority, phase, completion,
      teamState.loading, teamState.error, teamState.data,
      activityState.loading, activityState.error, activityState.data,
      wsState.loading, wsState.error, wsState.data,
      draftsState.loading, draftsState.error, draftsState.data]);
  usePublishSurfaceContext('project-home', anaContext);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     project-home.*, identity-resolved). The one action drives the SAME state
     the StageTracker's own buttons drive (setStage). Stage is pure view state:
     it selects which panels render over whatever the five reads deliver, so —
     same reasoning as vault.search — applying it mid-load is correct, not
     early, and there is no loading refusal and no retry.

     Known gap, not expressible today: leaving the 'author' stage unmounts its
     composer, whose in-progress draft is child-local state this handler cannot
     see — a mid-message guard would need that state lifted out of the child.
     The registry entry's description already warns AnA not to switch away from
     author uninvited. */
  useSurfaceActionHandlers('project-home', {
    'project-home.set-stage': (params) => {
      if (noProject)
        return { ok: false, reason: 'No project is selected — open one from All projects.' };
      const target = (params.stage ?? '').trim();
      const meta = PJ_LIFECYCLE.find((s) => s.id === target);
      if (!meta) return { ok: false, reason: `No lifecycle stage named "${params.stage}".` };
      setStage(meta.id);
      return { ok: true, detail: `Opened the ${meta.id} stage` };
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

      <div className="pj-crumb">
        <span className="pj-crumb-i" data-cur><span className="pj-crumb-k">Project</span>{title}</span>
      </div>

      <div className="pj-top">
        <div className="pj-top-l">
          <h1 className="pj-title">{title}</h1>
          {progState.loading && <div className="pj-desc" style={{ color: 'var(--text-400)' }}>Loading project…</div>}
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

      <StageTracker stage={stage} setStage={setStage} />
      <div className="pj-stageband">
        <div className="pj-stageband-l">
          <span className="pj-stageband-stage">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { label: '' }).label}</span>
          <span className="pj-stageband-blurb">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { blurb: '' }).blurb}</span>
        </div>
      </div>

      {noProject ? (
        <EmptyState
          icon={I.folder}
          title="No project selected"
          hint="Open a project from All projects to load its governed workspace — team, module completion, drafts and activity."
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
          {/* Evidence — the vault tree read-model (/api/c2c/project-vault/:id) is
              shaped for the dedicated Vault surface, not this panel's contract.
              Honest empty rather than a fabricated file tree. */}
          {stage === 'evidence' && (
            <section className="pj-sec">
              <div className="pj-sec-h"><h2>Evidence &amp; vault</h2></div>
              <EmptyState
                icon={I.folder}
                title="The document vault opens in its own workspace"
                hint="This project's governed documents, folder tree and version history live in the Vault surface, which renders the real document/section store."
              />
            </section>
          )}

          {/* Submit — submissions are owned by the Submission Center surface. */}
          {stage === 'submit' && (
            <section className="pj-sec">
              <div className="pj-sec-h"><h2>Submissions</h2></div>
              <EmptyState
                icon={I.rocket}
                title="Submissions open in the Submission Center"
                hint="Agency gateways, the eCTD pipeline and this project's submissions are managed in the Submission Center, wired to the real submissions store."
              />
              <div style={{ marginTop: 8 }}>
                <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('submission-center')}>{I.right} Open Submission Center</button>
              </div>
            </section>
          )}

          {/* Review — tasks are keyed by the numeric project record, not reachable here. */}
          {stage === 'review' && (
            <section className="pj-sec">
              <div className="pj-sec-h"><h2>Review &amp; approvals</h2></div>
              <EmptyState
                icon={I.checkCircle}
                title="Review tasks aren't wired to this workspace yet"
                hint="Project tasks and approvals are managed on the task board. This workspace doesn't resolve the numeric project record the task store is keyed on."
              />
              <div style={{ marginTop: 8 }}>
                <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('task-board')}>Open task board {I.right}</button>
              </div>
            </section>
          )}

          {/* Plan — the live schedule-of-events panel, the canonical tool
              catalog, and honest empties for the panels whose backends are
              org-shaped/absent here (meetings, eTMF, grants). */}
          {stage === 'plan' && (<>
            <SchedulePanel pid={pid} onAsk={ask} />
            <StagePanel stage="plan" onNav={onNav} />
            <section className="pj-sec">
              <div className="pj-sec-h"><h2>Agency meetings &amp; planning data</h2></div>
              <EmptyState
                icon={I.calendar}
                title="Meetings, eTMF and grants open in their own surfaces"
                hint="Agency meetings, the Trial Master File and grant milestones are managed in their dedicated surfaces, each wired to its real store. Use the tools above to open them."
              />
            </section>
          </>)}

          {stage === 'respond' && <StagePanel stage="respond" onNav={onNav} />}
          {stage === 'lifecycle' && <StagePanel stage="lifecycle" onNav={onNav} />}

          {stage === 'author' && (<>
            <ConversationComposer productName={productName} onNav={onNav} />

            {completion != null && (
              <section className="pj-sec">
                <div className="pj-sec-h"><h2>Dossier readiness</h2><span className="sec-sub">{completion}% complete</span></div>
                <div className="pj-map">
                  <div className="pj-map-ring"><Ring value={completion} size={104} stroke={9} /><div className="pj-map-ring-l">Dossier<br />readiness</div></div>
                </div>
              </section>
            )}

            <AuthorWorkspace
              seg={seg}
              pid={pid}
              onNav={onNav}
              onAsk={ask}
              teamState={teamState}
              activityState={activityState}
              wsState={wsState}
              draftsState={draftsState}
            />
          </>)}
        </>
      )}
    </div>
  );
}
