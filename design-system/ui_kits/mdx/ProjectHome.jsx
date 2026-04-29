/* global React, I */
/* Project Home — per-program dashboard.
   Entry from Overview (clicking a program tile). Exit to the pathway workbench
   via the primary CTA. Composition mirrors concept2cure-v2's project-scoped
   tab; nothing here is workspace-scoped. */

const PH_TASKS = [
  { id: 't1', title: 'Resolve predicate K221847 performance mismatch', section: 'SE Discussion', due: 'Today',     tone: 'err',  who: 'JC' },
  { id: 't2', title: 'Upload final biocompatibility report (PDF)',     section: 'Vault · Bio',   due: 'Tomorrow',  tone: 'warn', who: 'SM' },
  { id: 't3', title: 'Reconcile labeling v2.4 with IFU §3.1',          section: 'Labeling',      due: 'In 3 days', tone: 'warn', who: 'LT' },
  { id: 't4', title: 'Sign off Performance Testing summary',           section: 'Performance',   due: 'In 5 days', tone: 'ok',   who: 'JC' },
  { id: 't5', title: 'Review Claude rewrite — Device Description §2',  section: 'Device Desc.',  due: 'In 1 week', tone: 'ok',   who: 'JC' },
];

const PH_MILESTONES = [
  { id: 'm1', label: 'Q-Sub meeting',     date: 'Aug 12',  state: 'complete' },
  { id: 'm2', label: 'Pre-sub response',  date: 'Sep 04',  state: 'complete' },
  { id: 'm3', label: 'eSTAR drafted',     date: 'Oct 18',  state: 'complete' },
  { id: 'm4', label: 'Internal QC',       date: 'Nov 06',  state: 'active'   },
  { id: 'm5', label: 'FDA filing',        date: 'Nov 28',  state: 'idle'     },
  { id: 'm6', label: 'AI acknowledgement',date: 'Dec ~05', state: 'idle'     },
  { id: 'm7', label: 'Substantive review',date: 'Jan ~18', state: 'idle'     },
  { id: 'm8', label: 'SE decision',       date: 'Q1 2026', state: 'idle'     },
];

const PH_RIM_RECS = [
  { id: 'r1', body: 'Three sections reference predicate K221847 — propagate the mismatch resolution before filing.', kind: 'cross-ref', impact: 'high' },
  { id: 'r2', body: 'Labeling and IFU diverge on torque spec (Nm vs in-lb). Reconcile with engineering.',          kind: 'consistency', impact: 'high' },
  { id: 'r3', body: 'Performance Testing summary is 84% mapped to eSTAR fields — close 4 remaining gaps.',         kind: 'mapping',    impact: 'med'  },
  { id: 'r4', body: 'Section 12 (sterilization) cites a withdrawn ISO 11135:2014 — update to :2024.',              kind: 'standards',  impact: 'med'  },
];

const PH_CHANGE_IMPACT = [
  { id: 'c1', who: 'Sofia',  when: '32 m ago', what: 'edited Device Description §2', affects: ['SE Discussion', 'Risk Analysis'] },
  { id: 'c2', who: 'Linh',   when: '2 h ago',  what: 'replaced Labeling v2.3 → v2.4', affects: ['IFU', 'Packaging', 'eSTAR §10'] },
  { id: 'c3', who: 'Claude', when: '4 h ago',  what: 'rewrote Performance Testing intro', affects: ['SE Discussion'] },
];

const PH_GOVERNANCE = [
  { role: 'Reg. lead',   name: 'Sofia Marchetti', sig: 'pending'  },
  { role: 'Eng. owner',  name: 'Liang Tan',       sig: 'signed'   },
  { role: 'Quality',     name: 'Priya Shah',      sig: 'signed'   },
  { role: 'Clinical',    name: 'Ana Müller',      sig: 'pending'  },
  { role: 'Submitter',   name: 'Jordan Chen',     sig: 'reserved' },
];

const PH_ACTIVITY = [
  { who: 'Sofia',  when: '32 m', what: 'edited Device Description §2' },
  { who: 'Claude', when: '1 h',  what: 'flagged 4 mapping gaps in Performance Testing' },
  { who: 'Linh',   when: '2 h',  what: 'uploaded Labeling v2.4 to Vault' },
  { who: 'Jordan', when: '4 h',  what: 'opened review on SE matrix' },
  { who: 'Priya',  when: '8 h',  what: 'signed Quality attestation' },
  { who: 'Marcus', when: 'Yest.',what: 'commented on Sterilization §12' },
];

