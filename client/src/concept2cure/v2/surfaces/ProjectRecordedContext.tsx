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

/** One current scoped read supplies the existing two profile cards. */
export function ProjectRecordedContext({ programId }: { programId: string | null }) {
  const user = useAuthUser();
  const actorUserId = numeric(user?.id), organizationId = numeric(user?.organizationId);
  if (!programId || !UUID.test(programId) || !user || !projectSharingId(actorUserId) || !projectSharingId(organizationId)) {
    return <Cards read={{ message: 'Select a project and sign in to read its saved profile context.' }} />;
  }
  return <TenantContextRead programId={programId} user={user} actorUserId={actorUserId} organizationId={organizationId} />;
}
function TenantContextRead({ programId, user, actorUserId, organizationId }: {
  programId: string; user: AuthUser; actorUserId: number; organizationId: number;
}) {
  const tenant = useTenant(), owner = useAuthoringReadSession(user), program = useShellProject();
  const workspace = tenant.currentClientWorkspace;
  const selected = workspace ? numeric(workspace.id) : undefined;
  const valid = numeric(tenant.currentOrganization?.id) === organizationId && shellProgramId(program) === programId &&
    (!workspace || numeric(workspace.organizationId) === organizationId && projectSharingId(selected));
  const key = JSON.stringify([owner.key, actorUserId, organizationId, programId, selected, valid]);
  const latest = useRef(key); latest.current = key;
  if (!valid) return <Cards read={{ message: RETIRED }} />;
  const scope: ProjectRecordedContextScope = { programId, actorUserId, organizationId,
    ...(selected === undefined ? {} : { clientWorkspaceId: selected as number }) };
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
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="pj-card" style={{ minWidth: 0, overflowWrap: 'anywhere' }}><div className="pj-card-h"><h3>{title}</h3></div>{children}</section>;
}
function Cards({ read, retry }: { read: Read; retry?: () => void }) {
  const profile = read.data?.profile;
  const message = read.loading ? 'Reading saved project profile…' : read.message;
  return <>
    <Card title="Memory">
      {message ? <p role={read.failed ? 'alert' : 'status'}>{message}</p> : profile
        ? <Memory profile={profile} /> : <p>No saved intelligence profile for this project.</p>}
      {read.failed && retry && <button className="btn ghost small" onClick={retry}>Retry recorded project context</button>}
    </Card>
    <Card title="Instructions">
      <p><strong>Saved intelligence-profile instructions</strong></p>
      <p className="sec-sub">Authored project instructions and the skills AnA follows are separate sources. This view does not combine or change them.</p>
      {message ? <p role={read.failed ? 'alert' : 'status'}>{message}</p> : profile
        ? <RecordedText value={profile.customInstructions} absent="No instructions recorded on this profile." />
        : <p>No saved profile to supply instructions.</p>}
    </Card>
  </>;
}
function RecordedText({ value, absent }: { value: string | null; absent: string }) {
  return <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value?.trim() ? value : absent}</p>;
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
