/**
 * <EsignModal> — 21 CFR Part 11 e-signature flow.
 *
 * 3-step modal:
 *   1. Reason for action (free text + meaning enum: reviewed/approved/responsibility)
 *   2. Identity re-challenge (password + TOTP)
 *   3. Confirmation — shows the signature manifest entry before commit
 *
 * Triggered from any governed mutation across the platform: approve CAPA,
 * sign artifact, accept AnA draft, transmit submission, grant access.
 * The mutation is held in flight until step 3 commits.
 *
 * Globals set: window.EsignModal
 */

(() => {

const { I } = window;

const MEANINGS = [
  { id: 'reviewed',      label: 'Reviewed',         desc: 'Acknowledges I have read and assessed this' },
  { id: 'approved',      label: 'Approved',         desc: 'Authorizes this artifact for release' },
  { id: 'responsibility',label: 'Responsibility',   desc: 'Asserts I am responsible for the content' },
  { id: 'authorship',    label: 'Authorship',       desc: 'Identifies me as the author' },
];

function EsignModal({ open, action, target, defaultMeaning, onCancel, onConfirm }) {
  const [step, setStep] = React.useState(1);
  const [reason, setReason] = React.useState('');
  const [meaning, setMeaning] = React.useState(defaultMeaning || 'approved');
  const [password, setPassword] = React.useState('');
  const [totp, setTotp] = React.useState('');
  const [committing, setCommitting] = React.useState(false);

  React.useEffect(() => {
    if (open) { setStep(1); setReason(''); setPassword(''); setTotp(''); setCommitting(false); }
  }, [open]);

  if (!open) return null;

  const canStep2 = reason.trim().length >= 8;
  const canCommit = password.length >= 8 && totp.length === 6;

  const commit = () => {
    setCommitting(true);
    setTimeout(() => {
      onConfirm && onConfirm({
        reason, meaning,
        signedAt: new Date().toISOString(),
        manifestId: 'sig-' + Math.random().toString(36).slice(2, 10),
      });
    }, 400);
  };

  return (
    <div className="esig-backdrop" role="dialog" aria-modal="true" aria-label="E-signature required">
      <div className="esig-modal">
        <div className="esig-head">
          <span className="esig-mark">{I.shieldCheck}</span>
          <div>
            <div className="esig-eyebrow">21 CFR Part 11 · e-signature</div>
            <div className="esig-title">{action}</div>
            <div className="esig-target">{target}</div>
          </div>
          <button className="esig-close" onClick={onCancel} title="Cancel">{I.close}</button>
        </div>

        <div className="esig-steps">
          <span className={`esig-step ${step >= 1 ? 'on' : ''}`}>1 · Reason</span>
          <span className="esig-step-sep" />
          <span className={`esig-step ${step >= 2 ? 'on' : ''}`}>2 · Identity</span>
          <span className="esig-step-sep" />
          <span className={`esig-step ${step >= 3 ? 'on' : ''}`}>3 · Commit</span>
        </div>

        {step === 1 && (
          <div className="esig-body">
            <label className="esig-label">Reason for this action</label>
            <textarea
              className="esig-input esig-textarea"
              rows={3}
              placeholder="A short, specific reason. Becomes part of the immutable audit entry."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="esig-hint">Minimum 8 characters · stored verbatim in the audit log</div>

            <label className="esig-label" style={{ marginTop: 16 }}>Signature meaning</label>
            <div className="esig-meanings">
              {MEANINGS.map(m => (
                <button
                  key={m.id}
                  className="esig-meaning"
                  data-on={meaning === m.id}
                  onClick={() => setMeaning(m.id)}
                >
                  <span className="esig-meaning-label">{m.label}</span>
                  <span className="esig-meaning-desc">{m.desc}</span>
                </button>
              ))}
            </div>

            <div className="esig-foot">
              <button className="btn ghost small" onClick={onCancel}>Cancel</button>
              <button className="btn primary small" disabled={!canStep2} onClick={() => setStep(2)}>Continue {I.arrowRight}</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="esig-body">
            <div className="esig-identity">
              <div className="esig-identity-name">Jordan Chen · jordan@c2c.io</div>
              <div className="esig-identity-role">Admin · last signed 14m ago</div>
            </div>

            <label className="esig-label">Password</label>
            <input
              type="password"
              className="esig-input"
              placeholder="Your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />

            <label className="esig-label" style={{ marginTop: 12 }}>Authenticator code (TOTP)</label>
            <input
              className="esig-input esig-totp"
              placeholder="6-digit code"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <div className="esig-hint">Re-challenge is required per signing event · never persistent</div>

            <div className="esig-foot">
              <button className="btn ghost small" onClick={() => setStep(1)}>← Back</button>
              <button className="btn primary small" disabled={!canCommit} onClick={() => setStep(3)}>Continue {I.arrowRight}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="esig-body">
            <div className="esig-summary">
              <div className="esig-summary-lbl">Signing manifest preview</div>
              <div className="esig-summary-row"><span className="k">Action</span><span className="v">{action}</span></div>
              <div className="esig-summary-row"><span className="k">Target</span><span className="v mono small">{target}</span></div>
              <div className="esig-summary-row"><span className="k">Signer</span><span className="v">Jordan Chen · jordan@c2c.io</span></div>
              <div className="esig-summary-row"><span className="k">Meaning</span><span className="v">{MEANINGS.find(m => m.id === meaning).label}</span></div>
              <div className="esig-summary-row"><span className="k">Reason</span><span className="v">{reason}</span></div>
              <div className="esig-summary-row"><span className="k">Timestamp</span><span className="v mono small">will be recorded at commit</span></div>
              <div className="esig-summary-row"><span className="k">Chain hash</span><span className="v mono tiny">SHA-256 over (prev_hash || event)</span></div>
            </div>

            <div className="esig-hint">
              On commit: the action executes, an audit-log entry is written with the chain hash, and the signing manifest becomes part of the artifact's history. This cannot be undone.
            </div>

            <div className="esig-foot">
              <button className="btn ghost small" onClick={() => setStep(2)} disabled={committing}>← Back</button>
              <button className="btn primary small" onClick={commit} disabled={committing}>
                {committing ? 'Sealing chain…' : <>{I.shieldCheck} Sign and commit</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.EsignModal = EsignModal;

})();
