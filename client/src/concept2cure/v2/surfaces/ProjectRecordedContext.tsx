import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import { useTenant } from '@/contexts/TenantContext';
import { projectSharingId } from '@shared/project-sharing';
import { isProjectRecordedContextEnvelope, type ProjectRecordedContextData, type ProjectRecordedContextScope, type ProjectRecordedProfile } from '@shared/project-recorded-context';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';

const numeric = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETIRED = 'Recorded project context was withdrawn because the project, workspace or signed-in account changed.';
const UNAVAILABLE = 'Recorded project context could not be read. Retry to read the current saved profile.';
interface Read { loading?: boolean; data?: ProjectRecordedContextData; message?: string; failed?: boolean }
function headers(scope: ProjectRecordedContextScope, current: () => boolean): Record<string, string> | null {
  if (!current()) return null;
  try {
    const value = capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId });
    if (scope.clientWorkspaceId != null) value['x-client-id'] = String(scope.clientWorkspaceId);
    return value;
  } catch { return null; }
}

/** The open project's recorded client workspace, as the project page read it: a number when it records one, null when it
 *  records none or could not be read, 'reading' while the project's own record is still loading. Absent: the caller
 *  does not know it, and the shell's current client is claimed, as before. */
export type ProjectWorkspace = number | null | 'reading';

/** One current scoped read supplies the existing two profile cards. */
export function ProjectRecordedContext({ programId, projectWorkspaceId }: { programId: string | null; projectWorkspaceId?: ProjectWorkspace }) {
  const user = useAuthUser();
  const actorUserId = numeric(user?.id), organizationId = numeric(user?.organizationId);
  if (!programId || !UUID.test(programId) || !user || !projectSharingId(actorUserId) || !projectSharingId(organizationId)) {
    return <Cards read={{ message: 'Select a project and sign in to read its saved profile context.' }} />;
  }
  return <TenantContextRead programId={programId} user={user} actorUserId={actorUserId} organizationId={organizationId} projectWorkspaceId={projectWorkspaceId} />;
}
function TenantContextRead({ programId, user, actorUserId, organizationId, projectWorkspaceId }: {
  programId: string; user: AuthUser; actorUserId: number; organizationId: number; projectWorkspaceId?: ProjectWorkspace;
}) {
  const tenant = useTenant(), owner = useAuthoringReadSession(user), program = useShellProject();
  const workspace = tenant.currentClientWorkspace;
  const selected = workspace ? numeric(workspace.id) : undefined;
  const valid = numeric(tenant.currentOrganization?.id) === organizationId && shellProgramId(program) === programId &&
    (!workspace || numeric(workspace.organizationId) === organizationId && projectSharingId(selected));
  /* The claim follows the OPEN project (2026-11-09): moving from a project in one client workspace to a project in
     another, the shell's current client still named the previous project's until clientFollowsProject.ts had read
     the new one, and the profile read was refused 409 PROJECT_WORKSPACE_MISMATCH. The project page already holds
     the project's recorded workspace; it is the claim. While that record is still being read, nothing is sent. */
  const claimed = typeof projectWorkspaceId === 'number' && projectSharingId(projectWorkspaceId) ? projectWorkspaceId : selected;
  const key = JSON.stringify([owner.key, actorUserId, organizationId, programId, claimed, valid]);
  const latest = useRef(key); latest.current = key;
  if (!valid) return <Cards read={{ message: RETIRED }} />;
  if (projectWorkspaceId === 'reading') return <Cards read={{ loading: true }} />;
  const scope: ProjectRecordedContextScope = { programId, actorUserId, organizationId,
    ...(claimed === undefined ? {} : { clientWorkspaceId: claimed as number }) };
  return <ScopedRead key={key} scope={scope} current={() => latest.current === key && owner.sameRevision()} />;
}
function ScopedRead({ scope, current }: { scope: ProjectRecordedContextScope; current: () => boolean }) {
  const [read, setRead] = useState<Read>({ loading: true }), [reload, setReload] = useState(0);
  const mounted = useRef(false), live = useRef(current); live.current = current;
  const visit = useMemo(() => captureShellProjectGuard(), []);
  const currentOwner = () => mounted.current && visit() && live.current();
  const retainedHeaders = () => headers(scope, currentOwner);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const admit = () => active && currentOwner();
    const present = (value: Read) => { if (active) setRead(headers(scope, admit) ? value : { message: RETIRED }); };
    const captured = headers(scope, admit);
    if (!captured) setRead({ message: RETIRED });
    else {
      setRead({ loading: true });
      void (async () => {
        try {
          const response = await apiRequest('GET', `/api/c2c/projects/${encodeURIComponent(scope.programId)}/intelligence`, undefined, captured);
          const body: unknown = await response.json();
          present(response.ok && isProjectRecordedContextEnvelope(body, scope)
            ? { data: body.data } : { message: UNAVAILABLE, failed: true });
        } catch { present({ message: UNAVAILABLE, failed: true }); }
      })();
    }
    return () => { active = false; mounted.current = false; };
    // The keyed parent owns scope/session; reload is a deliberate fresh read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  const visible = read.data && !retainedHeaders() ? { message: RETIRED } : read;
  return <Cards read={visible} retry={() => {
    if (retainedHeaders()) setReload(value => value + 1);
    else setRead({ message: RETIRED });
  }} />;
}
/** What AnA knows (D3-2a, D3.md §4.8 item 5): one card, on every step, with the saved profile's memory and its
 *  instructions each in a closed disclosure. The two sentences that said the profile and the authored instructions
 *  are separate sources are gone: the first line says what AnA reads, and the skills are their own card. */
