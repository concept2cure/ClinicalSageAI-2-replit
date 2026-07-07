import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { getSegmentModules, getSurfaceMeta } from '../registryModel';
import {
  PROJH, PV_TREE, pvAllDocs, pvStats, PROJ_MEETINGS,
  PJ_LIFECYCLE, PJ_STAGE_NEXT, PJ_STAGE_TOOLS,
  Ring, pjInitials, fileTone,
  TASK_TONE, TASK_LABEL, PRI_TONE, PHASE_TONE, GOAL_TONE, FIND_TONE,
  KANBAN_COLS, TASK_TONE2, TASK_LABEL2, PRI_TONE2,
  PV_TYPE_BG, MTG_TONE, STAT_ORDER,
  type ProjH, type ProjTask, type ProjFile, type PvNode,
} from '../fixtures/project-home-data';
import '../styles/project-home-v2.css';

/* ── Window globals — cross-surface data providers (gap until backing modules port) ── */
declare global {
  interface Window {
    C2C_PROJECT?: Record<string, string>;
    C2C_CONVO?: Record<string, string>;
    C2C?: Record<string, (...args: unknown[]) => void>;
    __C2C_SEGMENT?: string;
    ETMF_DATA?: {
      tmf: string; model: string;
      zones: { zone: string; name: string; total: number; received: number; missing: number; inReview: number }[];
      criticalGaps: { zone: string; artifact: string }[];
    };
    GRANT_DATA?: {
      awards: {
        title: string; pi: string; number: string; mechanism: string; agency: string;
        periodStart: string; periodEnd: string; budgetTotal: number; budgetSpent: number;
        milestones: { title: string; type: string; status: string; due: string }[];
        subawards: { name: string; uei: string; amount: number; risk: string; screen: string; status: string }[];
      }[];
    };
    SUBMISSION_PIPELINE?: { id: string; label: string; desc: string }[];
    SUBMISSION_GATEWAYS?: { id: string; label: string; region: string; live: boolean }[];
    SUBMISSIONS?: {
      id: string; title: string; prog: string; type: string; gateway: string;
      stage: string; status: string; files: number; bytes: string; target: string;
      cover: string; esig: boolean; gate: { errs: number; warns: number; ok: number };
    }[];
  }
}

const PS_STAGE_TONE: Record<string, string> = {
  build: 'idle', validate: 'warn', sign: 'acc', package: 'acc', transmit: 'ai', ack: 'ok', decision: 'ok',
};

/* ════ Project Tasks — kanban + critical path + schedule ════ */

