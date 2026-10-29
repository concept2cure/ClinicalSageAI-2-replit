import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { surfaceIdFromLocation } from './routing';
import { noticeTaskId, noticeThreadId } from '@shared/types/notification-navigation';

export interface NoticeResource {
  resource_type?: string | null;
  resource_id?: string | number | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface NoticeTarget { surface: string; label: string; params?: Record<string, string>; }
const registered = new Set(UI_SURFACES.map(surface => surface.id));
const positiveId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
const taskId = (id: string) => noticeTaskId(id);

/** A label hint only. Actual navigation must use the authenticated notification-ID resolver. */
/** The label hint for a notice that names its record by type and id; undefined for a type with none here. */
const RESOURCE_TARGETS: Readonly<Record<string, (id: string) => NoticeTarget | null>> = {
  report_run: id => (positiveId(id) ? { surface: `insights?reportRunId=${id}`, label: 'Open saved report' } : null),
  // A review route member's task opens its version (the server resolves it, RR1b).
  unified_task: id => (taskId(id) ? (id.startsWith('ROUTE-') ? { surface: 'vault', label: 'Open the version in the Vault' } : { surface: 'tasks', label: 'Open task', params: { taskId: id } }) : null),
  // A detached AnA turn's notice names its conversation (AnA detach §5.5).
  chat_thread: id => (noticeThreadId(id) ? { surface: 'conversation-thread', label: 'Open conversation', params: { threadId: id } } : null),
};

export function notificationTarget(notice: NoticeResource): NoticeTarget | null {
  const byResource = notice.resource_type && Object.hasOwn(RESOURCE_TARGETS, notice.resource_type)
    ? RESOURCE_TARGETS[notice.resource_type]
    : undefined;
  if (byResource) return byResource(String(notice.resource_id ?? ''));
  const path = notice.action_url;
  if (!path?.startsWith('/concept2cure/') || path.includes('\\')) return null;
  let url: URL;
  try { url = new URL(path, 'https://notification.invalid'); } catch { return null; }
  if (url.origin !== 'https://notification.invalid' || !url.pathname.startsWith('/concept2cure/')) return null;
  const surface = surfaceIdFromLocation(url.pathname);
  if (!registered.has(surface)) return null;
  // Keep only the parameters current destinations consume; generic URLs may
  // open a surface but cannot smuggle an external redirect or arbitrary action.
  const params = safeLinkedRecordParams(url);
  return { surface, label: 'Open linked record', ...(Object.keys(params).length ? { params } : {}) };
}

function safeLinkedRecordParams(url: URL): Record<string, string> {
  const params: Record<string,string> = {};
  for (const key of ['submissionId','sequenceId','transmittalId','taskId','documentId','sectionId','protocolId']) {
    const value = url.searchParams.get(key);
    if (value && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) params[key] = value;
  }
  return params;
}
