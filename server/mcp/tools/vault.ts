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
    'Search your organisation’s Vault documents. Always available: matches the words of the query against ' +
    'every current document’s title, file name and full extracted text, ranks documents matching more of the ' +
    'words higher, and returns a snippet for a match in the body. When the organisation’s catalog and a ' +
    'semantic index are available, documents matching by meaning are added (matchedBy "meaning", with the ' +
    'summary and key data AnA recorded). A text match means the words appear, not that the document answers ' +
    'the question.',
  inputSchema: {
    query: z.string().min(2).max(500),
    project_id: z.string().uuid().optional().describe('A project id from c2c_list_projects.'),
    limit: z.number().int().min(1).max(25).default(8),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/vault/vault-assistant-search.ts searchVaultForAssistant',
  async run(input, ctx) {
    const { pool } = await import('../../db');
    const { searchVaultForAssistant } = await import('../../services/vault/vault-assistant-search');
    const { isDocumentCatalogEnabled } = await import('../../services/vault/document-catalog.service');
    try {
      const orgId = ctx.principal.organizationId;
      const result = await searchVaultForAssistant(pool, {
        organizationId: orgId,
        programId: input.project_id ?? null,
        query: input.query,
        limit: input.limit,
        catalogEnabled: await isDocumentCatalogEnabled(orgId),
      });
      return ok(
        result.hits.length === 0
          ? 'No Vault document in scope uses the words of the query.'
          : `${result.hits.length} document(s) matched (${result.textMatches} by text).`,
        { query: input.query, ...result },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});
