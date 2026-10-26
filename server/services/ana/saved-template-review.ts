/** Bounded reference context for the existing authorized saved-document review. */
import { stableStringify } from '../../../shared/canonical-json';
import { parseRecordedTemplateFilingContext, parseRecordedTemplateSource, type RecordedTemplateSource } from '../../../shared/authoring/recorded-template-source';
import type { RequestSqlClient } from '../../db/requestDb';
import { templateGuidanceAfterAccess, type SavedTemplateGuidanceRead } from '../authoring/authoring-template-guidance';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_ITEMS = 20_000;
const PART_CHARS = 400;
const SOURCE_FIELDS = ['entryId', 'version', 'sha256', 'kind', 'aiDraftable', 'authoringMode', 'originalFormat', 'limitations'] as const;
const STRING_FIELDS = ['guidance_text', 'source_reference', 'guidance_note', 'drafting_mode'] as const;
const LIST_FIELDS = ['regulatory_references', 'compliance_checklist', 'common_pitfalls'] as const;
type SourceVerification = 'full-recorded' | 'identity-only';
type ReferenceFields = Record<string, string | string[]>;
interface SectionReference {
  sectionId: string;
  templateId: string;
  authority: SavedTemplateGuidanceRead['authority'];
  assembly?: Record<string, unknown>;
  state?: 'not-recorded';
  sourceVerification?: SourceVerification;
  source?: Record<string, unknown>;
  fields: ReferenceFields;
}
export interface SavedTemplateReview {
  template: { id: string | null; sourceState: 'recorded' | 'not-recorded'; kind?: RecordedTemplateSource['kind']; aiDraftable?: boolean };
  source: RecordedTemplateSource | null;
  references: SectionReference[];
  items: Array<Record<string, unknown>>;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
const bytes = (value: unknown) => Buffer.byteLength(stableStringify(value), 'utf8');
function boundedBytes(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_REFERENCE_BYTES) throw new Error('Saved template reference context exceeds 8 MiB.');
}

function sourceFieldValid(key: typeof SOURCE_FIELDS[number], value: unknown): boolean {
  if (key === 'version') return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (key === 'sha256') return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
  if (key === 'kind') return value === 'narrative' || value === 'preparation';
  if (key === 'aiDraftable') return typeof value === 'boolean';
  if (key === 'limitations') return Array.isArray(value) && value.every(nonempty);
  return nonempty(value);
}

function auditFilingContext(raw: Record<string, unknown>, source: RecordedTemplateSource | null): Record<string, unknown> {
  if (source?.filingContext && !('filingContext' in raw)) throw new Error('Saved section filing context is missing.');
  if (!('filingContext' in raw)) return {};
  const context = parseRecordedTemplateFilingContext(raw.filingContext, raw.entryId ?? source?.entryId);
  if (source && stableStringify(context) !== stableStringify(source.filingContext)) throw new Error('Saved section and document filing contexts conflict.');
  return { filingContext: context };
}

/** Historical audit sources may have identity only; never fill their missing fields. */
function auditSource(raw: unknown, templateId: string, source: RecordedTemplateSource | null) {
  if (!object(raw) || raw.id !== templateId) throw new Error('Saved section template identity is malformed or conflicting.');
  const supplied: Record<string, unknown> = { id: raw.id };
  for (const key of SOURCE_FIELDS) {
    if (!(key in raw)) continue;
    if (!sourceFieldValid(key, raw[key])) throw new Error('Saved section template source fields are malformed.');
    if (source && stableStringify(raw[key]) !== stableStringify(source[key])) throw new Error('Saved section and document template sources conflict.');
    supplied[key] = raw[key];
  }
  Object.assign(supplied, auditFilingContext(raw, source));
  const complete = SOURCE_FIELDS.every(key => key in raw);
  if (complete) parseRecordedTemplateSource(raw, templateId);
  return { source: supplied, sourceVerification: complete ? 'full-recorded' as const : 'identity-only' as const };
}

function referenceFields(row: Record<string, unknown>, authority: SavedTemplateGuidanceRead['authority']): ReferenceFields {
  const out: ReferenceFields = {};
  for (const key of STRING_FIELDS) {
    const value = row[key];
    if (value === undefined || (value === null && authority === 'current-reference')) continue;
    if (typeof value !== 'string') throw new Error('Saved template reference text is malformed.');
    out[key] = value;
  }
  for (const key of LIST_FIELDS) {
    const value = row[key];
    if (value === undefined || (value === null && authority === 'current-reference')) continue;
    if (!stringList(value)) throw new Error('Saved template reference list is malformed.');
    out[key] = value;
  }
  // These canonical tenant-template fields are JSON, not restricted text lists.
  for (const key of ['examples', 'ai_prompts']) {
    if (row[key] !== undefined && row[key] !== null) out[key] = stableStringify(row[key]);
  }
  return out;
}

