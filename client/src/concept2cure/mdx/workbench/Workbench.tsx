/**
 * Cross-program workbench surfaces:
 *   - TasksSurface         Tasks and reviews — Kanban + list + metrics
 *   - ValidationSurface    Validation center — programs matrix + rule list
 *   - SubmissionsSurface   Submission center — pipeline + list + detail drawer
 *
 * Ported verbatim from ui_kits/mdx/Workbench.jsx.
 * The vault lives in surfaces/VaultSurface.tsx (data/vault.ts +
 * hooks/useVault.ts) alongside the other extracted surfaces.
 */

import * as React from 'react';
import { I } from '../icons';
import {
  SUBMISSION_PIPELINE,
  TASKS_COLUMNS,
  type Submission,
  type Task,
  type TaskMetric,
  type ValidationProgram,
  type ValidationRule,
  type ValidationSummary,
} from '../data/workbench';
import { useSubmissions, useSubmissionDetail } from '../hooks/useSubmissions';
import {
  useWorkbenchTasks,
  useWorkbenchValidation,
  useUnifiedWork,
  workNotOnTheBoard,
} from '../hooks/useWorkbench';
import { useMdxPrograms } from '../hooks/useMdxPrograms';
import { EmptyState } from '../../v2/dataConnect';
import { downloadCsv } from '../../v2/download';

/**
 * Column widths for the validation-rules table, shared by its head and its rows
 * so the two cannot drift.
 *
 * Every column but Sev and Since is fractional. The fixed widths they replace —
 * 88/110/110/140 plus a bare `1fr` — summed to 608px of tracks and gaps inside
 * the 590px this table is given on a 748px surface, which left `1fr` pinned at
 * the min-content width of the word "Message" and still overflowed. Fractions
 * divide the room that exists instead of asserting room that does not, and
 * `minmax(0, …)` is what lets them go below their content rather than refusing.
 */
const VALIDATION_COLS =
  '76px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 2fr) 88px';

/**
 * Empty reads, shared so a panel awaiting its first response renders the same
 * zero every time instead of allocating a new array each render.
 *
 * Each of these replaced an example set reached through sample mode. Three of
 * the four had no banner, so the surface showed invented tasks, validation
 * findings and templates as if they were the tenant's own; the fourth is
 * documented where it was removed. Every panel here has a live endpoint, so
 * the honest reading before it answers is nothing, not somebody else's work.
 */
const NO_TASKS: Task[] = [];
const NO_TASK_METRICS: TaskMetric[] = [];
const NO_VALIDATION_RULES: ValidationRule[] = [];
const NO_VALIDATION_PROGRAMS: ValidationProgram[] = [];
const NO_VALIDATION_SUMMARY: ValidationSummary[] = [];
const NO_SUBMISSIONS: Submission[] = [];

/**
 * The three readings a panel can be in when it is holding no rows: still
 * fetching, failed, or genuinely empty. They are not the same statement, and
 * rendering all three as blank space is how a surface comes to tell a user
 * "you have no work" about a request that never landed.
 *
 * Returns null the moment there is anything to show, so it composes in front
 * of an existing list without wrapping it.
 */
