import React, { useEffect, useId, useRef, useState } from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import { capturedActorHeaders } from '@/utils/authToken';
import { projectSharingId, type ProjectSharingMember, type ProjectSharingResponse, type ProjectSharingScope } from '@shared/project-sharing';
import { C2CForm } from '../C2CForm';
import { ErrorState } from '../dataConnect';
import { requestProjectSharing, type SharingWrite } from './projectSharingRequest';

interface TeamSharingProps { programId: string; projectId: number; onChanged: () => void; suspended?: boolean }
type Read = { data: ProjectSharingResponse | null; loading: boolean; error?: string };
type Notice = { text: string; warning: boolean };
const numeric = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
const REMAINING_ACCESS = 'Owner, creator, organization management and organization-visible access may still apply. Task and review assignments remain recorded.';

function canSave(data: ProjectSharingResponse | null, write: SharingWrite): data is ProjectSharingResponse {
  if (!data?.canManage) return false;
  const member = data.members.find(row => row.userId === write.memberId);
  if (write.role) return member ? member.canSetRole : data.candidates.some(candidate => candidate.userId === write.memberId);
  return Boolean(member?.canRevoke);
}

/** The optional display hook keeps standalone, read-only ProjectHome usable.
 * Capability itself always comes from the admitted server response. */
export function ProjectTeamSharing(props: TeamSharingProps) {
  const user = useAuthUser();
  const actorUserId = numeric(user?.id); const organizationId = numeric(user?.organizationId);
  if (!projectSharingId(actorUserId) || !projectSharingId(organizationId)) return null;
  return <TenantSharing {...props} actorUserId={actorUserId} organizationId={organizationId} />;
}

function TenantSharing(props: TeamSharingProps & { actorUserId: number; organizationId: number }) {
  const tenant = useTenant();
  const selectedOrganization = numeric(tenant.currentOrganization?.id);
  const selectedWorkspace = tenant.currentClientWorkspace;
  const clientWorkspaceId = selectedWorkspace ? numeric(selectedWorkspace.id) : null;
  const foreignWorkspace = selectedWorkspace && numeric(selectedWorkspace.organizationId) !== props.organizationId;
  if ((selectedOrganization != null && selectedOrganization !== props.organizationId) || foreignWorkspace ||
      (clientWorkspaceId !== null && !projectSharingId(clientWorkspaceId))) return null;
  const scope: ProjectSharingScope = { ...props, clientWorkspaceId: clientWorkspaceId as number | null };
  const owner = [scope.actorUserId, scope.organizationId, scope.programId, scope.projectId, scope.clientWorkspaceId].join(':');
  return <SharingSession key={owner} {...props} scope={scope} />;
}

function ShareRow({ member, label, disabled, onSave, onRevoke }: {
  member: ProjectSharingMember; label: string; disabled: boolean;
  onSave: (role: 'use' | 'edit') => void; onRevoke: () => void;
}) {
  const [role, setRole] = useState(member.role);
  return <li className="pj-sharing-row">
    <strong>{label}</strong>
    {member.canSetRole ? <>
      <select className="c2c-input" aria-label={`Sharing role for ${label}`} value={role} disabled={disabled}
        onChange={event => setRole(event.target.value as 'use' | 'edit')}>
        <option value="use">Use</option><option value="edit">Edit</option>
      </select>
      <button type="button" className="btn ghost small" disabled={disabled || role === member.role}
        aria-label={`Save sharing role for ${label}`}
        onClick={() => { if (role === 'use' || role === 'edit') onSave(role); }}>Save role</button>
    </> : <span>{member.role === 'owner' ? 'Sharing: Owner' : `Sharing: ${member.role === 'edit' ? 'Edit' : 'Use'}`} · protected</span>}
    {member.canRevoke && <button type="button" className="btn ghost small" disabled={disabled} aria-label={`Revoke explicit share for ${label}`} onClick={onRevoke}>Revoke explicit share</button>}
  </li>;
}

