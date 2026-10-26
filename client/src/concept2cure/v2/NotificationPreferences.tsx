import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, type NotificationCategory } from '@shared/constants/notifications';
import { capturedActorHeaders, getAuthToken } from '@/utils/authToken';
import { redactInternals } from '@/lib/queryClient';
import { liveGetOrNull } from './dataConnect';
import { apiCall, apiErrorText, type ApiResult } from './apiCall';
import { useDialog } from './useDialog';
import type { TaskActorScope } from './taskTarget';

export const NOTIFICATION_PREFERENCES_CHANGED = 'c2c:notification-preferences-changed';
const PATH = '/api/mdx/notification-subscriptions';
const SESSION_CHANGED = 'Your signed-in account or organization changed. Reload notification choices before continuing.';
interface Preference { category: NotificationCategory; in_app_enabled: boolean; }

function isPreferenceRows(value: unknown): value is Preference[] {
  return Array.isArray(value) && value.every(row => row && typeof row === 'object'
    && NOTIFICATION_CATEGORIES.includes(row.category) && typeof row.in_app_enabled === 'boolean')
    && new Set(value.map(row => row.category)).size === value.length;
}
function confirmsPreference(body: unknown, scope: TaskActorScope, category: NotificationCategory, enabled: boolean) {
  if ((body as { success?: unknown } | null)?.success === false) return false;
  const row = (body as { data?: unknown } | null)?.data as Record<string, unknown> | null;
  return row?.organization_id === Number(scope.organizationId) && row.user_id === Number(scope.userId)
    && row.category === category && row.in_app_enabled === enabled;
}
function changed(scope: TaskActorScope) {
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFERENCES_CHANGED, { detail: scope }));
}

function preferenceError(failure: unknown, fallback: string) {
  return redactInternals(failure instanceof Error ? failure.message : null, fallback);
}
function preferenceSaveFailure(result: ApiResult<unknown>) {
  return result.ok ? 'The server did not confirm the preference change. Review your saved choices before trying again.'
    : apiErrorText(result, 'The preference change could not be confirmed. Review your saved choices before trying again.');
}

function useNotificationPreferenceSettings(scope: TaskActorScope, onSaved?: () => void) {
  const [rows, setRows] = useState<Preference[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const capture = useCallback(() => {
    const headers = capturedActorHeaders({ userId: Number(scope.userId), organizationId: Number(scope.organizationId) });
    return { headers, current: () => mounted.current && headers.Authorization === `Bearer ${getAuthToken()}` };
  }, [scope.userId, scope.organizationId]);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setError(null); setRows(null);
    try {
      const owner = capture();
      const reply = await liveGetOrNull<Preference[]>(PATH, isPreferenceRows, owner.headers);
      if (!mounted.current || ticket !== generation.current) return false;
      if (!owner.current()) throw new Error(SESSION_CHANGED);
      if (reply.error || reply.data == null || reply.meta?.pendingStore === true) throw new Error('Your notification choices could not be read. Please retry.');
      setRows(reply.data);
      return true;
    } catch (failure) {
      if (mounted.current && ticket === generation.current) setError(preferenceError(failure, 'Your notification choices could not be read.'));
      return false;
    } finally { if (mounted.current && ticket === generation.current) setLoading(false); }
  }, [capture]);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; generation.current += 1; };
  }, [load]);
  const ready = !loading && rows !== null;
  const save = async (category: NotificationCategory, enabled: boolean) => {
    if (pending.current || !ready) return;
    pending.current = true; setSaving(category); setError(null); setNote(null);
    try {
      const owner = capture();
      const result = await apiCall('PUT', `${PATH}/${category}`, { inAppEnabled: enabled }, owner.current, owner.headers);
      if (!mounted.current) return;
      if (!owner.current() || !result) throw new Error(SESSION_CHANGED);
      if (!result.ok || !confirmsPreference(result.body, scope, category, enabled)) {
        const message = preferenceSaveFailure(result);
        if (await load()) { if (owner.current()) changed(scope); }
        if (owner.current()) setError(message);
        return;
      }
      setNote('Notification choice saved.');
      changed(scope); onSaved?.();
      await load();
    } catch (failure) {
      if (mounted.current) {
        setRows(null);
        setError(preferenceError(failure, 'The preference could not be confirmed. Reload before trying again.'));
      }
    } finally { pending.current = false; if (mounted.current) setSaving(null); }
  };
  return { rows, loading, saving, error, note, save, reload: () => { if (!pending.current) { setNote(null); void load(); } } };
}

