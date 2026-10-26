import React, { useRef, useState } from 'react';
import { isProjectTeamResponse, type ProjectTeamMember, type ProjectTeamResponse } from '@shared/project-team';
import { EmptyState, ErrorState, isPendingStore, useLiveData, type DataState } from '../dataConnect';

const RESPONSIBILITY_LABEL = { project_lead: 'Project lead', project_owner: 'Project owner' };
const SOURCE_LABEL = {
  program_lead: 'Project lead', project_owner: 'Project owner', project_creator: 'Project creator',
  project_member: 'Project sharing membership', recorded_name: 'Recorded name',
};
const SHARING_LABEL = { owner: 'Owner', edit: 'Edit', use: 'Use' };
export const PROJECT_TEAM_AUTHORITY_NOTE = 'Recorded responsibilities describe coordination. Sharing roles apply to specific actions; they do not grant universal editing or approval/signing authority. Review and approval assignments remain document-specific.';

/** useLiveData retains its previous value during reloads. Retire it synchronously
 * on a program switch, before effects run, and never interpret a missing read as
 * an empty verified roster. Late abandoned responses are cancelled by the hook. */
export function useProjectTeam(programId: string | null, actorScopeKey = '') {
  const [attempt, setAttempt] = useState(0);
  const path = programId ? `/api/c2c/projects/${programId}/team` : null;
  const read = useLiveData<ProjectTeamResponse>(path, [path, actorScopeKey, attempt], value => isProjectTeamResponse(value, programId));
  const key = `${actorScopeKey}:${programId}`;
  const scope = useRef({ key, attempt, retiredRead: null as DataState<ProjectTeamResponse> | null, verifiedProjectId: null as number | null });
  if (scope.current.key !== key) scope.current = { key, attempt, retiredRead: read, verifiedProjectId: null };
  else if (scope.current.attempt !== attempt) scope.current = { ...scope.current, attempt, retiredRead: read };
  let state: DataState<ProjectTeamResponse>;
  if (!programId || scope.current.retiredRead === read || read.loading) {
    state = { data: null, loading: Boolean(programId), empty: false };
  } else if (read.error || isPendingStore(read) || !isProjectTeamResponse(read.data, programId)) {
    state = { ...read, data: null, loading: false, empty: false, error: read.error || 'Project team verification unavailable' };
  } else {
    scope.current.verifiedProjectId = read.data.project_id;
    state = read;
  }
  return { state, reload: () => setAttempt(value => value + 1), verifiedProjectId: scope.current.verifiedProjectId };
}

function TeamMember({ member }: { member: ProjectTeamMember }) {
  const recordedName = member.identity === 'recorded_name';
  const identity = recordedName ? 'Recorded name only; account not linked' :
    member.identity === 'active_member' ? 'Current organization member' : 'Current membership not confirmed';
  return (
    <li className="pj-team-person">
      <div className="pj-team-identity"><strong>{member.label}</strong><span>{identity}</span></div>
      <dl className="pj-team-facts">
        <div><dt>Recorded responsibilities</dt><dd>{member.responsibilities.length ? member.responsibilities.map(role =>
          <span key={role} className="rd-chip tone-idle">{RESPONSIBILITY_LABEL[role]}</span>) : 'None recorded'}</dd></div>
        <div><dt>Sharing</dt><dd>{member.sharing_role ? `Sharing: ${SHARING_LABEL[member.sharing_role]}` :
          member.identity === 'unconfirmed_account' ? 'Sharing not confirmed' : 'No sharing role recorded'}</dd></div>
        <div><dt>Sources</dt><dd>{member.sources.map(source => SOURCE_LABEL[source]).join(', ')}</dd></div>
      </dl>
      {recordedName && <p className="pj-team-note">A recorded name grants no access or responsibility.</p>}
    </li>
  );
}

export function ProjectTeamResponsibilities({ programId, state, onRetry }: {
  programId: string | null;
  state: DataState<ProjectTeamResponse>;
  onRetry?: () => void;
}) {
  if (state.loading) return <div role="status" aria-busy="true" className="scaf-note">Loading team…</div>;
  if (state.error || isPendingStore(state) || !isProjectTeamResponse(state.data, programId)) {
    return <ErrorState title="Couldn't load the project team" message="The team's identity and responsibility facts could not be verified. Try the read again." retry={onRetry} retryLabel="Retry team" />;
  }
  return (
    <div>
      <p className="pj-team-note">{PROJECT_TEAM_AUTHORITY_NOTE}</p>
      {state.data.team.length ? <ul className="pj-team-list" aria-label="Recorded project team">
        {state.data.team.map(member => <TeamMember key={member.entry_id} member={member} />)}
      </ul> : <EmptyState title="No recorded team members" hint="No lead, owner, sharing membership, or recorded name is present for this project." />}
    </div>
  );
}
