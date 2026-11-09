import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuthUser, type AuthUser } from '@/services/portal/authService';
import { useTenant } from '@/contexts/TenantContext';
import { projectSharingId } from '@shared/project-sharing';
import { isProjectSettingsPatch, PROJECT_SETTINGS_FIELDS, type ProjectSettingsData, type ProjectSettingsPatch, type ProjectSettingsScope, type ProjectSettingsWrite } from '@shared/project-settings';
import { GOVERNED_REASON_MIN, GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
import { GovernedConfirmDialog } from '../../_shared/components/GovernedConfirmDialog';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { captureShellProjectGuard, shellProgramId, useShellProject } from '../shellProject';
import { projectSettingsHeaders, requestProjectArchive, requestProjectSettings } from './projectSettingsRequest';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import '../styles/project-settings.css';

/** A request to open the drawer, focused on one field once it renders: a change of `n` opens it (D3.md §4.9). */
export interface ProjectSettingsRequest { n: number; focus?: 'description' | 'priority' | 'targetSubmissionDate' }
interface Props { programId: string; onSaved: () => void; request?: ProjectSettingsRequest }
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
  const afterRefusal = s.blocked;
  s.setSaved(answer.envelope.data); s.setDraft(draftOf(answer.envelope.data)); s.setBlocked(false);
  /* Said only when it means something: after a save that could not be confirmed, a reload shows what is saved but does
     not confirm that save. Opening the settings said it too, to a tester who had saved nothing (human test J1). */
  s.setNote(afterRefusal ? { error: false, text: 'Current saved settings loaded. This read does not confirm an earlier uncertain save or audit.' } : null);
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
/** Opens the drawer when the page asks (About's "Edit"), then focuses the asked field once the saved settings
 *  have been read and the fields render. A request seen at mount is not acted on: only a change of `n` opens. */
function useSettingsRequest(request: ProjectSettingsRequest | undefined, s: State, prefix: string, toggle: () => void) {
  const seen = useRef(request?.n ?? 0);
  const wanted = useRef<ProjectSettingsRequest['focus'] | null>(null);
  const n = request?.n ?? 0;
  useEffect(() => {
    if (n === seen.current) return;
    seen.current = n;
    wanted.current = request?.focus ?? null;
    if (!s.open) toggle();
  }); /* no dependency list: it runs each render and acts only on a change of n, guarded by `seen` */
  useEffect(() => {
    const field = wanted.current;
    if (!field || !s.open || s.loading || !s.draft) return;
    const element = document.getElementById(`${prefix}-${field}`);
    if (element) { element.focus(); wanted.current = null; }
  });
}
function SettingsSession({ scope, isCurrent, onSaved, request }: Props & { scope: ProjectSettingsScope; isCurrent: () => boolean }) {
  const s = useSettingsState(); const prefix = useId();
  const { mounted } = s;
  const visit = useMemo(() => captureShellProjectGuard(), []);
  const live = useRef(isCurrent); live.current = isCurrent;
  const current = useCallback(() => mounted.current && visit() && live.current(), [mounted, visit]);
  const context: Context = { state: s, scope, current, onSaved };
  const close = () => { if (!s.pending.current) s.setOpen(false); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [mounted]);
  /* Escape and focus are the drawer's (useDialog, in SettingsPanel), handed to the
     governed confirm dialog while it is open; close() still refuses during a save. */
  const toggle = () => {
    if (s.pending.current || !retained(context)) return;
    if (s.open) close();
    else { s.setOpen(true); if (!s.blocked) void loadSettings(context); }
  };
  useSettingsRequest(request, s, prefix, toggle);
  const patch = diff(s.saved, s.draft);
  const editable = s.saved?.canChange === true && !s.saving && !s.loading && !s.blocked;
  if (s.retired) return <p className="pj-settings-note" role="status">{RETIRED}</p>;
  const archive = s.saved?.canChange === true
    ? <ArchiveControl scope={scope} current={current} disabled={!editable} onArchived={onSaved} />
    : null;
  return <div className="pj-settings">
    {/* D3 (2026-11-06, D3.md §4.9): an icon button beside the project's name that opens a drawer, not a
        full-width panel pushing the page down. */}
    <button type="button" className="btn ghost pj-settings-btn" onClick={toggle} aria-expanded={s.open} aria-controls={`${prefix}-panel`}
      aria-haspopup="dialog" aria-label="Project settings" title="Project settings" disabled={s.saving}>{I.settings}</button>
    {s.open && <SettingsPanel state={s} prefix={prefix} editable={editable} patch={patch} onClose={close} archive={archive}
      onReload={() => void loadSettings(context)} onReview={() => { if (retained(context)) s.setReview(patch); }} />}
    <GovernedConfirmDialog open={!!s.review && !s.retired} action="Save project settings" target={settingsReviewTarget(s.review)} minReason={GOVERNED_REASON_MIN}
      submitError={s.note?.error ? s.note.text : null}
      onCancel={() => { if (!s.pending.current) s.setReview(null); }} onConfirm={({ reason }) => saveSettings(context, reason)} />
  </div>;
}
function SettingsPanel({ state: s, prefix, editable, patch, archive, onClose, onReload, onReview }: {
  state: State; prefix: string; editable: boolean; patch: ProjectSettingsPatch; archive: React.ReactNode;
  onClose: () => void; onReload: () => void; onReview: () => void;
}) {
  /* D0's drawer (.de-bd / .de): focus on open, Tab kept inside, Escape closes, focus back to the button on
     close; while the governed confirm dialog is open the drawer releases both to it. */
  const dialogRef = useDialog(onClose, !s.review);
  return <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="de pj-settings-panel" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
      aria-labelledby={`${prefix}-h`} id={`${prefix}-panel`}>
      <div className="de-h">
        <div><div className="de-h-eye">Project</div><div className="de-h-t" id={`${prefix}-h`}>Project settings</div></div>
        <button type="button" className="de-x" onClick={onClose} disabled={s.saving} aria-label="Close settings">{I.close}</button>
      </div>
      <div className="de-body">
        {s.loading && <p role="status">Reading current project settings…</p>}
        {s.saved && s.draft && <SettingsFields state={s} editable={editable} prefix={prefix} />}
        {s.note && <p className="pj-settings-note" role={s.note.error ? 'alert' : 'status'}>{s.note.text}</p>}
        {!s.loading && s.saved && archive}
      </div>
      {!s.loading && <div className="de-f pj-settings-actions">
        <button type="button" className="btn ghost" disabled={s.saving} onClick={onReload}>Reload saved settings</button>
        {s.saved?.canChange && <button type="button" className="btn primary" disabled={!editable || !isProjectSettingsPatch(patch)} onClick={onReview}>Review settings change</button>}
      </div>}
    </div>
  </div>;
}

/* ── Archive (2026-10-31) ─────────────────────────────────────────────────────
   A project could be created and worked, never closed from its own page: the
   close-out route (POST /api/c2c/projects/:id/archive) had no caller. It is
   reached here, by someone who may change the project, after the governed
   confirmation every project change takes (a reason and a typed word). The
   route keeps the record and writes the audit row; the list stops showing the
   project and it takes no new market. */
const ARCHIVE_WORDS = 'An archived project leaves the project list and takes no new market. Its documents and records are kept.';
function ArchiveControl({ scope, current, disabled, onArchived }: {
  scope: ProjectSettingsScope; current: () => boolean; disabled: boolean; onArchived: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [archived, setArchived] = useState(false);
  const confirm = async ({ reason }: { reason: string }) => {
    if (!validReason(reason)) { setNote({ error: true, text: `Use a reason between ${GOVERNED_REASON_MIN} and ${GOVERNED_REASON_MAX} characters.` }); return; }
    const answer = await requestProjectArchive(scope, current, reason.trim());
    setConfirming(false);
    if (answer.kind !== 'archived') { setNote({ error: true, text: answer.message }); return; }
    setArchived(true);
    setNote({ error: false, text: 'Project archived. The archive is recorded in the project’s audit trail.' });
    onArchived();
  };
  return <div className="pj-settings-archive">
    <h3>Archive this project</h3>
    <p className="pj-settings-note">{ARCHIVE_WORDS}</p>
    {!archived && <button className="btn ghost" disabled={disabled || confirming} onClick={() => { setNote(null); setConfirming(true); }}>Archive project</button>}
    {note && <p className="pj-settings-note" role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    <GovernedConfirmDialog open={confirming} action="Archive project" target="Current project · archived, records kept"
      minReason={GOVERNED_REASON_MIN} confirmWord="archive" submitError={note?.error ? note.text : null}
      onCancel={() => setConfirming(false)} onConfirm={confirm} />
  </div>;
}
function SettingsFields({ state: s, editable, prefix }: { state: State; editable: boolean; prefix: string }) {
  const draft = s.draft!;
  const change = (field: keyof Draft, value: string) => s.setDraft(previous => previous ? { ...previous, [field]: value } : previous);
  return <div className="npw-fields">
    {!s.saved?.canChange && <p className="pj-settings-note npw-field-wide">Your current project permissions allow reading these settings. Editing is unavailable.</p>}
    <label className="npw-field npw-field-wide"><span className="npw-field-l">Project description</span>
      <textarea id={`${prefix}-description`} className="c2c-input" value={draft.description} rows={3} maxLength={4000} disabled={!editable} onChange={event => change('description', event.target.value)} /></label>
    <label className="npw-field"><span className="npw-field-l">Project priority</span><select id={`${prefix}-priority`} className="c2c-input" value={draft.priority} disabled={!editable} onChange={event => change('priority', event.target.value)}>
      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
    </select></label>
    <label className="npw-field"><span className="npw-field-l">Target submission date</span><input id={`${prefix}-targetSubmissionDate`} className="c2c-input" type="date" aria-label="Target submission date" min="0001-01-01" max="9999-12-31" value={draft.targetSubmissionDate} disabled={!editable} aria-describedby={`${prefix}-date-help`} onChange={event => change('targetSubmissionDate', event.target.value)} />
      <span className="npw-field-help" id={`${prefix}-date-help`}>Recorded target only. Replanning milestones is a separate action.</span></label>
  </div>;
}