function ProjectTasks({ onNav }: { onNav: (id: string) => void }) {
  const T = PROJH.tasks;
  const byStatus: Record<string, ProjTask[]> = {};
  for (const s of KANBAN_COLS) byStatus[s] = T.filter(t => t.status === s);
  const doneIds = T.filter(t => t.status === 'done').map(t => t.id);
  const nextAvail = T.filter(t => t.status === 'todo' && (t.dependsOn || []).every(d => doneIds.indexOf(d) > -1));
  const critPath = T.filter(t => t.critical && t.status !== 'done');
  const [view, setView] = useState('board');

  const taskCard = (t: ProjTask, showDeps: boolean) => (
    <div key={t.id} className="pt-card" data-crit={t.critical || undefined}>
      <div className="pt-card-top">
        <span className={`rd-chip tone-${PRI_TONE2[t.priority]}`}>{t.priority}</span>
        {t.ctq && <span className="pj-task-ctq" title="Critical to quality">CtQ</span>}
        <span className="pt-card-id">{t.id}</span>
      </div>
      <div className="pt-card-name">{t.name}</div>
      <div className="pt-card-meta">
        <span className="pt-card-mod">{t.module}</span>
        <span className="pt-card-asgn">{t.assignee}</span>
      </div>
      {showDeps && (t.dependsOn || []).length > 0 && (
        <div className="pt-card-deps">{I.gitCompare} {t.dependsOn.join(', ')}</div>
      )}
      <div className="pt-card-foot">
        <span className="pt-card-due">{t.due}</span>
        {t.blockedReason && <span className="pt-card-block">{I.alertTriangle} {t.blockedReason}</span>}
      </div>
    </div>
  );

  return (
    <div className="pt-wrap">
      <div className="pt-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Tasks &amp; collaboration</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-400)' }}>{T.length} project tasks · linked to the {PROJH.pyramid.pathway} pyramid · org board: {PROJH.board.orgTotal} total</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className={'btn' + (view === 'board' ? ' primary' : ' ghost')} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setView('board')}>{I.grid} Board</button>
          <button className={'btn' + (view === 'list' ? ' primary' : ' ghost')} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setView('list')}>{I.list} List</button>
          <button className={'btn' + (view === 'schedule' ? ' primary' : ' ghost')} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setView('schedule')}>{I.calendar} Schedule</button>
        </div>
      </div>

      <div className="pj-tstat" style={{ margin: '16px 0' }}>
        {KANBAN_COLS.map(s => (
          <button key={s} className="pj-tstat-c" data-tone={TASK_TONE2[s]}>
            <span className="pj-tstat-n">{byStatus[s].length}</span>
            <span className="pj-tstat-l">{TASK_LABEL2[s]}</span>
          </button>
        ))}
      </div>

      {view === 'board' && (
        <div className="pt-board">
          {KANBAN_COLS.map(col => (
            <div key={col} className="pt-col">
              <div className="pt-col-h" data-tone={TASK_TONE2[col]}>
                <span className="pt-col-dot" />
                <span>{TASK_LABEL2[col]}</span>
                <span className="pt-col-n">{byStatus[col].length}</span>
              </div>
              <div className="pt-col-body">
                {byStatus[col].map(t => taskCard(t, true))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (<>
        <div className="pj-tgrp-h" style={{ marginTop: 8 }}>{I.zap} Critical path · {critPath.length} open</div>
        <div className="pj-tasks">
          {critPath.map(t => (
            <div key={t.id} className="pj-task" data-crit="true">
              <span className={`pj-task-dot tone-${TASK_TONE2[t.status]}`} />
              <div className="pj-task-b">
                <div className="pj-task-t">{t.name}{t.ctq && <span className="pj-task-ctq" title="Critical to quality">CtQ</span>}</div>
                <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · {TASK_LABEL2[t.status]} · {t.assignee}{(t.dependsOn || []).length > 0 && <span className="pj-task-dep">{I.gitCompare} depends on {t.dependsOn.join(', ')}</span>}</div>
              </div>
              <div className="pj-task-r"><span className={`rd-chip tone-${PRI_TONE2[t.priority]}`}>{t.priority}</span><span className="pj-task-due">{t.due}</span></div>
            </div>
          ))}
        </div>

        <div className="pj-tgrp-h">{I.check} Ready to work · {nextAvail.length} unblocked</div>
        <div className="pj-tasks">
          {nextAvail.map(t => (
            <div key={t.id} className="pj-task">
              <span className={`pj-task-dot tone-${TASK_TONE2[t.status]}`} />
              <div className="pj-task-b">
                <div className="pj-task-t">{t.name}</div>
                <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · {t.assignee}</div>
              </div>
              <div className="pj-task-r"><span className={`rd-chip tone-${PRI_TONE2[t.priority]}`}>{t.priority}</span><span className="pj-task-due">{t.due}</span></div>
            </div>
          ))}
        </div>

        <div className="pj-tgrp-h">{I.list} All tasks · {T.length}</div>
        <div className="pj-tasks">
          {T.map(t => (
            <div key={t.id} className="pj-task">
              <span className={`pj-task-dot tone-${TASK_TONE2[t.status]}`} />
              <div className="pj-task-b">
                <div className="pj-task-t">{t.name}{t.ctq && <span className="pj-task-ctq">CtQ</span>}</div>
                <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · {TASK_LABEL2[t.status]} · {t.assignee}</div>
              </div>
              <div className="pj-task-r"><span className={`rd-chip tone-${PRI_TONE2[t.priority]}`}>{t.priority}</span><span className="pj-task-due">{t.due}</span></div>
            </div>
          ))}
        </div>
      </>)}

      {view === 'schedule' && (
        <div>
          <div className="pj-sched">
            <div className="pj-sched-h"><span className="pj-sched-ai">{I.sparkles} Schedule of events</span><span className="pj-sched-conf">AnA-generated · confidence {PROJH.schedule.confidence.toFixed(2)} · {PROJH.schedule.updated}</span></div>
            <p className="pj-sched-basis">{PROJH.schedule.basis}</p>
            <div className="pj-goals">
              {PROJH.schedule.goals.map((g, i) => (
                <span key={i} className="pj-goal" data-tone={GOAL_TONE[g.status]}><span className="pj-goal-dot" />{g.t}<em>{g.when} · {g.status.replace('_', ' ')}</em></span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="pj-tgrp-h">{I.checkCircle} Reviews &amp; approvals</div>
            <div className="pj-tasks">
              {T.filter(t => t.status === 'review').map(t => (
                <div key={t.id} className="pj-task">
                  <span className="pj-task-dot tone-warn" />
                  <div className="pj-task-b">
                    <div className="pj-task-t">{t.name}</div>
                    <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · Pending review · {t.assignee}</div>
                  </div>
                  <div className="pj-task-r"><span className="rd-chip tone-warn">review</span><span className="pj-task-due">{t.due}</span></div>
                </div>
              ))}
              {T.filter(t => t.status === 'review').length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--text-400)' }}>No items pending review</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════ eTMF — DIA TMF Reference Model 11-zone completeness ════ */

function TMFPanel() {
  const D = window.ETMF_DATA;
  if (!D) return null;
  const total = D.zones.reduce((s, z) => s + z.total, 0);
  const received = D.zones.reduce((s, z) => s + z.received, 0);
  const missing = D.zones.reduce((s, z) => s + z.missing, 0);
  const pct = Math.round(received / total * 100);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pm-wrap" style={{ marginTop: 20 }}>
      <div className="pm-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>eTMF — Trial Master File</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-400)' }}>{D.tmf} · DIA {D.model} · {pct}% complete · {missing} artifacts missing</p>
        </div>
        <button className="btn ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand zones'}</button>
      </div>
      <div style={{ height: 6, background: 'var(--bg-200)', borderRadius: 3, margin: '12px 0 8px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: 'var(--success)', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      {D.criticalGaps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="pj-tgrp-h" style={{ marginTop: 0, color: 'var(--error)' }}>{I.alertTriangle} Critical gaps · {D.criticalGaps.length}</div>
          {D.criticalGaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="rd-chip tone-err">missing</span>
              <span style={{ fontSize: 12, flex: 1 }}>Zone {g.zone} — {g.artifact}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8, marginTop: 8 }}>
          {D.zones.map((z, i) => {
            const zpct = Math.round(z.received / z.total * 100);
            const tone = z.missing > 0 ? 'err' : z.inReview > 0 ? 'warn' : 'ok';
            return (
              <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-100)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-400)' }}>Zone {z.zone}</span>
                  <span className={`rd-chip tone-${tone}`} style={{ fontSize: 10 }}>{zpct}%</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{z.name}</div>
                <div style={{ height: 3, background: 'var(--bg-200)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: zpct + '%', background: z.missing > 0 ? 'var(--error)' : 'var(--success)', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-400)', marginTop: 3 }}>{z.received}/{z.total} received{z.missing > 0 ? ` · ${z.missing} missing` : ''}{z.inReview > 0 ? ` · ${z.inReview} in review` : ''}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════ Grants — NIH/SBIR awards + milestones + budget ════ */

function GrantsPanel() {
  const D = window.GRANT_DATA;
  if (!D) return null;
  const [selAward, setSelAward] = useState<number | null>(null);
  const aw = selAward != null ? D.awards[selAward] : null;
  const mechLabel: Record<string, string> = { r01: 'R01', sbir: 'SBIR', sttr: 'STTR', r21: 'R21', u01: 'U01', contract: 'Contract' };
  const msStatusTone: Record<string, string> = { met: 'ok', in_progress: 'ai', pending: 'idle', missed: 'err', submitted: 'ok' };
  const msTypeIcon: Record<string, React.ReactElement> = { regulatory: I.clipboardList, progress_report: I.penLine, scientific: I.microscope, deliverable: I.folder, financial_report: I.creditCard };
  return (
    <div className="pm-wrap" style={{ marginTop: 20 }}>
      <div className="pm-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Grants &amp; funding</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-400)' }}>{D.awards.length} active awards · {D.awards.reduce((s, a) => s + a.milestones.filter(m => m.status === 'pending' || m.status === 'in_progress').length, 0)} milestones upcoming</p>
        </div>
        <button className="btn primary" style={{ fontSize: 12, padding: '5px 14px' }}>{I.plus} New opportunity</button>
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {D.awards.map((a, i) => {
            const spentPct = Math.round(a.budgetSpent / a.budgetTotal * 100);
            const upcoming = a.milestones.filter(m => m.status === 'pending' || m.status === 'in_progress');
            return (
              <button key={i} className="pj-task" data-on={selAward === i || undefined} onClick={() => setSelAward(selAward === i ? null : i)} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="rd-chip tone-ai">{(mechLabel[a.mechanism] || a.mechanism).toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{a.agency.toUpperCase()}</span>
                  <span className="rd-chip tone-ok" style={{ marginLeft: 'auto' }}>active</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, textAlign: 'left' }}>{a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-400)', textAlign: 'left' }}>PI: {a.pi} · {a.number} · {a.periodStart} – {a.periodEnd}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 4, background: 'var(--bg-200)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: spentPct + '%', background: 'var(--accent-100)', borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-400)', marginTop: 2 }}>${(a.budgetSpent / 1e6).toFixed(2)}M of ${(a.budgetTotal / 1e6).toFixed(2)}M ({spentPct}% spent)</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-300)' }}>{upcoming.length} upcoming milestones</span>
                </div>
              </button>
            );
          })}
        </div>
        {aw && (
          <div className="pm-detail">
            <div className="pm-detail-h">
              <span className="rd-chip tone-ai">{(mechLabel[aw.mechanism] || aw.mechanism).toUpperCase()}</span>
              <span className="pm-detail-id">{aw.number}</span>
              <button className="cv-icbtn" onClick={() => setSelAward(null)} style={{ marginLeft: 'auto' }}>{I.close}</button>
            </div>
            <h3 style={{ margin: '8px 0 4px', fontSize: 14, lineHeight: 1.3 }}>{aw.title}</h3>
            <div className="pm-detail-row"><span className="pm-detail-k">PI</span><span>{aw.pi}</span></div>
            <div className="pm-detail-row"><span className="pm-detail-k">Period</span><span>{aw.periodStart} – {aw.periodEnd}</span></div>
            <div className="pm-detail-row"><span className="pm-detail-k">Total</span><span>${(aw.budgetTotal / 1e6).toFixed(2)}M</span></div>
            <div style={{ marginTop: 10 }}>
              <div className="pm-detail-k" style={{ marginBottom: 6 }}>Milestones ({aw.milestones.length})</div>
              {aw.milestones.map((m, mi) => (
                <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12 }}>{msTypeIcon[m.type] || I.dot}</span>
                  <span className={`rd-chip tone-${msStatusTone[m.status] || 'idle'}`}>{m.status.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 12, flex: 1 }}>{m.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{m.due}</span>
                </div>
              ))}
            </div>
            {aw.subawards.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="pm-detail-k" style={{ marginBottom: 6 }}>Subawards (2 CFR 200.331)</div>
                {aw.subawards.map((s, si) => (
                  <div key={si} style={{ padding: '5px 8px', background: 'var(--bg-100)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`rd-chip tone-${s.screen === 'cleared' ? 'ok' : 'err'}`}>{s.screen}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
                      <span style={{ color: 'var(--text-400)' }}>${(s.amount / 1e3).toFixed(0)}K</span>
                    </div>
                    <div style={{ color: 'var(--text-400)', marginTop: 2 }}>UEI: {s.uei} · Risk: {s.risk} · Status: {s.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════ Project Meetings — agency meetings scoped to this project ════ */

function ProjectMeetings({ onNav }: { onNav: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const upcoming = PROJ_MEETINGS.filter(m => m.status !== 'completed');
  const past = PROJ_MEETINGS.filter(m => m.status === 'completed');
  const detail = sel ? PROJ_MEETINGS.find(m => m.id === sel) : null;

  return (
    <div className="pm-wrap">
      <div className="pm-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Agency meetings</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-400)' }}>{PROJ_MEETINGS.length} meetings · {upcoming.length} upcoming · {past.length} completed</p>
        </div>
        <button className="btn primary" style={{ fontSize: 12, padding: '5px 14px' }}>{I.plus} Request meeting</button>
      </div>

      <div className="pm-body" style={{ display: 'flex', gap: 20, marginTop: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pj-tgrp-h" style={{ marginTop: 0 }}>{I.calendar} Upcoming &amp; pending · {upcoming.length}</div>
          <div className="pj-tasks">
            {upcoming.map(m => (
              <button key={m.id} className="pj-task" data-on={sel === m.id || undefined} onClick={() => setSel(m.id)}>
                <span className={`pj-task-dot tone-${MTG_TONE[m.status]}`} />
                <div className="pj-task-b">
                  <div className="pj-task-t">{m.topic}</div>
                  <div className="pj-task-m">{m.id} · {m.type} · {m.agency} · {m.attendees.length} attendees</div>
                </div>
                <div className="pj-task-r">
                  <span className={`rd-chip tone-${MTG_TONE[m.status]}`}>{m.status}</span>
                  <span className="pj-task-due">{m.date}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="pj-tgrp-h">{I.checkCircle} Completed · {past.length}</div>
          <div className="pj-tasks">
            {past.map(m => (
              <button key={m.id} className="pj-task" data-on={sel === m.id || undefined} onClick={() => setSel(m.id)}>
                <span className="pj-task-dot tone-ok" />
                <div className="pj-task-b">
                  <div className="pj-task-t">{m.topic}</div>
                  <div className="pj-task-m">{m.id} · {m.type} · {m.agency}</div>
                </div>
                <div className="pj-task-r">
                  <span className="rd-chip tone-ok">completed</span>
                  <span className="pj-task-due">{m.date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {detail && (
          <div className="pm-detail">
            <div className="pm-detail-h">
              <span className={`rd-chip tone-${MTG_TONE[detail.status]}`}>{detail.status}</span>
              <span className="pm-detail-id">{detail.id}</span>
              <button className="cv-icbtn" onClick={() => setSel(null)} style={{ marginLeft: 'auto' }}>{I.close}</button>
            </div>
            <h3 style={{ margin: '8px 0 4px', fontSize: 15 }}>{detail.topic}</h3>
            <div className="pm-detail-row"><span className="pm-detail-k">Type</span><span>{detail.type}</span></div>
            <div className="pm-detail-row"><span className="pm-detail-k">Agency</span><span>{detail.agency}</span></div>
            <div className="pm-detail-row"><span className="pm-detail-k">Date</span><span>{detail.date}</span></div>
            <div className="pm-detail-row"><span className="pm-detail-k">Attendees</span><span>{detail.attendees.join(', ')}</span></div>
            {detail.outcome && (
              <div style={{ marginTop: 10 }}>
                <div className="pm-detail-k" style={{ marginBottom: 4 }}>FDA/Agency outcome</div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-200)' }}>{detail.outcome}</p>
              </div>
            )}

            {detail.questions && detail.questions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="pm-detail-k" style={{ marginBottom: 6 }}>Meeting questions ({detail.questions.length})</div>
                {detail.questions.map((q, qi) => (
                  <div key={qi} style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--bg-100)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-000)', color: 'var(--accent-200)', borderRadius: 4, padding: '1px 6px' }}>Q{q.num}</span>
                      {q.agreed && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--success)' }}>{I.check} Agreement reached</span>}
                      {!q.agreed && q.agencyResp === null && <span style={{ fontSize: 10, color: 'var(--text-400)' }}>Awaiting response</span>}
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-200)', lineHeight: 1.4 }}>{q.text}</p>
                    <div style={{ fontSize: 11, color: 'var(--text-400)', marginBottom: 3 }}><b>Sponsor position:</b> {q.sponsorPos}</div>
                    {q.agencyResp && <div style={{ fontSize: 11, color: 'var(--text-200)', background: 'var(--bg-000)', borderRadius: 5, padding: '5px 8px', marginTop: 4 }}><b>Agency response:</b> {q.agencyResp}</div>}
                    {!q.agencyResp && <div style={{ fontSize: 11, color: 'var(--text-400)', fontStyle: 'italic' }}>Agency response pending</div>}
                  </div>
                ))}
              </div>
            )}

            {detail.commitments && detail.commitments.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="pm-detail-k" style={{ marginBottom: 6 }}>Regulatory commitments</div>
                {detail.commitments.map((c, ci) => {
                  const cTone: Record<string, string> = { open: 'warn', in_progress: 'ai', submitted: 'ai', fulfilled: 'ok', overdue: 'err', waived: 'idle', released: 'ok' };
                  const cLabel: Record<string, string> = { pmr: 'PMR', pmc: 'PMC', rems: 'REMS', meeting_commitment: 'Meeting commitment', other: 'Other' };
                  return (
                    <div key={ci} style={{ marginBottom: 8, padding: '7px 10px', background: 'var(--bg-100)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--bg-200)', color: 'var(--text-300)', borderRadius: 4, padding: '1px 6px' }}>{cLabel[c.type] || c.type}</span>
                        <span className={`rd-chip tone-${cTone[c.status] || 'idle'}`}>{c.status.replace(/_/g, ' ')}</span>
                        {c.due && <span style={{ fontSize: 11, color: 'var(--text-400)', marginLeft: 'auto' }}>Due {c.due}</span>}
                      </div>
                      <p style={{ margin: '0 0 3px', fontSize: 12, color: 'var(--text-200)' }}>{c.desc}</p>
                      {c.basis && <div style={{ fontSize: 10, color: 'var(--text-400)' }}>{c.basis}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {detail.documents.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="pm-detail-k" style={{ marginBottom: 4 }}>Documents</div>
                {detail.documents.map((d, di) => (
                  <div key={di} className="pm-doc">{I.fileText} {d}</div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              {detail.status !== 'completed' && <button className="btn primary" style={{ fontSize: 12, padding: '4px 12px' }}>{I.penLine} Prepare briefing</button>}
              <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }}>{I.download} Export minutes</button>
              <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }}>{I.sparkles} Ask AnA</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════ Project Submissions — gateway pipeline scoped to this project ════ */

function ProjectSubmissions({ onNav }: { onNav: (id: string) => void }) {
  const stages = window.SUBMISSION_PIPELINE || [];
  const gateways = window.SUBMISSION_GATEWAYS || [];
  const allSubs = window.SUBMISSIONS || [];
  const subs = allSubs.filter(s => s.prog === 'NDA 212345' || s.prog === 'BX-204');

  return (
    <div className="ps-wrap">
      <div className="ps-section">
        <div className="ps-sec-h"><h3>Agency gateways</h3><span className="sec-sub">{gateways.length} configured · {gateways.filter(g => g.live).length} live</span></div>
        <div className="ps-gateways">
          {gateways.map((g: Record<string, unknown>) => (
            <div key={g.id as string} className="ps-gw" data-live={(g.live as boolean) || undefined}>
              <span className="ps-gw-dot" data-live={(g.live as boolean) || undefined} />
              <span className="ps-gw-label">{g.label as string}</span>
              <span className="ps-gw-region">{g.region as string}</span>
              <span className={'ps-gw-status ' + ((g.live as boolean) ? 'live' : 'offline')}>{(g.live as boolean) ? 'Live' : 'Offline'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ps-section">
        <div className="ps-sec-h"><h3>Submission pipeline</h3><span className="sec-sub">7-stage build → dispatch → decision</span></div>
        <div className="ps-pipeline">
          {stages.map((st: Record<string, string>, i: number) => (
            <div key={st.id} className="ps-pipe-stage">
              <div className="ps-pipe-num">{i + 1}</div>
              <div className="ps-pipe-info">
                <div className="ps-pipe-label">{st.label}</div>
                <div className="ps-pipe-desc">{st.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ps-section">
        <div className="ps-sec-h"><h3>This project's submissions</h3><span className="sec-sub">{subs.length} active</span>
          <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px' }} onClick={() => onNav('submission-center')}>{I.plus} New submission</button>
        </div>
        <div className="ps-subs">
          {subs.map((s: Record<string, unknown>) => {
            const stageIdx = stages.findIndex((st: Record<string, string>) => st.id === (s.stage as string));
            const gate = s.gate as { errs: number; warns: number; ok: number };
            return (
              <button key={s.id as string} className="ps-sub-card" onClick={() => onNav('submission-center')}>
                <div className="ps-sub-top">
                  <span className="ps-sub-title">{s.title as string}</span>
                  <span className={'rd-chip tone-' + ((s.status as string) === 'blocked' ? 'err' : (s.status as string) === 'complete' ? 'ok' : 'acc')}>{s.status as string}</span>
                </div>
                <div className="ps-sub-meta">
                  <span>{s.type as string} · {(s.gateway as string).toUpperCase()}</span>
                  <span>{s.files as number} files · {s.bytes as string}</span>
                  <span>{s.target as string}</span>
                </div>
                <div className="ps-sub-pipe">
                  {stages.map((st: Record<string, string>, si: number) => (
                    <div key={st.id} className="ps-sub-step" data-done={si < stageIdx || undefined} data-active={si === stageIdx || undefined} data-future={si > stageIdx || undefined} title={st.label}>
                      <div className="ps-sub-step-dot" />
                      <span className="ps-sub-step-l">{st.label}</span>
                    </div>
                  ))}
                </div>
                <div className="ps-sub-gate">
                  <span className="ps-gate-item tone-err">{gate.errs} errors</span>
                  <span className="ps-gate-item tone-warn">{gate.warns} warnings</span>
                  <span className="ps-gate-item tone-ok">{gate.ok} passed</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-400)' }}>Cover: {s.cover as string} · E-sig: {(s.esig as boolean) ? I.check : 'pending'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ps-section">
        <div className="ps-sec-h"><h3>All submissions across org</h3><span className="sec-sub">{allSubs.length} total</span>
          <button className="btn ghost" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }} onClick={() => onNav('submission-center')}>Open Submission Center {I.right}</button>
        </div>
        <div className="ctable" style={{ marginTop: 8 }}>
          <div className="ct-head" style={{ gridTemplateColumns: '1.5fr 70px 70px 90px 80px 1fr' }}><div>Program</div><div>Type</div><div>Gateway</div><div>Stage</div><div>Status</div><div>Target</div></div>
          {allSubs.map((s: Record<string, unknown>) => (
            <button key={s.id as string} className="ct-row" style={{ gridTemplateColumns: '1.5fr 70px 70px 90px 80px 1fr' }} onClick={() => onNav('submission-center')}>
              <div className="ct-strong">{s.prog as string}</div>
              <div style={{ fontSize: 11 }}>{s.type as string}</div>
              <div style={{ fontSize: 11 }}>{(s.gateway as string).toUpperCase()}</div>
              <div><span className={'rd-chip tone-' + (PS_STAGE_TONE[s.stage as string] || 'idle')}>{s.stage as string}</span></div>
              <div><span className={'rd-chip tone-' + ((s.status as string) === 'blocked' ? 'err' : (s.status as string) === 'complete' ? 'ok' : 'acc')}>{s.status as string}</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-400)' }}>{s.target as string}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════ Project Vault — folder tree + file list + detail drawer ════ */

function ProjectVault({ onNav }: { onNav: (id: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    PV_TREE.forEach(m => s.add(m.id));
    return s;
  });
  const [selFolder, setSelFolder] = useState<string | null>(null);
  const [selFile, setSelFile] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const toggle = (id: string) => setExpanded(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const filesIn = (node: PvNode): PvNode[] => {
    const out: PvNode[] = [];
    if (!node.children) return [node];
    node.children.forEach(c => {
      if (c.children && c.children.length && c.children[0].name) out.push(...c.children);
      else if (c.name) out.push(c);
      else out.push(...filesIn(c));
    });
    return out;
  };

  const findNode = (nodes: PvNode[], id: string): PvNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  };

  const selNode = selFolder ? findNode(PV_TREE, selFolder) : null;
  const visibleFiles = selNode ? filesIn(selNode) : pvAllDocs;
  const filtered = q ? visibleFiles.filter(f => f.name && f.name.toLowerCase().includes(q.toLowerCase())) : visibleFiles.filter(f => f.name);
  const file = selFile ? pvAllDocs.find(f => f.id === selFile) ?? null : null;

  const renderNode = (node: PvNode, depth = 0): React.ReactNode => {
    const isModule = depth === 0;
    const isDocFolder = !!(node.children && node.children.length && node.children[0].name);
    const hasChildren = !!(node.children && node.children.length > 0);
    const isEmpty = !!(node.children && node.children.length === 0);
    const isOpen = expanded.has(node.id);
    const docCount = filesIn(node).filter(f => f.name).length;
    const isSel = selFolder === node.id;

    return (
      <div key={node.id}>
        <button className="pv-node" data-depth={depth} data-sel={isSel || undefined} data-module={isModule || undefined}
          onClick={() => { toggle(node.id); setSelFolder(node.id); setSelFile(null); }}>
          <span className="pv-arrow" data-open={isOpen || undefined} data-leaf={(!hasChildren) || undefined}>
            {hasChildren ? (isOpen ? I.down : I.right) : ''}
          </span>
          <span className="pv-icon">{isModule ? I.folder : (isDocFolder ? I.fileText : I.folder)}</span>
          <span className="pv-label">{node.label}</span>
          <span className="pv-count">{docCount > 0 ? docCount : (isEmpty ? '—' : '')}</span>
        </button>
        {isOpen && hasChildren && (
          <div className="pv-children">
            {node.children!.map(c => c.name ? null : renderNode(c, depth + 1))}
            {isDocFolder && node.children!.filter(c => c.name).length > 0 && (
              <div className="pv-doc-hints">
                {node.children!.filter(c => c.name).map(d => (
                  <button key={d.id} className="pv-doc-hint" data-sel={selFile === d.id || undefined}
                    onClick={e => { e.stopPropagation(); setSelFolder(node.id); setSelFile(d.id); }}>
                    <span className="pv-doc-badge" style={{ background: PV_TYPE_BG[d.type || ''] || '#666' }}>{(d.type || '').toUpperCase()}</span>
                    <span className="pv-doc-name">{d.name}</span>
                    <span className={'pv-doc-status tone-' + fileTone(d.status || '')}>{d.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pv-wrap">
      <div className="pv-stats">
        <span className="pv-stat"><b>{pvStats.total}</b> documents</span>
        <span className="pv-stat tone-ok"><b>{pvStats.approved}</b> approved</span>
        <span className="pv-stat tone-warn"><b>{pvStats.review}</b> in review</span>
        <span className="pv-stat tone-idle"><b>{pvStats.draft}</b> draft</span>
        <span className="pv-stat tone-acc"><b>{pvStats.esig}</b> e-signed</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }}>{I.download} Export manifest</button>
        <button className="btn primary" style={{ fontSize: 12, padding: '4px 10px' }}>{I.plus} Upload</button>
      </div>

      <div className="pv-layout">
        <aside className="pv-tree">
          <div className="pv-tree-head">Folder tree</div>
          <div className="pv-tree-scroll">
            {PV_TREE.map(m => renderNode(m, 0))}
          </div>
        </aside>

        <section className="pv-files">
          <div className="pv-files-head">
            <span className="pv-files-title">{selNode ? selNode.label : 'All documents'}</span>
            <span className="pv-files-count">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="pv-search">
            <span className="ico">{I.search}</span>
            <input placeholder="Search files…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="pv-file-list">
            {filtered.length === 0 && <div className="pv-empty">No documents in this folder yet</div>}
            {filtered.map(f => (
              <button key={f.id} className="pv-file-row" data-sel={selFile === f.id || undefined} onClick={() => setSelFile(f.id)}>
                <span className="pv-file-badge" style={{ background: PV_TYPE_BG[f.type || ''] || '#666' }}>{(f.type || '').toUpperCase()}</span>
                <div className="pv-file-info">
                  <div className="pv-file-name">{f.name}</div>
                  <div className="pv-file-meta">{f.ver} · {f.author} · {f.updated}</div>
                </div>
                <span className={'pv-file-status tone-' + fileTone(f.status || '')}>{f.status}</span>
                {f.esig && <span className="pv-esig" title="E-signed">{I.shieldCheck}</span>}
              </button>
            ))}
          </div>
        </section>

        <aside className="pv-detail">
          {file ? (
            <div>
              <div className="pv-det-badge" style={{ background: PV_TYPE_BG[file.type || ''] || '#666' }}>{(file.type || '').toUpperCase()}</div>
              <div className="pv-det-name">{file.name}</div>
              <div className="pv-det-grid">
                <span className="k">Version</span><span className="v mono">{file.ver}</span>
                <span className="k">Status</span><span className={'v tone-' + fileTone(file.status || '')}>{file.status}</span>
                <span className="k">Author</span><span className="v">{file.author}</span>
                <span className="k">Updated</span><span className="v">{file.updated}</span>
                <span className="k">Size</span><span className="v">{file.size}</span>
                <span className="k">E-signature</span><span className="v">{file.esig ? <>{I.check} Signed</> : 'Not signed'}</span>
              </div>
              <div className="pv-det-actions">
                <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onNav('document-authoring')}>{I.externalLink} Open in editor</button>
                <button className="btn ghost">{I.download} Download</button>
              </div>
              <div className="pv-det-section">
                <div className="pv-det-sec-h">Version history</div>
                <div className="pv-ver-row"><span className="mono">v0.1</span><span>Initial upload · {file.author}</span></div>
                {file.ver !== 'v0.1' && file.ver !== 'v0.0' && <div className="pv-ver-row"><span className="mono">{file.ver}</span><span>Current · {file.updated}</span></div>}
              </div>
            </div>
          ) : (
            <div className="pv-det-empty">
              <span className="ico" style={{ fontSize: 28, color: 'var(--text-400)' }}>{I.fileText}</span>
              <p>Select a document to see details</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ════ Lifecycle ════ */

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

/* ════ ProjectHome — the full workspace surface ════ */

interface InlineMsg {
  role: 'user' | 'ana';
  text: string;
}

export function ProjectHome({ onAsk, onNav, segment }: SurfaceViewProps) {
  const sel = window.C2C_PROJECT ?? null;
  const p = sel
    ? { ...PROJH.program, title: sel.title ?? PROJH.program.title, productName: sel.product ?? String(sel.title ?? '').split(' ')[0], submissionType: sel.code ?? PROJH.program.submissionType, clientType: sel.ws ?? PROJH.program.clientType, status: sel.status ?? PROJH.program.status }
    : PROJH.program;
  const seg = sel
    ? ({ MDX: 'medtech', Biotech: 'biotech', Pharma: 'pharma', CRO: 'cro' }[sel.ws ?? ''] ?? 'biotech')
    : (segment || 'biotech');

  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState('author');
  const [mem, setMem] = useState(PROJH.memory.body);
  const [editMem, setEditMem] = useState(false);
  const [ins, setIns] = useState(PROJH.instructions.body);
  const [editIns, setEditIns] = useState(false);
  const [files, setFiles] = useState<ProjFile[]>(PROJH.files);
  const [retr, setRetr] = useState(p.retrievalMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const convoRef = useRef<HTMLDivElement>(null);
  const [msgs, setMsgs] = useState<InlineMsg[]>(() => [
    { role: 'ana', text: "I'm your co-author on " + p.productName + " — bound to the governed dossier. In the Author stage so far I've drafted §2.5.5 Overview of Safety and flagged 2 contradictions in §2.5 to reconcile before freeze. What should we work on?" },
  ]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, [msgs, busy]);

  const sampleReply = (t: string) => {
    const s = t.toLowerCase();
    if (/draft|write|author/.test(s)) return "I'll draft that into the document now — pulling from the linked CSR-201 and the controlled vocabulary, grounding each claim with provenance. Open the editor to watch it stream into the section.";
    if (/contradiction|reconcile|flag|fix/.test(s)) return "There are 2 open contradictions in §2.5: the ORR value vs the locked CSR-201, and a bridging-PK claim ahead of §2.7.2. I can draft tracked-change corrections for both — want me to apply them for your review?";
    if (/review|gap|ready|complete|freeze/.test(s)) return "§2.5 Clinical Overview is at 72%. Outstanding before freeze: reconcile the 2 contradictions, link 1 missing evidence source, and a medical reviewer pass. I can route it for review.";
    return "On it — I'll work that against the BX-204 dossier and surface the result with provenance. Open the full thread to see every step.";
  };

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setMsgs(m => [...m, { role: 'user', text: t }]);
    setDraft('');
    setBusy(true);
    setTimeout(() => { setMsgs(m => [...m, { role: 'ana', text: sampleReply(t) }]); setBusy(false); }, 700);
  };

  const openThread = () => {
    window.C2C_CONVO = { id: 'new', seed: draft.trim() || '' };
    onNav('conversation-thread');
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files || [])];
    if (!list.length) return;
    setFiles(fs => [...list.map(f => ({
      name: f.name, type: (f.name.split('.').pop() || 'doc').toLowerCase(), module: '—', section: 'unfiled', dtype: 'uploaded', status: 'processing', conf: null,
    })), ...fs]);
    e.target.value = '';
  };

  const statusN = files.filter(f => f.status === 'validated').length;

  const T = PROJH.tasks;
  const byStatus = T.reduce<Record<string, number>>((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {});
  const doneIds = T.filter(t => t.status === 'done').map(t => t.id);
  const nextAvail = T.filter(t => t.status === 'todo' && (t.dependsOn || []).every(d => doneIds.indexOf(d) > -1));
  const critPath = T.filter(t => t.critical && t.status !== 'done');
  const projScoped = T.length;

  return (
    <div className="page-inner pj">
      <SampleTag sample={true} />
      <button className="pj-back" onClick={() => onNav('projects')}>{I.left} All projects</button>

      <div className="pj-crumb">
        {p.hierarchy.map((h, i) => (
          <React.Fragment key={i}>
            <span className="pj-crumb-i" data-cur={i === 1 || undefined}><span className="pj-crumb-k">{h.kind}</span>{h.label}</span>
            {i < p.hierarchy.length - 1 && <span className="pj-crumb-sep">{I.right}</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="pj-top">
        <div className="pj-top-l">
          <h1 className="pj-title">{p.title}</h1>
          <div className="pj-desc">{p.desc}</div>
          <div className="pj-tags">
            <span className="rd-chip tone-ai">{p.clientType}</span>
            <span className="rd-chip tone-idle">{p.submissionType} · {p.productType}</span>
            <span className="rd-chip tone-idle">{p.region}</span>
            <span className="rd-chip tone-idle">{p.ta}</span>
            <span className="rd-chip tone-ok">{p.status}</span>
            <span className="rd-chip tone-err">priority: {p.priority}</span>
            <span className="rd-chip tone-warn">risk: {p.riskLevel}</span>
          </div>
        </div>
        <div className="pj-top-actions">
          <button className="pj-icon" title="Favorite">{I.star}</button>
          <button className="pj-icon" title="Project settings">{I.more}</button>
        </div>
      </div>

      <StageTracker stage={stage} setStage={setStage} />
      <div className="pj-stageband">
        <div className="pj-stageband-l">
          <span className="pj-stageband-stage">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { label: '' }).label}</span>
          <span className="pj-stageband-blurb">{(PJ_LIFECYCLE.find(s => s.id === stage) ?? { blurb: '' }).blurb}</span>
        </div>
        <div className="pj-stageband-next">
          <span className="pj-stageband-next-k">{I.zap} What's next</span>
          <span className="pj-stageband-next-v">{PJ_STAGE_NEXT[stage]}</span>
        </div>
      </div>

      {stage === 'evidence' && <ProjectVault onNav={onNav} />}
      {stage === 'submit' && <ProjectSubmissions onNav={onNav} />}
      {stage === 'review' && <ProjectTasks onNav={onNav} />}
      {stage === 'plan' && (<>
        <StagePanel stage="plan" onNav={onNav} />
        <ProjectMeetings onNav={onNav} />
        <TMFPanel />
        <GrantsPanel />
      </>)}
      {stage === 'respond' && <StagePanel stage="respond" onNav={onNav} />}
      {stage === 'lifecycle' && <StagePanel stage="lifecycle" onNav={onNav} />}

      {stage === 'author' && (
      <div className="pj-grid">
        <div className="pj-main">
          <div className="pj-convo">
            <div className="pj-convo-h">
              <span className="pj-convo-mark">{I.sparkles}</span>
              <div className="pj-convo-id"><span className="pj-convo-t">AnA · co-author</span><span className="pj-convo-ctx">{p.productName} · §2.5 Clinical Overview · 72%</span></div>
              <button className="pj-convo-open" onClick={openThread}>Open full thread {I.arrowRight}</button>
            </div>
            <div className="pj-convo-scroll" ref={convoRef}>
              <div className="pj-convo-activity">
                <div className="pj-convo-act-h">Recent activity</div>
                {PROJH.activity.map((a, i) => (<div key={i} className="pj-convo-act"><span className="pj-convo-act-who" data-ana={a.who === 'AnA' || undefined}>{a.who}</span><span className="pj-convo-act-what">{a.what}</span><span className="pj-convo-act-when">{a.when}</span></div>))}
              </div>
              {msgs.map((m, i) => (<div key={i} className={'pj-msg ' + m.role}>{m.role === 'ana' && <span className="pj-msg-av">{I.sparkles}</span>}<div className="pj-msg-b">{m.text}</div></div>))}
              {busy && <div className="pj-msg ana"><span className="pj-msg-av">{I.sparkles}</span><div className="pj-msg-b pj-msg-typing"><span /><span /><span /></div></div>}
            </div>
            <div className="pj-composer">
              <textarea rows={2} placeholder={'Message AnA about ' + p.productName + '…'} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <div className="pj-composer-row">
                <button className="pj-comp-attach" title="Add document" onClick={() => fileRef.current?.click()}>{I.plus}</button>
                <span className="sp" />
                <span className="pj-comp-model">{I.zap} Maximum</span>
                <button className="pj-comp-send" disabled={!draft.trim()} onClick={send}>{I.arrowUp}</button>
              </div>
            </div>
          </div>

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Workspace</h2><span className="sec-sub">Every capability, scoped to {p.title}</span></div>
            {getSegmentModules(seg).map((grp: { label: string; items: string[] }) => (
              <div key={grp.label} className="pj-toolgrp">
                <div className="pj-toolgrp-l">{grp.label}</div>
                <div className="pj-tools">
                  {grp.items.map(id => {
                    const m = getSurfaceMeta(id);
                    return (
                      <button key={id} className="pj-tool" title={(m as { notes?: string }).notes || m.label} onClick={() => {
                        try { if (window.C2C && sel) (window.C2C as Record<string, (...args: unknown[]) => void>).setContext?.({ entityType: 'project', entityId: sel.id, entityLabel: sel.title }); } catch { /* noop */ }
                        onNav(id);
                      }}>
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

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Conversations</h2><span className="sec-sub">{PROJH.conversations.length} in this project</span></div>
            {PROJH.conversations.map((c, i) => (
              <button key={i} className="pj-convo" onClick={() => { window.C2C_CONVO = { id: 'c' + i }; onNav('conversation-thread'); }}>
                <span className="pj-convo-ic">{I.messageSquare}</span>
                <span className="pj-convo-b"><span className="pj-convo-t">{c.t}</span><span className="pj-convo-m">{c.when} · {c.n} messages</span></span>
                <span className="pj-convo-go">{I.right}</span>
              </button>
            ))}
          </section>

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Project map</h2><span className="sec-sub">{PROJH.pyramid.label} · {p.completion}% complete</span></div>
            <div className="pj-map">
              <div className="pj-map-ring"><Ring value={p.completion} size={104} stroke={9} /><div className="pj-map-ring-l">Dossier<br />readiness</div></div>
              <div className="pj-phases">
                {PROJH.pyramid.phases.map((ph, i) => (
                  <button key={i} className="pj-phase" data-status={ph.status} onClick={() => onNav('dossier-map')}>
                    <span className="pj-phase-n">{ph.n}</span>
                    <span className="pj-phase-b">
                      <span className="pj-phase-t">{ph.name}
                        {ph.critical && <span className="pj-phase-crit" title="On the critical path">{I.zap} critical</span>}
                      </span>
                      <span className="pj-phase-track"><span className="pj-phase-fill" data-status={ph.status} style={{ width: Math.round(ph.done / ph.total * 100) + '%' }} /></span>
                      {ph.gate && <span className="pj-phase-gate">{I.lock} {ph.gate}</span>}
                    </span>
                    <span className="pj-phase-meta"><span className={`rd-chip tone-${PHASE_TONE[ph.status]}`}>{ph.status}</span><span className="pj-phase-tasks">{ph.done}/{ph.total} tasks</span></span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Tasks &amp; schedule</h2><span className="sec-sub">{projScoped} project tasks · linked to the {PROJH.pyramid.pathway} pyramid</span></div>

            <div className="pj-tstat">
              {STAT_ORDER.map(s => (<button key={s} className="pj-tstat-c" data-tone={TASK_TONE[s]} onClick={() => onNav('task-board')}><span className="pj-tstat-n">{byStatus[s] || 0}</span><span className="pj-tstat-l">{TASK_LABEL[s]}</span></button>))}
            </div>
            <div className="pj-tboard-note">
              <span>{I.info} The board is <b>org-scoped</b> ({PROJH.board.orgTotal} tasks across the org) — here filtered to this project. Section tasks, board tasks &amp; pyramid tasks are unified via cross-module links.</span>
              <button className="pj-tboard-btn" onClick={() => onNav('task-board')}>Open task board {I.right}</button>
            </div>

            <div className="pj-sched">
              <div className="pj-sched-h"><span className="pj-sched-ai">{I.sparkles} Schedule of events</span><span className="pj-sched-conf">AnA-generated · confidence {PROJH.schedule.confidence.toFixed(2)} · {PROJH.schedule.updated}</span></div>
              <p className="pj-sched-basis">{PROJH.schedule.basis}</p>
              <div className="pj-goals">
                {PROJH.schedule.goals.map((g, i) => (<span key={i} className="pj-goal" data-tone={GOAL_TONE[g.status]}><span className="pj-goal-dot" />{g.t}<em>{g.when} · {g.status.replace('_', ' ')}</em></span>))}
              </div>
            </div>

            <div className="pj-tgrp-h">{I.zap} Critical path · {critPath.length} open</div>
            <div className="pj-tasks">
              {critPath.map(t => (
                <div key={t.id} className="pj-task" data-crit="true">
                  <span className={`pj-task-dot tone-${TASK_TONE[t.status]}`} />
                  <div className="pj-task-b">
                    <div className="pj-task-t">{t.name}{t.ctq && <span className="pj-task-ctq" title="Critical to quality">CtQ</span>}</div>
                    <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · {TASK_LABEL[t.status]} · {t.assignee}{(t.dependsOn || []).length > 0 && <span className="pj-task-dep">{I.gitCompare} depends on {t.dependsOn.join(', ')}</span>}</div>
                  </div>
                  <div className="pj-task-r"><span className={`rd-chip tone-${PRI_TONE[t.priority]}`}>{t.priority}</span><span className="pj-task-due">{t.due}</span></div>
                </div>
              ))}
            </div>

            <div className="pj-tgrp-h">{I.check} Ready to work · {nextAvail.length} unblocked</div>
            <div className="pj-tasks">
              {nextAvail.map(t => (
                <button key={t.id} className="pj-task" onClick={() => onNav('task-board')}>
                  <span className={`pj-task-dot tone-${TASK_TONE[t.status]}`} />
                  <div className="pj-task-b">
                    <div className="pj-task-t">{t.name}</div>
                    <div className="pj-task-m"><span className="pj-task-id">{t.id}</span> · {t.module} · {t.assignee}</div>
                  </div>
                  <div className="pj-task-r"><span className={`rd-chip tone-${PRI_TONE[t.priority]}`}>{t.priority}</span><span className="pj-task-due">{t.due}</span></div>
                </button>
              ))}
            </div>
          </section>

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Submission readiness</h2><span className="sec-sub">score {PROJH.readiness.score} · {PROJH.readiness.blockerCount} blocker{PROJH.readiness.blockerCount === 1 ? '' : 's'} · {PROJH.readiness.isReady ? 'ready' : 'not ready'}</span></div>
            <div className="pj-rd">
              {([['Rules-based', 'rulesBased'], ['Validation', 'validation'], ['AI-inferred', 'aiInferred']] as const).map(([lbl, key]) => (
                <div key={key} className="pj-rd-col">
                  <div className="pj-rd-col-h">{lbl}<span>{PROJH.readiness[key].length}</span></div>
                  {PROJH.readiness[key].map((f, fi) => (
                    <div key={fi} className="pj-find" data-tone={FIND_TONE[f.status]}>
                      <span className="pj-find-dot" />
                      <div><div className="pj-find-r">{f.rule}</div><div className="pj-find-k">{f.kind} · {f.severity}</div></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="pj-sec">
            <div className="pj-sec-h"><h2>Team &amp; activity</h2></div>
            <div className="pj-team">
              {PROJH.team.map((g, i) => (<span key={i} className="pj-team-m"><span className="pj-team-av">{pjInitials(g.name)}</span>{g.name}<span className={`rd-chip tone-${g.sig === 'signed' ? 'ok' : 'warn'}`}>{g.role}</span></span>))}
            </div>
            <div className="pj-acts">
              {PROJH.activity.map((a, i) => (<div key={i} className="pj-act"><span className="pj-act-w">{a.who}</span><span className="pj-act-t">{a.what}</span><span className="pj-act-n">{a.when}</span></div>))}
            </div>
          </section>
        </div>

        <aside className="pj-side">
          <section className="pj-card">
            <div className="pj-card-h"><h3>Memory</h3><span className="pj-vis">{I.lock} {PROJH.memory.visibility}</span><button className="pj-edit" title="Edit memory" onClick={() => setEditMem(e => !e)}>{I.penLine}</button></div>
            {editMem ? (<><textarea className="pj-edit-ta" value={mem} onChange={e => setMem(e.target.value)} /><div className="pj-edit-row"><button className="pj-edit-save" onClick={() => setEditMem(false)}>Save memory</button></div></>)
              : (<>
                <p className="pj-card-body">{mem}</p>
                <div className="pj-intel">
                  <div className="pj-intel-status" data-risk="true">{I.alertTriangle} {PROJH.intelligence.readinessStatus}</div>
                  <div className="pj-intel-grp"><span className="pj-intel-l">Open blockers</span>{PROJH.intelligence.currentBlockers.map((b, bi) => (<div key={bi} className="pj-intel-row" data-tone="err">{b}</div>))}</div>
                  <div className="pj-intel-grp"><span className="pj-intel-l">Decisions on record</span>{PROJH.intelligence.importantDecisions.map((b, bi) => (<div key={bi} className="pj-intel-row">{b}</div>))}</div>
                  <div className="pj-intel-grp"><span className="pj-intel-l">Next recommended</span>{PROJH.intelligence.nextRecommendedActions.map((b, bi) => (<div key={bi} className="pj-intel-row" data-tone="acc">{b}</div>))}</div>
                </div>
                <div className="pj-card-foot">Last updated {PROJH.memory.updated}</div>
              </>)}
          </section>

          <section className="pj-card">
            <div className="pj-card-h"><h3>Instructions</h3><button className="pj-edit" title="Edit instructions" onClick={() => setEditIns(e => !e)}>{I.penLine}</button></div>
            {editIns ? (<><textarea className="pj-edit-ta" value={ins} onChange={e => setIns(e.target.value)} /><div className="pj-edit-row"><button className="pj-edit-save" onClick={() => setEditIns(false)}>Save instructions</button></div></>)
              : (<><p className="pj-card-body">{ins}</p><div className="pj-card-foot">Last updated {PROJH.instructions.updated}</div></>)}
          </section>

          <section className="pj-card">
            <div className="pj-card-h"><h3>Linked modules</h3><span className="sec-sub">{PROJH.linkedModules.length} of 14</span></div>
            <div className="pj-mods">
              {PROJH.linkedModules.map((m, i) => (
                <button key={i} className="pj-lmod" data-risk={m.risk || undefined} onClick={() => onNav('dossier-map')}>
                  <span className="pj-lmod-t">{m.t}</span>
                  <span className="pj-lmod-track"><span className="pj-lmod-fill" data-risk={m.risk || undefined} style={{ width: m.done + '%' }} /></span>
                  <span className="pj-lmod-pct">{m.done}%</span>
                </button>
              ))}
            </div>
          </section>

          <section className="pj-card">
            <div className="pj-card-h"><h3>Files</h3><span className="sec-sub">{statusN}/{files.length} validated</span><button className="pj-edit" title="Add document" onClick={() => fileRef.current?.click()}>{I.plus}</button></div>
            <div className="pj-retr">
              <button className="pj-retr-b" data-on={retr === 'in_context' || undefined} onClick={() => setRetr('in_context')}>In-context</button>
              <button className="pj-retr-b" data-on={retr === 'retrieval' || undefined} onClick={() => setRetr('retrieval')}>{I.search} Retrieval</button>
            </div>
            {retr === 'in_context' ? (
              <div className="pj-cap">
                <div className="pj-cap-track"><div className="pj-cap-fill" style={{ width: PROJH.capacity + '%' }} /></div>
                <div className="pj-cap-row"><span>{PROJH.capacity}% of context window used</span><span>{p.tokenEst} tokens</span></div>
              </div>
            ) : (
              <div className="pj-cap"><div className="pj-cap-row"><span>{I.search} Retrieval (semantic search) — no context limit</span><span>{p.tokenEst} indexed</span></div></div>
            )}
            <div className="pj-files">
              {files.map((f, i) => (
                <div key={i} className="pj-file">
                  <div className="pj-file-top"><span className="pj-file-badge">{(f.type || 'doc').toUpperCase()}</span><span className="pj-file-status" data-s={fileTone(f.status)}>{f.status}{f.conf ? ' · ' + Math.round(f.conf * 100) + '%' : ''}</span></div>
                  <div className="pj-file-n">{f.name}</div>
                  <div className="pj-file-m">{f.module} · {f.section} · {f.dtype}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      )}
      <input ref={fileRef} type="file" style={{ display: 'none' }} multiple onChange={onFile} accept=".pdf,.docx,.doc,.xlsx,.csv,.xml,.txt" />
    </div>
  );
}
