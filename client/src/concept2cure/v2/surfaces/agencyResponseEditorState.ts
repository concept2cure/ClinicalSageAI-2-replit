/** Strict response identity boundary for the register's saved-editor preview. */
export interface EditorResponseCopy {
  documentId: string; sectionId: string; sha256: string; updatedAt: string;
  sourceRevision: number; ready: boolean; refusal: string | null; text: string | null;
}
export interface ResponseEditorRead {
  programId: string | null; currentRevision: number; copies: EditorResponseCopy[]; unavailableReason?: string;
  source: { kind: 'agency-response'; eventId: string; questionId: number };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function copyIdentity(copy: EditorResponseCopy): boolean {
  return typeof copy.documentId === 'string' && UUID.test(copy.documentId)
    && typeof copy.sectionId === 'string' && UUID.test(copy.sectionId)
    && typeof copy.sha256 === 'string' && /^[a-f0-9]{64}$/.test(copy.sha256)
    && typeof copy.updatedAt === 'string' && Number.isFinite(Date.parse(copy.updatedAt));
}
function copyState(copy: EditorResponseCopy): boolean {
  return copy.ready ? typeof copy.text === 'string' && copy.text.length <= 100000 && copy.refusal === null
    : copy.text === null && typeof copy.refusal === 'string';
}
function validCopy(raw: unknown): raw is EditorResponseCopy {
  if (!raw || typeof raw !== 'object') return false;
  const copy = raw as EditorResponseCopy;
  return copyIdentity(copy) && revision(copy.sourceRevision) && typeof copy.ready === 'boolean' && copyState(copy);
}
function sameQuestion(data: ResponseEditorRead, eventId: string, questionId: number): boolean {
  return data.source?.kind === 'agency-response' && data.source.eventId === eventId && data.source.questionId === questionId;
}
function validReadCopies(data: ResponseEditorRead): boolean {
  if (!Array.isArray(data.copies) || data.copies.length > 20 || !data.copies.every(validCopy)) return false;
  if (data.copies.some(copy => copy.ready && copy.sourceRevision !== data.currentRevision)) return false;
  return new Set(data.copies.map(copy => copy.sectionId)).size === data.copies.length;
}
function validReadContext(data: ResponseEditorRead): boolean {
  return (data.programId === null || typeof data.programId === 'string' && UUID.test(data.programId))
    && (data.unavailableReason === undefined || typeof data.unavailableReason === 'string');
}
export function readResponseEditor(raw: unknown, eventId: string, questionId: number): ResponseEditorRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { success?: unknown; data?: ResponseEditorRead };
  const data = value.data;
  if (value.success !== true || !data || !sameQuestion(data, eventId, questionId) || !revision(data.currentRevision)) return null;
  return validReadContext(data) && validReadCopies(data) ? data : null;
}
