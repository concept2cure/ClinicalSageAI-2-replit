/**
 * Project Home — per-program dashboard. Reached by clicking a program tile
 * on Overview. Exit via "Open workbench" CTA or breadcrumb.
 *
 * Ported verbatim from design-system/ui_kits/mdx/ProjectHome.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import type { Program } from '../data/programs';
import { useProgramDetail } from '../hooks/useMdxPrograms';
import { useWorkbenchTasks } from '../hooks/useWorkbench';
import { useProgramExtras } from '../hooks/useProgramExtras';

interface GovernanceRow {
  role: string;
  name: string;
  sig: 'pending' | 'signed' | 'reserved';
}

/* The kit's governance row defines a 5-role surface (Reg lead / Eng owner /
   Quality / Clinical / Submitter). The lead and team-member roles come
   from the program; the canonical role-to-team-member mapping isn't
   structured server-side yet, so we build the row list from what we have
   (lead + first 4 team members), pad with the kit's role labels, and
   leave signature state at "pending" (real e-sig status will live in the
   submission package gate, surfaced separately). */
function deriveGovernance(
  leadName: string | null,
  team: Array<{ name?: string; role?: string }> | null,
): GovernanceRow[] {
  const KIT_ROLES = ['Reg. lead', 'Eng. owner', 'Quality', 'Clinical', 'Submitter'];
  const lead: GovernanceRow = { role: 'Reg. lead', name: leadName ?? 'Unassigned', sig: 'pending' };
  const teamRows: GovernanceRow[] = (team ?? [])
    .slice(0, 4)
    .map((m, i) => ({
      role: m.role ?? KIT_ROLES[i + 1] ?? 'Member',
      name: m.name ?? 'Unassigned',
      sig:  'pending' as const,
    }));
  /* Pad to 5 rows with role labels alone if team is short — keeps the
     panel from collapsing to a stub for new programs. */
  const padded: GovernanceRow[] = [];
  for (let i = 0; i < KIT_ROLES.length; i++) {
    if (i === 0) padded.push(lead);
    else if (teamRows[i - 1]) padded.push(teamRows[i - 1]);
    else padded.push({ role: KIT_ROLES[i], name: 'Unassigned', sig: 'reserved' });
  }
  return padded;
}

const PH_TASKS = [
  { id: 't1', title: 'Resolve predicate K221847 performance mismatch', section: 'SE Discussion', due: 'Today',     tone: 'err',  who: 'JC' },
  { id: 't2', title: 'Upload final biocompatibility report (PDF)',     section: 'Vault · Bio',   due: 'Tomorrow',  tone: 'warn', who: 'SM' },
  { id: 't3', title: 'Reconcile labeling v2.4 with IFU §3.1',          section: 'Labeling',      due: 'In 3 days', tone: 'warn', who: 'LT' },
  { id: 't4', title: 'Sign off Performance Testing summary',           section: 'Performance',   due: 'In 5 days', tone: 'ok',   who: 'JC' },
  { id: 't5', title: 'Review Claude rewrite — Device Description §2',  section: 'Device Desc.',  due: 'In 1 week', tone: 'ok',   who: 'JC' },
];

const PH_MILESTONES = [
  { id: 'm1', label: 'Q-Sub meeting',       date: 'Aug 12',   state: 'complete' },
  { id: 'm2', label: 'Pre-sub response',    date: 'Sep 04',   state: 'complete' },
  { id: 'm3', label: 'eSTAR drafted',       date: 'Oct 18',   state: 'complete' },
  { id: 'm4', label: 'Internal QC',         date: 'Nov 06',   state: 'active' },
  { id: 'm5', label: 'FDA filing',          date: 'Nov 28',   state: 'idle' },
  { id: 'm6', label: 'AI acknowledgement',  date: 'Dec ~05',  state: 'idle' },
  { id: 'm7', label: 'Substantive review',  date: 'Jan ~18',  state: 'idle' },
  { id: 'm8', label: 'SE decision',         date: 'Q1 2026',  state: 'idle' },
];

const PH_RIM_RECS = [
  { id: 'r1', body: 'Three sections reference predicate K221847 — propagate the mismatch resolution before filing.', kind: 'cross-ref',   impact: 'high' },
  { id: 'r2', body: 'Labeling and IFU diverge on torque spec (Nm vs in-lb). Reconcile with engineering.',          kind: 'consistency', impact: 'high' },
  { id: 'r3', body: 'Performance Testing summary is 84% mapped to eSTAR fields — close 4 remaining gaps.',         kind: 'mapping',    impact: 'med' },
  { id: 'r4', body: 'Section 12 (sterilization) cites a withdrawn ISO 11135:2014 — update to :2024.',              kind: 'standards',  impact: 'med' },
];

const PH_CHANGE_IMPACT = [
  { id: 'c1', who: 'Sofia',  when: '32 m ago', what: 'edited Device Description §2',          affects: ['SE Discussion', 'Risk Analysis'] },
  { id: 'c2', who: 'Linh',   when: '2 h ago',  what: 'replaced Labeling v2.3 → v2.4',         affects: ['IFU', 'Packaging', 'eSTAR §10'] },
  { id: 'c3', who: 'Claude', when: '4 h ago',  what: 'rewrote Performance Testing intro',     affects: ['SE Discussion'] },
];

