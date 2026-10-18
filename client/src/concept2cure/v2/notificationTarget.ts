import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { surfaceIdFromLocation } from './routing';

export interface NoticeResource {
  resource_type?: string | null;
  resource_id?: string | number | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
}
export interface NoticeTarget { surface: string; label: string; params?: Record<string, string>; }
const registered = new Set(UI_SURFACES.map(surface => surface.id));
const positiveId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
const taskId = (id: string) => /^TASK-[A-Za-z0-9_-]{1,120}$/.test(id);

/** A label hint only. Actual navigation must use the authenticated notification-ID resolver. */
export function notificationTarget(notice: NoticeResource): NoticeTarget | null {
  const id = String(notice.resource_id ?? '');
  if (notice.resource_type === 'report_run') {
    return positiveId(id) ? { surface: `insights?reportRunId=${id}`, label: 'Open saved report' } : null;
  }
  if (notice.resource_type === 'unified_task') {
    return taskId(id) ? { surface: 'tasks', label: 'Open task', params: { taskId: id } } : null;
  }
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