export function PanelState({
  rows,
  loading,
  error,
  refresh,
  icon,
  title,
  errorTitle,
  hint,
  action,
  testId,
}: {
  rows: readonly unknown[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  icon: React.ReactNode;
  /** What it means for this panel to be legitimately empty. */
  title: string;
  /** What to say when the read FAILED. Deliberately a separate string: a
   *  failure is a different statement from an emptiness, not a rewording. */
  errorTitle: string;
  hint: string;
  action?: { label: string; onAct: () => void };
  testId: string;
}) {
  if (rows.length > 0) return null;
  if (error) {
    return (
      <EmptyState
        tone="error"
        icon={icon}
        title={errorTitle}
        hint={error}
        retry={refresh}
        testId={`${testId}-error`}
      />
    );
  }
  return (
    <EmptyState
      busy={loading}
      icon={icon}
      title={loading ? 'Loading…' : title}
      hint={loading ? '' : hint}
      {...(loading ? {} : action ? { action } : {})}
      testId={testId}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkbenchProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

export function TasksSurface({ onAskAna }: WorkbenchProps) {
  const [view, setView] = React.useState<'board' | 'list'>('board');
  const [owner, setOwner] = React.useState<'all' | 'JC'>('all');

  /* Live tasks from /api/submission-ops/workload (c2c_project_work_items).
     Falls back to the kit fixture during load and on error so the Kanban
     never renders with empty columns. */
  const live = useWorkbenchTasks();
  /* The board above reads c2c_project_work_items only. This reports what the
     other two tracking systems (schedule milestones, tracked filings) hold, so
     the page stops silently under-reporting the portfolio. */
  const unified = useUnifiedWork();
  const offBoard = workNotOnTheBoard(unified.summary);
  const sourceTasks = live.tasks ?? NO_TASKS;
  const sourceMetrics = live.metrics ?? NO_TASK_METRICS;

  /* One definition of "new task", shared by the header button and the empty
     state's CTA — the same reason startNewSubmission below is a callback. Two
     copies is how a panel comes to name an action differently from the control
     that performs it. */
  const newTask = React.useCallback(() => {
    onAskAna(
      'Create a new task. Walk me through the fields — project, section, summary, label, due date, assignee, ' +
                  'and whether an e-signature is required — then file it to the right Kanban column.',
    );
  }, [onAskAna]);

  const byCol = (id: string) =>
    sourceTasks.filter(t => t.col === id && (owner === 'all' || t.assignee === owner));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Tasks and reviews</h1>
          <div className="page-sub">
            Everything assigned across the portfolio — blockers, peer reviews, e-signatures.
          </div>
          {/* A source whose query failed contributes nothing, so the counts
              below are a floor. Saying so is the difference between "nothing
              else is outstanding" and "we could not read everything". */}
          {unified.summary?.partial === true && (
            <div className="page-sub">
              Some work sources could not be read, so these counts are incomplete. The reason has
              been logged.
            </div>
          )}
          {offBoard > 0 && (
            <div className="page-sub">
              {`+${offBoard} not on this board: `}
              {`${unified.summary?.bySource.schedule ?? 0} schedule milestone(s), `}
              {`${unified.summary?.bySource.filing ?? 0} tracked filing(s)`}
              {unified.summary?.blocking ? ` · ${unified.summary.blocking} blocking` : ''}
            </div>
          )}
        </div>
        <div className="page-actions">
          <div className="seg small">
            <button className="seg-btn" data-on={view === 'board'} onClick={() => setView('board')}>Board</button>
            <button className="seg-btn" data-on={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
          <div className="seg small">
            <button className="seg-btn" data-on={owner === 'all'} onClick={() => setOwner('all')}>All</button>
            <button className="seg-btn" data-on={owner === 'JC'} onClick={() => setOwner('JC')}>Mine</button>
          </div>
          <button className="btn primary small" onClick={newTask}>
            {I.plus} New task
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {sourceMetrics.map((m, i) => (
          <div key={i} className="metric-card" data-tone={m.tone || ''}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-val">
              {m.metric}
              {m.unit && <span className="unit">{m.unit}</span>}
            </div>
            <div className="metric-meta">{m.meta}</div>
          </div>
        ))}
      </div>

      <PanelState
        rows={sourceTasks}
        loading={live.loading}
        error={live.error}
        refresh={live.refresh}
        icon={I.check}
        title="No tasks assigned"
        errorTitle="Could not load your tasks"
        hint="Work assigned across the portfolio appears here — blockers, peer reviews and e-signatures."
        action={{ label: 'New task', onAct: newTask }}
        testId="workbench-no-tasks"
      />

      {view === 'board' ? (
        <div className="kanban">
          {TASKS_COLUMNS.map(col => (
            <div key={col.id} className="kanban-col" data-tone={col.tone}>
              <div className="kanban-head">
                <span className="kanban-dot" data-tone={col.tone} />
                <span className="kanban-label">{col.label}</span>
                <span className="kanban-n">{byCol(col.id).length}</span>
              </div>
              <div className="kanban-body">
                {byCol(col.id).map(t => (
                  <button
                    key={t.id}
                    className="task-card"
                    data-tone={t.tone}
                    onClick={() =>
                      onAskAna(
                        `Open task ${t.id} — "${t.title}" on ${t.prog} §${t.sect}. ` +
                          `Status ${t.label}, due ${t.due}, assignee ${t.assignee}. Walk me through what's needed to clear it.`,
                      )
                    }
                  >
                    <div className="task-head">
                      <span className="task-prog">
                        {t.prog}
                        <span className="task-sect">· {t.sect}</span>
                      </span>
                      {t.esig && (
                        <span className="task-esig" title="E-signature required">
                          {I.shieldCheck}
                        </span>
                      )}
                    </div>
                    <div className="task-title">{t.title}</div>
                    <div className="task-foot">
                      <span className={`task-label ${t.tone}`}>{t.label}</span>
                      <span className="task-spacer" />
                      {t.comments > 0 && (
                        <span className="task-meta">
                          {I.messageSquare} {t.comments}
                        </span>
                      )}
                      <span className="task-meta">
                        {I.clock} {t.due}
                      </span>
                      <span className="task-assignee" title={t.assignee}>
                        {t.assignee}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ctable">
          <div
            className="ctable-head"
            style={{ gridTemplateColumns: '96px 1fr 120px 100px 90px 80px 60px' }}
          >
            <div>Task</div>
            <div>Summary</div>
            <div>Project · §</div>
            <div>Label</div>
            <div>Due</div>
            <div>Assignee</div>
            <div>Cmt</div>
          </div>
          {sourceTasks.filter(t => owner === 'all' || t.assignee === owner).map(t => (
            <div
              key={t.id}
              className="ctable-row"
              style={{ gridTemplateColumns: '96px 1fr 120px 100px 90px 80px 60px' }}
              data-tone={t.tone}
            >
              <div className="mono">{t.id}</div>
              <div className="ctable-strong">{t.title}</div>
              <div>
                {t.prog} · {t.sect}
              </div>
              <div>
                <span className={`task-label ${t.tone}`}>{t.label}</span>
              </div>
              <div>{t.due}</div>
              <div>
                <span className="task-assignee small">{t.assignee}</span>
              </div>
              <div className="mono" style={{ color: 'var(--text-400)' }}>
                {t.comments || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function ValidationSurface({ onAskAna }: WorkbenchProps) {
  const [sev, setSev] = React.useState<'all' | 'err' | 'warn'>('all');
  /* Slice 0 (map row `device-validation`): each card used to set a program
     filter on the rules. A c2c_blockers row names a project and no program,
     so the filter matched nothing and one click left a bare table header,
     which read as "this program has no blockers". There is no filter until
     the blockers read carries a key that joins a blocker to a program. */

  /* Live validation: per-program readiness matrix derived by joining
     /api/submission-ops/blockers with the live program list, plus the
     full rules table (each blocker becomes one row). Falls back to the
     kit fixture during load + on error. */
  const programsState = useMdxPrograms();
  const programsList = programsState.programs ?? [];
  const validation = useWorkbenchValidation(programsList);
  const sourceRules    = validation.rules ?? NO_VALIDATION_RULES;
  const sourcePrograms = validation.programs ?? NO_VALIDATION_PROGRAMS;
  const sourceSummary  = validation.summary ?? NO_VALIDATION_SUMMARY;

  const rules = sourceRules.filter(r => sev === 'all' || r.severity === sev);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Validation center</h1>
          {/* Slice 0 (map row `device-validation`): this read "eSTAR required-field
              rules and claim-evidence checks, every program, one dashboard". The
              page runs neither; it reads the open rows of c2c_blockers. */}
          <div className="page-sub">
            Open blockers recorded against your organization’s projects.
          </div>
        </div>
        <div className="page-actions">
          {/* Slice 0 (map row `device-validation`): on a failed or unanswered
              read this wrote a header-only CSV, which reads as a clean report.
              It exports only a read that answered. */}
          <button
            className="btn ghost small"
            disabled={validation.rules === null}
            title={validation.rules === null ? 'Available once the open blockers have been read' : undefined}
            onClick={() => {
              if (validation.rules === null) return;
              const headers = ['Severity', 'Rule', 'Project', 'Category', 'Message', 'Since'];
              const rows = validation.rules.map(r => [r.severity, r.id, r.project, r.category, r.msg, r.since]);
              downloadCsv(
                `validation-report-${new Date().toISOString().slice(0, 10)}.csv`,
                headers,
                rows,
              );
            }}
          >
            {I.download} Export report
          </button>
          <button
            className="btn primary small"
            /* Slice 0 (map row `device-validation`): the prompt hard-coded "the 3
               blockers" whatever the list held. It states the count this screen
               read, and no count before the read has answered. */
            onClick={() =>
              onAskAna(
                validation.rules
                  ? `Summarize the ${validation.rules.length} open blocker${validation.rules.length === 1 ? '' : 's'} recorded across my projects`
                  : 'Summarize the open blockers recorded across my projects',
              )
            }
          >
            {I.sparkles} Ask Claude to triage
          </button>
        </div>
      </div>

      <div className="metrics-row">
        {sourceSummary.map((m, i) => (
          <div key={i} className="metric-card" data-tone={m.tone || ''}>
            <div className="metric-label">{m.label}</div>
            <div className="metric-val">
              {m.metric}
              {m.unit && <span className="unit">{m.unit}</span>}
            </div>
            <div className="metric-meta">{m.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        {/* Slice 0 (map row `device-validation`): this read "Readiness by
            program · Column order · errors · warnings · pass". Each card draws
            the project's stored progressPercent, not an assessment, and no
            card can show counts (see `errs` below). A project with none
            recorded reads 0% (useMdxPrograms), so the line says so. */}
        <div className="section-head">
          <h2>Recorded progress by project</h2>
          <span className="section-sub">
            Stored project progress, not an eSTAR assessment. A project with none recorded shows 0%.
          </span>
        </div>
        {/* Slice 0 (map row `device-validation`): the project read's failure
            was dropped (`programs ?? []`), so a failed read showed the idle
            "nothing to validate". Both reads feed this panel; either failing
            is a failure, and retry re-runs both. */}
        <PanelState
          rows={sourcePrograms}
          loading={validation.loading || programsState.loading}
          error={validation.error ?? programsState.error}
          refresh={() => {
            validation.refresh();
            programsState.refresh();
          }}
          icon={I.shieldCheck}
          title="No projects to show"
          errorTitle="Could not load the validation matrix"
          hint="Each project appears here with its recorded progress."
          testId="workbench-no-validation-programs"
        />
        <div className="val-matrix">
          {/* A card, not a button: it filters nothing (see `sev` above). The
              inline style takes off the pointer and the hover lift the
              stylesheet gives the card for its old click. */}
          {sourcePrograms.map(p => (
            <div
              key={p.id}
              className="val-prog-card"
              data-status={p.status}
              style={{ cursor: 'default', transform: 'none' }}
            >
              <div className="val-prog-head">
                <span className="val-prog-code mono">{p.code}</span>
                <span className={`status-pill ${p.status}`}>{p.status}</span>
              </div>
              <div className="val-prog-title">{p.title}</div>
              <div className="val-prog-path">{p.pathway}</div>
              <div className="val-prog-path">Recorded progress</div>
              <div className="val-prog-bars">
                <div
                  className="val-bar"
                  role="img"
                  aria-label={`Recorded progress ${p.readiness}%`}
                >
                  <div className="val-bar-fill" style={{ width: `${p.readiness}%` }} />
                </div>
                <span className="val-bar-pct mono">{p.readiness}%</span>
              </div>
              <div className="val-prog-counts">
                {p.errs === null ? (
                  <span className="val-count" title="Blockers are recorded on the tracking record and cannot be attributed to this project">
                    Blockers not linked to this project
                  </span>
                ) : (
                  <>
                    <span className="val-count err">{p.errs} err</span>
                    <span className="val-count warn">{p.warns} warn</span>
                    <span className="val-count ok">{p.ok} ok</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Rules</h2>
          <div className="seg small">
            <button className="seg-btn" data-on={sev === 'all'} onClick={() => setSev('all')}>All</button>
            <button className="seg-btn" data-on={sev === 'err'} onClick={() => setSev('err')}>Blockers</button>
            <button className="seg-btn" data-on={sev === 'warn'} onClick={() => setSev('warn')}>Warnings</button>
          </div>
        </div>
        {/* Slice 0 (map row `device-validation`): an empty read rendered a table
            header over blank space. It says none is recorded and where a
            filing's readiness is assessed. Only on a read that answered: a
            failed one says so here too, never as empty. */}
        {validation.error && validation.rules === null && (
          <EmptyState
            tone="error"
            icon={I.shieldCheck}
            title="Could not load the open blockers"
            hint={validation.error}
            retry={validation.refresh}
            testId="workbench-blockers-error"
          />
        )}
        {validation.rules !== null && validation.rules.length === 0 && (
          <EmptyState
            icon={I.shieldCheck}
            title="No open blockers recorded"
            hint={
              'Blockers are not added on this screen. They are recorded against a project’s submission ' +
              'package, for example from a blocking issue in agency correspondence. Each device filing’s ' +
              'readiness is assessed on the eSTAR filing readiness panel in its 510(k), PMA or IVD workspace.'
            }
            testId="workbench-no-blockers"
          />
        )}
        <div className="ctable">
          <div
            className="ctable-head"
            style={{ gridTemplateColumns: VALIDATION_COLS }}
          >
            <div>Sev</div>
            <div>Rule</div>
            <div>Project</div>
            <div>Category</div>
            <div>Message</div>
            <div>Since</div>
          </div>
          {rules.map(r => (
            <div
              key={r.id}
              className="ctable-row"
              style={{ gridTemplateColumns: VALIDATION_COLS }}
            >
              <div>
                <span className={`sev-pill ${r.severity}`}>
                  {r.severity === 'err' ? 'Blocker' : r.severity === 'warn' ? 'Warning' : 'Pass'}
                </span>
              </div>
              <div className="mono">{r.id}</div>
              <div>{r.project}</div>
              <div>{r.category}</div>
              <div>{r.msg}</div>
              <div>{r.since}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Submissions
// ─────────────────────────────────────────────────────────────────────────────

export function SubmissionsSurface({ onAskAna }: WorkbenchProps) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'blocked' | 'complete'>('all');

  /* Live submissions from /api/submission-ops/packages, and nothing else.
     There used to be a `SUBMISSIONS` example set behind sample mode. Its
     rows carried `cover: 'signed'`, `esig: true`, a log line reading
     "Cover letter e-signed (AUD-9104)" — an invented Part 11 signature id —
     and a "CLEARED · K254481" decision against a clearance-shaped number.
     Those rows drove the transmission gate rendered below.

     Gating and bannering is the right treatment for example content and the
     wrong treatment for this: the value of a signature record is that no part
     of it was authored for display, so an invented one is not a weaker version
     of the artifact, it is its opposite. The same fabrication was removed from
     the v2 Submission Center (SC_SUBMISSIONS) and from the pathway audit and
     approvals panes; this was the third copy, one lane over.

     Slice 0 (map row `device-submission`): the pipeline and the header
     rendered zero counts before the first response and after a failed one,
     with no error, so a read that never landed said "nothing in flight". They
     state a count only for a list that answered; before that the list says
     it is loading or that it could not be read, with a retry. */
  const live = useSubmissions();
  const sourceSubmissions = live.submissions ?? NO_SUBMISSIONS;
  const answered = live.submissions !== null;

  /* One definition of "start a new submission", used by the header button and
     by the empty state's CTA. Two copies of this string is how a panel comes to
     name an action slightly differently from the control that performs it. */
  /* Slice 0 (map row `device-submission`): this offered a "target authority
     (FDA ESG, notified body, EU MDR)". No notified-body transmitter exists and
     the package record names no authority; it asks for what the record holds. */
  const startNewSubmission = React.useCallback(() => {
    onAskAna(
      'Start a new submission package. Walk me through selecting the project, pathway, package contents ' +
        'and cover letter, and run the gate checks before it is sent.',
    );
  }, [onAskAna]);

  /* Default selection re-syncs to the first row of the live list when it
     arrives — avoids clicking onto a stale fixture id. */
  React.useEffect(() => {
    if (!sourceSubmissions.length) return;
    const stillExists = selected != null && sourceSubmissions.some((s) => s.id === selected);
    if (!stillExists) setSelected(sourceSubmissions[0].id);
  }, [sourceSubmissions, selected]);

  /* Per-package gate + activity log. The list endpoint omits these (they
     come from /readiness and /milestones), so the detail hook fires when
     a row is selected and merges its results into `sel`.
     Slice 0 (map row `device-submission`): the gate is the readiness read and
     nothing else. It fell back to the list row's gate, a 0 / 0 / 0 default,
     while the read was in flight or after it failed, and showed a green
     "0 err · 0 warn · 0 pass" with Transmit enabled for a gate nobody read. */
  const detail = useSubmissionDetail(selected);
  const baseSel = sourceSubmissions.find((s) => s.id === selected);
  /* Slice 0: the log is the milestones read and nothing else. It fell back to
     the list row's empty log while the read was in flight or after it
     failed, and Activity showed no rows: "no activity". */
  const sel = baseSel ? { ...baseSel, gate: detail.gate } : undefined;
  const gateUnread = detail.gateError || detail.error ? 'Could not read the readiness gate' : 'Not read yet';
  /* Slice 0 (map row `device-submission`): a gate is clear only when the read
     assessed something and found no error. A package with nothing in it reads
     0 / 0 / 0, and that ticked Validation and enabled Transmit. */
  const gateClear = sel?.gate != null && sel.gate.errs === 0 && sel.gate.ok > 0;
  const gateValue = !sel?.gate
    ? gateUnread
    : sel.gate.errs + sel.gate.warns + sel.gate.ok === 0 && detail.gateArtifacts === 0
      ? 'Nothing assessed yet'
      : `${sel.gate.errs} err · ${sel.gate.warns} warn · ${sel.gate.ok} pass`;
  const stageless = sourceSubmissions.filter((s) => s.stage === null).length;

  const visible = statusFilter === 'all'
    ? sourceSubmissions
    : sourceSubmissions.filter(s => s.status === statusFilter);
  const cycleFilter = () => {
    const order: Array<'all' | 'active' | 'blocked' | 'complete'> = ['all', 'active', 'blocked', 'complete'];
    setStatusFilter(order[(order.indexOf(statusFilter) + 1) % order.length]);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Submission center</h1>
          {/* Slice 0 (map row `device-submission`): this read "Package and
              transmit — FDA ESG, notified bodies, EU MDR". The page sends
              nothing; sending is Gateway transmittals', and no notified-body
              transmitter exists. It says what the page shows. */}
          <div className="page-sub">
            Submission packages and their status.
          </div>
        </div>
        <div className="page-actions">
          <button
            className={`btn ghost small${statusFilter !== 'all' ? ' active' : ''}`}
            title={statusFilter === 'all' ? 'Filter submissions' : `Showing ${statusFilter} only`}
            onClick={cycleFilter}
          >
            {I.filter} {statusFilter === 'all' ? 'Filter' : statusFilter}
          </button>
          <button className="btn primary small" onClick={startNewSubmission}>
            {I.rocket} New submission
          </button>
        </div>
      </div>

      <section className="section">
        {/* Slice 0: a package is counted at a stage only when its record names
            one (see useSubmissions `deriveStage`); the rest are said to have
            none rather than placed at "Package" or "Decision". */}
        <div className="section-head">
          <h2>Pipeline</h2>
          <span className="section-sub">
            7 stages from package to decision
            {answered && stageless > 0 &&
              ` · ${stageless} package${stageless === 1 ? '' : 's'} record${stageless === 1 ? 's' : ''} no stage`}
          </span>
        </div>
        <div className="sub-pipeline">
          {SUBMISSION_PIPELINE.map((st, i) => {
            const count = sourceSubmissions.filter(s => s.stage === st.id).length;
            return (
              <div key={st.id} className="sub-stage">
                <div className="sub-stage-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="sub-stage-label">{st.label}</div>
                <div className="sub-stage-desc">{st.desc}</div>
                <div className="sub-stage-n">{answered ? count : '—'}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Active submissions</h2>
          <span className="section-sub">
            {answered
              ? `${sourceSubmissions.length} total · ` +
                `${sourceSubmissions.filter(s => s.status === 'active').length} active · ` +
                `${sourceSubmissions.filter(s => s.status === 'blocked').length} blocked`
              : '—'}
          </span>
        </div>
        <div className="sub-layout">
          <div className="sub-list">
            {live.error && !answered && (
              <EmptyState
                tone="error"
                icon={I.rocket}
                title="Could not load the submission packages"
                hint={live.error}
                retry={live.refresh}
                testId="workbench-submissions-error"
              />
            )}
            {!live.error && !answered && (
              <EmptyState busy icon={I.rocket} title="Loading…" testId="workbench-submissions-loading" />
            )}
            {/* The prose used to say: Use "New submission" above. The button was
                real and forty lines up, so the empty state named an action and
                made the user go and find it — the same passive instruction W0-5
                retired on the DataGate panels, in a hand-rolled panel that the
                gate never covered. It renders the action now, wired to the same
                handler as the header button so the two cannot drift. */}
            {live.submissions !== null && live.submissions.length === 0 && (
              <EmptyState
                icon={I.rocket}
                title="No submissions yet"
                hint="Packages you create appear here with their status."
                action={{ label: 'New submission', onAct: startNewSubmission }}
                testId="workbench-no-submissions"
              />
            )}
            {visible.map(s => (
              <button
                key={s.id}
                className="sub-row"
                data-on={selected === s.id}
                onClick={() => setSelected(s.id)}
                data-status={s.status}
              >
                <div className="sub-row-head">
                  <span className="sub-row-code mono">{s.prog}</span>
                  <span className={`status-pill ${s.status}`}>{s.status}</span>
                </div>
                <div className="sub-row-title">{s.title}</div>
                {/* Slice 0 (map row `device-submission`): a receiving authority is
                    not on the package record. useSubmissions derived "NB · TÜV" or
                    "FDA · ESG" from the family alone; it no longer computes one
                    (see the Submission type), so nothing here can render it. */}
                {/* Slice 0: a record with no file count said "0 files · —";
                    and with no gate counts, three 0 chips. Neither was read.
                    Nothing writes a file count on a package; the assembled
                    bundle the server records is what is shown. */}
                <div className="sub-row-meta">
                  <span>{s.bundle ? `Bundle · ${s.bundle.size}` : 'No bundle assembled'}</span>
                </div>
                <div className="sub-row-foot">
                  {s.gate ? (
                    <span className="sub-row-gate">
                      <span className="gate-chip err">{s.gate.errs}</span>
                      <span className="gate-chip warn">{s.gate.warns}</span>
                      <span className="gate-chip ok">{s.gate.ok}</span>
                    </span>
                  ) : (
                    <span className="sub-row-gate" title="Select the package to read its readiness gate">—</span>
                  )}
                  <span className="sub-row-due">
                    {s.transmitAt ? `Sent ${s.transmitAt}` : `Target · ${s.targetAt}`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="sub-detail">
            {sel && (
              <>
                <div className="sub-detail-head">
                  <div>
                    <div className="sub-detail-eyebrow">
                      {sel.prog} · {sel.pathway}
                    </div>
                    <h3 className="sub-detail-title">{sel.title}</h3>
                  </div>
                  <div className="sub-detail-actions">
                    {sel.status === 'blocked' && (
                      <button
                        className="btn ghost small"
                        onClick={() => onAskAna(`What's blocking ${sel.prog}?`)}
                      >
                        {I.sparkles} Ask Claude
                      </button>
                    )}
                    {/* Slice 0 (map row `device-submission`): enabled only on a
                        readiness gate that was read, assessed something and
                        has no errors (`gateClear`); it was
                        also gated on the free-form `metadata.esig` flag, which
                        is not a signature record. The prompt names no
                        transmitter (none exists for a notified body; sending is
                        Gateway transmittals'), and the receipt states a
                        transmission date only when the record carries one. */}
                    <button
                      className="btn primary small"
                      disabled={!gateClear}
                      onClick={() =>
                        onAskAna(
                          sel.status === 'complete'
                            ? `Show me the receipt for ${sel.prog} · ${sel.title}` +
                                (sel.transmitAt ? ` (transmitted ${sel.transmitAt})` : '') +
                                '. Confirm the ack ID and the post-submission checklist.'
                            : `Transmit ${sel.prog} · ${sel.title}. Re-run the gate (validation, cover letter, e-signature, package), ` +
                                'confirm the package hash, and tell me what the Gateway transmittals step needs from me before this can be sent.',
                        )
                      }
                    >
                      {I.rocket} {sel.status === 'complete' ? 'View receipt' : 'Transmit'}
                    </button>
                  </div>
                </div>

                <div className="sub-gate">
                  <div className="sub-gate-lbl">Submission gate</div>
                  <div className="sub-gate-row">
                    <div className="sub-gate-item" data-ok={gateClear}>
                      <span className="sub-gate-ico">{gateClear ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">Validation</div>
                        <div className="sub-gate-v">{gateValue}</div>
                      </div>
                    </div>
                    {/* Slice 0: the cover letter read "draft" or ticked "signed"
                        from `metadata.cover`, and the e-signature "Signed" from
                        the free-form `metadata.esig` flag, then "Not recorded".
                        Nothing writes either on a package, and this page reads
                        no cover letter and no signature record (the Part 11
                        signature is applied when the package is sent, on
                        Gateway transmittals), so it states neither. */}
                    <div className="sub-gate-item" data-ok={false}>
                      <span className="sub-gate-ico">{I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">Cover letter</div>
                        <div className="sub-gate-v">Not read on this page</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={false}>
                      <span className="sub-gate-ico">{I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">E-signature</div>
                        <div className="sub-gate-v">Not read on this page</div>
                      </div>
                    </div>
                    {/* Slice 0: always checked, even at "0 files · —", then
                        "No files recorded" from a file count nothing writes.
                        It is the assembled bundle the server records. */}
                    <div className="sub-gate-item" data-ok={sel.bundle !== null}>
                      <span className="sub-gate-ico">{sel.bundle ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">Package</div>
                        <div className="sub-gate-v">
                          {sel.bundle
                            ? `Bundle · ${sel.bundle.size} · SHA-256 ${sel.bundle.sha256.slice(0, 12)}…`
                            : 'No bundle assembled'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="drawer-section-lbl">Activity</div>
                {detail.log === null ? (
                  <div
                    className="version-note"
                    data-testid={detail.logError ? 'submission-activity-error' : 'submission-activity-unread'}
                  >
                    {detail.logError ? 'Could not read the activity log.' : 'Activity not read yet.'}
                  </div>
                ) : detail.log.length === 0 ? (
                  <div className="version-note" data-testid="submission-activity-empty">
                    No milestones recorded.
                  </div>
                ) : (
                  detail.log.map((l, i) => (
                    <div key={i} className="activity-row">
                      <span className="activity-when">{l.when}</span>
                      {/* An unresolved actor renders '—', the repo's unknown-value
                          convention (FilesTreePane). Never a stand-in name. */}
                      <span className="activity-who">{l.who || '—'}</span>
                      <span className="activity-what">{l.what}</span>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
