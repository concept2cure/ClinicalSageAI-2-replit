import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import type { AuthoringReviewContext, AuthoringReviewRow } from '@shared/authoring/peer-review';
import { labelledCsr, type ScientificReviewSubmission } from '@shared/authoring/csr-scientific-review';
import { PeerReviewError, independentDecisionReady, readPeerReview, recordPeerReview, runPeerReviewIndependentChecks,
  type IndependentFindingDrafts, type PeerReviewScope, type PeerVerdict } from './authoringPeerReview';

/** `initialDecision`: the verdict the reviewer pressed to open this (the board's "Request changes..."); a load starts there. */
export function usePeerReviewDecision(scope: PeerReviewScope | null, isCurrent: () => boolean, onRecorded: (receipt: AuthoringReviewRow) => void,
  initialDecision: PeerVerdict | '' = '') {
  const [context, setContext] = React.useState<AuthoringReviewContext | null>(null);
  const [receipt, setReceipt] = React.useState<AuthoringReviewRow | null>(null);
  const [decision, setDecision] = React.useState<PeerVerdict | ''>(initialDecision);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [error, setError] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [findingDrafts, setFindingDrafts] = React.useState<IndependentFindingDrafts>({});
  /* A CSR's approval carries its scientific-review map (CsrEvidenceReview).
     Required when the saved label names a CSR, or when the server says so. */
  const [csrRequired, setCsrRequired] = React.useState(false);
  const [csrEvidence, setCsrEvidence] = React.useState<ScientificReviewSubmission | null>(null);
  const alive = React.useRef(true);
  const generation = React.useRef(0);
  const inFlight = React.useRef(false);
  const blockedRef = React.useRef(true);
  const renderedGeneration = generation.current;
  const current = () => alive.current && isCurrent();
  const load = async () => {
    if (inFlight.current || !current()) return;
    const request = ++generation.current;
    const owns = () => current() && generation.current === request;
    blockedRef.current = true;
    setContext(null); setReceipt(null); setDecision(initialDecision); setReason(''); setFindingDrafts({}); setError(''); setLoading(true); setBlocked(true);
    try {
      if (!scope) throw new PeerReviewError('Your signed-in identity could not be verified. Sign in again before reviewing.');
      const result = await readPeerReview(scope);
      if (owns()) {
        blockedRef.current = false; setContext(result); setBlocked(false);
        setCsrEvidence(null);
        // The server's rule decides (a CSR template or a renamed CSR); the label is the floor.
        setCsrRequired(result.csrScientificReviewRequired === true
          || [result.snapshot.module, result.snapshot.productCode, result.snapshot.title].some(labelledCsr));
      }
    } catch (failure) {
      if (owns()) setError(redactInternals(failure instanceof Error ? failure.message : null, 'The complete saved document could not be read. Reload the review record.'));
    } finally { if (owns()) setLoading(false); }
  };
  const loadRef = React.useRef(load);
  loadRef.current = load;
  React.useEffect(() => {
    alive.current = true; void loadRef.current();
    return () => { alive.current = false; generation.current += 1; };
  }, []);
  /** Whether a decision may be sent now; a CSR's approval waits for its completed map. */
  const mayRecord = () => !inFlight.current && !blockedRef.current && current() && !!scope && !!context?.canReview &&
    renderedGeneration === generation.current && !!decision && !receipt && !(decision === 'approved' && csrRequired && !csrEvidence)
    && independentDecisionReady(context, decision, findingDrafts);
  /* A CSR approval refused for want of its scientific review is not a failure
     to reload from: it opens the review map. True when it was that refusal. */
  const askedForCsrReview = (failure: unknown) => {
    if (!(failure instanceof PeerReviewError) || failure.code !== 'CSR_SCIENTIFIC_REVIEW_REQUIRED') return false;
    setCsrRequired(true);
    setError('This document is a clinical study report. Complete the CSR scientific review below, then record your approval. Nothing was recorded.');
    return true;
  };
  const record = async () => {
    if (!mayRecord() || !scope || !context || !decision) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const confirmed = await recordPeerReview(scope, context, decision, reason, { csrEvidence: csrRequired ? csrEvidence : null, findingDrafts });
      if (!current()) return;
      blockedRef.current = true; setReceipt(confirmed); setBlocked(true); onRecorded(confirmed);
    } catch (failure) {
      if (!current() || askedForCsrReview(failure)) return;
      setError(redactInternals(failure instanceof Error ? failure.message : null, 'The decision could not be confirmed. Reload the review record.'));
      blockedRef.current = failure instanceof PeerReviewError ? failure.reloadRequired : true;
      setBlocked(blockedRef.current);
    } finally { inFlight.current = false; if (current()) setBusy(false); }
  };
  const runChecks = () => runChecksForSession({ scope, context, current, inFlight, blockedRef, generation, renderedGeneration,
    setContext, setFindingDrafts, setBusy, setChecking, setError, setBlocked });
  const setFindingDraft = (findingId: string, patch: Partial<IndependentFindingDrafts[string]>) => {
    setFindingDrafts(previous => ({ ...previous, [findingId]: { decision: '', reason: '', ...previous[findingId], ...patch } }));
  };
  return {
    context, receipt, decision, reason, loading, busy, blocked, error, inFlight, current, load, record, setDecision, setReason,
    csrRequired, csrEvidence, setCsrEvidence,
    checking, findingDrafts, setFindingDraft, runChecks, independentReady: independentDecisionReady(context, decision, findingDrafts),
  };
}

