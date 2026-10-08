import React, { useState, useRef, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, ErrorState, useLiveData, useLiveRows, hasKeys, type DataState, type ListState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { applySurfaceAction, notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { isLaunchScopeLocked, useNavEntitlements } from '../navEntitlements';
import { PJ_LIFECYCLE, PJ_STAGE_TOOLS, Ring, pjInitials } from '../fixtures/project-home-data';
import { useChatUpload, readyAttachmentLabel, CHAT_UPLOAD_ACCEPT } from '../../hooks/useChatUpload';
import { updateShellProject } from '../shellProject';
import { ProjectRecords } from './ProjectRecords';
import { ConversationFilesAdopt } from './ConversationFilesAdopt';
import { DocumentDisposition } from './DocumentDisposition';
import { ProjectFilesPanel } from '../editor/ProjectFilesPanel';
import { StatusPill, rowsOf, updatedWords, useDocumentList, type BuiltDocument, type ListRead } from '../editor/CanvasDocumentList';
import { clearEditorTarget, setEditorTarget } from '../editorTarget';
import { C2CToast, useToast } from '../toast';
import { DEVICE_FLAGS } from '@shared/constants/domain/device-classification';
import { DEVICE_FAMILY_PRODUCT_TYPES } from '@shared/constants/domain/product-types';
import { SC_APPTYPES, SC_REGIONS } from '../fixtures/submission';
import type { SubRow } from './SubmissionCenter';
import {
  noSubmissionWords,
  programSubmissionsPath,
  SUB_STATUS_LABEL,
  SUB_STATUS_TONE,
  useProgramSequence,
  useSequenceDispatchReadiness,
  type DispatchGate,
  type DispatchReadinessAssessment,
  type Discovery,
  type SequenceDispatchReadiness,
} from './programSequence';
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
   Slices with no reachable UUID-keyed backend (tasks, the CTD pyramid,
   memory/instructions/intelligence, agency meetings, eTMF, grants) are
   rendered as an honest EmptyState rather than a fabricated fixture. The
   project's files, conversations, dispatch readiness and submissions are read
   by the project's UUID (slices 23 and 24 of ONE_ANA_ONE_CANVAS.md).
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

function StageTracker({ stage, setStage }: { stage: string; setStage: (s: string) => void }) {
  return (
    <div className="pj-lc" role="tablist" aria-label="Project lifecycle">
      {PJ_LIFECYCLE.map((s) => {
        const status = s.id === stage ? 'active' : undefined;
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

/** Whether a surface can be opened in this release. Unknown (verdicts not yet
    read, or unreadable) counts as available, the rule the rail uses: a lock is a
    claim about the customer's release and is never invented. */
function useSurfaceAvailable(): (id: string) => boolean {
  const { verdictFor } = useNavEntitlements();
  return (id: string) => !isLaunchScopeLocked(verdictFor(id));
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

/* ════ Submit: the project's dispatch readiness and its submissions ════════
   ONE_ANA_ONE_CANVAS.md slice 24. The Submit stage said "Submissions open in
   the Submission Center" and showed nothing, so a regulatory lead on the
   project had to leave it to learn whether its sequence could be sent. It now
   shows the dispatch gate's verdict, read through the same discovery and the
   same endpoint as the readiness screen (programSequence.ts), above the
   project's submissions from the server's project-scoped list. Nothing here
   computes a figure: the verdict and every count are the server's.

   The two panels sit side by side, so they must never contradict each other.
   The gate reads only the submission of the project's own type, and a
   submission with no project recorded may reach it by name; the list holds
   the submissions recorded to the project. So the readiness panel never says
   "no submission" over the project's submissions of other types (it names
   them), and the list says when the verdict above is for a submission it does
   not hold. Both read one discovery (ProjectSubmitStage). */

/** The plain words for each state in which there is no verdict to show. */
function notReadyCopy(d: Discovery): { title: string; hint: string } {
  if (d.state === 'no-submission') return noSubmissionWords(d, 'this project');
  if (d.state === 'no-sequence') {
    return {
      title: 'No sequence to gate yet',
      hint:
        d.match === 'legacy-name'
          ? `Its submission "${d.submissionTitle}", matched by name because it has no project recorded, has no eCTD sequence yet.`
          : `Its submission "${d.submissionTitle}" has no eCTD sequence yet.`,
    };
  }
  if (d.state === 'sequence') {
    return { title: 'No verdict for this sequence', hint: 'The readiness read returned nothing. The gate is unanswered, which is not the same as cleared.' };
  }
  return { title: 'No project open', hint: 'No sequence is being gated.' };
}

/** The verdict pill: the server's answer, or the absence of one, in words. */
function verdictLook(answered: boolean, gate: DispatchGate): { cls: string; icon: React.ReactNode; text: string } {
  if (!answered) return { cls: 'warn', icon: I.alertTriangle, text: 'No verdict from the server' };
  return gate.cleared
    ? { cls: 'ok', icon: I.shieldCheck, text: 'Cleared to dispatch' }
    : { cls: 'blocked', icon: I.lock, text: 'Dispatch blocked' };
}

/** Which sequence was gated, as the server and the discovery name it. */
function gatedSequenceLine(a: DispatchReadinessAssessment, d: Discovery): string {
  const number = d.state === 'sequence' && d.sequenceNumber ? `Sequence ${d.sequenceNumber}` : `Sequence id ${a.sequenceId}`;
  return [
    number,
    a.region ? String(a.region).toUpperCase() : null,
    typeof a.leafCount === 'number' ? `${a.leafCount} ${a.leafCount === 1 ? 'leaf' : 'leaves'}` : null,
    a.sequenceStatus ? `status ${a.sequenceStatus}` : null,
    d.state === 'sequence' && d.match === 'legacy-name' ? 'submission matched by name: it has no project recorded' : null,
  ].filter(Boolean).join(' · ');
}

/** What a cleared verdict did not check, in the server's words.
 *  The server clears a gate whose check did not run and is not required here
 *  (GateView.notAssessed: no agency-grade validator configured, the common
 *  installation). The readiness screen shows that gate as "Not assessed" and
 *  its lead says "external validator not run"; a bare "Cleared to dispatch"
 *  here would be the overclaim that screen was fixed to stop making. */
function NotAssessedLines({ a }: { a: DispatchReadinessAssessment }) {
  const unassessed = (Array.isArray(a.gates) ? a.gates : []).filter((g) => g.cleared && Boolean(g.notAssessed));
  if (unassessed.length > 0) {
    return (
      <>
        {unassessed.map((g) => (
          <p key={g.key} className="pj-desc" data-testid="pj-readiness-not-assessed" data-gate={g.key}>
            <span aria-hidden="true">{I.alertTriangle}</span>{' '}
            <b>{g.rule?.title ?? `The ${g.key} gate`}</b>: not assessed. {g.notAssessed}
          </p>
        ))}
      </>
    );
  }
  // A response with no gate breakdown still says whether the validator ran.
  if (a.externalValidation && a.externalValidation.ran === false) {
    return (
      <p className="pj-desc" data-testid="pj-readiness-not-assessed" data-gate="external">
        <span aria-hidden="true">{I.alertTriangle}</span> External validator not run: the package has not been checked against it.
      </p>
    );
  }
  return null;
}

function ReadinessVerdict({ a, gate, answered, discovery }: {
  a: DispatchReadinessAssessment; gate: DispatchGate; answered: boolean; discovery: Discovery;
}) {
  const look = verdictLook(answered, gate);
  const rd = a.readiness;
  return (
    <div data-testid="pj-readiness-verdict">
      <div className={`dr2-verdict ${look.cls}`}>
        <span className="dr2-verdict-ic" aria-hidden="true">{look.icon}</span>
        <span className="dr2-verdict-t">{look.text}</span>
      </div>
      {answered && gate.cleared && <NotAssessedLines a={a} />}
      <div className="pj-file-m">{gatedSequenceLine(a, discovery)}</div>
      {!answered && <p className="pj-desc">The gate is unanswered, which is not the same as cleared.</p>}
      {answered && !gate.cleared && gate.blockers.length > 0 && (
        <div className="dr2-blockers">
          <div className="dr2-blockers-hd">{I.lock} What must close before dispatch</div>
          {gate.blockers.map((b, i) => (
            <div key={i} className="dr2-blocker">
              <span className="dr2-blocker-n">{i + 1}</span>
              <span className="dr2-blocker-t">{b}</span>
            </div>
          ))}
        </div>
      )}
      {rd && (
        <div className="dr2-readiness-hd">
          <span className="pj-file-m">Structural validation</span>
          <span className="dr2-readiness-s">
            <span className="dr2-count err">{rd.errors} error{rd.errors === 1 ? '' : 's'}</span>
            <span className="dr2-count warn">{rd.warnings} warning{rd.warnings === 1 ? '' : 's'}</span>
            <span className="dr2-count idle">{rd.infos} info</span>
          </span>
        </div>
      )}
    </div>
  );
}

function ReadinessBody({ discovery, r, onRetry }: { discovery: Discovery; r: SequenceDispatchReadiness; onRetry: () => void }) {
  if (r.gateState === 'evaluating') {
    return <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>Checking this project&apos;s dispatch readiness…</div>;
  }
  if (r.gateState === 'error') {
    return (
      <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't read the dispatch readiness"
        hint="The gate is unanswered, which is not the same as cleared." retry={onRetry} />
    );
  }
  if (r.gateState !== 'evaluated' || !r.assessment) {
    const copy = notReadyCopy(discovery);
    return <EmptyState icon={I.rocket} title={copy.title} hint={copy.hint} />;
  }
  return <ReadinessVerdict a={r.assessment} gate={r.gate} answered={r.answered} discovery={discovery} />;
}

/** The open project's dispatch gate. Same discovery and endpoint as the
 *  readiness screen, which "Open readiness" opens when this release has it. */
function ProjectReadiness({ discovery, r, onRetry, onNav, available }: {
  discovery: Discovery; r: SequenceDispatchReadiness; onRetry: () => void;
  onNav: (id: string) => void; available: (id: string) => boolean;
}) {
  return (
    <section className="pj-sec" aria-labelledby="pj-readiness-h" data-testid="pj-readiness">
      <div className="pj-sec-h">
        <h2 id="pj-readiness-h">Dispatch readiness</h2>
        {available('dispatch-readiness') && (
          <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('dispatch-readiness')}>
            Open readiness {I.right}
          </button>
        )}
      </div>
      <ReadinessBody discovery={discovery} r={r} onRetry={onRetry} />
    </section>
  );
}

const appTypeLabel = (v: string) => SC_APPTYPES.find((a) => a.v === v)?.l ?? v;
const regionLabel = (v: string) => SC_REGIONS.find((r) => r.v === v)?.l ?? v;
/* The status chip's tone, in the file-row vocabulary (pj-file-status data-s). */
const SUB_ROW_TONE: Record<string, string> = { ai: 'acc', ok: 'ok', idle: 'idle' };

/** One submission: its type, name, status (in words, not colour alone), region and stage. */
function SubmissionRowView({ s }: { s: SubRow }) {
  return (
    <div className="pj-file" role="listitem" data-testid="pj-submission">
      <div className="pj-file-top">
        <span className="pj-file-badge">{appTypeLabel(s.applicationType)}</span>
        <span className="pj-file-status" data-s={SUB_ROW_TONE[SUB_STATUS_TONE[s.status] ?? 'idle'] ?? 'idle'}>
          {SUB_STATUS_LABEL[s.status] ?? s.status}
        </span>
      </div>
      <div className="pj-file-n">{s.title}{s.productName ? ` · ${s.productName}` : ''}</div>
      <div className="pj-file-m">
        {[s.primaryRegion ? regionLabel(s.primaryRegion) : null, s.lifecycleStage ? `${s.lifecycleStage} stage` : null].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

/** The submission the gate reads by name, when it has no project recorded:
 *  the list (the server's project scope) does not hold it, so it says so
 *  rather than leaving the verdict above about a submission it denies. */
function legacyGated(d: Discovery): string | null {
  return (d.state === 'sequence' || d.state === 'no-sequence') && d.match === 'legacy-name' ? d.submissionTitle : null;
}

/** The project's submissions: GET /api/submissions?programId=…, loading, a
 *  failure with a retry, an honest empty and the rows, each its own state. */
function ProjectSubmissions({ subs, onRetry, discovery, onNav, available, ectdFiling }: {
  subs: ListState<SubRow>; onRetry: () => void; discovery: Discovery;
  onNav: (id: string) => void; available: (id: string) => boolean;
  /** The project is read and is not a device or diagnostic filing. */
  ectdFiling: boolean;
}) {
  const legacy = legacyGated(discovery);
  return (
    <section className="pj-sec" aria-labelledby="pj-subs-h">
      <div className="pj-sec-h">
        <h2 id="pj-subs-h">Submissions</h2>
        <span className="pj-sec-acts">
          {/* eCTD compile reads the open project's submission. The project
              page's Workspace grid was its door until FILING_SPINE.md F3;
              F14 moves it onto the sequence's Dispatch tab. It builds an
              FDA/EMA eCTD backbone only, which is not how a 510(k), De Novo
              or PMA is filed, and the grid offered it to biopharma projects
              only (registryModel.ts SEGMENT_MODULES). So a device or
              diagnostic project, or one not yet read, is not offered it;
              no eSTAR path is in the launch scope to offer instead. */}
          {ectdFiling && available('ectd-compile') && (
            <button type="button" className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('ectd-compile')}>
              Compile and download {I.right}
            </button>
          )}
          {/* The Submission Center reads the open project, so it opens on this one. */}
          {available('submission-center') && (
            <button type="button" className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('submission-center')}>
              {I.right} Open Submission Center
            </button>
          )}
        </span>
      </div>
      {subs.loading ? (
        <div role="status" aria-busy="true" className="scaf-note" style={{ padding: '16px 10px' }}>Loading this project&apos;s submissions…</div>
      ) : subs.error ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load this project's submissions"
          hint="The submission store didn't respond, so nothing here says whether the project has any." retry={onRetry} />
      ) : subs.rows.length === 0 ? (
        legacy ? (
          <EmptyState icon={I.rocket} title="No submission is recorded to this project"
            hint={`The dispatch readiness above is for "${legacy}", which has no project recorded and is matched to this one by name.`} />
        ) : (
          <EmptyState icon={I.rocket} title="No submissions for this project yet"
            hint="A submission created in the Submission Center while this project is open belongs to it." />
        )
      ) : (
        <>
          <div className="pj-files" role="list" data-testid="pj-submissions">
            {subs.rows.map((s) => <SubmissionRowView key={s.id} s={s} />)}
          </div>
          {legacy && (
            <p className="pj-desc" data-testid="pj-submissions-legacy">
              The dispatch readiness above is for &quot;{legacy}&quot;, which has no project recorded and is matched to this one by name, so it is not listed here.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** The Submit stage: one discovery and one scoped list read, shared by the
 *  two panels so that what one says the other cannot deny. */
function ProjectSubmitStage({ pid, onNav, available, ectdFiling }: {
  pid: string; onNav: (id: string) => void; available: (id: string) => boolean;
  ectdFiling: boolean;
}) {
  const [reload, setReload] = useState(0);
  const discovery = useProgramSequence(reload);
  const readiness = useSequenceDispatchReadiness(discovery);
  const [bump, setBump] = useState(0);
  const path = programSubmissionsPath(pid);
  const subs = useLiveRows<SubRow>(path, [path, bump]);
  return (
    <>
      <ProjectReadiness discovery={discovery} r={readiness} onRetry={() => setReload((k) => k + 1)} onNav={onNav} available={available} />
      <ProjectSubmissions subs={subs} onRetry={() => setBump((b) => b + 1)} discovery={discovery} onNav={onNav} available={available} ectdFiling={ectdFiling} />
    </>
  );
}

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

function DataRoom({ pid, onNav, onAsk }: { pid: string | null; onNav: (id: string) => void; onAsk: (q: string) => void }) {
  const available = useSurfaceAvailable();
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState('');
  // Sources the user has pinned as context for the next AnA turn. Handed over
  // via window.C2C_SOURCE_PINS, matching the window.C2C_PROJECT / C2C_CONVO
  // convention this surface already uses for cross-surface handoff.
  const [pinned, setPinned] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const state = useLiveData<{ sources: SourceRow[]; window?: { shown: number; truncated: boolean } }>(
    pid ? `/api/c2c/projects/${pid}/sources` : null,
    [pid, reloadKey],
    hasKeys<{ sources: SourceRow[]; window?: { shown: number; truncated: boolean } }>('sources'),
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
  const rows = sources.filter(s =>
    q.trim() ? (s.title || '').toLowerCase().includes(q.trim().toLowerCase()) : true,
  );
  /* One file re-uploaded is one source: its retired revision is listed but not
     counted. A full window's count is a floor. */
  const current = sources.filter(s => s.isCurrent !== false && s.dataEligible !== false);
  const total = current.length;
  const readable = current.filter(s => s.extractionStatus === 'extracted').length;
  const truncated = state.data?.window?.truncated === true;
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
            : total > 0
              ? `${total}${truncated ? '+' : ''} source${total === 1 && !truncated ? '' : 's'} · ${readable} readable${truncated ? ` (newest ${sources.length} shown)` : ''} — what this project's documents are written from`
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

/** One persisted AnA thread of this program (GET /api/chat/threads?program_id=). */
interface ThreadRow { id: string; title: string | null; created_at: string | null; updated_at: string | null; program_id?: string | null }

/* ════ Conversations held on this project ═══════════════════════════════════
   The program's own AnA threads. Threads carry the program they were started
   in (chat_threads.program_id, bound when the stream mints the thread, only to
   a program of its organization), so this lists exactly the conversations
   held on this project, newest first, and opens one back into the thread
   surface. It sits above the tabs with the start box (FILING_SPINE.md §2,
   "Before the tabs"): a conversation belongs to the project, not to one stage
   of it. */
function ProjectConversations({ pid, onNav }: { pid: string; onNav: (id: string) => void }) {
  const threadsState = useLiveData<{ threads: ThreadRow[] }>(
    `/api/chat/threads?program_id=${encodeURIComponent(pid)}&limit=8`,
    [pid],
  );
  const resumeThread = (id: string) => {
    window.C2C_CONVO = { id };
    onNav('conversation-thread');
  };
  return (
    <section className="pj-sec" aria-labelledby="pj-threads-h">
      <div className="pj-sec-h"><h2 id="pj-threads-h">Conversations</h2><span className="sec-sub">resume a thread held on this project</span></div>
      <Anchored
        state={threadsState}
        loadingText="Loading conversations…"
        errorTitle="Couldn't load conversations"
        errorHint="The conversation store didn't respond. Sign in and retry, or check that the service is reachable."
        emptyTitle="No project conversations yet"
        emptyHint="Start one in the box above. Threads started here are kept on this project and listed for resuming."
        isEmpty={(d) => (d.threads ?? []).length === 0}
        render={(d) => (
          <div className="pj-files" data-testid="pj-threads">
            {(d.threads ?? []).map((t) => (
              <button key={t.id} className="pj-file" style={{ width: '100%', textAlign: 'left' }} onClick={() => resumeThread(t.id)} title="Resume this conversation">
                <div className="pj-file-n">{(t.title || 'Untitled conversation').slice(0, 120)}</div>
                <div className="pj-file-m">{[fmtWhen(t.updated_at || t.created_at), 'Resume'].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        )}
      />
    </section>
  );
}

/* ════ My work on this project ═════════════════════════════════════════════
   ONE_ANA_ONE_CANVAS.md slice 24. The task store keys a project by the numeric
   projects.id, which this page does not resolve (the integer-project-id
   mapping, docs/design/PROJECT_FIRST_PLAN_2026-09-26.md), so the person's work
   cannot be filtered to this project yet. It says so in one line and links to
   My work. This section said "Tasks & submission readiness aren't wired"; the
   dispatch readiness is on the Submit stage now.

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
            the work (the constitution's no-KPI-hero rule for project landing). */}
        {completion != null && (
          <section className="pj-card">
            <div className="pj-card-h"><h3>Dossier readiness</h3><span className="sec-sub">{completion}% complete</span></div>
            <div className="pj-map">
              <div className="pj-map-ring"><Ring value={completion} size={104} stroke={9} /><div className="pj-map-ring-l">Dossier<br />readiness</div></div>
            </div>
          </section>
        )}
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

          {/* Submit — the project's dispatch readiness, then its submissions
              (slice 24), then what Plan and Lifecycle promised, named as
              coming later (F2). */}
          {stage === 'submit' && pid && (
            <div className="pj-stagebody">
              <ProjectSubmitStage pid={pid} onNav={onNav} available={available} ectdFiling={ectdFiling} />
              <ComingLater stage="submit" device={deviceFiling} />
            </div>
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
