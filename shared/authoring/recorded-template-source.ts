/** Recorded scaffold identity, shared by saved review and the existing editor. */
export interface RecordedTemplateSource {
  id: string;
  entryId: string;
  version: number;
  sha256: string;
  kind: 'narrative' | 'preparation';
  aiDraftable: boolean;
  authoringMode: string;
  originalFormat: string;
  limitations: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function validIdentity(source: Record<string, unknown>, templateId: unknown): boolean {
  return typeof templateId === 'string' && UUID.test(templateId) && source.id === templateId &&
    nonempty(source.entryId) && typeof source.version === 'number' && Number.isSafeInteger(source.version) && source.version > 0 &&
    typeof source.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(source.sha256);
}

function validDetails(source: Record<string, unknown>): boolean {
  return (source.kind === 'narrative' || source.kind === 'preparation') && typeof source.aiDraftable === 'boolean' &&
    nonempty(source.authoringMode) && nonempty(source.originalFormat) && Array.isArray(source.limitations) && source.limitations.every(nonempty);
}

/** Absence is honest; a present partial, malformed or mismatched source is an error. */
export function parseRecordedTemplateSource(rawSource: unknown, templateId: unknown): RecordedTemplateSource | null {
  if (rawSource === undefined || rawSource === null) return null;
  if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) throw new Error('Recorded template source is malformed.');
  const source = rawSource as Record<string, unknown>;
  if (!validIdentity(source, templateId) || !validDetails(source)) throw new Error('Recorded template source identity or fields could not be verified.');
  const recorded = rawSource as RecordedTemplateSource;
  return { id: recorded.id, entryId: recorded.entryId, version: recorded.version, sha256: recorded.sha256,
    kind: recorded.kind, aiDraftable: recorded.aiDraftable, authoringMode: recorded.authoringMode,
    originalFormat: recorded.originalFormat, limitations: [...recorded.limitations] };
}
