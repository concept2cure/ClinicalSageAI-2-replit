import React, { useState } from 'react';
import { I } from '../icons';

interface GovernedActionModalProps {
  action: string; submissionTypeId?: string; sectionLabel?: string;
  onConfirm: (data: { reason: string; meaning: string }) => void;
  onCancel: () => void;
}

const MEANINGS = [
  { id: 'authorship', label: 'Authorship', desc: 'I authored this content' },
  { id: 'review', label: 'Review', desc: 'I reviewed and found it acceptable' },
  { id: 'approval', label: 'Approval', desc: 'I authorize this for the next stage' },
  { id: 'rejection', label: 'Rejection', desc: 'I reject this — return to author' },
  { id: 'verification', label: 'Verification', desc: 'I verified accuracy of data and claims' },
  { id: 'authorization', label: 'Authorization', desc: 'I authorize this for submission' },
  { id: 'acknowledgment', label: 'Acknowledgment', desc: 'I acknowledge receipt / awareness' },
  { id: 'witnessing', label: 'Witnessing', desc: 'I witnessed this action being performed' },
  { id: 'responsibility', label: 'Responsibility', desc: 'I accept responsibility for this content' },
];

export function GovernedActionModal({ action, submissionTypeId, sectionLabel, onConfirm, onCancel }: GovernedActionModalProps) {
  const [reason, setReason] = useState('');
  const [meaning, setMeaning] = useState('authorship');
  const ctx = (window as any).getSubmissionTypeContext?.(submissionTypeId) ?? null;

  return (
    <div className="esign-bd" onClick={onCancel}>
      <div className="esign-modal gov-modal" onClick={e => e.stopPropagation()}>
        <div className="esign-h">
          <span className="ico">{I.shieldCheck}</span>
          <div style={{ flex: 1 }}>
            <div className="t">Confirm: {action}</div>
            <div className="sub" style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
              {ctx ? `${ctx.displayName} · ${ctx.agency} · ${ctx.region}` : 'Governed action'}
              {sectionLabel ? ` · §${sectionLabel}` : ''}
            </div>
          </div>
          <button className="tbtn" onClick={onCancel}>{I.close}</button>
        </div>

        <div className="gov-body">
          <div className="gov-notice">
            <span className="ico" style={{ color: 'var(--accent-200)' }}>{I.lock}</span>
            <span>This action mutates a governed document. Per 21 CFR Part 11 {'§'}11.50, provide a reason for change and signature meaning.</span>
          </div>

          <div className="gov-manifest">
            <div className="gov-manifest-h">Change manifest</div>
            <div className="gov-manifest-rows">
              <div className="gov-manifest-row"><span className="gov-mk">Action</span><span className="gov-mv">{action}</span></div>
              {ctx && <div className="gov-manifest-row"><span className="gov-mk">Filing type</span><span className="gov-mv">{ctx.displayName}</span></div>}
              {ctx && <div className="gov-manifest-row"><span className="gov-mk">Authority</span><span className="gov-mv">{ctx.agency} {'·'} {ctx.region}</span></div>}
              {sectionLabel && <div className="gov-manifest-row"><span className="gov-mk">Section</span><span className="gov-mv">{'§'}{sectionLabel}</span></div>}
              <div className="gov-manifest-row"><span className="gov-mk">Timestamp</span><span className="gov-mv mono">{new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</span></div>
            </div>
          </div>

          <label className="gov-field">
            <span className="gov-label">Reason for change</span>
            <textarea className="gov-textarea" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Updated efficacy data per locked CSR-201 dataset" rows={3} />
          </label>

          <label className="gov-field">
            <span className="gov-label">Signature meaning ({'§'}11.50)</span>
            <div className="gov-meanings">
              {MEANINGS.map(m => (
                <button key={m.id} className="gov-meaning" data-on={meaning === m.id || undefined} onClick={() => setMeaning(m.id)}>
                  <span className="gov-meaning-radio" />
                  <span className="gov-meaning-l">{m.label}</span>
                  <span className="gov-meaning-d">{m.desc}</span>
                </button>
              ))}
            </div>
          </label>

          <div className="gov-hashchain">
            <div className="gov-hashchain-h">{I.link} Audit hash-chain</div>
            <div className="gov-hashchain-viz">
              <div className="gov-hc-node prev">
                <span className="gov-hc-label">Previous</span>
                <span className="gov-hc-hash mono">prior sealed record</span>
              </div>
              <span className="gov-hc-arrow">{'→'}</span>
              <div className="gov-hc-node current">
                <span className="gov-hc-label">This action</span>
                <span className="gov-hc-hash mono">sealed on confirm</span>
              </div>
            </div>
            <div className="gov-hc-note">On confirm, this entry is immutably chained to the previous audit record. The sealed hash is computed server-side from your identity, timestamp, action, reason, and the document state — it is never fabricated or previewed client-side before you sign.</div>
          </div>
        </div>

        <div className="gov-footer">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!reason.trim()} onClick={() => onConfirm({ reason: reason.trim(), meaning })}>
            {I.shieldCheck} Confirm &amp; apply
          </button>
        </div>
      </div>
    </div>
  );
}
