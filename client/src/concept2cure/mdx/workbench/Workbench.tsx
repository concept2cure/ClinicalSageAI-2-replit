/**
 * Cross-program workbench surfaces:
 *   - TasksSurface         Tasks and reviews — Kanban + list + metrics
 *   - VaultSurface         Document vault — folders × files × version drawer
 *   - ValidationSurface    Validation center — programs matrix + rule list
 *   - SubmissionsSurface   Submission center — pipeline + list + detail drawer
 *   - TemplatesSurface     Templates — index of org-approved boilerplate
 *
 * Ported verbatim from design-system/ui_kits/mdx/Workbench.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import {
  SUBMISSIONS,
  SUBMISSION_PIPELINE,
  TASKS,
  TASKS_COLUMNS,
  TASKS_METRICS,
  TEMPLATES,
  VALIDATION_PROGRAMS,
  VALIDATION_RULES,
  VALIDATION_SUMMARY,
  VAULT_FILES,
  VAULT_FILTERS,
  VAULT_FOLDERS,
  VAULT_VERSIONS,
} from '../data/workbench';
import { useSubmissions, useSubmissionDetail } from '../hooks/useSubmissions';
import { useWorkbenchTasks, useWorkbenchTemplates, useWorkbenchValidation } from '../hooks/useWorkbench';
import { useMdxPrograms } from '../hooks/useMdxPrograms';

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
  const sourceTasks = live.tasks ?? TASKS;
  const sourceMetrics = live.metrics ?? TASKS_METRICS;

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
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Create a new task. Walk me through the fields — program, section, summary, label, due date, assignee, ' +
                  'and whether an e-signature is required — then file it to the right Kanban column.',
              )
            }
          >
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
            <div>Program · §</div>
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
// Vault
// ─────────────────────────────────────────────────────────────────────────────

export function VaultSurface({ onAskAna }: WorkbenchProps) {
  const [folder, setFolder] = React.useState('root');
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState('f1');

  const files = VAULT_FILES.filter(
    f =>
      (folder === 'root' ||
        folder === 'shared' ||
        folder === 'corresp' ||
        f.prog.toLowerCase().replace('-', '') === folder) &&
      (filter === 'all' || f.kind === filter) &&
      (!query || f.name.toLowerCase().includes(query.toLowerCase())),
  );
  const sel = VAULT_FILES.find(f => f.id === selected) || files[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Document vault</h1>
          <div className="page-sub">
            Every program artifact, every version, every signature. 21 CFR Part 11 audit trail.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => {
              const headers = ['Name', 'Type', 'Kind', 'Program', 'Size', 'Version', 'Status', 'Updated', 'Author', 'SHA-256'];
              const rows = VAULT_FILES.map(f => [
                f.name, f.type, f.kind, f.prog, f.size, f.ver, f.status, f.updated, f.author, f.hash,
              ]);
              const csv = [headers, ...rows]
                .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
                .join('\r\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `vault-manifest-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            {I.download} Export manifest
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Walk me through uploading a document to the vault. Confirm the program, section, document type, ' +
                  'version, and whether an e-signature is required, then file it into the right folder with hash + audit entry.',
              )
            }
          >
            {I.plus} Upload
          </button>
        </div>
      </div>

      <div className="vault-layout">
        <aside className="vault-tree">
          <div className="vault-tree-lbl">Folders</div>
          {VAULT_FOLDERS.map(f => (
            <button
              key={f.id}
              className="vault-tree-row"
              data-active={folder === f.id}
              onClick={() => setFolder(f.id)}
            >
              <span className="ico">{I.folder}</span>
              <span className="lbl">{f.label}</span>
              <span className="n">{f.count}</span>
            </button>
          ))}
          <div className="vault-tree-lbl" style={{ marginTop: 14 }}>
            Types
          </div>
          {VAULT_FILTERS.map(f => (
            <button
              key={f.id}
              className="vault-tree-row small"
              data-active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              <span className="lbl">{f.label}</span>
            </button>
          ))}
        </aside>

        <section className="vault-main">
          <div className="vault-searchrow">
            <div className="vault-search">
              <span className="ico">{I.search}</span>
              <input
                placeholder="Search files, hashes, authors…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <span className="vault-meta">
              {files.length} files ·{' '}
              {files.reduce((s, f) => s + parseFloat(f.size), 0).toFixed(1)} MB
            </span>
          </div>

          <div className="ctable">
            <div
              className="ctable-head"
              style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}
            >
              <div>Name</div>
              <div>Type</div>
              <div>Size</div>
              <div>Version</div>
              <div>Status</div>
              <div>Updated</div>
            </div>
            {files.map(f => (
              <button
                key={f.id}
                className="ctable-row"
                style={{ gridTemplateColumns: '1fr 80px 80px 100px 100px 120px' }}
                data-on={selected === f.id}
                onClick={() => setSelected(f.id)}
              >
                <div className="vault-name">
                  <span className={`vault-type ${f.type}`}>{f.type}</span>
                  <span className="ctable-strong">{f.name}</span>
                  {f.blocker && <span className="pill-err small">blocker</span>}
                  {f.esig && (
                    <span className="vault-esig" title="E-signed">
                      {I.shieldCheck}
                    </span>
                  )}
                </div>
                <div>{f.kind}</div>
                <div className="mono">{f.size}</div>
                <div className="mono">{f.ver}</div>
                <div>
                  <span className={`status-pill ${f.status}`}>{f.status}</span>
                </div>
                <div>{f.updated}</div>
              </button>
            ))}
          </div>
        </section>

        <aside className="vault-drawer">
          {sel && (
            <>
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
                <div>
                  <div className="k">Linked</div>
                  <div className="v">{sel.linked} artifacts</div>
                </div>
                <div>
                  <div className="k">Author</div>
                  <div className="v">{sel.author}</div>
                </div>
                <div>
                  <div className="k">SHA-256</div>
                  <div className="v mono tiny">{sel.hash}</div>
                </div>
              </div>

              <div className="drawer-actions">
                <button
                  className="btn primary small"
                  onClick={() =>
                    onAskAna(
                      `Download ${sel.name} (${sel.ver}, ${sel.size}, SHA-256 ${sel.hash}) from the vault — ` +
                        `confirm export is permitted under the program's distribution policy and log the access in the audit trail.`,
                    )
                  }
                >
                  {I.download} Download
                </button>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    onAskAna(
                      `Preview ${sel.name} (${sel.kind} · ${sel.ver}). Surface its outline, key claims, and any open blockers without leaving the vault.`,
                    )
                  }
                >
                  {I.eye} Preview
                </button>
                <button className="btn ghost small" onClick={() => onAskAna(`Summarize ${sel.name}`)}>
                  {I.sparkles} Ask Claude
                </button>
              </div>

              <div className="drawer-section-lbl">Version history</div>
              {VAULT_VERSIONS.map((v, i) => (
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

              <div className="drawer-section-lbl">Audit trail</div>
              <div className="audit-row">
                <span className="mono">AUD-9101</span>
                <span>
                  Signed by {sel.author} · {sel.updated}
                </span>
              </div>
              <div className="audit-row">
                <span className="mono">AUD-9098</span>
                <span>Checksum verified · system</span>
              </div>
              <div className="audit-row">
                <span className="mono">AUD-9094</span>
                <span>Uploaded · {sel.author}</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function ValidationSurface({ onAskAna }: WorkbenchProps) {
  const [sev, setSev] = React.useState<'all' | 'err' | 'warn'>('all');
  const [prog, setProg] = React.useState<string>('all');

  /* Live validation: per-program readiness matrix derived by joining
     /api/submission-ops/blockers with the live program list, plus the
     full rules table (each blocker becomes one row). Falls back to the
     kit fixture during load + on error. */
  const programsState = useMdxPrograms();
  const programsList = programsState.programs ?? [];
  const validation = useWorkbenchValidation(programsList);
  const sourceRules    = validation.rules    ?? VALIDATION_RULES;
  const sourcePrograms = validation.programs ?? VALIDATION_PROGRAMS;
  const sourceSummary  = validation.summary  ?? VALIDATION_SUMMARY;

  const rules = sourceRules.filter(
    r =>
      (sev === 'all' || r.severity === sev) &&
      (prog === 'all' || r.prog === prog),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Validation center</h1>
          <div className="page-sub">
            eSTAR required-field rules and claim-evidence checks, every program, one dashboard.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => {
              const headers = ['Severity', 'Rule', 'Program', 'Section', 'Category', 'Message', 'Since'];
              const rows = sourceRules.map(r => [r.severity, r.id, r.prog, r.sect, r.category, r.msg, r.since]);
              const csv = [headers, ...rows]
                .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
                .join('\r\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `validation-report-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            {I.download} Export report
          </button>
          <button
            className="btn primary small"
            onClick={() => onAskAna('Summarize the 3 blockers across my portfolio')}
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
        <div className="section-head">
          <h2>Readiness by program</h2>
          <span className="section-sub">Column order · errors · warnings · pass</span>
        </div>
        <div className="val-matrix">
          {sourcePrograms.map(p => (
            <button
              key={p.id}
              className="val-prog-card"
              data-on={prog === p.code}
              data-status={p.status}
              onClick={() => setProg(prog === p.code ? 'all' : p.code)}
            >
              <div className="val-prog-head">
                <span className="val-prog-code mono">{p.code}</span>
                <span className={`status-pill ${p.status}`}>{p.status}</span>
              </div>
              <div className="val-prog-title">{p.title}</div>
              <div className="val-prog-path">{p.pathway}</div>
              <div className="val-prog-bars">
                <div className="val-bar">
                  <div className="val-bar-fill" style={{ width: `${p.readiness}%` }} />
                </div>
                <span className="val-bar-pct mono">{p.readiness}%</span>
              </div>
              <div className="val-prog-counts">
                <span className="val-count err">{p.errs} err</span>
                <span className="val-count warn">{p.warns} warn</span>
                <span className="val-count ok">{p.ok} ok</span>
              </div>
            </button>
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
          {prog !== 'all' && (
            <button className="chip-filter" onClick={() => setProg('all')}>
              {prog} {I.close}
            </button>
          )}
        </div>
        <div className="ctable">
          <div
            className="ctable-head"
            style={{ gridTemplateColumns: '88px 110px 110px 140px 1fr 100px' }}
          >
            <div>Sev</div>
            <div>Rule</div>
            <div>Program</div>
            <div>Category</div>
            <div>Message</div>
            <div>Since</div>
          </div>
          {rules.map(r => (
            <div
              key={r.id + r.prog}
              className="ctable-row"
              style={{ gridTemplateColumns: '88px 110px 110px 140px 1fr 100px' }}
            >
              <div>
                <span className={`sev-pill ${r.severity}`}>
                  {r.severity === 'err' ? 'Blocker' : r.severity === 'warn' ? 'Warning' : 'Pass'}
                </span>
              </div>
              <div className="mono">{r.id}</div>
              <div>
                {r.prog} <span style={{ color: 'var(--text-400)' }}>· {r.sect}</span>
              </div>
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

  /* Live submissions from /api/submission-ops/packages. Falls back to the
     kit fixture during the initial fetch and on error so the pipeline
     pane doesn't render with zero counts. When live data returns zero,
     the empty state below is intentional. */
  const live = useSubmissions();
  const sourceSubmissions = live.submissions ?? SUBMISSIONS;

  /* Default selection re-syncs to the first row of the live list when it
     arrives — avoids clicking onto a stale fixture id. */
  React.useEffect(() => {
    if (!sourceSubmissions.length) return;
    const stillExists = selected != null && sourceSubmissions.some((s) => s.id === selected);
    if (!stillExists) setSelected(sourceSubmissions[0].id);
  }, [sourceSubmissions, selected]);

  /* Per-package gate + activity log. The list endpoint omits these (they
     come from /readiness and /milestones), so the detail hook fires when
     a row is selected and merges its results into `sel`. */
  const { gate: liveGate, log: liveLog } = useSubmissionDetail(selected);
  const baseSel = sourceSubmissions.find((s) => s.id === selected);
  const sel = baseSel
    ? {
        ...baseSel,
        gate: liveGate ?? baseSel.gate,
        log:  liveLog  ?? baseSel.log,
      }
    : undefined;

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
          <div className="page-sub">
            Package and transmit — FDA ESG, notified bodies, EU MDR. Status tracking in-flight.
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
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Start a new submission. Walk me through selecting program, target authority (FDA ESG, notified body, EU MDR), ' +
                  'pathway, package contents and cover letter — and run the gate checks before transmission.',
              )
            }
          >
            {I.rocket} New submission
          </button>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Pipeline</h2>
          <span className="section-sub">7 stages from package to decision</span>
        </div>
        <div className="sub-pipeline">
          {SUBMISSION_PIPELINE.map((st, i) => {
            const count = sourceSubmissions.filter(s => s.stage === st.id).length;
            return (
              <div key={st.id} className="sub-stage">
                <div className="sub-stage-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="sub-stage-label">{st.label}</div>
                <div className="sub-stage-desc">{st.desc}</div>
                <div className="sub-stage-n">{count}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Active submissions</h2>
          <span className="section-sub">
            {sourceSubmissions.length} total ·{' '}
            {sourceSubmissions.filter(s => s.status === 'active').length} active ·{' '}
            {sourceSubmissions.filter(s => s.status === 'blocked').length} blocked
          </span>
        </div>
        <div className="sub-layout">
          <div className="sub-list">
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
                <div className="sub-row-meta">
                  <span>{s.target}</span>
                  <span className="dot-sep">·</span>
                  <span>
                    {s.files} files · {s.bytes}
                  </span>
                </div>
                <div className="sub-row-foot">
                  <span className="sub-row-gate">
                    <span className="gate-chip err">{s.gate.errs}</span>
                    <span className="gate-chip warn">{s.gate.warns}</span>
                    <span className="gate-chip ok">{s.gate.ok}</span>
                  </span>
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
                    <div className="sub-detail-target">Target · {sel.target}</div>
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
                    <button
                      className="btn primary small"
                      disabled={sel.gate.errs > 0 || !sel.esig}
                      onClick={() =>
                        onAskAna(
                          sel.status === 'complete'
                            ? `Show me the receipt for ${sel.prog} · ${sel.title} (target ${sel.target}, transmitted ${sel.transmitAt}). ` +
                                'Confirm the ack ID and the post-submission checklist.'
                            : `Transmit ${sel.prog} · ${sel.title} to ${sel.target}. Re-run the gate (validation, cover letter, e-signature, package), ` +
                                'confirm the package hash, then hand off to the ESG/NB transmitter and log the audit entry.',
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
                    <div className="sub-gate-item" data-ok={sel.gate.errs === 0}>
                      <span className="sub-gate-ico">
                        {sel.gate.errs === 0 ? I.check : I.alertCircle}
                      </span>
                      <div>
                        <div className="sub-gate-k">Validation</div>
                        <div className="sub-gate-v">
                          {sel.gate.errs} err · {sel.gate.warns} warn · {sel.gate.ok} pass
                        </div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={sel.cover === 'signed'}>
                      <span className="sub-gate-ico">
                        {sel.cover === 'signed' ? I.check : I.alertCircle}
                      </span>
                      <div>
                        <div className="sub-gate-k">Cover letter</div>
                        <div className="sub-gate-v">{sel.cover}</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={sel.esig}>
                      <span className="sub-gate-ico">{sel.esig ? I.check : I.alertCircle}</span>
                      <div>
                        <div className="sub-gate-k">E-signature</div>
                        <div className="sub-gate-v">{sel.esig ? 'Signed' : 'Pending'}</div>
                      </div>
                    </div>
                    <div className="sub-gate-item" data-ok={true}>
                      <span className="sub-gate-ico">{I.check}</span>
                      <div>
                        <div className="sub-gate-k">Package</div>
                        <div className="sub-gate-v">
                          {sel.files} files · {sel.bytes}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="drawer-section-lbl">Activity</div>
                {sel.log.map((l, i) => (
                  <div key={i} className="activity-row">
                    <span className="activity-when">{l.when}</span>
                    <span className="activity-who">{l.who}</span>
                    <span className="activity-what">{l.what}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export function TemplatesSurface({ onAskAna }: WorkbenchProps) {
  /* Live templates from /api/templates (already aggregates indTemplates +
     documentTemplates + ectdTemplates server-side). Falls back to fixture
     during load + on error. */
  const live = useWorkbenchTemplates();
  const sourceTemplates = live.templates ?? TEMPLATES;
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">
            Reusable section skeletons and boilerplate. Org-approved, version-controlled.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Create a new org-approved template. Walk me through name, owner, applicable pathways (510(k), PMA, CER), ' +
                  'tags, and the section skeleton — then version-control it.',
              )
            }
          >
            {I.plus} New template
          </button>
        </div>
      </div>
      <div className="tpl-grid">
        {sourceTemplates.map(t => (
          <button
            key={t.id}
            className="tpl-card"
            onClick={() =>
              onAskAna(
                `Open template "${t.name}" — owned by ${t.owner}, ${t.uses} uses, updated ${t.updated}. ` +
                  `Show me the section skeleton and how to apply it to a program.`,
              )
            }
          >
            <div className="tpl-head">
              <span className="tpl-ico">{I.template}</span>
              <span className="tpl-uses">{t.uses} uses</span>
            </div>
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-meta">
              {t.owner} · updated {t.updated}
            </div>
            <div className="tpl-tags">
              {t.tags.map(tag => (
                <span key={tag} className="tpl-tag">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
