/** Deliberately re-file the selected saved section through its existing PATCH boundary. */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { authService } from '@/services/portal/authService';
import { isSessionChangeHeld } from '@/lib/sessionChangeGuard';
import { GovernedConfirmDialog, type ConfirmResult } from '../../_shared/components/GovernedConfirmDialog';
import { captureShellProjectGuard } from '../shellProject';
import type { FireToast } from '../toast';
import { attemptRefileSavedText, operationKey, RECONCILE, sourcePin, validRefileSource, type RefileSavedSource } from './authoringRefileSavedTextState';

interface Props {
  source: RefileSavedSource | null;
  scope: string;
  refusal: string | null;
  isClean: () => boolean;
  isCurrent: () => boolean;
  fireToast: FireToast;
  onRefiled: () => void;
}
type Operation = { state: 'pending' | 'unknown' | 'confirmed' | 'refused'; message: string; pin: string; visit: number; presentable: boolean };
interface Review { source: RefileSavedSource; scope: string; visit: number; currentSession: () => boolean; currentProject: () => boolean }

/** Hook ownership keeps pending/unknown holds even while toolbar content is withdrawn or sections change. */
export function useAuthoringRefileSavedText(props: Props): React.ReactNode {
  const latest = useRef(props); latest.current = props;
  const operations = useRef(new Map<string, Operation>());
  const [, refresh] = useReducer(value => value + 1, 0);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const visit = useRef({ key: '', number: 0 });
  const visitKey = JSON.stringify([props.scope, sourcePin(props.source), props.isCurrent(), props.refusal]);
  if (visit.current.key !== visitKey) visit.current = { key: visitKey, number: visit.current.number + 1 };
  const key = props.source ? operationKey(props.scope, props.source) : '';
  const operation = operations.current.get(key);
  const held = operation?.state === 'pending' || operation?.state === 'unknown';
  const startRefusal = () => {
    const now = latest.current;
    if (!validRefileSource(now.source) || !now.isCurrent() || isSessionChangeHeld()) return 'Reopen the current saved section before re-filing.';
    if (now.refusal) return now.refusal;
    if (!now.isClean()) return 'Save or discard the unsaved edits before re-filing saved text.';
    return null;
  };
  const current = (selected: Review) => alive.current && selected.scope === latest.current.scope
    && selected.visit === visit.current.number && selected.currentSession() && selected.currentProject()
    && latest.current.isCurrent() && !latest.current.refusal
    && sourcePin(selected.source) === sourcePin(latest.current.source);
  const open = () => {
    const refusal = startRefusal();
    if (refusal || held || !props.source) return;
    setError(null);
    setReview({ source: { ...props.source }, scope: props.scope, visit: visit.current.number,
      currentSession: authService.captureSessionReadGuard().sameRevision, currentProject: captureShellProjectGuard() });
  };
  const submit = async ({ reason }: ConfirmResult) => {
    if (!review) return;
    const reviewKey = operationKey(review.scope, review.source);
    const previous = operations.current.get(reviewKey);
    if (previous?.state === 'pending' || previous?.state === 'unknown') { setError(RECONCILE); return; }
    const refusal = startRefusal();
    if (!current(review) || refusal) { setError(refusal ?? 'The selected saved section changed. Close this action and review the current section.'); return; }
    operations.current.set(reviewKey, { state: 'pending', message: 'Re-filing saved text…', pin: sourcePin(review.source), visit: review.visit, presentable: true }); refresh();
    const source = review.source;
    const { receipt, message, state } = await attemptRefileSavedText(source, reason);
    operations.current.set(reviewKey, { state, message, pin: sourcePin(source), visit: review.visit, presentable: current(review) });
    if (!alive.current) return;
    refresh();
    if (!current(review)) return;
    if (!receipt) { setError(message); return; }
    setReview(null); setError(null);
    latest.current.fireToast(message);
    latest.current.onRefiled();
  };
  const admitted = validRefileSource(props.source) && !props.refusal && props.isCurrent();
  const presentation = held || (!!operation?.presentable && operation.visit === visit.current.number && operation.pin === sourcePin(props.source));
  return <RefileControls {...{ props, operation, held, admitted, review, error, open, current, submit, presentation }}
    onCancel={() => {
      if (review && operations.current.get(operationKey(review.scope, review.source))?.state === 'pending') return;
      setReview(null); setError(null);
    }} />;
}
function RefileControls({ props, operation, held, admitted, review, error, open, current, submit, onCancel, presentation }: {
  props: Props; operation: Operation | undefined; held: boolean; admitted: boolean; presentation: boolean; review: Review | null; error: string | null;
  open: () => void; current: (review: Review) => boolean; submit: (input: ConfirmResult) => Promise<void>; onCancel: () => void;
}) {
  return <>
    <button type="button" className="btn ghost" style={{ height: 30 }} onClick={open}
      disabled={!admitted || held} title={props.refusal ?? (!props.source ? 'Open a saved section bound to a filing first.' : undefined)}>
      {operation?.state === 'pending' ? 'Re-filing…' : 'Re-file saved text'}
    </button>
    {admitted && operation && operation.state !== 'pending' && presentation && <span role={operation.state === 'confirmed' ? 'status' : 'alert'}
      className="scaf-note" style={{ maxWidth: 300 }}>{operation.message}</span>}
    <GovernedConfirmDialog open={!!review && current(review)} action="Re-file saved text"
      target={review ? `${review.source.sectionCode} ${review.source.sectionTitle} · ${review.source.documentTitle} → ${review.source.filingTitle}. This replaces the filing copy with saved text and creates no Authoring content revision. Where sections are combined, their saved text is filed together.` : ''}
      minReason={8} confirmWord="refile" submitError={error} onCancel={onCancel} onConfirm={submit} />
  </>;
}