/** One controls owner for Account setup and the existing inbox preferences dialog. */
export function NotificationPreferenceSettings(props: { scope: TaskActorScope; onSaved?: () => void }) {
  return <PreferenceControls key={`${props.scope.userId}:${props.scope.organizationId}`} {...props} />;
}
function PreferenceControls({ scope, onSaved }: { scope: TaskActorScope; onSaved?: () => void }) {
  const settings = useNotificationPreferenceSettings(scope, onSaved);
  const root = useRef<HTMLDivElement>(null);
  const lastChoice = useRef<NotificationCategory | null>(null);
  useEffect(() => {
    if (!settings.loading && settings.saving === null && lastChoice.current && document.activeElement === document.body) {
      root.current?.querySelector<HTMLInputElement>(`[data-notification-category="${lastChoice.current}"]`)?.focus();
    }
  }, [settings.loading, settings.saving, settings.rows]);
  return <div ref={root}>
    <p className="de-desc">Choose which in-app alerts appear for this organization. Alerts are shown by default. Email and push alerts are not available.</p>
    {settings.error && <p className="de-desc" role="alert">{settings.error}</p>}
    {settings.note && <p className="de-desc" role="status">{settings.note}</p>}
    {settings.loading ? <p className="de-desc" role="status">Loading notification choices…</p> : settings.rows === null
      ? <button type="button" className="de-btn ghost" onClick={settings.reload} disabled={settings.saving !== null}>Retry</button>
      : NOTIFICATION_CATEGORIES.map(category => {
        const enabled = settings.rows!.find(row => row.category === category)?.in_app_enabled ?? true;
        return <label className="tt-item" key={category}><span className="tt-item-body">{NOTIFICATION_CATEGORY_LABELS[category]}</span>
          <input type="checkbox" data-notification-category={category} checked={enabled} disabled={settings.saving !== null}
            onChange={event => { lastChoice.current = category; void settings.save(category, event.target.checked); }} />
        </label>;
      })}
    {settings.saving && <p className="de-desc" role="status">Saving notification choice…</p>}
  </div>;
}

export function NotificationPreferences({ scope, onClose, onSaved }: { scope: TaskActorScope; onClose: () => void; onSaved?: () => void }) {
  const ref = useDialog(onClose);
  return <><div className="tt-scrim" onClick={onClose}/><aside ref={ref} className="tt-panel" role="dialog" aria-modal="true" aria-label="Notification preferences" tabIndex={-1}>
    <div className="tt-head"><b>Notification preferences</b><button className="tt-close" onClick={onClose} aria-label="Close notification preferences">Close</button></div>
    <div className="tt-scroll"><NotificationPreferenceSettings scope={scope} onSaved={onSaved} /></div>
  </aside></>;
}

export function NotificationPreferenceAccountSection({ scope }: { scope: TaskActorScope }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <section aria-label="In-app notifications">
    <h3 className="de-h-eye">In-app notifications</h3>
    <p className="de-desc">Set your alert choices for the current organization.</p>
    <button type="button" className="de-btn ghost" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>
      {open ? 'Close notification choices' : 'Open notification choices'}
    </button>
    <div id={contentId} hidden={!open}>{open && <NotificationPreferenceSettings scope={scope} />}</div>
  </section>;
}
