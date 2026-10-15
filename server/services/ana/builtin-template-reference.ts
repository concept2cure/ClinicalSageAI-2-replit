/** Regional UUID references use the same canonical scaffold as editor creation. */
import { stableStringify } from '../../../shared/canonical-json';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import { getBuiltinAuthoringTemplate, builtinTemplateReference, builtinTemplateSnapshot,
  type BuiltinAuthoringTemplate } from '../authoring/builtin-authoring-templates';
import { buildDocumentPreparation, resolveDocumentPreparationScope,
  type PreparationInput, type PreparationMarket, type PreparationTopic } from '../market-specs/document-preparation';
import { indTemplateReferencePage } from './ind-template-reference';

interface ReferenceRequest {
  offset: number;
  limit: number;
  registryId: string;
  family?: string;
  market?: PreparationMarket;
  prepare?: boolean;
  discussedTopics?: PreparationTopic[];
}
type ReferenceItem = Record<string, unknown>;
const MAX_ITEMS = 20_000;
const MAX_BYTES = 8 * 1024 * 1024;

function checkedRegistry(template: BuiltinAuthoringTemplate, request: ReferenceRequest): string | undefined {
  const context = template.filingContext;
  if (!context) throw new Error('The builtin filing context is unavailable.');
  if (request.registryId && context.registryId && request.registryId !== context.registryId) {
    throw new Error('The requested registry filing conflicts with this template.');
  }
  const registryId = request.registryId || context.registryId || undefined;
  const entry = registryId ? getApplicationType(registryId) : undefined;
  if (registryId && (!entry?.active || entry.segment !== 'pharma_biotech'
    || !['US', 'CA', 'EU', 'JP', 'GLOBAL'].includes(entry.region))) {
    throw new Error('Use an exact active biotech registry filing in the supported markets.');
  }
  return registryId;
}

function preparationScope(template: BuiltinAuthoringTemplate, request: ReferenceRequest): PreparationInput {
  const context = template.filingContext;
  if (!context) throw new Error('The builtin filing context is unavailable.');
  if (request.market && context.region !== 'GLOBAL' && request.market !== context.region) {
    throw new Error('The requested market conflicts with this template.');
  }
  if (request.family && !template.families?.includes(request.family as NonNullable<BuiltinAuthoringTemplate['families']>[number])) {
    throw new Error('The requested family conflicts with this template.');
  }
  const input: PreparationInput = {
    templateId: template.entryId.startsWith('component:') ? template.entryId.slice('component:'.length) : undefined,
    registryId: checkedRegistry(template, request),
    market: request.market ?? (context.region === 'GLOBAL' ? undefined : context.region),
    family: request.family, discussedTopics: request.discussedTopics,
  };
  resolveDocumentPreparationScope(input);
  return input;
}

function add(items: ReferenceItem[], item: ReferenceItem): void {
  if (items.length >= MAX_ITEMS) throw new Error('The template reference exceeds 20,000 items.');
  items.push(item);
}

/** Offsets count UTF-16 code units; a surrogate pair always stays together. */
function textParts(items: ReferenceItem[], base: ReferenceItem, value: string): void {
  for (let offset = 0; offset < value.length;) {
    let end = Math.min(offset + 400, value.length);
    const previous = value.charCodeAt(end - 1);
    const next = value.charCodeAt(end);
    if (end < value.length && previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
    add(items, { ...base, characterOffset: offset, nextCharacterOffset: end < value.length ? end : null,
      totalCharacters: value.length, text: value.slice(offset, end) });
    offset = end;
  }
}

function referenceItems(template: BuiltinAuthoringTemplate, request: ReferenceRequest, scope: PreparationInput): ReferenceItem[] {
  const items: ReferenceItem[] = [];
  if (request.prepare) textParts(items, { kind: 'preparation', field: 'preparation', encoding: 'canonical-json' },
    stableStringify(buildDocumentPreparation(scope)));
  for (const row of template.sections) {
    add(items, { kind: 'heading', code: row.code, title: row.title, order: row.ordering, source: row.guidance.source_reference });
    textParts(items, { kind: 'guidance', code: row.code }, row.guidance.guidance_text);
    for (const requirement of row.guidance.compliance_checklist) textParts(items, { kind: 'source-requirement', code: row.code }, requirement);
    for (const pitfall of row.guidance.common_pitfalls) textParts(items, { kind: 'review-point', code: row.code }, pitfall);
    for (const ref of row.guidance.regulatory_references) textParts(items, { kind: 'reference', code: row.code }, ref);
  }
  if (Buffer.byteLength(stableStringify({ template, items }), 'utf8') > MAX_BYTES) {
    throw new Error('The template reference exceeds 8 MiB.');
  }
  return items;
}

function referencePage(template: BuiltinAuthoringTemplate, request: ReferenceRequest, items: ReferenceItem[]): string {
  if (request.offset >= items.length) throw new Error('Template offset is outside this outline. Restart at 0.');
  const page: ReferenceItem[] = [];
  const reference = { ...builtinTemplateReference(template), version: template.version, sha256: builtinTemplateSnapshot(template) };
  const render = () => JSON.stringify({ ok: true, outlineAvailable: true, template: reference, items: page,
    total: items.length, nextOffset: request.offset + page.length < items.length ? request.offset + page.length : null,
    note: 'Same working outline as the editor template. Read every page with identical scope, prepare and discussion options. Reassemble preparation JSON by characterOffset. Reference guidance and inquiry markers are not verified project evidence, original records, approval or filing readiness.' });
  for (const item of items.slice(request.offset, request.offset + request.limit)) {
    page.push(item);
    if (render().length > 5000) { page.pop(); break; }
  }
  if (!page.length) throw new Error('The mandatory template context or reference item exceeds the tool budget.');
  return render();
}

/** Keep the established IND UUID response and optional preparation behavior. */
export async function builtinTemplateReferencePage(id: string, request: ReferenceRequest): Promise<string | null> {
  const ind = indTemplateReferencePage(id, request);
  if (ind !== null) return ind;
  const template = await getBuiltinAuthoringTemplate(id);
  if (!template) return null;
  const scope = preparationScope(template, request);
  return referencePage(template, request, referenceItems(template, request, scope));
}
