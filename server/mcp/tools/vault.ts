/**
 * Vault tools — the organisation's documents, org-scoped through
 * regulatory_programs exactly as every other vault read is.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listVaultDocuments = defineTool({
  name: 'c2c_list_vault_documents',
  title: 'List vault documents',
  description:
    'List documents in your organisation’s Vault (optionally one project): id, code, title, type, file name, ' +
    'filed location (folder, CTD section, placement status) and catalog state. The page carries honest ' +
    'totals — total, withheld by the limit, not yet studied, extraction failed, unfiled — so a page is never ' +
    'mistaken for the whole. Use a document id from here with c2c_file_draft_for_review.',
  inputSchema: {
    project_id: z.string().uuid().optional().describe('A project id from c2c_list_projects.'),
    title_contains: z.string().max(120).optional().describe('Case-insensitive substring filter on title/file name (applied to the page).'),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/vault/document-catalog.service.ts listProjectDocuments',
  async run(input, ctx) {
    const { listProjectDocuments } = await import('../../services/vault/document-catalog.service');
    const page = await listProjectDocuments(ctx.principal.organizationId, { programId: input.project_id ?? null, limit: input.limit });
    const needle = input.title_contains?.toLowerCase();
    const documents = page.documents
      .filter((d) => !needle || `${d.documentTitle} ${d.fileName}`.toLowerCase().includes(needle))
      .map((d) => ({
        id: d.id,
        projectId: d.programId,
        projectName: d.programName,
        documentCode: d.documentCode,
        title: d.documentTitle,
        documentType: d.documentType,
        fileName: d.fileName,
        location: d.location,
        catalogStatus: d.catalogStatus,
        createdAt: d.createdAt,
      }));
    return ok(
      page.total === 0
        ? 'The Vault holds no documents in scope.'
        : `${documents.length} document(s) shown of ${page.total} in scope (${page.withheld} withheld by limit, ${page.unfiled} unfiled, ${page.notYetStudied} not yet studied).`,
      { organizationId: ctx.principal.organizationId, projectId: input.project_id ?? null, total: page.total, withheld: page.withheld, unfiled: page.unfiled, notYetStudied: page.notYetStudied, extractionFailed: page.extractionFailed, documents },
    );
  },
});

export const searchVaultDocuments = defineTool({
  name: 'c2c_search_vault_documents',
  title: 'Search vault documents',
  description:
    'Semantic search over the cataloged documents in your organisation’s Vault (kind, purpose, summary, ' +
    'key data AnA recorded after a full read). Fails closed: when the embedding provider or pgvector is ' +
    'unavailable the tool returns that refusal instead of an empty list. Uncataloged documents are absent by ' +
    'construction and their count is reported.',
  inputSchema: {
    query: z.string().min(2).max(500),
    limit: z.number().int().min(1).max(25).default(8),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/vault/document-catalog-search.ts searchCatalog',
  async run(input, ctx) {
    const { searchCatalog } = await import('../../services/vault/document-catalog-search');
    try {
      const result = await searchCatalog(ctx.principal.organizationId, input.query, { limit: input.limit });
      return ok(
        `${result.hits.length} hit(s) over ${result.searchedCount} cataloged document(s); ${result.unsearchableCount} not searchable yet.`,
        { query: input.query, ...result },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});
