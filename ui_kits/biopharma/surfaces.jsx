(() => {
/* Biopharma surfaces — Overview · IND · NDA · BLA · MAA · Pediatric · PV
 *                       Precedent · CMC · Clinical · Orphan · Biostat
 * ─────────────────────────────────────────────────────────────────────
 * Each surface accepts `{ program, programs, onAskAna }` — the same
 * contract MDX surfaces follow. Hero surfaces are Overview / IND / NDA
 * / Pediatric / PV — they're fully built. Precedent / CMC / Clinical /
 * Orphan / Biostat are scaffolded; phase 10.1 fills them. Stub style
 * matches MDX's <InDesignSurface> so reviewers see a consistent
 * "next" affordance, not a missing screen.
 */

const {
  React, I,
  BIOPHARMA_PROGRAMS, BIOPHARMA_RECENT,
  BIOPHARMA_IND, BIOPHARMA_NDA, BIOPHARMA_PEDIATRIC, BIOPHARMA_PV,
  BIOPHARMA_JNDA, BIOPHARMA_LIFECYCLE, BIOPHARMA_ORPHAN, BIOPHARMA_MEETINGS,
  BIOPHARMA_SUGGESTIONS,
} = window;

/* ──────────── Shared bits ──────────── */
function PageHead({ title, kicker, meta, primary }) {
  return (
    <div className="bp-page-head">
      <div>
        {kicker && <div className="bp-kicker">{kicker}</div>}
        <h1 className="bp-title">{title}</h1>
        {meta && <div className="bp-meta">{meta}</div>}
      </div>
      <div className="bp-page-actions">
        {primary}
      </div>
    </div>
  );
}

/* ──────────── Surface composer (the conversation-first lead-in)
 * Every biopharma pathway surface uses this as its top section. Pattern:
 *   greeting + state-of-this-surface · composer with drop zone · 4 starters · Today queue · then collapsed dashboard below.
 * The existing dashboard becomes the children of the wrapper section so
 * surfaces opt into "reference data, collapsible" automatically. */
function SurfaceComposer({ scope, kicker, title, stateLine, starters, queue, primary, onAskAna, children, dashboardLabel }) {
  const [dashboardOpen, setDashboardOpen] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef(null);

  const send = (text) => { if (text && text.trim()) onAskAna(text.trim()); setComposerValue(''); };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const names = Array.from(files).map(f => f.name).join(', ');
    onAskAna(`Classify and file these uploaded documents under ${scope}: ${names}. Suggest which section to anchor them to.`);
  };

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        {kicker && <div className="bp-kicker" style={{ marginBottom: 8 }}>{kicker}</div>}
        <h1>{title}</h1>
        {stateLine && <p className="bp-od-state">{stateLine}</p>}
        {primary && <div style={{ marginTop: 12 }}>{primary}</div>}
      </div>

      <div
        className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          rows={1}
          placeholder={`Drop files, ask AnA, or capture a note about ${scope}…`}
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(composerValue); } }}
        />
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => {
            const files = e.target.files; if (!files || !files.length) return;
            const names = Array.from(files).map(f => f.name).join(', ');
            onAskAna(`Classify and file these uploaded documents under ${scope}: ${names}.`);
            e.target.value = '';
          }}/>
          <button className="bp-od-chip" onClick={() => fileRef.current && fileRef.current.click()}>{I.attach} Drop files</button>
          <button className="bp-od-chip">{I.users || I.user} Mention</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{ marginLeft:'auto' }}>c2c-Opus 4.7 {I.down}</button>
          <button className="bp-od-send" disabled={!composerValue.trim()} onClick={() => send(composerValue)}>{I.arrowRight}</button>
        </div>
        {dragOver && <div className="bp-od-drop-hint">Drop to file with AnA — she'll classify and anchor it to {scope}.</div>}
      </div>

      {starters && starters.length > 0 && (
        <div className="bp-od-starters">
          {starters.map((s, i) => (
            <button key={i} className="bp-od-starter" onClick={() => onAskAna(typeof s === 'string' ? s : s.text)}>
              <span className="bp-od-starter-ico">{I[(typeof s === 'object' && s.ico) || 'sparkles'] || I.sparkles}</span>
              <span>{typeof s === 'string' ? s : s.text}</span>
            </button>
          ))}
        </div>
      )}

      {queue && queue.length > 0 && (
        <section className="bp-od-section">
          <header className="bp-od-section-head">
            <h2>Today · needs attention here</h2>
            <span className="bp-od-section-meta">{queue.length} items</span>
          </header>
          <div className="bp-od-queue">
            {queue.map((q, i) => (
              <button key={i} className={`bp-od-q-item bp-od-q-${q.tone || 'info'}`} onClick={() => onAskAna(q.cmd)}>
                <span className="bp-od-q-ico">{I[q.ico] || I.sparkles}</span>
                <div className="bp-od-q-body">
                  <div className="bp-od-q-title">{q.title}</div>
                  <div className="bp-od-q-sub">{q.sub}</div>
                </div>
                <span className="bp-od-q-action">{q.action || 'Open'} <span style={{ display:'inline-flex' }}>{I.arrowRight}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {children && (
        <section className="bp-od-section">
          <button className="bp-od-section-head bp-od-toggle" onClick={() => setDashboardOpen(o => !o)}>
            <span className="bp-od-chev" data-open={dashboardOpen || undefined}>{I.right}</span>
            <h2>{dashboardLabel || 'Reference data'}</h2>
            <span className="bp-od-section-meta">{dashboardOpen ? 'collapse' : 'expand to scan'}</span>
          </button>
          {dashboardOpen && <div style={{ marginTop: 14 }}>{children}</div>}
        </section>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  const cls = {
    approved: 'ok', complete: 'ok', drafted: 'draft',
    drafting: 'draft', review: 'review', queued: 'draft',
    submitted: 'review', closed: 'ok', open: 'warn',
    blocked: 'fail', active: 'review', evaluating: 'warn', monitoring: 'review',
    agreed: 'ok', 'in draft': 'draft',
  }[status] || 'draft';
  return <span className={`bp-dot bp-dot-${cls}`}/>;
}

function StatusPill({ status, label }) {
  const cls = {
    approved: 'ok', complete: 'ok', drafted: 'draft',
    drafting: 'draft', review: 'review', queued: 'draft',
    submitted: 'review', closed: 'ok', open: 'warn',
    blocked: 'fail', active: 'review', evaluating: 'warn', monitoring: 'review',
    agreed: 'ok', 'in draft': 'draft',
  }[status] || 'draft';
  return (
    <span className={`bp-pill bp-pill-${cls}`}>
      <span className="bp-dot"/>{label || status}
    </span>
  );
}

function ToneText({ tone, children }) {
  const cls = tone === 'err' ? 'tone-err' : tone === 'warn' ? 'tone-warn' : tone === 'ok' ? 'tone-ok' : '';
  return <span className={cls}>{children}</span>;
}

function ReadinessBar({ pct, tone }) {
  const t = tone || (pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'err');
  return (
    <div className={`bp-readiness bp-readiness-${t}`}>
      <div className="bp-readiness-bar"><div className="bp-readiness-fill" style={{ width: pct + '%' }}/></div>
      <span className="bp-readiness-pct">{pct}%</span>
    </div>
  );
}

function AskAnaChip({ label, onClick }) {
  return (
    <button className="bp-ask" onClick={onClick}>
      <span className="bp-ask-spark">{I.sparkles}</span>
      <span>{label}</span>
    </button>
  );
}

/* ──────────── Overview ────────────
 * Claude.ai-style start-of-day surface, tailored to a regulatory affairs lead.
 * Top to bottom:
 *   1. Personal greeting + overnight summary (state of the user, not portfolio)
 *   2. Large composer with file drop-zone + 4 surface-aware starters
 *   3. Today · your queue (TASKS not metrics — assigned, owed, inbound, captured)
 *   4. Active programs (collapsed by default — expand on click)
 *   5. Next 30 days (collapsed by default — agency calendar)
 *
 * The dashboard primitives (KPI strip, blockers list, recent activity) are
 * intentionally absent. They were portfolio-metrics; this surface answers
 * "what should I do right now" instead. Real-life user-first.
 */
function Overview({ programs, onAskAna }) {
  const [programsOpen, setProgramsOpen] = React.useState(false);
  const [upcomingOpen, setUpcomingOpen] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef(null);

  const total = programs.length;
  const blocked = programs.filter(p => p.status === 'blocked').length;
  const avgReadiness = Math.round(programs.reduce((a, p) => a + p.readiness, 0) / total);

  /* Greeting based on hour of day — like Claude.ai's. */
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  /* Surface-aware starters tied to today's actual state. These ARE the dashboard. */
  const STARTERS = [
    { text: '30-second status on each program for the 9 AM standup',                ico: 'clock'  },
    { text: 'Triage every open HAQ across the portfolio',                            ico: 'sparkles' },
    { text: 'What overnight from FDA, EMA, PMDA?',                                   ico: 'globe' },
    { text: 'Show me everything assigned to me, sorted by urgency',                  ico: 'clipboardList' },
  ];

  /* Today · your queue — TASKS, not metrics. In v2 these come from:
       - inbound HAQs across all your programs
       - sections assigned to you in c2c_document_sections
       - your @-mentions in comments
       - files dropped into AnA awaiting your acknowledgement
       - your calendar entries today
     The kit ships a representative day. */
  const QUEUE = [
    { kind: 'inbound',  ico: 'globe',      title: '3 open HAQs · BX-115',                 sub: 'FDA · day 9 of 14',                          tone: 'warn', action: 'Pre-draft now', cmd: '/respond all open HAQs on BX-115' },
    { kind: 'mention',  ico: 'users',      title: 'Marina blocked on §2.7 — needs you',   sub: 'BX-204 · reviewer feedback open',            tone: 'warn', action: 'Open §2.7',     cmd: 'Schedule 15 min with Marina at 8:30 to unblock §2.7' },
    { kind: 'signoff',  ico: 'shieldOk',   title: 'CMC stability addendum — your sign-off',sub: 'BX-204 · M3 §3.2.S.7.3',                     tone: 'warn', action: 'Open',           cmd: 'Open the BX-204 stability addendum for sign-off' },
    { kind: 'capture',  ico: 'attach',     title: 'Tox draft from Ravi — uploaded',       sub: 'WhatsApp · 6:48 AM · pending review',        tone: 'info', action: 'Review',         cmd: 'Open Ravi\'s tox draft and tell me what changed since v2' },
    { kind: 'meeting',  ico: 'chat',       title: 'CMO standup · 1h 15m',                 sub: 'No briefing prepared yet',                   tone: 'err',  action: 'Brief me',       cmd: 'Build a one-line status per program for the 9 AM CMO standup' },
  ];

  /* Next 30 days — agency calendar (the dashboard, but as a list). */
  const UPCOMING = [
    { when: '5 days',   what: '3 HAQ responses due',         agency: 'FDA',  prog: 'BX-115' },
    { when: '14 days',  what: 'IND amendment filing window', agency: 'FDA',  prog: 'BX-115' },
    { when: '28 days',  what: 'Pre-IND meeting',             agency: 'FDA',  prog: 'BX-256' },
    { when: '41 days',  what: 'NDA filing',                  agency: 'FDA',  prog: 'BX-204' },
    { when: '92 days',  what: 'CHMP Day 80 LoQ',             agency: 'EMA',  prog: 'BX-420' },
  ];

  const send = (text) => {
    if (text && text.trim()) onAskAna(text.trim());
    setComposerValue('');
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const names = Array.from(files).map(f => f.name).join(', ');
    onAskAna(`Classify and file these uploaded documents: ${names}. Suggest which program and which section to anchor them to, then write the audit row.`);
  };

  return (
    <div className="bp-surface bp-overview-start">
      {/* 1. Greeting + state-of-you summary */}
      <div className="bp-od-greet">
        <h1>{greet}, Jordan.</h1>
        <p className="bp-od-state">
          Overnight: <b>3 HAQs from FDA on BX-115</b>, Marina is blocked on §2.7, and Ravi sent you a tox draft.
          You have <b>{blocked} blocked</b> programs and <b>{avgReadiness}% portfolio readiness</b>.
        </p>
      </div>

      {/* 2. Composer with drop zone */}
      <div
        className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          rows={1}
          placeholder="Drop files, ask AnA, or capture a note…"
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(composerValue); } }}
        />
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => {
            const files = e.target.files; if (!files || !files.length) return;
            const names = Array.from(files).map(f => f.name).join(', ');
            onAskAna(`Classify and file these uploaded documents: ${names}.`);
            e.target.value = '';
          }}/>
          <button className="bp-od-chip" onClick={() => fileRef.current && fileRef.current.click()}>{I.attach} Drop files</button>
          <button className="bp-od-chip">{I.users || I.user} Mention</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{ marginLeft:'auto' }}>c2c-Opus 4.7 {I.down}</button>
          <button className="bp-od-send" disabled={!composerValue.trim()} onClick={() => send(composerValue)}>{I.arrowRight}</button>
        </div>
        {dragOver && (
          <div className="bp-od-drop-hint">Drop to file with AnA — she'll classify and anchor it.</div>
        )}
      </div>

      <div className="bp-od-starters">
        {STARTERS.map((s, i) => (
          <button key={i} className="bp-od-starter" onClick={() => onAskAna(s.text)}>
            <span className="bp-od-starter-ico">{I[s.ico] || I.sparkles}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>

      {/* 3. Today · your queue */}
      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Today · your queue</h2>
          <span className="bp-od-section-meta">{QUEUE.length} items</span>
          <span style={{ flex: 1 }}/>
          <a className="bp-od-section-link" href="#">Open inbox {I.arrowRight}</a>
        </header>
        <div className="bp-od-queue">
          {QUEUE.map((q, i) => (
            <button key={i} className={`bp-od-q-item bp-od-q-${q.tone}`} onClick={() => onAskAna(q.cmd)}>
              <span className="bp-od-q-ico">{I[q.ico] || I.sparkles}</span>
              <div className="bp-od-q-body">
                <div className="bp-od-q-title">{q.title}</div>
                <div className="bp-od-q-sub">{q.sub}</div>
              </div>
              <span className="bp-od-q-action">{q.action} <span style={{ display:'inline-flex' }}>{I.arrowRight}</span></span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. Active programs — collapsed by default */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={() => setProgramsOpen(o => !o)}>
          <span className="bp-od-chev" data-open={programsOpen || undefined}>{I.right}</span>
          <h2>Active programs</h2>
          <span className="bp-od-section-meta">{total} programs · sorted by urgency</span>
        </button>
        {programsOpen && (
          <div className="bp-table" style={{ marginTop: 10 }}>
            <div className="bp-tr bp-tr-head">
              <span>Program</span><span>Pathway</span><span>Stage</span><span>Readiness</span><span>Owner</span><span>Due</span><span/>
            </div>
            {[...programs].sort((a, b) => {
              const tone = { err: 0, warn: 1, ok: 2 };
              return (tone[a.dueTone] ?? 3) - (tone[b.dueTone] ?? 3);
            }).map(p => (
              <div key={p.id} className="bp-tr">
                <span className="bp-tr-name"><div className="bp-tr-title">{p.title}</div><div className="bp-tr-sub">{p.code}</div></span>
                <span><span className="bp-tag">{p.pathway.toUpperCase()}</span></span>
                <span className="bp-tr-stage">{p.stage}</span>
                <span><ReadinessBar pct={p.readiness}/></span>
                <span className="bp-tr-owner"><span className="bp-av">{p.lead.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>{p.lead}</span>
                <span><ToneText tone={p.dueTone}>{p.dueLabel}</ToneText></span>
                <span/>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Next 30 days — collapsed by default */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={() => setUpcomingOpen(o => !o)}>
          <span className="bp-od-chev" data-open={upcomingOpen || undefined}>{I.right}</span>
          <h2>Next 30 days</h2>
          <span className="bp-od-section-meta">{UPCOMING.length} agency milestones</span>
        </button>
        {upcomingOpen && (
          <div className="bp-od-calendar">
            {UPCOMING.map((u, i) => (
              <div key={i} className="bp-od-cal-row">
                <span className="bp-od-cal-when">{u.when}</span>
                <span className="bp-tag bp-tag-mono">{u.agency}</span>
                <span className="bp-od-cal-prog">{u.prog}</span>
                <span className="bp-od-cal-what">{u.what}</span>
                <button className="bp-btn-tert">{I.arrowRight}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ──────────── IND surface ──────────── */
function IndSurface({ program, programs, onAskAna }) {
  const indPrograms = programs.filter(p => p.pathway === 'ind');
  const p = program || indPrograms[0];
  const data = BIOPHARMA_IND;

  const queue = [
    { ico: 'globe',    title: '3 open HAQs · ' + (p ? p.title : 'BX-115'),    sub: 'FDA · day 9 of 14 · pre-draft window closing', tone: 'warn', action: 'Pre-draft now', cmd: `/respond all open HAQs on ${p ? p.title : 'BX-115'} now` },
    { ico: 'sparkles', title: '3 predicted HAQs ready to pre-empt',           sub: '86% · 72% · 91% likelihood — agency has not raised yet', tone: 'info', action: 'Review', cmd: `Show the 3 predicted HAQs for ${p ? p.title : 'BX-115'} and pre-draft responses to each` },
    { ico: 'shieldOk', title: 'Drug-substance stability — your sign-off',     sub: 'M3 §3.2.S.7.3 · 24-month projection · day 9 of 14',  tone: 'warn', action: 'Open',           cmd: `Open M3 §3.2.S.7.3 stability projection for ${p ? p.title : 'BX-115'} sign-off` },
    { ico: 'users',    title: 'Pediatric assessment waiver justification',    sub: 'M1 §1.9 · due Thursday',                              tone: 'warn', action: 'Draft',          cmd: `Draft pediatric assessment waiver justification for M1 §1.9 of ${p ? p.title : 'BX-115'}` },
    { ico: 'chat',     title: 'Type C briefing book — 60% drafted',           sub: '8 days to FDA meeting · CMC stability strategy',     tone: 'info', action: 'Continue',       cmd: `Continue drafting the Type C briefing book for ${p ? p.title : 'BX-115'} — focus on CMC stability strategy` },
  ];

  const stateLine = p
    ? `${p.title} · ${p.stage}. 3 HAQs open, 3 predicted, ${data.modules.find(m => m.id === 'm5').readiness}% clinical Module 5 ready. ${p.nextBlocker || ''}`
    : `${indPrograms.length} programs in IND stage`;

  return (
    <SurfaceComposer
      scope="this IND"
      kicker="IND / CTA · §312"
      title={p ? `${p.title} · IND ${p.code.split(' ')[0]}` : 'IND / CTA'}
      stateLine={stateLine}
      starters={[
        'Triage every open and predicted HAQ for this IND',
        'Prep the next Type B/C briefing book',
        'Run the IND amendment readiness check',
        'Show every blocker on this IND across modules',
      ]}
      queue={queue}
      primary={<>
        <button className="bp-btn-tert">{I.send} Submit IND amendment</button>
        <button className="bp-btn-primary">{I.sparkles} Draft with AnA</button>
      </>}
      onAskAna={onAskAna}
      dashboardLabel="Reference data · modules, FDA interactions, contradictions, blockers"
    >
      <div className="bp-modules-strip">
        {data.modules.map(m => (
          <div key={m.id} className="bp-module-card">
            <div className="bp-module-card-head">
              <span className="bp-module-card-path">{m.path}</span>
              <StatusPill status={m.status} label={m.status}/>
            </div>
            <div className="bp-module-card-label">{m.label}</div>
            <ReadinessBar pct={m.readiness}/>
            <div className="bp-module-card-sub">{m.done} of {m.sections} sections</div>
          </div>
        ))}
      </div>

      <div className="bp-split-1-1" style={{ marginTop: 16 }}>
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>FDA interactions and HAQs</h3>
            <span className="bp-card-meta">
              {data.fdaInteractions.filter(x => x.haqRefId && x.status !== 'closed').length} open HAQs ·
              {' '}{data.fdaInteractions.filter(x => x.status === 'open' || x.status === 'drafting').length} active total
            </span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.fdaInteractions.map((fda, i) => {
              const isHaq = !!fda.haqRefId;
              const isPredicted = fda.status === 'predicted';
              return (
                <div key={i} className={`bp-row ${isPredicted ? 'bp-row-predicted' : ''}`}>
                  <span className={`bp-tag bp-tag-mono ${isHaq ? 'bp-tag-haq' : ''} ${isPredicted ? 'bp-tag-predicted' : ''}`}>{fda.kind}</span>
                  <div className="bp-row-body">
                    <div className="bp-row-title">
                      {fda.topic}
                      {isPredicted && typeof fda.confidence === 'number' && (
                        <span className="bp-haq-conf" title="Likelihood the agency will raise this">
                          {Math.round(fda.confidence * 100)}% likely
                        </span>
                      )}
                    </div>
                    <div className="bp-row-sub">
                      {fda.date}
                      {fda.priorRef && <> · <span className="small-mono">{fda.priorRef}</span></>}
                      {fda.due && <> · <span className={fda.due.includes('day') ? 'tone-warn' : ''}>{fda.due} window</span></>}
                      <> · {fda.resolution}</>
                    </div>
                  </div>
                  {(isHaq && fda.status !== 'closed') && (
                    <button className="bp-btn-tert" title={isPredicted ? 'Pre-draft response now' : 'Draft response with AnA'}
                            onClick={(e) => { e.stopPropagation(); onAskAna(`/respond ${fda.haqRefId} — ${isPredicted ? 'pre-draft response now' : 'draft response'} anchored on ${fda.priorRef || 'the prior submission'}`); }}>
                      {I.sparkles} {isPredicted ? 'Pre-draft' : 'Draft response'}
                    </button>
                  )}
                  <StatusPill status={fda.status} label={fda.status}/>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Cross-module contradictions</h3>
            <span className="bp-card-meta">{data.contradictions.length} open</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.contradictions.map(c => (
              <div key={c.id} className="bp-row bp-row-stack">
                <div className="bp-row-line-1">
                  <span className={`bp-icon-warn tone-${c.sev}`}>{I.alertTriangle || I.warn}</span>
                  <span className="bp-row-title">{c.title}</span>
                  <span className="bp-av bp-av-sm">{c.owner}</span>
                </div>
                <div className="bp-row-desc">{c.desc}</div>
                <div className="bp-row-where">
                  {c.where.map(w => <span key={w} className="bp-where-chip">{w}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bp-card" style={{ marginTop: 16 }}>
        <div className="bp-card-head">
          <h3>Blockers</h3>
          <span className="bp-card-meta">{data.blockers.length} open · {data.blockers.filter(b => b.sev === 'err').length} critical</span>
        </div>
        <div className="bp-table bp-table-blockers">
          <div className="bp-tr bp-tr-head">
            <span>Sev</span><span>Owner</span><span>Blocker</span><span>Section</span><span>Due</span><span style={{textAlign:'right'}}>Action</span>
          </div>
          {data.blockers.map(b => (
            <div key={b.id} className="bp-tr">
              <span><span className={`bp-sev bp-sev-${b.sev}`}>{b.sev === 'err' ? 'Critical' : 'Warn'}</span></span>
              <span className="bp-tr-owner"><span className="bp-av">{b.who}</span></span>
              <span className="bp-tr-name"><div className="bp-tr-title">{b.label}</div></span>
              <span className="small-mono">{b.section}</span>
              <span><ToneText tone={b.sev}>{b.due}</ToneText></span>
              <span style={{textAlign:'right'}}>
                <button className="bp-btn-tert">{I.arrowRight}</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </SurfaceComposer>
  );
}

/* ──────────── NDA surface ──────────── */
function NdaSurface({ program, programs, onAskAna }) {
  const ndaPrograms = programs.filter(p => p.pathway === 'nda');
  const p = program || ndaPrograms[0];
  const data = BIOPHARMA_NDA;

  return (
    <div className="bp-surface">
      <PageHead
        kicker="NDA · 505(b)(1)"
        title={p ? `${p.title} · ${p.stage}` : 'NDA submissions'}
        meta={p ? `${p.meta} · ${p.dueLabel}` : `${ndaPrograms.length} NDA programs`}
        primary={<>
          <button className="bp-btn-tert">{I.download} Export review pack</button>
          <button className="bp-btn-primary">{I.send} File NDA</button>
        </>}
      />

      <div className="bp-modules-strip">
        {data.modules.map(m => (
          <div key={m.id} className="bp-module-card">
            <div className="bp-module-card-head">
              <span className="bp-module-card-path">{m.path}</span>
              <StatusPill status={m.status} label={m.status}/>
            </div>
            <div className="bp-module-card-label">{m.label}</div>
            <ReadinessBar pct={m.readiness}/>
            <div className="bp-module-card-sub">{m.done} of {m.sections} sections</div>
          </div>
        ))}
      </div>

      <div className="bp-split-1-1">
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Pivotal studies</h3>
            <span className="bp-card-meta">{data.pivotalStudies.length} studies · 1 ongoing</span>
          </div>
          <div className="bp-table">
            <div className="bp-tr bp-tr-head">
              <span>Study</span><span>Phase</span><span>N</span><span>Primary</span><span>CSR</span>
            </div>
            {data.pivotalStudies.map(s => (
              <div key={s.id} className="bp-tr">
                <span className="bp-tr-name small-mono">{s.id}</span>
                <span>Phase {s.phase}</span>
                <span style={{ fontVariantNumeric:'tabular-nums' }}>{s.n}</span>
                <span className="bp-tr-stage">{s.primary}</span>
                <span className="small-mono">{s.csr}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>FDA review clock</h3>
            <span className="bp-card-meta">PDUFA · {data.reviewClock.pdufa}</span>
          </div>
          <div className="bp-clock">
            <div className="bp-clock-item">
              <div className="bp-clock-lbl">Filed</div>
              <div className="bp-clock-val">{data.reviewClock.filed}</div>
            </div>
            <div className="bp-clock-item">
              <div className="bp-clock-lbl">Day 74 filing review</div>
              <div className="bp-clock-val">{data.reviewClock.day74}</div>
            </div>
            <div className="bp-clock-item">
              <div className="bp-clock-lbl">Mid-cycle review</div>
              <div className="bp-clock-val">{data.reviewClock.midcycle}</div>
            </div>
            <div className="bp-clock-item">
              <div className="bp-clock-lbl">Day 120 internal review</div>
              <div className="bp-clock-val">{data.reviewClock.day120}</div>
            </div>
            <div className="bp-clock-item bp-clock-pdufa">
              <div className="bp-clock-lbl">PDUFA target action</div>
              <div className="bp-clock-val">{data.reviewClock.pdufa}</div>
            </div>
          </div>
          <div className="bp-card-foot">
            <AskAnaChip label="Generate filing readiness pack" onClick={() => onAskAna(`Generate a complete NDA filing readiness pack for ${p ? p.title : 'BX-204'} — gap list, owners, day-74 risk assessment.`)}/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Pediatric surface ──────────── */
function PediatricSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_PEDIATRIC;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="Pediatric · §505B PREA · EMA PIP"
        title="Pediatric strategy"
        meta={`${data.plans.length} plans · ${data.prea.deferralsActive} active deferrals · ${data.prea.openMilestones} open milestones`}
        primary={<button className="bp-btn-primary">{I.plus} Open pediatric plan</button>}
      />

      <div className="bp-kpi-row">
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">FDA PREA waivers</div>
          <div className="bp-kpi-val">{data.prea.waiversFiled}</div>
          <div className="bp-kpi-sub">Filed · 0 pending</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">Active deferrals</div>
          <div className="bp-kpi-val">{data.prea.deferralsActive}</div>
          <div className="bp-kpi-sub">Across BX-204 · BX-420 · BX-301</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">Open milestones</div>
          <div className="bp-kpi-val">{data.prea.openMilestones}</div>
          <div className="bp-kpi-sub">3 due in 90 days</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">EU PIP modifications</div>
          <div className="bp-kpi-val">2</div>
          <div className="bp-kpi-sub">BX-420 · BX-301 pending CHMP advice</div>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Plans</h3>
          <span className="bp-card-meta">FDA iPSP + EMA PIP</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Plan</span><span>Product</span><span>Status</span><span>Age range</span><span>Deferrals</span><span>Waivers</span><span>Milestones</span><span>Next</span>
          </div>
          {data.plans.map(plan => (
            <div key={plan.id} className="bp-tr">
              <span className="bp-tr-name"><div className="bp-tr-title">{plan.kind}</div><div className="bp-tr-sub small-mono">{plan.id}</div></span>
              <span>{plan.product}</span>
              <span><StatusPill status={plan.status} label={plan.status}/></span>
              <span>{plan.ageRange}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{plan.deferrals}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{plan.waivers}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{plan.milestones}</span>
              <span className="bp-tr-stage">{plan.due}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Upcoming PREA milestones</h3>
        </div>
        <div className="bp-list bp-list-dense">
          {data.prea.upcoming.map((u, i) => (
            <div key={i} className="bp-row">
              <span className="bp-tag bp-tag-mono">{u.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{u.ms}</div>
                <div className="bp-row-sub">Due {u.due}</div>
              </div>
              <button className="bp-btn-tert" title="Open">{I.arrowRight}</button>
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <AskAnaChip label="Draft PREA waiver justification" onClick={() => onAskAna('Draft a PREA waiver justification for the indication BX-204 against the pediatric extrapolation framework from the Type C meeting Feb 2026.')}/>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Pharmacovigilance surface ──────────── */
function PvSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_PV;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="Pharmacovigilance · PSUR / PBRER · signals"
        title="Safety surveillance"
        meta={`${data.signals.length} signals under evaluation · ${data.psurs.length} aggregate reports in cycle`}
        primary={<button className="bp-btn-primary">{I.send} Submit safety report</button>}
      />

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Active signals</h3>
          <span className="bp-card-meta">FAERS + EudraVigilance · last 90 days</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Product</span><span>Term</span><span>Cases</span><span>PRR</span><span>Status</span><span>Owner</span><span>Age</span><span style={{textAlign:'right'}}>Action</span>
          </div>
          {data.signals.map(s => (
            <div key={s.id} className="bp-tr">
              <span><span className="bp-tag bp-tag-mono">{s.product}</span></span>
              <span className="bp-tr-name"><div className="bp-tr-title">{s.term}</div></span>
              <span style={{ fontVariantNumeric:'tabular-nums' }}>{s.count}</span>
              <span style={{ fontVariantNumeric:'tabular-nums' }} className={s.prr >= 3 ? 'tone-err' : s.prr >= 2 ? 'tone-warn' : ''}>{s.prr.toFixed(1)}</span>
              <span><StatusPill status={s.status} label={s.status}/></span>
              <span><span className="bp-av">{s.owner}</span></span>
              <span className="small-mono">{s.age}</span>
              <span style={{textAlign:'right'}}>
                <button className="bp-btn-tert">{I.arrowRight}</button>
              </span>
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <AskAnaChip label="Adjudicate the pneumonitis signal" onClick={() => onAskAna('Adjudicate the BX-099 immune-mediated pneumonitis signal — pull every case narrative, run causality assessment, suggest label update.')}/>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Aggregate reports in cycle</h3>
          <span className="bp-card-meta">PSUR + PBRER</span>
        </div>
        <div className="bp-list bp-list-dense">
          {data.psurs.map((r, i) => (
            <div key={i} className="bp-row">
              <span className="bp-tag bp-tag-mono">{r.product}</span>
              <div className="bp-row-body">
                <div className="bp-row-title">{r.cycle}</div>
                <div className="bp-row-sub">Due {r.dueAgency} · drafted by {r.writtenBy} · reviewers {r.reviewers.join(', ')}</div>
              </div>
              <StatusPill status={r.status} label={r.status}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────── BLA + MAA — lighter weight, same chassis ──────────── */
function PathwaySurface({ pathwayKey, kicker, programs, onAskAna, modulesData }) {
  const list = programs.filter(p => p.pathway === pathwayKey);
  const p = list[0];
  return (
    <div className="bp-surface">
      <PageHead
        kicker={kicker}
        title={p ? `${p.title} · ${p.stage}` : kicker}
        meta={p ? `${p.meta} · ${p.dueLabel}` : `${list.length} programs`}
        primary={<button className="bp-btn-primary">{I.sparkles} Draft with AnA</button>}
      />
      <div className="bp-card">
        <div className="bp-card-head">
          <h3>{kicker} programs</h3>
          <span className="bp-card-meta">{list.length} programs</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Program</span><span>Stage</span><span>Readiness</span><span>Owner</span><span>Due</span><span>Status</span>
          </div>
          {list.map(prog => (
            <div key={prog.id} className="bp-tr">
              <span className="bp-tr-name"><div className="bp-tr-title">{prog.title}</div><div className="bp-tr-sub">{prog.code}</div></span>
              <span className="bp-tr-stage">{prog.stage}</span>
              <span><ReadinessBar pct={prog.readiness}/></span>
              <span className="bp-tr-owner"><span className="bp-av">{prog.lead.split(' ').map(n=>n[0]).join('').slice(0,2)}</span>{prog.lead}</span>
              <span><ToneText tone={prog.dueTone}>{prog.dueLabel}</ToneText></span>
              <span><StatusPill status={prog.status} label={prog.status}/></span>
            </div>
          ))}
        </div>
      </div>
      {modulesData && (
        <div className="bp-modules-strip">
          {modulesData.map(m => (
            <div key={m.id} className="bp-module-card">
              <div className="bp-module-card-head">
                <span className="bp-module-card-path">{m.path}</span>
                <StatusPill status={m.status} label={m.status}/>
              </div>
              <div className="bp-module-card-label">{m.label}</div>
              <ReadinessBar pct={m.readiness}/>
              <div className="bp-module-card-sub">{m.done} of {m.sections} sections</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────── In-design / shared-chassis stub ──────────── */
function StubSurface({ nav, label, sharedWith }) {
  return (
    <div className="bp-surface">
      <div className="bp-stub">
        <div className="bp-stub-mark">{I.sparkles}</div>
        <div className="bp-stub-kicker">{sharedWith ? `Shared chassis · reuses ${sharedWith}` : 'In design · Phase 10.1'}</div>
        <h2>{label}</h2>
        <p>
          {sharedWith
            ? `This surface is identical between MDX and biopharma in v2. The same component renders from /mdx and /biopharma routes — only the program filter (domain="biopharma") changes. No biopharma-specific design work needed.`
            : `Designed in Phase 10.1. The data fixtures in data.jsx already cover this surface; the shell renders correctly. Drop in the surface body next phase.`}
        </p>
        <code style={{ color:'var(--text-400)', fontFamily:'var(--font-mono)', fontSize: 11 }}>
          biopharma/surfaces/{label.replace(/[^a-z]/gi,'')}.tsx
        </code>
      </div>
    </div>
  );
}

/* ──────────── JNDA · Japan ──────────── */
function JndaSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_JNDA;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="JNDA · 医薬品 · PMDA"
        title="Japan submissions"
        meta={`${data.programs.length} programs · ${data.consultations.filter(c => c.status === 'open').length} open consultation · bridging strategy aligned`}
        primary={<>
          <button className="bp-btn-tert">{I.send} File JNDA</button>
          <button className="bp-btn-primary">{I.sparkles} Draft with AnA</button>
        </>}
      />

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>PMDA review clock · BX-204</h3>
          <span className="bp-card-meta">Chuiyaku target {data.pmdaClock.chuiyaku}</span>
        </div>
        <div className="bp-clock">
          <div className="bp-clock-item"><div className="bp-clock-lbl">Pre-NDA consultation</div><div className="bp-clock-val">{data.pmdaClock.consultation}</div></div>
          <div className="bp-clock-item"><div className="bp-clock-lbl">Application filed</div><div className="bp-clock-val">{data.pmdaClock.application}</div></div>
          <div className="bp-clock-item"><div className="bp-clock-lbl">Day 85 first inquiry</div><div className="bp-clock-val">{data.pmdaClock.day85}</div></div>
          <div className="bp-clock-item"><div className="bp-clock-lbl">Day 120 expert discussion</div><div className="bp-clock-val">{data.pmdaClock.day120}</div></div>
          <div className="bp-clock-item bp-clock-pdufa"><div className="bp-clock-lbl">PMDA target action</div><div className="bp-clock-val">{data.pmdaClock.pmdaTarget}</div></div>
        </div>
      </div>

      <div className="bp-split-1-1">
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Bridging studies</h3>
            <span className="bp-card-meta">{data.bridgingStudies.length} studies</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.bridgingStudies.map(s => (
              <div key={s.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{s.id}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{s.kind} · N={s.n}</div>
                  <div className="bp-row-sub">{s.site}</div>
                </div>
                <StatusPill status={s.status} label={s.status}/>
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>PMDA consultations</h3>
            <span className="bp-card-meta">{data.consultations.length} total</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.consultations.map((c, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{c.kind}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{c.topic}</div>
                  <div className="bp-row-sub">{c.date} · {c.resolution}</div>
                </div>
                <StatusPill status={c.status} label={c.status}/>
              </div>
            ))}
          </div>
          <div className="bp-card-foot">
            <AskAnaChip label="Draft Pre-NDA briefing for PMDA" onClick={() => onAskAna('Draft a Pre-NDA briefing book for PMDA on CMC bridging — pull every Japan-specific release test and reconcile against global specs.')}/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Lifecycle management ──────────── */
function LifecycleSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_LIFECYCLE;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="Post-approval · supplements · variations"
        title="Lifecycle management"
        meta={`${data.supplements.length} supplements · ${data.cmcChangeControl.length} CMC changes in flight · ${data.renewals.length} renewal cycles`}
        primary={<button className="bp-btn-primary">{I.plus} New supplement</button>}
      />

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Supplements and variations</h3>
          <span className="bp-card-meta">FDA · EMA · PMDA</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Filing</span><span>Product</span><span>Subject</span><span>Status</span><span>Agency</span><span>Filed</span><span>Due</span>
          </div>
          {data.supplements.map(s => (
            <div key={s.id} className="bp-tr">
              <span className="bp-tr-name"><div className="bp-tr-title">{s.kind}</div><div className="bp-tr-sub small-mono">{s.id}</div></span>
              <span>{s.product}</span>
              <span className="bp-tr-stage">{s.subject}</span>
              <span><StatusPill status={s.status} label={s.status}/></span>
              <span className="bp-tag bp-tag-mono">{s.agency}</span>
              <span className="small-mono">{s.filed || '—'}</span>
              <span className="bp-tr-stage">{s.due}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bp-split-1-1">
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>CMC change control</h3>
            <span className="bp-card-meta">{data.cmcChangeControl.length} changes tracked</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.cmcChangeControl.map(c => (
              <div key={c.id} className="bp-row">
                <span className={`bp-sev bp-sev-${c.risk === 'high' ? 'err' : c.risk === 'medium' ? 'warn' : 'warn'}`} style={c.risk === 'low' ? { background:'var(--bg-100)', color:'var(--text-400)' } : null}>
                  {c.risk}
                </span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{c.title}</div>
                  <div className="bp-row-sub">{c.area} · {c.programs.join(', ')}</div>
                </div>
                <StatusPill status={c.status === 'implemented' ? 'approved' : c.status === 'planned' ? 'drafted' : 'evaluating'} label={c.status}/>
              </div>
            ))}
          </div>
          <div className="bp-card-foot">
            <AskAnaChip label="Classify these changes against ICH Q12" onClick={() => onAskAna('Classify the open CMC changes against ICH Q12 — flag which are PACMP-eligible and which need a prior-approval supplement.')}/>
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Renewal cycles</h3>
            <span className="bp-card-meta">PADER · 5-year · re-exam</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.renewals.map((r, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{r.authority}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{r.product} · {r.next}</div>
                  <div className="bp-row-sub">{r.interval} cycle</div>
                </div>
                <button className="bp-btn-tert">{I.arrowRight}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Orphan and rare ──────────── */
function OrphanSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_ORPHAN;
  const designated = data.designations.filter(d => d.status === 'designated').length;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="Orphan drug · rare disease"
        title="Orphan and rare programs"
        meta={`${designated} designated · ${data.designations.length - designated} pending · ${data.rpdGrants.length} RPD grants`}
        primary={<button className="bp-btn-primary">{I.plus} Open designation application</button>}
      />

      <div className="bp-kpi-row">
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">FDA designations</div>
          <div className="bp-kpi-val">{data.designations.filter(d => d.agency === 'FDA' && d.status === 'designated').length}</div>
          <div className="bp-kpi-sub">7-yr exclusivity each</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">EMA designations</div>
          <div className="bp-kpi-val">{data.designations.filter(d => d.agency === 'EMA' && d.status === 'designated').length}</div>
          <div className="bp-kpi-sub">10-yr exclusivity each</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">RPD voucher value</div>
          <div className="bp-kpi-val">$100M</div>
          <div className="bp-kpi-sub">BX-256 voucher sold</div>
        </div>
        <div className="bp-kpi">
          <div className="bp-kpi-lbl">Patient advocacy ties</div>
          <div className="bp-kpi-val">{data.patientAdvocacy.length}</div>
          <div className="bp-kpi-sub">Active engagements</div>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Designations</h3>
          <span className="bp-card-meta">FDA · EMA · PMDA</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Product</span><span>Agency</span><span>Indication</span><span>Status</span><span>Date</span><span>Prevalence</span><span>Benefits</span>
          </div>
          {data.designations.map((d, i) => (
            <div key={i} className="bp-tr">
              <span><span className="bp-tag bp-tag-mono">{d.product}</span></span>
              <span><span className="bp-tag">{d.agency}</span></span>
              <span className="bp-tr-name"><div className="bp-tr-title">{d.indication}</div></span>
              <span><StatusPill status={d.status === 'designated' ? 'approved' : d.status === 'requested' ? 'review' : 'drafted'} label={d.status}/></span>
              <span className="small-mono">{d.date || '—'}</span>
              <span className="bp-tr-stage">{d.prevalence}</span>
              <span style={{ fontSize: 11 }} className="bp-tr-stage">{d.benefits[0]}{d.benefits.length > 1 ? ` +${d.benefits.length-1}` : ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bp-split-1-1">
        <div className="bp-card">
          <div className="bp-card-head"><h3>RPD vouchers and grants</h3></div>
          <div className="bp-list bp-list-dense">
            {data.rpdGrants.map((g, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{g.product}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{g.kind} · {g.voucherValue}</div>
                  <div className="bp-row-sub">{g.notes}</div>
                </div>
                <StatusPill status="approved" label={g.status}/>
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head"><h3>Patient advocacy engagements</h3></div>
          <div className="bp-list bp-list-dense">
            {data.patientAdvocacy.map((p, i) => (
              <div key={i} className="bp-row">
                <span className="bp-tag bp-tag-mono">{p.product}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{p.org}</div>
                  <div className="bp-row-sub">{p.engagement}</div>
                </div>
                <button className="bp-btn-tert">{I.arrowRight}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Agency meetings ──────────── */
function MeetingsSurface({ programs, onAskAna }) {
  const data = BIOPHARMA_MEETINGS;
  return (
    <div className="bp-surface">
      <PageHead
        kicker="FDA · EMA · PMDA · Type A/B/C/D · scientific advice"
        title="Agency meetings"
        meta={`${data.upcoming.length} upcoming · ${data.recent.length} concluded this year`}
        primary={<button className="bp-btn-primary">{I.plus} Request meeting</button>}
      />

      <div className="bp-card">
        <div className="bp-card-head">
          <h3>Upcoming meetings</h3>
          <span className="bp-card-meta">Briefing books in flight</span>
        </div>
        <div className="bp-table">
          <div className="bp-tr bp-tr-head">
            <span>Meeting</span><span>Product</span><span>Topic</span><span>Date</span><span>Briefing due</span><span>Briefing</span><span>Owner</span><span>Status</span>
          </div>
          {data.upcoming.map(m => (
            <div key={m.id} className="bp-tr">
              <span><span className="bp-tag bp-tag-mono">{m.kind}</span></span>
              <span>{m.product}</span>
              <span className="bp-tr-stage">{m.topic}</span>
              <span className="small-mono">{m.date}</span>
              <span className="small-mono">{m.briefingDue || '—'}</span>
              <span><ReadinessBar pct={m.briefingPct}/></span>
              <span><span className="bp-av">{m.owner}</span></span>
              <span><StatusPill status={m.status === 'briefing-due' ? 'review' : m.status === 'scheduled' ? 'drafted' : 'queued'} label={m.status}/></span>
            </div>
          ))}
        </div>
        <div className="bp-card-foot">
          <AskAnaChip label="Draft Type C briefing book for BX-115" onClick={() => onAskAna('Draft the complete Type C briefing book for BX-115 CMC stability — pull the FDA 2023 stability guidance, our prior nonclinical alignment, and structure 6 questions for the agency.')}/>
        </div>
      </div>

      <div className="bp-split-1-1">
        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Recent meetings</h3>
            <span className="bp-card-meta">Outcomes + minutes</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.recent.map(m => (
              <div key={m.id} className="bp-row">
                <span className="bp-tag bp-tag-mono">{m.kind}</span>
                <div className="bp-row-body">
                  <div className="bp-row-title">{m.product} · {m.topic}</div>
                  <div className="bp-row-sub">{m.date} · {m.minutes}</div>
                </div>
                <StatusPill status={m.outcome === 'aligned' ? 'approved' : m.outcome === 'partial' ? 'review' : 'drafted'} label={m.outcome}/>
              </div>
            ))}
          </div>
        </div>

        <div className="bp-card">
          <div className="bp-card-head">
            <h3>Briefing book pipeline</h3>
            <span className="bp-card-meta">Section readiness</span>
          </div>
          <div className="bp-list bp-list-dense">
            {data.briefingBooks.map(b => {
              const total = b.sections;
              const ready = b.finalized;
              const pct = Math.round(((b.drafted + b.reviewed + b.finalized) / total) * 100);
              const meeting = data.upcoming.find(m => m.id === b.meetingId);
              return (
                <div key={b.meetingId} className="bp-row bp-row-stack">
                  <div className="bp-row-line-1">
                    <span className="bp-tag bp-tag-mono">{meeting ? meeting.kind : b.meetingId}</span>
                    <span className="bp-row-title">{meeting ? meeting.topic : b.meetingId}</span>
                    <span className="small-mono">{ready}/{total} final</span>
                  </div>
                  <ReadinessBar pct={pct}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.BiopharmaOverview   = Overview;
window.BiopharmaInd        = IndSurface;
window.BiopharmaNda        = NdaSurface;
window.BiopharmaPediatric  = PediatricSurface;
window.BiopharmaPv         = PvSurface;
window.BiopharmaJnda       = JndaSurface;
window.BiopharmaLifecycle  = LifecycleSurface;
window.BiopharmaOrphan     = OrphanSurface;
window.BiopharmaMeetings   = MeetingsSurface;
window.BiopharmaPathway    = PathwaySurface;
window.BiopharmaStub       = StubSurface;

})();
