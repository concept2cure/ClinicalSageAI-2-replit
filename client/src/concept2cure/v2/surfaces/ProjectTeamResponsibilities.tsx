import React, { useRef, useState } from 'react';
import { isProjectTeamResponse, type ProjectTeamMember, type ProjectTeamResponse } from '@shared/project-team';
import { EmptyState, ErrorState, isPendingStore, useLiveData, type DataState } from '../dataConnect';
import { I } from '../icons';
import { useDialog } from '../useDialog';

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

export function ProjectTeamResponsibilities({ programId, state, onRetry, showNote = true }: {
  programId: string | null;
  state: DataState<ProjectTeamResponse>;
  onRetry?: () => void;
  /** The Team drawer says the authority note once, as its governance box (D3.md §4.9), so it passes false. */
  showNote?: boolean;
}) {
  if (state.loading) return <div role="status" aria-busy="true" className="scaf-note">Loading team…</div>;
  if (state.error || isPendingStore(state) || !isProjectTeamResponse(state.data, programId)) {
    return <ErrorState title="Couldn't load the project team" message="The team's identity and responsibility facts could not be verified. Try the read again." retry={onRetry} retryLabel="Retry team" />;
  }
  return (
    <div>
      {showNote && <p className="pj-team-note">{PROJECT_TEAM_AUTHORITY_NOTE}</p>}
      {state.data.team.length ? <ul className="pj-team-list" aria-label="Recorded project team">
        {state.data.team.map(member => <TeamMember key={member.entry_id} member={member} />)}
      </ul> : <EmptyState title="No recorded team members" hint="No lead, owner, sharing membership, or recorded name is present for this project." />}
    </div>
  );
}

/** A member's initials for the card's disc: the first letter of the first two words of the name. */
function initialsOf(label: string): string {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]!.toUpperCase()).join('') || '?';
}

/** The line under a member's name on the card: recorded responsibilities, then the sharing role. */
function memberLine(member: ProjectTeamMember): string {
  const parts: string[] = member.responsibilities.map(role => RESPONSIBILITY_LABEL[role]);
  if (member.sharing_role) parts.push(SHARING_LABEL[member.sharing_role]);
  if (member.identity === 'recorded_name') parts.push('Recorded name only');
  return parts.join(' · ') || 'No responsibility recorded';
}

/** The Team card in Project knowledge (D3.md §4.8 item 3), on every step: who is on the project and what each is
 *  recorded to do. "Manage" opens the Team drawer, which holds the full list, the authority note and every sharing
 *  control. It reads the same team read as the drawer, never a second one. */
export function ProjectTeamCard({ programId, state, onRetry, onManage }: {
  programId: string | null;
  state: DataState<ProjectTeamResponse>;
  onRetry?: () => void;
  onManage: () => void;
}) {
  const verified = !state.loading && !state.error && !isPendingStore(state) && isProjectTeamResponse(state.data, programId);
  return (
    <section className="pj-card" aria-labelledby="pj-team-card-h">
      <div className="pj-card-h">
        <h3 id="pj-team-card-h">Team</h3>
        <button type="button" className="pj-card-h-go" aria-haspopup="dialog" aria-label="Manage team" onClick={onManage}>Manage</button>
      </div>
      {state.loading ? <p className="pj-team-note" role="status" aria-busy="true">Reading the team…</p>
        : !verified || !state.data ? <ErrorState variant="inline" title="Couldn't load the project team" retry={onRetry} retryLabel="Retry team" read={state} readWhat="the project team" />
          : state.data.team.length === 0 ? <p className="pj-team-note">No recorded team members.</p>
            : (
              <ul className="pj-team" aria-label="Project team">
                {state.data.team.map(member => (
                  <li key={member.entry_id} className="pj-team-row">
                    <span className="pj-team-av" aria-hidden="true">{initialsOf(member.label)}</span>
                    <span className="pj-team-who"><span className="pj-team-n">{member.label}</span><span className="pj-team-m">{memberLine(member)}</span></span>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}

/** The Team drawer (D3.md §4.9): the recorded team, the sharing controls passed in by the page (they need the
 *  verified project anchor it holds), and the authority note as its governance box. D0's drawer: focus held inside,
 *  Escape closes it, focus returns to "Manage". */
export function ProjectTeamDrawer({ programId, state, onRetry, sharing, onClose }: {
  programId: string | null;
  state: DataState<ProjectTeamResponse>;
  onRetry?: () => void;
  sharing: React.ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useDialog(onClose);
  return (
    <div className="de-bd" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="de" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pj-team-drawer-h">
        <div className="de-h">
          <div><div className="de-h-eye">Project</div><div className="de-h-t" id="pj-team-drawer-h">Team</div></div>
          <button type="button" className="de-x" aria-label="Close team" onClick={onClose}>{I.close}</button>
        </div>
        <div className="de-body">
          <ProjectTeamResponsibilities programId={programId} state={state} onRetry={onRetry} showNote={false} />
          {sharing}
          <div className="de-gov"><span className="ico" aria-hidden="true">{I.info}</span><p className="de-gov-t">{PROJECT_TEAM_AUTHORITY_NOTE}</p></div>
        </div>
        <div className="de-f"><button type="button" className="de-btn ghost" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