interface CheckSession {
  scope: PeerReviewScope | null; context: AuthoringReviewContext | null; current: () => boolean;
  inFlight: React.MutableRefObject<boolean>; blockedRef: React.MutableRefObject<boolean>;
  generation: React.MutableRefObject<number>; renderedGeneration: number;
  setContext: (context: AuthoringReviewContext) => void; setFindingDrafts: (drafts: IndependentFindingDrafts) => void;
  setBusy: (value: boolean) => void; setChecking: (value: boolean) => void;
  setError: (value: string) => void; setBlocked: (value: boolean) => void;
}

function mayRunChecks(session: CheckSession): boolean {
  return session.context?.canRunIndependentChecks === true && session.current() && !session.inFlight.current &&
    !session.blockedRef.current && session.renderedGeneration === session.generation.current;
}

function sameCheckReviewContext(before: AuthoringReviewContext, after: AuthoringReviewContext): boolean {
  return after.snapshotHash === before.snapshotHash && after.myReview?.reviewId === before.myReview?.reviewId &&
    after.myReview?.requestedAt === before.myReview?.requestedAt && after.independentCheck?.standing === 'current';
}

/** Shares the ceremony's synchronous dispatch lock and reconciliation requirement with human verdict writes. */
async function runChecksForSession(session: CheckSession): Promise<void> {
  const { scope, context } = session;
  if (!scope || !context || !mayRunChecks(session)) return;
  session.inFlight.current = true; session.blockedRef.current = true; session.generation.current += 1;
  session.setBusy(true); session.setChecking(true); session.setError('');
  let confirmed = false;
  try {
    await runPeerReviewIndependentChecks(scope, context); confirmed = true;
    const refreshed = await readPeerReview(scope);
    if (!session.current()) return;
    if (!sameCheckReviewContext(context, refreshed)) {
      throw new PeerReviewError('The saved document, review request or check standing changed. Reload the review record before deciding.', true);
    }
    session.generation.current += 1;
    session.setContext(refreshed); session.setFindingDrafts({}); session.blockedRef.current = false; session.setBlocked(false);
  } catch (failure) {
    if (!session.current()) return;
    session.setError(confirmed ? 'Checks were recorded, but the current review context could not be confirmed. Reload the review record before deciding.'
      : redactInternals(failure instanceof Error ? failure.message : null, 'Independent checks could not be confirmed. Reload the review record.'));
    session.setBlocked(true);
  } finally {
    session.inFlight.current = false;
    if (session.current()) { session.setBusy(false); session.setChecking(false); }
  }
}

export type PeerReviewDecision = ReturnType<typeof usePeerReviewDecision>;
