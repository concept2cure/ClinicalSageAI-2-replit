import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import { projectSharingId } from '@shared/project-sharing';
import { isProjectSettingsPatch, PROJECT_SETTINGS_FIELDS, type ProjectSettingsData, type ProjectSettingsPatch, type ProjectSettingsScope, type ProjectSettingsWrite } from '@shared/project-settings';
import { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
import { GovernedConfirmDialog } from '../../_shared/components/GovernedConfirmDialog';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { projectSettingsHeaders, requestProjectSettings } from './projectSettingsRequest';
import '../styles/project-settings.css';

interface Props { programId: string; onSaved: () => void }
interface Draft { description: string; priority: ProjectSettingsData['priority']; targetSubmissionDate: string }
const id = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
const draftOf = (data: ProjectSettingsData): Draft => ({ description: data.description ?? '', priority: data.priority, targetSubmissionDate: data.targetSubmissionDate ?? '' });
const RETIRED = 'Project settings were retired because the project, workspace or account changed. Reopen settings to read current facts. A change already sent may have completed.';
const FIELD_LABEL = { description: 'Description', priority: 'Priority', targetSubmissionDate: 'Target submission date' } as const;
function settingsReviewTarget(patch: ProjectSettingsPatch | null): string {
  const fields = PROJECT_SETTINGS_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(patch ?? {}, field));
  return `Current project · ${fields.map(field => FIELD_LABEL[field]).join(', ')}`;
}

