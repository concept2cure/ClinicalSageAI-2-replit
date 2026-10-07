/** Existing get_document_template reference tool: paged outlines plus optional
 * biotech preparation questions. No model, tenant data, writes or readiness decision.
 */
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import {
  buildDocumentPreparation, resolveDocumentPreparationScope, PREPARATION_MARKETS, PREPARATION_TOPICS,
  type PreparationInput, type PreparationMarket, type PreparationTopic,
} from '../market-specs/document-preparation';
import {
  DOCUMENT_TEMPLATES, getDocumentTemplate, getRegistryDocumentTemplate,
  registryDocumentTemplateCoverage, templatesForFamily, type DocumentTemplateStructure,
} from '../market-specs/document-template-library';

const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'] as const;
const RESULT_LIMIT = 7800;
type TemplateFamily = typeof FAMILIES[number];
type Preparation = ReturnType<typeof buildDocumentPreparation>;
interface TemplateRequest {
  templateId: string;
  registryId: string;
  family?: TemplateFamily;
  market?: PreparationMarket;
  prepare: boolean;
  coverage: boolean;
  discussedTopics?: PreparationTopic[];
  offset: number;
  limit: number;
}

function optionalText(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value !== undefined && typeof value !== 'string') throw new Error(`${key} must be a string.`);
  return value as string | undefined;
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`${key} must be boolean.`);
  return value as boolean | undefined;
}

function requestedFamily(input: Record<string, unknown>): TemplateFamily | undefined {
  const family = optionalText(input, 'family');
  if (!family) return undefined;
  if (!FAMILIES.includes(family as TemplateFamily)) throw new Error(`family must be one of: ${FAMILIES.join(', ')}.`);
  return family as TemplateFamily;
}

function requestedMarket(input: Record<string, unknown>): PreparationMarket | undefined {
  const market = optionalText(input, 'market');
  if (market === undefined) return undefined;
  if (!PREPARATION_MARKETS.includes(market as PreparationMarket)) throw new Error('market must be US, EU, CA or JP.');
  return market as PreparationMarket;
}

function requestedTopics(input: Record<string, unknown>): PreparationTopic[] | undefined {
  const topics = input.discussed_topics;
  if (topics === undefined) return undefined;
  if (!Array.isArray(topics) || topics.length > PREPARATION_TOPICS.length || topics.some(t => !PREPARATION_TOPICS.includes(t))) {
    throw new Error('discussed_topics must contain known preparation topic ids.');
  }
  return topics as PreparationTopic[];
}

function requestedPage(input: Record<string, unknown>): { offset: number; limit: number } {
  const offset = input.offset === undefined ? 0 : input.offset;
  const limit = input.limit === undefined ? 12 : input.limit;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0
    || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 30) {
    throw new Error('offset must be a nonnegative integer and limit an integer from 1 to 30.');
  }
  return { offset, limit };
}

function parseTemplateRequest(input: Record<string, unknown>): TemplateRequest {
  const templateId = optionalText(input, 'template_id')?.trim() ?? '';
  const registryId = optionalText(input, 'registry_id')?.trim() ?? '';
  const market = requestedMarket(input);
  const prepare = optionalBoolean(input, 'prepare') ?? Boolean(registryId || market);
  return {
    templateId, registryId, market, prepare,
    family: requestedFamily(input), coverage: optionalBoolean(input, 'coverage') ?? false,
    discussedTopics: requestedTopics(input), ...requestedPage(input),
  };
}

function preparationInput(request: TemplateRequest): PreparationInput {
  return {
    templateId: request.templateId || undefined,
    registryId: request.registryId || undefined,
    market: request.market, family: request.family, discussedTopics: request.discussedTopics,
  };
}

export async function documentTemplateTool(input: Record<string, unknown>): Promise<string> {
  try {
    return await runTemplateRequest(parseTemplateRequest(input));
  } catch (err) {
    return JSON.stringify({ error: `get_document_template failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}

async function runTemplateRequest(request: TemplateRequest): Promise<string> {
  const prepInput = preparationInput(request);
  // Explicit false removes the brief, never exact identity or market validation.
  resolveDocumentPreparationScope(prepInput);
  const preparation = request.prepare ? buildDocumentPreparation(prepInput) : undefined;
  if (request.templateId || request.registryId) return requestedOutlinePage(request, preparation);
  if (request.coverage) return requestedCoveragePage(request);
  const all = request.family ? templatesForFamily(request.family) : DOCUMENT_TEMPLATES;
  const templates = all.map(t => ({ id: t.id, title: t.title, families: t.families, sectionCount: t.sections.length }));
  return catalogPage(templates, request.offset, request.limit, 'templates', {
    ...(preparation ? { preparation } : {}),
    note: 'Catalog page only. Request template_id for its section outline; follow nextOffset to see later templates.',
  });
}

async function requestedOutlinePage(request: TemplateRequest, preparation: Preparation | undefined): Promise<string> {
  const template = request.templateId ? getDocumentTemplate(request.templateId) : await getRegistryDocumentTemplate(request.registryId);
  if (request.templateId && !template) throw new Error(`No document template "${request.templateId}". List the catalog to discover supported outlines.`);
  if (!template) return JSON.stringify({ ok: true, outlineAvailable: false, registryId: request.registryId, preparation, note: 'The registry recognizes this filing type, but a suitable dedicated outline is not indexed here. Use the current agency/client template; do not substitute a default CTD skeleton or invent section requirements.' });
  if (request.family && !template.families.includes(request.family)) throw new Error('The requested family conflicts with this template.');
  return outlinePage(template, request.offset, request.limit, preparation);
}

async function requestedCoveragePage(request: TemplateRequest): Promise<string> {
  const all = (await registryDocumentTemplateCoverage()).filter(row => !request.market || ['GLOBAL', request.market].includes(getApplicationType(row.registryId)?.region ?? ''));
  return catalogPage(all, request.offset, request.limit, 'coverage', {
    readiness: 'not_assessed', note: 'Coverage of existing indexed authoring scaffolds, not proof of complete agency requirements or a qualified filing.',
  });
}

function boundedPage(total: number, offset: number, limit: number, render: (count: number, nextOffset: number | null) => string, error: string): string {
  let count = Math.min(limit, Math.max(0, total - offset));
  while (true) {
    const result = render(count, offset + count < total ? offset + count : null);
    if (result.length <= RESULT_LIMIT) return result;
    if (count <= 1) throw new Error(error);
    count -= 1;
  }
}

function catalogPage(rows: unknown[], offset: number, limit: number, key: string, fields: Record<string, unknown>): string {
  return boundedPage(rows.length, offset, limit,
    (count, nextOffset) => JSON.stringify({ ok: true, [key]: rows.slice(offset, offset + count), total: rows.length, nextOffset, ...fields }),
    'The catalog page exceeds the response budget. Request a shorter preparation separately.');
}

function outlinePage(template: DocumentTemplateStructure, offset: number, limit: number, preparation: Preparation | undefined): string {
  return boundedPage(template.sections.length, offset, limit,
    (count, nextOffset) => JSON.stringify({
      ok: true, template: { ...template, sections: template.sections.slice(offset, offset + count) },
      sectionsTotal: template.sections.length, nextOffset, ...(preparation ? { preparation } : {}),
      note: 'Outline page only. Follow nextOffset to read the remaining headings before drafting; no evidence or filing readiness has been assessed.',
    }),
    'The outline and preparation exceed the response budget. Request the outline without prepare, then request its preparation separately.');
}
