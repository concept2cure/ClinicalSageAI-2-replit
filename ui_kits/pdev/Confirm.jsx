/**
 * PDEV kit · Confirm.jsx — reason-for-change dialog (PDEV §2.12).
 *
 * Required UI gate on every governed mutation. Per brief §9 Q5 (accepted):
 * shows live character count + minimum so users see why Confirm is disabled.
 * Minimum length varies per action — default 10, IND assembly compile 30.
 */
(() => {
const { PdevI: I } = window;

function PdevConfirmDialog({ open, action, target, resource, minReason = 10, confirmWord = 'yes', onCancel, onConfirm }) {
  const [reason, setReason] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => { if (open) { setReason(''); setConfirm(''); setSubmitting(false); } }, [open]);
  if (!open) return null;

  const reasonOk  = reason.trim().length >= minReason;
  const confirmOk = confirm.trim() === confirmWord;
  const canSubmit = reasonOk && confirmOk && !submitting;
  const reasonCount = reason.trim().length;

  const submit = () => {
    setSubmitting(true);
    setTimeout(() => onConfirm && onConfirm({ reason: reason.trim(), confirmedAt: new Date().toISOString() }), 300);
  };

  return (
    <div className="pdev-confirm-backdrop" role="dialog" aria-modal="true">
      <div className="pdev-confirm">
        <div className="pdev-confirm-head">
          <span className="pdev-confirm-mark">{I.shield}</span>
          <div className="pdev-confirm-head-text">
            <div className="pdev-confirm-eyebrow">Governed action · audit-logged</div>
            <div className="pdev-confirm-title">{action}</div>
            <div className="pdev-confirm-target">{target}</div>
          </div>
          <button className="pdev-confirm-close" onClick={onCancel}>{I.close}</button>
        </div>

        {resource && (
          <div className="pdev-confirm-resource">
            <div className="lbl">Resource</div>
            <div className="val">{resource}</div>
          </div>
        )}

        <div className="pdev-confirm-field">
          <label>
            <span className="pdev-confirm-label">Reason for this action</span>
            <span className={`pdev-confirm-count mono ${reasonOk ? 'ok' : 'low'}`}>{reasonCount} / {minReason} min</span>
          </label>
          <textarea
            rows={3}
            placeholder="Captured verbatim in the audit log. Be specific."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>

        <div className="pdev-confirm-field">
          <label>
            <span className="pdev-confirm-label">Type <span className="mono pdev-confirm-word">{confirmWord}</span> to confirm</span>
          </label>
          <input
            className="pdev-confirm-input mono"
            placeholder={confirmWord}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <div className="pdev-confirm-foot">
          <button className="pdev-btn ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="pdev-btn primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Logging audit…' : <>{I.shield} Confirm and log</>}
          </button>
        </div>
      </div>
    </div>
  );
}

window.PdevConfirmDialog = PdevConfirmDialog;
})();