/** The header action opens the existing project's bounded, governed fields. */
export function ProjectSettings(props: Props) {
  const user = useAuthUser();
  const actorUserId = id(user?.id); const organizationId = id(user?.organizationId);
  if (!user || !projectSharingId(actorUserId) || !projectSharingId(organizationId)) return null;
  return <TenantSettings {...props} user={user} actorUserId={actorUserId} organizationId={organizationId} />;
}
function TenantSettings(props: Props & { user: AuthUser; actorUserId: number; organizationId: number }) {
  const tenant = useTenant();
  const owner = useAuthoringReadSession(props.user);
  const program = useShellProject();
  const organizationId = id(tenant.currentOrganization?.id);
  const workspace = tenant.currentClientWorkspace;
  const clientWorkspaceId = workspace ? id(workspace.id) : null;
  const valid = organizationId === props.organizationId && shellProgramId(program) === props.programId &&
    (!workspace || id(workspace.organizationId) === organizationId && projectSharingId(clientWorkspaceId));
  const key = [owner.key, props.actorUserId, props.organizationId, props.programId, clientWorkspaceId, valid].join(':');
  const current = useRef(key); current.current = key;
  if (!valid) return <p className="pj-settings-note" role="status">Open the project's current organization and workspace to use project settings.</p>;
  const scope: ProjectSettingsScope = { programId: props.programId, actorUserId: props.actorUserId,
    organizationId: props.organizationId, clientWorkspaceId: clientWorkspaceId as number | null };
  return <SettingsSession key={key} {...props} scope={scope} isCurrent={() => current.current === key && owner.sameRevision()} />;
}
function useSettingsState() {
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<ProjectSettingsData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [review, setReview] = useState<ProjectSettingsPatch | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [blocked, setBlocked] = useState(false); const [saving, setSaving] = useState(false);
  const [retired, setRetired] = useState(false);
  const pending = useRef(false); const mounted = useRef(false); const reads = useRef(0);
  return { open, setOpen, loading, setLoading, saved, setSaved, draft, setDraft, review, setReview,
    note, setNote, blocked, setBlocked, saving, setSaving, retired, setRetired, pending, mounted, reads };
}
type State = ReturnType<typeof useSettingsState>;
type Context = { state: State; scope: ProjectSettingsScope; current: () => boolean; onSaved: () => void };
function retained(context: Context): boolean {
  if (!context.state.mounted.current) return false;
  if (projectSettingsHeaders(context.scope, context.current)) return true;
  context.state.setRetired(true); context.state.setSaved(null); context.state.setDraft(null); context.state.setReview(null);
  return false;
}
async function loadSettings(context: Context) {
  const s = context.state;
  if (s.pending.current || !retained(context)) return;
  const serial = ++s.reads.current;
  s.setLoading(true); s.setSaved(null); s.setDraft(null); s.setReview(null);
  const answer = await requestProjectSettings(context.scope, context.current);
  if (!retained(context) || serial !== s.reads.current) return;
  s.setLoading(false);
  if (answer.kind !== 'confirmed') { s.setNote({ error: true, text: answer.message }); return; }
  s.setSaved(answer.envelope.data); s.setDraft(draftOf(answer.envelope.data)); s.setBlocked(false);
  s.setNote({ error: false, text: 'Current saved settings loaded. This read does not confirm an earlier uncertain save or audit.' });
}
function diff(saved: ProjectSettingsData | null, draft: Draft | null): ProjectSettingsPatch {
  if (!saved || !draft) return {};
  const before = draftOf(saved);
  const next = { description: draft.description.trim() || null, priority: draft.priority, targetSubmissionDate: draft.targetSubmissionDate || null };
  return Object.fromEntries(PROJECT_SETTINGS_FIELDS.filter(field => draft[field] !== before[field] && next[field] !== saved[field]).map(field => [field, next[field]]));
}
function exactChange(data: ProjectSettingsData, before: ProjectSettingsData, patch: ProjectSettingsPatch, changed: readonly string[]): boolean {
  const keys = Object.keys(patch);
  return changed.length === keys.length && keys.every(key => changed.includes(key)) &&
    PROJECT_SETTINGS_FIELDS.every(field => field in patch || data[field] === before[field]);
}
const validReason = (reason: string) => reason.trim().length >= GOVERNED_REASON_MIN && reason.trim().length <= GOVERNED_REASON_MAX;
function saveRefusal(state: State, answer: { message: string; status?: number }) {
  state.setBlocked(true); state.setNote({ error: true, text: answer.message });
  if ([401, 403, 404].includes(answer.status ?? 0)) { state.setSaved(null); state.setDraft(null); }
}
async function saveSettings(context: Context, reason: string) {
  const s = context.state; const before = s.saved; const patch = s.review;
  if (s.pending.current || s.blocked || !before?.canChange || !patch || !retained(context)) return;
  if (!validReason(reason)) {
    s.setNote({ error: true, text: `Use a reason between ${GOVERNED_REASON_MIN} and ${GOVERNED_REASON_MAX} characters.` }); return;
  }
  s.pending.current = true; s.setSaving(true); s.setNote(null);
  const write: ProjectSettingsWrite = { revision: before.revision, reason, patch };
  const scope = { ...context.scope, projectId: before.projectId, clientWorkspaceId: before.clientWorkspaceId };
  try {
    const answer = await requestProjectSettings(scope, context.current, write);
    if (!retained(context)) return;
    s.setReview(null);
    if (answer.kind !== 'confirmed') { saveRefusal(s, answer); return; }
    const { data, meta } = answer.envelope;
    if (!exactChange(data, before, patch, meta?.changedFields ?? [])) {
      s.setBlocked(true); s.setNote({ error: true, text: 'The saved settings receipt could not be confirmed. Reload saved settings before another change.' }); return;
    }
    s.setSaved(data); s.setDraft(draftOf(data));
    s.setNote({ error: false, text: 'Project settings saved with your reason in the chained audit trail.' });
    if (retained(context)) context.onSaved();
  } finally {
    s.pending.current = false;
    if (s.mounted.current) s.setSaving(false);
  }
}
function SettingsSession({ scope, isCurrent, onSaved }: Props & { scope: ProjectSettingsScope; isCurrent: () => boolean }) {
  const s = useSettingsState(); const prefix = useId();
  const { open, review, pending, mounted, setOpen } = s;
  const visit = useMemo(() => captureShellProjectGuard(), []);
  const live = useRef(isCurrent); live.current = isCurrent;
  const current = useCallback(() => mounted.current && visit() && live.current(), [mounted, visit]);
  const context: Context = { state: s, scope, current, onSaved };
  const close = () => { if (!s.pending.current) s.setOpen(false); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [mounted]);
  useEffect(() => {
    if (!open || review) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !pending.current) setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, review, pending, setOpen]);
  const toggle = () => {
    if (s.pending.current || !retained(context)) return;
    if (s.open) close();
    else { s.setOpen(true); if (!s.blocked) void loadSettings(context); }
  };
  const patch = diff(s.saved, s.draft);
  const editable = s.saved?.canChange === true && !s.saving && !s.loading && !s.blocked;
  if (s.retired) return <p className="pj-settings-note" role="status">{RETIRED}</p>;
  return <div className="pj-settings">
    <button className="btn ghost" onClick={toggle} aria-expanded={s.open} aria-controls={`${prefix}-panel`} disabled={s.saving}>Project settings</button>
    {s.open && <SettingsPanel state={s} prefix={prefix} editable={editable} patch={patch} onClose={close}
      onReload={() => void loadSettings(context)} onReview={() => { if (retained(context)) s.setReview(patch); }} />}
    <GovernedConfirmDialog open={!!s.review && !s.retired} action="Save project settings" target={settingsReviewTarget(s.review)} minReason={GOVERNED_REASON_MIN}
      submitError={s.note?.error ? s.note.text : null}
      onCancel={() => { if (!s.pending.current) s.setReview(null); }} onConfirm={({ reason }) => saveSettings(context, reason)} />
  </div>;
}
function SettingsPanel({ state: s, prefix, editable, patch, onClose, onReload, onReview }: {
  state: State; prefix: string; editable: boolean; patch: ProjectSettingsPatch; onClose: () => void; onReload: () => void; onReview: () => void;
}) {
  return <section className="pj-settings-panel" id={`${prefix}-panel`} aria-label="Project settings">
      <div className="pj-sec-h"><h2>Project settings</h2><button className="btn ghost small" onClick={onClose} disabled={s.saving}>Close settings</button></div>
      {s.loading && <p role="status">Reading current project settings…</p>}
      {s.saved && s.draft && <SettingsFields state={s} editable={editable} prefix={prefix} />}
      {s.note && <p className="pj-settings-note" role={s.note.error ? 'alert' : 'status'}>{s.note.text}</p>}
      {!s.loading && <div className="pj-settings-actions">
        <button className="btn ghost" disabled={s.saving} onClick={onReload}>Reload saved settings</button>
        {s.saved?.canChange && <button className="btn primary" disabled={!editable || !isProjectSettingsPatch(patch)} onClick={onReview}>Review settings change</button>}
      </div>}
    </section>;
}
function SettingsFields({ state: s, editable, prefix }: { state: State; editable: boolean; prefix: string }) {
  const draft = s.draft!;
  const change = (field: keyof Draft, value: string) => s.setDraft(previous => previous ? { ...previous, [field]: value } : previous);
  return <div className="npw-fields">
    {!s.saved?.canChange && <p className="pj-settings-note npw-field-wide">Your current project permissions allow reading these settings. Editing is unavailable.</p>}
    <label className="npw-field npw-field-wide"><span className="npw-field-l">Project description</span>
      <textarea className="c2c-input" value={draft.description} rows={3} maxLength={4000} disabled={!editable} onChange={event => change('description', event.target.value)} /></label>
    <label className="npw-field"><span className="npw-field-l">Project priority</span><select className="c2c-input" value={draft.priority} disabled={!editable} onChange={event => change('priority', event.target.value)}>
      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
    </select></label>
    <label className="npw-field"><span className="npw-field-l">Target submission date</span><input className="c2c-input" type="date" aria-label="Target submission date" min="0001-01-01" max="9999-12-31" value={draft.targetSubmissionDate} disabled={!editable} aria-describedby={`${prefix}-date-help`} onChange={event => change('targetSubmissionDate', event.target.value)} />
      <span className="npw-field-help" id={`${prefix}-date-help`}>Recorded target only. Replanning milestones is a separate action.</span></label>
  </div>;
}
