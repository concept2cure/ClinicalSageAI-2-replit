/**
 * What AnA remembers: the notes AnA keeps about working with this person, read
 * only, in a drawer beside the conversation (D2, fold ana-memory into the
 * conversation, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * These are the two reads of the retired `ana-memory` screen that were real:
 * how AnA is tuned to the person (its notes, the four tone settings and the
 * latest read of how they are doing) and the "Things I got wrong" ledger. They
 * are the rows every turn reads (loadRelationalOverlay,
 * server/services/ana-ri/relational-profile-service.ts):
 *
 *   GET /api/mdx/ana/memory/profile                     the person's own notes, anywhere
 *   GET /api/mdx/ana/memory/profile?project_id=<ref>    their notes for the project the
 *                                                       conversation is held in, admitted
 *                                                       as its turns are (admitAnaProjectScope)
 *
 * Neither names a user: the server reads the session's own rows only. The
 * retired screen read the first and never the second.
 *
 * Every read says what it got: a failure is an error with Try again and never
 * an empty memory, a refusal is said as one with nothing to retry, an absent
 * store is not "no notes yet", an answer that does not say it is the project's
 * is not shown as the project's, and an empty ledger says so.
 */
import React from 'react';
import { I } from './icons';
import { ErrorState, hasKeys, useLiveData, type DataState } from './dataConnect';
import { useDialog } from './useDialog';
import './styles/ana-v2.css';

interface EmotionalSignal { at: string; signal: string }
interface AcknowledgedMistake { at: string; mistake: string; correction: string }
export interface RelationalProfile {
  interaction_count: number;
  last_interaction_at: string | null;
  profile_summary: string | null;
  tone_calibration: Record<string, string> | null;
  emotional_signals: EmotionalSignal[] | null;
  acknowledged_mistakes: AcknowledgedMistake[] | null;
}

const PROFILE_PATH = '/api/mdx/ana/memory/profile';
const PROFILE_KEYS = ['interaction_count', 'profile_summary', 'tone_calibration', 'emotional_signals', 'acknowledged_mistakes'];
const TONE: ReadonlyArray<[string, string]> = [['warmth', 'Warmth'], ['humor', 'Humor'], ['formality', 'Formality'], ['detail', 'Detail']];

/* The admission's refusals (server/services/ana/project-scope-admission.ts), in
   words. Each is final for this project: trying again cannot change it. */
const PROJECT_REFUSED: Readonly<Record<string, string>> = {
  ANA_PROJECT_ACCESS_DENIED: 'You do not have current access to this project',
  ANA_PROJECT_NOT_FOUND: 'This project was not found in your organization',
  ANA_PROJECT_ANCHOR_UNRESOLVED: "This project's tracking record could not be verified",
  ANA_PROJECT_SCOPE_INVALID: 'The open project could not be identified',
};

type Scope = 'user' | 'project';
const WHAT: Record<Scope, string> = { user: 'about working with you', project: 'for this project' };

/** Where one read stands, in the words the panel shows. PURE. */
type ScopeView =
  | { state: 'loading' }
  | { state: 'failed'; title: string; message: string; retry: boolean }
  | { state: 'none' }
  | { state: 'ready'; profile: RelationalProfile };

const failed = (title: string, message: string, retry: boolean): ScopeView => ({ state: 'failed', title, message, retry });

/** A read that answered no data: a refusal, an access check that could not run, or a failure. PURE. */
function failureOf(scope: Scope, read: DataState<RelationalProfile>): ScopeView {
  const refusal = scope === 'project' && read.code ? PROJECT_REFUSED[read.code] : undefined;
  if (refusal) return failed("AnA's notes for this project were not read", `${refusal}, so AnA's notes for it were not read.`, false);
  if (scope === 'project' && read.status === 503) {
    return failed("AnA's notes for this project were not read",
      'Your access to this project could not be checked, so its notes were not read. This says nothing about the project. Try again.', true);
  }
  if (read.status === 401 || read.status === 403) {
    return failed(`AnA's notes ${WHAT[scope]} were not read`, 'Your account or organization could not be confirmed, so nothing was read.', false);
  }
  return failed(`AnA's notes ${WHAT[scope]} could not be read`, 'Nothing is shown in their place, and this is not an empty memory. Try again.', true);
}

/** The route says the answer is this project's (`meta.scope 'project'`, its ref or id). PURE. */
function keyedTo(meta: Record<string, unknown> | undefined, projectRef: string | null): boolean {
  if (!meta || meta.scope !== 'project' || projectRef === null) return false;
  return String(meta.projectRef ?? '').toLowerCase() === projectRef.toLowerCase() || String(meta.projectId ?? '') === projectRef;
}

function viewOf(scope: Scope, read: DataState<RelationalProfile>, projectRef: string | null): ScopeView {
  if (read.loading) return { state: 'loading' };
  if (read.error) return failureOf(scope, read);
  if (read.meta?.pendingStore === true) {
    return failed(`AnA's notes ${WHAT[scope]} could not be read`, "AnA's notes are not kept on this server, so there is nothing to read. This is not an empty memory.", false);
  }
  if (scope === 'project' && !keyedTo(read.meta, projectRef)) {
    return failed("AnA's notes for this project could not be read", "The answer did not say it was this project's, so it is not shown. Try again.", true);
  }
  return read.data ? { state: 'ready', profile: read.data } : { state: 'none' };
}

