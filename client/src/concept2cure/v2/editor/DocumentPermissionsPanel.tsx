/**
 * The open document's explicit access grants, on the canonical editor rail.
 * The owner/admin-controlled permissions API decides every read and change.
 * Members and section choices come from this organization and this document;
 * no ids or contact addresses are invented or sent through AnA.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { memberLabels, type NamedMember } from '@shared/utils/member-labels';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { EmptyState } from '../dataConnect';
import { I } from '../icons';
import type { FireToast } from '../toast';

const ROLES = [
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'AUTHOR', label: 'Author' },
  { value: 'REVIEWER', label: 'Reviewer' },
  { value: 'APPROVER', label: 'Approver' },
  { value: 'OWNER', label: 'Owner' },
];
const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label ?? role;
interface PermissionRow {
  id: string; doc_id: string; principal_id: string; email: string | null; role: string; section_id: string | null;
  valid_from: string; valid_until: string | null; revoked_at: string | null; grant_reason: string | null; revoke_reason: string | null;
}
interface SectionChoice { id: string; code: string; title: string }
interface Props {
  docId: string | null; docTitle: string | null; organizationId?: string | number | null;
  sections: SectionChoice[]; fireToast?: FireToast;
}
type Read<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: T[] };
type Act = { kind: 'grant' } | { kind: 'revoke'; permission: PermissionRow };
type ChangeOutcome = { ok: true; permission: PermissionRow } | { ok: false; message: string; unconfirmed: boolean };
interface ChangeRequest { method: 'POST' | 'DELETE'; url: string; body: Record<string, unknown>; matches: (row: PermissionRow) => boolean }
interface PermissionReceipt { success?: boolean; permission?: unknown; auditTrail?: { persisted?: boolean; chained?: boolean } }
type PreparedChange = { ready: true; request: ChangeRequest } | { ready: false; message: string };
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown) => value === null || validDate(value);

function isPermission(value: unknown, docId: string): value is PermissionRow {
  if (!value || typeof value !== 'object') return false;
  const p = value as PermissionRow;
  return [p.id, p.principal_id].every(id => typeof id === 'string' && !!id) && p.doc_id === docId
    && ROLES.some(r => r.value === p.role) && [p.email, p.section_id, p.grant_reason, p.revoke_reason].every(nullableText)
    && validDate(p.valid_from) && [p.valid_until, p.revoked_at].every(nullableDate);
}
function failure(error: unknown, fallback: string): string {
  return redactInternals(error instanceof Error ? error.message : '', fallback);
}
async function readJson(url: string): Promise<unknown> {
  const res = await apiRequest('GET', url);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(serverMessage(body) ?? `The server returned HTTP ${res.status}.`);
  return body;
}
function grantState(p: PermissionRow): string {
  if (p.revoked_at) return 'Revoked';
  if (p.valid_until && Date.parse(p.valid_until) <= Date.now()) return 'Expired';
  if (Date.parse(p.valid_from) > Date.now()) return 'Not yet active';
  return 'Active';
}
function parseAccessRead(result: PromiseSettledResult<unknown>, docId: string): Read<PermissionRow> {
  if (result.status === 'rejected') return { state: 'error', message: failure(result.reason, 'The document access list could not be reached.') };
  const body = result.value as { success?: boolean; docId?: string; permissions?: unknown[] } | null;
  if (body?.success === true && body.docId === docId && Array.isArray(body.permissions) && body.permissions.every(p => isPermission(p, docId))) {
    return { state: 'ready', rows: body.permissions as PermissionRow[] };
  }
  return { state: 'error', message: 'The server did not return a verified access list for this document.' };
}
function parseMemberRead(result: PromiseSettledResult<unknown>): Read<NamedMember> {
  if (result.status === 'rejected') return { state: 'error', message: failure(result.reason, 'The organization member list could not be reached.') };
  const isMember = (m: NamedMember) => m && ['number', 'string'].includes(typeof m.id) && String(m.id).trim() && [m.name ?? null, m.email ?? null].every(nullableText);
  if (Array.isArray(result.value) && result.value.every(isMember)) return { state: 'ready', rows: result.value };
  return { state: 'error', message: 'The server did not return an organization member list.' };
}
function usePermissionReads(docId: string, organizationId: Props['organizationId']) {
  const [permissions, setPermissions] = useState<Read<PermissionRow>>({ state: 'loading' });
  const [members, setMembers] = useState<Read<NamedMember>>({ state: 'loading' });
  const alive = useRef(true);
  const sequence = useRef(0);
  const org = Number(organizationId);
  const hasOrg = Number.isSafeInteger(org) && org > 0;
  const path = `/api/authoring/docs/${encodeURIComponent(docId)}/permissions`;
  const reload = useCallback(async () => {
    const generation = ++sequence.current;
    setPermissions({ state: 'loading' }); setMembers({ state: 'loading' });
    const [access, roster] = await Promise.allSettled([
      readJson(path),
      hasOrg ? readJson(`/api/tenant-users/${org}`) : Promise.reject(new Error('Your session does not identify an organization.')),
    ]);
    if (!alive.current || generation !== sequence.current) return false;
    const read = parseAccessRead(access, docId);
    setPermissions(read); setMembers(parseMemberRead(roster));
    return read.state === 'ready';
  }, [docId, hasOrg, org, path]);
  useEffect(() => {
    alive.current = true; void reload();
    return () => { alive.current = false; sequence.current += 1; };
  }, [reload]);
  return { permissions, members, alive, reload, path };
}

function prepareChange(act: Act, values: Record<string, string>, path: string, members: Read<NamedMember>, sections: SectionChoice[]): PreparedChange {
  const reason = (values.reason ?? '').trim();
  if (!reason || reason.length > 500) return { ready: false, message: 'Give a reason between 1 and 500 characters.' };
  if (act.kind === 'revoke') return { ready: true, request: { method: 'DELETE', url: `${path}/${encodeURIComponent(act.permission.id)}`, body: { reason }, matches: p => p.id === act.permission.id && p.revoked_at !== null } };
  if (members.state !== 'ready' || !members.rows.some(m => String(m.id) === values.principalId)) return { ready: false, message: 'Choose a current organization member.' };
  if (!ROLES.some(r => r.value === values.role)) return { ready: false, message: 'Choose a document role.' };
  const sectionId = values.sectionId === 'document' ? null : values.sectionId;
  if (sectionId !== null && !sections.some(s => s.id === sectionId)) return { ready: false, message: 'Choose a scope from this document.' };
  const validUntil = values.expiry ? `${values.expiry}T23:59:59.999Z` : null;
  if (validUntil && (!validDate(validUntil) || Date.parse(validUntil) <= Date.now())) return { ready: false, message: 'Choose an expiry date in the future.' };
  return { ready: true, request: {
    method: 'POST', url: path, body: { principalId: values.principalId, role: values.role, sectionId, reason, validUntil },
    matches: p => p.principal_id === values.principalId && p.role === values.role && p.section_id === sectionId && p.revoked_at === null,
  } };
}
function confirmedReceipt(body: PermissionReceipt | null, docId: string, request: ChangeRequest): body is PermissionReceipt & { permission: PermissionRow } {
  return body?.success === true && isPermission(body.permission, docId) && request.matches(body.permission)
    && body.auditTrail?.persisted === true && body.auditTrail?.chained === true;
}
async function changeAccess(request: ChangeRequest, docId: string): Promise<ChangeOutcome> {
  try {
    const res = await apiRequest(request.method, request.url, request.body);
    const body = await res.json().catch(() => null) as PermissionReceipt | null;
    if (!res.ok) throw new ApiRequestError(serverMessage(body) ?? `The server returned HTTP ${res.status}.`, res.status, body);
    if (!confirmedReceipt(body, docId, request)) {
      return { ok: false, unconfirmed: true, message: 'The server did not confirm this access change and its audit record. Close this form and reload access before retrying.' };
    }
    return { ok: true, permission: body.permission };
  } catch (error) {
    const refused = error instanceof ApiRequestError && [400, 401, 403, 404, 409, 422].includes(error.status);
    return { ok: false, unconfirmed: !refused, message: (refused ? 'Access change refused — ' : 'Access change unconfirmed — ')
      + failure(error, 'No confirmed response was received.') + (refused ? '' : ' Close this form and reload access before retrying.') };
  }
}
function personLabel(p: PermissionRow, labels: Map<string, string>): string {
  return labels.get(p.principal_id) ?? p.email ?? 'Member no longer in the roster';
}
function scopeLabel(p: PermissionRow, sections: SectionChoice[]): string {
  if (p.section_id === null) return 'Whole document';
  const section = sections.find(s => s.id === p.section_id);
  return section ? `${section.code} · ${section.title}` : 'Section no longer in the outline';
}
function confirmation(act: Act, row: PermissionRow, labels: Map<string, string>): string {
  const result = act.kind === 'grant' ? `grant recorded for ${personLabel(row, labels)}. ${grantState(row) === 'Active' ? 'Access is active.' : 'This grant is not active; check its dates.'}`
    : `grant revoked for ${personLabel(row, labels)}. Other grants may still provide access.`;
  return `${roleLabel(row.role)} ${result} Your reason is recorded in the audit trail.`;
}
function accessForm(act: Act, props: Props, members: Read<NamedMember>, formNotice: string | undefined, sending: boolean): C2CFormConfig {
  const roster = members.state === 'ready' ? members.rows : [];
  const labels = memberLabels(roster);
  const common = { eyebrow: 'Document access', notice: formNotice };
  if (act.kind === 'revoke') return {
    ...common, title: `Revoke ${roleLabel(act.permission.role).toLowerCase()} access`, sub: `${personLabel(act.permission, labels)} · ${scopeLabel(act.permission, props.sections)}`,
    governed: 'This revokes this grant only. Other grants may still provide access. The document must retain an active owner. Your reason and the revocation are recorded together in the audit trail.',
    submitLabel: sending ? 'Recording…' : 'Revoke access',
    fields: [{ key: 'reason', label: 'Reason for revocation', type: 'textarea', required: true, rows: 3, desc: 'State why this grant is being revoked (up to 500 characters).' }],
  };
  return {
    ...common, title: 'Grant document access', sub: props.docTitle ?? 'The open document',
    governed: 'The server verifies your owner or administrator authority. The access grant and your reason are recorded together in the audit trail. Signing still requires the account’s signing role; authors cannot approve their own work.',
    submitLabel: sending ? 'Recording…' : 'Grant access',
    fields: [
      { key: 'principalId', label: 'Member', type: 'select', required: true, options: roster.map(m => ({ value: String(m.id), label: labels.get(String(m.id)) ?? String(m.id) })) },
      { key: 'role', label: 'Document role', type: 'select', required: true, default: 'VIEWER', options: ROLES, desc: 'Viewer reads. Author edits. Reviewer reviews. Approver approves and exports. Owner also manages access.' },
      { key: 'sectionId', label: 'Scope', type: 'select', required: true, default: 'document', options: [{ value: 'document', label: 'Whole document' }, ...props.sections.map(s => ({ value: s.id, label: `${s.code} · ${s.title}` }))], desc: 'A section grant applies only to that section. Whole-document access also applies to its sections.' },
      { key: 'expiry', label: 'Expiry date', type: 'date', desc: 'Optional. Access expires at the end of this date in UTC. Leaving it blank creates no expiry. Existing grants keep their expiry; revoke a grant before replacing its dates.' },
      { key: 'reason', label: 'Reason for access', type: 'textarea', required: true, rows: 3, desc: 'State why this member needs this role and scope (up to 500 characters).' },
    ],
  };
}
function usePermissionChange(props: Props & { docId: string }, reads: ReturnType<typeof usePermissionReads>) {
  const [act, setAct] = useState<Act | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | undefined>();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const sending = useRef(false);
  const open = (next: Act) => { setFormNotice(undefined); setAct(next); };
  const close = () => { if (!sending.current) setAct(null); };
  const reload = async () => { if (await reads.reload()) setUnconfirmed(false); };
  const submit = async (values: Record<string, string>) => {
    if (!act || sending.current) return;
    if (unconfirmed) { setFormNotice('Close this form and reload access before retrying. The previous outcome is unconfirmed.'); return; }
    if (reads.permissions.state !== 'ready') { setFormNotice('Reload the document access list before making a change.'); return; }
    const prepared = prepareChange(act, values, reads.path, reads.members, props.sections);
    if (!prepared.ready) { setFormNotice(prepared.message); return; }
    sending.current = true; setFormNotice('Recording the access change and its audit entry…');
    try {
      const outcome = await changeAccess(prepared.request, props.docId);
      if (!reads.alive.current) return;
      if (!outcome.ok) { setUnconfirmed(outcome.unconfirmed); setFormNotice(outcome.message); return; }
      const labels = memberLabels(reads.members.state === 'ready' ? reads.members.rows : []);
      const message = confirmation(act, outcome.permission, labels);
      setNotice(message); props.fireToast?.(message); setAct(null);
      await reload();
    } finally { sending.current = false; }
  };
  return { act, notice, unconfirmed, sending, open, close, reload, submit,
    config: act ? accessForm(act, props, reads.members, formNotice, sending.current) : null };
}
function PermissionRecord({ permission: p, sections, labels, blocked, onRevoke }: { permission: PermissionRow; sections: SectionChoice[]; labels: Map<string, string>; blocked: boolean; onRevoke: () => void }) {
  return <div className="es-manifest" style={{ padding: 'var(--space-3) 0', borderBottom: 'var(--space-px) solid var(--border)' }}>
    <div><b>{personLabel(p, labels)}</b> · {roleLabel(p.role)} · {grantState(p)}</div>
    <div className="de-desc">{scopeLabel(p, sections)}</div>
    <div className="de-desc">Granted <GovernedTimestamp value={p.valid_from} /></div>
    {p.valid_until && <div className="de-desc">Expires <GovernedTimestamp value={p.valid_until} /></div>}
    {p.grant_reason && <div className="de-desc">Reason: {p.grant_reason}</div>}
    {p.revoked_at ? <><div className="de-desc">Revoked <GovernedTimestamp value={p.revoked_at} /></div>{p.revoke_reason && <div className="de-desc">Revocation reason: {p.revoke_reason}</div>}</>
      : <button type="button" className="btn ghost small" onClick={onRevoke} disabled={blocked}>Revoke {roleLabel(p.role).toLowerCase()} grant</button>}
  </div>;
}
function PermissionsRead({ read, children }: { read: Read<PermissionRow>; children: React.ReactNode }) {
  if (read.state === 'loading') return <EmptyState icon={I.clock} title="Reading document access…" busy />;
  if (read.state === 'error') return <EmptyState icon={I.alertTriangle} tone="error" title="Document access could not be read" hint={`${read.message} No access list is claimed. Reload access to try again.`} />;
  if (!read.rows.length) return <EmptyState icon={I.shieldCheck} title="No explicit access grants recorded" hint="New grants appear here with their role, scope and reason." />;
  return <>{children}</>;
}
function MembersNote({ members }: { members: Read<NamedMember> }) {
  if (members.state === 'error') return <p className="scaf-note" role="status">Members could not be read. {members.message} New grants are unavailable until the member list loads.</p>;
  if (members.state === 'ready' && !members.rows.length) return <p className="scaf-note">No organization members were returned. No member can be selected for a new grant.</p>;
  return null;
}
/** A key discards the previous document's reads, form and pending result. */
export function DocumentPermissionsPanel(props: Props) {
  if (!props.docId) return <EmptyState icon={I.shieldCheck} title="No document open" hint="Open a document to manage its access." />;
  return <DocumentPermissions key={`${props.organizationId ?? ''}:${props.docId}`} {...props} docId={props.docId} />;
}
function DocumentPermissions(props: Props & { docId: string }) {
  const reads = usePermissionReads(props.docId, props.organizationId);
  const change = usePermissionChange(props, reads);
  const { permissions, members } = reads;
  const roster = members.state === 'ready' ? members.rows : [];
  const labels = memberLabels(roster);
  const canGrant = permissions.state === 'ready' && roster.length > 0 && !change.unconfirmed;
  return <>
    <div style={{ padding: 'var(--space-3)' }}>
      <p className="scaf-note">Explicit grants for this document. Owners and administrators manage access. Your organization role alone does not grant reviewer or approver authority.</p>
      {change.notice && <p className="scaf-note" role="status">{change.notice}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost small" onClick={() => void change.reload()} disabled={change.sending.current}>Reload access</button>
        <button type="button" className="btn ghost small" onClick={() => change.open({ kind: 'grant' })} disabled={!canGrant}>{I.user} Grant access</button>
      </div>
      <PermissionsRead read={permissions}>
        {permissions.state === 'ready' && permissions.rows.map(p => <PermissionRecord key={p.id} permission={p} sections={props.sections} labels={labels} blocked={change.unconfirmed} onRevoke={() => change.open({ kind: 'revoke', permission: p })} />)}
      </PermissionsRead>
      <MembersNote members={members} />
    </div>
    {change.config && <C2CForm config={change.config} onCancel={change.close} onSubmit={values => void change.submit(values)} />}
  </>;
}