const EARLIEST_CREATE = `SELECT DISTINCT ON (section_id) section_id::text, metadata
  FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND section_id=ANY($3::uuid[]) AND operation_type='CREATE'
  ORDER BY section_id, created_at, id`;

async function creationMetadata(q: RequestSqlClient, documentId: string, tenantId: number, sectionIds: string[]) {
  const params = [documentId, tenantId, sectionIds];
  const size = await q.query(`SELECT COALESCE(SUM(OCTET_LENGTH(COALESCE(metadata::text, ''))), 0)::bigint AS reference_bytes
    FROM (SELECT DISTINCT ON (section_id) section_id::text, metadata
      FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND section_id=ANY($3::uuid[]) AND operation_type='CREATE'
      ORDER BY section_id, created_at, id) earliest`, params);
  boundedBytes(Number(size.rows[0]?.reference_bytes));
  const result = await q.query(EARLIEST_CREATE, params);
  const out = new Map<string, unknown>();
  for (const row of result.rows) {
    if (typeof row.section_id !== 'string' || !sectionIds.includes(row.section_id) || out.has(row.section_id)) throw new Error('Saved template section reference identity is malformed.');
    out.set(row.section_id, row.metadata);
  }
  return out;
}

function partEnd(text: string, offset: number): number {
  let end = Math.min(text.length, offset + PART_CHARS);
  // Character offsets use UTF-16, as saved section windows do; never split a surrogate pair.
  if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
  return end;
}

function addItem(items: Array<Record<string, unknown>>, item: Record<string, unknown>): void {
  items.push(item);
  if (items.length > MAX_REFERENCE_ITEMS) throw new Error('Saved template reference context exceeds 20,000 items.');
}

function textParts(items: Array<Record<string, unknown>>, base: Record<string, unknown>, text: string): void {
  let offset = 0;
  do {
    const end = partEnd(text, offset);
    addItem(items, { kind: 'template-reference', ...base, partOffset: offset, nextPartOffset: end < text.length ? end : null,
      fieldTotalChars: text.length, text: text.slice(offset, end) });
    offset = end;
  } while (offset < text.length);
}

function sourceItems(items: Array<Record<string, unknown>>, source: RecordedTemplateSource, sectionId?: string): void {
  const { limitations, ...identity } = source;
  const item = { kind: 'template-source', templateId: source.id, ...(sectionId ? { sectionId } : {}),
    authority: 'recorded', source: identity, limitationCount: limitations.length };
  if (JSON.stringify(item).length > 2700) throw new Error('Saved template identity exceeds the review item budget.');
  addItem(items, item);
  limitations.forEach((text, itemIndex) => textParts(items, { templateId: source.id, sectionId: sectionId ?? null,
    authority: 'recorded', sourceVerification: 'full-recorded', field: 'limitations', itemIndex }, text));
}

function reviewItems(source: RecordedTemplateSource | null, references: SectionReference[]) {
  const items: Array<Record<string, unknown>> = [];
  if (source) sourceItems(items, source);
  references.forEach((reference, guideIndex) => {
    const { templateId, sectionId } = reference;
    if (reference.assembly) {
      const recorded = parseRecordedTemplateSource(reference.source, templateId);
      if (!recorded) throw new Error('The assembled section source could not be verified.');
      sourceItems(items, recorded, sectionId);
    }
    if (reference.state === 'not-recorded') {
      addItem(items, { kind: 'template-reference-gap', templateId, sectionId,
        authority: reference.authority, state: reference.state,
        message: 'No recorded or current template guidance is available for this saved section.' });
    }
    for (const [field, value] of Object.entries(reference.fields)) {
      const entries = Array.isArray(value) ? value : [value];
      entries.forEach((text, itemIndex) => textParts(items, { templateId, sectionId,
        authority: reference.authority, ...(reference.sourceVerification ? { sourceVerification: reference.sourceVerification } : {}),
        guideIndex, field, itemIndex }, text));
    }
  });
  return items;
}

function documentTemplate(header: Record<string, unknown>) {
  const id = header.template_id === null || header.template_id === undefined ? null : header.template_id;
  if (id !== null && (typeof id !== 'string' || !UUID.test(id))) throw new Error('Saved template ID is malformed.');
  const source = parseRecordedTemplateSource(object(header.provenance) ? header.provenance.templateSource : undefined, id);
  const template: SavedTemplateReview['template'] = { id, sourceState: source ? 'recorded' : 'not-recorded',
    ...(source ? { kind: source.kind, aiDraftable: source.aiDraftable } : {}) };
  return { id, source, template };
}

