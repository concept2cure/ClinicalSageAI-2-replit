import * as React from 'react';
import { useAuthUser } from '@/services/portal/authService';
import type { AuthoringReviewContext, AuthoringReviewRow } from '@shared/authoring/peer-review';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import { AuthoredHtml } from '../editor/AuthoredHtml';
import { registerCeremonyOpen } from '../ceremony';
import { useDialog } from '../useDialog';
import { peerReviewScope, type PeerVerdict } from './authoringPeerReview';
import { usePeerReviewDecision, type PeerReviewDecision } from './usePeerReviewDecision';
import '../styles/review-decision.css';

export const PEER_VERDICT_LABEL: Record<PeerVerdict, string> = { approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Declined' };
export interface ReviewDecisionDialogProps { documentId: string; onClose: () => void; onRecorded: (receipt: AuthoringReviewRow) => void }

export function ReviewDecisionDialog(props: ReviewDecisionDialogProps) {
  const user = useAuthUser();
  const userId = user?.id;
  const organizationId = user?.organizationId;
  const scope = React.useMemo(() => peerReviewScope({ id: userId, organizationId }, props.documentId), [userId, organizationId, props.documentId]);
  const key = `${user?.organizationId ?? ''}:${user?.id ?? ''}:${props.documentId}`;
  const live = React.useRef(key); live.current = key;
  return <DecisionSession key={key} {...props} scope={scope} isCurrent={() => live.current === key} />;
}

function DecisionSession(props: ReviewDecisionDialogProps & {
  scope: ReturnType<typeof peerReviewScope>; isCurrent: () => boolean;
}) {
  const state = usePeerReviewDecision(props.scope, props.isCurrent, props.onRecorded);
  const close = () => { if (!state.inFlight.current && state.current()) props.onClose(); };
  const dialogRef = useDialog(close);
  React.useEffect(registerCeremonyOpen, []);
  return <div className="esign-bd" onClick={close}>
    <div className="esign-modal rv-decision-dialog" role="dialog" aria-modal="true" aria-labelledby="rv-decision-title" tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}>
      <div className="esign-h"><h2 id="rv-decision-title">Record review decision</h2></div>
      <div className="esign-b rv-decision-body">
        {state.loading && <p role="status">Loading the complete saved document and your review request…</p>}
        {state.error && <p className="esign-err" role="alert">{state.error}</p>}
        {state.context && <SavedReviewRead context={state.context} />}
        {state.receipt ? <DecisionReceipt receipt={state.receipt} /> : state.context?.canReview ? <DecisionFields state={state} /> :
          state.context && <p role="status">{state.context.unavailableReason ?? 'You cannot record a decision for this review request.'}</p>}
        <p className="esign-manifest">Your verdict records review of this saved document and request. It is not a 21 CFR §11.50 signature manifestation. Apply a binding signature from the authoring workspace.</p>
      </div>
      <DecisionActions state={state} onClose={close} />
    </div>
  </div>;
}

function SavedReviewRead({ context }: { context: AuthoringReviewContext }) {
  const snapshot = context.snapshot;
  return <section aria-label="Complete saved document" className="rv-decision-read">
    <h3>{snapshot.title ?? 'Untitled document'}</h3>
    <p>Revision {snapshot.version ?? 'not recorded'}{snapshot.module ? ` · ${snapshot.module}` : ''}{snapshot.locale ? ` · ${snapshot.locale}` : ''}{snapshot.productCode ? ` · ${snapshot.productCode}` : ''}</p>
    {context.myReview && <p>Review requested <GovernedTimestamp value={context.myReview.requestedAt} /></p>}
    {snapshot.sections.length === 0 && <p>No saved sections are present in this document.</p>}
    {snapshot.sections.map((section) => <section key={section.id} className="rv-decision-section">
      <h4>{section.code}{section.title ? ` · ${section.title}` : ''}</h4>
      {section.content ? <AuthoredHtml html={section.content} className="ed-full-sec-body" /> : <p>No saved content in this section.</p>}
    </section>)}
  </section>;
}

function DecisionFields({ state }: { state: PeerReviewDecision }) {
  const needsReason = state.decision !== '' && state.decision !== 'approved';
  const disabled = state.busy || state.blocked;
  return <>
    <div className="esign-field"><label htmlFor="rv-decision">Decision</label>
      <select id="rv-decision" value={state.decision} disabled={disabled} onChange={(event) => state.setDecision(event.target.value as PeerVerdict | '')}>
        <option value="">Not stated — choose</option><option value="approved">Approve</option>
        <option value="changes_requested">Request changes — send it back with a reason</option><option value="rejected">Decline — reject this document</option>
      </select>
    </div>
    <div className="esign-field"><label htmlFor="rv-reason">{needsReason ? 'Reason (required)' : 'Note for the thread (optional)'}</label>
      <textarea id="rv-reason" rows={3} maxLength={4000} disabled={disabled} value={state.reason} onChange={(event) => state.setReason(event.target.value)} placeholder={needsReason ? 'What has to change before this can be approved' : 'Anything the author or the next reviewer should know'} />
    </div>
  </>;
}

function DecisionReceipt({ receipt }: { receipt: AuthoringReviewRow }) {
  return <section className="rv-decision-receipt" aria-label="Your recorded decision" role="status">
    <h3>Your decision recorded — {PEER_VERDICT_LABEL[receipt.review_status as PeerVerdict]}</h3>
    <p>Revision {receipt.reviewed_snapshot?.version ?? 'not recorded'} · Recorded <GovernedTimestamp value={receipt.reviewed_at} /></p>
    {receipt.review_comments && <p>{receipt.review_comments}</p>}
    <p>This verdict is bound to the saved content and review request shown above. The audit record was confirmed. Current standing comes from the refreshed review board.</p>
  </section>;
}

function DecisionActions({ state, onClose }: { state: PeerReviewDecision; onClose: () => void }) {
  const label = state.decision === 'approved' ? 'Record approval' : state.decision === 'changes_requested' ? 'Record change request' : state.decision === 'rejected' ? 'Record rejection' : 'Record decision';
  return <div className="esign-f rv-decision-actions">
    <button type="button" className="btn ghost" disabled={state.busy} onClick={onClose}>{state.receipt ? 'Close' : 'Cancel'}</button>
    {!state.receipt && <button type="button" className="btn ghost" disabled={state.busy || state.loading} onClick={() => { void state.load(); }}>Reload review record</button>}
    {!state.receipt && state.context?.canReview && <button type="button" className="btn primary" disabled={!maySubmitDecision(state)} onClick={() => { void state.record(); }}>{state.busy ? 'Recording…' : label}</button>}
  </div>;
}

function maySubmitDecision(state: PeerReviewDecision): boolean {
  const length = state.reason.trim().length;
  return !state.busy && !state.loading && !state.blocked && !!state.decision && length <= 4000 &&
    (state.decision === 'approved' || length >= 8);
}
