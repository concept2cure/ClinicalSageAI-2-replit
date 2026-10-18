import type { Request } from 'express';
import { z } from 'zod';
import { COMPANY_LEGAL_KINDS, companyLegalDocumentRefusal, type CompanyLegalDocument } from '../../../shared/company-documents';
import { companyScopeMatches } from '../../../shared/company-legal-workflows';
import type { RequestSqlClient } from '../../db/requestDb';
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent } from '../c2c/current-program-access';
import { context, companyLegalSourceVerdict } from './profile';
import { companyLegalRegistryDocuments } from './legal-registry';
import { CompanyDocumentsError, parseCompanyInput } from './validation';
import { publicCompanyLegalDocument } from './public-document';

export const companyLegalInventoryQuery = z.object({
  q: z.string().trim().max(200).optional(), kind: z.enum(COMPANY_LEGAL_KINDS).optional(),
  agency: z.string().trim().min(1).max(100).optional(), language: z.string().trim().min(1).max(50).optional(),
  programId: z.string().uuid().optional(),
  validity: z.enum(['approved', 'unapproved', 'expiring', 'future', 'expired', 'revoked', 'archived']).optional(),
  sort: z.enum(['title', 'expiry', 'recent']).default('title'),
  includeArchived: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(10), offset: z.coerce.number().int().nonnegative().default(0),
}).strict();
type InventoryQuery = z.infer<typeof companyLegalInventoryQuery>;
interface InventoryFacets { agencies: string[]; languages: string[] }
export interface CompanyLegalInventoryResponse {
  data: CompanyLegalDocument[];
  page: { total: number; availableTotal: number; limit: number; offset: number; hasMore: boolean; nextOffset: number | null };
  facets: InventoryFacets;
}
interface SqlFilter { where: string; params: unknown[] }
const ORDER = { title: "lower(document->>'title') ASC,id ASC",
  expiry: "document->>'expiresOn' ASC NULLS LAST,lower(document->>'title') ASC,id ASC",
  recent: "(document->>'registeredAt')::timestamptz DESC,id ASC" };
const BASE = "organization_id=$1 AND lower(document->>'programId')=ANY($2::text[]) AND ($3::boolean OR document->>'active'='true')";
function fail(message: string): never { throw new CompanyDocumentsError(503, 'LEGAL_INVENTORY_UNAVAILABLE', message); }

function count(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    fail('The legal inventory count could not be verified. Retry the inventory read.');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail('The legal inventory count could not be verified. Retry the inventory read.');
  return number;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail('The legal inventory filters could not be verified.');
  return value as string[];
}
function records(rows: unknown): CompanyLegalDocument[] {
  if (!Array.isArray(rows)) fail('The legal inventory page could not be verified.');
  const result = companyLegalRegistryDocuments(rows.map(row => row?.document));
  if (result.some((document, index) => document.id !== rows[index]?.id)) fail('A legal inventory record does not match its canonical registry identity.');
  return result;
}

async function baseFacets(q: RequestSqlClient, params: unknown[]): Promise<{ facets: InventoryFacets; availableTotal: number }> {
  const { rows } = await q.query(`WITH base AS (SELECT document FROM public.company_legal_registry WHERE ${BASE})
    SELECT (SELECT count(*) FROM base) AS available_total,
      COALESCE((SELECT array_agg(DISTINCT agency ORDER BY agency) FROM base
        CROSS JOIN LATERAL jsonb_array_elements_text(document->'agencies') agency),ARRAY[]::text[]) AS agencies,
      COALESCE((SELECT array_agg(DISTINCT document->>'language' ORDER BY document->>'language') FROM base),ARRAY[]::text[]) AS languages`, params);
  if (rows.length !== 1) fail('The accessible legal inventory could not be counted.');
  return { availableTotal: count(rows[0].available_total), facets: { agencies: strings(rows[0].agencies), languages: strings(rows[0].languages) } };
}