/** What each disclosure's summary adds to its name: when the memory was enriched, or that nothing is saved. */
function summaryTails(profile: ProjectRecordedProfile | null | undefined): { memory: string; instructions: string } {
  if (!profile) return { memory: ' · none saved', instructions: ' · none saved' };
  const when = profile.lastEnrichedAt ? new Date(profile.lastEnrichedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  return { memory: when ? ` · enriched ${when}` : '', instructions: profile.customInstructions?.trim() ? '' : ' · none recorded' };
}
function Cards({ read, retry }: { read: Read; retry?: () => void }) {
  const profile = read.data?.profile;
  const message = read.loading ? 'Reading saved project profile…' : read.message;
  const tails = summaryTails(profile);
  return (
    <section className="pj-card pj-knows" aria-labelledby="pj-knows-h">
      <div className="pj-card-h"><h3 id="pj-knows-h">What AnA knows</h3></div>
      <p className="sec-sub">AnA reads these in every conversation in this project.</p>
      {message ? <>
        <p role={read.failed ? 'alert' : 'status'}>{message}</p>
        {read.failed && retry && <button type="button" className="btn ghost small" onClick={retry}>Retry recorded project context</button>}
      </> : <>
        <details className="pj-more">
          <summary>Memory{tails.memory}</summary>
          {profile ? <Memory profile={profile} /> : <p>No saved intelligence profile for this project.</p>}
        </details>
        <details className="pj-more">
          <summary>Instructions{tails.instructions}</summary>
          {profile ? <RecordedText value={profile.customInstructions} absent="No instructions recorded on this profile." /> : <p>No saved profile to supply instructions.</p>}
        </details>
      </>}
    </section>
  );
}
function RecordedText({ value, absent }: { value: string | null; absent: string }) {
  return <p className="pj-knows-t">{value?.trim() ? value : absent}</p>;
}
function RecordedList<T>({ title, rows, children }: { title: string; rows: readonly T[]; children: (row: T) => React.ReactNode }) {
  const shown = rows.slice(0, 5);
  return <div><h4>{title}</h4>{shown.length ? <>
    <p className="sec-sub">Showing {shown.length} of {rows.length} {title.toLowerCase()}.</p>
    <ul>{shown.map((row, index) => <li key={index}>{children(row)}</li>)}</ul>
  </> : <p>No {title.toLowerCase()} on this profile.</p>}</div>;
}
function Memory({ profile }: { profile: ProjectRecordedProfile }) {
  return <>
    <p className="sec-sub">Saved profile context. These notes are not verified evidence or a readiness verdict.</p>
    {profile.lastEnrichedAt && <p className="sec-sub">Profile last enriched {new Date(profile.lastEnrichedAt).toLocaleString()}.</p>}
    <h4>Recorded strategy</h4><RecordedText value={profile.regulatoryStrategy} absent="No regulatory strategy recorded on this profile." />
    <h4>Recorded indication</h4><RecordedText value={profile.targetIndication} absent="No target indication recorded on this profile." />
    <h4>Recorded population</h4><RecordedText value={profile.targetPopulation} absent="No target population recorded on this profile." />
    <RecordedList title="Recorded risks" rows={profile.riskFactors}>{row => <><RecordedText value={row.risk} absent="Risk text not recorded." />
      <p>Recorded likelihood: {row.likelihood}; recorded impact: {row.impact}.</p>{row.mitigation && <p>Recorded mitigation: {row.mitigation}</p>}</>}</RecordedList>
    <RecordedList title="Recorded open questions" rows={profile.openQuestions}>{row => <><p>{row.question}</p>{row.context && <p>{row.context}</p>}{row.priority && <p>Recorded priority: {row.priority}</p>}</>}</RecordedList>
    <RecordedList title="Recorded decisions" rows={profile.keyDecisions}>{row => <><p>{row.decision}</p><p>Recorded rationale: {row.rationale}</p>
      <p>Recorded date: {row.date}</p>{row.source && <p>Recorded source: {row.source}</p>}</>}</RecordedList>
    <RecordedList title="Recorded insights" rows={profile.learnedInsights}>{row => <><p>{row.insight}</p><p>Recorded source: {row.source}</p>
      <p>Recorded date: {row.extractedAt}</p><p>{row.confidence === null ? 'Confidence not recorded.' : `Recorded confidence: ${row.confidence}`}</p></>}</RecordedList>
  </>;
}
