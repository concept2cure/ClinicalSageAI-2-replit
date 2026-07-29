(() => {
/* Submission Gateway — Icons + surface.
 * Reuses the MDX chassis (rail/topbar via CSS) + biopharma's start-of-day
 * composer pattern. Self-contained: one surface, one composer, one
 * collapsible gateway dashboard. */

const { useState, useRef } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  send:      <Icon d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}/>,
  rocket:    <Icon d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>,
  arrowRight:<Icon d={<><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>}/>,
  arrowUp:   <Icon d={<><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>}/>,
  down:      <Icon d={<><polyline points="6 9 12 15 18 9"/></>}/>,
  right:     <Icon d={<><polyline points="9 6 15 12 9 18"/></>}/>,
  attach:    <Icon d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
  sparkles:  <Icon d={<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></>}/>,
  check:     <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  warn:      <Icon d={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
  globe:     <Icon d={<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}/>,
  search:    <Icon d={<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>}/>,
  bell:      <Icon d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}/>,
  shield:    <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>}/>,
};

const STAGE_LABEL = {
  'validating':   'Validating',
  'awaiting-ack': 'Awaiting ACK',
  'in-review':    'In agency review',
  'accepted':     'Accepted',
  'rejected':     'Rejected',
};
const STAGE_TONE = {
  'validating':   'info',
  'awaiting-ack': 'warn',
  'in-review':    'ok',
  'accepted':     'ok',
  'rejected':     'err',
};

function StatusPill({ stage }) {
  const tone = STAGE_TONE[stage] || 'info';
  return <span className={`sg-pill sg-pill-${tone}`}><span className="sg-dot"/>{STAGE_LABEL[stage] || stage}</span>;
}

/* ACK 1/2/3 lights — the regulatory transmit receipt chain. */
function AckChain({ ack }) {
  const cell = (label, v) => {
    const cls = v === 'received' ? 'ok' : v === 'failed' ? 'err' : v === 'n/a' ? 'na' : 'pending';
    return <span className={`sg-ack sg-ack-${cls}`} title={`${label}: ${v}`}>{label}</span>;
  };
  return <span className="sg-ackchain">{cell('1', ack.a1)}{cell('2', ack.a2)}{cell('3', ack.a3)}</span>;
}

