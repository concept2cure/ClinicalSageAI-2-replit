/**
 * A read for the open project, and the project the server would not read for,
 * in words (D2, fold F1 slice B, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/).
 *
 * Every route that takes a project id admits it first through
 * server/lib/admit-project.ts, and answers one of two refusals, reading nothing
 * either way:
 *   not-visible  404 {"error":"Project not found"}: this organization does not
 *                own the project, or it does not exist. A retry cannot change it.
 *   unchecked    503 VERIFICATION_UNAVAILABLE: the ownership check could not
 *                run. That is not an answer about the project, and a retry may
 *                get one.
 *
 * Engineering put those into words first (b6831819). The risk register and the
 * design-controls trace, which Engineering mounts (Risk and Design controls did
 * too until they folded into it, fold F1c),
 * say them in the same words, so the words moved here from
 * EngineeringSurface.tsx: one copy.
 *
 * `useProjectScopedRead` is the read both panels make. With a project it asks
 * for that project (`?program_id=`) and treats an answer as the project's only
 * when the route says so (`meta.scope: 'program'` and the `programId`). An
 * answer that does not say so is `unkeyed`, never rows.
 */
import React, { useCallback, useState } from 'react';
import { ErrorState, useLiveData, type DataReadOwner } from './dataConnect';
import { describeReadFailure, readFailureFor, type ReadRefusal } from '../mdx/hooks/useFetchJson';
import { OPEN_PROGRAM_LABEL, openPrograms } from './programAction';

export type ProjectRefusal = 'not-visible' | 'unchecked';

/** The two refusals in words. `record` names what was not read. */
function refusalWords(refusal: ProjectRefusal, record: string): { title: string; message: string } {
  if (refusal === 'not-visible') {
    return {
      title: "This project isn't one this organization can see",
      message: `Nothing was read for it, so no ${record} is shown.`,
    };
  }
  return {
    title: "This project couldn't be checked, so nothing was shown",
    message:
      `Whether this organization can see the project could not be checked, so no ${record} was read. ` +
      'This says nothing about the project.',
  };
}

/* A 404 is not transient: its way out is another project. Only the check that
   could not run is tried again. */
export function ProjectRefused({
  refusal,
  onRetry,
  testId,
  record = 'engineering record',
}: {
  refusal: ProjectRefusal;
  onRetry: () => void;
  testId: string;
  /** What was not read, as the sentence names it ("engineering record", "risk record"). */
  record?: string;
}) {
  const words = refusalWords(refusal, record);
  const unchecked = refusal === 'unchecked';
  return (
    <ErrorState
      variant="panel"
      title={words.title}
      message={words.message}
      retry={unchecked ? onRetry : openPrograms}
      retryLabel={unchecked ? 'Try again' : OPEN_PROGRAM_LABEL}
      testId={testId}
    />
  );
}

/**
 * A read the server refused, said as what it is (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/): the one panel
 * the project screens draw for readRefusalOf's answers, in describeReadFailure's
 * words. A refusal is not an outage, so it is never "couldn't load", and Try
 * again is offered only where a retry can change the answer.
 */
export function ReadRefused({ refusal, what, subject, retry, testId }: {
  refusal: ReadRefusal;
  /** What was not read: "the HFE/UE file". */
  what: string;
  /** What was not found or checked, when it is not the project: "this Q-Sub". */
  subject?: string;
  retry: () => void;
  testId: string;
}) {
  const words = describeReadFailure(refusal, what, subject ? { subject } : {});
  return (
    <ErrorState
      variant="panel"
      title={words.title}
      message={words.message}
      retry={words.retryable ? retry : undefined}
      testId={testId}
    />
  );
}

/**
 * What AnA is told about a read that did not answer: a refusal as itself, and
 * only a genuine failure (`refusal` null) as the screen's own `failed` summary.
 * Published as a failure, a refusal would have AnA tell the user the store is
 * down when the answer was "not in your organization" or "not enabled".
 */
export function unreadContext(refusal: ReadRefusal | null, what: string, prefix: string, retryAction: string, failed: string) {
  if (!refusal) return { summary: failed, availableActions: [retryAction] };
  const words = describeReadFailure(refusal, what);
  return {
    summary: `${prefix}${words.message} Nothing about it is claimed here.`,
    ...(words.retryable ? { availableActions: [retryAction] } : {}),
  };
}

