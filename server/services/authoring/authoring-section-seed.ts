/** The transaction-owned section creator shared by starts, single adds and assembly. */
import { randomUUID } from 'node:crypto';
import type { CreateContext, SectionSeed } from './authoring-documents';
import { createRevision, writeAuthoringAuditTrail, type Queryable } from './authoring-evidence';
import { enforceAuthorLineage } from '../clinical-regulatory-evidence/lineage-gate';
import { replaceVaultFigureSpans } from '../clinical-regulatory-evidence/span-lineage-vault';

export async function insertSectionSeedTx(
  ctx: CreateContext,
  client: Queryable,
  docId: string,
  seed: SectionSeed,
  options: { sectionId?: string; verifiedImport?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const sectionId = options.sectionId ?? randomUUID();
  const result = await client.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7) RETURNING *`,
    [sectionId, docId, seed.code, seed.title, seed.content, seed.orderIndex, ctx.tenantId],
  );
  const row = result.rows[0] as Record<string, unknown>;
  if (!row || String(row.id) !== sectionId) throw new Error('The section insert returned no exact saved identity');
  if (seed.lineage) {
    const ref = { documentTable: 'authoring_sections', documentId: sectionId };
    await enforceAuthorLineage(client, ctx.tenantId, ref, seed.content, ctx.actor.id,
      seed.lineage.machineDraft ? { machineDraft: seed.lineage.machineDraft } : undefined);
    const figures = seed.lineage.figureSpans?.() ?? [];
    if (figures.length > 0) await replaceVaultFigureSpans(ctx.tenantId, ref, figures, { createdBy: ctx.actor.id }, client);
  }
  await createRevision(client, { sectionId, content: seed.content, updatedBy: ctx.actor.id,
    tenantId: ctx.tenantId, origin: 'genesis', contributors: seed.contributors ?? [], verifiedImport: options.verifiedImport });
  await writeAuthoringAuditTrail(ctx.audit, {
    docId, sectionId, operationType: 'CREATE', beforeContent: null, afterContent: seed.content,
    changeReason: seed.changeReason, metadata: { ...seed.metadata, section_code: seed.code }, executor: client,
  });
  return row;
}
