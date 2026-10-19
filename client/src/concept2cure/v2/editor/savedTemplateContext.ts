import { parseRecordedTemplateSource, type RecordedTemplateSource } from '@shared/authoring/recorded-template-source';

export interface SavedTemplateContext {
  documentId: string;
  templateId: string | null;
  templateSourceState: 'recorded' | 'not-recorded' | 'unavailable';
  templateSource?: RecordedTemplateSource;
}

/** Display/handoff context only; AnA's saved review re-reads authoritative records. */
export function readSavedTemplateContext(documentId: string, document: { template_id?: unknown; provenance?: unknown }): SavedTemplateContext {
  const templateId = typeof document.template_id === 'string' ? document.template_id : null;
  const provenance = document.provenance && typeof document.provenance === 'object'
    ? document.provenance as Record<string, unknown> : null;
  try {
    const templateSource = parseRecordedTemplateSource(provenance?.templateSource, templateId);
    return { documentId, templateId, templateSourceState: templateSource ? 'recorded' : 'not-recorded',
      ...(templateSource ? { templateSource } : {}) };
  } catch {
    return { documentId, templateId, templateSourceState: 'unavailable' };
  }
}

/** Long limits are read completely through saved-review paging, never silently clipped. */
export function savedTemplateFacts(context: SavedTemplateContext | null, documentId: string | null): Record<string, unknown> {
  if (!context || context.documentId !== documentId) return {};
  if (!context.templateId && context.templateSourceState === 'not-recorded') return {};
  const source = context.templateSource;
  const { limitations, ...identity } = source ?? { limitations: [] };
  const boundedIdentity = source && JSON.stringify(identity).length > 2000 ? {
    id: source.id, version: source.version, sha256: source.sha256, kind: source.kind,
    aiDraftable: source.aiDraftable, sourceFieldsOmitted: true,
  } : identity;
  const templateSource = source && JSON.stringify(source).length <= 3000 ? source : source ? {
    ...boundedIdentity, limitationCount: limitations.length, limitationsOmitted: true,
    instruction: 'Read every saved critique_document reference page for the complete recorded source and limits.',
  } : undefined;
  return { templateId: context.templateId, templateSourceState: context.templateSourceState,
    ...(templateSource ? { templateSource } : {}) };
}
