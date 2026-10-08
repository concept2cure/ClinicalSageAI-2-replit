/**
 * Where the Submission Center was sent: a submission, a sequence and a
 * workspace tab (F10, docs/design/FILING_SPINE.md §7.2).
 *
 * A sender (Place into filing's "Open in Submission Center", later the project
 * page's market row) stashes `{ submissionId, sequenceId, ws }` through
 * navParams.stashNavParamsForTarget('submission-center', …). The Submission
 * Center reads it once on mount (consumeNavParams) and this hook opens what it
 * names against the rows the server actually returned.
 *
 * Nothing is guessed. A submission that is not in the list leaves the list on
 * screen with a line saying so; a sequence that is not in the submission shows
 * that submission's sequence list with a line saying so. A failed read says the
 * read failed. The person never lands on a blank screen and never on a
 * different sequence presented as the one they asked for.
 *
 * @module client/src/concept2cure/v2/surfaces/submissionNavTarget
 */

import React from 'react';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import type { Notice } from './SubmissionSeqWorkspaces';

export interface SubmissionNavTarget {
  /** The submission's id as the sender wrote it, or null when none was named. */
  submissionId: string | null;
  /** The sequence's id as the sender wrote it, or null when none was named. */
  sequenceId: string | null;
  /** A workspace id from SUBMISSION_WORKSPACES, or null. */
  ws: string | null;
}

const named = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** The target, or null when the params name nothing this screen can open. An
 *  unknown workspace id is dropped, not trusted. */
export function readSubmissionNavTarget(p: {
  submissionId?: string;
  sequenceId?: string;
  ws?: string;
}): SubmissionNavTarget | null {
  const ws = named(p.ws);
  const t: SubmissionNavTarget = {
    submissionId: named(p.submissionId),
    sequenceId: named(p.sequenceId),
    ws: ws && SUBMISSION_WORKSPACES.some((w) => w.id === ws) ? ws : null,
  };
  return t.submissionId || t.sequenceId || t.ws ? t : null;
}

interface RowsRead<R> {
  loading: boolean;
  error?: string | null;
  rows: R[];
}

export interface OpenOnTargetInputs {
  subs: RowsRead<{ id: number }>;
  /** The submission the screen is on now (the default is the first row). */
  sub: { id: number; title: string } | null | undefined;
  /** The sequences of `sub`. */
  seqs: RowsRead<{ id: number }>;
  /** The workspace tab the screen is on now. */
  ws: string;
  /** The sequence the person picked, or null for the default. */
  selSeq: number | null;
  selectSubmission: (id: number) => void;
  selectSequence: (id: number) => void;
  openWorkspace: (ws: string) => void;
}

/** A line about the link, and the screen it describes: the submission, tab
 *  and picked sequence shown when it was written. */
interface Miss {
  notice: Notice;
  subId: number | null;
  ws: string;
  selSeq: number | null;
}

/** What a step decided: wait for a read, or stop here (with the line to show
 *  and the tab to open, if any). */
type Outcome = 'wait' | { notice: Notice | null; ws?: string };
type Stale = { rows: unknown; error: unknown } | null | undefined;

/** The submission step: the named submission, or the list with a line. */
function submissionStep(target: SubmissionNavTarget, subs: OpenOnTargetInputs['subs']): Outcome | { select: number | null } {
  if (subs.loading) return 'wait';
  if (subs.error) {
    return { notice: { tone: 'err', text: 'The submission list could not be read, so the submission this link named was not opened.' } };
  }
  if (!target.submissionId) return { select: null };
  const match = subs.rows.find((s) => String(s.id) === target.submissionId);
  return match
    ? { select: match.id }
    : { notice: { tone: 'warn', text: 'The submission this link named is not in this list, so the list is shown.' }, ws: 'portfolio' };
}

/** The screen is on the submission the target named (any, when it named none). */
const onTargetSubmission = (target: SubmissionNavTarget, sub: { id: number }) =>
  !target.submissionId || String(sub.id) === target.submissionId;

