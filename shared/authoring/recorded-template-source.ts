/** Recorded scaffold identity, shared by saved review and the existing editor. */
export interface RecordedTemplateFilingContext {
  registryId: string | null;
  region: 'US' | 'CA' | 'EU' | 'JP' | 'GLOBAL';
  agency: string;
}

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
  filingContext?: RecordedTemplateFilingContext;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Recorded scope is validated as recorded data, not replaced by today's registry. */
export function parseRecordedTemplateFilingContext(raw: unknown, entryId: unknown): RecordedTemplateFilingContext | undefined {
  if (raw === undefined) {
    if (typeof entryId === 'string' && /^(registry|component):/.test(entryId)) throw new Error('Recorded regional template context is missing.');
    return undefined;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Recorded template filing context is malformed.');
  const context = raw as Record<string, unknown>;
  if (!(context.registryId === null || nonempty(context.registryId)) || !nonempty(context.agency) ||
      typeof context.region !== 'string' || !['US', 'CA', 'EU', 'JP', 'GLOBAL'].includes(context.region)) {
    throw new Error('Recorded template filing context fields could not be verified.');
  }
  const matchesEntry = context.registryId === null
    ? typeof entryId === 'string' && /^component:.+/.test(entryId)
    : entryId === `registry:${context.registryId}`;
  if (!matchesEntry) throw new Error('Recorded filing context conflicts with its template entry identity.');
  return { registryId: context.registryId as string | null,
    region: context.region as RecordedTemplateFilingContext['region'], agency: context.agency };
}

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
  const filingContext = parseRecordedTemplateFilingContext(source.filingContext, source.entryId);
  const recorded = rawSource as RecordedTemplateSource;
  return { id: recorded.id, entryId: recorded.entryId, version: recorded.version, sha256: recorded.sha256,
    kind: recorded.kind, aiDraftable: recorded.aiDraftable, authoringMode: recorded.authoringMode,
    originalFormat: recorded.originalFormat, limitations: [...recorded.limitations], ...(filingContext ? { filingContext } : {}) };
}