const PH_GOVERNANCE = [
  { role: 'Reg. lead',  name: 'Sofia Marchetti', sig: 'pending' },
  { role: 'Eng. owner', name: 'Liang Tan',       sig: 'signed' },
  { role: 'Quality',    name: 'Priya Shah',      sig: 'signed' },
  { role: 'Clinical',   name: 'Ana Müller',      sig: 'pending' },
  { role: 'Submitter',  name: 'Jordan Chen',     sig: 'reserved' },
];

const PH_ACTIVITY = [
  { who: 'Sofia',  when: '32 m', what: 'edited Device Description §2' },
  { who: 'Claude', when: '1 h',  what: 'flagged 4 mapping gaps in Performance Testing' },
  { who: 'Linh',   when: '2 h',  what: 'uploaded Labeling v2.4 to Vault' },
  { who: 'Jordan', when: '4 h',  what: 'opened review on SE matrix' },
  { who: 'Priya',  when: '8 h',  what: 'signed Quality attestation' },
  { who: 'Marcus', when: 'Yest.',what: 'commented on Sterilization §12' },
];

function ReadinessRing({ value, size = 132, stroke = 12 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg className="ph-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ph-ring-track" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ph-ring-arc"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="ph-ring-num"
      >
        {value}%
      </text>
    </svg>
  );
}

