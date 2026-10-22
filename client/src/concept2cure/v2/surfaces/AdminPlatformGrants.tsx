import React, { useRef, useState } from 'react';
import { PLATFORM_GRANT_ROLES, PLATFORM_GRANT_LABELS, type PlatformGrantRole } from '@shared/constants/platform-grant-roles';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { EmptyState, useLiveData, type DataState } from '../dataConnect';
import { I } from '../icons';

interface Grant { id: number; email: string | null; name: string | null; role: string; granted_by: string | null; granted_at: string | null }
interface Payload { grants: Grant[]; grantableRoles: PlatformGrantRole[] }
type Action = { kind: 'grant' } | { kind: 'revoke'; grant: Grant };
const PATH = '/api/admin/access/grants';
const roleLabel = (role: string) => PLATFORM_GRANT_LABELS[role as PlatformGrantRole] ?? role;
function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Payload;
  return Array.isArray(p.grants) && p.grants.every(g => g && Number.isInteger(g.id) && g.id > 0 && typeof g.role === 'string')
    && Array.isArray(p.grantableRoles) && p.grantableRoles.every(role => PLATFORM_GRANT_ROLES.includes(role));
}

type ChangeOutcome = { error: string; refresh?: boolean } | { note: { text: string; warning: boolean } };
function requestFor(action: Action, values: Record<string, string>, roles: PlatformGrantRole[]):
  { error: string } | { method: 'POST' | 'DELETE'; path: string; body: Record<string, string> } {
  const reason = (values.reason ?? '').trim();
  if (reason.length < 3) return { error: 'Enter a reason with at least 3 characters.' } as const;
  if (action.kind === 'grant' && !roles.includes(values.role as PlatformGrantRole)) return { error: 'Select a role the server permits you to grant.' } as const;
  return action.kind === 'grant'
    ? { method: 'POST' as const, path: PATH, body: { email: values.email.trim(), role: values.role, reason } }
    : { method: 'DELETE' as const, path: `${PATH}/${action.grant.id}`, body: { reason } };
}
function grantOutcome(reply: unknown, granting: boolean): ChangeOutcome {
  const answer = reply as { id?: unknown; auditTrail?: { persisted?: boolean; chained?: boolean } } | null;
  if (!answer || !Number.isInteger(Number(answer.id)) || Number(answer.id) <= 0) return {
    error: 'The server accepted the request but did not return the changed grant. Re-read the grant list before retrying.', refresh: true,
  };
  if (granting) return { note: { warning: false, text: 'Platform role granted with its audit record.' } };
  if (answer.auditTrail?.persisted !== true) return { note: { warning: true, text: 'Platform role revoked. Its audit entry could not be confirmed; the failure was logged for follow-up.' } };
  if (answer.auditTrail.chained !== true) return { note: { warning: true, text: 'Platform role revoked. The audit entry reached the tamper-proof log, but its entry in the audit trail could not be confirmed.' } };
  return { note: { warning: false, text: 'Platform role revoked with its audit record.' } };
}

function useGrantActions(roles: PlatformGrantRole[], changed: () => void) {
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [note, setNote] = useState<{ text: string; warning: boolean } | null>(null);
  const open = (next: Action) => { setError(''); setAction(next); };
  const cancel = () => { if (!pending.current) setAction(null); };
  const submit = async (values: Record<string, string>) => {
    if (pending.current || !action) return;
    const request = requestFor(action, values, roles);
    if ('error' in request) { setError(request.error); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const res = await apiRequest(request.method, request.path, request.body);
      const reply: unknown = await res.json().catch(() => null);
      if (!res.ok) { setError(serverMessage(reply) ?? `The server refused the change (HTTP ${res.status}).`); return; }
      const outcome = grantOutcome(reply, action.kind === 'grant');
      if ('error' in outcome) {
        setError(outcome.error); if (outcome.refresh) changed(); return;
      }
      setNote(outcome.note);
      setAction(null); changed();
    } catch (e) { setError(e instanceof Error ? e.message : 'The access service could not be reached.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const config: C2CFormConfig = {
    eyebrow: 'Admin and access · platform personnel',
    title: action?.kind === 'revoke' ? `Revoke ${roleLabel(action.grant.role)}?` : 'Grant platform access',
    sub: action?.kind === 'revoke' ? action.grant.name || action.grant.email || 'Selected grant' : 'The person must already have a user account.',
    governed: action?.kind === 'revoke'
      ? 'This withdraws the selected platform access immediately. Organization membership is unchanged. The reason is recorded with the withdrawal.'
      : 'Platform roles confer access across organizations. Finance roles additionally require your verified business standing. Granting access requires a reason and a successful audit record.',
    submitLabel: action?.kind === 'revoke' ? 'Revoke platform access' : 'Grant platform access',
    notice: error || undefined, busy: busy ? 'Recording the access change…' : undefined,
    fields: action?.kind === 'revoke' ? [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }]
      : [{ key: 'email', label: 'Existing user email', type: 'text', required: true },
        { key: 'role', label: 'Platform role', type: 'select', required: true, options: roles.map(role => ({ value: role, label: roleLabel(role) })) },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true }],
  };
  return { action, config, note, open, cancel, submit };
}

