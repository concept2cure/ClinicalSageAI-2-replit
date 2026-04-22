/**
 * Prisma-compatible wrapper over Drizzle ORM
 *
 * Maps Prisma-style API calls (create, findMany, findFirst, update, delete, upsert)
 * to the real Drizzle database via raw SQL through the pg pool.
 *
 * Tables that exist in the Drizzle schema: audit_logs, documents, electronic_signatures
 *
 * NOTE (2026-04-22, Phase 2 retrieval convergence): the `study_document` stub
 * and `$queryRaw` helper on the default export were previously consumed by
 * server/services/semanticSearch.js and server/pipelines/bulk_import.js.
 * Those files have been deleted. The stubs are preserved as no-ops for now
 * but are effectively orphan — this whole module has no current importers.
 * See docs/audits/PHASE_2_RETRIEVAL_REPORT.md.
 */

import { pool } from '../db.js';

// ---------------------------------------------------------------------------
// Helper: execute a raw query against the pg pool (returns rows)
// ---------------------------------------------------------------------------
async function rawQuery(text, params = []) {
  if (!pool) {
    throw new Error('[prisma/client] Database pool is not available');
  }
  const result = await pool.query(text, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// audit_log  →  maps to the `audit_logs` table in the Drizzle schema
// ---------------------------------------------------------------------------
const audit_log = {
  async create({ data } = {}) {
    const d = data ?? {};
    const rows = await rawQuery(
      `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        d.tenantId ?? d.tenant_id ?? 0,
        d.userId ?? d.user_id ?? null,
        d.action ?? 'unknown',
        d.tableName ?? d.table_name ?? 'unknown',
        d.recordId ?? d.record_id ?? '',
        d.oldValues ?? d.old_values ? JSON.stringify(d.oldValues ?? d.old_values) : null,
        d.newValues ?? d.new_values ? JSON.stringify(d.newValues ?? d.new_values) : null,
        d.ipAddress ?? d.ip_address ?? null,
        d.userAgent ?? d.user_agent ?? null,
      ]
    );
    return rows[0];
  },

  async findMany({ where, orderBy, take } = {}) {
    let sql = 'SELECT * FROM audit_logs';
    const params = [];
    const clauses = [];

    if (where) {
      for (const [key, val] of Object.entries(where)) {
        if (val !== undefined) {
          params.push(val);
          clauses.push(`${key} = $${params.length}`);
        }
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    if (take) {
      params.push(take);
      sql += ` LIMIT $${params.length}`;
    }
    return rawQuery(sql, params);
  },
};

// ---------------------------------------------------------------------------
// document  →  maps to the `documents` table in the Drizzle schema
// ---------------------------------------------------------------------------
const document = {
  async create({ data } = {}) {
    const d = data ?? {};
    const rows = await rawQuery(
      `INSERT INTO documents (organization_id, client_workspace_id, document_code, title, document_type, status, owner_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        d.organizationId ?? d.organization_id ?? 0,
        d.clientWorkspaceId ?? d.client_workspace_id ?? 0,
        d.documentCode ?? d.document_code ?? `DOC-${Date.now()}`,
        d.title ?? 'Untitled',
        d.documentType ?? d.document_type ?? 'General',
        d.status ?? 'draft',
        d.ownerId ?? d.owner_id ?? 0,
        d.createdById ?? d.created_by_id ?? 0,
      ]
    );
    return rows[0];
  },

  async findMany({ where, orderBy, take } = {}) {
    let sql = 'SELECT * FROM documents';
    const params = [];
    const clauses = [];

    if (where) {
      for (const [key, val] of Object.entries(where)) {
        if (val !== undefined) {
          params.push(val);
          clauses.push(`${key} = $${params.length}`);
        }
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    if (take) {
      params.push(take);
      sql += ` LIMIT $${params.length}`;
    }
    return rawQuery(sql, params);
  },

  async findUnique({ where } = {}) {
    if (!where || !where.id) return null;
    const rows = await rawQuery('SELECT * FROM documents WHERE id = $1 LIMIT 1', [where.id]);
    return rows[0] ?? null;
  },

  async findFirst({ where } = {}) {
    return this.findUnique({ where });
  },

  async update({ where, data } = {}) {
    if (!where?.id) throw new Error('update requires where.id');
    const setClauses = [];
    const params = [];
    for (const [key, val] of Object.entries(data ?? {})) {
      params.push(val);
      setClauses.push(`${key} = $${params.length}`);
    }
    if (!setClauses.length) return this.findUnique({ where });
    params.push(where.id);
    const rows = await rawQuery(
      `UPDATE documents SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    return rows[0];
  },

  async delete({ where } = {}) {
    if (!where?.id) throw new Error('delete requires where.id');
    const rows = await rawQuery('DELETE FROM documents WHERE id = $1 RETURNING *', [where.id]);
    return rows[0];
  },
};

// ---------------------------------------------------------------------------
// signature  →  maps to the `electronic_signatures` table
// ---------------------------------------------------------------------------
const signature = {
  async create({ data } = {}) {
    const d = data ?? {};
    const rows = await rawQuery(
      `INSERT INTO electronic_signatures
         (document_id, version_id, signature_type, signature_purpose, signer_id, signer_name,
          signer_email, authentication_method, authentication_timestamp, signature_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        d.documentId ?? d.document_id ?? 0,
        d.versionId ?? d.version_id ?? 0,
        d.signatureType ?? d.signature_type ?? 'approval',
        d.signaturePurpose ?? d.signature_purpose ?? '',
        d.signerId ?? d.signer_id ?? 0,
        d.signerName ?? d.signer_name ?? '',
        d.signerEmail ?? d.signer_email ?? '',
        d.authenticationMethod ?? d.authentication_method ?? 'password',
        d.authenticationTimestamp ?? d.authentication_timestamp ?? new Date(),
        d.signatureHash ?? d.signature_hash ?? '',
      ]
    );
    return rows[0];
  },

  async findMany({ where, orderBy, take } = {}) {
    let sql = 'SELECT * FROM electronic_signatures';
    const params = [];
    const clauses = [];

    if (where) {
      for (const [key, val] of Object.entries(where)) {
        if (val !== undefined) {
          params.push(val);
          clauses.push(`${key} = $${params.length}`);
        }
      }
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY signed_at DESC';
    if (take) {
      params.push(take);
      sql += ` LIMIT $${params.length}`;
    }
    return rawQuery(sql, params);
  },
};

// ---------------------------------------------------------------------------
// study_document  →  table does NOT exist in schema.
//   Previously consumed by semanticSearch.js / bulk_import.js (deleted in
//   Phase 2 retrieval convergence, 2026-04-22). Kept as warning-logging
//   no-ops so any surviving caller surfaces loudly rather than silently.
// ---------------------------------------------------------------------------
const study_document = {
  async create({ data } = {}) {
    console.warn('[prisma/client] study_document table not yet in schema — create is a no-op');
    return null;
  },

  async findMany() {
    console.warn('[prisma/client] study_document table not yet in schema — findMany is a no-op');
    return [];
  },

  async upsert({ where, update, create } = {}) {
    console.warn('[prisma/client] study_document table not yet in schema — upsert is a no-op');
    return null;
  },
};

// ---------------------------------------------------------------------------
// $queryRaw — previously used by semanticSearch.js (deleted in Phase 2).
//   Kept as a generic tagged-template passthrough in case another Prisma-
//   style caller appears; has no active consumers today.
// ---------------------------------------------------------------------------
async function $queryRaw(strings, ...values) {
  if (!pool) {
    throw new Error('[prisma/client] Database pool is not available');
  }
  // Tagged template → parameterised SQL
  let sql = '';
  const params = [];
  for (let i = 0; i < strings.length; i++) {
    sql += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      sql += `$${params.length}`;
    }
  }
  const result = await pool.query(sql, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Export as default (matches original `import prisma from '../prisma/client.js'`)
// ---------------------------------------------------------------------------
const prisma = {
  audit_log,
  document,
  signature,
  study_document,
  $queryRaw,
};

export default prisma;
