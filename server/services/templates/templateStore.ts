/**
 * Template Store — durable CRUD over `c2c_template_specs`.
 *
 * Every read normalizes the stored jsonb through {@link normalizeTemplateSpec}
 * so callers always get a complete, sane spec even if the row predates a spec
 * field. Every write is org-scoped and records a lightweight `audit_logs` row
 * (template CRUD is not one of the twelve governed `c2c_ana_actions` verbs, so
 * it audits directly rather than through that constrained ledger).
 *
 * @module server/services/templates/templateStore
 */

import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { normalizeTemplateSpec, type TemplateSpec } from './templateSpec';

export interface TemplateRecord {
  id: string;
  orgId: number;
  projectId: string | null;
  name: string;
  description: string | null;
  sourceFileName: string | null;
  sourceFileType: 'docx' | 'pdf' | null;
  spec: TemplateSpec;
  extractionConfidence: number | null;
  extractionWarnings: string[];
  verified: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRecord(row: any): TemplateRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id ?? null,
    name: row.name,
    description: row.description ?? null,
    sourceFileName: row.source_file_name ?? null,
    sourceFileType: row.source_file_type ?? null,
    spec: normalizeTemplateSpec(row.spec),
    extractionConfidence:
      row.extraction_confidence === null || row.extraction_confidence === undefined
        ? null
        : Number(row.extraction_confidence),
    extractionWarnings: Array.isArray(row.extraction_warnings) ? row.extraction_warnings : [],
    verified: !!row.verified,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function auditTemplate(params: {
  orgId: number;
  userId: number;
  action: string;
  templateId: string;
  reason: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (id, tenant_id, user_id, action, table_name, record_id,
          actor_id, target, target_type, target_id, reason, occurred_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'c2c_template_specs', $4,
               $2, $5, 'template', $4, $6, now())`,
      [
        params.orgId,
        params.userId,
        params.action,
        params.templateId,
        `template:${params.templateId}`,
        params.reason,
      ],
    );
  } catch (err: any) {
    // Audit is best-effort here; never block the CRUD on a logging failure.
    console.warn('[templateStore] audit write failed:', err?.message);
  }
}

export interface CreateTemplateInput {
  orgId: number;
  userId: number;
  name: string;
  description?: string;
  projectId?: string | null;
  spec: TemplateSpec;
  sourceFileName?: string;
  sourceFileType?: 'docx' | 'pdf' | null;
  extractionConfidence?: number | null;
  extractionWarnings?: string[];
  verified?: boolean;
}

export async function createTemplate(input: CreateTemplateInput): Promise<TemplateRecord> {
  const id = `tpl_${randomUUID().replace(/-/g, '')}`;
  const spec = normalizeTemplateSpec(input.spec);
  const res = await pool.query(
    `INSERT INTO c2c_template_specs
       (id, org_id, project_id, name, description, source_file_name, source_file_type,
        spec, extraction_confidence, extraction_warnings, verified, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12)
     RETURNING *`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.name,
      input.description ?? null,
      input.sourceFileName ?? null,
      input.sourceFileType ?? null,
      JSON.stringify(spec),
      input.extractionConfidence ?? null,
      JSON.stringify(input.extractionWarnings ?? []),
      input.verified ?? false,
      input.userId,
    ],
  );
  await auditTemplate({
    orgId: input.orgId,
    userId: input.userId,
    action: 'c2c.template.create',
    templateId: id,
    reason: `Created template "${input.name}"`,
  });
  return rowToRecord(res.rows[0]);
}

export async function listTemplates(
  orgId: number,
  opts: { projectId?: string | null } = {},
): Promise<TemplateRecord[]> {
  const params: unknown[] = [orgId];
  let where = `org_id = $1 AND is_active = true`;
  if (opts.projectId) {
    params.push(opts.projectId);
    // org-wide (NULL) templates plus this project's templates
    where += ` AND (project_id IS NULL OR project_id = $2)`;
  }
  const res = await pool.query(
    `SELECT * FROM c2c_template_specs WHERE ${where} ORDER BY created_at DESC`,
    params,
  );
  return res.rows.map(rowToRecord);
}

export async function getTemplate(orgId: number, id: string): Promise<TemplateRecord | null> {
  const res = await pool.query(
    `SELECT * FROM c2c_template_specs WHERE id = $1 AND org_id = $2 AND is_active = true LIMIT 1`,
    [id, orgId],
  );
  return res.rows.length > 0 ? rowToRecord(res.rows[0]) : null;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  spec?: TemplateSpec;
  verified?: boolean;
}

export async function updateTemplate(
  orgId: number,
  userId: number,
  id: string,
  patch: UpdateTemplateInput,
): Promise<TemplateRecord | null> {
  const existing = await getTemplate(orgId, id);
  if (!existing) return null;

  const name = patch.name ?? existing.name;
  const description = patch.description ?? existing.description;
  const spec = patch.spec ? normalizeTemplateSpec(patch.spec) : existing.spec;
  const verified = patch.verified ?? existing.verified;

  const res = await pool.query(
    `UPDATE c2c_template_specs
        SET name = $3, description = $4, spec = $5::jsonb, verified = $6, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND is_active = true
      RETURNING *`,
    [id, orgId, name, description, JSON.stringify(spec), verified],
  );
  if (res.rows.length === 0) return null;
  await auditTemplate({
    orgId,
    userId,
    action: 'c2c.template.update',
    templateId: id,
    reason: `Updated template "${name}"`,
  });
  return rowToRecord(res.rows[0]);
}

export async function deactivateTemplate(
  orgId: number,
  userId: number,
  id: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE c2c_template_specs SET is_active = false, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND is_active = true
      RETURNING id`,
    [id, orgId],
  );
  if (res.rows.length === 0) return false;
  await auditTemplate({
    orgId,
    userId,
    action: 'c2c.template.deactivate',
    templateId: id,
    reason: 'Deactivated template',
  });
  return true;
}