/** The sequence step, on the target submission's settled sequence read. */
function sequenceStep(
  target: SubmissionNavTarget,
  title: string,
  seqs: OpenOnTargetInputs['seqs'],
  stale: Stale,
): Outcome | { hit: number } {
  if (!target.sequenceId) return { notice: null, ws: target.ws ?? 'sequences' };
  const hit = seqs.rows.find((r) => String(r.id) === target.sequenceId);
  if (hit) return { hit: hit.id };
  if (seqs.loading || stale === undefined) return 'wait';
  if (stale && seqs.rows === stale.rows && seqs.error === stale.error) return 'wait';
  return {
    notice: seqs.error
      ? { tone: 'err', text: `The sequences of ${title} could not be read, so the sequence this link named was not opened.` }
      : { tone: 'warn', text: `The sequence this link named was not found in ${title}. Its sequence list is shown.` },
    ws: 'sequences',
  };
}

/**
 * Open the target once the reads it depends on have settled. Returns the line
 * to show when it could not be opened, or null. The line describes the screen
 * it was written on, so it is cleared once the person moves to another
 * submission, tab or sequence.
 *
 * Call it AFTER the effect that clears the sequence selection on a change of
 * submission: effects run in order, so the selection made here is not undone
 * in the same commit.
 */
export function useOpenOnNavTarget(target: SubmissionNavTarget | null, i: OpenOnTargetInputs): Notice | null {
  const [phase, setPhase] = React.useState<'submission' | 'sequence' | 'done'>(target ? 'submission' : 'done');
  const [miss, setMiss] = React.useState<Miss | null>(null);
  /* The sequence read as it stood in the first render on the target
     submission. Its read starts in the effect after that render commits, so
     whatever `seqs` held then belongs to the previous submission (or is the
     empty start): useLiveData keeps its last data until a new read settles. A
     sequence is only called "not found" in a read that has moved on from it:
     new rows, a new error, or a read seen in flight since (null). Undefined
     until that first render. */
  const staleSeqs = React.useRef<Stale>(undefined);

  const { subs, sub, seqs, ws, selSeq, selectSubmission, selectSequence, openWorkspace } = i;
  React.useEffect(() => {
    if (!target || phase === 'done') return;
    const finish = (o: { notice: Notice | null; ws?: string }) => {
      if (o.ws) openWorkspace(o.ws);
      setMiss(o.notice ? { notice: o.notice, subId: sub?.id ?? null, ws: o.ws ?? ws, selSeq } : null);
      setPhase('done');
    };
    if (phase === 'submission') {
      const step = submissionStep(target, subs);
      if (step === 'wait') return;
      if (!('select' in step)) return finish(step);
      if (step.select !== null) selectSubmission(step.select);
      setPhase('sequence');
      // Falls through: when the screen is already on that submission, this
      // render is the first one on it.
    }
    if (!sub || !onTargetSubmission(target, sub)) return;
    const step = sequenceStep(target, sub.title, seqs, staleSeqs.current);
    if (staleSeqs.current === undefined || seqs.loading) {
      staleSeqs.current = seqs.loading ? null : { rows: seqs.rows, error: seqs.error };
    }
    if (step === 'wait') return;
    if ('hit' in step) {
      selectSequence(step.hit);
      return finish({ notice: null, ws: target.ws ?? 'sequences' });
    }
    finish(step);
  }, [target, phase, subs, sub, seqs, ws, selSeq, selectSubmission, selectSequence, openWorkspace]);

  /* The person moved on: the line no longer describes what is on screen. */
  const moved = !!miss && (miss.subId !== (sub?.id ?? null) || miss.ws !== ws || miss.selSeq !== selSeq);
  React.useEffect(() => {
    if (moved) setMiss(null);
  }, [moved]);

  return miss && !moved ? miss.notice : null;
}