function Surface({ onAskAna }) {
  const [composerValue, setComposerValue] = useState('');
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const tx = window.SG_TRANSMISSIONS;
  const gw = window.SG_GATEWAYS;
  const val = window.SG_VALIDATION;

  const inFlight = tx.filter(t => t.stage === 'validating' || t.stage === 'awaiting-ack' || t.stage === 'in-review').length;
  const rejected = tx.filter(t => t.stage === 'rejected').length;

  const send = (text) => { if (text && text.trim()) onAskAna(text.trim()); setComposerValue(''); };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    onAskAna(`Validate and prepare these files for transmission: ${Array.from(files).map(f => f.name).join(', ')}. Run pre-flight against the target agency's eCTD profile.`);
  };

  /* Today's queue — what needs action in the gateway right now. */
  const queue = [
    { ico: 'warn',   title: 'BX-099 PSUR rejected — ACK2 schema failure',  sub: 'EMA CESP · regional XML · re-transmit needed', tone: 'err',  action: 'Fix and re-transmit', cmd: 'Diagnose the BX-099 PSUR ACK2 schema failure and re-transmit after fixing the regional XML' },
    { ico: 'shield', title: '2 validation findings on BX-301 BLA',         sub: 'STF missing · regional checksum mismatch',     tone: 'warn', action: 'Clear findings',       cmd: 'Clear the 2 pre-flight validation findings on the BX-301 BLA package' },
    { ico: 'send',   title: 'BX-204 NDA — ACK2 expected within 24h',       sub: 'FDA ESG · transmitted 06:12 · Core ID assigned', tone: 'warn', action: 'Track',               cmd: 'Track the BX-204 NDA transmission and alert me when ACK2 or ACK3 arrives' },
    { ico: 'globe',  title: 'PMDA Gateway connection pending',             sub: 'Japan · credentials in provisioning',          tone: 'info', action: 'Open',                cmd: 'What is blocking the PMDA Gateway connection and how do I complete provisioning?' },
  ];

  return (
    <div className="bp-surface bp-overview-start">
      <div className="bp-od-greet">
        <div className="bp-kicker" style={{ marginBottom: 8 }}>Submission Center · agency gateways</div>
        <h1>Submission Center</h1>
        <p className="bp-od-state">
          <b>{inFlight} transmissions in flight</b> across FDA ESG, EMA CESP, and Health Canada.
          {rejected > 0 && <> <b>{rejected} rejected</b> and awaiting re-transmit.</>} The BX-204 NDA went to FDA at 06:12 — ACK2 expected within 24 hours.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="bp-btn-tert">{I.shield} Run pre-flight validation</button>
          <button className="bp-btn-primary">{I.send} Transmit a package</button>
        </div>
      </div>

      <div className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
           onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
           onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
           onDragLeave={() => setDragOver(false)}
           onDrop={onDrop}>
        <textarea rows={1} placeholder="Drop a package to validate, ask AnA about a transmission, or start a submission…"
                  value={composerValue} onChange={(e) => setComposerValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(composerValue); } }}/>
        <div className="bp-od-composer-row">
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => {
            const files = e.target.files; if (!files || !files.length) return;
            onAskAna(`Validate and prepare these files for transmission: ${Array.from(files).map(f => f.name).join(', ')}.`);
            e.target.value = '';
          }}/>
          <button className="bp-od-chip" onClick={() => fileRef.current && fileRef.current.click()}>{I.attach} Drop package</button>
          <button className="bp-od-chip">{I.sparkles} Skills</button>
          <button className="bp-od-chip" style={{ marginLeft:'auto' }}>AnA 1.0 {I.down}</button>
          <button className="bp-od-send" disabled={!composerValue.trim()} onClick={() => send(composerValue)}>{I.arrowRight}</button>
        </div>
        {dragOver && <div className="bp-od-drop-hint">Drop to validate against the target agency's eCTD profile.</div>}
      </div>

      <div className="bp-od-starters">
        {window.SG_SUGGESTIONS.map((s, i) => (
          <button key={i} className="bp-od-starter" onClick={() => onAskAna(s)}>
            <span className="bp-od-starter-ico">{I.sparkles}</span><span>{s}</span>
          </button>
        ))}
      </div>

      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Today · needs attention here</h2>
          <span className="bp-od-section-meta">{queue.length} items</span>
        </header>
        <div className="bp-od-queue">
          {queue.map((q, i) => (
            <button key={i} className={`bp-od-q-item bp-od-q-${q.tone}`} onClick={() => onAskAna(q.cmd)}>
              <span className="bp-od-q-ico">{I[q.ico] || I.send}</span>
              <div className="bp-od-q-body">
                <div className="bp-od-q-title">{q.title}</div>
                <div className="bp-od-q-sub">{q.sub}</div>
              </div>
              <span className="bp-od-q-action">{q.action} <span style={{ display:'inline-flex' }}>{I.arrowRight}</span></span>
            </button>
          ))}
        </div>
      </section>

      {/* Transmissions table — primary working data, always visible (this IS the gateway) */}
      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Transmissions</h2>
          <span className="bp-od-section-meta">{tx.length} total · {inFlight} in flight</span>
        </header>
        <div className="sg-table">
          <div className="sg-tr sg-tr-head">
            <span>Program</span><span>Type</span><span>Agency · seq</span><span>Core ID</span><span>ACK</span><span>Stage</span><span>Note</span>
          </div>
          {tx.map(t => {
            const g = gw.find(x => x.id === t.agency);
            return (
              <button key={t.id} className="sg-tr" onClick={() => onAskAna(`Open transmission ${t.coreId} (${t.program} ${t.docType}) and show the full receipt detail and next step`)}>
                <span className="sg-prog">{t.program}</span>
                <span className="sg-type">{t.docType}</span>
                <span className="sg-agency">{g ? g.label : t.agency}<span className="sg-seq"> · {t.seq}</span></span>
                <span className="sg-core small-mono">{t.coreId}</span>
                <span><AckChain ack={t.ack}/></span>
                <span><StatusPill stage={t.stage}/></span>
                <span className="sg-note">{t.note}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Validation detail + gateway connections — collapsed reference */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" onClick={() => setDashboardOpen(o => !o)}>
          <span className="bp-od-chev" data-open={dashboardOpen || undefined}>{I.right}</span>
          <h2>Pre-flight validation and gateway connections</h2>
          <span className="bp-od-section-meta">{dashboardOpen ? 'collapse' : 'expand to scan'}</span>
        </button>
        {dashboardOpen && (
          <div style={{ marginTop: 14 }} className="bp-split-1-1">
            <div className="bp-card">
              <div className="bp-card-head">
                <h3>Pre-flight · {val.program} BLA</h3>
                <span className="bp-card-meta">{val.findings.filter(f => f.sev !== 'ok').length} to clear</span>
              </div>
              <div className="bp-list bp-list-dense">
                {val.findings.map((f, i) => (
                  <div key={i} className="bp-row">
                    <span className={`sg-find sg-find-${f.sev}`}>{f.sev === 'err' ? I.warn : f.sev === 'warn' ? I.warn : I.check}</span>
                    <div className="bp-row-body">
                      <div className="bp-row-title">{f.msg}</div>
                      <div className="bp-row-sub">{f.rule}{f.section !== '—' ? ` · ${f.section}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bp-card-foot">
                <button className="bp-ask" onClick={() => onAskAna('Clear the 2 pre-flight validation findings on the BX-301 BLA — fix the STF and the regional checksum')}>
                  <span className="bp-ask-spark">{I.sparkles}</span><span>Clear findings with AnA</span>
                </button>
              </div>
            </div>

            <div className="bp-card">
              <div className="bp-card-head"><h3>Gateway connections</h3><span className="bp-card-meta">{gw.filter(g => g.status === 'connected').length} connected</span></div>
              <div className="bp-list bp-list-dense">
                {gw.map(g => (
                  <div key={g.id} className="bp-row">
                    <span className={`sg-conn sg-conn-${g.status}`}/>
                    <div className="bp-row-body">
                      <div className="bp-row-title">{g.label} · {g.region}</div>
                      <div className="bp-row-sub">{g.proto} · last ACK {g.lastAck}</div>
                    </div>
                    <span className={`sg-pill sg-pill-${g.status === 'connected' ? 'ok' : 'warn'}`}><span className="sg-dot"/>{g.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

window.SG_I = I;
window.SubmissionSurface = Surface;

})();
