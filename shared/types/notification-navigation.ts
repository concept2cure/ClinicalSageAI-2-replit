/** Navigation conveys verified record identity; it never grants object access. */
import { SUBMISSION_WORKSPACES } from './submission-ui';
export type NotificationTargetSurface = 'insights' | 'tasks' | 'document-authoring' | 'project-home' | 'submission-center' | 'gateway-transmittals' | 'protocol-dev' | 'quality' | 'conversation-thread';
export interface NotificationRecordTarget {
  surface: NotificationTargetSurface;
  label: string;
  params: Record<string, string>;
  /** Explicit null is unfiled/organization context, never the previously open program. */
  programId: string | null;
}
export const NOTICE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const noticePositiveId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2_147_483_647;
export const noticeTaskId = (value: unknown): value is string => typeof value === 'string' && /^TASK-[A-Za-z0-9_-]{1,120}$/.test(value);
/** An AnA conversation's id, as its address carries it (client v2/routing.ts). */
export const noticeThreadId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
export const noticeSafeSectionCode = (value: string): boolean => value.length > 0 && value.length <= 128
  && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);

const allowedKeys: Record<NotificationTargetSurface, readonly string[]> = {
  insights: ['reportRunId'], tasks: ['taskId'], 'document-authoring': ['documentId', 'sectionCode'],
  'project-home': [], 'submission-center': ['submissionId', 'sequenceId', 'ws'],
  'gateway-transmittals': ['transmittalId'], 'protocol-dev': ['protocol', 'protocolScope'], quality: ['qmsDocumentId'],
  'conversation-thread': ['threadId'],
};
const validParams: Record<NotificationTargetSurface, (p: Record<string, string>) => boolean> = {
  insights: p => noticePositiveId(p.reportRunId),
  tasks: p => noticeTaskId(p.taskId),
  'document-authoring': p => typeof p.documentId === 'string' && NOTICE_UUID.test(p.documentId)
    && (p.sectionCode === undefined || noticeSafeSectionCode(p.sectionCode)),
  'project-home': () => true,
  'submission-center': p => noticePositiveId(p.submissionId) && (p.sequenceId === undefined || noticePositiveId(p.sequenceId))
    && (p.ws === undefined || SUBMISSION_WORKSPACES.some(workspace => workspace.id === p.ws)),
  'gateway-transmittals': p => noticePositiveId(p.transmittalId),
  'protocol-dev': p => noticePositiveId(p.protocol) && (p.protocolScope === undefined || p.protocolScope === 'unfiled'),
  quality: p => noticePositiveId(p.qmsDocumentId),
  'conversation-thread': p => noticeThreadId(p.threadId),
};
function validEnvelope(v: Partial<NotificationRecordTarget>): boolean {
  if (v.programId !== null && (typeof v.programId !== 'string' || !NOTICE_UUID.test(v.programId))) return false;
  if (typeof v.label !== 'string' || !v.label.trim() || v.label.length > 100) return false;
  return !!v.params && typeof v.params === 'object' && !Array.isArray(v.params)
    && Object.values(v.params).every(item => typeof item === 'string');
}

/** Strict response shape; unknown parameters cannot become an action or redirect. */
export function isNotificationRecordTarget(value: unknown): value is NotificationRecordTarget {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<NotificationRecordTarget>;
  if (!validEnvelope(v) || !v.params) return false;
  if (!v.surface || !Object.hasOwn(allowedKeys, v.surface)) return false;
  if (v.surface === 'project-home' && v.programId === null) return false;
  return Object.keys(v.params).every(key => allowedKeys[v.surface!].includes(key)) && validParams[v.surface](v.params);
}