/** The server's successful, platform-gated read is the authority to show grant
 * controls. A tenant admin's role or email never widens this panel. */
export function AdminPlatformGrants() {
  const [epoch, setEpoch] = useState(0);
  const live = useLiveData<Payload>(PATH, [PATH, epoch], isPayload);
  const roles = live.data?.grantableRoles ?? [];
  // Platform grants write the platform's audit chain, not this tenant's admin
  // estate. Re-read this list without unmounting its recorded outcome.
  const changed = () => setEpoch(n => n + 1);
  const actions = useGrantActions(roles, changed);
  return (
    <section className="section">
      <GrantRead live={live} retry={() => setEpoch(n => n + 1)} open={actions.open} />
      {actions.note && <div className={actions.note.warning ? 'adm-empty adm-overdue' : 'adm-empty'} role={actions.note.warning ? 'alert' : 'status'}>{actions.note.text}</div>}
      {actions.action && <C2CForm config={actions.config} onCancel={actions.cancel} onSubmit={values => void actions.submit(values)} />}
    </section>
  );
}

function GrantRead({ live, retry, open }: { live: DataState<Payload>; retry: () => void; open: (action: Action) => void }) {
  const ready = !live.loading && !live.error && live.data != null;
  const forbidden = live.status === 401 || live.status === 403;
  return <>
    <div className="section-head"><h2>Platform personnel</h2><span className="section-sub">Access across organizations · separate from member roles</span>
      {ready && live.data!.grantableRoles.length > 0 && <button className="btn primary small adm-key-create" onClick={() => open({ kind: 'grant' })}>{I.plus} Grant platform access</button>}
    </div>
    {live.loading ? <div className="adm-empty" role="status">Reading platform access…</div>
      : live.error ? <div className="adm-facet-error"><EmptyState tone={forbidden ? undefined : 'error'} icon={I.lock}
        title={forbidden ? 'Platform access is restricted' : 'Platform access could not be read'}
        hint={forbidden ? 'The platform owner and designated personnel manage these grants. Your organization administrator role does not grant platform access.' : live.error}
        retry={forbidden ? undefined : retry} /></div>
      : <GrantList grants={live.data?.grants ?? []} onRevoke={grant => open({ kind: 'revoke', grant })} />}
  </>;
}

function GrantList({ grants, onRevoke }: { grants: Grant[]; onRevoke: (grant: Grant) => void }) {
  if (!grants.length) return <div className="adm-empty">No active platform role grants.</div>;
  return <div className="adm-platform-grants">{grants.map(grant => (
    <article key={grant.id} className="adm-platform-grant">
      <div><strong>{grant.name || grant.email || 'Unnamed account'}</strong>{grant.name && grant.email && <div className="adm-sub">{grant.email}</div>}<div className="adm-sub">{roleLabel(grant.role)}</div></div>
      <div className="adm-sub">Granted by {grant.granted_by || 'Not recorded'}<br />{grant.granted_at ? new Date(grant.granted_at).toLocaleString() : 'No date recorded'}</div>
      <button className="btn ghost small" onClick={() => onRevoke(grant)} aria-label={`Revoke ${roleLabel(grant.role)} for ${grant.name || grant.email || 'this account'}`}>{I.close} Revoke</button>
    </article>
  ))}</div>;
}