/** A refusal's sentence, or the screen's own `failed` sentence for a genuine failure. */
export function unreadSentence(refusal: ReadRefusal | null, what: string, failed: string, opts: { subject?: string; after?: string } = {}): string {
  if (!refusal) return failed;
  return describeReadFailure(refusal, what, opts.subject ? { subject: opts.subject } : {}).message + (opts.after ?? '');
}

/**
 * Which refusal a read through apiRequest came back with, or null. The status
 * and code are classified by the one read classifier (readFailureFor,
 * mdx/hooks/useFetchJson.ts); a 404 is this answer only with admit-project's
 * sentence, since a 404 from anywhere else is not about the project.
 */
export function projectRefusalOfRead(read: { status?: number; code?: string; error?: string }): ProjectRefusal | null {
  const kind = readFailureFor(read.status, read.code);
  if (kind === 'not-found') return read.error === 'Project not found' ? 'not-visible' : null;
  return kind === 'unchecked' ? 'unchecked' : null;
}

/**
 * Where a project-scoped read stands.
 *   idle     nothing to read: no project, on a screen held per project;
 *   loading  in flight, or held until the screen's own route has answered;
 *   refused  the project was not admitted (projectRefusalOfRead);
 *   error    the read failed;
 *   unkeyed  it answered, but not as the open project's;
 *   ready    the answer is the project's (or, with no project, the organization's).
 */
export type ProjectReadStatus = 'idle' | 'loading' | 'refused' | 'error' | 'unkeyed' | 'ready';

export interface ProjectReadOptions {
  /** Existing account/project visit guard; optional for callers that own their state elsewhere. */
  owner?: DataReadOwner;
  /** The open project, or null. */
  programId: string | null;
  /** Read nothing without a project (Engineering). Otherwise the organization's records are read; no mount has asked
   *  for that since the Risk and Design controls screens folded into Engineering (fold F1c, 2026-10-29). */
  requireProject?: boolean;
  /** Hold the read: the screen's own route has not answered for the project yet. */
  waiting?: boolean;
  /** The screen's own route refused the project, so nothing is read for it. */
  refusal?: ProjectRefusal | null;
}

export interface ProjectScopedRead<T> {
  /** What is read, or null when nothing is. */
  path: string | null;
  status: ProjectReadStatus;
  refusal: ProjectRefusal | null;
  /** The answer's rows when `ready`; one stable empty list otherwise. */
  rows: T[];
  meta?: Record<string, unknown>;
  /** The ReadState assessmentState reads: only `ready` is an answer. */
  loading: boolean;
  error?: string;
  /** Read again. */
  retry: () => void;
}

const NO_ROWS: readonly never[] = Object.freeze([]);
const NOT_THIS_PROJECT = "The read did not say it was this project's.";

function pathFor(base: string, o: ProjectReadOptions): string | null {
  if (o.waiting || o.refusal) return null;
  if (o.programId) return `${base}?program_id=${encodeURIComponent(o.programId)}`;
  return o.requireProject ? null : base;
}

function statusOf(
  o: ProjectReadOptions,
  path: string | null,
  refusal: ProjectRefusal | null,
  read: { loading: boolean; error?: string; meta?: Record<string, unknown> },
): ProjectReadStatus {
  if (refusal) return 'refused';
  if (!path) return o.waiting ? 'loading' : 'idle';
  if (read.loading) return 'loading';
  if (read.error) return 'error';
  const keyed = !o.programId || (read.meta?.scope === 'program' && read.meta?.programId === o.programId);
  return keyed ? 'ready' : 'unkeyed';
}

export function useProjectScopedRead<T>(base: string, o: ProjectReadOptions): ProjectScopedRead<T> {
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  const path = pathFor(base, o);
  const read = useLiveData<T[]>(path, [path, tick], undefined, o.owner);
  const refusal = o.refusal ?? projectRefusalOfRead(read);
  const status = statusOf(o, path, refusal, read);
  const ready = status === 'ready';
  return {
    path,
    status,
    refusal,
    rows: ready && Array.isArray(read.data) ? read.data : (NO_ROWS as unknown as T[]),
    meta: read.meta,
    loading: status === 'loading',
    error: status === 'error' ? read.error : status === 'unkeyed' || status === 'refused' ? NOT_THIS_PROJECT : undefined,
    retry,
  };
}
