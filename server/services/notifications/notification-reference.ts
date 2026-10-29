import { NOTICE_UUID, noticePositiveId, noticeTaskId, noticeThreadId } from '../../../shared/types/notification-navigation';
import { SUBMISSION_WORKSPACES } from '../../../shared/types/submission-ui';

export interface NotificationResourceReference {
  resource_type: string | null; resource_id: string | null; action_url: string | null;
}
export interface RecordReference {
  kind: 'report_run' | 'unified_task' | 'authoring_document' | 'project' | 'regulatory_program' | 'submission' | 'ectd_sequence' | 'gateway_transmittal' | 'protocol_document' | 'qms_document' | 'chat_thread' | 'canonical_document';
  id: string; sectionId?: string; submissionId?: string; workspace?: string;
}
function nativeReference(kind: string, id: string): RecordReference | null {
  if (kind === 'unified_task') return noticeTaskId(id) ? { kind,id } : null;
  // An AnA conversation (a detached turn's notice, AnA detach §5.5).
  if (kind === 'chat_thread') return noticeThreadId(id) ? { kind,id } : null;
  if (kind === 'authoring_document') {
    const parts = id.split(':');
    return parts.length <= 2 && parts.every(part => NOTICE_UUID.test(part))
      ? { kind,id:parts[0],...(parts[1] ? {sectionId:parts[1]} : {}) } : null;
  }
  if (kind === 'regulatory_program') return NOTICE_UUID.test(id) ? { kind,id } : null;
  // A lifecycle record (a Vault version's review and approval, RR1b).
  if (kind === 'canonical_document') return NOTICE_UUID.test(id) ? { kind,id } : null;
  if (!noticePositiveId(id)) return null;
  const kinds = ['report_run','project','submission','ectd_sequence','gateway_transmittal','protocol_document','qms_document'];
  return kinds.includes(kind) ? { kind: kind as RecordReference['kind'],id } : null;
}

/** A recorded URL supplies only a typed native ID; its program/redirect hints are ignored. */
type ReadParam = (key: string) => string;
function authoringUrl(get: ReadParam): RecordReference | null {
  // A stored code hint has no proven canonical section identity. Never open a different/default section.
  if (get('sectionCode')) return null;
  const doc = nativeReference('authoring_document',get('documentId'));
  const section = get('sectionId');
  if (section && !NOTICE_UUID.test(section)) return null;
  return doc ? { ...doc,...(section ? {sectionId:section} : {}) } : null;
}
function submissionUrl(get: ReadParam): RecordReference | null {
  const submission = get('submissionId'); const sequence = get('sequenceId');
  if (submission && !noticePositiveId(submission)) return null;
  const result = sequence ? nativeReference('ectd_sequence',sequence) : nativeReference('submission',submission);
  const ws = get('ws');
  return result ? { ...result,...(sequence && submission ? { submissionId:submission } : {}),
    ...(ws && SUBMISSION_WORKSPACES.some(workspace=>workspace.id===ws) ? {workspace:ws} : {}) } : null;
}
const urlReaders: Record<string, (get: ReadParam) => RecordReference | null> = {
  '/concept2cure/insights': get => nativeReference('report_run',get('reportRunId')),
  '/concept2cure/tasks': get => nativeReference('unified_task',get('taskId')),
  '/concept2cure/document-authoring': authoringUrl,
  '/concept2cure/project-home': get => nativeReference('regulatory_program',get('program')),
  '/concept2cure/submission-center': submissionUrl,
  '/concept2cure/gateway-transmittals': get => nativeReference('gateway_transmittal',get('transmittalId')),
  '/concept2cure/protocol-dev': get => nativeReference('protocol_document',get('protocol') || get('protocolId')),
  '/concept2cure/quality': get => nativeReference('qms_document',get('qmsDocumentId')),
};
function urlReference(raw: string | null): RecordReference | null {
  if (!raw?.startsWith('/concept2cure/') || /[\s\\]/.test(raw) || [...raw].some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)) return null;
  let url: URL;
  try { url = new URL(raw,'https://notification.invalid'); } catch { return null; }
  if (url.origin !== 'https://notification.invalid') return null;
  const get = (key: string): string => url.searchParams.getAll(key).length === 1 ? url.searchParams.get(key)! : '';
  return Object.hasOwn(urlReaders,url.pathname) ? urlReaders[url.pathname](get) : null;
}

/** Declared resource provenance wins; a contradictory/unknown family never falls back to another store. */
export function notificationRecordReference(resource: NotificationResourceReference): RecordReference | null {
  if (resource.resource_type) return nativeReference(resource.resource_type,resource.resource_id ?? '');
  return urlReference(resource.action_url);
}
