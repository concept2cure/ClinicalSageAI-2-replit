/**
 * Protocol Templates service (Capability C2C-20a)
 *
 * Tenant-scoped: create/curate org protocol templates, clone a template into a new
 * protocol_document (seeding sections via the required-aware merge), and snapshot an
 * existing document back into a template. Mutations run inside the caller's
 * transaction with the governed-action ledger.
 *
 * @module server/services/protocol-templates/protocol-templates-service
 */

import { pool } from '../../db';
import { mergeTemplateSections, type TemplateSectionView } from './protocol-templates-logic';
import type { ProtocolKind } from '../protocol-development/protocol-development-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolTemplatesError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolTemplatesError';
  }
}

const KINDS = ['iacuc', 'irb', 'clinical', 'ibc'];

export async function createTemplateTx(client: Queryable, orgId: number, userId: number, input: { name: string; protocolKind: string; designType?: string | null; description?: string | null }): Promise<{ id: number }> {
  if (!KINDS.includes(input.protocolKind)) throw new ProtocolTemplatesError('BAD_INPUT', `Invalid protocol_kind "${input.protocolKind}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_templates (organization_id, name, protocol_kind, design_type, description, source, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'org','active',$6) RETURNING id`,
    [orgId, input.name, input.protocolKind, input.designType ?? null, input.description ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function assertTemplate(client: Queryable, orgId: number, templateId: number): Promise<{ kind: ProtocolKind }> {
  const t = await client.query(`SELECT protocol_kind FROM protocol_templates WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [templateId, orgId]);
  if (t.rows.length === 0) throw new ProtocolTemplatesError('NOT_FOUND', 'Template not found for this organization.');
  return { kind: t.rows[0].protocol_kind };
}

export async function addTemplateSectionTx(client: Queryable, orgId: number, userId: number, templateId: number, input: { sectionKey: string; title: string; content?: string | null; required?: boolean; orderIndex?: number }): Promise<{ id: number }> {
  await assertTemplate(client, orgId, templateId);
  const { rows } = await client.query(
    `INSERT INTO protocol_template_sections (organization_id, template_id, section_key, title, content, required, order_index, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, templateId, input.sectionKey, input.title, input.content ?? null, input.required ?? true, input.orderIndex ?? 0, userId],
  );
  return { id: Number(rows[0].id) };
}

/** Clone a template into a new protocol_document, seeding sections via the required-aware merge. */
export async function cloneTemplateToDocumentTx(client: Queryable, orgId: number, userId: number, templateId: number, input: { title: string; protocolNumber?: string | null }): Promise<{ documentId: number; sectionsSeeded: number }> {
  const { kind } = await assertTemplate(client, orgId, templateId);
  const tmpl = await client.query(`SELECT design_type FROM protocol_templates WHERE id = $1 AND organization_id = $2 LIMIT 1`, [templateId, orgId]);
  const secRows = await client.query(`SELECT section_key, title, content, required, order_index FROM protocol_template_sections WHERE template_id = $1 AND organization_id = $2 ORDER BY order_index`, [templateId, orgId]);
  const merged = mergeTemplateSections(kind, secRows.rows.map((r): TemplateSectionView => ({ sectionKey: r.section_key, title: r.title, content: r.content, required: r.required, orderIndex: r.order_index })));

  const doc = await client.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, protocol_number, title, design_type, version, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'0.1','draft',$6) RETURNING id`,
    [orgId, kind, input.protocolNumber ?? null, input.title, tmpl.rows[0]?.design_type ?? null, userId],
  );
  const documentId = Number(doc.rows[0].id);
  for (const s of merged) {
    await client.query(
      `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, required, status, order_index, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orgId, documentId, s.sectionKey, s.title, s.content, s.required, s.content ? 'draft' : 'not_started', s.orderIndex, userId],
    );
  }
  return { documentId, sectionsSeeded: merged.length };
}

/** Snapshot an existing protocol document's sections into a new org template. */
export async function saveDocumentAsTemplateTx(client: Queryable, orgId: number, userId: number, documentId: number, input: { name: string; description?: string | null }): Promise<{ templateId: number; sectionsCopied: number }> {
  const doc = await client.query(`SELECT protocol_kind, design_type FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [documentId, orgId]);
  if (doc.rows.length === 0) throw new ProtocolTemplatesError('NOT_FOUND', 'Protocol document not found for this organization.');
  const t = await client.query(
    `INSERT INTO protocol_templates (organization_id, name, protocol_kind, design_type, description, source, status, created_by)
     VALUES ($1,$2,$3,$4,$5,'org','active',$6) RETURNING id`,
    [orgId, input.name, doc.rows[0].protocol_kind, doc.rows[0].design_type ?? null, input.description ?? null, userId],
  );
  const templateId = Number(t.rows[0].id);
  const secs = await client.query(`SELECT section_key, title, content, required, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index`, [documentId, orgId]);
  for (const s of secs.rows) {
    await client.query(
      `INSERT INTO protocol_template_sections (organization_id, template_id, section_key, title, content, required, order_index, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orgId, templateId, s.section_key, s.title, s.content, s.required, s.order_index, userId],
    );
  }
  return { templateId, sectionsCopied: secs.rows.length };
}

export async function listTemplates(orgId: number, kind?: string): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, name, protocol_kind, design_type, description, source, status FROM protocol_templates WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (kind) { params.push(kind); sql += ` AND protocol_kind = $2`; }
  sql += ` ORDER BY name`;
  return (await pool.query(sql, params)).rows;
}

export async function getTemplate(orgId: number, templateId: number): Promise<any | null> {
  const t = await pool.query(`SELECT * FROM protocol_templates WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [templateId, orgId]);
  if (t.rows.length === 0) return null;
  const s = await pool.query(`SELECT id, section_key, title, content, required, order_index FROM protocol_template_sections WHERE template_id = $1 AND organization_id = $2 ORDER BY order_index`, [templateId, orgId]);
  return { ...t.rows[0], sections: s.rows };
}