function jsonHasContent(text: string): boolean {
  const values: unknown[] = [JSON.parse(text)];
  while (values.length) {
    const value = values.pop();
    if (typeof value === 'string' && value.trim().length > 0) return true;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return true;
    if (Array.isArray(value)) {
      for (const child of value) values.push(child);
    } else if (object(value)) {
      for (const child of Object.values(value)) values.push(child);
    }
  }
  return false;
}

function hasGuidance(fields: ReferenceFields): boolean {
  return Object.entries(fields).some(([field, value]) => {
    if (field === 'guidance_note' || field === 'drafting_mode') return false;
    if (field === 'examples' || field === 'ai_prompts') return typeof value === 'string' && jsonHasContent(value);
    return Array.isArray(value) ? value.some(text => text.trim().length > 0) : value.trim().length > 0;
  });
}

function sectionReferences(sectionId: string, read: SavedTemplateGuidanceRead, templateId: string, source: RecordedTemplateSource | null): SectionReference[] {
  const references: SectionReference[] = read.rows.map(row => ({ sectionId, templateId, authority: read.authority,
    ...(read.authority === 'recorded' ? auditSource(row.template_source, templateId, source) : {}), fields: referenceFields(row, read.authority) }));
  if (!references.some(reference => hasGuidance(reference.fields))) references.push({ sectionId, templateId, authority: read.authority,
    state: 'not-recorded', fields: {} });
  return references;
}

/** Assembly authority comes from the existing receipt validator, never a parent fallback. */
function assemblySource(metadata: Record<string, unknown>, read: SavedTemplateGuidanceRead, programId: string | null) {
  const receipt = metadata.assembly;
  if (!object(receipt) || receipt.programId !== programId || read.authority !== 'recorded' || read.rows.length !== 1) {
    throw new Error('The assembled section reference could not be verified.');
  }
  const source = parseRecordedTemplateSource(read.rows[0].template_source, read.rows[0].template_id);
  if (!source) throw new Error('The assembled section has no complete recorded source.');
  return { source, receipt: { version: receipt.version, docId: receipt.docId, programId: receipt.programId,
    templateId: receipt.templateId, templateSnapshot: receipt.templateSnapshot, fingerprint: receipt.fingerprint } };
}

function sectionMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (!object(raw)) throw new Error('Saved section provenance metadata is malformed.');
  if (Object.hasOwn(raw, 'assembly') && (!object(raw.templateSource) || !object(raw.templateGuidance))) {
    throw new Error('The assembled section lacks complete recorded source and guidance.');
  }
  return raw;
}

function hasReferenceIdentity(templateId: string | null, metadata: Record<string, unknown> | null): boolean {
  if (templateId || (metadata && Object.hasOwn(metadata, 'assembly'))) return true;
  if (metadata && (Object.hasOwn(metadata, 'templateSource') || Object.hasOwn(metadata, 'templateGuidance'))) {
    throw new Error('Saved section guidance has no verified parent or assembly identity.');
  }
  return false;
}

/** Caller admits current access to every explicitly requested section on its tenant connection. */
export async function savedTemplateReview(q: RequestSqlClient, scope: { tenantId: number; documentId: string; programId: string | null },
  header: Record<string, unknown>, sections: Array<{ sectionId: string; code: string | null }>): Promise<SavedTemplateReview> {
  const { tenantId, documentId, programId } = scope;
  const { id, source, template } = documentTemplate(header);
  const references: SectionReference[] = [];
  let referenceBytes = bytes(source);
  boundedBytes(referenceBytes);
  const metadata = await creationMetadata(q, documentId, tenantId, sections.map(s => s.sectionId));
  const fallback = new Map<string | null, SavedTemplateGuidanceRead>();
  for (const section of sections) {
    const seeded = sectionMetadata(metadata.get(section.sectionId));
    if (!hasReferenceIdentity(id, seeded)) continue;
    const assembled = seeded !== null && Object.hasOwn(seeded, 'assembly');
    let read = seeded === null ? fallback.get(section.code) : undefined;
    if (!read) {
      read = await templateGuidanceAfterAccess(q, { tenantId, docId: documentId, sectionId: section.sectionId, templateId: id, code: section.code }, { metadata: seeded });
      if (seeded === null) fallback.set(section.code, read);
    }
    const assembly = assembled ? assemblySource(seeded, read, programId) : null;
    const selectedId = assembly?.source.id ?? id;
    if (!selectedId) throw new Error('Saved section template identity is unavailable.');
    for (const reference of sectionReferences(section.sectionId, read, selectedId, assembly?.source ?? source)) {
      if (assembly) reference.assembly = assembly.receipt;
      referenceBytes += bytes(reference);
      boundedBytes(referenceBytes);
      references.push(reference);
    }
  }
  boundedBytes(bytes({ source, references }));
  return { template, source, references, items: reviewItems(source, references) };
}