function SharingSession({ scope, onChanged, suspended = false }: TeamSharingProps & { scope: ProjectSharingScope }) {
  const [read, setRead] = useState<Read>({ data: null, loading: true });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(''); const [role, setRole] = useState('');
  const [revoke, setRevoke] = useState<{ id: number; label: string } | null>(null);
  const mounted = useRef(false); const sending = useRef(false); const reads = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const suspendedNow = useRef(suspended); suspendedNow.current = suspended;
  const prefix = useId();
  const isCurrent = () => {
    if (!mounted.current || suspendedNow.current) return false;
    try { capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId }); return true; }
    catch { return false; }
  };
  const refresh = async () => {
    const request = ++reads.current;
    setRead(previous => ({ ...previous, loading: true, error: undefined }));
    const result = await requestProjectSharing(scope, isCurrent);
    if (!isCurrent() || request !== reads.current) return;
    if (result.kind === 'confirmed') {
      setRead({ data: result.data, loading: false }); setBlocked(false); setChosen(''); setRole('');
    } else setRead({ data: null, loading: false, error: result.message });
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reads.current += 1; };
  }, []);
  useEffect(() => {
    reads.current += 1;
    if (!suspended) void refresh();
    // The keyed session owns this immutable actor/program/workspace scope;
    // reverify after team refresh before showing private sharing details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended, refreshKey]);
  const save = async (write: SharingWrite) => {
    const data = read.data;
    if (sending.current || blocked || !isCurrent() || !canSave(data, write)) return;
    sending.current = true; setBusy(true); setNotice(null);
    const currentScope = { ...scope, clientWorkspaceId: data.clientWorkspaceId };
    const result = await requestProjectSharing(currentScope, isCurrent, write.role ? 'PUT' : 'DELETE', write);
    if (!isCurrent()) {
      if (mounted.current) { sending.current = false; setBusy(false); setBlocked(true); }
      return;
    }
    sending.current = false; setBusy(false);
    if (result.kind !== 'confirmed') {
      setRevoke(null); setBlocked(true); setNotice({ text: result.message, warning: true }); return;
    }
    setRevoke(null); setChosen(''); setRole('');
    setRead({ data: result.data, loading: false });
    setNotice({ text: result.auditWarning || (write.role ? 'Project sharing saved.' : `Explicit share revoked. ${REMAINING_ACCESS}`), warning: Boolean(result.auditWarning) });
    onChanged(); setRefreshKey(value => value + 1);
  };
  return <section className="pj-sharing" aria-label="Project sharing">
    <div className="pj-sharing-heading"><h3>Project sharing</h3>
      <button type="button" className="btn ghost small" disabled={suspended || busy || read.loading} onClick={() => { setRevoke(null); void refresh(); }}>Refresh sharing</button></div>
    {notice && <p className="pj-team-note" role={notice.warning ? 'alert' : 'status'}>{notice.text}</p>}
    {suspended ? <p className="pj-team-note" role="status">Team access is being verified. Sharing controls are unavailable until the team read succeeds.</p> :
      read.loading ? <p className="pj-team-note" role="status" aria-busy="true">Loading sharing…</p> :
      read.error || !read.data ? <ErrorState title="Couldn't load project sharing" message={read.error} retry={() => { void refresh(); }} retryLabel="Retry sharing" /> :
        <SharingControls data={read.data} prefix={prefix} busy={busy || blocked} chosen={chosen} role={role}
          setChosen={setChosen} setRole={setRole} onSave={save} onRevoke={setRevoke} />}
    {revoke && !suspended && <C2CForm config={{ eyebrow: 'Project sharing', title: `Revoke explicit share for ${revoke.label}?`,
      governed: REMAINING_ACCESS, fields: [], submitLabel: 'Confirm revoke share', busy: busy ? 'Revoking explicit share…' : undefined }}
      onCancel={() => { if (!busy) setRevoke(null); }} onSubmit={() => { void save({ memberId: revoke.id }); }} />}
  </section>;
}

function SharingControls({ data, prefix, busy, chosen, role, setChosen, setRole, onSave, onRevoke }: {
  data: ProjectSharingResponse; prefix: string; busy: boolean; chosen: string; role: string;
  setChosen: (value: string) => void; setRole: (value: string) => void;
  onSave: (write: SharingWrite) => Promise<void>; onRevoke: (value: { id: number; label: string }) => void;
}) {
  const labels = new Map(data.candidates.map(candidate => [candidate.userId, candidate.label]));
  const grantCandidates = data.candidates.filter(candidate => !data.members.some(member => member.userId === candidate.userId));
  return <>
    <p className="pj-team-note">{data.visibility === 'org_public' ? 'Organization-visible project: organization members may have access without an explicit share.' : 'Private project: access follows its recorded sharing and organization policy.'} {REMAINING_ACCESS}</p>
    {data.canManage && <>
      <p className="pj-team-note">Choose Use or Edit for a current organization account. Sharing applies to specific project actions; approval and signing remain separate.</p>
      <form className="pj-sharing-grant" onSubmit={event => { event.preventDefault(); if (chosen && (role === 'use' || role === 'edit')) void onSave({ memberId: Number(chosen), role }); }}>
        <label htmlFor={`${prefix}-member`}>Organization member<select id={`${prefix}-member`} className="c2c-input" value={chosen} disabled={busy} onChange={event => setChosen(event.target.value)}>
          <option value="">Choose a member</option>{grantCandidates.map(candidate => <option key={candidate.userId} value={candidate.userId}>{candidate.label}</option>)}
        </select></label>
        <label htmlFor={`${prefix}-role`}>New sharing role<select id={`${prefix}-role`} className="c2c-input" value={role} disabled={busy} onChange={event => setRole(event.target.value)}>
          <option value="">Choose a role</option><option value="use">Use</option><option value="edit">Edit</option>
        </select></label>
        <button type="submit" className="btn primary small" disabled={busy || !chosen || (role !== 'use' && role !== 'edit')}>Grant sharing</button>
      </form>
      {grantCandidates.length === 0 && <p className="pj-team-note">No additional current organization accounts are available to share with.</p>}
      <ul className="pj-sharing-members" aria-label="Project sharing memberships">{data.members.map(member => {
        const label = labels.get(member.userId) || `Account #${member.userId}`;
        return <ShareRow key={`${member.userId}:${member.role}`} member={member} label={label} disabled={busy}
          onSave={next => { void onSave({ memberId: member.userId, role: next }); }} onRevoke={() => onRevoke({ id: member.userId, label })} />;
      })}</ul>
    </>}
  </>;
}
