(() => {
/* 21 CFR Part 11 e-signature modal — universal governed-action gate.
 * ─────────────────────────────────────────────────────────────
 * Fires whenever useC2cAction() runs a risk='high' mutation (sign, lock,
 * submit, approve-release). Captures §11.50 signature meaning, §11.100
 * re-authentication, and the §11.70 record binding. On confirm it POSTs
 * to /api/c2c/actions/sign with { meaning, credentialBindingHash, reason }.
 *
 * Lands at client/src/concept2cure/_shared/components/EsignModal.tsx —
 * promotes the existing mdx/components/EsignModal.tsx into the shared layer.
 *
 * This kit is a harness: a page of governed-action buttons that open the
 * modal with different meanings so reviewers see every variant.
 */

const { useState, useEffect, useRef } = React;

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{typeof d === 'string' ? <path d={d}/> : d}</svg>
);
const I = {
  lock:   <Icon d={<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}/>,
  check:  <Icon d={<><polyline points="20 6 9 17 4 12"/></>}/>,
  close:  <Icon d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}/>,
  shield: <Icon d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></>}/>,
  send:   <Icon d={<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>}/>,
  pen:    <Icon d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}/>,
  alert:  <Icon d={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}/>,
};

/* §11.50(b) signature meanings — the closed enum the agency requires. */
const MEANINGS = [
  { id: 'authorship', label: 'Authorship',  desc: 'I authored this content' },
  { id: 'review',     label: 'Review',      desc: 'I reviewed this content' },
  { id: 'approval',   label: 'Approval',    desc: 'I approve this content for use' },
  { id: 'responsibility', label: 'Responsibility', desc: 'I take responsibility for this content' },
  { id: 'release',    label: 'Release',     desc: 'I authorize release / submission' },
];

