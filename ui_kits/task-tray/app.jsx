(() => {
/* Persistent Task Tray — a top-bar affordance for every shell.
 * ─────────────────────────────────────────────────────────────
 * Tasking is connective tissue, accessed in-place — not a destination.
 * This tray sits in every top bar (biopharma, MDX, submission, risk,
 * authoring, tasking). Click → slide-over with "Assigned to me /
 * Waiting on / Due today", AnA-triage at top, one-click to each item.
 * Lands at client/src/concept2cure/_shared/components/TaskTray.tsx,
 * mounted by the shared shell top bar. Consumes the same
 * /api/submission-ops/workload + /api/approval-workflows/pending
 * that the Tasking surface uses. */

const { useState } = React;

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  check:   <Icon d={<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>}/>,
  close:   <Icon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>} size={13}/>,
  sparkles:<Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>} size={13}/>,
  bell:    <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  search:  <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
};

const TRAY = {
  assigned: [
    { id: 'T-4818', title: '§2.7 clinical summary — your sign-off', program: 'BX-204', due: 'Today', tone: 'err', cmd: 'Open §2.7 clinical summary for sign-off' },
    { id: 'T-4816', title: 'Strengthen §2.5.4 against FDA 2023 bridging', program: 'BX-204', due: '2 days', tone: 'warn', cmd: 'Open the §2.5.4 strengthen task' },
    { id: 'T-4811', title: 'Reconcile K221847 performance mismatch', program: 'BX-D2', due: '1 wk', tone: 'ok', cmd: 'Open the K221847 reconciliation task' },
  ],
  waiting: [
    { id: 'T-4820', title: 'CMC comparability protocol', program: 'BX-301', who: 'Alex Reyes', due: '4 days', cmd: 'Show status of the CMC comparability task waiting on Alex' },
    { id: 'T-4822', title: 'RK-003 dual-algorithm verification', program: 'BX-D2', who: 'Ana Müller', due: '3 days', cmd: 'Show status of RK-003 verification waiting on Ana' },
  ],
  approvals: [
    { id: 'W-3', title: 'NDA 212345 submission gate', program: 'BX-204', role: 'VP Reg', tone: 'err', cmd: 'Open the NDA 212345 submission gate approval' },
  ],
};

function TaskTray({ open, setOpen, onAskAna }) {
  const total = TRAY.assigned.length + TRAY.approvals.length;
  return (
    <>
      <button className="tt-trigger" onClick={() => setOpen(!open)} title="Tasks · assigned to you, waiting on others, approvals">
        {I.check}
        {total > 0 && <span className="tt-badge">{total}</span>}
      </button>
      {open && (
        <>
          <div className="tt-scrim" onClick={() => setOpen(false)}/>
          <aside className="tt-panel" aria-label="Tasks">
            <div className="tt-head">
              <b>Tasks</b>
              <span className="tt-head-meta">{TRAY.assigned.length} assigned · {TRAY.waiting.length} waiting · {TRAY.approvals.length} approval</span>
              <button className="tt-close" onClick={() => setOpen(false)}>{I.close}</button>
            </div>

            <button className="tt-triage" onClick={() => { onAskAna('Triage everything assigned to me across all programs and tell me what to do first'); setOpen(false); }}>
              {I.sparkles} Triage my day with AnA
            </button>

            <div className="tt-scroll">
              <div className="tt-group">
                <div className="tt-group-head">Assigned to you</div>
                {TRAY.assigned.map(t => (
                  <button key={t.id} className="tt-item" onClick={() => { onAskAna(t.cmd); setOpen(false); }}>
                    <span className={`tt-dot tt-dot-${t.tone}`}/>
                    <div className="tt-item-body"><div className="tt-item-title">{t.title}</div><div className="tt-item-sub">{t.program} · due {t.due}</div></div>
                    <span className="tt-go">{I.arrowRight}</span>
                  </button>
                ))}
              </div>

              <div className="tt-group">
                <div className="tt-group-head">Approvals · you sign</div>
                {TRAY.approvals.map(t => (
                  <button key={t.id} className="tt-item" onClick={() => { onAskAna(t.cmd); setOpen(false); }}>
                    <span className={`tt-dot tt-dot-${t.tone}`}/>
                    <div className="tt-item-body"><div className="tt-item-title">{t.title}</div><div className="tt-item-sub">{t.program} · as {t.role}</div></div>
                    <span className="tt-go">{I.arrowRight}</span>
                  </button>
                ))}
              </div>

              <div className="tt-group">
                <div className="tt-group-head">Waiting on others</div>
                {TRAY.waiting.map(t => (
                  <button key={t.id} className="tt-item" onClick={() => { onAskAna(t.cmd); setOpen(false); }}>
                    <span className="tt-av">{t.who.split(' ').map(n=>n[0]).join('')}</span>
                    <div className="tt-item-body"><div className="tt-item-title">{t.title}</div><div className="tt-item-sub">{t.program} · {t.who} · {t.due}</div></div>
                    <span className="tt-go">{I.arrowRight}</span>
                  </button>
                ))}
              </div>
            </div>

            <a className="tt-foot" href="../tasking/index.html">Open the full board {I.arrowRight}</a>
          </aside>
        </>
      )}
    </>
  );
}

/* Harness — a mock top bar showing the tray in place */
function App() {
  const [open, setOpen] = useState(true);
  const askAna = (q) => { console.log('[AnA · tasks]', q); };
  return (
    <div className="tt-shell">
      <header className="tt-topbar">
        <div className="tt-logo"><img src="../../assets/concept2cure-icon.svg" alt=""/><span>Concept2Cure<span style={{color:'var(--accent-main-100)'}}>.RI</span></span></div>
        <div className="tt-sep"/>
        <div className="tt-crumbs">Any surface · the task tray rides in every top bar</div>
        <div className="tt-spacer"/>
        <button className="tt-tb-search"><span className="ico">{I.search}</span><span className="lbl">Ask AnA, jump to…</span><span className="kbd">⌘K</span></button>
        <TaskTray open={open} setOpen={setOpen} onAskAna={askAna}/>
        <button className="tt-tb-btn" title="Notifications">{I.bell}</button>
      </header>
      <div className="tt-stage">
        <div className="tt-stage-note">
          <div className="tt-kicker">Persistent task tray</div>
          <h1>Tasking rides in every top bar</h1>
          <p>The tray button (checkmark, with a count) sits next to the notifications bell on every shell — biopharma, MDX, submission, risk, authoring. Click it from any screen to see what&rsquo;s assigned to you, what you sign, and what you&rsquo;re waiting on — without leaving your work. Triage with AnA, or open any item in place.</p>
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
window.TaskTray = TaskTray;
})();