function metadataFilter(input: InventoryQuery, initial: unknown[], facets: InventoryFacets, today: string): SqlFilter {
  const params = [...initial];
  const conditions = [BASE];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (input.q) conditions.push(`strpos(lower(document->>'title'),lower(${bind(input.q)}))>0`);
  if (input.kind) conditions.push(`document->>'kind'=${bind(input.kind)}`);
  if (input.language) conditions.push(`lower(document->>'language')=lower(${bind(input.language)})`);
  if (input.agency) {
    const aliases = facets.agencies.filter(value => companyScopeMatches([value], input.agency, 'agency')).map(value => value.trim().toLowerCase());
    conditions.push(`(jsonb_array_length(document->'agencies')=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(document->'agencies') a(value)
      WHERE lower(btrim(a.value))=ANY(${bind(aliases)}::text[])))`);
  }
  if (input.validity === 'archived') conditions.push("document->>'active'='false'");
  if (input.validity === 'revoked') conditions.push("COALESCE(document#>>'{workflow,revokedAt}','')<>''");
  if (input.validity === 'future') conditions.push(`document->>'effectiveOn'>${bind(today)}`);
  if (input.validity === 'expired') conditions.push(`document->>'expiresOn'<${bind(today)}`);
  if (input.validity === 'expiring') {
    const horizon = new Date(`${today}T00:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + 30);
    conditions.push(`document->>'expiresOn'>=${bind(today)} AND document->>'expiresOn'<=${bind(horizon.toISOString().slice(0, 10))}`);
  }
  return { where: conditions.join(' AND '), params };
}

async function metadataPage(q: RequestSqlClient, filter: SqlFilter, input: InventoryQuery): Promise<{ documents: CompanyLegalDocument[]; total: number }> {
  const params = [...filter.params, input.limit, input.offset];
  const order = ORDER[input.sort];
  const { rows } = await q.query(`WITH filtered AS (SELECT id,document FROM public.company_legal_registry WHERE ${filter.where})
    SELECT (SELECT count(*) FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(p ORDER BY p.position) FROM
        (SELECT id,document,row_number() OVER (ORDER BY ${order}) AS position FROM filtered
          ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}) p),'[]'::jsonb) AS page`, params);
  if (rows.length !== 1) fail('The legal inventory page could not be read.');
  return { total: count(rows[0].total), documents: records(rows[0].page) };
}

async function withVerdict(q: RequestSqlClient, organizationId: number, document: CompanyLegalDocument): Promise<CompanyLegalDocument> {
  return { ...document, transmitRefusal: await companyLegalSourceVerdict(q, organizationId, document) };
}
function currentlyUsable(document: CompanyLegalDocument, today: string): boolean {
  return companyLegalDocumentRefusal(document, { today, programId: document.programId,
    agency: document.agencies[0], country: document.countries[0], submissionType: document.submissionTypes[0] }) === null;
}

async function approvalPage(q: RequestSqlClient, organizationId: number, filter: SqlFilter, input: InventoryQuery, today: string) {
  const { rows } = await q.query(`SELECT id,document FROM public.company_legal_registry WHERE ${filter.where} ORDER BY ${ORDER[input.sort]}`, filter.params);
  const matching: CompanyLegalDocument[] = [];
  for (const document of records(rows)) {
    const current = await withVerdict(q, organizationId, document);
    if (currentlyUsable(current, today) === (input.validity === 'approved')) matching.push(current);
  }
  return { total: matching.length, documents: matching.slice(input.offset, input.offset + input.limit) };
}

/** Metadata queries page in SQL; current-approval queries evaluate the admitted candidate pool before counting. */
export async function readCompanyLegalInventory(req: Request, query: unknown): Promise<CompanyLegalInventoryResponse> {
  const input = parseCompanyInput(companyLegalInventoryQuery, query);
  const ctx = await context(req);
  const identity = { organizationId: ctx.organizationId, userId: ctx.userId, ...(input.programId ? { programId: input.programId } : {}) };
  const scope = await getCurrentAccessibleProgramScope(ctx.q, identity);
  const base = [ctx.organizationId, scope.programIds, input.includeArchived || input.validity === 'archived'];
  const { facets, availableTotal } = await baseFacets(ctx.q, base);
  const today = new Date().toISOString().slice(0, 10);
  const filter = metadataFilter(input, base, facets, today);
  const dynamicApproval = input.validity === 'approved' || input.validity === 'unapproved';
  const result = dynamicApproval ? await approvalPage(ctx.q, ctx.organizationId, filter, input, today)
    : await metadataPage(ctx.q, filter, input);
  const data: CompanyLegalDocument[] = [];
  for (const document of result.documents) data.push(dynamicApproval ? document : await withVerdict(ctx.q, ctx.organizationId, document));
  await requireProgramScopeStillCurrent(ctx.q, identity, scope);
  const hasMore = input.offset + data.length < result.total;
  return { data: data.map(publicCompanyLegalDocument), page: { total: result.total, availableTotal, limit: input.limit, offset: input.offset, hasMore,
    nextOffset: hasMore ? input.offset + input.limit : null }, facets };
}