/* ───────── The modal ───────── */
function EsignModal({ open, action, onClose, onSigned }) {
  const [meaning, setMeaning] = useState('approval');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState('form'); // form | signing | signed
  const pwRef = useRef(null);

  useEffect(() => {
    if (open) { setPhase('form'); setPassword(''); setReason(''); setMeaning(action?.defaultMeaning || 'approval'); setTimeout(() => pwRef.current && pwRef.current.focus(), 80); }
  }, [open, action]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && open && phase === 'form') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  if (!open || !action) return null;

  const canSign = password.length >= 6 && reason.trim().length >= 4;
  const meaningObj = MEANINGS.find(m => m.id === meaning);

  const sign = () => {
    if (!canSign) return;
    setPhase('signing');
    // Simulated re-auth + chain write. In v2: POST /api/c2c/actions/sign.
    setTimeout(() => {
      setPhase('signed');
      setTimeout(() => { onSigned && onSigned({ meaning, reason, at: new Date().toISOString() }); }, 900);
    }, 1100);
  };

  return (
    <div className="es-overlay" onMouseDown={() => phase === 'form' && onClose()}>
      <div className="es-modal" onMouseDown={(e) => e.stopPropagation()}>
        {phase === 'signed' ? (
          <div className="es-done">
            <div className="es-done-mark">{I.check}</div>
            <h3>Signature applied</h3>
            <p>{meaningObj.label} signature recorded against <b>{action.targetLabel}</b>. The 21 CFR Part 11 audit chain has a new entry.</p>
            <div className="es-manifest">
              <div className="es-manifest-row"><span>Signed by</span><span>{action.signer || 'Jordan Chen'}</span></div>
              <div className="es-manifest-row"><span>Meaning</span><span>{meaningObj.label}</span></div>
              <div className="es-manifest-row"><span>When</span><span>{new Date().toLocaleString()}</span></div>
              <div className="es-manifest-row"><span>Chain</span><span className="es-mono">sha256·a8c2…f019</span></div>
            </div>
          </div>
        ) : (
          <>
            <div className="es-head">
              <span className="es-head-ico">{I.pen}</span>
              <div>
                <div className="es-head-title">Electronic signature</div>
                <div className="es-head-sub">21 CFR Part 11 · §11.50 · §11.100 · §11.70</div>
              </div>
              <button className="es-close" onClick={onClose} disabled={phase==='signing'}>{I.close}</button>
            </div>

            <div className="es-target">
              <span className="es-target-lbl">You are signing</span>
              <div className="es-target-name">{action.targetLabel}</div>
              {action.targetMeta && <div className="es-target-meta">{action.targetMeta}</div>}
              {action.risk === 'high' && (
                <div className="es-risk"><span className="es-risk-ico">{I.alert}</span>This is a high-impact action. Re-authentication is required and the signature is permanent.</div>
              )}
            </div>

            <label className="es-field">
              <span className="es-field-lbl">Signature meaning · §11.50(b)</span>
              <div className="es-meaning">
                {MEANINGS.map(m => (
                  <button key={m.id} type="button" className="es-meaning-opt" data-active={meaning===m.id || undefined}
                          onClick={() => setMeaning(m.id)} title={m.desc}>{m.label}</button>
                ))}
              </div>
              <span className="es-field-hint">{meaningObj.desc}</span>
            </label>

            <label className="es-field">
              <span className="es-field-lbl">Reason for signing</span>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="Briefly state why you are signing — captured in the audit record." disabled={phase==='signing'}/>
            </label>

            <label className="es-field">
              <span className="es-field-lbl">Re-authenticate · §11.100</span>
              <input ref={pwRef} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="Enter your password to manifest the signature" disabled={phase==='signing'}
                     onKeyDown={(e) => { if (e.key === 'Enter') sign(); }}/>
              <span className="es-field-hint">Identity confirmation is bound to this signature event only.</span>
            </label>

            <div className="es-foot">
              <button className="es-btn-secondary" onClick={onClose} disabled={phase==='signing'}>Cancel</button>
              <button className="es-btn-primary" onClick={sign} disabled={!canSign || phase==='signing'}>
                {phase==='signing' ? <><span className="es-spin"/> Manifesting…</> : <>{I.lock} Sign · {meaningObj.label}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── Harness — governed-action buttons ───────── */
function App() {
  const [modal, setModal] = useState(null);
  const [log, setLog] = useState([]);

  const ACTIONS = [
    { id: 'approve-sec',  label: 'Approve §2.5 Clinical overview', meaning: 'approval', risk: 'med',  targetLabel: 'NDA 212345 · §2.5 Clinical overview', targetMeta: 'BX-204 · v0.4 · 11 citations', defaultMeaning: 'approval' },
    { id: 'lock-doc',     label: 'Lock the BX-204 dossier',        meaning: 'release',  risk: 'high', targetLabel: 'NDA 212345 dossier', targetMeta: 'Locks all 84 sections · immutable until unlocked', defaultMeaning: 'responsibility' },
    { id: 'release-sub',  label: 'Authorize FDA transmission',     meaning: 'release',  risk: 'high', targetLabel: 'NDA 212345 · transmit to FDA ESG', targetMeta: 'Sequence 0001 · Core ID assigned on send', defaultMeaning: 'release' },
    { id: 'review-haq',   label: 'Sign off HAQ response',          meaning: 'review',   risk: 'med',  targetLabel: 'HAQ-2026-04-22-A response', targetMeta: 'CMC stability · day 9 of 14', defaultMeaning: 'review' },
  ];

  return (
    <div className="es-shell">
      <div className="es-demo">
        <div className="es-demo-kicker">21 CFR Part 11 · electronic signature gate</div>
        <h1 className="es-demo-title">Governed actions</h1>
        <p className="es-demo-sub">Every high-impact action routes through the Part 11 signature gate. The modal captures signature meaning, re-authentication, and a reason — then writes the audit chain. Click any action.</p>
        <div className="es-demo-actions">
          {ACTIONS.map(a => (
            <button key={a.id} className="es-demo-btn" onClick={() => setModal(a)}>
              <span className="es-demo-btn-ico">{a.risk === 'high' ? I.shield : I.pen}</span>
              <span className="es-demo-btn-body">
                <span className="es-demo-btn-label">{a.label}</span>
                <span className="es-demo-btn-meta">{a.targetLabel}{a.risk === 'high' ? ' · high impact' : ''}</span>
              </span>
              <span className={`es-demo-risk es-demo-risk-${a.risk}`}>{a.risk}</span>
            </button>
          ))}
        </div>

        {log.length > 0 && (
          <div className="es-ledger">
            <div className="es-ledger-head">Audit chain · this session</div>
            {log.map((e, i) => (
              <div key={i} className="es-ledger-row">
                <span className="es-ledger-ico">{I.check}</span>
                <span className="es-ledger-body"><b>{e.meaning}</b> · {e.target}<br/><span className="es-ledger-meta">{e.reason} · {new Date(e.at).toLocaleTimeString()}</span></span>
                <span className="es-mono es-ledger-hash">sha256·{Math.random().toString(16).slice(2,6)}…{Math.random().toString(16).slice(2,6)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <EsignModal
        open={!!modal}
        action={modal}
        onClose={() => setModal(null)}
        onSigned={(sig) => { setLog(l => [{ ...sig, target: modal.targetLabel }, ...l]); setModal(null); }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

})();