function SecBar({ label, n, total, tone }: { label: string; n: number; total: number; tone: string }) {
  const pct = Math.round((n / total) * 100);
  return (
    <div className="ph-secbar">
      <div className="ph-secbar-row">
        <span className="ph-secbar-label">{label}</span>
        <span className="ph-secbar-count">
          {n}
          <span className="ph-secbar-total">/{total}</span>
        </span>
      </div>
      <div className="ph-secbar-track">
        <div className={`ph-secbar-fill tone-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface ProjectHomeProps {
  program: Program | null;
  onOpenWorkbench: () => void;
  onAskAna: (text: string) => void;
  onBackToOverview: () => void;
}

export function ProjectHome({
  program,
  onOpenWorkbench,
  onAskAna,
  onBackToOverview,
}: ProjectHomeProps) {
  if (!program) return null;
  const ready = program.readiness ?? 0;

  /* Live data:
       - Program detail (lead name + team members) for the Governance panel
       - Cross-program task list filtered to this program for "Your tasks"
     Both fall back to the kit fixtures during load + on error. */
  const detail = useProgramDetail(program.id);
  const allTasks = useWorkbenchTasks();
  const extras = useProgramExtras(program.id);
  const livePh = detail.detail
    ? deriveGovernance(detail.detail.leadUserName, detail.detail.teamMembers)
    : null;
  const sourceGovernance = livePh ?? PH_GOVERNANCE;
  const programCode = program.code.split(' ')[0];
  const liveProgramTasks = allTasks.tasks?.filter(
    (t) => t.prog === programCode || t.prog === program.id,
  ) ?? null;
  const sourceTasks = liveProgramTasks ?? PH_TASKS.map((t) => ({
    id: t.id,
    title: t.title,
    sect: t.section,
    due: t.due,
    tone: t.tone,
    assignee: t.who,
  }));

  /* Live milestones / RIM recs / change-impact / activity. Each panel
     falls back to kit content during load + on error so the surface
     never renders blank — but live data wins as soon as it arrives. */
  const sourceMilestones = extras.milestones ?? PH_MILESTONES;
  const sourceRimRecs    = extras.rimRecs    ?? PH_RIM_RECS;
  const sourceImpact     = extras.changeImpactFormatted ?? PH_CHANGE_IMPACT;
  const sourceActivity   = extras.activityFormatted ?? PH_ACTIVITY;

  return (
    <div className="ph-root" data-screen-label={`MDX · Project Home · ${program.title}`}>
      <header className="ph-head">
        <div className="ph-head-l">
          <div className="ph-crumb">
            <button className="ph-crumb-back" onClick={onBackToOverview}>
              Overview
            </button>
            <span className="ph-crumb-sep">{I.right}</span>
            <span className="ph-crumb-here">{program.id.toUpperCase()}</span>
          </div>
          <h1 className="ph-title">{program.title}</h1>
          <div className="ph-meta">
            <span className="ph-meta-pill">{program.code}</span>
            <span className="ph-meta-sep">·</span>
            <span>Lead {program.lead}</span>
            <span className="ph-meta-sep">·</span>
            <span>Stage {program.stage}</span>
            <span className="ph-meta-sep">·</span>
            <span className={`ph-due tone-${program.dueTone}`}>{program.dueLabel}</span>
          </div>
        </div>
        <div className="ph-head-r">
          <button
            className="ph-btn ghost"
            onClick={() =>
              onAskAna(`What's blocking ${program.id.toUpperCase()} most this week?`)
            }
          >
            {I.sparkles}
            <span>Ask Claude</span>
          </button>
          <button className="ph-btn primary" onClick={onOpenWorkbench}>
            <span>Open workbench</span>
            {I.right}
          </button>
        </div>
      </header>

      <div className="ph-grid">
        <div className="ph-main">
          <section className="ph-card ph-readiness">
            <header className="ph-card-h">
              <h2>Submission readiness</h2>
              <button className="ph-link" onClick={onOpenWorkbench}>
                Go to checklist {I.right}
              </button>
            </header>
            <div className="ph-readiness-body">
              <ReadinessRing value={ready} />
              <div className="ph-secbars">
                <SecBar label="Drafted"   n={11} total={20} tone="ok" />
                <SecBar label="In review" n={5}  total={20} tone="warn" />
                <SecBar label="Approved"  n={2}  total={20} tone="ok" />
                <SecBar label="Blocked"   n={2}  total={20} tone="err" />
              </div>
            </div>
          </section>

          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Your tasks</h2>
              <span className="ph-count">{sourceTasks.length} open</span>
            </header>
            <ul className="ph-tasks">
              {sourceTasks.map(t => {
                const sect = ('sect' in t ? t.sect : (t as { section?: string }).section) ?? '';
                const who  = ('assignee' in t ? t.assignee : (t as { who?: string }).who) ?? '';
                return (
                  <li key={t.id} className="ph-task">
                    <span className={`ph-dot tone-${t.tone}`} />
                    <button className="ph-task-title" onClick={onOpenWorkbench}>
                      {t.title}
                    </button>
                    <span className="ph-task-sec">{sect}</span>
                    <span className={`ph-task-due tone-${t.tone}`}>{t.due}</span>
                    <span className="ph-task-who">{who}</span>
                  </li>
                );
              })}
              {sourceTasks.length === 0 && (
                <li className="ph-task" style={{ color: 'var(--text-300)' }}>No open tasks for this program</li>
              )}
            </ul>
          </section>

          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Milestones</h2>
              <span className="ph-count">
                {sourceMilestones.filter(m => m.state === 'complete').length} of{' '}
                {sourceMilestones.length} complete
              </span>
            </header>
            <ol className="ph-milestones">
              {sourceMilestones.map((m, i) => (
                <li key={m.id} className={`ph-ms state-${m.state}`}>
                  <div className="ph-ms-mark">
                    <span />
                  </div>
                  {i < sourceMilestones.length - 1 && <div className="ph-ms-line" />}
                  <div className="ph-ms-body">
                    <div className="ph-ms-label">{m.label}</div>
                    <div className="ph-ms-date">{m.date}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Claude recommendations</h2>
              <span className="ph-count">{sourceRimRecs.length} active</span>
            </header>
            <ul className="ph-recs">
              {sourceRimRecs.length === 0 ? (
                <li className="ph-rec impact-low" style={{ color: 'var(--text-300)' }}>
                  <p className="ph-rec-body">No open recommendations — dossier in good shape.</p>
                </li>
              ) : sourceRimRecs.map(r => (
                <li key={r.id} className={`ph-rec impact-${r.impact}`}>
                  <span className="ph-rec-kind">{r.kind}</span>
                  <p className="ph-rec-body">{r.body}</p>
                  <button className="ph-rec-cta" onClick={() => onAskAna(r.body)}>
                    Ask Claude {I.right}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="ph-side">
          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Change impact</h2>
            </header>
            <ul className="ph-impact">
              {sourceImpact.length === 0 ? (
                <li className="ph-impact-row" style={{ color: 'var(--text-300)' }}>
                  <div className="ph-impact-what">No recent changes recorded.</div>
                </li>
              ) : sourceImpact.map(c => (
                <li key={c.id} className="ph-impact-row">
                  <div className="ph-impact-l">
                    <span className="ph-impact-who">{c.who}</span>
                    <span className="ph-impact-when">{c.when}</span>
                  </div>
                  <div className="ph-impact-what">{c.what}</div>
                  <div className="ph-impact-aff">
                    {c.affects.map(a => (
                      <span key={a} className="ph-impact-tag">
                        {a}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Governance</h2>
            </header>
            <ul className="ph-gov">
              {sourceGovernance.map(g => (
                <li key={g.role} className="ph-gov-row">
                  <span className="ph-gov-role">{g.role}</span>
                  <span className="ph-gov-name">{g.name}</span>
                  <span className={`ph-gov-sig sig-${g.sig}`}>{g.sig}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Recent activity</h2>
            </header>
            <ul className="ph-activity">
              {sourceActivity.length === 0 && (
                <li className="ph-act-row" style={{ color: 'var(--text-300)' }}>
                  <span className="ph-act-what">No recorded activity yet.</span>
                </li>
              )}
              {sourceActivity.map((a, i) => (
                <li key={i} className="ph-act-row">
                  <span className="ph-act-who">{a.who}</span>
                  <span className="ph-act-what">{a.what}</span>
                  <span className="ph-act-when">{a.when}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
