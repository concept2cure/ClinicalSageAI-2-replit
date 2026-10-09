/**
 * The ONE governed write: file a DRAFT leaf into an eCTD sequence for review.
 *
 * Runs through submission-service.upsertLeaf — the same seam the Submission
 * Center builder, the editor's "Place into filing" and AnA's
 * place_into_sequence use — so the service's refusals (locked sequence,
 * cross-tenant document, unplaceable table, malformed section code) come back
 * verbatim. The leaf is a draft placement in a draft sequence; freezing,
 * signing and dispatching stay in the app behind 21 CFR Part 11 electronic
 * signature, and the tool returns the link to that surface rather than
 * signing anything.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage } from './runtime';
import { MCP_SCOPES } from '../config';

/** The two ways to point at a document are exclusive and each must be whole. */
function pointerRefusal(input: { vault_document_id?: string; document_table?: string; document_id?: number }): string | null {
  const hasVault = Boolean(input.vault_document_id);
  const hasTable = Boolean(input.document_table);
  const hasId = input.document_id !== undefined;
  if (hasVault && (hasTable || hasId)) return 'Provide either vault_document_id or document_table + document_id, not both.';
  if (hasTable !== hasId) return 'document_table and document_id must be given together.';
  return null;
}

export const fileDraftForReview = defineTool({
  name: 'c2c_file_draft_for_review',
  title: 'File draft into sequence for review',
  description:
    'GOVERNED WRITE. Create a DRAFT leaf placement in an eCTD sequence of your organisation at a CTD ' +
    'section (e.g. 1.2, 2.5, 3.2.S.4.2), optionally pointing at a Vault document (vault_document_id) or a ' +
    'coauthor document (document_table + document_id). Refused verbatim when the sequence is frozen/' +
    'dispatched, the document is not in your organisation, or the section code is not a CTD section. ' +
    'Creates the record and returns the Submission Center link where a human reviews and signs; it never ' +
    'signs, freezes or transmits. Audited as a governed action.',
  inputSchema: {
    sequence_id: z.number().int().positive(),
    section_code: z.string().min(2).max(64).describe('CTD section code; decides where the document is filed in the package.'),
    title: z.string().min(1).max(300),
    vault_document_id: z.string().uuid().optional().describe('A Vault document id from c2c_list_vault_documents.'),
    document_table: z.enum(['coauthor_documents', 'unified_documents', 'ctd_onboarding_documents', 'c2c_document_sections']).optional(),
    document_id: z.number().int().positive().optional(),
    document_type: z.string().max(60).optional().describe('Classifier hint, e.g. protocol, csr, cer'),
    lifecycle_op: z.enum(['new', 'replace', 'append']).default('new'),
    reason: z.string().min(5).max(500).describe('Reason for the filing, recorded in the audit trail.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: MCP_SCOPES.file,
  governed: true,
  implementation: 'server/services/submission-service/submission-service.ts upsertLeaf (same seam as AnA place_into_sequence)',
  async run(input, ctx) {
    const pointerProblem = pointerRefusal(input);
    if (pointerProblem) return refused(pointerProblem);
    const svc = await import('../../services/submission-service/submission-service');
    const orgId = ctx.principal.organizationId;
    try {
      const leaf = await svc.upsertLeaf(
        {
          sequenceId: input.sequence_id,
          sectionCode: input.section_code,
          title: input.title,
          lifecycleOp: input.lifecycle_op,
          documentTable: input.vault_document_id ? 'vault_documents' : input.document_table ?? null,
          documentUuid: input.vault_document_id ?? null,
          documentId: input.document_id ?? null,
          documentType: input.document_type ?? null,
        },
        { organizationId: orgId, userId: ctx.principal.userId },
      );
      const sequence = await svc.getSequence(input.sequence_id, { organizationId: orgId });
      const signOffUrl = `${ctx.config.appBaseUrl}/concept2cure/submission-center`;
      return ok(
        `Draft leaf #${leaf.id} filed at ${leaf.sectionCode} ("${leaf.title}") in sequence ${sequence.sequenceNumber} (status ${sequence.status}). ` +
          `It is a DRAFT placement: review, freeze and Part 11 sign-off happen at ${signOffUrl}. Audit row ${leaf.auditTrail.persisted ? 'persisted' : 'NOT persisted'}.`,
        {
          status: 'draft',
          leaf: { id: leaf.id, sequenceId: leaf.sequenceId, sectionCode: leaf.sectionCode, title: leaf.title, lifecycleOp: leaf.lifecycleOp, documentTable: leaf.documentTable, documentId: leaf.documentId, documentUuid: (leaf as { documentUuid?: string | null }).documentUuid ?? null },
          sequence: { id: sequence.id, submissionId: sequence.submissionId, sequenceNumber: sequence.sequenceNumber, status: sequence.status },
          auditTrail: leaf.auditTrail,
          reason: input.reason,
          signOff: {
            url: signOffUrl,
            instruction: `Open Submission Center → submission #${sequence.submissionId} → sequence ${sequence.sequenceNumber} → review the leaf, then freeze/dispatch with an electronic signature (21 CFR Part 11 §11.50/§11.70). The connector cannot sign.`,
          },
        },
      );
    } catch (err) {
      return refused(errorMessage(err));
    }
  },
});