function Ledger({ mistakes }: { mistakes: AcknowledgedMistake[] }) {
  return (
    <>
      <div className="amem-sec2">{I.shieldAlert} Things I got wrong <span className="amem-sec-x">and how you set me straight</span></div>
      <div className="amem-mistakes">
        {mistakes.length === 0 ? <div className="amem-empty">Nothing on the ledger yet.</div> : mistakes.map((m, i) => (
          <div key={`${m.at}-${i}`} className="amem-mistake">
            <div className="amem-mistake-t">{I.close} {m.mistake}</div>
            <div className="amem-mistake-c">{I.check} {m.correction}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Profile({ scope, profile: p }: { scope: Scope; profile: RelationalProfile }) {
  const tone = p.tone_calibration ?? {};
  const signals = Array.isArray(p.emotional_signals) ? p.emotional_signals : [];
  const latest = signals.length > 0 ? signals[signals.length - 1] : null;
  const turns = Number(p.interaction_count) || 0;
  return (
    <>
      <div className="amem-prof">
        <div className="amem-prof-notes">
          {p.profile_summary?.trim()
            ? p.profile_summary
            : `AnA has not written notes ${WHAT[scope]} yet. She writes them as she reflects on your turns with her.`}
        </div>
        {scope === 'user' && (
          <div className="amem-tone">
            {TONE.map(([key, label]) => (
              <div key={key} className="amem-tone-cell">
                <span className="amem-tone-k">{label}</span>
                <span className="amem-tone-v">{tone[key] || 'Not set yet'}</span>
              </div>
            ))}
          </div>
        )}
        {latest && <div className="amem-signal">{I.activity} {latest.signal}</div>}
      </div>
      <p className="amem-note">Kept over {turns} {turns === 1 ? 'turn' : 'turns'} with you.</p>
      <Ledger mistakes={Array.isArray(p.acknowledged_mistakes) ? p.acknowledged_mistakes : []} />
    </>
  );
}

function ScopeBody({ scope, view, onRetry }: { scope: Scope; view: ScopeView; onRetry: () => void }) {
  if (view.state === 'loading') return <p role="status" className="amem-note">Reading AnA&rsquo;s notes&hellip;</p>;
  if (view.state === 'failed') {
    return <ErrorState variant="panel" title={view.title} message={view.message} retry={view.retry ? onRetry : undefined} />;
  }
  if (view.state === 'ready') return <Profile scope={scope} profile={view.profile} />;
  return (
    <>
      <p className="amem-empty">
        {scope === 'user'
          ? 'AnA has not kept notes about working with you yet. She writes them after your turns with her.'
          : 'AnA has not kept notes for this project yet. She writes them after your turns with her in it.'}
      </p>
      <Ledger mistakes={[]} />
    </>
  );
}

export function WhatAnaRemembers({ projectRef, projectName, onClose }: {
  /** The project this conversation's turns are sent under (its `project_id`), or null. */
  projectRef: string | number | null;
  projectName: string | null;
  onClose: () => void;
}) {
  const ref = useDialog(onClose);
  const titleId = React.useId();
  const [userTick, setUserTick] = React.useState(0);
  const [projectTick, setProjectTick] = React.useState(0);
  const project = projectRef != null && String(projectRef).trim() !== '' ? String(projectRef).trim() : null;
  const projectPath = project ? `${PROFILE_PATH}?project_id=${encodeURIComponent(project)}` : null;
  /* Made here, not at import: the conversation imports this file, and its
     suites stub the data module without the guard. */
  const isProfile = React.useMemo(() => hasKeys<RelationalProfile>(...PROFILE_KEYS), []);
  const userRead = useLiveData<RelationalProfile>(PROFILE_PATH, [userTick], isProfile);
  const projectRead = useLiveData<RelationalProfile>(projectPath, [projectPath, projectTick], isProfile);

  return (
    <div className="de-bd" onClick={onClose}>
      <div
        className="de"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        data-testid="ana-remembers"
      >
        <div className="de-h">
          <div>
            <div className="de-h-t" id={titleId}>What AnA remembers</div>
            <div className="de-h-s">
              The notes AnA keeps about working with you and reads into each conversation. She writes them herself; they are shown here read-only.
            </div>
          </div>
          <button type="button" className="de-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body">
          <section data-testid="ana-remembers-user" aria-labelledby={`${titleId}-user`}>
            <h3 className="amem-sec" id={`${titleId}-user`}>{I.user} How AnA is tuned to you</h3>
            <ScopeBody scope="user" view={viewOf('user', userRead, null)} onRetry={() => setUserTick((n) => n + 1)} />
          </section>
          <div className="acct-sep" />
          <section data-testid="ana-remembers-project" aria-labelledby={`${titleId}-project`}>
            <h3 className="amem-sec" id={`${titleId}-project`}>
              {I.folder} {projectName ? `For this project: ${projectName}` : 'For this project'}
            </h3>
            {projectPath ? (
              <ScopeBody scope="project" view={viewOf('project', projectRead, project)} onRetry={() => setProjectTick((n) => n + 1)} />
            ) : (
              <p className="amem-note">No project is open, so AnA reads only the notes above into this conversation.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