/* ───── helpers ───── */
function ReadinessRing({ value, size = 132, stroke = 12 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg className="ph-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} className="ph-ring-track" strokeWidth={stroke} fill="none"/>
      <circle cx={size/2} cy={size/2} r={r} className="ph-ring-arc"   strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size/2} ${size/2})`}
        strokeLinecap="round"/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ph-ring-num">{value}%</text>
    </svg>
  );
}

function SecBar({ label, n, total, tone }) {
  const pct = Math.round((n / total) * 100);
  return (
    <div className="ph-secbar">
      <div className="ph-secbar-row">
        <span className="ph-secbar-label">{label}</span>
        <span className="ph-secbar-count">{n}<span className="ph-secbar-total">/{total}</span></span>
      </div>
      <div className="ph-secbar-track"><div className={`ph-secbar-fill tone-${tone}`} style={{ width: `${pct}%` }}/></div>
    </div>
  );
}

/* ───── surface ───── */
function ProjectHomeSurface({ program, onOpenWorkbench, onAskAna, onBackToOverview }) {
  if (!program) return null;
  const ready = program.readiness ?? 0;

  return (
    <div className="ph-root" data-screen-label={`MDX · Project Home · ${program.title}`}>
      {/* Header band */}
      <header className="ph-head">
        <div className="ph-head-l">
          <div className="ph-crumb">
            <button className="ph-crumb-back" onClick={onBackToOverview}>Overview</button>
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
          <button className="ph-btn ghost" onClick={() => onAskAna && onAskAna(`What's blocking ${program.id.toUpperCase()} most this week?`)}>
            {I.sparkles}<span>Ask Claude</span>
          </button>
          <button className="ph-btn primary" onClick={onOpenWorkbench}>
            <span>Open workbench</span>{I.right}
          </button>
        </div>
      </header>

      {/* Body grid */}
      <div className="ph-grid">
        {/* MAIN COLUMN */}
        <div className="ph-main">
          {/* Readiness */}
          <section className="ph-card ph-readiness">
            <header className="ph-card-h">
              <h2>Submission readiness</h2>
              <button className="ph-link" onClick={onOpenWorkbench}>Go to checklist {I.right}</button>
            </header>
            <div className="ph-readiness-body">
              <ReadinessRing value={ready}/>
              <div className="ph-secbars">
                <SecBar label="Drafted"   n={11} total={20} tone="ok"/>
                <SecBar label="In review" n={5}  total={20} tone="warn"/>
                <SecBar label="Approved"  n={2}  total={20} tone="ok"/>
                <SecBar label="Blocked"   n={2}  total={20} tone="err"/>
              </div>
            </div>
          </section>

          {/* Tasks */}
          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Your tasks</h2>
              <span className="ph-count">{PH_TASKS.length} open</span>
            </header>
            <ul className="ph-tasks">
              {PH_TASKS.map(t => (
                <li key={t.id} className="ph-task">
                  <span className={`ph-dot tone-${t.tone}`}/>
                  <button className="ph-task-title" onClick={onOpenWorkbench}>{t.title}</button>
                  <span className="ph-task-sec">{t.section}</span>
                  <span className={`ph-task-due tone-${t.tone}`}>{t.due}</span>
                  <span className="ph-task-who">{t.who}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Milestones */}
          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Milestones</h2>
              <span className="ph-count">{PH_MILESTONES.filter(m => m.state === 'complete').length} of {PH_MILESTONES.length} complete</span>
            </header>
            <ol className="ph-milestones">
              {PH_MILESTONES.map((m, i) => (
                <li key={m.id} className={`ph-ms state-${m.state}`}>
                  <div className="ph-ms-mark"><span/></div>
                  {i < PH_MILESTONES.length - 1 && <div className="ph-ms-line"/>}
                  <div className="ph-ms-body">
                    <div className="ph-ms-label">{m.label}</div>
                    <div className="ph-ms-date">{m.date}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* RIM recs */}
          <section className="ph-card">
            <header className="ph-card-h">
              <h2>Claude recommendations</h2>
              <span className="ph-count">{PH_RIM_RECS.length} active</span>
            </header>
            <ul className="ph-recs">
              {PH_RIM_RECS.map(r => (
                <li key={r.id} className={`ph-rec impact-${r.impact}`}>
                  <span className="ph-rec-kind">{r.kind}</span>
                  <p className="ph-rec-body">{r.body}</p>
                  <button className="ph-rec-cta" onClick={() => onAskAna && onAskAna(r.body)}>Ask Claude {I.right}</button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* SIDE COLUMN */}
        <aside className="ph-side">
          {/* Change impact */}
          <section className="ph-card">
            <header className="ph-card-h"><h2>Change impact</h2></header>
            <ul className="ph-impact">
              {PH_CHANGE_IMPACT.map(c => (
                <li key={c.id} className="ph-impact-row">
                  <div className="ph-impact-l">
                    <span className="ph-impact-who">{c.who}</span>
                    <span className="ph-impact-when">{c.when}</span>
                  </div>
                  <div className="ph-impact-what">{c.what}</div>
                  <div className="ph-impact-aff">
                    {c.affects.map(a => <span key={a} className="ph-impact-tag">{a}</span>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Governance */}
          <section className="ph-card">
            <header className="ph-card-h"><h2>Governance</h2></header>
            <ul className="ph-gov">
              {PH_GOVERNANCE.map(g => (
                <li key={g.role} className="ph-gov-row">
                  <span className="ph-gov-role">{g.role}</span>
                  <span className="ph-gov-name">{g.name}</span>
                  <span className={`ph-gov-sig sig-${g.sig}`}>{g.sig}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Activity */}
          <section className="ph-card">
            <header className="ph-card-h"><h2>Recent activity</h2></header>
            <ul className="ph-activity">
              {PH_ACTIVITY.map((a, i) => (
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

Object.assign(window, { ProjectHomeSurface });
